// Frontend specific interfaces (can be subset of backend)

// Structure for displaying speaker WPM data received from backend
export interface SpeakerWPM {
    id: string; // e.g., "Speaker_A"
    avg_wpm: number;
    total_words?: number; // Optional details
    total_duration_s?: number; // Optional details
}

// Structure for sending target WPM data to backend
export interface TargetWPM {
    id: string; // Speaker ID matching SpeakerWPM (e.g., "Speaker_A")
    target_wpm: number;
}

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

// Type for tracking job status in the frontend
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
