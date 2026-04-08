import { Router } from "express";
import { authenticated, withRoles } from "../utils/middleware";
import { validateRequest, handleValidationErrors } from "../middleware/validate";
import { OnboardingPoliciesController } from "../controllers/onboardingPolicies.controller";
import {
  listOnboardingPoliciesLibraryValidators,
  getOnboardingPolicyValidators,
  getOnboardingPolicyBySlugValidators,
  createOnboardingPolicyValidators,
  updateOnboardingPolicyValidators,
} from "../validators/onboardingPolicies.validators";

const router = Router();

router.get(
  "/",
  authenticated(),
  validateRequest(listOnboardingPoliciesLibraryValidators),
  handleValidationErrors,
  OnboardingPoliciesController.list
);

router.get(
  "/slug/:slug",
  authenticated(),
  validateRequest(getOnboardingPolicyBySlugValidators),
  handleValidationErrors,
  OnboardingPoliciesController.getBySlug
);

router.get(
  "/:policyId",
  authenticated(),
  validateRequest(getOnboardingPolicyValidators),
  handleValidationErrors,
  OnboardingPoliciesController.getById
);

router.post(
  "/",
  withRoles("hr", "super_admin"),
  validateRequest(createOnboardingPolicyValidators),
  handleValidationErrors,
  OnboardingPoliciesController.create
);

router.patch(
  "/:policyId",
  withRoles("hr", "super_admin"),
  validateRequest(updateOnboardingPolicyValidators),
  handleValidationErrors,
  OnboardingPoliciesController.update
);

export default router;
