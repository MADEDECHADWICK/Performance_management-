# Reward-Based Perfomance Matrix

Full-stack system for audit and tax firms covering employee lifecycle, performance evaluation, and job delivery. Built with a TypeScript/Node backend and a React dashboard UI.

## Highlights
- Employee onboarding, profiles, and role-based access control
- Client intake with engagement letters
- Job creation, staffing, costing, and budget caps
- Timesheets and time-entry approvals
- Performance evaluations and feedback cycles (manager, peer, direct report)
- Dashboards for HR, managers, partners, and employees

## Tech Stack
Backend
- Node.js + Express (TypeScript)
- PostgreSQL + Prisma
- JWT auth

Frontend
- React (Vite) + TypeScript
- Tailwind CSS + shadcn/radix UI
- TanStack Query

## Repo Structure
- `backend/` API, Prisma schema, services, and tests
- `ronalds-growth-hub/` React dashboard UI

## Getting Started

### Prerequisites
- Node.js 18.19+
- PostgreSQL 14+

### Backend
```bash
cd backend
npm install
```

Create `backend/.env`:


Generate Prisma client and run migrations:
```bash
npm run prisma:generate
npm run prisma:migrate
```

Start the API:
```bash
npm run dev
```

### Frontend
```bash
cd ronalds-growth-hub
npm install
npm run dev
```

The app expects the API at `http://localhost:4000`. You can override with `VITE_API_URL`.

### Production Security Notes
- `CORS_ORIGIN` should be set to a comma-separated allowlist of frontend origins in production.
- `REQUEST_BODY_LIMIT` controls JSON and urlencoded payload size limits. Default: `1mb`.
- `REQUEST_PARAMETER_LIMIT` controls the maximum number of urlencoded parameters. Default: `1000`.
- `TRUST_PROXY=true` should be set when the API runs behind a trusted reverse proxy.
- `JWT_SECRET` is required and must be strong outside test mode.
- `REDIS_URL` should point to the managed Redis-compatible store used for Bull background queues. `REDIS_HOST` and `REDIS_PORT` are still supported as a fallback when no URL is provided.
- `DISABLE_BACKGROUND_JOBS_WORKER=true` disables the Bull worker when Redis is intentionally unavailable.
- `LOG_LEVEL` controls structured backend logging. Supported values: `debug`, `info`, `warn`, `error`.
- `REQUEST_LOGGING_ENABLED` toggles structured HTTP access logs. Default: `true`.
- `OBSERVABILITY_ENABLED` toggles in-process ops metrics, worker health tracking, and alerts. Default: `true`.
- `OBSERVABILITY_MONITOR_INTERVAL_MS` controls worker staleness and HTTP error-rate checks. Default: `30000`.
- `OBSERVABILITY_RECENT_ERRORS_LIMIT` caps retained in-memory error events. Default: `200`.
- `OBSERVABILITY_ALERT_COOLDOWN_MS` throttles repeated alerts for the same key. Default: `300000`.
- `OBSERVABILITY_REQUEST_WINDOW_MS` controls the request metrics retention window. Default: `900000`.
- `UPLOAD_ROOT` sets the local upload directory used by documents and knowledge hub uploads.
- `UPLOAD_PUBLIC_BASE_PATH` sets the public path prefix for locally served uploads. Default: `/uploads`.
- `SERVE_LOCAL_UPLOADS` toggles local static upload serving. Default: `true`.
- `DOCUMENT_UPLOAD_MAX_BYTES` defaults to `10485760` (10 MB).
- `KNOWLEDGE_HUB_UPLOAD_MAX_BYTES` defaults to `26214400` (25 MB).

### Upload Strategy
- The current pilot-safe strategy is local disk storage with explicit size and MIME-type limits.
- For a wider production rollout, move uploads behind object storage and set `SERVE_LOCAL_UPLOADS=false` once document/resource URLs are served externally.

### Operational Telemetry
- Protected ops endpoints are available under `/api/ops` for `hr` and `super_admin` users.
- `/api/ops/overview` returns runtime, HTTP, websocket, worker, notification, queue, alert, and recent-error summaries.
- `/api/ops/workers`, `/api/ops/errors`, and `/api/ops/alerts` expose focused operational views.
- `/api/ops/metrics/prometheus` returns a Prometheus-style text export for scraping or external monitoring.
- Active alerts are also emitted over Socket.IO as `ops:alert` to `hr` and `super_admin` role rooms.

### Render Redis
- Create a Render Key Value instance in the same region as the backend service.
- Use the instance's internal connection URL for the backend `REDIS_URL`.
- The same `REDIS_URL` also enables the Socket.IO Redis adapter for multi-instance websocket delivery.
- Keep `DISABLE_BACKGROUND_JOBS_WORKER` unset or set to `false` when Redis should process background jobs.
- For job queues, use a non-evicting maxmemory policy so queued work is not discarded under memory pressure.

## Scripts
Backend (in `backend/`)
- `npm run dev` Start API in dev mode
- `npm run prisma:generate` Generate Prisma client
- `npm run prisma:migrate` Apply migrations
- `npm run typecheck` TypeScript validation without emit
- `npm run test` Run tests

Frontend (in `ronalds-growth-hub/`)
- `npm run dev` Start Vite dev server
- `npm run build` Build production bundle
- `npm run typecheck` TypeScript validation without emit
- `npm run preview` Preview build

## Status
This project is under active development. Core backend modules and the dashboard are operational; some advanced workflows and reports are still evolving.

## Auth/RBAC
- Canonical roles and centralized RBAC are documented in `AUTH_RBAC_REFACTOR.md`.
- Backend sources:
  - `backend/src/auth/canonicalRoles.ts`
  - `backend/src/services/moduleAccess.service.ts`
- Frontend sources:
  - `ronalds-growth-hub/src/auth/canonicalRoles.ts`
  - `ronalds-growth-hub/src/auth/routeAccess.ts`

## License
Proprietary. All rights reserved.
