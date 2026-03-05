# KPI Cascade V2 Screen Map (Web + Mobile)

This map translates the V2 cascade workflow into concrete React surfaces.
It is intentionally role-first and aligned to the strict chain:
Goal -> Metric -> Firm Initiative -> Team Initiative -> Department Initiative -> Employee Initiative.

## Shared UI Primitives

| Component | Purpose | Notes |
|---|---|---|
| `KpiStatePill` | Renders `Draft/Submitted/In Review/Approved/Rejected/Active/Completed/Archived` | Color and icon mapping must be centralized |
| `KpiRagBadge` | Renders `Red/Amber/Green` | Threshold config comes from metric |
| `KpiProgressBar` | `%complete` at any level | Supports weighted roll-up tooltip |
| `KpiHierarchyTree` | Drill-up and drill-down across levels | Parent and child lazy loading |
| `KpiApprovalTimeline` | Approval and rejection history | Uses `kpi_approval_history` + `status_transitions` |
| `KpiEvidenceList` | Evidence links from progress updates | Read-only for non-owner roles |
| `KpiUpdateForm` | Employee periodic update input | Idempotency key generated client-side per submission |

## Route Map

| Route | Primary role | Purpose | API feed |
|---|---|---|---|
| `/kpi-cascade/firm` | HR/Admin | Create cycles, versions, goals, metrics, firm initiatives | `POST /cycles`, `POST /cycles/:id/versions`, `POST /goals`, `POST /metrics`, `POST /initiatives/firm`, `GET /reporting/firm` |
| `/kpi-cascade/partner` | Partner | Submit team initiatives and monitor department readiness | `POST /initiatives/team`, `POST /initiatives/:id/submit`, `GET /reporting/partners/:profileId` |
| `/kpi-cascade/manager` | Manager | Review team submissions, add department initiatives, approve cascade | `POST /initiatives/department`, `POST /initiatives/:id/approve`, `POST /initiatives/:id/reject`, `POST /initiatives/:id/cascade`, `GET /reporting/departments/:departmentId` |
| `/kpi-cascade/employee` | Employee | Acknowledge initiatives and submit periodic progress | `POST /employee-initiatives/:id/acknowledge`, `POST /employee-initiatives/:id/progress`, `GET /reporting/employees/:profileId` |
| `/kpi-cascade/hierarchy/:entityType/:id` | All (scoped) | Drill full hierarchy for a specific node | `GET /hierarchy/:entityType/:id` |
| `/kpi-cascade/archive` | HR/Admin/Audit | Read-only legacy KPI + OKR audit archive | `GET /archive/kpis` (+ archive endpoints for other legacy entities) |

## Role Screens

### HR/Admin

1. `Cycle Studio`
   - Create cycle and version
   - Publish/lock version
   - Snapshot controls (baseline/periodic/closeout)
2. `Goal & Metric Builder`
   - Goal creation (L1)
   - Metric creation (L2)
   - Threshold and direction setup
3. `Firm Initiative Board`
   - Firm initiative creation (L3)
   - Submit to partner lane
   - SLA and escalation visibility
4. `Audit & Archive`
   - Approval timeline inspection
   - Legacy crosswalk (`kpi_legacy_map`)

### Partner

1. `Team Initiative Inbox`
   - Receives HR-submitted items
   - Creates team initiatives (L4)
   - Submits to manager
2. `Team Roll-up Dashboard`
   - Team/department progress, RAG, stale updates

### Manager

1. `Manager Review Queue`
   - Reviews partner submissions
   - Reject/approve with mandatory comments on reject
2. `Department Initiative Builder`
   - Creates department initiatives (L5)
3. `Cascade Control`
   - Triggers employee auto-cascade (L6)
   - Watches acknowledgment SLA
4. `Department Performance`
   - Weighted roll-up and employee drilldown

### Employee

1. `My Initiatives`
   - Assigned initiative list
   - Acknowledgment CTA
2. `Progress Update`
   - Period window, actual, note, evidence
   - Next due date and reminder state
3. `My KPI Context`
   - Shows own node + parent chain up to goal

## Mobile Notification UX

| Event | Mobile behavior |
|---|---|
| Assignment pending acknowledgment | Push deep-link to `/kpi-cascade/employee` |
| Progress due in 24h | Push with due timestamp and quick-open |
| Progress overdue escalation | Push to employee, then manager copy |
| Reassignment completed | Push to old and new owners |
| Approval rejected | Push with reason snippet and open review queue |

## Minimal Component Composition per Screen

| Screen | Core components |
|---|---|
| Firm view | `KpiHierarchyTree`, `KpiStatePill`, `KpiApprovalTimeline`, `KpiProgressBar` |
| Partner view | `KpiStatePill`, `KpiProgressBar`, `KpiApprovalTimeline` |
| Manager view | `KpiHierarchyTree`, `KpiStatePill`, `KpiUpdateForm` (for overrides if allowed), `KpiApprovalTimeline` |
| Employee view | `KpiUpdateForm`, `KpiEvidenceList`, `KpiProgressBar` |

## Legacy UI Retirement Mapping

| Existing route/surface | V2 destination |
|---|---|
| `/kpi-management` create/edit-centric page | `/kpi-cascade/firm` (HR), `/kpi-cascade/*` role pages |
| `/goals` OKR page | split into partner/manager/employee V2 pages |
| KPI assignment widgets | employee initiative list + progress forms |
| Department team KPI view | `/kpi-cascade/manager` + `/reporting/departments/:departmentId` |

## Implementation Order

1. Add route shells and layout placeholders for all V2 routes.
2. Integrate read models (`GET /reporting/*`, `GET /hierarchy/*`).
3. Integrate command flows with idempotency (`submit/approve/reject/cascade/ack/progress`).
4. Replace legacy nav links after cutover.
5. Retain archive-only legacy screens for audit access.

