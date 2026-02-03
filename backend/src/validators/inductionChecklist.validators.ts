import { body, param } from "express-validator";

export const createInductionChecklistValidators = [
  body("onboardingCaseId").optional().isInt({ min: 1 }),
  body("employeeProfileId").isInt({ min: 1 }),
  body("checklistName").optional().isString().trim().isLength({ min: 3, max: 255 }),
  body("dueDate").optional().isISO8601(),

  body("items").isArray({ min: 1 }).withMessage("items must be a non-empty array"),

  body("items.*.itemName")
    .isString()
    .trim()
    .isLength({ min: 2, max: 255 }),

  body("items.*.description").optional().isString(),
  body("items.*.orderIndex").optional().isInt({ min: 0 }),
  body("items.*.requiresDocument").optional().isBoolean(),
  body("items.*.documentId").optional().isInt({ min: 1 }),
];

export const getInductionChecklistValidators = [
  param("checklistId").isInt({ min: 1 }),
];

export const completeInductionItemValidators = [
  param("checklistId").isInt({ min: 1 }),
  param("itemId").isInt({ min: 1 }),
];

export const attachInductionItemDocumentValidators = [
  param("checklistId").isInt({ min: 1 }),
  param("itemId").isInt({ min: 1 }),
  body("documentId").isInt({ min: 1 }),
];
