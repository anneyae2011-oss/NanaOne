import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { v4 as uuidv4 } from 'uuid';
import { eq } from 'drizzle-orm';

export async function POST(req: Request) {
  try {
    const userId = uuidv4().slice(0, 8);
    const apiKey = `NanaOne-${uuidv4().replace(/-/g, '').slice(0, 32)}`;
    
    const newUser = await db.insert(users).values({
      id: userId,
      apiKey: apiKey,
      balance: 20.0,
      lastReset: new Date(),
      createdAt: new Date(),
    }).returning();

    return NextResponse.json(newUser[0]);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to generate key' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const apiKey = searchParams.get('key');
  
  if (!apiKey) return NextResponse.json({ error: 'Key required' }, { status: 400 });
  
  const user = await db.select().from(users).where(eq(users.apiKey, apiKey)).limit(1);
  if (user.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  
  return NextResponse.json(user[0]);
}
