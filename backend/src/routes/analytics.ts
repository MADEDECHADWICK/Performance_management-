import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import prisma from '../prisma';
import RoleAwareAnalyticsService, { AnalyticsContext } from '../services/roleAwareAnalytics.service';

const router = Router();

/**
 * Helper function to build analytics context from authenticated user
 */
const buildAnalyticsContext = async (userId: number): Promise<AnalyticsContext> => {
  const roles = await prisma.userRole.findMany({
    where: { userId },
  });

  const roleNames = roles.map(r => r.role);
  const isAdmin = roleNames.includes('admin') || roleNames.includes('super_admin');
  const isPartner = roleNames.includes('partner');
  const isEmployee = roleNames.includes('associate') || roleNames.includes('intern') || (!isAdmin && !isPartner);

  return {
    userId,
    roles: roleNames,
    isAdmin,
    isPartner,
    isEmployee,
  };
};

/**
 * GET /analytics/non-financial
 * 
 * Returns non-financial metrics based on user role:
 * - Employee: Own metrics only
 * - Partner: Team metrics
 * - Admin: Company-wide metrics
 * 
 * Visibility Rules Enforced:
 * - Employees cannot see: Company-wide aggregates, other employees' metrics
 * - Partners cannot see: Other partners' data, company totals
 * - Admins can see: All data
 */
router.get('/non-financial', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.sub ? Number(req.user.sub) : undefined;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const context = await buildAnalyticsContext(userId);
    const analytics = await RoleAwareAnalyticsService.getNonFinancialAnalytics(context);

    return res.json(analytics);
  } catch (err: any) {
    console.error('Error fetching non-financial analytics:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /analytics/financial
 * 
 * Returns financial metrics based on user role:
 * - Employee: Hours only (no monetary values)
 * - Partner: Portfolio revenue and profit
 * - Admin: Company-wide financial metrics
 * 
 * Visibility Rules Enforced:
 * - Employees cannot see: Company revenue, partner financials, job profitability beyond hours
 * - Partners cannot see: Other partners' financials, company totals, non-partner employee data
 * - Admins can see: All financial data including aggregates
 */
router.get('/financial', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.sub ? Number(req.user.sub) : undefined;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const context = await buildAnalyticsContext(userId);
    const analytics = await RoleAwareAnalyticsService.getFinancialAnalytics(context);

    return res.json(analytics);
  } catch (err: any) {
    console.error('Error fetching financial analytics:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /analytics/dashboard
 * 
 * Returns combined dashboard data based on user role
 * This endpoint provides all analytics for the dashboard view
 */
router.get('/dashboard', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.sub ? Number(req.user.sub) : undefined;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const context = await buildAnalyticsContext(userId);

    // Get both non-financial and financial analytics
    const [nonFinancial, financial] = await Promise.all([
      RoleAwareAnalyticsService.getNonFinancialAnalytics(context),
      RoleAwareAnalyticsService.getFinancialAnalytics(context),
    ]);

    // Get user profile for context
    const profile = await prisma.profile.findUnique({
      where: { userId },
    });

    return res.json({
      userRole: context.roles[0] || 'employee',
      isAdmin: context.isAdmin,
      isPartner: context.isPartner,
      isEmployee: context.isEmployee,
      userProfile: profile,
      nonFinancial,
      financial,
    });
  } catch (err: any) {
    console.error('Error fetching dashboard analytics:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /analytics/company (Admin Only)
 * 
 * Returns company-wide analytics aggregations
 * AUTHORIZATION: Admin/Super Admin only
 * 
 * Shows:
 * - Company totals
 * - Department breakdowns
 * - Partner portfolio summaries
 * - Employee count
 */
router.get('/company', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.sub ? Number(req.user.sub) : undefined;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check admin authorization
    const roles = await prisma.userRole.findMany({
      where: { userId },
    });

    const isAdmin = roles.some(r => r.role === 'admin' || r.role === 'super_admin');
    if (!isAdmin) {
      return res.status(403).json({
        error: 'Only admins can access company-wide analytics',
      });
    }

    const context = await buildAnalyticsContext(userId);
    const nonFinancial = await RoleAwareAnalyticsService.getCompanyNonFinancialMetrics();
    const financial = await RoleAwareAnalyticsService.getCompanyFinancialMetrics();

    return res.json({
      nonFinancial,
      financial,
    });
  } catch (err: any) {
    console.error('Error fetching company analytics:', err);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
