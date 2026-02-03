import { Request, Response } from "express";
import { successResponse, errorResponse, paginatedResponse } from "../utils/response";
import { RecruitmentCandidateService } from "../services/recruitmentCandidates.service";
import { AuthRequest, authFromReq } from "../middleware/auth";
import { RecruitmentStage } from "@prisma/client";

export class RecruitmentCandidateController {
  static async list(req: Request, res: Response) {
    try {
      const page = Number(req.query.page || 1);
      const pageSize = Number(req.query.pageSize || 20);
      const stage = typeof req.query.stage === "string" ? (req.query.stage as RecruitmentStage) : undefined;
      const departmentId = req.query.departmentId ? Number(req.query.departmentId) : undefined;
      const search = typeof req.query.search === "string" ? req.query.search : undefined;

      const result = await RecruitmentCandidateService.list({
        page,
        pageSize,
        stage,
        departmentId,
        search,
      });

      return res.json(
        paginatedResponse(result.records, result.total, result.page, result.pageSize, "Recruitment candidates retrieved")
      );
    } catch (e: any) {
      console.error("RecruitmentCandidateController.list error:", e);
      return res.status(500).json(errorResponse("Failed to fetch recruitment candidates", 500));
    }
  }

  static async getById(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json(errorResponse("Invalid candidate id", 400));

      const candidate = await RecruitmentCandidateService.getById(id);
      if (!candidate) return res.status(404).json(errorResponse("Candidate not found", 404));

      return res.json(successResponse(candidate, "Candidate retrieved"));
    } catch (e: any) {
      console.error("RecruitmentCandidateController.getById error:", e);
      return res.status(500).json(errorResponse("Failed to retrieve candidate", 500));
    }
  }

  static async create(req: AuthRequest, res: Response) {
    try {
      const created = await RecruitmentCandidateService.create(req.body, authFromReq(req));
      return res.status(201).json(successResponse(created, "Candidate created", 201));
    } catch (e: any) {
      console.error("RecruitmentCandidateController.create error:", e);
      return res.status(400).json(errorResponse(e.message || "Failed to create candidate", 400));
    }
  }

  static async update(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json(errorResponse("Invalid candidate id", 400));

      const updated = await RecruitmentCandidateService.update(id, req.body);
      return res.json(successResponse(updated, "Candidate updated"));
    } catch (e: any) {
      console.error("RecruitmentCandidateController.update error:", e);
      return res.status(400).json(errorResponse(e.message || "Failed to update candidate", 400));
    }
  }

  static async updateStage(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json(errorResponse("Invalid candidate id", 400));
      const stage = req.body.stage as RecruitmentStage | undefined;
      if (!stage) return res.status(400).json(errorResponse("stage is required", 400));

      const updated = await RecruitmentCandidateService.updateStage(id, stage);
      return res.json(successResponse(updated, "Candidate stage updated"));
    } catch (e: any) {
      console.error("RecruitmentCandidateController.updateStage error:", e);
      return res.status(400).json(errorResponse(e.message || "Failed to update stage", 400));
    }
  }

  static async attachOfferLetter(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json(errorResponse("Invalid candidate id", 400));
      const documentId = Number(req.body.documentId);
      if (!Number.isFinite(documentId)) {
        return res.status(400).json(errorResponse("documentId is required", 400));
      }

      const updated = await RecruitmentCandidateService.attachOfferLetter(id, documentId);
      return res.json(successResponse(updated, "Offer letter attached"));
    } catch (e: any) {
      console.error("RecruitmentCandidateController.attachOfferLetter error:", e);
      return res.status(400).json(errorResponse(e.message || "Failed to attach offer letter", 400));
    }
  }

  static async remove(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json(errorResponse("Invalid candidate id", 400));

      await RecruitmentCandidateService.remove(id);
      return res.json(successResponse({ id, deleted: true }, "Candidate deleted"));
    } catch (e: any) {
      console.error("RecruitmentCandidateController.remove error:", e);
      return res.status(400).json(errorResponse(e.message || "Failed to delete candidate", 400));
    }
  }
}
