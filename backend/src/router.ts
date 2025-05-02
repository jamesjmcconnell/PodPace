import { jsonResponse, errorResponse } from '../utils/responseUtils';
import * as jobController from './controllers/jobController';
import * as uploadController from './controllers/uploadController';
import * as podcastController from './controllers/podcastController';
import * as webhookController from './controllers/webhookController';
import * as proxyController from './controllers/proxyController';
import { verifyAuth } from '../middleware/auth';
import { getUserRole } from '../middleware/role';
import type { User } from '@supabase/supabase-js';
import type { UserRole } from '~/common/types';
import Redis from 'ioredis'; // Needed for podcast episodes handler temporary solution
import { validateBody, AppError } from './middleware/validator';
import { z } from 'zod';

// Define the main router function type
type RouterFunction = (req: Request) => Promise<Response>;

// --- Zod Schemas ---
const adjustBodySchema = z.object({
    targets: z.array(z.object({
        id: z.string(),
        target_wpm: z.number().int().min(50).max(400) // Example validation
    })).min(1) // Require at least one target
});

export const mainRouter: RouterFunction = async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const pathSegments = url.pathname.split('/').filter(Boolean);
    const method = req.method;

    console.log(`[Router] Request: ${method} ${url.pathname}`);

    // Handle CORS preflight requests globally here
    if (method === 'OPTIONS') {
        return new Response(null, {
            status: 204, // No Content
            headers: {
                'Access-Control-Allow-Origin': '*', // Adjust for production
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', // Add PUT, DELETE etc. as needed
                'Access-Control-Allow-Headers': 'Content-Type, Authorization', // Add other headers like Authorization
                'Access-Control-Max-Age': '86400', // Cache preflight response for 1 day
            }
        });
    }

    // --- Route Matching ---

    // Public: /
    if (url.pathname === '/' && method === 'GET') {
         return jsonResponse({ status: 'ok' });
    }
    // Public: /api/podcasts/*
    if (pathSegments[0] === 'api' && pathSegments[1] === 'podcasts') {
        if (pathSegments[2] === 'search' && method === 'GET') {
            return podcastController.handlePodcastSearch(req);
        }
        if (pathSegments[2] === 'episodes' && method === 'GET') {
             const { redis } = await import('./lib/redis'); // Temporary direct import
            return podcastController.handlePodcastEpisodes(req, redis);
        }
        // Fall through to 404 if no podcast sub-route matches
    }
    // Public: /api/proxy/audio
    if (url.pathname === '/api/proxy/audio' && method === 'GET') {
        return proxyController.handleAudioProxy(req);
    }
    // Public: /api/webhooks/stripe
    if (url.pathname === '/api/webhooks/stripe' && method === 'POST') {
        return webhookController.handleStripeWebhook(req);
    }

    // Protected: /api/upload
    if (pathSegments[0] === 'api' && pathSegments[1] === 'upload' && method === 'POST') {
        const user = await verifyAuth(req);
        if (!user) return errorResponse('Unauthorized', 401);
        const role = await getUserRole(user);
        // Quota check is inside handleUpload controller for analysis
        return uploadController.handleUpload(req, user, role);
    }

    // Protected: /api/jobs/*
    if (pathSegments[0] === 'api' && pathSegments[1] === 'jobs' && pathSegments[2]) {
        const jobId = pathSegments[2];
        const action = pathSegments[3];

        // Auth needs to happen before controller logic that uses user/role
        const user = await verifyAuth(req);
        if (!user) return errorResponse('Unauthorized', 401);
        const role = await getUserRole(user);
        console.log(`[Router] Auth OK for /api/jobs: User ${user.id}, Role ${role}`);

        // GET /api/jobs/:jobId/status
        if (action === 'status' && method === 'GET') {
            return jobController.handleStatus(req, { jobId });
        }
        // POST /api/jobs/:jobId/adjust
        if (action === 'adjust' && method === 'POST') {
            // ** 1. Validate Body **
            const validatedBody = await validateBody(adjustBodySchema)(req);
            // If validation failed, validateBody throws, caught by server error handler

            // ** 2. Check Quota **
             if (role === 'FREE') {
                 const { checkAndIncrementAdjustmentQuota } = await import('../utils/quotaUtils');
                 const quotaAllowed = await checkAndIncrementAdjustmentQuota(user.id);
                 if (!quotaAllowed) {
                     // Throw an AppError for the handler to catch
                     throw new AppError('Daily free adjustment limit reached.', 403);
                 }
             }

            // ** 3. Call Controller **
            // Pass validated body to controller if needed (or modify controller later)
            // For now, controller re-parses, but validation already happened.
            return jobController.handleAdjust(req, { jobId }); // Pass original req for now
        }
        // GET /api/jobs/:jobId/download
        if (action === 'download' && method === 'GET') {
            return jobController.handleDownload(req, { jobId });
        }
        // GET /api/jobs/:jobId/preview/:speakerId
         if (action === 'preview' && pathSegments[4] && method === 'GET') {
             const speakerId = pathSegments[4];
             return jobController.handlePreview(req, { jobId, speakerId });
         }
        // Fall through to 404 if action doesn't match known job actions
    }

    // --- Default Not Found ---
    console.warn(`[Router] No route matched for ${method} ${url.pathname}`);
    return errorResponse('Not Found', 404);
};