import type { SpeakerWPM, Segment } from '../interfaces'; // Import needed types
import { redis } from '../src/lib/redis'; // CORRECTED PATH: Import the shared redis client

// --- Job Status Tracking Keys ---
const getJobStatusKey = (jobId: string) => `job:${jobId}:status`;
const getJobDataKey = (jobId: string) => `job:${jobId}:data`;

// --- Helper Functions ---

// Get full job info (status + data)
export async function getJobInfo(jobId: string): Promise<Record<string, string> | null> {
    try {
        const statusData = await redis.hgetall(getJobStatusKey(jobId));
        const jobData = await redis.hgetall(getJobDataKey(jobId));
        if (!statusData || Object.keys(statusData).length === 0) {
            return null; // Job not found
        }
        return { ...statusData, ...jobData };
    } catch (error) {
        console.error(`Failed to get info for job ${jobId}:`, error);
        return null;
    }
}

// Get specific analysis results needed for adjustment/preview
export async function getJobAnalysisData(jobId: string): Promise<{ speakers: SpeakerWPM[], segments: Segment[] } | null> {
    try {
        const jobData = await redis.hgetall(getJobDataKey(jobId));
        // Check specific keys expected from analyze worker
        if (!jobData || !jobData.speakers || !jobData.diarizationSegments) {
            console.error(`[Adjust Job ${jobId}] Missing analysis data (speakers or diarizationSegments) in Redis.`);
            return null;
        }
        return {
            speakers: JSON.parse(jobData.speakers),
            segments: JSON.parse(jobData.diarizationSegments),
        };
    } catch (error: any) {
        console.error(`[Adjust Job ${jobId}] Failed to retrieve/parse analysis data:`, error);
        return null;
    }
}

// Function to update job status (could also live here)
export async function updateJobStatus(jobId: string, status: string, data?: Record<string, any>) {
    console.log(`[Job ${jobId}] Updating status to ${status}`);
    try {
        const multi = redis.multi();
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
        console.error(`[Job ${jobId}] Failed to update status to ${status}:`, error);
    }
}