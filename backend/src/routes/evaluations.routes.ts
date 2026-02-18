/**
 * Evaluation Routes (Schema v2.1 aligned)
 */

import { Router } from "express";
import { EvaluationController } from "../controllers/evaluation.controller";
import { authenticated } from "../utils/middleware";
import { requireEvaluationAccess } from "../middleware/requireEvaluationAccess";
import { requireRole } from "../middleware/reqiureRole";
import { validateRequest, handleValidationErrors } from "../middleware/validate";

const router = Router();

/**
 * GET /evaluations
 * List evaluations
 */
router.get("/", ...authenticated(), EvaluationController.listEvaluations);

/**
 * POST /evaluations
 * Create evaluation
 */
router.post(
  "/",
  ...authenticated(),
  requireRole("admin", "hr", "hr_manager", "super_admin", "manager"),
  EvaluationController.createEvaluation
);

/**
 * GET /evaluations/:evaluationId
 * Get evaluation details
 */
router.get(
  "/:evaluationId",
  ...authenticated(),
  requireEvaluationAccess("view"),
  EvaluationController.getEvaluation
);

/**
 * PATCH /evaluations/:evaluationId
 * Update evaluation
 */
router.patch(
  "/:evaluationId",
  ...authenticated(),
  requireEvaluationAccess("submit"),
  EvaluationController.updateEvaluation
);

/**
 * POST /evaluations/:evaluationId/submit
 * Submit evaluation
 */
router.post(
  "/:evaluationId/submit",
  ...authenticated(),
  requireEvaluationAccess("submit"),
  EvaluationController.submitEvaluation
);

/**
 * POST /evaluations/:evaluationId/approve
 * Approve evaluation
 */
router.post(
  "/:evaluationId/approve",
  ...authenticated(),
  requireEvaluationAccess("view"),
  EvaluationController.approveEvaluation
);

/**
 * GET /evaluations/cycle/:cycleId
 * Get evaluations by cycle
 */
router.get(
  "/cycle/:cycleId",
  ...authenticated(),
  EvaluationController.getEvaluationsByCycle
);

/**
 * GET /evaluations/:evaluationId/scores
 * Get evaluation scores
 */
router.get(
  "/:evaluationId/scores",
  ...authenticated(),
  requireEvaluationAccess("view"),
  EvaluationController.getEvaluationScores
);

export default router;
