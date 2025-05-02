// Backend specific interfaces

// Data structure for AssemblyAI Utterances (subset of fields)
export interface Utterance {
    speaker: string | null; // Speaker label (e.g., 'A', 'B') or null
    start: number; // Milliseconds
    end: number; // Milliseconds
    text: string;
    words: { start: number; end: number; text: string; speaker: string | null }[];
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

// Note: UserRole, AdjustRequestBody, AnalyzeJobData, AdjustJobData,
// Segment, SpeakerWPM, TargetWPM moved to common/src/types.ts