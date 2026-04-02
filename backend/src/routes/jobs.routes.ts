/**
 * Jobs API Routes
 * Core job management endpoints with access control and validation
 */

import { Router } from "express";
import { JobController } from "../controllers/job.controller";
import { authenticated, withRoles } from "../utils/middleware";
import { validateRequest, handleValidationErrors } from "../middleware/validate";
import { requireJobAccess } from "../middleware/requireJobAccess";
import {
  createJobValidators,
  updateJobValidators,
  listJobsValidators,
  getJobParamValidator,
  updateJobStatusValidator,
  assignJobTeamValidators,
  updateJobStaffAssignmentValidators,
  removeJobStaffAssignmentValidators,
  upsertJobCostingValidators,
  reviewJobCostingValidators,
  createJobFromOnboardingValidators,
  getJobTimeEntriesValidators,
} from "../validators/job.validators";

const router = Router();

/**
 * GET /jobs
 * List all jobs
 */
router.get(
  "/",
  ...authenticated(),
  validateRequest(listJobsValidators),
  handleValidationErrors,
  JobController.listJobs
);

/**
 * POST /jobs
 * Create new job
 */
router.post(
  "/",
  withRoles("hr", "super_admin"),
  validateRequest(createJobValidators),
  handleValidationErrors,
  JobController.createJob
);

/**
 * POST /jobs/from-onboarding/:clientOnboardingId
 * Create a job directly from approved client onboarding (HR queue)
 */
router.post(
  "/from-onboarding/:clientOnboardingId",
  withRoles("hr", "super_admin"),
  validateRequest(createJobFromOnboardingValidators),
  handleValidationErrors,
  JobController.createJobFromOnboarding
);

/**
 * GET /jobs/:jobId
 * Get job details
 */
router.get(
  "/:jobId",
  ...authenticated(),
  requireJobAccess("view"),
  JobController.getJob
);

/**
 * GET /jobs/:jobId/invoice-milestones
 * Get milestone-based invoice tracking for a job
 */
router.get(
  "/:jobId/invoice-milestones",
  ...authenticated(),
  requireJobAccess("view"),
  JobController.getInvoiceMilestones
);

/**
 * GET /jobs/:jobId/invoices
 * Get invoices generated for a job
 */
router.get(
  "/:jobId/invoices",
  ...authenticated(),
  requireJobAccess("view"),
  JobController.getJobInvoices
);

/**
 * POST /jobs/:jobId/invoices/from-milestone/:milestoneTaskId
 * Create or return a draft invoice for a milestone
 */
router.post(
  "/:jobId/invoices/from-milestone/:milestoneTaskId",
  ...authenticated(),
  requireJobAccess("view"),
  JobController.createJobInvoiceDraft
);

/**
 * PATCH /jobs/:jobId/invoices/:invoiceId/issue
 * Issue an invoice for client billing
 */
router.patch(
  "/:jobId/invoices/:invoiceId/issue",
  ...authenticated(),
  requireJobAccess("view"),
  JobController.issueJobInvoice
);

/**
 * PATCH /jobs/:jobId
 * Update job
 */
router.patch(
  "/:jobId",
  ...authenticated(),
  requireJobAccess("manage"),
  validateRequest(updateJobValidators),
  handleValidationErrors,
  JobController.updateJob
);

/**
 * PATCH /jobs/:jobId/status
 * Update job status
 */
router.patch(
  "/:jobId/status",
  ...authenticated(),
  requireJobAccess("manage"),
  validateRequest(updateJobStatusValidator),
  handleValidationErrors,
  JobController.updateJobStatus
);

/**
 * PATCH /jobs/:jobId/invoice-milestones/:milestoneTaskId/status
 * Update invoice milestone condition status
 */
router.patch(
  "/:jobId/invoice-milestones/:milestoneTaskId/status",
  ...authenticated(),
  requireJobAccess("manage"),
  JobController.updateInvoiceMilestoneStatus
);

/**
 * GET /jobs/:jobId/costing
 * Get job costing details
 */
router.get(
  "/:jobId/costing",
  ...authenticated(),
  requireJobAccess("view"),
  JobController.getJobCosting
);

/**
 * POST /jobs/:jobId/costing
 * Create or update job costing + allocations
 */
router.post(
  "/:jobId/costing",
  ...authenticated(),
  requireJobAccess("manage"),
  validateRequest(upsertJobCostingValidators),
  handleValidationErrors,
  JobController.upsertJobCosting
);

router.patch(
  "/:jobId/costing/review",
  ...authenticated(),
  requireJobAccess("manage"),
  validateRequest(reviewJobCostingValidators),
  handleValidationErrors,
  JobController.reviewJobCosting
);

/**
 * POST /jobs/:jobId/staff
 * Assign staff to job
 */
router.post(
  "/:jobId/staff",
  ...authenticated(),
  requireJobAccess("manage"),
  validateRequest(assignJobTeamValidators),
  handleValidationErrors,
  JobController.assignStaff
);

/**
 * GET /jobs/:jobId/staff
 * Get staff assignments
 */
router.get(
  "/:jobId/staff",
  ...authenticated(),
  requireJobAccess("view"),
  JobController.getStaffAssignments
);

/**
 * PATCH /jobs/:jobId/staff/:assignmentId
 * Update staff assignment
 */
router.patch(
  "/:jobId/staff/:assignmentId",
  ...authenticated(),
  requireJobAccess("manage"),
  validateRequest(updateJobStaffAssignmentValidators),
  handleValidationErrors,
  JobController.updateStaffAssignment
);

/**
 * DELETE /jobs/:jobId/staff/:assignmentId
 * Remove staff assignment
 */
router.delete(
  "/:jobId/staff/:assignmentId",
  ...authenticated(),
  requireJobAccess("manage"),
  validateRequest(removeJobStaffAssignmentValidators),
  handleValidationErrors,
  JobController.removeStaffAssignment
);

/**
 * GET /jobs/:jobId/profitability
 * Get job profitability analysis
 */
router.get(
  "/:jobId/profitability",
  ...authenticated(),
  requireJobAccess("view"),
  JobController.getJobProfitability
);

/**
 * GET /jobs/:jobId/time-entries
 * Get job time entries with pagination/filtering
 */
router.get(
  "/:jobId/time-entries",
  ...authenticated(),
  requireJobAccess("view"),
  validateRequest(getJobTimeEntriesValidators),
  handleValidationErrors,
  JobController.getJobTimeEntries
);

/**
 * GET /jobs/:jobId/utilization
 * Get job utilization metrics
 */
router.get(
  "/:jobId/utilization",
  ...authenticated(),
  requireJobAccess("view"),
  validateRequest(getJobParamValidator),
  handleValidationErrors,
  JobController.getJobUtilization
);

/**
 * GET /jobs/:jobId/budget-status
 * Get allocated vs logged budget status
 */
router.get(
  "/:jobId/budget-status",
  ...authenticated(),
  requireJobAccess("view"),
  validateRequest(getJobParamValidator),
  handleValidationErrors,
  JobController.getJobBudgetStatus
);

/**
 * GET /jobs/:jobId/revenue-allocations
 * Get job revenue allocations
 */
router.get(
  "/:jobId/revenue-allocations",
  ...authenticated(),
  requireJobAccess("view"),
  validateRequest(getJobParamValidator),
  handleValidationErrors,
  JobController.getJobRevenueAllocations
);

/**
 * GET /jobs/:jobId/tracking
 * Unified workflow tracking view
 */
router.get(
  "/:jobId/tracking",
  ...authenticated(),
  requireJobAccess("view"),
  validateRequest(getJobParamValidator),
  handleValidationErrors,
  JobController.getJobWorkflowTracking
);

export default router;

