/**
 * JobService
 * 
 * Business logic for job management:
 * - CRUD operations
 * - Access control (manager, partner, admin)
 * - Team assignments & staffing
 * - Costing & budget calculations
 * - Profitability analysis
 * - Time entry aggregation
 * - Job status workflows
 */

import prisma from '../prisma';

export interface JobCreateInput {
  jobName: string;
  description?: string;
  clientId?: number;
  departmentId?: number;
  partnerProfileId?: number;
  managerProfileId: number;
  billingType: 'hourly' | 'fixed_fee';
  fixedFeeAmount?: number;
  budgetHours?: number;
  engagementLetterId?: number;
  startDate?: Date;
  dueDate?: Date;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
}

export interface JobUpdateInput {
  jobName?: string;
  description?: string;
  status?: string;
  dueDate?: Date;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  billingType?: 'hourly' | 'fixed_fee';
  fixedFeeAmount?: number;
  budgetHours?: number;
}

export interface JobStaffAssignmentInput {
  employeeProfileId: number;
  assignedRoleId: number;
  assignedHourlyRate: number;
  roleOnJob?: string;
}

export interface ListJobsOptions {
  page: number;
  pageSize: number;
  filters?: {
    status?: string | string[];
    clientId?: number;
    partnerProfileId?: number;
    managerProfileId?: number;
    dateFrom?: Date;
    dateTo?: Date;
  };
  sort?: {
    field?: string;
    order?: 'asc' | 'desc';
  };
}

export interface AuthContext {
  userId: number;
  profileId: number;
  roles?: string[];
}

class JobService {
  /**
   * Create a new job
   * 
   * Access: Manager (creates their own), Partner (assigned to partner), Admin
   */
  async createJob(input: JobCreateInput, authContext: AuthContext) {
    // Authorization: manager creating their own job, or admin
    const isAdmin = authContext.roles?.includes('admin');
    const isCreatingOwnJob = input.managerProfileId === authContext.profileId;

    if (!isAdmin && !isCreatingOwnJob) {
      throw new Error('Not authorized to create job for another manager');
    }

    const job = await prisma.job.create({
      data: {
        jobName: input.jobName,
        description: input.description,
        clientId: input.clientId,
        departmentId: input.departmentId,
        partnerProfileId: input.partnerProfileId,
        managerProfileId: input.managerProfileId,
        billingType: input.billingType,
        fixedFeeAmount: input.fixedFeeAmount || 0,
        budgetHours: input.budgetHours || 0,
        engagementLetterId: input.engagementLetterId,
        startDate: input.startDate,
        dueDate: input.dueDate,
        priority: input.priority || 'medium',
        status: 'planned',
      },
      include: {
        client: { select: { id: true, clientName: true } },
        manager: { select: { id: true, firstName: true, lastName: true } },
        partner: { select: { id: true, firstName: true, lastName: true } },
        department: { select: { id: true, name: true } },
      },
    });

    return job;
  }

  /**
   * List jobs with pagination & filtering
   * 
   * Access control:
   * - Admin: see all jobs
   * - Manager: see jobs they manage or are assigned to
   * - Partner: see jobs assigned to them
   * - Employee: see jobs they have staff assignments on
   */
  async listJobs(options: ListJobsOptions, authContext: AuthContext) {
    const { page, pageSize, filters = {}, sort = {} } = options;
    const skip = (page - 1) * pageSize;
    const isAdmin = authContext.roles?.includes('admin');

    // Build where clause based on access control
    let whereClause: any = {};

    if (!isAdmin) {
      const isManager = authContext.roles?.includes('manager');
      const isPartner = authContext.roles?.includes('partner');

      if (isManager || isPartner) {
        // Manager/Partner sees jobs where they are manager or partner
        whereClause.OR = [
          { managerProfileId: authContext.profileId },
          { partnerProfileId: authContext.profileId },
          // Also see jobs via staff assignments
          {
            staffing: {
              some: {
                employeeProfileId: authContext.profileId,
              },
            },
          },
        ];
      } else {
        // Regular employee only sees jobs they're assigned to
        whereClause.staffing = {
          some: {
            employeeProfileId: authContext.profileId,
          },
        };
      }
    }

    // Apply filters
    if (filters.status) {
      if (Array.isArray(filters.status)) {
        whereClause.status = { in: filters.status };
      } else {
        whereClause.status = filters.status;
      }
    }
    if (filters.clientId) whereClause.clientId = filters.clientId;
    if (filters.partnerProfileId) whereClause.partnerProfileId = filters.partnerProfileId;
    if (filters.managerProfileId) whereClause.managerProfileId = filters.managerProfileId;

    if (filters.dateFrom || filters.dateTo) {
      whereClause.startDate = {};
      if (filters.dateFrom) whereClause.startDate.gte = filters.dateFrom;
      if (filters.dateTo) whereClause.startDate.lte = filters.dateTo;
    }

    // Build orderBy
    const orderBy: any = {};
    if (sort.field) {
      orderBy[sort.field] = sort.order || 'asc';
    } else {
      orderBy.createdAt = 'desc';
    }

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where: whereClause,
        skip,
        take: pageSize,
        orderBy,
        include: {
          client: { select: { id: true, clientName: true } },
          manager: { select: { id: true, firstName: true, lastName: true } },
          partner: { select: { id: true, firstName: true, lastName: true } },
          department: { select: { id: true, name: true } },
          staffing: { select: { id: true, employeeProfileId: true } },
          jobCosting: {
            select: {
              id: true,
              budgetCap: true,
              estimatedCost: true,
            },
          },
        },
      }),
      prisma.job.count({ where: whereClause }),
    ]);

    return { jobs, total };
  }

  /**
   * Get single job with full details
   */
  async getJobById(jobId: number, include?: string[]) {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        client: { select: { id: true, clientName: true } },
        manager: { select: { id: true, firstName: true, lastName: true, email: true } },
        partner: { select: { id: true, firstName: true, lastName: true, email: true } },
        department: { select: { id: true, name: true } },
        staffing: include?.includes('staffing') ? {
          include: {
            employee: { select: { id: true, firstName: true, lastName: true, email: true } },
            role: { select: { id: true, name: true } },
          },
        } : false,
        jobCosting: include?.includes('costing'),
        timeEntries: include?.includes('timeEntries') ? {
          select: {
            id: true,
            hours: true,
            billable: true,
            status: true,
            dateWorked: true,
            employeeProfileId: true,
          },
        } : false,
        tasks: include?.includes('tasks'),
        engagementLetter: { select: { id: true, fileName: true } },
      } as any,
    });

    if (!job) {
      throw new Error('Job not found');
    }

    return job;
  }

  /**
   * Update job
   * 
   * Access: Manager (own jobs), Admin
   */
  async updateJob(jobId: number, input: JobUpdateInput, authContext: AuthContext) {
    const job = await this.getJobById(jobId);

    // Authorization: own job or admin
    const isAdmin = authContext.roles?.includes('admin');
    if (!isAdmin && job.managerProfileId !== authContext.profileId) {
      throw new Error('Not authorized to update this job');
    }

    const updated = await prisma.job.update({
      where: { id: jobId },
      data: input,
      include: {
        client: { select: { id: true, clientName: true } },
        manager: { select: { id: true, firstName: true, lastName: true } },
        partner: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return updated;
  }

  /**
   * Update job status
   * 
   * Rules:
   * - planned → in_progress
   * - in_progress → on_hold, completed
   * - on_hold → in_progress, cancelled
   * - completed → (final state)
   */
  async updateJobStatus(
    jobId: number,
    status: string,
    reason?: string,
    authContext?: AuthContext
  ) {
    const job = await this.getJobById(jobId);

    // Validate status transition
    const validTransitions: Record<string, string[]> = {
      planned: ['in_progress', 'cancelled'],
      in_progress: ['on_hold', 'completed', 'cancelled'],
      on_hold: ['in_progress', 'cancelled'],
      completed: [],
      cancelled: [],
    };

    if (!validTransitions[job.status as string]?.includes(status)) {
      throw new Error(`Cannot transition from ${job.status} to ${status}`);
    }

    // Authorization
    const isAdmin = authContext?.roles?.includes('admin');
    const isJobManager = job.managerProfileId === authContext?.profileId;
    const isPartner = job.partnerProfileId === authContext?.profileId;

    if (!isAdmin && !isJobManager && !isPartner) {
      throw new Error('Not authorized to update job status');
    }

    // Record status transition
    await prisma.statusTransition.create({
      data: {
        jobId,
        fromStatus: job.status,
        toStatus: status,
        reason: reason || null,
        changedByProfileId: authContext?.profileId!,
        changedAt: new Date(),
      },
    });

    const updated = await prisma.job.update({
      where: { id: jobId },
      data: { status },
      include: {
        manager: { select: { id: true, firstName: true, lastName: true } },
        partner: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return updated;
  }

  /**
   * Delete job (soft or hard based on status)
   */
  async deleteJob(jobId: number, authContext: AuthContext) {
    const job = await this.getJobById(jobId);

    // Authorization
    const isAdmin = authContext.roles?.includes('admin');
    if (!isAdmin && job.managerProfileId !== authContext.profileId) {
      throw new Error('Not authorized to delete this job');
    }

    // Don't allow deletion of completed/in-progress jobs
    if (['in_progress', 'completed'].includes(job.status)) {
      throw new Error(`Cannot delete job in status: ${job.status}`);
    }

    await prisma.job.delete({
      where: { id: jobId },
    });

    return { id: jobId, deleted: true };
  }

  /**
   * Assign employee to job
   * 
   * Creates JobStaffAssignment
   */
  async assignJobTeam(
    jobId: number,
    input: JobStaffAssignmentInput,
    authContext: AuthContext
  ) {
    const job = await this.getJobById(jobId);

    // Authorization: job manager, partner, or admin
    const isAdmin = authContext.roles?.includes('admin');
    const isJobManager = job.managerProfileId === authContext.profileId;
    const isPartner = job.partnerProfileId === authContext.profileId;

    if (!isAdmin && !isJobManager && !isPartner) {
      throw new Error('Not authorized to assign team to this job');
    }

    // Check for duplicate assignment
    const existing = await prisma.jobStaffAssignment.findFirst({
      where: { jobId, employeeProfileId: input.employeeProfileId },
    });

    if (existing) {
      throw new Error('Employee already assigned to this job');
    }

    const assignment = await prisma.jobStaffAssignment.create({
      data: {
        jobId,
        employeeProfileId: input.employeeProfileId,
        assignedRoleId: input.assignedRoleId,
        assignedHourlyRate: input.assignedHourlyRate,
        roleOnJob: input.roleOnJob,
        assignedByProfileId: authContext.profileId,
        assignedAt: new Date(),
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true } },
        role: { select: { id: true, name: true } },
      },
    });

    // Update job.teamAssigned flag
    const hasStaff = await prisma.jobStaffAssignment.count({ where: { jobId } });
    if (hasStaff > 0) {
      await prisma.job.update({
        where: { id: jobId },
        data: { teamAssigned: true },
      });
    }

    return assignment;
  }

  /**
   * Get job staff assignments
   */
  async getJobStaff(jobId: number) {
    const staffing = await prisma.jobStaffAssignment.findMany({
      where: { jobId },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            isPartner: true,
          },
        },
        role: { select: { id: true, name: true } },
      },
    });

    return staffing;
  }

  /**
   * Get job costing details
   */
  async getJobCosting(jobId: number) {
    const costing = await prisma.jobCosting.findUnique({
      where: { jobId },
      include: {
        budgetCap: true,
      },
    });

    return costing;
  }

  /**
   * Get time entries for job
   */
  async getJobTimeEntries(
    jobId: number,
    options?: {
      page?: number;
      pageSize?: number;
      status?: string;
      dateFrom?: Date;
      dateTo?: Date;
    }
  ) {
    const { page = 1, pageSize = 50, status, dateFrom, dateTo } = options || {};
    const skip = (page - 1) * pageSize;

    let whereClause: any = { jobId };
    if (status) whereClause.status = status;
    if (dateFrom || dateTo) {
      whereClause.dateWorked = {};
      if (dateFrom) whereClause.dateWorked.gte = dateFrom;
      if (dateTo) whereClause.dateWorked.lte = dateTo;
    }

    const [entries, total] = await Promise.all([
      prisma.timeEntry.findMany({
        where: whereClause,
        skip,
        take: pageSize,
        include: {
          employee: { select: { id: true, firstName: true, lastName: true } },
          approver: { select: { id: true, firstName: true, lastName: true } },
          task: { select: { id: true, title: true } },
        },
        orderBy: { dateWorked: 'desc' },
      }),
      prisma.timeEntry.count({ where: whereClause }),
    ]);

    return { entries, total };
  }

  /**
   * Calculate job profitability
   * 
   * Returns:
   * - Total revenue (billableAmount)
   * - Total cost (employee cost)
   * - Profit/loss
   * - Margin %
   */
  async getJobProfitability(jobId: number) {
    const job = await this.getJobById(jobId, ['staffing', 'timeEntries']);

    // Sum billable amounts from time entries
    const timeEntryResult = await prisma.timeEntry.aggregate({
      where: { jobId },
      _sum: {
        billableAmount: true,
        costAmount: true,
        profitLoss: true,
      },
    });

    const totalRevenue = timeEntryResult._sum.billableAmount || 0;
    const totalCost = timeEntryResult._sum.costAmount || 0;
    const totalProfitLoss = timeEntryResult._sum.profitLoss || 0;

    const marginPercent = totalRevenue > 0 ? (totalProfitLoss / totalRevenue) * 100 : 0;

    return {
      jobId,
      jobName: job.jobName,
      totalRevenue: Number(totalRevenue),
      totalCost: Number(totalCost),
      totalProfitLoss: Number(totalProfitLoss),
      marginPercent: Number(marginPercent.toFixed(2)),
      billingType: job.billingType,
      status: job.status,
    };
  }

  /**
   * Calculate job utilization metrics
   * 
   * Returns:
   * - Total billable hours
   * - Total hours
   * - Billable %
   * - Per-employee breakdown
   */
  async getJobUtilization(jobId: number) {
    const job = await this.getJobById(jobId);

    // Get time entries
    const timeEntries = await prisma.timeEntry.findMany({
      where: { jobId },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Calculate aggregates
    const totalHours = timeEntries.reduce((sum, te) => sum + Number(te.hours), 0);
    const billableHours = timeEntries
      .filter((te) => te.billable)
      .reduce((sum, te) => sum + Number(te.hours), 0);

    const utilizationPercent = totalHours > 0 ? (billableHours / totalHours) * 100 : 0;

    // Per-employee breakdown
    const byEmployee: Record<number, any> = {};
    timeEntries.forEach((te) => {
      if (!byEmployee[te.employeeProfileId]) {
        byEmployee[te.employeeProfileId] = {
          employeeProfileId: te.employeeProfileId,
          employeeName: `${te.employee.firstName} ${te.employee.lastName}`,
          totalHours: 0,
          billableHours: 0,
        };
      }
      byEmployee[te.employeeProfileId].totalHours += Number(te.hours);
      if (te.billable) {
        byEmployee[te.employeeProfileId].billableHours += Number(te.hours);
      }
    });

    // Calculate utilization per employee
    const employeeUtilization = Object.values(byEmployee).map((emp: any) => ({
      ...emp,
      utilizationPercent:
        emp.totalHours > 0 ? ((emp.billableHours / emp.totalHours) * 100).toFixed(2) : 0,
    }));

    return {
      jobId,
      jobName: job.jobName,
      totalHours: Number(totalHours.toFixed(2)),
      billableHours: Number(billableHours.toFixed(2)),
      utilizationPercent: Number(utilizationPercent.toFixed(2)),
      employeeUtilization,
    };
  }

  /**
   * Get job revenue allocations
   * 
   * Returns revenue split between manager, partner, client
   */
  async getJobRevenueAllocations(jobId: number) {
    const allocations = await prisma.revenueAllocation.findMany({
      where: { jobId },
      include: {
        allocatedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    return allocations;
  }

  /**
   * Calculate job budget status
   */
  async getJobBudgetStatus(jobId: number) {
    const job = await this.getJobById(jobId);
    const costing = await this.getJobCosting(jobId);

    if (!costing?.budgetCap) {
      return {
        jobId,
        hasBudget: false,
        capEnforced: false,
      };
    }

    // Get logged hours
    const timeEntryResult = await prisma.timeEntry.aggregate({
      where: { jobId },
      _sum: { hours: true },
    });

    const loggedHours = Number(timeEntryResult._sum.hours || 0);
    const budgetCap = costing.budgetCap;
    const allocatedHours = Number(budgetCap.totalAllocatedHours);
    const remaining = allocatedHours - loggedHours;
    const percentageUsed = allocatedHours > 0 ? (loggedHours / allocatedHours) * 100 : 0;

    return {
      jobId,
      jobName: job.jobName,
      hasBudget: true,
      capEnforced: budgetCap.capEnforced,
      allowOverage: budgetCap.allowOverage,
      allocatedHours,
      loggedHours,
      remainingHours: Math.max(0, remaining),
      percentageUsed: Number(percentageUsed.toFixed(2)),
      budgetStatus:
        remaining > 0 ? 'within_budget' : remaining === 0 ? 'at_capacity' : 'exceeded',
    };
  }
}

export default new JobService();
