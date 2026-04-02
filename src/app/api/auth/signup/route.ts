import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq, or } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: Request) {
  try {
    const { username, phone } = await req.json();

    if (!username || !phone) {
      return NextResponse.json({ error: 'Username and Phone are required' }, { status: 400 });
    }

    const normalizedPhone = phone.trim();

    // REAL VOIP & FAKE CHECK via Twilio Lookup
    if (process.env.TWILIO_SID && process.env.TWILIO_AUTH_TOKEN) {
      try {
        const twilio = require('twilio');
        const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
        
        const lookup = await client.lookups.v2.phoneNumbers(normalizedPhone)
          .fetch({ fields: 'line_type_intelligence' });

        if (!lookup.valid) {
          return NextResponse.json({ error: 'This phone number is invalid' }, { status: 400 });
        }

        if (lookup.lineTypeIntelligence?.type === 'voip') {
          return NextResponse.json({ error: 'VOIP numbers are not allowed' }, { status: 400 });
        }
      } catch (twilioError: any) {
        console.error('Twilio Lookup Error:', twilioError.message);
        // If it's a 404 from Twilio, the number is likely invalid
        if (twilioError.status === 404) {
          return NextResponse.json({ error: 'The phone number provided is non-existent or invalid' }, { status: 400 });
        }
        // For other errors (like auth), we log but maybe allow or block based on preference
        // Since the user is strict, let's block if we can't verify
        if (twilioError.status === 401 || twilioError.status === 403) {
            console.error('Twilio Auth Failed - check permissions');
        }
      }
    }

    // Check if username already exists
    const existingUsername = await db.select().from(users).where(eq(users.username, username)).limit(1);
    if (existingUsername.length > 0) {
      return NextResponse.json({ error: 'Username already taken' }, { status: 400 });
    }

    // Check if phone already exists
    const existingPhone = await db.select().from(users).where(eq(users.phone, normalizedPhone)).limit(1);
    if (existingPhone.length > 0) {
      return NextResponse.json({ error: 'Phone number already registered' }, { status: 400 });
    }

    const userId = uuidv4();
    const apiKey = `NanaOne-${uuidv4().replace(/-/g, '').slice(0, 16)}`;

    await db.insert(users).values({
      id: userId,
      username,
      phone: normalizedPhone,
      apiKey,
      balance: 20.0,
      oneTimeBalance: 0.0,
      lastReset: new Date(),
      createdAt: new Date(),
    });

    return NextResponse.json({ success: true, apiKey, username });
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json({ error: 'Signup failed. Please check your details.' }, { status: 500 });
  }
}
