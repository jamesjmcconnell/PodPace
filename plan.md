# PodPace v2 – Updated Development Plan

## 0. Purpose of this document
This plan incorporates the newly-defined product rules around **anonymous usage, account creation, daily free quotas, paid subscriptions, user profiles, and per-user preferences**.  It supersedes the previous plan.md.

---

## 1. Product Overview & Personas
| Persona | Capabilities |
|---------|--------------|
| **Visitor (anonymous)** | • Land on default search page
• Search any public podcast
• Choose an episode → backend immediately runs AssemblyAI analysis
• See the **Speaker Adjustment Preview** screen (hear 10-15 sec preview per speaker at adjustable WPM/volume)
• *Cannot* apply full-length modifications or download audio
• Prompted to **Sign-up for free** or **Login** |
| **Free Account (user)** | • All Visitor features
• Can fully process **1 episode / 24 h** (hard ceiling)
• Download adjusted audio (single file)
• Basic **History** tab (shows last 30 processed episodes)
• Can set global speed/volume defaults in **Profile**
• Upgrade CTA shown after quota consumed |
| **Paid Subscriber** | • Unlimited processing
• Can create **Podcast Subscriptions**: PodPace periodically fetches new episodes & auto-applies user defaults
• Private RSS feed per user for auto-processed episodes
• Extended History (all time)
• Priority queue
• Early feature access |

---

## 2. High-Level User Flow
1. **Landing (/)**
   • Header: logo + "Search podcasts" box
   • Top-right CTA: `Sign Up for Free` / `Login`
2. **Search & Episode Select**
   • Same for all personas
   • Selecting an episode triggers:
     `POST /api/jobs/new` → Backend kicks off AssemblyAI ingest
     Immediate redirect to **Processing Screen**
3. **Processing Screen**
   • Shows job progress via websockets/polling
   • Once analysis done → show **Adjustment UI**:
     – table of speakers + detected WPM/volume
     – sliders / inputs for desired WPM & volume
   • Behaviour depends on persona:
     ✦ Visitor: inputs disabled, play preview button only
     ✦ Free user: inputs enabled; "Process full episode" button enabled **if daily quota available**
     ✦ Paid: always enabled
4. **Job Complete**
   • Shows download link / RSS path
5. **Profile (/profile)**
   • Tabs: `History`, `Subscriptions`, `Preferences`, `Billing`
   • Logout button

---

## 3. Feature Gating Logic
```
if (!auth)                  => role = VISITOR
else if (subscriptionActive)=> role = PAID
else                        => role = FREE
```
Quota check for FREE:
```
processed_today < 1 ? allow : deny & show paywall
```
Middleware on protected endpoints `/api/jobs/adjust` & `/api/jobs/download` enforces above.

---

## 4. Data Model (PostgreSQL)
- **users** (id, email, password_hash, created_at)
- **subscriptions** (id, user_id, stripe_sub_id, status, current_period_end)
- **jobs** (id UUID, user_id nullable, source_uri, status, created_at, completed_at, assembly_job_id, quota_flag)
- **adjustments** (id, job_id, speaker_id, target_wpm, target_db)
- **preferences** (user_id PK, default_wpm, default_db)
- **listens** (id, user_id, job_id, played_at)

---

## 5. Authentication & Authorisation
- **Framework**: NextAuth for Bun (or custom JWT)
- **Passwordless email magic-link** to lower friction
- JWT stored in http-only cookie, 30 d expiry
- `@authRequired` middleware injects `req.user`

---

## 6. Payments
- **Provider**: Stripe Checkout + Billing Portal
- Webhook handler `POST /api/webhooks/stripe` updates `subscriptions` table
- Grace-period logic: allow paid features until `current_period_end + 3 d`

---

## 7. API Surface (Bun/Elysia)
| Method & Path | Auth | Purpose |
|---------------|------|---------|
| POST `/api/auth/signup` | none | passwordless request |
| POST `/api/auth/callback` | none | completes login |
| POST `/api/jobs/new` | optional | start analysis job |
| GET  `/api/jobs/{id}` | any   | poll status |
| POST `/api/jobs/{id}/adjust` | FREE/PAID only (quota check) | request modification |
| GET  `/api/jobs/{id}/download` | FREE/PAID only (quota check) | download file |
| GET  `/api/profile` | auth | user, quota, settings |
| PUT  `/api/profile/preferences` | auth | save defaults |
| POST `/api/subscribe/podcast` | PAID | create subscription |
| GET  `/api/feed/{token}.rss` | PAID | personalised RSS |

---

## 8. Frontend (React/Bun)
Components to add on top of earlier list:
- `AuthModal` (signup / login)
- `HeaderNav` (search + auth CTA)
- `QuotaBanner`
- `ProfilePage` (tabs)
- `SubscriptionManager`

State: use **TanStack Query** for API + React Context for auth.

---

## 9. Background Jobs (BullMQ)
- `analyzeAudioWorker` – unchanged
- `adjustAudioWorker` – unchanged
- `subscriptionWorker` (NEW): nightly cron that checks each paid user's podcast subscriptions, fetches new episodes, queues adjust jobs with user-defaults, emails / pushes when ready.

---

## 10. Dev Milestones
1. Auth skeleton (signup/login/logout)
2. Free quota enforcement
3. Stripe integration
4. Profile & History pages
5. Subscription RSS feed
6. UI polish & onboarding
7. Analytics + error reporting

---

## 11. Security & Compliance Additions
- Rate-limit anonymous search (e.g. 30/min)
- reCAPTCHA on signup
- DPA with AssemblyAI & Stripe
- Delete user data on request (GDPR)

---

## 12. Open Questions
1. Will auto-processed subscription episodes count toward storage limits?
2. What preview length (sec) gives enough taste without full value leak?
3. Should free quota reset at midnight UTC or rolling 24 h?

> **Next step:** implement DB schema & auth endpoints.