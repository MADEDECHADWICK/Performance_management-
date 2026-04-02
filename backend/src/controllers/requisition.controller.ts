import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import {
  resolveRequestAccessRoles,
  resolveRequestPrimaryAccessRole,
} from "../auth/accessRoles";
import RequisitionService from "../services/requisition.service";
import { errorResponse, paginatedResponse, successResponse } from "../utils/response";

const buildAuthContext = (req: AuthRequest) => ({
  userId: req.user!.userId,
  profileId: req.profile!.id,
  roleName: resolveRequestPrimaryAccessRole(req),
  roles: resolveRequestAccessRoles(req),
});

export default class RequisitionController {
  static async listRequisitionTypes(req: AuthRequest, res: Response): Promise<void> {
    try {
      const items = await RequisitionService.listRequisitionTypes(buildAuthContext(req));
      res.json(successResponse(items, "Requisition types retrieved"));
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400, error.details)
      );
    }
  }

  static async listAvailableJobs(req: AuthRequest, res: Response): Promise<void> {
    try {
      const items = await RequisitionService.listAvailableJobs(buildAuthContext(req));
      res.json(successResponse(items, "Requisition job options retrieved"));
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400, error.details)
      );
    }
  }

  static async createRequisitionType(req: AuthRequest, res: Response): Promise<void> {
    try {
      const created = await RequisitionService.createRequisitionType(req.body, buildAuthContext(req));
      res.status(201).json(successResponse(created, "Requisition type created", 201));
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400, error.details)
      );
    }
  }

  static async updateRequisitionType(req: AuthRequest, res: Response): Promise<void> {
    try {
      const requisitionTypeId = Number(req.params.typeId);
      const updated = await RequisitionService.updateRequisitionType(
        requisitionTypeId,
        req.body,
        buildAuthContext(req)
      );
      res.json(successResponse(updated, "Requisition type updated"));
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400, error.details)
      );
    }
  }

  static async deleteRequisitionType(req: AuthRequest, res: Response): Promise<void> {
    try {
      const requisitionTypeId = Number(req.params.typeId);
      const deleted = await RequisitionService.deleteRequisitionType(
        requisitionTypeId,
        buildAuthContext(req)
      );
      res.json(successResponse(deleted, "Requisition type deactivated"));
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400, error.details)
      );
    }
  }

  static async listRequisitionRequests(req: AuthRequest, res: Response): Promise<void> {
    try {
      const page = Number(req.query.page) || 1;
      const pageSize = Number(req.query.pageSize) || 10;
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const sourceModule =
        typeof req.query.sourceModule === "string" ? req.query.sourceModule : undefined;
      const requesterProfileId = req.query.requesterProfileId
        ? Number(req.query.requesterProfileId)
        : undefined;

      const result = await RequisitionService.listRequisitionRequests(
        { page, pageSize, status, sourceModule, requesterProfileId },
        buildAuthContext(req)
      );

      res.json(
        paginatedResponse(
          result.requests,
          result.total,
          page,
          pageSize,
          "Requisition requests retrieved"
        )
      );
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400, error.details)
      );
    }
  }

  static async getRequisitionRequest(req: AuthRequest, res: Response): Promise<void> {
    try {
      const requisitionRequestId = Number(req.params.requestId);
      const request = await RequisitionService.getRequisitionRequest(
        requisitionRequestId,
        buildAuthContext(req)
      );
      res.json(successResponse(request, "Requisition request retrieved"));
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400, error.details)
      );
    }
  }

  static async createRequisitionRequest(req: AuthRequest, res: Response): Promise<void> {
    try {
      const created = await RequisitionService.createRequisitionRequest(req.body, buildAuthContext(req));
      res.status(201).json(successResponse(created, "Requisition request created", 201));
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400, error.details)
      );
    }
  }

  static async cancelRequisitionRequest(req: AuthRequest, res: Response): Promise<void> {
    try {
      const requisitionRequestId = Number(req.params.requestId);
      const updated = await RequisitionService.cancelRequisitionRequest(
        requisitionRequestId,
        req.body,
        buildAuthContext(req)
      );
      res.json(successResponse(updated, "Requisition request cancelled"));
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400, error.details)
      );
    }
  }

  static async updateFinanceStageRequisition(req: AuthRequest, res: Response): Promise<void> {
    try {
      const requisitionRequestId = Number(req.params.requestId);
      const updated = await RequisitionService.updateFinanceStageRequisition(
        requisitionRequestId,
        req.body,
        buildAuthContext(req)
      );
      res.json(successResponse(updated, "Requisition updated by finance"));
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400, error.details)
      );
    }
  }

  static async releaseRequisitionFunds(req: AuthRequest, res: Response): Promise<void> {
    try {
      const requisitionRequestId = Number(req.params.requestId);
      const updated = await RequisitionService.releaseRequisitionFunds(
        requisitionRequestId,
        req.body,
        buildAuthContext(req)
      );
      res.json(successResponse(updated, "Requisition funds released"));
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400, error.details)
      );
    }
  }

  static async submitRequisitionAccountability(req: AuthRequest, res: Response): Promise<void> {
    try {
      const requisitionRequestId = Number(req.params.requestId);
      const updated = await RequisitionService.submitRequisitionAccountability(
        requisitionRequestId,
        req.body,
        buildAuthContext(req)
      );
      res.json(successResponse(updated, "Requisition accountability submitted"));
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400, error.details)
      );
    }
  }

  static async listApprovals(req: AuthRequest, res: Response): Promise<void> {
    try {
      const page = Number(req.query.page) || 1;
      const pageSize = Number(req.query.pageSize) || 10;
      const scope =
        typeof req.query.scope === "string" ? (req.query.scope as "mine" | "all") : "mine";
      const status = typeof req.query.status === "string" ? req.query.status : undefined;

      const result = await RequisitionService.listApprovals(
        { page, pageSize, scope, status },
        buildAuthContext(req)
      );

      res.json(
        paginatedResponse(
          result.approvals,
          result.total,
          page,
          pageSize,
          "Requisition approvals retrieved"
        )
      );
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400, error.details)
      );
    }
  }

  static async approveRequisitionRequest(req: AuthRequest, res: Response): Promise<void> {
    try {
      const requisitionRequestId = Number(req.params.requestId);
      const updated = await RequisitionService.approveRequisitionRequest(
        requisitionRequestId,
        req.body,
        buildAuthContext(req)
      );
      res.json(successResponse(updated, "Requisition request approved"));
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400, error.details)
      );
    }
  }

  static async declineRequisitionRequest(req: AuthRequest, res: Response): Promise<void> {
    try {
      const requisitionRequestId = Number(req.params.requestId);
      const updated = await RequisitionService.declineRequisitionRequest(
        requisitionRequestId,
        req.body,
        buildAuthContext(req)
      );
      res.json(successResponse(updated, "Requisition request declined"));
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400, error.details)
      );
    }
  }

  static async getFinanceTracker(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tracker = await RequisitionService.getFinanceTracker(buildAuthContext(req));
      res.json(successResponse(tracker, "Requisition finance tracker retrieved"));
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400, error.details)
      );
    }
  }

  static async getReportSummary(req: AuthRequest, res: Response): Promise<void> {
    try {
      const summary = await RequisitionService.getReportSummary(buildAuthContext(req));
      res.json(successResponse(summary, "Requisition report summary retrieved"));
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400, error.details)
      );
    }
  }
}
