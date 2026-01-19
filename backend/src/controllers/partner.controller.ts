/**
 * Partner Controller
 * Handles partner portfolio, commissions, and revenue tracking
 */

import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { PartnerService } from "../services/partner.service";
import { successResponse, errorResponse, paginatedResponse } from "../utils/response";

export class PartnerController {
  static async createPartner(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { profileId, companyId, commissionPercentage, commissionType } = req.body;

      const result = await PartnerService.createPartner(
        { profileId, companyId, commissionPercentage, commissionType },
        req.user!.profileId
      );

      res.status(201).json(successResponse(result, "Partner created", 201));
    } catch (error: any) {
      console.error("PartnerController.createPartner error:", error);
      if (error.message.includes("already exists")) {
        res.status(409).json(errorResponse(error.message, 409));
        return;
      }
      res.status(400).json(errorResponse(error.message || "Failed to create partner", 400));
    }
  }

  static async getPartner(req: AuthRequest, res: Response): Promise<void> {
    try {
      const partnerId = Number(req.params.partnerId);
      const result = await PartnerService.getPartnerById(partnerId, req.user!.profileId);
      if (!result) {
        res.status(404).json(errorResponse("Partner not found", 404));
        return;
      }
      res.json(successResponse(result, "Partner retrieved"));
    } catch (error) {
      console.error("PartnerController.getPartner error:", error);
      res.status(500).json(errorResponse("Failed to retrieve partner", 500));
    }
  }

  static async listPartnerJobs(req: AuthRequest, res: Response): Promise<void> {
    try {
      const partnerId = Number(req.params.partnerId);
      const page = Number(req.query.page) || 1;
      const pageSize = Number(req.query.pageSize) || 10;
      const status = req.query.status as string | undefined;

      const result = await PartnerService.listPartnerJobs(
        partnerId,
        { page, pageSize, status },
        req.user!.profileId
      );

      res.json(paginatedResponse(result.jobs, result.total, page, pageSize, "Partner jobs retrieved"));
    } catch (error: any) {
      console.error("PartnerController.listPartnerJobs error:", error);
      if (error.message.includes("forbidden")) {
        res.status(403).json(errorResponse(error.message, 403));
        return;
      }
      res.status(500).json(errorResponse("Failed to retrieve jobs", 500));
    }
  }

  static async getPartnerPortfolio(req: AuthRequest, res: Response): Promise<void> {
    try {
      const partnerId = Number(req.params.partnerId);
      const result = await PartnerService.getPartnerPortfolio(partnerId, req.user!.profileId);
      res.json(successResponse(result, "Portfolio summary retrieved"));
    } catch (error: any) {
      console.error("PartnerController.getPartnerPortfolio error:", error);
      if (error.message.includes("forbidden")) {
        res.status(403).json(errorResponse(error.message, 403));
        return;
      }
      res.status(400).json(errorResponse(error.message || "Failed to retrieve portfolio", 400));
    }
  }

  static async getPartnerDashboard(req: AuthRequest, res: Response): Promise<void> {
    try {
      const partnerId = Number(req.params.partnerId);
      const result = await PartnerService.getPartnerDashboard(partnerId, req.user!.profileId);
      res.json(successResponse(result, "Partner dashboard retrieved"));
    } catch (error: any) {
      console.error("PartnerController.getPartnerDashboard error:", error);
      if (error.message.includes("forbidden")) {
        res.status(403).json(errorResponse(error.message, 403));
        return;
      }
      res.status(400).json(errorResponse(error.message || "Failed to retrieve dashboard", 400));
    }
  }

  static async getPartnerRevenue(req: AuthRequest, res: Response): Promise<void> {
    try {
      const partnerId = Number(req.params.partnerId);
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;
      const period = req.query.period as string | undefined;

      const result = await PartnerService.getPartnerRevenue(
        partnerId,
        { startDate, endDate, period },
        req.user!.profileId
      );

      res.json(successResponse(result, "Revenue report retrieved"));
    } catch (error: any) {
      console.error("PartnerController.getPartnerRevenue error:", error);
      if (error.message.includes("forbidden")) {
        res.status(403).json(errorResponse(error.message, 403));
        return;
      }
      res.status(400).json(errorResponse(error.message || "Failed to retrieve revenue", 400));
    }
  }

  static async getPartnerCommissions(req: AuthRequest, res: Response): Promise<void> {
    try {
      const partnerId = Number(req.params.partnerId);
      const page = Number(req.query.page) || 1;
      const pageSize = Number(req.query.pageSize) || 10;
      const status = req.query.status as string | undefined;

      const result = await PartnerService.getPartnerCommissions(
        partnerId,
        { page, pageSize, status },
        req.user!.profileId
      );

      res.json(paginatedResponse(result.commissions, result.total, page, pageSize, "Commission history retrieved"));
    } catch (error: any) {
      console.error("PartnerController.getPartnerCommissions error:", error);
      if (error.message.includes("forbidden")) {
        res.status(403).json(errorResponse(error.message, 403));
        return;
      }
      res.status(400).json(errorResponse(error.message || "Failed to retrieve commissions", 400));
    }
  }

  static async savePartnerCompany(req: AuthRequest, res: Response): Promise<void> {
    try {
      const partnerId = Number(req.params.partnerId);
      const { companyName, registrationNumber, taxId, bankDetails } = req.body;

      const result = await PartnerService.savePartnerCompany(
        partnerId,
        { companyName, registrationNumber, taxId, bankDetails },
        req.user!.profileId
      );

      res.json(successResponse(result, "Company details saved"));
    } catch (error: any) {
      console.error("PartnerController.savePartnerCompany error:", error);
      if (error.message.includes("not found")) {
        res.status(404).json(errorResponse(error.message, 404));
        return;
      }
      res.status(400).json(errorResponse(error.message || "Failed to save company details", 400));
    }
  }

  static async getPartnerCompany(req: AuthRequest, res: Response): Promise<void> {
    try {
      const partnerId = Number(req.params.partnerId);
      const result = await PartnerService.getPartnerCompany(partnerId, req.user!.profileId);
      res.json(successResponse(result, "Company details retrieved"));
    } catch (error: any) {
      console.error("PartnerController.getPartnerCompany error:", error);
      if (error.message.includes("not found")) {
        res.status(404).json(errorResponse(error.message, 404));
        return;
      }
      res.status(400).json(errorResponse(error.message || "Failed to retrieve company details", 400));
    }
  }

  static async getPartnerPerformance(req: AuthRequest, res: Response): Promise<void> {
    try {
      const partnerId = Number(req.params.partnerId);
      const result = await PartnerService.getPartnerPerformance(partnerId, req.user!.profileId);
      res.json(successResponse(result, "Performance metrics retrieved"));
    } catch (error: any) {
      console.error("PartnerController.getPartnerPerformance error:", error);
      if (error.message.includes("not found")) {
        res.status(404).json(errorResponse(error.message, 404));
        return;
      }
      res.status(400).json(errorResponse(error.message || "Failed to retrieve performance", 400));
    }
  }

  static async getPartnerUtilization(req: AuthRequest, res: Response): Promise<void> {
    try {
      const partnerId = Number(req.params.partnerId);
      const result = await PartnerService.getPartnerUtilization(partnerId, req.user!.profileId);
      res.json(successResponse(result, "Utilization metrics retrieved"));
    } catch (error: any) {
      console.error("PartnerController.getPartnerUtilization error:", error);
      if (error.message.includes("not found")) {
        res.status(404).json(errorResponse(error.message, 404));
        return;
      }
      res.status(400).json(errorResponse(error.message || "Failed to retrieve utilization", 400));
    }
  }
}