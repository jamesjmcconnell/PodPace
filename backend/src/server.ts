import { env } from './config'; // Import validated env
import { mainRouter } from './router'; // Import the main router function
import { errorHandler } from './middleware/errorHandler'; // Import the error handler

console.log('[Server] Initializing...');

const serverOptions = {
    port: env.API_PORT,
    maxRequestBodySize: 500 * 1024 * 1024, // Keep large body size for uploads

    async fetch(req: Request): Promise<Response> {
        try {
            // Pass the request to the main router
            return await mainRouter(req);
        } catch (error: any) {
            // Use the centralized error handler
            console.error("[Server] Unhandled fetch error passed to handler:", error);
            return errorHandler(error, req);
        }
    },

    error(error: Error): Response {
        // Use the centralized error handler for Bun internal errors too
        console.error("[Server] Bun internal error passed to handler:", error);
        return errorHandler(error);
    },
};

const server = Bun.serve(serverOptions);
console.log(`🚀 Server running at http://${server.hostname}:${server.port}`);

// Export the server instance if needed elsewhere (e.g., for graceful shutdown)
export { server };