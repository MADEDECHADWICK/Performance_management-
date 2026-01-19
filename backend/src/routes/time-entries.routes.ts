/**
 * Time Entry Routes
 * Endpoints for time tracking, approval workflows, and budget enforcement
 */

import { Router } from "express";
import { TimeEntryController } from "../controllers/time-entry.controller";
import { authenticated, withRoles, withTimeEntryAccess } from "../utils/middleware";
import { validateRequest, handleValidationErrors } from "../middleware/validate";
import {
  createTimeEntryValidators,
  updateTimeEntryValidators,
  submitTimeEntryValidators,
  approveTimeEntryValidators,
  timerStartValidators,
  timerStopValidators,
  batchSubmitValidators,
  batchApproveValidators,
  requestMoreTimeValidators,
} from "../validators/time-entry.validators";
import { validateTimeEntryBudget } from "../middleware/validateTimeEntryBudget";

const router = Router();

/**
 * GET /time-entries
 * List all accessible time entries
 * Query: page, pageSize, status, jobId, employeeProfileId
 */
router.get(
  "/",
  authenticated(),
  TimeEntryController.listTimeEntries
);

/**
 * POST /time-entries
 * Create new time entry with budget validation
 * Body: jobId, hours, description, entryDate
 * Requires: employee, manager, or admin
 */
router.post(
  "/",
  authenticated(),
  validateRequest(createTimeEntryValidators),
  handleValidationErrors,
  validateTimeEntryBudget,
  TimeEntryController.createTimeEntry
);

/**
 * GET /time-entries/:timeEntryId
 * Get single time entry details
 * Access: entry employee, job manager/partner, or admin
 */
router.get(
  "/:timeEntryId",
  withTimeEntryAccess(),
  TimeEntryController.getTimeEntry
);

/**
 * PATCH /time-entries/:timeEntryId
 * Update time entry (hours, description)
 * Only allowed before submission
 * Body: hours, description
 */
router.patch(
  "/:timeEntryId",
  withTimeEntryAccess(),
  validateRequest(updateTimeEntryValidators),
  handleValidationErrors,
  validateTimeEntryBudget,
  TimeEntryController.updateTimeEntry
);

/**
 * DELETE /time-entries/:timeEntryId
 * Delete time entry
 * Only allowed before approval
 */
router.delete(
  "/:timeEntryId",
  withTimeEntryAccess(),
  TimeEntryController.deleteTimeEntry
);

/**
 * PATCH /time-entries/:timeEntryId/submit
 * Submit time entry for approval
 * Triggers workflow if budget exceeded
 */
router.patch(
  "/:timeEntryId/submit",
  withTimeEntryAccess(),
  validateRequest(submitTimeEntryValidators),
  handleValidationErrors,
  TimeEntryController.submitTimeEntry
);

/**
 * PATCH /time-entries/:timeEntryId/approve
 * Approve submitted time entry
 * Access: job manager/partner or admin only
 * Body: approvalNotes (optional)
 */
router.patch(
  "/:timeEntryId/approve",
  authenticated(),
  validateRequest(approveTimeEntryValidators),
  handleValidationErrors,
  TimeEntryController.approveTimeEntry
);

/**
 * POST /time-entries/:timeEntryId/timer/start
 * Start real-time timer for time entry
 */
router.post(
  "/:timeEntryId/timer/start",
  withTimeEntryAccess(),
  validateRequest(timerStartValidators),
  handleValidationErrors,
  TimeEntryController.startTimer
);

/**
 * POST /time-entries/:timeEntryId/timer/stop
 * Stop real-time timer and calculate elapsed time
 */
router.post(
  "/:timeEntryId/timer/stop",
  withTimeEntryAccess(),
  validateRequest(timerStopValidators),
  handleValidationErrors,
  TimeEntryController.stopTimer
);

/**
 * POST /time-entries/batch/submit
 * Bulk submit multiple time entries
 * Body: timeEntryIds (array)
 */
router.post(
  "/batch/submit",
  authenticated(),
  validateRequest(batchSubmitValidators),
  handleValidationErrors,
  TimeEntryController.batchSubmitTimeEntries
);

/**
 * POST /time-entries/batch/approve
 * Bulk approve multiple time entries
 * Access: manager/partner or admin only
 * Body: timeEntryIds (array)
 */
router.post(
  "/batch/approve",
  withRoles("manager", "partner", "admin"),
  validateRequest(batchApproveValidators),
  handleValidationErrors,
  TimeEntryController.batchApproveTimeEntries
);

/**
 * POST /time-entries/:timeEntryId/request-more-time
 * Request overage approval for budget exceeded entry
 * Body: reason, requestedHours
 */
router.post(
  "/:timeEntryId/request-more-time",
  withTimeEntryAccess(),
  validateRequest(requestMoreTimeValidators),
  handleValidationErrors,
  TimeEntryController.requestMoreTime
);

export default router;
