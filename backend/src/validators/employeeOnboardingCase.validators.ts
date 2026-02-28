import { body, param, query } from "express-validator";
import { OnboardingStatus } from "@prisma/client";

export const listOnboardingCasesValidators = [
  query("page").optional().isInt({ min: 1 }),
  query("pageSize").optional().isInt({ min: 1, max: 100 }),

  query("status").optional().isIn(Object.values(OnboardingStatus)),
  query("hrOwnerProfileId").optional().isInt({ min: 1 }),
  query("profileId").optional().isInt({ min: 1 }),
  query("candidateId").optional().isInt({ min: 1 }),
];

export const createOnboardingCaseValidators = [
  body("candidateId").optional().isInt({ min: 1 }),
  body("profileId").optional().isInt({ min: 1 }),

  body().custom((val) => {
    if (!val.candidateId && !val.profileId) {
      throw new Error("Either candidateId or profileId is required");
    }
    return true;
  }),

  body("hrOwnerProfileId").optional().isInt({ min: 1 }),
  body("startDate").optional().isISO8601(),
  body("dueDate").optional().isISO8601(),
  body("notes").optional().isString(),
];

export const getOnboardingCaseValidators = [
  param("caseId").isInt({ min: 1 }),
];

export const updateOnboardingCaseValidators = [
  param("caseId").isInt({ min: 1 }),

  body("status").optional().isIn(Object.values(OnboardingStatus)),
  body("hrOwnerProfileId").optional({ nullable: true }).isInt({ min: 1 }),
  body("startDate").optional({ nullable: true }).isISO8601(),
  body("dueDate").optional({ nullable: true }).isISO8601(),
  body("notes").optional({ nullable: true }).isString(),
];

export const updateOnboardingStageValidators = [
  param("stageId").isInt({ min: 1 }),

  body("status").optional().isIn(Object.values(OnboardingStatus)),
  body("ownerProfileId").optional({ nullable: true }).isInt({ min: 1 }),
  body("dueDate").optional({ nullable: true }).isISO8601(),
  body("notes").optional({ nullable: true }).isString(),
];

export const initializeOnboardingStagesValidators = [
  param("caseId").isInt({ min: 1 }),
];

export const assignOnboardingPoliciesValidators = [
  param("caseId").isInt({ min: 1 }),
  body("documentIds")
    .isArray({ min: 1 })
    .withMessage("documentIds must be a non-empty array"),
  body("documentIds.*")
    .isInt({ min: 1 })
    .withMessage("Each document id must be a positive integer"),
];

export const listOnboardingPoliciesValidators = [
  param("caseId").isInt({ min: 1 }),
];

export const acknowledgeOnboardingPolicyValidators = [
  param("caseId").isInt({ min: 1 }),
  param("documentId").isInt({ min: 1 }),
];
