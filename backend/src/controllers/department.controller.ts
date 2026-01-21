/**
 * Department Controller (Schema v2.1 aligned)
 */

import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { DepartmentService } from "../services/departments.service";
import { successResponse, errorResponse, paginatedResponse } from "../utils/response";

export class DepartmentController {
  /**
   * GET /departments
   * List departments
   */
  static async listDepartments(req: AuthRequest, res: Response): Promise<void> {
    try {
      const page = Number(req.query.page) || 1;
      const pageSize = Number(req.query.pageSize) || 10;

      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const result = await DepartmentService.listDepartments(
        { page, pageSize },
        auth
      );

      res.json(paginatedResponse(result.departments, result.total, page, pageSize));
    } catch (error: any) {
      res.status(error.statusCode || 500).json(
        errorResponse(error.message, error.statusCode || 500)
      );
    }
  }

  /**
   * POST /departments
   * Create new department
   */
  static async createDepartment(req: AuthRequest, res: Response): Promise<void> {
    try {
      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const department = await DepartmentService.createDepartment(req.body, auth);

      res.status(201).json(
        successResponse(department, 'Department created successfully', 201)
      );
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400)
      );
    }
  }

  /**
   * GET /departments/:departmentId
   * Get specific department
   */
  static async getDepartment(req: AuthRequest, res: Response): Promise<void> {
    try {
      const departmentId = Number(req.params.departmentId);

      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const department = await DepartmentService.getDepartment(departmentId, auth);

      res.json(successResponse(department, 'Department retrieved'));
    } catch (error: any) {
      res.status(error.statusCode || 500).json(
        errorResponse(error.message, error.statusCode || 500)
      );
    }
  }

  /**
   * PATCH /departments/:departmentId
   * Update department
   */
  static async updateDepartment(req: AuthRequest, res: Response): Promise<void> {
    try {
      const departmentId = Number(req.params.departmentId);

      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const department = await DepartmentService.updateDepartment(
        departmentId,
        req.body,
        auth
      );

      res.json(successResponse(department, 'Department updated successfully'));
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400)
      );
    }
  }

  /**
   * DELETE /departments/:departmentId
   * Delete department
   */
  static async deleteDepartment(req: AuthRequest, res: Response): Promise<void> {
    try {
      const departmentId = Number(req.params.departmentId);

      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      await DepartmentService.deleteDepartment(departmentId, auth);

      res.json(successResponse(null, 'Department deleted successfully'));
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400)
      );
    }
  }

  /**
   * GET /departments/:departmentId/employees
   * Get department employees
   */
  static async getDepartmentEmployees(req: AuthRequest, res: Response): Promise<void> {
    try {
      const departmentId = Number(req.params.departmentId);

      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const employees = await DepartmentService.getDepartmentEmployees(
        departmentId,
        auth
      );

      res.json(successResponse(employees, 'Department employees retrieved'));
    } catch (error: any) {
      res.status(error.statusCode || 500).json(
        errorResponse(error.message, error.statusCode || 500)
      );
    }
  }

  /**
   * GET /departments/:departmentId/manager
   * Get department manager
   */
  static async getDepartmentManager(req: AuthRequest, res: Response): Promise<void> {
    try {
      const departmentId = Number(req.params.departmentId);

      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const manager = await DepartmentService.getDepartmentManager(
        departmentId,
        auth
      );

      res.json(successResponse(manager, 'Department manager retrieved'));
    } catch (error: any) {
      res.status(error.statusCode || 500).json(
        errorResponse(error.message, error.statusCode || 500)
      );
    }
  }
}
