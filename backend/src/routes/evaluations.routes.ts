import { Router } from "express";
import { body, param } from "express-validator";
import EvaluationController from "../controllers/evaluation.controller";
import { requireEvaluationAccess } from "../middleware/requireEvaluationAccess";
import { handleValidationErrors } from "../middleware/validate";
import { authenticated } from "../utils/middleware";

const router = Router();

const cycleValidators = [
  body("title").isString().trim().isLength({ min: 3, max: 120 }),
  body("description").optional().isString().trim().isLength({ max: 500 }),
  body("cycleType")
    .optional()
    .isString()
    .isIn(["annual", "mid_year", "mid-year", "quarterly", "probation"]),
  body("startDate").isISO8601(),
  body("endDate").isISO8601(),
  body("dueDate").optional({ nullable: true }).isISO8601(),
  body("departmentId").optional({ nullable: true }).isInt({ min: 1 }),
  body("templateId").optional({ nullable: true }).isInt({ min: 1 }),
  body("enableSelfEvaluation").optional().isBoolean(),
  body("enablePeerEvaluation").optional().isBoolean(),
  body("enableUpwardEvaluation").optional().isBoolean(),
  body("enableDownwardEvaluation").optional().isBoolean(),
  body("processAnonymously").optional().isBoolean(),
  body("hideFromDashboard").optional().isBoolean(),
  body("excludeFromScore").optional().isBoolean(),
  body("requireEvaluatorSignature").optional().isBoolean(),
  body("requireEvaluateeSignature").optional().isBoolean(),
  body("scoringConfig").optional().isObject(),
  body("questions").optional().isArray({ min: 1 }),
  body("questions.*.text").optional().isString().trim().isLength({ min: 3, max: 500 }),
  body("questions.*.category")
    .optional()
    .isString()
    .isIn(["competency", "behavior", "culture"]),
  body("questions.*.weight").optional().isFloat({ min: 0.1, max: 10 }),
  body("questions.*.order").optional().isInt({ min: 1, max: 500 }),
];

const assignValidators = [
  param("cycleId").isInt({ min: 1 }).toInt(),
  body("assignments").isArray({ min: 1 }),
  body("assignments.*.evaluateeId").isInt({ min: 1 }),
  body("assignments.*.evaluatorId").isInt({ min: 1 }),
  body("assignments.*.relationship")
    .isString()
    .isIn(["self", "peer", "manager", "subordinate"]),
  body("assignments.*.dueDate").optional({ nullable: true }).isISO8601(),
];

const submitValidators = [
  param("assignmentId").isInt({ min: 1 }).toInt(),
  body("responses").isArray({ min: 1 }),
  body("responses.*.questionId").isInt({ min: 1 }),
  body("responses.*.score").isInt({ min: 1, max: 5 }),
  body("responses.*.comment").optional().isString().trim().isLength({ max: 2000 }),
  body("evaluatorComment").optional().isString().trim().isLength({ max: 2000 }),
  body("evaluatorSigned").optional().isBoolean(),
];

router.get(
  "/dashboard/:userId",
  ...authenticated(),
  param("userId").isInt({ min: 1 }).toInt(),
  handleValidationErrors,
  EvaluationController.getEmployeeDashboard
);

router.get("/directory", ...authenticated(), EvaluationController.getDirectory);

router.get("/cycles", ...authenticated(), EvaluationController.getMyCycles);

router.get(
  "/cycles/:cycleId",
  ...authenticated(),
  param("cycleId").isInt({ min: 1 }).toInt(),
  handleValidationErrors,
  EvaluationController.getCycleById
);

router.post(
  "/cycles",
  ...authenticated(),
  ...cycleValidators,
  handleValidationErrors,
  EvaluationController.createCycle
);

router.post(
  "/cycles/:cycleId/assign",
  ...authenticated(),
  ...assignValidators,
  handleValidationErrors,
  EvaluationController.assignEvaluators
);

router.get(
  "/cycles/:cycleId/results",
  ...authenticated(),
  param("cycleId").isInt({ min: 1 }).toInt(),
  handleValidationErrors,
  EvaluationController.getCycleResults
);

router.get(
  "/assignments/mine",
  ...authenticated(),
  EvaluationController.getMyPendingEvaluations
);

router.get(
  "/assignments/:assignmentId",
  ...authenticated(),
  param("assignmentId").isInt({ min: 1 }).toInt(),
  handleValidationErrors,
  requireEvaluationAccess("view"),
  EvaluationController.getAssignmentById
);

router.post(
  "/assignments/:assignmentId/submit",
  ...authenticated(),
  ...submitValidators,
  handleValidationErrors,
  requireEvaluationAccess("submit"),
  EvaluationController.submitEvaluation
);

router.patch(
  "/assignments/:assignmentId/acknowledge",
  ...authenticated(),
  param("assignmentId").isInt({ min: 1 }).toInt(),
  handleValidationErrors,
  requireEvaluationAccess("view"),
  EvaluationController.acknowledgeEvaluation
);

export default router;
