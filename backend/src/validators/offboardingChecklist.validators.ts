import { body, param } from "express-validator";

export const listOffboardingItemsValidators = [
  param("caseId").isInt().withMessage("caseId must be an integer"),
];

export const createOffboardingItemsValidators = [
  param("caseId").isInt().withMessage("caseId must be an integer"),
  body("items").isArray({ min: 1 }).withMessage("items must be a non-empty array"),
  body("items.*.itemName").isString().withMessage("itemName is required"),
  body("items.*.description").optional().isString(),
  body("items.*.orderIndex").optional().isInt(),
  body("items.*.requiresDocument").optional().isBoolean(),
  body("items.*.documentId").optional().isInt(),
];

export const completeOffboardingItemValidators = [
  param("caseId").isInt().withMessage("caseId must be an integer"),
  param("itemId").isInt().withMessage("itemId must be an integer"),
];

export const attachOffboardingItemDocumentValidators = [
  param("caseId").isInt().withMessage("caseId must be an integer"),
  param("itemId").isInt().withMessage("itemId must be an integer"),
  body("fileName").isString().withMessage("fileName is required"),
  body("filePath").isString().withMessage("filePath is required"),
  body("mimeType").optional().isString(),
  body("fileSize").optional().isInt(),
];
