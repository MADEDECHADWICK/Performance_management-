/**
 * Job endpoint validators
 * Reusable validation chains for job CRUD operations
 */

import { body, param, query } from "express-validator";

const milestoneValidators = [
  body("milestones")
    .optional()
    .isArray({ min: 1, max: 20 })
    .withMessage("milestones must be an array with 1-20 entries"),

  body("milestones")
    .optional()
    .custom((items) => {
      if (!Array.isArray(items)) return true;

      const percents = new Set<number>();
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index] || {};
        const title = String(item.title ?? "").trim();
        if (!title) {
          throw new Error(`milestones[${index}].title is required`);
        }

        const percent = Number(item.targetPercent);
        if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
          throw new Error(`milestones[${index}].targetPercent must be between 1 and 100`);
        }

        if (percents.has(percent)) {
          throw new Error(`Duplicate milestone targetPercent: ${percent}`);
        }
        percents.add(percent);
      }

      if (items.length > 0 && !percents.has(100)) {
        throw new Error("milestones must include a 100% final payment milestone");
      }

      return true;
    }),

  body("milestones.*.title")
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 160 })
    .withMessage("milestone title must be 1-160 characters"),

  body("milestones.*.targetPercent")
    .optional()
    .isFloat({ gt: 0, max: 100 })
    .withMessage("milestone targetPercent must be > 0 and <= 100"),

  body("milestones.*.dueDate")
    .optional({ nullable: true, checkFalsy: true })
    .isISO8601()
    .withMessage("milestone dueDate must be a valid ISO8601 date"),

  body("milestones.*.requirements")
    .optional({ nullable: true })
    .isString()
    .trim()
    .isLength({ max: 1000 })
    .withMessage("milestone requirements must be at most 1000 characters"),

  body("milestones.*.assignedToProfileId")
    .optional({ nullable: true, checkFalsy: true })
    .isInt({ min: 1 })
    .withMessage("milestone assignedToProfileId must be a valid profile id"),
];

/**
 * Validators for POST /jobs - Create new job
 */
export const createJobValidators = [
  body("clientId")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Valid clientId (integer) required if provided"),

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
    .optional()
    .isISO8601()
    .withMessage("Valid startDate (ISO8601) required if provided"),

  body("dueDate")
    .optional()
    .isISO8601()
    .withMessage("Valid dueDate (ISO8601) required if provided"),

  body("priority")
    .optional()
    .isIn(["low", "medium", "high", "urgent"])
    .withMessage("Priority must be one of: low, medium, high, urgent"),

  body("billingType")
    .optional()
    .isIn(["hourly", "fixed_fee"])
    .withMessage("Billing type must be: hourly or fixed_fee if provided"),

  body("fixedFeeAmount")
    .optional()
    .isFloat({ min: 0.01 })
    .withMessage("Fixed fee amount must be > 0 if provided"),

  body("budgetHours")
    .optional()
    .isFloat({ min: 0.01 })
    .withMessage("Budget hours must be >= 0 if provided"),

  body("engagementLetterId")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Valid engagementLetterId required if provided"),

  body().custom((value) => {
    const hasEngagementLetter = value.engagementLetterId !== undefined && value.engagementLetterId !== null && value.engagementLetterId !== "";

    if (!hasEngagementLetter) {
      throw new Error("engagementLetterId is required for job creation");
    }

    return true;
  }),

  ...milestoneValidators,
];

/**
 * Validators for POST /jobs/from-onboarding/:clientOnboardingId
 * Create job from an approved onboarding record (HR queue)
 */
export const createJobFromOnboardingValidators = [
  param("clientOnboardingId")
    .isInt({ min: 1 })
    .withMessage("Valid clientOnboardingId (integer) required"),

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

  body("departmentId")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Valid departmentId required if provided"),

  body("partnerProfileId")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Valid partnerProfileId required if provided"),

  body("managerProfileId")
    .isInt({ min: 1 })
    .withMessage("Valid managerProfileId required"),

  body("startDate")
    .optional()
    .isISO8601()
    .withMessage("Valid startDate (ISO8601) required if provided"),

  body("dueDate")
    .optional()
    .isISO8601()
    .withMessage("Valid dueDate (ISO8601) required if provided"),

  body("priority")
    .optional()
    .isIn(["low", "medium", "high", "urgent"])
    .withMessage("Priority must be one of: low, medium, high, urgent"),

  body("budgetHours")
    .optional()
    .isFloat({ min: 0.01 })
    .withMessage("Budget hours must be >= 0 if provided"),

  ...milestoneValidators,
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
    .custom((value) => {
      const allowed = ["planned", "in_progress", "on_hold", "completed", "cancelled", "overdue"];
      const statuses = String(value).split(",").map((status) => status.trim()).filter(Boolean);
      return statuses.length > 0 && statuses.every((status) => allowed.includes(status));
    })
    .withMessage("Status must be one or more of: planned, in_progress, on_hold, completed, cancelled, overdue"),

  query("clientId")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Valid clientId required if provided"),

  query("partnerProfileId")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Valid partnerProfileId required if provided"),

  query("managerProfileId")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Valid managerProfileId required if provided"),

  query("departmentId")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Valid departmentId required if provided"),

  query("priority")
    .optional()
    .isIn(["low", "medium", "high", "urgent"])
    .withMessage("Priority must be one of: low, medium, high, urgent"),

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
    .optional()
    .isFloat({ min: 0.01 })
    .withMessage("assignedHourlyRate must be > 0 if provided"),

  body("roleOnJob")
    .optional()
    .isString()
    .trim(),
];

/**
 * Validators for PATCH /jobs/:jobId/staff/:assignmentId
 */
export const updateJobStaffAssignmentValidators = [
  param("jobId")
    .isInt({ min: 1 })
    .withMessage("Valid jobId (integer) required"),

  param("assignmentId")
    .isInt({ min: 1 })
    .withMessage("Valid assignmentId (integer) required"),

  body("assignedRoleId")
    .optional()
    .isInt({ min: 1 })
    .withMessage("assignedRoleId must be a valid integer"),

  body("assignedHourlyRate")
    .optional()
    .isFloat({ min: 0.01 })
    .withMessage("assignedHourlyRate must be > 0 if provided"),

  body("roleOnJob")
    .optional({ nullable: true })
    .isString()
    .trim(),

  body()
    .custom((payload) => {
      const hasAtLeastOneField =
        payload.assignedRoleId !== undefined ||
        payload.assignedHourlyRate !== undefined ||
        payload.roleOnJob !== undefined;
      if (!hasAtLeastOneField) {
        throw new Error(
          "At least one field is required: assignedRoleId, assignedHourlyRate, roleOnJob"
        );
      }
      return true;
    }),
];

/**
 * Validators for DELETE /jobs/:jobId/staff/:assignmentId
 */
export const removeJobStaffAssignmentValidators = [
  param("jobId")
    .isInt({ min: 1 })
    .withMessage("Valid jobId (integer) required"),

  param("assignmentId")
    .isInt({ min: 1 })
    .withMessage("Valid assignmentId (integer) required"),
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

  body("allowIncompleteTasksOverride")
    .optional()
    .isBoolean()
    .withMessage("allowIncompleteTasksOverride must be boolean"),

  body("reason")
    .optional()
    .isString()
    .trim(),

  body().custom((payload) => {
    const status = String(payload?.status || "").trim();
    const allowOverride = Boolean(payload?.allowIncompleteTasksOverride);
    const reason = String(payload?.reason || "").trim();
    if (status === "completed" && allowOverride && !reason) {
      throw new Error("reason is required when allowIncompleteTasksOverride is true");
    }
    return true;
  }),
];

/**
 * Validators for POST /jobs/:jobId/costing
 */
export const upsertJobCostingValidators = [
  param("jobId")
    .isInt({ min: 1 })
    .withMessage("Valid jobId (integer) required"),

  body("jobFee")
    .optional()
    .isFloat({ min: 0.01 })
    .withMessage("jobFee must be greater than 0"),

  body("allocations")
    .isArray({ min: 1 })
    .withMessage("allocations must be a non-empty array"),

  body("allocations.*.employeeProfileId")
    .isInt({ min: 1 })
    .withMessage("allocations[].employeeProfileId must be a valid integer"),

  body("allocations.*.roleId")
    .isInt({ min: 1 })
    .withMessage("allocations[].roleId must be a valid integer"),

  body("allocations.*.allocatedHours")
    .isFloat({ min: 0.25 })
    .withMessage("allocations[].allocatedHours must be >= 0.25"),

  body("allocations.*.hourlyRate")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("allocations[].hourlyRate must be >= 0"),

  body("allocations.*.billable")
    .optional()
    .isBoolean()
    .withMessage("allocations[].billable must be boolean"),

  body("allocations.*.taskDescription")
    .optional()
    .isString()
    .trim()
    .isLength({ max: 2000 })
    .withMessage("allocations[].taskDescription must be <= 2000 characters"),

  body("capEnforced")
    .optional()
    .isBoolean()
    .withMessage("capEnforced must be boolean"),

  body("allowOverage")
    .optional()
    .isBoolean()
    .withMessage("allowOverage must be boolean"),

  body("maxOveragePercent")
    .optional()
    .isFloat({ min: 0, max: 1 })
    .withMessage("maxOveragePercent must be between 0 and 1"),

  body("submitForApproval")
    .optional()
    .isBoolean()
    .withMessage("submitForApproval must be boolean"),

  body("partnerApprove")
    .optional()
    .isBoolean()
    .withMessage("partnerApprove must be boolean"),

  ...milestoneValidators,
];

export const reviewJobCostingValidators = [
  param("jobId")
    .isInt({ min: 1 })
    .withMessage("Valid jobId (integer) required"),

  body("decision")
    .isIn(["approved", "rejected"])
    .withMessage("decision must be either approved or rejected"),

  body("reviewNotes")
    .optional({ nullable: true })
    .isString()
    .trim()
    .isLength({ max: 2000 })
    .withMessage("reviewNotes must be <= 2000 characters"),

  body("reviewNotes")
    .if(body("decision").equals("rejected"))
    .notEmpty()
    .withMessage("reviewNotes are required when rejecting job costing"),
];

/**
 * Validators for GET /jobs/:jobId/time-entries
 */
export const getJobTimeEntriesValidators = [
  param("jobId")
    .isInt({ min: 1 })
    .withMessage("Valid jobId (integer) required"),

  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("page must be >= 1"),

  query("pageSize")
    .optional()
    .isInt({ min: 1, max: 200 })
    .withMessage("pageSize must be between 1 and 200"),

  query("status")
    .optional()
    .isIn(["pending", "submitted", "approved", "rejected", "cancelled"])
    .withMessage("status must be one of: pending, submitted, approved, rejected, cancelled"),

  query("dateFrom")
    .optional()
    .isISO8601()
    .withMessage("dateFrom must be a valid ISO8601 date"),

  query("dateTo")
    .optional()
    .isISO8601()
    .withMessage("dateTo must be a valid ISO8601 date"),
];


