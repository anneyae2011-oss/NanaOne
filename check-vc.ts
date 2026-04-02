import { neon } from '@neondatabase/serverless';

const sql = neon("postgresql://neondb_owner:npg_2udzYD8xKeXR@ep-calm-art-amez82zx-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require");

async function check() {
  try {
    const codes = await sql`SELECT * FROM verification_codes LIMIT 5`;
    console.log('--- VERIFICATION CODES ---');
    console.log(JSON.stringify(codes, null, 2));
  } catch (e) {
    console.error('Verification codes table check failed:', e);
  }
  process.exit(0);
}

check();
