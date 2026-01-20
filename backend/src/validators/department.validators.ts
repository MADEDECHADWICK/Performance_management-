/**
 * Department endpoint validators
 * Reusable validation chains for department operations
 */

import { body, param, query } from "express-validator";

/**
 * Validators for POST /departments - Create department
 */
export const createDepartmentValidators = [
  body("name")
    .isString()
    .trim()
    .isLength({ min: 3, max: 255 })
    .withMessage("Department name required (3-255 characters)"),

  body("description")
    .optional()
    .isString()
    .trim(),

  body("departmentCode")
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage("Department code must be 1-50 characters if provided"),

  body("departmentHeadId")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Valid departmentHeadId required if provided"),
];

/**
 * Validators for PATCH /departments/:departmentId - Update department
 */
export const updateDepartmentValidators = [
  param("departmentId")
    .isInt({ min: 1 })
    .withMessage("Valid departmentId (integer) required"),

  body("name")
    .optional()
    .isString()
    .trim()
    .isLength({ min: 3, max: 255 })
    .withMessage("Department name must be 3-255 characters if provided"),

  body("description")
    .optional()
    .isString()
    .trim(),

  body("departmentHeadId")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Valid departmentHeadId required if provided"),
];

/**
 * Validators for GET /departments/:departmentId - Get department
 */
export const getDepartmentValidator = [
  param("departmentId")
    .isInt({ min: 1 })
    .withMessage("Valid departmentId (integer) required"),
];

/**
 * Validators for GET /departments - List departments
 */
export const listDepartmentsValidators = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be >= 1"),

  query("pageSize")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Page size must be between 1-100"),

  query("sortBy")
    .optional()
    .isIn(["name", "createdAt"])
    .withMessage("SortBy must be one of: name, createdAt"),

  query("sortOrder")
    .optional()
    .isIn(["asc", "desc"])
    .withMessage("SortOrder must be: asc or desc"),
];

/**
 * Validators for DELETE /departments/:departmentId
 */
export const deleteDepartmentValidator = [
  param("departmentId")
    .isInt({ min: 1 })
    .withMessage("Valid departmentId (integer) required"),
];

/**
 * Validators for GET /departments/:departmentId/employees - List department employees
 */
export const getDepartmentEmployeesValidators = [
  param("departmentId")
    .isInt({ min: 1 })
    .withMessage("Valid departmentId (integer) required"),

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
    .isIn(["active", "inactive", "separated"])
    .withMessage("Status must be one of: active, inactive, separated"),

  query("sortBy")
    .optional()
    .isIn(["firstName", "lastName", "hireDate"])
    .withMessage("SortBy must be one of: firstName, lastName, hireDate"),

  query("sortOrder")
    .optional()
    .isIn(["asc", "desc"])
    .withMessage("SortOrder must be: asc or desc"),
];

/**
 * Validators for GET /departments/:departmentId/kpis - List department KPIs
 */
export const getDepartmentKpisValidators = [
  param("departmentId")
    .isInt({ min: 1 })
    .withMessage("Valid departmentId (integer) required"),

  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be >= 1"),

  query("pageSize")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Page size must be between 1-100"),

  query("category")
    .optional()
    .isString()
    .trim(),
];

/**
 * Validators for GET /departments/:departmentId/dashboard - Department dashboard
 */
export const getDepartmentDashboardValidator = [
  param("departmentId")
    .isInt({ min: 1 })
    .withMessage("Valid departmentId (integer) required"),

  query("period")
    .optional()
    .isISO8601()
    .withMessage("Valid period (ISO8601) required if provided"),
];

/**
 * Validators for POST /departments/:departmentId/kpis - Create department KPI
 */
export const createDepartmentKpiValidators = [
  param("departmentId")
    .isInt({ min: 1 })
    .withMessage("Valid departmentId (integer) required"),

  body("name")
    .isString()
    .trim()
    .isLength({ min: 3, max: 255 })
    .withMessage("KPI name required (3-255 characters)"),

  body("description")
    .optional()
    .isString()
    .trim(),

  body("category")
    .isString()
    .trim()
    .isLength({ min: 1 })
    .withMessage("Category required"),

  body("kpiType")
    .isString()
    .trim()
    .isLength({ min: 1 })
    .withMessage("KPI type required"),

  body("targetValue")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Target value must be >= 0 if provided"),

  body("weight")
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage("Weight must be between 0 and 100 if provided"),

  body("targetFrequency")
    .optional()
    .isIn(["daily", "weekly", "monthly", "quarterly", "annual"])
    .withMessage("Target frequency must be one of: daily, weekly, monthly, quarterly, annual"),
];

/**
 * Validators for GET /departments/:departmentId/revenue - Department revenue
 */
export const getDepartmentRevenueValidators = [
  param("departmentId")
    .isInt({ min: 1 })
    .withMessage("Valid departmentId (integer) required"),

  query("fromDate")
    .optional()
    .isISO8601()
    .withMessage("Valid fromDate (ISO8601) required if provided"),

  query("toDate")
    .optional()
    .isISO8601()
    .withMessage("Valid toDate (ISO8601) required if provided"),

  query("period")
    .optional()
    .isIn(["daily", "weekly", "monthly", "quarterly", "annual"])
    .withMessage("Period must be one of: daily, weekly, monthly, quarterly, annual"),
];

/**
 * Validators for GET /departments/:departmentId/jobs - Department jobs
 */
export const getDepartmentJobsValidators = [
  param("departmentId")
    .isInt({ min: 1 })
    .withMessage("Valid departmentId (integer) required"),

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
];
