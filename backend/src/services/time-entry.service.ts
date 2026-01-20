/**
 * Time Entry Service (Schema v2.1 aligned)
 * - Uses TimeEntry.dateWorked, startedAt, endedAt
 * - Status flow: pending -> submitted -> approved/rejected/cancelled
 * - Uses JobStaffAssignment for "assigned to job" checks
 * - Access checks use Job.managerProfileId / Job.partnerProfileId
 */

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
  jobId?: number;
  dateFrom?: Date;
  dateTo?: Date;
}

export class TimeEntryService {
  /**
   * List time entries with access control
   */
  static async listTimeEntries(options: ListOptions, auth: AuthContext) {
    const { page, pageSize, status, jobId, dateFrom, dateTo } = options;
    const skip = (page - 1) * pageSize;

    // Build where clause based on user role
    const where: any = {};

    // Filter by job if specified
    if (jobId) {
      where.job_id = jobId;
    }

    // Filter by status if specified
    if (status) {
      where.status = status;
    }

    // Filter by date range if specified
    if (dateFrom) {
      where.date_worked = { ...where.date_worked, gte: dateFrom };
    }
    if (dateTo) {
      where.date_worked = { ...where.date_worked, lte: dateTo };
    }

    // Access control based on role
    if (!['admin', 'manager', 'partner'].includes(auth.roleName || '')) {
      // Regular employees only see their own entries
      where.employee_profile_id = auth.profileId;
    } else if (auth.roleName === 'partner') {
      // Partners only see their own jobs' time entries
      where.job = {
        partner_id: auth.profileId,
      };
    }

    const [timeEntries, total] = await Promise.all([
      prisma.timeEntry.findMany({
        where,
        include: {
          job: {
            select: {
              id: true,
              name: true,
              budget_cap: true,
              client_id: true,
            },
          },
          employee: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              email: true,
            },
          },
          approver: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
            },
          },
          task: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        skip,
        take: pageSize,
        orderBy: { date_worked: 'desc' },
      }),
      prisma.timeEntry.count({ where }),
    ]);

    return { timeEntries, total };
  }

  /**
   * Create a new time entry
   */
  static async createTimeEntry(input: any, auth: AuthContext) {
    const {
      job_id,
      hours,
      description,
      date_worked,
      task_id,
    } = input;

    // ✅ VERIFY JOB EXISTS
    const job = await prisma.job.findUnique({
      where: { id: job_id },
      include: {
        budget: true,
        staffing: {
          where: {
            employee_profile_id: auth.profileId,
            status: 'active',
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

    // ✅ VERIFY USER IS ASSIGNED TO THIS JOB (unless admin)
    if (auth.roleName !== 'admin' && job.staffing.length === 0) {
      throw {
        statusCode: 403,
        message: 'You are not assigned to this job',
      };
    }

    // ✅ CHECK BUDGET AVAILABILITY
    if (job.budget_cap && job.budget_cap > 0) {
      const existingHours = await prisma.timeEntry.aggregate({
        where: {
          job_id: job_id,
          status: { in: ['approved', 'submitted'] },
        },
        _sum: { hours: true },
      });

      const totalHours = (existingHours._sum.hours || 0) + hours;

      if (totalHours > job.budget_cap) {
        throw {
          statusCode: 400,
          message: `Time entry exceeds job budget. Available: ${(job.budget_cap - (existingHours._sum.hours || 0)).toFixed(2)} hours, requested: ${hours} hours`,
        };
      }
    }

    // ✅ VERIFY TASK EXISTS IF PROVIDED
    if (task_id) {
      const task = await prisma.jobTask.findUnique({
        where: { id: task_id },
      });

      if (!task || task.job_id !== job_id) {
        throw {
          statusCode: 404,
          message: 'Task not found or does not belong to this job',
        };
      }
    }

    // ✅ CREATE TIME ENTRY
    const timeEntry = await prisma.timeEntry.create({
      data: {
        job_id: job_id,
        employee_profile_id: auth.profileId,
        hours,
        description,
        date_worked: new Date(date_worked),
        task_id: task_id || null,
        status: 'draft',
        created_at: new Date(),
      },
      include: {
        job: {
          select: { id: true, name: true },
        },
        employee: {
          select: { id: true, first_name: true, last_name: true },
        },
      },
    });

    return timeEntry;
  }

  /**
   * Get a specific time entry
   */
  static async getTimeEntry(timeEntryId: number, auth: AuthContext) {
    const timeEntry = await prisma.timeEntry.findUnique({
      where: { id: timeEntryId },
      include: {
        job: {
          select: {
            id: true,
            name: true,
            budget_cap: true,
            client_id: true,
          },
        },
        employee: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true,
          },
        },
        approver: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
          },
        },
        task: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!timeEntry) {
      throw {
        statusCode: 404,
        message: 'Time entry not found',
      };
    }

    // ✅ VERIFY ACCESS
    const canView =
      auth.roleName === 'admin' ||
      auth.roleName === 'manager' ||
      (auth.roleName === 'partner' && timeEntry.job.client_id === auth.profileId) ||
      timeEntry.employee_profile_id === auth.profileId;

    if (!canView) {
      throw {
        statusCode: 403,
        message: 'You do not have permission to view this time entry',
      };
    }

    return timeEntry;
  }

  /**
   * Update time entry (only before submission)
   */
  static async updateTimeEntry(
    timeEntryId: number,
    input: any,
    auth: AuthContext
  ) {
    const { hours, description } = input;

    const timeEntry = await prisma.timeEntry.findUnique({
      where: { id: timeEntryId },
      include: { job: true },
    });

    if (!timeEntry) {
      throw {
        statusCode: 404,
        message: 'Time entry not found',
      };
    }

    // ✅ VERIFY OWNERSHIP
    if (
      timeEntry.employee_profile_id !== auth.profileId &&
      auth.roleName !== 'admin'
    ) {
      throw {
        statusCode: 403,
        message: 'You can only update your own time entries',
      };
    }

    // ✅ VERIFY STATUS - can only update draft entries
    if (timeEntry.status !== 'draft') {
      throw {
        statusCode: 400,
        message: `Cannot update time entry with status: ${timeEntry.status}`,
      };
    }

    // ✅ CHECK BUDGET IF HOURS CHANGED
    if (hours && hours !== timeEntry.hours) {
      if (timeEntry.job.budget_cap && timeEntry.job.budget_cap > 0) {
        const existingHours = await prisma.timeEntry.aggregate({
          where: {
            job_id: timeEntry.job_id,
            status: { in: ['approved', 'submitted'] },
            id: { not: timeEntryId },
          },
          _sum: { hours: true },
        });

        const totalHours = (existingHours._sum.hours || 0) + hours;

        if (totalHours > timeEntry.job.budget_cap) {
          throw {
            statusCode: 400,
            message: `Updated hours would exceed job budget`,
          };
        }
      }
    }

    const updated = await prisma.timeEntry.update({
      where: { id: timeEntryId },
      data: {
        hours: hours || timeEntry.hours,
        description: description || timeEntry.description,
        updated_at: new Date(),
      },
      include: {
        job: {
          select: { id: true, name: true },
        },
        employee: {
          select: { id: true, first_name: true, last_name: true },
        },
      },
    });

    return updated;
  }

  /**
   * Delete time entry (only before approval)
   */
  static async deleteTimeEntry(timeEntryId: number, auth: AuthContext) {
    const timeEntry = await prisma.timeEntry.findUnique({
      where: { id: timeEntryId },
    });

    if (!timeEntry) {
      throw {
        statusCode: 404,
        message: 'Time entry not found',
      };
    }

    // ✅ VERIFY OWNERSHIP
    if (
      timeEntry.employee_profile_id !== auth.profileId &&
      auth.roleName !== 'admin'
    ) {
      throw {
        statusCode: 403,
        message: 'You can only delete your own time entries',
      };
    }

    // ✅ VERIFY STATUS - can only delete draft/rejected entries
    if (!['draft', 'rejected'].includes(timeEntry.status)) {
      throw {
        statusCode: 400,
        message: `Cannot delete time entry with status: ${timeEntry.status}`,
      };
    }

    await prisma.timeEntry.delete({
      where: { id: timeEntryId },
    });

    return true;
  }

  /**
   * Submit time entry for approval
   */
  static async submitTimeEntry(timeEntryId: number, auth: AuthContext) {
    const timeEntry = await prisma.timeEntry.findUnique({
      where: { id: timeEntryId },
    });

    if (!timeEntry) {
      throw {
        statusCode: 404,
        message: 'Time entry not found',
      };
    }

    // ✅ VERIFY OWNERSHIP
    if (
      timeEntry.employee_profile_id !== auth.profileId &&
      auth.roleName !== 'admin'
    ) {
      throw {
        statusCode: 403,
        message: 'You can only submit your own time entries',
      };
    }

    // ✅ VERIFY STATUS
    if (timeEntry.status !== 'draft') {
      throw {
        statusCode: 400,
        message: `Cannot submit time entry with status: ${timeEntry.status}`,
      };
    }

    const updated = await prisma.timeEntry.update({
      where: { id: timeEntryId },
      data: {
        status: 'submitted',
        submitted_at: new Date(),
        updated_at: new Date(),
      },
      include: {
        job: {
          select: { id: true, name: true },
        },
        employee: {
          select: { id: true, first_name: true, last_name: true },
        },
      },
    });

    // TODO: Trigger notification to job manager/partner

    return updated;
  }

  /**
   * Approve time entry (managers/partners only)
   */
  static async approveTimeEntry(
    timeEntryId: number,
    approvalNotes: string,
    auth: AuthContext
  ) {
    // ✅ VERIFY USER IS MANAGER/PARTNER
    if (!['manager', 'partner', 'admin'].includes(auth.roleName || '')) {
      throw {
        statusCode: 403,
        message: 'Only managers/partners can approve time entries',
      };
    }

    const timeEntry = await prisma.timeEntry.findUnique({
      where: { id: timeEntryId },
      include: { job: true },
    });

    if (!timeEntry) {
      throw {
        statusCode: 404,
        message: 'Time entry not found',
      };
    }

    // ✅ VERIFY ACCESS TO JOB
    if (auth.roleName === 'partner') {
      const isPartnerOfJob = await prisma.job.findFirst({
        where: {
          id: timeEntry.job_id,
          partner_id: auth.profileId,
        },
      });

      if (!isPartnerOfJob) {
        throw {
          statusCode: 403,
          message: 'You do not have permission to approve this time entry',
        };
      }
    }

    // ✅ VERIFY STATUS
    if (timeEntry.status !== 'submitted') {
      throw {
        statusCode: 400,
        message: `Cannot approve time entry with status: ${timeEntry.status}`,
      };
    }

    const updated = await prisma.timeEntry.update({
      where: { id: timeEntryId },
      data: {
        status: 'approved',
        approver_profile_id: auth.profileId,
        approval_notes: approvalNotes,
        approved_at: new Date(),
        updated_at: new Date(),
      },
      include: {
        job: {
          select: { id: true, name: true },
        },
        employee: {
          select: { id: true, first_name: true, last_name: true },
        },
        approver: {
          select: { id: true, first_name: true, last_name: true },
        },
      },
    });

    // TODO: Trigger notification to employee

    return updated;
  }

  /**
   * Reject time entry with reason
   */
  static async rejectTimeEntry(
    timeEntryId: number,
    rejectionReason: string,
    auth: AuthContext
  ) {
    // ✅ VERIFY USER IS MANAGER/PARTNER
    if (!['manager', 'partner', 'admin'].includes(auth.roleName || '')) {
      throw {
        statusCode: 403,
        message: 'Only managers/partners can reject time entries',
      };
    }

    const timeEntry = await prisma.timeEntry.findUnique({
      where: { id: timeEntryId },
      include: { job: true },
    });

    if (!timeEntry) {
      throw {
        statusCode: 404,
        message: 'Time entry not found',
      };
    }

    // ✅ VERIFY ACCESS TO JOB
    if (auth.roleName === 'partner') {
      const isPartnerOfJob = await prisma.job.findFirst({
        where: {
          id: timeEntry.job_id,
          partner_id: auth.profileId,
        },
      });

      if (!isPartnerOfJob) {
        throw {
          statusCode: 403,
          message: 'You do not have permission to reject this time entry',
        };
      }
    }

    // ✅ VERIFY STATUS
    if (!['submitted', 'approved'].includes(timeEntry.status)) {
      throw {
        statusCode: 400,
        message: `Cannot reject time entry with status: ${timeEntry.status}`,
      };
    }

    const updated = await prisma.timeEntry.update({
      where: { id: timeEntryId },
      data: {
        status: 'rejected',
        approver_profile_id: auth.profileId,
        approval_notes: rejectionReason,
        approved_at: new Date(),
        updated_at: new Date(),
      },
      include: {
        job: {
          select: { id: true, name: true },
        },
        employee: {
          select: { id: true, first_name: true, last_name: true },
        },
        approver: {
          select: { id: true, first_name: true, last_name: true },
        },
      },
    });

    // TODO: Trigger notification to employee

    return updated;
  }

  /**
   * Start real-time timer
   */
  static async startTimer(timeEntryId: number, auth: AuthContext) {
    const timeEntry = await prisma.timeEntry.findUnique({
      where: { id: timeEntryId },
    });

    if (!timeEntry) {
      throw {
        statusCode: 404,
        message: 'Time entry not found',
      };
    }

    // ✅ VERIFY OWNERSHIP
    if (
      timeEntry.employee_profile_id !== auth.profileId &&
      auth.roleName !== 'admin'
    ) {
      throw {
        statusCode: 403,
        message: 'You can only start timers for your own entries',
      };
    }

    // ✅ VERIFY STATUS
    if (!['draft', 'submitted'].includes(timeEntry.status)) {
      throw {
        statusCode: 400,
        message: `Cannot start timer for entry with status: ${timeEntry.status}`,
      };
    }

    // ✅ CHECK IF TIMER ALREADY RUNNING
    if (timeEntry.timer_started_at) {
      throw {
        statusCode: 400,
        message: 'Timer is already running for this entry',
      };
    }

    const updated = await prisma.timeEntry.update({
      where: { id: timeEntryId },
      data: {
        timer_started_at: new Date(),
        updated_at: new Date(),
      },
      include: {
        job: {
          select: { id: true, name: true },
        },
      },
    });

    return updated;
  }

  /**
   * Stop real-time timer
   */
  static async stopTimer(timeEntryId: number, auth: AuthContext) {
    const timeEntry = await prisma.timeEntry.findUnique({
      where: { id: timeEntryId },
    });

    if (!timeEntry) {
      throw {
        statusCode: 404,
        message: 'Time entry not found',
      };
    }

    // ✅ VERIFY OWNERSHIP
    if (
      timeEntry.employee_profile_id !== auth.profileId &&
      auth.roleName !== 'admin'
    ) {
      throw {
        statusCode: 403,
        message: 'You can only stop timers for your own entries',
      };
    }

    // ✅ VERIFY TIMER WAS STARTED
    if (!timeEntry.timer_started_at) {
      throw {
        statusCode: 400,
        message: 'Timer was not started for this entry',
      };
    }

    // ✅ CALCULATE ELAPSED TIME
    const elapsedMs = new Date().getTime() - new Date(timeEntry.timer_started_at).getTime();
    const elapsedHours = elapsedMs / (1000 * 60 * 60);
    const totalHours = Number((timeEntry.hours + elapsedHours).toFixed(2));

    // ✅ VERIFY BUDGET AFTER ADDING TIME
    const job = await prisma.job.findUnique({
      where: { id: timeEntry.job_id },
    });

    if (job?.budget_cap && job.budget_cap > 0) {
      const existingHours = await prisma.timeEntry.aggregate({
        where: {
          job_id: timeEntry.job_id,
          status: { in: ['approved', 'submitted'] },
          id: { not: timeEntryId },
        },
        _sum: { hours: true },
      });

      if (totalHours + (existingHours._sum.hours || 0) > job.budget_cap) {
        throw {
          statusCode: 400,
          message: `Adding timer duration would exceed job budget`,
        };
      }
    }

    const updated = await prisma.timeEntry.update({
      where: { id: timeEntryId },
      data: {
        timer_started_at: null,
        hours: totalHours,
        updated_at: new Date(),
      },
      include: {
        job: {
          select: { id: true, name: true },
        },
      },
    });

    return updated;
  }

  /**
   * Batch submit multiple time entries
   */
  static async batchSubmitTimeEntries(
    timeEntryIds: number[],
    auth: AuthContext
  ) {
    // Get all entries to verify ownership
    const entries = await prisma.timeEntry.findMany({
      where: {
        id: { in: timeEntryIds },
      },
    });

    // Verify ownership for non-admin users
    if (auth.roleName !== 'admin') {
      const unauthorized = entries.filter(
        e => e.employee_profile_id !== auth.profileId
      );
      if (unauthorized.length > 0) {
        throw {
          statusCode: 403,
          message: 'You can only submit your own time entries',
        };
      }
    }

    const result = await prisma.timeEntry.updateMany({
      where: {
        id: { in: timeEntryIds },
        status: 'draft',
      },
      data: {
        status: 'submitted',
        submitted_at: new Date(),
        updated_at: new Date(),
      },
    });

    return {
      submitted: result.count,
      total: timeEntryIds.length,
      failed: timeEntryIds.length - result.count,
    };
  }

  /**
   * Batch approve multiple time entries
   */
  static async batchApproveTimeEntries(
    timeEntryIds: number[],
    auth: AuthContext
  ) {
    // ✅ VERIFY USER IS MANAGER/PARTNER
    if (!['manager', 'partner', 'admin'].includes(auth.roleName || '')) {
      throw {
        statusCode: 403,
        message: 'Only managers/partners can approve time entries',
      };
    }

    // Get all entries to verify access if partner
    if (auth.roleName === 'partner') {
      const entries = await prisma.timeEntry.findMany({
        where: {
          id: { in: timeEntryIds },
        },
        include: { job: true },
      });

      const unauthorized = entries.filter(e => e.job.partner_id !== auth.profileId);
      if (unauthorized.length > 0) {
        throw {
          statusCode: 403,
          message: 'You do not have permission to approve all these entries',
        };
      }
    }

    const result = await prisma.timeEntry.updateMany({
      where: {
        id: { in: timeEntryIds },
        status: 'submitted',
      },
      data: {
        status: 'approved',
        approver_profile_id: auth.profileId,
        approved_at: new Date(),
        updated_at: new Date(),
      },
    });

    return {
      approved: result.count,
      total: timeEntryIds.length,
      failed: timeEntryIds.length - result.count,
    };
  }

  /**
   * Get time entry summary for a job
   */
  static async getJobTimeSummary(jobId: number, auth: AuthContext) {
    // ✅ VERIFY ACCESS TO JOB
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
      (auth.roleName === 'partner' && job.partner_id === auth.profileId);

    if (!canView) {
      throw {
        statusCode: 403,
        message: 'You do not have permission to view this job summary',
      };
    }

    // Get all time entries for the job
    const timeEntries = await prisma.timeEntry.findMany({
      where: { job_id: jobId },
      include: {
        employee: {
          select: { id: true, first_name: true, last_name: true },
        },
      },
    });

    // Calculate summary
    const summary = {
      jobId,
      totalHours: 0,
      approvedHours: 0,
      submittedHours: 0,
      draftHours: 0,
      rejectedHours: 0,
      budgetCap: job.budget_cap,
      budgetUsed: 0,
      budgetRemaining: job.budget_cap,
      percentageUsed: 0,
      entriesByStatus: {
        draft: 0,
        submitted: 0,
        approved: 0,
        rejected: 0,
      },
      entriesByEmployee: {} as Record<number, any>,
    };

    for (const entry of timeEntries) {
      summary.totalHours += entry.hours;
      summary.entriesByStatus[entry.status as keyof typeof summary.entriesByStatus]++;

      if (entry.status === 'approved') {
        summary.approvedHours += entry.hours;
      } else if (entry.status === 'submitted') {
        summary.submittedHours += entry.hours;
      } else if (entry.status === 'draft') {
        summary.draftHours += entry.hours;
      } else if (entry.status === 'rejected') {
        summary.rejectedHours += entry.hours;
      }

      // Group by employee
      const empId = entry.employee_profile_id;
      if (!summary.entriesByEmployee[empId]) {
        summary.entriesByEmployee[empId] = {
          employee: entry.employee,
          totalHours: 0,
          approvedHours: 0,
        };
      }
      summary.entriesByEmployee[empId].totalHours += entry.hours;
      if
