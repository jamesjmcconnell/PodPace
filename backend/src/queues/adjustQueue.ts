import { Queue } from 'bullmq';
import { redis } from '../lib/redis'; // Import shared redis client

export const ADJUST_QUEUE_NAME = 'audio-adjust';

export const adjustAudioQueue = new Queue(ADJUST_QUEUE_NAME, {
    connection: redis,
    // Add default job options here if needed
    // defaultJobOptions: { ... }
});

console.log(`[Queue] Initialized: ${ADJUST_QUEUE_NAME}`);