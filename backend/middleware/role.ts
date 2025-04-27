import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { User } from '@supabase/supabase-js';

let supabaseAdmin: SupabaseClient | null = null;

function getSupabaseAdminClient(): SupabaseClient {
  if (supabaseAdmin) return supabaseAdmin;
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars');
  }
  supabaseAdmin = createClient(url, serviceKey, { auth: { persistSession: false } });
  return supabaseAdmin;
}

export type UserRole = 'VISITOR' | 'FREE' | 'PAID';

export async function getUserRole(user: User): Promise<UserRole> {
  // Query subscriptions table for active status
  try {
      const client = getSupabaseAdminClient();
      const { data, error } = await client
        .from('subscriptions')
        .select('status, current_period_end')
        .eq('user_id', user.id)
        .single();
      if (error) {
        // If no record, treat as FREE
        if (error.code === 'PGRST116') return 'FREE';
        console.error('[RoleCheck] DB error:', error);
        return 'FREE';
      }
      if (data && data.status === 'active') {
         // Basic active status check; could also check current_period_end
         return 'PAID';
      }
  } catch(err) {
      console.error('[RoleCheck] Exception while fetching subscription:', err);
  }
  return 'FREE';
}