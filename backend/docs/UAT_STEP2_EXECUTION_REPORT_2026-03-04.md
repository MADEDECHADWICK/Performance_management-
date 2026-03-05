# UAT Step 2 Execution Report (2026-03-04)

## Scope
Section 2 only:
- 2.1 HR Admin onboarding setup verification
- 2.2 Onboarding gate verification (pre-checklist lock, checklist completion, post-checklist unlock)

## 2.1 Verification Summary
Verified seeded users and onboarding setup directly from DB for:
- `brian.mgr@testfirm.co`
- `agnes.mgr@testfirm.co`
- `kevin.emp@testfirm.co`
- `grace.emp@testfirm.co`
- `peter.emp@testfirm.co`

Result:
- All 5 users were active and verified.
- All 5 had `onboardingStatus=pending`, `onboardingChecklistCompleted=false`, `inductionCompleted=false`.
- Each user had exactly 1 induction checklist.
- Each checklist had 5 items.
- Department/manager assignments matched expected setup.

Status: `PASS`

## 2.2 Gate + Completion Results
After backend fixes, each user flow was executed end-to-end:
1. Login
2. Verify module lock (`GET /api/jobs` => 403 `ONBOARDING_INCOMPLETE`)
3. Fetch onboarding case + checklist
4. Upload required onboarding document
5. Attach document to required checklist item
6. Complete all checklist items
7. Verify onboarding flags completed
8. Verify module unlock (`GET /api/jobs` => 200)

### Per-user results
| User | Pre-lock (`/api/jobs`) | Checklist completion errors | Post status flags | Post-unlock (`/api/jobs`) | Result |
|---|---|---:|---|---|---|
| Kevin Otieno | 403 (`ONBOARDING_INCOMPLETE`) | 0 | completed/true/true | 200 | PASS |
| Grace Achieng | 403 (`ONBOARDING_INCOMPLETE`) | 0 | completed/true/true | 200 | PASS |
| Peter Kamau | 403 (`ONBOARDING_INCOMPLETE`) | 0 | completed/true/true | 200 | PASS |
| Brian Mutua | 403 (`ONBOARDING_INCOMPLETE`) | 0 | completed/true/true | 200 | PASS |
| Agnes Njeri | 403 (`ONBOARDING_INCOMPLETE`) | 0 | completed/true/true | 200 | PASS |

Status: `PASS`

## Defects Found During Step 2 (and Fixed)
1. Backend onboarding gate missing:
- Pending users could call protected module APIs directly (jobs/finance) if bypassing UI.
- Fixed with onboarding gate enforcement in auth middleware.

2. Multipart document boolean coercion bug:
- `POST /documents/upload` accepted `isRequired` validation but passed string `"true"` to Prisma, causing 400.
- Fixed by normalizing boolean values in DocumentController.

3. Checklist completion blocked by module action mismatch:
- `PATCH /induction-checklist/...` required `users:write` via index-level module middleware; employee/manager roles only had `users:read`.
- Fixed by mounting onboarding/checklist/profile routes with `users:read` guard and keeping endpoint-level role checks for privileged mutations.

4. Manager onboarding document upload blocked by role policy:
- Manager fallback had `documents:read` only, preventing checklist evidence upload.
- Fixed manager fallback to `documents:write` (implies read), and reseeded role-module policies.

## Automated Tests Added/Updated
- `src/middleware/onboardingGate.test.ts` (new)
- `src/middleware/auth.onboarding-gate.test.ts` (new)
- `src/services/moduleAccess.service.test.ts` (updated with manager documents-write assertion)
- `src/routes/documents.routes.notifications.test.ts` (updated with `isRequired` coercion coverage)

## Commands Run
- `npm run test -- src/middleware/onboardingGate.test.ts src/middleware/auth.onboarding-gate.test.ts src/services/moduleAccess.service.test.ts src/routes/documents.routes.notifications.test.ts src/routes/index.access-coverage.test.ts`
- `npm run build`
- `npm run seed:uat-team`

