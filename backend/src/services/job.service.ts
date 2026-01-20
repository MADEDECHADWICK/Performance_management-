import { prisma } from '../lib/prisma';

interface AuthContext {
  userId: number;
  profileId: number;
  roleName?: string;
}

interface ListOptions {
  page: number;
  pageSize: number;
  status?: string;
  clientId?: number;
  partnerId?: number;
}

export class JobService {
  /**
   * List jobs with access control
   */
  static async listJobs(options: ListOptions, auth: AuthContext) {
    const { page, pageSize, status, clientId, partnerId } = options;
    const skip = (page - 1) * pageSize;

    const where: any = {};

    if (status) where.status = status;
    if (clientId) where.client_id = clientId;
    if (partnerId) where.partner_id = partnerId;

    // Access control
    if (!['admin', 'manager'].includes(auth.roleName || '')) {
      // Employees/Partners see jobs they're assigned to
      if (auth.roleName === 'partner') {
        where.partner_id = auth.profileId;
      } else {
        // Employees see jobs they're staffed on
        where.staffing = {
          some: {
            employee_profile_id: auth.profileId,
          },
        };
      }
    }

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        include: {
          client: {
            select: { id: true, name: true },
          },
          partner: {
            select: { id: true, first_name: true, last_name: true },
          },
          staffing: {
            select: {
              id: true,
              employee_profile_id: true,
              status: true,
            },
          },
        },
        skip,
        take: pageSize,
        orderBy: { created_at: 'desc' },
      }),
      prisma.job.count({ where }),
    ]);

    return { jobs, total };
  }

  /**
   * Create new job
   */
  static async createJob(input: any, auth: AuthContext) {
    // ✅ VERIFY AUTHORIZATION
    if (!['admin', 'manager'].includes(auth.roleName || '')) {
      throw {
        statusCode: 403,
        message: 'Only admins/managers can create jobs',
      };
    }

    const {
      name,
      description,
      client_id,
      partner_id,
      budget_cap,
      start_date,
      end_date,
      status,
    } = input;

    // ✅ VALIDATE CLIENT EXISTS
    const client = await prisma.profile.findUnique({
      where: { id: client_id },
    });

    if (!client) {
      throw {
        statusCode: 404,
        message: 'Client not found',
      };
    }

    // ✅ VALIDATE PARTNER EXISTS
    const partner = await prisma.profile.findUnique({
      where: { id: partner_id },
    });

    if (!partner) {
      throw {
        statusCode: 404,
        message: 'Partner not found',
      };
    }

    // ✅ VALIDATE DATES
    if (new Date(start_date) >= new Date(end_date)) {
      throw {
        statusCode: 400,
        message: 'Start date must be before end date',
      };
    }

    const job = await prisma.job.create({
      data: {
        name,
        description,
        client_id,
        partner_id,
        budget_cap: budget_cap || 0,
        start_date: new Date(start_date),
        end_date: new Date(end_date),
        status: status || 'open',
        created_at: new Date(),
      },
      include: {
        client: { select: { id: true, name: true } },
        partner: { select: { id: true, first_name: true, last_name: true } },
      },
    });

    return job;
  }

  /**
   * Get specific job
   */
  static async getJob(jobId: number, auth: AuthContext) {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        client: { select: { id: true, name: true } },
        partner: { select: { id: true, first_name: true, last_name: true } },
        staffing: {
          include: {
            employee: { select: { id: true, first_name: true, last_name: true } },
          },
        },
      },
    });

    if (!job) {
      throw {
        statusCode: 404,
        message: 'Job not found',
      };
    }

    // ✅ VERIFY ACCESS
    const canView =
      auth.roleName === 'admin' ||
      auth.roleName === 'manager' ||
      job.partner_id === auth.profileId ||
      job.staffing.some(s => s.employee_profile_id === auth.profileId);

    if (!canView) {
      throw {
        statusCode: 403,
        message: 'You do not have permission to view this job',
      };
    }

    return job;
  }

  /**
   * Update job
   */
  static async updateJob(jobId: number, input: any, auth: AuthContext) {
    // ✅ VERIFY AUTHORIZATION
    if (!['admin', 'manager'].includes(auth.roleName || '')) {
      throw {
        statusCode: 403,
        message: 'Only admins/managers can update jobs',
      };
    }

    const job = await prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw {
        statusCode: 404,
        message: 'Job not found',
      };
    }

    // ✅ WHITELIST FIELDS
    const allowedFields = [
      'name',
      'description',
      'budget_cap',
      'end_date',
      'status',
    ];

    const updateData: Record<string, any> = {};

    for (const field of allowedFields) {
      if (field in input) {
        if (field === 'end_date') {
          updateData[field] = new Date(input[field]);
        } else {
          updateData[field] = input[field];
        }
      }
    }

    const updated = await prisma.job.update({
      where: { id: jobId },
      data: {
        ...updateData,
        updated_at: new Date(),
      },
      include: {
        client: { select: { id: true, name: true } },
        partner: { select: { id: true, first_name: true, last_name: true } },
      },
    });

    return updated;
  }

  /**
   * Delete job
   */
  static async deleteJob(jobId: number, auth: AuthContext) {
    // ✅ VERIFY AUTHORIZATION (admin only)
    if (auth.roleName !== 'admin') {
      throw {
        statusCode: 403,
        message: 'Only admins can delete jobs',
      };
    }

    const job = await prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw {
        statusCode: 404,
        message: 'Job not found',
      };
    }

    // ✅ PREVENT DELETION IF HAS TIME ENTRIES
    const timeEntries = await prisma.timeEntry.count({
      where: { job_id: jobId },
    });

    if (timeEntries > 0) {
      throw {
        statusCode: 400,
        message: 'Cannot delete job with time entries',
      };
    }

    await prisma.job.delete({
      where: { id: jobId },
    });

    return true;
  }

  /**
   * Update job status (workflow)
   */
  static async updateJobStatus(jobId: number, status: string, auth: AuthContext) {
    // ✅ VERIFY AUTHORIZATION
    if (!['admin', 'manager'].includes(auth.roleName || '')) {
      throw {
        statusCode: 403,
        message: 'Only admins/managers can update job status',
      };
    }

    const validStatuses = ['open', 'in_progress', 'completed', 'cancelled'];

    if (!validStatuses.includes(status)) {
      throw {
        statusCode: 400,
        message: `Status must be one of: ${validStatuses.join(', ')}`,
      };
    }

    const job = await prisma.job.update({
      where: { id: jobId },
      data: { status, updated_at: new Date() },
      include: {
        client: { select: { id: true, name: true } },
      },
    });

    return job;
  }

  /**
   * Assign staff to job
   */
  static async assignStaff(jobId: number, input: any, auth: AuthContext) {
    // ✅ VERIFY AUTHORIZATION
    if (!['admin', 'manager'].includes(auth.roleName || '')) {
      throw {
        statusCode: 403,
        message: 'Only admins/managers can assign staff',
      };
    }

    const { employee_profile_id, start_date, end_date, allocation_percentage } = input;

    // ✅ VERIFY JOB EXISTS
    const job = await prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw {
        statusCode: 404,
        message: 'Job not found',
      };
    }

    // ✅ VERIFY EMPLOYEE EXISTS
    const employee = await prisma.profile.findUnique({
      where: { id: employee_profile_id },
    });

    if (!employee) {
      throw {
        statusCode: 404,
        message: 'Employee not found',
      };
    }

    // ✅ CHECK FOR DUPLICATE ASSIGNMENT
    const existing = await prisma.jobStaffing.findFirst({
      where: {
        job_id: jobId,
        employee_profile_id: employee_profile_id,
        status: 'active',
      },
    });

    if (existing) {
      throw {
        statusCode: 400,
        message: 'Employee already assigned to this job',
      };
    }

    const staffing = await prisma.jobStaffing.create({
      data: {
        job_id: jobId,
        employee_profile_id,
        start_date: new Date(start_date),
        end_date: end_date ? new Date(end_date) : null,
        allocation_percentage: allocation_percentage || 100,
        status: 'active',
        created_at: new Date(),
      },
      include: {
        job: { select: { id: true, name: true } },
        employee: { select: { id: true, first_name: true, last_name: true } },
      },
    });

    return staffing;
  }

  /**
   * Update staff assignment
   */
  static async updateStaffAssignment(
    jobId: number,
    staffingId: number,
    input: any,
    auth: AuthContext
  ) {
    // ✅ VERIFY AUTHORIZATION
    if (!['admin', 'manager'].includes(auth.roleName || '')) {
      throw {
        statusCode: 403,
        message: 'Only admins/managers can update assignments',
      };
    }

    const staffing = await prisma.jobStaffing.findUnique({
      where: { id: staffingId },
    });

    if (!staffing || staffing.job_id !== jobId) {
      throw {
        statusCode: 404,
        message: 'Staff assignment not found',
      };
    }

    const { allocation_percentage, end_date } = input;

    const updated = await prisma.jobStaffing.update({
      where: { id: staffingId },
      data: {
        allocation_percentage: allocation_percentage || staffing.allocation_percentage,
        end_date: end_date ? new Date(end_date) : staffing.end_date,
        updated_at: new Date(),
      },
      include: {
        employee: { select: { id: true, first_name: true, last_name: true } },
      },
    });

    return updated;
  }

  /**
   * Remove staff from job
   */
  static async removeStaff(jobId: number, staffingId: number, auth: AuthContext) {
    // ✅ VERIFY AUTHORIZATION
    if (!['admin', 'manager'].includes(auth.roleName || '')) {
      throw {
        statusCode: 403,
        message: 'Only admins/managers can remove staff',
      };
    }

    const staffing = await prisma.jobStaffing.findUnique({
      where: { id: staffingId },
    });

    if (!staffing || staffing.job_id !== jobId) {
      throw {
        statusCode: 404,
        message: 'Staff assignment not found',
      };
    }

    await prisma.jobStaffing.delete({
      where: { id: staffingId },
    });

    return true;
  }

  /**
   * Get job staff assignments
   */
  static async getJobStaff(jobId: number, auth: AuthContext) {
    // ✅ VERIFY ACCESS
    const job = await prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw {
        statusCode: 404,
        message: 'Job not found',
      };
    }

    const canView =
      auth.roleName === 'admin' ||
      auth.roleName === 'manager' ||
      job.partner_id === auth.profileId;

    if (!canView) {
      throw {
        statusCode: 403,
        message: 'You do not have permission to view this job staff',
      };
    }

    const staff = await prisma.jobStaffing.findMany({
      where: { job_id: jobId },
      include: {
        employee: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true,
          },
        },
      },
      orderBy: { start_date: 'desc' },
    });

    return staff;
  }

  /**
   * Get job budget information
   */
  static async getJobBudget(jobId: number, auth: AuthContext) {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        timeEntries: {
          where: { status: 'approved' },
        },
      },
    });

    if (!job) {
      throw {
        statusCode: 404,
        message: 'Job not found',
      };
    }

    // ✅ VERIFY ACCESS
    const canView =
      auth.roleName === 'admin' ||
      auth.roleName === 'manager' ||
      job.partner_id === auth.profileId;

    if (!canView) {
      throw {
        statusCode: 403,
        message: 'You do not have permission to view this budget',
      };
    }

    const totalApprovedHours = job.timeEntries.reduce(
      (sum, te) => sum + te.hours,
      0
    );

    const budgetRemaining = job.budget_cap
      ? job.budget_cap - totalApprovedHours
      : null;

    const percentageUsed = job.budget_cap
      ? (totalApprovedHours / job.budget_cap) * 100
      : 0;

    return {
      jobId,
      budgetCap: job.budget_cap,
      approvedHours: totalApprovedHours,
      budgetRemaining,
      percentageUsed,
      status:
        percentageUsed > 100
          ? 'exceeded'
          : percentageUsed > 80
          ? 'warning'
          : 'normal',
    };
  }

  /**
   * Create job task
   */
  static async createJobTask(jobId: number, input: any, auth: AuthContext) {
    // ✅ VERIFY AUTHORIZATION
    if (!['admin', 'manager'].includes(auth.roleName || '')) {
      throw {
        statusCode: 403,
        message: 'Only admins/managers can create tasks',
      };
    }

    const job = await prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw {
        statusCode: 404,
        message: 'Job not found',
      };
    }

    const { name, description, status, estimated_hours } = input;

    const task = await prisma.jobTask.create({
      data: {
        job_id: jobId,
        name,
        description,
        status: status || 'open',
        estimated_hours: estimated_hours || 0,
        created_at: new Date(),
      },
    });

    return task;
  }

  /**
   * Get job tasks
   */
  static async getJobTasks(jobId: number, auth: AuthContext) {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw {
        statusCode: 404,
        message: 'Job not found',
      };
    }

    // ✅ VERIFY ACCESS
    const canView =
      auth.roleName === 'admin' ||
      auth.roleName === 'manager' ||
      job.partner_id === auth.profileId;

    if (!canView) {
      throw {
        statusCode: 403,
        message: 'You do not have permission to view this job tasks',
      };
    }

    const tasks = await prisma.jobTask.findMany({
      where: { job_id: jobId },
      orderBy: { created_at: 'desc' },
    });

    return tasks;
  }

  /**
   * Get job timeline/milestones
   */
  static async getJobTimeline(jobId: number, auth: AuthContext) {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw {
        statusCode: 404,
        message: 'Job not found',
      };
    }

    // ✅ VERIFY ACCESS
    const canView =
      auth.roleName === 'admin' ||
      auth.roleName === 'manager' ||
      job.partner_id === auth.profileId;

    if (!canView) {
      throw {
        statusCode: 403,
        message: 'You do not have permission to view this timeline',
      };
    }

    const timeline = {
      jobId,
      name: job.name,
      status: job.status,
      startDate: job.start_date,
      endDate: job.end_date,
      daysRemaining: Math.floor(
        (new Date(job.end_date).getTime() - new Date().getTime()) /
          (1000 * 60 * 60 * 24)
      ),
      isOverdue: new Date() > new Date(job.end_date),
      tasks: await prisma.jobTask.findMany({
        where: { job_id: jobId },
      }),
      milestones: [], // Can be expanded with milestone tracking
    };

    return timeline;
  }
}