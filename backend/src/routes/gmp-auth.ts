import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import prisma from '../prisma';
import { createAudit } from '../utils/audit';
import { getJwtSecret } from '../config/jwt';

const router = express.Router();
const REQUIRE_GMP_AUDIT = process.env.REQUIRE_GMP_AUDIT === 'true';

const toSafeEmailHint = (value: unknown) => {
  const email = String(value || '').trim().toLowerCase();
  const [local, domain] = email.split('@');
  if (!domain) return 'unknown';
  return `${local?.slice(0, 2) || '**'}***@${domain}`;
};

const writeGmpAudit = async (params: {
  action: string;
  userId: number;
  entityType: string;
  entityId: number;
  ipAddress?: string | null;
  metadata?: Prisma.InputJsonValue;
}) => {
  try {
    await createAudit({
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId,
      user_id: params.userId,
      ip_address: params.ipAddress || null,
      metadata: params.metadata ?? null,
    });
  } catch (error) {
    console.error('GMP audit write failed:', error);
    if (REQUIRE_GMP_AUDIT) {
      throw error;
    }
  }
};

const isUserBlockedFromLogin = (user: any) => {
  if (!user?.isActive) return true;
  const profileStatus = String(user?.profile?.status || '').toLowerCase();
  return profileStatus === 'inactive' || profileStatus === 'separated';
};

const hasGmpPrivileges = (user: any) =>
  user.roles.some((role: any) =>
    ['super_admin', 'group_managing_partner', 'admin', 'gmp'].includes(role.role.name)
  ) || user.profile?.positionTitle?.toLowerCase().includes('group managing partner');

// Enhanced login endpoint for GMP with comprehensive security
router.post('/gmp-login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        message: 'Email and password are required',
        success: false,
      });
    }

    // Find user with all related data
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        profile: {
          include: {
            department: true,
            role: true,
          },
        },
        roles: { include: { role: true } },
      },
    });

    if (!user) {
      return res.status(401).json({
        message: 'Invalid credentials',
        success: false,
      });
    }

    if (isUserBlockedFromLogin(user)) {
      return res.status(403).json({
        message: 'Account is inactive. Contact HR to reactivate your account.',
        success: false,
      });
    }

    // Verify password with bcrypt
    if (!user.password) {
      return res.status(401).json({
        message: 'Invalid credentials',
        success: false,
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        message: 'Invalid credentials',
        success: false,
      });
    }

    // Check if user has GMP or admin privileges
    if (!hasGmpPrivileges(user)) {
      return res.status(403).json({
        message: 'Insufficient privileges for GMP access',
        success: false,
      });
    }

    // Generate JWT token with comprehensive user data
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        name: `${user.profile?.firstName ?? ''} ${user.profile?.lastName ?? ''}`.trim(),
        position: user.profile?.positionTitle || 'group_managing_partner',
        roles: user.roles.map((r: any) => r.role.name),
        departmentId: user.profile?.departmentId,
        isPartner: user.profile?.isPartner || true,
        gmpAccess: true,
      },
      getJwtSecret(),
      { expiresIn: '24h' }
    );

    await writeGmpAudit({
      action: 'GMP_LOGIN',
      userId: user.id,
      entityType: 'USER',
      entityId: user.id,
      ipAddress: req.ip,
      metadata: {
        emailHint: toSafeEmailHint(user.email),
        userAgent: req.headers['user-agent'],
      },
    });

    // Return successful response with user data
    res.json({
      message: 'GMP login successful',
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: `${user.profile?.firstName ?? ''} ${user.profile?.lastName ?? ''}`.trim(),
        profile: {
          firstName: user.profile?.firstName,
          lastName: user.profile?.lastName,
          position: user.profile?.positionTitle,
          employeeId: user.profile?.employeeId,
          phone: user.profile?.phoneNumber,
          department: user.profile?.department?.name,
          isPartner: user.profile?.isPartner,
        },
        roles: user.roles.map((r: any) => r.role.name),
        permissions: {
          gmpAccess: true,
          adminAccess: true,
          financialOversight: true,
          partnerManagement: true,
          strategicPlanning: true,
        },
      },
    });
  } catch (error) {
    console.error('GMP login error:', error);
    res.status(500).json({
      message: 'Internal server error during login',
      success: false,
    });
  }
});

// Secure password reset for GMP
router.post('/gmp-reset-password', async (req, res) => {
  try {
    const { email, currentPassword, newPassword } = req.body;

    // Validate input
    if (!email || !currentPassword || !newPassword) {
      return res.status(400).json({
        message: 'Email, current password, and new password are required',
        success: false,
      });
    }

    // Validate new password strength
    if (newPassword.length < 8) {
      return res.status(400).json({
        message: 'New password must be at least 8 characters long',
        success: false,
      });
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
      include: { roles: { include: { role: true } }, profile: true },
    });

    if (!user) {
      return res.status(404).json({
        message: 'User not found',
        success: false,
      });
    }

    if (isUserBlockedFromLogin(user)) {
      return res.status(403).json({
        message: 'Account is inactive. Contact HR to reactivate your account.',
        success: false,
      });
    }

    // Verify current password
    if (!user.password) {
      return res.status(401).json({
        message: 'Current password is incorrect',
        success: false,
      });
    }

    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);

    if (!isCurrentPasswordValid) {
      return res.status(401).json({
        message: 'Current password is incorrect',
        success: false,
      });
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 12);

    // Update password
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedNewPassword },
    });

    await writeGmpAudit({
      action: 'PASSWORD_CHANGE',
      userId: user.id,
      entityType: 'USER',
      entityId: user.id,
      ipAddress: req.ip,
      metadata: {
        emailHint: toSafeEmailHint(user.email),
        userAgent: req.headers['user-agent'],
      },
    });

    res.json({
      message: 'Password reset successful',
      success: true,
    });
  } catch (error) {
    console.error('GMP password reset error:', error);
    res.status(500).json({
      message: 'Internal server error during password reset',
      success: false,
    });
  }
});

// Validate GMP token middleware
export const validateGMPToken = async (req: any, res: any, next: any) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        message: 'Authorization token required',
        success: false,
      });
    }

    const token = authHeader.substring(7);

    // Verify JWT token
    const decoded = jwt.verify(token, getJwtSecret()) as any;

    // Check if token has GMP access
    if (!decoded.gmpAccess) {
      return res.status(403).json({
        message: 'GMP access required',
        success: false,
      });
    }

    // Verify user still exists and has proper privileges
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: { roles: { include: { role: true } }, profile: true },
    });

    if (!user) {
      return res.status(401).json({
        message: 'User not found',
        success: false,
      });
    }

    if (isUserBlockedFromLogin(user)) {
      return res.status(403).json({
        message: 'Account is inactive. Contact HR to reactivate your account.',
        success: false,
      });
    }

    // Check if user still has GMP privileges
    if (!hasGmpPrivileges(user)) {
      return res.status(403).json({
        message: 'GMP privileges revoked',
        success: false,
      });
    }

    // Add user data to request
    req.user = decoded;
    req.fullUser = user;

    next();
  } catch (error) {
    console.error('GMP token validation error:', error);
    res.status(401).json({
      message: 'Invalid or expired token',
      success: false,
    });
  }
};

// GMP dashboard data endpoint
router.get('/gmp-dashboard-data', validateGMPToken, async (_req, res) => {
  try {
    // Fetch comprehensive dashboard data
    const [
      totalUsers,
      totalPartners,
      totalClients,
      recentActivities,
      departmentStats,
      revenueData,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.partner.count(),
      prisma.client.count(),
      prisma.auditLog.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { email: true } } },
      }),
      prisma.department.findMany({
        include: {
          _count: { select: { profiles: true } },
        },
      }),
      prisma.proposal.groupBy({
        by: ['status'],
        _sum: { proposedFee: true },
        _count: { _all: true },
      }),
    ]);

    const dashboardData = {
      summary: {
        totalUsers,
        totalPartners,
        totalClients,
        activeEngagements: revenueData.length,
      },
      departments: departmentStats.map((dept: any) => ({
        name: dept.name,
        employeeCount: dept._count.profiles,
        description: dept.description,
      })),
      recentActivities: recentActivities.map((activity: any) => ({
        action: activity.action,
        user: activity.user?.email || 'System',
        timestamp: activity.createdAt,
        details: activity.metadata,
      })),
      revenue: revenueData.map((data: any) => ({
        status: data.status,
        totalValue: data._sum.proposedFee || 0,
        count: data._count._all,
      })),
    };

    res.json({
      success: true,
      data: dashboardData,
    });
  } catch (error) {
    console.error('GMP dashboard data fetch error:', error);
    res.status(500).json({
      message: 'Error fetching dashboard data',
      success: false,
    });
  }
});

export default router;
