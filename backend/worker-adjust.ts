import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import path from 'node:path';
import fs from 'node:fs/promises';
import { $ } from 'bun'; // Import Bun Shell
// Import shared interfaces using `import type`
import type { AdjustJobData, SpeakerWPM, TargetWPM, Segment } from './interfaces';

// --- Configuration ---
const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;
const ADJUST_QUEUE_NAME = 'audio-adjust';
// Assume OUTPUT_DIR is defined globally or passed via job data if needed
const OUTPUT_DIR = process.env.OUTPUT_DIR || path.join(import.meta.dir, 'output');
const TEMP_DIR_BASE = path.join(import.meta.dir, 'temp_adjust'); // Base for temporary files

// --- Redis Connection ---
console.log(`Adjust Worker connecting to Redis at ${REDIS_HOST}:${REDIS_PORT}...`);
const redisConnection = new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
});

redisConnection.on('connect', () => {
    console.log('Adjust Worker successfully connected to Redis.');
});

redisConnection.on('error', (err: Error) => {
    console.error('Adjust Worker Redis connection error:', err);
    process.exit(1);
});

// --- Job Status Tracking Helper (Shared logic - refactor possibility) ---
const getJobStatusKey = (jobId: string) => `job:${jobId}:status`;
const getJobDataKey = (jobId: string) => `job:${jobId}:data`;

async function updateJobStatus(jobId: string, status: string, data?: Record<string, any>) {
    console.log(`[Adjust Job ${jobId}] Updating status to ${status}`);
    try {
        const multi = redisConnection.multi();
        multi.hset(getJobStatusKey(jobId), 'status', status, 'updatedAt', String(Date.now()));
        if (data) {
            const dataToStore = Object.entries(data).reduce((acc, [key, value]) => {
                acc[key] = typeof value === 'string' ? value : JSON.stringify(value);
                return acc;
            }, {} as Record<string, string>);
            multi.hset(getJobDataKey(jobId), dataToStore);
        }
        await multi.exec();
    } catch (error) {
        console.error(`[Adjust Job ${jobId}] Failed to update status to ${status}:`, error);
    }
}

// --- Interfaces (Should match data stored by analyze worker/API) ---
// Remove local definitions - these are now imported
// interface SpeakerWPM { ... }
// interface TargetWPM { ... }
// interface Segment { ... }
// interface AdjustJobData { ... }

// Helper to get data stored by the analyze worker
// Uses imported Segment and SpeakerWPM types
async function getJobAnalysisData(jobId: string): Promise<{ speakers: SpeakerWPM[], segments: Segment[] } | null> {
    try {
        const jobData = await redisConnection.hgetall(getJobDataKey(jobId));
        if (!jobData || !jobData.speakers || !jobData.diarizationSegments) { // Adjust key name if needed
            console.error(`[Adjust Job ${jobId}] Missing analysis data (speakers or segments) in Redis.`);
            return null;
        }
        return {
            speakers: JSON.parse(jobData.speakers),
            segments: JSON.parse(jobData.diarizationSegments), // Adjust key name if needed
        };
    } catch (error: any) {
        console.error(`[Adjust Job ${jobId}] Failed to retrieve/parse analysis data:`, error);
        return null;
    }
}

// --- Audio Processing Logic ---

// Uses imported AdjustJobData type
async function processAudioAdjustment(jobData: AdjustJobData): Promise<string> {
    const { jobId, filePath, targets } = jobData;
    const tempDir = path.join(TEMP_DIR_BASE, jobId); // Job-specific temp directory
    console.log(`[Adjust Job ${jobId}] Starting adjustment process for ${filePath}`);

    // 1. Get calculated WPMs and Diarization Segments
    await updateJobStatus(jobId, 'PROCESSING_ADJUSTMENT');
    const analysisData = await getJobAnalysisData(jobId);
    if (!analysisData) {
        throw new Error('Failed to retrieve necessary analysis data from Redis.');
    }
    const { speakers: originalSpeakerWPMs, segments } = analysisData;

    // Create maps for quick lookup
    const originalWpmMap = new Map(originalSpeakerWPMs.map(s => [s.id, s.avg_wpm]));
    const targetWpmMap = new Map(targets.map(t => [t.id, t.target_wpm]));

    // --- Optimization Check ---
    let needsProcessing = false;
    if (targets.length > 0) { // Only check if targets were actually provided
        for (const target of targets) {
            const originalWpm = originalWpmMap.get(target.id);
            // Check if target WPM is significantly different from original (e.g., > 1 WPM difference)
            // Also check if originalWpm exists, otherwise assume change is needed if target was set
            if (originalWpm === undefined || Math.abs(target.target_wpm - originalWpm) > 1.0) {
                console.log(`[Adjust Job ${jobId}] Change detected for ${target.id}: Target=${target.target_wpm}, Original=${originalWpm}`);
                needsProcessing = true;
                break; // Found a change, no need to check further
            }
        }
    } else {
        // If no targets were sent, no processing is needed.
        needsProcessing = false;
    }

    // --- Conditional Processing ---
    if (!needsProcessing) {
        console.log(`[Adjust Job ${jobId}] No significant WPM changes detected. Skipping segmentation/stretching.`);
        // Determine output path based on original filename
        const outputFilename = `${path.parse(jobData.originalFilename).name}_normalized.mp3`;
        const finalOutputPath = path.join(OUTPUT_DIR, outputFilename);

        try {
            // Simply copy the original file to the output location
            console.log(`[Adjust Job ${jobId}] Copying original file ${filePath} to ${finalOutputPath}`);
            await fs.copyFile(filePath, finalOutputPath);
            return finalOutputPath; // Return the path to the copied file
        } catch(copyError: any) {
             console.error(`[Adjust Job ${jobId}] Failed to copy original file:`, copyError);
             throw new Error(`Failed to copy original file for unchanged job: ${copyError.message}`);
        }
    }

    // --- Proceed with Full Processing (Segmentation, Stretching, Concatenation) ---
    console.log(`[Adjust Job ${jobId}] Significant changes detected or no targets provided, proceeding with full processing.`);
    await fs.mkdir(tempDir, { recursive: true });
    console.log(`[Adjust Job ${jobId}] Created temp directory: ${tempDir}`);

    let processedSegmentPaths: string[] = [];
    const concatFilePath = path.join(tempDir, 'concat_list.txt');

    try {
        // 2. Process each segment
        console.log(`[Adjust Job ${jobId}] Processing ${segments.length} segments...`);
        for (let i = 0; i < segments.length; i++) {
            const segment = segments[i];
            const segmentIndex = String(i).padStart(4, '0'); // For unique temp filenames

            // Add null check for segment to satisfy linter
            if (!segment) {
                console.warn(`[Adjust Job ${jobId}] Skipping undefined segment at index ${i}`);
                continue;
            }

            const tempInputPath = path.join(tempDir, `segment_${segmentIndex}_input.wav`);
            const tempOutputPath = path.join(tempDir, `segment_${segmentIndex}_output.wav`);

            const startTimeSec = segment.start / 1000;
            const durationSec = (segment.end - segment.start) / 1000;

            if (durationSec <= 0) continue; // Skip zero/negative duration segments

            // Extract segment using ffmpeg (convert to WAV for rubberband)
            // Using Bun Shell (`$`) for cleaner command execution
            console.log(`[Adjust Job ${jobId}] Extracting segment ${i} (${startTimeSec.toFixed(2)}s - ${durationSec.toFixed(2)}s)`);
            await $`ffmpeg -loglevel error -i ${filePath} -ss ${startTimeSec} -t ${durationSec} -vn -acodec pcm_s16le -ar 44100 -ac 1 ${tempInputPath}`.quiet();

            let stretchFactor = 1.0;
            const speakerId = segment.speaker ? `Speaker_${segment.speaker}` : null;

            if (speakerId && targetWpmMap.has(speakerId)) {
                const originalWpm = originalWpmMap.get(speakerId);
                const targetWpm = targetWpmMap.get(speakerId);

                if (originalWpm && targetWpm && originalWpm > 0 && targetWpm > 0) {
                    // Correct calculation: target / original for tempo factor
                    stretchFactor = targetWpm / originalWpm;
                    // Add safety clamps to stretch factor if desired
                    // stretchFactor = Math.max(0.5, Math.min(2.0, stretchFactor));
                    console.log(`[Adjust Job ${jobId}] Speaker ${speakerId}: Target ${targetWpm} / Original ${originalWpm} -> Tempo Factor ${stretchFactor.toFixed(3)}`);
                }
            }

            if (Math.abs(stretchFactor - 1.0) > 0.01) { // Apply stretch if factor is significantly different from 1
                // Log values before executing the command
                console.log(`[Adjust Job ${jobId}] Executing rubberband:`);
                console.log(`  Tempo Factor: ${stretchFactor}`);
                console.log(`  Input Path: ${tempInputPath}`);
                console.log(`  Output Path: ${tempOutputPath}`);
                // Remove --pitch flag, assume it preserves pitch by default when only tempo is set
                console.log(`  Command: rubberband --tempo ${stretchFactor} ${tempInputPath} ${tempOutputPath}`);

                try {
                    // Remove --pitch 0 flag
                    await $`rubberband --tempo ${stretchFactor} ${tempInputPath} ${tempOutputPath}`.quiet();
                    processedSegmentPaths.push(tempOutputPath);
                } catch (error) {
                    console.error(`[Adjust Job ${jobId}] rubberband command failed!`);
                    // Re-throw the error to be caught by the main handler
                    throw error;
                }

            } else {
                // No stretching needed, use the input segment directly for concatenation
                processedSegmentPaths.push(tempInputPath);
                // Optionally delete tempOutputPath if created by mistake or left from previous runs
                // await $`rm -f ${tempOutputPath}`.quiet();
            }
            // Clean up input if not used directly (only if stretch was applied)
             if (Math.abs(stretchFactor - 1.0) > 0.01) {
                 await $`rm -f ${tempInputPath}`.quiet();
             }
        }

        // 3. Concatenate processed segments
        await updateJobStatus(jobId, 'PROCESSING_RECONSTRUCTION');
        console.log(`[Adjust Job ${jobId}] Concatenating ${processedSegmentPaths.length} processed segments...`);

        // Create the concat list file for ffmpeg
        const concatFileContent = processedSegmentPaths.map(p => `file '${p}'`).join('\n');
        await fs.writeFile(concatFilePath, concatFileContent);

        const outputFilename = `${path.parse(jobData.originalFilename).name}_normalized.mp3`; // Or choose another format
        const finalOutputPath = path.join(OUTPUT_DIR, outputFilename);

        console.log(`[Adjust Job ${jobId}] Writing final output to: ${finalOutputPath}`);
        // Concatenate using ffmpeg, re-encoding to MP3 (adjust bitrate as needed)
        await $`ffmpeg -loglevel error -f concat -safe 0 -i ${concatFilePath} -c:a libmp3lame -b:a 192k ${finalOutputPath}`.quiet();

        console.log(`[Adjust Job ${jobId}] Concatenation complete.`);
        return finalOutputPath; // Return the path to the final file

    } finally {
        // 4. Cleanup temporary files regardless of success or failure
        console.log(`[Adjust Job ${jobId}] Cleaning up temporary directory: ${tempDir}`);
        await fs.rm(tempDir, { recursive: true, force: true });
    }
}

// --- Worker Implementation --- //

// Uses imported AdjustJobData type
const processAdjustJob = async (job: Job<AdjustJobData>) => {
    const { jobId } = job.data;
    console.log(`[Adjust Job ${jobId}] Starting adjustment process...`);

    try {
        const finalOutputPath = await processAudioAdjustment(job.data);

        // Update status to COMPLETE and store the output path
        await updateJobStatus(jobId, 'COMPLETE', {
            outputFilePath: finalOutputPath,
        });
        console.log(`[Adjust Job ${jobId}] Adjustment completed successfully. Output: ${finalOutputPath}`);

    } catch (error: any) {
        console.error(`[Adjust Job ${jobId}] Adjustment processing failed:`, error);
        await updateJobStatus(jobId, 'FAILED', { error: error.message || 'Unknown adjustment error' });
        // Optional: Rethrow error for BullMQ retry logic
        // throw error;
    }
};

// --- Worker Initialization --- //
// Uses imported AdjustJobData type
const worker = new Worker<AdjustJobData>(ADJUST_QUEUE_NAME, processAdjustJob, {
    connection: redisConnection,
    concurrency: 2, // Limit concurrency for CPU/IO intensive ffmpeg/rubberband tasks
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
});

worker.on('completed', (job: Job, result: any) => {
    console.log(`[Adjust Job ${job.data.jobId}] Completed successfully.`);
});

worker.on('failed', (job: Job | undefined, error: Error) => {
    if (job) {
        console.error(`[Adjust Job ${job.data.jobId}] Failed:`, error);
    } else {
        console.error('Adjust Worker encountered a failure with an undefined job:', error);
    }
});

worker.on('error', (error: Error) => {
    console.error('Adjust Worker encountered an error:', error);
});

console.log(`Adjust Worker listening for jobs on queue: ${ADJUST_QUEUE_NAME}`);

// --- Graceful Shutdown --- //
async function gracefulShutdown(signal: string) {
    console.log(`\nReceived ${signal}, shutting down adjust worker gracefully...`);
    try {
        await worker.close();
        console.log('Adjust BullMQ worker closed.');
        redisConnection.disconnect();
        console.log('Adjust Redis connection closed.');
        console.log('Adjust Worker shutdown complete.');
        process.exit(0);
    } catch (error) {
        console.error('Error during adjust worker graceful shutdown:', error);
        process.exit(1);
    }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));