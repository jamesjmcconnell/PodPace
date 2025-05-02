import Redis from 'ioredis';
import { jsonResponse, errorResponse } from '../../utils/responseUtils'; // Correct path
import { env } from '../config'; // Correct path
import crypto from 'node:crypto'; // Import crypto for hashing
// Import the Podcast Index client library type if you have one, or use 'any'
// Example: import { PodcastIndexClient } from 'podcastdx';

const PODCAST_INDEX_API_KEY = env.PODCAST_INDEX_API_KEY;
const PODCAST_INDEX_API_SECRET = env.PODCAST_INDEX_API_SECRET;
const PODCAST_INDEX_BASE_URL = 'https://api.podcastindex.org/api/1.0';

/**
 * Handles GET requests to search the Podcast Index API for podcasts by term.
 * @param req The incoming request object, expects 'q' query parameter.
 * @returns A Response object with search results or an error.
 */
export async function handlePodcastSearch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const query = url.searchParams.get('q');
    if (!query) {
        return errorResponse('Missing search query parameter "q"', 400);
    }

    console.log(`[Ctrl:Podcast] Searching Podcast Index for: ${query}`);

    try {
        // Prepare Podcast Index API headers
        const apiHeaderTime = Math.floor(Date.now() / 1000);
        const sha1 = crypto.createHash('sha1');
        const hash = sha1.update(PODCAST_INDEX_API_KEY + PODCAST_INDEX_API_SECRET + apiHeaderTime).digest('hex');

        const headers = {
            'User-Agent': 'PodPace/1.0',
            'X-Auth-Key': PODCAST_INDEX_API_KEY,
            'X-Auth-Date': String(apiHeaderTime),
            'Authorization': hash
        };

        // Make the actual API call
        const searchUrl = `${PODCAST_INDEX_BASE_URL}/search/byterm?q=${encodeURIComponent(query)}&pretty`; // Add pretty for easier debugging
        console.log(`[Ctrl:Podcast] Fetching: ${searchUrl}`);
        const response = await fetch(searchUrl, { headers });

        if (!response.ok) {
            const errorText = await response.text().catch(() => `Status ${response.status}`);
            console.error(`[Ctrl:Podcast] Podcast Index API error: ${response.status}`, errorText);
            throw new Error(`Podcast Index search failed: ${response.status}`);
        }

        const results: any = await response.json();

        // Map results if necessary (e.g., field renaming)
        // Assuming the API returns feeds with id, title, description, image
        const mappedResults = {
            feeds: results.feeds?.map((feed: any) => ({
                id: String(feed.id || feed.feedId), // Use id, fallback to feedId, ensure string
                title: feed.title,
                description: feed.description,
                image: feed.image || feed.artwork, // Use image, fallback to artwork
            })) || []
        };

        return jsonResponse(mappedResults);

    } catch (error: any) {
        console.error(`[Ctrl:Podcast] Podcast search failed for query "${query}":`, error);
        return errorResponse(`Podcast search failed: ${error.message}`, 500);
    }
}

/**
 * Handles GET requests to fetch podcast episodes by Feed ID from the Podcast Index API.
 * Supports basic pagination using 'max' and 'since' query parameters.
 * @param req The incoming request object, expects 'feedId', optional 'max', 'since'.
 * @param redisConnection A Redis client instance (currently passed directly).
 * @returns A Response object with the list of episodes or an error.
 */
export async function handlePodcastEpisodes(req: Request, redisConnection: Redis): Promise<Response> {
    const url = new URL(req.url);
    const feedId = url.searchParams.get('feedId');
    const maxStr = url.searchParams.get('max') || '20';
    const since = url.searchParams.get('since'); // Optional timestamp (string)

    if (!feedId) {
        return errorResponse('Missing feedId parameter', 400);
    }

    const max = parseInt(maxStr, 10);
    if (isNaN(max) || max <= 0) {
        return errorResponse('Invalid max parameter', 400);
    }

    console.log(`[Ctrl:Podcast] Fetching episodes for feed: ${feedId}, max: ${max}, since: ${since}`);

    try {
        // Prepare Podcast Index API headers (same as search)
        const apiHeaderTime = Math.floor(Date.now() / 1000);
        const sha1 = crypto.createHash('sha1');
        const hash = sha1.update(PODCAST_INDEX_API_KEY + PODCAST_INDEX_API_SECRET + apiHeaderTime).digest('hex');
        const headers = {
            'User-Agent': 'PodPace/1.0',
            'X-Auth-Key': PODCAST_INDEX_API_KEY,
            'X-Auth-Date': String(apiHeaderTime),
            'Authorization': hash
        };

        // Construct the API URL for episodes by feed ID
        let episodesUrl = `${PODCAST_INDEX_BASE_URL}/episodes/byfeedid?id=${encodeURIComponent(feedId)}&max=${max}&pretty`;
        if (since) {
            // Ensure 'since' is a valid number (Unix timestamp in seconds)
            const sinceTimestamp = parseInt(since, 10);
            if (!isNaN(sinceTimestamp)) {
                episodesUrl += `&since=${sinceTimestamp}`;
            } else {
                 console.warn(`[Ctrl:Podcast] Invalid 'since' parameter received: ${since}. Ignoring.`);
            }
        }

        console.log(`[Ctrl:Podcast] Fetching: ${episodesUrl}`);
        const response = await fetch(episodesUrl, { headers });

        if (!response.ok) {
            const errorText = await response.text().catch(() => `Status ${response.status}`);
            console.error(`[Ctrl:Podcast] Podcast Index API error fetching episodes: ${response.status}`, errorText);
            throw new Error(`Podcast Index episodes fetch failed: ${response.status}`);
        }

        const results: any = await response.json();

        // Map the results (assuming response has an 'items' array for episodes)
        const mappedEpisodes = (results.items || []).map((ep: any) => ({
            id: String(ep.id), // Ensure ID is string
            title: ep.title,
            datePublished: ep.datePublished, // API gives timestamp in seconds
            // Create pretty date string (optional, frontend can also do this)
            datePublishedPretty: new Date(ep.datePublished * 1000).toLocaleDateString(),
            audioUrl: ep.enclosureUrl, // Map enclosureUrl to audioUrl
            // Add other fields if needed, e.g., ep.duration
        }));

        return jsonResponse({ episodes: mappedEpisodes }); // Return the mapped episodes

    } catch (error: any) {
        console.error(`[Ctrl:Podcast] Failed fetching episodes for feed ${feedId}:`, error);
        return errorResponse(`Failed to fetch episodes: ${error.message}`, 500);
    }
}