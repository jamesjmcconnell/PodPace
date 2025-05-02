import { Queue } from 'bullmq';
import { env } from './src/config';
import { redis as redisConnection } from './src/lib/redis';
import { server } from './src/server'; // Import the server instance
import path from 'node:path';
import { updateJobStatus } from './utils/jobUtils'; // Assuming no shared types needed here directly

// --- Initialization Script ---
// This file now primarily acts as the entry point for initialization.
// The actual server logic lives in src/server.ts and is started there.

console.log('[Bootstrap] Initializing PodPace Backend...');

// Configuration (Loaded in src/config.ts)
const UPLOAD_DIR = env.UPLOAD_DIR;
const OUTPUT_DIR = env.OUTPUT_DIR;
const API_PORT = env.API_PORT;

const ANALYZE_QUEUE_NAME = 'audio-analyze';
const ADJUST_QUEUE_NAME = 'audio-adjust';

// Redis Connection (Initialized in src/lib/redis.ts)

// Directory Setup
async function ensureDirectoryExists(dirPath: string) {
    try {
        await Bun.$`mkdir -p ${dirPath}`;
        console.log(`[Bootstrap] Directory ensured: ${dirPath}`);
    } catch (error) {
        console.error(`[Bootstrap] Failed to create directory ${dirPath}:`, error);
        process.exit(1); // Exit if essential directories can't be created
    }
}

// Define queues here for now, they can be exported if needed by shutdown
let analyzeAudioQueue: Queue | null = null;
let adjustAudioQueue: Queue | null = null;

async function initializeInfra() {
    console.log('[Bootstrap] Ensuring directories exist...');
    await ensureDirectoryExists(UPLOAD_DIR);
    await ensureDirectoryExists(OUTPUT_DIR);

    console.log('[Bootstrap] Initializing BullMQ queues...');
    analyzeAudioQueue = new Queue(ANALYZE_QUEUE_NAME, { connection: redisConnection });
    adjustAudioQueue = new Queue(ADJUST_QUEUE_NAME, { connection: redisConnection });
    console.log(`[Bootstrap] BullMQ queues initialized: ${ANALYZE_QUEUE_NAME}, ${ADJUST_QUEUE_NAME}`);
}

// --- Removed Handler Definitions ---
// handleAdjust, handleUpload, handleStatus, handleDownload, handlePreview, handleAudioProxy
// jsonResponse, errorResponse (moved to utils)

// --- Removed Bun HTTP Server ---
// const serverOptions = { ... fetch() ... error() ... }
// const server = Bun.serve(serverOptions);
// console.log(...) server running message moved to src/server.ts

// --- Graceful Shutdown ---
async function gracefulShutdown(signal: string) {
    console.log(`\n[Shutdown] Received ${signal}, shutting down gracefully...`);
    try {
        server.stop(true); // Stop the HTTP server from src/server.ts
        console.log('[Shutdown] HTTP server stopped.');

        // Close queues if they were initialized
        await Promise.all([
            analyzeAudioQueue?.close(),
            adjustAudioQueue?.close()
        ]);
        console.log('[Shutdown] BullMQ queues closed.');

        redisConnection.disconnect();
        console.log('[Shutdown] Redis connection closed.');

        console.log('[Shutdown] Complete.');
        process.exit(0);
    } catch (error) {
        console.error('[Shutdown] Error during graceful shutdown:', error);
        process.exit(1);
    }
}

// --- Main Execution ---

initializeInfra().then(() => {
    console.log('[Bootstrap] Infrastructure initialized.');
    // Server is already started by the import of src/server.ts
    console.log(`[Bootstrap] Server started by src/server.ts on port ${API_PORT}`);

    // Setup signal handlers for graceful shutdown
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

}).catch(error => {
    console.error("[Bootstrap] Fatal error during initialization:", error);
    process.exit(1);
});
