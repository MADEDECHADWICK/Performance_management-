import { Router } from 'express';
import prisma from '../prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { getDashboardModuleCoverageSummary } from '../services/performanceFramework.service';

const router = Router();

const allowedManagerRoles = new Set([
  'manager',
  'admin',
  'super_admin',
  'hr',
  'hr_manager',
]);

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

  const roles = user.roles.map((r) => r.role.name.toLowerCase());
  const roleName = user.profile.role?.name?.toLowerCase();
  const positionTitle = user.profile.positionTitle?.toLowerCase();
  const isManager =
    roles.some((role) => allowedManagerRoles.has(role)) ||
    roleName === 'manager' ||
    (positionTitle ? positionTitle.includes('manager') : false);

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

    const totalHoursAgg = await prisma.timeEntry.aggregate({
      _sum: { hours: true, billableAmount: true, costAmount: true },
      where: {
        status: 'approved',
        employeeProfileId: { in: teamMemberIds },
      },
    });

    const allocationAgg = await prisma.revenueAllocation.aggregate({
      _sum: { allocatedAmount: true, employeeProfit: true, employeeLoss: true },
      where: { employeeProfileId: { in: teamMemberIds } },
    });

    const billableHoursAgg = await prisma.timeEntry.aggregate({
      _sum: { hours: true },
      where: {
        status: 'approved',
        billable: true,
        employeeProfileId: { in: teamMemberIds },
      },
    });

    const timeEntriesThisMonth = await prisma.timeEntry.findMany({
      where: {
        status: 'approved',
        dateWorked: { gte: monthStart },
        employeeProfileId: { in: teamMemberIds },
      },
      select: {
        employeeProfileId: true,
        hours: true,
        billable: true,
      },
    });

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
    timeEntriesThisMonth.forEach((entry) => {
      const current = monthlyHoursByEmployee.get(entry.employeeProfileId) || { total: 0, billable: 0 };
      const hours = Number(entry.hours || 0);
      current.total += hours;
      if (entry.billable) current.billable += hours;
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
        totalTeamHours: Number(totalHoursAgg._sum.hours || 0),
        billableHours: Number(billableHoursAgg._sum.hours || 0),
        totalRevenue: Number(allocationAgg._sum.allocatedAmount || 0),
        totalCost: Number(totalHoursAgg._sum.costAmount || 0),
      },
      performance,
    });
  } catch (error: any) {
    console.error('Error fetching team data:', error);
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
        timeEntries: {
          where: { status: 'approved' },
          select: { hours: true, billableAmount: true, costAmount: true },
        },
      },
      orderBy: { jobName: 'asc' },
    });

    const jobIds = jobs.map((job) => job.id);
    const [allocations, approvalGroups, overBudgetGroups, latestApprovalRows] = await Promise.all([
      prisma.revenueAllocation.findMany({
        where: { jobId: { in: jobIds } },
        select: { jobId: true, allocatedAmount: true },
      }),
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

    const revenueByJob = new Map<number, number>();
    allocations.forEach((allocation) => {
      const current = revenueByJob.get(allocation.jobId) || 0;
      revenueByJob.set(allocation.jobId, current + Number(allocation.allocatedAmount || 0));
    });

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
      const actualHours = job.timeEntries.reduce((sum, entry) => sum + Number(entry.hours || 0), 0);
      const timeEntryRevenue = job.timeEntries.reduce(
        (sum, entry) => sum + Number(entry.billableAmount || 0),
        0
      );
      const revenue = revenueByJob.get(job.id) ?? timeEntryRevenue;
      const cost = job.timeEntries.reduce(
        (sum, entry) => sum + Number(entry.costAmount || 0),
        0
      );
      const budgetHours = Number(
        job.jobCosting?.budgetCap?.totalAllocatedHours ??
          job.jobCosting?.totalEstimatedHours ??
          job.budgetHours ??
          0
      );
      const budgetUtilization = budgetHours > 0 ? Math.round((actualHours / budgetHours) * 100) : 0;
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
        title: job.jobName,
        jobNumber: job.jobCode,
        status: job.status,
        billingType: job.billingType,
        budgetHours,
        actualHours,
        revenue,
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
    console.error('Error fetching job data:', error);
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
    console.error('Error fetching manager approval chain:', error);
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

    const timeEntries = await prisma.timeEntry.findMany({
      where: {
        status: 'approved',
        dateWorked: { gte: sinceDate },
        employee: { managerId: profileId },
      },
      select: {
        dateWorked: true,
        billableAmount: true,
        costAmount: true,
        hours: true,
        billable: true,
        employeeProfileId: true,
      },
    });

    const monthlyMap = new Map<string, { revenue: number; cost: number; totalHours: number; billableHours: number }>();
    timeEntries.forEach((entry) => {
      const monthKey = new Date(entry.dateWorked.getFullYear(), entry.dateWorked.getMonth(), 1)
        .toISOString()
        .slice(0, 10);
      const current = monthlyMap.get(monthKey) || { revenue: 0, cost: 0, totalHours: 0, billableHours: 0 };
      current.cost += Number(entry.costAmount || 0);
      current.totalHours += Number(entry.hours || 0);
      if (entry.billable) current.billableHours += Number(entry.hours || 0);
      monthlyMap.set(monthKey, current);
    });

    const allocations = await prisma.revenueAllocation.findMany({
      where: {
        employee: { managerId: profileId },
        allocationMonth: { gte: sinceDate },
      },
      select: {
        allocationMonth: true,
        allocatedAmount: true,
        employeeProfit: true,
        employeeLoss: true,
      },
    });

    allocations.forEach((allocation) => {
      const monthKey = new Date(allocation.allocationMonth.getFullYear(), allocation.allocationMonth.getMonth(), 1)
        .toISOString()
        .slice(0, 10);
      const current = monthlyMap.get(monthKey) || { revenue: 0, cost: 0, totalHours: 0, billableHours: 0 };
      current.revenue += Number(allocation.allocatedAmount || 0);
      monthlyMap.set(monthKey, current);
    });

    const monthlyFinancials = Array.from(monthlyMap.entries())
      .map(([month, values]) => ({ month, ...values }))
      .sort((a, b) => (a.month < b.month ? 1 : -1));

    const jobs = await prisma.job.findMany({
      where: { managerProfileId: profileId },
      include: {
        client: { select: { clientName: true } },
        timeEntries: {
          where: { status: 'approved' },
          select: { billableAmount: true, costAmount: true },
        },
      },
    });

    const jobIds = jobs.map((job) => job.id);
    const jobAllocations = await prisma.revenueAllocation.findMany({
      where: { jobId: { in: jobIds } },
      select: { jobId: true, allocatedAmount: true },
    });

    const revenueByJob = new Map<number, number>();
    jobAllocations.forEach((allocation) => {
      const current = revenueByJob.get(allocation.jobId) || 0;
      revenueByJob.set(allocation.jobId, current + Number(allocation.allocatedAmount || 0));
    });

    const jobProfitability = jobs.map((job) => {
      const timeEntryRevenue = job.timeEntries.reduce((sum, entry) => sum + Number(entry.billableAmount || 0), 0);
      const revenue = revenueByJob.get(job.id) ?? timeEntryRevenue;
      const cost = job.timeEntries.reduce((sum, entry) => sum + Number(entry.costAmount || 0), 0);
      return {
        jobName: job.jobName,
        jobCode: job.jobCode,
        clientName: job.client?.clientName ?? 'Unassigned',
        revenue,
        cost,
        profit: revenue - cost,
      };
    });

    const teamMembers = await prisma.profile.findMany({
      where: { managerId: profileId, status: 'active' },
      include: { role: { select: { name: true } } },
    });

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const memberEntries = await prisma.timeEntry.findMany({
      where: {
        status: 'approved',
        dateWorked: { gte: monthStart },
        employeeProfileId: { in: teamMembers.map((m) => m.id) },
      },
      select: { employeeProfileId: true, billableAmount: true, hours: true, billable: true },
    });

    const contributionsMap = new Map<number, { revenue: number; totalHours: number; billableHours: number }>();
    memberEntries.forEach((entry) => {
      const current = contributionsMap.get(entry.employeeProfileId) || {
        revenue: 0,
        totalHours: 0,
        billableHours: 0,
      };
      current.totalHours += Number(entry.hours || 0);
      if (entry.billable) current.billableHours += Number(entry.hours || 0);
      contributionsMap.set(entry.employeeProfileId, current);
    });

    const monthEnd = new Date(monthStart);
    monthEnd.setMonth(monthEnd.getMonth() + 1);

    const allocationContributions = await prisma.revenueAllocation.findMany({
      where: {
        employeeProfileId: { in: teamMembers.map((m) => m.id) },
        allocationMonth: { gte: monthStart, lt: monthEnd },
      },
      select: { employeeProfileId: true, allocatedAmount: true },
    });

    allocationContributions.forEach((allocation) => {
      const current = contributionsMap.get(allocation.employeeProfileId) || {
        revenue: 0,
        totalHours: 0,
        billableHours: 0,
      };
      current.revenue += Number(allocation.allocatedAmount || 0);
      contributionsMap.set(allocation.employeeProfileId, current);
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
    console.error('Error fetching financial data:', error);
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
    console.error('Error fetching evaluation data:', error);
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

    const teamMembers = await prisma.profile.findMany({
      where: { managerId: profileId, status: 'active' },
      select: { id: true },
    });
    const teamMemberIds = teamMembers.map((member) => member.id);

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

    const totals = await prisma.timeEntry.aggregate({
      _sum: { billableAmount: true, costAmount: true, hours: true },
      where: {
        status: 'approved',
        dateWorked: { gte: monthStart },
        employeeProfileId: { in: teamMemberIds },
      },
    });

    const billableTotals = await prisma.timeEntry.aggregate({
      _sum: { hours: true },
      where: {
        status: 'approved',
        billable: true,
        dateWorked: { gte: monthStart },
        employeeProfileId: { in: teamMemberIds },
      },
    });

    const totalHours = Number(totals._sum.hours || 0);
    const billableHours = Number(billableTotals._sum.hours || 0);
    const utilizationRate = totalHours > 0 ? Math.round((billableHours / totalHours) * 100) : 0;

    const pendingReviews = await prisma.evaluationAssignment.count({
      where: {
        evaluatorProfileId: profileId,
        status: 'pending',
      },
    });

    const allocationTotals = await prisma.revenueAllocation.aggregate({
      _sum: { allocatedAmount: true, employeeProfit: true, employeeLoss: true },
      where: {
        employeeProfileId: { in: teamMemberIds },
        allocationMonth: { gte: monthStart, lt: monthEnd },
      },
    });

    const monthlyRevenue = Number(allocationTotals._sum.allocatedAmount || 0);
    const monthlyProfit =
      Number(allocationTotals._sum.employeeProfit || 0) - Number(allocationTotals._sum.employeeLoss || 0);

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
    console.error('Error fetching overview data:', error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;
