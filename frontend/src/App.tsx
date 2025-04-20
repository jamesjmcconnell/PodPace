import { useState } from 'react'
import './App.css'
// Import component files
import FileUpload from './components/FileUpload'
import JobProgress from './components/JobProgress'
import SpeakerAdjuster from './components/SpeakerAdjuster'
import DownloadArea from './components/DownloadArea'
import ErrorMessage from './components/ErrorMessage'
import SearchBar from './components/SearchBar'

// Import frontend interfaces from the correct relative path
import type { SpeakerWPM, JobStatus, PodcastFeed } from './interfaces'



// Define types for our state
interface SpeakerInfo {
  id: string;
  avg_wpm: number;
}

function App() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus>('IDLE');
  const [speakerData, setSpeakerData] = useState<SpeakerInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false); // For initial upload indication
  const [outputFilename, setOutputFilename] = useState<string | null>(null); // To construct download URL
  const [mode, setMode] = useState<'UPLOAD' | 'SEARCH'>('UPLOAD'); // just tossing this in for now incase we want to keep the upload workflow
  const [feeds, setFeeds] = useState<PodcastFeed[]>([]);

  // --- Handler Functions (to be passed to components) ---

  // Example: To be called by FileUpload on successful upload
  const handleUploadSuccess = (newJobId: string) => {
    setJobId(newJobId);
    setJobStatus('PROCESSING_UPLOAD_CLOUD'); // Initial status after upload accepted
    setError(null);
    setSpeakerData([]);
    setIsLoading(false);
    setOutputFilename(null);
    // Start polling for status (will be added in JobProgress component)
  };

  // Example: To be called by FileUpload on upload failure
  const handleUploadError = (errorMessage: string) => {
    setError(errorMessage);
    setJobStatus('FAILED');
    setIsLoading(false);
  };

  // Example: To be called by JobProgress when status updates
  const handleStatusUpdate = (statusUpdate: any) => { // Type this based on actual API response
    setJobStatus(statusUpdate.status as JobStatus); // Assuming API returns status field
    if (statusUpdate.status === 'READY_FOR_INPUT' && statusUpdate.speakers) {
      // Attempt to parse speakers if it's a string, otherwise use directly
      try {
          const speakers = typeof statusUpdate.speakers === 'string'
            ? JSON.parse(statusUpdate.speakers)
            : statusUpdate.speakers;
          if (Array.isArray(speakers)) {
             setSpeakerData(speakers);
          }
      } catch (e) {
          console.error("Failed to parse speaker data:", e);
          setError('Failed to parse speaker data from backend.');
          setJobStatus('FAILED');
      }
    }
    if (statusUpdate.status === 'FAILED' && statusUpdate.error) {
      setError(statusUpdate.error);
    }
     if (statusUpdate.status === 'COMPLETE' && statusUpdate.outputFilePath) {
       // Extract filename for download link construction
       setOutputFilename(statusUpdate.outputFilePath.split('/').pop() || null);
     }
  };

  // Handler for when adjustment is submitted
  const handleAdjustmentSubmit = () => {
    setJobStatus('QUEUED_FOR_ADJUSTMENT');
    setError(null);
    setSpeakerData([]); // Clear old data
    // Polling should continue/restart
  };

  // Function to reset the state for a new job
  const handleReset = () => {
    setJobId(null);
    setJobStatus('IDLE');
    setSpeakerData([]);
    setError(null);
    setIsLoading(false);
    setOutputFilename(null);
  };

  const handlePodcastSearch = async (query: string) => {
    try {
        setError(null);
        setIsLoading(true);
        const apiUrl = '/api';
        const res = await fetch (`${apiUrl}/podcasts/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setFeeds(data.feeds);
    } catch (e: any) {
        setError(e.message);
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <div className="App">
      <h1>PodPace - Speech Normalizer</h1>
      
      <div>
        <button
            onClick={() => setMode('UPLOAD')}
            className={mode === 'UPLOAD' ? 'active-tab' : ''}
        >
            Upload Audio
        </button>

        <button
            onClick={() => setMode('SEARCH')}
            className={mode === 'SEARCH' ? 'active-tab' : ''}
        >
            Search Podcasts
        </button>
      </div>

      <ErrorMessage message={error} />


      
      {mode === 'UPLOAD' && jobStatus === 'IDLE' && (
        // Render FileUpload component when idle
        <FileUpload
          onUploadSuccess={handleUploadSuccess}
          onUploadError={handleUploadError}
          setIsLoading={setIsLoading}
        />
      )}

      {mode === 'SEARCH' && (
        <div>
        <SearchBar onSearch={handlePodcastSearch}/>
        {feeds.length > 0 && (
            <pre style={{ textAlign: 'left', whitespace: 'pre-wrap' }}>
                {JSON.stringify(feeds, null, 2)}
            </pre>
        )}
        </div>
      )}

      {isLoading && jobStatus !== 'FAILED' && <p>Uploading...</p>}

      {jobId &&
        !['IDLE', 'FAILED', 'READY_FOR_INPUT', 'COMPLETE'].includes(jobStatus) && (
          // Show JobProgress component while processing
          <JobProgress
            jobId={jobId}
            currentStatus={jobStatus}
            onStatusUpdate={handleStatusUpdate}
          />
      )}

      {jobStatus === 'READY_FOR_INPUT' && speakerData.length > 0 && (
        // Render SpeakerAdjuster component when ready for input
        <SpeakerAdjuster
            jobId={jobId!}
            speakerData={speakerData}
            onSubmit={handleAdjustmentSubmit}
            onError={handleUploadError}
        />
      )}

      {jobStatus === 'COMPLETE' && jobId && outputFilename && (
        // Render DownloadArea component when complete
        <DownloadArea
            jobId={jobId}
            outputFilename={outputFilename}
        />
      )}

      {/* Optionally show a reset button if failed or complete */}
      {(jobStatus === 'FAILED' || jobStatus === 'COMPLETE') && (
          <button onClick={handleReset}>Start New Job</button>
      )}

    </div>
  );
}

export default App
