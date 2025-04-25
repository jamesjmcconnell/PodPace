import React, { useEffect, useState, useRef } from 'react';

interface JobProgressProps {
  jobId: string;
  onStatusUpdate: (statusData: any) => void; // We expect the full status object
  currentStatus: string; // Pass current status to help decide when to stop polling
  getAuthHeaders: () => Record<string, string>; // Add prop type
}

const JobProgress: React.FC<JobProgressProps> = ({ jobId, onStatusUpdate, currentStatus, getAuthHeaders }) => {
  const [error, setError] = useState<string | null>(null);
  // Use ReturnType<typeof setInterval> for the correct interval ID type
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isFetching = useRef<boolean>(false); // Tracks if a fetch is currently in progress
  const [isPollingActive, setIsPollingActive] = useState<boolean>(false); // Controls the interval lifecycle

  const pollStatus = async () => {
    if (!jobId || isFetching.current) return; // Prevent overlap
    console.log(`[JobProgress] Attempting pollStatus for job: ${jobId}`);
    isFetching.current = true;
    setError(null); // Clear previous polling errors

    try {
      const apiUrl = '/api'; // Use relative path for Vite proxy
      console.log(`[JobProgress] Fetching: ${apiUrl}/status/${jobId}`);
      const response = await fetch(`${apiUrl}/status/${jobId}`, {
        headers: getAuthHeaders() // Use the passed function
      });
      const result = await response.json();
      console.log(`[JobProgress] Poll response OK: ${response.ok}, Status: ${response.status}`);

      if (!response.ok) {
        throw new Error(result.error || `Failed to fetch status (${response.status})`);
      }

      console.log(`[JobProgress] Calling onStatusUpdate with:`, result);
      onStatusUpdate(result);

    } catch (err: any) {
      console.error('Polling error:', err);
      setError(`Failed to get job status: ${err.message}`);
      // Consider stopping polling after several consecutive errors?
    } finally {
        console.log(`[JobProgress] pollStatus finished.`);
        isFetching.current = false;
    }
  };

  // Effect 1: Decide if polling should be active based on props
  useEffect(() => {
    console.log(`[JobProgress E1] Check polling state. JobID: ${jobId}, Status: ${currentStatus}`);
    const terminalStates = ['READY_FOR_INPUT', 'COMPLETE', 'FAILED'];
    if (jobId && !terminalStates.includes(currentStatus)) {
      console.log(`[JobProgress E1] Setting polling active`);
      setIsPollingActive(true);
    } else {
      console.log(`[JobProgress E1] Setting polling inactive`);
      setIsPollingActive(false);
    }
  }, [jobId, currentStatus]);

  // Effect 2: Manage the interval based on the active state
  useEffect(() => {
    if (isPollingActive) {
      console.log('[JobProgress E2] Polling is active. Starting interval.');

      // Poll immediately when activated
      pollStatus();

      // Clear any existing interval before setting a new one
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }

      intervalRef.current = setInterval(() => {
        // Check isFetching ref inside interval to prevent overlap
        if (!isFetching.current) {
           console.log(`[JobProgress E2] Interval triggering pollStatus.`);
           pollStatus();
        } else {
           console.log(`[JobProgress E2] Interval skipped poll: already fetching.`);
        }
      }, 3000); // Poll every 3 seconds

      // Cleanup for this effect: clear interval when polling becomes inactive
      return () => {
        console.log('[JobProgress E2] Cleanup: Clearing interval because polling is stopping.');
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    } else {
      // Ensure interval is cleared if polling becomes inactive
      console.log('[JobProgress E2] Polling is inactive. Clearing interval if exists.');
       if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
    }
  }, [isPollingActive]); // Only depends on the active state

  // Simple display while polling
  return (
    <div>
      <p>Processing Job: {jobId}</p>
      <p>Status: {currentStatus}...</p>
      {isPollingActive && <span>(Polling...)</span>}
      {error && <p style={{ color: 'orange' }}>Polling Error: {error}</p>}
    </div>
  );
};

export default JobProgress;