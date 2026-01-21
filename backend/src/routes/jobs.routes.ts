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
  assignJobTeamValidators,
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
  withRoles("manager", "partner", "admin"),
  validateRequest(createJobValidators),
  handleValidationErrors,
  JobController.createJob
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
  JobController.updateJobStatus
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

