import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { PartnerService } from '../services/partners.service';
import { successResponse, errorResponse, paginatedResponse } from '../utils/response';

export class PartnerController {
  /**
   * GET /partners
   * List partners
   */
  static async listPartners(req: AuthRequest, res: Response): Promise<void> {
    try {
      const page = Number(req.query.page) || 1;
      const pageSize = Number(req.query.pageSize) || 10;
      const status = (req.query.status as string) || undefined;

      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const result = await PartnerService.listPartners(
        { page, pageSize, status },
        auth
      );

      res.json(paginatedResponse(result.partners, result.total, page, pageSize));
    } catch (error: any) {
      res.status(error.statusCode || 500).json(
        errorResponse(error.message, error.statusCode || 500)
      );
    }
  }

  /**
   * POST /partners
   * Create new partner
   */
  static async createPartner(req: AuthRequest, res: Response): Promise<void> {
    try {
      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const partner = await PartnerService.createPartner(req.body, auth);

      res.status(201).json(
        successResponse(partner, 'Partner created successfully', 201)
      );
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400)
      );
    }
  }

  /**
   * GET /partners/:partnerId
   * Get specific partner
   */
  static async getPartner(req: AuthRequest, res: Response): Promise<void> {
    try {
      const partnerId = Number(req.params.partnerId);

      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const partner = await PartnerService.getPartner(partnerId, auth);

      res.json(successResponse(partner, 'Partner retrieved'));
    } catch (error: any) {
      res.status(error.statusCode || 500).json(
        errorResponse(error.message, error.statusCode || 500)
      );
    }
  }

  /**
   * PATCH /partners/:partnerId
   * Update partner
   */
  static async updatePartner(req: AuthRequest, res: Response): Promise<void> {
    try {
      const partnerId = Number(req.params.partnerId);

      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const partner = await PartnerService.updatePartner(partnerId, req.body, auth);

      res.json(successResponse(partner, 'Partner updated successfully'));
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400)
      );
    }
  }

  /**
   * GET /partners/:partnerId/jobs
   * Get partner's jobs
   */
  static async getPartnerJobs(req: AuthRequest, res: Response): Promise<void> {
    try {
      const partnerId = Number(req.params.partnerId);

      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const jobs = await PartnerService.getPartnerJobs(partnerId, auth);

      res.json(successResponse(jobs, 'Partner jobs retrieved'));
    } catch (error: any) {
      res.status(error.statusCode || 500).json(
        errorResponse(error.message, error.statusCode || 500)
      );
    }
  }

  /**
   * GET /partners/:partnerId/revenue
   * Get partner revenue summary
   */
  static async getPartnerRevenue(req: AuthRequest, res: Response): Promise<void> {
    try {
      const partnerId = Number(req.params.partnerId);

      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const revenue = await PartnerService.getPartnerRevenue(partnerId, auth);

      res.json(successResponse(revenue, 'Partner revenue retrieved'));
    } catch (error: any) {
      res.status(error.statusCode || 500).json(
        errorResponse(error.message, error.statusCode || 500)
      );
    }
  }

  /**
   * GET /partners/dashboard-summary
   * Get partner dashboard summary (uses current user's profile by default)
   */
  static async getPartnerDashboardSummary(
    req: AuthRequest,
    res: Response
  ): Promise<void> {
    try {
      const profileId = req.profile?.id;
      const partnerId = Number(req.query.partnerId) || profileId;

      if (!partnerId) {
        res.status(400).json(errorResponse('Partner id is required', 400));
        return;
      }

      const summary = await PartnerService.getPartnerDashboardSummary(partnerId);

      res.json(successResponse(summary, 'Partner dashboard summary retrieved'));
    } catch (error: any) {
      res.status(error.statusCode || 500).json(
        errorResponse(error.message, error.statusCode || 500)
      );
    }
  }

  /**
   * GET /partners/allocations
   * Partner allocation audit (collections vs allocations)
   */
  static async getPartnerAllocations(
    req: AuthRequest,
    res: Response
  ): Promise<void> {
    try {
      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const partnerId =
        auth.roleName === 'partner' ? auth.profileId : Number(req.query.partnerId) || auth.profileId;

      if (!partnerId) {
        res.status(400).json(errorResponse('Partner id is required', 400));
        return;
      }

      const allocations = await PartnerService.getPartnerAllocationAudit(partnerId, auth);

      res.json(successResponse(allocations, 'Partner allocations retrieved'));
    } catch (error: any) {
      res.status(error.statusCode || 500).json(
        errorResponse(error.message, error.statusCode || 500)
      );
    }
  }
}
