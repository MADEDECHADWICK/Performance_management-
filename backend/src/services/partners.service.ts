/**
 * PartnerService
 * 
 * Business logic for partner management:
 * - Partner portfolio management
 * - Portfolio isolation (partners only see their jobs)
 * - Revenue tracking & commission calculations
 * - Partner dashboards & metrics
 * - Performance analytics
 */

import prisma from '../prisma';

export interface PartnerCreateInput {
  profileId: number;
  companyName: string;
  businessRegistration?: string;
  taxId?: string;
  commissionRate: number; // percentage 0-100
}

export interface PartnerUpdateInput {
  companyName?: string;
  commissionRate?: number;
  status?: 'active' | 'inactive' | 'suspended';
}

export interface ListPartnerJobsOptions {
  page: number;
  pageSize: number;
  filters?: {
    status?: string;
    clientId?: number;
    departmentId?: number;
    dateFrom?: Date;
    dateTo?: Date;
  };
}

export interface CommissionCalculation {
  jobId: number;
  period: Date;
  revenue: number;
  commissionRate: number;
  commissionAmount: number;
  status: 'pending' | 'approved' | 'paid';
}

export interface AuthContext {
  userId: number;
  profileId: number;
  roles?: string[];
}

class PartnerService {
  /**
   * Create partner record
   * 
   * Access: Admin only
   */
  async createPartner(input: PartnerCreateInput, authContext: AuthContext) {
    const isAdmin = authContext.roles?.includes('admin');
    if (!isAdmin) {
      throw new Error('Not authorized to create partner');
    }

    // Verify commission rate
    if (input.commissionRate < 0 || input.commissionRate > 100) {
      throw new Error('Commission rate must be between 0 and 100');
    }

    const existing = await prisma.partner.findFirst({
      where: { profileId: input.profileId },
    });

    if (existing) {
      throw new Error('Partner record already exists for this profile');
    }

    const partner = await prisma.partner.create({
      data: {
        profileId: input.profileId,
        companyName: input.companyName,
        businessRegistration: input.businessRegistration,
        taxId: input.taxId,
        commissionRate: input.commissionRate,
        status: 'active',
        createdAt: new Date(),
      },
      include: {
        profile: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    return partner;
  }

  /**
   * Get partner by profile ID
   */
  async getPartnerByProfileId(profileId: number) {
    const partner = await prisma.partner.findFirst({
      where: { profileId },
      include: {
        profile: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            companyName: true,
          },
        },
      },
    });

    if (!partner) {
      throw new Error('Partner not found');
    }

    return partner;
  }

  /**
   * Update partner details
   */
  async updatePartner(partnerId: number, input: PartnerUpdateInput, authContext: AuthContext) {
    const isAdmin = authContext.roles?.includes('admin');
    const isOwnProfile = authContext.roles?.includes('partner');

    if (!isAdmin && !isOwnProfile) {
      throw new Error('Not authorized to update partner');
    }

    if (input.commissionRate !== undefined) {
      if (input.commissionRate < 0 || input.commissionRate > 100) {
        throw new Error('Commission rate must be between 0 and 100');
      }
    }

    const updated = await prisma.partner.update({
      where: { id: partnerId },
      data: input,
    });

    return updated;
  }

  /**
   * Get partner's portfolio (assigned jobs)
   * 
   * Portfolio isolation: partner only sees jobs with partnerProfileId
   */
  async getPartnerPortfolio(
    partnerProfileId: number,
    options: ListPartnerJobsOptions,
    authContext: AuthContext
  ) {
    const { page, pageSize, filters = {} } = options;
    const skip = (page - 1) * pageSize;

    // Authorization: own portfolio or admin
    const isAdmin = authContext.roles?.includes('admin');
    if (!isAdmin && partnerProfileId !== authContext.profileId) {
      throw new Error('Not authorized to view this portfolio');
    }

    let whereClause: any = { partnerProfileId };

    // Apply filters
    if (filters.status) whereClause.status = filters.status;
    if (filters.clientId) whereClause.clientId = filters.clientId;
    if (filters.departmentId) whereClause.departmentId = filters.departmentId;

    if (filters.dateFrom || filters.dateTo) {
      whereClause.startDate = {};
      if (filters.dateFrom) whereClause.startDate.gte = filters.dateFrom;
      if (filters.dateTo) whereClause.startDate.lte = filters.dateTo;
    }

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where: whereClause,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          client: { select: { id: true, clientName: true } },
          manager: { select: { id: true, firstName: true, lastName: true } },
          department: { select: { id: true, name: true } },
          staffing: { select: { id: true, employeeProfileId: true } },
        },
      }),
      prisma.job.count({ where: whereClause }),
    ]);

    return { jobs, total };
  }

  /**
   * Get all jobs assigned to partner
   */
  async getPartnerJobs(partnerProfileId: number, options?: { page?: number; pageSize?: number }) {
    const { page = 1, pageSize = 50 } = options || {};
    const skip = (page - 1) * pageSize;

    const jobs = await prisma.job.findMany({
      where: { partnerProfileId },
      skip,
      take: pageSize,
      include: {
        client: { select: { id: true, clientName: true } },
        manager: { select: { id: true, firstName: true, lastName: true } },
        staffing: { select: { id: true, employeeProfileId: true } },
      },
    });

    return jobs;
  }

  /**
   * Get partner dashboard with KPIs
   */
  async getPartnerDashboard(partnerProfileId: number) {
    const partner = await this.getPartnerByProfileId(partnerProfileId);

    // Portfolio metrics
    const jobStats = await prisma.job.aggregate({
      where: { partnerProfileId },
      _count: true,
    });

    const activeJobs = await prisma.job.count({
      where: {
        partnerProfileId,
        status: 'in_progress',
      },
    });

    // Revenue calculation (sum of billable amounts from time entries)
    const revenueResult = await prisma.timeEntry.aggregate({
      where: {
        job: { partnerProfileId },
        billable: true,
        status: 'approved',
      },
      _sum: {
        billableAmount: true,
      },
    });

    const totalRevenue = Number(revenueResult._sum.billableAmount || 0);

    // Commission calculation
    const commissionAmount = (totalRevenue * partner.commissionRate) / 100;

    // Cost calculation
    const costResult = await prisma.timeEntry.aggregate({
      where: {
        job: { partnerProfileId },
        status: 'approved',
      },
      _sum: {
        costAmount: true,
      },
    });

    const totalCost = Number(costResult._sum.costAmount || 0);

    // Margin
    const margin = totalRevenue - totalCost;
    const marginPercent = totalRevenue > 0 ? (margin / totalRevenue) * 100 : 0;

    // Staff count
    const staffCount = await prisma.jobStaffAssignment.count({
      where: {
        job: { partnerProfileId },
      },
    });

    return {
      partnerId: partner.id,
      partnerName: `${partner.profile.firstName} ${partner.profile.lastName}`,
      totalJobs: jobStats._count,
      activeJobs,
      totalStaff: staffCount,
      totalRevenue: Number(totalRevenue.toFixed(2)),
      commissionRate: partner.commissionRate,
      totalCommission: Number(commissionAmount.toFixed(2)),
      totalCost: Number(totalCost.toFixed(2)),
      margin: Number(margin.toFixed(2)),
      marginPercent: Number(marginPercent.toFixed(2)),
      status: partner.status,
    };
  }

  /**
   * Get partner revenue by period
   */
  async getPartnerRevenue(
    partnerProfileId: number,
    options?: {
      dateFrom?: Date;
      dateTo?: Date;
      groupBy?: 'day' | 'month' | 'quarter' | 'year';
    }
  ) {
    const { dateFrom = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), dateTo = new Date(), groupBy = 'month' } = options || {};

    const timeEntries = await prisma.timeEntry.findMany({
      where: {
        job: { partnerProfileId },
        dateWorked: {
          gte: dateFrom,
          lte: dateTo,
        },
        billable: true,
        status: 'approved',
      },
      select: {
        dateWorked: true,
        billableAmount: true,
        costAmount: true,
      },
    });

    // Group by period
    const grouped: Record<string, any> = {};

    timeEntries.forEach((entry) => {
      let period: string;
      const date = new Date(entry.dateWorked);

      switch (groupBy) {
        case 'day':
          period = date.toISOString().split('T')[0];
          break;
        case 'month':
          period = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          break;
        case 'quarter':
          const quarter = Math.ceil((date.getMonth() + 1) / 3);
          period = `${date.getFullYear()}-Q${quarter}`;
          break;
        case 'year':
          period = String(date.getFullYear());
          break;
        default:
          period = date.toISOString().split('T')[0];
      }

      if (!grouped[period]) {
        grouped[period] = { revenue: 0, cost: 0, count: 0 };
      }

      grouped[period].revenue += Number(entry.billableAmount || 0);
      grouped[period].cost += Number(entry.costAmount || 0);
      grouped[period].count += 1;
    });

    // Calculate margins
    const revenue = Object.entries(grouped).map(([period, data]: any) => ({
      period,
      revenue: Number(data.revenue.toFixed(2)),
      cost: Number(data.cost.toFixed(2)),
      margin: Number((data.revenue - data.cost).toFixed(2)),
      marginPercent: Number(
        ((data.revenue - data.cost) / (data.revenue || 1) * 100).toFixed(2)
      ),
      entriesCount: data.count,
    }));

    return revenue;
  }

  /**
   * Get partner commission tracking
   */
  async getPartnerCommissions(
    partnerProfileId: number,
    options?: {
      page?: number;
      pageSize?: number;
      status?: 'pending' | 'approved' | 'paid';
      dateFrom?: Date;
      dateTo?: Date;
    }
  ) {
    const { page = 1, pageSize = 50, status, dateFrom, dateTo } = options || {};
    const skip = (page - 1) * pageSize;

    let whereClause: any = { partnerProfileId };
    if (status) whereClause.status = status;
    if (dateFrom || dateTo) {
      whereClause.period = {};
      if (dateFrom) whereClause.period.gte = dateFrom;
      if (dateTo) whereClause.period.lte = dateTo;
    }

    const [commissions, total] = await Promise.all([
      prisma.commission.findMany({
        where: whereClause,
        skip,
        take: pageSize,
        include: {
          job: { select: { id: true, jobName: true } },
        },
        orderBy: { period: 'desc' },
      }),
      prisma.commission.count({ where: whereClause }),
    ]);

    return { commissions, total };
  }

  /**
   * Calculate and create commission record
   */
  async calculateCommission(partnerProfileId: number, period: Date) {
    const partner = await this.getPartnerByProfileId(partnerProfileId);

    // Get revenue for period
    const startOfMonth = new Date(period.getFullYear(), period.getMonth(), 1);
    const endOfMonth = new Date(period.getFullYear(), period.getMonth() + 1, 0);

    const revenueResult = await prisma.timeEntry.aggregate({
      where: {
        job: { partnerProfileId },
        dateWorked: { gte: startOfMonth, lte: endOfMonth },
        billable: true,
        status: 'approved',
      },
      _sum: { billableAmount: true },
    });

    const revenue = Number(revenueResult._sum.billableAmount || 0);
    const commissionAmount = (revenue * partner.commissionRate) / 100;

    // Check if commission already exists
    const existing = await prisma.commission.findFirst({
      where: {
        partnerProfileId,
        period: startOfMonth,
      },
    });

    if (existing) {
      return existing;
    }

    // Create new commission record
    const commission = await prisma.commission.create({
      data: {
        partnerProfileId,
        period: startOfMonth,
        revenue,
        commissionRate: partner.commissionRate,
        commissionAmount,
        status: 'pending',
      },
    });

    return commission;
  }

  /**
   * Approve commission for payment
   */
  async approveCommission(commissionId: number, authContext: AuthContext) {
    const isAdmin = authContext.roles?.includes('admin');
    const isFinance = authContext.roles?.includes('finance');

    if (!isAdmin && !isFinance) {
      throw new Error('Not authorized to approve commissions');
    }

    const approved = await prisma.commission.update({
      where: { id: commissionId },
      data: {
        status: 'approved',
        approvedAt: new Date(),
        approvedByProfileId: authContext.profileId,
      },
    });

    return approved;
  }

  /**
   * Mark commission as paid
   */
  async markCommissionPaid(
    commissionId: number,
    paymentDate: Date,
    authContext: AuthContext
  ) {
    const isAdmin = authContext.roles?.includes('admin');
    const isFinance = authContext.roles?.includes('finance');

    if (!isAdmin && !isFinance) {
      throw new Error('Not authorized to mark commissions as paid');
    }

    const paid = await prisma.commission.update({
      where: { id: commissionId },
      data: {
        status: 'paid',
        paidAt: paymentDate,
        paidByProfileId: authContext.profileId,
      },
    });

    return paid;
  }

  /**
   * Get partner performance metrics
   */
  async getPartnerPerformance(partnerProfileId: number) {
    const partner = await this.getPartnerByProfileId(partnerProfileId);

    // Utilization rate
    const staffing = await prisma.jobStaffAssignment.findMany({
      where: { job: { partnerProfileId } },
      select: { id: true },
    });

    const timeEntries = await prisma.timeEntry.aggregate({
      where: {
        job: { partnerProfileId },
        status: { in: ['submitted', 'approved'] },
      },
      _count: true,
      _sum: { hours: true },
    });

    // On-time delivery
    const completedJobs = await prisma.job.findMany({
      where: {
        partnerProfileId,
        status: 'completed',
      },
      select: { dueDate: true, completedAt: true },
    });

    const onTimeCount = completedJobs.filter(
      (job) => job.completedAt && job.dueDate && new Date(job.completedAt) <= new Date(job.dueDate)
    ).length;

    const onTimePercent =
      completedJobs.length > 0 ? (onTimeCount / completedJobs.length) * 100 : 0;

    // Average job duration
    const activeJobs = await prisma.job.findMany({
      where: { partnerProfileId },
      select: { startDate: true, dueDate: true },
    });

    const avgDuration =
      activeJobs.length > 0
        ? activeJobs.reduce((sum, job) => {
            if (job.startDate && job.dueDate) {
              return sum + (new Date(job.dueDate).getTime() - new Date(job.startDate).getTime());
            }
            return sum;
          }, 0) / activeJobs.length
        : 0;

    return {
      partnerId: partner.id,
      totalStaff: staffing.length,
      totalTimeEntries: timeEntries._count,
      totalHoursLogged: Number(timeEntries._sum.hours || 0),
      completedJobs: completedJobs.length,
      onTimeDeliveryPercent: Number(onTimePercent.toFixed(2)),
      averageJobDuration: Math.round(avgDuration / (1000 * 60 * 60 * 24)), // in days
    };
  }

  /**
   * Get partner utilization metrics
   */
  async getPartnerUtilization(partnerProfileId: number) {
    // Get all staff assigned to partner jobs
    const staffing = await prisma.jobStaffAssignment.findMany({
      where: { job: { partnerProfileId } },
      include: { employee: true },
    });

    const utilization: any[] = [];

    for (const staff of staffing) {
      // Get time entries for this staff
      const timeResult = await prisma.timeEntry.aggregate({
        where: {
          employeeProfileId: staff.employeeProfileId,
          job: { partnerProfileId },
          status: { in: ['submitted', 'approved'] },
        },
        _sum: { hours: true },
      });

      const totalHours = Number(timeResult._sum.hours || 0);
      const estimatedCapacity = 40 * 4; // 40 hours/week * 4 weeks

      utilization.push({
        employeeProfileId: staff.employeeProfileId,
        employeeName: `${staff.employee.firstName} ${staff.employee.lastName}`,
        hoursLogged: totalHours,
        utilizationPercent: (totalHours / estimatedCapacity * 100).toFixed(2),
        availability: Math.max(0, estimatedCapacity - totalHours),
      });
    }

    // Calculate average utilization
    const avgUtil =
      utilization.length > 0
        ? utilization.reduce((sum: any, u: any) => sum + parseFloat(u.utilizationPercent), 0) /
          utilization.length
        : 0;

    return {
      totalStaff: utilization.length,
      averageUtilization: Number(avgUtil.toFixed(2)),
      staffUtilization: utilization,
    };
  }

  /**
   * List all partners
   */
  async listPartners(options?: { page?: number; pageSize?: number; status?: string }) {
    const { page = 1, pageSize = 50, status } = options || {};
    const skip = (page - 1) * pageSize;

    let whereClause: any = {};
    if (status) whereClause.status = status;

    const [partners, total] = await Promise.all([
      prisma.partner.findMany({
        where: whereClause,
        skip,
        take: pageSize,
        include: {
          profile: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      }),
      prisma.partner.count({ where: whereClause }),
    ]);

    return { partners, total };
  }
}

export default new PartnerService();
