import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { prisma } from '../prisma';

/**
 * Verify user has access to job
 * Factory function that returns middleware
 */
export function requireJobAccess(action: string = 'view') {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const jobId = Number(req.params.jobId);
      const requesterProfileId = req.profile?.id;
      const normalizeRole = (role?: string | null) =>
        String(role || '')
          .trim()
          .toLowerCase()
          .replace(/\s+/g, '_');
      const roleCandidates = [
        req.profile?.role?.name,
        ...(req.userRoles || []),
        ...(req.user?.authRoles || []),
      ].filter(Boolean) as string[];
      const roleSet = new Set(roleCandidates.map((role) => normalizeRole(role)));

      if (!requesterProfileId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const job = await prisma.job.findUnique({
        where: { id: jobId },
        include: {
          staffing: {
            where: { employeeProfileId: requesterProfileId },
          },
        },
      });

      if (!job) {
        return res.status(404).json({
          success: false,
          message: 'Job not found',
        });
      }

      // ✅ ACCESS CONTROL LOGIC
      const isAdmin = roleSet.has('admin') || roleSet.has('super_admin');
      const isManager = roleSet.has('manager');
      const isHr =
        roleSet.has('hr') || roleSet.has('hr_manager') || roleSet.has('human_resources');
      const isGmp = roleSet.has('gmp') || roleSet.has('group_managing_partner');
      const isPartner = roleSet.has('partner') && job.partnerProfileId === requesterProfileId;
      const isStaffAssigned = job.staffing.length > 0;

      const hasAccess = isAdmin || isHr || isGmp || isManager || isPartner || isStaffAssigned;

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to access this job',
        });
      }

      req.job = job;
      next();
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  };
}
