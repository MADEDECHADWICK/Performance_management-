# Launch Readiness Roadmap

This document turns the current system review into an execution plan.

The goal is not to make the platform "perfect". The goal is to make it safe and reliable enough to pilot, then strong enough to scale across firm operations without avoidable failures.

## Current Assessment

- Product fit: strong
- Backend architecture: solid
- Access control: above average
- Realtime/notifications: promising
- Frontend breadth: high
- Operational maturity: medium
- Production readiness if launched today: `6/10`

Interpretation:
- Good candidate for a controlled pilot
- Not yet strong enough for broad production dependence without targeted hardening

## What The System Solves

The platform is an internal operations system for audit and tax firms. It connects:

- employee lifecycle management
- job delivery and staffing
- timesheets and approvals
- performance reviews and development tracking
- evaluations and feedback
- finance and reporting

Its strongest differentiator is that performance management is tied to real delivery operations instead of sitting in a disconnected HR tool.

## Priority Model

- `P0`: must be addressed before wider live rollout
- `P1`: should be addressed during pilot stabilization
- `P2`: scale and maintainability improvements after the core launch path is stable

## P0: Launch Blockers

### P0.1 Quality Gates Must Be Enforced

Problem:
- CI was not reliably enforcing type checking because `typecheck` scripts were missing.
- Frontend automated test coverage is currently absent.

Actions:
- Add required `typecheck` scripts for backend and frontend.
- Make CI fail when type checking fails.
- Keep backend test execution mandatory in CI.
- Add at least one frontend smoke test suite for login and key business flows.

Success criteria:
- Every PR runs backend tests, backend typecheck, frontend typecheck, frontend build.
- Broken types cannot merge.
- One failing core flow causes CI to fail.

Status:
- Started. Typecheck scripts and CI enforcement added on 2026-03-12.

### P0.2 Production Security Hardening

Problem:
- CORS is too permissive.
- There is no explicit security-header middleware.
- Upload handling is local-disk based.

Actions:
- Restrict `CORS_ORIGIN` to known environments.
- Add `helmet` or equivalent security headers.
- Add explicit JSON/body size limits.
- Add upload validation limits and move file storage to object storage before scale.

Success criteria:
- No wildcard CORS in production.
- Standard security headers present.
- Upload behavior is bounded and auditable.

### P0.3 Canonical Evaluation Workflow

Problem:
- Legacy and new evaluation flows coexist.
- Users can encounter multiple creation paths and route aliases.

Actions:
- Keep one canonical creation and rollout flow.
- Remove deprecated evaluation screens from navigation.
- Convert old pages to redirects only, then delete after a deprecation window.
- Align route labels, results pages, and assignment entry points.

Success criteria:
- A new HR/manager user can create and launch an evaluation without ambiguity.
- There is exactly one supported rollout path in the UI.

### P0.4 Critical Journey Smoke Coverage

Problem:
- Core workflows are broad, but there is no browser-level safety net on the frontend.

Actions:
- Add smoke coverage for:
  - sign in
  - create evaluation cycle
  - assign evaluators
  - submit evaluation
  - receive notification

Success criteria:
- The main live workflows run in automation against a test environment.

## P1: Pilot Stabilization

### P1.1 Observability and Runtime Diagnostics

Problem:
- Logs are mostly console-based.
- There is no visible centralized error tracking or metrics layer.

Actions:
- Introduce structured logging.
- Add request IDs and correlation IDs.
- Add error reporting for backend and frontend.
- Add health checks for workers, notification outbox, websocket connectivity, and DB connectivity.

Success criteria:
- A failed rollout or worker issue can be traced quickly from logs and metrics.

### P1.2 Evaluation Module Refactor

Problem:
- Some core files are too large and risky to change safely.

Actions:
- Split evaluation service by concern:
  - cycle management
  - assignment orchestration
  - scoring
  - reporting
  - templates
- Break large frontend pages into smaller sections and hooks.

Success criteria:
- No critical domain file should be a multi-thousand-line dependency hub.
- Changes to one sub-flow should not risk unrelated behavior.

### P1.3 Shared Authorization Contract

Problem:
- Backend and frontend both encode access logic.
- That is powerful, but drift risk is real.

Actions:
- Define a shared manifest for view keys, module keys, and default paths.
- Generate or validate frontend access definitions from backend-owned metadata.

Success criteria:
- Route access cannot silently diverge between frontend and backend.

## P2: Scale-Up Improvements

### P2.1 Workflow Consolidation

Actions:
- Remove fully deprecated routes and pages.
- Reduce alias sprawl.
- Archive legacy API contracts once replacements are stable.

### P2.2 Data and Reporting Maturity

Actions:
- Add stronger historical reporting and trend snapshots for evaluations, staffing, and finance.
- Add exportable audit-friendly reports for HR and leadership.

### P2.3 Operational Scale Readiness

Actions:
- Separate workers from the API process if load grows.
- Add Redis-backed scaling where needed.
- Add backup/restore drills and deployment rollback procedures.

## Recommended Execution Order

### Immediate

1. Enforce typecheck and CI gates.
2. Lock down production CORS and add security headers.
3. Remove remaining evaluation-flow ambiguity.
4. Add smoke coverage for evaluations and staffing workflows.

### Next

1. Add observability.
2. Refactor oversized evaluation modules and dashboards.
3. Unify access definitions.

### Later

1. Remove deprecated routes and screens.
2. Improve analytics and historical reporting.
3. Harden worker/runtime scaling.

## Suggested Next Coding Tasks

Pick these in order:

1. Add backend security hardening: `helmet`, body limits, production-safe CORS.
2. Add Playwright smoke tests for the evaluation and staffing workflows.
3. Remove the old evaluation management and advanced builder pages completely.
4. Split `evaluation.service.ts` into smaller service modules.

## Definition Of "Ready For Wider Rollout"

The system is ready for a broader internal rollout when:

- CI blocks bad types and failing tests
- there is one clear evaluation workflow
- core evaluation journeys have smoke coverage
- production config is locked down
- runtime failures are observable within minutes
