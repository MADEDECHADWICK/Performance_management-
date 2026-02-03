import { Response } from "express";
import { OffboardingChecklistService } from "../services/offboardingChecklist.service";
import { AuthRequest, authFromReq } from "../middleware/auth";
import { successResponse } from "../utils/response";

export class OffboardingChecklistController {
  static async list(req: AuthRequest, res: Response): Promise<void> {
    try {
      const caseId = Number(req.params.caseId);
      const items = await OffboardingChecklistService.listItems(caseId, authFromReq(req));
      res.json(successResponse(items, "Offboarding checklist items retrieved"));
    } catch (e) {
      console.error("OffboardingChecklistController.list error:", e);
      res.status((e as any).statusCode || 500).json({ success: false, message: (e as Error).message });
    }
  }

  static async create(req: AuthRequest, res: Response): Promise<void> {
    try {
      const caseId = Number(req.params.caseId);
      const items = await OffboardingChecklistService.createItems(
        caseId,
        { items: req.body.items || [] },
        authFromReq(req)
      );
      res.status(201).json(successResponse(items, "Offboarding checklist items created", 201));
    } catch (e) {
      console.error("OffboardingChecklistController.create error:", e);
      res.status((e as any).statusCode || 500).json({ success: false, message: (e as Error).message });
    }
  }

  static async completeItem(req: AuthRequest, res: Response): Promise<void> {
    try {
      const caseId = Number(req.params.caseId);
      const itemId = Number(req.params.itemId);
      const items = await OffboardingChecklistService.completeItem(caseId, itemId, authFromReq(req));
      res.json(successResponse(items, "Offboarding checklist item completed"));
    } catch (e) {
      console.error("OffboardingChecklistController.completeItem error:", e);
      res.status((e as any).statusCode || 500).json({ success: false, message: (e as Error).message });
    }
  }

  static async attachDocument(req: AuthRequest, res: Response): Promise<void> {
    try {
      const caseId = Number(req.params.caseId);
      const itemId = Number(req.params.itemId);
      const items = await OffboardingChecklistService.attachDocument(
        caseId,
        itemId,
        {
          documentId: req.body.documentId ? Number(req.body.documentId) : undefined,
          fileName: req.body.fileName,
          filePath: req.body.filePath,
          mimeType: req.body.mimeType,
          fileSize: req.body.fileSize ? Number(req.body.fileSize) : undefined,
        },
        authFromReq(req)
      );
      res.json(successResponse(items, "Offboarding task document attached"));
    } catch (e) {
      console.error("OffboardingChecklistController.attachDocument error:", e);
      res.status((e as any).statusCode || 500).json({ success: false, message: (e as Error).message });
    }
  }
}
