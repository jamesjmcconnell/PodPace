import { v4 as uuidv4 } from 'uuid';
import path from 'node:path';
import fs from 'node:fs/promises';
import { updateJobStatus } from '../../utils/jobUtils'; // Correct path
import { checkAndIncrementAnalysisQuota } from '../../utils/quotaUtils'; // Correct path
import { jsonResponse, errorResponse } from '../../utils/responseUtils'; // Correct path
import { env } from '../config'; // Correct path
import type { User } from '@supabase/supabase-js';
import type { UserRole } from '../../interfaces'; // Correct path

// Placeholder import for analyzeAudioQueue - Assuming queues will be in src/queues/
// import { analyzeAudioQueue } from '../queues/analyzeQueue';

const UPLOAD_DIR = env.UPLOAD_DIR; // Use validated config
const ANALYZE_QUEUE_NAME = 'audio-analyze'; // Keep queue name constant accessible

// --- Upload Handler ---
export async function handleUpload(req: Request, user: User, role: UserRole): Promise<Response> {
    console.log(`[Ctrl:Upload] Handling POST /api/upload for user ${user.id} (Role: ${role})`);

    // --- Apply Analysis Quota Check ---
    if (role === 'FREE') {
        const quotaAllowed = await checkAndIncrementAnalysisQuota(user.id);
        if (!quotaAllowed) {
            return errorResponse('Daily analysis limit reached (3/day). Upgrade for unlimited analyses.', 403);
        }
    }

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
        if (!audioFile.type || !audioFile.type.startsWith('audio/')) {
            return errorResponse(`Invalid file type: ${audioFile.type}. Please upload audio.`, 400);
        }

        jobId = uuidv4();
        const originalFilename = audioFile instanceof File ? audioFile.name : 'upload.audio';
        const fileExtension = path.extname(originalFilename) || '.mp3';
        const uniqueFilename = `${jobId}${fileExtension}`;
        filePath = path.join(UPLOAD_DIR, uniqueFilename);

        console.log(`[Ctrl:Upload] Job ID: ${jobId}, streaming to: ${filePath}`);

        // --- Stream Blob to file ---
        let writer = null;
        try {
            writer = Bun.file(filePath).writer();
            const reader = audioFile.stream().getReader();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                writer.write(value);
            }
            await writer.end();
            console.log(`[Ctrl:Upload] File stream complete for job ${jobId}. Size: ${audioFile.size}`);
        } catch (streamError: any) {
            console.error(`[Ctrl:Upload] Error writing stream for job ${jobId}:`, streamError);
            if (filePath) { try { await fs.unlink(filePath); } catch { /* ignore cleanup */ } }
            throw new Error('Failed to save uploaded file.');
        }
        // ---------------------------

        await updateJobStatus(jobId, 'PENDING', { originalFilename, filePath, userId: user.id });

        // Add job to queue - COMMENTED OUT UNTIL PHASE 3
        /*
        const { analyzeAudioQueue } = await import('../queues/analyzeQueue'); // Import when needed
        await analyzeAudioQueue.add(ANALYZE_QUEUE_NAME, {
            jobId, filePath, originalFilename, userId: user.id
        });
        */
        console.warn(`[Ctrl:Upload] analyzeAudioQueue.add() call commented out until Phase 3.`);

        console.log(`[Ctrl:Upload] Job ${jobId} info updated, returning 202 for user ${user.id}.`);
        return jsonResponse({ job_id: jobId }, 202);

    } catch (error: any) {
        console.error(`[Ctrl:Upload] Error handling upload for job ${jobId || 'unknown'} user ${user.id}:`, error);
        if (filePath) { try { await fs.unlink(filePath); } catch { /* ignore */ } }
        return errorResponse(`Failed to process upload: ${error.message}`, 500);
    }
}