import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq, or } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

// Simple VOIP regex check (can be expanded)
const VOIP_RANGES = [
  '500', '600', '700', '800', '888', '900' // Generic non-geographic or toll-free
];

function isVoip(phone: string) {
  // Mock check: If it starts with certain prefixes or matches specific patterns
  // In a real app, you'd use a service like Twilio Lookup
  const cleanPhone = phone.replace(/\D/g, '');
  if (cleanPhone.length < 10) return true; // Too short
  return false; 
}

export async function POST(req: Request) {
  try {
    const { username, phone } = await req.json();

    if (!username || !phone) {
      return NextResponse.json({ error: 'Username and Phone are required' }, { status: 400 });
    }

    if (isVoip(phone)) {
      return NextResponse.json({ error: 'VOIP numbers are not allowed' }, { status: 400 });
    }

    // Check if username or phone already exists
    const existing = await db.select().from(users).where(
      or(eq(users.username, username), eq(users.phone, phone))
    ).limit(1);

    if (existing.length > 0) {
      return NextResponse.json({ error: 'Username or Phone already in use' }, { status: 400 });
    }

    const userId = uuidv4();
    // Generate an initial API key for the user
    const apiKey = `NanaOne-${uuidv4().replace(/-/g, '').slice(0, 16)}`;

    await db.insert(users).values({
      id: userId,
      username,
      phone,
      apiKey,
      balance: 20.0,
      oneTimeBalance: 0.0,
      lastReset: new Date(),
      createdAt: new Date(),
    });

    return NextResponse.json({ success: true, apiKey, username });
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json({ error: 'Signup failed' }, { status: 500 });
  }
}
