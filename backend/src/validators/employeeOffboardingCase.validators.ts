import { body, param, query } from "express-validator";
import { OffboardingStatus } from "@prisma/client";

export const listOffboardingCasesValidators = [
  query("status").optional().isIn(Object.values(OffboardingStatus)),
  query("page").optional().isInt({ min: 1 }),
  query("pageSize").optional().isInt({ min: 1, max: 200 }),
];

export const createOffboardingCaseValidators = [
  body("profileId").isInt().withMessage("profileId is required"),
  body("hrOwnerProfileId").optional().isInt(),
  body("reason").optional().isString(),
];

export const getOffboardingCaseValidators = [
  param("caseId").isInt().withMessage("caseId must be an integer"),
];

export const updateOffboardingCaseValidators = [
  param("caseId").isInt().withMessage("caseId must be an integer"),
  body("status").optional().isIn(Object.values(OffboardingStatus)),
  body("reason").optional().isString(),
  body("notes").optional().isString(),
  body("separationDate").optional().isISO8601(),
];

export const reactivateOffboardingCaseValidators = [
  param("caseId").isInt().withMessage("caseId must be an integer"),
];
