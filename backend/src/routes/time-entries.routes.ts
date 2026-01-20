import { Router } from "express";
import { TimeEntryController } from "../controllers/time-entry.controller";
import { authMiddleware } from "../middleware/auth";
import { loadProfile } from "../middleware/loadProfile";
import { requireTimeEntryAccess } from "../middleware/requireTimeEntryAccess";
import { requireJobAccess } from "../middleware/requireJobAccess";
import { requireRole } from "../middleware/reqiureRole";
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
  batchApproveValidators,
  listTimeEntriesValidators,
  getJobSummaryValidators,
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
  requireRole(["manager", "partner", "admin"]),
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
  requireRole(["manager", "partner", "admin"]),
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
  requireRole(["manager", "partner", "admin"]),
  ...batchApproveValidators,
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

export default router;
