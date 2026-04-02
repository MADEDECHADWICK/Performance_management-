import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { resolveRequestAccessRoles } from '../auth/accessRoles';
import prisma from '../prisma';
import RoleAwareAnalyticsService, { AnalyticsContext } from '../services/roleAwareAnalytics.service';
import {
  getDashboardModuleCoverageSummary,
  resolveDashboardModuleForContext,
} from '../services/performanceFramework.service';

const router = Router();

/**
 * Helper function to build analytics context from authenticated user
 */
const buildAnalyticsContext = async (req: AuthRequest): Promise<AnalyticsContext> => {
  const userId = req.user?.userId ? Number(req.user.userId) : 0;
  const profileId = req.user?.profileId ? Number(req.user.profileId) : undefined;
  const roleNames = resolveRequestAccessRoles(req);

  const isAdmin = roleNames.includes("super_admin");
  const isPartner = roleNames.includes("partner");
  const isManager = roleNames.includes("manager");
  const isHr = roleNames.includes("hr");
  const isFinance = roleNames.includes("finance");
  const isMarketing = roleNames.includes("marketing");
  const isGmp = roleNames.includes("gmp");
  const isEmployee =
    roleNames.includes("employee") ||
    (!isAdmin && !isPartner && !isManager && !isHr && !isFinance && !isMarketing && !isGmp);

  return {
    userId,
    profileId,
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

    const context = await buildAnalyticsContext(req);
    const analytics = await RoleAwareAnalyticsService.getNonFinancialAnalytics(context);

    return res.json(
      analytics || {
        avgLearningGrowth: 0,
        avgCustomerSatisfaction: 0,
        avgInternalProcesses: 0,
        avgOverallScore: 0,
        totalEmployees: 0,
        departmentAverages: [],
      }
    );
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

    const context = await buildAnalyticsContext(req);
    const analytics = await RoleAwareAnalyticsService.getFinancialAnalytics(context);

    return res.json(
      analytics || {
        totalRevenue: 0,
        totalProfit: 0,
        averageProfitMargin: 0,
        totalEmployees: 0,
        revenueByDepartment: [],
        revenueByPartner: [],
      }
    );
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

    const context = await buildAnalyticsContext(req);

    // Get both non-financial and financial analytics
    const [nonFinancial, financial] = await Promise.all([
      RoleAwareAnalyticsService.getNonFinancialAnalytics(context),
      RoleAwareAnalyticsService.getFinancialAnalytics(context),
    ]);

    // Get user profile for context
    const profile = await prisma.profile.findUnique({
      where: { userId },
    });

    const frameworkModule = resolveDashboardModuleForContext({
      roles: context.roles,
    });
    const frameworkCoverage = getDashboardModuleCoverageSummary(frameworkModule);

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
      frameworkModule,
      frameworkCoverage,
      userProfile: profile,
      nonFinancial:
        nonFinancial ||
        {
          avgLearningGrowth: 0,
          avgCustomerSatisfaction: 0,
          avgInternalProcesses: 0,
          avgOverallScore: 0,
          totalEmployees: 0,
          departmentAverages: [],
        },
      financial:
        financial ||
        {
          totalRevenue: 0,
          totalProfit: 0,
          averageProfitMargin: 0,
          totalEmployees: 0,
          revenueByDepartment: [],
          revenueByPartner: [],
        },
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

    const roleNames = resolveRequestAccessRoles(req);
    const isAdmin = roleNames.includes("super_admin");
    if (!isAdmin) {
      return res.status(403).json({
        error: 'Only admins can access company-wide analytics',
      });
    }

    const context = await buildAnalyticsContext(req);
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
