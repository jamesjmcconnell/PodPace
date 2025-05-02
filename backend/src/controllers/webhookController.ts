import Stripe from 'stripe';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { jsonResponse, errorResponse } from '../../utils/responseUtils'; // Correct path
import { env } from '../config'; // Correct path

// Define status type locally if not moved to common
type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete' | 'incomplete_expired';

// --- Supabase Admin Client (Specific to this controller for now) ---
let supabaseAdmin: SupabaseClient | null = null;
function getSupabaseAdminClient(): SupabaseClient {
  if (supabaseAdmin) return supabaseAdmin;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
      throw new Error('[Ctrl:Webhook] Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars');
  }
  supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
       auth: { persistSession: false }
  });
  return supabaseAdmin;
}

// --- Stripe Config ---
const webhookSecret = env.STRIPE_WEBHOOK_SECRET;

// --- Webhook Handler Logic ---
const relevantEvents = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
]);

/**
 * Handles POST requests from Stripe webhooks.
 * Verifies the webhook signature and processes relevant subscription events
 * by updating the Supabase database.
 * @param req The incoming request object containing the raw body and signature header.
 * @returns A Response object indicating success (200 OK) or an error (400, 500).
 */
export async function handleStripeWebhook(req: Request): Promise<Response> {
    if (!webhookSecret) {
        console.error('[Ctrl:Webhook] Stripe webhook secret not configured.');
        return errorResponse('Webhook secret not configured', 500);
    }

    const signature = req.headers.get('stripe-signature');
    const rawBody = await req.text();

    let event: Stripe.Event;
    try {
        const tempStripe = new Stripe(env.STRIPE_SECRET_KEY || webhookSecret!, {
             apiVersion: '2025-03-31.basil' as any // Cast to any to bypass strict type check
        });
        event = tempStripe.webhooks.constructEvent(rawBody, signature!, webhookSecret!);
    } catch (err: any) {
        console.error(`[Ctrl:Webhook] Signature verification failed: ${err.message}`);
        return errorResponse(`Webhook Error: ${err.message}`, 400);
    }

    console.log(`[Ctrl:Webhook] Received Stripe event: ${event.type}`);

    if (relevantEvents.has(event.type)) {
        try {
            const subscription = event.data.object as Stripe.Subscription;
            const supabase = getSupabaseAdminClient();

            switch (event.type) {
                case 'customer.subscription.created':
                case 'customer.subscription.updated':
                    const upsertData = {
                        stripe_subscription_id: subscription.id,
                        stripe_customer_id: subscription.customer as string,
                        status: subscription.status as SubscriptionStatus,
                        current_period_end: new Date((subscription as any)?.current_period_end * 1000 || Date.now()).toISOString(),
                        updated_at: new Date().toISOString()
                    };
                    console.log('[Ctrl:Webhook] Upserting subscription:', subscription.id);
                    const { error: upsertError } = await supabase
                        .from('subscriptions')
                        .upsert(upsertData, { onConflict: 'stripe_subscription_id' });
                    if (upsertError) throw upsertError;
                    console.log('[Ctrl:Webhook] Upsert successful for:', subscription.id);
                    break;

                case 'customer.subscription.deleted':
                    console.log('[Ctrl:Webhook] Marking subscription canceled:', subscription.id);
                    const { error: deleteError } = await supabase
                        .from('subscriptions')
                        .update({ status: 'canceled' as SubscriptionStatus, updated_at: new Date().toISOString() })
                        .eq('stripe_subscription_id', subscription.id);
                    if (deleteError) throw deleteError;
                    console.log('[Ctrl:Webhook] Marked canceled for:', subscription.id);
                    break;
                default:
                    console.warn(`[Ctrl:Webhook] Unhandled relevant event: ${event.type}`);
            }
        } catch (error: any) {
            console.error(`[Ctrl:Webhook] Error processing event ${event.id}:`, error);
            return errorResponse(`Webhook processing error: ${error.message || 'Unknown error'}`, 500);
        }
    }

    return jsonResponse({ received: true });
}