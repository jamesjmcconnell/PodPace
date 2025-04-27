import { Queue } from 'bullmq';
import { getJobInfo, getJobAnalysisData, updateJobStatus } from '../../utils/jobUtils';
import { checkAndIncrementAdjustmentQuota, getQuotaCount } from '../../utils/quotaUtils';
import { verifyAuth } from '../../middleware/auth';
import { getUserRole } from '../../middleware/role';
import { jsonResponse, errorResponse } from '../../utils/responseUtils';
import { env } from '../config';
import type { AdjustRequestBody, Segment, UserRole } from '../../interfaces';
import { redis } from '../lib/redis';
import path from 'node:path';
import Bun from 'bun';
import type { User } from '@supabase/supabase-js';

// Placeholder import - Assuming queues will be in src/queues/
// import { adjustAudioQueue } from '../queues/adjustQueue';

// --- Job Status Handler ---
export async function handleStatus(req: Request, params: { jobId: string }): Promise<Response> {
    const { jobId } = params;
    console.log(`[Ctrl:Job] Handling GET /api/jobs/${jobId}/status`);
    const jobInfo = await getJobInfo(jobId);

    if (!jobInfo) {
        return errorResponse('Job not found', 404);
    }

    let responseData: Record<string, any> = { job_id: jobId, ...jobInfo };
    const user = await verifyAuth(req); // Check auth status silently

    if (user) {
        const role = await getUserRole(user);
        responseData.role = role;

        if (role === 'FREE') {
            const analysisQuotaUsed = await getQuotaCount(user.id, 'analysis');
            const adjustmentQuotaUsed = await getQuotaCount(user.id, 'adjust');
            responseData.quota = {
                analysis: { limit: 3, used: analysisQuotaUsed, remaining: Math.max(0, 3 - analysisQuotaUsed) },
                adjustment: { limit: 1, used: adjustmentQuotaUsed, remaining: Math.max(0, 1 - adjustmentQuotaUsed) }
            };
        } else if (role === 'PAID') {
             responseData.quota = { /* Indicate unlimited or omit */ };
        }
    }

    try {
        if (responseData.speakers) responseData.speakers = JSON.parse(responseData.speakers);
        if (responseData.targets) responseData.targets = JSON.parse(responseData.targets);
    } catch (parseError: any) {
        console.warn(`[Ctrl:Job] Could not parse JSON field for job ${jobId}: ${parseError.message}`);
    }

    return jsonResponse(responseData);
}

// --- Job Adjustment Handler ---
export async function handleAdjust(req: Request, params: { jobId: string }): Promise<Response> {
    const { jobId } = params;
    console.log(`[Ctrl:Job] Handling POST /api/jobs/${jobId}/adjust`);
    const jobInfo = await getJobInfo(jobId);

    if (!jobInfo) {
        return errorResponse('Job not found', 404);
    }

    const currentStatus = jobInfo.status;
    if (currentStatus !== 'READY_FOR_INPUT' && currentStatus !== 'FAILED') {
        return errorResponse(`Job status is ${currentStatus || 'Unknown'}, cannot start/retry adjustment.`, 409);
    }

    try {
        const body = await req.json() as AdjustRequestBody;
        if (!body || !Array.isArray(body.targets) || body.targets.length === 0) {
            return errorResponse('Invalid adjustment targets provided.', 400);
        }
        const targets = body.targets;

        // Update status and clear any previous error
        await updateJobStatus(jobId, 'QUEUED_FOR_ADJUSTMENT', { targets: JSON.stringify(targets), error: null });

        // Add job to queue - COMMENTED OUT UNTIL PHASE 3
        /*
        const { adjustAudioQueue } = await import('../queues/adjustQueue'); // Import queue when needed
        await adjustAudioQueue.add('audio-adjust', { // Use queue name from constant if defined
            jobId: jobId,
            filePath: jobInfo.filePath,
            originalFilename: jobInfo.originalFilename,
            targets: targets,
        });
        */
        console.warn(`[Ctrl:Job] adjustAudioQueue.add() call commented out until Phase 3.`); // Add warning

        return jsonResponse({ status: 'Adjustment queued' }, 202);

    } catch (error: any) {
        console.error(`[Ctrl:Job] Error queuing adjustment for job ${jobId}:`, error);
        return errorResponse('Failed to queue adjustment task.', 500);
    }
}

// --- Job Download Handler ---
export async function handleDownload(req: Request, params: { jobId: string }): Promise<Response> {
    const { jobId } = params;
    console.log(`[Ctrl:Job] Handling GET /api/jobs/${jobId}/download`);
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
            console.error(`[Ctrl:Job] Output file not found at path: ${outputFilePath} for job ${jobId}`);
            return errorResponse('Output file not found.', 404);
        }

        const originalFilename = jobInfo.originalFilename || 'audio';
        const downloadFilename = `${path.parse(originalFilename).name}_normalized${path.extname(outputFilePath || '.mp3')}`;

        console.log(`[Ctrl:Job] Serving file: ${outputFilePath} as ${downloadFilename}`);
        return new Response(file, {
            headers: {
                'Content-Disposition': `attachment; filename="${downloadFilename}"`,
                'Access-Control-Allow-Origin': '*',
            }
        });

    } catch (error: any) {
        console.error(`[Ctrl:Job] Error serving file ${outputFilePath} for job ${jobId}:`, error);
        return errorResponse('Failed to serve file.', 500);
    }
}

// --- Job Preview Handler ---
export async function handlePreview(req: Request, params: { jobId: string; speakerId: string }): Promise<Response> {
    const { jobId, speakerId } = params;
    console.log(`[Ctrl:Job] Request for preview job ${jobId}, speaker ${speakerId}`);
    const MAX_PREVIEW_SEC = 10;

    try {
        const jobInfo = await getJobInfo(jobId);
        if (!jobInfo || !jobInfo.filePath) {
            return errorResponse('Job info or file path not found', 404);
        }
        const originalFilePath = jobInfo.filePath;

        const analysisData = await getJobAnalysisData(jobId);
        if (!analysisData || !analysisData.segments || analysisData.segments.length === 0) {
            return errorResponse('Analysis data (segments) not found for job', 404);
        }

        const targetSpeakerLabel = speakerId;
        const firstSegment = analysisData.segments.find((seg: Segment) => seg.speaker === targetSpeakerLabel);

        if (!firstSegment) {
            return errorResponse(`No segments found for speaker ${speakerId}`, 404);
        }

        const startTimeSec = firstSegment.start / 1000;
        const segmentDurationSec = (firstSegment.end - firstSegment.start) / 1000;
        const extractDurationSec = Math.min(MAX_PREVIEW_SEC, segmentDurationSec);

        if (extractDurationSec <= 0) {
             return errorResponse('Segment duration too short for preview', 400);
        }

        console.log(`[Ctrl:Job] Extracting ${extractDurationSec.toFixed(2)}s starting at ${startTimeSec.toFixed(2)}s from ${originalFilePath}`);

        const ffmpeg = Bun.spawn([
            'ffmpeg', '-loglevel', 'error', '-i', originalFilePath,
            '-ss', String(startTimeSec), '-t', String(extractDurationSec), '-vn',
            '-f', 'mp3', '-acodec', 'libmp3lame', '-q:a', '5', 'pipe:1'
        ]);

        const stderr = await new Response(ffmpeg.stderr).text();
        if (stderr) {
            console.error(`[Ctrl:Job] ffmpeg stderr for job ${jobId}, speaker ${speakerId}: ${stderr}`);
        }

        return new Response(ffmpeg.stdout, {
            status: 200,
            headers: {
                'Content-Type': 'audio/mpeg',
                'Accept-Ranges': 'bytes',
                'Access-Control-Allow-Origin': '*'
            }
        });

    } catch (error: any) {
        console.error(`[Ctrl:Job] Error generating preview for job ${jobId}, speaker ${speakerId}:`, error);
        return errorResponse(`Failed to generate preview: ${error.message}`, 500);
    }
}