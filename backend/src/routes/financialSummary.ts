import { Router } from 'express';
import { AuthRequest } from '../middleware/auth';
import { requireModuleAccess } from '../middleware/requireModuleAccess';
import { hasModuleAccess } from '../services/moduleAccess.service';
import prisma from '../prisma';
import { logger, toLogContext } from '../lib/logger';
import JobPerformanceFactsService, {
  JobPerformanceFact,
} from '../services/jobPerformanceFacts.service';

const router = Router();

const canReadFinance = requireModuleAccess('finance', 'read');
const canApproveFinance = requireModuleAccess('finance', 'approve');

const hasElevatedFinanceScope = (req: AuthRequest) =>
  hasModuleAccess({
    moduleKey: 'finance',
    action: 'approve',
    rolePolicies: req.userRolePolicies,
    roles: req.userRoles,
    permissionKeys: req.userPermissions,
  });

const parseProfileIdParam = (value: string) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const sumFacts = (facts: JobPerformanceFact[]) =>
  facts.reduce(
    (acc, fact) => {
      acc.totalHours += fact.totalHours;
      acc.billableHours += fact.billableHours;
      acc.nonBillableHours += fact.nonBillableHours;
      acc.billableValue += fact.billableValue;
      acc.billedRevenue += fact.billedRevenue;
      acc.collectedRevenue += fact.collectedRevenue;
      acc.actualCost += fact.actualCost;
      acc.cashProfit += fact.cashProfit;
      return acc;
    },
    {
      totalHours: 0,
      billableHours: 0,
      nonBillableHours: 0,
      billableValue: 0,
      billedRevenue: 0,
      collectedRevenue: 0,
      actualCost: 0,
      cashProfit: 0,
    }
  );

const buildSummary = (facts: JobPerformanceFact[]) => {
  const totals = sumFacts(facts);
  const revenueBase = totals.billedRevenue > 0 ? totals.billedRevenue : totals.billableValue;
  return {
    total_revenue: totals.collectedRevenue,
    billable_value: totals.billableValue,
    billed_revenue: totals.billedRevenue,
    collected_revenue: totals.collectedRevenue,
    total_collected: totals.collectedRevenue,
    total_cost: totals.actualCost,
    total_profit: totals.cashProfit,
    total_hours: totals.totalHours,
    billable_hours: totals.billableHours,
    non_billable_hours: totals.nonBillableHours,
    avg_margin:
      totals.collectedRevenue > 0 ? (totals.cashProfit / totals.collectedRevenue) * 100 : 0,
    collection_rate: revenueBase > 0 ? (totals.collectedRevenue / revenueBase) * 100 : 0,
  };
};

/**
 * Financial Summary Routes
 *
 * Access model:
 * - `finance.read`: read personal/role-level financial records.
 * - `finance.approve` (or admin): organization-wide scope (cross-profile reads + aggregate endpoints).
 */

// GET /financial-summary/employee/:id
router.get('/employee/:id', canReadFinance, async (req: AuthRequest, res) => {
  try {
    const requestedProfileId = parseProfileIdParam(req.params.id);
    if (!requestedProfileId) {
      return res.status(400).json({ error: 'Invalid employee profile id' });
    }

    const ownProfileId = req.user?.profileId ? Number(req.user.profileId) : null;
    if (!ownProfileId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    if (!hasElevatedFinanceScope(req) && ownProfileId !== requestedProfileId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const facts = await JobPerformanceFactsService.listFacts(
      { employeeProfileId: requestedProfileId },
      { type: 'employee', profileId: requestedProfileId }
    );

    if (facts.length === 0) {
      return res.status(404).json({ error: 'Employee financial data not found' });
    }

    const canSeeFinancials = hasElevatedFinanceScope(req);
    const summary = buildSummary(facts);
    res.json({
      employee_id: requestedProfileId,
      total_hours: summary.total_hours,
      billable_hours: summary.billable_hours,
      non_billable_hours: summary.non_billable_hours,
      utilization_rate:
        summary.total_hours > 0 ? (summary.billable_hours / summary.total_hours) * 100 : 0,
      billable_value: canSeeFinancials ? summary.billable_value : 0,
      billed_revenue: canSeeFinancials ? summary.billed_revenue : 0,
      collected_revenue: canSeeFinancials ? summary.collected_revenue : 0,
      total_cost: canSeeFinancials ? summary.total_cost : 0,
      total_profit: canSeeFinancials ? summary.total_profit : 0,
      financials_visible: canSeeFinancials,
      job_count: facts.length,
    });
  } catch (error: any) {
    logger.error('finance_summary_employee_error', toLogContext(error));
    res.status(500).json({ error: 'Failed to fetch employee financial data' });
  }
});

// GET /financial-summary/manager/:id
router.get('/manager/:id', canReadFinance, async (req: AuthRequest, res) => {
  try {
    const requestedProfileId = parseProfileIdParam(req.params.id);
    if (!requestedProfileId) {
      return res.status(400).json({ error: 'Invalid manager profile id' });
    }

    const ownProfileId = req.user?.profileId ? Number(req.user.profileId) : null;
    if (!ownProfileId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    if (!hasElevatedFinanceScope(req) && ownProfileId !== requestedProfileId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const facts = await JobPerformanceFactsService.listFacts(
      {},
      { type: 'manager', profileId: requestedProfileId }
    );

    if (facts.length === 0) {
      return res.status(404).json({ error: 'Manager financial data not found' });
    }

    const profile = await prisma.profile.findUnique({
      where: { id: requestedProfileId },
      select: { department: { select: { id: true, name: true } } },
    });
    const summary = buildSummary(facts);
    res.json({
      manager_id: requestedProfileId,
      department_id: profile?.department?.id ?? null,
      department_name: profile?.department?.name ?? null,
      department_total_hours: summary.total_hours,
      department_billable_hours: summary.billable_hours,
      department_non_billable_hours: summary.non_billable_hours,
      department_revenue: summary.collected_revenue,
      billable_value: summary.billable_value,
      billed_revenue: summary.billed_revenue,
      collected_revenue: summary.collected_revenue,
      department_cost: summary.total_cost,
      department_profit: summary.total_profit,
      department_jobs: facts.length,
      department_utilization_rate:
        summary.total_hours > 0 ? (summary.billable_hours / summary.total_hours) * 100 : 0,
      collection_rate: summary.collection_rate,
      avg_margin: summary.avg_margin,
    });
  } catch (error: any) {
    logger.error('finance_summary_manager_error', toLogContext(error));
    res.status(500).json({ error: 'Failed to fetch manager financial data' });
  }
});

// GET /financial-summary/partner/:id
router.get('/partner/:id', canReadFinance, async (req: AuthRequest, res) => {
  try {
    const requestedProfileId = parseProfileIdParam(req.params.id);
    if (!requestedProfileId) {
      return res.status(400).json({ error: 'Invalid partner profile id' });
    }

    const ownProfileId = req.user?.profileId ? Number(req.user.profileId) : null;
    if (!ownProfileId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    if (!hasElevatedFinanceScope(req) && ownProfileId !== requestedProfileId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const facts = await JobPerformanceFactsService.listFacts(
      {},
      { type: 'partner', profileId: requestedProfileId }
    );

    if (facts.length === 0) {
      return res.status(404).json({ error: 'Partner financial data not found' });
    }

    const summary = buildSummary(facts);
    res.json({
      partner_id: requestedProfileId,
      total_portfolio_revenue: summary.collected_revenue,
      billable_value: summary.billable_value,
      billed_revenue: summary.billed_revenue,
      collected_revenue: summary.collected_revenue,
      total_portfolio_cost: summary.total_cost,
      total_portfolio_profit: summary.total_profit,
      total_portfolio_hours: summary.total_hours,
      billable_hours: summary.billable_hours,
      non_billable_hours: summary.non_billable_hours,
      total_jobs: facts.length,
      collection_rate: summary.collection_rate,
      avg_margin: summary.avg_margin,
    });
  } catch (error: any) {
    logger.error('finance_summary_partner_error', toLogContext(error));
    res.status(500).json({ error: 'Failed to fetch partner financial data' });
  }
});

// GET /financial-summary/company
router.get('/company', canApproveFinance, async (_req: AuthRequest, res) => {
  try {
    const [facts, activePartners] = await Promise.all([
      JobPerformanceFactsService.listFacts({}, { type: 'firm' }),
      prisma.profile.count({ where: { isPartner: true, status: 'active' } }),
    ]);
    const summary = buildSummary(facts);

    res.json({
      company_total_revenue: summary.collected_revenue,
      company_billable_value: summary.billable_value,
      company_billed_revenue: summary.billed_revenue,
      company_total_cost: summary.total_cost,
      company_total_profit: summary.total_profit,
      company_total_collected: summary.collected_revenue,
      company_avg_margin: summary.avg_margin,
      active_partners: activePartners,
      total_jobs: facts.length,
      company_collection_rate: summary.collection_rate,
    });
  } catch (error: any) {
    logger.error('finance_summary_company_error', toLogContext(error));
    res.status(500).json({ error: 'Failed to fetch company financial summary' });
  }
});

// GET /financial-summary/partners
router.get('/partners', canApproveFinance, async (_req: AuthRequest, res) => {
  try {
    const [facts, profiles] = await Promise.all([
      JobPerformanceFactsService.listFacts({}, { type: 'firm' }),
      prisma.profile.findMany({
        where: { isPartner: true },
        select: { id: true, firstName: true, lastName: true },
      }),
    ]);
    const factsByPartner = new Map<number, JobPerformanceFact[]>();
    facts.forEach((fact) => {
      if (!fact.partnerProfileId) return;
      const current = factsByPartner.get(fact.partnerProfileId) || [];
      current.push(fact);
      factsByPartner.set(fact.partnerProfileId, current);
    });
    const partners = profiles
      .map((profile) => {
        const profileFacts = factsByPartner.get(profile.id) || [];
        const summary = buildSummary(profileFacts);
        return {
          partner_id: profile.id,
          partner_name: `${profile.firstName || ''} ${profile.lastName || ''}`.trim(),
          total_portfolio_revenue: summary.collected_revenue,
          billable_value: summary.billable_value,
          billed_revenue: summary.billed_revenue,
          collected_revenue: summary.collected_revenue,
          total_portfolio_cost: summary.total_cost,
          total_portfolio_profit: summary.total_profit,
          total_jobs: profileFacts.length,
          collection_rate: summary.collection_rate,
          avg_margin: summary.avg_margin,
        };
      })
      .sort((left, right) => right.total_portfolio_revenue - left.total_portfolio_revenue);

    res.json(partners);
  } catch (error: any) {
    logger.error('finance_summary_partners_error', toLogContext(error));
    res.status(500).json({ error: 'Failed to fetch partners financial data' });
  }
});

// GET /financial-summary/departments
router.get('/departments', canApproveFinance, async (_req: AuthRequest, res) => {
  try {
    const [facts, departments] = await Promise.all([
      JobPerformanceFactsService.listFacts({}, { type: 'firm' }),
      prisma.department.findMany({
        select: { id: true, name: true, _count: { select: { profiles: true } } },
      }),
    ]);
    const factsByDepartment = new Map<number, JobPerformanceFact[]>();
    facts.forEach((fact) => {
      if (!fact.departmentId) return;
      const current = factsByDepartment.get(fact.departmentId) || [];
      current.push(fact);
      factsByDepartment.set(fact.departmentId, current);
    });
    const rows = departments
      .map((department) => {
        const departmentFacts = factsByDepartment.get(department.id) || [];
        const summary = buildSummary(departmentFacts);
        return {
          department_id: department.id,
          department_name: department.name,
          total_employees: department._count.profiles,
          total_hours: summary.total_hours,
          billable_hours: summary.billable_hours,
          non_billable_hours: summary.non_billable_hours,
          revenue: summary.collected_revenue,
          billable_value: summary.billable_value,
          billed_revenue: summary.billed_revenue,
          collected_revenue: summary.collected_revenue,
          cost: summary.total_cost,
          profit: summary.total_profit,
          jobs_count: departmentFacts.length,
          avg_utilization_rate:
            summary.total_hours > 0 ? (summary.billable_hours / summary.total_hours) * 100 : 0,
          collection_rate: summary.collection_rate,
        };
      })
      .sort((left, right) => right.revenue - left.revenue);

    res.json(rows);
  } catch (error: any) {
    logger.error('finance_summary_departments_error', toLogContext(error));
    res.status(500).json({ error: 'Failed to fetch departments financial data' });
  }
});

// GET /financial-summary/my-data
router.get('/my-data', canReadFinance, async (req: AuthRequest, res) => {
  try {
    const profileId = req.user?.profileId ? Number(req.user.profileId) : null;
    if (!profileId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const roleSet = new Set((req.userRoles || []).map((role) => role.toLowerCase()));

    const profile = await prisma.profile.findUnique({
      where: { id: profileId },
      select: { departmentId: true },
    });

    if (!profile) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    const isGmp = roleSet.has('super_admin') || roleSet.has('gmp');
    const isPartner = roleSet.has('partner');
    const isManager = roleSet.has('manager');

    let financialData: any = {};

    if (isGmp) {
      const [personalFacts, companyFacts] = await Promise.all([
        JobPerformanceFactsService.listFacts({}, { type: 'partner', profileId }),
        JobPerformanceFactsService.listFacts({}, { type: 'firm' }),
      ]);

      financialData = {
        userType: 'groupManagingPartner',
        personalPortfolio: {
          partner_id: profileId,
          ...buildSummary(personalFacts),
          total_jobs: personalFacts.length,
        },
        companySummary: {
          ...buildSummary(companyFacts),
          total_jobs: companyFacts.length,
        },
      };
    } else if (isPartner) {
      const facts = await JobPerformanceFactsService.listFacts({}, { type: 'partner', profileId });

      financialData = {
        userType: 'partner',
        portfolio: {
          partner_id: profileId,
          ...buildSummary(facts),
          total_jobs: facts.length,
        },
      };
    } else if (isManager) {
      const facts = await JobPerformanceFactsService.listFacts({}, { type: 'manager', profileId });

      financialData = {
        userType: 'manager',
        department: {
          manager_id: profileId,
          department_id: profile.departmentId,
          ...buildSummary(facts),
          total_jobs: facts.length,
        },
      };
    } else {
      const facts = await JobPerformanceFactsService.listFacts(
        { employeeProfileId: profileId },
        { type: 'employee', profileId }
      );
      const summary = buildSummary(facts);

      financialData = {
        userType: 'employee',
        personal: {
          employee_id: profileId,
          total_hours: summary.total_hours,
          billable_hours: summary.billable_hours,
          non_billable_hours: summary.non_billable_hours,
          utilization_rate:
            summary.total_hours > 0 ? (summary.billable_hours / summary.total_hours) * 100 : 0,
          financials_visible: false,
          total_jobs: facts.length,
        },
      };
    }

    res.json(financialData);
  } catch (error: any) {
    logger.error('finance_summary_my_data_error', toLogContext(error));
    res.status(500).json({ error: 'Failed to fetch financial data' });
  }
});

export default router;
