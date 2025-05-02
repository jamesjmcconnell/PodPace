import { useState, useEffect, useRef } from 'react';

interface AudioPlayerProps {
  /** The Job ID to fetch the audio for */
  jobId: string;
  /** Function to get auth headers */
  getAuthHeaders: () => Record<string, string>;
  /** Optional CSS class name */
  className?: string;
}

/**
 * Fetches authenticated audio data and provides it to an HTML5 audio player.
 */
export default function AudioPlayer({
  jobId,
  getAuthHeaders,
  className
}: AudioPlayerProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  // Keep track of the current object URL to revoke it correctly
  const currentObjectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    // Clear previous state when jobId changes
    setObjectUrl(null);
    setError(null);
    setIsLoading(true);

    // If there's an old object URL, revoke it now
    if (currentObjectUrlRef.current) {
        URL.revokeObjectURL(currentObjectUrlRef.current);
        currentObjectUrlRef.current = null;
    }

    let isCancelled = false;

    const fetchAudio = async () => {
        if (!jobId) {
            setIsLoading(false);
            return;
        }
        console.log(`[AudioPlayer] Fetching audio for job: ${jobId}`);
        try {
            const apiUrl = `/api/download/${jobId}`;
            const response = await fetch(apiUrl, {
                headers: getAuthHeaders()
            });

            if (isCancelled) return; // Component unmounted or jobId changed

            if (!response.ok) {
                const errorText = await response.text().catch(() => `Audio fetch failed (${response.status})`);
                let errorMessage = `Audio fetch failed (${response.status})`;
                try { errorMessage = JSON.parse(errorText).error || errorMessage; } catch {}
                throw new Error(errorMessage);
            }

            const blob = await response.blob();
            if (isCancelled) return;

            const newObjectUrl = URL.createObjectURL(blob);
            console.log(`[AudioPlayer] Created object URL: ${newObjectUrl}`);
            setObjectUrl(newObjectUrl);
            currentObjectUrlRef.current = newObjectUrl; // Store for cleanup
            setError(null);

        } catch (e: any) {
            if (!isCancelled) {
                console.error('[AudioPlayer] Error fetching audio:', e);
                setError(e.message || 'Failed to load audio data.');
            }
        } finally {
            if (!isCancelled) {
                setIsLoading(false);
            }
        }
    };

    fetchAudio();

    // Cleanup function
    return () => {
        isCancelled = true;
        // Revoke the object URL when the component unmounts or jobId changes
        if (currentObjectUrlRef.current) {
            console.log(`[AudioPlayer] Revoking object URL: ${currentObjectUrlRef.current}`);
            URL.revokeObjectURL(currentObjectUrlRef.current);
            currentObjectUrlRef.current = null;
        }
    };
  }, [jobId, getAuthHeaders]); // Re-run if jobId or auth function changes

  if (isLoading) {
    return <div className={className}>Loading audio player...</div>;
  }

  if (error) {
    return <div className={className} style={{ color: 'orange' }}>Error loading audio: {error}</div>;
  }

  if (!objectUrl) {
    // Should not happen if not loading and no error, but handle just in case
    return <div className={className}>Audio player initializing...</div>;
  }

  return (
    <audio
      controls
      className={className}
      style={{ width: '100%' }}
      src={objectUrl} // Use the object URL from state
      preload="auto" // Suggest browser preload metadata/audio
    />
  );
}

