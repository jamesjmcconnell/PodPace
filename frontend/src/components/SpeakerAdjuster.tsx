import React, { useState, useEffect, useRef } from 'react';

// Import shared interface using alias
import type { SpeakerWPM, TargetWPM, UserRole, QuotaInfo } from '~/common/types';

interface SpeakerAdjusterProps {
  jobId: string;
  speakerData: SpeakerWPM[];
  onSubmit: () => void; // Callback when adjustment is successfully submitted
  onError: (message: string) => void; // Callback for errors
  getAuthHeaders: () => Record<string, string>; // Add prop type
  userRole: UserRole | null;
  quotaStatus: QuotaInfo | null;
}

const SpeakerAdjuster: React.FC<SpeakerAdjusterProps> = ({
  jobId,
  speakerData,
  onSubmit,
  onError,
  getAuthHeaders,
  userRole,
  quotaStatus
}) => {
  // State to hold the target WPM for each speaker ID
  const [targets, setTargets] = useState<Record<string, number | ''>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewingSpeaker, setPreviewingSpeaker] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null); // Ref to manage audio element

  // Determine if inputs/button should be enabled
  const canAdjust = userRole === 'FREE' || userRole === 'PAID';
  const hasAdjustmentQuota = userRole === 'PAID' || ( (quotaStatus?.adjustment?.remaining ?? 0) > 0 );
  const isProcessingDisabled = !canAdjust || !hasAdjustmentQuota || isSubmitting;

  // Determine button text and potential message
  let buttonText = 'Process Adjustments';
  let quotaMessage = '';
  if (userRole === 'FREE') {
      const remaining = quotaStatus?.adjustment?.remaining ?? 0;
      if (remaining > 0) {
         buttonText = `Process Adjustment (1 Free Credit Remaining)`;
      } else {
         buttonText = 'Daily Adjustment Limit Reached';
         quotaMessage = 'Upgrade for unlimited adjustments.';
      }
  } else if (userRole === 'PAID') {
      buttonText = 'Process Adjustments (Unlimited)';
  } else { // VISITOR or null
     buttonText = 'Login/Sign Up to Adjust';
  }

  // Initialize targets state when speakerData is available
  useEffect(() => {
    const initialTargets: Record<string, number | ''> = {};
    speakerData.forEach(speaker => {
      // Initialize with current avg_wpm, user can then change it
      initialTargets[speaker.id] = speaker.avg_wpm;
    });
    setTargets(initialTargets);
  }, [speakerData]);

  const handleTargetChange = (
    speakerId: string,
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (!canAdjust) return; // Don't allow changes if not logged in/paid
    const value = event.target.value;
    setTargets(prevTargets => ({
      ...prevTargets,
      [speakerId]: value === '' ? '' : Number(value) // Store as number or empty string
    }));
  };

  const handleSubmit = async () => {
    if (isProcessingDisabled) return; // Double check
    setIsSubmitting(true);
    onError(''); // Clear previous errors

    const targetsToSend: TargetWPM[] = Object.entries(targets)
      .map(([id, target_wpm]) => ({ id, target_wpm: Number(target_wpm) }))
      .filter(t => !isNaN(t.target_wpm)); // Ensure only valid numbers are sent

    if (targetsToSend.length === 0) {
        onError('Please set at least one valid target WPM.');
        setIsSubmitting(false);
        return;
    }

    try {
      const apiUrl = '/api';
      console.log(`Submitting adjustments for job ${jobId} to: ${apiUrl}/adjust/${jobId}`);
      console.log('Payload:', { targets: targetsToSend });

      const response = await fetch(`${apiUrl}/adjust/${jobId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({ targets: targetsToSend }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `Adjustment submission failed (${response.status})` }));
        throw new Error(errorData.error || `Adjustment submission failed (${response.status})`);
      }

      console.log('Adjustment submission successful');
      onSubmit(); // Notify parent component

    } catch (err: any) {
      console.error('Adjustment submission error:', err);
      onError(err.message || 'Failed to submit adjustments.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Function to handle playing preview
  const handlePlayPreview = async (speakerId: string) => {
    if (previewingSpeaker === speakerId) { // Already loading/playing this one?
        // Optional: Stop current playback?
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.src = ''; // Release resource
            if (audioRef.current.dataset.objectUrl) {
                URL.revokeObjectURL(audioRef.current.dataset.objectUrl);
            }
        }
        setPreviewingSpeaker(null);
        return;
    }

    setPreviewingSpeaker(speakerId); // Indicate loading/playing state
    setPreviewError(null);
    console.log(`[Preview] Requesting preview for speaker: ${speakerId}`);

    try {
        const apiUrl = `/api/jobs/${jobId}/preview/${speakerId}`;
        const response = await fetch(apiUrl, {
            headers: getAuthHeaders()
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => `Preview failed (${response.status})`);
            let errorMessage = `Preview failed (${response.status})`;
            try { errorMessage = JSON.parse(errorText).error || errorMessage; } catch {}
            throw new Error(errorMessage);
        }

        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);

        // Use a single audio element for playback
        if (!audioRef.current) {
            audioRef.current = new Audio();
        }

        // Revoke previous object URL if exists
        if (audioRef.current.dataset.objectUrl) {
             URL.revokeObjectURL(audioRef.current.dataset.objectUrl);
        }

        audioRef.current.src = objectUrl;
        audioRef.current.dataset.objectUrl = objectUrl; // Store URL for revocation
        audioRef.current.play();

        // Clean up after playback ends
        const handleEnded = () => {
            setPreviewingSpeaker(null);
            if (audioRef.current && audioRef.current.dataset.objectUrl) {
                 console.log('[Preview] Playback ended, revoking', audioRef.current.dataset.objectUrl);
                 URL.revokeObjectURL(audioRef.current.dataset.objectUrl);
                 audioRef.current.dataset.objectUrl = undefined;
                 audioRef.current.src = '';
            }
            audioRef.current?.removeEventListener('ended', handleEnded);
        }
        audioRef.current.addEventListener('ended', handleEnded);

    } catch (e: any) {
        console.error(`[Preview] Error fetching/playing preview for ${speakerId}:`, e);
        setPreviewError(`Could not load preview: ${e.message}`);
        setPreviewingSpeaker(null);
    }
  };

  // Cleanup audio element and object URL on component unmount
  useEffect(() => {
    return () => {
         if (audioRef.current) {
            audioRef.current.pause();
            if (audioRef.current.dataset.objectUrl) {
                 console.log('[Preview] Component unmount, revoking', audioRef.current.dataset.objectUrl);
                 URL.revokeObjectURL(audioRef.current.dataset.objectUrl);
            }
            audioRef.current = null; // Release the ref
         }
    }
  }, []);

  return (
    <div>
      <h3>Adjust Speaker Speeds</h3>
      <p>Set a target Words Per Minute (WPM) for speakers you want to adjust. Leave blank or unchanged to keep original speed.</p>
      {previewError && <p style={{ color: 'red' }}>{previewError}</p>}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1rem' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '0.5rem' }}>Speaker ID</th>
            <th style={{ textAlign: 'right', borderBottom: '1px solid #ccc', padding: '0.5rem' }}>Avg. WPM</th>
            <th style={{ textAlign: 'right', borderBottom: '1px solid #ccc', padding: '0.5rem' }}>Target WPM</th>
            <th style={{ textAlign: 'center', borderBottom: '1px solid #ccc', padding: '0.5rem' }}>Preview</th>
          </tr>
        </thead>
        <tbody>
          {speakerData.map((speaker) => (
            <tr key={speaker.id}>
              <td style={{ padding: '0.5rem' }}>{speaker.id}</td>
              <td style={{ textAlign: 'right', padding: '0.5rem' }}>{speaker.avg_wpm.toFixed(0)}</td>
              <td style={{ textAlign: 'right', padding: '0.5rem' }}>
                <input
                  type="number"
                  min="50" // Set reasonable min/max if desired
                  max="400"
                  value={targets[speaker.id] ?? ''} // Use ?? to handle potential undefined on initial render
                  onChange={(e) => handleTargetChange(speaker.id, e)}
                  placeholder={speaker.avg_wpm.toFixed(0)} // Show original as placeholder
                  style={{ width: '80px', textAlign: 'right' }}
                  disabled={!canAdjust} // Disable input for visitors
                />
              </td>
              <td style={{ textAlign: 'center', padding: '0.5rem' }}>
                <button
                  onClick={() => handlePlayPreview(speaker.id)}
                  disabled={previewingSpeaker !== null} // Disable all previews while one is playing/loading
                  title={`Play 10s preview for ${speaker.id}`}
                  style={{ cursor: 'pointer', padding: '0.2rem 0.5rem' }}
                >
                  {previewingSpeaker === speaker.id ? 'Playing...' : '▶'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* Display quota message if needed */}
      {quotaMessage && <p style={{ color: 'orange', marginTop: '-0.5rem' }}>{quotaMessage}</p>}
      <button onClick={handleSubmit} disabled={isProcessingDisabled}>
        {isSubmitting ? 'Submitting...' : buttonText}
      </button>
      {/* TODO: Add Preview Button Functionality */}
    </div>
  );
};

export default SpeakerAdjuster;