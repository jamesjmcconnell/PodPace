/**
 * Shared types used by both frontend and backend.
 */

// --- User & Auth Related Types ---

/** Represents the user's role based on authentication and subscription */
export type UserRole = 'VISITOR' | 'FREE' | 'PAID';

/** Structure for quota information received from the backend */
export interface QuotaDetail {
    limit: number;
    used: number;
    remaining: number;
}

/** Full quota status object */
export interface QuotaInfo {
    analysis: QuotaDetail;
    adjustment: QuotaDetail;
}

// --- Job & Processing Related Types ---

/** Possible statuses for a processing job */
export type JobStatus =
  | 'IDLE' // Frontend only initial state
  | 'PENDING' // Waiting in analyze queue
  | 'UPLOADING' // Frontend only upload state
  | 'PROCESSING_UPLOAD_CLOUD'
  | 'PROCESSING_CLOUD_ANALYSIS'
  | 'PROCESSING_WPM_CALCULATION'
  | 'READY_FOR_INPUT'
  | 'QUEUED_FOR_ADJUSTMENT'
  | 'PROCESSING_ADJUSTMENT'
  | 'PROCESSING_RECONSTRUCTION'
  | 'COMPLETE'
  | 'FAILED';

/** Structure for displaying speaker WPM data */
export interface SpeakerWPM {
    id: string; // e.g., "Speaker_A"
    avg_wpm: number;
    total_words?: number; // Optional details
    total_duration_s?: number; // Optional details
}

/** Structure for sending target WPM data to backend */
export interface TargetWPM {
    id: string; // Speaker ID matching SpeakerWPM (e.g., "Speaker_A")
    target_wpm: number;
}

/** Structure for storing diarization segment data */
export interface Segment {
    speaker: string | null; // e.g., "A", "B", or null for silence/noise
    start: number; // Milliseconds
    end: number; // Milliseconds
}

// --- Podcast Related Types ---

export interface PodcastFeed {
    id: string;
    title: string;
    description: string;
    image: string;
}

export interface PodcastEpisode {
    id: string;
    title: string;
    datePublished: number; // Assuming this is a Unix timestamp (number)
    datePublishedPretty: string; // Add the human-readable string field
    audioUrl: string;
}

// --- Backend Specific Types (Could stay in backend/interfaces or move if needed elsewhere) ---
// Keep types specific to one side (like worker job data, external API responses)
// in their respective places unless truly shared.

export interface AnalyzeJobData {
    jobId: string;
    filePath: string;
    originalFilename: string;
}

export interface AdjustJobData {
    jobId: string;
    filePath: string;
    originalFilename: string;
    targets: TargetWPM[];
}

export interface AdjustRequestBody {
    targets: { id: string; target_wpm: number }[];
}