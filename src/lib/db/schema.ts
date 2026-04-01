import { pgTable, text, real, timestamp, integer, boolean } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name'),
  apiKey: text('api_key').unique(),
  balance: real('balance').default(20.0),
  lastReset: timestamp('last_reset'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const settings = pgTable('settings', {
  id: integer('id').primaryKey(),
  upstreamEndpoint: text('upstream_endpoint'),
  upstreamKey: text('upstream_key'),
  adminPassword: text('admin_password'),
});

export const models = pgTable('models', {
  id: text('id').primaryKey(),
  name: text('name'),
  description: text('description'),
  provider: text('provider'),
  enabled: boolean('enabled').default(true),
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
