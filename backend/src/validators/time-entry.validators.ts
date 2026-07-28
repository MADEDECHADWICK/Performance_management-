/**
 * Time entry endpoint validators (Schema v2.1 aligned)
 */

import { body, param, query } from "express-validator";

const nonBillableCategories = ["leave", "public_holiday", "internal", "training", "over_budget", "other"];
const nonBillableCategoryMessage =
  "nonBillableCategory must be one of: leave, public_holiday, internal, training, over_budget, other";

/**
 * Common param validator
 */
export const timeEntryIdParamValidator = [
  param("timeEntryId")
    .isInt({ min: 1 })
    .withMessage("Valid timeEntryId (integer) required"),
];

/**
 * GET /time-entries
 * Query: page, pageSize, status, jobId, employeeProfileId
 */
export const listTimeEntriesValidators = [
  query("page").optional().isInt({ min: 1 }).withMessage("Page must be >= 1"),
  query("pageSize").optional().isInt({ min: 1, max: 100 }).withMessage("Page size must be 1-100"),

  query("jobId").optional().isInt({ min: 1 }).withMessage("Valid jobId required if provided"),
  query("employeeProfileId").optional().isInt({ min: 1 }).withMessage("Valid employeeProfileId required if provided"),

  query("status")
    .optional()
    .isIn(["pending", "submitted", "approved", "rejected", "cancelled"])
    .withMessage("Status must be one of: pending, submitted, approved, rejected, cancelled"),
];

export const getWeeklySummaryValidators = [
  query("weekStart")
    .isISO8601()
    .withMessage("weekStart must be a valid ISO8601 date"),
];

/**
 * POST /time-entries
 * Body:
 * - jobId or proposalId (required)
 * - taskId (optional)
 * - dateWorked (required ISO8601 date)
 * - Either:
 *    A) hours (>= 0.25)
 *    OR
 *    B) startedAt + endedAt (ISO8601 datetime)
 * - billable (optional boolean)
 * - description (optional string)
 *
 * IMPORTANT:
 * - employeeProfileId MUST NOT be in body; server uses req.user.profileId
 */
export const createTimeEntryValidators = [
  body("jobId").optional({ nullable: true }).isInt({ min: 1 }).withMessage("Valid jobId required if provided"),

  body("proposalId").optional({ nullable: true }).isInt({ min: 1 }).withMessage("Valid proposalId required if provided"),

  body("taskId").optional({ nullable: true }).isInt({ min: 1 }).withMessage("Valid taskId required if provided"),

  body("dateWorked").isISO8601().withMessage("Valid dateWorked (ISO8601) required"),

  body("hours")
    .optional({ nullable: true })
    .isFloat({ min: 0.25 })
    .withMessage("Hours must be >= 0.25 if provided"),

  body("startedAt")
    .optional({ nullable: true })
    .isISO8601()
    .withMessage("Valid startedAt (ISO8601) required if provided"),

  body("endedAt")
    .optional({ nullable: true })
    .isISO8601()
    .withMessage("Valid endedAt (ISO8601) required if provided"),

  body("billable")
    .optional({ nullable: true })
    .isBoolean()
    .withMessage("Billable must be a boolean"),

  body("nonBillableCategory")
    .optional({ nullable: true })
    .isIn(nonBillableCategories)
    .withMessage(nonBillableCategoryMessage),

  body("description")
    .optional({ nullable: true })
    .isString()
    .trim()
    .isLength({ min: 1, max: 2000 })
    .withMessage("Description must be 1-2000 characters if provided"),

  // Enforce: hours OR (startedAt & endedAt)
  body().custom((value) => {
    const hasJob = value.jobId !== undefined && value.jobId !== null && value.jobId !== "";
    const hasProposal = value.proposalId !== undefined && value.proposalId !== null && value.proposalId !== "";

    if (hasJob && hasProposal) {
      throw new Error("Provide either jobId or proposalId, not both");
    }

    if (!hasJob && !hasProposal) {
      throw new Error("Provide either jobId or proposalId");
    }

    if (hasProposal && value.taskId) {
      throw new Error("taskId is only valid for job time entries");
    }

    return true;
  }),

  body().custom((value) => {
    const hasHours = value.hours !== undefined && value.hours !== null && value.hours !== "";
    const hasStarted = value.startedAt !== undefined && value.startedAt !== null && value.startedAt !== "";
    const hasEnded = value.endedAt !== undefined && value.endedAt !== null && value.endedAt !== "";

    if (!hasHours && !(hasStarted && hasEnded)) {
      throw new Error("Provide either 'hours' OR both 'startedAt' and 'endedAt'");
    }

    if (hasHours && (hasStarted || hasEnded)) {
      throw new Error("Provide either 'hours' OR ('startedAt' and 'endedAt'), not both");
    }

    return true;
  }),

  // Optional sanity: endedAt must be after startedAt when both exist
  body().custom((value) => {
    if (value.startedAt && value.endedAt) {
      const s = new Date(value.startedAt).getTime();
      const e = new Date(value.endedAt).getTime();
      if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) {
        throw new Error("'endedAt' must be after 'startedAt'");
      }
    }
    return true;
  }),

  body().custom((value) => {
    if (value.billable === false && !value.nonBillableCategory) {
      throw new Error(
        "nonBillableCategory is required when billable is false (leave, public_holiday, internal, training, over_budget, other)"
      );
    }
    return true;
  }),
];

/**
 * PATCH /time-entries/:timeEntryId
 * Editable fields ONLY (no status changes from client)
 * Body: hours?, description?, billable?, taskId?, dateWorked?, startedAt?, endedAt?
 */
export const updateTimeEntryValidators = [
  ...timeEntryIdParamValidator,

  body("taskId").optional({ nullable: true }).isInt({ min: 1 }).withMessage("Valid taskId required if provided"),

  body("dateWorked").optional({ nullable: true }).isISO8601().withMessage("dateWorked must be ISO8601"),

  body("hours")
    .optional({ nullable: true })
    .isFloat({ min: 0.25 })
    .withMessage("Hours must be >= 0.25 if provided"),

  body("startedAt")
    .optional({ nullable: true })
    .isISO8601()
    .withMessage("startedAt must be ISO8601 if provided"),

  body("endedAt")
    .optional({ nullable: true })
    .isISO8601()
    .withMessage("endedAt must be ISO8601 if provided"),

  body("billable")
    .optional({ nullable: true })
    .isBoolean()
    .withMessage("Billable must be a boolean"),

  body("nonBillableCategory")
    .optional({ nullable: true })
    .isIn(nonBillableCategories)
    .withMessage(nonBillableCategoryMessage),

  body("description")
    .optional({ nullable: true })
    .isString()
    .trim()
    .isLength({ min: 1, max: 2000 })
    .withMessage("Description must be 1-2000 characters if provided"),

  // Block status updates from client (status changes happen via submit/approve/reject endpoints)
  body("status").custom((val) => {
    if (val !== undefined) {
      throw new Error("Do not set 'status' directly. Use submit/approve/reject endpoints.");
    }
    return true;
  }),

  // If startedAt/endedAt provided, require both (avoid partial timer ranges)
  body().custom((value) => {
    const hasStarted = value.startedAt !== undefined;
    const hasEnded = value.endedAt !== undefined;

    // allow setting both to null (clearing) or both provided
    if (hasStarted !== hasEnded) {
      throw new Error("Provide both 'startedAt' and 'endedAt' together when updating timer range");
    }
    return true;
  }),

  // If both exist, ensure endedAt > startedAt
  body().custom((value) => {
    if (value.startedAt && value.endedAt) {
      const s = new Date(value.startedAt).getTime();
      const e = new Date(value.endedAt).getTime();
      if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) {
        throw new Error("'endedAt' must be after 'startedAt'");
      }
    }
    return true;
  }),

  body().custom((value) => {
    if (value.billable === false && !value.nonBillableCategory) {
      throw new Error(
        "nonBillableCategory is required when billable is false (leave, public_holiday, internal, training, over_budget, other)"
      );
    }
    return true;
  }),
];

/**
 * PATCH /time-entries/:timeEntryId/submit
 * No body needed (keep optional notes if you want, but schema doesn't store it on TimeEntry)
 */
export const submitTimeEntryValidators = [
  ...timeEntryIdParamValidator,

  body("notes")
    .optional({ nullable: true })
    .isString()
    .trim()
    .isLength({ min: 1, max: 2000 })
    .withMessage("Notes must be 1-2000 characters if provided"),
];

/**
 * PATCH /time-entries/:timeEntryId/approve
 * No `approved: boolean` - endpoint implies approval
 */
export const approveTimeEntryValidators = [
  ...timeEntryIdParamValidator,

  body("approvalNotes")
    .optional({ nullable: true })
    .isString()
    .trim()
    .isLength({ min: 1, max: 2000 })
    .withMessage("approvalNotes must be 1-2000 characters if provided"),
];

/**
 * PATCH /time-entries/:timeEntryId/reject
 * No `approved: boolean` - endpoint implies rejection
 */
export const rejectTimeEntryValidators = [
  ...timeEntryIdParamValidator,

  body("rejectionReason")
    .optional({ nullable: true })
    .isString()
    .trim()
    .isLength({ min: 1, max: 2000 })
    .withMessage("rejectionReason must be 1-2000 characters if provided"),
];

/**
 * POST /time-entries/:timeEntryId/timer/start
 * Uses timeEntryId (no timerId, no jobId)
 */
export const timerStartValidators = [
  ...timeEntryIdParamValidator,
];

/**
 * POST /time-entries/:timeEntryId/timer/stop
 * Uses timeEntryId (no timerId)
 */
export const timerStopValidators = [
  ...timeEntryIdParamValidator,
];

/**
 * POST /time-entries/batch/submit
 * Body: timeEntryIds: number[]
 */
export const batchSubmitValidators = [
  body("timeEntryIds")
    .isArray({ min: 1 })
    .withMessage("timeEntryIds must be a non-empty array"),

  body("timeEntryIds.*")
    .isInt({ min: 1 })
    .withMessage("Each timeEntryId must be an integer >= 1"),
];

/**
 * Approval request validators
 */
export const approvalRequestIdParamValidator = [
  param("requestId")
    .isInt({ min: 1 })
    .withMessage("Valid requestId (integer) required"),
];

export const createApprovalRequestValidators = [
  body("jobId")
    .isInt({ min: 1 })
    .withMessage("Valid jobId required"),

  body("additionalHours")
    .isFloat({ min: 0.25 })
    .withMessage("additionalHours must be >= 0.25"),

  body("justification")
    .isString()
    .trim()
    .isLength({ min: 5, max: 2000 })
    .withMessage("justification must be 5-2000 characters"),

  body("requestType")
    .optional()
    .isString()
    .trim()
    .isIn(["additional_hours", "over_budget"])
    .withMessage("requestType must be one of: additional_hours, over_budget"),
];

/**
 * Validators for creating time entry
 */
export const createTimeEntryV2Validators = [
  body("job_id")
    .isInt()
    .withMessage("job_id must be an integer")
    .toInt(),
  body("hours")
    .isFloat({ min: 0.25, max: 24 })
    .withMessage("hours must be between 0.25 and 24")
    .toFloat(),
  body("description")
    .optional()
    .isString()
    .trim()
    .isLength({ max: 1000 })
    .withMessage("description must not exceed 1000 characters"),
  body("date_worked")
    .isISO8601()
    .withMessage("date_worked must be a valid ISO 8601 date"),
  body("task_id")
    .optional()
    .isInt()
    .withMessage("task_id must be an integer if provided")
    .toInt(),
];

/**
 * Validators for updating time entry
 */
export const updateTimeEntryV2Validators = [
  param("timeEntryId")
    .isInt()
    .withMessage("timeEntryId must be an integer")
    .toInt(),
  body("hours")
    .optional()
    .isFloat({ min: 0.25, max: 24 })
    .withMessage("hours must be between 0.25 and 24")
    .toFloat(),
  body("description")
    .optional()
    .isString()
    .trim()
    .isLength({ max: 1000 })
    .withMessage("description must not exceed 1000 characters"),
];

/**
 * Validators for submitting time entry
 */
export const submitTimeEntryV2Validators = [
  param("timeEntryId")
    .isInt()
    .withMessage("timeEntryId must be an integer")
    .toInt(),
];

/**
 * Validators for approving time entry
 */
export const approveTimeEntryV2Validators = [
  param("timeEntryId")
    .isInt()
    .withMessage("timeEntryId must be an integer")
    .toInt(),
  body("approval_notes")
    .optional()
    .isString()
    .trim()
    .isLength({ max: 500 })
    .withMessage("approval_notes must not exceed 500 characters"),
];

/**
 * Validators for rejecting time entry
 */
export const rejectTimeEntryV2Validators = [
  param("timeEntryId")
    .isInt()
    .withMessage("timeEntryId must be an integer")
    .toInt(),
  body("rejection_reason")
    .isString()
    .trim()
    .isLength({ min: 5, max: 500 })
    .withMessage("rejection_reason must be between 5 and 500 characters"),
];

/**
 * Validators for starting timer
 */
export const timerStartV2Validators = [
  param("timeEntryId")
    .isInt()
    .withMessage("timeEntryId must be an integer")
    .toInt(),
];

/**
 * Validators for stopping timer
 */
export const timerStopV2Validators = [
  param("timeEntryId")
    .isInt()
    .withMessage("timeEntryId must be an integer")
    .toInt(),
];

/**
 * Validators for batch submit
 */
export const batchSubmitV2Validators = [
  body("time_entry_ids")
    .isArray({ min: 1, max: 100 })
    .withMessage("time_entry_ids must be an array with 1-100 items"),
  body("time_entry_ids.*")
    .isInt()
    .withMessage("Each time_entry_id must be an integer")
    .toInt(),
];

/**
 * Validators for batch approve
 */
export const batchApproveV2Validators = [
  body("time_entry_ids")
    .isArray({ min: 1, max: 100 })
    .withMessage("time_entry_ids must be an array with 1-100 items"),
  body("time_entry_ids.*")
    .isInt()
    .withMessage("Each time_entry_id must be an integer")
    .toInt(),
];

/**
 * Validators for list query parameters
 */
export const listTimeEntriesV2Validators = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("page must be a positive integer")
    .toInt(),
  query("pageSize")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("pageSize must be between 1 and 100")
    .toInt(),
  query("status")
    .optional()
    .isIn(["draft", "submitted", "approved", "rejected"])
    .withMessage("status must be one of: draft, submitted, approved, rejected"),
  query("jobId")
    .optional()
    .isInt()
    .withMessage("jobId must be an integer")
    .toInt(),
  query("dateFrom")
    .optional()
    .isISO8601()
    .withMessage("dateFrom must be a valid ISO 8601 date"),
  query("dateTo")
    .optional()
    .isISO8601()
    .withMessage("dateTo must be a valid ISO 8601 date"),
];

/**
 * Validators for getting job summary
 */
export const getJobSummaryValidators = [
  param("jobId")
    .isInt()
    .withMessage("jobId must be an integer")
    .toInt(),
];

export const getJobAllocationSummaryValidators = [
  param("jobId")
    .isInt()
    .withMessage("jobId must be an integer")
    .toInt(),
];
