// routes/podcasts.ts

const API_BASE = 'https://api.podcastindex.org/api/1.0';
const API_KEY = process.env.PODCAST_INDEX_API_KEY!;
const API_SECRET = process.env.PODCAST_INDEX_API_SECRET!;
// Log length for debugging .env parsing
console.log(`[Startup] Read API_SECRET with length: ${API_SECRET?.length ?? 'undefined'}`);

async function getAuthHeaders(): Promise<Record<string, string>> {
  if (!API_KEY || !API_SECRET) {
    console.error('[AuthHeaders] Missing API_KEY or API_SECRET', { API_KEY: !!API_KEY, API_SECRET: !!API_SECRET });
    throw new Error('PodcastIndex API credentials are not set');
  }
  const now = Date.now();
  const ts = Math.floor(now / 1000).toString();
  console.log(`[AuthHeaders] Current time perceived by Bun: ${new Date(now).toISOString()} (UTC)`);
  console.log('[AuthHeaders] Unix Timestamp (seconds): ', ts);
  const encoder = new TextEncoder();
  // --- TEMPORARY DEBUG LOGGING - REMOVE AFTER USE ---
  // console.log(`[AuthHeaders DEBUG] Hashing: KEY=[${API_KEY}] SECRET=[${API_SECRET}] TS=[${ts}]`);
  // --- END TEMPORARY DEBUG LOGGING ---
  const dataToHash = encoder.encode(API_KEY + API_SECRET + ts);
  // Use global crypto; ignore TS error as Bun provides crypto.subtle at runtime
  // @ts-ignore
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-1', dataToHash);
  const signature = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  console.log('[AuthHeaders] Signature:', signature);
  return {
    'User-Agent':    'PodPace/1.0',
    'X-Auth-Key':    API_KEY,
    'X-Auth-Date':   ts,
    'Authorization': signature,
  };
}

// Define simple interfaces for expected API responses
interface PodcastIndexSearchResponse {
  feeds?: { id: number; title: string; description: string; image: string }[];
  // Add other fields if needed
}

interface PodcastIndexEpisodesResponse {
  items?: { id: number; title: string; enclosureUrl: string; datePublished: number; datePublishedPretty: string; duration: number }[];
  // Add other fields if needed
}

/**
 * Handles GET /api/podcasts/search?q=TERM
 */
export async function handlePodcastSearch(req: Request): Promise<Response> {
  console.log('[PodcastSearch] Request:', req.method, req.url);
  const url = new URL(req.url);
  const q   = (url.searchParams.get('q') || '').trim();
  if (!q) {
    console.warn('[PodcastSearch] Missing query parameter q');
    return new Response(JSON.stringify({ error: 'Missing "q" parameter.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  console.log('[PodcastSearch] Query:', q);

  try {
    const apiUrl = `${API_BASE}/search/byterm?${new URLSearchParams({ q })}`;
    console.log('[PodcastSearch] Calling API:', apiUrl);
    const headers = await getAuthHeaders();
    const resp = await fetch(apiUrl, { headers });
    console.log('[PodcastSearch] API status:', resp.status);
    if (!resp.ok) throw new Error(`PodcastIndex search failed: ${resp.status}`);
    const searchData = await resp.json() as PodcastIndexSearchResponse;
    const feeds = (searchData.feeds || []).map((f: any) => ({
      feedId:      f.id,
      title:       f.title,
      description: f.description,
      image:       f.image,
    }));
    console.log('[PodcastSearch] Feeds count:', feeds.length);
    return new Response(JSON.stringify({ feeds }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    console.error('[PodcastSearch] Error:', err);
    return new Response(JSON.stringify({ error: 'Podcast search error.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Handles GET /api/podcasts/episodes?feedId=ID[&max=NUM][&since=TIMESTAMP]
 */
export async function handlePodcastEpisodes(req: Request): Promise<Response> {
  console.log('[PodcastEpisodes] Request:', req.method, req.url);
  const url    = new URL(req.url);
  const feedId = (url.searchParams.get('feedId') || '').trim();
  const max    = url.searchParams.get('max') || '20'; // Default to fetching 20 episodes
  const since  = url.searchParams.get('since'); // Optional timestamp for pagination

  if (!feedId) {
    console.warn('[PodcastEpisodes] Missing query parameter feedId');
    return new Response(JSON.stringify({ error: 'Missing "feedId" parameter.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  console.log(`[PodcastEpisodes] Feed ID: ${feedId}, Max: ${max}${since ? ", Since: "+since : ""}`);

  try {
    const params: Record<string, string> = { id: feedId, max };
    if (since) {
      params.since = since;
    }

    const apiUrl = `${API_BASE}/episodes/byfeedid?${new URLSearchParams(params)}`;
    console.log('[PodcastEpisodes] Calling API:', apiUrl);
    const headers = await getAuthHeaders();
    const resp    = await fetch(apiUrl, { headers });
    console.log('[PodcastEpisodes] API status:', resp.status);

    if (!resp.ok) {
         const errorText = await resp.text(); // Get error details from API
         console.error('[PodcastEpisodes] API Error Text:', errorText);
         throw new Error(`PodcastIndex episodes failed: ${resp.status} - ${errorText}`);
    }

    // Add 'count' to the response interface definition
    const episodesData = await resp.json() as PodcastIndexEpisodesResponse & { count?: number };

    const episodes = (episodesData.items || []).map((i) => ({
      id:        i.id,
      title:     i.title,
      audioUrl:  i.enclosureUrl,
      datePublished: i.datePublished, // Keep original timestamp
      datePublishedPretty: i.datePublishedPretty, // Use the pretty string
      duration:  i.duration,
    }));

    const count = episodesData.count ?? episodes.length; // Use count from response, fallback to array length
    console.log(`[PodcastEpisodes] Fetched: ${episodes.length}, API Count: ${count}`);

    // Return episodes and the count
    return new Response(JSON.stringify({ episodes, count }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    console.error('[PodcastEpisodes] Error:', err);
    return new Response(JSON.stringify({ error: 'Episodes fetch error.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
