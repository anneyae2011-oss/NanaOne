import { pgTable, text, real, timestamp, integer, boolean } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  username: text('username').unique(),
  phone: text('phone').unique(),
  name: text('name'),
  apiKey: text('api_key').unique(),
  balance: real('balance').default(20.0), // Daily balance
  oneTimeBalance: real('one_time_balance').default(0.0), // Non-resetting balance
  lastReset: timestamp('last_reset'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const verificationCodes = pgTable('verification_codes', {
  id: text('id').primaryKey(),
  phone: text('phone').notNull(),
  code: text('code').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const settings = pgTable('settings', {
  id: integer('id').primaryKey(),
  upstreamEndpoint: text('upstream_endpoint'),
  upstreamKey: text('upstream_key'),
  adminPassword: text('admin_password'),
  contextLimit: integer('context_limit').default(16000),
  maxOutputTokens: integer('max_output_tokens').default(4000),
});

export const models = pgTable('models', {
  id: text('id').primaryKey(),
  name: text('name'),
  description: text('description'),
  provider: text('provider'),
  enabled: boolean('enabled').default(true),
});

export const redeemCodes = pgTable('redeem_codes', {
  code: text('code').primaryKey(),
  amount: real('amount').notNull(),
  isUsed: boolean('is_used').default(false),
  usedBy: text('used_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
});

export const usageLogs = pgTable('usage_logs', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id),
  modelId: text('model_id'),
  promptTokens: integer('prompt_tokens'),
  completionTokens: integer('completion_tokens'),
  totalTokens: integer('total_tokens'),
  cost: real('cost'),
  createdAt: timestamp('created_at').defaultNow(),
});
