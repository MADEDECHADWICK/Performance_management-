/**
 * Profile Controller (Modernized - Phase 4)
 */

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ProfileService } from '../services/profiles.service';
import { successResponse, errorResponse, paginatedResponse } from '../utils/response';

const resolveRoles = (req: AuthRequest) => {
  const roles = [
    ...(req.userRoles || []),
    ...(req.userRoles || []),
    req.profile?.role?.name,
  ]
    .filter(Boolean)
    .map((role) => String(role));
  return Array.from(new Set(roles));
};

const buildAuthContext = (req: AuthRequest) => ({
  userId: req.user!.userId,
  profileId: req.profile!.id,
  roleName: req.profile?.role?.name,
  roles: resolveRoles(req),
  isPartner: req.profile?.isPartner,
});

export class ProfileController {
  /**
   * GET /profiles
   * List all profiles (admin/manager only)
   */
  static async listProfiles(req: AuthRequest, res: Response): Promise<void> {
    try {
      const page = Number(req.query.page) || 1;
      const pageSize = Number(req.query.pageSize) || 10;
      const roleId = req.query.roleId ? Number(req.query.roleId) : undefined;
      const status = (req.query.status as string) || undefined;
      const search = (req.query.search as string) || undefined;

      const auth = buildAuthContext(req);

      const result = await ProfileService.listProfiles(
        { page, pageSize, roleId, status, search },
        auth
      );

      res.json(paginatedResponse(result.profiles, result.total, page, pageSize));
    } catch (error: any) {
      res.status(error.statusCode || 500).json(
        errorResponse(error.message, error.statusCode || 500)
      );
    }
  }

  /**
   * GET /profiles/:profileId
   * Get profile details
   */
  static async getProfile(req: AuthRequest, res: Response): Promise<void> {
    try {
      const profileId = Number(req.params.profileId);

      const auth = buildAuthContext(req);

      const profile = await ProfileService.getProfile(profileId, auth);

      res.json(successResponse(profile, 'Profile retrieved'));
    } catch (error: any) {
      res.status(error.statusCode || 500).json(
        errorResponse(error.message, error.statusCode || 500)
      );
    }
  }

  /**
   * PATCH /profiles/:profileId
   * Update profile
   */
  static async updateProfile(req: AuthRequest, res: Response): Promise<void> {
    try {
      const profileId = Number(req.params.profileId);

      const auth = buildAuthContext(req);

      const profile = await ProfileService.updateProfile(profileId, req.body, auth);

      res.json(successResponse(profile, 'Profile updated successfully'));
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400)
      );
    }
  }

  /**
   * DELETE /profiles/:profileId
   * Delete profile (or archive when hard delete is blocked)
   */
  static async deleteProfile(req: AuthRequest, res: Response): Promise<void> {
    try {
      const profileId = Number(req.params.profileId);
      const auth = buildAuthContext(req);

      const result = await ProfileService.deleteProfile(profileId, auth);
      const message =
        result.mode === 'deleted'
          ? 'Profile deleted successfully'
          : 'Profile archived because it has linked historical records';

      res.json(successResponse(result, message));
    } catch (error: any) {
      res.status(error.statusCode || 500).json(
        errorResponse(error.message, error.statusCode || 500)
      );
    }
  }

  /**
   * GET /profiles/email/:email
   * Get profile by email
   */
  static async getProfileByEmail(req: AuthRequest, res: Response): Promise<void> {
    try {
      const email = req.params.email;

      const auth = buildAuthContext(req);
      const profile = await ProfileService.getProfileByEmail(email, auth);

      res.json(successResponse(profile, 'Profile retrieved'));
    } catch (error: any) {
      res.status(error.statusCode || 500).json(
        errorResponse(error.message, error.statusCode || 500)
      );
    }
  }

  /**
   * GET /profiles/:profileId/stats
   * Get profile statistics
   */
  static async getProfileStats(req: AuthRequest, res: Response): Promise<void> {
    try {
      const profileId = Number(req.params.profileId);

      const auth = buildAuthContext(req);

      const stats = await ProfileService.getProfileStats(profileId, auth);

      res.json(successResponse(stats, 'Profile stats retrieved'));
    } catch (error: any) {
      res.status(error.statusCode || 500).json(
        errorResponse(error.message, error.statusCode || 500)
      );
    }
  }

  /**
   * GET /profiles/:profileId/team
   * Get manager's team members
   */
  static async getTeamMembers(req: AuthRequest, res: Response): Promise<void> {
    try {
      const profileId = Number(req.params.profileId);

      const auth = buildAuthContext(req);

      const team = await ProfileService.getTeamMembers(profileId, auth);

      res.json(successResponse(team, 'Team members retrieved'));
    } catch (error: any) {
      res.status(error.statusCode || 500).json(
        errorResponse(error.message, error.statusCode || 500)
      );
    }
  }

  /**
   * GET /profiles/search
   * Search profiles
   */
  static async searchProfiles(req: AuthRequest, res: Response): Promise<void> {
    try {
      const query = (req.query.q as string) || '';
      const limit = Number(req.query.limit) || 10;

      if (!query || query.length < 2) {
        res.status(400).json(
          errorResponse('Search query must be at least 2 characters', 400)
        );
        return;
      }

      const auth = buildAuthContext(req);
      const profiles = await ProfileService.searchProfiles(query, limit, auth);

      res.json(successResponse(profiles, 'Search results'));
    } catch (error: any) {
      res.status(error.statusCode || 500).json(
        errorResponse(error.message, error.statusCode || 500)
      );
    }
  }
}
