/**
 * Department Controller (Schema v2.1 aligned)
 */

import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import DepartmentService from "../services/departments.service";
import { successResponse, errorResponse, paginatedResponse } from "../utils/response";

const buildAuthContext = (req: AuthRequest) => ({
  userId: req.user!.userId,
  profileId: req.user!.profileId!,
  roles: req.userRoles ?? [],
});

export class DepartmentController {
  static async listDepartments(req: AuthRequest, res: Response): Promise<void> {
    try {
      const page = Number(req.query.page) || 1;
      const pageSize = Number(req.query.pageSize) || 10;

      const sortBy = (req.query.sortBy as "name" | "createdAt" | undefined) ?? "createdAt";
      const sortOrder = (req.query.sortOrder as "asc" | "desc" | undefined) ?? "desc";

      const result = await DepartmentService.listDepartments({ page, pageSize, sortBy, sortOrder });

      res.json(paginatedResponse(result.departments, result.total, page, pageSize, "Departments retrieved"));
    } catch (error: any) {
      console.error("DepartmentController.listDepartments error:", error);
      res.status(500).json(errorResponse("Failed to retrieve departments", 500));
    }
  }

  static async createDepartment(req: AuthRequest, res: Response): Promise<void> {
    try {
      const auth = buildAuthContext(req);

      const { name, description, departmentCode, departmentHeadId } = req.body;

      const result = await DepartmentService.createDepartment(
        { name, description, departmentCode, departmentHeadId },
        auth
      );

      res.status(201).json(successResponse(result, "Department created", 201));
    } catch (error: any) {
      console.error("DepartmentController.createDepartment error:", error);
      const status = error.statusCode ?? (error.message?.includes("exists") ? 409 : 400);
      res.status(status).json(errorResponse(error.message || "Failed to create department", status));
    }
  }

  static async getDepartment(req: AuthRequest, res: Response): Promise<void> {
    try {
      const departmentId = Number(req.params.departmentId);
      const result = await DepartmentService.getDepartmentById(departmentId);
      res.json(successResponse(result, "Department retrieved"));
    } catch (error: any) {
      console.error("DepartmentController.getDepartment error:", error);
      const status = error.statusCode ?? 500;
      res.status(status).json(errorResponse(error.message || "Failed to retrieve department", status));
    }
  }

  static async updateDepartment(req: AuthRequest, res: Response): Promise<void> {
    try {
      const auth = buildAuthContext(req);
      const departmentId = Number(req.params.departmentId);

      const { name, description, departmentCode, departmentHeadId } = req.body;

      const result = await DepartmentService.updateDepartment(
        departmentId,
        { name, description, departmentCode, departmentHeadId },
        auth
      );

      res.json(successResponse(result, "Department updated"));
    } catch (error: any) {
      console.error("DepartmentController.updateDepartment error:", error);
      const status = error.statusCode ?? 400;
      res.status(status).json(errorResponse(error.message || "Failed to update department", status));
    }
  }

  static async listDepartmentEmployees(req: AuthRequest, res: Response): Promise<void> {
    try {
      const departmentId = Number(req.params.departmentId);
      const page = Number(req.query.page) || 1;
      const pageSize = Number(req.query.pageSize) || 10;

      const status = req.query.status as "active" | "inactive" | "separated" | undefined;
      const sortBy = req.query.sortBy as "firstName" | "lastName" | "hireDate" | undefined;
      const sortOrder = req.query.sortOrder as "asc" | "desc" | undefined;

      const result = await DepartmentService.listDepartmentEmployees(departmentId, {
        page,
        pageSize,
        status,
        sortBy,
        sortOrder,
      });

      res.json(paginatedResponse(result.employees, result.total, page, pageSize, "Department employees retrieved"));
    } catch (error: any) {
      console.error("DepartmentController.listDepartmentEmployees error:", error);
      const status = error.statusCode ?? 500;
      res.status(status).json(errorResponse(error.message || "Failed to retrieve employees", status));
    }
  }

  static async listDepartmentKPIs(req: AuthRequest, res: Response): Promise<void> {
    try {
      const departmentId = Number(req.params.departmentId);
      const page = Number(req.query.page) || 1;
      const pageSize = Number(req.query.pageSize) || 10;
      const category = (req.query.category as string | undefined) ?? undefined;

      const result = await DepartmentService.listDepartmentKPIs(departmentId, { page, pageSize, category });

      res.json(paginatedResponse(result.kpis, result.total, page, pageSize, "Department KPIs retrieved"));
    } catch (error: any) {
      console.error("DepartmentController.listDepartmentKPIs error:", error);
      const status = error.statusCode ?? 500;
      res.status(status).json(errorResponse(error.message || "Failed to retrieve KPIs", status));
    }
  }

  static async createDepartmentKPI(req: AuthRequest, res: Response): Promise<void> {
    try {
      const auth = buildAuthContext(req);
      const departmentId = Number(req.params.departmentId);

      const { name, description, category, kpiType, targetValue, weight, targetFrequency } = req.body;

      const result = await DepartmentService.createDepartmentKPI(
        departmentId,
        { name, description, category, kpiType, targetValue, weight, targetFrequency },
        auth
      );

      res.status(201).json(successResponse(result, "KPI created", 201));
    } catch (error: any) {
      console.error("DepartmentController.createDepartmentKPI error:", error);
      const status = error.statusCode ?? 400;
      res.status(status).json(errorResponse(error.message || "Failed to create KPI", status));
    }
  }

  static async getDepartmentRevenue(req: AuthRequest, res: Response): Promise<void> {
    try {
      const departmentId = Number(req.params.departmentId);
      const opts = DepartmentService.parseRevenueQuery(req.query);

      const result = await DepartmentService.getDepartmentRevenue(departmentId, opts);
      res.json(successResponse(result, "Revenue report retrieved"));
    } catch (error: any) {
      console.error("DepartmentController.getDepartmentRevenue error:", error);
      const status = error.statusCode ?? 400;
      res.status(status).json(errorResponse(error.message || "Failed to retrieve revenue", status));
    }
  }

  static async listDepartmentJobs(req: AuthRequest, res: Response): Promise<void> {
    try {
      const departmentId = Number(req.params.departmentId);
      const page = Number(req.query.page) || 1;
      const pageSize = Number(req.query.pageSize) || 10;
      const status = req.query.status as string | undefined;

      const result = await DepartmentService.listDepartmentJobs(departmentId, { page, pageSize, status });
      res.json(paginatedResponse(result.jobs, result.total, page, pageSize, "Department jobs retrieved"));
    } catch (error: any) {
      console.error("DepartmentController.listDepartmentJobs error:", error);
      const status = error.statusCode ?? 500;
      res.status(status).json(errorResponse(error.message || "Failed to retrieve jobs", status));
    }
  }

  static async getDepartmentDashboard(req: AuthRequest, res: Response): Promise<void> {
    try {
      const departmentId = Number(req.params.departmentId);
      const result = await DepartmentService.getDepartmentDashboard(departmentId);
      res.json(successResponse(result, "Department dashboard retrieved"));
    } catch (error: any) {
      console.error("DepartmentController.getDepartmentDashboard error:", error);
      const status = error.statusCode ?? 400;
      res.status(status).json(errorResponse(error.message || "Failed to retrieve dashboard", status));
    }
  }

  static async getDepartmentUtilization(req: AuthRequest, res: Response): Promise<void> {
    try {
      const departmentId = Number(req.params.departmentId);
      const weeks = req.query.weeks ? Number(req.query.weeks) : undefined;
      const expectedWeeklyHours = req.query.expectedWeeklyHours ? Number(req.query.expectedWeeklyHours) : undefined;

      const result = await DepartmentService.getDepartmentUtilization(departmentId, { weeks, expectedWeeklyHours });
      res.json(successResponse(result, "Utilization metrics retrieved"));
    } catch (error: any) {
      console.error("DepartmentController.getDepartmentUtilization error:", error);
      const status = error.statusCode ?? 400;
      res.status(status).json(errorResponse(error.message || "Failed to retrieve utilization", status));
    }
  }

  static async getDepartmentProfitability(req: AuthRequest, res: Response): Promise<void> {
    try {
      const departmentId = Number(req.params.departmentId);
      const opts = DepartmentService.parseProfitabilityQuery(req.query);

      const result = await DepartmentService.getDepartmentProfitability(departmentId, opts);
      res.json(successResponse(result, "Profitability analysis retrieved"));
    } catch (error: any) {
      console.error("DepartmentController.getDepartmentProfitability error:", error);
      const status = error.statusCode ?? 400;
      res.status(status).json(errorResponse(error.message || "Failed to retrieve profitability", status));
    }
  }
}
