import { Router } from 'express';
import prisma from '../prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /gmp-dashboard/overview
// Get comprehensive GMP dashboard data including firm metrics, partner rankings, and manager performance
router.get('/overview', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.sub ? Number(req.user.sub) : undefined;
    console.log('[GMP Dashboard] Overview request from userId:', userId);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // Get the user's profile to verify GMP access
    const userProfile = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true }
    });
    console.log('[GMP Dashboard] User profile found:', userProfile?.profile ? 'Yes' : 'No');

    if (!userProfile?.profile) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    // Check if user is Group Managing Partner or has equivalent access
    const profile = userProfile.profile;
    const isGMP = profile.position?.toLowerCase().includes('group_managing_partner') ||
                  profile.position?.toLowerCase().includes('group managing partner') ||
                  profile.position === 'group_managing_partner';

    // Also check user roles for super_admin access
    const userRoles = req.user?.authRoles || [];
    const hasGMPAccess = isGMP || userRoles.includes('super_admin');

    if (!hasGMPAccess) {
      console.log('[GMP Dashboard] Access denied for user:', profile.position, userRoles);
      return res.status(403).json({ 
        error: 'Access denied. Group Managing Partner privileges required.' 
      });
    }

    console.log('[GMP Dashboard] Access granted, fetching analytics for profile ID:', profile.id);
    // Get comprehensive dashboard analytics using the database function
    const dashboardData = await prisma.$queryRaw`
      SELECT * FROM get_gmp_dashboard_analytics(${profile.id}::integer)
    `;

    console.log('[GMP Dashboard] Analytics data fetched successfully, rows:', Array.isArray(dashboardData) ? dashboardData.length : 'Not an array');

    // Transform the result into a more usable format
    const analytics = Array.isArray(dashboardData) ? dashboardData.reduce((acc: any, row: any) => {
      acc[row.metric_type] = row.metric_value;
      return acc;
    }, {}) : {};

    return res.json({
      firmMetrics: analytics.firm_metrics || {},
      partnerRankings: analytics.partner_rankings || [],
      managerRankings: analytics.manager_rankings || [],
      departmentBreakdown: analytics.department_breakdown || []
    });

  } catch (error) {
    console.error('[GMP Dashboard] Error fetching GMP dashboard data:', error);
    console.error('[GMP Dashboard] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return res.status(500).json({ 
      error: 'Failed to load dashboard data',
      details: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : String(error)) : undefined
    });
  }
});

// GET /gmp-dashboard/partner/:partnerId
// Get detailed data for a specific partner (drill-down functionality)
router.get('/partner/:partnerId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.sub ? Number(req.user.sub) : undefined;
    const partnerId = Number(req.params.partnerId);
    
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // Verify GMP access (same check as above)
    const userProfile = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true }
    });

    if (!userProfile?.profile) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    const profile = userProfile.profile;
    const isGMP = profile.position?.toLowerCase().includes('group_managing_partner') ||
                  profile.position?.toLowerCase().includes('group managing partner') ||
                  profile.position === 'group_managing_partner';
    const userRoles = req.user?.authRoles || [];
    const hasGMPAccess = isGMP || userRoles.includes('super_admin');

    if (!hasGMPAccess) {
      return res.status(403).json({ error: 'Access denied. GMP privileges required.' });
    }

    // Get detailed partner information
    const partnerDetail = await prisma.profile.findUnique({
      where: { id: partnerId },
      include: {
        department: true,
        partnerJobs: {
          include: {
            client: true,
            jobStaffAssignments: {
              include: {
                profile: {
                  select: {
                    id: true,
                    first_name: true,
                    last_name: true,
                    position: true
                  }
                }
              }
            }
          },
          where: { status: 'active' }
        },
        // Direct reports
        workLogs: {
          where: {
            createdAt: {
              gte: new Date(new Date().setMonth(new Date().getMonth() - 12)) // Last 12 months
            }
          }
        }
      }
    });

    if (!partnerDetail) {
      return res.status(404).json({ error: 'Partner not found' });
    }

    // Get team members reporting to this partner
    const teamMembers = await prisma.profile.findMany({
      where: { manager_id: partnerId },
      include: {
        department: true,
        workLogs: {
          where: {
            createdAt: {
              gte: new Date(new Date().setMonth(new Date().getMonth() - 3)) // Last 3 months
            }
          }
        },
        employeeEvaluations: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });

    // Calculate partner's financial metrics
    const partnerJobs = partnerDetail.partnerJobs || [];
    const totalRevenue = partnerJobs.reduce((sum, job) => sum + (Number(job.amount_collected) || 0), 0);
    const totalFees = partnerJobs.reduce((sum, job) => sum + (Number(job.fees) || 0), 0);
    const activeJobsCount = partnerJobs.length;

    // Calculate team utilization and performance
    const teamUtilization = teamMembers.map(member => {
      const recentHours = member.workLogs.reduce((sum, log) => sum + (Number(log.hours_worked) || 0), 0);
      const latestEval = member.employeeEvaluations[0];
      return {
        memberId: member.id,
        name: `${member.first_name} ${member.last_name}`,
        position: member.position,
        recentHours,
        performanceScore: latestEval?.manager_overall_rating || null
      };
    });

    return res.json({
      partner: {
        id: partnerDetail.id,
        name: `${partnerDetail.first_name} ${partnerDetail.last_name}`,
        position: partnerDetail.position,
        department: partnerDetail.department?.name,
        email: partnerDetail.email
      },
      financials: {
        totalRevenue,
        totalFees,
        activeJobsCount,
        averageJobValue: activeJobsCount > 0 ? totalRevenue / activeJobsCount : 0
      },
      jobs: partnerJobs.map(job => ({
        id: job.id,
        jobNumber: job.job_code,
        clientName: job.client?.client_name,
        status: job.status,
        amountCollected: job.amount_collected,
        fees: job.fees,
        teamSize: job.jobStaffAssignments.length,
        startDate: job.start_date,
        deadlineDate: job.due_date
      })),
      team: teamUtilization
    });

  } catch (error) {
    console.error('Error fetching partner details:', error);
    return res.status(500).json({ 
      error: 'Failed to load partner details',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /gmp-dashboard/personal
// Get GMP's personal portfolio view (jobs they own, direct reports, personal performance)
router.get('/personal', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.sub ? Number(req.user.sub) : undefined;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const userProfile = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true }
    });

    if (!userProfile?.profile) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    const profile = userProfile.profile;

    // Get GMP's personal jobs (where they are the partner or manager)
    const personalJobs = await prisma.job.findMany({
      where: {
        OR: [
          { partner_id: profile.id },
          { manager_id: profile.id }
        ],
        status: 'active'
      },
      include: {
        client: true,
        jobStaffAssignments: {
          include: {
            employee: {
              select: {
                id: true,
                first_name: true,
                last_name: true,
                position: true
              }
            }
          }
        }
      }
    });

    // Get direct reports
    const directReports = await prisma.profile.findMany({
      where: { manager_id: profile.id },
      include: {
        department: true,
        employeeEvaluations: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });

    // Get GMP's personal performance data
    const personalPerformance = await prisma.employeeEvaluation.findFirst({
      where: { employee_id: profile.id },
      orderBy: { createdAt: 'desc' }
    });

    // Calculate personal financials
    const personalRevenue = personalJobs.reduce((sum, job) => sum + (Number(job.amount_collected) || 0), 0);
    const personalFees = personalJobs.reduce((sum, job) => sum + (Number(job.fees) || 0), 0);

    return res.json({
      personalMetrics: {
        activeJobs: personalJobs.length,
        totalRevenue: personalRevenue,
        totalFees: personalFees,
        directReports: directReports.length,
        overallScore: personalPerformance?.overall_rating || null
      },
      jobs: personalJobs.map(job => ({
        id: job.id,
        jobNumber: job.job_code,
        clientName: job.client?.client_name,
        status: job.status,
        amountCollected: job.amount_collected,
        fees: job.fees,
        teamSize: job.jobStaffAssignments.length,
        role: job.partner_id === profile.id ? 'Partner' : 'Manager'
      })),
      directReports: directReports.map(report => ({
        id: report.id,
        name: `${report.first_name} ${report.last_name}`,
        position: report.position,
        department: report.department?.name,
        latestPerformance: report.employeeEvaluations[0]?.overall_rating || null
      }))
    });

  } catch (error) {
    console.error('Error fetching GMP personal data:', error);
    return res.status(500).json({ 
      error: 'Failed to load personal portfolio',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /gmp-dashboard/alerts
// Get important alerts and notifications for GMP attention
router.get('/alerts', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.sub ? Number(req.user.sub) : undefined;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // Verify GMP access
    const userProfile = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true }
    });

    if (!userProfile?.profile) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    const profile = userProfile.profile;
    const isGMP = profile.position?.toLowerCase().includes('group_managing_partner') ||
                  profile.position?.toLowerCase().includes('group managing partner') ||
                  profile.position === 'group_managing_partner';
    const userRoles = req.user?.authRoles || [];
    const hasGMPAccess = isGMP || userRoles.includes('super_admin');

    if (!hasGMPAccess) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    // Jobs at risk (over budget or behind deadline)
    const jobsAtRisk = await prisma.job.findMany({
      where: {
        OR: [
          { due_date: { lt: new Date() } }, // Overdue
          { status: 'at_risk' }
        ]
      },
      include: {
        client: true,
        partner: true,
        manager: true
      },
      take: 10
    });

    // Pending evaluations (overdue)
    const pendingEvaluations = await prisma.employeeEvaluation.findMany({
      where: {
        status: 'pending',
        createdAt: {
          lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days old
        }
      },
      include: {
        employee: {
          select: {
            first_name: true,
            last_name: true,
            position: true,
            manager_id: true
          }
        }
      },
      take: 10
    });

    // Partners with low utilization (example threshold)
    const lowUtilizationPartners = await prisma.$queryRaw`
      SELECT 
        p.id,
        p.first_name,
        p.last_name,
        p.position,
        COALESCE(SUM(wl.hours_worked), 0) as total_hours
      FROM profiles p
      LEFT JOIN work_logs wl ON wl.employee_id = p.id 
        AND wl."createdAt" >= date_trunc('month', CURRENT_DATE)
      WHERE (p.position IN ('partner', 'Partner') OR p.is_partner = true)
        AND p.status = 'active'
      GROUP BY p.id, p.first_name, p.last_name, p.position
      HAVING COALESCE(SUM(wl.hours_worked), 0) < 100
      LIMIT 5
    `;

    return res.json({
      jobsAtRisk: jobsAtRisk.map(job => ({
        id: job.id,
        jobNumber: job.job_code,
        clientName: job.client?.client_name,
        status: job.status,
        deadlineDate: job.due_date,
        partnerName: job.partner ? `${job.partner.first_name} ${job.partner.last_name}` : null,
        severity: job.due_date && job.due_date < new Date() ? 'high' : 'medium'
      })),
      pendingEvaluations: pendingEvaluations.map(evaluation => ({
        id: evaluation.id,
        employeeName: `${evaluation.employee.first_name} ${evaluation.employee.last_name}`,
        employeePosition: evaluation.employee.position,
        managerName: null, // Manager info would need separate query
        daysPending: Math.floor((Date.now() - evaluation.createdAt.getTime()) / (24 * 60 * 60 * 1000))
      })),
      lowUtilizationPartners: lowUtilizationPartners.map((partner: any) => ({
        id: partner.id,
        name: `${partner.first_name} ${partner.last_name}`,
        position: partner.position,
        monthlyHours: Number(partner.total_hours)
      }))
    });

  } catch (error) {
    console.error('Error fetching GMP alerts:', error);
    return res.status(500).json({ 
      error: 'Failed to load alerts',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;