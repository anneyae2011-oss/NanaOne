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

  let currentBalance = user[0].balance || 0;
  if (isNewDay) {
    currentBalance = 20.0;
    await db.update(users).set({ balance: 20.0, lastReset: now }).where(eq(users.id, user[0].id));
  }

  if (currentBalance <= 0) {
    return NextResponse.json({ error: 'Insufficient balance ($20/day limit reached)' }, { status: 402, headers: CORS_HEADERS });
  }

  const body = await req.json();
  const s = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
  if (s.length === 0) {
    return NextResponse.json({ error: 'Gateway settings not initialized' }, { status: 500, headers: CORS_HEADERS });
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
      const cost = (promptTokens * 8 / 1000000) + (completionTokens * 25 / 1000000);
      const newBalance = Math.max(0, currentBalance - cost);
      await db.update(users).set({ balance: newBalance }).where(eq(users.id, user[0].id));
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
