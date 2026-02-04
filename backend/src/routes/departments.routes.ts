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
  ...withRoles("admin", "hr", "hr_manager"),
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
  DepartmentController.getDepartmentEmployees
);

/**
 * GET /departments/:departmentId/manager
 * Get department manager
 */
router.get(
  "/:departmentId/manager",
  ...authenticated(),
  DepartmentController.getDepartmentManager
);

/**
 * GET /departments/:departmentId/team-kpis
 * Team-level KPI breakdown for a department
 * Query: status (active|inactive|all)
 */
router.get(
  "/:departmentId/team-kpis",
  ...authenticated(),
  DepartmentController.getDepartmentTeamKpis
);

export default router;
