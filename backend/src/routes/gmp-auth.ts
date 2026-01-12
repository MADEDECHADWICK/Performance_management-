import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// JWT secret (in production, use environment variables)
const JWT_SECRET = process.env.JWT_SECRET || 'ronalds-gmp-secure-key-2024';

// Enhanced login endpoint for GMP with comprehensive security
router.post('/gmp-login', async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('🔐 GMP Login attempt for:', email);

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ 
        message: 'Email and password are required',
        success: false 
      });
    }

    // Find user with all related data
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        profile: {
          include: {
            department: true,
            role: true
          }
        },
        roles: true,
        partner: {
          include: {
            company: true
          }
        }
      }
    });

    if (!user) {
      console.log('❌ User not found:', email);
      return res.status(401).json({ 
        message: 'Invalid credentials',
        success: false 
      });
    }

    // Verify password with bcrypt
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      console.log('❌ Invalid password for:', email);
      return res.status(401).json({ 
        message: 'Invalid credentials',
        success: false 
      });
    }

    // Check if user has GMP or admin privileges
    const hasGMPPrivileges = user.roles.some(role => 
      ['super_admin', 'group_managing_partner', 'admin'].includes(role.role)
    ) || user.profile?.position === 'group_managing_partner';

    if (!hasGMPPrivileges) {
      console.log('❌ Insufficient privileges for:', email);
      return res.status(403).json({ 
        message: 'Insufficient privileges for GMP access',
        success: false 
      });
    }

    // Generate JWT token with comprehensive user data
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        name: user.name,
        position: user.profile?.position || 'group_managing_partner',
        roles: user.roles.map(r => r.role),
        departmentId: user.profile?.departmentId,
        isPartner: user.profile?.is_partner || true,
        gmpAccess: true
      },
      JWT_SECRET,
      { expiresIn: '24h' } // 24 hour token for GMP access
    );

    // Log successful login
    console.log('✅ GMP Login successful:', {
      email: user.email,
      name: user.name,
      position: user.profile?.position,
      roles: user.roles.map(r => r.role)
    });

    // Record login activity (audit log)
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'GMP_LOGIN',
        entity_type: 'USER',
        entity_id: user.id.toString(),
        details: {
          email: user.email,
          timestamp: new Date(),
          userAgent: req.headers['user-agent'],
          ip: req.ip
        }
      }
    }).catch(console.error); // Don't fail login if audit log fails

    // Return successful response with user data
    res.json({
      message: 'GMP login successful',
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        profile: {
          firstName: user.profile?.first_name,
          lastName: user.profile?.last_name,
          position: user.profile?.position,
          employeeId: user.profile?.employee_id,
          phone: user.profile?.phone,
          department: user.profile?.department?.name,
          isPartner: user.profile?.is_partner
        },
        roles: user.roles.map(r => r.role),
        partner: user.partner ? {
          companyName: user.partner.company?.company_name,
          commissionRate: user.partner.commission_rate,
          groupName: user.partner.group_name
        } : null,
        permissions: {
          gmpAccess: true,
          adminAccess: true,
          financialOversight: true,
          partnerManagement: true,
          strategicPlanning: true
        }
      }
    });

  } catch (error) {
    console.error('❌ GMP Login error:', error);
    res.status(500).json({ 
      message: 'Internal server error during login',
      success: false 
    });
  }
});

// Secure password reset for GMP
router.post('/gmp-reset-password', async (req, res) => {
  try {
    const { email, currentPassword, newPassword } = req.body;

    console.log('🔄 GMP Password reset attempt for:', email);

    // Validate input
    if (!email || !currentPassword || !newPassword) {
      return res.status(400).json({ 
        message: 'Email, current password, and new password are required',
        success: false 
      });
    }

    // Validate new password strength
    if (newPassword.length < 8) {
      return res.status(400).json({ 
        message: 'New password must be at least 8 characters long',
        success: false 
      });
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
      include: { roles: true }
    });

    if (!user) {
      return res.status(404).json({ 
        message: 'User not found',
        success: false 
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);

    if (!isCurrentPasswordValid) {
      return res.status(401).json({ 
        message: 'Current password is incorrect',
        success: false 
      });
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 12);

    // Update password
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedNewPassword }
    });

    // Log password change
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'PASSWORD_CHANGE',
        entity_type: 'USER',
        entity_id: user.id.toString(),
        details: {
          email: user.email,
          timestamp: new Date(),
          userAgent: req.headers['user-agent'],
          ip: req.ip
        }
      }
    }).catch(console.error);

    console.log('✅ GMP Password reset successful for:', email);

    res.json({
      message: 'Password reset successful',
      success: true
    });

  } catch (error) {
    console.error('❌ GMP Password reset error:', error);
    res.status(500).json({ 
      message: 'Internal server error during password reset',
      success: false 
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
        success: false 
      });
    }

    const token = authHeader.substring(7);

    // Verify JWT token
    const decoded = jwt.verify(token, JWT_SECRET) as any;

    // Check if token has GMP access
    if (!decoded.gmpAccess) {
      return res.status(403).json({ 
        message: 'GMP access required',
        success: false 
      });
    }

    // Verify user still exists and has proper privileges
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: { roles: true, profile: true }
    });

    if (!user) {
      return res.status(401).json({ 
        message: 'User not found',
        success: false 
      });
    }

    // Check if user still has GMP privileges
    const hasGMPPrivileges = user.roles.some(role => 
      ['super_admin', 'group_managing_partner', 'admin'].includes(role.role)
    ) || user.profile?.position === 'group_managing_partner';

    if (!hasGMPPrivileges) {
      return res.status(403).json({ 
        message: 'GMP privileges revoked',
        success: false 
      });
    }

    // Add user data to request
    req.user = decoded;
    req.fullUser = user;
    
    next();

  } catch (error) {
    console.error('❌ Token validation error:', error);
    res.status(401).json({ 
      message: 'Invalid or expired token',
      success: false 
    });
  }
};

// GMP dashboard data endpoint
router.get('/gmp-dashboard-data', validateGMPToken, async (req, res) => {
  try {
    console.log('📊 Fetching GMP dashboard data...');

    // Fetch comprehensive dashboard data
    const [
      totalUsers,
      totalPartners,
      totalClients,
      recentActivities,
      departmentStats,
      revenueData
    ] = await Promise.all([
      prisma.user.count(),
      prisma.partner.count(),
      prisma.client.count(),
      prisma.auditLog.findMany({
        take: 10,
        orderBy: { timestamp: 'desc' },
        include: { user: { select: { name: true, email: true } } }
      }),
      prisma.department.findMany({
        include: {
          _count: { select: { profiles: true } }
        }
      }),
      prisma.clientEngagement.groupBy({
        by: ['status'],
        _sum: { engagement_value: true },
        _count: { id: true }
      })
    ]);

    const dashboardData = {
      summary: {
        totalUsers,
        totalPartners,
        totalClients,
        activeEngagements: revenueData.length
      },
      departments: departmentStats.map(dept => ({
        name: dept.name,
        employeeCount: dept._count.profiles,
        description: dept.description
      })),
      recentActivities: recentActivities.map(activity => ({
        action: activity.action,
        user: activity.user?.name || 'System',
        timestamp: activity.timestamp,
        details: activity.details
      })),
      revenue: revenueData.map(data => ({
        status: data.status,
        totalValue: data._sum.engagement_value || 0,
        count: data._count.id
      }))
    };

    res.json({
      success: true,
      data: dashboardData
    });

  } catch (error) {
    console.error('❌ Dashboard data fetch error:', error);
    res.status(500).json({ 
      message: 'Error fetching dashboard data',
      success: false 
    });
  }
});

export default router;