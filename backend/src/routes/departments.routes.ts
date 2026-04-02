/**
 * Department Routes
 * Endpoints for department management and organizational metrics
 */

import { Router } from "express";
import { DepartmentController } from "../controllers/department.controller";
import { authenticated, withDepartmentAccess, withRoles } from "../utils/middleware";
import { validateRequest, handleValidationErrors } from "../middleware/validate";
import {
  createDepartmentValidators,
  updateDepartmentValidators,
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
 * Requires: super_admin or hr role
 * Body: name, description, departmentCode, departmentHeadId
 */
router.post(
  "/",
  ...withRoles("super_admin", "hr"),
  validateRequest(createDepartmentValidators),
  handleValidationErrors,
  DepartmentController.createDepartment
);

/**
 * GET /departments/:departmentId
 * Get department details
 */
router.get("/:departmentId", ...withDepartmentAccess(), DepartmentController.getDepartment);

/**
 * PATCH /departments/:departmentId
 * Update department details
 * Body: name, description, departmentCode, departmentHeadId
 */
router.patch(
  "/:departmentId",
  ...withRoles("super_admin", "hr"),
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
  ...withDepartmentAccess(),
  DepartmentController.getDepartmentEmployees
);

/**
 * GET /departments/:departmentId/manager
 * Get department manager
 */
router.get(
  "/:departmentId/manager",
  ...withDepartmentAccess(),
  DepartmentController.getDepartmentManager
);

/**
 * GET /departments/:departmentId/managers
 * Get all managers in a department
 */
router.get(
  "/:departmentId/managers",
  ...withDepartmentAccess(),
  DepartmentController.getDepartmentManagers
);

export default router;
