import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import KPIService from "../services/kpis.service";
import { errorResponse, successResponse } from "../utils/response";

const authFromReq = (req: AuthRequest) => ({
  userId: req.user?.userId || 0,
  profileId: req.profile?.id || req.user?.profileId || 0,
  roles: req.userRoles || req.user?.authRoles || [],
});

export class KpiController {
  static async listKPIs(req: AuthRequest, res: Response): Promise<void> {
    try {
      const data = await KPIService.listKPIs(
        {
          userId: req.query.userId ? Number(req.query.userId) : undefined,
          departmentId: req.query.departmentId ? Number(req.query.departmentId) : undefined,
          status: req.query.status ? String(req.query.status) : undefined,
          isActive:
            req.query.isActive !== undefined ? String(req.query.isActive).toLowerCase() === "true" : undefined,
        },
        authFromReq(req)
      );
      res.json(successResponse(data));
    } catch (error: any) {
      res
        .status(error.statusCode || 500)
        .json(errorResponse(error.message || "Failed to load KPIs", error.statusCode || 500));
    }
  }

  static async getKPIById(req: AuthRequest, res: Response): Promise<void> {
    try {
      const kpiId = Number(req.params.kpiId);
      const data = await KPIService.getKPIById(kpiId, authFromReq(req));
      res.json(successResponse(data));
    } catch (error: any) {
      res
        .status(error.statusCode || 404)
        .json(errorResponse(error.message || "Failed to load KPI", error.statusCode || 404));
    }
  }

  static async createKPI(req: AuthRequest, res: Response): Promise<void> {
    try {
      const data = await KPIService.createKPI(req.body, authFromReq(req));
      res.status(201).json(successResponse(data, "KPI created", 201));
    } catch (error: any) {
      res
        .status(error.statusCode || 400)
        .json(errorResponse(error.message || "Failed to create KPI", error.statusCode || 400));
    }
  }

  static async updateKPI(req: AuthRequest, res: Response): Promise<void> {
    try {
      const kpiId = Number(req.params.kpiId);
      const data = await KPIService.updateKPI(kpiId, req.body, authFromReq(req));
      res.json(successResponse(data, "KPI updated"));
    } catch (error: any) {
      res
        .status(error.statusCode || 400)
        .json(errorResponse(error.message || "Failed to update KPI", error.statusCode || 400));
    }
  }

  static async deleteKPI(req: AuthRequest, res: Response): Promise<void> {
    try {
      const kpiId = Number(req.params.kpiId);
      const data = await KPIService.deleteKPI(kpiId, authFromReq(req));
      res.json(successResponse(data, "KPI deleted"));
    } catch (error: any) {
      res
        .status(error.statusCode || 400)
        .json(errorResponse(error.message || "Failed to delete KPI", error.statusCode || 400));
    }
  }

  static async updateKPIProgress(req: AuthRequest, res: Response): Promise<void> {
    try {
      const kpiId = Number(req.params.kpiId);
      const data = await KPIService.updateKPIProgress(
        kpiId,
        {
          actual: Number(req.body.actual),
          note: req.body.note,
          measuredAt: req.body.measuredAt,
        },
        authFromReq(req)
      );
      res.json(successResponse(data, "KPI progress updated"));
    } catch (error: any) {
      res
        .status(error.statusCode || 400)
        .json(
          errorResponse(
            error.message || "Failed to update KPI progress",
            error.statusCode || 400
          )
        );
    }
  }

  static async getEmployeeKPIDashboard(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = Number(req.params.userId);
      const data = await KPIService.getEmployeeKPIDashboard(userId, authFromReq(req));
      res.json(successResponse(data));
    } catch (error: any) {
      res
        .status(error.statusCode || 500)
        .json(errorResponse(error.message || "Failed to load KPI dashboard", error.statusCode || 500));
    }
  }
}

export default KpiController;
