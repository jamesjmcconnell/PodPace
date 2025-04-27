// Shared interfaces for PodPace backend

// Data structure for AssemblyAI Utterances (subset of fields)
export interface Utterance {
    speaker: string | null; // Speaker label (e.g., 'A', 'B') or null
    start: number; // Milliseconds
    end: number; // Milliseconds
    text: string;
    words: { start: number; end: number; text: string; speaker: string | null }[];
}

// Structure for storing calculated speaker WPM data in Redis
export interface SpeakerWPM {
    id: string; // e.g., "Speaker_A"
    avg_wpm: number;
    total_words?: number; // Optional details from calculation
    total_duration_s?: number; // Optional details from calculation
}

// Structure for target WPM input from the user/API
export interface TargetWPM {
    id: string; // Speaker ID matching SpeakerWPM (e.g., "Speaker_A")
    target_wpm: number;
}

// Structure for storing diarization segment data needed by adjust worker
export interface Segment {
    speaker: string | null; // e.g., "A", "B", or null for silence/noise
    start: number; // Milliseconds
    end: number; // Milliseconds
}

// Data passed in the Analyze Queue job
export interface AnalyzeJobData {
    jobId: string;
    filePath: string;
    originalFilename: string;
}

// Data passed in the Adjust Queue job
export interface AdjustJobData {
    jobId: string;
    filePath: string; // Path to original audio file
    originalFilename: string;
    targets: TargetWPM[]; // User-defined targets
    // The worker will fetch other needed data (segments, WPMs) from Redis
}

// Structure for AssemblyAI API responses (basic)
export interface AssemblyAIUploadResponse {
    upload_url: string;
}

export interface AssemblyAISubmitResponse {
    id: string;
    status: string;
}

export interface AssemblyAITranscriptResponse {
    id: string;
    status: 'queued' | 'processing' | 'completed' | 'error';
    error?: string;
    utterances?: Utterance[];
    text?: string;
}

// Interface for the POST /api/adjust/:jobId request body
export interface AdjustRequestBody {
    targets: { id: string; target_wpm: number }[];
}

// Represents the user's role based on authentication and subscription
export type UserRole = 'VISITOR' | 'FREE' | 'PAID';