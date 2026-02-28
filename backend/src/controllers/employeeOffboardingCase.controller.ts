import { Request, Response } from "express";
import { EmployeeOffboardingCaseService } from "../services/employeeOffboardingCase.service";
import { OffboardingStatus } from "@prisma/client";
import { AuthRequest, authFromReq } from "../middleware/auth";
import { paginatedResponse, successResponse } from "../utils/response";

export class EmployeeOffboardingCaseController {
  static async list(req: AuthRequest, res: Response): Promise<void> {
    try {
      const status = req.query.status as OffboardingStatus | undefined;
      const page = Number(req.query.page || 1);
      const pageSize = Number(req.query.pageSize || 20);

      const result = await EmployeeOffboardingCaseService.list(
        { status, page, pageSize },
        authFromReq(req)
      );

      res.json(paginatedResponse(result.records, result.total, page, pageSize, "Offboarding cases retrieved"));
    } catch (e) {
      console.error("EmployeeOffboardingCaseController.list error:", e);
      res.status((e as any).statusCode || 500).json({ success: false, message: (e as Error).message });
    }
  }

  static async create(req: AuthRequest, res: Response): Promise<void> {
    try {
      const created = await EmployeeOffboardingCaseService.create(
        {
          profileId: Number(req.body.profileId),
          hrOwnerProfileId: req.body.hrOwnerProfileId ? Number(req.body.hrOwnerProfileId) : undefined,
          reason: req.body.reason,
        },
        authFromReq(req)
      );

      res.status(201).json(successResponse(created, "Offboarding case created", 201));
    } catch (e) {
      console.error("EmployeeOffboardingCaseController.create error:", e);
      res.status((e as any).statusCode || 500).json({ success: false, message: (e as Error).message });
    }
  }

  static async getById(req: AuthRequest, res: Response): Promise<void> {
    try {
      const caseId = Number(req.params.caseId);
      const found = await EmployeeOffboardingCaseService.getById(caseId, authFromReq(req));
      res.json(successResponse(found, "Offboarding case retrieved"));
    } catch (e) {
      console.error("EmployeeOffboardingCaseController.getById error:", e);
      res.status((e as any).statusCode || 500).json({ success: false, message: (e as Error).message });
    }
  }

  static async update(req: AuthRequest, res: Response): Promise<void> {
    try {
      const caseId = Number(req.params.caseId);
      const updated = await EmployeeOffboardingCaseService.update(
        caseId,
        {
          status: req.body.status as OffboardingStatus | undefined,
          reason: req.body.reason,
          notes: req.body.notes,
          separationDate: req.body.separationDate ? new Date(req.body.separationDate) : undefined,
        },
        authFromReq(req)
      );
      res.json(successResponse(updated, "Offboarding case updated"));
    } catch (e) {
      console.error("EmployeeOffboardingCaseController.update error:", e);
      res.status((e as any).statusCode || 500).json({ success: false, message: (e as Error).message });
    }
  }

  static async reactivate(req: AuthRequest, res: Response): Promise<void> {
    try {
      const caseId = Number(req.params.caseId);
      const result = await EmployeeOffboardingCaseService.reactivate(caseId, authFromReq(req));
      res.json(successResponse(result, "Account reactivated"));
    } catch (e) {
      console.error("EmployeeOffboardingCaseController.reactivate error:", e);
      res.status((e as any).statusCode || 500).json({ success: false, message: (e as Error).message });
    }
  }
}
