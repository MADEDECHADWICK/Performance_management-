/**
 * TimeEntryService
 * 
 * Business logic for time tracking:
 * - Create/update/delete time entries
 * - Timer functionality (start/stop)
 * - Submission & approval workflows
 * - Budget enforcement & override requests
 * - Billable vs non-billable tracking
 * - Batch operations
 */

import prisma from '../prisma';

export interface TimeEntryCreateInput {
  jobId: number;
  employeeProfileId: number;
  dateWorked: Date;
  hours: number;
  minutes?: number;
  description?: string;
  billable: boolean;
  taskId?: number;
  manualEntry?: boolean;
}

export interface TimeEntryUpdateInput {
  hours?: number;
  minutes?: number;
  description?: string;
  billable?: boolean;
  taskId?: number;
}

export interface ListTimeEntriesOptions {
  page: number;
  pageSize: number;
  filters?: {
    status?: string;
    jobId?: number;
    employeeProfileId?: number;
    dateFrom?: Date;
    dateTo?: Date;
    billableOnly?: boolean;
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

class TimeEntryService {
  /**
   * Create a new time entry
   * 
   * Access: Employee (own entries), Manager (team), Admin
   */
  async createTimeEntry(input: TimeEntryCreateInput, authContext: AuthContext) {
    // Authorization: own entry, manager of job, or admin
    const job = await prisma.job.findUnique({ where: { id: input.jobId } });
    if (!job) throw new Error('Job not found');

    const isAdmin = authContext.roles?.includes('admin');
    const isOwnEntry = input.employeeProfileId === authContext.profileId;
    const isJobManager = job.managerProfileId === authContext.profileId;

    if (!isAdmin && !isOwnEntry && !isJobManager) {
      throw new Error('Not authorized to create time entry for this employee');
    }

    // Convert hours + minutes to total hours
    const totalHours = input.hours + (input.minutes || 0) / 60;

    // Check daily maximum (typically 8 hours)
    const dayEntries = await prisma.timeEntry.aggregate({
      where: {
        employeeProfileId: input.employeeProfileId,
        dateWorked: input.dateWorked,
      },
      _sum: { hours: true },
    });

    const dailyTotal = Number(dayEntries._sum.hours || 0) + totalHours;
    if (dailyTotal > 8) {
      throw new Error(`Daily time entry limit exceeded. Max 8 hours/day, current: ${dailyTotal}h`);
    }

    // Calculate billable/cost amounts
    const staffing = await prisma.jobStaffAssignment.findFirst({
      where: {
        jobId: input.jobId,
        employeeProfileId: input.employeeProfileId,
      },
    });

    const hourlyRate = staffing?.hourlyRate || 0;
    const billableAmount = input.billable ? totalHours * hourlyRate : 0;
    const costAmount = totalHours * hourlyRate;

    const timeEntry = await prisma.timeEntry.create({
      data: {
        jobId: input.jobId,
        employeeProfileId: input.employeeProfileId,
        dateWorked: input.dateWorked,
        hours: totalHours,
        description: input.description,
        billable: input.billable,
        taskId: input.taskId,
        billableAmount,
        costAmount,
        profitLoss: billableAmount - costAmount,
        status: 'draft',
        manualEntry: input.manualEntry || false,
      },
      include: {
        job: { select: { id: true, jobName: true } },
        employee: { select: { id: true, firstName: true, lastName: true } },
        task: { select: { id: true, title: true } },
      },
    });

    return timeEntry;
  }

  /**
   * Update time entry (only in draft status)
   */
  async updateTimeEntry(
    timeEntryId: number,
    input: TimeEntryUpdateInput,
    authContext: AuthContext
  ) {
    const entry = await this.getTimeEntryById(timeEntryId);

    if (entry.status !== 'draft') {
      throw new Error(`Cannot update time entry in ${entry.status} status. Must be draft.`);
    }

    // Authorization: own entry, job manager, or admin
    const isAdmin = authContext.roles?.includes('admin');
    const isOwnEntry = entry.employeeProfileId === authContext.profileId;
    const job = await prisma.job.findUnique({ where: { id: entry.jobId } });
    const isJobManager = job?.managerProfileId === authContext.profileId;

    if (!isAdmin && !isOwnEntry && !isJobManager) {
      throw new Error('Not authorized to update this time entry');
    }

    // Recalculate amounts if hours/billable changed
    let updateData: any = input;
    if (input.hours !== undefined || input.minutes !== undefined) {
      const totalHours = (input.hours ?? entry.hours) + ((input.minutes ?? 0) / 60 || 0);

      const staffing = await prisma.jobStaffAssignment.findFirst({
        where: { jobId: entry.jobId, employeeProfileId: entry.employeeProfileId },
      });

      const hourlyRate = staffing?.hourlyRate || 0;
      const billable = input.billable ?? entry.billable;

      updateData = {
        ...input,
        hours: totalHours,
        billableAmount: billable ? totalHours * hourlyRate : 0,
        costAmount: totalHours * hourlyRate,
        profitLoss: (billable ? totalHours * hourlyRate : 0) - totalHours * hourlyRate,
      };
    }

    const updated = await prisma.timeEntry.update({
      where: { id: timeEntryId },
      data: updateData,
      include: {
        job: { select: { id: true, jobName: true } },
        employee: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return updated;
  }

  /**
   * Submit time entry for approval
   */
  async submitTimeEntry(timeEntryId: number, authContext: AuthContext) {
    const entry = await this.getTimeEntryById(timeEntryId);

    if (entry.status !== 'draft') {
      throw new Error('Only draft time entries can be submitted');
    }

    // Authorization: own entry or admin
    const isAdmin = authContext.roles?.includes('admin');
    if (!isAdmin && entry.employeeProfileId !== authContext.profileId) {
      throw new Error('Not authorized to submit this time entry');
    }

    // Get job manager for approval
    const job = await prisma.job.findUnique({ where: { id: entry.jobId } });
    if (!job) throw new Error('Job not found');

    // Check budget if applicable
    const budgetStatus = await this.checkBudget(entry.jobId);
    if (budgetStatus.status === 'exceeded' && !budgetStatus.allowOverage) {
      throw new Error(
        `Budget exceeded for this job. Cannot submit without override. Remaining: ${budgetStatus.remaining}h`
      );
    }

    // Submit entry
    const submitted = await prisma.timeEntry.update({
      where: { id: timeEntryId },
      data: {
        status: 'submitted',
        submittedAt: new Date(),
      },
    });

    // Create approval request
    await prisma.approvalRequest.create({
      data: {
        type: 'time_entry_approval',
        relatedId: timeEntryId,
        requestedByProfileId: authContext.profileId,
        requestedToProfileId: job.managerProfileId,
        status: 'pending',
        createdAt: new Date(),
      },
    });

    return submitted;
  }

  /**
   * Approve time entry
   */
  async approveTimeEntry(timeEntryId: number, authContext: AuthContext) {
    const entry = await this.getTimeEntryById(timeEntryId);

    if (entry.status !== 'submitted') {
      throw new Error('Only submitted time entries can be approved');
    }

    // Get job to verify manager
    const job = await prisma.job.findUnique({ where: { id: entry.jobId } });
    if (!job) throw new Error('Job not found');

    // Authorization: job manager or admin
    const isAdmin = authContext.roles?.includes('admin');
    if (!isAdmin && job.managerProfileId !== authContext.profileId) {
      throw new Error('Not authorized to approve this time entry');
    }

    // Approve
    const approved = await prisma.timeEntry.update({
      where: { id: timeEntryId },
      data: {
        status: 'approved',
        approvedAt: new Date(),
        approverProfileId: authContext.profileId,
      },
    });

    // Update approval request
    await prisma.approvalRequest.updateMany({
      where: {
        type: 'time_entry_approval',
        relatedId: timeEntryId,
      },
      data: {
        status: 'approved',
        reviewedAt: new Date(),
        reviewedByProfileId: authContext.profileId,
      },
    });

    return approved;
  }

  /**
   * Reject time entry with reason
   */
  async rejectTimeEntry(
    timeEntryId: number,
    reason: string,
    authContext: AuthContext
  ) {
    const entry = await this.getTimeEntryById(timeEntryId);

    if (entry.status !== 'submitted') {
      throw new Error('Only submitted time entries can be rejected');
    }

    const job = await prisma.job.findUnique({ where: { id: entry.jobId } });
    if (!job) throw new Error('Job not found');

    const isAdmin = authContext.roles?.includes('admin');
    if (!isAdmin && job.managerProfileId !== authContext.profileId) {
      throw new Error('Not authorized to reject this time entry');
    }

    const rejected = await prisma.timeEntry.update({
      where: { id: timeEntryId },
      data: {
        status: 'rejected',
        rejectionReason: reason,
        rejectedAt: new Date(),
        rejectedByProfileId: authContext.profileId,
      },
    });

    // Update approval request
    await prisma.approvalRequest.updateMany({
      where: { type: 'time_entry_approval', relatedId: timeEntryId },
      data: {
        status: 'rejected',
        reviewedAt: new Date(),
        reviewedByProfileId: authContext.profileId,
      },
    });

    return rejected;
  }

  /**
   * Request more time (budget override)
   */
  async requestMoreTime(
    timeEntryId: number,
    additionalHours: number,
    reason: string,
    authContext: AuthContext
  ) {
    const entry = await this.getTimeEntryById(timeEntryId);
    const job = await prisma.job.findUnique({ where: { id: entry.jobId } });
    if (!job) throw new Error('Job not found');

    const isAdmin = authContext.roles?.includes('admin');
    if (!isAdmin && entry.employeeProfileId !== authContext.profileId) {
      throw new Error('Not authorized to request more time for this entry');
    }

    // Create budget override request
    const request = await prisma.budgetOverrideRequest.create({
      data: {
        jobId: entry.jobId,
        timeEntryId,
        requestedHours: additionalHours,
        reason,
        requestedByProfileId: authContext.profileId,
        requestedToProfileId: job.managerProfileId,
        status: 'pending',
        createdAt: new Date(),
      },
    });

    return request;
  }

  /**
   * Timer start
   */
  async startTimer(jobId: number, taskId?: number, authContext?: AuthContext) {
    // Check if employee already has active timer
    const activeTimer = await prisma.timeEntry.findFirst({
      where: {
        employeeProfileId: authContext?.profileId!,
        timerStatus: 'running',
      },
    });

    if (activeTimer) {
      throw new Error('You already have an active timer. Stop it before starting a new one.');
    }

    // Create time entry with active timer
    const timer = await prisma.timeEntry.create({
      data: {
        jobId,
        employeeProfileId: authContext?.profileId!,
        dateWorked: new Date(),
        hours: 0,
        billable: true,
        taskId,
        status: 'draft',
        timerStatus: 'running',
        timerStartedAt: new Date(),
      },
    });

    return timer;
  }

  /**
   * Timer stop & calculate hours
   */
  async stopTimer(timeEntryId: number) {
    const entry = await this.getTimeEntryById(timeEntryId);

    if (entry.timerStatus !== 'running' || !entry.timerStartedAt) {
      throw new Error('Timer is not running');
    }

    const duration = new Date().getTime() - new Date(entry.timerStartedAt).getTime();
    const hours = duration / (1000 * 60 * 60);

    const stopped = await prisma.timeEntry.update({
      where: { id: timeEntryId },
      data: {
        timerStatus: 'stopped',
        timerStoppedAt: new Date(),
        hours: Number(hours.toFixed(2)),
      },
    });

    return stopped;
  }

  /**
   * Delete time entry (draft only)
   */
  async deleteTimeEntry(timeEntryId: number, authContext: AuthContext) {
    const entry = await this.getTimeEntryById(timeEntryId);

    if (entry.status !== 'draft') {
      throw new Error('Can only delete draft time entries');
    }

    const isAdmin = authContext.roles?.includes('admin');
    if (!isAdmin && entry.employeeProfileId !== authContext.profileId) {
      throw new Error('Not authorized to delete this time entry');
    }

    await prisma.timeEntry.delete({ where: { id: timeEntryId } });
    return { id: timeEntryId, deleted: true };
  }

  /**
   * Get single time entry
   */
  async getTimeEntryById(timeEntryId: number) {
    const entry = await prisma.timeEntry.findUnique({
      where: { id: timeEntryId },
      include: {
        job: { select: { id: true, jobName: true } },
        employee: { select: { id: true, firstName: true, lastName: true } },
        task: { select: { id: true, title: true } },
      },
    });

    if (!entry) {
      throw new Error('Time entry not found');
    }

    return entry;
  }

  /**
   * List time entries with pagination
   */
  async listTimeEntries(options: ListTimeEntriesOptions, authContext: AuthContext) {
    const { page, pageSize, filters = {}, sort = {} } = options;
    const skip = (page - 1) * pageSize;

    let whereClause: any = {};

    // Access control: admin sees all, employee sees own, manager sees team
    const isAdmin = authContext.roles?.includes('admin');
    const isManager = authContext.roles?.includes('manager');

    if (!isAdmin) {
      if (isManager) {
        // Manager sees entries for jobs they manage
        whereClause.job = {
          managerProfileId: authContext.profileId,
        };
      } else {
        // Employee sees own entries
        whereClause.employeeProfileId = authContext.profileId;
      }
    }

    // Apply filters
    if (filters.status) whereClause.status = filters.status;
    if (filters.jobId) whereClause.jobId = filters.jobId;
    if (filters.employeeProfileId) whereClause.employeeProfileId = filters.employeeProfileId;
    if (filters.billableOnly) whereClause.billable = true;

    if (filters.dateFrom || filters.dateTo) {
      whereClause.dateWorked = {};
      if (filters.dateFrom) whereClause.dateWorked.gte = filters.dateFrom;
      if (filters.dateTo) whereClause.dateWorked.lte = filters.dateTo;
    }

    const orderBy: any = sort.field ? { [sort.field]: sort.order || 'asc' } : { dateWorked: 'desc' };

    const [entries, total] = await Promise.all([
      prisma.timeEntry.findMany({
        where: whereClause,
        skip,
        take: pageSize,
        orderBy,
        include: {
          job: { select: { id: true, jobName: true } },
          employee: { select: { id: true, firstName: true, lastName: true } },
          task: { select: { id: true, title: true } },
        },
      }),
      prisma.timeEntry.count({ where: whereClause }),
    ]);

    return { entries, total };
  }

  /**
   * Batch submit time entries
   */
  async batchSubmitTimeEntries(timeEntryIds: number[], authContext: AuthContext) {
    const entries = await prisma.timeEntry.findMany({
      where: { id: { in: timeEntryIds } },
    });

    // Verify all are draft
    const nonDraft = entries.filter((e) => e.status !== 'draft');
    if (nonDraft.length > 0) {
      throw new Error(`${nonDraft.length} entries are not in draft status`);
    }

    // Verify authorization
    const isAdmin = authContext.roles?.includes('admin');
    const unauthorized = entries.filter(
      (e) => !isAdmin && e.employeeProfileId !== authContext.profileId
    );
    if (unauthorized.length > 0) {
      throw new Error(`Not authorized to submit ${unauthorized.length} entries`);
    }

    // Submit all
    const submitted = await prisma.timeEntry.updateMany({
      where: { id: { in: timeEntryIds } },
      data: { status: 'submitted', submittedAt: new Date() },
    });

    // Create approval requests for each
    for (const entry of entries) {
      const job = await prisma.job.findUnique({ where: { id: entry.jobId } });
      if (job) {
        await prisma.approvalRequest.create({
          data: {
            type: 'time_entry_approval',
            relatedId: entry.id,
            requestedByProfileId: authContext.profileId,
            requestedToProfileId: job.managerProfileId,
            status: 'pending',
            createdAt: new Date(),
          },
        });
      }
    }

    return { submitted: timeEntryIds.length, message: 'All entries submitted for approval' };
  }

  /**
   * Batch approve time entries
   */
  async batchApproveTimeEntries(timeEntryIds: number[], authContext: AuthContext) {
    const entries = await prisma.timeEntry.findMany({
      where: { id: { in: timeEntryIds } },
      include: { job: true },
    });

    // Verify all are submitted
    const nonSubmitted = entries.filter((e) => e.status !== 'submitted');
    if (nonSubmitted.length > 0) {
      throw new Error(`${nonSubmitted.length} entries are not submitted`);
    }

    // Verify authorization: same job manager
    const isAdmin = authContext.roles?.includes('admin');
    const jobIds = new Set(entries.map((e) => e.jobId));

    for (const jobId of jobIds) {
      const job = await prisma.job.findUnique({ where: { id: jobId } });
      if (!isAdmin && job?.managerProfileId !== authContext.profileId) {
        throw new Error('Not authorized to approve entries from job');
      }
    }

    // Approve all
    await prisma.timeEntry.updateMany({
      where: { id: { in: timeEntryIds } },
      data: {
        status: 'approved',
        approvedAt: new Date(),
        approverProfileId: authContext.profileId,
      },
    });

    // Update approval requests
    await prisma.approvalRequest.updateMany({
      where: {
        type: 'time_entry_approval',
        relatedId: { in: timeEntryIds },
      },
      data: {
        status: 'approved',
        reviewedAt: new Date(),
        reviewedByProfileId: authContext.profileId,
      },
    });

    return { approved: timeEntryIds.length, message: 'All entries approved' };
  }

  /**
   * Check job budget status
   */
  private async checkBudget(
    jobId: number
  ): Promise<{ status: string; remaining: number; allowOverage: boolean }> {
    const costing = await prisma.jobCosting.findUnique({ where: { jobId } });

    if (!costing?.budgetCap) {
      return { status: 'no_budget', remaining: 0, allowOverage: true };
    }

    const loggedHours = await prisma.timeEntry.aggregate({
      where: { jobId, status: { in: ['submitted', 'approved'] } },
      _sum: { hours: true },
    });

    const allocated = Number(costing.budgetCap.totalAllocatedHours);
    const logged = Number(loggedHours._sum.hours || 0);
    const remaining = allocated - logged;

    return {
      status: remaining > 0 ? 'within_budget' : 'exceeded',
      remaining: Math.max(0, remaining),
      allowOverage: costing.budgetCap.allowOverage || false,
    };
  }
}

export default new TimeEntryService();
