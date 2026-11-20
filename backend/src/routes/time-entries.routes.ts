import { Router } from "express";
import { TimeEntryController } from "../controllers/time-entry.controller";
import { authMiddleware } from "../middleware/auth";
import { loadProfile } from "../middleware/loadProfile";
import { requireTimeEntryAccess } from "../middleware/requireTimeEntryAccess";
import { requireJobAccess } from "../middleware/requireJobAccess";
import { requireModuleAccess } from "../middleware/requireModuleAccess";
import { validateRequest, handleValidationErrors } from "../middleware/validate";
import {
  createTimeEntryValidators,
  updateTimeEntryValidators,
  submitTimeEntryValidators,
  approveTimeEntryValidators,
  rejectTimeEntryValidators,
  timerStartValidators,
  timerStopValidators,
  batchSubmitValidators,
  listTimeEntriesValidators,
  getWeeklySummaryValidators,
  getJobSummaryValidators,
  getJobAllocationSummaryValidators,
  createApprovalRequestValidators,
  approvalRequestIdParamValidator,
} from "../validators/time-entry.validators";

const router = Router();

/**
 * GET /time-entries
 * List accessible time entries
 */
router.get(
  "/",
  authMiddleware,
  loadProfile,
  ...listTimeEntriesValidators,
  handleValidationErrors,
  TimeEntryController.listTimeEntries
);

/**
 * GET /time-entries/approval-requests
 * List approval requests
 */
router.get(
  "/approval-requests",
  authMiddleware,
  loadProfile,
  TimeEntryController.listApprovalRequests
);

/**
 * POST /time-entries/approval-requests
 * Request additional hours
 */
router.post(
  "/approval-requests",
  authMiddleware,
  loadProfile,
  ...createApprovalRequestValidators,
  handleValidationErrors,
  TimeEntryController.createApprovalRequest
);

/**
 * PATCH /time-entries/approval-requests/:requestId/approve
 * Approve additional hours
 */
router.patch(
  "/approval-requests/:requestId/approve",
  authMiddleware,
  loadProfile,
  requireModuleAccess("time_entries", "approve"),
  ...approvalRequestIdParamValidator,
  handleValidationErrors,
  TimeEntryController.approveApprovalRequest
);

/**
 * PATCH /time-entries/approval-requests/:requestId/reject
 * Reject additional hours
 */
router.patch(
  "/approval-requests/:requestId/reject",
  authMiddleware,
  loadProfile,
  requireModuleAccess("time_entries", "approve"),
  ...approvalRequestIdParamValidator,
  handleValidationErrors,
  TimeEntryController.rejectApprovalRequest
);

/**
 * GET /time-entries/over-budget-requests
 * List allocation-excess requests
 */
router.get(
  "/over-budget-requests",
  authMiddleware,
  loadProfile,
  TimeEntryController.listOverBudgetRequests
);

/**
 * PATCH /time-entries/over-budget-requests/:requestId/approve
 * Approve over-budget request (manager stage or partner stage)
 */
router.patch(
  "/over-budget-requests/:requestId/approve",
  authMiddleware,
  loadProfile,
  requireModuleAccess("time_entries", "approve"),
  ...approvalRequestIdParamValidator,
  handleValidationErrors,
  TimeEntryController.approveOverBudgetRequest
);

/**
 * PATCH /time-entries/over-budget-requests/:requestId/reject
 * Reject over-budget request (manager stage or partner stage)
 */
router.patch(
  "/over-budget-requests/:requestId/reject",
  authMiddleware,
  loadProfile,
  requireModuleAccess("time_entries", "approve"),
  ...approvalRequestIdParamValidator,
  handleValidationErrors,
  TimeEntryController.rejectOverBudgetRequest
);

/**
 * POST /time-entries
 * Create new time entry
 */
router.post(
  "/",
  authMiddleware,
  loadProfile,
  ...createTimeEntryValidators,
  handleValidationErrors,
  TimeEntryController.createTimeEntry
);

/**
 * GET /time-entries/my
 * List authenticated user's own time entries
 */
router.get(
  "/my",
  authMiddleware,
  loadProfile,
  ...listTimeEntriesValidators,
  handleValidationErrors,
  TimeEntryController.listMyTimeEntries
);

/**
 * GET /time-entries/weekly-summary
 * Get weekly summary for current user scope
 */
router.get(
  "/weekly-summary",
  authMiddleware,
  loadProfile,
  ...getWeeklySummaryValidators,
  handleValidationErrors,
  TimeEntryController.getWeeklySummary
);

/**
 * GET /time-entries/non-billable-activities
 * List active non-billable activities usable without a job
 */
router.get(
  "/non-billable-activities",
  authMiddleware,
  loadProfile,
  TimeEntryController.listNonBillableActivities
);

/**
 * GET /time-entries/utilization
 * Billable/non-billable threshold summary by period
 */
router.get(
  "/utilization",
  authMiddleware,
  loadProfile,
  TimeEntryController.getUtilization
);

/**
 * GET /time-entries/:timeEntryId
 * Get specific time entry
 */
router.get(
  "/:timeEntryId",
  authMiddleware,
  loadProfile,
  requireTimeEntryAccess,
  TimeEntryController.getTimeEntry
);

/**
 * PATCH /time-entries/:timeEntryId
 * Update time entry (draft only)
 */
router.patch(
  "/:timeEntryId",
  authMiddleware,
  loadProfile,
  requireTimeEntryAccess,
  ...updateTimeEntryValidators,
  handleValidationErrors,
  TimeEntryController.updateTimeEntry
);

/**
 * DELETE /time-entries/:timeEntryId
 * Delete time entry
 */
router.delete(
  "/:timeEntryId",
  authMiddleware,
  loadProfile,
  requireTimeEntryAccess,
  TimeEntryController.deleteTimeEntry
);

/**
 * PATCH /time-entries/:timeEntryId/submit
 * Submit for approval
 */
router.patch(
  "/:timeEntryId/submit",
  authMiddleware,
  loadProfile,
  requireTimeEntryAccess,
  ...submitTimeEntryValidators,
  handleValidationErrors,
  TimeEntryController.submitTimeEntry
);

/**
 * PATCH /time-entries/:timeEntryId/approve
 * Approve time entry (manager/partner only)
 */
router.patch(
  "/:timeEntryId/approve",
  authMiddleware,
  loadProfile,
  requireModuleAccess("time_entries", "approve"),
  requireTimeEntryAccess,
  ...approveTimeEntryValidators,
  handleValidationErrors,
  TimeEntryController.approveTimeEntry
);

/**
 * PATCH /time-entries/:timeEntryId/reject
 * Reject time entry
 */
router.patch(
  "/:timeEntryId/reject",
  authMiddleware,
  loadProfile,
  requireModuleAccess("time_entries", "approve"),
  requireTimeEntryAccess,
  ...rejectTimeEntryValidators,
  handleValidationErrors,
  TimeEntryController.rejectTimeEntry
);

/**
 * POST /time-entries/:timeEntryId/timer/start
 * Start timer
 */
router.post(
  "/:timeEntryId/timer/start",
  authMiddleware,
  loadProfile,
  requireTimeEntryAccess,
  ...timerStartValidators,
  handleValidationErrors,
  TimeEntryController.startTimer
);

/**
 * POST /time-entries/:timeEntryId/timer/stop
 * Stop timer
 */
router.post(
  "/:timeEntryId/timer/stop",
  authMiddleware,
  loadProfile,
  requireTimeEntryAccess,
  ...timerStopValidators,
  handleValidationErrors,
  TimeEntryController.stopTimer
);

/**
 * POST /time-entries/batch/submit
 * Batch submit
 */
router.post(
  "/batch/submit",
  authMiddleware,
  loadProfile,
  ...batchSubmitValidators,
  handleValidationErrors,
  TimeEntryController.batchSubmitTimeEntries
);

/**
 * POST /time-entries/batch/approve
 * Batch approve (manager/partner only)
 */
router.post(
  "/batch/approve",
  authMiddleware,
  loadProfile,
  requireModuleAccess("time_entries", "approve"),
  handleValidationErrors,
  TimeEntryController.batchApproveTimeEntries
);

/**
 * GET /time-entries/job/:jobId/summary
 * Get job time summary
 */
router.get(
  "/job/:jobId/summary",
  authMiddleware,
  loadProfile,
  ...getJobSummaryValidators,
  handleValidationErrors,
  TimeEntryController.getJobTimeSummary
);

/**
 * GET /time-entries/job/:jobId/allocation
 * Get job allocation summary
 */
router.get(
  "/job/:jobId/allocation",
  authMiddleware,
  loadProfile,
  ...getJobAllocationSummaryValidators,
  handleValidationErrors,
  TimeEntryController.getJobAllocationSummary
);

export default router;
