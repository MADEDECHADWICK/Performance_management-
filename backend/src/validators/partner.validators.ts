/**
 * Partner endpoint validators
 * Reusable validation chains for partner operations
 */

import { body, param, query } from "express-validator";

/**
 * Validators for POST /partners - Create partner record
 */
export const createPartnerValidators = [
  body("profileId")
    .isInt({ min: 1 })
    .withMessage("Valid profileId required"),

  body("companyId")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Valid companyId required if provided"),

  body("commissionRate")
    .isDecimal({ min: 0, max: 100 })
    .withMessage("Commission rate must be between 0 and 100"),

  body("performanceThreshold")
    .optional()
    .isDecimal({ min: 0, max: 100 })
    .withMessage("Performance threshold must be between 0 and 100 if provided"),
];

/**
 * Validators for PATCH /partners/:partnerId - Update partner
 */
export const updatePartnerValidators = [
  param("partnerId")
    .isInt({ min: 1 })
    .withMessage("Valid partnerId (integer) required"),

  body("commissionRate")
    .optional()
    .isDecimal({ min: 0, max: 100 })
    .withMessage("Commission rate must be between 0 and 100"),

  body("performanceThreshold")
    .optional()
    .isDecimal({ min: 0, max: 100 })
    .withMessage("Performance threshold must be between 0 and 100"),

  body("companyId")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Valid companyId required if provided"),
];

/**
 * Validators for GET /partners/:partnerId - Get partner
 */
export const getPartnerValidator = [
  param("partnerId")
    .isInt({ min: 1 })
    .withMessage("Valid partnerId (integer) required"),
];

/**
 * Validators for GET /partners - List partners
 */
export const listPartnersValidators = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be >= 1"),

  query("pageSize")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Page size must be between 1-100"),

  query("companyId")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Valid companyId required if provided"),

  query("sortBy")
    .optional()
    .isIn(["createdAt", "commissionRate"])
    .withMessage("SortBy must be one of: createdAt, commissionRate"),

  query("sortOrder")
    .optional()
    .isIn(["asc", "desc"])
    .withMessage("SortOrder must be: asc or desc"),
];

/**
 * Validators for GET /partners/:partnerId/jobs - Get partner's jobs
 */
export const getPartnerJobsValidators = [
  param("partnerId")
    .isInt({ min: 1 })
    .withMessage("Valid partnerId (integer) required"),

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

/**
 * Validators for GET /partners/:partnerId/dashboard - Get partner dashboard
 */
export const getPartnerDashboardValidator = [
  param("partnerId")
    .isInt({ min: 1 })
    .withMessage("Valid partnerId (integer) required"),

  query("period")
    .optional()
    .isISO8601()
    .withMessage("Valid period (ISO8601) required if provided"),
];

/**
 * Validators for GET /partners/:partnerId/portfolio - Get partner portfolio
 */
export const getPartnerPortfolioValidators = [
  param("partnerId")
    .isInt({ min: 1 })
    .withMessage("Valid partnerId (integer) required"),

  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be >= 1"),

  query("pageSize")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Page size must be between 1-100"),

  query("period")
    .optional()
    .isISO8601()
    .withMessage("Valid period (ISO8601) required if provided"),
];

/**
 * Validators for POST /partner-companies - Create partner company
 */
export const createPartnerCompanyValidators = [
  body("companyName")
    .isString()
    .trim()
    .isLength({ min: 3, max: 255 })
    .withMessage("Company name required (3-255 characters)"),

  body("registrationNumber")
    .optional()
    .isString()
    .trim(),

  body("taxId")
    .optional()
    .isString()
    .trim(),

  body("bankAccountDetails")
    .optional()
    .isString()
    .trim(),

  body("contractTerms")
    .optional()
    .isString()
    .trim(),
];

/**
 * Validators for PATCH /partner-companies/:companyId - Update partner company
 */
export const updatePartnerCompanyValidators = [
  param("companyId")
    .isInt({ min: 1 })
    .withMessage("Valid companyId (integer) required"),

  body("companyName")
    .optional()
    .isString()
    .trim()
    .isLength({ min: 3, max: 255 })
    .withMessage("Company name must be 3-255 characters if provided"),

  body("registrationNumber")
    .optional()
    .isString()
    .trim(),

  body("taxId")
    .optional()
    .isString()
    .trim(),

  body("bankAccountDetails")
    .optional()
    .isString()
    .trim(),

  body("contractTerms")
    .optional()
    .isString()
    .trim(),
];

/**
 * Validators for GET /partner-companies/:companyId
 */
export const getPartnerCompanyValidator = [
  param("companyId")
    .isInt({ min: 1 })
    .withMessage("Valid companyId (integer) required"),
];

/**
 * Validators for GET /partners/:partnerId/revenue - Get partner revenue
 */
export const getPartnerRevenueValidators = [
  param("partnerId")
    .isInt({ min: 1 })
    .withMessage("Valid partnerId (integer) required"),

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
