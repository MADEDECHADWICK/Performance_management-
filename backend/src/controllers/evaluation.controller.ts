/**
 * Evaluation Controller (Schema v2.1 aligned)
 */

import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { EvaluationService } from "../services/evaluations.service";
import { successResponse, errorResponse, paginatedResponse } from "../utils/response";

export class EvaluationController {
  static async listEvaluationCycles(req: AuthRequest, res: Response): Promise<void> {
    try {
      const page = Number(req.query.page) || 1;
      const pageSize = Number(req.query.pageSize) || 10;
      const status = req.query.status as string | undefined;

      const result = await EvaluationService.listEvaluationCycles(
        { page, pageSize, status },
        req.user!.profileId!
      );

      res.json(paginatedResponse(result.cycles, result.total, page, pageSize, "Evaluation cycles retrieved"));
    } catch (error) {
      console.error("EvaluationController.listEvaluationCycles error:", error);
      res.status(500).json(errorResponse("Failed to retrieve cycles", 500));
    }
  }

  static async createEvaluationCycle(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { cycleName, description, startDate, endDate, status } = req.body;

      const roles = req.userRoles || [];
      const created = await EvaluationService.createEvaluationCycle(
        { cycleName, description, startDate, endDate, status },
        req.user!.profileId!,
        roles
      );

      res.status(201).json(successResponse(created, "Evaluation cycle created", 201));
    } catch (error: any) {
      console.error("EvaluationController.createEvaluationCycle error:", error);
      res.status(400).json(errorResponse(error.message || "Failed to create cycle", 400));
    }
  }

  static async listEvaluationDefinitions(req: AuthRequest, res: Response): Promise<void> {
    try {
      const page = Number(req.query.page) || 1;
      const pageSize = Number(req.query.pageSize) || 10;
      const cycleId = req.query.cycleId ? Number(req.query.cycleId) : undefined;
      const departmentId = req.query.departmentId ? Number(req.query.departmentId) : undefined;
      const status = req.query.status as string | undefined;

      const result = await EvaluationService.listEvaluationDefinitions(
        { page, pageSize, cycleId, departmentId, status },
        req.user!.profileId!
      );

      res.json(paginatedResponse(result.definitions, result.total, page, pageSize, "Evaluation definitions retrieved"));
    } catch (error) {
      console.error("EvaluationController.listEvaluationDefinitions error:", error);
      res.status(500).json(errorResponse("Failed to retrieve definitions", 500));
    }
  }

  static async createEvaluationDefinition(req: AuthRequest, res: Response): Promise<void> {
    try {
      const roles = req.userRoles || [];

      const created = await EvaluationService.createEvaluationDefinition(
        req.body,
        req.user!.profileId!,
        roles
      );

      res.status(201).json(successResponse(created, "Evaluation definition created", 201));
    } catch (error: any) {
      console.error("EvaluationController.createEvaluationDefinition error:", error);
      res.status(400).json(errorResponse(error.message || "Failed to create definition", 400));
    }
  }

  static async listEvaluationAssignments(req: AuthRequest, res: Response): Promise<void> {
    try {
      const page = Number(req.query.page) || 1;
      const pageSize = Number(req.query.pageSize) || 10;

      const status = req.query.status as string | undefined;
      const evaluatorType = req.query.evaluatorType as string | undefined;

      const evaluationDefinitionId = req.query.evaluationDefinitionId ? Number(req.query.evaluationDefinitionId) : undefined;
      const evaluateeProfileId = req.query.evaluateeProfileId ? Number(req.query.evaluateeProfileId) : undefined;
      const evaluatorProfileId = req.query.evaluatorProfileId ? Number(req.query.evaluatorProfileId) : undefined;

      const roles = req.userRoles || [];

      const result = await EvaluationService.listEvaluationAssignments(
        {
          page,
          pageSize,
          status,
          evaluatorType,
          evaluationDefinitionId,
          evaluateeProfileId,
          evaluatorProfileId,
        },
        req.user!.profileId!,
        roles
      );

      res.json(paginatedResponse(result.assignments, result.total, page, pageSize, "Evaluation assignments retrieved"));
    } catch (error) {
      console.error("EvaluationController.listEvaluationAssignments error:", error);
      res.status(500).json(errorResponse("Failed to retrieve assignments", 500));
    }
  }

  static async createEvaluationAssignment(req: AuthRequest, res: Response): Promise<void> {
    try {
      const roles = req.userRoles || [];

      const created = await EvaluationService.createEvaluationAssignment(req.body, roles);

      res.status(201).json(successResponse(created, "Evaluation assignment created", 201));
    } catch (error: any) {
      console.error("EvaluationController.createEvaluationAssignment error:", error);
      res.status(400).json(errorResponse(error.message || "Failed to create assignment", 400));
    }
  }

  static async getEvaluationAssignment(req: AuthRequest, res: Response): Promise<void> {
    try {
      const assignmentId = Number(req.params.assignmentId);
      const found = await EvaluationService.getEvaluationAssignmentById(assignmentId);

      if (!found) {
        res.status(404).json(errorResponse("Assignment not found", 404));
        return;
      }

      res.json(successResponse(found, "Assignment retrieved"));
    } catch (error) {
      console.error("EvaluationController.getEvaluationAssignment error:", error);
      res.status(500).json(errorResponse("Failed to retrieve assignment", 500));
    }
  }

  static async submitEvaluation(req: AuthRequest, res: Response): Promise<void> {
    try {
      const assignmentId = Number(req.params.assignmentId);

      const updated = await EvaluationService.submitEvaluation(assignmentId, req.body);

      res.json(successResponse(updated, "Evaluation submitted successfully"));
    } catch (error: any) {
      console.error("EvaluationController.submitEvaluation error:", error);
      res.status(400).json(errorResponse(error.message || "Failed to submit evaluation", 400));
    }
  }

  static async acknowledgeEvaluation(req: AuthRequest, res: Response): Promise<void> {
    try {
      const assignmentId = Number(req.params.assignmentId);

      const updated = await EvaluationService.acknowledgeEvaluation(assignmentId);

      res.json(successResponse(updated, "Evaluation acknowledged"));
    } catch (error: any) {
      console.error("EvaluationController.acknowledgeEvaluation error:", error);
      res.status(400).json(errorResponse(error.message || "Failed to acknowledge", 400));
    }
  }

  static async getEvaluationSummary(req: AuthRequest, res: Response): Promise<void> {
    try {
      const assignmentId = Number(req.params.assignmentId);
      const result = await EvaluationService.getEvaluationSummary(assignmentId);
      res.json(successResponse(result, "Evaluation summary retrieved"));
    } catch (error: any) {
      console.error("EvaluationController.getEvaluationSummary error:", error);
      res.status(400).json(errorResponse(error.message || "Failed to retrieve summary", 400));
    }
  }

  static async getEvaluationDashboard(req: AuthRequest, res: Response): Promise<void> {
    try {
      const requestedEmployeeProfileId = req.query.employeeProfileId
        ? Number(req.query.employeeProfileId)
        : req.user!.profileId!;

      // Non HR/Admin can only view self
      const roles = req.userRoles || [];
      const isPrivileged = roles.map(r => r.toLowerCase()).some(r => ["hr", "hr_manager", "admin", "super_admin"].includes(r));
      if (!isPrivileged && requestedEmployeeProfileId !== req.user!.profileId) {
        res.status(403).json(errorResponse("Forbidden", 403));
        return;
      }

      const result = await EvaluationService.getEvaluationDashboard(requestedEmployeeProfileId, roles);

      res.json(successResponse(result, "Evaluation dashboard retrieved"));
    } catch (error: any) {
      console.error("EvaluationController.getEvaluationDashboard error:", error);
      res.status(400).json(errorResponse(error.message || "Failed to retrieve dashboard", 400));
    }
  }
}
