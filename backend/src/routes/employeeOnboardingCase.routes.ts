// This file defines the API routes for managing employee onboarding cases and their associated policies. It includes endpoints for listing, creating, retrieving, and updating onboarding cases, as well as managing the stages and policies associated with each case. The routes are protected with authentication and role-based access control middleware to ensure that only authorized users can perform certain actions. Validation middleware is also used to ensure that incoming requests meet the required criteria before being processed by the corresponding controller methods. By organizing these routes in a dedicated file, we can maintain a clear structure for our API and facilitate the management of employee onboarding processes within the application.

import { Router } from "express";
import { authenticated, withRoles } from "../utils/middleware";
import { validateRequest, handleValidationErrors } from "../middleware/validate";
import { EmployeeOnboardingCaseController } from "../controllers/employeeOnboardingCase.controller";
import {
  listOnboardingCasesValidators,
  createOnboardingCaseValidators,
  updateOnboardingCaseValidators,
  getOnboardingCaseValidators,
  updateOnboardingStageValidators,
  initializeOnboardingStagesValidators,
  assignOnboardingPoliciesValidators,
  listOnboardingPoliciesValidators,
  acknowledgeOnboardingPolicyValidators,
} from "../validators/employeeOnboardingCase.validators";

const router = Router();

/**
 * GET /onboarding-cases
 */
router.get(
  "/",
  authenticated(),
  validateRequest(listOnboardingCasesValidators),
  handleValidationErrors,
  EmployeeOnboardingCaseController.list
);

/**
 * POST /onboarding-cases (HR/Admin)
 */
router.post(
  "/",
  withRoles("hr", "super_admin"),
  validateRequest(createOnboardingCaseValidators),
  handleValidationErrors,
  EmployeeOnboardingCaseController.create
);

/**
 * GET /onboarding-cases/:caseId
 */
router.get(
  "/:caseId",
  authenticated(),
  validateRequest(getOnboardingCaseValidators),
  handleValidationErrors,
  EmployeeOnboardingCaseController.getById
);

/**
 * PATCH /onboarding-cases/:caseId (HR/Admin)
 */
router.patch(
  "/:caseId",
  withRoles("hr", "super_admin"),
  validateRequest(updateOnboardingCaseValidators),
  handleValidationErrors,
  EmployeeOnboardingCaseController.update
);

/**
 * PATCH /onboarding-cases/stages/:stageId (HR/Admin)
 */
router.patch(
  "/stages/:stageId",
  withRoles("hr", "super_admin"),
  validateRequest(updateOnboardingStageValidators),
  handleValidationErrors,
  EmployeeOnboardingCaseController.updateStage
);

/**
 * POST /onboarding-cases/:caseId/initialize-stages (HR/Admin)
 */
router.post(
  "/:caseId/initialize-stages",
  withRoles("hr", "super_admin"),
  validateRequest(initializeOnboardingStagesValidators),
  handleValidationErrors,
  EmployeeOnboardingCaseController.initializeStages
);

/**
 * GET /onboarding-cases/:caseId/policies
 */
router.get(
  "/:caseId/policies",
  authenticated(),
  validateRequest(listOnboardingPoliciesValidators),
  handleValidationErrors,
  EmployeeOnboardingCaseController.listPolicies
);

/**
 * POST /onboarding-cases/:caseId/policies (HR/Admin)
 */
router.post(
  "/:caseId/policies",
  withRoles("hr", "super_admin"),
  validateRequest(assignOnboardingPoliciesValidators),
  handleValidationErrors,
  EmployeeOnboardingCaseController.assignPolicies
);

/**
 * POST /onboarding-cases/:caseId/policies/:documentId/acknowledge
 */
router.post(
  "/:caseId/policies/:documentId/acknowledge",
  authenticated(),
  validateRequest(acknowledgeOnboardingPolicyValidators),
  handleValidationErrors,
  EmployeeOnboardingCaseController.acknowledgePolicy
);

/**
 * POST /onboarding-cases/:caseId/submit-documents
 * Employee submits Step 1 documents to HR. Missing documents do not block.
 */
router.post(
  "/:caseId/submit-documents",
  authenticated(),
  EmployeeOnboardingCaseController.submitDocuments
);

/**
 * POST /onboarding-cases/:caseId/submit
 * Employee submits the full onboarding assessment after reading all policies.
 */
router.post(
  "/:caseId/submit",
  authenticated(),
  EmployeeOnboardingCaseController.submit
);

/**
 * POST /onboarding-cases/:caseId/request-changes (HR/Admin)
 */
router.post(
  "/:caseId/request-changes",
  withRoles("hr", "super_admin"),
  EmployeeOnboardingCaseController.requestChanges
);

/**
 * POST /onboarding-cases/:caseId/activate (HR/Admin)
 */
router.post(
  "/:caseId/activate",
  withRoles("hr", "super_admin"),
  EmployeeOnboardingCaseController.activate
);

export default router;
