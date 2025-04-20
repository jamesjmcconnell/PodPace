import { useState } from 'react'
import './App.css'
// Import component files
import FileUpload from './components/FileUpload'
import JobProgress from './components/JobProgress'
import SpeakerAdjuster from './components/SpeakerAdjuster'
import DownloadArea from './components/DownloadArea'
import ErrorMessage from './components/ErrorMessage'
import SearchBar from './components/SearchBar'
import FeedList from './components/FeedList'
import EpisodeList from './components/EpisodeList'

// Import frontend interfaces from the correct relative path
import type { SpeakerWPM, JobStatus, PodcastFeed, PodcastEpisode } from './interfaces'



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
  const [selectedFeed, setSelectedFeed] = useState<PodcastFeed | null>(null);
  const [episodes, setEpisodes] = useState<PodcastEpisode[]>([]);
  const [selectedEpisode, setSelectedEpisode] = useState<PodcastEpisode|null>(null);

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
    setSelectedEpisode(null);
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
        if (!res.ok) throw new Error(`Search failed (${res.status})`);
        const data = await res.json();

        // remapping feedId -> id for frontend and consistency. or, should we just use feedId and update FE logic...?
        const feeds: PodcastFeed[] = data.feeds.map((f: any) => ({
            id: f.feedId || f.id,
            title: f.title,
            description: f.description,
            image: f.image,
        }));
        console.log('[handlePodcastSearch] Mapped feeds:', feeds);
        setFeeds(feeds);
    } catch (e: any) {
        setError(e.message);
    } finally {
        setIsLoading(false);
    }
  };

  const handleFeedSelect = async (feed: PodcastFeed) => {
    try {
        setSelectedFeed(feed);
        setError(null);
        setIsLoading(true);
        const apiUrl = '/api';
        const res = await fetch(`${apiUrl}/podcasts/episodes?feedId=${encodeURIComponent(feed.id)}`);
        if (!res.ok) throw new Error(`Episode load failed (${res.status})`);
        const data = await res.json();
        console.log('[handleFeedSelect] got episodes', data.episodes);
        setEpisodes(data.episodes);
    } catch (e: any) {
        setError(e.message);
    } finally {
        setIsLoading(false);
    }
  };

  const handleEpisodeSelect = async (ep: PodcastEpisode) => {
    try {
        setError(null);
        setIsLoading(true);
        setSelectedEpisode(ep);
        const audioResp = await fetch(ep.audioUrl);
        if (!audioResp.ok) throw new Error(`Failed to download audio (${audioResp.status})`);
        const blob = await audioResp.blob();

        const form = new FormData();
        const safeTitle = ep.title.replace(/[^a-z0-9]/gi, '_');
        form.append('audioFile', blob, `${safeTitle}.mp3`);

        const apiUrl = '/api';
        const uploadRes = await fetch(`${apiUrl}/upload`, {
            method: 'POST',
            body: form,
        });
        const result = await uploadRes.json();
        handleUploadSuccess(result.job_id);
        setSelectedFeed(null);
        setFeeds([]);
        setEpisodes([]);
        setMode('UPLOAD');
    } catch (e: any) {
        setError(e.message);
    } finally {
        setIsLoading(false);
    }
  }

    return (
      <div className="App">
        <h1>PodPace – Speech Normalizer</h1>
        <ErrorMessage message={error} />
        {isLoading && jobStatus !== 'FAILED' && <p>Uploading…</p>}

        { /* === NOTHING IN FLIGHT: show Upload vs Search === */ }
        {jobStatus === 'IDLE' ? (
          <>
            <div className="mode-toggle">
              <button
                className={mode === 'UPLOAD' ? 'active-tab' : ''}
                onClick={() => setMode('UPLOAD')}
              >
                Upload Audio
              </button>
              <button
                className={mode === 'SEARCH' ? 'active-tab' : ''}
                onClick={() => setMode('SEARCH')}
              >
                Search Podcasts
              </button>
            </div>

            {mode === 'UPLOAD' && (
              <FileUpload
                onUploadSuccess={handleUploadSuccess}
                onUploadError={handleUploadError}
                setIsLoading={setIsLoading}
              />
            )}

            {mode === 'SEARCH' && (
              <>
                <SearchBar onSearch={handlePodcastSearch} />
                <FeedList feeds={feeds} onSelect={handleFeedSelect} />
                {selectedFeed && (
                  <>
                    <h3>Episodes for “{selectedFeed.title}”</h3>
                    <EpisodeList
                      episodes={episodes}
                      onSelectEpisode={handleEpisodeSelect}
                    />
                  </>
                )}
              </>
            )}
          </>
        ) : (
          <>
            {/* Show the selected episode title */}
            {selectedEpisode && (
              <h3 style={{ margin: '1rem 0' }}>
                Processing episode: “{selectedEpisode.title}”
              </h3>
            )}

            <JobProgress
              jobId={jobId!}
              currentStatus={jobStatus}
              onStatusUpdate={handleStatusUpdate}
            />

            {jobStatus === 'READY_FOR_INPUT' && speakerData.length > 0 && (
              <SpeakerAdjuster
                jobId={jobId!}
                speakerData={speakerData}
                onSubmit={handleAdjustmentSubmit}
                onError={handleUploadError}
              />
            )}

            {/* Final download area with completed title */}
            {jobStatus === 'COMPLETE' && jobId && outputFilename && (
              <>
                {selectedEpisode && (
                  <h3 style={{ margin: '1rem 0' }}>
                    Finished: “{selectedEpisode.title}”
                  </h3>
                )}
                <DownloadArea jobId={jobId} outputFilename={outputFilename} />
              </>
            )}

            {(jobStatus === 'FAILED' || jobStatus === 'COMPLETE') && (
              <button onClick={handleReset}>Start New Job</button>
            )}
          </>
        )}
      </div>
    );
}

export default App
