"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../prisma"));
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// GET /manager-dashboard/team
// Get manager's direct reports and team overview
router.get('/team', auth_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user?.sub ? Number(req.user.sub) : undefined;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        // Check if user is a manager by looking at user roles
        const userRoles = req.user?.authRoles || [];
        const isManager = userRoles.includes('manager');
        if (!isManager) {
            return res.status(403).json({ error: 'Access denied. Manager role required.' });
        }
        // Get the user's profile ID
        const userProfile = await prisma_1.default.user.findUnique({
            where: { id: userId },
            include: { profile: true }
        });
        if (!userProfile?.profile) {
            return res.status(404).json({ error: 'User profile not found' });
        }
        // Get team members using the SQL function
        const teamMembers = await prisma_1.default.$queryRaw `
      SELECT * FROM get_manager_team(${userProfile.profile.id})
    `;
        // Get team financials
        const teamFinancials = await prisma_1.default.$queryRaw `
      SELECT * FROM manager_team_financials WHERE manager_id = ${userProfile.profile.id}
    `;
        // Get team performance summary
        const teamPerformance = await prisma_1.default.$queryRaw `
      SELECT * FROM get_team_performance_summary(${userProfile.profile.id})
    `;
        return res.json({
            teamMembers,
            financials: Array.isArray(teamFinancials) && teamFinancials.length > 0 ? teamFinancials[0] : {
                active_team_members: 0,
                total_team_hours: 0,
                billable_hours: 0,
                total_revenue: 0,
                total_cost: 0
            },
            performance: teamPerformance
        });
    }
    catch (error) {
        console.error('Error fetching team data:', error);
        return res.status(500).json({ error: error.message });
    }
});
// GET /manager-dashboard/jobs
// Get manager's job portfolio
router.get('/jobs', auth_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user?.sub ? Number(req.user.sub) : undefined;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const userRoles = req.user?.authRoles || [];
        const isManager = userRoles.includes('manager');
        if (!isManager) {
            return res.status(403).json({ error: 'Access denied. Manager role required.' });
        }
        // Get the user's profile ID
        const userProfile = await prisma_1.default.user.findUnique({
            where: { id: userId },
            include: { profile: true }
        });
        if (!userProfile?.profile) {
            return res.status(404).json({ error: 'User profile not found' });
        }
        // Get manager's job portfolio
        const jobPortfolio = await prisma_1.default.$queryRaw `
      SELECT * FROM manager_job_portfolio WHERE manager_id = ${userProfile.profile.id}
      ORDER BY title
    `;
        // Get team job assignments
        const teamJobs = await prisma_1.default.$queryRaw `
      SELECT * FROM get_manager_team_jobs(${userProfile.profile.id})
    `;
        return res.json({
            portfolio: jobPortfolio,
            teamJobs: teamJobs
        });
    }
    catch (error) {
        console.error('Error fetching job data:', error);
        return res.status(500).json({ error: error.message });
    }
});
// GET /manager-dashboard/financials
// Get manager's financial summary
router.get('/financials', auth_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user?.sub ? Number(req.user.sub) : undefined;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const userRoles = req.user?.authRoles || [];
        const isManager = userRoles.includes('manager');
        if (!isManager) {
            return res.status(403).json({ error: 'Access denied. Manager role required.' });
        }
        // Get the user's profile ID
        const userProfile = await prisma_1.default.user.findUnique({
            where: { id: userId },
            include: { profile: true }
        });
        if (!userProfile?.profile) {
            return res.status(404).json({ error: 'User profile not found' });
        }
        const profileId = userProfile.profile.id;
        // Get team financial summary for last 12 months
        const monthlyFinancials = await prisma_1.default.$queryRaw `
      SELECT 
        DATE_TRUNC('month', te.date_worked) AS month,
        COALESCE(SUM(te.billable_amount), 0) AS revenue,
        COALESCE(SUM(te.cost), 0) AS cost,
        COALESCE(SUM(te.hours), 0) AS total_hours,
        COALESCE(SUM(CASE WHEN te.billable THEN te.hours ELSE 0 END), 0) AS billable_hours
      FROM time_entries te
      JOIN profiles p ON te.employee_id = p.id
      WHERE p.manager_id = ${profileId}
        AND te.status = 'approved'
        AND te.date_worked >= CURRENT_DATE - INTERVAL '12 months'
      GROUP BY DATE_TRUNC('month', te.date_worked)
      ORDER BY month DESC
    `;
        // Get job profitability for manager's jobs
        const jobProfitability = await prisma_1.default.$queryRaw `
      SELECT 
        j.job_name,
        j.job_code,
        c.client_name,
        COALESCE(SUM(te.billable_amount), 0) AS revenue,
        COALESCE(SUM(te.cost), 0) AS cost,
        COALESCE(SUM(te.billable_amount), 0) - COALESCE(SUM(te.cost), 0) AS profit
      FROM jobs j
      LEFT JOIN time_entries te ON j.id = te.job_id AND te.status = 'approved'
      LEFT JOIN clients c ON j.client_id = c.id
      WHERE j.manager_id = ${profileId}
      GROUP BY j.id, j.job_name, j.job_code, c.client_name
      HAVING COALESCE(SUM(te.billable_amount), 0) > 0
      ORDER BY profit DESC
    `;
        // Get team member contributions
        const teamContributions = await prisma_1.default.$queryRaw `
      SELECT 
        p.first_name || ' ' || p.last_name AS employee_name,
        r.name AS role_name,
        COALESCE(SUM(te.billable_amount), 0) AS revenue_contribution,
        COALESCE(SUM(te.hours), 0) AS total_hours,
        COALESCE(SUM(CASE WHEN te.billable THEN te.hours ELSE 0 END), 0) AS billable_hours
      FROM profiles p
      LEFT JOIN roles r ON p.role_id = r.id
      LEFT JOIN time_entries te ON p.id = te.employee_id 
        AND te.status = 'approved'
        AND te.date_worked >= date_trunc('month', CURRENT_DATE)
      WHERE p.manager_id = ${profileId}
        AND p.status = 'active'
      GROUP BY p.id, p.first_name, p.last_name, r.name
      ORDER BY revenue_contribution DESC
    `;
        return res.json({
            monthlyFinancials,
            jobProfitability,
            teamContributions
        });
    }
    catch (error) {
        console.error('Error fetching financial data:', error);
        return res.status(500).json({ error: error.message });
    }
});
// GET /manager-dashboard/evaluations
// Get pending evaluations and team performance data
router.get('/evaluations', auth_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user?.sub ? Number(req.user.sub) : undefined;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const userRoles = req.user?.authRoles || [];
        const isManager = userRoles.includes('manager');
        if (!isManager) {
            return res.status(403).json({ error: 'Access denied. Manager role required.' });
        }
        // Get the user's profile ID
        const userProfile = await prisma_1.default.user.findUnique({
            where: { id: userId },
            include: { profile: true }
        });
        if (!userProfile?.profile) {
            return res.status(404).json({ error: 'User profile not found' });
        }
        const profileId = userProfile.profile.id;
        // Get pending performance reviews for team members
        const pendingReviews = await prisma_1.default.performanceReview.findMany({
            where: {
                employee: {
                    manager_id: profileId
                },
                status: 'draft'
            },
            include: {
                employee: {
                    select: {
                        id: true,
                        first_name: true,
                        last_name: true,
                        position: true
                    }
                }
            },
            orderBy: {
                createdAt: 'asc'
            }
        });
        // Get team goals progress
        const teamGoals = await prisma_1.default.employeeGoal.findMany({
            where: {
                employee: {
                    manager_id: profileId
                },
                target_date: {
                    gte: new Date()
                }
            },
            include: {
                employee: {
                    select: {
                        first_name: true,
                        last_name: true
                    }
                },
                kpi: {
                    select: {
                        name: true,
                        category: true
                    }
                }
            },
            orderBy: [
                { target_date: 'asc' },
                { employee: { last_name: 'asc' } }
            ]
        });
        // Get recent performance scores
        const recentPerformance = await prisma_1.default.performanceReview.findMany({
            where: {
                employee: {
                    manager_id: profileId
                },
                status: 'submitted',
                review_period_end: {
                    gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) // Last 90 days
                }
            },
            include: {
                employee: {
                    select: {
                        first_name: true,
                        last_name: true,
                        position: true
                    }
                }
            },
            orderBy: {
                review_period_end: 'desc'
            }
        });
        return res.json({
            pendingReviews,
            teamGoals,
            recentPerformance
        });
    }
    catch (error) {
        console.error('Error fetching evaluation data:', error);
        return res.status(500).json({ error: error.message });
    }
});
// GET /manager-dashboard/overview
// Get high-level dashboard overview metrics
router.get('/overview', auth_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user?.sub ? Number(req.user.sub) : undefined;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const userRoles = req.user?.authRoles || [];
        const isManager = userRoles.includes('manager');
        if (!isManager) {
            return res.status(403).json({ error: 'Access denied. Manager role required.' });
        }
        // Get the user's profile ID
        const userProfile = await prisma_1.default.user.findUnique({
            where: { id: userId },
            include: { profile: true }
        });
        if (!userProfile?.profile) {
            return res.status(404).json({ error: 'User profile not found' });
        }
        const profileId = userProfile.profile.id;
        // Get team size
        const teamSize = await prisma_1.default.profile.count({
            where: {
                manager_id: profileId,
                status: 'active'
            }
        });
        // Get active jobs count
        const activeJobs = await prisma_1.default.job.count({
            where: {
                manager_id: profileId,
                status: 'active'
            }
        });
        // Get this month's metrics
        const thisMonth = new Date();
        thisMonth.setDate(1);
        thisMonth.setHours(0, 0, 0, 0);
        const monthlyMetrics = await prisma_1.default.$queryRaw `
      SELECT 
        COALESCE(SUM(te.billable_amount), 0) AS revenue,
        COALESCE(SUM(te.cost), 0) AS cost,
        COALESCE(SUM(te.hours), 0) AS total_hours,
        COALESCE(SUM(CASE WHEN te.billable THEN te.hours ELSE 0 END), 0) AS billable_hours
      FROM time_entries te
      JOIN profiles p ON te.employee_id = p.id
      WHERE p.manager_id = ${profileId}
        AND te.status = 'approved'
        AND te.date_worked >= ${thisMonth}
    `;
        const metrics = Array.isArray(monthlyMetrics) && monthlyMetrics.length > 0 ? monthlyMetrics[0] : {
            revenue: 0,
            cost: 0,
            total_hours: 0,
            billable_hours: 0
        };
        // Calculate utilization rate
        const utilizationRate = metrics.total_hours > 0
            ? Math.round((metrics.billable_hours / metrics.total_hours) * 100)
            : 0;
        // Get pending items count
        const pendingReviews = await prisma_1.default.performanceReview.count({
            where: {
                employee: {
                    manager_id: profileId
                },
                status: 'draft'
            }
        });
        return res.json({
            teamSize,
            activeJobs,
            monthlyRevenue: metrics.revenue,
            monthlyProfit: metrics.revenue - metrics.cost,
            utilizationRate,
            pendingReviews
        });
    }
    catch (error) {
        console.error('Error fetching overview data:', error);
        return res.status(500).json({ error: error.message });
    }
});
exports.default = router;
