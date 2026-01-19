/**
 * Time entry endpoint validators
 * Reusable validation chains for time entry operations
 */

import { body, param, query } from "express-validator";

/**
 * Validators for POST /time-entries - Create time entry
 */
export const createTimeEntryValidators = [
  body("jobId")
    .isInt({ min: 1 })
    .withMessage("Valid jobId (integer) required"),

  body("taskId")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Valid taskId required if provided"),

  body("employeeProfileId")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Valid employeeProfileId required if provided"),

  body("dateWorked")
    .isISO8601()
    .withMessage("Valid dateWorked (ISO8601) required"),

  body("startedAt")
    .optional()
    .isISO8601()
    .withMessage("Valid startedAt (ISO8601) required if provided"),

  body("endedAt")
    .optional()
    .isISO8601()
    .withMessage("Valid endedAt (ISO8601) required if provided"),

  body("hours")
    .isDecimal({ min: 0.25 })
    .withMessage("Hours must be >= 0.25"),

  body("billable")
    .optional()
    .isBoolean()
    .withMessage("Billable must be a boolean"),

  body("description")
    .optional()
    .isString()
    .trim(),

  body("requestedAdditionalHours")
    .optional()
    .isDecimal({ min: 0.25 })
    .withMessage("Requested additional hours must be >= 0.25 if provided"),
];

/**
 * Validators for PATCH /time-entries/:timeEntryId - Update time entry
 */
export const updateTimeEntryValidators = [
  param("timeEntryId")
    .isInt({ min: 1 })
    .withMessage("Valid timeEntryId (integer) required"),

  body("hours")
    .optional()
    .isDecimal({ min: 0.25 })
    .withMessage("Hours must be >= 0.25 if provided"),

  body("description")
    .optional()
    .isString()
    .trim(),

  body("billable")
    .optional()
    .isBoolean()
    .withMessage("Billable must be a boolean"),

  body("status")
    .optional()
    .isIn(["pending", "submitted", "approved", "rejected", "cancelled"])
    .withMessage("Status must be one of: pending, submitted, approved, rejected, cancelled"),
];

/**
 * Validators for GET /time-entries/:timeEntryId - Get single time entry
 */
export const getTimeEntryParamValidator = [
  param("timeEntryId")
    .isInt({ min: 1 })
    .withMessage("Valid timeEntryId (integer) required"),
];

/**
 * Validators for GET /time-entries - List time entries
 */
export const listTimeEntriesValidators = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be >= 1"),

  query("pageSize")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Page size must be between 1-100"),

  query("jobId")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Valid jobId required if provided"),

  query("employeeProfileId")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Valid employeeProfileId required if provided"),

  query("status")
    .optional()
    .isIn(["pending", "submitted", "approved", "rejected", "cancelled"])
    .withMessage("Status must be one of: pending, submitted, approved, rejected, cancelled"),

  query("fromDate")
    .optional()
    .isISO8601()
    .withMessage("Valid fromDate (ISO8601) required if provided"),

  query("toDate")
    .optional()
    .isISO8601()
    .withMessage("Valid toDate (ISO8601) required if provided"),

  query("sortBy")
    .optional()
    .isIn(["dateWorked", "createdAt", "hours"])
    .withMessage("SortBy must be one of: dateWorked, createdAt, hours"),

  query("sortOrder")
    .optional()
    .isIn(["asc", "desc"])
    .withMessage("SortOrder must be: asc or desc"),
];

/**
 * Validators for PATCH /time-entries/:timeEntryId/submit - Submit time entry
 */
export const submitTimeEntryValidator = [
  param("timeEntryId")
    .isInt({ min: 1 })
    .withMessage("Valid timeEntryId (integer) required"),

  body("notes")
    .optional()
    .isString()
    .trim(),
];

/**
 * Validators for PATCH /time-entries/:timeEntryId/approve - Approve time entry
 */
export const approveTimeEntryValidator = [
  param("timeEntryId")
    .isInt({ min: 1 })
    .withMessage("Valid timeEntryId (integer) required"),

  body("approved")
    .isBoolean()
    .withMessage("Approved must be a boolean"),

  body("notes")
    .optional()
    .isString()
    .trim(),
];

/**
 * Validators for POST /time-entries/:timeEntryId/request-more-time - Request additional hours
 */
export const requestMoreTimeValidators = [
  param("timeEntryId")
    .isInt({ min: 1 })
    .withMessage("Valid timeEntryId (integer) required"),

  body("additionalHours")
    .isDecimal({ min: 0.25 })
    .withMessage("Additional hours must be >= 0.25"),

  body("billable")
    .optional()
    .isBoolean()
    .withMessage("Billable must be a boolean"),

  body("justification")
    .isString()
    .trim()
    .isLength({ min: 5 })
    .withMessage("Justification required (minimum 5 characters)"),
];

/**
 * Validators for DELETE /time-entries/:timeEntryId - Delete time entry
 */
export const deleteTimeEntryValidator = [
  param("timeEntryId")
    .isInt({ min: 1 })
    .withMessage("Valid timeEntryId (integer) required"),
];

/**
 * Validators for POST /time-entries/timer/start - Start timer
 */
export const startTimeEntryTimerValidators = [
  body("jobId")
    .isInt({ min: 1 })
    .withMessage("Valid jobId (integer) required"),

  body("taskId")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Valid taskId required if provided"),

  body("description")
    .optional()
    .isString()
    .trim(),

  body("billable")
    .optional()
    .isBoolean()
    .withMessage("Billable must be a boolean"),
];

/**
 * Validators for PATCH /time-entries/timer/:timerId/stop - Stop timer
 */
export const stopTimeEntryTimerValidators = [
  param("timerId")
    .isInt({ min: 1 })
    .withMessage("Valid timerId (integer) required"),

  body("notes")
    .optional()
    .isString()
    .trim(),
];
