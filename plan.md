# PodPace v2 – Updated Development Plan (Focus: Gating Infrastructure)

## 0. Purpose of this document
This plan outlines the next steps focusing on implementing the infrastructure for **feature gating** based on user status: **anonymous visitor**, **logged-in free user**, or **paid subscriber**. This includes handling the daily free quota and integrating with a payment provider (Stripe) to track subscription status.

It assumes **existing Supabase authentication** is functional. It **defers** the full implementation of paid-only features (e.g., podcast subscriptions, extended history) but includes the necessary backend setup (webhooks, subscription status tracking) to enable gating them later.

---

## 1. Product Overview & Personas (Gating Focus)
| Persona | Gating | Capabilities (Immediate Focus) |
|---------|--------|--------------------------------|
| **Visitor (anonymous)** | `!auth` | • Search, see preview UI (inputs disabled) |
| **Free Account (user)** | `auth && !subscriptionActive` | • All Visitor features <br> • Process 1 ep/day (quota check) <br> • Download processed file |
| **Paid Subscriber** | `auth && subscriptionActive` | • All Free features <br> • Unlimited processing (bypass quota) |
| *[Deferred Features]* | | *[Podcast Subscriptions, Profile/History/Prefs UI, Priority Queue etc.]* |

---

## 2. High-Level User Flow (Gating Focus)
*(Largely unchanged from previous version, highlights gating checks)*
1. **Landing (/):** Auth CTAs present.
2. **Search & Episode Select:** Unrestricted.
3. **Processing Screen:**
   • Shows progress.
   • **Adjustment UI** appears.
   • Behaviour gated by Auth & Subscription Status:
     ✦ Visitor: Preview only.
     ✦ Free: Inputs enabled, "Process" button active only if quota OK.
     ✦ Paid: Inputs enabled, "Process" button always active (shows "Unlimited").
4. **Job Complete:** Download link shown only if processing was allowed (Free w/ quota or Paid).

---

## 3. Feature Gating & Quota Logic (Core Implementation)
- **Identify User & Subscription Status:** Backend middleware uses `verifyAuth` (existing) and checks the `subscriptions` table (see Data Model) to determine if the user has an active subscription.
  ```
  user = await verifyAuth(req);
  isActive = user ? await checkSubscriptionStatus(user.id) : false;
  role = !user ? VISITOR : (isActive ? PAID : FREE);
  ```
- **Gating Adjustment/Download:** Endpoints (`/api/jobs/{id}/adjust`, `/api/jobs/{id}/download`) require auth.
- **Quota Check (Backend - within `/adjust`):**
    *   If `role === PAID`: **Skip** quota check, allow processing.
    *   If `role === FREE`:
        *   Check Redis/DB for `quota:free:<user_id>:<YYYY-MM-DD>`.
        *   If `count < 1`: Allow processing, increment quota count, proceed.
        *   If `count >= 1`: Return 403 Forbidden ("Daily free limit reached. Upgrade for unlimited processing.").
- **Quota Tracking:** Redis key `quota:free:<user_id>:<YYYY-MM-DD>` with ~25h expiry (as before).
- **Frontend Display:** Fetch user role/quota status. Conditionally enable/disable buttons, show relevant banners (`QuotaBanner`, `UpgradeBanner`).

---

## 4. Data Model (Focus on Gating Needs)
- **Supabase Auth:** Provides `users` table implicitly.
- **`subscriptions` (New Table - PostgreSQL/Supabase DB):**
  `id` (PK), `user_id` (FK to auth.users), `stripe_customer_id`, `stripe_subscription_id`, `status` (e.g., 'active', 'canceled', 'past_due'), `current_period_end` (Timestamp), `created_at`, `updated_at`.
- **Redis:** For ephemeral daily quota tracking.
- *[Deferred: jobs, adjustments, preferences, listens tables unless strictly needed for MVP gating]*

---

## 5. Authentication & Authorisation
- **Provider:** Supabase Auth (existing).
- **Verification:** Backend uses `verifyAuth` middleware (existing).

---

## 6. Payments (Infrastructure Setup)
- **Provider:** Stripe Checkout + Billing Portal.
- **Goal:** Track subscription `status` accurately in our `subscriptions` table.
- **Implementation:**
    *   Set up Stripe products/prices.
    *   Implement **Stripe Webhook Handler** (`POST /api/webhooks/stripe`): Listens for events like `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`. Updates the `status` and `current_period_end` in our `subscriptions` table accordingly.
    *   **(Optional Now, Needed Later):** Add endpoints/logic to initiate Stripe Checkout sessions and redirect to the Billing Portal.
- *[Deferred: UI for managing subscription/billing]*

---

## 7. API Surface (Focus on Gating)
| Method & Path | Auth | Purpose |
|---------------|------|---------|
| *(Existing Auth Endpoints)* | ... | ... |
| POST `/api/upload` *(or similar)* | Optional | Start analysis job |
| GET  `/api/status/{id}` | Any | Poll status |
| POST `/api/jobs/{id}/adjust` | **Required** | Request modification (**Add Role & Quota Check Logic**) |
| GET  `/api/jobs/{id}/download` | **Required** | Download file (**Verify user processed this job**) |
| GET  `/api/user/status` | Required | Get user role (Free/Paid) & quota status |
| POST `/api/webhooks/stripe` | **None** (Verify signature) | Update subscription status from Stripe |
| *(Deferred)* | ... | *Endpoints for checkout, billing portal, creating podcast subscriptions* |

---

## 8. Frontend (React/Bun)
Component changes:
- **Modify `SpeakerAdjuster.tsx`:** Check `user.role` (Free/Paid) and `user.quotaAvailable`. Conditionally enable/disable inputs & processing button. Show appropriate messaging ("Process (1 free credit remaining)", "Process (Unlimited)", "Upgrade to Process").
- **Add `QuotaBanner`/`UpgradeBanner.tsx`:** Show based on role/quota.
- **Modify `Header`:** Show auth state, potentially basic account status.
- *[Deferred: ProfilePage, Subscription Management UI etc.]*

---

## 9. Background Jobs (BullMQ)
- Existing workers handle core audio processing (Managed by other dev).
- *[Deferred: subscriptionWorker]*

---

## 10. Dev Milestones (Revised Focus on Gating Infrastructure)
1.  **Implement DB Table:** Create the `subscriptions` table in PostgreSQL (Supabase DB).
2.  **Implement Stripe Webhook:** Set up the `/api/webhooks/stripe` endpoint to listen for subscription events and update the `subscriptions` table.
3.  **Implement Role Check:** Modify backend middleware/logic to check `subscriptions` table status and determine user role (Free/Paid).
4.  **Implement Quota Tracking & Enforcement:** Add Redis logic for daily free quota; update `/api/jobs/{id}/adjust` to enforce quota based on role.
5.  **Implement Frontend Gating UI:** Modify frontend to fetch user role/quota, conditionally enable/disable features, and display appropriate banners/messages.
6.  **Testing:** Thoroughly test webhook handling, role determination, quota logic, and frontend UI states.
7.  *[Deferred: Building UI for paid features like subscription management]*

---

## 11. Security & Compliance Additions
- **Webhook Security:** Verify Stripe webhook signatures.
- Rate-limit anonymous search.
- Ensure compliance terms are clear about free tier limits.

---

## 12. Open Questions
*(Unchanged)*
1.  Preview Implementation details?
2.  Quota Reset timing (UTC vs. rolling)?
3.  Confirm exact existing endpoint paths?