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

const CHEAP_API_KEY = "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";
const CHEAP_ENDPOINT = "https://integrate.api.nvidia.com/v1";
const CHEAP_MODEL = "deepseek-ai/deepseek-v3.1";

async function curateContext(messages: any[]): Promise<any[]> {
  if (!messages || messages.length <= 2) return messages;

  const initialTokens = estimateTokens(messages);
  console.log(`[CURATOR] Initial tokens: ${initialTokens}. Evaluated for cheap curation...`);

  // 1. Identification
  const systemMsgIndex = messages.findIndex(m => m.role === 'system');
  const systemPrompt = systemMsgIndex !== -1 ? messages[systemMsgIndex] : null;
  
  const lastUserMsgIndex = [...messages].reverse().findIndex(m => m.role === 'user');
  if (lastUserMsgIndex === -1) return messages; 
  const lastUserIndex = (messages.length - 1) - lastUserMsgIndex;
  const lastUserMsg = messages[lastUserIndex];
  
  const startIndex = systemMsgIndex !== -1 ? systemMsgIndex + 1 : 0;
  const midHistory = messages.slice(startIndex, lastUserIndex);
  
  const recentHistory = midHistory.slice(-6);
  const oldHistory = midHistory.slice(0, -6);

  // 2. Truncation vs Summarization Decision
  // Calculate tokens IF we just deleted oldHistory entirely
  const baselineMessages = [];
  if (systemPrompt) baselineMessages.push(systemPrompt);
  baselineMessages.push(...recentHistory);
  baselineMessages.push(lastUserMsg);
  
  const baselineTokens = estimateTokens(baselineMessages);
  console.log(`[CURATOR] Truncation test: Baseline without old history is ${baselineTokens} tokens.`);

  if (oldHistory.length === 0) return messages;

  // RULE: If truncation alone makes it < 8000, just truncate (FREE)
  if (baselineTokens < 8000) {
    console.log('[CURATOR] Truncation alone works. Dropping old history (No AI call).');
    return baselineMessages;
  }

  // 3. Stage 1: Summarize Old History using CHEAP model
  console.log(`[CURATOR] Truncation not enough (${baselineTokens} pts). Calling Cheap AI (${CHEAP_MODEL})...`);
  let currentMessages = [...baselineMessages];
  try {
    const resp = await axios.post(`${CHEAP_ENDPOINT}/chat/completions`, {
      model: CHEAP_MODEL,
      messages: [
        { role: 'system', content: 'Summarize the following historical conversation into a SINGLE SHORT PARAGRAPH. Be extremely brief.' },
        { role: 'user', content: JSON.stringify(oldHistory) }
      ],
      temperature: 0.1,
      max_tokens: 500,
    }, { 
      headers: { 'Authorization': `Bearer ${CHEAP_API_KEY}`, 'Content-Type': 'application/json' } 
    });
    
    const summary = resp.data.choices[0].message.content;
    const reconstructed: any[] = [];
    if (systemPrompt) reconstructed.push(systemPrompt);
    reconstructed.push({ role: 'user', content: `[HISTORICAL SUMMARY]: ${summary}` });
    reconstructed.push(...recentHistory);
    reconstructed.push(lastUserMsg);
    
    currentMessages = reconstructed;
    console.log(`[CURATOR] Cheap History Summarization Complete. New Total: ${estimateTokens(currentMessages)}`);
  } catch (e: any) {
    console.error('[CURATOR] Cheap Summarization Failed. Falling back to Truncation.', e.response?.data || e.message);
    return baselineMessages; 
  }

  // 4. Stage 2: Summarize System Prompt using CHEAP model
  if (estimateTokens(currentMessages) > 8000 && systemPrompt) {
    console.log('[CURATOR] Still over 8k. Using Cheap AI to shrink System Prompt...');
    try {
      const resp = await axios.post(`${CHEAP_ENDPOINT}/chat/completions`, {
        model: CHEAP_MODEL,
        messages: [
          { role: 'system', content: 'Summarize the following instructions into a concise version. Keep ALL persona and rules.' },
          { role: 'user', content: systemPrompt.content }
        ],
        temperature: 0.1,
        max_tokens: 800,
      }, { 
        headers: { 'Authorization': `Bearer ${CHEAP_API_KEY}`, 'Content-Type': 'application/json' } 
      });
      
      const systemSummary = resp.data.choices[0].message.content;
      const sIndex = currentMessages.findIndex(m => m.role === 'system');
      if (sIndex !== -1) {
        currentMessages[sIndex] = { role: 'system', content: systemSummary };
      }
      console.log(`[CURATOR] Cheap System Summarization Complete. Final Total: ${estimateTokens(currentMessages)}`);
    } catch (e: any) {
      console.error('[CURATOR] Cheap System Summarization Failed.', e.response?.data || e.message);
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
  if (estimatedInputTokens > 8000) {
    console.log(`[CURATOR] Context high (${estimatedInputTokens} tokens). Running cheap curator...`);
    body.messages = await curateContext(body.messages);
    // RE-ESTIMATE after curation
    estimatedInputTokens = estimateTokens(body.messages || []);
    console.log(`[CURATOR] Post-curation tokens: ${estimatedInputTokens}`);
  }

  // 3. GLOBAL LIMITS VALIDATION (413 Check - Run AFTER potential curation)
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

  // 4. GLOBAL OUTPUT LIMIT VALIDATION
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
