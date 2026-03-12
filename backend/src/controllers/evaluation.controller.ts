import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import EvaluationService from "../services/evaluation.service";
import { errorResponse, successResponse } from "../utils/response";

const authFromReq = (req: AuthRequest) => ({
  userId: req.user?.userId || 0,
  profileId: req.profile?.id || req.user?.profileId || 0,
  roles: req.userRoles || req.user?.authRoles || [],
});

export class EvaluationController {
  static async getDirectory(req: AuthRequest, res: Response): Promise<void> {
    try {
      const directory = await EvaluationService.getAssignmentDirectory(authFromReq(req));
      res.json(successResponse(directory));
    } catch (error: any) {
      res
        .status(error.statusCode || 500)
        .json(errorResponse(error.message || "Failed to load directory", error.statusCode || 500));
    }
  }

  static async getMyCycles(req: AuthRequest, res: Response): Promise<void> {
    try {
      const cycles = await EvaluationService.getMyCycles(authFromReq(req));
      res.json(successResponse(cycles));
    } catch (error: any) {
      res
        .status(error.statusCode || 500)
        .json(errorResponse(error.message || "Failed to load cycles", error.statusCode || 500));
    }
  }

  static async getCycleById(req: AuthRequest, res: Response): Promise<void> {
    try {
      const cycleId = Number(req.params.cycleId);
      const cycle = await EvaluationService.getCycleById(cycleId, authFromReq(req));
      res.json(successResponse(cycle));
    } catch (error: any) {
      res
        .status(error.statusCode || 500)
        .json(errorResponse(error.message || "Failed to load cycle", error.statusCode || 500));
    }
  }

  static async createCycle(req: AuthRequest, res: Response): Promise<void> {
    try {
      const cycle = await EvaluationService.createCycle(req.body, authFromReq(req));
      res.status(201).json(successResponse(cycle, "Evaluation cycle created", 201));
    } catch (error: any) {
      res
        .status(error.statusCode || 400)
        .json(errorResponse(error.message || "Failed to create cycle", error.statusCode || 400));
    }
  }

  static async assignEvaluators(req: AuthRequest, res: Response): Promise<void> {
    try {
      const cycleId = Number(req.params.cycleId);
      const result = await EvaluationService.assignEvaluators(
        cycleId,
        req.body?.assignments || [],
        authFromReq(req)
      );
      res.status(201).json(successResponse(result, "Evaluators assigned", 201));
    } catch (error: any) {
      res
        .status(error.statusCode || 400)
        .json(errorResponse(error.message || "Failed to assign evaluators", error.statusCode || 400));
    }
  }

  static async getAssignmentById(req: AuthRequest, res: Response): Promise<void> {
    try {
      const assignmentId = Number(req.params.assignmentId);
      const assignment = await EvaluationService.getAssignmentById(
        assignmentId,
        authFromReq(req)
      );
      res.json(successResponse(assignment));
    } catch (error: any) {
      res
        .status(error.statusCode || 500)
        .json(errorResponse(error.message || "Failed to load assignment", error.statusCode || 500));
    }
  }

  static async submitEvaluation(req: AuthRequest, res: Response): Promise<void> {
    try {
      const assignmentId = Number(req.params.assignmentId);
      const result = await EvaluationService.submitEvaluation(
        assignmentId,
        req.body || {},
        authFromReq(req)
      );
      res.json(successResponse(result, "Evaluation submitted"));
    } catch (error: any) {
      res
        .status(error.statusCode || 400)
        .json(errorResponse(error.message || "Failed to submit evaluation", error.statusCode || 400));
    }
  }

  static async acknowledgeEvaluation(req: AuthRequest, res: Response): Promise<void> {
    try {
      const assignmentId = Number(req.params.assignmentId);
      const result = await EvaluationService.acknowledgeEvaluation(
        assignmentId,
        authFromReq(req)
      );
      res.json(successResponse(result, "Evaluation acknowledged"));
    } catch (error: any) {
      res
        .status(error.statusCode || 400)
        .json(errorResponse(error.message || "Failed to acknowledge evaluation", error.statusCode || 400));
    }
  }

  static async getCycleResults(req: AuthRequest, res: Response): Promise<void> {
    try {
      const cycleId = Number(req.params.cycleId);
      const results = await EvaluationService.getCycleResults(cycleId, authFromReq(req));
      res.json(successResponse(results));
    } catch (error: any) {
      res
        .status(error.statusCode || 500)
        .json(errorResponse(error.message || "Failed to load cycle results", error.statusCode || 500));
    }
  }

  static async getMyPendingEvaluations(req: AuthRequest, res: Response): Promise<void> {
    try {
      const assignments = await EvaluationService.getMyPendingEvaluations(authFromReq(req));
      res.json(successResponse(assignments));
    } catch (error: any) {
      res
        .status(error.statusCode || 500)
        .json(
          errorResponse(
            error.message || "Failed to load pending evaluations",
            error.statusCode || 500
          )
        );
    }
  }

  static async getEmployeeDashboard(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = Number(req.params.userId);
      const dashboard = await EvaluationService.getEmployeeDashboard(
        userId,
        authFromReq(req)
      );
      res.json(successResponse(dashboard));
    } catch (error: any) {
      res
        .status(error.statusCode || 500)
        .json(errorResponse(error.message || "Failed to load dashboard", error.statusCode || 500));
    }
  }
}

export default EvaluationController;
