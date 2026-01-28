import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import prisma from '../prisma';
import RoleAwareAnalyticsService, { AnalyticsContext } from '../services/roleAwareAnalytics.service';

const router = Router();

/**
 * Helper function to build analytics context from authenticated user
 */
const buildAnalyticsContext = async (userId: number): Promise<AnalyticsContext> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      roles: { include: { role: true } },
      profile: true,
    },
  });

  const roleNames = (user?.roles || []).map((r) => r.role.name.toLowerCase());
  const positionTitle = user?.profile?.positionTitle?.toLowerCase() || "";

  const isAdmin = roleNames.includes("admin") || roleNames.includes("super_admin");
  const isPartner = roleNames.includes("partner") || Boolean(user?.profile?.isPartner);
  const isManager =
    roleNames.includes("manager") ||
    positionTitle.includes("manager") ||
    positionTitle.includes("team lead");
  const isHr =
    roleNames.includes("hr") ||
    roleNames.includes("hr_manager") ||
    positionTitle.includes("hr") ||
    positionTitle.includes("human resource");
  const isFinance = roleNames.includes("finance") || positionTitle.includes("finance");
  const isMarketing = roleNames.includes("marketing") || positionTitle.includes("marketing");
  const isGmp =
    roleNames.includes("gmp") ||
    roleNames.includes("group_managing_partner") ||
    positionTitle.includes("group managing partner");

  const isEmployee =
    roleNames.includes("associate") ||
    roleNames.includes("intern") ||
    (!isAdmin && !isPartner && !isManager && !isHr && !isFinance && !isMarketing && !isGmp);

  return {
    userId,
    profileId: user?.profile?.id,
    roles: roleNames,
    isAdmin,
    isPartner,
    isManager,
    isHr,
    isFinance,
    isMarketing,
    isGmp,
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
    const userId = req.user?.userId ? Number(req.user.userId) : undefined;
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
    const userId = req.user?.userId ? Number(req.user.userId) : undefined;
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
    const userId = req.user?.userId ? Number(req.user.userId) : undefined;
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
      userRole: context.roles[0] || "employee",
      roles: context.roles,
      isAdmin: context.isAdmin,
      isPartner: context.isPartner,
      isManager: context.isManager,
      isHr: context.isHr,
      isFinance: context.isFinance,
      isMarketing: context.isMarketing,
      isGmp: context.isGmp,
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
    const userId = req.user?.userId ? Number(req.user.userId) : undefined;
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
