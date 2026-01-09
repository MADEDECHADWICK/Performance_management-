import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export enum UserRole {
  SUPER_ADMIN = 'super_admin',
  HR_MANAGER = 'hr_manager',
  PARTNER = 'partner',
  MANAGER = 'manager',
  EMPLOYEE = 'employee',
  CLIENT = 'client',
}

export interface AuthContext {
  userId: number;
  roles: UserRole[];
  isPartner: boolean;
  partnerId?: number;
}

/**
 * Extend Express Request to include auth context
 */
declare global {
  namespace Express {
    interface Request {
      authContext?: AuthContext;
      userId?: number;
    }
  }
}

/**
 * Get current user's auth context from user_id in request
 */
export async function getAuthContext(userId: number): Promise<AuthContext | null> {
  if (!userId) return null;

  try {
    // Fetch user roles
    const roleData = await prisma.userRole.findMany({
      where: { userId },
      select: { role: true },
    });

    const roles = roleData.map((r) => r.role as UserRole);

    // Check if user is a partner
    const profileData = await prisma.profile.findUnique({
      where: { userId },
      select: {
        id: true,
        is_partner: true,
      },
    });

    return {
      userId,
      roles,
      isPartner: profileData?.is_partner || false,
      partnerId: profileData?.id,
    };
  } catch (error) {
    console.error('Error getting auth context:', error);
    return null;
  }
}

/**
 * Verify if user has required role
 */
export function hasRole(context: AuthContext, role: UserRole): boolean {
  return context.roles.includes(role);
}

/**
 * Verify if user has any of the required roles
 */
export function hasAnyRole(context: AuthContext, roles: UserRole[]): boolean {
  return roles.some((role) => context.roles.includes(role));
}

/**
 * Verify user can access specific job
 */
export async function canAccessJob(jobId: number, context: AuthContext): Promise<boolean> {
  // Verify job exists first
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      partner_id: true,
      assigned_to: true,
    },
  });

  if (!job) return false;

  // Super admin/HR can access all existing jobs
  if (hasAnyRole(context, [UserRole.SUPER_ADMIN, UserRole.HR_MANAGER])) {
    return true;
  }

  // Partner can access own jobs
  if (context.isPartner && job.partner_id === context.partnerId) {
    return true;
  }

  // Employee can access assigned jobs
  if (job.assigned_to === context.partnerId) {
    return true;
  }

  // Manager can access team jobs
  if (context.roles.includes(UserRole.MANAGER)) {
    const assignedEmployee = await prisma.profile.findUnique({
      where: { id: job.assigned_to || undefined },
      select: { manager_id: true },
    });

    if (assignedEmployee?.manager_id === context.partnerId) {
      return true;
    }
  }

  return false;
}

/**
 * Verify user can approve time entries for job
 */
export async function canApproveTimeEntries(jobId: number, context: AuthContext): Promise<boolean> {
  // Only partners and HR can approve
  if (!hasAnyRole(context, [UserRole.SUPER_ADMIN, UserRole.HR_MANAGER])) {
    if (!context.isPartner) {
      return false;
    }
  }

  // Check if partner owns the job
  if (context.isPartner) {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { partner_id: true },
    });

    if (job?.partner_id !== context.partnerId) {
      return false;
    }
  }

  return true;
}

/**
 * Verify user can view partner portfolio
 */
export async function canViewPartnerPortfolio(
  portfolioOwnerId: number,
  context: AuthContext
): Promise<boolean> {
  // Super admin/HR can view all
  if (hasAnyRole(context, [UserRole.SUPER_ADMIN, UserRole.HR_MANAGER])) {
    return true;
  }

  // Partner can view own portfolio
  if (context.isPartner && context.partnerId === portfolioOwnerId) {
    return true;
  }

  return false;
}

/**
 * Authentication middleware - extracts user ID from JWT token
 */
export const authMiddleware = async (
  req: any,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Get user_id from JWT token (set by main auth middleware)
    let userId: number | null = null;

    if (req.user?.sub) {
      userId = req.user.sub;
    } else if (req.query.user_id) {
      userId = parseInt(req.query.user_id as string);
    } else if (req.body?.user_id) {
      userId = parseInt(req.body.user_id);
    }

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized - user_id required' });
      return;
    }

    // Get auth context
    const authContext = await getAuthContext(userId);
    if (!authContext) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Attach to request
    req.authContext = authContext;
    req.userId = userId;

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Authentication error' });
  }
};

/**
 * Partner role check middleware
 */
export const requirePartner = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.authContext?.isPartner) {
    res.status(403).json({ error: 'Forbidden - Partner access required' });
    return;
  }
  next();
};

/**
 * Admin role check middleware
 */
export const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (
    !req.authContext ||
    !hasAnyRole(req.authContext, [UserRole.SUPER_ADMIN, UserRole.HR_MANAGER])
  ) {
    res.status(403).json({ error: 'Forbidden - Admin access required' });
    return;
  }
  next();
};

/**
 * Job access check middleware
 */
export const checkJobAccess = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const jobId = parseInt(req.params.jobId);

    if (!req.authContext) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const canAccess = await canAccessJob(jobId, req.authContext);
    if (!canAccess) {
      res.status(403).json({ error: 'Forbidden - No access to this job' });
      return;
    }

    next();
  } catch (error) {
    console.error('Job access check error:', error);
    res.status(500).json({ error: 'Access check failed' });
  }
};
