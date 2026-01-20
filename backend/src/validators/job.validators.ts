/**
 * Job endpoint validators
 * Reusable validation chains for job CRUD operations
 */

import { body, param, query } from "express-validator";

/**
 * Validators for POST /jobs - Create new job
 */
export const createJobValidators = [
  body("clientId")
    .isInt({ min: 1 })
    .withMessage("Valid clientId (integer) required"),

  body("jobName")
    .isString()
    .trim()
    .isLength({ min: 3, max: 255 })
    .withMessage("Job name required (3-255 characters)"),

  body("description")
    .optional()
    .isString()
    .trim(),

  body("departmentId")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Valid departmentId required if provided"),

  body("partnerProfileId")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Valid partnerProfileId required if provided"),

  body("managerProfileId")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Valid managerProfileId required if provided"),

  body("startDate")
    .isISO8601()
    .withMessage("Valid startDate (ISO8601) required"),

  body("dueDate")
    .optional()
    .isISO8601()
    .withMessage("Valid dueDate (ISO8601) required if provided"),

  body("priority")
    .optional()
    .isIn(["low", "medium", "high", "urgent"])
    .withMessage("Priority must be one of: low, medium, high, urgent"),

  body("billingType")
    .isIn(["hourly", "fixed_fee"])
    .withMessage("Billing type must be: hourly or fixed_fee"),

  body("fixedFeeAmount")
    .if(() => body("billingType").equals("fixed_fee"))
    .isFloat({ min: 0.01 })
    .withMessage("Fixed fee amount required and must be > 0"),

  body("budgetHours")
    .optional()
    .isFloat({ min: 0.01 })
    .withMessage("Budget hours must be >= 0 if provided"),

  body("engagementLetterId")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Valid engagementLetterId required if provided"),
];

/**
 * Validators for PATCH /jobs/:jobId - Update job
 */
export const updateJobValidators = [
  param("jobId")
    .isInt({ min: 1 })
    .withMessage("Valid jobId (integer) required"),

  body("jobName")
    .optional()
    .isString()
    .trim()
    .isLength({ min: 3, max: 255 })
    .withMessage("Job name must be 3-255 characters if provided"),

  body("description")
    .optional()
    .isString()
    .trim(),

  body("status")
    .optional()
    .isIn(["planned", "in_progress", "on_hold", "completed", "cancelled"])
    .withMessage("Status must be one of: planned, in_progress, on_hold, completed, cancelled"),

  body("priority")
    .optional()
    .isIn(["low", "medium", "high", "urgent"])
    .withMessage("Priority must be one of: low, medium, high, urgent"),

  body("managerProfileId")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Valid managerProfileId required if provided"),

  body("dueDate")
    .optional()
    .isISO8601()
    .withMessage("Valid dueDate (ISO8601) required if provided"),

  body("completionDate")
    .optional()
    .isISO8601()
    .withMessage("Valid completionDate (ISO8601) required if provided"),
];

/**
 * Validators for GET /jobs/:jobId - Get single job
 */
export const getJobParamValidator = [
  param("jobId")
    .isInt({ min: 1 })
    .withMessage("Valid jobId (integer) required"),
];

/**
 * Validators for GET /jobs - List jobs (with pagination/filtering)
 */
export const listJobsValidators = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be >= 1"),

  query("pageSize")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Page size must be between 1-100"),

  query("status")
    .optional()
    .isIn(["planned", "in_progress", "on_hold", "completed", "cancelled"])
    .withMessage("Status must be one of: planned, in_progress, on_hold, completed, cancelled"),

  query("clientId")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Valid clientId required if provided"),

  query("departmentId")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Valid departmentId required if provided"),

  query("sortBy")
    .optional()
    .isIn(["createdAt", "startDate", "dueDate", "priority"])
    .withMessage("SortBy must be one of: createdAt, startDate, dueDate, priority"),

  query("sortOrder")
    .optional()
    .isIn(["asc", "desc"])
    .withMessage("SortOrder must be: asc or desc"),
];

/**
 * Validators for DELETE /jobs/:jobId - Delete job
 */
export const deleteJobValidator = [
  param("jobId")
    .isInt({ min: 1 })
    .withMessage("Valid jobId (integer) required"),
];

/**
 * Validators for POST /jobs/:jobId/assign - Assign team members
 */
export const assignJobTeamValidators = [
  param("jobId")
    .isInt({ min: 1 })
    .withMessage("Valid jobId (integer) required"),

  body("employeeProfileId")
    .isInt({ min: 1 })
    .withMessage("Valid employeeProfileId required"),

  body("assignedRoleId")
    .isInt({ min: 1 })
    .withMessage("Valid assignedRoleId required"),

  body("assignedHourlyRate")
    .isFloat({ min: 0.01 })
    .withMessage("Valid assignedHourlyRate required"),

  body("roleOnJob")
    .optional()
    .isString()
    .trim(),
];

/**
 * Validators for PATCH /jobs/:jobId/status - Update job status
 */
export const updateJobStatusValidator = [
  param("jobId")
    .isInt({ min: 1 })
    .withMessage("Valid jobId (integer) required"),

  body("status")
    .isIn(["planned", "in_progress", "on_hold", "completed", "cancelled"])
    .withMessage("Status must be one of: planned, in_progress, on_hold, completed, cancelled"),

  body("reason")
    .optional()
    .isString()
    .trim(),
];
