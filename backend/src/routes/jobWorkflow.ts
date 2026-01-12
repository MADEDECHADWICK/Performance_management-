import { Router } from 'express';
import prisma from '../prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// Job creation workflow
router.post('/create', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const {
      title,
      description,
      jobType,
      category,
      clientId,
      partnerId,
      managerId,
      priority,
      complexity,
      estimatedHours,
      budget,
      dueDate,
      requiresApproval,
      specialInstructions
    } = req.body;

    // Validate required fields
    if (!title || !clientId || !partnerId || !managerId || !dueDate) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: title, clientId, partnerId, managerId, dueDate'
      });
    }

    // Generate job code
    const client = await prisma.client.findUnique({ where: { id: parseInt(clientId) } });
    const typePrefix = (jobType || 'JOB').substring(0, 3).toUpperCase();
    const clientPrefix = client?.client_name.substring(0, 3).toUpperCase() || 'CLI';
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    const job_code = `${typePrefix}-${clientPrefix}-${year}${month}-${random}`;

    // Create the main job
    const job = await prisma.job.create({
      data: {
        job_name: title,
        job_code,
        client_id: parseInt(clientId),
        partner_id: parseInt(partnerId),
        manager_id: parseInt(managerId),
        description: description || '',
        priority: priority?.toLowerCase() || 'medium',
        start_date: new Date(),
        due_date: new Date(dueDate),
        estimated_hours: parseFloat(estimatedHours) || 0,
        budget: parseFloat(budget) || 0,
        status: requiresApproval ? 'pending_approval' : 'active',
        billing_type: 'fixed_fee',
        fixed_fee_amount: parseFloat(budget) || 0
      }
    });

    console.log('✅ Job created successfully:', {
      id: job.id,
      title: job.job_name,
      client_id: job.client_id,
      partner_id: job.partner_id,
      manager_id: job.manager_id
    });

    res.json({
      success: true,
      jobId: job.id,
      message: 'Job created successfully with workflow initiated'
    });

  } catch (error) {
    console.error('Job creation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create job',
      details: error.message
    });
  }
});

// Get active jobs by user role
router.get('/active', authMiddleware, async (req: AuthRequest, res) => {
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

    // Include all relevant active statuses
    let whereClause: any = { 
      status: { 
        in: ['not_started', 'in_progress', 'active', 'pending_approval'] 
      } 
    };

    // Filter based on user role - for now, show all jobs for admin users
    const isGMP = userProfile.profile.position?.includes('group_managing_partner');
    const isPartner = userProfile.profile.is_partner;
    const isManager = userProfile.profile.position?.includes('manager');
    const isAdmin = userProfile.profile.position?.includes('admin');

    if (!isGMP && !isAdmin) {
      if (isPartner) {
        whereClause.partner_id = userProfile.profile.id;
      } else if (isManager) {
        whereClause.manager_id = userProfile.profile.id;
      } else {
        whereClause.jobStaffAssignments = {
          some: { employee_id: userProfile.profile.id }
        };
      }
    }

    const jobs = await prisma.job.findMany({
      where: whereClause,
      include: {
        client: { 
          select: { 
            id: true,
            client_name: true, 
            client_code: true 
          } 
        },
        partner: { 
          select: { 
            id: true,
            first_name: true, 
            last_name: true 
          } 
        },
        manager: { 
          select: { 
            id: true,
            first_name: true, 
            last_name: true 
          } 
        },
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
        },
        timeEntries: {
          include: {
            employee: {
              select: {
                first_name: true,
                last_name: true
              }
            }
          },
          orderBy: { date_worked: 'desc' },
          take: 10
        }
      },
      orderBy: { due_date: 'asc' }
    });

    // Transform data to match frontend expectations
    const transformedJobs = jobs.map(job => ({
      id: job.id,
      title: job.job_name,
      job_code: job.job_code,
      status: job.status,
      client: job.client,
      partner: job.partner,
      manager: job.manager,
      due_date: job.due_date,
      estimated_hours: Number(job.estimated_hours || 0),
      budget: Number(job.budget || 0),
      milestones: [], // Empty for now since we don't have milestone model
      workLogs: job.timeEntries || [],
      jobStaffAssignments: job.jobStaffAssignments
    }));

    console.log('📊 Active jobs fetched:', {
      user_id: userId,
      position: userProfile.profile.position,
      jobs_found: transformedJobs.length
    });

    res.json({ 
      success: true, 
      jobs: transformedJobs,
      count: transformedJobs.length 
    });

  } catch (error) {
    console.error('Active jobs fetch error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch active jobs' 
    });
  }
});

// Get job workflow status
router.get('/:jobId/workflow', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const jobId = parseInt(req.params.jobId);

    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        client: true,
        partner: { select: { first_name: true, last_name: true } },
        manager: { select: { first_name: true, last_name: true } },
        jobStaffAssignments: {
          include: {
            employee: { select: { first_name: true, last_name: true, position: true } }
          }
        },
        timeEntries: {
          include: {
            employee: { select: { first_name: true, last_name: true } }
          },
          orderBy: { date_worked: 'desc' },
          take: 10
        }
      }
    });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Calculate progress based on time entries vs estimated hours
    const totalHoursLogged = job.timeEntries.reduce((sum, entry) => sum + Number(entry.hours), 0);
    const estimatedHours = Number(job.estimated_hours || 0);
    const progress = estimatedHours > 0 ? Math.min((totalHoursLogged / estimatedHours) * 100, 100) : 0;

    // Calculate financials
    const totalCost = job.timeEntries.reduce((sum, entry) => {
      return sum + (Number(entry.hours) * Number(entry.billable_amount || 0));
    }, 0);

    const budget = Number(job.budget || 0);

    res.json({
      success: true,
      workflow: {
        progress: Math.round(progress),
        totalHoursLogged,
        totalCost,
        utilization: estimatedHours > 0 ? (totalHoursLogged / estimatedHours) * 100 : 0,
        profitability: budget > 0 ? ((budget - totalCost) / budget) * 100 : 0
      }
    });

  } catch (error) {
    console.error('Workflow fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch workflow' });
  }
});

export default router;