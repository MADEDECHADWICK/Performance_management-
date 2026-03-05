import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import prisma from '../prisma';
import { notifyJobLossAlert } from '../services/notificationRecipients';

const router = Router();

/**
 * Job Profitability Routes
 * 
 * Implements Xero-style financial aggregation:
 * - Aggregates data from TimeEntry records
 * - Uses position-based rates to calculate costs and revenue
 * - Supports role-based visibility (employees, partners, HR/Super Admin)
 * 
 * Calculations:
 * - total_revenue = SUM(timeEntry.billable_amount) for billable time, or fixed_fee_amount
 * - total_cost = SUM(timeEntry.cost) for all logged time
 * - profit = total_revenue - total_cost
 * - profit_margin = (profit / total_revenue) × 100 if total_revenue > 0
 */

// Helper function to calculate job profitability from time entries
async function calculateJobProfitability(jobId: number) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { jobCosting: true },
  });

  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }

  // Get all time entries for this job
  const timeEntries = await prisma.timeEntry.findMany({
    where: {
      jobId,
      status: 'approved', // Only count approved time entries
    },
  });

  // Calculate totals from time entries
  let total_revenue = 0;
  let total_cost = 0;

  if (job.billingType === 'fixed_fee') {
    // For fixed fee jobs, prefer jobCosting fee (source of truth) when available
    total_revenue = Number(job.jobCosting?.jobFee || job.fixedFeeAmount || 0);
  } else {
    // For hourly and retainer, aggregate billable amounts from time entries
    total_revenue = timeEntries.reduce((sum, entry) => {
      return sum + Number(entry.billableAmount || 0);
    }, 0);
  }

  // Cost is always the sum of actual costs
  total_cost = timeEntries.reduce((sum, entry) => {
    return sum + Number(entry.costAmount || 0);
  }, 0);

  const profit = total_revenue - total_cost;
  const profit_margin = total_revenue > 0 ? (profit / total_revenue) * 100 : 0;

  return {
    job_id: jobId,
    total_revenue,
    total_cost,
    profit,
    profit_margin,
    time_entries_count: timeEntries.length,
  };
}

// GET /job_profitability - Get financial metrics for all jobs
// Role-based visibility:
// - Partners: See only their own jobs
// - HR/Super Admin: See all jobs
// - Employees: Not allowed (403)
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const profileId = req.user?.profileId ? Number(req.user.profileId) : undefined;
    const userRoles = req.userRoles || [];

    // DEBUG: Log what we received
    console.log('[jobProfitability GET /] User roles:', userRoles, 'req.user:', req.user);

    // Check if user is admin (super_admin or hr)
    const isAdmin = userRoles.includes('super_admin') || userRoles.includes('hr');
    const isPartner = userRoles.includes('partner');

    let jobs;

    if (isAdmin) {
      // HR/Super Admin see all jobs
      jobs = await prisma.job.findMany({
        include: { partner: true, client: true },
      });
    } else if (isPartner) {
      // Partners see only their own jobs
      jobs = await prisma.job.findMany({
        where: { partnerProfileId: profileId ?? undefined },
        include: { partner: true, client: true },
      });
    } else {
      // Regular employees cannot view job profitability
      return res.status(403).json({ error: 'Access denied. Only partners, HR, and Super Admin can view job profitability.' });
    }

    // Calculate profitability for each job
    const profitability = await Promise.all(
      jobs.map(async (job) => {
        try {
          return await calculateJobProfitability(job.id);
        } catch (error) {
          console.error(`Error calculating profitability for job ${job.id}:`, error);
          return {
            job_id: job.id,
            total_revenue: 0,
            total_cost: 0,
            profit: 0,
            profit_margin: 0,
            error: 'Failed to calculate',
          };
        }
      })
    );

    res.json(profitability);
  } catch (error: any) {
    console.error('Error fetching job profitability:', error);
    res.status(500).json({ error: 'Failed to fetch job profitability data' });
  }
});

// GET /job_profitability/:jobId - Get financial metrics for a specific job
router.get('/:jobId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { jobId } = req.params;
    const profileId = req.user?.profileId ? Number(req.user.profileId) : undefined;
    const userRoles = req.userRoles || [];

    const job = await prisma.job.findUnique({
      where: { id: parseInt(jobId) },
      include: { partner: true, client: true },
    });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Check visibility - Super Admin and HR can see all jobs
    const isAdmin = userRoles.includes('super_admin') || userRoles.includes('hr');
    const isPartner = userRoles.includes('partner');

    if (!isAdmin) {
      // Non-admin users must be partners and can only see their own jobs
      if (!isPartner || job.partnerProfileId !== profileId) {
        return res.status(403).json({ error: 'Access denied. You can only view your own jobs.' });
      }
    }

    // Calculate profitability
    const profitability = await calculateJobProfitability(parseInt(jobId));
    res.json({
      ...profitability,
      job,
      last_calculated: new Date(),
    });
  } catch (error: any) {
    console.error('Error fetching job profitability:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch job profitability data' });
  }
});

// POST /job_profitability/:jobId/recalculate - Manually trigger profitability recalculation
// Only available to HR and Super Admin
router.post('/:jobId/recalculate', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { jobId } = req.params;
    const userRoles = req.userRoles || [];

    if (!userRoles.includes('super_admin') && !userRoles.includes('hr')) {
      return res.status(403).json({ error: 'Only HR and Super Admin can recalculate profitability' });
    }

    const jobIdNumber = parseInt(jobId);
    const profitability = await calculateJobProfitability(jobIdNumber);

    const job = await prisma.job.findUnique({
      where: { id: jobIdNumber },
      select: {
        id: true,
        jobName: true,
        managerProfileId: true,
        partnerProfileId: true,
      },
    });

    if (job) {
      const notifyJob = {
        id: job.id,
        jobName: job.jobName,
        managerProfileId: job.managerProfileId ?? undefined,
        partnerProfileId: job.partnerProfileId ?? undefined,
      };
      await notifyJobLossAlert(notifyJob, profitability.profit, profitability.profit_margin, req);
    }

    res.json({
      ...profitability,
      recalculatedAt: new Date(),
    });
  } catch (error: any) {
    console.error('Error recalculating profitability:', error);
    res.status(500).json({ error: error.message || 'Failed to recalculate profitability' });
  }
});

export default router;
