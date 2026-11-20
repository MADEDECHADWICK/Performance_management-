/**
 * Job Controller
 * Handles all job-related operations
 */


import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import jobService from "../services/jobs.service";
import JobWorkingDocumentLinksService from "../services/jobWorkingDocumentLinks.service";
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
      const departmentId = req.query.departmentId ? Number(req.query.departmentId) : undefined;
      const partnerProfileId = req.query.partnerProfileId
        ? Number(req.query.partnerProfileId)
        : undefined;
      const managerProfileId = req.query.managerProfileId
        ? Number(req.query.managerProfileId)
        : undefined;
      const priority = req.query.priority ? String(req.query.priority).trim().toLowerCase() : undefined;
      const status = statusParam
        ? statusParam.split(",").map((value) => value.trim()).filter(Boolean)
        : undefined;

      const profileId = Number(req.profile?.id || req.user?.profileId || 0);
      if (!Number.isFinite(profileId) || profileId <= 0) {
        res.status(401).json(errorResponse("Profile is required for job access", 401));
        return;
      }

      const effectiveRoles = Array.from(
        new Set([...(req.userRoles || [])])
      );
      const auth = {
        userId: req.user!.userId,
        profileId,
        roles: effectiveRoles,
      };

      const result = await jobService.listJobs(
        { 
          page, 
          pageSize, 
          filters: {
            status,
            clientId,
            departmentId,
            partnerProfileId,
            managerProfileId,
            priority,
          },
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

      const [job, invoiceTracking] = await Promise.all([
        jobService.getJobById(jobId),
        jobService.getJobInvoiceMilestoneTracking(jobId),
      ]);

      if (!job) {
        res.status(404).json(errorResponse("Job not found", 404));
        return;
      }

      res.json(
        successResponse(
          {
            ...job,
            invoiceTracking,
          },
          "Job retrieved successfully"
        )
      );
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json(errorResponse(error.message, statusCode));
    }
  }

  /**
   * GET /jobs/:jobId/invoice-milestones
   * Get milestone-based invoice tracking for a job
   */
  static async getInvoiceMilestones(req: AuthRequest, res: Response): Promise<void> {
    try {
      const jobId = Number(req.params.jobId);
      if (!Number.isFinite(jobId) || jobId <= 0) {
        res.status(400).json(errorResponse("Valid jobId is required", 400));
        return;
      }
      const tracking = await jobService.getJobInvoiceMilestoneTracking(jobId);
      res.json(successResponse(tracking, "Job invoice milestones retrieved"));
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json(errorResponse(error.message, statusCode));
    }
  }

  /**
   * GET /jobs/:jobId/invoices
   * Get generated invoices for a job
   */
  static async getJobInvoices(req: AuthRequest, res: Response): Promise<void> {
    try {
      const jobId = Number(req.params.jobId);
      if (!Number.isFinite(jobId) || jobId <= 0) {
        res.status(400).json(errorResponse("Valid jobId is required", 400));
        return;
      }

      const invoices = await jobService.listJobInvoices(jobId);
      res.json(successResponse(invoices, "Job invoices retrieved"));
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json(errorResponse(error.message, statusCode));
    }
  }

  /**
   * POST /jobs/:jobId/invoices/from-milestone/:milestoneTaskId
   * Generate or return draft invoice for a billing milestone
   */
  static async createJobInvoiceDraft(req: AuthRequest, res: Response): Promise<void> {
    try {
      const jobId = Number(req.params.jobId);
      const milestoneTaskId = Number(req.params.milestoneTaskId);

      if (!Number.isFinite(jobId) || jobId <= 0) {
        res.status(400).json(errorResponse("Valid jobId is required", 400));
        return;
      }
      if (!Number.isFinite(milestoneTaskId) || milestoneTaskId <= 0) {
        res.status(400).json(errorResponse("Valid milestoneTaskId is required", 400));
        return;
      }

      const auth = {
        userId: req.user!.userId,
        profileId: req.user!.profileId!,
        roles: req.userRoles || [],
      };

      const invoice = await jobService.createJobInvoiceDraftForMilestone(jobId, milestoneTaskId, auth);
      res.status(201).json(successResponse(invoice, "Job invoice draft ready", 201));
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json(errorResponse(error.message, statusCode));
    }
  }

  /**
   * PATCH /jobs/:jobId/invoices/:invoiceId/issue
   * Issue a draft invoice and generate its document
   */
  static async issueJobInvoice(req: AuthRequest, res: Response): Promise<void> {
    try {
      const jobId = Number(req.params.jobId);
      const invoiceId = Number(req.params.invoiceId);

      if (!Number.isFinite(jobId) || jobId <= 0) {
        res.status(400).json(errorResponse("Valid jobId is required", 400));
        return;
      }
      if (!Number.isFinite(invoiceId) || invoiceId <= 0) {
        res.status(400).json(errorResponse("Valid invoiceId is required", 400));
        return;
      }

      const auth = {
        userId: req.user!.userId,
        profileId: req.user!.profileId!,
        roles: req.userRoles || [],
      };

      const invoice = await jobService.issueJobInvoice(jobId, invoiceId, auth);
      res.json(successResponse(invoice, "Job invoice issued"));
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json(errorResponse(error.message, statusCode));
    }
  }

  /**
   * PATCH /jobs/:jobId/invoice-milestones/:milestoneTaskId/status
   * Update job invoice milestone condition status
   */
  static async updateInvoiceMilestoneStatus(req: AuthRequest, res: Response): Promise<void> {
    try {
      const jobId = Number(req.params.jobId);
      const milestoneTaskId = Number(req.params.milestoneTaskId);
      const status = String(req.body?.status || "").trim();

      if (!Number.isFinite(jobId) || jobId <= 0) {
        res.status(400).json(errorResponse("Valid jobId is required", 400));
        return;
      }
      if (!Number.isFinite(milestoneTaskId) || milestoneTaskId <= 0) {
        res.status(400).json(errorResponse("Valid milestoneTaskId is required", 400));
        return;
      }

      if (!status) {
        res.status(400).json(errorResponse("status is required", 400));
        return;
      }

      const auth = {
        userId: req.user!.userId,
        profileId: req.user!.profileId!,
        roles: req.userRoles || [],
      };

      const result = await jobService.updateInvoiceMilestoneStatus(
        jobId,
        milestoneTaskId,
        status as any,
        auth
      );

      res.json(successResponse(result, "Invoice milestone status updated"));
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
        roles: req.userRoles || [],
      };
      const managerProfileId = req.body.managerProfileId;

      if (!managerProfileId) {
        res.status(400).json(errorResponse("managerProfileId is required", 400));
        return;
      }

      const input = {
        ...req.body,
        managerProfileId: Number(managerProfileId),
      };

      const newJob = await jobService.createJob(input, auth);

      res.status(201).json(successResponse(newJob, "Job created   successfully", 201));
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json(errorResponse(error.message, statusCode));
    }
  }

  /**
   * POST /jobs/from-onboarding/:clientOnboardingId
   * Create new job from approved client onboarding (HR queue)
   */
  static async createJobFromOnboarding(req: AuthRequest, res: Response): Promise<void> {
    try {
      const clientOnboardingId = Number(req.params.clientOnboardingId);

      if (!clientOnboardingId) {
        res.status(400).json(errorResponse("clientOnboardingId is required", 400));
        return;
      }

      const auth = {
        userId: req.user!.userId,
        profileId: req.user!.profileId!,
        roles: req.userRoles || [],
      };

      const managerProfileId = req.body.managerProfileId;
      if (!managerProfileId) {
        res.status(400).json(errorResponse("managerProfileId is required", 400));
        return;
      }

      const input = {
        ...req.body,
        managerProfileId: Number(managerProfileId),
      };

      const newJob = await jobService.createJobFromOnboarding(clientOnboardingId, input, auth);

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
        roles: req.userRoles || [],
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
      const { status, reason, allowIncompleteTasksOverride } = req.body;

      const auth = {
        userId: req.user!.userId,
        profileId: req.user!.profileId!,
        roles: req.userRoles || [],
      };

      const updatedJob = await jobService.updateJobStatus(jobId, status, reason, auth, {
        allowIncompleteTasksOverride: Boolean(allowIncompleteTasksOverride),
      });

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
        roles: req.userRoles || [],
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
        roles: req.userRoles || [],
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
   * Update staff assignment
   */
  static async updateStaffAssignment(req: AuthRequest, res: Response): Promise<void> {
    try {
      const jobId = Number(req.params.jobId);
      const assignmentId = Number(req.params.assignmentId);

      if (!Number.isFinite(jobId) || jobId <= 0) {
        res.status(400).json(errorResponse("Valid jobId is required", 400));
        return;
      }
      if (!Number.isFinite(assignmentId) || assignmentId <= 0) {
        res.status(400).json(errorResponse("Valid assignmentId is required", 400));
        return;
      }

      const auth = {
        userId: req.user!.userId,
        profileId: req.user!.profileId!,
        roles: req.userRoles || [],
      };

      const updated = await jobService.updateJobStaffAssignment(jobId, assignmentId, req.body || {}, auth);
      res.json(successResponse(updated, "Staff assignment updated"));
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json(errorResponse(error.message, statusCode));
    }
  }

  /**
   * DELETE /jobs/:jobId/staff/:assignmentId
   * Remove staff assignment
   */
  static async removeStaffAssignment(req: AuthRequest, res: Response): Promise<void> {
    try {
      const jobId = Number(req.params.jobId);
      const assignmentId = Number(req.params.assignmentId);

      if (!Number.isFinite(jobId) || jobId <= 0) {
        res.status(400).json(errorResponse("Valid jobId is required", 400));
        return;
      }
      if (!Number.isFinite(assignmentId) || assignmentId <= 0) {
        res.status(400).json(errorResponse("Valid assignmentId is required", 400));
        return;
      }

      const auth = {
        userId: req.user!.userId,
        profileId: req.user!.profileId!,
        roles: req.userRoles || [],
      };

      const result = await jobService.removeJobStaffAssignment(jobId, assignmentId, auth);
      res.json(successResponse(result, "Staff assignment removed"));
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json(errorResponse(error.message, statusCode));
    }
  }

  static async listWorkingLinks(req: AuthRequest, res: Response): Promise<void> {
    try {
      const jobId = Number(req.params.jobId);
      const links = await JobWorkingDocumentLinksService.list(jobId);
      res.json(successResponse(links, "Working document links retrieved"));
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json(errorResponse(error.message, statusCode));
    }
  }

  static async createWorkingLink(req: AuthRequest, res: Response): Promise<void> {
    try {
      const jobId = Number(req.params.jobId);
      const auth = {
        userId: req.user!.userId,
        profileId: req.user!.profileId!,
        roles: req.userRoles || [],
      };
      const link = await JobWorkingDocumentLinksService.create(
        jobId,
        req.body || {},
        auth
      );
      res.status(201).json(successResponse(link, "Working document link added", 201));
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json(errorResponse(error.message, statusCode));
    }
  }

  static async updateWorkingLink(req: AuthRequest, res: Response): Promise<void> {
    try {
      const jobId = Number(req.params.jobId);
      const linkId = Number(req.params.linkId);
      const auth = {
        userId: req.user!.userId,
        profileId: req.user!.profileId!,
        roles: req.userRoles || [],
      };
      const link = await JobWorkingDocumentLinksService.update(
        jobId,
        linkId,
        req.body || {},
        auth
      );
      res.json(successResponse(link, "Working document link updated"));
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json(errorResponse(error.message, statusCode));
    }
  }

  static async removeWorkingLink(req: AuthRequest, res: Response): Promise<void> {
    try {
      const jobId = Number(req.params.jobId);
      const linkId = Number(req.params.linkId);
      const auth = {
        userId: req.user!.userId,
        profileId: req.user!.profileId!,
        roles: req.userRoles || [],
      };
      const result = await JobWorkingDocumentLinksService.remove(jobId, linkId, auth);
      res.json(successResponse(result, "Working document link removed"));
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json(errorResponse(error.message, statusCode));
    }
  }

  static async reviewWorkingLink(req: AuthRequest, res: Response): Promise<void> {
    try {
      const jobId = Number(req.params.jobId);
      const linkId = Number(req.params.linkId);
      const auth = {
        userId: req.user!.userId,
        profileId: req.user!.profileId!,
        roles: req.userRoles || [],
      };
      const link = await JobWorkingDocumentLinksService.review(
        jobId,
        linkId,
        req.body || {},
        auth
      );
      res.json(successResponse(link, "Working document link reviewed"));
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

  /**
   * PATCH /jobs/:jobId/costing/review
   * Partner reviews submitted job costing package
   */
  static async reviewJobCosting(req: AuthRequest, res: Response): Promise<void> {
    try {
      const jobId = Number(req.params.jobId);

      const auth = {
        userId: req.user!.userId,
        profileId: req.user!.profileId!,
        roles: req.userRoles || [],
      };

      const costing = await jobService.reviewJobCosting(
        jobId,
        {
          decision: req.body?.decision,
          reviewNotes: req.body?.reviewNotes,
        },
        auth
      );

      res.json(successResponse(costing, "Job costing review updated"));
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json(errorResponse(error.message, statusCode));
    }
  }

  /**
   * GET /jobs/:jobId/time-entries
   * Get job time entries with pagination/filtering
   */
  static async getJobTimeEntries(req: AuthRequest, res: Response): Promise<void> {
    try {
      const jobId = Number(req.params.jobId);
      const page = Number(req.query.page) || 1;
      const pageSize = Number(req.query.pageSize) || 50;
      const status = req.query.status ? String(req.query.status) : undefined;
      const dateFrom = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : undefined;
      const dateTo = req.query.dateTo ? new Date(String(req.query.dateTo)) : undefined;

      const result = await jobService.getJobTimeEntries(jobId, {
        page,
        pageSize,
        status,
        dateFrom,
        dateTo,
      });

      res.json(
        paginatedResponse(
          result.entries,
          result.total,
          page,
          pageSize,
          "Job time entries retrieved"
        )
      );
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json(errorResponse(error.message, statusCode));
    }
  }

  /**
   * GET /jobs/:jobId/utilization
   * Get job utilization metrics
   */
  static async getJobUtilization(req: AuthRequest, res: Response): Promise<void> {
    try {
      const jobId = Number(req.params.jobId);
      const utilization = await jobService.getJobUtilization(jobId);
      res.json(successResponse(utilization, "Job utilization retrieved"));
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json(errorResponse(error.message, statusCode));
    }
  }

  /**
   * GET /jobs/:jobId/budget-status
   * Get allocated vs logged budget status
   */
  static async getJobBudgetStatus(req: AuthRequest, res: Response): Promise<void> {
    try {
      const jobId = Number(req.params.jobId);
      const budgetStatus = await jobService.getJobBudgetStatus(jobId);
      res.json(successResponse(budgetStatus, "Job budget status retrieved"));
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json(errorResponse(error.message, statusCode));
    }
  }

  /**
   * GET /jobs/:jobId/revenue-allocations
   * Get job revenue allocations
   */
  static async getJobRevenueAllocations(req: AuthRequest, res: Response): Promise<void> {
    try {
      const jobId = Number(req.params.jobId);
      const allocations = await jobService.getJobRevenueAllocations(jobId);
      res.json(successResponse(allocations, "Job revenue allocations retrieved"));
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json(errorResponse(error.message, statusCode));
    }
  }

  /**
   * GET /jobs/:jobId/tracking
   * Unified workflow tracking view
   */
  static async getJobWorkflowTracking(req: AuthRequest, res: Response): Promise<void> {
    try {
      const jobId = Number(req.params.jobId);
      const auth = {
        userId: req.user!.userId,
        profileId: req.profile?.id ?? req.user?.profileId ?? 0,
        roles: req.userRoles || [],
      };
      const tracking = await jobService.getJobWorkflowTracking(jobId, auth);
      res.json(successResponse(tracking, "Job tracking retrieved"));
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json(errorResponse(error.message, statusCode));
    }
  }
}
