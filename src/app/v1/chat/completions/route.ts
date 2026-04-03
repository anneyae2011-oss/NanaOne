import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { settings, users, usageLogs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS_HEADERS });
}

function estimateTokens(messages: any[]): number {
  let totalChars = 0;
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      totalChars += msg.content.length;
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === 'text') totalChars += part.text.length;
      }
    }
  }
  return Math.ceil(totalChars / 4);
}

async function curateContext(messages: any[], endpoint: string, key: string, model: string): Promise<any[]> {
  if (!messages || messages.length <= 2) return messages;

  console.log(`[CURATOR] Starting curation for ${messages.length} messages...`);

  // 1. Identification
  const systemMsgIndex = messages.findIndex(m => m.role === 'system');
  const systemPrompt = systemMsgIndex !== -1 ? messages[systemMsgIndex] : null;
  
  const lastUserMsgIndex = [...messages].reverse().findIndex(m => m.role === 'user');
  if (lastUserMsgIndex === -1) return messages; // No user message to anchor with
  const lastUserIndex = (messages.length - 1) - lastUserMsgIndex;
  const lastUserMsg = messages[lastUserIndex];
  
  // Middle History = Everything between system prompt (if any) and last user message
  const startIndex = systemMsgIndex !== -1 ? systemMsgIndex + 1 : 0;
  const midHistory = messages.slice(startIndex, lastUserIndex);
  
  // Last 3 Exchanges = Last 6 messages of middle history
  const recentHistory = midHistory.slice(-6);
  const oldHistory = midHistory.slice(0, -6);

  console.log(`[CURATOR] Identified: Old History (${oldHistory.length} msgs), Recent History (${recentHistory.length} msgs)`);

  let currentMessages = [...messages];

  // 2. Summarize Old History
  if (oldHistory.length > 0) {
    try {
      console.log('[CURATOR] Summarizing Old History...');
      const resp = await axios.post(`${endpoint}/chat/completions`, {
        model: model,
        messages: [
          { 
            role: 'system', 
            content: 'You are a NanaOne Context Curator. Summarize the following historical conversation into a detailed, high-fidelity summary of approximately 2,500 tokens. This summary will serve as the primary context for future turns. Preserve all key facts, names, outcomes, and character states.' 
          },
          { role: 'user', content: JSON.stringify(oldHistory) }
        ],
        temperature: 0.2,
        max_tokens: 3000, 
      }, { 
        headers: { 
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json'
        } 
      });
      
      const summary = resp.data.choices[0].message.content;
      const reconstructed: any[] = [];
      if (systemPrompt) reconstructed.push(systemPrompt);
      reconstructed.push({ role: 'user', content: `[CURATED HISTORY]: ${summary}` });
      reconstructed.push(...recentHistory);
      reconstructed.push(lastUserMsg);
      
      currentMessages = reconstructed;
      console.log(`[CURATOR] History summarized. New count: ${estimateTokens(currentMessages)} tokens.`);
    } catch (e: any) {
      console.error('[CURATOR] History Summarization Failed:', e.response?.data || e.message);
    }
  }

  // 3. Fallback: Summarize System Prompt if still > 8000
  if (estimateTokens(currentMessages) > 8000 && systemPrompt) {
    console.log('[CURATOR] Still over 8k. Summarizing System Prompt...');
    try {
      const resp = await axios.post(`${endpoint}/chat/completions`, {
        model: model,
        messages: [
          { role: 'system', content: 'Summarize the following System Instructions into a concise version while preserving ALL rules, persona, and traits.' },
          { role: 'user', content: systemPrompt.content }
        ],
        temperature: 0.2,
      }, { 
        headers: { 
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json'
        } 
      });
      
      const systemSummary = resp.data.choices[0].message.content;
      // Replace the system prompt in currentMessages
      const sIndex = currentMessages.findIndex(m => m.role === 'system');
      if (sIndex !== -1) {
        currentMessages[sIndex] = { role: 'system', content: systemSummary };
      }
      console.log(`[CURATOR] System prompt summarized. Final count: ${estimateTokens(currentMessages)} tokens.`);
    } catch (e: any) {
      console.error('[CURATOR] System Summarization Failed:', e.response?.data || e.message);
    }
  }

  return currentMessages;
}

export async function POST(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing or invalid Authorization header' }, { status: 401, headers: CORS_HEADERS });
  }

  const apiKey = authHeader.split(' ')[1];
  const user = await db.select().from(users).where(eq(users.apiKey, apiKey)).limit(1);

  if (user.length === 0) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401, headers: CORS_HEADERS });
  }

  const now = new Date();
  const lastReset = user[0].lastReset ? new Date(user[0].lastReset) : new Date(0);
  const isNewDay = now.getDate() !== lastReset.getDate() || now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear();

  let currentDailyBalance = user[0].balance || 0;
  let currentOneTimeBalance = user[0].oneTimeBalance || 0;

  if (isNewDay) {
    currentDailyBalance = 20.0;
    await db.update(users).set({ balance: 20.0, lastReset: now }).where(eq(users.id, user[0].id));
  }

  const totalBalance = currentDailyBalance + currentOneTimeBalance;
  if (totalBalance <= 0) {
    return NextResponse.json({ error: 'Insufficient balance ($20/day limit reached and no one-time credits left)' }, { status: 402, headers: CORS_HEADERS });
  }

  const body = await req.json();
  const s = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
  if (s.length === 0) {
    return NextResponse.json({ error: 'Gateway settings not initialized' }, { status: 500, headers: CORS_HEADERS });
  }

  // 1. Initial Token Estimation & Limits
  let estimatedInputTokens = estimateTokens(body.messages || []);
  const contextLimit = s[0].contextLimit || 16000;
  const maxOutputLimit = s[0].maxOutputTokens || 4000;

  // 2. CONTEXT CURATOR LOGIC (Run FIRST if over 8k)
  if (estimatedInputTokens > 8000 && s[0].upstreamEndpoint && s[0].upstreamKey) {
    console.log(`[CURATOR] Context high (${estimatedInputTokens} tokens). Running curator before limit check...`);
    body.messages = await curateContext(
      body.messages, 
      s[0].upstreamEndpoint as string, 
      s[0].upstreamKey as string, 
      body.model || 'gpt-4o'
    );
    // RE-ESTIMATE after curation
    estimatedInputTokens = estimateTokens(body.messages || []);
    console.log(`[CURATOR] Post-curation tokens: ${estimatedInputTokens}`);
  }

  // 3. GLOBAL OUTPUT LIMIT VALIDATION (Keep max output tokens check)
  if (body.max_tokens && body.max_tokens > maxOutputLimit) {
    console.error(`[LIMIT EXCEEDED] Output Tokens: ${body.max_tokens} > ${maxOutputLimit}`);
    return NextResponse.json({ 
      error: {
        message: `Request exceeds max output tokens (${body.max_tokens}). Global limit is ${maxOutputLimit}.`,
        type: 'max_tokens_exceeded',
        code: 413
      }
    }, { status: 413, headers: CORS_HEADERS });
  }

  try {
    const upstreamResponse = await axios.post(`${s[0].upstreamEndpoint}/chat/completions`, body, {
      headers: {
        'Authorization': `Bearer ${s[0].upstreamKey}`,
        'Content-Type': 'application/json',
      },
    });

    const usage = upstreamResponse.data.usage;
    if (usage) {
      const promptTokens = usage.prompt_tokens;
      const completionTokens = usage.completion_tokens;
      const cost = (promptTokens * 15 / 1000000) + (completionTokens * 75 / 1000000);
      
      let newDaily = currentDailyBalance;
      let newOneTime = currentOneTimeBalance;

      if (currentDailyBalance >= cost) {
        newDaily = currentDailyBalance - cost;
      } else {
        const remainingCost = cost - currentDailyBalance;
        newDaily = 0;
        newOneTime = Math.max(0, currentOneTimeBalance - remainingCost);
      }

      await db.update(users).set({ 
        balance: newDaily, 
        oneTimeBalance: newOneTime 
      }).where(eq(users.id, user[0].id));
      await db.insert(usageLogs).values({
        id: uuidv4(),
        userId: user[0].id,
        modelId: body.model,
        promptTokens,
        completionTokens,
        totalTokens: usage.total_tokens,
        cost,
        createdAt: new Date(),
      });
    }

    return NextResponse.json(upstreamResponse.data, { headers: CORS_HEADERS });
  } catch (error: any) {
    console.error('Proxy Error:', error.response?.data || error.message);
    return NextResponse.json(error.response?.data || { error: 'Failed to proxy request' }, { 
      status: error.response?.status || 500,
      headers: CORS_HEADERS
    });
  }
}
