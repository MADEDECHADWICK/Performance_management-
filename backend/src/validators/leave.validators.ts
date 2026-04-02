import { body, param, query } from "express-validator";

export const requestIdParamValidator = [
  param("requestId").isInt({ min: 1 }).withMessage("Valid requestId is required"),
];

export const leaveTypeIdParamValidator = [
  param("leaveTypeId").isInt({ min: 1 }).withMessage("Valid leaveTypeId is required"),
];

export const policyIdParamValidator = [
  param("policyId").isInt({ min: 1 }).withMessage("Valid policyId is required"),
];

export const assignmentIdParamValidator = [
  param("assignmentId").isInt({ min: 1 }).withMessage("Valid assignmentId is required"),
];

export const holidayIdParamValidator = [
  param("holidayId").isInt({ min: 1 }).withMessage("Valid holidayId is required"),
];

export const paginationValidators = [
  query("page").optional().isInt({ min: 1 }).toInt(),
  query("pageSize").optional().isInt({ min: 1, max: 100 }).toInt(),
];

export const listLeaveRequestsValidators = [
  ...paginationValidators,
  query("status")
    .optional()
    .isIn([
      "pending_manager_approval",
      "pending_partner_approval",
      "pending_hr_approval",
      "approved",
      "declined",
      "cancelled",
    ]),
  query("employeeProfileId").optional().isInt({ min: 1 }).toInt(),
];

export const createLeaveRequestValidators = [
  body("leaveTypeId").isInt({ min: 1 }).withMessage("leaveTypeId is required"),
  body("startDate").isISO8601().withMessage("startDate must be a valid ISO date"),
  body("endDate").isISO8601().withMessage("endDate must be a valid ISO date"),
  body("startsAt").optional().isISO8601().withMessage("startsAt must be a valid ISO datetime"),
  body("endsAt").optional().isISO8601().withMessage("endsAt must be a valid ISO datetime"),
  body("startDayPortion")
    .optional()
    .isIn(["full_day", "half_day_am", "half_day_pm"])
    .withMessage("Invalid startDayPortion"),
  body("endDayPortion")
    .optional()
    .isIn(["full_day", "half_day_am", "half_day_pm"])
    .withMessage("Invalid endDayPortion"),
  body("requestedUnits").optional().isFloat({ gt: 0 }),
  body("requestedHours").optional().isFloat({ gt: 0 }),
  body("reason").optional().isString().trim().isLength({ max: 2000 }),
  body("attachmentDocumentIds").optional().isArray(),
  body("attachmentDocumentIds.*").optional().isInt({ min: 1 }),
];

export const cancelLeaveRequestValidators = [
  ...requestIdParamValidator,
  body("reason").optional().isString().trim().isLength({ max: 1000 }),
  body("notes").optional().isString().trim().isLength({ max: 1000 }),
];

export const listCalendarValidators = [
  query("scope").optional().isIn(["mine", "team", "org"]),
  query("dateFrom").optional().isISO8601(),
  query("dateTo").optional().isISO8601(),
  query("status")
    .optional()
    .custom((value) => {
      const values = Array.isArray(value) ? value : [value];
      for (const item of values) {
        if (
          ![
            "pending_manager_approval",
            "pending_partner_approval",
            "pending_hr_approval",
            "approved",
            "declined",
            "cancelled",
          ].includes(String(item))
        ) {
          throw new Error("Invalid status filter");
        }
      }
      return true;
    }),
];

export const listApprovalsValidators = [
  ...paginationValidators,
  query("scope").optional().isIn(["mine", "all"]),
  query("status")
    .optional()
    .isIn([
      "pending_manager_approval",
      "pending_partner_approval",
      "pending_hr_approval",
      "approved",
      "declined",
      "cancelled",
    ]),
];

export const reviewLeaveRequestValidators = [
  ...requestIdParamValidator,
  body("notes").optional().isString().trim().isLength({ max: 1000 }),
  body("reason").optional().isString().trim().isLength({ max: 1000 }),
];

export const createLeaveTypeValidators = [
  body("code").isString().trim().isLength({ min: 2, max: 40 }),
  body("name").isString().trim().isLength({ min: 2, max: 120 }),
  body("description").optional().isString().trim().isLength({ max: 500 }),
  body("color").optional().isString().trim().isLength({ max: 40 }),
  body("isActive").optional().isBoolean(),
  body("isPaid").optional().isBoolean(),
  body("balanceTracked").optional().isBoolean(),
  body("requiresAttachment").optional().isBoolean(),
  body("allowsHalfDay").optional().isBoolean(),
  body("unitType").optional().isIn(["day", "hour"]),
  body("defaultNoticeDays").optional().isInt({ min: 0 }).toInt(),
  body("defaultMaxUnits").optional({ nullable: true }).isFloat({ min: 0 }),
];

export const updateLeaveTypeValidators = [
  ...leaveTypeIdParamValidator,
  body("code").optional().isString().trim().isLength({ min: 2, max: 40 }),
  body("name").optional().isString().trim().isLength({ min: 2, max: 120 }),
  body("description").optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
  body("color").optional({ nullable: true }).isString().trim().isLength({ max: 40 }),
  body("isActive").optional().isBoolean(),
  body("isPaid").optional().isBoolean(),
  body("balanceTracked").optional().isBoolean(),
  body("requiresAttachment").optional().isBoolean(),
  body("allowsHalfDay").optional().isBoolean(),
  body("unitType").optional().isIn(["day", "hour"]),
  body("defaultNoticeDays").optional().isInt({ min: 0 }).toInt(),
  body("defaultMaxUnits").optional({ nullable: true }).isFloat({ min: 0 }),
];

export const createPolicyValidators = [
  body("leaveTypeId").isInt({ min: 1 }).toInt(),
  body("name").isString().trim().isLength({ min: 2, max: 150 }),
  body("description").optional().isString().trim().isLength({ max: 500 }),
  body("isActive").optional().isBoolean(),
  body("effectiveFrom").optional({ nullable: true }).isISO8601(),
  body("effectiveTo").optional({ nullable: true }).isISO8601(),
  body("annualEntitlement").optional().isFloat({ min: 0 }),
  body("carryoverCap").optional().isFloat({ min: 0 }),
  body("accrualEnabled").optional().isBoolean(),
  body("accrualFrequency").optional().isIn(["monthly", "quarterly", "annually", "manual"]),
  body("accrualRate").optional().isFloat({ min: 0 }),
  body("requiresManagerApproval").optional().isBoolean(),
  body("requiresHrApproval").optional().isBoolean(),
  body("excludeWeekends").optional().isBoolean(),
  body("excludePublicHolidays").optional().isBoolean(),
  body("minNoticeDays").optional().isInt({ min: 0 }).toInt(),
  body("hoursPerWorkday").optional().isFloat({ gt: 0 }),
  body("autoProjectToTimesheet").optional().isBoolean(),
  body("maxConsecutiveUnits").optional().isFloat({ min: 0 }),
  body("maxUnitsPerRequest").optional().isFloat({ min: 0 }),
  body("allowNegativeBalance").optional().isBoolean(),
  body("noticeRules").optional().isArray(),
  body("noticeRules.*.sequenceNo").optional().isInt({ min: 1 }).toInt(),
  body("noticeRules.*.minHours").optional({ nullable: true }).isFloat({ min: 0 }),
  body("noticeRules.*.maxHours").optional({ nullable: true }).isFloat({ min: 0 }),
  body("noticeRules.*.noticeValue").optional().isFloat({ min: 0 }),
  body("noticeRules.*.noticeUnit").optional().isIn(["calendar_days", "business_days"]),
  body("noticeRules.*.isActive").optional().isBoolean(),
  body("approvalRoutes").optional().isArray(),
  body("approvalRoutes.*.name").optional().isString().trim().isLength({ min: 1, max: 150 }),
  body("approvalRoutes.*.minHours").optional({ nullable: true }).isFloat({ min: 0 }),
  body("approvalRoutes.*.maxHours").optional({ nullable: true }).isFloat({ min: 0 }),
  body("approvalRoutes.*.isActive").optional().isBoolean(),
  body("approvalRoutes.*.steps").optional().isArray(),
  body("approvalRoutes.*.steps.*.stepNumber").optional().isInt({ min: 1 }).toInt(),
  body("approvalRoutes.*.steps.*.stageType")
    .optional()
    .isIn(["manager", "partner", "hr"]),
  body("approvalRoutes.*.steps.*.approverSource")
    .optional()
    .isIn(["employee_manager", "department_partner", "hr_pool", "specific_profile"]),
  body("approvalRoutes.*.steps.*.approverProfileId")
    .optional({ nullable: true })
    .isInt({ min: 1 })
    .toInt(),
];

export const updatePolicyValidators = [
  ...policyIdParamValidator,
  body("leaveTypeId").optional().isInt({ min: 1 }).toInt(),
  body("name").optional().isString().trim().isLength({ min: 2, max: 150 }),
  body("description").optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
  body("isActive").optional().isBoolean(),
  body("effectiveFrom").optional({ nullable: true }).isISO8601(),
  body("effectiveTo").optional({ nullable: true }).isISO8601(),
  body("annualEntitlement").optional().isFloat({ min: 0 }),
  body("carryoverCap").optional().isFloat({ min: 0 }),
  body("accrualEnabled").optional().isBoolean(),
  body("accrualFrequency").optional().isIn(["monthly", "quarterly", "annually", "manual"]),
  body("accrualRate").optional().isFloat({ min: 0 }),
  body("requiresManagerApproval").optional().isBoolean(),
  body("requiresHrApproval").optional().isBoolean(),
  body("excludeWeekends").optional().isBoolean(),
  body("excludePublicHolidays").optional().isBoolean(),
  body("minNoticeDays").optional().isInt({ min: 0 }).toInt(),
  body("hoursPerWorkday").optional().isFloat({ gt: 0 }),
  body("autoProjectToTimesheet").optional().isBoolean(),
  body("maxConsecutiveUnits").optional().isFloat({ min: 0 }),
  body("maxUnitsPerRequest").optional().isFloat({ min: 0 }),
  body("allowNegativeBalance").optional().isBoolean(),
  body("noticeRules").optional().isArray(),
  body("noticeRules.*.sequenceNo").optional().isInt({ min: 1 }).toInt(),
  body("noticeRules.*.minHours").optional({ nullable: true }).isFloat({ min: 0 }),
  body("noticeRules.*.maxHours").optional({ nullable: true }).isFloat({ min: 0 }),
  body("noticeRules.*.noticeValue").optional().isFloat({ min: 0 }),
  body("noticeRules.*.noticeUnit").optional().isIn(["calendar_days", "business_days"]),
  body("noticeRules.*.isActive").optional().isBoolean(),
  body("approvalRoutes").optional().isArray(),
  body("approvalRoutes.*.name").optional().isString().trim().isLength({ min: 1, max: 150 }),
  body("approvalRoutes.*.minHours").optional({ nullable: true }).isFloat({ min: 0 }),
  body("approvalRoutes.*.maxHours").optional({ nullable: true }).isFloat({ min: 0 }),
  body("approvalRoutes.*.isActive").optional().isBoolean(),
  body("approvalRoutes.*.steps").optional().isArray(),
  body("approvalRoutes.*.steps.*.stepNumber").optional().isInt({ min: 1 }).toInt(),
  body("approvalRoutes.*.steps.*.stageType")
    .optional()
    .isIn(["manager", "partner", "hr"]),
  body("approvalRoutes.*.steps.*.approverSource")
    .optional()
    .isIn(["employee_manager", "department_partner", "hr_pool", "specific_profile"]),
  body("approvalRoutes.*.steps.*.approverProfileId")
    .optional({ nullable: true })
    .isInt({ min: 1 })
    .toInt(),
];

export const createPolicyAssignmentValidators = [
  body("policyId").isInt({ min: 1 }).toInt(),
  body("scope").optional().isIn(["global", "department", "role", "employee"]),
  body("departmentId").optional({ nullable: true }).isInt({ min: 1 }).toInt(),
  body("roleId").optional({ nullable: true }).isInt({ min: 1 }).toInt(),
  body("profileId").optional({ nullable: true }).isInt({ min: 1 }).toInt(),
  body("priority").optional().isInt({ min: 0 }).toInt(),
];

export const createPublicHolidayValidators = [
  body("name").isString().trim().isLength({ min: 2, max: 150 }),
  body("holidayDate").isISO8601(),
  body("countryCode").optional().isString().trim().isLength({ min: 2, max: 8 }),
  body("region").optional({ nullable: true }).isString().trim().isLength({ max: 120 }),
  body("isRecurring").optional().isBoolean(),
];

export const updatePublicHolidayValidators = [
  ...holidayIdParamValidator,
  body("name").optional().isString().trim().isLength({ min: 2, max: 150 }),
  body("holidayDate").optional().isISO8601(),
  body("countryCode").optional().isString().trim().isLength({ min: 2, max: 8 }),
  body("region").optional({ nullable: true }).isString().trim().isLength({ max: 120 }),
  body("isRecurring").optional().isBoolean(),
];

export const adjustBalanceValidators = [
  body("employeeProfileId").isInt({ min: 1 }).toInt(),
  body("leaveTypeId").isInt({ min: 1 }).toInt(),
  body("leaveYear").optional().isInt({ min: 2000 }).toInt(),
  body("units").isFloat(),
  body("note").optional().isString().trim().isLength({ max: 1000 }),
  body("effectiveDate").optional({ nullable: true }).isISO8601(),
];
