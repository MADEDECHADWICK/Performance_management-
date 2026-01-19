/**
 * Evaluation Routes (Schema v2.1 aligned)
 */

import { Router } from "express";
import { EvaluationController } from "../controllers/evaluation.controller";
import { authenticated } from "../utils/middleware";
import { withRoles } from "../utils/middleware";
import { requireEvaluationAccess } from "../middleware/requireEvaluationAccess";
import { validateRequest, handleValidationErrors } from "../middleware/validate";

import {
  createEvaluationCycleValidators,
  listEvaluationCyclesValidators,
  createEvaluationDefinitionValidators,
  listEvaluationDefinitionsValidators,
  createEvaluationAssignmentValidators,
  listEvaluationAssignmentsValidators,
  getEvaluationAssignmentValidators,
  submitEvaluationValidators,
  acknowledgeEvaluationValidators,
} from "../validators/evaluation.validators";

const router = Router();

/**
 * GET /evaluations/cycles
 */
router.get(
  "/cycles",
  authenticated(),
  validateRequest(listEvaluationCyclesValidators),
  handleValidationErrors,
  EvaluationController.listEvaluationCycles
);

/**
 * POST /evaluations/cycles
 */
router.post(
  "/cycles",
  withRoles("hr", "hr_manager", "admin", "super_admin"),
  validateRequest(createEvaluationCycleValidators),
  handleValidationErrors,
  EvaluationController.createEvaluationCycle
);

/**
 * GET /evaluations/definitions
 */
router.get(
  "/definitions",
  authenticated(),
  validateRequest(listEvaluationDefinitionsValidators),
  handleValidationErrors,
  EvaluationController.listEvaluationDefinitions
);

/**
 * POST /evaluations/definitions
 */
router.post(
  "/definitions",
  withRoles("hr", "hr_manager", "admin", "super_admin"),
  validateRequest(createEvaluationDefinitionValidators),
  handleValidationErrors,
  EvaluationController.createEvaluationDefinition
);

/**
 * GET /evaluations/assignments
 */
router.get(
  "/assignments",
  authenticated(),
  validateRequest(listEvaluationAssignmentsValidators),
  handleValidationErrors,
  EvaluationController.listEvaluationAssignments
);

/**
 * POST /evaluations/assignments
 */
router.post(
  "/assignments",
  withRoles("hr", "hr_manager", "admin", "super_admin"),
  validateRequest(createEvaluationAssignmentValidators),
  handleValidationErrors,
  EvaluationController.createEvaluationAssignment
);

/**
 * GET /evaluations/assignments/:assignmentId
 */
router.get(
  "/assignments/:assignmentId",
  ...authenticated(),
  requireEvaluationAccess("view"),
  validateRequest(getEvaluationAssignmentValidators),
  handleValidationErrors,
  EvaluationController.getEvaluationAssignment
);

/**
 * PATCH /evaluations/assignments/:assignmentId/submit
 */
router.patch(
  "/assignments/:assignmentId/submit",
  ...authenticated(),
  requireEvaluationAccess("submit"),
  validateRequest(submitEvaluationValidators),
  handleValidationErrors,
  EvaluationController.submitEvaluation
);

/**
 * PATCH /evaluations/assignments/:assignmentId/acknowledge
 */
router.patch(
  "/assignments/:assignmentId/acknowledge",
  ...authenticated(),
  requireEvaluationAccess("view"),
  validateRequest(acknowledgeEvaluationValidators),
  handleValidationErrors,
  EvaluationController.acknowledgeEvaluation
);

/**
 * GET /evaluations/assignments/:assignmentId/summary
 */
router.get(
  "/assignments/:assignmentId/summary",
  ...authenticated(),
  requireEvaluationAccess("view"),
  EvaluationController.getEvaluationSummary
);

/**
 * GET /evaluations/dashboard
 */
router.get(
  "/dashboard",
  authenticated(),
  EvaluationController.getEvaluationDashboard
);

export default router;
