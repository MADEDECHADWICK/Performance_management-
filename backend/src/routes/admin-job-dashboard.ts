import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

// GET /admin/jobs/dashboard
// Comprehensive job management dashboard
router.get('/dashboard', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.sub ? Number(req.user.sub) : undefined;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('🏢 Fetching comprehensive job management dashboard');

    // 1. Job overview statistics
    const jobStats = await prisma.job.groupBy({
      by: ['status', 'service_type', 'workflow_stage'],
      _count: {
        id: true
      },
      _sum: {
        budget_amount: true,
        estimated_hours: true
      }
    });

    // 2. Jobs by workflow stage
    const workflowAnalysis = await prisma.$queryRaw`
      SELECT 
        workflow_stage,
        COUNT(*) as job_count,
        SUM(budget_amount) as total_budget,
        AVG(
          CASE 
            WHEN due_date < CURRENT_DATE THEN 1 
            ELSE 0 
          END
        ) * 100 as overdue_percentage
      FROM Job 
      WHERE status != 'cancelled'
      GROUP BY workflow_stage
      ORDER BY 
        CASE workflow_stage
          WHEN 'draft' THEN 1
          WHEN 'partner_review' THEN 2
          WHEN 'manager_assignment' THEN 3
          WHEN 'team_assignment' THEN 4
          WHEN 'in_progress' THEN 5
          WHEN 'partner_review_final' THEN 6
          WHEN 'client_delivery' THEN 7
          WHEN 'completed' THEN 8
          ELSE 9
        END
    `;

    // 3. Partner performance overview
    const partnerPerformance = await prisma.$queryRaw`
      SELECT 
        p.id as partner_id,
        p.first_name,
        p.last_name,
        COUNT(j.id) as active_jobs,
        SUM(j.budget_amount) as total_budget,
        AVG(
          CASE 
            WHEN j.due_date < CURRENT_DATE AND j.status != 'completed' THEN 1 
            ELSE 0 
          END
        ) * 100 as overdue_rate,
        AVG(jpm.efficiency_rating) as avg_efficiency,
        COUNT(CASE WHEN j.workflow_stage = 'completed' THEN 1 END) as completed_jobs
      FROM Profile p
      LEFT JOIN Job j ON j.partner_id = p.id AND j.status IN ('active', 'in_progress')
      LEFT JOIN JobPerformanceMetrics jpm ON jpm.job_id = j.id
      WHERE p.user_id IN (
        SELECT u.id FROM User u 
        JOIN UserRole ur ON ur.user_id = u.id 
        JOIN Role r ON r.id = ur.role_id 
        WHERE r.name = 'Partner'
      )
      GROUP BY p.id, p.first_name, p.last_name
      ORDER BY total_budget DESC
    `;

    // 4. Recent job activities
    const recentActivities = await prisma.jobAuditLog.findMany({
      take: 20,
      orderBy: { timestamp: 'desc' },
      include: {
        job: {
          select: {
            title: true,
            job_code: true,
            service_type: true
          }
        },
        user: {
          include: {
            profile: {
              select: {
                first_name: true,
                last_name: true
              }
            }
          }
        }
      }
    });

    // 5. Critical items requiring attention
    const criticalItems = await prisma.$queryRaw`
      SELECT 
        j.id,
        j.title,
        j.job_code,
        j.workflow_stage,
        j.due_date,
        j.priority,
        CASE 
          WHEN j.due_date < CURRENT_DATE THEN 'overdue'
          WHEN j.due_date <= CURRENT_DATE + INTERVAL '3 days' THEN 'due_soon'
          WHEN j.workflow_stage = 'partner_review' THEN 'pending_review'
          WHEN j.workflow_stage = 'manager_assignment' THEN 'needs_assignment'
          ELSE 'normal'
        END as urgency_type,
        p.first_name as partner_name,
        p.last_name as partner_lastname,
        c.client_name
      FROM Job j
      LEFT JOIN Profile p ON p.id = j.partner_id
      LEFT JOIN Client c ON c.id = j.client_id
      WHERE j.status IN ('active', 'in_progress') 
        AND (
          j.due_date <= CURRENT_DATE + INTERVAL '3 days'
          OR j.workflow_stage IN ('partner_review', 'manager_assignment')
        )
      ORDER BY 
        CASE urgency_type
          WHEN 'overdue' THEN 1
          WHEN 'due_soon' THEN 2
          WHEN 'pending_review' THEN 3
          WHEN 'needs_assignment' THEN 4
          ELSE 5
        END,
        j.due_date ASC
    `;

    // 6. Resource utilization
    const resourceUtilization = await prisma.$queryRaw`
      SELECT 
        p.id as employee_id,
        p.first_name,
        p.last_name,
        COUNT(DISTINCT jsa.job_id) as active_assignments,
        SUM(jsa.budget_hours) as total_budget_hours,
        COALESCE(SUM(te.hours_worked), 0) as hours_logged_this_week,
        AVG(jsa.billing_rate) as avg_billing_rate,
        SUM(jsa.budget_hours * jsa.billing_rate) as potential_revenue
      FROM Profile p
      LEFT JOIN JobStaffAssignment jsa ON jsa.employee_id = p.id AND jsa.status = 'assigned'
      LEFT JOIN Job j ON j.id = jsa.job_id AND j.status IN ('active', 'in_progress')
      LEFT JOIN TimeEntry te ON te.employee_id = p.id 
        AND te.date >= CURRENT_DATE - INTERVAL '7 days'
        AND te.approved = true
      WHERE p.user_id IN (
        SELECT DISTINCT u.id FROM User u 
        JOIN UserRole ur ON ur.user_id = u.id 
        WHERE ur.role_id IN (SELECT id FROM Role WHERE name IN ('Employee', 'Manager', 'Partner'))
      )
      GROUP BY p.id, p.first_name, p.last_name
      HAVING COUNT(DISTINCT jsa.job_id) > 0
      ORDER BY potential_revenue DESC
    `;

    // 7. Financial performance summary
    const financialSummary = await prisma.$queryRaw`
      SELECT 
        SUM(jft.budget_amount) as total_budget,
        SUM(jft.actual_amount) as total_actual,
        SUM(jft.invoice_amount) as total_invoiced,
        SUM(jft.payment_received) as total_collected,
        SUM(jft.outstanding_amount) as total_outstanding,
        AVG(jft.profit_margin) as avg_profit_margin,
        COUNT(CASE WHEN jft.billing_status = 'invoiced' THEN 1 END) as invoiced_jobs,
        COUNT(CASE WHEN jft.billing_status = 'paid' THEN 1 END) as paid_jobs
      FROM JobFinancialTracking jft
      JOIN Job j ON j.id = jft.job_id
      WHERE j.status IN ('active', 'in_progress', 'completed')
        AND jft.created_at >= CURRENT_DATE - INTERVAL '30 days'
    `;

    // 8. Service type distribution
    const serviceDistribution = await prisma.job.groupBy({
      by: ['service_type', 'service_subtype'],
      where: {
        status: { not: 'cancelled' },
        created_at: {
          gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) // Last 90 days
        }
      },
      _count: {
        id: true
      },
      _sum: {
        budget_amount: true
      },
      _avg: {
        estimated_hours: true
      }
    });

    // 9. Department performance
    const departmentPerformance = await prisma.$queryRaw`
      SELECT 
        d.id,
        d.department_name,
        COUNT(j.id) as active_jobs,
        SUM(j.budget_amount) as department_budget,
        AVG(jpm.efficiency_rating) as avg_efficiency,
        COUNT(CASE WHEN j.workflow_stage = 'completed' THEN 1 END) as completed_jobs,
        AVG(
          CASE 
            WHEN j.due_date >= j.start_date THEN 
              EXTRACT(DAY FROM (j.due_date - j.start_date))
            ELSE NULL 
          END
        ) as avg_project_duration
      FROM Department d
      LEFT JOIN Job j ON j.department_id = d.id AND j.status != 'cancelled'
      LEFT JOIN JobPerformanceMetrics jpm ON jpm.job_id = j.id
      GROUP BY d.id, d.department_name
      HAVING COUNT(j.id) > 0
      ORDER BY department_budget DESC
    `;

    // Compile comprehensive dashboard data
    const dashboardData = {
      overview: {
        totalJobs: jobStats.reduce((sum, stat) => sum + stat._count.id, 0),
        totalBudget: jobStats.reduce((sum, stat) => sum + (stat._sum.budget_amount || 0), 0),
        totalEstimatedHours: jobStats.reduce((sum, stat) => sum + (stat._sum.estimated_hours || 0), 0),
        timestamp: new Date()
      },
      workflowAnalysis,
      partnerPerformance,
      criticalItems,
      resourceUtilization,
      financialSummary: Array.isArray(financialSummary) ? financialSummary[0] : financialSummary,
      serviceDistribution,
      departmentPerformance,
      recentActivities: recentActivities.map(activity => ({
        id: activity.id,
        action: activity.action,
        description: activity.description,
        timestamp: activity.timestamp,
        jobTitle: activity.job?.title,
        jobCode: activity.job?.job_code,
        serviceType: activity.job?.service_type,
        userName: activity.user?.profile 
          ? `${activity.user.profile.first_name} ${activity.user.profile.last_name}`
          : 'System',
        details: activity.details
      })),
      summary: {
        activeJobs: jobStats.filter(s => s.status === 'active').reduce((sum, stat) => sum + stat._count.id, 0),
        inProgressJobs: jobStats.filter(s => s.status === 'in_progress').reduce((sum, stat) => sum + stat._count.id, 0),
        completedJobs: jobStats.filter(s => s.status === 'completed').reduce((sum, stat) => sum + stat._count.id, 0),
        totalPartners: Array.isArray(partnerPerformance) ? partnerPerformance.length : 0,
        criticalItemsCount: Array.isArray(criticalItems) ? criticalItems.length : 0
      }
    };

    console.log('✅ Dashboard data compiled successfully');

    res.json({
      success: true,
      data: dashboardData,
      generatedAt: new Date()
    });

  } catch (error) {
    console.error('❌ Error fetching job management dashboard:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

// GET /admin/jobs/active
// Get all active jobs with comprehensive details
router.get('/active', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      serviceType, 
      workflowStage, 
      partnerId, 
      priority,
      search 
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    // Build filter conditions
    const where: any = {
      status: { in: ['active', 'in_progress'] }
    };

    if (serviceType) where.service_type = serviceType;
    if (workflowStage) where.workflow_stage = workflowStage;
    if (partnerId) where.partner_id = Number(partnerId);
    if (priority) where.priority = priority;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { job_code: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ];
    }

    const [jobs, totalCount] = await Promise.all([
      prisma.job.findMany({
        where,
        skip,
        take,
        orderBy: [
          { priority: 'desc' },
          { due_date: 'asc' }
        ],
        include: {
          client: {
            select: {
              id: true,
              client_name: true,
              contact_person: true,
              contact_email: true
            }
          },
          partner: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              email: true
            }
          },
          manager: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              email: true
            }
          },
          department: {
            select: {
              id: true,
              department_name: true
            }
          },
          jobStaffAssignments: {
            include: {
              profile: {
                select: {
                  id: true,
                  first_name: true,
                  last_name: true,
                  email: true
                }
              }
            }
          },
          jobFinancialTracking: {
            select: {
              budget_amount: true,
              actual_amount: true,
              invoice_amount: true,
              payment_received: true,
              outstanding_amount: true,
              billing_status: true,
              profit_margin: true
            }
          },
          jobPerformanceMetrics: {
            select: {
              actual_hours: true,
              efficiency_rating: true,
              on_time_delivery: true,
              budget_variance: true
            }
          }
        }
      }),
      prisma.job.count({ where })
    ]);

    // Enrich jobs with calculated fields
    const enrichedJobs = jobs.map(job => ({
      ...job,
      daysUntilDue: Math.ceil((new Date(job.due_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)),
      isOverdue: new Date(job.due_date) < new Date(),
      teamSize: job.jobStaffAssignments.length,
      budgetUtilization: job.jobFinancialTracking?.[0] 
        ? (job.jobFinancialTracking[0].actual_amount / job.jobFinancialTracking[0].budget_amount) * 100 
        : 0,
      completionPercentage: job.jobPerformanceMetrics?.[0]?.efficiency_rating || 0
    }));

    res.json({
      success: true,
      data: enrichedJobs,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: totalCount,
        pages: Math.ceil(totalCount / Number(limit))
      },
      filters: {
        serviceType,
        workflowStage,
        partnerId,
        priority,
        search
      }
    });

  } catch (error) {
    console.error('❌ Error fetching active jobs:', error);
    res.status(500).json({ error: 'Failed to fetch active jobs' });
  }
});

// GET /admin/jobs/:jobId/full-details
// Get comprehensive job details including all related data
router.get('/:jobId/full-details', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { jobId } = req.params;

    const job = await prisma.job.findUnique({
      where: { id: parseInt(jobId) },
      include: {
        client: true,
        partner: true,
        manager: true,
        department: true,
        jobStaffAssignments: {
          include: {
            profile: {
              select: {
                id: true,
                first_name: true,
                last_name: true,
                email: true,
                phone_number: true,
                job_title: true
              }
            }
          }
        },
        jobFinancialTracking: true,
        jobPerformanceMetrics: true,
        jobDeliverables: true,
        jobComplianceTracking: true,
        jobWorkflowSteps: {
          orderBy: { step_order: 'asc' }
        },
        timeEntries: {
          include: {
            profile: {
              select: {
                first_name: true,
                last_name: true
              }
            }
          },
          orderBy: { date: 'desc' }
        },
        jobAuditLogs: {
          include: {
            user: {
              include: {
                profile: {
                  select: {
                    first_name: true,
                    last_name: true
                  }
                }
              }
            }
          },
          orderBy: { timestamp: 'desc' }
        }
      }
    });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Calculate additional metrics
    const totalBudgetedHours = job.jobStaffAssignments.reduce(
      (sum, assignment) => sum + assignment.budget_hours, 0
    );

    const totalLoggedHours = job.timeEntries.reduce(
      (sum, entry) => sum + entry.hours_worked, 0
    );

    const hourUtilization = totalBudgetedHours > 0 
      ? (totalLoggedHours / totalBudgetedHours) * 100 
      : 0;

    const completedDeliverables = job.jobDeliverables.filter(d => d.status === 'completed').length;
    const deliverableProgress = job.jobDeliverables.length > 0 
      ? (completedDeliverables / job.jobDeliverables.length) * 100 
      : 0;

    const completedWorkflowSteps = job.jobWorkflowSteps.filter(s => s.status === 'completed').length;
    const workflowProgress = job.jobWorkflowSteps.length > 0 
      ? (completedWorkflowSteps / job.jobWorkflowSteps.length) * 100 
      : 0;

    const enrichedJob = {
      ...job,
      metrics: {
        totalBudgetedHours,
        totalLoggedHours,
        hourUtilization,
        deliverableProgress,
        workflowProgress,
        daysUntilDue: Math.ceil((new Date(job.due_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)),
        isOverdue: new Date(job.due_date) < new Date(),
        teamSize: job.jobStaffAssignments.length
      }
    };

    res.json({
      success: true,
      data: enrichedJob
    });

  } catch (error) {
    console.error('❌ Error fetching job details:', error);
    res.status(500).json({ error: 'Failed to fetch job details' });
  }
});

export default router;