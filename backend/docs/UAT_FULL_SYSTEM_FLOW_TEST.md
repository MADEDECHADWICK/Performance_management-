# Full System Flow UAT (Role-Based, Cross-Module)

## Section 1: Test User Setup
Pre-populate these users before running the test sequence.

For testing purposes, skip OTP verification and grant direct system access for all users below.

| Role | Name | Email | Password | Assigned To |
|---|---|---|---|---|
| HR Admin | Sarah Odhiambo | sarah.hr@testfirm.co | Test@1234 | All departments |
| Partner | James Kariuki | james.partner@testfirm.co | Test@1234 | Tax & Audit Dept |
| Partner | Linda Waweru | linda.partner@testfirm.co | Test@1234 | Advisory Dept |
| Manager | Brian Mutua | brian.mgr@testfirm.co | Test@1234 | James Kariuki / Tax Dept |
| Manager | Agnes Njeri | agnes.mgr@testfirm.co | Test@1234 | Linda Waweru / Advisory Dept |
| Employee | Kevin Otieno | kevin.emp@testfirm.co | Test@1234 | Brian Mutua / Tax Dept |
| Employee | Grace Achieng | grace.emp@testfirm.co | Test@1234 | Brian Mutua / Tax Dept |
| Employee | Peter Kamau | peter.emp@testfirm.co | Test@1234 | Agnes Njeri / Advisory Dept |

## Section 2: HR Admin - Onboarding Workflow
Log in as `sarah.hr@testfirm.co / Test@1234`.

### 2.1 Create Employee Profiles

| # | Action | Expected Detail / Test Notes |
|---|---|---|
| 1 | Create employee record | Add full profile: name, email, role, department, employment date, and job title. |
| 2 | Assign billable position | Navigate to Positions. Assign each employee and manager a billable position (e.g., Senior Associate, Tax Consultant, Advisory Manager). |
| 3 | Link to Partner | For Managers and Employees: assign a reporting Partner (James Kariuki or Linda Waweru as appropriate). |
| 4 | Assign manager to employees | For Employees: assign Brian Mutua to Kevin & Grace; assign Agnes Njeri to Peter. |
| 5 | Assign department | Tax Department -> Brian Mutua, Kevin Otieno, Grace Achieng. Advisory Department -> Agnes Njeri, Peter Kamau. |
| 6 | Set system access | Grant system login. For this test, skip OTP - enable direct access immediately. |
| 7 | Create onboarding checklist | Go to Onboarding. Create a checklist with at least 5 items (e.g., Upload ID, Sign contract, Complete profile, Watch orientation video, Confirm department). |
| 8 | Assign checklist to all new users | Apply the onboarding checklist to all 5 new accounts (both managers and all 3 employees). |

### 2.2 Verify Onboarding Gate
Expected behavior: when any of the new users log in for the first time, they should see an onboarding notification and be blocked from all other modules until the checklist is fully completed.

| # | Action | Expected Detail / Test Notes |
|---|---|---|
| 1 | Log in as Kevin Otieno | Login: `kevin.emp@testfirm.co / Test@1234` |
| 2 | Verify notification | A welcome/onboarding notification should appear immediately upon login. |
| 3 | Verify module lock | All modules (Jobs, Finance, KPI, etc.) should be inaccessible or grayed out. |
| 4 | Complete checklist | Go through each item: upload ID doc, mark contract signed, confirm profile, etc. |
| 5 | Verify unlock | After completing all checklist items, all assigned modules should become accessible. |
| 6 | Repeat for all remaining users | Run same flow for Grace, Peter, Brian, and Agnes. |

## Section 3: Jobs & Timesheets Module
Covers job assignment, timesheets, time requests, and job progress.

### 3.1 HR Assigns Jobs from HR Dashboard

| # | Action | Expected Detail / Test Notes |
|---|---|---|
| 1 | Log in as HR Admin | Navigate to HR Dashboard > Jobs section. |
| 2 | Create Job - TAX001 | Client: ABC Holdings Ltd. Type: Tax Compliance. Dept: Tax. Assigned Manager: Brian Mutua. Deadline: 30 days. |
| 3 | Create Job - AUDIT002 | Client: XYZ Saccos. Type: Statutory Audit. Dept: Tax. Assigned Manager: Brian Mutua. Deadline: 45 days. |
| 4 | Create Job - ADV003 | Client: Greenfield Co. Type: Business Advisory. Dept: Advisory. Assigned Manager: Agnes Njeri. Deadline: 21 days. |
| 5 | Assign employees to jobs | TAX001 & AUDIT002 -> Kevin Otieno + Grace Achieng. ADV003 -> Peter Kamau. |
| 6 | Verify employee notification | All assigned employees should receive an in-system notification about their new job assignments. |

### 3.2 Employee Access Jobs & Fill Timesheets
Log in as Kevin Otieno (`kevin.emp@testfirm.co`). Repeat similar steps for Grace and Peter.

| # | Action | Expected Detail / Test Notes |
|---|---|---|
| 1 | Navigate to Jobs module | Verify TAX001 and AUDIT002 are listed and accessible. |
| 2 | View job details | Check client name, job type, deadline, assigned manager, and current status. |
| 3 | Fill timesheet - TAX001 | Log 4 hours on Monday, 3 hours Tuesday. Task: `Client document review and tax computation.` Save entries. |
| 4 | Fill timesheet - AUDIT002 | Log 5 hours on Wednesday. Task: `Preliminary audit planning.` Save. |
| 5 | Request additional time | On TAX001, submit extension request: reason `Client delayed document submission.` Request 7 extra days. |
| 6 | Track job progress | Confirm hours logged, completion %, and remaining tasks display correctly. |
| 7 | Submit report document | Upload test PDF (draft tax computation) as a job deliverable. |

### 3.3 Manager Job Costing, Budget & Work Plan
Log in as Brian Mutua (`brian.mgr@testfirm.co`).

| # | Action | Expected Detail / Test Notes |
|---|---|---|
| 1 | View assigned jobs | Confirm TAX001 and AUDIT002 are visible with team members listed. |
| 2 | Create job costing - TAX001 | Add cost lines. Total estimated cost: KES 85,000. |
| 3 | Create budget - TAX001 | Set budget against cost lines with 10% contingency. |
| 4 | Create work plan - TAX001 | Milestones by week; assign Kevin and Grace. |
| 5 | Submit work plan for approval | Send plan and budget to James Kariuki for approval. |
| 6 | Verify partner notification | James should receive approval request notification. |

### 3.4 Partner Approves Work Plan
Log in as James Kariuki (`james.partner@testfirm.co`).

| # | Action | Expected Detail / Test Notes |
|---|---|---|
| 1 | View pending approvals | TAX001 work plan appears in approvals dashboard. |
| 2 | Review budget and plan | Open TAX001 and review cost lines/milestones/team. |
| 3 | Approve plan | Approve with optional comment. |
| 4 | Verify team notification | Kevin, Grace, and Brian get `work plan approved` notification. |

## Section 4: Finance & Financial Contributions

### 4.1 Employee View Financial Contributions
Log in as Kevin Otieno.

| # | Action | Expected Detail / Test Notes |
|---|---|---|
| 1 | Navigate to Finance/My Contributions | Personal finance view shows revenue attributed to Kevin. |
| 2 | Verify revenue generated | Hours billed map to revenue (hourly rate x logged hours). |
| 3 | View collections | Payments against Kevin jobs are visible. |
| 4 | View profit/loss contribution | Margin/profit contribution displayed per job. |
| 5 | View job performance metrics | On-time %, budget adherence, quality indicators visible. |

### 4.2 Partner Team Financial Overview
Log in as James Kariuki.

| # | Action | Expected Detail / Test Notes |
|---|---|---|
| 1 | Navigate to Finance Dashboard | View Tax dept revenue, collections, WIP, debtor aging. |
| 2 | View per-job financials | Drill TAX001 for revenue/cost/margin. |
| 3 | View team performance | Revenue by team member (Brian, Kevin, Grace). |
| 4 | View KPI financial targets | KPI revenue/billing targets reflected in Finance. |

## Section 5: KPI & Performance Management

### 5.1 Partner Sets Department KPIs (James Kariuki)

| # | Action | Expected Detail / Test Notes |
|---|---|---|
| 1 | Navigate to KPI module | KPI > Department Initiatives. |
| 2 | Create KPI - Revenue Target | Monthly target KES 500,000 for Tax department. |
| 3 | Create KPI - Client Retention | Target 90%, quarterly. |
| 4 | Create KPI - Job Completion Rate | Target 85%, monthly. |
| 5 | Assign KPIs | Assign targets to Brian, Kevin, Grace. |
| 6 | Verify employee notification | `New KPI targets` notification received. |

### 5.2 Manager Sets Employee KPIs (Brian Mutua)

| # | Action | Expected Detail / Test Notes |
|---|---|---|
| 1 | View department KPI goals | Sees KPI goals assigned by James. |
| 2 | Create KPI for Kevin | Billable Hours, target 120 hrs/month. |
| 3 | Create KPI for Grace | On-time report submission, target 100%. |
| 4 | Track KPI progress | Progress bars/percentages update as data changes. |

### 5.3 Employee Views KPI Progress (Kevin Otieno)

| # | Action | Expected Detail / Test Notes |
|---|---|---|
| 1 | Navigate to KPI module | Open personal KPI dashboard. |
| 2 | Verify KPI targets displayed | Billable hours target and current value visible. |
| 3 | Verify progress tracking | Progress bars/trends/percent indicators visible. |
| 4 | Check department KPI visibility | Can view department goals but edit/input personal KPIs only. |

## Section 6: Business Development & Proposals

### 6.1 Manager Creates Proposal (Brian Mutua)

| # | Action | Expected Detail / Test Notes |
|---|---|---|
| 1 | Navigate to Business Development | Business Dev > Proposals/Tenders. |
| 2 | Create proposal | Sunrise Investments Ltd; Tax Advisory & Compliance; KES 180,000/year. |
| 3 | Add proposal sections | Summary, scope, team profile, fee, terms. |
| 4 | Attach documents | Firm profile PDF and sample engagement letter. |
| 5 | Submit to Partner | Send to James for review/sign-off. |

### 6.2 Partner Reviews Proposal & Pipeline (James Kariuki)

| # | Action | Expected Detail / Test Notes |
|---|---|---|
| 1 | View pipeline | Sunrise proposal appears under Tax department. |
| 2 | Review and approve | Approve and mark `Ready to Send`. |
| 3 | Track pipeline stages | Draft > Review > Sent > Won/Lost. |
| 4 | Mark as won | Contributes to new job entry or pending job creation. |

## Section 7: Workload Management (Manager View)
Log in as Brian Mutua.

| # | Action | Expected Detail / Test Notes |
|---|---|---|
| 1 | Open Workload Management | Capacity grid for Kevin and Grace visible. |
| 2 | Check utilization rates | Timesheet hours reflected as utilization %. |
| 3 | Reallocate task | Move one AUDIT002 task from Grace to Kevin. |
| 4 | View schedule | Milestones/deadlines/time allocations visible in timeline view. |
| 5 | Flag overloaded member | Set Grace `At Capacity` and validate assignment impact. |

## Section 8: Training Management

### 8.1 Partner Schedules Department Training (James Kariuki)

| # | Action | Expected Detail / Test Notes |
|---|---|---|
| 1 | Navigate to Training module | Training > Schedule Training. |
| 2 | Create training | `Tax Law Updates 2025`, date +1 week, 3 hours. |
| 3 | Assign attendees | Brian, Kevin, Grace. |
| 4 | Add materials | Upload outline/agenda PDF. |
| 5 | Verify notifications | All attendees get training notifications/invites. |

### 8.2 Manager Schedules Team Training (Brian Mutua)

| # | Action | Expected Detail / Test Notes |
|---|---|---|
| 1 | Create training | `Audit File Documentation Best Practices` for Kevin/Grace. |
| 2 | Mark attendance | Kevin attended, Grace absent. |
| 3 | View training history | Upcoming and past training logs visible per team member. |

## Section 9: Document Submission & Management

| # | Action | Expected Detail / Test Notes |
|---|---|---|
| 1 | Employee uploads report | Kevin uploads `Draft Tax Computation.pdf` to TAX001 docs. |
| 2 | Employee submits final | Update to final and submit to Brian for review. |
| 3 | Manager reviews | Brian comments and returns for revision. |
| 4 | Employee resubmits | Version history shows v1/v2. |
| 5 | Manager approves/forwards | Finalize and optionally forward to James. |
| 6 | Partner views dept docs | James sees Tax department documents across jobs. |

## Section 10: Cross-Module Validation Checklist
Mark each item `Pass` or `Fail`.

| Validation Point | Pass/Fail | Notes |
|---|---|---|
| Onboarding checklist blocks module access until fully completed |  |  |
| Timesheet hours update job progress % in real time |  |  |
| Hours logged by employees appear in Finance revenue calculations |  |  |
| Work plan approval by Partner triggers employee notifications |  |  |
| KPI progress auto-updates based on job and timesheet data |  |  |
| Proposals submitted by Manager are visible in Partner BD pipeline |  |  |
| Workload module reflects current timesheet allocations accurately |  |  |
| Training notifications sent to all assigned attendees |  |  |
| Document version history maintained on resubmission |  |  |
| Partner can see all team jobs, financials, KPIs in one dashboard |  |  |
| Manager can see all employee KPIs, workload, and job progress |  |  |
| Employee view is restricted to own jobs, KPIs, and documents only |  |  |

## Section 11: Expected Role Permission Matrix

| Module / Feature | HR Admin | Partner | Manager | Employee |
|---|---|---|---|---|
| Add employees / roles | ✅ Full | ❌ No | ❌ No | ❌ No |
| Manage onboarding checklists | ✅ Full | ❌ No | ❌ No | ✅ Complete only |
| Assign billable positions | ✅ Full | ❌ No | ❌ No | ❌ No |
| Assign jobs from HR Dashboard | ✅ Full | ❌ No | ❌ No | ❌ No |
| View & fill timesheets | ❌ No | ❌ No | ✅ View team | ✅ Own only |
| Request time extension | ❌ No | ❌ No | ✅ Approve | ✅ Submit |
| Job costing & budgets | ❌ No | ✅ View | ✅ Full | ❌ No |
| Work plan creation & submission | ❌ No | ✅ Approve | ✅ Full | ❌ No |
| Finance - individual revenue view | ❌ No | ❌ No | ❌ No | ✅ Own only |
| Finance - dept/team overview | ❌ No | ✅ Full | ✅ Dept only | ❌ No |
| Create KPI initiatives | ❌ No | ✅ Dept level | ✅ Team level | ❌ No |
| View KPI progress | ❌ No | ✅ All teams | ✅ Own dept | ✅ Own only |
| Business development / proposals | ❌ No | ✅ Full | ✅ Create/submit | ❌ No |
| Workload management | ❌ No | ✅ View | ✅ Full | ❌ No |
| Schedule trainings | ❌ No | ✅ Full | ✅ Full | ❌ No |
| Submit documents/reports | ❌ No | ❌ No | ✅ Review/approve | ✅ Submit |

## Section 12: Test Notes & Reporting

### Facilitator Instructions
- Run each section in order. Later modules depend on data created earlier.
- Record Pass/Fail for each step in Section 10.
- Capture screenshots for failed steps.
- Log exact error, role, module, and step number in bug log.
- After completion, tally results and submit to development team.

### Bug Log Template

| # | Section | Role | Module | Issue Description | Status |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
|  |  |  |  |  |  |
|  |  |  |  |  |  |

## Execution Notes
- Seed test users and onboarding setup with:
  - `cd backend`
  - `npm run seed:uat-team`
- Existing data is upserted, so this can be re-run safely.

