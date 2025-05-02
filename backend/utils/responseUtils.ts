import { env } from '../src/config'; // Assuming config.ts is in src/

/**
 * Creates a standardized JSON HTTP response.
 * Includes basic CORS headers suitable for local development.
 *
 * @param data The data payload to serialize as JSON.
 * @param status The HTTP status code (default: 200).
 * @param headers Optional additional headers to merge.
 * @returns A Response object.
 */
export function jsonResponse(data: any, status: number = 200, headers?: Record<string, string>): Response {
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

/**
 * Creates a standardized JSON error response using jsonResponse.
 *
 * @param message The error message string.
 * @param status The HTTP status code (default: 500).
 * @returns A Response object.
 */
export function errorResponse(message: string, status: number = 500): Response {
    console.error(`Returning error (${status}): ${message}`);
    return jsonResponse({ error: message }, status);
}