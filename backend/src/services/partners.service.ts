import { prisma } from '../prisma';

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
    if (!['admin', 'manager'].includes(auth.roleName || '')) {
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
      auth.roleName === 'admin' ||
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
      !['admin', 'manager'].includes(auth.roleName || '')
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
      auth.roleName === 'admin' ||
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

    return jobs;
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
      auth.roleName === 'admin' ||
      auth.roleName === 'manager' ||
      partnerId === auth.profileId;

    if (!canView) {
      throw {
        statusCode: 403,
        message: 'You do not have permission to view this revenue',
      };
    }

    // Get all jobs for partner
    const jobs = await prisma.job.findMany({
      where: { partnerProfileId: partnerId },
      include: {
        timeEntries: {
          where: { status: 'approved' },
        },
      },
    });

    let totalApprovedHours = 0;
    let totalBudget = 0;
    let jobsCompleted = 0;

    for (const job of jobs) {
      if (job.status === 'completed') jobsCompleted++;
      totalBudget += Number(job.budgetHours) || 0;
      totalApprovedHours += job.timeEntries.reduce((sum, te) => sum + Number(te.hours), 0);
    }

    return {
      partnerId,
      totalJobs: jobs.length,
      jobsCompleted,
      jobsInProgress: jobs.filter(j => j.status === 'in_progress').length,
      totalBudget,
      totalApprovedHours,
      averageBudgetPerJob: jobs.length > 0 ? totalBudget / jobs.length : 0,
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
        timeEntries: {
          where: { status: 'approved' },
          select: { hours: true, billable: true, profitLoss: true, billableAmount: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const jobIds = jobs.map((job) => job.id);
    const allocations = await prisma.revenueAllocation.findMany({
      where: { jobId: { in: jobIds } },
      select: { jobId: true, allocatedAmount: true, employeeProfit: true, employeeLoss: true },
    });

    const payments = await prisma.clientPayment.findMany({
      where: { jobId: { in: jobIds } },
      select: { jobId: true, paymentAmount: true },
    });

    const allocationByJob = new Map<number, { revenue: number; profit: number }>();
    allocations.forEach((allocation) => {
      const current = allocationByJob.get(allocation.jobId) || { revenue: 0, profit: 0 };
      current.revenue += Number(allocation.allocatedAmount || 0);
      current.profit += Number(allocation.employeeProfit || 0) - Number(allocation.employeeLoss || 0);
      allocationByJob.set(allocation.jobId, current);
    });

    const paymentsByJob = new Map<number, number>();
    payments.forEach((payment) => {
      if (!payment.jobId) return;
      const current = paymentsByJob.get(payment.jobId) || 0;
      paymentsByJob.set(payment.jobId, current + Number(payment.paymentAmount));
    });

    const pendingTimeEntriesCount = await prisma.timeEntry.count({
      where: { jobId: { in: jobIds }, status: 'submitted' },
    });

    const uniqueTeamMembers = new Set<number>();
    let totalRevenueCollected = 0;
    let totalProfit = 0;
    let efficiencySum = 0;
    let efficiencyCount = 0;
    let marginSum = 0;
    let marginCount = 0;

    const topJobs = jobs.map((job) => {
      job.staffing.forEach((assignment) => uniqueTeamMembers.add(assignment.employeeProfileId));

      const estimatedHours = Number(job.budgetHours || 0);
      const actualHours = job.timeEntries.reduce((sum, entry) => sum + Number(entry.hours), 0);
      const billableHours = job.timeEntries
        .filter((entry) => entry.billable)
        .reduce((sum, entry) => sum + Number(entry.hours), 0);
      const allocationTotals = allocationByJob.get(job.id);
      const paymentTotal = paymentsByJob.get(job.id) || 0;
      const amountCollected = allocationTotals ? allocationTotals.revenue : paymentTotal;
      const profit = allocationTotals
        ? allocationTotals.profit
        : job.timeEntries.reduce((sum, entry) => sum + Number(entry.profitLoss || 0), 0);

      const efficiency = estimatedHours > 0 && actualHours > 0 ? (estimatedHours / actualHours) * 100 : 0;
      const margin = amountCollected > 0 ? (profit / amountCollected) * 100 : 0;

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

      return {
        jobId: job.id,
        jobCode: job.jobCode,
        jobName: job.jobName,
        title: job.jobName,
        status: job.status,
        estimatedHours,
        actualHours,
        billableHours,
        amountCollected,
        profit,
        efficiencyRatio: efficiency,
        marginPercentage: margin,
      };
    });

    const activeJobs = jobs.filter((job) => ['planned', 'in_progress', 'on_hold'].includes(job.status)).length;
    const completedJobs = jobs.filter((job) => job.status === 'completed').length;

    return {
      portfolio: {
        totalJobs: jobs.length,
        activeJobs,
        completedJobs,
        totalRevenueCollected,
        totalProfit,
        averageEfficiency: efficiencyCount > 0 ? efficiencySum / efficiencyCount : 0,
        averageMargin: marginCount > 0 ? marginSum / marginCount : 0,
        totalTeamSize: uniqueTeamMembers.size,
      },
      topJobs: topJobs.slice(0, 5),
      pendingTimeEntriesCount,
    };
  }
}
