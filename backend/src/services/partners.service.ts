import { prisma } from '../prisma';
import JobPerformanceFactsService from './jobPerformanceFacts.service';

interface AuthContext {
  userId: number;
  profileId: number;
  roleName?: string;
}

interface ListOptions {
  page: number;
  pageSize: number;
  status?: string;
}

const buildTrackingPath = (jobId: number) => `/jobs/${jobId}/tracking`;

export class PartnerService {
  /**
   * List partners (profiles with isPartner flag)
   */
  static async listPartners(options: ListOptions, auth: AuthContext) {
    const { page, pageSize, status } = options;
    const skip = (page - 1) * pageSize;

    const where: any = {
      isPartner: true,
    };

    if (status) where.status = status;

    const [partners, total] = await Promise.all([
      prisma.profile.findMany({
        where,
        include: {
          role: { select: { id: true, name: true } },
          user: { select: { id: true, email: true } },
        },
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.profile.count({ where }),
    ]);

    return { partners, total };
  }

  /**
   * Create new partner
   */
  static async createPartner(input: any, auth: AuthContext) {
    // ✅ VERIFY AUTHORIZATION
    if (!['super_admin', 'manager'].includes(auth.roleName || '')) {
      throw {
        statusCode: 403,
        message: 'Only admins/managers can create partners',
      };
    }

    const { firstName, lastName, phoneNumber, roleId } = input;

    // ✅ VERIFY ROLE EXISTS
    const role = await prisma.positionRole.findUnique({
      where: { id: roleId },
    });

    if (!role) {
      throw {
        statusCode: 400,
        message: 'Invalid role for partner',
      };
    }

    const partner = await prisma.profile.create({
      data: {
        firstName,
        lastName,
        phoneNumber: phoneNumber || null,
        roleId,
        status: 'active',
        isPartner: true,
      },
      include: {
        role: { select: { id: true, name: true } },
      },
    });

    return partner;
  }

  /**
   * Get specific partner
   */
  static async getPartner(partnerId: number, auth: AuthContext) {
    const partner = await prisma.profile.findUnique({
      where: { id: partnerId },
      include: {
        role: { select: { id: true, name: true } },
        user: { select: { id: true, email: true } },
      },
    });

    if (!partner) {
      throw {
        statusCode: 404,
        message: 'Partner not found',
      };
    }

    // ✅ VERIFY ACCESS - can only view self or if admin/manager
    const canView =
      auth.roleName === 'super_admin' ||
      auth.roleName === 'manager' ||
      partnerId === auth.profileId;

    if (!canView) {
      throw {
        statusCode: 403,
        message: 'You do not have permission to view this partner',
      };
    }

    return partner;
  }

  /**
   * Update partner
   */
  static async updatePartner(partnerId: number, input: any, auth: AuthContext) {
    // ✅ VERIFY AUTHORIZATION
    if (
      partnerId !== auth.profileId &&
      !['super_admin', 'manager'].includes(auth.roleName || '')
    ) {
      throw {
        statusCode: 403,
        message: 'You can only update your own partner profile',
      };
    }

    const partner = await prisma.profile.findUnique({
      where: { id: partnerId },
    });

    if (!partner) {
      throw {
        statusCode: 404,
        message: 'Partner not found',
      };
    }

    // ✅ WHITELIST FIELDS (using camelCase)
    const allowedFields = [
      'firstName',
      'lastName',
      'phoneNumber',
      'positionTitle',
    ];

    const updateData: Record<string, any> = {};

    for (const field of allowedFields) {
      if (field in input) {
        updateData[field] = input[field];
      }
    }

    const updated = await prisma.profile.update({
      where: { id: partnerId },
      data: updateData,
      include: {
        role: { select: { id: true, name: true } },
        user: { select: { id: true, email: true } },
      },
    });

    return updated;
  }

  /**
   * Get partner's jobs
   */
  static async getPartnerJobs(partnerId: number, auth: AuthContext) {
    const partner = await prisma.profile.findUnique({
      where: { id: partnerId },
    });

    if (!partner) {
      throw {
        statusCode: 404,
        message: 'Partner not found',
      };
    }

    // ✅ VERIFY ACCESS
    const canView =
      auth.roleName === 'super_admin' ||
      auth.roleName === 'manager' ||
      partnerId === auth.profileId;

    if (!canView) {
      throw {
        statusCode: 403,
        message: 'You do not have permission to view these jobs',
      };
    }

    const jobs = await prisma.job.findMany({
      where: { partnerProfileId: partnerId },
      include: {
        client: { select: { id: true, clientName: true } },
        staffing: { select: { id: true, employeeProfileId: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return jobs.map((job) => ({
      ...job,
      trackingPath: buildTrackingPath(job.id),
    }));
  }

  /**
   * Get partner revenue summary
   */
  static async getPartnerRevenue(partnerId: number, auth: AuthContext) {
    const partner = await prisma.profile.findUnique({
      where: { id: partnerId },
    });

    if (!partner) {
      throw {
        statusCode: 404,
        message: 'Partner not found',
      };
    }

    // ✅ VERIFY ACCESS
    const canView =
      auth.roleName === 'super_admin' ||
      auth.roleName === 'manager' ||
      partnerId === auth.profileId;

    if (!canView) {
      throw {
        statusCode: 403,
        message: 'You do not have permission to view this revenue',
      };
    }

    const facts = await JobPerformanceFactsService.listFacts({}, { type: 'partner', profileId: partnerId });
    const totalBudget = facts.reduce((sum, fact) => sum + fact.budgetHours, 0);
    const totalApprovedHours = facts.reduce((sum, fact) => sum + fact.approvedHours, 0);
    const jobsCompleted = facts.filter((fact) => fact.status === 'completed').length;

    return {
      partnerId,
      totalJobs: facts.length,
      jobsCompleted,
      jobsInProgress: facts.filter((fact) => fact.status === 'in_progress').length,
      totalBudget,
      totalApprovedHours,
      averageBudgetPerJob: facts.length > 0 ? totalBudget / facts.length : 0,
      billableValue: facts.reduce((sum, fact) => sum + fact.billableValue, 0),
      billedRevenue: facts.reduce((sum, fact) => sum + fact.billedRevenue, 0),
      collectedRevenue: facts.reduce((sum, fact) => sum + fact.collectedRevenue, 0),
      actualCost: facts.reduce((sum, fact) => sum + fact.actualCost, 0),
      cashProfit: facts.reduce((sum, fact) => sum + fact.cashProfit, 0),
    };
  }

  /**
   * Get partner dashboard summary
   */
  static async getPartnerDashboardSummary(partnerId: number) {
    const jobs = await prisma.job.findMany({
      where: { partnerProfileId: partnerId },
      include: {
        client: { select: { clientName: true } },
        staffing: { select: { employeeProfileId: true } },
        jobCosting: { include: { budgetCap: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const jobIds = jobs.map((job) => job.id);
    const [facts, surveys, approvalGroups, overBudgetGroups, latestApprovalRows, memberHoursRaw] =
      await Promise.all([
        JobPerformanceFactsService.listFacts({ jobIds }, { type: 'partner', profileId: partnerId }),
        prisma.clientSatisfactionSurvey.findMany({
          where: { jobId: { in: jobIds } },
          select: { overallSatisfaction: true, completedAt: true },
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
        jobIds.length > 0
          ? prisma.$queryRaw<Array<{ employee_profile_id: number; billable: boolean; hours: number }>>`
              SELECT employee_profile_id, billable, COALESCE(SUM(hours), 0)::float AS hours
              FROM time_entries
              WHERE job_id = ANY(${jobIds}::int[]) AND status = 'approved'
              GROUP BY employee_profile_id, billable
            `
          : Promise.resolve([]),
      ]);
    const factsByJob = new Map(facts.map((fact) => [fact.jobId, fact]));

    const pendingTimeEntriesCount = await prisma.timeEntry.count({
      where: { jobId: { in: jobIds }, status: 'submitted' },
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

    const uniqueTeamMembers = new Set<number>();
    let totalRevenueCollected = 0;
    let totalProfit = 0;
    let totalCost = 0;
    let totalFee = 0;
    let efficiencySum = 0;
    let efficiencyCount = 0;
    let marginSum = 0;
    let marginCount = 0;
    let jobsOverPlannedCost = 0;
    let jobsOverPlannedHours = 0;
    let jobsOverFeeCap = 0;
    let jobsAwaitingPartner = 0;
    let totalPendingApprovalRequests = 0;
    let totalPlannedCost = 0;
    let totalPlannedHours = 0;
    let totalActualHours = 0;
    let totalBillableHours = 0;
    let totalNonBillableHours = 0;

    const topJobs = jobs.map((job) => {
      job.staffing.forEach((assignment) => uniqueTeamMembers.add(assignment.employeeProfileId));
      const fact = factsByJob.get(job.id);

      const estimatedHours = Number(
        fact?.budgetHours ??
          job.jobCosting?.budgetCap?.totalAllocatedHours ??
          job.jobCosting?.totalEstimatedHours ??
          job.budgetHours ??
          0
      );
      const actualHours = fact?.totalHours ?? 0;
      const billableHours = fact?.billableHours ?? 0;
      const feeAmount = Number(job.jobCosting?.jobFee || job.fixedFeeAmount || 0);
      const amountCollected = fact?.collectedRevenue ?? 0;
      const costAmount = fact?.actualCost ?? 0;
      const profit = fact?.cashProfit ?? 0;
      const plannedCost = Number(job.jobCosting?.totalEstimatedCost || 0);
      const plannedHours = Number(
        fact?.budgetHours ??
          job.jobCosting?.totalEstimatedHours ??
          job.jobCosting?.budgetCap?.totalAllocatedHours ??
          job.budgetHours ??
          0
      );
      const feeCap = Number(
        job.jobCosting?.jobFee ||
          (job.billingType === 'fixed_fee' ? job.fixedFeeAmount : 0) ||
          0
      );
      const costVariance = costAmount - plannedCost;
      const hoursVariance = actualHours - plannedHours;
      const costVariancePct = plannedCost > 0 ? (costVariance / plannedCost) * 100 : 0;
      const hoursVariancePct = plannedHours > 0 ? (hoursVariance / plannedHours) * 100 : 0;
      const remainingFeeBuffer = feeCap > 0 ? feeCap - costAmount : 0;
      const approvalChain = approvalChainByJob.get(job.id) || ensureApprovalCounter(job.id);
      const pendingApprovalTotal =
        approvalChain.pending + approvalChain.overBudgetPending + approvalChain.awaitingPartner;
      const isOverPlannedCost = plannedCost > 0 ? costAmount > plannedCost : false;
      const isOverPlannedHours = plannedHours > 0 ? actualHours > plannedHours : false;
      const isOverFeeCap = feeCap > 0 ? costAmount > feeCap : false;

      const efficiency = estimatedHours > 0 && actualHours > 0 ? (estimatedHours / actualHours) * 100 : 0;
      const margin = fact?.marginPercent ?? (amountCollected > 0 ? (profit / amountCollected) * 100 : 0);

      if (efficiency > 0) {
        efficiencySum += efficiency;
        efficiencyCount += 1;
      }
      if (margin || margin === 0) {
        marginSum += margin;
        marginCount += 1;
      }

      totalRevenueCollected += amountCollected;
      totalProfit += profit;
      totalCost += costAmount;
      totalFee += feeAmount;
      totalPlannedCost += plannedCost;
      totalPlannedHours += plannedHours;
      totalActualHours += actualHours;
      totalBillableHours += billableHours;
      totalNonBillableHours += fact?.nonBillableHours ?? 0;
      totalPendingApprovalRequests += pendingApprovalTotal;
      if (isOverPlannedCost) jobsOverPlannedCost += 1;
      if (isOverPlannedHours) jobsOverPlannedHours += 1;
      if (isOverFeeCap) jobsOverFeeCap += 1;
      if ((approvalChain.awaitingPartner || 0) > 0) jobsAwaitingPartner += 1;

      return {
        jobId: job.id,
        trackingPath: buildTrackingPath(job.id),
        jobCode: job.jobCode,
        jobName: job.jobName,
        title: job.jobName,
        status: job.status,
        feeAmount,
        estimatedHours,
        actualHours,
        billableHours,
        amountCollected,
        billableValue: fact?.billableValue ?? 0,
        billedRevenue: fact?.billedRevenue ?? 0,
        collectedRevenue: fact?.collectedRevenue ?? 0,
        nonBillableHours: fact?.nonBillableHours ?? 0,
        costAmount,
        profit,
        efficiencyRatio: efficiency,
        marginPercentage: margin,
        plannedCost,
        plannedHours,
        actualCost: costAmount,
        feeCap,
        costVariance,
        hoursVariance,
        costVariancePct,
        hoursVariancePct,
        remainingFeeBuffer,
        isOverPlannedCost,
        isOverPlannedHours,
        isOverFeeCap,
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

    const activeJobs = jobs.filter((job) => ['planned', 'in_progress', 'on_hold'].includes(job.status)).length;
    const completedJobs = jobs.filter((job) => job.status === 'completed').length;

    const completedSurveys = surveys.filter((survey) => survey.completedAt).length;
    const totalSurveys = surveys.length;
    const avgOverallSatisfaction =
      surveys.length > 0
        ? surveys.reduce((sum, survey) => sum + Number(survey.overallSatisfaction || 0), 0) /
          surveys.length
        : 0;
    const responseRate = totalSurveys > 0 ? (completedSurveys / totalSurveys) * 100 : 0;

    type MemberHourRow = { billableHours: number; nonBillableHours: number; totalHours: number; utilizationRate: number };
    const memberHoursMap = new Map<number, MemberHourRow>();
    memberHoursRaw.forEach((row) => {
      const memberId = Number(row.employee_profile_id);
      const existing = memberHoursMap.get(memberId) ?? { billableHours: 0, nonBillableHours: 0, totalHours: 0, utilizationRate: 0 };
      if (row.billable) existing.billableHours += Number(row.hours);
      else existing.nonBillableHours += Number(row.hours);
      existing.totalHours = existing.billableHours + existing.nonBillableHours;
      existing.utilizationRate = existing.totalHours > 0 ? (existing.billableHours / existing.totalHours) * 100 : 0;
      memberHoursMap.set(memberId, existing);
    });

    const teamUtilization = {
      totalBillableHours,
      totalNonBillableHours,
      totalHours: totalActualHours,
      utilizationRate: totalActualHours > 0 ? (totalBillableHours / totalActualHours) * 100 : 0,
      byMember: Array.from(memberHoursMap.entries()).map(([profileId, hours]) => ({ profileId, ...hours })),
    };

    return {
      portfolio: {
        totalJobs: jobs.length,
        activeJobs,
        completedJobs,
        totalRevenueCollected,
        totalProfit,
        totalCost,
        totalFee,
        averageEfficiency: efficiencyCount > 0 ? efficiencySum / efficiencyCount : 0,
        averageMargin: marginCount > 0 ? marginSum / marginCount : 0,
        totalTeamSize: uniqueTeamMembers.size,
        totalPlannedCost,
        totalPlannedHours,
        totalActualHours,
        totalBillableHours,
        totalNonBillableHours,
        utilizationRate: totalActualHours > 0 ? (totalBillableHours / totalActualHours) * 100 : 0,
        totalCostVariance: totalCost - totalPlannedCost,
        totalHoursVariance: totalActualHours - totalPlannedHours,
        jobsOverPlannedCost,
        jobsOverPlannedHours,
        jobsOverFeeCap,
        jobsAwaitingPartner,
        totalPendingApprovalRequests,
      },
      clientFeedback: {
        totalSurveys,
        completedSurveys,
        responseRate,
        avgOverallSatisfaction,
      },
      teamUtilization,
      topJobs,
      pendingTimeEntriesCount,
    };
  }

  /**
   * Approval chain visibility for partner-owned jobs
   */
  static async getPartnerApprovalChain(
    partnerId: number,
    auth: AuthContext,
    options?: { jobId?: number }
  ) {
    const partner = await prisma.profile.findUnique({
      where: { id: partnerId },
      select: { id: true },
    });

    if (!partner) {
      throw {
        statusCode: 404,
        message: 'Partner not found',
      };
    }

    const canView =
      auth.roleName === 'super_admin' ||
      auth.roleName === 'manager' ||
      auth.roleName === 'hr' ||
      auth.roleName === 'hr' ||
      auth.profileId === partnerId;

    if (!canView) {
      throw {
        statusCode: 403,
        message: 'You do not have permission to view this approval chain',
      };
    }

    const jobFilter: Record<string, any> = { partnerProfileId: partnerId };
    if (options?.jobId) {
      jobFilter.id = options.jobId;
    }

    const jobs = await prisma.job.findMany({
      where: jobFilter,
      select: {
        id: true,
        jobName: true,
        jobCode: true,
        client: { select: { id: true, clientName: true } },
        manager: { select: { firstName: true, lastName: true } },
      },
      orderBy: { jobName: 'asc' },
    });

    if (options?.jobId && jobs.length === 0) {
      throw {
        statusCode: 404,
        message: 'Job not found in partner portfolio',
      };
    }

    const jobIds = jobs.map((job) => job.id);
    if (jobIds.length === 0) {
      return {
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
      };
    }

    const [standardRequests, overBudgetRequests] = await Promise.all([
      prisma.timeEntryApprovalRequest.findMany({
        where: { jobId: { in: jobIds } },
        orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
        include: {
          job: {
            select: {
              id: true,
              jobName: true,
              jobCode: true,
              client: { select: { id: true, clientName: true } },
            },
          },
          employee: { select: { id: true, firstName: true, lastName: true } },
          approver: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      prisma.timeOverBudgetRequest.findMany({
        where: { jobId: { in: jobIds } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: {
          job: {
            select: {
              id: true,
              jobName: true,
              jobCode: true,
              client: { select: { id: true, clientName: true } },
            },
          },
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

    return {
      jobs: jobs.map((job) => ({
        jobId: job.id,
        trackingPath: buildTrackingPath(job.id),
        jobName: job.jobName,
        jobCode: job.jobCode,
        clientName: job.client?.clientName ?? null,
        managerName: job.manager
          ? `${job.manager.firstName} ${job.manager.lastName}`.trim()
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
    };
  }

  /**
   * Allocation audit for partner portfolio (collections vs allocations)
   */
  static async getPartnerAllocationAudit(partnerId: number, auth: AuthContext) {
    const partner = await prisma.profile.findUnique({
      where: { id: partnerId },
      select: { id: true },
    });

    if (!partner) {
      throw {
        statusCode: 404,
        message: 'Partner not found',
      };
    }

    const canView =
      auth.roleName === 'super_admin' ||
      auth.roleName === 'manager' ||
      auth.roleName === 'hr' ||
      auth.roleName === 'hr' ||
      auth.profileId === partnerId;

    if (!canView) {
      throw {
        statusCode: 403,
        message: 'You do not have permission to view this partner allocations',
      };
    }

    const jobs = await prisma.job.findMany({
      where: { partnerProfileId: partnerId },
      select: {
        id: true,
        jobName: true,
        jobCode: true,
        client: { select: { clientName: true } },
      },
    });

    const jobIds = jobs.map((job) => job.id);
    if (jobIds.length === 0) {
      return {
        totals: {
          collectedAmount: 0,
          allocatedAmount: 0,
          totalProfit: 0,
          totalLoss: 0,
        },
        allocations: [],
        jobBalances: [],
      };
    }

    const [allocations, payments] = await Promise.all([
      prisma.revenueAllocation.findMany({
        where: { jobId: { in: jobIds } },
        include: {
          job: { select: { jobName: true, jobCode: true } },
          employee: { select: { firstName: true, lastName: true } },
          clientPayment: {
            include: { client: { select: { clientName: true } } },
          },
        },
        orderBy: { calculatedAt: 'desc' },
        take: 100,
      }),
      prisma.clientPayment.findMany({
        where: { jobId: { in: jobIds } },
        select: { jobId: true, paymentAmount: true },
      }),
    ]);

    const paymentsByJob = new Map<number, number>();
    payments.forEach((payment) => {
      if (!payment.jobId) return;
      const current = paymentsByJob.get(payment.jobId) || 0;
      paymentsByJob.set(payment.jobId, current + Number(payment.paymentAmount));
    });

    const allocationsByJob = new Map<number, { allocated: number; profit: number; loss: number }>();
    allocations.forEach((allocation) => {
      const current = allocationsByJob.get(allocation.jobId) || { allocated: 0, profit: 0, loss: 0 };
      current.allocated += Number(allocation.allocatedAmount || 0);
      current.profit += Number(allocation.employeeProfit || 0);
      current.loss += Number(allocation.employeeLoss || 0);
      allocationsByJob.set(allocation.jobId, current);
    });

    const jobBalances = jobs.map((job) => {
      const collectedAmount = paymentsByJob.get(job.id) || 0;
      const allocationTotals = allocationsByJob.get(job.id) || { allocated: 0, profit: 0, loss: 0 };
      const unallocatedAmount = Math.max(0, collectedAmount - allocationTotals.allocated);

      return {
        jobId: job.id,
        trackingPath: buildTrackingPath(job.id),
        jobName: job.jobName,
        jobCode: job.jobCode,
        clientName: job.client?.clientName ?? '',
        collectedAmount,
        allocatedAmount: allocationTotals.allocated,
        unallocatedAmount,
        totalProfit: allocationTotals.profit,
        totalLoss: allocationTotals.loss,
      };
    });

    const totals = jobBalances.reduce(
      (acc, job) => ({
        collectedAmount: acc.collectedAmount + job.collectedAmount,
        allocatedAmount: acc.allocatedAmount + job.allocatedAmount,
        totalProfit: acc.totalProfit + job.totalProfit,
        totalLoss: acc.totalLoss + job.totalLoss,
      }),
      { collectedAmount: 0, allocatedAmount: 0, totalProfit: 0, totalLoss: 0 }
    );

    return {
      totals,
      allocations: allocations.map((allocation) => ({
        id: allocation.id,
        jobId: allocation.jobId,
        trackingPath: buildTrackingPath(allocation.jobId),
        jobName: allocation.job.jobName,
        jobCode: allocation.job.jobCode,
        clientName: allocation.clientPayment.client.clientName,
        employeeName: `${allocation.employee.firstName} ${allocation.employee.lastName}`.trim(),
        allocatedAmount: Number(allocation.allocatedAmount || 0),
        allocationPercentage: Number(allocation.allocationPercentage || 0),
        allocationMonth: allocation.allocationMonth,
        employeeProfit: Number(allocation.employeeProfit || 0),
        employeeLoss: Number(allocation.employeeLoss || 0),
        calculatedAt: allocation.calculatedAt,
      })),
      jobBalances,
    };
  }
}
