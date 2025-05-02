# PodPace – Refactor & Simplification Plan (v2.1)

## 0. Why Another Plan?
The previous plan delivered the minimum gating & quota features required for an early public release.
Before introducing *additional* functionality (podcast playback with dynamic speed, richer profiles, etc.) we should stabilise the codebase, reduce tech-debt, and establish strong testing & CI foundations.
This plan enumerates concrete refactorings and tooling work that will make future work cheaper and the developer experience smoother.

---

## 1. Guiding Principles
1. **Single-Responsibility & Clear Boundaries** – isolate concerns (web routing vs. business logic vs. infra).
2. **DRY & Re-use** – extract duplication (e.g. Redis helpers, response boiler-plate).
3. **Strong Typing & Validation** – leverage TypeScript end-to-end; validate runtime data.
4. **Observable & Testable** – every unit should be easy to unit-test; critical paths covered by integration & e2e tests.
5. **Configurable, not Hard-coded** – env-driven config, dependency injection where useful.
6. **Prepared for Streaming Playback** – design audio pipeline & storage with the *future playback-first* model in mind.

---

## 2. High-Level Pain Points Observed
| Area | Pain / Risk | Quick Win? |
|------|-------------|------------|
| **Backend index.ts (~600 lines)** | God-file mixes routing, infra boot, business rules | ✔ Break out *router*, *controllers*, *services*, *infra* bootstrapping.
| **Redis access scattered** | Duplicate key logic & patterns | ✔ Centralised `lib/redis.ts` exporting typed helper functions.
| **Quota logic in utils but DI unclear** | Hidden `declare const redisConnection` | ✔ Inject Redis into utility functions; avoid globals.
| **Error / JSON response boilerplate** | Repeated ad-hoc responses | ✔ Single `errorHandler` & `success` helpers or lightweight framework (Hono, Elysia).
| **Mixed async queue logic** | Job queue names sprinkled around | ✔ `queues/` dir exporting pre-configured BullMQ queues.
| **Env management ad-hoc** | Direct `process.env` calls | ✔ Add `config.ts` w/ `dotenv` & Zod schema.
| **Frontend state** | Role/quota fetch duplicated | ✔ Global React context (or TanStack Query) exposing auth/role/quota.
| **Testing absent** | No unit/integration tests | ✔ Introduce Vitest + Supertest; stub Redis with ioredis-mock.
| **CI/CD absent** | Manual testing only | ✔ GitHub Actions: lint → test → bun run build.

---

## 3. Refactor Themes & Tasks
### 3.1 Backend Modularisation
1. **`src/server.ts`** – solely starts Bun server & wires middlewares.
2. **Routes** ⇒ `routes/*.ts` exporting *router functions* (verb/path → controller).
3. **Controllers** ⇒ thin, receive `(req, res)` – call **Services**.
4. **Services** – pure business logic; receive typed params & injected deps (Redis, Stripe SDK, queues).
5. **Data-access layer** – encapsulate Redis & Supabase queries.
6. **Queues** – `queues/analyze.ts`, `queues/adjust.ts` exporting typed BullMQ queue instances.
7. **Validation** – All request bodies validated with Zod before hitting services.
8. **Error Handling** – central `handleErrors` middleware mapping custom `AppError` subclasses → HTTP codes.

### 3.2 Shared Types & Utilities
- `types/shared.ts` – Role, Quota, JobStatus, etc. imported by both front & back via a shared package (workspaces or `~/common`).
- Remove duplicate Segment/Speaker interfaces.

### 3.3 Config & Dependency Injection
- `config.ts` loads env via `dotenv`; validates via Zod.
- Create simple DI container (or lightweight factory) to pass Redis, BullMQ, Stripe, etc.

### 3.4 Testing Strategy
| Layer | Tooling | What to Cover |
|-------|---------|--------------|
| Unit | Vitest | utils (quota, job utils), pure services |
| Integration (API) | Supertest (bun-test) | Auth, quota enforcement, happy-path job lifecycle |
| E2E (headless) | Playwright | Critical user journeys (search → adjust → download) |
| Workers | Vitest + bun spawn mocks | Ensure queued jobs call ffmpeg w/ correct args |

Add coverage thresholds (≥80%).

### 3.5 CI Pipeline (GitHub Actions)
1. `on: [push]`
2. Jobs:
   - **Setup** bun + pnpm cache
   - **Lint** `eslint .`
   - **Test** `bun test --coverage`
   - **Build** fatal on type errors.
   - **Docker** build stage *(optional)*: `docker build -t podpace:ci .` to ensure the Dockerfile never breaks.

### 3.6 Containerisation & Self-Hosting
- Provide a **multi-stage Dockerfile** (`FROM oven/bun:latest` → build → slim runtime).
- Document **Unraid** deployment steps in README: bind ports, mount volumes (`/config`, `/data`), set env via `.env` file, and expose tunnel via **Cloudflare Tunnel**.

### 3.7 Developer Ergonomics
- **VSCode workspace** recommendations (extensions, settings).
- **Task runner** `bunx concurrently "bun dev" "bun test --watch"`.
- **Prettier** + **ESLint** w/ `pre-commit` hooks via Husky or simple *pnpm dlx pre-commit*.
- **Makefile** with common commands (`make dev`, `make test`, `make lint`).

### 3.8 AI-Agent Friendliness
To let future AI coding assistants reason about and extend the codebase:
1. **Introspectable Architecture** – directory-first conventions (`routes/`, `controllers/`, `services/`, etc.) make symbol search trivial.
2. **Comprehensive TypeScript Types** – every public function and return value typed; use `export type` over `interface` when shape is fixed.
3. **Self-documenting Code** – JSDoc on all exported symbols; ADRs (Architecture Decision Records) summarising big choices.
4. **OpenAPI Specification** – auto-generate spec from route declarations to give any agent a machine-readable contract.
5. **Example-Driven Tests** – Unit tests serve as live examples of API usage; AI can see expected inputs/outputs.
6. **Consistent Naming & Lint Rules** – ESLint + Prettier + EditorConfig enforced in CI; easier for AI to predict patterns.
7. **Shared `common/` Package** – Single source of truth for types shared between BE & FE.
8. **Code Comments for Complex Logic** – especially ffmpeg command construction, quota edge-cases.

### 3.9 Future-Proofing for Streaming Playback
- Abstract *analysis* output format so that it can be applied on-the-fly per playback request.
- Investigate **WebAssembly + Web Audio API** for client-side speed adjustment to offload compute.
- Design `GET /api/play/{episodeId}?profile=default` that streams already-hosted mp3 + sends side-channel JSON of segments & desired speed curve.
- Consider using **HLS** with **EXT-X-SPEED** custom tags (experimental) or HTTP/2 server push.

---

## 4. Concrete Milestones & Estimates
| # | Deliverable | Effort |
|---|-------------|--------|
| 1 | Extract `lib/redis.ts`, update all imports | 0.5d |
| 2 | Introduce `config.ts` w/ Zod validation | 0.5d |
| 3 | Split `index.ts` into server/bootstrap/controllers (MVP, no DI yet) | 1.5d |
| 4 | Add Vitest + first unit tests for quota utils | 1d |
| 5 | Add Supertest integration tests for `/upload` & `/adjust` | 1d |
| 6 | GitHub Actions CI (lint + test) | 0.5d |
| 7 | Frontend React context for role/quota | 1d |
| 8 | Remove duplication of interfaces into `common/` package | 1d |
| **Total (~7d)** | *One week of focused engineering* |

---

## 5. Risks & Mitigations
- **Refactor Breakage** – ensure feature parity via integration & e2e tests *before* heavy rewrites.
- **Time-boxing** – avoid endless polishing; stick to milestones.
- **Team Alignment** – document new structure; write ADR summarising decisions.

---

## 6. Definition of Done
✅ All critical paths pass automated tests.
✅ CI pipeline green on every commit.
✅ No ad-hoc globals; clear directories (`controllers/`, `services/`, `queues/`, `utils/`, `types/`).
✅ README updated with new dev commands & architecture diagram.

---