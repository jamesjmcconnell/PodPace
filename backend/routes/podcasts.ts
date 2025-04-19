// routes/podcasts.ts

const API_BASE = 'https://api.podcastindex.org/api/1.0';
const API_KEY = process.env.PODCAST_INDEX_API_KEY!;
const API_SECRET = process.env.PODCAST_INDEX_API_SECRET!;

async function getAuthHeaders(): Promise<Record<string, string>> {
  if (!API_KEY || !API_SECRET) {
    console.error('[AuthHeaders] Missing API_KEY or API_SECRET', { API_KEY: !!API_KEY, API_SECRET: !!API_SECRET });
    throw new Error('PodcastIndex API credentials are not set');
  }
  const ts = Math.floor(Date.now() / 1000).toString();
  console.log('[AuthHeaders] Timestamp:', ts);
  const encoder = new TextEncoder();
  const data = encoder.encode(API_KEY + API_SECRET + ts);
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
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
    const data = await resp.json();
    const feeds = (data.feeds || []).map((f: any) => ({
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
 * Handles GET /api/podcasts/episodes?feedId=ID
 */
export async function handlePodcastEpisodes(req: Request): Promise<Response> {
  console.log('[PodcastEpisodes] Request:', req.method, req.url);
  const url    = new URL(req.url);
  const feedId = (url.searchParams.get('feedId') || '').trim();
  if (!feedId) {
    console.warn('[PodcastEpisodes] Missing query parameter feedId');
    return new Response(JSON.stringify({ error: 'Missing "feedId" parameter.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  console.log('[PodcastEpisodes] Feed ID:', feedId);

  try {
    const apiUrl = `${API_BASE}/episodes/byfeedid?${new URLSearchParams({ id: feedId })}`;
    console.log('[PodcastEpisodes] Calling API:', apiUrl);
    const headers = await getAuthHeaders();
    const resp    = await fetch(apiUrl, { headers });
    console.log('[PodcastEpisodes] API status:', resp.status);
    if (!resp.ok) throw new Error(`PodcastIndex episodes failed: ${resp.status}`);
    const data = await resp.json();
    const episodes = (data.items || []).map((i: any) => ({
      episodeId: i.id,
      title:     i.title,
      audioUrl:  i.enclosureUrl,
      pubDate:   i.pubDate,
      duration:  i.duration,
    }));
    console.log('[PodcastEpisodes] Episodes count:', episodes.length);
    return new Response(JSON.stringify({ episodes }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    console.error('[PodcastEpisodes] Error:', err);
    return new Response(JSON.stringify({ error: 'Episodes fetch error.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
