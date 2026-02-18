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
  withRoles("hr", "hr_manager", "admin", "super_admin"),
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
  withRoles("hr", "hr_manager", "admin", "super_admin"),
  validateRequest(updateOnboardingCaseValidators),
  handleValidationErrors,
  EmployeeOnboardingCaseController.update
);

/**
 * PATCH /onboarding-cases/stages/:stageId (HR/Admin)
 */
router.patch(
  "/stages/:stageId",
  withRoles("hr", "hr_manager", "admin", "super_admin"),
  validateRequest(updateOnboardingStageValidators),
  handleValidationErrors,
  EmployeeOnboardingCaseController.updateStage
);

/**
 * POST /onboarding-cases/:caseId/initialize-stages (HR/Admin)
 */
router.post(
  "/:caseId/initialize-stages",
  withRoles("hr", "hr_manager", "admin", "super_admin"),
  validateRequest(initializeOnboardingStagesValidators),
  handleValidationErrors,
  EmployeeOnboardingCaseController.initializeStages
);

export default router;
