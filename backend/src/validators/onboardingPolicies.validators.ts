import { body, param } from "express-validator";

export const listOnboardingPoliciesLibraryValidators = [];

export const getOnboardingPolicyValidators = [
  param("policyId").isInt({ min: 1 }),
];

export const getOnboardingPolicyBySlugValidators = [
  param("slug")
    .isString()
    .trim()
    .matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .withMessage("slug must be a kebab-case identifier"),
];

export const createOnboardingPolicyValidators = [
  body("title")
    .isString()
    .trim()
    .isLength({ min: 3, max: 200 })
    .withMessage("title is required"),
  body("slug")
    .optional()
    .isString()
    .trim()
    .matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .withMessage("slug must be a kebab-case identifier"),
  body("summary").optional({ nullable: true }).isString(),
  body("content").optional({ nullable: true }).isString(),
  body("sectionKey").optional().isString().trim().isLength({ min: 1, max: 80 }),
  body("sectionLabel").optional().isString().trim().isLength({ min: 1, max: 120 }),
  body("orderIndex").optional().isInt({ min: 0 }),
  body("requiresAcknowledgement").optional().isBoolean(),
  body("isActive").optional().isBoolean(),
  body("isPublished").optional().isBoolean(),
];

export const updateOnboardingPolicyValidators = [
  param("policyId").isInt({ min: 1 }),
  body("title").optional().isString().trim().isLength({ min: 3, max: 200 }),
  body("slug")
    .optional()
    .isString()
    .trim()
    .matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .withMessage("slug must be a kebab-case identifier"),
  body("summary").optional({ nullable: true }).isString(),
  body("content").optional({ nullable: true }).isString(),
  body("sectionKey").optional().isString().trim().isLength({ min: 1, max: 80 }),
  body("sectionLabel").optional().isString().trim().isLength({ min: 1, max: 120 }),
  body("orderIndex").optional().isInt({ min: 0 }),
  body("requiresAcknowledgement").optional().isBoolean(),
  body("isActive").optional().isBoolean(),
  body("isPublished").optional().isBoolean(),
];
