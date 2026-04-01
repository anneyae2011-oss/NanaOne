import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { settings, models } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import axios from 'axios';

export async function GET() {
  const s = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
  if (s.length === 0) {
    return NextResponse.json({ error: 'Gateway settings not initialized' }, { status: 500 });
  }

  try {
    const response = await axios.get(`${s[0].upstreamEndpoint}/models`, {
      headers: {
        'Authorization': `Bearer ${s[0].upstreamKey}`,
      },
    });
    
    // Return the models directly from the upstream to ensure they show up as requested
    return NextResponse.json(response.data);
  } catch (error: any) {
    console.error('Models Fetch Error:', error.response?.data || error.message);
    return NextResponse.json({ error: 'Failed to fetch models' }, { status: 500 });
  }
}
