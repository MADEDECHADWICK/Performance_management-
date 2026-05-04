import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import prisma from '../prisma';
import { notifyJobLossAlert } from '../services/notificationRecipients';
import { logger, toLogContext } from '../lib/logger';
import JobPerformanceFactsService from '../services/jobPerformanceFacts.service';

const router = Router();

/**
 * Job Profitability Routes
 * 
 * - profit_margin = (profit / total_revenue) × 100 if total_revenue > 0
 */

const toProfitabilityResponse = (fact: Awaited<ReturnType<typeof JobPerformanceFactsService.getJobFact>>) => ({
  job_id: fact.jobId,
  billable_value: fact.billableValue,
  billed_revenue: fact.billedRevenue,
  collected_revenue: fact.collectedRevenue,
  total_revenue: fact.collectedRevenue,
  labor_cost: fact.laborCost,
  approved_requisition_cost: fact.approvedRequisitionCost,
  recoverable_requisition_cost: fact.recoverableRequisitionCost,
  total_cost: fact.actualCost,
  work_in_progress_profit: fact.workInProgressProfit,
  billed_profit: fact.billedProfit,
  cash_profit: fact.cashProfit,
  profit: fact.cashProfit,
  profit_margin: fact.marginPercent,
  billable_hours: fact.billableHours,
  non_billable_hours: fact.nonBillableHours,
  budget_used_percent: fact.budgetUsedPercent,
  time_entries_count: fact.timeEntryCount,
});

// GET /job_profitability - Get financial metrics for all jobs
// Role-based visibility:
// - Partners: See only their own jobs
// - HR/Super Admin: See all jobs
// - Employees: Not allowed (403)
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const profileId = req.user?.profileId ? Number(req.user.profileId) : undefined;
    const userRoles = req.userRoles || [];

    logger.debug('job_profitability_list_requested', {
      userRoles,
      userId: req.user?.userId ?? null,
      profileId: req.user?.profileId ?? null,
    });

    // Check if user is admin (super_admin or hr)
    const isAdmin = userRoles.includes('super_admin') || userRoles.includes('hr');
    const isPartner = userRoles.includes('partner');

    let facts;

    if (isAdmin) {
      facts = await JobPerformanceFactsService.listFacts({}, { type: 'firm' });
    } else if (isPartner) {
      facts = await JobPerformanceFactsService.listFacts(
        {},
        { type: 'partner', profileId: profileId ?? 0 }
      );
    } else {
      return res.status(403).json({ error: 'Access denied. Only partners, HR, and Super Admin can view job profitability.' });
    }

    const profitability = facts.map(toProfitabilityResponse);

    res.json(profitability);
  } catch (error: any) {
    logger.error('job_profitability_list_failed', toLogContext(error));
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

    const fact = await JobPerformanceFactsService.getJobFact(parseInt(jobId));
    const profitability = toProfitabilityResponse(fact);
    res.json({
      ...profitability,
      job,
      last_calculated: new Date(),
    });
  } catch (error: any) {
    logger.error('job_profitability_detail_failed', {
      jobId: Number(req.params.jobId),
      ...toLogContext(error),
    });
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
    const fact = await JobPerformanceFactsService.getJobFact(jobIdNumber);
    const profitability = toProfitabilityResponse(fact);

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
    logger.error('job_profitability_recalculate_failed', {
      jobId: Number(req.params.jobId),
      ...toLogContext(error),
    });
    res.status(500).json({ error: error.message || 'Failed to recalculate profitability' });
  }
});

export default router;
