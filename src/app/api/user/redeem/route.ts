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

    const normalizedCode = code.trim().toUpperCase();

    const user = await db.select().from(users).where(eq(users.apiKey, apiKey)).limit(1);
    if (user.length === 0) {
      return NextResponse.json({ error: 'User not found. Check your API key.' }, { status: 404 });
    }

    const redeemCode = await db.select().from(redeemCodes).where(eq(redeemCodes.code, normalizedCode)).limit(1);
    
    if (redeemCode.length === 0) {
      return NextResponse.json({ error: 'Invalid code' }, { status: 400 });
    }

    if (redeemCode[0].isUsed) {
      return NextResponse.json({ error: 'Code already used' }, { status: 400 });
    }

    // Perform updates sequentially if transaction is failing
    try {
      await db.update(redeemCodes)
        .set({ isUsed: true, usedBy: user[0].id })
        .where(eq(redeemCodes.code, normalizedCode));

      await db.update(users)
        .set({ oneTimeBalance: (user[0].oneTimeBalance || 0) + redeemCode[0].amount })
        .where(eq(users.id, user[0].id));

    } catch (dbError) {
      console.error('Database update failed:', dbError);
      return NextResponse.json({ error: 'Failed to update balance' }, { status: 500 });
    }

    return NextResponse.json({ success: true, amount: redeemCode[0].amount });
  } catch (error) {
    console.error('General Redeem error:', error);
    return NextResponse.json({ error: 'Redemption failed unexpectedly' }, { status: 500 });
  }
}
