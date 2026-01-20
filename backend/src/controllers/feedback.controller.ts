/**
 * Feedback Controller (Modernized - Phase 4)
 */

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { FeedbackService } from '../services/feedback.service';
import { successResponse, errorResponse, paginatedResponse } from '../utils/response';

export class FeedbackController {
  /**
   * GET /feedback
   * List feedback with pagination
   */
  static async listFeedback(req: AuthRequest, res: Response): Promise<void> {
    try {
      const page = Number(req.query.page) || 1;
      const pageSize = Number(req.query.pageSize) || 10;
      const type = (req.query.type as string) || undefined;
      const status = (req.query.status as string) || undefined;
      const recipientId = req.query.recipientId ? Number(req.query.recipientId) : undefined;

      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const result = await FeedbackService.listFeedback(
        { page, pageSize, type, status, recipientId },
        auth
      );

      res.json(paginatedResponse(result.feedback, result.total, page, pageSize));
    } catch (error: any) {
      res.status(error.statusCode || 500).json(
        errorResponse(error.message, error.statusCode || 500)
      );
    }
  }

  /**
   * POST /feedback
   * Create feedback
   */
  static async createFeedback(req: AuthRequest, res: Response): Promise<void> {
    try {
      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const feedback = await FeedbackService.createFeedback(req.body, auth);

      res.status(201).json(
        successResponse(feedback, 'Feedback created successfully', 201)
      );
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400)
      );
    }
  }

  /**
   * GET /feedback/:feedbackId
   * Get specific feedback
   */
  static async getFeedback(req: AuthRequest, res: Response): Promise<void> {
    try {
      const feedbackId = Number(req.params.feedbackId);

      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const feedback = await FeedbackService.getFeedback(feedbackId, auth);

      res.json(successResponse(feedback, 'Feedback retrieved'));
    } catch (error: any) {
      res.status(error.statusCode || 500).json(
        errorResponse(error.message, error.statusCode || 500)
      );
    }
  }

  /**
   * PATCH /feedback/:feedbackId/status
   * Update feedback status (admin only)
   */
  static async updateFeedbackStatus(req: AuthRequest, res: Response): Promise<void> {
    try {
      const feedbackId = Number(req.params.feedbackId);
      const { status } = req.body;

      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const feedback = await FeedbackService.updateFeedbackStatus(
        feedbackId,
        status,
        auth
      );

      res.json(successResponse(feedback, 'Feedback status updated'));
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400)
      );
    }
  }

  /**
   * GET /feedback/:profileId/analytics
   * Get feedback analytics
   */
  static async getFeedbackAnalytics(req: AuthRequest, res: Response): Promise<void> {
    try {
      const profileId = Number(req.params.profileId);

      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const analytics = await FeedbackService.getFeedbackAnalytics(profileId, auth);

      res.json(successResponse(analytics, 'Feedback analytics retrieved'));
    } catch (error: any) {
      res.status(error.statusCode || 500).json(
        errorResponse(error.message, error.statusCode || 500)
      );
    }
  }

  /**
   * DELETE /feedback/:feedbackId
   * Delete feedback
   */
  static async deleteFeedback(req: AuthRequest, res: Response): Promise<void> {
    try {
      const feedbackId = Number(req.params.feedbackId);

      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      await FeedbackService.deleteFeedback(feedbackId, auth);

      res.json(successResponse(null, 'Feedback deleted successfully'));
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400)
      );
    }
  }
}