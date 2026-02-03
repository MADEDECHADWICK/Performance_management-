import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { InductionChecklistService } from "../services/inductionChecklist.service";
import { errorResponse, successResponse } from "../utils/response";

const authFromReq = (req: AuthRequest) => ({
  userId: req.user!.userId,
  profileId: req.user!.profileId!,
  roles: req.userRoles ?? [],
});

export class InductionChecklistController {
  static async create(req: AuthRequest, res: Response) {
    try {
      const { onboardingCaseId, employeeProfileId, checklistName, dueDate, items } = req.body;

      const created = await InductionChecklistService.createChecklist(
        {
          onboardingCaseId: onboardingCaseId ? Number(onboardingCaseId) : undefined,
          employeeProfileId: Number(employeeProfileId),
          checklistName,
          dueDate: dueDate ? new Date(dueDate) : undefined,
          items,
        },
        authFromReq(req)
      );

      res.status(201).json(successResponse(created, "Induction checklist created", 201));
    } catch (e: any) {
      console.error("InductionChecklistController.create error:", e);
      res.status(e.statusCode ?? 400).json(errorResponse(e.message ?? "Failed to create checklist", e.statusCode ?? 400));
    }
  }

  static async getById(req: AuthRequest, res: Response) {
    try {
      const checklistId = Number(req.params.checklistId);
      const checklist = await InductionChecklistService.getChecklistById(checklistId);
      res.json(successResponse(checklist, "Checklist retrieved"));
    } catch (e: any) {
      console.error("InductionChecklistController.getById error:", e);
      res.status(e.statusCode ?? 500).json(errorResponse(e.message ?? "Failed to retrieve checklist", e.statusCode ?? 500));
    }
  }

  static async completeItem(req: AuthRequest, res: Response) {
    try {
      const checklistId = Number(req.params.checklistId);
      const itemId = Number(req.params.itemId);

      const updated = await InductionChecklistService.completeItem(checklistId, itemId, authFromReq(req));
      res.json(successResponse(updated, "Checklist item completed"));
    } catch (e: any) {
      console.error("InductionChecklistController.completeItem error:", e);
      res.status(e.statusCode ?? 400).json(errorResponse(e.message ?? "Failed to complete item", e.statusCode ?? 400));
    }
  }

  static async remind(req: AuthRequest, res: Response) {
    try {
      const checklistId = Number(req.params.checklistId);
      const result = await InductionChecklistService.sendReminder(checklistId, authFromReq(req));
      res.json(successResponse(result, "Reminder sent"));
    } catch (e: any) {
      console.error("InductionChecklistController.remind error:", e);
      res.status(e.statusCode ?? 400).json(errorResponse(e.message ?? "Failed to send reminder", e.statusCode ?? 400));
    }
  }

  static async attachDocument(req: AuthRequest, res: Response) {
    try {
      const checklistId = Number(req.params.checklistId);
      const itemId = Number(req.params.itemId);
      const documentId = Number(req.body.documentId);

      if (!Number.isFinite(documentId)) {
        return res.status(400).json(errorResponse("documentId is required", 400));
      }

      const updated = await InductionChecklistService.attachItemDocument(
        checklistId,
        itemId,
        documentId,
        authFromReq(req)
      );

      res.json(successResponse(updated, "Checklist document attached"));
    } catch (e: any) {
      console.error("InductionChecklistController.attachDocument error:", e);
      res.status(e.statusCode ?? 400).json(errorResponse(e.message ?? "Failed to attach document", e.statusCode ?? 400));
    }
  }
}
