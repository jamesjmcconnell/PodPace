import Redis from 'ioredis';
import { jsonResponse, errorResponse } from '../../utils/responseUtils'; // Correct path
import { env } from '../config'; // Correct path
// Import the Podcast Index client library type if you have one, or use 'any'
// Example: import { PodcastIndexClient } from 'podcastdx';

const PODCAST_INDEX_API_KEY = env.PODCAST_INDEX_API_KEY;
const PODCAST_INDEX_API_SECRET = env.PODCAST_INDEX_API_SECRET;

// --- Podcast Search Handler ---
export async function handlePodcastSearch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const query = url.searchParams.get('q');
    if (!query) {
        return errorResponse('Missing search query parameter "q"', 400);
    }

    console.log(`[Ctrl:Podcast] Searching for: ${query}`);

    try {
        // Replace with actual Podcast Index API call logic
        // Example using a hypothetical client:
        // const client = new PodcastIndexClient({ key: PODCAST_INDEX_API_KEY, secret: PODCAST_INDEX_API_SECRET });
        // const results = await client.search(query);

        // --- MOCK RESPONSE (replace with actual API call) ---
        const mockResults = {
            feeds: [
                { feedId: 123, title: 'Podcast Example 1', description: 'Desc 1', image: 'img1.jpg' },
                { feedId: 456, title: 'Another Pod', description: 'Desc 2', image: 'img2.png' },
            ]
        };
        await new Promise(resolve => setTimeout(resolve, 300)); // Simulate network delay
        const results = mockResults;
        // --- END MOCK ---

        return jsonResponse(results);

    } catch (error: any) {
        console.error(`[Ctrl:Podcast] Podcast search failed for query "${query}":`, error);
        return errorResponse(`Podcast search failed: ${error.message}`, 500);
    }
}

// --- Podcast Episodes Handler ---
export async function handlePodcastEpisodes(req: Request, redisConnection: Redis): Promise<Response> {
    // Note: Passing redisConnection explicitly here. Could be refactored later to use imported singleton.
    const url = new URL(req.url);
    const feedId = url.searchParams.get('feedId');
    const max = parseInt(url.searchParams.get('max') || '20', 10);
    const since = url.searchParams.get('since'); // Optional timestamp for pagination

    if (!feedId) {
        return errorResponse('Missing feedId parameter', 400);
    }

    console.log(`[Ctrl:Podcast] Fetching episodes for feed: ${feedId}, max: ${max}, since: ${since}`);

    try {
        // Replace with actual Podcast Index API call logic for episodes by feed ID
        // Example using hypothetical client:
        // const client = new PodcastIndexClient({ key: PODCAST_INDEX_API_KEY, secret: PODCAST_INDEX_API_SECRET });
        // const results = await client.episodesByFeedId(feedId, { max, since });

        // --- MOCK RESPONSE (replace with actual API call) ---
        let episodeCounter = Date.now();
        const createMockEpisode = (idOffset: number) => ({
             id: (parseInt(feedId) * 100) + idOffset,
             title: `Episode ${idOffset} for Feed ${feedId}`,
             datePublished: Math.floor((episodeCounter - idOffset * 86400000)/1000), // Timestamp in seconds
             datePublishedPretty: new Date(episodeCounter - idOffset * 86400000).toLocaleDateString(),
             audioUrl: `https://example.com/feed${feedId}/ep${idOffset}.mp3`
        });

        const mockEpisodes = [];
        const startNum = since ? Math.max(1, 20 - (Math.floor((Date.now() - parseInt(since)*1000)/86400000)) ) : 1;
        for (let i = startNum; i < startNum + max; i++) {
            mockEpisodes.push(createMockEpisode(i));
        }

        await new Promise(resolve => setTimeout(resolve, 400)); // Simulate delay
        const results = { episodes: mockEpisodes };
        // --- END MOCK ---

        return jsonResponse(results);

    } catch (error: any) {
        console.error(`[Ctrl:Podcast] Failed fetching episodes for feed ${feedId}:`, error);
        return errorResponse(`Failed to fetch episodes: ${error.message}`, 500);
    }
}