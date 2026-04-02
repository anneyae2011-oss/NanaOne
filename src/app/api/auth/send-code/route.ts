import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verificationCodes, users } from '@/lib/db/schema';
import { eq, and, gt } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: Request) {
  try {
    const { phone, type } = await req.json(); // type: 'signup' or 'login'

    if (!phone) {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
    }

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

    // Save to DB
    await db.insert(verificationCodes).values({
      id: uuidv4(),
      phone,
      code,
      expiresAt,
      createdAt: new Date(),
    });

    // MOCK: "Send to DMs" - Logging for now
    console.log(`[AUTH] Verification code for ${phone}: ${code}`);
    
    // In a real application, you'd call a Discord/Telegram/Twilio API here
    // notifyUserViaDM(phone, `Your NanaOne verification code is: ${code}`);

    return NextResponse.json({ success: true, message: 'Verification code sent to your DMs' });
  } catch (error: any) {
    console.error('CRITICAL Send code error:', error);
    return NextResponse.json({ 
      error: 'Failed to send verification code', 
      details: error.message || 'Unknown database or connection error' 
    }, { status: 500 });
  }
}
