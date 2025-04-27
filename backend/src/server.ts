import { env } from './config'; // Import validated env
import { mainRouter } from './router'; // Import the main router function
// import { errorHandler } from './middleware/errorHandler'; // Import error handler (when created)

console.log('[Server] Initializing...');

const serverOptions = {
    port: env.API_PORT,
    maxRequestBodySize: 500 * 1024 * 1024, // Keep large body size for uploads

    async fetch(req: Request): Promise<Response> {
        try {
            // Pass the request to the main router
            return await mainRouter(req);
        } catch (error: any) {
            console.error("[Server] Unhandled fetch error:", error);
            // TODO: Integrate centralized error handler middleware later
            // return errorHandler(error, req);
            // Basic fallback error response for now
            return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    },

    error(error: Error): Response {
        // This handles errors *outside* the fetch handler (e.g., during startup?)
        console.error("[Server] Bun internal error:", error);
        // TODO: Integrate centralized error handler middleware later
        // return errorHandler(error);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    },
};

const server = Bun.serve(serverOptions);
console.log(`🚀 Server running at http://${server.hostname}:${server.port}`);

// Export the server instance if needed elsewhere (e.g., for graceful shutdown)
export { server };