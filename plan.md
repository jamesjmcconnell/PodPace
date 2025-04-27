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
- **Gating Analysis Start (`/api/upload` or similar):**
  *   This endpoint **must now require authentication**.
  *   If `role === PAID`: Allow analysis start.
  *   If `role === FREE`: Check **Analysis Quota** (e.g., 3/day). If quota available, allow and increment `quota:analysis:free:<user_id>:<YYYY-MM-DD>`. If not, return 403 Forbidden.
  *   If `role === VISITOR`: Deny analysis start (must log in/sign up).
- **Gating Adjustment (`/api/jobs/{id}/adjust`):**
  *   Requires authentication (existing).
  *   If `role === PAID`: Allow adjustment.
  *   If `role === FREE`: Check **Adjustment Quota** (1/day). If quota available, allow and increment `quota:adjust:free:<user_id>:<YYYY-MM-DD>`. If not, return 403 Forbidden.
- **Gating Download (`/api/jobs/{id}/download`):**
  *   Requires authentication (existing).
  *   Allow only if the job was successfully adjusted (i.e., gating passed at the `/adjust` step).
- **Quota Tracking:** Use separate Redis keys:
  *   `quota:analysis:free:<user_id>:<YYYY-MM-DD>` (Limit: e.g., 3, TTL: ~25h)
  *   `quota:adjust:free:<user_id>:<YYYY-MM-DD>` (Limit: 1, TTL: ~25h)
- **Subscription Re-check:** Gated endpoints re-fetch subscription status on each call.
- **Quota Reset Time:** Midnight UTC daily.
- **Frontend Display:** Fetch relevant quota statuses. Show messages like "Analyses remaining today: X/3" or "Daily adjustment used". Disable relevant buttons (Select Episode, Process Adjustments) based on quota and role.

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
| POST `/api/upload` *(or similar)* | **Required** | Start analysis job (**Add Role & Analysis Quota Check**) |
| GET  `/api/status/{id}` | Any | Poll status |
| POST `/api/jobs/{id}/adjust` | **Required** | Request modification (**Add Role & Adjustment Quota Check**) |
| GET  `/api/jobs/{id}/download` | **Required** | Download file (**Verify user processed this job**) |
| GET  `/api/user/status` | Required | Get user role (Free/Paid) & quota statuses |
| POST `/api/webhooks/stripe` | **None** (Verify signature) | Update subscription status from Stripe |
| *(Deferred)* | ... | *Endpoints for checkout, billing portal, etc.* |

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
1.  **Implement DB Table:** Create `subscriptions` table (Done).
2.  **Implement Stripe Webhook:** Set up `/api/webhooks/stripe` handler (Done).
3.  **Implement Role Check:** Add backend logic to check `subscriptions` table & determine role (Done).
4.  **Implement Quota Tracking & Enforcement:**
    *   Add Redis logic for **both** `analysis` (limit 3) and `adjustment` (limit 1) quotas.
    *   Add enforcement to `/api/upload` (analysis quota) and `/api/jobs/{id}/adjust` (adjustment quota) based on role.
5.  **Implement Frontend Gating UI:** Modify frontend to fetch role/quota statuses, conditionally enable/disable features (episode selection, adjustment processing), display appropriate banners/messages.
6.  **Testing:** Thoroughly test webhook handling, role determination, *both* quota logics, and frontend UI states.
7.  *[Deferred: Building UI for paid features]*

---

## 11. Security & Compliance Additions
- **Webhook Security:** Verify Stripe webhook signatures.
- Rate-limit anonymous search.
- Ensure compliance terms are clear about free tier limits.

---

## 12. Open Questions
*(Updated)*
1.  **Preview Implementation:** Add endpoint `GET /api/jobs/{id}/preview?speaker_id=...&sec=10` that returns a pre-generated or on-the-fly 10-second clip.
2.  **Quota Reset Strategy:** decided = midnight UTC; revisit only if needed.
3.  **Confirm endpoint paths** (upload vs. jobs/new) – clarify with current backend code.