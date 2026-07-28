# API Architecture Map

This project exposes a TypeScript/Express API under `/api`, backed by Prisma/PostgreSQL, and consumed by the React frontend through `ronalds-growth-hub/src/lib/api`.

Generated from `backend/src/routes/index.ts` and route declarations on 2026-07-20.

## High-Level Design

```text

React pages/components
  -> frontend API modules (`src/lib/api/*.ts`)
  -> fetch wrapper (`apiFetch`)
  -> Express app (`backend/src/app.ts`)
  -> `/api` router (`backend/src/routes/index.ts`)
  -> domain route module
  -> middleware chain
  -> controller or inline route handler
  -> service layer
  -> Prisma/PostgreSQL
```

The design is domain-first. Each major business area has its own route prefix, route module, frontend API module where needed, and usually its own controller/service/validator files.

## Global API Conventions

- Public root endpoints: `GET /` and `GET /health`.
- API health endpoint: `GET /api/health`.
- API namespace: all business APIs are mounted under `/api`.
- Auth: bearer JWT in `Authorization: Bearer <token>`.
- Session validation: JWT must include a valid active session token.
- Access control: route prefixes are protected by module-level permissions, then sensitive resources add scoped resource middleware.
- Payload shape: request body/query keys must be camelCase. Snake_case request keys are rejected globally.
- Response shape: backend response keys are normalized to camelCase globally.
- Standard responses: many newer controllers return `{ success, statusCode, data, message, timestamp }`.
- Pagination convention: paginated responses normalize to `data + pagination` backend-side, and the frontend flattens them to `{ data, page, pageSize, total, totalPages }`.
- Uploads: local static upload serving is enabled by default, with object-storage redirect support when configured.
- Security: CORS, security headers, body limits, rate limiting, request logging, metrics, and global error handling are applied before API routes.

## Why It Is Designed This Way

- Business-domain prefixes make the system easier to reason about for a firm workflow: clients, jobs, time, finance, HR, evaluations, reporting, and access control each evolve independently.
- Module access at route-prefix level gives a single coarse authorization gate before handlers run.
- Resource access middleware, such as job/time-entry/document checks, handles relationship-based access after the coarse module gate.
- Controllers and services are used for newer or more complex workflows so validation, HTTP translation, and business rules do not collapse into one large route file.
- Some older modules still use inline route handlers. This is pragmatic for dashboard/reporting endpoints but should be migrated gradually when logic grows.
- CamelCase normalization protects the frontend contract from database naming details and keeps TypeScript models consistent.
- Specialized workflow endpoints, such as `/submit`, `/approve`, `/reject`, `/issue`, and `/recalculate`, model business actions explicitly instead of overloading generic CRUD updates.

## API Domains

| Domain | Endpoint declarations | Primary responsibility |
|---|---:|---|
| `/api/auth` | 9 | Login, registration/onboarding, session refresh, logout, password setup, current user |
| `/api/certificates` | 1 | Public certificate verification |
| `/api/departments` | 7 | Departments, department employees, managers, heads |
| `/api/documents` | 7 | Document upload, request, retrieval, verification, deletion |
| `/api/knowledge-hub` | 13 | Learning/resource library, progress, quiz, points |
| `/api/onboarding` | 9 | Employee onboarding cases, stages, policies, acknowledgements |
| `/api/onboarding-policies` | 5 | Policy library CRUD and slug lookup |
| `/api/offboarding` | 9 | Employee offboarding cases, checklist items, reactivation |
| `/api/evaluations` | 11 | Modern evaluation dashboard, cycles, assignments, submissions |
| `/api/induction-checklist` | 9 | Induction checklist templates, completion, signoff, reminders |
| `/api/partners` | 9 | Partner records, portfolios, allocations, revenue, approval chains |
| `/api/jobs` | 24 | Job lifecycle, staffing, costing, invoices, profitability, tracking |
| `/api/leave` | 26 | Leave requests, approvals, balances, policies, holidays, calendars |
| `/api/requisitions` | 17 | Spend requests, approvals, finance accountability, requisition types, reports |
| `/api/time-entries` | 22 | Timesheets, submission, approval, timers, budget/overrun requests |
| `/api`/analytics`` | 4 | Financial/non-financial/dashboard/company analytics |
| `/api/reporting` | 1 | Reporting workspace aggregation |
| `/api/audit-logs` | 2 | Audit log read surface and write protection |
| `/api/financial-summary` | 7 | Employee, manager, partner, department, and company financial summaries |
| `/api/finance-dashboard` | 22 | Finance overview, collections, balances, receivables, invoices, projections |
| `/api/job-profitability` | 3 | Job profitability summaries and recalculation |
| `/api/evaluation-assignments` | 8 | Legacy/current assignment management, signing, acknowledgement |
| `/api/evaluation-cycles` | 6 | Evaluation cycle CRUD and closure |
| `/api/evaluation-templates` | 8 | Evaluation templates, imports, result-area library |
| `/api/employee-goals` | 5 | Employee goals CRUD |
| `/api/competencies` | 5 | Competency library CRUD |
| `/api/client-evaluations` | 1 | Client evaluation listing |
| `/api/continuous-feedback` | 4 | Continuous feedback CRUD |
| `/api/performance-reviews` | 5 | Performance review CRUD |
| `/api/non-financial-performance` | 16 | Non-financial evaluation and score surfaces |
| `/api/development-recommendations` | 5 | Recommendation CRUD |
| `/api/employees` | 5 | Employee directory and helper lists |
| `/api/profiles` | 8 | Profile lookup, search, stats, team, update, delete |
| `/api/employee-roles` | 4 | Employee role assignment and history |
| `/api/employee-project-allocations` | 1 | Employee project allocation listing |
| `/api/subordinates` | 1 | Manager subordinate listing |
| `/api/team-management` | 30 | Team performance, workload, learning programs, assignments, certificates |
| `/api/clients` | 10 | Client CRUD, jobs, engagement letter actions |
| `/api/engagement-letters` | 1 | Engagement letter listing |
| `/api/client-onboardings` | 11 | Client onboarding queue, checklist, approval/rejection/resubmission |
| `/api/performance-scores` | 2 | Personal score and recalculation |
| `/api/performance-framework` | 48 | Balanced scorecard, KPI engine, scorecard governance, structure, periods |
| `/api/kpi-cascade` | 14 | Firm KPI templates, department/partner scorecards, resync/status |
| `/api/project-evaluations` | 3 | Project evaluation CRUD subset |
| `/api/calibration` | 12 | Calibration sessions, participants, scores, assignment reopen |
| `/api/performance-bands` | 5 | Performance band CRUD and resolution |
| `/api/development-plans` | 7 | Development plan CRUD, item updates, generation |
| `/api/evaluation-reports` | 4 | Nine-box, radar, scorecard, team-summary reports |
| `/api/proposals` | 12 | Business development pipeline, proposals, manager and BD workflow |
| `/api/surveys` | 9 | Client surveys, public token access, submission, analytics |
| `/api/feedback` | 2 | Feedback creation and received feedback |
| `/api/checkins` | 3 | Check-in creation, completion, team lookup |
| `/api/notifications` | 14 | Inbox, read state, preferences, outbox, replay, metrics |
| `/api/ops` | 6 | Operational metrics, workers, errors, alerts, Prometheus export |
| `/api/notification-templates` | 5 | Notification template CRUD and default seeding |
| `/api/manager-dashboard` | 6 | Manager dashboard summary surfaces |
| `/api/gmp-dashboard` | 4 | GMP overview, personal, partner, alerts |
| `/api/hr-dashboard` | 3 | HR company metrics, approval controls, time/revenue |
| `/api/roles` | 5 | Role CRUD |
| `/api/user-roles` | 5 | User-role listing, assignment, change, deletion |
| `/api/position-rates` | 6 | Billing/cost role rates |
| `/api/projects` | 5 | Project compatibility CRUD/list surface |
| `/api/todos` | 6 | Dashboard todo CRUD and notes |
| `/api/recruitment-candidates` | 7 | Candidate pipeline, stages, offer letter, deletion |
| `/api/module-access` | 11 | Module catalog, role policies, view policies, user overrides |

Total route endpoint declarations: **555** across **65** mounted API domains.

## Main Workflow APIs

### Authentication And Identity

`/api/auth` is the entry point for session lifecycle. The frontend stores the returned token in `localStorage` and attaches it to later requests. The backend validates both JWT signature and active session record, then attaches `req.user`.

Key endpoints:
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/auth/refresh`
- `GET /api/auth/me`
- `POST /api/auth/set-password`
- `POST /api/auth/register`
- `POST /api/auth/onboard-user`

### People, Roles, And Access

People data is split across profile/employee APIs, role APIs, and access-control APIs:
- `/api/employees`, `/api/profiles`, `/api/departments`, `/api/partners`
- `/api/roles`, `/api/user-roles`, `/api/employee-roles`, `/api/position-rates`
- `/api/module-access`

This separation exists because billing/position roles, auth roles, and module access are different concepts. Position roles drive staffing/rates. Auth roles and module policies drive authorization.

### Client-To-Job Lifecycle

The client delivery workflow moves through:

```text
Proposals / client onboarding
  -> client and engagement letter
  -> job creation
  -> staffing and costing
  -> time entries
  -> invoice/profitability/collections
  -> reporting dashboards
```

Main APIs:
- `/api/proposals`
- `/api/clients`
- `/api/client-onboardings`
- `/api/engagement-letters`
- `/api/jobs`
- `/api/time-entries`
- `/api/finance-dashboard`
- `/api/job-profitability`
- `/api/financial-summary`

### Employee Lifecycle

Employee lifecycle is deliberately separate from job lifecycle:
- `/api/recruitment-candidates`
- `/api/onboarding`
- `/api/induction-checklist`
- `/api/onboarding-policies`
- `/api/documents`
- `/api/leave`
- `/api/offboarding`

This lets HR workflows run independently while still feeding profiles, documents, and module access into the rest of the platform.

### Performance And Balanced Scorecard

Performance APIs have two overlapping generations:
- Evaluation-cycle APIs: `/api/evaluations`, `/api/evaluation-*`, `/api/feedback`, `/api/checkins`, `/api/calibration`
- Balanced-scorecard APIs: `/api/performance-framework`, `/api/kpi-cascade`, `/api/performance-scores`

This is intentional in the current codebase: evaluation workflows collect assessments and acknowledgements, while the scorecard/KPI engine models organization-level measurement, cascading, governance, and scoring periods.

### Learning And Knowledge

Learning is split between reusable resources and managed programs:
- `/api/knowledge-hub` handles resource library, quiz, progress, and points.
- `/api/team-management` handles learning programs, assignments, sessions, certificates, impact tasks, and team workload/training metrics.

### Reporting, Dashboards, And Operations

Read-heavy APIs aggregate operational state:
- `/api/analytics`
- `/api/reporting`
- `/api/manager-dashboard`
- `/api/gmp-dashboard`
- `/api/hr-dashboard`
- `/api/financial-summary`
- `/api/finance-dashboard`
- `/api/ops`

These are intentionally less CRUD-like because dashboard screens need composed data shaped for fast rendering.

## Authorization Architecture

Authorization is layered:

1. `authMiddleware` validates JWT, active session, active user/profile, canonical roles, and onboarding gate.
2. `loadProfile` attaches profile/org context for routes that need relationship checks.
3. `requireModuleAccess(module, action)` checks coarse module access. GET maps to `read`; POST/PATCH/PUT/DELETE map to `write` unless an explicit action is provided.
4. Resource middleware checks scoped ownership/relationship:
   - `requireJobAccess`
   - `requireTimeEntryAccess`
   - `requireDocumentAccess`
   - `requireDepartmentAccess`
   - `requirePartnerAccess`
   - `requireEvaluationAccess`
5. Controller/service code enforces workflow-specific transitions, such as approval/rejection/status rules.

## Frontend API Boundary

The frontend API layer lives in `ronalds-growth-hub/src/lib/api`:

- `client.ts` owns token storage, fetch calls, error handling, camelCase normalization, and response normalization.
- `apiBaseUrl.ts` resolves `VITE_API_URL` or defaults to `http://localhost:4000`.
- `types.ts` defines shared TypeScript DTO-style interfaces used by pages.
- Domain modules such as `jobs.ts`, `timeEntries.ts`, `proposals.ts`, `leave.ts`, and `performanceFramework.ts` wrap backend endpoints for UI screens.

The frontend intentionally does not expose every backend route through a typed wrapper yet. Some dashboard or legacy endpoints are called closer to the page layer or remain backend-only.

## Current Architecture Gaps To Be Aware Of

- Some route modules are mounted behind `authMiddleware` in `routes/index.ts` and also call `authMiddleware` inside the child route file. This is redundant and worth cleaning up gradually.
- Route styles are mixed: newer modules use route -> validator -> controller -> service; older modules often do route -> inline Prisma logic.
- Error response shapes are not fully uniform because some handlers use `successResponse/errorResponse`, while the global error handler uses `{ error: { code, message } }`.
- There is no generated OpenAPI spec in the repo. The route map above is code-derived, but not a formal machine-readable contract.
- The backend has many endpoint declarations. A future consolidation pass should split large dashboard/workflow route files or add a generated API reference.

## Recommended Next Documentation Step

Add either:

1. An OpenAPI generator/test that exports all 555 route declarations into a living API reference.
2. Per-domain API docs for the highest-risk workflows first: auth/access, jobs, time entries, finance, proposals, evaluations, leave, requisitions.

