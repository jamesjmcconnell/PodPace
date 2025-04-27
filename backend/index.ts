import { Queue, Job } from 'bullmq';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import path from 'node:path';
import fs from 'node:fs'; // Import the fs module
import { handlePodcastSearch, handlePodcastEpisodes } from './routes/podcasts';
import { type ServeOptions } from 'bun'; // Import ServeOptions type
import { verifyAuth } from './middleware/auth'; // Import the auth middleware
import { getUserRole, type UserRole } from './middleware/role';
import { handleStripeWebhook } from './routes/webhooks'; // Import the handler
import type { User } from '@supabase/supabase-js'; // Import the User type


console.log('Starting backend server...');

// --- Configuration ---
const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;
const PODCAST_INDEX_API_KEY = process.env.PODCAST_INDEX_API_KEY; // Read Podcast Index Key
const PODCAST_INDEX_API_SECRET = process.env.PODCAST_INDEX_API_SECRET; // Read Podcast Index Secret

// --- Startup Verification Log ---
console.log('[Startup] Verifying Podcast Index Env Vars:');
console.log(`  - PODCAST_INDEX_API_KEY loaded: ${PODCAST_INDEX_API_KEY ? 'Yes' : 'No - Check .env!'}`)
console.log(`  - PODCAST_INDEX_API_SECRET loaded: ${PODCAST_INDEX_API_SECRET ? 'Yes' : 'No - Check .env!'}`)
// --- End Verification Log ---

// Default directories within the backend directory if not specified by env vars
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(import.meta.dir, 'uploads');
const OUTPUT_DIR = process.env.OUTPUT_DIR || path.join(import.meta.dir, 'output');
const API_PORT = parseInt(process.env.API_PORT || '3000', 10);

const ANALYZE_QUEUE_NAME = 'audio-analyze';
const ADJUST_QUEUE_NAME = 'audio-adjust';

// --- Redis Connection ---
console.log(`Connecting to Redis at ${REDIS_HOST}:${REDIS_PORT}...`);
const redisConnection = new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD,
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,    // Required by BullMQ
});

redisConnection.on('connect', () => {
    console.log('Successfully connected to Redis.');
});

redisConnection.on('error', (err: Error) => {
    console.error('Redis connection error:', err);
    // Consider exiting if Redis is essential and connection fails permanently
    // process.exit(1);
});

// --- Directory Setup ---
async function ensureDirectoryExists(dirPath: string) {
    try {
        await Bun.$`mkdir -p ${dirPath}`;
        console.log(`Directory ensured: ${dirPath}`);
    } catch (error) {
        console.error(`Failed to create directory ${dirPath}:`, error);
        // Depending on severity, you might want to throw or exit
    }
}

await ensureDirectoryExists(UPLOAD_DIR);
await ensureDirectoryExists(OUTPUT_DIR);

// --- BullMQ Queues ---
// Pass the connection instance directly to BullMQ
const analyzeAudioQueue = new Queue(ANALYZE_QUEUE_NAME, { connection: redisConnection });
const adjustAudioQueue = new Queue(ADJUST_QUEUE_NAME, { connection: redisConnection });

console.log(`Initialized BullMQ queues: ${ANALYZE_QUEUE_NAME}, ${ADJUST_QUEUE_NAME}`);

// --- Job Status Tracking (using Redis Hashes) ---
const getJobStatusKey = (jobId: string) => `job:${jobId}:status`;
const getJobDataKey = (jobId: string) => `job:${jobId}:data`;

async function updateJobStatus(jobId: string, status: string, data?: Record<string, any>) {
    console.log(`Updating job ${jobId} status to ${status}`);
    try {
        const multi = redisConnection.multi();
        multi.hset(getJobStatusKey(jobId), 'status', status, 'updatedAt', String(Date.now()));
        if (data) {
            // Store additional data; ensure values are strings or stringifiable
            const dataToStore = Object.entries(data).reduce((acc, [key, value]) => {
                acc[key] = typeof value === 'string' ? value : JSON.stringify(value);
                return acc;
            }, {} as Record<string, string>);
            multi.hset(getJobDataKey(jobId), dataToStore);
        }
        await multi.exec();
    } catch (error) {
        console.error(`Failed to update status for job ${jobId}:`, error);
    }
}

async function getJobInfo(jobId: string): Promise<Record<string, string> | null> {
    try {
        const statusData = await redisConnection.hgetall(getJobStatusKey(jobId));
        const jobData = await redisConnection.hgetall(getJobDataKey(jobId));
        if (!statusData || Object.keys(statusData).length === 0) {
            return null; // Job not found
        }
        // Combine status and data; NOTE: all values from hgetall are strings
        return { ...statusData, ...jobData };
    } catch (error) {
        console.error(`Failed to get info for job ${jobId}:`, error);
        return null;
    }
}

/**
 * Creates a JSON HTTP response with appropriate CORS headers.
 *
 * @param data - The data to serialize as JSON in the response body.
 * @param status - The HTTP status code to use for the response. Defaults to 200.
 * @param headers - Optional additional headers to include in the response.
 * @returns A Response object containing the JSON-encoded data and CORS headers.
 */
function jsonResponse(data: any, status: number = 200, headers?: Record<string, string>) {
    return new Response(JSON.stringify(data), {
        status: status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*', // Basic CORS for local dev
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            ...headers,
        }
    });
}

/**
 * Creates a standardized JSON error response with the given message and HTTP status code.
 *
 * @param message - The error message to include in the response.
 * @param status - The HTTP status code to use for the response. Defaults to 500.
 * @returns An HTTP response object containing the error message in JSON format.
 */
export function errorResponse(message: string, status: number = 500) {
    console.error(`Returning error (${status}): ${message}`);
    return jsonResponse({ error: message }, status);
}

// Define an interface for the expected request body structure
interface AdjustRequestBody {
    targets: { id: string; target_wpm: number }[];
}

// --- Quota Helpers ---

// Checks and increments the daily ANALYSIS quota (Limit: 3)
async function checkAndIncrementAnalysisQuota(userId: string): Promise<boolean> {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD (UTC)
    const key = `quota:analysis:free:${userId}:${today}`;
    const limit = 3; // Define the limit
    try {
        const currentCount = await redisConnection.incr(key);
        if (currentCount === 1) {
            // seconds until next midnight UTC
            const now = new Date();
            const nextMidnight = new Date(Date.UTC(
                now.getUTCFullYear(),
                now.getUTCMonth(),
                now.getUTCDate() + 1, 
                0, 0, 0, 0
            ));
            const ttlSeconds = Math.floor((nextMidnight.getTime() - now.getTime()) / 1000);
            await redisConnection.expire(key, ttlSeconds);
        }
        const allowed = currentCount <= limit;
        console.log(
            `[QuotaCheck Analysis] User: ${userId}, Date: ${today}, ` +
            `Count: ${currentCount}, Limit: ${limit}, Allowed: ${allowed}`
        );
        return allowed;
    } catch (error) {
        console.error(`[QuotaCheck Analysis] Redis error for user ${userId}:`, error);
        return false; // Fail closed
    }
}

// Renamed for clarity: Checks and increments the daily ADJUSTMENT quota (Limit: 1)
async function checkAndIncrementAdjustmentQuota(userId: string): Promise<boolean> {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD (UTC)
    const key = `quota:adjust:free:${userId}:${today}`; // New key pattern
    const limit = 1; // Define the limit
    try {
        const currentCount = await redisConnection.incr(key);
        if (currentCount === 1) {
            // seconds until next midnight UTC
            const now = new Date();
            const nextMidnight = new Date(Date.UTC(
                now.getUTCFullYear(),
                now.getUTCMonth(),
                now.getUTCDate() + 1, 
                0, 0, 0, 0
            ));
            const ttlSeconds = Math.floor((nextMidnight.getTime() - now.getTime()) / 1000);
            await redisConnection.expire(key, ttlSeconds);
        }
        const allowed = currentCount <= limit;
        console.log(
            `[QuotaCheck Adjust] User: ${userId}, Date: ${today}, ` +
            `Count: ${currentCount}, Limit: ${limit}, Allowed: ${allowed}`
        );
        return allowed;
    } catch (error) {
        console.error(`[QuotaCheck Adjust] Redis error for user ${userId}:`, error);
        return false; // Fail closed
    }
}

async function handleAdjust(req: Request, jobId: string): Promise<Response> {
    console.log(`Handling POST /api/adjust/${jobId}`);
    const jobInfo = await getJobInfo(jobId);

    if (!jobInfo) {
        return errorResponse('Job not found', 404);
    }

    const currentStatus = jobInfo.status;

    // Allow adjust if job is ready OR if it previously failed
    if (currentStatus !== 'READY_FOR_INPUT' && currentStatus !== 'FAILED') {
        return errorResponse(`Job status is ${currentStatus || 'Unknown'}, cannot start/retry adjustment.`, 409);
    }

    const wasFailed = currentStatus === 'FAILED';
    if (wasFailed) {
        console.log(`[Job ${jobId}] Retrying adjustment for previously failed job.`);
    }

    try {
        const body = await req.json() as AdjustRequestBody;

        // Basic validation for targets
        if (!body || !Array.isArray(body.targets) || body.targets.length === 0) {
            return errorResponse('Invalid adjustment targets provided.', 400);
        }
        // Add more detailed validation if needed (e.g., check target_wpm range)
        const targets = body.targets; // Now TS knows targets exists and its type

        // Update status and clear any previous error if retrying
        await updateJobStatus(jobId, 'QUEUED_FOR_ADJUSTMENT', { targets: JSON.stringify(targets), error: null });

        await adjustAudioQueue.add(ADJUST_QUEUE_NAME, {
            jobId: jobId,
            // Pass necessary data from jobInfo for the worker
            filePath: jobInfo.filePath,
            originalFilename: jobInfo.originalFilename,
            // It's better to reload fresh diarization/ASR data in the worker if needed
            // but targets MUST be passed:
            targets: targets,
            // Pass speaker WPM if needed directly by worker, or let worker reload
            // speakerWPMs: JSON.parse(jobInfo.speakers || '[]'), // Example
        });

        console.log(`Job ${jobId} added to ${ADJUST_QUEUE_NAME} queue.`);
        return jsonResponse({ status: 'Adjustment queued' }, 202);

    } catch (error: any) {
        console.error(`Error queuing adjustment for job ${jobId}:`, error);
        // Revert status?
        return errorResponse('Failed to queue adjustment task.', 500);
    }
}

// --- Route Handlers ---

// Updated handleUpload to require auth and check analysis quota
async function handleUpload(req: Request, user: User, role: UserRole): Promise<Response> {
    console.log(`[Upload] Handling POST /api/upload for user ${user.id} (Role: ${role})`);

    // --- Apply Analysis Quota Check ---
    if (role === 'FREE') {
        const quotaAllowed = await checkAndIncrementAnalysisQuota(user.id);
        if (!quotaAllowed) {
            return errorResponse('Daily analysis limit reached (3/day). Upgrade for unlimited analyses.', 403);
        }
        // Proceed if quota allowed...
    }
    // Skip check if role === 'PAID'

    // Expect multipart/form-data
    const contentType = req.headers.get('content-type');
    if (!contentType || !contentType.startsWith('multipart/form-data')) {
        return errorResponse('Invalid content type, expected multipart/form-data', 400);
    }

    let filePath: string | null = null;
    let jobId: string | null = null;

    try {
        const formData = await req.formData();
        const audioFile = formData.get('audioFile');

        if (!audioFile || !(audioFile instanceof Blob) || audioFile.size === 0) {
            return errorResponse('No valid audio file uploaded.', 400);
        }

        // Re-check type from the Blob itself
        if (!audioFile.type || !audioFile.type.startsWith('audio/')) {
            return errorResponse(`Invalid file type in form data: ${audioFile.type || 'unknown'}. Please upload an audio file.`, 400);
        }

        jobId = uuidv4();
        const originalFilename = audioFile instanceof File ? audioFile.name : 'upload.audio';
        const fileExtension = path.extname(originalFilename) || '.mp3'; // Default to mp3 if needed
        const uniqueFilename = `${jobId}${fileExtension}`;
        filePath = path.join(UPLOAD_DIR, uniqueFilename);

        console.log(`Generated Job ID: ${jobId}, streaming FormData file to: ${filePath}`);

        // --- Stream the extracted Blob to file using reader/writer ---
        let writer = null;
        try {
            writer = Bun.file(filePath).writer();
            const reader = audioFile.stream().getReader(); // Get reader from the extracted blob
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    break;
                }
                writer.write(value);
            }
            await writer.end();
            console.log(`FormData file stream complete for job ${jobId}. File size: ${audioFile.size}`);
        } catch (streamError: any) {
            console.error(`Error writing file stream for job ${jobId}:`, streamError);
            if (filePath) { // Attempt cleanup only if path was determined
                 try { await fs.promises.unlink(filePath); } catch { /* ignore cleanup error */ }
            }
            throw new Error('Failed to save uploaded file from FormData.');
        }
        // --- End of Streaming logic ---

        // File saved, now update status and queue job
        await updateJobStatus(jobId, 'PENDING', { originalFilename, filePath, userId: user.id });

        await analyzeAudioQueue.add(ANALYZE_QUEUE_NAME, { jobId, filePath, originalFilename, userId: user.id });
        console.log(`[Upload] Job ${jobId} added to ${ANALYZE_QUEUE_NAME} queue for user ${user.id}.`);

        return jsonResponse({ job_id: jobId }, 202);

    } catch (error: any) {
        console.error(`[Upload] Error handling upload for job ${jobId || 'unknown'} user ${user.id}:`, error);
        // Attempt cleanup if filePath was determined before the main error
        if (filePath) {
             try { await fs.promises.unlink(filePath); } catch { /* ignore cleanup error */ }
        }
        return errorResponse(`Failed to process upload: ${error.message}`, 500);
    }
}

async function handleStatus(req: Request, jobId: string): Promise<Response> {
    console.log(`Handling GET /api/status/${jobId}`);
    const jobInfo = await getJobInfo(jobId);

    if (!jobInfo) {
        return errorResponse('Job not found', 404);
    }

    // Parse specific fields known to be JSON if needed (adjust based on worker output)
    try {
        if (jobInfo.speakers) jobInfo.speakers = JSON.parse(jobInfo.speakers);
        if (jobInfo.targets) jobInfo.targets = JSON.parse(jobInfo.targets);
        // Add parsing for other JSON fields as needed
    } catch (parseError: any) {
        console.warn(`Could not parse JSON field for job ${jobId}: ${parseError.message}`);
        // Decide how to handle: return raw strings or indicate an issue
    }

    return jsonResponse({ job_id: jobId, ...jobInfo });
}

async function handleDownload(req: Request, jobId: string): Promise<Response> {
    console.log(`Handling GET /api/download/${jobId}`);
    const jobInfo = await getJobInfo(jobId);

    if (!jobInfo) {
        return errorResponse('Job not found', 404);
    }

    if (jobInfo.status !== 'COMPLETE') {
        return errorResponse(`Job status is ${jobInfo.status}. File not ready for download.`, 409);
    }

    const outputFilePath = jobInfo.outputFilePath;
    if (!outputFilePath) {
        return errorResponse('Internal error: Output file path not found.', 500);
    }

    try {
        const file = Bun.file(outputFilePath);
        if (!(await file.exists())) {
            console.error(`Output file not found at path: ${outputFilePath} for job ${jobId}`);
            return errorResponse('Output file not found.', 404);
        }

        const originalFilename = jobInfo.originalFilename || 'audio';
        const downloadFilename = `${path.parse(originalFilename).name}_normalized${path.extname(outputFilePath || '.mp3')}`;

        console.log(`Serving file: ${outputFilePath} as ${downloadFilename}`);
        return new Response(file, {
            headers: {
                'Content-Disposition': `attachment; filename="${downloadFilename}"`,
                // Bun infers Content-Type, add CORS headers for potential browser issues?
                'Access-Control-Allow-Origin': '*',
            }
        });

    } catch (error: any) {
        console.error(`Error serving file ${outputFilePath} for job ${jobId}:`, error);
        return errorResponse('Failed to serve file.', 500);
    }
}

// --- Proxy Handler ---
async function handleAudioProxy(req: Request): Promise<Response> {
    const urlParam = new URL(req.url).searchParams.get('url');
    if (!urlParam) {
        return errorResponse('Missing target URL parameter', 400);
    }

    let targetUrl: URL;
    try {
        targetUrl = new URL(urlParam);
        // Optional: Add domain validation if needed
        // const allowedDomains = ['api.substack.com', 'some.other.domain'];
        // if (!allowedDomains.includes(targetUrl.hostname)) {
        //     return errorResponse('Proxying from this domain is not allowed', 403);
        // }
    } catch (e) {
        return errorResponse('Invalid target URL parameter', 400);
    }

    console.log(`[Proxy] Fetching: ${targetUrl.toString()}`);

    try {
        // Fetch the audio from the target URL
        const externalResponse = await fetch(targetUrl.toString(), {
            headers: { 'User-Agent': 'PodPaceProxy/1.0' } // Set a reasonable UA
        });

        if (!externalResponse.ok) {
            console.error(`[Proxy] Error fetching ${targetUrl}: ${externalResponse.status} ${externalResponse.statusText}`);
            return errorResponse(`Failed to fetch external audio: ${externalResponse.status}`, externalResponse.status);
        }

        // Create headers for our response, copying essentials
        const responseHeaders = new Headers({
            'Access-Control-Allow-Origin': '*', // Allow frontend origin
            // Copy content type from original response
            'Content-Type': externalResponse.headers.get('Content-Type') || 'application/octet-stream',
        });

        // Copy content length if available
        const contentLength = externalResponse.headers.get('Content-Length');
        if (contentLength) {
            responseHeaders.set('Content-Length', contentLength);
        }

        // Stream the body back
        return new Response(externalResponse.body, {
            status: externalResponse.status,
            headers: responseHeaders
        });

    } catch (error: any) {
        console.error(`[Proxy] Network error fetching ${targetUrl}:`, error);
        return errorResponse(`Proxy failed: ${error.message}`, 502); // Bad Gateway
    }
}

// --- Bun HTTP Server --- //
const serverOptions: ServeOptions = {
    port: API_PORT,
    maxRequestBodySize: 500 * 1024 * 1024,

    async fetch(req: Request): Promise<Response> {
        const url = new URL(req.url);
        const pathSegments = url.pathname.split('/').filter(Boolean); // e.g., ['api', 'upload']

        console.log(`Request: ${req.method} ${url.pathname}`);

        // Handle CORS preflight requests
        if (req.method === 'OPTIONS') {
            return new Response(null, {
                status: 204, // No Content
                headers: {
                    'Access-Control-Allow-Origin': '*', // Adjust for production
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Max-Age': '86400', // Cache preflight response for 1 day
                }
            });
        }

        // --- Stripe Webhook (Special Case - Needs Raw Body) ---
        // Handle before authentication or other checks
        if (url.pathname === '/api/webhooks/stripe' && req.method === 'POST') {
            console.log('Stripe webhook request received.');
            return handleStripeWebhook(req);
        }

        // --- Public Routes (No Auth Required) ---
        if (url.pathname === '/' && req.method === 'GET') {
            return jsonResponse({ status: 'ok', timestamp: Date.now() });
        }
        if (pathSegments[0] === 'api' && pathSegments[1] === 'podcasts') {
            if (pathSegments[2] === 'search' && req.method === 'GET') {
                return handlePodcastSearch(req);
            }
            if (pathSegments[2] === 'episodes' && req.method === 'GET') {
                return handlePodcastEpisodes(req, redisConnection);
            }
        }

        // --- Audio Proxy Route ---
        if (url.pathname === '/api/proxy/audio' && req.method === 'GET') {
             return handleAudioProxy(req);
        }

        // --- Protected Routes (Auth Required) ---
        const user = await verifyAuth(req);
        // Handle cases needing auth early, like upload
        if (url.pathname === '/api/upload' && req.method === 'POST') {
            if (!user) {
                // Visitor trying to upload - deny
                return errorResponse('Authentication required to upload or process audio.', 401);
            }
            const role = await getUserRole(user);
            console.log(`[Auth /upload] user ${user.id} role = ${role}`);
            // Pass user and role to the handler
            return handleUpload(req, user, role);
        }

        // For other protected routes, verify auth if not already done implicitly by upload check
        if (!user) {
            // This check might be redundant if all routes below /upload are covered,
            // but keep for safety unless explicitly removing other routes from protection.
            return errorResponse('Unauthorized: Invalid or missing token', 401);
        }
        // Determine role if not already determined for upload
        const role = await getUserRole(user);
        console.log(`[Auth] user ${user.id} role = ${role}`);

        if (pathSegments[0] === 'api' && pathSegments[1] === 'status' && pathSegments[2] && req.method === 'GET') {
            const jobId = pathSegments[2];
            // TODO: Optionally add logic to check if this user owns the job
            return handleStatus(req, jobId /*, user */);
        }

        if (pathSegments[0] === 'api' && pathSegments[1] === 'adjust' && pathSegments[2] && req.method === 'POST') {
            const jobId = pathSegments[2];

            // --- Add Debug Log 1 ---
            console.log(`[Debug /adjust] Entered route. Job: ${jobId}, Role: ${role}, User: ${user.id}`);

            // --- Apply Quota Check ---
            if (role === 'FREE') {
                 // --- Add Debug Log 2 ---
                console.log(`[Debug /adjust] Role is FREE. Attempting quota check for user ${user.id}.`);
                const quotaAllowed = await checkAndIncrementAdjustmentQuota(user.id);
                if (!quotaAllowed) {
                    // --- Add Debug Log 3 ---
                    console.log(`[Debug /adjust] Quota check returned false. Denying access.`);
                    return errorResponse('Daily free processing limit reached. Upgrade for unlimited processing.', 403); // 403 Forbidden
                }
                 // --- Add Debug Log 4 ---
                console.log(`[Debug /adjust] Quota check returned true. Proceeding.`);
                // If quotaAllowed is true, proceed... quota was incremented.
            } else {
                 // --- Add Debug Log 5 ---
                console.log(`[Debug /adjust] Role is ${role}. Skipping quota check.`);
            }
            // If role === 'PAID', quota check is skipped.

            // TODO: Verify user owns this job ID before adjusting? Maybe later.
             // --- Add Debug Log 6 ---
            console.log(`[Debug /adjust] Proceeding to call handleAdjust function for job ${jobId}.`);
            return handleAdjust(req, jobId /*, user, role */); // Pass user/role if handler needs it
        }

        if (pathSegments[0] === 'api' && pathSegments[1] === 'download' && pathSegments[2] && req.method === 'GET') {
            const jobId = pathSegments[2];
            // TODO: Optionally add logic to check if this user owns the job
            return handleDownload(req, jobId /*, user */);
        }

        // Default Not Found for authenticated users hitting unknown paths
        return errorResponse('Not Found', 404);
    },

    error(error: Error): Response {
        console.error("Unhandled server error:", error);
        return errorResponse('Internal Server Error', 500);
    },
};

const server = Bun.serve(serverOptions);
console.log(`🦊 PodPace API (Bun.serve) is running at http://${server.hostname}:${server.port}`);

// --- Graceful Shutdown --- (Ensure queues & connections are closed)
async function gracefulShutdown(signal: string) {
    console.log(`\nReceived ${signal}, shutting down gracefully...`);
    try {
        server.stop(true); // Stop accepting new connections, finish existing
        console.log('HTTP server stopped.');
        // Wait for queues to close properly
        await Promise.all([
            analyzeAudioQueue.close(),
            adjustAudioQueue.close()
        ]);
        console.log('BullMQ queues closed.');
        redisConnection.disconnect();
        console.log('Redis connection closed.');
        console.log('Shutdown complete.');
        process.exit(0);
    } catch (error) {
        console.error('Error during graceful shutdown:', error);
        process.exit(1);
    }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
