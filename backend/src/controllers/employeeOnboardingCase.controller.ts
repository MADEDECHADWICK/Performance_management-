import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { EmployeeOnboardingCaseService } from "../services/employeeOnboardingCase.service";
import { errorResponse, paginatedResponse, successResponse } from "../utils/response";
import { OnboardingStatus } from "@prisma/client";

const authFromReq = (req: AuthRequest) => ({
  userId: req.user!.userId,
  profileId: req.user!.profileId!,
  roles: req.userRoles ?? [],
});

export class EmployeeOnboardingCaseController {
  static async list(req: AuthRequest, res: Response) {
    try {
      const page = Number(req.query.page) || 1;
      const pageSize = Number(req.query.pageSize) || 10;

      const status = req.query.status as OnboardingStatus | undefined;
      const hrOwnerProfileId = req.query.hrOwnerProfileId ? Number(req.query.hrOwnerProfileId) : undefined;
      const profileId = req.query.profileId ? Number(req.query.profileId) : undefined;
      const candidateId = req.query.candidateId ? Number(req.query.candidateId) : undefined;

      const result = await EmployeeOnboardingCaseService.list(
        { page, pageSize, filters: { status, hrOwnerProfileId, profileId, candidateId } },
        authFromReq(req)
      );

      res.json(paginatedResponse(result.records, result.total, page, pageSize, "Onboarding cases retrieved"));
    } catch (e: any) {
      console.error("EmployeeOnboardingCaseController.list error:", e);
      res.status(e.statusCode ?? 500).json(errorResponse(e.message ?? "Failed to list onboarding cases", e.statusCode ?? 500));
    }
  }

  static async create(req: AuthRequest, res: Response) {
    try {
      const { candidateId, profileId, hrOwnerProfileId, startDate, dueDate, notes } = req.body;

      const created = await EmployeeOnboardingCaseService.create(
        {
          candidateId: candidateId ? Number(candidateId) : undefined,
          profileId: profileId ? Number(profileId) : undefined,
          hrOwnerProfileId: hrOwnerProfileId ? Number(hrOwnerProfileId) : undefined,
          startDate: startDate ? new Date(startDate) : undefined,
          dueDate: dueDate ? new Date(dueDate) : undefined,
          notes,
        },
        authFromReq(req)
      );

      res.status(201).json(successResponse(created, "Onboarding case created", 201));
    } catch (e: any) {
      console.error("EmployeeOnboardingCaseController.create error:", e);
      res.status(e.statusCode ?? 400).json(errorResponse(e.message ?? "Failed to create onboarding case", e.statusCode ?? 400));
    }
  }

  static async getById(req: AuthRequest, res: Response) {
    try {
      const caseId = Number(req.params.caseId);
      const found = await EmployeeOnboardingCaseService.getById(caseId, authFromReq(req));
      res.json(successResponse(found, "Onboarding case retrieved"));
    } catch (e: any) {
      console.error("EmployeeOnboardingCaseController.getById error:", e);
      res.status(e.statusCode ?? 500).json(errorResponse(e.message ?? "Failed to retrieve onboarding case", e.statusCode ?? 500));
    }
  }

  static async update(req: AuthRequest, res: Response) {
    try {
      const caseId = Number(req.params.caseId);
      const { status, hrOwnerProfileId, startDate, dueDate, notes } = req.body;

      const updated = await EmployeeOnboardingCaseService.update(
        caseId,
        {
          status: status as OnboardingStatus | undefined,
          hrOwnerProfileId: hrOwnerProfileId === undefined ? undefined : hrOwnerProfileId === null ? null : Number(hrOwnerProfileId),
          startDate: startDate === undefined ? undefined : startDate === null ? null : new Date(startDate),
          dueDate: dueDate === undefined ? undefined : dueDate === null ? null : new Date(dueDate),
          notes: notes === undefined ? undefined : notes,
        },
        authFromReq(req)
      );

      res.json(successResponse(updated, "Onboarding case updated"));
    } catch (e: any) {
      console.error("EmployeeOnboardingCaseController.update error:", e);
      res.status(e.statusCode ?? 400).json(errorResponse(e.message ?? "Failed to update onboarding case", e.statusCode ?? 400));
    }
  }

  static async updateStage(req: AuthRequest, res: Response) {
    try {
      const stageId = Number(req.params.stageId);
      const { status, ownerProfileId, dueDate, notes } = req.body;

      const updated = await EmployeeOnboardingCaseService.updateStage(
        stageId,
        {
          status: status as OnboardingStatus | undefined,
          ownerProfileId: ownerProfileId === undefined ? undefined : ownerProfileId === null ? null : Number(ownerProfileId),
          dueDate: dueDate === undefined ? undefined : dueDate === null ? null : new Date(dueDate),
          notes: notes === undefined ? undefined : notes,
        },
        authFromReq(req)
      );

      res.json(successResponse(updated, "Onboarding stage updated"));
    } catch (e: any) {
      console.error("EmployeeOnboardingCaseController.updateStage error:", e);
      res.status(e.statusCode ?? 400).json(errorResponse(e.message ?? "Failed to update onboarding stage", e.statusCode ?? 400));
    }
  }

  static async initializeStages(req: AuthRequest, res: Response) {
    try {
      const caseId = Number(req.params.caseId);
      const result = await EmployeeOnboardingCaseService.initializeStages(caseId, authFromReq(req));
      res.json(successResponse(result, "Onboarding stages initialized"));
    } catch (e: any) {
      console.error("EmployeeOnboardingCaseController.initializeStages error:", e);
      res.status(e.statusCode ?? 400).json(errorResponse(e.message ?? "Failed to initialize onboarding stages", e.statusCode ?? 400));
    }
  }
}
