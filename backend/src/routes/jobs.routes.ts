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
  updateJobStatusValidator,
  assignJobTeamValidators,
  updateJobStaffAssignmentValidators,
  removeJobStaffAssignmentValidators,
  upsertJobCostingValidators,
  createJobFromOnboardingValidators,
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
  withRoles("hr", "hr_manager", "admin", "super_admin"),
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
  withRoles("hr", "hr_manager", "admin", "super_admin"),
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
  withRoles("manager", "partner", "admin", "super_admin"),
  requireJobAccess("manage"),
  validateRequest(upsertJobCostingValidators),
  handleValidationErrors,
  JobController.upsertJobCosting
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

export default router;

