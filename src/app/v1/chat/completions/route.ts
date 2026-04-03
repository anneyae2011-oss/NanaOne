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
  if (messages.length <= 1) return messages;

  const latestMessage = messages[messages.length - 1];
  const history = messages.slice(0, -1);

  console.log(`[CURATOR] Triggered for ${messages.length} messages. Summarizing...`);

  try {
    const response = await axios.post(`${endpoint}/chat/completions`, {
      model: model,
      messages: [
        { role: 'system', content: 'You are a NanaOne Context Curator. Summarize the following AI conversation history extremely concisely while preserving all critical facts, entities, and the current state of discussions. This summary will be used as the context for the next turn. Focus on facts needed for the future.' },
        { role: 'user', content: JSON.stringify(history) }
      ],
      temperature: 0.3,
    }, {
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }
    });

    const summary = response.data.choices[0].message.content;
    return [
      { role: 'system', content: `[CURATED CONTEXT]: ${summary}` },
      latestMessage
    ];
  } catch (error) {
    console.error('Curator Error:', error);
    return messages;
  }
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

  // CONTEXT CURATOR LOGIC
  const estimatedInputTokens = estimateTokens(body.messages || []);
  if (estimatedInputTokens > 6000) {
    console.log(`[CURATOR] Context high (${estimatedInputTokens} tokens). Running curator...`);
    body.messages = await curateContext(body.messages, s[0].upstreamEndpoint, s[0].upstreamKey, body.model);
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
