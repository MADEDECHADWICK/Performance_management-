import { Router } from 'express';
import { Decimal } from '@prisma/client/runtime/library';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { createAudit } from '../utils/audit';
import prisma from '../prisma';

const router = Router();

/**
 * Time Entry Management Routes
 * 
 * This implements a role-based costing model where:
 * - billable_amount = hours × employee.position.billing_rate
 * - cost = hours × employee.position.cost_rate
 * 
 * Visibility Rules:
 * - Employees: see only their own time entries
 * - Partners: see time entries for jobs they own
 * - HR/Super Admin: see all time entries
 */

// Helper function to get employee position-based rates
async function getEmployeePositionRates(employeeId: number) {
  const profile = await prisma.profile.findUnique({
    where: { id: employeeId },
    select: { position_level: true, cost_rate: true }
  });

  if (!profile) {
    throw new Error(`Employee profile not found for ID: ${employeeId}`);
  }

  if (!profile.position_level) {
    throw new Error(`Employee position level not set for ID: ${employeeId}`);
  }

  // Get position rates
  const positionRate = await prisma.positionRate.findFirst({
    where: { 
      position_level: profile.position_level,
      is_active: true 
    }
  });

  if (!positionRate) {
    // Fallback to role-based rates if position rates not found
    const profileWithRole = await prisma.profile.findUnique({
      where: { id: employeeId },
      include: { role: true }
    });

    return {
      billing_rate: profileWithRole?.role?.billing_rate || 0,
      cost_rate: profile.cost_rate || 0,
      source: 'role'
    };
  }

  return {
    billing_rate: positionRate.billing_rate,
    cost_rate: positionRate.cost_rate,
    source: 'position'
  };
}

// Helper function to check if user can view a time entry
async function canViewTimeEntry(userId: number, timeEntryId: number, userRoles: string[]) {
  const timeEntry = await prisma.timeEntry.findUnique({
    where: { id: timeEntryId },
    include: {
      employee: true,
      job: true,
    },
  });

  if (!timeEntry) return false;

  // HR and Super Admin can see all
  if (userRoles.includes('hr') || userRoles.includes('super_admin')) {
    return true;
  }

  // Employees can see only their own
  if (timeEntry.employee_id === userId) {
    return true;
  }

  // Partners can see time entries for their jobs
  if (userRoles.includes('partner')) {
    const partnerJob = await prisma.job.findFirst({
      where: {
        id: timeEntry.job_id,
        partner_id: userId,
      },
    });
    return !!partnerJob;
  }

  return false;
}

// GET /time_entries - List time entries with filters
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.sub ? Number(req.user.sub) : undefined;
    const userRoles = req.user?.roles || [];
    const { job_id, employee_id, status, start_date, end_date } = req.query;

    // Build where clause based on user role
    let whereClause: any = {};

    if (status) {
      whereClause.status = status as string;
    }

    if (start_date) {
      whereClause.date_worked = {
        ...whereClause.date_worked,
        gte: new Date(start_date as string),
      };
    }

    if (end_date) {
      whereClause.date_worked = {
        ...whereClause.date_worked,
        lte: new Date(end_date as string),
      };
    }

    // Role-based filtering
    if (userRoles.includes('hr') || userRoles.includes('super_admin')) {
      // HR/Super Admin see all (with optional filters)
      if (job_id) {
        whereClause.job_id = parseInt(job_id as string);
      }
      if (employee_id) {
        whereClause.employee_id = parseInt(employee_id as string);
      }
    } else if (userRoles.includes('partner')) {
      // Partners see time entries for their jobs only
      const partnerJobs = await prisma.job.findMany({
        where: { partner_id: userId },
        select: { id: true },
      });
      const jobIds = partnerJobs.map((j) => j.id);
      whereClause.job_id = { in: jobIds };

      if (job_id) {
        const jobIdNum = parseInt(job_id as string);
        if (!jobIds.includes(jobIdNum)) {
          return res.status(403).json({ error: 'Access denied to this job' });
        }
        whereClause.job_id = jobIdNum;
      }
    } else {
      // Employees see only their own time entries
      whereClause.employee_id = userId;
    }

    const timeEntries = await prisma.timeEntry.findMany({
      where: whereClause,
      include: {
        job: true,
        task: true,
        employee: true,
        approver: true,
      },
      orderBy: { date_worked: 'desc' },
    });

    res.json(timeEntries);
  } catch (error: any) {
    console.error('Error fetching time entries:', error);
    res.status(500).json({ error: 'Failed to fetch time entries' });
  }
});

// GET /time_entries/:id - Get specific time entry
router.get('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.sub ? Number(req.user.sub) : undefined;
    const userRoles = req.user?.roles || [];
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const canView = await canViewTimeEntry(userId, parseInt(id), userRoles);
    if (!canView) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const timeEntry = await prisma.timeEntry.findUnique({
      where: { id: parseInt(id) },
      include: {
        job: true,
        task: true,
        employee: true,
        approver: true,
      },
    });

    if (!timeEntry) {
      return res.status(404).json({ error: 'Time entry not found' });
    }

    res.json(timeEntry);
  } catch (error: any) {
    console.error('Error fetching time entry:', error);
    res.status(500).json({ error: 'Failed to fetch time entry' });
  }
});

// POST /time_entries - Create new time entry
// Automatically calculates billable_amount and cost based on employee position rate
router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.sub ? Number(req.user.sub) : undefined;
    const userRoles = req.user?.roles || [];
    const { job_id, task_id, date_worked, start_time, end_time, hours, billable, description } = req.body;
    const performedBy = userId;

    // Validate required fields
    if (!job_id || !date_worked || !hours) {
      return res.status(400).json({ 
        error: 'job_id, date_worked, and hours are required' 
      });
    }

    // Check if user can log time on this job
    const job = await prisma.job.findUnique({
      where: { id: parseInt(job_id) },
    });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Only allow logging time on your own behalf (or HR/Super Admin can log for others)
    const employeeId = req.body.employee_id ? parseInt(req.body.employee_id) : userId;
    
    if (!employeeId) {
      return res.status(400).json({ error: 'Employee ID is required' });
    }
    
    if (employeeId !== userId && !userRoles.includes('hr') && !userRoles.includes('super_admin')) {
      return res.status(403).json({ error: 'Cannot log time for other employees' });
    }

    // Validate task if provided
    if (task_id) {
      const task = await prisma.task.findFirst({
        where: { 
          id: parseInt(task_id),
          job_id: parseInt(job_id)
        }
      });
      
      if (!task) {
        return res.status(404).json({ error: 'Task not found or does not belong to this job' });
      }
    }

    // Get employee rates for automatic cost calculation
    const rates = await getEmployeePositionRates(employeeId);
    
    // Calculate billable amount and cost
    const hoursWorked = parseFloat(hours);
    const isBillable = billable !== false; // Default to true if not specified
    
    const calculatedBillableAmount = isBillable 
      ? hoursWorked * Number(rates.billing_rate) 
      : 0;
    const calculatedCost = hoursWorked * Number(rates.cost_rate);

    const timeEntry = await prisma.timeEntry.create({
      data: {
        job_id: parseInt(job_id),
        task_id: task_id ? parseInt(task_id) : null,
        employee_id: employeeId,
        date_worked: new Date(date_worked),
        start_time,
        end_time,
        hours: hoursWorked,
        billable: isBillable,
        description,
        billable_amount: calculatedBillableAmount,
        cost: calculatedCost,
        status: 'submitted'
      },
      include: {
        job: {
          select: {
            id: true,
            job_name: true,
            job_code: true
          }
        },
        task: {
          select: {
            id: true,
            title: true
          }
        },
        employee: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            position_level: true
          }
        }
      }
    });

    // Create audit log
    await createAudit({
      action: `time_entry:${timeEntry.id}:created`,
      entity_type: 'time_entry',
      user_id: performedBy,
      ip_address: req.ip,
    });

    res.status(201).json({
      message: 'Time entry created successfully',
      time_entry: timeEntry,
      calculation: {
        hours: hoursWorked,
        billing_rate: Number(rates.billing_rate),
        cost_rate: Number(rates.cost_rate),
        billable_amount: calculatedBillableAmount,
        cost: calculatedCost,
        rate_source: rates.source
      }
    });
  } catch (error: any) {
    console.error('Error creating time entry:', error);
    res.status(500).json({ error: error.message || 'Failed to create time entry' });
  }
});

// PATCH /time_entries/:id - Update time entry
// Recalculates billable_amount and cost if hours change
router.patch('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.sub ? Number(req.user.sub) : undefined;
    const userRoles = req.user?.roles || [];
    const { id } = req.params;
    const { hours, billable, description, status } = req.body;
    const performedBy = userId;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Check access
    const canView = await canViewTimeEntry(userId, parseInt(id), userRoles);
    if (!canView && !userRoles.includes('hr') && !userRoles.includes('super_admin')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Can't approve own time entries
    if (status === 'approved' && !userRoles.includes('hr') && !userRoles.includes('super_admin')) {
      return res.status(403).json({ error: 'Only HR/Super Admin can approve time entries' });
    }

    const existingEntry = await prisma.timeEntry.findUnique({
      where: { id: parseInt(id) },
    });

    if (!existingEntry) {
      return res.status(404).json({ error: 'Time entry not found' });
    }

    // If hours or billable status changes, recalculate costs
    let billable_amount = existingEntry.billable_amount;
    let cost = existingEntry.cost;

    if (hours !== undefined || billable !== undefined) {
      const newHours = hours !== undefined ? parseFloat(hours) : Number(existingEntry.hours);
      const newBillable = billable !== undefined ? billable : existingEntry.billable;

      const rates = await getEmployeePositionRates(existingEntry.employee_id);
      
      billable_amount = newBillable ? new Decimal(newHours).mul(rates.billing_rate) : new Decimal(0);
      cost = new Decimal(newHours).mul(rates.cost_rate);
    }

    const updateData: any = {};
    if (hours !== undefined) updateData.hours = parseFloat(hours);
    if (billable !== undefined) updateData.billable = billable;
    if (description !== undefined) updateData.description = description;
    if (status !== undefined) updateData.status = status;
    if (billable_amount !== existingEntry.billable_amount) updateData.billable_amount = billable_amount;
    if (cost !== existingEntry.cost) updateData.cost = cost;

    if (status === 'approved') {
      updateData.approved_at = new Date();
      updateData.approved_by = performedBy;
    }

    const timeEntry = await prisma.timeEntry.update({
      where: { id: parseInt(id) },
      data: updateData,
      include: {
        job: true,
        task: true,
        employee: true,
        approver: true,
      },
    });

    await createAudit({
      action: `time_entry:${id}:updated`,
      entity_type: 'time_entry',
      user_id: performedBy,
      ip_address: req.ip,
    });

    res.json(timeEntry);
  } catch (error: any) {
    console.error('Error updating time entry:', error);
    res.status(500).json({ error: error.message || 'Failed to update time entry' });
  }
});

// DELETE /time_entries/:id - Delete time entry
router.delete('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.sub ? Number(req.user.sub) : undefined;
    const userRoles = req.user?.roles || [];
    const { id } = req.params;
    const performedBy = userId;

    // Only HR/Super Admin or the employee who created it can delete
    const timeEntry = await prisma.timeEntry.findUnique({
      where: { id: parseInt(id) },
    });

    if (!timeEntry) {
      return res.status(404).json({ error: 'Time entry not found' });
    }

    if (
      timeEntry.employee_id !== userId &&
      !userRoles.includes('hr') &&
      !userRoles.includes('super_admin')
    ) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await prisma.timeEntry.delete({
      where: { id: parseInt(id) },
    });

    await createAudit({
      action: `time_entry:${id}:deleted`,
      entity_type: 'time_entry',
      user_id: performedBy,
      ip_address: req.ip,
    });

    res.json({ ok: true });
  } catch (error: any) {
    console.error('Error deleting time entry:', error);
    res.status(500).json({ error: 'Failed to delete time entry' });
  }
});

export default router;
