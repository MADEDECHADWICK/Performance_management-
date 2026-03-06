# Job Workflow Role Walkthrough (Real Data)

Use this checklist for manual role-by-role validation in staging/UAT.

## Prerequisites
- Seed at least one client, one approved onboarding, one in-progress job, and one completed job.
- Ensure at least one job has:
  - staffing assignments,
  - time entries (submitted + approved),
  - at least one extra-hours approval request,
  - at least one over-budget request requiring manager then partner.

## Employee
- Open employee dashboard and assigned jobs list.
- Open a job and confirm tracking view resolves from `GET /api/jobs/:jobId/tracking`.
- Verify own hours, utilization, and billable split reflect `GET /api/time-entries/job/:jobId/allocation`.
- Submit extra hours and confirm request appears in manager queue.

## Manager
- Open manager dashboard approvals section.
- Confirm pending queue excludes partner-stage requests.
- Approve/reject standard extra-hours requests, then verify audit trail and tracking timeline update.
- For over-budget requests, confirm manager action moves request to partner stage.

## Partner
- Open partner approvals tab.
- Confirm only manager-approved partner-stage requests are actionable.
- Approve/reject and verify status transition, notifications, and tracking update.

## HR
- Open HR dashboard personal + management tabs.
- Confirm fallback performance data loads from:
  - `GET /api/employee-project-allocations?employeeIds=...`
  - `GET /api/client-evaluations?employeeIds=...`
  - `GET /api/employee-kpi-assignments?employeeProfileId=...&includeTracking=true`
- Confirm subordinates list loads from `GET /api/subordinates?profileId=...`.

## GMP
- Open GMP dashboard overview.
- Validate firm/partner/manager/department/client cards render expected values with camelized payload keys.
- Open at-risk jobs and confirm tracking links resolve to `/jobs/:jobId/tracking`.

## Marketing
- Create/send client satisfaction survey.
- Confirm generated URL uses `/client-evaluation/:token`.
- Open survey link and verify:
  - load via `GET /api/surveys/token/:token`
  - submit via `POST /api/surveys/token/:token/submit`.

## Finance
- Open finance dashboard, collections, projections, balances, profitability, allocations.
- Confirm every table/card is API-backed (no static placeholders) and updates after mutations:
  - collections create,
  - projections upsert,
  - receivable owner/stage updates,
  - follow-up/escalation actions.

## Pass Criteria
- All dashboards show real API data.
- All approval actions enforce manager-first then partner for staged requests.
- All job links route to `/jobs/:jobId/tracking` and render without contract errors.

