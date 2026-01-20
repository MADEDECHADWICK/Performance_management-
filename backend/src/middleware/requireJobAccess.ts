import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { prisma } from '../lib/prisma';

/**
 * Verify user has access to job
 */
export async function requireJobAccess(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
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
          where: { employee_profile_id: requesterProfileId },
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
    const isPartner = requesterRole === 'partner' && job.partner_id === requesterProfileId;
    const isStaffAssigned = job.staffing.length > 0;

    const hasAccess = isAdmin || isManager || isPartner || isStaffAssigned;

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
}
