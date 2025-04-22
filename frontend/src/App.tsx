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
  // New state for episode loading and pagination
  const [isLoadingEpisodes, setIsLoadingEpisodes] = useState<boolean>(false);
  const [hasMoreEpisodes, setHasMoreEpisodes] = useState<boolean>(false);
  const [lastEpisodeTimestamp, setLastEpisodeTimestamp] = useState<number | null>(null);
  const EPISODE_PAGE_SIZE = 20; // How many episodes to fetch per batch

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
    setSelectedFeed(feed);
    setError(null);
    setEpisodes([]); // Clear previous episodes
    setHasMoreEpisodes(false); // Reset pagination state
    setLastEpisodeTimestamp(null);
    setIsLoadingEpisodes(true);

    try {
      const apiUrl = '/api';
      // Initial fetch (no 'since', use EPISODE_PAGE_SIZE for max)
      const res = await fetch(`${apiUrl}/podcasts/episodes?feedId=${encodeURIComponent(feed.id)}&max=${EPISODE_PAGE_SIZE}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: `Episode load failed (${res.status})` }));
        throw new Error(errorData.error || `Episode load failed (${res.status})`);
      }
      const data = await res.json();
      console.log('[handleFeedSelect] got episodes response:', data);

      const mappedEpisodes: PodcastEpisode[] = (data.episodes || []).map((ep: any) => ({
        id: String(ep.id), // Ensure ID is a string
        title: ep.title,
        datePublished: parseInt(ep.datePublished, 10), // Parse the timestamp as integer
        datePublishedPretty: ep.datePublishedPretty, // Map the pretty date string
        audioUrl: ep.audioUrl,
      }));

      setEpisodes(mappedEpisodes);

      // Update pagination state: More exist if we received any episodes
      setHasMoreEpisodes(mappedEpisodes.length > 0);
      if (mappedEpisodes.length > 0) {
        setLastEpisodeTimestamp(mappedEpisodes[mappedEpisodes.length - 1].datePublished);
      }

    } catch (e: any) {
      setError(e.message);
      setEpisodes([]); // Clear episodes on error
    } finally {
      setIsLoadingEpisodes(false);
    }
  };

  // Function to load the next batch of episodes
  const loadMoreEpisodes = async () => {
    if (!selectedFeed || isLoadingEpisodes || !hasMoreEpisodes || lastEpisodeTimestamp === null) {
        console.log('[loadMoreEpisodes] Skipping: Not ready or no more episodes.');
        return; // Don't load if already loading, no more pages, or initial load pending
    }

    console.log(`[loadMoreEpisodes] Loading more for feed ${selectedFeed.id} since ${lastEpisodeTimestamp}`);
    setIsLoadingEpisodes(true);
    setError(null); // Clear previous errors

    try {
        const apiUrl = '/api';
        const res = await fetch(`${apiUrl}/podcasts/episodes?feedId=${encodeURIComponent(selectedFeed.id)}&max=${EPISODE_PAGE_SIZE}&since=${lastEpisodeTimestamp}`);
        if (!res.ok) {
            const errorData = await res.json().catch(() => ({ error: `Load more failed (${res.status})` }));
            throw new Error(errorData.error || `Load more failed (${res.status})`);
        }
        const data = await res.json();
        console.log('[loadMoreEpisodes] got episodes response:', data);

        const newEpisodes: PodcastEpisode[] = (data.episodes || []).map((ep: any) => ({
          id: String(ep.id), // Ensure ID is a string
          title: ep.title,
          datePublished: parseInt(ep.datePublished, 10), // Parse the timestamp as integer
          datePublishedPretty: ep.datePublishedPretty, // Map the pretty date string
          audioUrl: ep.audioUrl,
        }));

        // Append new episodes to the existing list
        setEpisodes(prevEpisodes => [...prevEpisodes, ...newEpisodes]);

        // Update pagination state: More exist if the API returned new episodes
        setHasMoreEpisodes(newEpisodes.length > 0);
        if (newEpisodes.length > 0) {
           setLastEpisodeTimestamp(newEpisodes[newEpisodes.length - 1].datePublished);
        }

    } catch (e: any) {
        setError(e.message);
        setHasMoreEpisodes(false); // Stop trying on error
    } finally {
        setIsLoadingEpisodes(false);
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

  // Add handler to go back from episodes view to feed search view
  const handleGoBackToSearch = () => {
    setSelectedFeed(null);
    setEpisodes([]);
    // Optionally clear search results (feeds) too if desired
    // setFeeds([]);
  };

    return (
      <div className="App">
        <ErrorMessage message={error} />
        {/* Loading indicators */}
        {isLoadingEpisodes && episodes.length === 0 && <p>Loading Episodes…</p>}
        {isLoading && jobStatus !== 'FAILED' && episodes.length === 0 && !isLoadingEpisodes && <p>Uploading…</p>}

        {/* --- Idle State Rendering --- */}
        {jobStatus === 'IDLE' && (
          <>
            {/* --- Initial View (No Feed Selected) --- */}
            {!selectedFeed && (
              <>
                <h1>PodPace – Speech Normalizer</h1>
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
                  </>
                )}
              </>
            )}

            {/* --- Episode View (Feed Selected) --- */}
            {selectedFeed && (
              <>
                <button onClick={handleGoBackToSearch} style={{ marginBottom: '1rem' }}>
                  &larr; Back to Search
                </button>
                <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                   <img src={selectedFeed.image} alt={selectedFeed.title} style={{ height: '60px', width: '60px', borderRadius: '4px' }} />
                   <h3>Episodes for "{selectedFeed.title}"</h3>
                </div>
                <EpisodeList
                  episodes={episodes}
                  onSelectEpisode={handleEpisodeSelect}
                  isLoading={isLoadingEpisodes}
                  hasMore={hasMoreEpisodes}
                  onLoadMore={loadMoreEpisodes}
                />
              </>
            )}
          </>
        )}

        {/* --- Active Job State Rendering --- */}
        {jobStatus !== 'IDLE' && (
          <>
            {/* Show the selected episode title */}
            {selectedEpisode && (
              <h3 style={{ margin: '1rem 0' }}>
                Processing episode: "{selectedEpisode.title}"
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
                    Finished: "{selectedEpisode.title}"
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
