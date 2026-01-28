/**
 * Time Entry Service (Schema v2.1 aligned)
 * - Uses TimeEntry.dateWorked, startedAt, endedAt
 * - Status flow: pending -> submitted -> approved/rejected/cancelled
 * - Uses JobStaffAssignment for "assigned to job" checks
 * - Access checks use Job.managerProfileId / Job.partnerProfileId
 */

import { prisma } from '../prisma';
import { NotificationService } from './notifications.service';

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
  private static async resolveHourlyRate(jobId: number, employeeProfileId: number) {
    const assignment = await prisma.jobStaffAssignment.findFirst({
      where: { jobId, employeeProfileId },
      select: { assignedHourlyRate: true },
    });

    return Number(assignment?.assignedHourlyRate || 0);
  }

  private static async calculateAmounts(
    jobId: number,
    employeeProfileId: number,
    hours: number,
    billable: boolean
  ) {
    const hourlyRate = await TimeEntryService.resolveHourlyRate(jobId, employeeProfileId);
    const totalHours = Number(hours || 0);
    const billableAmount = billable ? totalHours * hourlyRate : 0;
    const costAmount = totalHours * hourlyRate;
    const profitLoss = billableAmount - costAmount;

    return {
      hourlyRate,
      billableAmount,
      costAmount,
      profitLoss,
    };
  }

  private static async getAllocationSummary(jobId: number, employeeProfileId: number) {
    const jobCosting = await prisma.jobCosting.findUnique({
      where: { jobId },
      include: { allocations: true, budgetCap: true },
    });

    if (!jobCosting) {
      return {
        requiresAllocation: false,
        employeeAllocatedHours: 0,
        jobAllocatedHours: 0,
      };
    }

    const employeeAllocatedHours = jobCosting.allocations
      .filter((alloc) => alloc.employeeProfileId === employeeProfileId)
      .reduce((sum, alloc) => sum + Number(alloc.allocatedHours), 0);

    const jobAllocatedHours = Number(
      jobCosting.budgetCap?.totalAllocatedHours ?? jobCosting.totalEstimatedHours ?? 0
    );

    return {
      requiresAllocation: true,
      employeeAllocatedHours,
      jobAllocatedHours,
    };
  }

  /**
   * Get allocation + usage summary for a job (employee scoped)
   */
  static async getJobAllocationSummary(jobId: number, auth: AuthContext) {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        staffing: {
          where: { employeeProfileId: auth.profileId },
        },
        jobCosting: {
          include: { allocations: true, budgetCap: true },
        },
      },
    });

    if (!job) {
      throw { statusCode: 404, message: 'Job not found' };
    }

    const roleName = auth.roleName || '';
    const isAdmin = roleName === 'admin';
    const isHr = roleName === 'hr' || roleName === 'hr_manager';
    const isPartner = roleName === 'partner' && job.partnerProfileId === auth.profileId;
    const isManager = roleName === 'manager' && job.managerProfileId === auth.profileId;
    const isStaffAssigned = job.staffing.length > 0;

    if (!isAdmin && !isHr && !isPartner && !isManager && !isStaffAssigned) {
      throw { statusCode: 403, message: 'You do not have permission to view this job summary' };
    }

    const jobCosting = job.jobCosting;
    const requiresAllocation = !!jobCosting;

    const employeeAllocatedHours = jobCosting
      ? jobCosting.allocations
          .filter((alloc) => alloc.employeeProfileId === auth.profileId)
          .reduce((sum, alloc) => sum + Number(alloc.allocatedHours), 0)
      : 0;

    const jobAllocatedHours = Number(
      jobCosting?.budgetCap?.totalAllocatedHours ?? jobCosting?.totalEstimatedHours ?? 0
    );

    const approvedExtraJob = await prisma.timeEntryApprovalRequest.aggregate({
      where: {
        jobId,
        status: 'approved',
      },
      _sum: { additionalHoursRequested: true },
    });

    const approvedExtraEmployee = await prisma.timeEntryApprovalRequest.aggregate({
      where: {
        jobId,
        employeeProfileId: auth.profileId,
        status: 'approved',
      },
      _sum: { additionalHoursRequested: true },
    });

    const approvedExtraJobHours = Number(approvedExtraJob._sum.additionalHoursRequested || 0);
    const approvedExtraEmployeeHours = Number(
      approvedExtraEmployee._sum.additionalHoursRequested || 0
    );

    const loggedJobHoursResult = await prisma.timeEntry.aggregate({
      where: {
        jobId,
        status: { in: ['pending', 'submitted', 'approved'] },
      },
      _sum: { hours: true },
    });

    const loggedEmployeeHoursResult = await prisma.timeEntry.aggregate({
      where: {
        jobId,
        employeeProfileId: auth.profileId,
        status: { in: ['pending', 'submitted', 'approved'] },
      },
      _sum: { hours: true },
    });

    const loggedJobHours = Number(loggedJobHoursResult._sum.hours || 0);
    const loggedEmployeeHours = Number(loggedEmployeeHoursResult._sum.hours || 0);

    const baseJobHours = Number(jobAllocatedHours || job.budgetHours || 0);
    const allowedJobHours = baseJobHours + approvedExtraJobHours;
    const allowedEmployeeHours = employeeAllocatedHours + approvedExtraEmployeeHours;

    const remainingJobHours = Math.max(0, allowedJobHours - loggedJobHours);
    const remainingEmployeeHours = Math.max(0, allowedEmployeeHours - loggedEmployeeHours);

    return {
      jobId,
      jobBudgetHours: Number(job.budgetHours || 0),
      requiresAllocation,
      employeeAllocatedHours,
      jobAllocatedHours: baseJobHours,
      approvedExtraJobHours,
      approvedExtraEmployeeHours,
      loggedJobHours,
      loggedEmployeeHours,
      allowedJobHours,
      allowedEmployeeHours,
      remainingJobHours,
      remainingEmployeeHours,
    };
  }
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
    } else if (auth.roleName === 'manager') {
      // Managers only see their own jobs' time entries
      where.job = {
        managerProfileId: auth.profileId,
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
          include: { budgetCap: true, allocations: true },
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

    // CHECK ALLOCATION LIMITS
    const allocationSummary = await TimeEntryService.getAllocationSummary(
      Number(jobId),
      auth.profileId
    );

    if (allocationSummary?.requiresAllocation && allocationSummary.employeeAllocatedHours <= 0) {
      throw {
        statusCode: 400,
        message: 'No time allocation assigned for this job',
      };
    }

    const approvedExtra = await prisma.timeEntryApprovalRequest.aggregate({
      where: {
        jobId: Number(jobId),
        status: 'approved',
      },
      _sum: { additionalHoursRequested: true },
    });

    const approvedExtraEmployee = await prisma.timeEntryApprovalRequest.aggregate({
      where: {
        jobId: Number(jobId),
        employeeProfileId: auth.profileId,
        status: 'approved',
      },
      _sum: { additionalHoursRequested: true },
    });

    const approvedExtraJobHours = Number(approvedExtra._sum.additionalHoursRequested || 0);
    const approvedExtraEmployeeHours = Number(
      approvedExtraEmployee._sum.additionalHoursRequested || 0
    );

    const allowedJobHours =
      Number(allocationSummary?.jobAllocatedHours ?? job.budgetHours ?? 0) + approvedExtraJobHours;
    const allowedEmployeeHours =
      Number(allocationSummary?.employeeAllocatedHours ?? 0) + approvedExtraEmployeeHours;

    const loggedJobHoursResult = await prisma.timeEntry.aggregate({
      where: {
        jobId: Number(jobId),
        status: { in: ['pending', 'submitted', 'approved'] },
      },
      _sum: { hours: true },
    });

    const loggedEmployeeHoursResult = await prisma.timeEntry.aggregate({
      where: {
        jobId: Number(jobId),
        employeeProfileId: auth.profileId,
        status: { in: ['pending', 'submitted', 'approved'] },
      },
      _sum: { hours: true },
    });

    const loggedJobHours = Number(loggedJobHoursResult._sum.hours || 0);
    const loggedEmployeeHours = Number(loggedEmployeeHoursResult._sum.hours || 0);

    if (allowedEmployeeHours > 0 && loggedEmployeeHours + hours > allowedEmployeeHours) {
      throw {
        statusCode: 400,
        message: `Time entry exceeds your allocation. Available: ${(allowedEmployeeHours - loggedEmployeeHours).toFixed(2)} hours`,
      };
    }

    if (allowedJobHours > 0 && loggedJobHours + hours > allowedJobHours) {
      throw {
        statusCode: 400,
        message: `Time entry exceeds job allocation. Available: ${(allowedJobHours - loggedJobHours).toFixed(2)} hours`,
      };
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

    const billable = input.billable ?? true;
    const amounts = await TimeEntryService.calculateAmounts(
      Number(jobId),
      auth.profileId,
      Number(hours),
      billable
    );

    // ✅ CREATE TIME ENTRY
    const timeEntry = await prisma.timeEntry.create({
      data: {
        jobId: Number(jobId),
        employeeProfileId: auth.profileId,
        hours,
        description,
        dateWorked: new Date(dateWorked),
        taskId: taskId ? Number(taskId) : null,
        billable,
        billableAmount: amounts.billableAmount,
        costAmount: amounts.costAmount,
        profitLoss: amounts.profitLoss,
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
    const { hours, description, billable } = input;

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

    const updatedHours = typeof hours === 'number' ? hours : Number(timeEntry.hours || 0);
    const updatedBillable =
      typeof billable === 'boolean' ? billable : Boolean(timeEntry.billable);
    const amounts = await TimeEntryService.calculateAmounts(
      timeEntry.jobId,
      timeEntry.employeeProfileId,
      updatedHours,
      updatedBillable
    );

    const updated = await prisma.timeEntry.update({
      where: { id: timeEntryId },
      data: {
        hours: hours ?? timeEntry.hours,
        description: description || timeEntry.description,
        billable: updatedBillable,
        billableAmount: amounts.billableAmount,
        costAmount: amounts.costAmount,
        profitLoss: amounts.profitLoss,
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
          select: { id: true, jobName: true, managerProfileId: true },
        },
        employee: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    if (updated.job.managerProfileId) {
      await NotificationService.createNotification(
        {
          recipientProfileId: updated.job.managerProfileId,
          type: 'action',
          title: 'Time entry submitted for approval',
          message: `${updated.employee.firstName} ${updated.employee.lastName} submitted time for "${updated.job.jobName}".`,
          actionRequired: true,
          jobId: updated.job.id,
          timeEntryId: updated.id,
          link: `/workload-management?jobId=${updated.job.id}`,
        },
        { userId: auth.userId, profileId: auth.profileId, roleName: auth.roleName }
      );
    }

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

    const amounts = await TimeEntryService.calculateAmounts(
      timeEntry.jobId,
      timeEntry.employeeProfileId,
      Number(timeEntry.hours || 0),
      Boolean(timeEntry.billable)
    );

      const updated = await prisma.timeEntry.update({
        where: { id: timeEntryId },
        data: {
          status: 'approved',
          approvedByProfileId: auth.profileId,
        approvedAt: new Date(),
        billableAmount: amounts.billableAmount,
        costAmount: amounts.costAmount,
        profitLoss: amounts.profitLoss,
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

      await NotificationService.createNotification(
        {
          recipientProfileId: timeEntry.employeeProfileId,
          type: 'info',
          title: 'Time entry approved',
          message: `Your time entry for "${updated.job.jobName}" was approved.`,
          actionRequired: false,
          jobId: updated.job.id,
          timeEntryId: updated.id,
          link: `/timesheets`,
        },
        { userId: auth.userId, profileId: auth.profileId, roleName: auth.roleName }
      );

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

      await NotificationService.createNotification(
        {
          recipientProfileId: timeEntry.employeeProfileId,
          type: 'action',
          title: 'Time entry rejected',
          message: `Your time entry for "${updated.job.jobName}" was rejected.`,
          actionRequired: true,
          jobId: updated.job.id,
          timeEntryId: updated.id,
          link: `/timesheets`,
        },
        { userId: auth.userId, profileId: auth.profileId, roleName: auth.roleName }
      );

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

    const amounts = await TimeEntryService.calculateAmounts(
      timeEntry.jobId,
      timeEntry.employeeProfileId,
      totalHours,
      Boolean(timeEntry.billable)
    );

    const updated = await prisma.timeEntry.update({
      where: { id: timeEntryId },
      data: {
        startedAt: null,
        hours: totalHours,
        billableAmount: amounts.billableAmount,
        costAmount: amounts.costAmount,
        profitLoss: amounts.profitLoss,
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

    const entries = await prisma.timeEntry.findMany({
      where: {
        id: { in: timeEntryIds },
        status: 'submitted',
      },
    });

    const results = await Promise.all(
      entries.map(async (entry) => {
        const amounts = await TimeEntryService.calculateAmounts(
          entry.jobId,
          entry.employeeProfileId,
          Number(entry.hours || 0),
          Boolean(entry.billable)
        );

        return prisma.timeEntry.update({
          where: { id: entry.id },
          data: {
            status: 'approved',
            approvedByProfileId: auth.profileId,
            approvedAt: new Date(),
            billableAmount: amounts.billableAmount,
            costAmount: amounts.costAmount,
            profitLoss: amounts.profitLoss,
            updatedAt: new Date(),
          },
        });
      })
    );

    return {
      approved: results.length,
      total: timeEntryIds.length,
      failed: timeEntryIds.length - results.length,
    };
  }

  /**
   * Request additional hours for a job
   */
  static async createApprovalRequest(
    input: { jobId: number; additionalHours: number; justification: string; requestType?: string },
    auth: AuthContext
  ) {
    const job = await prisma.job.findUnique({
      where: { id: input.jobId },
      include: {
        staffing: {
          where: { employeeProfileId: auth.profileId },
        },
        jobCosting: {
          include: { allocations: true, budgetCap: true },
        },
      },
    });

    if (!job) {
      throw { statusCode: 404, message: 'Job not found' };
    }

    if (auth.roleName !== 'admin' && job.staffing.length === 0) {
      throw { statusCode: 403, message: 'You are not assigned to this job' };
    }

    const allocationSummary = await TimeEntryService.getAllocationSummary(
      input.jobId,
      auth.profileId
    );

    const currentAllocatedHours = Number(allocationSummary?.employeeAllocatedHours || 0);

    if (allocationSummary?.requiresAllocation && currentAllocatedHours <= 0) {
      throw { statusCode: 400, message: 'No time allocation assigned for this job' };
    }

    const loggedEmployeeHoursResult = await prisma.timeEntry.aggregate({
      where: {
        jobId: input.jobId,
        employeeProfileId: auth.profileId,
        status: { in: ['pending', 'submitted', 'approved'] },
      },
      _sum: { hours: true },
    });

    const currentLoggedHours = Number(loggedEmployeeHoursResult._sum.hours || 0);

    if (currentLoggedHours < currentAllocatedHours) {
      throw {
        statusCode: 400,
        message: 'You still have remaining allocated hours',
      };
    }

    const request = await prisma.timeEntryApprovalRequest.create({
      data: {
        jobId: input.jobId,
        employeeProfileId: auth.profileId,
        currentAllocatedHours,
        currentLoggedHours,
        additionalHoursRequested: input.additionalHours,
        justification: input.justification,
        requestType: input.requestType || 'additional_hours',
        status: 'pending',
      },
    });

    const wouldExceedJobAllocation =
      allocationSummary?.requiresAllocation &&
      Number(allocationSummary.jobAllocatedHours || 0) > 0 &&
      currentLoggedHours + input.additionalHours > Number(allocationSummary.jobAllocatedHours || 0);

    if (wouldExceedJobAllocation) {
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
              title: `Over-budget hours requested for ${job.jobName}`,
              message: `An additional hours request would exceed allocated hours on "${job.jobName}".`,
              actionRequired: true,
              jobId: job.id,
              link: `/jobs/${job.id}`,
            },
            { userId: auth.userId, profileId: auth.profileId, roleName: auth.roleName }
          )
        )
      );
    }

    const requestTitle = `Additional hours requested for ${job.jobName}`;
    const requestMessage = `A team member requested ${input.additionalHours} more hours for "${job.jobName}".`;

    if (job.managerProfileId) {
      await NotificationService.createNotification(
        {
          recipientProfileId: job.managerProfileId,
          type: 'action',
          title: requestTitle,
          message: requestMessage,
          actionRequired: true,
          jobId: job.id,
          link: `/workload-management?jobId=${job.id}`,
        },
        { userId: auth.userId, profileId: auth.profileId, roleName: auth.roleName }
      );
    }

    if (job.partnerProfileId) {
      await NotificationService.createNotification(
        {
          recipientProfileId: job.partnerProfileId,
          type: 'action',
          title: requestTitle,
          message: requestMessage,
          actionRequired: true,
          jobId: job.id,
          link: `/partner-dashboard?jobId=${job.id}`,
        },
        { userId: auth.userId, profileId: auth.profileId, roleName: auth.roleName }
      );
    }

    return request;
  }

  /**
   * List approval requests
   */
  static async listApprovalRequests(
    filters: { jobId?: number; employeeProfileId?: number; status?: string },
    auth: AuthContext
  ) {
    const where: any = {};
    if (filters.jobId) where.jobId = filters.jobId;
    if (filters.status) where.status = filters.status;

    const isElevated = ['admin', 'manager', 'partner'].includes(auth.roleName || '');

    if (!isElevated) {
      where.employeeProfileId = auth.profileId;
    } else if (filters.employeeProfileId) {
      where.employeeProfileId = filters.employeeProfileId;
    }
    if (auth.roleName === 'manager') {
      where.job = { managerProfileId: auth.profileId };
    }
    if (auth.roleName === 'partner') {
      where.job = { partnerProfileId: auth.profileId };
    }

    const requests = await prisma.timeEntryApprovalRequest.findMany({
      where,
      orderBy: { requestedAt: 'desc' },
      include: {
        job: { select: { id: true, jobName: true, client: { select: { id: true, clientName: true } } } },
        employee: { select: { id: true, firstName: true, lastName: true } },
        approver: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return requests;
  }

  /**
   * Approve additional hours request
   */
  static async approveApprovalRequest(
    requestId: number,
    approvalNotes: string | undefined,
    auth: AuthContext
  ) {
    if (!['manager', 'partner', 'admin'].includes(auth.roleName || '')) {
      throw { statusCode: 403, message: 'Not authorized to approve requests' };
    }

    const request = await prisma.timeEntryApprovalRequest.findUnique({
      where: { id: requestId },
      include: { job: true },
    });

    if (!request) {
      throw { statusCode: 404, message: 'Request not found' };
    }

    const isJobManager = request.job.managerProfileId === auth.profileId;
    const isJobPartner = request.job.partnerProfileId === auth.profileId;
    const isAdmin = auth.roleName === 'admin';

    if (!isAdmin && !isJobManager && !isJobPartner) {
      throw { statusCode: 403, message: 'Not authorized to approve this request' };
    }

      const updated = await prisma.timeEntryApprovalRequest.update({
        where: { id: requestId },
        data: {
          status: 'approved',
          approvedByProfileId: auth.profileId,
          approvalNotes,
          approvedAt: new Date(),
        },
      });

      await NotificationService.createNotification(
        {
          recipientProfileId: request.employeeProfileId,
          type: 'info',
          title: 'Additional hours approved',
          message: `Your additional hours request for "${request.job.jobName}" was approved.`,
          actionRequired: false,
          jobId: request.jobId,
          link: `/timesheets`,
        },
        { userId: auth.userId, profileId: auth.profileId, roleName: auth.roleName }
      );

      return updated;
    }

  /**
   * Reject additional hours request
   */
  static async rejectApprovalRequest(
    requestId: number,
    approvalNotes: string | undefined,
    auth: AuthContext
  ) {
    if (!['manager', 'partner', 'admin'].includes(auth.roleName || '')) {
      throw { statusCode: 403, message: 'Not authorized to reject requests' };
    }

    const request = await prisma.timeEntryApprovalRequest.findUnique({
      where: { id: requestId },
      include: { job: true },
    });

    if (!request) {
      throw { statusCode: 404, message: 'Request not found' };
    }

    const isJobManager = request.job.managerProfileId === auth.profileId;
    const isJobPartner = request.job.partnerProfileId === auth.profileId;
    const isAdmin = auth.roleName === 'admin';

    if (!isAdmin && !isJobManager && !isJobPartner) {
      throw { statusCode: 403, message: 'Not authorized to reject this request' };
    }

      const updated = await prisma.timeEntryApprovalRequest.update({
        where: { id: requestId },
        data: {
          status: 'rejected',
          approvedByProfileId: auth.profileId,
          approvalNotes,
          approvedAt: new Date(),
        },
      });

      await NotificationService.createNotification(
        {
          recipientProfileId: request.employeeProfileId,
          type: 'action',
          title: 'Additional hours rejected',
          message: `Your additional hours request for "${request.job.jobName}" was rejected.`,
          actionRequired: true,
          jobId: request.jobId,
          link: `/timesheets`,
        },
        { userId: auth.userId, profileId: auth.profileId, roleName: auth.roleName }
      );

      return updated;
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


