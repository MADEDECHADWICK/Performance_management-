import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import FeedbackService from "../services/feedback.service";
import { errorResponse, successResponse } from "../utils/response";

const authFromReq = (req: AuthRequest) => ({
  userId: req.user?.userId || 0,
  profileId: req.profile?.id || req.user?.profileId || 0,
  roles: req.userRoles || req.user?.authRoles || [],
});

export class FeedbackController {
  static async submitFeedback(req: AuthRequest, res: Response): Promise<void> {
    try {
      const feedback = await FeedbackService.submitFeedback(req.body, authFromReq(req));
      res.status(201).json(successResponse(feedback, "Feedback submitted", 201));
    } catch (error: any) {
      res
        .status(error.statusCode || 400)
        .json(errorResponse(error.message || "Failed to submit feedback", error.statusCode || 400));
    }
  }

  static async getFeedbackForUser(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = Number(req.params.userId);
      const feedback = await FeedbackService.getFeedbackForUser(userId, authFromReq(req));
      res.json(successResponse(feedback));
    } catch (error: any) {
      res
        .status(error.statusCode || 500)
        .json(errorResponse(error.message || "Failed to load feedback", error.statusCode || 500));
    }
  }
}

export default FeedbackController;
