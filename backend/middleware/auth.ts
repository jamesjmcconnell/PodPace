import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { User } from '@supabase/supabase-js'; // Use type-only import for User

let supabase: SupabaseClient | null = null;

// Initialize Supabase client for backend usage
const getSupabaseBackendClient = (): SupabaseClient => {
    if (supabase) {
        return supabase;
    }
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
        console.error('[AuthMiddleware] Missing Supabase ENV VARS for backend client!');
        // In a real scenario, this might be a fatal error preventing startup
        // but for now, we rely on runtime checks.
        throw new Error('Supabase backend client configuration missing.');
    }

    console.log('[AuthMiddleware] Initializing Supabase backend client.');
    supabase = createClient(supabaseUrl, supabaseAnonKey, {
         // It's crucial to prevent the backend client from storing sessions
         auth: { persistSession: false }
    });
    return supabase;
};

/**
 * Verifies the JWT from the Authorization header.
 * Returns the authenticated User object or null if verification fails.
 */
export const verifyAuth = async (req: Request): Promise<User | null> => {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.warn('[AuthMiddleware] Missing or invalid Authorization header.');
        return null;
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
        console.warn('[AuthMiddleware] Token missing after Bearer.');
        return null;
    }

    try {
        const client = getSupabaseBackendClient();
        const { data: { user }, error } = await client.auth.getUser(token);

        if (error) {
            console.warn(`[AuthMiddleware] Token verification error: ${error.message}`);
            return null;
        }
        if (!user) {
             console.warn('[AuthMiddleware] Token valid but no user found.');
             return null;
        }

        console.log(`[AuthMiddleware] User verified: ${user.id} (${user.email})`);
        return user;
    } catch (error: any) {
        console.error('[AuthMiddleware] Exception during token verification:', error);
        return null;
    }
};