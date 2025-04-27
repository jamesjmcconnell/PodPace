import Redis from 'ioredis';
import { env } from '../config'; // Import validated environment variables

// Initialize the Redis client using validated config
export const redis = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD,
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false,    // Required by BullMQ
});

// Optional: Add event listeners here if needed globally,
// otherwise keep them in the main server file if they affect server startup.
redis.on('connect', () => {
    console.log('[Redis] Successfully connected.');
});

redis.on('error', (err: Error) => {
    console.error('[Redis] Connection error:', err);
    // Consider more robust error handling or application shutdown logic
});

console.log(`[Redis] Client configured for ${env.REDIS_HOST}:${env.REDIS_PORT}`);