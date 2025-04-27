import { jsonResponse, errorResponse } from '../../utils/responseUtils'; // Correct path

// --- Audio Proxy Handler ---
export async function handleAudioProxy(req: Request): Promise<Response> {
    const urlParam = new URL(req.url).searchParams.get('url');
    if (!urlParam) {
        return errorResponse('Missing target URL parameter', 400);
    }

    let targetUrl: URL;
    try {
        targetUrl = new URL(urlParam);
    } catch (e) {
        return errorResponse('Invalid target URL parameter', 400);
    }

    console.log(`[Ctrl:Proxy] Fetching: ${targetUrl.toString()}`);

    try {
        const externalResponse = await fetch(targetUrl.toString(), {
            headers: { 'User-Agent': 'PodPaceProxy/1.0' }
        });

        if (!externalResponse.ok) {
            console.error(`[Ctrl:Proxy] Error fetching ${targetUrl}: ${externalResponse.status} ${externalResponse.statusText}`);
            // Try to forward the error message if possible
            const errorBody = await externalResponse.text().catch(() => `status ${externalResponse.status}`);
            return errorResponse(`Failed to fetch external audio: ${errorBody}`, externalResponse.status > 0 ? externalResponse.status : 502);
        }

        const responseHeaders = new Headers({
            'Access-Control-Allow-Origin': '*',
            'Content-Type': externalResponse.headers.get('Content-Type') || 'application/octet-stream',
        });
        const contentLength = externalResponse.headers.get('Content-Length');
        if (contentLength) {
            responseHeaders.set('Content-Length', contentLength);
        }

        return new Response(externalResponse.body, {
            status: externalResponse.status,
            headers: responseHeaders
        });

    } catch (error: any) {
        console.error(`[Ctrl:Proxy] Network error fetching ${targetUrl}:`, error);
        return errorResponse(`Proxy failed: ${error.message}`, 502); // Bad Gateway
    }
}