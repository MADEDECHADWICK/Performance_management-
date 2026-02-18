# Ronalds LLP Role Implementation Checklist

Source discussions:
- `C:\Users\hh\OneDrive\Desktop\COMPILED BSC WORKFLOW.docx`
- `C:\Users\hh\OneDrive\Desktop\discussion_with_rachael.docx`

## Agreed System Decisions

- Financial and non-financial performance must combine in final score:
  - `70% financial`
  - `30% non-financial`
- Client onboarding and job lifecycle must enforce:
  - Client record first
  - Engagement letter required
  - Job created from approved engagement
- Job costing must be manager-driven with guardrails:
  - Planned hours per staff
  - Cost must not exceed fee without approved overage
  - Overruns split to non-billable/loss flow with approvals
- Timesheets must be assignment-scoped:
  - Staff can only log against assigned jobs
  - Cap-based behavior for over-allocation
  - Additional time requires approval chain
- Revenue in scorecards must be cash-based:
  - Collections entered by finance
  - Revenue allocated to staff by formula and period
- Different roles must have different financial matrices (not one blanket formula).

## Core Workflow (Target)

1. Authentication + RBAC.
2. Evaluation cycle setup (HR/Admin).
3. Data collection (self/peer/manager/client + financial pulls).
4. Job costing + time capture + approvals.
5. Collections capture + revenue allocation.
6. Score aggregation and calibration.
7. Role dashboards and reports.

## Role Requirements (Agreed)

## Employee
- Log assigned hours only.
- See billable vs non-billable, remaining allocation, request additional time.
- Personal scorecard with financial/non-financial split.
- Personal document/profile visibility with granular permissions.

## Manager
- Own team portfolio and workload.
- Create/approve job costing and additional time requests.
- Track planned vs actual hours and completion states.
- Team evaluation responsibilities.

## Partner
- Portfolio profitability and utilization.
- Partner-level approval for non-billable/loss overages.
- Business development metrics:
  - proposals
  - conversion
  - retained/replaced client value

## Group Managing Partner (GMP)
- Firm-wide rollups:
  - projected vs collected
  - profitability
  - utilization
  - overdue exposure
- Access to all modules with firm-first dashboard view.

## HR/Admin
- Full cycle configuration:
  - KPI setup
  - weighting
  - rater assignment
  - calibration and audit trail
- Employee lifecycle:
  - recruitment
  - onboarding checklists
  - offboarding
- Role and access configuration.

## Finance
- Enter collections by job/client/date.
- Track receivables and follow-up actions.
- Produce monthly/department projections vs collections vs balances.
- Feed collections into revenue allocation and score inputs.

## Marketing / BD
- Manage leads, onboarding intake, engagement workflow handoff.
- Track proposals, conversion to jobs, and pipeline value.
- Support client satisfaction survey capture for performance inputs.

## Current Implementation Focus

- Foundation lock:
  - Role hydration and route access controls.
  - Financial data source-of-truth enforcement.
- Then role modules in this order:
  1. Finance
  2. Manager
  3. Partner
  4. Employee
  5. HR/Admin
  6. GMP
  7. Marketing/BD
