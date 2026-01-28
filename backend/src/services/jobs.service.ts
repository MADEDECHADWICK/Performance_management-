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
import NotificationService from './notifications.service';

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

export interface JobCreateFromOnboardingInput {
  jobName?: string;
  description?: string;
  departmentId?: number;
  partnerProfileId?: number;
  managerProfileId: number;
  budgetHours?: number;
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
  assignedHourlyRate?: number;
  roleOnJob?: string;
}

export interface JobCostingInput {
  jobFee: number;
  allocations: Array<{
    employeeProfileId: number;
    roleId: number;
    allocatedHours: number;
    hourlyRate?: number;
    billable?: boolean;
    taskDescription?: string;
  }>;
  notes?: string;
  capEnforced?: boolean;
  allowOverage?: boolean;
  maxOveragePercent?: number;
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
    const isAdmin = authContext.roles?.includes('admin') || authContext.roles?.includes('super_admin');
    const isHr = authContext.roles?.includes('hr') || authContext.roles?.includes('hr_manager');

    if (!isAdmin && !isHr) {
      throw new Error('Not authorized to create jobs');
    }

    if (!input.engagementLetterId) {
      throw new Error('Engagement letter is required for job creation');
    }

    let resolvedClientId = input.clientId;

    const engagementLetter = await prisma.engagementLetter.findUnique({
      where: { id: input.engagementLetterId },
      select: {
        id: true,
        status: true,
        clientId: true,
        feeAmount: true,
        currency: true,
        jobTitle: true,
        engagementType: true,
      },
    });

    if (!engagementLetter) {
      throw new Error('Engagement letter not found');
    }

    if (engagementLetter.status !== 'approved') {
      throw new Error('Engagement letter must be approved before job creation');
    }

    if (resolvedClientId && resolvedClientId !== engagementLetter.clientId) {
      throw new Error('Engagement letter does not match clientId');
    }

    if (!engagementLetter.feeAmount) {
      throw new Error('Engagement letter must include a fee amount');
    }

    const onboarding = await prisma.clientOnboarding.findFirst({
      where: { engagementLetterId: engagementLetter.id },
      select: { id: true, status: true, jobId: true },
    });

    if (!onboarding) {
      throw new Error('Client onboarding is required before job creation');
    }

    if (!['approved', 'client_created'].includes(onboarding.status)) {
      throw new Error('Client onboarding must be approved before job creation');
    }

    if (onboarding.jobId) {
      throw new Error('Job already created for this engagement letter');
    }

    resolvedClientId = engagementLetter.clientId;

    const billingType = 'fixed_fee';
    const fixedFeeAmount = Number(engagementLetter.feeAmount);

    const job = await prisma.job.create({
      data: {
        jobName: input.jobName,
        description: input.description,
        clientId: resolvedClientId,
        departmentId: input.departmentId,
        partnerProfileId: input.partnerProfileId,
        managerProfileId: input.managerProfileId,
        billingType,
        fixedFeeAmount,
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

    if (input.engagementLetterId) {
      await prisma.clientOnboarding.updateMany({
        where: { engagementLetterId: input.engagementLetterId },
        data: {
          jobId: job.id,
          status: 'job_created',
        },
      });
    }

    return job;
  }

  /**
   * Create a new job from a client onboarding record (HR queue)
   */
  async createJobFromOnboarding(
    clientOnboardingId: number,
    input: JobCreateFromOnboardingInput,
    authContext: AuthContext
  ) {
    const isAdmin = authContext.roles?.includes('admin') || authContext.roles?.includes('super_admin');
    const isHr = authContext.roles?.includes('hr') || authContext.roles?.includes('hr_manager');

    if (!isAdmin && !isHr) {
      throw new Error('Not authorized to create jobs from onboarding');
    }

    const onboarding = await prisma.clientOnboarding.findUnique({
      where: { id: clientOnboardingId },
      include: {
        engagementLetter: {
          select: {
            id: true,
            status: true,
            clientId: true,
            feeAmount: true,
            currency: true,
            jobTitle: true,
            startDate: true,
            endDate: true,
          },
        },
        client: { select: { id: true, clientName: true } },
        department: { select: { id: true, name: true } },
      },
    });

    if (!onboarding) {
      throw new Error('Client onboarding not found');
    }

    if (onboarding.jobId) {
      throw new Error('Job already created for this onboarding');
    }

    if (!['approved', 'client_created'].includes(onboarding.status)) {
      throw new Error('Client onboarding must be approved before job creation');
    }

    const engagementLetter = onboarding.engagementLetter;
    if (!engagementLetter) {
      throw new Error('Engagement letter is required for job creation');
    }

    if (engagementLetter.status !== 'approved') {
      throw new Error('Engagement letter must be approved before job creation');
    }

    if (!engagementLetter.feeAmount) {
      throw new Error('Engagement letter must include a fee amount');
    }

    const jobName = input.jobName?.trim() || engagementLetter.jobTitle?.trim();
    if (!jobName) {
      throw new Error('Job name is required');
    }

    const billingType = 'fixed_fee';
    const fixedFeeAmount = Number(engagementLetter.feeAmount);

    const job = await prisma.$transaction(async (tx) => {
      const created = await tx.job.create({
        data: {
          jobName,
          description: input.description,
          clientId: onboarding.clientId ?? engagementLetter.clientId,
          departmentId: input.departmentId ?? onboarding.departmentId,
          partnerProfileId: input.partnerProfileId,
          managerProfileId: input.managerProfileId,
          billingType,
          fixedFeeAmount,
          budgetHours: input.budgetHours || 0,
          engagementLetterId: engagementLetter.id,
          startDate: input.startDate ?? engagementLetter.startDate ?? undefined,
          dueDate: input.dueDate ?? engagementLetter.endDate ?? undefined,
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

      await tx.clientOnboarding.update({
        where: { id: onboarding.id },
        data: {
          jobId: created.id,
          status: 'job_created',
        },
      });

      return created;
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
          staffing: {
            include: {
              employee: { select: { id: true, firstName: true, lastName: true } },
              role: { select: { id: true, name: true } },
            },
          },
          jobCosting: {
            select: {
              id: true,
              budgetCap: true,
              totalEstimatedCost: true,
              allocatedCost: true,
              remainingBudget: true,
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
        engagementLetter: {
          select: {
            id: true,
            jobTitle: true,
            status: true,
            document: { select: { id: true, fileName: true, filePath: true } },
          },
        },
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

    if (
      job.status === 'planned' &&
      status === 'in_progress' &&
      (!job.teamAssigned || !job.costingCompleted)
    ) {
      const gmpProfiles = await prisma.profile.findMany({
        where: {
          user: {
            roles: {
              some: {
                role: { name: { in: ['gmp', 'group_managing_partner'] } },
              },
            },
          },
        },
        select: { id: true },
      });

      await Promise.all(
        gmpProfiles.map((profile) =>
          NotificationService.createNotification(
            {
              recipientProfileId: profile.id,
              type: 'alert',
              title: 'Procurement gap on job start',
              message: `Job "${job.jobName}" moved to in-progress without full staffing/costing.`,
              actionRequired: true,
              jobId: job.id,
              link: `/jobs/${job.id}`,
            },
            {
              userId: authContext?.userId ?? 0,
              profileId: authContext?.profileId ?? 0,
              roleName: authContext?.roleName ?? 'system',
            }
          )
        )
      );
    }

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

    const role = await prisma.positionRole.findUnique({
      where: { id: input.assignedRoleId },
      select: { id: true, name: true, billingRate: true },
    });

    if (!role) {
      throw new Error('Assigned role not found');
    }

    let assignedHourlyRate = Number(input.assignedHourlyRate ?? 0);

    if (!assignedHourlyRate || assignedHourlyRate <= 0) {
      assignedHourlyRate = Number(role.billingRate || 0);
    }

    if (!assignedHourlyRate || assignedHourlyRate <= 0) {
      throw new Error('Assigned hourly rate is required and must be > 0');
    }

    const roleSnapshot = {
      id: role.id,
      name: role.name,
      billingRate: Number(role.billingRate || 0),
      assignedHourlyRate,
    };

    const assignment = await prisma.jobStaffAssignment.create({
      data: {
        jobId,
        employeeProfileId: input.employeeProfileId,
        assignedRoleId: input.assignedRoleId,
        assignedHourlyRate,
        roleSnapshot,
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
   * Create or update job costing and allocations
   */
  async upsertJobCosting(
    jobId: number,
    input: JobCostingInput,
    authContext: AuthContext
  ) {
    const job = await this.getJobById(jobId);

    const isAdmin = authContext.roles?.includes('admin');
    const isJobManager = job.managerProfileId === authContext.profileId;
    const isPartner = job.partnerProfileId === authContext.profileId;

    if (!isAdmin && !isJobManager && !isPartner) {
      throw new Error('Not authorized to update job costing');
    }

    if (!Array.isArray(input.allocations) || input.allocations.length === 0) {
      throw new Error('Allocations are required');
    }

    const roleIds = Array.from(new Set(input.allocations.map((alloc) => alloc.roleId)));
    const roles = await prisma.positionRole.findMany({
      where: { id: { in: roleIds } },
      select: { id: true, billingRate: true },
    });

    const roleRateMap = new Map<number, number>(
      roles.map((role) => [role.id, Number(role.billingRate)])
    );

    const allocationData = input.allocations.map((alloc) => {
      const rate = alloc.hourlyRate ?? roleRateMap.get(alloc.roleId) ?? 0;
      const hours = Number(alloc.allocatedHours);
      const estimatedCost = hours * rate;

      return {
        employeeProfileId: alloc.employeeProfileId,
        roleId: alloc.roleId,
        allocatedHours: hours,
        hourlyRate: rate,
        estimatedCost,
        billable: alloc.billable ?? true,
        taskDescription: alloc.taskDescription,
      };
    });

    const totalEstimatedHours = allocationData.reduce(
      (sum, alloc) => sum + Number(alloc.allocatedHours),
      0
    );
    const totalEstimatedCost = allocationData.reduce(
      (sum, alloc) => sum + Number(alloc.estimatedCost),
      0
    );

    const baseJobFee =
      job.billingType === 'fixed_fee' ? Number(job.fixedFeeAmount || 0) : Number(input.jobFee);

    if (!baseJobFee || baseJobFee <= 0) {
      throw new Error('Job fee is required before saving costing');
    }

    const allowOverage = input.allowOverage ?? false;
    const maxOveragePercentRaw = input.maxOveragePercent ?? 0.2;
    const maxOveragePercent = Number(maxOveragePercentRaw);
    const maxAllowedCost = allowOverage
      ? baseJobFee * (1 + Math.max(0, maxOveragePercent))
      : baseJobFee;

    if (totalEstimatedCost > maxAllowedCost) {
      if (job.managerProfileId) {
        await NotificationService.createNotification(
          {
            recipientProfileId: job.managerProfileId,
            type: 'alert',
            title: 'Job costing exceeds fee cap',
            message: `Allocated cost (${totalEstimatedCost.toFixed(2)}) exceeds allowed budget (${maxAllowedCost.toFixed(2)}) for "${job.jobName}".`,
            actionRequired: true,
            jobId: job.id,
            link: `/workload-management?jobId=${job.id}`,
          },
          {
            userId: authContext.userId,
            profileId: authContext.profileId,
            roleName: authContext.roleName,
          }
        );
      }
      throw new Error(
        `Allocated cost exceeds job fee. Allowed: ${maxAllowedCost.toFixed(2)}, allocated: ${totalEstimatedCost.toFixed(2)}`
      );
    }

    const jobFee = baseJobFee;
    const remainingBudget = jobFee - totalEstimatedCost;

    const result = await prisma.$transaction(async (tx) => {
      const costing = await tx.jobCosting.upsert({
        where: { jobId },
        create: {
          jobId,
          managerProfileId: job.managerProfileId || authContext.profileId,
          jobFee,
          allocatedCost: totalEstimatedCost,
          remainingBudget,
          totalEstimatedHours,
          totalEstimatedCost,
          costingStatus: 'draft',
          notes: input.notes,
        },
        update: {
          jobFee,
          allocatedCost: totalEstimatedCost,
          remainingBudget,
          totalEstimatedHours,
          totalEstimatedCost,
          costingStatus: 'draft',
          notes: input.notes,
        },
      });

      await tx.jobTimeAllocation.deleteMany({ where: { jobCostingId: costing.id } });
      await tx.jobTimeAllocation.createMany({
        data: allocationData.map((alloc) => ({
          ...alloc,
          jobCostingId: costing.id,
        })),
      });

      await tx.budgetCap.upsert({
        where: { jobCostingId: costing.id },
        create: {
          jobCostingId: costing.id,
          totalAllocatedHours: totalEstimatedHours,
          capEnforced: input.capEnforced ?? true,
          allowOverage,
          maxOveragePercent,
        },
        update: {
          totalAllocatedHours: totalEstimatedHours,
          capEnforced: input.capEnforced ?? true,
          allowOverage,
          maxOveragePercent,
        },
      });

      await tx.job.update({
        where: { id: jobId },
        data: { costingCompleted: true, budgetHours: totalEstimatedHours },
      });

      return tx.jobCosting.findUnique({
        where: { id: costing.id },
        include: { allocations: true, budgetCap: true },
      });
    });

    return result;
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
        allocations: true,
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
        employee: { select: { id: true, firstName: true, lastName: true, email: true } },
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
