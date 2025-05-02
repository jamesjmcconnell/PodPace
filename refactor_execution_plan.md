# PodPace – Refactor Execution Plan (v2.1)

## AI Agent Implementation Road-Map

────────────────────────────────────────
Legend
• [F] new file • [E] edit file • D  delete
🗸 = CI / test checkpoint
────────────────────────────────────────

### PHASE 0 Bootstrap & CI Safety Net (½ day)
**Goal:** Establish basic CI checks before major changes.

*   **0-1 [F] `.github/workflows/ci.yml`**
    *   Configure Bun setup, pnpm caching.
    *   Add steps for `bunx eslint .`
    *   Add step for `bun test --coverage`
    *   Add step for `docker build -t podpace:ci .` (fail CI if Dockerfile breaks).
*   **0-2 [E] `package.json`**
    *   Add script: `"lint": "eslint . --max-warnings=0"`
    *   Add script: `"test": "bun test"`

**🗸 Checkpoint:** Run CI once via commit/push. Must stay green after every subsequent phase.

────────────────────────────────────────

### PHASE 1 Central Config & Redis Helper (½ day)
**Goal:** Centralize environment configuration and Redis connection logic.

*   **1-1 [F] `src/config.ts`**
    *   Use `dotenv` to load `.env`.
    *   Define a Zod schema (`z.object`) for all required environment variables (e.g., `REDIS_HOST`, `STRIPE_SECRET_KEY`).
    *   Parse `process.env` using the schema and export the validated `env` object.
*   **1-2 [F] `src/lib/redis.ts`**
    *   Import `env` from `config.ts`.
    *   Initialize and export a single `Redis` client instance using `env` variables.
*   **1-3 [E] `backend/utils/{jobUtils,quotaUtils}.ts`**
    *   Remove `declare const redisConnection`.
    *   Import the shared `redis` instance from `src/lib/redis.ts`.
    *   Update function bodies to use the imported `redis` client.

**🗸 Checkpoint:** Add basic unit tests for `config.ts` parsing. Ensure CI passes.

────────────────────────────────────────

### PHASE 2 Server Bootstrap Split (1½ days)
**Goal:** Break down the monolithic `backend/index.ts` into a modular structure.

*   **2-1 [F] `src/server.ts`**
    *   Keep only the `Bun.serve` initialization.
    *   Import and wire up the main router function and error handler middleware.
*   **2-2 [F] `src/router.ts`**
    *   Define the main router logic (e.g., using a lightweight router like `itty-router` or Bun's built-in routing if sufficient).
    *   Import and mount sub-routers (e.g., `/api/jobs`, `/api/podcasts`).
*   **2-3 [E] `backend/index.ts` → `src/controllers/*.ts`**
    *   Create controller files (e.g., `src/controllers/jobController.ts`).
    *   Move route handler logic (like `handleUpload`, `handleStatus`, `handleAdjust`) from `index.ts` into corresponding controller functions.
    *   Controllers should only parse requests, call services, and format responses.
    *   **Important:** Remove direct Redis/Stripe/queue logic from controllers; they should call service functions instead (services will be created later).
*   **2-4 [E] Update `backend/index.ts`**
    *   Remove the moved handler functions and routing logic.
    *   Potentially rename `backend/index.ts` to `src/bootstrap.ts` or similar if it only contains initialization logic now.

**🗸 Checkpoint:** Add basic API integration tests (e.g., using Supertest) for a critical flow like Upload → Status → Adjust. Ensure CI passes.

────────────────────────────────────────

### PHASE 3 Queues & Workers Refactor (½ day)
**Goal:** Centralize queue definitions and ensure workers use them.

*   **3-1 [F] `src/queues/analyzeQueue.ts`, `src/queues/adjustQueue.ts`**
    *   Import the shared `redis` client from `src/lib/redis.ts`.
    *   Initialize and export configured `BullMQ` Queue instances (e.g., `analyzeAudioQueue`).
*   **3-2 [E] `backend/worker-*.ts`**
    *   Remove local queue initialization.
    *   Import the corresponding queue instance from `src/queues/`.
    *   Update worker initialization to use the imported queue instance.

**🗸 Checkpoint:** Manually trigger a job and verify worker picks it up. CI should still pass.

────────────────────────────────────────

### PHASE 4 Validation & Error Middleware (½ day)
**Goal:** Implement robust request validation and centralized error handling.

*   **4-1 [F] `src/middleware/validator.ts`**
    *   Create a middleware function factory that takes a Zod schema.
    *   The middleware parses `req.json()` or `req.formData()` against the schema.
    *   If invalid, it throws a specific `ValidationError` (custom error class).
*   **4-2 [F] `src/middleware/errorHandler.ts`**
    *   Create a global error handling middleware.
    *   It catches errors, checks their type (e.g., `ValidationError`, `AppError`), and returns standardized JSON error responses with appropriate HTTP status codes.
*   **4-3 [E] Controllers & Routes**
    *   Define Zod schemas for expected request bodies/params for each route.
    *   Apply the validation middleware to routes in `src/router.ts` or individual route files.
    *   Update controller/service logic to throw custom `AppError` subclasses for business logic failures instead of returning raw error responses.

**🗸 Checkpoint:** Add/update integration tests to verify validation errors (400) and custom error responses. CI passes.

────────────────────────────────────────

### PHASE 5 Shared Types Package (1 day)
**Goal:** Create a single source of truth for types shared between frontend and backend.

*   **5-1 [F] Setup `common/` package**
    *   Use `pnpm workspaces` or similar to create a `common` package.
    *   Move shared types (`UserRole`, `QuotaInfo`, `JobStatus`, `SpeakerWPM`, `Segment`, etc.) into `common/src/types.ts`.
*   **5-2 [E] `backend/tsconfig.json`, `frontend/tsconfig.json`**
    *   Configure path aliases (e.g., `"~/common/*": ["../common/src/*"]`) to import from the shared package.
*   **5-3 [E] Backend & Frontend Source Files**
    *   Update all imports to use the `~/common/types` path alias.
    *   Remove redundant type definitions from `backend/interfaces.ts` and `frontend/src/interfaces.ts` (or delete the files if empty).

**🗸 Checkpoint:** Ensure both frontend and backend build successfully (`bun run build` in both). CI passes.

────────────────────────────────────────

### PHASE 6 Testing Expansion (1½ days)
**Goal:** Increase test coverage significantly.

*   **6-1 Unit Tests (`Vitest`)**
    *   Write tests for `quotaUtils`, `jobUtils`, `config.ts`.
    *   Mock dependencies (like Redis using `ioredis-mock`).
    *   Aim for high coverage on these utilities.
*   **6-2 Integration Tests (`Supertest`)**
    *   Expand API tests to cover:
        *   Authentication middleware (`/api/upload` requires auth).
        *   Quota enforcement (FREE user hits limit on `/api/upload` and `/api/adjust`).
        *   Webhook signature verification (mock Stripe request).
*   **6-3 E2E Tests (`Playwright`)**
    *   Create basic end-to-end tests under `e2e/` directory.
    *   Test critical user flows:
        *   Login (can mock Supabase response or use test account).
        *   Search podcast → Select episode → View processing → Adjust → Download.

**🗸 Checkpoint:** Achieve target test coverage (e.g., >80% combined). CI passes with new tests.

────────────────────────────────────────

### PHASE 7 Docker & Self-Hosting Docs (½ day)
**Goal:** Finalize containerization and documentation for deployment.

*   **7-1 [F] `Dockerfile`**
    *   Implement a multi-stage build:
        *   Stage 1 (`builder`): `FROM oven/bun:latest`, copy all code, `bun install`, `bun run build` (for frontend).
        *   Stage 2 (`runtime`): `FROM oven/bun:slim`, copy build artifacts (backend code, `node_modules`, frontend static files) from `builder`, set `CMD ["bun", "run", "start"]` (assuming a start script runs the backend server).
*   **7-2 [E] `README.md` → Deployment Section**
    *   Add instructions:
        *   Building the image: `docker build -t podpace .`
        *   Running on Unraid: Example `docker run` command showing volume mounts (`/app/backend/uploads`, `/app/backend/output`, potentially `/app/.env`), port mapping.
        *   Environment variables setup (via `.env` file mount).
        *   Brief notes on setting up Cloudflare Tunnel to point to the container.

**🗸 Checkpoint:** Successfully build the Docker image locally. CI Docker build step passes.

────────────────────────────────────────

### PHASE 8 Developer & AI-Agent DX (½ day)
**Goal:** Improve developer experience and make the codebase easier for AI agents to work with.

*   **8-1 [F] `.vscode/extensions.json`**: Recommend ESLint, Prettier, Bun/TypeScript extensions.
*   **8-2 [JSDoc]** Add comments to exported functions/classes in `utils/`, `services/`, `controllers/` explaining purpose, params, returns.
*   **8-3 [F] `scripts/gen-openapi.ts`** (Optional but helpful)
    *   Use a library like `tsoa` or `express-openapi-validator` (adapted for Bun) to generate an `openapi.json` spec from route definitions and Zod schemas.
    *   Add a script `"gen:openapi": "bun run scripts/gen-openapi.ts"`.
*   **8-4 [F] `docs/architecture.md` or `ADRs/`**: Briefly document key architectural decisions (e.g., why specific libraries were chosen, the purpose of the service layer).

**🗸 Checkpoint:** Review generated docs/spec. Manually verify dev setup improvements.

────────────────────────────────────────

## Definition of Done Checklist
*   [ ] CI pipeline green with >80 % coverage.
*   [ ] Docker image builds locally & in CI.
*   [ ] `README` documents local dev, tests, docker deploy.
*   [ ] Architecture diagram/ADRs committed.
*   [ ] All globals removed; Redis, queues, Stripe ideally injected or accessed via modules.
*   [ ] (Optional) OpenAPI spec autogen script runs.

**Total Estimate:** ≈ 7 developer days.