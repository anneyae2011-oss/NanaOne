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
  if (messages.length <= 2) return messages;

  // 1. Identify Components
  const systemPrompt = messages.find(m => m.role === 'system') || { role: 'system', content: '' };
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user') || messages[messages.length - 1];
  
  // Find index of last user message to isolate history before it
  const lastUserIndex = messages.lastIndexOf(lastUserMsg);
  const midHistory = messages.slice(0, lastUserIndex).filter(m => m !== systemPrompt);
  
  // 2. Identify Last 3 Exchanges (6 messages)
  const recentHistory = midHistory.slice(-6);
  const oldHistory = midHistory.slice(0, -6);

  console.log(`[CURATOR] Identification: System Prompt + ${oldHistory.length} old msgs + ${recentHistory.length} recent msgs + Current User Msg.`);

  let finalMessages = [...messages];

  // 3. Summarize Old History if it exists
  if (oldHistory.length > 0) {
    try {
      const resp = await axios.post(`${endpoint}/chat/completions`, {
        model: model,
        messages: [
          { role: 'system', content: 'You are a NanaOne Context Curator. Summarize the following middle conversation history into a single, highly dense paragraph. Preserve all key facts, names, and states.' },
          { role: 'user', content: JSON.stringify(oldHistory) }
        ],
        temperature: 0.2,
      }, { headers: { 'Authorization': `Bearer ${key}` } });
      
      const summary = resp.data.choices[0].message.content;
      finalMessages = [
        systemPrompt,
        { role: 'user', content: `[SUMMARY OF OLD HISTORY]: ${summary}` },
        ...recentHistory,
        lastUserMsg
      ];
    } catch (e) {
      console.error('[CURATOR] History Summarization Failed:', e);
    }
  }

  // 4. Fallback: Summarize System Prompt if still > 8000
  if (estimateTokens(finalMessages) > 8000) {
    console.log('[CURATOR] Still > 8k. Summarizing System Prompt...');
    try {
      const resp = await axios.post(`${endpoint}/chat/completions`, {
        model: model,
        messages: [
          { role: 'system', content: 'Summarize the following System Instructions into a more concise version while keeping ALL core rules and character traits intact.' },
          { role: 'user', content: systemPrompt.content }
        ],
        temperature: 0.2,
      }, { headers: { 'Authorization': `Bearer ${key}` } });
      
      const systemSummary = resp.data.choices[0].message.content;
      finalMessages[0] = { role: 'system', content: systemSummary };
    } catch (e) {
      console.error('[CURATOR] System Summarization Failed:', e);
    }
  }

  return finalMessages;
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

  // 2. CONTEXT CURATOR LOGIC (Run FIRST if over 8k OR over hard limit)
  if ((estimatedInputTokens > 8000 || estimatedInputTokens > contextLimit) && s[0].upstreamEndpoint && s[0].upstreamKey) {
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

  // 3. GLOBAL LIMITS VALIDATION (413 Check - Run AFTER potential curation)
  const contextLimit = s[0].contextLimit || 16000;
  const maxOutputLimit = s[0].maxOutputTokens || 4000;

  if (estimatedInputTokens > contextLimit) {
    console.error(`[LIMIT EXCEEDED] Final Context Size: ${estimatedInputTokens} > ${contextLimit}`);
    return NextResponse.json({ 
      error: {
        message: `Context size too large (${estimatedInputTokens} tokens). Global limit is ${contextLimit}.`,
        type: 'context_too_large',
        code: 413
      }
    }, { status: 413, headers: CORS_HEADERS });
  }

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
