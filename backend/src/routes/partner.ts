import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware as mainAuthMiddleware } from '../middleware/auth';
import {
  authMiddleware,
  requirePartner,
  checkJobAccess,
  canApproveTimeEntries,
  canViewPartnerPortfolio,
} from '../middleware/partner-auth';
import { FinancialService } from '../services/financial.service';

const router = Router();
const prisma = new PrismaClient();

// Apply main JWT auth middleware first, then partner auth middleware
router.use(mainAuthMiddleware);
router.use(authMiddleware);

/**
 * GET /api/partner/portfolio
 * Get partner's portfolio overview with aggregate metrics
 */
router.get('/portfolio', requirePartner, async (req: Request, res: Response): Promise<void> => {
  try {
    const partnerId = req.authContext?.partnerId;

    if (!partnerId) {
      res.status(400).json({ error: 'Partner ID not found' });
      return;
    }

    const metrics = await FinancialService.calculatePartnerPortfolioMetrics(partnerId);
    res.json(metrics);
  } catch (error) {
    console.error('Portfolio metrics error:', error);
    res.status(500).json({ error: 'Failed to load portfolio metrics' });
  }
});

/**
 * GET /api/partner/jobs
 * Get all jobs for partner with financial metrics
 */
router.get('/jobs', requirePartner, async (req: Request, res: Response): Promise<void> => {
  try {
    const partnerId = req.authContext?.partnerId;

    if (!partnerId) {
      res.status(400).json({ error: 'Partner ID not found' });
      return;
    }

    const jobs = await FinancialService.getPartnerJobsWithMetrics(partnerId);
    res.json(jobs);
  } catch (error) {
    console.error('Get jobs error:', error);
    res.status(500).json({ error: 'Failed to load jobs' });
  }
});

/**
 * GET /api/partner/jobs/:jobId
 * Get specific job with full financial metrics
 */
router.get(
  '/jobs/:jobId',
  requirePartner,
  checkJobAccess,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const jobId = parseInt(req.params.jobId);

      // Get job details
      const job = await prisma.job.findUnique({
        where: { id: jobId },
        include: {
          tasks: true,
          timeEntries: {
            where: { status: 'approved' },
            include: {
              employee: {
                select: {
                  id: true,
                  first_name: true,
                  last_name: true,
                  role: { select: { id: true, name: true, billing_rate: true } },
                },
              },
            },
          },
        },
      });

      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      // Fetch client info separately
      let clientName = '';
      if (job.client_id) {
        try {
          const client = await prisma.client.findUnique({
            where: { id: job.client_id },
            select: { client_name: true },
          });
          clientName = client?.client_name || '';
        } catch (error) {
          // Client relation might not exist, continue without it
        }
      }

      // Calculate metrics
      const metrics = await FinancialService.calculateJobMetrics(jobId);

      res.json({
        ...job,
        clientName,
        metrics,
      });
    } catch (error) {
      console.error('Get job error:', error);
      res.status(500).json({ error: 'Failed to load job details' });
    }
  }
);

/**
 * GET /api/partner/jobs/:jobId/team
 * Get team utilization for a job
 */
router.get(
  '/jobs/:jobId/team',
  requirePartner,
  checkJobAccess,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const jobId = parseInt(req.params.jobId);
      const team = await FinancialService.getJobTeamUtilization(jobId);
      res.json(team);
    } catch (error) {
      console.error('Get team utilization error:', error);
      res.status(500).json({ error: 'Failed to load team data' });
    }
  }
);

/**
 * GET /api/partner/jobs/:jobId/time-entries
 * Get time entries for a job (pending and approved)
 */
router.get(
  '/jobs/:jobId/time-entries',
  requirePartner,
  checkJobAccess,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const jobId = parseInt(req.params.jobId);
      const status = req.query.status as string | undefined;

      const timeEntries = await prisma.timeEntry.findMany({
        where: {
          job_id: jobId,
          ...(status && { status }),
        },
        include: {
          employee: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              role: { select: { id: true, name: true, billing_rate: true } },
            },
          },
          task: {
            select: {
              id: true,
              title: true,
            },
          },
        },
        orderBy: { date_worked: 'desc' },
      });

      res.json(timeEntries);
    } catch (error) {
      console.error('Get time entries error:', error);
      res.status(500).json({ error: 'Failed to load time entries' });
    }
  }
);

/**
 * GET /api/partner/jobs/:jobId/pending-time-entries
 * Get pending time entries for approval
 */
router.get(
  '/jobs/:jobId/pending-time-entries',
  requirePartner,
  checkJobAccess,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const jobId = parseInt(req.params.jobId);
      const pendingEntries = await FinancialService.getPendingTimeEntries(jobId);
      res.json(pendingEntries);
    } catch (error) {
      console.error('Get pending time entries error:', error);
      res.status(500).json({ error: 'Failed to load pending time entries' });
    }
  }
);

/**
 * POST /api/partner/time-entries/:entryId/approve
 * Approve a time entry
 */
router.post(
  '/time-entries/:entryId/approve',
  requirePartner,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const entryId = parseInt(req.params.entryId);
      const approverId = req.authContext?.partnerId;

      if (!approverId) {
        res.status(400).json({ error: 'Approver ID not found' });
        return;
      }

      // Get the time entry
      const entry = await prisma.timeEntry.findUnique({
        where: { id: entryId },
        select: { job_id: true },
      });

      if (!entry) {
        res.status(404).json({ error: 'Time entry not found' });
        return;
      }

      // Check if partner can approve
      const canApprove = await canApproveTimeEntries(entry.job_id, req.authContext!);
      if (!canApprove) {
        res.status(403).json({ error: 'Not authorized to approve this time entry' });
        return;
      }

      // Approve the entry
      const updated = await prisma.timeEntry.update({
        where: { id: entryId },
        data: {
          status: 'approved',
          approved_by: approverId,
          approved_at: new Date(),
        },
        include: {
          employee: {
            select: {
              first_name: true,
              last_name: true,
            },
          },
        },
      });

      // Update job financials
      await FinancialService.updateJobFinancials(entry.job_id);

      res.json({
        success: true,
        message: `Time entry approved for ${updated.employee.first_name} ${updated.employee.last_name}`,
        data: updated,
      });
    } catch (error) {
      console.error('Approve time entry error:', error);
      res.status(500).json({ error: 'Failed to approve time entry' });
    }
  }
);

/**
 * POST /api/partner/time-entries/:entryId/reject
 * Reject a time entry
 */
router.post(
  '/time-entries/:entryId/reject',
  requirePartner,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const entryId = parseInt(req.params.entryId);
      const approverId = req.authContext?.partnerId;

      if (!approverId) {
        res.status(400).json({ error: 'Approver ID not found' });
        return;
      }

      // Get the time entry
      const entry = await prisma.timeEntry.findUnique({
        where: { id: entryId },
        select: { job_id: true },
      });

      if (!entry) {
        res.status(404).json({ error: 'Time entry not found' });
        return;
      }

      // Check if partner can approve
      const canApprove = await canApproveTimeEntries(entry.job_id, req.authContext!);
      if (!canApprove) {
        res.status(403).json({ error: 'Not authorized to reject this time entry' });
        return;
      }

      // Reject the entry
      const updated = await prisma.timeEntry.update({
        where: { id: entryId },
        data: {
          status: 'rejected',
          approved_by: approverId,
          approved_at: new Date(),
        },
        include: {
          employee: {
            select: {
              first_name: true,
              last_name: true,
            },
          },
        },
      });

      res.json({
        success: true,
        message: `Time entry rejected for ${updated.employee.first_name} ${updated.employee.last_name}`,
        data: updated,
      });
    } catch (error) {
      console.error('Reject time entry error:', error);
      res.status(500).json({ error: 'Failed to reject time entry' });
    }
  }
);

/**
 * POST /api/partner/time-entries/batch-approve
 * Approve multiple time entries
 */
router.post(
  '/time-entries/batch-approve',
  requirePartner,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { timeEntryIds } = req.body;
      const approverId = req.authContext?.partnerId;

      if (!approverId) {
        res.status(400).json({ error: 'Approver ID not found' });
        return;
      }

      if (!Array.isArray(timeEntryIds) || timeEntryIds.length === 0) {
        res.status(400).json({ error: 'Invalid time entry IDs' });
        return;
      }

      // Verify all entries belong to partner's jobs
      const entries = await prisma.timeEntry.findMany({
        where: { id: { in: timeEntryIds } },
        select: { job_id: true },
      });

      // Check job access for all entries
      for (const entry of entries) {
        const canApprove = await canApproveTimeEntries(entry.job_id, req.authContext!);
        if (!canApprove) {
          res.status(403).json({ error: 'Not authorized to approve all time entries' });
          return;
        }
      }

      // Approve all entries
      await FinancialService.approveTimeEntries(timeEntryIds, approverId);

      // Update financials for affected jobs
      const jobIds = [...new Set(entries.map((e) => e.job_id))];
      for (const jobId of jobIds) {
        await FinancialService.updateJobFinancials(jobId);
      }

      res.json({
        success: true,
        message: `${timeEntryIds.length} time entries approved`,
        approvedCount: timeEntryIds.length,
      });
    } catch (error) {
      console.error('Batch approve error:', error);
      res.status(500).json({ error: 'Failed to approve time entries' });
    }
  }
);

/**
 * GET /api/partner/profile
 * Get partner's own profile and settings
 */
router.get('/profile', requirePartner, async (req: Request, res: Response): Promise<void> => {
  try {
    const partnerId = req.authContext?.partnerId;

    if (!partnerId) {
      res.status(400).json({ error: 'Partner ID not found' });
      return;
    }

    const partner = await prisma.partner.findUnique({
      where: { profile_id: partnerId },
      include: {
        profile: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true,
            role: { select: { id: true, name: true, billing_rate: true } },
            createdAt: true,
          },
        },
      },
    });

    if (!partner) {
      res.status(404).json({ error: 'Partner profile not found' });
      return;
    }

    res.json(partner);
  } catch (error) {
    console.error('Get partner profile error:', error);
    res.status(500).json({ error: 'Failed to load partner profile' });
  }
});

/**
 * PUT /api/partner/profile
 * Update partner profile and settings
 */
router.put('/profile', requirePartner, async (req: Request, res: Response): Promise<void> => {
  try {
    const partnerId = req.authContext?.partnerId;
    const { company_name, registration_number, tax_id, commission_rate } = req.body;

    if (!partnerId) {
      res.status(400).json({ error: 'Partner ID not found' });
      return;
    }

    const updated = await prisma.partner.update({
      where: { profile_id: partnerId },
      data: {
        commission_rate: commission_rate ? parseFloat(commission_rate) : undefined,
      },
    });

    res.json({
      success: true,
      message: 'Partner profile updated',
      data: updated,
    });
  } catch (error) {
    console.error('Update partner profile error:', error);
    res.status(500).json({ error: 'Failed to update partner profile' });
  }
});

/**
 * GET /api/partner/dashboard-summary
 * Get comprehensive dashboard summary
 */
router.get('/dashboard-summary', requirePartner, async (req: Request, res: Response): Promise<void> => {
  try {
    const partnerId = req.authContext?.partnerId;

    if (!partnerId) {
      res.status(400).json({ error: 'Partner ID not found' });
      return;
    }

    // Get portfolio metrics
    const portfolio = await FinancialService.calculatePartnerPortfolioMetrics(partnerId);

    // Get recent jobs
    const recentJobs = await FinancialService.getPartnerJobsWithMetrics(partnerId);
    const topJobs = recentJobs.slice(0, 5);

    // Get pending time entries
    const jobs = await prisma.job.findMany({
      where: { partner_id: partnerId },
      select: { id: true },
    });

    let pendingEntries = 0;
    for (const job of jobs) {
      const pending = await FinancialService.getPendingTimeEntries(job.id);
      pendingEntries += pending.length;
    }

    res.json({
      portfolio,
      topJobs,
      pendingTimeEntriesCount: pendingEntries,
      lastUpdated: new Date(),
    });
  } catch (error) {
    console.error('Dashboard summary error:', error);
    res.status(500).json({ error: 'Failed to load dashboard summary' });
  }
});

export default router;
