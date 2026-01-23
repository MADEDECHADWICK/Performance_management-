/**
 * Job Controller (v2.1 Schema Aligned)
 * Handles all job-related operations
 */

import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import jobService from "../services/jobs.service";
import { successResponse, errorResponse, paginatedResponse } from "../utils/response";

export class JobController {
  /**
   * GET /jobs
   * List all jobs with filtering and pagination
   */
  static async listJobs(req: AuthRequest, res: Response): Promise<void> {
    try {
      const page = Number(req.query.page) || 1;
      const pageSize = Number(req.query.pageSize) || 10;
      const statusParam = (req.query.status as string) || undefined;
      const clientId = req.query.clientId ? Number(req.query.clientId) : undefined;
      const status = statusParam
        ? statusParam.split(",").map((value) => value.trim()).filter(Boolean)
        : undefined;

      const auth = {
        userId: req.user!.userId,
        profileId: req.user!.profileId!,
        roles: (req as any).userRoles || req.user?.authRoles || [],
      };

      const result = await jobService.listJobs(
        { 
          page, 
          pageSize, 
          filters: { status, clientId } 
        },
        auth
      );

      res.json(paginatedResponse(result.jobs, result.total, page, pageSize));
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

      const job = await jobService.getJobById(jobId);

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
   */
  static async createJob(req: AuthRequest, res: Response): Promise<void> {
    try {
      const auth = {
        userId: req.user!.userId,
        profileId: req.user!.profileId!,
        roles: (req as any).userRoles || req.user?.authRoles || [],
      };

      const requesterRoles = auth.roles || [];
      const isManager = requesterRoles.includes("manager");

      const managerProfileId = req.body.managerProfileId ?? (isManager ? auth.profileId : undefined);

      if (!managerProfileId) {
        res.status(400).json(errorResponse("managerProfileId is required", 400));
        return;
      }

      const input = {
        ...req.body,
        managerProfileId,
      };

      const newJob = await jobService.createJob(input, auth);

      res.status(201).json(successResponse(newJob, "Job created successfully", 201));
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json(errorResponse(error.message, statusCode));
    }
  }

  /**
   * PATCH /jobs/:jobId
   * Update job
   */
  static async updateJob(req: AuthRequest, res: Response): Promise<void> {
    try {
      const jobId = Number(req.params.jobId);

      const auth = {
        userId: req.user!.userId,
        profileId: req.user!.profileId!,
        roles: (req as any).userRoles || req.user?.authRoles || [],
      };

      const updatedJob = await jobService.updateJob(jobId, req.body, auth);

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
        roles: (req as any).userRoles || req.user?.authRoles || [],
      };

      const updatedJob = await jobService.updateJobStatus(jobId, status, reason, auth);

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

      const costing = await jobService.getJobCosting(jobId);

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
   * POST /jobs/:jobId/costing
   * Create or update job costing and allocations
   */
  static async upsertJobCosting(req: AuthRequest, res: Response): Promise<void> {
    try {
      const jobId = Number(req.params.jobId);

      const auth = {
        userId: req.user!.userId,
        profileId: req.user!.profileId!,
        roles: (req as any).userRoles || req.user?.authRoles || [],
      };

      const costing = await jobService.upsertJobCosting(jobId, req.body, auth);

      res.json(successResponse(costing, "Job costing saved"));
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json(errorResponse(error.message, statusCode));
    }
  }

  /**
   * POST /jobs/:jobId/staff
   * Assign staff to job
   */
  static async assignStaff(req: AuthRequest, res: Response): Promise<void> {
    try {
      const jobId = Number(req.params.jobId);

      const auth = {
        userId: req.user!.userId,
        profileId: req.user!.profileId!,
        roles: (req as any).userRoles || req.user?.authRoles || [],
      };

      const assignment = await jobService.assignJobTeam(jobId, req.body, auth);

      res.status(201).json(successResponse(assignment, "Staff assigned successfully", 201));
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json(errorResponse(error.message, statusCode));
    }
  }

  /**
   * GET /jobs/:jobId/staff
   * Get all staff assignments for job
   */
  static async getStaffAssignments(req: AuthRequest, res: Response): Promise<void> {
    try {
      const jobId = Number(req.params.jobId);

      const assignments = await jobService.getJobStaff(jobId);

      res.json(successResponse(assignments, "Staff assignments retrieved"));
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json(errorResponse(error.message, statusCode));
    }
  }

  /**
   * PATCH /jobs/:jobId/staff/:assignmentId
   * Update staff assignment - simplified for now
   */
  static async updateStaffAssignment(req: AuthRequest, res: Response): Promise<void> {
    try {
      res.status(501).json(errorResponse("Not implemented - use assignStaff to reassign", 501));
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json(errorResponse(error.message, statusCode));
    }
  }

  /**
   * DELETE /jobs/:jobId/staff/:assignmentId
   * Remove staff assignment - simplified for now
   */
  static async removeStaffAssignment(req: AuthRequest, res: Response): Promise<void> {
    try {
      res.status(501).json(errorResponse("Not implemented", 501));
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json(errorResponse(error.message, statusCode));
    }
  }

  /**
   * GET /jobs/:jobId/profitability
   * Get job profitability analysis
   */
  static async getJobProfitability(req: AuthRequest, res: Response): Promise<void> {
    try {
      const jobId = Number(req.params.jobId);

      const profitability = await jobService.getJobProfitability(jobId);

      res.json(successResponse(profitability, "Job profitability retrieved"));
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json(errorResponse(error.message, statusCode));
    }
  }
}
