import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { requireModuleAccess } from '../middleware/requireModuleAccess';
import { hasModuleAccess } from '../services/moduleAccess.service';
import prisma from '../prisma';

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

/**
 * Financial Summary Routes
 *
 * Access model:
 * - `finance.read`: read personal/role-level financial records.
 * - `finance.approve` (or admin): organization-wide scope (cross-profile reads + aggregate endpoints).
 */

// GET /financial-summary/employee/:id - Employee's financial contribution
router.get('/employee/:id', authMiddleware, canReadFinance, async (req: AuthRequest, res) => {
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

    const contribution = await prisma.$queryRaw`
      SELECT * FROM employee_financial_contribution
      WHERE employee_id = ${requestedProfileId}
    `;

    if (!contribution || (contribution as any[]).length === 0) {
      return res.status(404).json({ error: 'Employee financial data not found' });
    }

    res.json((contribution as any[])[0]);
  } catch (error: any) {
    console.error('Error fetching employee financial contribution:', error);
    res.status(500).json({ error: 'Failed to fetch employee financial data' });
  }
});

// GET /financial-summary/manager/:id - Manager's department financial data
router.get('/manager/:id', authMiddleware, canReadFinance, async (req: AuthRequest, res) => {
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

    const contribution = await prisma.$queryRaw`
      SELECT * FROM manager_financial_contribution
      WHERE manager_id = ${requestedProfileId}
    `;

    if (!contribution || (contribution as any[]).length === 0) {
      return res.status(404).json({ error: 'Manager financial data not found' });
    }

    res.json((contribution as any[])[0]);
  } catch (error: any) {
    console.error('Error fetching manager financial contribution:', error);
    res.status(500).json({ error: 'Failed to fetch manager financial data' });
  }
});

// GET /financial-summary/partner/:id - Partner's portfolio financial data
router.get('/partner/:id', authMiddleware, canReadFinance, async (req: AuthRequest, res) => {
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

    const contribution = await prisma.$queryRaw`
      SELECT * FROM partner_financial_contribution
      WHERE partner_id = ${requestedProfileId}
    `;

    if (!contribution || (contribution as any[]).length === 0) {
      return res.status(404).json({ error: 'Partner financial data not found' });
    }

    res.json((contribution as any[])[0]);
  } catch (error: any) {
    console.error('Error fetching partner financial contribution:', error);
    res.status(500).json({ error: 'Failed to fetch partner financial data' });
  }
});

// GET /financial-summary/company - Company-wide financial summary
router.get('/company', authMiddleware, canApproveFinance, async (_req: AuthRequest, res) => {
  try {
    const summary = await prisma.$queryRaw`
      SELECT * FROM company_financial_summary
    `;

    res.json((summary as any[])[0] || {
      company_total_revenue: 0,
      company_total_cost: 0,
      company_total_profit: 0,
      company_total_collected: 0,
      company_avg_margin: 0,
      active_partners: 0,
      total_jobs: 0,
      company_collection_rate: 0,
    });
  } catch (error: any) {
    console.error('Error fetching company financial summary:', error);
    res.status(500).json({ error: 'Failed to fetch company financial summary' });
  }
});

// GET /financial-summary/partners - All partners' financial contributions
router.get('/partners', authMiddleware, canApproveFinance, async (_req: AuthRequest, res) => {
  try {
    const partners = await prisma.$queryRaw`
      SELECT * FROM partner_financial_contribution
      ORDER BY total_portfolio_revenue DESC
    `;

    res.json(partners);
  } catch (error: any) {
    console.error('Error fetching partners financial data:', error);
    res.status(500).json({ error: 'Failed to fetch partners financial data' });
  }
});

// GET /financial-summary/departments - Department roll-up financial data
router.get('/departments', authMiddleware, canApproveFinance, async (_req: AuthRequest, res) => {
  try {
    const departments = await prisma.$queryRaw`
      SELECT
        department_id,
        department_name,
        SUM(team_size) as total_employees,
        SUM(department_total_hours) as total_hours,
        SUM(department_billable_hours) as billable_hours,
        SUM(department_revenue) as revenue,
        SUM(department_cost) as cost,
        SUM(department_jobs) as jobs_count,
        AVG(department_utilization_rate) as avg_utilization_rate
      FROM manager_financial_contribution
      GROUP BY department_id, department_name
      ORDER BY revenue DESC
    `;

    res.json(departments);
  } catch (error: any) {
    console.error('Error fetching departments financial data:', error);
    res.status(500).json({ error: 'Failed to fetch departments financial data' });
  }
});

// GET /financial-summary/my-data - Current user's financial view
router.get('/my-data', authMiddleware, canReadFinance, async (req: AuthRequest, res) => {
  try {
    const profileId = req.user?.profileId ? Number(req.user.profileId) : null;
    if (!profileId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const roleSet = new Set((req.userRoles || req.user?.authRoles || []).map((role) => role.toLowerCase()));

    const profile = await prisma.profile.findUnique({
      where: { id: profileId },
      select: { positionTitle: true, departmentId: true },
    });

    if (!profile) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    const positionTitle = profile.positionTitle?.toLowerCase() || '';
    const isGmp =
      positionTitle.includes('group managing partner') ||
      roleSet.has('group_managing_partner') ||
      roleSet.has('gmp');
    const isPartner = positionTitle.includes('partner') || roleSet.has('partner');
    const isManager = positionTitle.includes('manager') || roleSet.has('manager');

    let financialData: any = {};

    if (isGmp) {
      const [personalData, companyData] = await Promise.all([
        prisma.$queryRaw`SELECT * FROM partner_financial_contribution WHERE partner_id = ${profileId}`,
        prisma.$queryRaw`SELECT * FROM company_financial_summary`,
      ]);

      financialData = {
        user_type: 'group_managing_partner',
        personal_portfolio: (personalData as any[])[0] || null,
        company_summary: (companyData as any[])[0] || null,
      };
    } else if (isPartner) {
      const data = await prisma.$queryRaw`
        SELECT * FROM partner_financial_contribution WHERE partner_id = ${profileId}
      `;

      financialData = {
        user_type: 'partner',
        portfolio: (data as any[])[0] || null,
      };
    } else if (isManager) {
      const data = await prisma.$queryRaw`
        SELECT * FROM manager_financial_contribution WHERE manager_id = ${profileId}
      `;

      financialData = {
        user_type: 'manager',
        department: (data as any[])[0] || null,
      };
    } else {
      const data = await prisma.$queryRaw`
        SELECT * FROM employee_financial_contribution WHERE employee_id = ${profileId}
      `;

      financialData = {
        user_type: 'employee',
        personal: (data as any[])[0] || null,
      };
    }

    res.json(financialData);
  } catch (error: any) {
    console.error('Error fetching user financial data:', error);
    res.status(500).json({ error: 'Failed to fetch financial data' });
  }
});

export default router;
