import Stripe from 'stripe';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
// import type { Database } from '../database.types'; // Use 'any' for now if types aren't generated
// import { subscription_status_enum } from '../database.types';

type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete' | 'incomplete_expired';

// --- Supabase Admin Client (Similar to role.ts, could be shared) ---
let supabaseAdmin: SupabaseClient | null = null;
function getSupabaseAdminClient(): SupabaseClient {
  if (supabaseAdmin) return supabaseAdmin;
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) {
      throw new Error('Webhook: Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars');
  }
  supabaseAdmin = createClient(url, serviceKey, { auth: { persistSession: false } });
  return supabaseAdmin;
}

// --- Stripe Client ---
// Ensure STRIPE_SECRET_KEY is set if you need to make API calls *to* Stripe
// For webhooks only, we primarily need the webhook secret below.
// const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' });


// --- Webhook Handler Logic ---
const relevantEvents = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  // Add other events if needed, e.g., payment_failed, invoice.paid
]);

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
if (!webhookSecret) {
    console.error("Stripe webhook secret (STRIPE_WEBHOOK_SECRET) is not set. Webhook cannot be verified.");
    // Consider throwing an error here to prevent startup if webhooks are critical
}

export async function handleStripeWebhook(req: Request): Promise<Response> {
    if (!webhookSecret) {
        return new Response('Webhook secret not configured', { status: 500 });
    }

    const signature = req.headers.get('stripe-signature');
    const rawBody = await req.text(); // Get raw body for verification

    let event: Stripe.Event;
    try {
        // Need a valid secret key temporarily for constructEvent, even if it's just the webhook secret
        const tempStripe = new Stripe(process.env.STRIPE_SECRET_KEY || webhookSecret!, { apiVersion: '2024-06-20' });
        event = tempStripe.webhooks.constructEvent(rawBody, signature!, webhookSecret!);
    } catch (err: any) {
        console.error(`Webhook signature verification failed: ${err.message}`);
        return new Response(`Webhook Error: ${err.message}`, { status: 400 });
    }

    console.log(`Received Stripe event: ${event.type}`);

    if (relevantEvents.has(event.type)) {
        try {
            const subscription = event.data.object as Stripe.Subscription;
            const supabase = getSupabaseAdminClient();

            switch (event.type) {
                case 'customer.subscription.created':
                case 'customer.subscription.updated':
                    // We need the user_id to associate this subscription.
                    // This should ideally be set when the Checkout Session is created
                    // (e.g., in metadata or client_reference_id) and retrieved here.
                    // For now, we focus on UPDATING existing records based on stripe_subscription_id.
                    // The initial INSERT with user_id needs to happen elsewhere (e.g., after successful checkout).

                    const upsertData = {
                        stripe_subscription_id: subscription.id,
                        stripe_customer_id: subscription.customer as string,
                        status: subscription.status as SubscriptionStatus, // Cast to our manual type
                        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
                        updated_at: new Date().toISOString()
                        // user_id is NOT included here as we can't reliably get it from the event alone
                        // for *new* subscriptions without prior setup during checkout.
                    };

                    console.log('Upserting subscription data for:', subscription.id);
                    // Upsert based on the unique stripe_subscription_id.
                    // This will UPDATE existing rows or INSERT new ones (but potentially without user_id initially).
                    const { error: upsertError } = await supabase
                        .from('subscriptions')
                        .upsert(upsertData, { onConflict: 'stripe_subscription_id' });

                    if (upsertError) throw upsertError;
                    console.log('Subscription upserted successfully for:', subscription.id);
                    break;

                case 'customer.subscription.deleted':
                    // Update status to 'canceled' for the specific subscription
                    console.log('Updating subscription status to canceled for:', subscription.id);
                    const { error: deleteError } = await supabase
                        .from('subscriptions')
                        .update({
                            status: 'canceled' as SubscriptionStatus, // Cast status
                            updated_at: new Date().toISOString()
                         })
                        .eq('stripe_subscription_id', subscription.id);

                    if (deleteError) throw deleteError;
                    console.log('Subscription marked as canceled for:', subscription.id);
                    break;

                default:
                    console.warn(`Unhandled relevant event type: ${event.type}`);
            }
        } catch (error: any) {
            console.error(`Error processing webhook ${event.id}:`, error);
            // Optionally send notification to admin
            return new Response(`Webhook processing error: ${error.message || 'Unknown error'}`, { status: 500 });
        }
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 });
}