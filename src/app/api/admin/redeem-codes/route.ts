import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { redeemCodes } from '@/lib/db/schema';
import { v4 as uuidv4 } from 'uuid';
import { desc } from 'drizzle-orm';

export async function GET() {
  const codes = await db.select().from(redeemCodes).orderBy(desc(redeemCodes.createdAt)).limit(50);
  return NextResponse.json(codes);
}

export async function POST(req: Request) {
  try {
    const { amount } = await req.json();
    if (!amount || isNaN(amount)) {
      return NextResponse.json({ error: 'Valid amount is required' }, { status: 400 });
    }

    const code = `NANA-${uuidv4().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
    
    await db.insert(redeemCodes).values({
      code,
      amount: parseFloat(amount),
      isUsed: false,
      createdAt: new Date(),
    });

    return NextResponse.json({ code, amount });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create code' }, { status: 500 });
  }
}
