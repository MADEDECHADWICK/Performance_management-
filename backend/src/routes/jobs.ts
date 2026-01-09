import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { createAudit } from '../utils/audit';
import prisma from '../prisma';

const router = Router();

/**
 * Job Management Routes
 * 
 * Refactored for Xero-style costing:
 * - Job creation no longer includes hourly rates
 * - Rates are role/position-based, managed separately in PositionRate
 * - Financial metrics are calculated from time entries and position rates
 * 
 * Job Creation Fields:
 * - job_name: Name of the job
 * - client: Client ID
 * - department: Department ID
 * - partner_id: Partner/Job Owner
 * - start_date & due_date: Timeline
 * - billing_type: 'hourly' | 'fixed_fee' | 'retainer'
 * - budgeted_hours: Optional, for monitoring (only for hourly billing)
 * - fixed_fee_amount: Required only for fixed_fee billing_type
 */

// GET /jobs - List all jobs with optional filters
router.get('/', async (req, res) => {
  try {
    const { status, department_id, partner_id, client_id } = req.query;
    const jobs = await prisma.job.findMany({
      where: {
        ...(status && { status: status as string }),
        ...(department_id && { department_id: parseInt(department_id as string) }),
        ...(partner_id && { partner_id: parseInt(partner_id as string) }),
        ...(client_id && { client_id: parseInt(client_id as string) }),
      },
      include: {
        partner: true,
        client: true,
        jobStaffAssignments: {
          include: {
            employee: true,
          },
        },
        jobProfitability: true,
        timeEntries: {
          select: {
            hours: true,
            billable_amount: true,
            cost: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(jobs);
  } catch (error: any) {
    console.error('Error fetching jobs:', error);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

// GET /jobs/:id - Get job by ID with full financial details
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const job = await prisma.job.findUnique({
      where: { id: parseInt(id) },
      include: {
        partner: true,
        client: true,
        jobStaffAssignments: {
          include: {
            employee: {
              select: {
                id: true,
                first_name: true,
                last_name: true,
                position: true,
              },
            },
          },
        },
        jobProfitability: true,
        timeEntries: {
          include: {
            employee: {
              select: {
                id: true,
                first_name: true,
                last_name: true,
                position: true,
              },
            },
          },
        },
      },
    });
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    res.json(job);
  } catch (error: any) {
    console.error('Error fetching job:', error);
    res.status(500).json({ error: 'Failed to fetch job' });
  }
});

// POST /jobs - Create new job
// Refactored: No hourly_rate input, total_fee not calculated at creation
router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { 
      job_name, 
      job_code, 
      client_id, 
      description, 
      start_date, 
      due_date, 
      status, 
      department_id, 
      partner_id,
      budgeted_hours,
      billing_type,
      fixed_fee_amount,
    } = req.body;
    const performedBy = req.user?.sub ? Number(req.user.sub) : undefined;

    // Validation
    if (!job_name) {
      return res.status(400).json({ error: 'Job name is required' });
    }

    if (!partner_id) {
      return res.status(400).json({ error: 'Job owner (partner_id) is required' });
    }

    const validBillingTypes = ['hourly', 'fixed_fee', 'retainer'];
    const finalBillingType = billing_type || 'hourly';
    
    if (!validBillingTypes.includes(finalBillingType)) {
      return res.status(400).json({ 
        error: `Invalid billing_type. Must be one of: ${validBillingTypes.join(', ')}` 
      });
    }

    // For fixed_fee billing, fixed_fee_amount is required
    if (finalBillingType === 'fixed_fee' && fixed_fee_amount === undefined) {
      return res.status(400).json({ 
        error: 'fixed_fee_amount is required when billing_type is "fixed_fee"' 
      });
    }

    // NOTE: hourly_rate is intentionally removed - rates are role-based
    // Cost and revenue will be derived from time entries and position rates
    const job = await prisma.job.create({
      data: {
        job_name,
        job_code,
        client_id: client_id ? parseInt(client_id) : undefined,
        description,
        start_date: start_date ? new Date(start_date) : undefined,
        due_date: due_date ? new Date(due_date) : undefined,
        status: status || 'active',
        department_id: department_id ? parseInt(department_id) : undefined,
        partner_id: parseInt(partner_id),
        budgeted_hours: budgeted_hours ? parseFloat(budgeted_hours) : undefined,
        billing_type: finalBillingType,
        fixed_fee_amount: finalBillingType === 'fixed_fee' ? parseFloat(fixed_fee_amount) : undefined,
        // fees and amount_collected will be calculated from time entries
      },
      include: {
        partner: true,
        client: true,
        jobProfitability: true,
      },
    });

    await createAudit({
      action: `job:${job.id}:created`,
      entity_type: 'job',
      user_id: performedBy,
      ip_address: req.ip,
    });

    res.status(201).json(job);
  } catch (error: any) {
    console.error('Error creating job:', error);
    res.status(500).json({ error: error.message || 'Failed to create job' });
  }
});

// PATCH /jobs/:id - Update job
router.patch('/:id', authMiddleware, async (req: AuthRequest, res) => {
  const { 
    status, 
    job_name, 
    description, 
    due_date, 
    department_id,
    budgeted_hours,
    completion_percentage,
    partner_notes,
    billing_type,
    fixed_fee_amount,
  } = req.body;
  const id = req.params.id;
  const performedBy = req.user?.sub ? Number(req.user.sub) : undefined;
  
  try {
    const updateData: any = {};
    
    if (status) updateData.status = status;
    if (job_name) updateData.job_name = job_name;
    if (description !== undefined) updateData.description = description;
    if (due_date) updateData.due_date = new Date(due_date);
    if (department_id) updateData.department_id = parseInt(department_id);
    if (budgeted_hours !== undefined) updateData.budgeted_hours = parseFloat(budgeted_hours);
    if (completion_percentage !== undefined) updateData.completion_percentage = parseInt(completion_percentage);
    if (partner_notes !== undefined) updateData.partner_notes = partner_notes;
    
    // Billing type updates
    if (billing_type) {
      const validBillingTypes = ['hourly', 'fixed_fee', 'retainer'];
      if (!validBillingTypes.includes(billing_type)) {
        return res.status(400).json({ 
          error: `Invalid billing_type. Must be one of: ${validBillingTypes.join(', ')}` 
        });
      }
      updateData.billing_type = billing_type;
    }
    
    if (fixed_fee_amount !== undefined) {
      updateData.fixed_fee_amount = parseFloat(fixed_fee_amount);
    }

    const job = await prisma.job.update({
      where: { id: parseInt(id) },
      data: updateData,
      include: {
        partner: true,
        client: true,
        jobProfitability: true,
      },
    });

    await createAudit({
      action: `job:${id}:${status ? `status->${status}` : 'updated'}`,
      entity_type: 'job',
      user_id: performedBy,
      ip_address: req.ip,
    });

    return res.json(job);
  } catch (error: any) {
    console.error('Error updating job:', error);
    return res.status(500).json({ error: error.message || 'Failed to update job' });
  }
});

// DELETE /jobs/:id
router.delete('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const performedBy = req.user?.sub ? Number(req.user.sub) : undefined;

    await prisma.job.delete({
      where: { id: parseInt(id) },
    });

    await createAudit({
      action: `job:${id}:deleted`,
      entity_type: 'job',
      user_id: performedBy,
      ip_address: req.ip,
    });

    res.json({ ok: true });
  } catch (error: any) {
    console.error('Error deleting job:', error);
    res.status(500).json({ error: 'Failed to delete job' });
  }
});

export default router;