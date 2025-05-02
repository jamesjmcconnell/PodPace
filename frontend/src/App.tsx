import { useState, useEffect } from 'react'
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
import LoginPage from './pages/LoginPage'
import AudioPlayer from './components/AudioPlayer'
import { useAuth } from './context/AuthContext'
import Banner from './components/Banner'
// Import shared types using alias
import type { JobStatus, PodcastFeed, PodcastEpisode, UserRole, QuotaInfo } from '~/common/types'

// Define types for our state
interface SpeakerInfo {
  id: string;
  avg_wpm: number;
}

/**
 * Main React component for the podcast processing application, managing authentication, podcast search, audio upload, episode browsing, job processing, and file download flows.
 *
 * Handles user authentication state, UI mode switching, podcast and episode selection, audio upload, job status tracking, speaker adjustment, and secure file downloads. Integrates with multiple child components and manages all relevant application state and error handling.
 *
 * @returns The rendered podcast processing application UI.
 */
function App() {
  // Get auth state from context
  const { session, user, loading: authLoading, signOut } = useAuth();

  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus>('IDLE');
  const [speakerData, setSpeakerData] = useState<SpeakerInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false); // For initial upload indication
  const [outputFilename, setOutputFilename] = useState<string | null>(null); // To construct download URL
  const [mode, setMode] = useState<'UPLOAD' | 'SEARCH'>('SEARCH'); // Change default mode to SEARCH
  const [feeds, setFeeds] = useState<PodcastFeed[]>([]);
  const [selectedFeed, setSelectedFeed] = useState<PodcastFeed | null>(null);
  const [episodes, setEpisodes] = useState<PodcastEpisode[]>([]);
  const [isLoadingEpisodes, setIsLoadingEpisodes] = useState<boolean>(false);
  const [hasMoreEpisodes, setHasMoreEpisodes] = useState<boolean>(false);
  const [lastEpisodeTimestamp, setLastEpisodeTimestamp] = useState<number | null>(null);
  const EPISODE_PAGE_SIZE = 20; // How many episodes to fetch per batch
  const [showWelcomeMessage, setShowWelcomeMessage] = useState<boolean>(true);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [quotaStatus, setQuotaStatus] = useState<QuotaInfo | null>(null);
  const [selectingEpisodeId, setSelectingEpisodeId] = useState<string | null>(null);
  const [processingEpisodeTitle, setProcessingEpisodeTitle] = useState<string | null>(null);

  // Helper function to get auth headers
  const getAuthHeaders = (): Record<string, string> => {
    const token = session?.access_token;
    if (!token) {
      console.warn('No session token available for API request');
      return {};
    }
    return { 'Authorization': `Bearer ${token}` };
  };

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
  const handleStatusUpdate = (statusUpdate: any) => {
    console.log('[App] Received status update:', statusUpdate);
    setJobStatus(statusUpdate.status as JobStatus);

    // --- Update Role and Quota State ---
    if (statusUpdate.role) {
        setUserRole(statusUpdate.role as UserRole);
    }
    if (statusUpdate.quota) {
        setQuotaStatus(statusUpdate.quota as QuotaInfo);
    }
    // Clear role/quota if they disappear from status (e.g., user logs out mid-poll?)
    if (!statusUpdate.role) setUserRole(null);
    if (!statusUpdate.quota) setQuotaStatus(null);
    // ------------------------------------

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
    setSelectedFeed(null);
    setEpisodes([]);
    setError(null);
    setIsLoading(false);
    setOutputFilename(null);
    setProcessingEpisodeTitle(null);
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
    // Guard clause (no changes needed here)
    if (!selectedFeed || isLoadingEpisodes || !hasMoreEpisodes || lastEpisodeTimestamp === null) {
        console.log(`[loadMoreEpisodes] Skipping: isLoading=${isLoadingEpisodes}, hasMore=${hasMoreEpisodes}, feed=${!!selectedFeed}, since=${lastEpisodeTimestamp}`);
        return;
    }

    console.log(`[loadMoreEpisodes] START: Setting isLoadingEpisodes=true. Since: ${lastEpisodeTimestamp}`);
    setIsLoadingEpisodes(true);
    setError(null);

    try {
        // --- Fetching ---
        const apiUrl = '/api';
        const res = await fetch(`${apiUrl}/podcasts/episodes?feedId=${encodeURIComponent(selectedFeed.id)}&max=${EPISODE_PAGE_SIZE}&since=${lastEpisodeTimestamp}`);
        if (!res.ok) {
            const errorData = await res.json().catch(() => ({ error: `Load more failed (${res.status})` }));
            throw new Error(errorData.error || `Load more failed (${res.status})`);
        }
        const data = await res.json();
        console.log('[loadMoreEpisodes] API call finished. Items received:', data.episodes?.length || 0);

        const newEpisodes: PodcastEpisode[] = (data.episodes || []).map((ep: any) => ({
            id: String(ep.id),
            title: ep.title,
            datePublished: parseInt(ep.datePublished, 10),
            datePublishedPretty: ep.datePublishedPretty,
            audioUrl: ep.audioUrl,
        }));

        // --- Processing & State Update ---
        // Get the current list *before* updating
        const currentEpisodes = episodes;
        const combined = [...currentEpisodes, ...newEpisodes];

        // Deduplicate
        const episodeMap = new Map<string, PodcastEpisode>();
        combined.forEach(ep => {
            episodeMap.set(ep.id, ep);
        });
        const uniqueEpisodes = Array.from(episodeMap.values());
        console.log(`[loadMoreEpisodes] Combined: ${combined.length}, Unique: ${uniqueEpisodes.length}`);

        // Determine if new content was actually added after deduplication
        const newContentAdded = uniqueEpisodes.length > currentEpisodes.length;
        const moreEpisodesMightExist = newEpisodes.length > 0; // API returned something

        // Update state *once* with the final list
        setEpisodes(uniqueEpisodes);
        console.log(`[loadMoreEpisodes] setEpisodes called with ${uniqueEpisodes.length} unique episodes.`);

        // Update pagination state based on whether new unique content was added
        // and whether the API indicated more might exist (by returning items)
        const nextHasMore = newContentAdded && moreEpisodesMightExist;
        console.log(`[loadMoreEpisodes] Updating hasMoreEpisodes to: ${nextHasMore}`);
        setHasMoreEpisodes(nextHasMore);

        // Update timestamp only if new unique content was added and more might exist
        if (nextHasMore && uniqueEpisodes.length > 0) {
           const newTimestamp = uniqueEpisodes[uniqueEpisodes.length - 1].datePublished;
           console.log(`[loadMoreEpisodes] Updating lastEpisodeTimestamp to: ${newTimestamp}`);
           setLastEpisodeTimestamp(newTimestamp);
        } else {
            console.log(`[loadMoreEpisodes] Not updating lastEpisodeTimestamp.`);
        }

    } catch (e: any) {
        console.error('[loadMoreEpisodes] Error caught:', e);
        setError(e.message);
        setHasMoreEpisodes(false); // Stop trying on error
    } finally {
        console.log('[loadMoreEpisodes] FINALLY: Setting isLoadingEpisodes=false.');
        setIsLoadingEpisodes(false);
    }
  };

  const handleEpisodeSelect = async (ep: PodcastEpisode) => {
    setSelectingEpisodeId(ep.id);
    setError(null);
    setProcessingEpisodeTitle(ep.title);

    try {
      // Keep track of the selected episode locally within the function scope
      const currentSelectedEpisode = ep;
      console.log(`[App] Selected episode: ${currentSelectedEpisode.title} (ID: ${currentSelectedEpisode.id})`);

      // Fetch audio via backend proxy to avoid CORS
      console.log(`[App] Requesting proxy for audio: ${ep.audioUrl}`);
      const proxyUrl = `/api/proxy/audio?url=${encodeURIComponent(ep.audioUrl)}`;
      const audioResp = await fetch(proxyUrl);

      if (!audioResp.ok) {
          // Try to get error message from proxy if possible
          const errorText = await audioResp.text().catch(() => `Proxy fetch failed with status ${audioResp.status}`);
          console.error(`[App] Proxy fetch failed: ${audioResp.status}`, errorText);
          // Attempt to parse JSON, fallback to text
          let errorMessage = `Proxy fetch failed (${audioResp.status})`;
          try {
              const errorJson = JSON.parse(errorText);
              if (errorJson.error) errorMessage = errorJson.error;
          } catch { /* Ignore JSON parse error */ }
          throw new Error(errorMessage);
      }
      console.log(`[App] Proxy fetch successful, getting blob.`);
      const blob = await audioResp.blob();

      // Proceed with upload using the blob from the proxy
      const form = new FormData();
      const safeTitle = ep.title.replace(/[^a-z0-9]/gi, '_');
      form.append('audioFile', blob, `${safeTitle}.mp3`);

      const apiUrl = '/api';
      console.log('[App] Uploading blob from proxy...');
      const uploadRes = await fetch(`${apiUrl}/upload`, {
          method: 'POST',
          headers: {
              ...getAuthHeaders()
          },
          body: form,
      });
      if (!uploadRes.ok) {
          const errorData = await uploadRes.json().catch(() => ({ error: `Upload failed (${uploadRes.status})` }));
          throw new Error(errorData.error || `Upload failed (${uploadRes.status})`);
      }
      const result = await uploadRes.json();
      console.log('[App] Upload successful after proxy.');
      handleUploadSuccess(result.job_id);
      setSelectedFeed(null);
      setFeeds([]);
      setEpisodes([]);
      setMode('UPLOAD');
    } catch (e: any) {
        console.error('[App] Error during episode selection/upload:', e);
        setError(e.message);
        setProcessingEpisodeTitle(null);
    } finally {
        setSelectingEpisodeId(null);
    }
  }

  // Add handler to go back from episodes view to feed search view
  const handleGoBackToSearch = () => {
    setSelectedFeed(null);
    setEpisodes([]);
    // Optionally clear search results (feeds) too if desired
    // setFeeds([]);
  };

  // Handler to dismiss welcome message
  const handleDismissWelcome = () => {
    setShowWelcomeMessage(false);
  };

  // Add header to adjustment submit (inside SpeakerAdjuster component)
  // We'll need to modify SpeakerAdjuster.tsx as well.

  // Add header to status polling (inside JobProgress component)
  // We'll need to modify JobProgress.tsx as well.

  // Add header to download link (can't directly add to <a>, needs alternative)
  // The download route is GET /api/download/:jobId
  // Easiest way is to fetch the blob via JS and create an object URL

  const handleDownloadClick = async () => {
    if (!jobId || !outputFilename) return;
    setIsLoading(true); // Use general loading state for download prep
    setError(null);
    try {
      const apiUrl = `/api/download/${jobId}`;
      const response = await fetch(apiUrl, {
        headers: getAuthHeaders()
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `Download failed (${response.status})` }));
        throw new Error(errorData.error || `Download failed (${response.status})`);
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = outputFilename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (e: any) {
        setError(`Download failed: ${e.message}`);
    } finally {
        setIsLoading(false);
    }
  };

  // --- Auth State Handling ---
  useEffect(() => {
    // Reset app state on logout, including role/quota
    if (!authLoading && !session) {
        console.log('[App] User logged out, resetting app state.');
        handleReset();
        setUserRole(null); // Clear role on logout
        setQuotaStatus(null); // Clear quota on logout
    }
  }, [session, authLoading]);

  // Show loading indicator while checking auth state
  if (authLoading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Checking authentication...</div>;
  }

  // If no session, show Login Page
  if (!session) {
    return <LoginPage />;
  }

  // --- User is Logged In - Render Main App UI ---
  return (
      <div className="App">
        {/* Fixed Logout Button */}
        <button onClick={signOut} style={styles.fixedLogoutButton}>
          Logout
        </button>

        {/* Header - No longer contains welcome message */}
        <header style={styles.header}>
          {/* Can place other header items here if needed */}
          <span>&nbsp;</span> {/* Placeholder or remove header if totally empty */}
        </header>

        <ErrorMessage message={error} />
        {/* --- Quota/Status Banners --- */}
        {userRole === 'FREE' && quotaStatus && (
            <>
                {quotaStatus.analysis.remaining <= 1 && quotaStatus.analysis.remaining > 0 && (
                     <Banner
                        message={`Analysis quota low: ${quotaStatus.analysis.remaining} remaining today.`}
                        type="warning"
                     />
                )}
                 {quotaStatus.analysis.remaining <= 0 && (
                     <Banner
                        message={`Daily analysis limit (${quotaStatus.analysis.limit}/day) reached. Upgrade for unlimited.`}
                        type="error"
                     />
                )}
                {/* Adjustment quota message is handled inside SpeakerAdjuster for now */}
            </>
        )}
        {/* ------------------------- */}

        {/* Loading indicators */}
        {isLoadingEpisodes && episodes.length === 0 && <p>Loading Episodes…</p>}
        {isLoading && jobStatus !== 'FAILED' && episodes.length === 0 && !isLoadingEpisodes && <p>Uploading…</p>}

        {/* --- Idle State Rendering --- */}
        {jobStatus === 'IDLE' && (
          <>
            {/* --- Initial View (No Feed Selected) --- */}
            {!selectedFeed && (
              <>
                {/* Title */}
                <h1 style={styles.mainTitle}>
                  Pod<span style={{ color: 'var(--accent)' }}>Pace</span>
                </h1>

                {/* Welcome Message (Keep this one) */}
                {showWelcomeMessage && (
                    <div style={styles.welcomeMessageContainer}>
                        <span>Welcome, {user?.email || 'User'}!</span>
                        <button onClick={handleDismissWelcome} style={styles.closeButton}>&times;</button>
                    </div>
                )}

                {/* Analysis Quota Check for Episode Selection */}
                {(userRole === 'FREE' && quotaStatus?.analysis.remaining === 0) && (
                    <p style={{color: 'orange'}}>Daily analysis limit reached.</p>
                )}

                <div className="mode-toggle">
                  <button
                    className={mode === 'SEARCH' ? 'active-tab' : ''}
                    onClick={() => setMode('SEARCH')}
                  >
                    Search Podcasts
                  </button>
                  <button
                    className={mode === 'UPLOAD' ? 'active-tab' : ''}
                    onClick={() => setMode('UPLOAD')}
                  >
                    Upload Audio
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
                  onSelectEpisode={ (userRole === 'FREE' && (quotaStatus?.analysis?.remaining ?? 0) <= 0) ? () => {} : handleEpisodeSelect }
                  isLoading={isLoadingEpisodes}
                  hasMore={hasMoreEpisodes}
                  onLoadMore={loadMoreEpisodes}
                  selectingEpisodeId={selectingEpisodeId}
                />
              </>
            )}
          </>
        )}

        {/* --- Active Job State Rendering --- */}
        {jobStatus !== 'IDLE' && (
          <>
            {/* Show the stored processing episode title */}
            {processingEpisodeTitle && (
              <h3 style={{ margin: '1rem 0' }}>
                Processing episode: "{processingEpisodeTitle}"
              </h3>
            )}

            <JobProgress
              jobId={jobId!}
              currentStatus={jobStatus}
              onStatusUpdate={handleStatusUpdate}
              getAuthHeaders={getAuthHeaders}
            />

            {jobStatus === 'READY_FOR_INPUT' && speakerData.length > 0 && (
              <SpeakerAdjuster
                jobId={jobId!}
                speakerData={speakerData}
                onSubmit={handleAdjustmentSubmit}
                onError={handleUploadError}
                getAuthHeaders={getAuthHeaders}
                userRole={userRole}
                quotaStatus={quotaStatus}
              />
            )}

            {/* Final download area with completed title */}
            {jobStatus === 'COMPLETE' && jobId && outputFilename && (
              <>
                {processingEpisodeTitle && (
                  <h3 style={{ margin: '1rem 0' }}>
                    Finished: "{processingEpisodeTitle}"
                  </h3>
                )}
                <DownloadArea
                  outputFilename={outputFilename}
                  onDownload={handleDownloadClick}
                />
                <AudioPlayer
                  jobId={jobId}
                  getAuthHeaders={getAuthHeaders}
                  className="audio-player-complete" // Add a class for potential styling
                />
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

// Styles
const styles: { [key: string]: React.CSSProperties } = {
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0.5rem 1rem',
        marginBottom: '1rem',
        // background: 'var(--bg-secondary)', // Optional: Remove background if header is empty
        minHeight: '30px' // Ensure header takes some space even if empty
    },
    fixedLogoutButton: {
        position: 'fixed',
        top: '1rem',
        right: '1rem',
        zIndex: 1000, // Ensure it's above other content
        padding: '0.5rem 1rem',
        borderRadius: '4px',
        border: '1px solid var(--border)',
        background: 'var(--bg-secondary-opaque, rgba(30, 30, 30, 0.8))', // Semi-transparent background
        color: 'var(--text-primary)',
        cursor: 'pointer',
        boxShadow: '0 2px 5px rgba(0,0,0,0.2)' // Optional shadow for better visibility
    },
    welcomeMessageContainer: {
        textAlign: 'center',
        marginBottom: '1.5rem',
        fontSize: '1.1rem',
        padding: '0.8rem 1rem',
        background: 'var(--bg-secondary)',
        borderRadius: '6px',
        border: '1px solid var(--border)',
        position: 'relative', // Needed for absolute positioning of close button
        display: 'flex', // Use flex to align text and button
        justifyContent: 'center', // Center content horizontally
        alignItems: 'center' // Center content vertically
    },
    closeButton: {
        position: 'absolute',
        top: '0.3rem',
        right: '0.5rem',
        background: 'none',
        border: 'none',
        color: 'var(--text-muted)',
        fontSize: '1.5rem',
        lineHeight: '1',
        padding: '0.2rem 0.4rem',
        cursor: 'pointer'
    },
    mainTitle: {
      marginBottom: '2rem', // Add some space below title
      fontWeight: 700 // Use heading font weight
    }
};

export default App
