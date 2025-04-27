import { env } from '../src/config'; // Assuming config.ts is in src/

// Standard JSON response helper
export function jsonResponse(data: any, status: number = 200, headers?: Record<string, string>) {
    // Add CORS headers here or expect them to be added by a global middleware
    const defaultHeaders = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*', // Basic CORS for local dev
    };
    return new Response(JSON.stringify(data), {
        status: status,
        headers: { ...defaultHeaders, ...headers },
    });
}

// Standard Error response helper
export function errorResponse(message: string, status: number = 500) {
    console.error(`Returning error (${status}): ${message}`);
    return jsonResponse({ error: message }, status);
}