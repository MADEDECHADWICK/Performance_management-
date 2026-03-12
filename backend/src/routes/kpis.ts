import { Router } from "express";
import { body, param, query } from "express-validator";
import KpiController from "../controllers/kpi.controller";
import { handleValidationErrors } from "../middleware/validate";
import { authenticated } from "../utils/middleware";

const router = Router();

const baseKpiValidators = [
  body("userId").optional().isInt({ min: 1 }),
  body("ownerProfileId").optional().isInt({ min: 1 }),
  body("cycleId").optional({ nullable: true }).isInt({ min: 1 }),
  body("departmentId").optional({ nullable: true }).isInt({ min: 1 }),
  body("roleId").optional({ nullable: true }).isInt({ min: 1 }),
  body("title").optional().isString().trim().isLength({ min: 2, max: 160 }),
  body("name").optional().isString().trim().isLength({ min: 2, max: 160 }),
  body("description").optional().isString().trim().isLength({ max: 1000 }),
  body("category").optional().isString().trim().isLength({ max: 120 }),
  body("kpiType").optional().isString().trim().isLength({ max: 80 }),
  body("strategicTheme").optional().isString().trim().isLength({ max: 160 }),
  body("strategicObjective").optional().isString().trim().isLength({ max: 160 }),
  body("criticalSuccessFactor").optional().isString().trim().isLength({ max: 160 }),
  body("indicatorType").optional().isString().trim().isLength({ max: 80 }),
  body("kpiCategory").optional().isString().trim().isLength({ max: 120 }),
  body("target").optional().isFloat({ gt: 0 }),
  body("targetValue").optional().isFloat({ gt: 0 }),
  body("actual").optional().isFloat({ min: 0 }),
  body("actualValue").optional().isFloat({ min: 0 }),
  body("baseline").optional().isFloat(),
  body("baselineText").optional().isString().trim().isLength({ max: 120 }),
  body("unit").optional().isString().trim().isLength({ max: 40 }),
  body("measurementUnit").optional().isString().trim().isLength({ max: 40 }),
  body("targetFrequency").optional().isString().trim().isLength({ max: 40 }),
  body("targetType").optional().isString().trim().isLength({ max: 40 }),
  body("targetDescription").optional().isString().trim().isLength({ max: 4000 }),
  body("weight").optional().isFloat({ gt: 0 }),
  body("dueDate").optional({ nullable: true }).isISO8601(),
  body("reviewOwnerProfileId").optional({ nullable: true }).isInt({ min: 1 }),
  body("reviewFrequency").optional().isString().trim().isLength({ max: 40 }),
  body("approvalRequired").optional().isBoolean(),
  body("evidenceRequired").optional().isBoolean(),
  body("commentaryRequired").optional().isBoolean(),
  body("redThreshold").optional({ nullable: true }).isFloat(),
  body("amberThreshold").optional({ nullable: true }).isFloat(),
  body("greenThreshold").optional({ nullable: true }).isFloat(),
  body("dataSourceType").optional().isString().trim().isLength({ max: 80 }),
  body("sourceReference").optional().isString().trim().isLength({ max: 500 }),
  body("formulaLocked").optional().isBoolean(),
  body("rollupMethod").optional().isString().trim().isLength({ max: 80 }),
  body("inheritWeight").optional().isBoolean(),
  body("isActive").optional().isBoolean(),
  body().custom((value) => {
    if (!value || typeof value !== "object") {
      throw new Error("Invalid KPI payload");
    }
    const hasName = Boolean(String(value.title || value.name || "").trim());
    if (!hasName) {
      throw new Error("title or name is required");
    }
    const hasTarget = value.target !== undefined || value.targetValue !== undefined;
    if (!hasTarget) {
      throw new Error("target or targetValue is required");
    }
    return true;
  }),
];

router.get(
  "/",
  ...authenticated(),
  query("userId").optional().isInt({ min: 1 }),
  query("departmentId").optional().isInt({ min: 1 }),
  query("status")
    .optional()
    .isIn(["on_track", "at_risk", "achieved", "missed"]),
  query("isActive").optional().isBoolean(),
  handleValidationErrors,
  KpiController.listKPIs
);

router.post(
  "/",
  ...authenticated(),
  ...baseKpiValidators,
  handleValidationErrors,
  KpiController.createKPI
);

router.patch(
  "/:kpiId",
  ...authenticated(),
  param("kpiId").isInt({ min: 1 }),
  body("userId").optional().isInt({ min: 1 }),
  body("ownerProfileId").optional().isInt({ min: 1 }),
  body("cycleId").optional({ nullable: true }).isInt({ min: 1 }),
  body("departmentId").optional({ nullable: true }).isInt({ min: 1 }),
  body("roleId").optional({ nullable: true }).isInt({ min: 1 }),
  body("title").optional().isString().trim().isLength({ min: 2, max: 160 }),
  body("name").optional().isString().trim().isLength({ min: 2, max: 160 }),
  body("description").optional().isString().trim().isLength({ max: 1000 }),
  body("category").optional().isString().trim().isLength({ max: 120 }),
  body("kpiType").optional().isString().trim().isLength({ max: 80 }),
  body("strategicTheme").optional().isString().trim().isLength({ max: 160 }),
  body("strategicObjective").optional().isString().trim().isLength({ max: 160 }),
  body("criticalSuccessFactor").optional().isString().trim().isLength({ max: 160 }),
  body("indicatorType").optional().isString().trim().isLength({ max: 80 }),
  body("kpiCategory").optional().isString().trim().isLength({ max: 120 }),
  body("target").optional().isFloat({ gt: 0 }),
  body("targetValue").optional().isFloat({ gt: 0 }),
  body("actual").optional().isFloat({ min: 0 }),
  body("actualValue").optional().isFloat({ min: 0 }),
  body("baseline").optional().isFloat(),
  body("baselineText").optional().isString().trim().isLength({ max: 120 }),
  body("unit").optional().isString().trim().isLength({ max: 40 }),
  body("measurementUnit").optional().isString().trim().isLength({ max: 40 }),
  body("targetFrequency").optional().isString().trim().isLength({ max: 40 }),
  body("targetType").optional().isString().trim().isLength({ max: 40 }),
  body("targetDescription").optional().isString().trim().isLength({ max: 4000 }),
  body("weight").optional().isFloat({ gt: 0 }),
  body("dueDate").optional({ nullable: true }).isISO8601(),
  body("reviewOwnerProfileId").optional({ nullable: true }).isInt({ min: 1 }),
  body("reviewFrequency").optional().isString().trim().isLength({ max: 40 }),
  body("approvalRequired").optional().isBoolean(),
  body("evidenceRequired").optional().isBoolean(),
  body("commentaryRequired").optional().isBoolean(),
  body("redThreshold").optional({ nullable: true }).isFloat(),
  body("amberThreshold").optional({ nullable: true }).isFloat(),
  body("greenThreshold").optional({ nullable: true }).isFloat(),
  body("dataSourceType").optional().isString().trim().isLength({ max: 80 }),
  body("sourceReference").optional().isString().trim().isLength({ max: 500 }),
  body("formulaLocked").optional().isBoolean(),
  body("rollupMethod").optional().isString().trim().isLength({ max: 80 }),
  body("inheritWeight").optional().isBoolean(),
  body("isActive").optional().isBoolean(),
  handleValidationErrors,
  KpiController.updateKPI
);

router.delete(
  "/:kpiId",
  ...authenticated(),
  param("kpiId").isInt({ min: 1 }),
  handleValidationErrors,
  KpiController.deleteKPI
);

router.patch(
  "/:kpiId/progress",
  ...authenticated(),
  param("kpiId").isInt({ min: 1 }),
  body("actual").isFloat({ min: 0 }),
  body("note").optional().isString().trim().isLength({ max: 1000 }),
  body("measuredAt").optional({ nullable: true }).isISO8601(),
  handleValidationErrors,
  KpiController.updateKPIProgress
);

router.get(
  "/dashboard/:userId",
  ...authenticated(),
  param("userId").isInt({ min: 1 }),
  handleValidationErrors,
  KpiController.getEmployeeKPIDashboard
);

router.get(
  "/:kpiId",
  ...authenticated(),
  param("kpiId").isInt({ min: 1 }),
  handleValidationErrors,
  KpiController.getKPIById
);

export default router;
