# PodPace Architecture Notes

*(This document outlines key architectural decisions made during the development and refactoring of PodPace.)*

## Overview

*(Add a high-level description of the system components: Frontend (React/Bun), Backend (Bun/TypeScript), Workers (Bun/BullMQ), Database (Supabase/Postgres), Cache (Redis), External APIs (PodcastIndex, AssemblyAI, Stripe)). Include a simple diagram if possible later.*

## Backend Structure (Post-Refactor v2.1)

- **Entry Point:** `backend/index.ts` (or `src/bootstrap.ts`) - Handles initialization, infra setup (dirs, queues), graceful shutdown.
- **Server:** `backend/src/server.ts` - Starts the `Bun.serve` HTTP server, wires up router and global error handling.
- **Routing:** `backend/src/router.ts` - Maps incoming request paths/methods to controllers. Handles CORS, global auth checks.
- **Controllers:** `backend/src/controllers/` - Handle specific HTTP requests. Parse input, call services, format responses. Minimal business logic.
- **Services:** `backend/src/services/` *(To be implemented)* - Contain core business logic. Interact with utils, queues, external APIs. Receive dependencies via injection/constructor.
- **Utils:** `backend/utils/` - Reusable helper functions (jobs, quotas, responses).
- **Middleware:** `backend/src/middleware/` - Request/response processing logic (auth, validation, error handling).
- **Config:** `backend/src/config.ts` - Centralized environment variable loading and validation (Zod).
- **Libs:** `backend/src/lib/` - Initialization of shared clients (e.g., Redis).
- **Queues:** `backend/src/queues/` - Centralized BullMQ queue definitions.
- **Workers:** `backend/worker-*.ts` - Background job processors (BullMQ Workers).

## Key Decisions & ADRs (Architecture Decision Records)

*(Use this section to document significant choices and their rationale)*

- **ADR-001: Choice of Bun:** Selected for its speed, integrated tooling (runtime, bundler, test runner), and first-class TypeScript support.
- **ADR-002: BullMQ for Job Queues:** Chosen for its robustness, Redis backend, and features suitable for background audio processing.
- **ADR-003: Monorepo Structure (Backend/Frontend):** Simplifies dependency management and type sharing (intended Phase 5 goal).
- **ADR-004: Zod for Validation:** Provides runtime validation with static type inference, improving data integrity.
- **ADR-005: Centralized Config:** Using `dotenv` + Zod ensures required configuration is present and valid on startup.
- **ADR-006: Controller/Service Pattern:** Separates HTTP handling from core business logic for better testability and maintainability.

## Future Considerations

- Dependency Injection framework/pattern.
- Shared `common` package for types.
- Real-time updates (WebSockets?) for job progress.
- API Versioning.