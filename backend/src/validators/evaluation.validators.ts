/**
 * Evaluation endpoint validators (Prisma Schema v2.1 aligned)
 */

import { body, param, query } from "express-validator";

const evaluatorTypes = ["self", "manager", "peer", "direct_report", "client", "custom"] as const;
const cycleStatuses = ["draft", "active", "closed"] as const;
const definitionStatuses = ["draft", "published", "closed"] as const;
const assignmentStatuses = ["pending", "in_progress", "submitted", "cancelled"] as const;

/**
 * GET /evaluations/cycles
 */
export const listEvaluationCyclesValidators = [
  query("page").optional().isInt({ min: 1 }).withMessage("page must be >= 1"),
  query("pageSize").optional().isInt({ min: 1, max: 100 }).withMessage("pageSize must be 1-100"),
  query("status").optional().isIn(cycleStatuses).withMessage(`status must be one of: ${cycleStatuses.join(", ")}`),
];

/**
 * POST /evaluations/cycles
 * Body: cycleName, description?, startDate, endDate, status?
 */
export const createEvaluationCycleValidators = [
  body("cycleName").isString().trim().isLength({ min: 3, max: 255 }).withMessage("cycleName required (3-255 chars)"),
  body("description").optional().isString().trim(),
  body("startDate").isISO8601().withMessage("startDate must be valid ISO8601 date"),
  body("endDate").isISO8601().withMessage("endDate must be valid ISO8601 date"),
  body("status").optional().isIn(cycleStatuses).withMessage(`status must be one of: ${cycleStatuses.join(", ")}`),
];

/**
 * GET /evaluations/definitions
 */
export const listEvaluationDefinitionsValidators = [
  query("page").optional().isInt({ min: 1 }).withMessage("page must be >= 1"),
  query("pageSize").optional().isInt({ min: 1, max: 100 }).withMessage("pageSize must be 1-100"),
  query("cycleId").optional().isInt({ min: 1 }).withMessage("cycleId must be a valid integer"),
  query("departmentId").optional().isInt({ min: 1 }).withMessage("departmentId must be a valid integer"),
  query("status").optional().isIn(definitionStatuses).withMessage(`status must be one of: ${definitionStatuses.join(", ")}`),
];

/**
 * POST /evaluations/definitions
 * Body matches EvaluationDefinition (schema v2.1)
 */
export const createEvaluationDefinitionValidators = [
  body("name").isString().trim().isLength({ min: 3, max: 255 }).withMessage("name required (3-255 chars)"),
  body("description").optional().isString().trim(),

  body("cycleId").optional().isInt({ min: 1 }).withMessage("cycleId must be a valid integer"),
  body("departmentId").optional().isInt({ min: 1 }).withMessage("departmentId must be a valid integer"),

  body("enableSelfEvaluation").optional().isBoolean(),
  body("enablePeerEvaluation").optional().isBoolean(),
  body("enableUpwardEvaluation").optional().isBoolean(),
  body("enableDownwardEvaluation").optional().isBoolean(),
  body("enableClientEvaluation").optional().isBoolean(),

  body("dueDate").optional().isISO8601().withMessage("dueDate must be ISO8601 if provided"),
  body("processAnonymously").optional().isBoolean(),
  body("hideFromDashboard").optional().isBoolean(),
  body("excludeFromScore").optional().isBoolean(),
  body("requireEvaluatorSignature").optional().isBoolean(),
  body("requireEvaluateeSignature").optional().isBoolean(),

  body("status").optional().isIn(definitionStatuses).withMessage(`status must be one of: ${definitionStatuses.join(", ")}`),

  // JSON fields
  body("questions").optional().isArray().withMessage("questions must be an array if provided"),
  body("scoringConfig").optional().isObject().withMessage("scoringConfig must be an object if provided"),
];

/**
 * GET /evaluations/assignments
 */
export const listEvaluationAssignmentsValidators = [
  query("page").optional().isInt({ min: 1 }).withMessage("page must be >= 1"),
  query("pageSize").optional().isInt({ min: 1, max: 100 }).withMessage("pageSize must be 1-100"),

  query("status").optional().isIn(assignmentStatuses).withMessage(`status must be one of: ${assignmentStatuses.join(", ")}`),
  query("evaluatorType").optional().isIn(evaluatorTypes).withMessage(`evaluatorType must be one of: ${evaluatorTypes.join(", ")}`),

  query("evaluationDefinitionId").optional().isInt({ min: 1 }).withMessage("evaluationDefinitionId must be a valid integer"),
  query("evaluateeProfileId").optional().isInt({ min: 1 }).withMessage("evaluateeProfileId must be a valid integer"),
  query("evaluatorProfileId").optional().isInt({ min: 1 }).withMessage("evaluatorProfileId must be a valid integer"),
];

/**
 * POST /evaluations/assignments
 * Body matches EvaluationAssignment (schema v2.1)
 */
export const createEvaluationAssignmentValidators = [
  body("evaluationDefinitionId").isInt({ min: 1 }).withMessage("evaluationDefinitionId required"),
  body("evaluatorProfileId").isInt({ min: 1 }).withMessage("evaluatorProfileId required"),
  body("evaluateeProfileId").isInt({ min: 1 }).withMessage("evaluateeProfileId required"),
  body("evaluatorType").isIn(evaluatorTypes).withMessage(`evaluatorType must be one of: ${evaluatorTypes.join(", ")}`),
];

/**
 * GET /evaluations/assignments/:assignmentId
 */
export const getEvaluationAssignmentValidators = [
  param("assignmentId").isInt({ min: 1 }).withMessage("assignmentId must be a valid integer"),
];

/**
 * PATCH /evaluations/assignments/:assignmentId/submit
 * Schema v2.1 stores: responses (Json), score (Decimal), evidenceUrls (String[]), evaluatorComments (Text)
 */
export const submitEvaluationValidators = [
  param("assignmentId").isInt({ min: 1 }).withMessage("assignmentId must be a valid integer"),

  body("responses").optional().isArray().withMessage("responses must be an array if provided"),
  body("score").optional().isFloat({ min: 0 }).withMessage("score must be a number >= 0 if provided"),
  body("evidenceUrls").optional().isArray().withMessage("evidenceUrls must be an array if provided"),
  body("evaluatorComments").optional().isString().trim(),
  body("evaluatorSigned").optional().isBoolean(),
];

/**
 * PATCH /evaluations/assignments/:assignmentId/acknowledge
 */
export const acknowledgeEvaluationValidators = [
  param("assignmentId").isInt({ min: 1 }).withMessage("assignmentId must be a valid integer"),
  body("acknowledged").optional().isBoolean().withMessage("acknowledged must be boolean if provided"),
];
