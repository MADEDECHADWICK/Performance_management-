/**
 * Time Entry Controller
 * Handles all time entry operations including tracking, approval, and budget enforcement
 */

import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { TimeEntryService } from "../services/time-entry.service";
import { successResponse, errorResponse, paginatedResponse } from "../utils/response";

export class TimeEntryController {
  static async listTimeEntries(req: AuthRequest, res: Response): Promise<void> {
    try {
      const page = Number(req.query.page) || 1;
      const pageSize = Number(req.query.pageSize) || 10;
      const status = req.query.status as string | undefined;
      const jobId = req.query.jobId ? Number(req.query.jobId) : undefined;
      const employeeProfileId = req.query.employeeProfileId ? Number(req.query.employeeProfileId) : undefined;

      const result = await TimeEntryService.listTimeEntries(
        { page, pageSize, status, jobId, employeeProfileId },
        req.user!.profileId
      );

      res.json(paginatedResponse(result.timeEntries, result.total, page, pageSize, "Time entries retrieved successfully"));
    } catch (error) {
      console.error("TimeEntryController.listTimeEntries error:", error);
      res.status(500).json(errorResponse("Failed to retrieve time entries", 500));
    }
  }

  static async createTimeEntry(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { jobId, hours, description, entryDate } = req.body;
      const budgetValidation = (req as any).budgetValidation;
      const budgetWarning = (req as any).budgetWarning;

      const result = await TimeEntryService.createTimeEntry(
        { jobId, employeeProfileId: req.user!.profileId, hours, description, entryDate },
        req.user!.profileId,
        budgetValidation
      );

      const response = successResponse(result, "Time entry created successfully", 201);
      if (budgetWarning) {
        (response as any).warning = budgetWarning;
      }

      res.status(201).json(response);
    } catch (error: any) {
      console.error("TimeEntryController.createTimeEntry error:", error);
      if (error.message.includes("not assigned")) {
        res.status(403).json(errorResponse("You are not assigned to this job", 403));
        return;
      }
      if (error.message.includes("exceeds daily limit")) {
        res.status(400).json(errorResponse(error.message, 400));
        return;
      }
      if (error.message.includes("Budget exceeded")) {
        res.status(400).json(errorResponse(error.message, 400));
        return;
      }
      res.status(400).json(errorResponse(error.message || "Failed to create time entry", 400));
    }
  }

  static async getTimeEntry(req: AuthRequest, res: Response): Promise<void> {
    try {
      const timeEntryId = Number(req.params.timeEntryId);
      const result = await TimeEntryService.getTimeEntryById(timeEntryId, req.user!.profileId);
      if (!result) {
        res.status(404).json(errorResponse("Time entry not found", 404));
        return;
      }
      res.json(successResponse(result, "Time entry retrieved successfully"));
    } catch (error) {
      console.error("TimeEntryController.getTimeEntry error:", error);
      res.status(500).json(errorResponse("Failed to retrieve time entry", 500));
    }
  }

  static async updateTimeEntry(req: AuthRequest, res: Response): Promise<void> {
    try {
      const timeEntryId = Number(req.params.timeEntryId);
      const { hours, description } = req.body;
      const budgetValidation = (req as any).budgetValidation;

      const result = await TimeEntryService.updateTimeEntry(
        timeEntryId,
        { hours, description },
        req.user!.profileId,
        budgetValidation
      );

      res.json(successResponse(result, "Time entry updated successfully"));
    } catch (error: any) {
      console.error("TimeEntryController.updateTimeEntry error:", error);
      if (error.message.includes("not found")) {
        res.status(404).json(errorResponse(error.message, 404));
        return;
      }
      if (error.message.includes("forbidden")) {
        res.status(403).json(errorResponse(error.message, 403));
        return;
      }
      if (error.message.includes("Budget exceeded")) {
        res.status(400).json(errorResponse(error.message, 400));
        return;
      }
      res.status(400).json(errorResponse(error.message || "Failed to update time entry", 400));
    }
  }

  static async deleteTimeEntry(req: AuthRequest, res: Response): Promise<void> {
    try {
      const timeEntryId = Number(req.params.timeEntryId);
      await TimeEntryService.deleteTimeEntry(timeEntryId, req.user!.profileId);
      res.json(successResponse(null, "Time entry deleted successfully"));
    } catch (error: any) {
      console.error("TimeEntryController.deleteTimeEntry error:", error);
      if (error.message.includes("not found")) {
        res.status(404).json(errorResponse(error.message, 404));
        return;
      }
      if (error.message.includes("forbidden")) {
        res.status(403).json(errorResponse(error.message, 403));
        return;
      }
      res.status(400).json(errorResponse(error.message || "Failed to delete time entry", 400));
    }
  }

  static async submitTimeEntry(req: AuthRequest, res: Response): Promise<void> {
    try {
      const timeEntryId = Number(req.params.timeEntryId);
      const result = await TimeEntryService.submitTimeEntry(timeEntryId, req.user!.profileId);
      res.json(successResponse(result, "Time entry submitted successfully"));
    } catch (error: any) {
      console.error("TimeEntryController.submitTimeEntry error:", error);
      if (error.message.includes("not found")) {
        res.status(404).json(errorResponse(error.message, 404));
        return;
      }
      if (error.message.includes("already submitted")) {
        res.status(409).json(errorResponse(error.message, 409));
        return;
      }
      res.status(400).json(errorResponse(error.message || "Failed to submit time entry", 400));
    }
  }

  static async approveTimeEntry(req: AuthRequest, res: Response): Promise<void> {
    try {
      const timeEntryId = Number(req.params.timeEntryId);
      const { approvalNotes } = req.body;
      const result = await TimeEntryService.approveTimeEntry(timeEntryId, req.user!.profileId, approvalNotes);
      res.json(successResponse(result, "Time entry approved successfully"));
    } catch (error: any) {
      console.error("TimeEntryController.approveTimeEntry error:", error);
      if (error.message.includes("not found")) {
        res.status(404).json(errorResponse(error.message, 404));
        return;
      }
      if (error.message.includes("not pending")) {
        res.status(409).json(errorResponse(error.message, 409));
        return;
      }
      if (error.message.includes("forbidden")) {
        res.status(403).json(errorResponse(error.message, 403));
        return;
      }
      res.status(400).json(errorResponse(error.message || "Failed to approve time entry", 400));
    }
  }

  static async startTimer(req: AuthRequest, res: Response): Promise<void> {
    try {
      const timeEntryId = Number(req.params.timeEntryId);
      const result = await TimeEntryService.startTimer(timeEntryId, req.user!.profileId);
      res.json(successResponse(result, "Timer started"));
    } catch (error: any) {
      console.error("TimeEntryController.startTimer error:", error);
      if (error.message.includes("not found")) {
        res.status(404).json(errorResponse(error.message, 404));
        return;
      }
      if (error.message.includes("already running")) {
        res.status(409).json(errorResponse(error.message, 409));
        return;
      }
      res.status(400).json(errorResponse(error.message || "Failed to start timer", 400));
    }
  }

  static async stopTimer(req: AuthRequest, res: Response): Promise<void> {
    try {
      const timeEntryId = Number(req.params.timeEntryId);
      const result = await TimeEntryService.stopTimer(timeEntryId, req.user!.profileId);
      res.json(successResponse(result, "Timer stopped"));
    } catch (error: any) {
      console.error("TimeEntryController.stopTimer error:", error);
      if (error.message.includes("not found")) {
        res.status(404).json(errorResponse(error.message, 404));
        return;
      }
      if (error.message.includes("not running")) {
        res.status(409).json(errorResponse(error.message, 409));
        return;
      }
      res.status(400).json(errorResponse(error.message || "Failed to stop timer", 400));
    }
  }

  static async batchSubmitTimeEntries(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { timeEntryIds } = req.body;
      const result = await TimeEntryService.batchSubmitTimeEntries(timeEntryIds, req.user!.profileId);
      res.json(successResponse(result, "Time entries submitted in batch"));
    } catch (error: any) {
      console.error("TimeEntryController.batchSubmitTimeEntries error:", error);
      res.status(400).json(errorResponse(error.message || "Failed to submit time entries", 400));
    }
  }

  static async batchApproveTimeEntries(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { timeEntryIds } = req.body;
      const result = await TimeEntryService.batchApproveTimeEntries(timeEntryIds, req.user!.profileId);
      res.json(successResponse(result, "Time entries approved in batch"));
    } catch (error: any) {
      console.error("TimeEntryController.batchApproveTimeEntries error:", error);
      if (error.message.includes("forbidden")) {
        res.status(403).json(errorResponse(error.message, 403));
        return;
      }
      res.status(400).json(errorResponse(error.message || "Failed to approve time entries", 400));
    }
  }

  static async requestMoreTime(req: AuthRequest, res: Response): Promise<void> {
    try {
      const timeEntryId = Number(req.params.timeEntryId);
      const { reason, requestedHours } = req.body;
      const result = await TimeEntryService.requestMoreTime(
        timeEntryId,
        { reason, requestedHours },
        req.user!.profileId
      );
      res.status(201).json(successResponse(result, "Overage request created", 201));
    } catch (error: any) {
      console.error("TimeEntryController.requestMoreTime error:", error);
      if (error.message.includes("not found")) {
        res.status(404).json(errorResponse(error.message, 404));
        return;
      }
      res.status(400).json(errorResponse(error.message || "Failed to request more time", 400));
    }
  }
}