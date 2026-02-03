/**
 * Evaluation Controller (Schema v2.1 aligned)
 */

import { Response } from "express";
import { EvaluationAssignmentStatus } from "@prisma/client";
import { AuthRequest } from "../middleware/auth";
import { EvaluationService } from "../services/evaluations.service";
import { successResponse, errorResponse, paginatedResponse } from "../utils/response";

export class EvaluationController {
  /**
   * GET /evaluations
   * List evaluations accessible to user
   */
  static async listEvaluations(req: AuthRequest, res: Response): Promise<void> {
    try {
      const page = Number(req.query.page) || 1;
      const pageSize = Number(req.query.pageSize) || 10;
      const status = req.query.status
        ? (req.query.status as EvaluationAssignmentStatus)
        : undefined;
      const type = (req.query.type as string) || undefined;
      const cycleId = req.query.cycleId ? Number(req.query.cycleId) : undefined;

      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const result = await EvaluationService.listEvaluations(
        { page, pageSize, status, type, cycleId },
        auth
      );

      res.json(paginatedResponse(result.evaluations, result.total, page, pageSize));
    } catch (error: any) {
      res.status(error.statusCode || 500).json(
        errorResponse(error.message, error.statusCode || 500)
      );
    }
  }

  /**
   * POST /evaluations
   * Create new evaluation
   */
  static async createEvaluation(req: AuthRequest, res: Response): Promise<void> {
    try {
      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const evaluation = await EvaluationService.createEvaluation(req.body, auth);

      res.status(201).json(
        successResponse(evaluation, 'Evaluation created successfully', 201)
      );
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400)
      );
    }
  }

  /**
   * GET /evaluations/:evaluationId
   * Get specific evaluation
   */
  static async getEvaluation(req: AuthRequest, res: Response): Promise<void> {
    try {
      const evaluationId = Number(req.params.evaluationId);

      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const evaluation = await EvaluationService.getEvaluation(evaluationId, auth);

      res.json(successResponse(evaluation, 'Evaluation retrieved'));
    } catch (error: any) {
      res.status(error.statusCode || 500).json(
        errorResponse(error.message, error.statusCode || 500)
      );
    }
  }

  /**
   * PATCH /evaluations/:evaluationId
   * Update evaluation
   */
  static async updateEvaluation(req: AuthRequest, res: Response): Promise<void> {
    try {
      const evaluationId = Number(req.params.evaluationId);

      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const evaluation = await EvaluationService.updateEvaluation(
        evaluationId,
        req.body,
        auth
      );

      res.json(successResponse(evaluation, 'Evaluation updated successfully'));
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400)
      );
    }
  }

  /**
   * PATCH /evaluations/:evaluationId/submit
   * Submit evaluation
   */
  static async submitEvaluation(req: AuthRequest, res: Response): Promise<void> {
    try {
      const evaluationId = Number(req.params.evaluationId);

      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const evaluation = await EvaluationService.submitEvaluation(
        evaluationId,
        auth
      );

      res.json(successResponse(evaluation, 'Evaluation submitted'));
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400)
      );
    }
  }

  /**
   * PATCH /evaluations/:evaluationId/approve
   * Approve evaluation
   */
  static async approveEvaluation(req: AuthRequest, res: Response): Promise<void> {
    try {
      const evaluationId = Number(req.params.evaluationId);

      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const evaluation = await EvaluationService.approveEvaluation(
        evaluationId,
        auth
      );

      res.json(successResponse(evaluation, 'Evaluation approved'));
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400)
      );
    }
  }

  /**
   * GET /evaluations/cycle/:cycleId
   * Get evaluations for a cycle
   */
  static async getEvaluationsByCycle(
    req: AuthRequest,
    res: Response
  ): Promise<void> {
    try {
      const cycleId = Number(req.params.cycleId);

      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const evaluations = await EvaluationService.getEvaluationsByCycle(
        cycleId,
        auth
      );

      res.json(successResponse(evaluations, 'Evaluations retrieved'));
    } catch (error: any) {
      res.status(error.statusCode || 500).json(
        errorResponse(error.message, error.statusCode || 500)
      );
    }
  }

  /**
   * GET /evaluations/:evaluationId/scores
   * Get evaluation scores
   */
  static async getEvaluationScores(req: AuthRequest, res: Response): Promise<void> {
    try {
      const evaluationId = Number(req.params.evaluationId);

      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const scores = await EvaluationService.getEvaluationScores(
        evaluationId,
        auth
      );

      res.json(successResponse(scores, 'Evaluation scores retrieved'));
    } catch (error: any) {
      res.status(error.statusCode || 500).json(
        errorResponse(error.message, error.statusCode || 500)
      );
    }
  }
}
