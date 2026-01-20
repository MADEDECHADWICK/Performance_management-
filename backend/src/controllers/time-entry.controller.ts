import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { TimeEntryService } from '../services/time-entry.service';
import { successResponse, errorResponse, paginatedResponse } from '../utils/response';

export class TimeEntryController {
  /**
   * GET /time-entries
   * List time entries accessible to user
   */
  static async listTimeEntries(req: AuthRequest, res: Response): Promise<void> {
    try {
      const page = Number(req.query.page) || 1;
      const pageSize = Number(req.query.pageSize) || 10;
      const status = (req.query.status as string) || undefined;
      const jobId = req.query.jobId ? Number(req.query.jobId) : undefined;
      const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined;
      const dateTo = req.query.dateTo ? new Date(req.query.dateTo as string) : undefined;

      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const result = await TimeEntryService.listTimeEntries(
        {
          page,
          pageSize,
          status,
          jobId,
          dateFrom,
          dateTo,
        },
        auth
      );

      res.json(
        paginatedResponse(result.timeEntries, result.total, page, pageSize)
      );
    } catch (error: any) {
      res.status(error.statusCode || 500).json(
        errorResponse(error.message, error.statusCode || 500)
      );
    }
  }

  /**
   * POST /time-entries
   * Create a new time entry
   */
  static async createTimeEntry(req: AuthRequest, res: Response): Promise<void> {
    try {
      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const timeEntry = await TimeEntryService.createTimeEntry(req.body, auth);

      res.status(201).json(
        successResponse(timeEntry, 'Time entry created successfully', 201)
      );
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400)
      );
    }
  }

  /**
   * GET /time-entries/:timeEntryId
   * Get a specific time entry
   */
  static async getTimeEntry(req: AuthRequest, res: Response): Promise<void> {
    try {
      const timeEntryId = Number(req.params.timeEntryId);

      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const timeEntry = await TimeEntryService.getTimeEntry(timeEntryId, auth);

      res.json(successResponse(timeEntry, 'Time entry retrieved'));
    } catch (error: any) {
      res.status(error.statusCode || 500).json(
        errorResponse(error.message, error.statusCode || 500)
      );
    }
  }

  /**
   * PATCH /time-entries/:timeEntryId
   * Update time entry (only before submission)
   */
  static async updateTimeEntry(req: AuthRequest, res: Response): Promise<void> {
    try {
      const timeEntryId = Number(req.params.timeEntryId);

      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const timeEntry = await TimeEntryService.updateTimeEntry(
        timeEntryId,
        req.body,
        auth
      );

      res.json(
        successResponse(timeEntry, 'Time entry updated successfully')
      );
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400)
      );
    }
  }

  /**
   * DELETE /time-entries/:timeEntryId
   * Delete time entry (only before approval)
   */
  static async deleteTimeEntry(req: AuthRequest, res: Response): Promise<void> {
    try {
      const timeEntryId = Number(req.params.timeEntryId);

      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      await TimeEntryService.deleteTimeEntry(timeEntryId, auth);

      res.json(successResponse(null, 'Time entry deleted successfully'));
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400)
      );
    }
  }

  /**
   * PATCH /time-entries/:timeEntryId/submit
   * Submit time entry for approval
   */
  static async submitTimeEntry(req: AuthRequest, res: Response): Promise<void> {
    try {
      const timeEntryId = Number(req.params.timeEntryId);

      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const timeEntry = await TimeEntryService.submitTimeEntry(
        timeEntryId,
        auth
      );

      res.json(
        successResponse(timeEntry, 'Time entry submitted for approval')
      );
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400)
      );
    }
  }

  /**
   * PATCH /time-entries/:timeEntryId/approve
   * Approve time entry (managers/partners only)
   */
  static async approveTimeEntry(req: AuthRequest, res: Response): Promise<void> {
    try {
      const timeEntryId = Number(req.params.timeEntryId);
      const { approval_notes } = req.body;

      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const timeEntry = await TimeEntryService.approveTimeEntry(
        timeEntryId,
        approval_notes || '',
        auth
      );

      res.json(
        successResponse(timeEntry, 'Time entry approved successfully')
      );
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400)
      );
    }
  }

  /**
   * PATCH /time-entries/:timeEntryId/reject
   * Reject time entry with reason
   */
  static async rejectTimeEntry(req: AuthRequest, res: Response): Promise<void> {
    try {
      const timeEntryId = Number(req.params.timeEntryId);
      const { rejection_reason } = req.body;

      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const timeEntry = await TimeEntryService.rejectTimeEntry(
        timeEntryId,
        rejection_reason,
        auth
      );

      res.json(successResponse(timeEntry, 'Time entry rejected'));
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400)
      );
    }
  }

  /**
   * POST /time-entries/:timeEntryId/timer/start
   * Start real-time timer
   */
  static async startTimer(req: AuthRequest, res: Response): Promise<void> {
    try {
      const timeEntryId = Number(req.params.timeEntryId);

      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const timeEntry = await TimeEntryService.startTimer(timeEntryId, auth);

      res.json(successResponse(timeEntry, 'Timer started', 200));
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400)
      );
    }
  }

  /**
   * POST /time-entries/:timeEntryId/timer/stop
   * Stop real-time timer and calculate hours
   */
  static async stopTimer(req: AuthRequest, res: Response): Promise<void> {
    try {
      const timeEntryId = Number(req.params.timeEntryId);

      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const timeEntry = await TimeEntryService.stopTimer(timeEntryId, auth);

      res.json(
        successResponse(timeEntry, 'Timer stopped, time calculated')
      );
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400)
      );
    }
  }

  /**
   * POST /time-entries/batch/submit
   * Batch submit multiple time entries
   */
  static async batchSubmitTimeEntries(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { time_entry_ids } = req.body;

      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const result = await TimeEntryService.batchSubmitTimeEntries(
        time_entry_ids,
        auth
      );

      res.json(
        successResponse(result, `${result.submitted} time entries submitted`)
      );
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400)
      );
    }
  }

  /**
   * POST /time-entries/batch/approve
   * Batch approve multiple time entries
   */
  static async batchApproveTimeEntries(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { time_entry_ids } = req.body;

      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const result = await TimeEntryService.batchApproveTimeEntries(
        time_entry_ids,
        auth
      );

      res.json(
        successResponse(result, `${result.approved} time entries approved`)
      );
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400)
      );
    }
  }

  /**
   * GET /time-entries/job/:jobId/summary
   * Get time entry summary for a job
   */
  static async getJobTimeSummary(req: AuthRequest, res: Response): Promise<void> {
    try {
      const jobId = Number(req.params.jobId);

      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const summary = await TimeEntryService.getJobTimeSummary(jobId, auth);

      res.json(successResponse(summary, 'Job time summary retrieved'));
    } catch (error: any) {
      res.status(error.statusCode || 500).json(
        errorResponse(error.message, error.statusCode || 500)
      );
    }
  }
}
