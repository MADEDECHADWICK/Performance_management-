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
      const requesterRole = req.profile?.role?.name;

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
      const isAdmin = requesterRole === 'admin';
      const isManager = requesterRole === 'manager';
      const isHr = requesterRole === 'hr' || requesterRole === 'hr_manager';
      const isPartner = requesterRole === 'partner' && job.partnerProfileId === requesterProfileId;
      const isStaffAssigned = job.staffing.length > 0;

      const hasAccess = isAdmin || isManager || isHr || isPartner || isStaffAssigned;

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
