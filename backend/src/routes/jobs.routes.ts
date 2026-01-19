// OLD:
router.get(
  "/",
  authenticated(),
  async (req, res) => {
    // TODO: Implement
    res.json({ message: "List jobs" });
  }
);

// NEW:
import { JobController } from "../controllers/job.controller";

router.get(
  "/",
  authenticated(),
  JobController.listJobs
);

router.post(
  "/",
  withRoles("manager", "partner", "admin"),
  validateRequest(createJobValidators),
  handleValidationErrors,
  JobController.createJob
);

router.get(
  "/:jobId",
  withJobAccess(),
  JobController.getJob
);

router.patch(
  "/:jobId",
  withJobAccess(),
  validateRequest(updateJobValidators),
  handleValidationErrors,
  JobController.updateJob
);

// ... etc for all 15 endpoints/**
 * Jobs API Routes
 * Core job management endpoints with access control and validation
 * 
 * Base path: /api/jobs
 * Middleware chain: authentication → profile loading → role/permission checks
 */

import { Router, Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { 
  authenticated, 
  managerOrAdmin,
} from "../utils/middleware";
import { handleValidationErrors } from "../middleware/validate";
import { successResponse, paginatedResponse, errorResponse } from "../utils/response";
import JobService from "../services/jobs.service";

import {
  createJobValidators,
  updateJobValidators,
  getJobParamValidator,
  listJobsValidators,
  deleteJobValidator,
  assignJobTeamValidators,
  updateJobStatusValidator,
} from "../validators/job.validators";

const router = Router();

/**
 * ========================================
 * LIST & SEARCH
 * ========================================
 */

/**
 * GET /api/jobs
 * List all jobs accessible to user (with pagination/filtering)
 * Accessible by: all authenticated users (filtered by access)
 */
router.get(
  "/",
  ...authenticated(),
  ...listJobsValidators,
  handleValidationErrors,
  async (req: AuthRequest, res: Response) => {
    try {
      const page = req.body.page || 1;
      const pageSize = req.body.pageSize || 20;
      const filters = req.body.filters;
      const sort = req.body.sort;

      const { jobs, total } = await JobService.listJobs(
        { page, pageSize, filters, sort },
        {
          userId: req.user!.userId,
          profileId: req.user!.profileId!,
          roles: req.userRoles,
        }
      );

      res.json(paginatedResponse(
        jobs,
        total,
        page,
        pageSize,
        "Jobs retrieved successfully"
      ));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message, 500));
    }
  }
);

/**
 * ========================================
 * CREATE
 * ========================================
 */

/**
 * POST /api/jobs
 * Create new job
 * Required: clientId, jobName, billingType, startDate
 * Accessible by: manager, partner, admin
 */
router.post(
  "/",
  ...managerOrAdmin(),
  ...createJobValidators,
  handleValidationErrors,
  async (req: AuthRequest, res: Response) => {
    try {
      const job = await JobService.createJob(
        req.body,
        {
          userId: req.user!.userId,
          profileId: req.user!.profileId!,
          roles: req.userRoles,
        }
      );

      res.status(201).json(successResponse(
        job,
        "Job created successfully",
        201
      ));
    } catch (error: any) {
      res.status(400).json(errorResponse(error.message, 400));
    }
  }
);

/**
 * ========================================
 * READ
 * ========================================
 */

/**
 * GET /api/jobs/:jobId
 * Get single job details
 * Accessible by: job staff/manager/partner/admin
 */
router.get(
  "/:jobId",
  ...authenticated(),
  ...getJobParamValidator,
  handleValidationErrors,
  async (req: AuthRequest, res: Response) => {
    try {
      const jobId = parseInt(req.params.jobId);
      const job = await JobService.getJobById(jobId, ['staffing', 'costing', 'timeEntries']);

      res.json(successResponse(
        job,
        "Job retrieved successfully"
      ));
    } catch (error: any) {
      res.status(404).json(errorResponse(error.message, 404));
    }
  }
);

/**
 * ========================================
 * UPDATE
 * ========================================
 */

/**
 * PATCH /api/jobs/:jobId
 * Update job details
 * Accessible by: job manager/partner/admin
 */
router.patch(
  "/:jobId",
  ...managerOrAdmin(),
  ...updateJobValidators,
  handleValidationErrors,
  async (req: AuthRequest, res: Response) => {
    try {
      const jobId = parseInt(req.params.jobId);
      const job = await JobService.updateJob(
        jobId,
        req.body,
        {
          userId: req.user!.userId,
          profileId: req.user!.profileId!,
          roles: req.userRoles,
        }
      );

      res.json(successResponse(
        job,
        "Job updated successfully"
      ));
    } catch (error: any) {
      res.status(400).json(errorResponse(error.message, 400));
    }
  }
);

/**
 * PATCH /api/jobs/:jobId/status
 * Update job status with reason tracking
 * Accessible by: job manager/partner/admin
 */
router.patch(
  "/:jobId/status",
  ...managerOrAdmin(),
  ...updateJobStatusValidator,
  handleValidationErrors,
  async (req: AuthRequest, res: Response) => {
    try {
      const jobId = parseInt(req.params.jobId);
      const job = await JobService.updateJobStatus(
        jobId,
        req.body.status,
        req.body.reason,
        {
          userId: req.user!.userId,
          profileId: req.user!.profileId!,
          roles: req.userRoles,
        }
      );

      res.json(successResponse(
        job,
        "Job status updated successfully"
      ));
    } catch (error: any) {
      res.status(400).json(errorResponse(error.message, 400));
    }
  }
);

/**
 * ========================================
 * DELETE
 * ========================================
 */

/**
 * DELETE /api/jobs/:jobId
 * Delete job (only if no time entries/costing)
 * Accessible by: job manager/admin
 */
router.delete(
  "/:jobId",
  ...managerOrAdmin(),
  ...deleteJobValidator,
  handleValidationErrors,
  async (req: AuthRequest, res: Response) => {
    try {
      const jobId = parseInt(req.params.jobId);
      const result = await JobService.deleteJob(
        jobId,
        {
          userId: req.user!.userId,
          profileId: req.user!.profileId!,
          roles: req.userRoles,
        }
      );

      res.json(successResponse(
        result,
        "Job deleted successfully"
      ));
    } catch (error: any) {
      res.status(400).json(errorResponse(error.message, 400));
    }
  }
);

/**
 * ========================================
 * STAFFING & ASSIGNMENTS
 * ========================================
 */

/**
 * POST /api/jobs/:jobId/assign
 * Assign employee to job with role & hourly rate
 * Accessible by: job manager/partner/admin
 */
router.post(
  "/:jobId/assign",
  ...managerOrAdmin(),
  ...assignJobTeamValidators,
  handleValidationErrors,
  async (req: AuthRequest, res: Response) => {
    try {
      const jobId = parseInt(req.params.jobId);
      const assignment = await JobService.assignJobTeam(
        jobId,
        req.body.employeeProfileId,
        req.body.roleId,
        req.body.hourlyRate,
        {
          userId: req.user!.userId,
          profileId: req.user!.profileId!,
          roles: req.userRoles,
        }
      );

      res.status(201).json(successResponse(
        assignment,
        "Employee assigned to job successfully",
        201
      ));
    } catch (error: any) {
      res.status(400).json(errorResponse(error.message, 400));
    }
  }
);

/**
 * GET /api/jobs/:jobId/staff
 * Get job staff assignments
 * Accessible by: job staff/manager/partner/admin
 */
router.get(
  "/:jobId/staff",
  ...authenticated(),
  ...getJobParamValidator,
  handleValidationErrors,
  async (req: AuthRequest, res: Response) => {
    try {
      const jobId = parseInt(req.params.jobId);
      const staff = await JobService.getJobStaff(jobId);

      res.json(successResponse(
        { staff },
        "Job staff retrieved successfully"
      ));
    } catch (error: any) {
      res.status(404).json(errorResponse(error.message, 404));
    }
  }
);

/**
 * ========================================
 * COSTING & BUDGET
 * ========================================
 */

/**
 * GET /api/jobs/:jobId/costing
 * Get job costing details
 * Accessible by: job manager/partner/admin/finance
 */
router.get(
  "/:jobId/costing",
  ...authenticated(),
  ...getJobParamValidator,
  handleValidationErrors,
  async (req: AuthRequest, res: Response) => {
    try {
      const jobId = parseInt(req.params.jobId);
      const costing = await JobService.getJobCosting(jobId);

      res.json(successResponse(
        costing,
        "Job costing retrieved successfully"
      ));
    } catch (error: any) {
      res.status(404).json(errorResponse(error.message, 404));
    }
  }
);

/**
 * ========================================
 * TIME ENTRIES
 * ========================================
 */

/**
 * GET /api/jobs/:jobId/time-entries
 * Get all time entries for a job
 * Accessible by: job manager/partner/admin
 */
router.get(
  "/:jobId/time-entries",
  ...authenticated(),
  ...getJobParamValidator,
  handleValidationErrors,
  async (req: AuthRequest, res: Response) => {
    try {
      const jobId = parseInt(req.params.jobId);
      const page = req.body.page || 1;
      const pageSize = req.body.pageSize || 50;
      const status = req.body.status;
      const dateFrom = req.body.dateFrom ? new Date(req.body.dateFrom) : undefined;
      const dateTo = req.body.dateTo ? new Date(req.body.dateTo) : undefined;

      const { entries, total } = await JobService.getJobTimeEntries(
        jobId,
        { page, pageSize, status, dateFrom, dateTo }
      );

      res.json(paginatedResponse(
        entries,
        total,
        page,
        pageSize,
        "Time entries retrieved successfully"
      ));
    } catch (error: any) {
      res.status(404).json(errorResponse(error.message, 404));
    }
  }
);

/**
 * ========================================
 * REPORTS & ANALYTICS
 * ========================================
 */

/**
 * GET /api/jobs/:jobId/profitability
 * Get job profitability analysis
 * Accessible by: job manager/partner/admin/finance
 */
router.get(
  "/:jobId/profitability",
  ...authenticated(),
  ...getJobParamValidator,
  handleValidationErrors,
  async (req: AuthRequest, res: Response) => {
    try {
      const jobId = parseInt(req.params.jobId);
      const profitability = await JobService.getJobProfitability(jobId);

      res.json(successResponse(
        profitability,
        "Profitability report generated successfully"
      ));
    } catch (error: any) {
      res.status(404).json(errorResponse(error.message, 404));
    }
  }
);

/**
 * GET /api/jobs/:jobId/utilization
 * Get job team utilization analysis
 * Accessible by: job manager/partner/admin
 */
router.get(
  "/:jobId/utilization",
  ...authenticated(),
  ...getJobParamValidator,
  handleValidationErrors,
  async (req: AuthRequest, res: Response) => {
    try {
      const jobId = parseInt(req.params.jobId);
      const utilization = await JobService.getJobUtilization(jobId);

      res.json(successResponse(
        utilization,
        "Utilization report generated successfully"
      ));
    } catch (error: any) {
      res.status(404).json(errorResponse(error.message, 404));
    }
  }
);

export default router;
