/**
 * Department Routes
 * Endpoints for department management, KPIs, and organizational metrics
 */

import { Router } from "express";
import { DepartmentController } from "../controllers/department.controller";
import { authenticated, withRoles } from "../utils/middleware";
import { validateRequest, handleValidationErrors } from "../middleware/validate";
import {
  createDepartmentValidators,
  updateDepartmentValidators,
  createDepartmentKpiValidators,
} from "../validators/department.validators";

const router = Router();

/**
 * GET /departments
 * List all departments
 * Query: page, pageSize
 */
router.get("/", ...authenticated(), DepartmentController.listDepartments);

/**
 * POST /departments
 * Create new department
 * Requires: admin role
 * Body: name, description, departmentCode, departmentHeadId
 */
router.post(
  "/",
  ...withRoles("admin"),
  validateRequest(createDepartmentValidators),
  handleValidationErrors,
  DepartmentController.createDepartment
);

/**
 * GET /departments/:departmentId
 * Get department details
 */
router.get("/:departmentId", ...authenticated(), DepartmentController.getDepartment);

/**
 * PATCH /departments/:departmentId
 * Update department details
 * Body: name, description, departmentCode, departmentHeadId
 */
router.patch(
  "/:departmentId",
  ...authenticated(),
  validateRequest(updateDepartmentValidators),
  handleValidationErrors,
  DepartmentController.updateDepartment
);

/**
 * GET /departments/:departmentId/employees
 * List department employees
 * Query: page, pageSize, status
 */
router.get(
  "/:departmentId/employees",
  ...authenticated(),
  DepartmentController.listDepartmentEmployees
);

/**
 * GET /departments/:departmentId/kpis
 * List department KPIs
 * Query: page, pageSize
 */
router.get("/:departmentId/kpis", ...authenticated(), DepartmentController.listDepartmentKPIs);

/**
 * POST /departments/:departmentId/kpis
 * Create department KPI
 */
router.post(
  "/:departmentId/kpis",
  ...authenticated(),
  validateRequest(createDepartmentKpiValidators),
  handleValidationErrors,
  DepartmentController.createDepartmentKPI
);

/**
 * GET /departments/:departmentId/revenue
 * Get department revenue report
 * Query: dateFrom, dateTo, groupBy
 */
router.get(
  "/:departmentId/revenue",
  ...authenticated(),
  DepartmentController.getDepartmentRevenue
);

/**
 * GET /departments/:departmentId/jobs
 * List jobs assigned to department
 * Query: page, pageSize, status
 */
router.get("/:departmentId/jobs", ...authenticated(), DepartmentController.listDepartmentJobs);

/**
 * GET /departments/:departmentId/dashboard
 */
router.get(
  "/:departmentId/dashboard",
  ...authenticated(),
  DepartmentController.getDepartmentDashboard
);

/**
 * GET /departments/:departmentId/utilization
 */
router.get(
  "/:departmentId/utilization",
  ...authenticated(),
  DepartmentController.getDepartmentUtilization
);

/**
 * GET /departments/:departmentId/profitability
 * Query: dateFrom, dateTo
 */
router.get(
  "/:departmentId/profitability",
  ...authenticated(),
  DepartmentController.getDepartmentProfitability
);

export default router;
