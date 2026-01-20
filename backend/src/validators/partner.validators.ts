/**
 * Partner endpoint validators (Schema v2.1 aligned)
 */

import { body, param, query } from "express-validator";

/**
 * POST /partners - Create partner record
 * Body: profileId, companyId?, commissionRate, performanceThreshold?
 */
export const createPartnerValidators = [
  body("profileId").isInt({ min: 1 }).withMessage("Valid profileId required"),

  body("companyId")
    .optional({ nullable: true })
    .isInt({ min: 1 })
    .withMessage("Valid companyId required if provided"),

  body("commissionRate")
    .isFloat({ min: 0, max: 100 })
    .withMessage("Commission rate must be between 0 and 100"),

  body("performanceThreshold")
    .optional({ nullable: true })
    .isFloat({ min: 0, max: 100 })
    .withMessage("Performance threshold must be between 0 and 100 if provided"),
];

/**
 * PATCH /partners/:partnerId - Update partner
 * Body: companyId?, commissionRate?, performanceThreshold?
 */
export const updatePartnerValidators = [
  param("partnerId").isInt({ min: 1 }).withMessage("Valid partnerId required"),

  body("companyId")
    .optional({ nullable: true })
    .isInt({ min: 1 })
    .withMessage("Valid companyId required if provided"),

  body("commissionRate")
    .optional({ nullable: true })
    .isFloat({ min: 0, max: 100 })
    .withMessage("Commission rate must be between 0 and 100"),

  body("performanceThreshold")
    .optional({ nullable: true })
    .isFloat({ min: 0, max: 100 })
    .withMessage("Performance threshold must be between 0 and 100"),
];

export const getPartnerValidator = [
  param("partnerId").isInt({ min: 1 }).withMessage("Valid partnerId required"),
];

export const listPartnersValidators = [
  query("page").optional().isInt({ min: 1 }).withMessage("Page must be >= 1"),
  query("pageSize").optional().isInt({ min: 1, max: 100 }).withMessage("Page size must be 1-100"),
  query("companyId").optional().isInt({ min: 1 }).withMessage("Valid companyId required if provided"),
];

/**
 * PartnerCompany (Schema v2.1)
 */
export const upsertPartnerCompanyValidators = [
  body("companyName")
    .isString()
    .trim()
    .isLength({ min: 3, max: 255 })
    .withMessage("Company name required (3-255 characters)"),

  body("registrationNumber").optional({ nullable: true }).isString().trim(),
  body("taxId").optional({ nullable: true }).isString().trim(),
  body("bankAccountDetails").optional({ nullable: true }).isString().trim(),
  body("contractTerms").optional({ nullable: true }).isString().trim(),
];

export const getPartnerJobsValidators = [
  param("partnerId").isInt({ min: 1 }).withMessage("Valid partnerId required"),
  query("page").optional().isInt({ min: 1 }).withMessage("Page must be >= 1"),
  query("pageSize").optional().isInt({ min: 1, max: 100 }).withMessage("Page size must be 1-100"),
  query("status")
    .optional()
    .isIn(["planned", "in_progress", "on_hold", "completed", "cancelled"])
    .withMessage("Invalid job status"),
];

export const getPartnerRevenueValidators = [
  param("partnerId").isInt({ min: 1 }).withMessage("Valid partnerId required"),
  query("fromDate").optional().isISO8601().withMessage("fromDate must be ISO8601"),
  query("toDate").optional().isISO8601().withMessage("toDate must be ISO8601"),
  query("period")
    .optional()
    .isIn(["daily", "weekly", "monthly", "quarterly", "annual"])
    .withMessage("Invalid period"),
];
