import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import prisma from '../prisma';

const router = Router();

/**
 * Financial Summary Routes
 * 
 * Provides role-based financial data visibility:
 * - Employees: Their own financial contribution
 * - Managers: Department-level financial data
 * - Partners: Portfolio financial data
 * - GMPs: Company-wide financial overview
 * - HR/Admin: All financial data
 */

// GET /financial-summary/employee/:id - Employee's financial contribution
router.get('/employee/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const profileId = req.user?.profileId ? Number(req.user.profileId) : undefined;
    const userRoles = req.user?.authRoles || [];
    
    // Access control: employees can only see their own data
    if (!userRoles.includes('super_admin') && 
        !userRoles.includes('hr_manager') && 
        !userRoles.includes('partner') && 
        !userRoles.includes('group_managing_partner') &&
        profileId !== parseInt(id)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Use the employee_financial_contribution view
    const contribution = await prisma.$queryRaw`
      SELECT * FROM employee_financial_contribution 
      WHERE employee_id = ${parseInt(id)}
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
router.get('/manager/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const profileId = req.user?.profileId ? Number(req.user.profileId) : undefined;
    const userRoles = req.user?.authRoles || [];
    
    // Access control: managers can only see their own department data
    if (!userRoles.includes('super_admin') && 
        !userRoles.includes('hr_manager') && 
        !userRoles.includes('partner') && 
        !userRoles.includes('group_managing_partner') &&
        profileId !== parseInt(id)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Use the manager_financial_contribution view
    const contribution = await prisma.$queryRaw`
      SELECT * FROM manager_financial_contribution 
      WHERE manager_id = ${parseInt(id)}
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
router.get('/partner/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const profileId = req.user?.profileId ? Number(req.user.profileId) : undefined;
    const userRoles = req.user?.authRoles || [];
    
    // Access control: partners can only see their own portfolio
    if (!userRoles.includes('super_admin') && 
        !userRoles.includes('hr_manager') && 
        !userRoles.includes('group_managing_partner') &&
        profileId !== parseInt(id)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Use the partner_financial_contribution view
    const contribution = await prisma.$queryRaw`
      SELECT * FROM partner_financial_contribution 
      WHERE partner_id = ${parseInt(id)}
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

// GET /financial-summary/company - Company-wide financial summary (GMP/HR only)
router.get('/company', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userRoles = req.user?.authRoles || [];
    
    // Access control: only GMP, HR, and Super Admin
    if (!userRoles.includes('super_admin') && 
        !userRoles.includes('hr_manager') && 
        !userRoles.includes('group_managing_partner')) {
      return res.status(403).json({ error: 'Access denied. Company-wide data is restricted to GMP and HR only.' });
    }

    // Use the company_financial_summary view
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
      company_collection_rate: 0
    });
  } catch (error: any) {
    console.error('Error fetching company financial summary:', error);
    res.status(500).json({ error: 'Failed to fetch company financial summary' });
  }
});

// GET /financial-summary/partners - All partners' financial contributions (GMP/HR only)
router.get('/partners', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userRoles = req.user?.authRoles || [];
    
    // Access control: only GMP, HR, and Super Admin
    if (!userRoles.includes('super_admin') && 
        !userRoles.includes('hr_manager') && 
        !userRoles.includes('group_managing_partner')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Use the partner_financial_contribution view
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

// GET /financial-summary/departments - All departments' financial data (HR only)
router.get('/departments', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userRoles = req.user?.authRoles || [];
    
    // Access control: only HR and Super Admin
    if (!userRoles.includes('super_admin') && 
        !userRoles.includes('hr_manager')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Use the manager_financial_contribution view grouped by department
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

// GET /financial-summary/my-data - Get current user's financial data
router.get('/my-data', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const profileId = req.user?.profileId ? Number(req.user.profileId) : undefined;
    const userRoles = req.user?.authRoles || [];

    if (!profileId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Get user profile to determine position level
    const profile = await prisma.profile.findUnique({
      where: { id: profileId },
      select: { positionTitle: true, departmentId: true }
    });

    if (!profile) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    let financialData: any = {};

    // Route to appropriate financial view based on position level
    const positionTitle = profile.positionTitle?.toLowerCase() || '';

    if (positionTitle.includes('group managing partner') || 
        userRoles.includes('group_managing_partner') || userRoles.includes('gmp')) {
      // GMP gets both personal portfolio and company summary
      const [personalData, companyData] = await Promise.all([
        prisma.$queryRaw`SELECT * FROM partner_financial_contribution WHERE partner_id = ${profileId}`,
        prisma.$queryRaw`SELECT * FROM company_financial_summary`
      ]);

      financialData = {
        user_type: 'group_managing_partner',
        personal_portfolio: (personalData as any[])[0] || null,
        company_summary: (companyData as any[])[0] || null
      };
    } else if (positionTitle.includes('partner') || userRoles.includes('partner')) {
      // Partner gets their portfolio
      const data = await prisma.$queryRaw`
        SELECT * FROM partner_financial_contribution WHERE partner_id = ${profileId}
      `;
      financialData = {
        user_type: 'partner',
        portfolio: (data as any[])[0] || null
      };
    } else if (positionTitle.includes('manager') || userRoles.includes('manager')) {
      // Manager gets department data
      const data = await prisma.$queryRaw`
        SELECT * FROM manager_financial_contribution WHERE manager_id = ${profileId}
      `;
      financialData = {
        user_type: 'manager',
        department: (data as any[])[0] || null
      };
    } else {
      // Employee gets personal contribution
      const data = await prisma.$queryRaw`
        SELECT * FROM employee_financial_contribution WHERE employee_id = ${profileId}
      `;
      financialData = {
        user_type: 'employee',
        personal: (data as any[])[0] || null
      };
    }

    res.json(financialData);
  } catch (error: any) {
    console.error('Error fetching user financial data:', error);
    res.status(500).json({ error: 'Failed to fetch financial data' });
  }
});

export default router;
