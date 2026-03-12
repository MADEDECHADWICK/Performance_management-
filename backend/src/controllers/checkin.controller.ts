import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import CheckInService from "../services/checkins.service";
import { errorResponse, successResponse } from "../utils/response";

const authFromReq = (req: AuthRequest) => ({
  userId: req.user?.userId || 0,
  profileId: req.profile?.id || req.user?.profileId || 0,
  roles: req.userRoles || req.user?.authRoles || [],
});

export class CheckInController {
  static async scheduleCheckIn(req: AuthRequest, res: Response): Promise<void> {
    try {
      const checkIn = await CheckInService.scheduleCheckIn(
        Number(req.body.managerId),
        Number(req.body.employeeId),
        req.body.scheduledAt,
        authFromReq(req)
      );
      res.status(201).json(successResponse(checkIn, "Check-in scheduled", 201));
    } catch (error: any) {
      res
        .status(error.statusCode || 400)
        .json(errorResponse(error.message || "Failed to schedule check-in", error.statusCode || 400));
    }
  }

  static async completeCheckIn(req: AuthRequest, res: Response): Promise<void> {
    try {
      const checkInId = Number(req.params.checkInId);
      const checkIn = await CheckInService.completeCheckIn(
        checkInId,
        String(req.body.notes || ""),
        Array.isArray(req.body.actionItems) ? req.body.actionItems : [],
        authFromReq(req)
      );
      res.json(successResponse(checkIn, "Check-in completed"));
    } catch (error: any) {
      res
        .status(error.statusCode || 400)
        .json(errorResponse(error.message || "Failed to complete check-in", error.statusCode || 400));
    }
  }

  static async getTeamCheckIns(req: AuthRequest, res: Response): Promise<void> {
    try {
      const managerId = Number(req.params.managerId);
      const data = await CheckInService.getTeamCheckIns(managerId, authFromReq(req));
      res.json(successResponse(data));
    } catch (error: any) {
      res
        .status(error.statusCode || 500)
        .json(errorResponse(error.message || "Failed to load team check-ins", error.statusCode || 500));
    }
  }
}

export default CheckInController;
