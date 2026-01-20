/**
 * Job Controller (v2.1 Schema Aligned)
 * Handles all job-related operations
 */

import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { JobService } from "../services/job.service";
import { successResponse, errorResponse, paginatedResponse } from "../utils/response";

export class JobController {
  /**
   * GET /jobs
   * List all jobs with filtering and pagination
   * Access: Admin, Manager, Partner (filtered to own jobs), Staff (assigned jobs only)
   */
  static async listJobs(req: AuthRequest, res: Response): Promise<void> {
    try {
      const page = Number(req.query.page) || 1;
      const pageSize = Number(req.query.pageSize) || 10;
      const status = (req.query.status as string) || undefined;
      const clientId = req.query.clientId ? Number(req.query.clientId) : undefined;
      const departmentId = req.query.departmentId ? Number(req.query.departmentId) : undefined;

      const auth = {
        userId: req.user!.userId,
        profileId: req.user!.profileId!,
        roles: (req as any).userRoles || [],
      };

      const result = await JobService.listJobs(
        { page, pageSize, status, clientId, departmentId },
        auth
      );

      res.json(
        paginatedResponse(result.jobs, result.total, page, pageSize)
      );
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json(errorResponse(error.message, statusCode));
    }
  }

  /**
   * GET /jobs/:jobId
   * Get single job with full details
   */
  static async getJob(req: AuthRequest, res: Response): Promise<void> {
    try {
      const jobId = Number(req.params.jobId);

      const auth = {
        userId: req.user!.userId,
        profileId: req.user!.profileId!,
        roles: (req as any).userRoles || [],
      };

      const job = await JobService.getJob(jobId, auth);

      if (!job) {
        res.status(404).json(errorResponse("Job not found", 404));
        return;
      }

      res.json(successResponse(job, "Job retrieved successfully"));
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json(errorResponse(error.message, statusCode));
    }
  }

  /**
   * POST /jobs
   * Create new job
   * Access: Admin, Manager, Partner
   */
  static async createJob(req: AuthRequest, res: Response): Promise<void> {
    try {
      const auth = {
        userId: req.user!.userId,
        profileId: req.user!.profileId!,
        roles: (req as any).userRoles || [],
      };

      const newJob = await JobService.createJob(req.body, auth);

      res.status(201).json(
        successResponse(newJob, "Job created successfully", 201)
      );
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json(errorResponse(error.message, statusCode));
    }
  }

  /**
   * PATCH /jobs/:jobId
   * Update job
   * Access: Admin, Manager (own jobs), Partner (own jobs)
   */
  static async updateJob(req: AuthRequest, res: Response): Promise<void> {
    try {
      const jobId = Number(req.params.jobId);

      const auth = {
        userId: req.user!.userId,
        profileId: req.user!.profileId!,
        roles: (req as any).userRoles || [],
      };

      const updatedJob = await JobService.updateJob(jobId, req.body, auth);

      res.json(successResponse(updatedJob, "Job updated successfully"));
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json(errorResponse(error.message, statusCode));
    }
  }

  /**
   * PATCH /jobs/:jobId/status
   * Update job status with workflow
   */
  static async updateJobStatus(req: AuthRequest, res: Response): Promise<void> {
    try {
      const jobId = Number(req.params.jobId);
      const { status, reason } = req.body;

      const auth = {
        userId: req.user!.userId,
        profileId: req.user!.profileId!,
        roles: (req as any).userRoles || [],
      };

      const updatedJob = await JobService.updateJobStatus(
        jobId,
        status,
        reason,
        auth
      );

      res.json(successResponse(updatedJob, "Job status updated"));
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json(errorResponse(error.message, statusCode));
    }
  }

  /**
   * GET /jobs/:jobId/costing
   * Get job costing details
   */
  static async getJobCosting(req: AuthRequest, res: Response): Promise<void> {
    try {
      const jobId = Number(req.params.jobId);

      const auth = {
        userId: req.user!.userId,
        profileId: req.user!.profileId!,
        roles: (req as any).userRoles || [],
      };

      const costing = await JobService.getJobCosting(jobId, auth);

      if (!costing) {
        res.status(404).json(errorResponse("Job costing not found", 404));
        return;
      }

      res.json(successResponse(costing, "Job costing retrieved"));
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json(errorResponse(error.message, statusCode));
    }
  }

  /**
   * POST /jobs/:jobId/staff-assignments
   * Assign staff to job
   */
  static async assignStaff(req: AuthRequest, res: Response): Promise<void> {
    try {
      const jobId = Number(req.params.jobId);

      const auth = {
        userId: req.user!.userId,
        profileId: req.user!.profileId!,
        roles: (req as any).userRoles || [],
      };

      const assignment = await JobService.assignStaff(jobId, req.body, auth);

      res.status(201).json(
        successResponse(assignment, "Staff assigned successfully", 201)
      );
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json(errorResponse(error.message, statusCode));
    }
  }

  /**
   * GET /jobs/:jobId/staff-assignments
   * Get all staff assignments for job
   */
  static async getStaffAssignments(
    req: AuthRequest,
    res: Response
  ): Promise<void> {
    try {
      const jobId = Number(req.params.jobId);

      const assignments = await JobService.getStaffAssignments(jobId);

      res.json(successResponse(assignments, "Staff assignments retrieved"));
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json(errorResponse(error.message, statusCode));
    }
  }

  /**
   * PATCH /jobs/:jobId/staff-assignments/:assignmentId
   * Update staff assignment
   */
  static async updateStaffAssignment(
    req: AuthRequest,
    res: Response
  ): Promise<void> {
    try {
      const jobId = Number(req.params.jobId);
      const assignmentId = Number(req.params.assignmentId);

      const auth = {
        userId: req.user!.userId,
        profileId: req.user!.profileId!,
        roles: (req as any).userRoles || [],
      };

      const updated = await JobService.updateStaffAssignment(
        jobId,
        assignmentId,
        req.body,
        auth
      );

      res.json(successResponse(updated, "Staff assignment updated"));
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json(errorResponse(error.message, statusCode));
    }
  }

  /**
   * DELETE /jobs/:jobId/staff-assignments/:assignmentId
   * Remove staff assignment
   */
  static async removeStaffAssignment(
    req: AuthRequest,
    res: Response
  ): Promise<void> {
    try {
      const jobId = Number(req.params.jobId);
      const assignmentId = Number(req.params.assignmentId);

      const auth = {
        userId: req.user!.userId,
        profileId: req.user!.profileId!,
        roles: (req as any).userRoles || [],
      };

      await JobService.removeStaffAssignment(jobId, assignmentId, auth);

      res.json(successResponse(null, "Staff assignment removed"));
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json(errorResponse(error.message, statusCode));
    }
  }

  /**
   * GET /jobs/:jobId/profitability
   * Get job profitability analysis
   */
  static async getJobProfitability(
    req: AuthRequest,
    res: Response
  ): Promise<void> {
    try {
      const jobId = Number(req.params.jobId);

      const auth = {
        userId: req.user!.userId,
        profileId: req.user!.profileId!,
        roles: (req as any).userRoles || [],
      };

      const profitability = await JobService.getJobProfitability(jobId, auth);

      res.json(successResponse(profitability, "Job profitability retrieved"));
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json(errorResponse(error.message, statusCode));
    }
  }
}