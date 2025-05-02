import { z } from 'zod';
import * as dotenv from 'dotenv';
import path from 'node:path';

// Load .env file from the backend directory (assuming this file is in backend/src)
// Adjust the path if your .env file is located elsewhere (e.g., project root)
dotenv.config({ path: path.resolve(import.meta.dir, '../.env') });

// Define the schema for environment variables
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Redis Configuration
  REDIS_HOST: z.string().default('127.0.0.1'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional(),

  // Supabase Configuration (for role middleware and webhooks)
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_KEY: z.string(),

  // Stripe Configuration
  STRIPE_SECRET_KEY: z.string(),
  STRIPE_WEBHOOK_SECRET: z.string(),

  // Podcast Index Configuration
  PODCAST_INDEX_API_KEY: z.string(),
  PODCAST_INDEX_API_SECRET: z.string(),

  // Application Configuration
  API_PORT: z.coerce.number().int().positive().default(3000),
  UPLOAD_DIR: z.string().default(path.resolve(import.meta.dir, '../uploads')),
  OUTPUT_DIR: z.string().default(path.resolve(import.meta.dir, '../output')),
  // Add other necessary env vars here
});

// Validate process.env against the schema
const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error(
    '❌ Invalid environment variables:',
    parsedEnv.error.flatten().fieldErrors,
  );
  // Exit or throw an error to prevent the application from starting with invalid config
  throw new Error('Invalid environment variables');
}

// Export the validated and typed environment variables
export const env = parsedEnv.data;

console.log('[Config] Environment variables loaded and validated.');