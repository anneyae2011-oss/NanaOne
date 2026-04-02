import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, redeemCodes } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export async function POST(req: Request) {
  try {
    const { code, apiKey } = await req.json();
    
    if (!code || !apiKey) {
      return NextResponse.json({ error: 'Code and API Key are required' }, { status: 400 });
    }

    const user = await db.select().from(users).where(eq(users.apiKey, apiKey)).limit(1);
    if (user.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const redeemCode = await db.select().from(redeemCodes).where(and(eq(redeemCodes.code, code), eq(redeemCodes.isUsed, false))).limit(1);
    
    if (redeemCode.length === 0) {
      return NextResponse.json({ error: 'Invalid or already used code' }, { status: 400 });
    }

    // Update user balance and mark code as used
    await db.transaction(async (tx) => {
      await tx.update(users)
        .set({ oneTimeBalance: (user[0].oneTimeBalance || 0) + redeemCode[0].amount })
        .where(eq(users.id, user[0].id));
      
      await tx.update(redeemCodes)
        .set({ isUsed: true, usedBy: user[0].id })
        .where(eq(redeemCodes.code, code));
    });

    return NextResponse.json({ success: true, amount: redeemCode[0].amount });
  } catch (error) {
    console.error('Redeem error:', error);
    return NextResponse.json({ error: 'Redemption failed' }, { status: 500 });
  }
}
