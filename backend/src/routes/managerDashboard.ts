// This file defines the routes for the manager dashboard, providing endpoints for managers to view their team overview, job portfolio, approval chains, financial summaries, and performance evaluations. The routes are protected by authentication middleware and ensure that only users with appropriate managerial roles can access the data. The endpoints aggregate data from various sources to present a comprehensive dashboard experience for managers.

import { Router } from 'express';
import prisma from '../prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { resolveRequestAccessRoles } from '../auth/accessRoles';
import { getDashboardModuleCoverageSummary } from '../services/performanceFramework.service';
import JobPerformanceFactsService from '../services/jobPerformanceFacts.service';
import { logger, toLogContext } from '../lib/logger';

const router = Router();

const allowedManagerRoles = new Set([
  'manager',
  'super_admin',
  'hr',
  'gmp',
]);

const buildTrackingPath = (jobId: number) => `/jobs/${jobId}/tracking`;

const getManagerContext = async (req: AuthRequest) => {
  const userId = req.user?.userId;
  if (!userId) {
    return { error: { status: 401, message: 'Unauthorized' } };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      roles: { include: { role: true } },
      profile: { include: { role: true, department: true } },
    },
  });

  if (!user?.profile) {
    return { error: { status: 404, message: 'User profile not found' } };
  }

  const roles = resolveRequestAccessRoles(req);
  const isManager = roles.some((role) => allowedManagerRoles.has(role));

  if (!isManager) {
    return { error: { status: 403, message: 'Access denied. Manager role required.' } };
  }

  return { user, profile: user.profile, roles };
};

// GET /manager-dashboard/team
// Get manager's direct reports and team overview
router.get('/team', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const context = await getManagerContext(req);
    if (context.error) {
      return res.status(context.error.status).json({ error: context.error.message });
    }

    const profileId = context.profile.id;

    const teamMembers = await prisma.profile.findMany({
      where: { managerId: profileId },
      include: {
        role: { select: { name: true } },
        department: { select: { name: true } },
      },
      orderBy: { lastName: 'asc' },
    });

    const teamMemberIds = teamMembers.map((member) => member.id);

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [managerFacts, monthFacts] = await Promise.all([
      JobPerformanceFactsService.listFacts({}, { type: 'manager', profileId }),
      JobPerformanceFactsService.listFacts({ dateFrom: monthStart }, { type: 'manager', profileId }),
    ]);
    const teamMemberSet = new Set(teamMemberIds);
    const teamFacts = managerFacts.flatMap((fact) =>
      fact.employees.filter((employee) => teamMemberSet.has(employee.employeeProfileId))
    );
    const monthlyTeamFacts = monthFacts.flatMap((fact) =>
      fact.employees.filter((employee) => teamMemberSet.has(employee.employeeProfileId))
    );

    const performanceScores = await prisma.performanceScore.findMany({
      where: { employeeProfileId: { in: teamMemberIds } },
      select: {
        employeeProfileId: true,
        financialWeighted: true,
        nonFinancialWeighted: true,
        totalScore: true,
        calculatedAt: true,
      },
      orderBy: { calculatedAt: 'desc' },
    });

    const performanceByEmployee = new Map<number, typeof performanceScores>();
    performanceScores.forEach((score) => {
      const existing = performanceByEmployee.get(score.employeeProfileId) || [];
      existing.push(score);
      performanceByEmployee.set(score.employeeProfileId, existing);
    });

    const monthlyHoursByEmployee = new Map<number, { total: number; billable: number }>();
    monthlyTeamFacts.forEach((entry) => {
      const current = monthlyHoursByEmployee.get(entry.employeeProfileId) || { total: 0, billable: 0 };
      current.total += entry.totalHours;
      current.billable += entry.billableHours;
      monthlyHoursByEmployee.set(entry.employeeProfileId, current);
    });

    const performance = teamMembers.map((member) => {
      const monthlyHours = monthlyHoursByEmployee.get(member.id) || { total: 0, billable: 0 };
      const scores = performanceByEmployee.get(member.id) || [];
      const avg = (values: number[]) =>
        values.length ? values.reduce((sum, val) => sum + val, 0) / values.length : 0;

      const financialScores = scores.map((score) => Number(score.financialWeighted || 0));
      const nonFinancialScores = scores.map((score) => Number(score.nonFinancialWeighted || 0));
      const overallScores = scores.map((score) => Number(score.totalScore || 0));

      const utilization = monthlyHours.total > 0
        ? Math.round((monthlyHours.billable / monthlyHours.total) * 100)
        : 0;

      return {
        employeeId: member.id,
        employeeName: `${member.firstName} ${member.lastName}`.trim(),
        jobPosition: member.positionTitle ?? member.role?.name ?? 'Employee',
        avgFinancialScore: avg(financialScores),
        avgNonFinancialScore: avg(nonFinancialScores),
        avgOverallRating: avg(overallScores),
        totalHoursThisMonth: monthlyHours.total,
        billableHoursThisMonth: monthlyHours.billable,
        utilizationRate: utilization,
        lastReviewDate: scores[0]?.calculatedAt ?? null,
      };
    });

    return res.json({
      teamMembers: teamMembers.map((member) => ({
        employeeId: member.id,
        firstName: member.firstName,
        lastName: member.lastName,
        jobPosition: member.positionTitle ?? member.role?.name ?? 'Employee',
        departmentName: member.department?.name ?? null,
        status: member.status,
        roleName: member.role?.name ?? null,
        hireDate: member.hireDate ?? null,
      })),
      financials: {
        activeTeamMembers: teamMembers.length,
        totalTeamHours: teamFacts.reduce((sum, fact) => sum + fact.totalHours, 0),
        billableHours: teamFacts.reduce((sum, fact) => sum + fact.billableHours, 0),
        nonBillableHours: teamFacts.reduce((sum, fact) => sum + fact.nonBillableHours, 0),
        totalRevenue: managerFacts.reduce((sum, fact) => sum + fact.collectedRevenue, 0),
        billableValue: managerFacts.reduce((sum, fact) => sum + fact.billableValue, 0),
        billedRevenue: managerFacts.reduce((sum, fact) => sum + fact.billedRevenue, 0),
        collectedRevenue: managerFacts.reduce((sum, fact) => sum + fact.collectedRevenue, 0),
        totalCost: teamFacts.reduce((sum, fact) => sum + fact.actualCost, 0),
      },
      performance,
    });
  } catch (error: any) {
    logger.error('manager_dashboard_team_error', toLogContext(error));
    return res.status(500).json({ error: error.message });
  }
});

// GET /manager-dashboard/jobs
// Get manager's job portfolio
router.get('/jobs', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const context = await getManagerContext(req);
    if (context.error) {
      return res.status(context.error.status).json({ error: context.error.message });
    }

    const profileId = context.profile.id;

    const jobs = await prisma.job.findMany({
      where: { managerProfileId: profileId },
      include: {
        client: { select: { clientName: true } },
        department: { select: { name: true } },
        jobCosting: {
          select: {
            id: true,
            jobFee: true,
            totalEstimatedCost: true,
            totalEstimatedHours: true,
            costingStatus: true,
            budgetCap: { select: { totalAllocatedHours: true } },
          },
        },
      },
      orderBy: { jobName: 'asc' },
    });

    const jobIds = jobs.map((job) => job.id);
    const [facts, approvalGroups, overBudgetGroups, latestApprovalRows] = await Promise.all([
      JobPerformanceFactsService.listFacts({ jobIds }, { type: 'manager', profileId }),
      prisma.timeEntryApprovalRequest.groupBy({
        by: ['jobId', 'status'],
        where: { jobId: { in: jobIds } },
        _count: { _all: true },
      }),
      prisma.timeOverBudgetRequest.groupBy({
        by: ['jobId', 'status'],
        where: { jobId: { in: jobIds } },
        _count: { _all: true },
      }),
      prisma.timeEntryApprovalRequest.findMany({
        where: { jobId: { in: jobIds } },
        select: {
          id: true,
          jobId: true,
          status: true,
          requestType: true,
          requestedAt: true,
          approvedAt: true,
          approver: { select: { firstName: true, lastName: true } },
        },
        orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
        take: 300,
      }),
    ]);

    const factsByJob = new Map(facts.map((fact) => [fact.jobId, fact]));

    type ApprovalChainCounter = {
      pending: number;
      approved: number;
      rejected: number;
      cancelled: number;
      overBudgetPending: number;
      awaitingPartner: number;
      overBudgetPartnerApproved: number;
      overBudgetPartnerRejected: number;
      latestStatus: string | null;
      latestRequestedAt: Date | null;
      latestApprovedAt: Date | null;
      latestApproverName: string | null;
      latestRequestType: string | null;
    };

    const approvalChainByJob = new Map<number, ApprovalChainCounter>();
    const ensureApprovalCounter = (jobId: number) => {
      const existing = approvalChainByJob.get(jobId);
      if (existing) return existing;
      const seeded: ApprovalChainCounter = {
        pending: 0,
        approved: 0,
        rejected: 0,
        cancelled: 0,
        overBudgetPending: 0,
        awaitingPartner: 0,
        overBudgetPartnerApproved: 0,
        overBudgetPartnerRejected: 0,
        latestStatus: null,
        latestRequestedAt: null,
        latestApprovedAt: null,
        latestApproverName: null,
        latestRequestType: null,
      };
      approvalChainByJob.set(jobId, seeded);
      return seeded;
    };

    approvalGroups.forEach((group) => {
      const counter = ensureApprovalCounter(group.jobId);
      const count = Number(group._count?._all || 0);
      if (group.status === 'pending') counter.pending += count;
      if (group.status === 'approved') counter.approved += count;
      if (group.status === 'rejected') counter.rejected += count;
      if (group.status === 'cancelled') counter.cancelled += count;
    });

    overBudgetGroups.forEach((group) => {
      const counter = ensureApprovalCounter(group.jobId);
      const count = Number(group._count?._all || 0);
      if (group.status === 'pending') counter.overBudgetPending += count;
      if (group.status === 'manager_approved') counter.awaitingPartner += count;
      if (group.status === 'partner_approved') counter.overBudgetPartnerApproved += count;
      if (group.status === 'partner_rejected') counter.overBudgetPartnerRejected += count;
    });

    latestApprovalRows.forEach((row) => {
      const counter = ensureApprovalCounter(row.jobId);
      if (counter.latestRequestedAt) return;
      counter.latestStatus = row.status;
      counter.latestRequestedAt = row.requestedAt;
      counter.latestApprovedAt = row.approvedAt;
      counter.latestRequestType = row.requestType;
      counter.latestApproverName = row.approver
        ? `${row.approver.firstName} ${row.approver.lastName}`.trim()
        : null;
    });

    const portfolio = jobs.map((job) => {
      const fact = factsByJob.get(job.id);
      const actualHours = fact?.totalHours ?? 0;
      const revenue = fact?.collectedRevenue ?? 0;
      const cost = fact?.actualCost ?? 0;
      const budgetHours = Number(
        fact?.budgetHours ??
          job.jobCosting?.budgetCap?.totalAllocatedHours ??
          job.jobCosting?.totalEstimatedHours ??
          job.budgetHours ??
          0
      );
      const budgetUtilization = fact?.budgetUsedPercent ?? (budgetHours > 0 ? Math.round((actualHours / budgetHours) * 100) : 0);
      const approvalChain = approvalChainByJob.get(job.id) || ensureApprovalCounter(job.id);
      const plannedCost = Number(job.jobCosting?.totalEstimatedCost || 0);
      const plannedHours = Number(
        job.jobCosting?.totalEstimatedHours ??
          job.jobCosting?.budgetCap?.totalAllocatedHours ??
          job.budgetHours ??
          0
      );
      const feeCap = Number(job.jobCosting?.jobFee || (job.billingType === 'fixed_fee' ? job.fixedFeeAmount : 0) || 0);
      const costVariance = cost - plannedCost;
      const hoursVariance = actualHours - plannedHours;
      const costVariancePct = plannedCost > 0 ? (costVariance / plannedCost) * 100 : 0;
      const hoursVariancePct = plannedHours > 0 ? (hoursVariance / plannedHours) * 100 : 0;
      const remainingFeeBuffer = feeCap > 0 ? feeCap - cost : 0;
      const pendingApprovalTotal =
        approvalChain.pending + approvalChain.overBudgetPending + approvalChain.awaitingPartner;

      return {
        jobId: job.id,
        trackingPath: buildTrackingPath(job.id),
        title: job.jobName,
        jobNumber: job.jobCode,
        status: job.status,
        billingType: job.billingType,
        budgetHours,
        actualHours,
        revenue,
        billableValue: fact?.billableValue ?? 0,
        billedRevenue: fact?.billedRevenue ?? 0,
        collectedRevenue: fact?.collectedRevenue ?? 0,
        billableHours: fact?.billableHours ?? 0,
        nonBillableHours: fact?.nonBillableHours ?? 0,
        cost,
        budgetUtilization,
        costingStatus: job.jobCosting?.costingStatus ?? 'missing',
        costingFee: Number(job.jobCosting?.jobFee || 0),
        costingEstimatedCost: Number(job.jobCosting?.totalEstimatedCost || 0),
        costingEstimatedHours: Number(job.jobCosting?.totalEstimatedHours || 0),
        clientName: job.client?.clientName ?? 'Unassigned',
        departmentName: job.department?.name ?? null,
        startDate: job.startDate,
        dueDate: job.dueDate,
        completionPercentage: job.status === 'completed' ? 100 : budgetUtilization,
        plannedCost,
        plannedHours,
        actualCost: cost,
        costVariance,
        hoursVariance,
        costVariancePct,
        hoursVariancePct,
        feeCap,
        remainingFeeBuffer,
        isOverPlannedCost: plannedCost > 0 ? cost > plannedCost : false,
        isOverPlannedHours: plannedHours > 0 ? actualHours > plannedHours : false,
        isOverFeeCap: feeCap > 0 ? cost > feeCap : false,
        pendingApprovalTotal,
        approvalChain: {
          pending: approvalChain.pending,
          approved: approvalChain.approved,
          rejected: approvalChain.rejected,
          cancelled: approvalChain.cancelled,
          overBudgetPending: approvalChain.overBudgetPending,
          awaitingPartner: approvalChain.awaitingPartner,
          partnerApproved: approvalChain.overBudgetPartnerApproved,
          partnerRejected: approvalChain.overBudgetPartnerRejected,
          latestStatus: approvalChain.latestStatus,
          latestRequestedAt: approvalChain.latestRequestedAt,
          latestApprovedAt: approvalChain.latestApprovedAt,
          latestApproverName: approvalChain.latestApproverName,
          latestRequestType: approvalChain.latestRequestType,
        },
      };
    });

    const controls = portfolio.reduce(
      (acc, job) => {
        acc.totalJobs += 1;
        acc.totalPlannedCost += Number(job.plannedCost || 0);
        acc.totalActualCost += Number(job.actualCost || 0);
        acc.totalPlannedHours += Number(job.plannedHours || 0);
        acc.totalActualHours += Number(job.actualHours || 0);
        acc.totalPendingApprovals += Number(job.pendingApprovalTotal || 0);
        if (job.isOverPlannedCost) acc.jobsOverPlannedCost += 1;
        if (job.isOverPlannedHours) acc.jobsOverPlannedHours += 1;
        if (job.isOverFeeCap) acc.jobsOverFeeCap += 1;
        if ((job.approvalChain?.awaitingPartner || 0) > 0) acc.jobsAwaitingPartner += 1;
        return acc;
      },
      {
        totalJobs: 0,
        totalPlannedCost: 0,
        totalActualCost: 0,
        totalPlannedHours: 0,
        totalActualHours: 0,
        totalPendingApprovals: 0,
        jobsOverPlannedCost: 0,
        jobsOverPlannedHours: 0,
        jobsOverFeeCap: 0,
        jobsAwaitingPartner: 0,
      }
    );
    const costVariance = controls.totalActualCost - controls.totalPlannedCost;
    const hoursVariance = controls.totalActualHours - controls.totalPlannedHours;

    return res.json({
      portfolio,
      teamJobs: [],
      controls: {
        ...controls,
        totalCostVariance: costVariance,
        totalHoursVariance: hoursVariance,
        totalCostVariancePct:
          controls.totalPlannedCost > 0 ? (costVariance / controls.totalPlannedCost) * 100 : 0,
        totalHoursVariancePct:
          controls.totalPlannedHours > 0 ? (hoursVariance / controls.totalPlannedHours) * 100 : 0,
      },
    });
  } catch (error: any) {
    logger.error('manager_dashboard_jobs_error', toLogContext(error));
    return res.status(500).json({ error: error.message });
  }
});

// GET /manager-dashboard/approval-chain
// Detailed approval chain visibility for manager-owned jobs
router.get('/approval-chain', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const context = await getManagerContext(req);
    if (context.error) {
      return res.status(context.error.status).json({ error: context.error.message });
    }

    const profileId = context.profile.id;
    const requestedJobId = req.query.jobId ? Number(req.query.jobId) : undefined;
    const jobFilter = Number.isFinite(requestedJobId) && requestedJobId! > 0 ? { id: requestedJobId } : {};

    const managedJobs = await prisma.job.findMany({
      where: { managerProfileId: profileId, ...jobFilter },
      select: {
        id: true,
        jobName: true,
        jobCode: true,
        client: { select: { id: true, clientName: true } },
        partner: { select: { firstName: true, lastName: true } },
      },
      orderBy: { jobName: 'asc' },
    });

    if (requestedJobId && managedJobs.length === 0) {
      return res.status(404).json({ error: 'Job not found in manager portfolio' });
    }

    const jobIds = managedJobs.map((job) => job.id);
    if (jobIds.length === 0) {
      return res.json({
        jobs: [],
        summary: {
          pending: 0,
          approved: 0,
          rejected: 0,
          cancelled: 0,
          overBudgetPending: 0,
          awaitingPartner: 0,
          managerRejected: 0,
          partnerApproved: 0,
          partnerRejected: 0,
          autoRejected: 0,
        },
        standardRequests: [],
        overBudgetRequests: [],
      });
    }

    const [standardRequests, overBudgetRequests] = await Promise.all([
      prisma.timeEntryApprovalRequest.findMany({
        where: { jobId: { in: jobIds } },
        orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
        include: {
          job: { select: { id: true, jobName: true, jobCode: true, client: { select: { id: true, clientName: true } } } },
          employee: { select: { id: true, firstName: true, lastName: true } },
          approver: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      prisma.timeOverBudgetRequest.findMany({
        where: { jobId: { in: jobIds } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: {
          job: { select: { id: true, jobName: true, jobCode: true, client: { select: { id: true, clientName: true } } } },
          employee: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
    ]);

    const summary = {
      pending: 0,
      approved: 0,
      rejected: 0,
      cancelled: 0,
      overBudgetPending: 0,
      awaitingPartner: 0,
      managerRejected: 0,
      partnerApproved: 0,
      partnerRejected: 0,
      autoRejected: 0,
    };

    standardRequests.forEach((item) => {
      if (item.status === 'pending') summary.pending += 1;
      if (item.status === 'approved') summary.approved += 1;
      if (item.status === 'rejected') summary.rejected += 1;
      if (item.status === 'cancelled') summary.cancelled += 1;
    });

    overBudgetRequests.forEach((item) => {
      if (item.status === 'pending') summary.overBudgetPending += 1;
      if (item.status === 'manager_approved') summary.awaitingPartner += 1;
      if (item.status === 'manager_rejected') summary.managerRejected += 1;
      if (item.status === 'partner_approved') summary.partnerApproved += 1;
      if (item.status === 'partner_rejected') summary.partnerRejected += 1;
      if (item.status === 'auto_rejected') summary.autoRejected += 1;
    });

    return res.json({
      jobs: managedJobs.map((job) => ({
        jobId: job.id,
        trackingPath: buildTrackingPath(job.id),
        jobName: job.jobName,
        jobCode: job.jobCode,
        clientName: job.client?.clientName ?? null,
        partnerName: job.partner
          ? `${job.partner.firstName} ${job.partner.lastName}`.trim()
          : null,
      })),
      summary,
      standardRequests: standardRequests.map((item) => ({
        id: item.id,
        jobId: item.jobId,
        trackingPath: buildTrackingPath(item.jobId),
        jobName: item.job.jobName,
        jobCode: item.job.jobCode,
        clientName: item.job.client?.clientName ?? null,
        employeeName: `${item.employee.firstName} ${item.employee.lastName}`.trim(),
        status: item.status,
        requestType: item.requestType,
        currentAllocatedHours: Number(item.currentAllocatedHours || 0),
        currentLoggedHours: Number(item.currentLoggedHours || 0),
        additionalHoursRequested: Number(item.additionalHoursRequested || 0),
        justification: item.justification,
        approvalNotes: item.approvalNotes,
        requestedAt: item.requestedAt,
        approvedAt: item.approvedAt,
        approverName: item.approver
          ? `${item.approver.firstName} ${item.approver.lastName}`.trim()
          : null,
      })),
      overBudgetRequests: overBudgetRequests.map((item) => ({
        id: item.id,
        jobId: item.jobId,
        trackingPath: buildTrackingPath(item.jobId),
        jobName: item.job.jobName,
        jobCode: item.job.jobCode,
        clientName: item.job.client?.clientName ?? null,
        employeeName: `${item.employee.firstName} ${item.employee.lastName}`.trim(),
        status: item.status,
        billableType: item.billableType,
        allocatedHours: Number(item.allocatedHours || 0),
        loggedHours: Number(item.loggedHours || 0),
        requestedAdditional: Number(item.requestedAdditional || 0),
        totalAfterRequest: Number(item.totalAfterRequest || 0),
        requiresPartnerApproval: Boolean(item.requiresPartnerApproval),
        managerApproved: Boolean(item.managerApproved),
        partnerApproved: Boolean(item.partnerApproved),
        wouldExceedBudget: Boolean(item.wouldExceedBudget),
        estimatedCostImpact: Number(item.estimatedCostImpact || 0),
        approvalNotes: item.approvalNotes,
        rejectionReason: item.rejectionReason,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
    });
  } catch (error: any) {
    logger.error('manager_dashboard_approval_chain_error', toLogContext(error));
    return res.status(500).json({ error: error.message });
  }
});

// GET /manager-dashboard/financials
// Get manager's financial summary
router.get('/financials', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const context = await getManagerContext(req);
    if (context.error) {
      return res.status(context.error.status).json({ error: context.error.message });
    }

    const profileId = context.profile.id;

    const sinceDate = new Date();
    sinceDate.setMonth(sinceDate.getMonth() - 12);

    const monthStarts = Array.from({ length: 12 }, (_, index) => {
      const month = new Date(sinceDate.getFullYear(), sinceDate.getMonth() + index, 1);
      month.setHours(0, 0, 0, 0);
      return month;
    });

    const monthlyFacts = await Promise.all(
      monthStarts.map((monthStart) => {
        const monthEnd = new Date(monthStart);
        monthEnd.setMonth(monthEnd.getMonth() + 1);
        return JobPerformanceFactsService.listFacts(
          { dateFrom: monthStart, dateTo: monthEnd },
          { type: 'manager', profileId }
        );
      })
    );

    const monthlyFinancials = monthlyFacts
      .map((facts, index) => {
        const month = monthStarts[index].toISOString().slice(0, 10);
        return {
          month,
          revenue: facts.reduce((sum, fact) => sum + fact.collectedRevenue, 0),
          billableValue: facts.reduce((sum, fact) => sum + fact.billableValue, 0),
          billedRevenue: facts.reduce((sum, fact) => sum + fact.billedRevenue, 0),
          collectedRevenue: facts.reduce((sum, fact) => sum + fact.collectedRevenue, 0),
          cost: facts.reduce((sum, fact) => sum + fact.actualCost, 0),
          totalHours: facts.reduce((sum, fact) => sum + fact.totalHours, 0),
          billableHours: facts.reduce((sum, fact) => sum + fact.billableHours, 0),
          nonBillableHours: facts.reduce((sum, fact) => sum + fact.nonBillableHours, 0),
        };
      })
      .sort((a, b) => (a.month < b.month ? 1 : -1));

    const currentFacts = await JobPerformanceFactsService.listFacts({}, { type: 'manager', profileId });
    const jobProfitability = currentFacts.map((fact) => ({
      jobId: fact.jobId,
      trackingPath: buildTrackingPath(fact.jobId),
      jobName: fact.jobName,
      jobCode: fact.jobCode,
      clientName: fact.clientName ?? 'Unassigned',
      revenue: fact.collectedRevenue,
      billableValue: fact.billableValue,
      billedRevenue: fact.billedRevenue,
      collectedRevenue: fact.collectedRevenue,
      cost: fact.actualCost,
      profit: fact.cashProfit,
    }));

    const teamMembers = await prisma.profile.findMany({
      where: { managerId: profileId, status: 'active' },
      include: { role: { select: { name: true } } },
    });

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthEnd = new Date(monthStart);
    monthEnd.setMonth(monthEnd.getMonth() + 1);

    const contributionsMap = new Map<number, { revenue: number; totalHours: number; billableHours: number }>();
    const currentMonthFacts = await JobPerformanceFactsService.listFacts(
      { dateFrom: monthStart, dateTo: monthEnd },
      { type: 'manager', profileId }
    );
    currentMonthFacts.flatMap((fact) => fact.employees).forEach((entry) => {
      const current = contributionsMap.get(entry.employeeProfileId) || {
        revenue: 0,
        totalHours: 0,
        billableHours: 0,
      };
      current.revenue += entry.billableValue;
      current.totalHours += entry.totalHours;
      current.billableHours += entry.billableHours;
      contributionsMap.set(entry.employeeProfileId, current);
    });

    const teamContributions = teamMembers.map((member) => {
      const totals = contributionsMap.get(member.id) || { revenue: 0, totalHours: 0, billableHours: 0 };
      return {
        employeeName: `${member.firstName} ${member.lastName}`.trim(),
        roleName: member.role?.name ?? null,
        revenueContribution: totals.revenue,
        totalHours: totals.totalHours,
        billableHours: totals.billableHours,
      };
    });

    return res.json({
      monthlyFinancials,
      jobProfitability,
      teamContributions,
    });
  } catch (error: any) {
    logger.error('manager_dashboard_financials_error', toLogContext(error));
    return res.status(500).json({ error: error.message });
  }
});

// GET /manager-dashboard/evaluations
// Get pending evaluations and team performance data
router.get('/evaluations', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const context = await getManagerContext(req);
    if (context.error) {
      return res.status(context.error.status).json({ error: context.error.message });
    }

    const profileId = context.profile.id;

    const pendingReviews = await prisma.evaluationAssignment.findMany({
      where: {
        evaluatorProfileId: profileId,
        status: 'pending',
      },
      include: {
        evaluatee: {
          select: { id: true, firstName: true, lastName: true, positionTitle: true },
        },
        definition: {
          select: { name: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const teamGoals: any[] = [];

    const recentPerformance = await prisma.performanceScore.findMany({
      where: {
        employee: { managerId: profileId },
        calculatedAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
      },
      include: {
        employee: { select: { firstName: true, lastName: true, positionTitle: true } },
      },
      orderBy: { calculatedAt: 'desc' },
    });

    return res.json({
      pendingReviews,
      teamGoals,
      recentPerformance,
    });
  } catch (error: any) {
    logger.error('manager_dashboard_evaluations_error', toLogContext(error));
    return res.status(500).json({ error: error.message });
  }
});

// GET /manager-dashboard/overview
// Get high-level dashboard overview metrics
router.get('/overview', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const context = await getManagerContext(req);
    if (context.error) {
      return res.status(context.error.status).json({ error: context.error.message });
    }

    const profileId = context.profile.id;

    const teamSize = await prisma.profile.count({
      where: { managerId: profileId, status: 'active' },
    });

    const activeJobs = await prisma.job.count({
      where: {
        managerProfileId: profileId,
        status: { in: ['planned', 'in_progress', 'on_hold'] },
      },
    });

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthEnd = new Date(monthStart);
    monthEnd.setMonth(monthEnd.getMonth() + 1);

    const monthFacts = await JobPerformanceFactsService.listFacts(
      { dateFrom: monthStart, dateTo: monthEnd },
      { type: 'manager', profileId }
    );
    const totalHours = monthFacts.reduce((sum, fact) => sum + fact.totalHours, 0);
    const billableHours = monthFacts.reduce((sum, fact) => sum + fact.billableHours, 0);
    const utilizationRate = totalHours > 0 ? Math.round((billableHours / totalHours) * 100) : 0;

    const pendingReviews = await prisma.evaluationAssignment.count({
      where: {
        evaluatorProfileId: profileId,
        status: 'pending',
      },
    });

    const monthlyRevenue = monthFacts.reduce((sum, fact) => sum + fact.collectedRevenue, 0);
    const monthlyProfit = monthFacts.reduce((sum, fact) => sum + fact.cashProfit, 0);

    return res.json({
      teamSize,
      activeJobs,
      monthlyRevenue,
      monthlyProfit,
      utilizationRate,
      pendingReviews,
      framework: getDashboardModuleCoverageSummary("manager"),
    });
  } catch (error: any) {
    logger.error('manager_dashboard_overview_error', toLogContext(error));
    return res.status(500).json({ error: error.message });
  }
});

export default router;
