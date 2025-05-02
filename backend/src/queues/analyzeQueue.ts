import { Queue } from 'bullmq';
import { redis } from '../lib/redis'; // Import shared redis client

export const ANALYZE_QUEUE_NAME = 'audio-analyze';

export const analyzeAudioQueue = new Queue(ANALYZE_QUEUE_NAME, {
    connection: redis,
    // Add default job options here if needed
    // defaultJobOptions: { ... }
});

console.log(`[Queue] Initialized: ${ANALYZE_QUEUE_NAME}`);