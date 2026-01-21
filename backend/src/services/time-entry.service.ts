/**
 * Time Entry Service (Schema v2.1 aligned)
 * - Uses TimeEntry.dateWorked, startedAt, endedAt
 * - Status flow: pending -> submitted -> approved/rejected/cancelled
 * - Uses JobStaffAssignment for "assigned to job" checks
 * - Access checks use Job.managerProfileId / Job.partnerProfileId
 */

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
      where.jobId = jobId;
    }

    // Filter by status if specified
    if (status) {
      where.status = status;
    }

    // Filter by date range if specified
    if (dateFrom) {
      where.dateWorked = { ...where.dateWorked, gte: dateFrom };
    }
    if (dateTo) {
      where.dateWorked = { ...where.dateWorked, lte: dateTo };
    }

    // Access control based on role
    if (!['admin', 'manager', 'partner'].includes(auth.roleName || '')) {
      // Regular employees only see their own entries
      where.employeeProfileId = auth.profileId;
    } else if (auth.roleName === 'partner') {
      // Partners only see their own jobs' time entries
      where.job = {
        partnerProfileId: auth.profileId,
      };
    }

    const [timeEntries, total] = await Promise.all([
      prisma.timeEntry.findMany({
        where,
        include: {
          job: {
            select: {
              id: true,
              jobName: true,
              budgetHours: true,
              clientId: true,
            },
          },
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              user: { select: { email: true } },
            },
          },
          approver: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          task: {
            select: {
              id: true,
              title: true,
            },
          },
        },
        skip,
        take: pageSize,
        orderBy: { dateWorked: 'desc' },
      }),
      prisma.timeEntry.count({ where }),
    ]);

    return { timeEntries, total };
  }

  /**
   * Create a new time entry
   */
  static async createTimeEntry(input: any, auth: AuthContext) {
    const { jobId, taskId, dateWorked, hours, description } = input;

    // ✅ VERIFY JOB EXISTS
    const job = await prisma.job.findUnique({
      where: { id: Number(jobId) },
      include: {
        staffing: {
          where: {
            employeeProfileId: auth.profileId,
          },
        },
        jobCosting: {
          include: { budgetCap: true },
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
    const budgetHours = Number(job.jobCosting?.budgetCap?.totalAllocatedHours ?? job.budgetHours ?? 0);
    if (budgetHours > 0) {
      const existingHours = await prisma.timeEntry.aggregate({
        where: {
          jobId: Number(jobId),
          status: { in: ['approved', 'submitted'] },
        },
        _sum: { hours: true },
      });

      const totalHours = (existingHours._sum.hours || 0) + hours;

      if (totalHours > budgetHours) {
        throw {
          statusCode: 400,
          message: `Time entry exceeds job budget. Available: ${(budgetHours - (existingHours._sum.hours || 0)).toFixed(2)} hours, requested: ${hours} hours`,
        };
      }
    }

    // ✅ VERIFY TASK EXISTS IF PROVIDED
    if (taskId) {
      const task = await prisma.task.findUnique({
        where: { id: Number(taskId) },
      });

      if (!task || task.jobId !== Number(jobId)) {
        throw {
          statusCode: 404,
          message: 'Task not found or does not belong to this job',
        };
      }
    }

    // ✅ CREATE TIME ENTRY
    const timeEntry = await prisma.timeEntry.create({
      data: {
        jobId: Number(jobId),
        employeeProfileId: auth.profileId,
        hours,
        description,
        dateWorked: new Date(dateWorked),
        taskId: taskId ? Number(taskId) : null,
        billable: input.billable ?? true,
        status: 'pending',
      },
      include: {
        job: {
          select: { id: true, jobName: true },
        },
        employee: {
          select: { id: true, firstName: true, lastName: true },
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
            jobName: true,
            budgetHours: true,
            clientId: true,
            partnerProfileId: true,
          },
        },
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            user: { select: { email: true } },
          },
        },
        approver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        task: {
          select: {
            id: true,
            title: true,
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
      (auth.roleName === 'partner' && timeEntry.job.partnerProfileId === auth.profileId) ||
      timeEntry.employeeProfileId === auth.profileId;

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
      include: {
        job: {
          include: {
            jobCosting: { include: { budgetCap: true } },
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

    // ✅ VERIFY OWNERSHIP
    if (
      timeEntry.employeeProfileId !== auth.profileId &&
      auth.roleName !== 'admin'
    ) {
      throw {
        statusCode: 403,
        message: 'You can only update your own time entries',
      };
    }

    // ✅ VERIFY STATUS - can only update draft entries
    if (timeEntry.status !== 'pending') {
      throw {
        statusCode: 400,
        message: `Cannot update time entry with status: ${timeEntry.status}`,
      };
    }

    // ✅ CHECK BUDGET IF HOURS CHANGED
    if (hours && hours !== timeEntry.hours) {
      const budgetHours = Number(timeEntry.job.jobCosting?.budgetCap?.totalAllocatedHours ?? timeEntry.job.budgetHours ?? 0);
      if (budgetHours > 0) {
        const existingHours = await prisma.timeEntry.aggregate({
          where: {
            jobId: timeEntry.jobId,
            status: { in: ['approved', 'submitted'] },
            id: { not: timeEntryId },
          },
          _sum: { hours: true },
        });

        const totalHours = (existingHours._sum.hours || 0) + hours;

        if (totalHours > budgetHours) {
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
        updatedAt: new Date(),
      },
      include: {
        job: {
          select: { id: true, jobName: true },
        },
        employee: {
          select: { id: true, firstName: true, lastName: true },
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
      timeEntry.employeeProfileId !== auth.profileId &&
      auth.roleName !== 'admin'
    ) {
      throw {
        statusCode: 403,
        message: 'You can only delete your own time entries',
      };
    }

    // ✅ VERIFY STATUS - can only delete draft/rejected entries
    if (!['pending', 'rejected'].includes(timeEntry.status)) {
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
      timeEntry.employeeProfileId !== auth.profileId &&
      auth.roleName !== 'admin'
    ) {
      throw {
        statusCode: 403,
        message: 'You can only submit your own time entries',
      };
    }

    // ✅ VERIFY STATUS
    if (timeEntry.status !== 'pending') {
      throw {
        statusCode: 400,
        message: `Cannot submit time entry with status: ${timeEntry.status}`,
      };
    }

    const updated = await prisma.timeEntry.update({
      where: { id: timeEntryId },
      data: {
        status: 'submitted',
        updatedAt: new Date(),
      },
      include: {
        job: {
          select: { id: true, jobName: true },
        },
        employee: {
          select: { id: true, firstName: true, lastName: true },
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
          id: timeEntry.jobId,
          partnerProfileId: auth.profileId,
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
        approvedByProfileId: auth.profileId,
        approvedAt: new Date(),
        updatedAt: new Date(),
      },
      include: {
        job: {
          select: { id: true, jobName: true },
        },
        employee: {
          select: { id: true, firstName: true, lastName: true },
        },
        approver: {
          select: { id: true, firstName: true, lastName: true },
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
          id: timeEntry.jobId,
          partnerProfileId: auth.profileId,
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
        approvedByProfileId: auth.profileId,
        approvedAt: new Date(),
        updatedAt: new Date(),
      },
      include: {
        job: {
          select: { id: true, jobName: true },
        },
        employee: {
          select: { id: true, firstName: true, lastName: true },
        },
        approver: {
          select: { id: true, firstName: true, lastName: true },
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
      timeEntry.employeeProfileId !== auth.profileId &&
      auth.roleName !== 'admin'
    ) {
      throw {
        statusCode: 403,
        message: 'You can only start timers for your own entries',
      };
    }

    // ✅ VERIFY STATUS
    if (!['pending', 'submitted'].includes(timeEntry.status)) {
      throw {
        statusCode: 400,
        message: `Cannot start timer for entry with status: ${timeEntry.status}`,
      };
    }

    // ✅ CHECK IF TIMER ALREADY RUNNING
    if (timeEntry.startedAt) {
      throw {
        statusCode: 400,
        message: 'Timer is already running for this entry',
      };
    }

    const updated = await prisma.timeEntry.update({
      where: { id: timeEntryId },
      data: {
        startedAt: new Date(),
        endedAt: null,
        updatedAt: new Date(),
      },
      include: {
        job: {
          select: { id: true, jobName: true },
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
      timeEntry.employeeProfileId !== auth.profileId &&
      auth.roleName !== 'admin'
    ) {
      throw {
        statusCode: 403,
        message: 'You can only stop timers for your own entries',
      };
    }

    // ✅ VERIFY TIMER WAS STARTED
    if (!timeEntry.startedAt) {
      throw {
        statusCode: 400,
        message: 'Timer was not started for this entry',
      };
    }

    // ✅ CALCULATE ELAPSED TIME
    const elapsedMs = new Date().getTime() - new Date(timeEntry.startedAt).getTime();
    const elapsedHours = elapsedMs / (1000 * 60 * 60);
    const totalHours = Number((timeEntry.hours + elapsedHours).toFixed(2));

    // ✅ VERIFY BUDGET AFTER ADDING TIME
    const job = await prisma.job.findUnique({
      where: { id: timeEntry.jobId },
      include: { jobCosting: { include: { budgetCap: true } } },
    });

    const budgetHours = Number(job?.jobCosting?.budgetCap?.totalAllocatedHours ?? job?.budgetHours ?? 0);
    if (budgetHours > 0) {
      const existingHours = await prisma.timeEntry.aggregate({
        where: {
          jobId: timeEntry.jobId,
          status: { in: ['approved', 'submitted'] },
          id: { not: timeEntryId },
        },
        _sum: { hours: true },
      });

      if (totalHours + (existingHours._sum.hours || 0) > budgetHours) {
        throw {
          statusCode: 400,
          message: `Adding timer duration would exceed job budget`,
        };
      }
    }

    const updated = await prisma.timeEntry.update({
      where: { id: timeEntryId },
      data: {
        startedAt: null,
        hours: totalHours,
        updatedAt: new Date(),
      },
      include: {
        job: {
          select: { id: true, jobName: true },
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
        e => e.employeeProfileId !== auth.profileId
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
        status: 'pending',
      },
      data: {
        status: 'submitted',
        updatedAt: new Date(),
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

      const unauthorized = entries.filter(e => e.job.partnerProfileId !== auth.profileId);
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
        approvedByProfileId: auth.profileId,
        approvedAt: new Date(),
        updatedAt: new Date(),
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
      (auth.roleName === 'partner' && job.partnerProfileId === auth.profileId);

    if (!canView) {
      throw {
        statusCode: 403,
        message: 'You do not have permission to view this job summary',
      };
    }

    // Get all time entries for the job
    const timeEntries = await prisma.timeEntry.findMany({
      where: { jobId: jobId },
      include: {
        employee: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    // Calculate summary
    const summary = {
      jobId,
      totalHours: 0,
      approvedHours: 0,
      submittedHours: 0,
      pendingHours: 0,
      rejectedHours: 0,
      budgetCap: job.budgetHours,
      budgetUsed: 0,
      budgetRemaining: job.budgetHours,
      percentageUsed: 0,
      entriesByStatus: {
        pending: 0,
        submitted: 0,
        approved: 0,
        rejected: 0,
        cancelled: 0,
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
      } else if (entry.status === 'pending') {
        summary.pendingHours += entry.hours;
      } else if (entry.status === 'rejected') {
        summary.rejectedHours += entry.hours;
      }

      // Group by employee
      const empId = entry.employeeProfileId;
      if (!summary.entriesByEmployee[empId]) {
        summary.entriesByEmployee[empId] = {
          employee: entry.employee,
          totalHours: 0,
          approvedHours: 0,
        };
      }
      summary.entriesByEmployee[empId].totalHours += entry.hours;
      if (entry.status === 'approved') {
        summary.entriesByEmployee[empId].approvedHours += entry.hours;
      }
    }

    // Calculate budget metrics
    summary.budgetUsed = summary.approvedHours;
    summary.budgetRemaining = Math.max(0, summary.budgetCap - summary.budgetUsed);
    summary.percentageUsed =
      summary.budgetCap > 0 ? (summary.budgetUsed / summary.budgetCap) * 100 : 0;

    return summary;
  }
}


