/**
 * Time Entry Service (Schema v2.1 aligned)
 * - Uses TimeEntry.dateWorked, startedAt, endedAt
 * - Status flow: pending -> submitted -> approved/rejected/cancelled
 * - Uses JobStaffAssignment for "assigned to job" checks
 * - Access checks use Job.managerProfileId / Job.partnerProfileId
 */

import { prisma } from '../prisma';
import { Prisma } from '@prisma/client';
import { NotificationService } from './notifications.service';
import { createAudit } from '../utils/audit';

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
  billableOnly?: boolean;
}

export class TimeEntryService {
  private static resolveJobBudgetHours(job: {
    budgetHours?: any;
    jobCosting?: { budgetCap?: { totalAllocatedHours?: any }; totalEstimatedHours?: any } | null;
  }) {
    const fromBudgetCap = Number(
      job.jobCosting?.budgetCap?.totalAllocatedHours ??
        job.jobCosting?.totalEstimatedHours ??
        0
    );
    if (fromBudgetCap > 0) return fromBudgetCap;
    return Number(job.budgetHours || 0);
  }

  private static async runSerializable<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>
  ): Promise<T> {
    return prisma.$transaction(fn, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  }

  private static async resolveRates(jobId: number, employeeProfileId: number) {
    const assignment = await prisma.jobStaffAssignment.findFirst({
      where: { jobId, employeeProfileId },
      select: {
        assignedHourlyRate: true,
        roleSnapshot: true,
        role: { select: { billingRate: true } },
      },
    });

    const snapshot = (assignment?.roleSnapshot || {}) as Record<string, any>;
    const billingRate =
      Number(
        assignment?.assignedHourlyRate ??
          snapshot.assignedHourlyRate ??
          snapshot.billingRate ??
          assignment?.role?.billingRate ??
          0
      ) || 0;

    return { billingRate };
  }

  private static async calculateAmounts(
    jobId: number,
    employeeProfileId: number,
    hours: number,
    billable: boolean,
    rates?: { billingRate: number }
  ) {
    const resolvedRates =
      rates ?? (await TimeEntryService.resolveRates(jobId, employeeProfileId));
    const { billingRate } = resolvedRates;
    const totalHours = Number(hours || 0);
    const billableAmount = billable ? totalHours * billingRate : 0;
    const costAmount = totalHours * billingRate;
    const profitLoss = billableAmount - costAmount;

    return {
      hourlyRate: billingRate,
      costRate: billingRate,
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
        capEnforced: false,
        allowOverage: false,
        maxOveragePercent: 0,
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
      capEnforced: jobCosting.budgetCap?.capEnforced ?? true,
      allowOverage: jobCosting.budgetCap?.allowOverage ?? false,
      maxOveragePercent: Number(jobCosting.budgetCap?.maxOveragePercent ?? 0),
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

    const baseJobHours = jobAllocatedHours || TimeEntryService.resolveJobBudgetHours(job);
    const allowedJobHours = Number(baseJobHours || 0) + approvedExtraJobHours;
    const allowedEmployeeHours = employeeAllocatedHours + approvedExtraEmployeeHours;

    const remainingJobHours = Math.max(0, allowedJobHours - loggedJobHours);
    const remainingEmployeeHours = Math.max(0, allowedEmployeeHours - loggedEmployeeHours);

    return {
      jobId,
      jobBudgetHours: Number(baseJobHours || 0),
      requiresAllocation,
      employeeAllocatedHours,
      jobAllocatedHours: Number(baseJobHours || 0),
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
    const { page, pageSize, status, jobId, dateFrom, dateTo, billableOnly } = options;
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

    if (typeof billableOnly === 'boolean') {
      where.billable = billableOnly;
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
    const entryHours = Number(hours);
    if (Number.isNaN(entryHours) || entryHours <= 0) {
      throw { statusCode: 400, message: 'Invalid hours value' };
    }

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
    const roleName = auth.roleName || '';
    const isAdmin = roleName === 'admin' || roleName === 'super_admin';
    if (!isAdmin && job.staffing.length === 0) {
      throw {
        statusCode: 403,
        message: 'You are not assigned to this job',
      };
    }

    if (!job.jobCosting && !isAdmin) {
      throw {
        statusCode: 400,
        message: 'Job costing must be completed before logging time',
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

    const requestedBillable = input.billable ?? true;
    const rates = await TimeEntryService.resolveRates(Number(jobId), auth.profileId);

    const jobFee = Number(
      job.jobCosting?.jobFee ||
        (job.billingType === 'fixed_fee' ? job.fixedFeeAmount : 0) ||
        0
    );

    const capEnforced = allocationSummary?.capEnforced ?? true;
    const allowOverage = allocationSummary?.allowOverage ?? false;
    const maxOveragePercent = Number(allocationSummary?.maxOveragePercent ?? 0);

    return TimeEntryService.runSerializable(async (tx) => {
      const [approvedExtra, approvedExtraEmployee] = await Promise.all([
        tx.timeEntryApprovalRequest.aggregate({
          where: { jobId: Number(jobId), status: 'approved' },
          _sum: { additionalHoursRequested: true },
        }),
        tx.timeEntryApprovalRequest.aggregate({
          where: {
            jobId: Number(jobId),
            employeeProfileId: auth.profileId,
            status: 'approved',
          },
          _sum: { additionalHoursRequested: true },
        }),
      ]);

      const approvedExtraJobHoursRaw = Number(approvedExtra._sum.additionalHoursRequested || 0);
      const approvedExtraEmployeeHoursRaw = Number(
        approvedExtraEmployee._sum.additionalHoursRequested || 0
      );

      const baseJobAllocation = Number(
        allocationSummary?.jobAllocatedHours ?? TimeEntryService.resolveJobBudgetHours(job) ?? 0
      );
      const baseEmployeeAllocation = Number(allocationSummary?.employeeAllocatedHours ?? 0);

      const maxExtraJobHours = allowOverage ? baseJobAllocation * maxOveragePercent : 0;
      const maxExtraEmployeeHours = allowOverage ? baseEmployeeAllocation * maxOveragePercent : 0;

      const approvedExtraJobHours = allowOverage
        ? Math.min(approvedExtraJobHoursRaw, maxExtraJobHours)
        : 0;
      const approvedExtraEmployeeHours = allowOverage
        ? Math.min(approvedExtraEmployeeHoursRaw, maxExtraEmployeeHours)
        : 0;

      const effectiveJobAllocation = capEnforced
        ? baseJobAllocation + approvedExtraJobHours
        : Number.POSITIVE_INFINITY;
      const effectiveEmployeeAllocation = capEnforced
        ? baseEmployeeAllocation + approvedExtraEmployeeHours
        : Number.POSITIVE_INFINITY;

      const [loggedJobHoursResult, loggedEmployeeHoursResult] = await Promise.all([
        tx.timeEntry.aggregate({
          where: {
            jobId: Number(jobId),
            status: { in: ['pending', 'submitted', 'approved'] },
          },
          _sum: { hours: true },
        }),
        tx.timeEntry.aggregate({
          where: {
            jobId: Number(jobId),
            employeeProfileId: auth.profileId,
            status: { in: ['pending', 'submitted', 'approved'] },
          },
          _sum: { hours: true },
        }),
      ]);

      const loggedJobHours = Number(loggedJobHoursResult._sum.hours || 0);
      const loggedEmployeeHours = Number(loggedEmployeeHoursResult._sum.hours || 0);

      if (
        Number.isFinite(effectiveEmployeeAllocation) &&
        effectiveEmployeeAllocation > 0 &&
        loggedEmployeeHours + entryHours > effectiveEmployeeAllocation
      ) {
        throw {
          statusCode: 400,
          message: `Time entry exceeds your allocation. Available: ${(effectiveEmployeeAllocation - loggedEmployeeHours).toFixed(2)} hours`,
        };
      }

      if (
        Number.isFinite(effectiveJobAllocation) &&
        effectiveJobAllocation > 0 &&
        loggedJobHours + entryHours > effectiveJobAllocation
      ) {
        throw {
          statusCode: 400,
          message: `Time entry exceeds job allocation. Available: ${(effectiveJobAllocation - loggedJobHours).toFixed(2)} hours`,
        };
      }

      const remainingEmployeeAllocation = Number.isFinite(effectiveEmployeeAllocation)
        ? Math.max(0, effectiveEmployeeAllocation - loggedEmployeeHours)
        : Number.POSITIVE_INFINITY;
      const remainingJobAllocation = Number.isFinite(effectiveJobAllocation)
        ? Math.max(0, effectiveJobAllocation - loggedJobHours)
        : Number.POSITIVE_INFINITY;

      let remainingFeeCapHours = Number.POSITIVE_INFINITY;
      if (jobFee > 0 && rates.billingRate > 0) {
        const totalBillableAgg = await tx.timeEntry.aggregate({
          where: {
            jobId: Number(jobId),
            status: { in: ['pending', 'submitted', 'approved'] },
            billable: true,
          },
          _sum: { billableAmount: true },
        });
        const currentBillable = Number(totalBillableAgg._sum.billableAmount || 0);
        remainingFeeCapHours = Math.max(
          0,
          (jobFee - currentBillable) / rates.billingRate
        );
      }

      const remainingBillableHours = Math.max(
        0,
        Math.min(remainingEmployeeAllocation, remainingJobAllocation, remainingFeeCapHours)
      );

      const shouldSplit =
        requestedBillable &&
        remainingBillableHours > 0 &&
        entryHours > remainingBillableHours;

      const fullyNonBillable =
        !requestedBillable || remainingBillableHours <= 0 || rates.billingRate <= 0;

      if (shouldSplit) {
        const billableHours = Number(remainingBillableHours.toFixed(2));
        const nonBillableHours = Number((entryHours - billableHours).toFixed(2));

        if (billableHours <= 0 || nonBillableHours <= 0) {
          const finalBillable = requestedBillable && billableHours > 0;
          const amounts = await TimeEntryService.calculateAmounts(
            Number(jobId),
            auth.profileId,
            entryHours,
            finalBillable,
            rates
          );

          const timeEntry = await tx.timeEntry.create({
            data: {
              jobId: Number(jobId),
              employeeProfileId: auth.profileId,
              hours: entryHours,
              description,
              dateWorked: new Date(dateWorked),
              taskId: taskId ? Number(taskId) : null,
              billable: finalBillable,
              billableAmount: amounts.billableAmount,
              costAmount: amounts.costAmount,
              profitLoss: amounts.profitLoss,
              status: 'pending',
            },
            include: {
              job: { select: { id: true, jobName: true } },
              employee: { select: { id: true, firstName: true, lastName: true } },
            },
          });

          if (!finalBillable && requestedBillable) {
            return { ...timeEntry, forcedNonBillableReason: 'allocation_or_fee_exceeded' };
          }

          return timeEntry;
        }

        const [billableAmounts, nonBillableAmounts] = await Promise.all([
          TimeEntryService.calculateAmounts(
            Number(jobId),
            auth.profileId,
            billableHours,
            true,
            rates
          ),
          TimeEntryService.calculateAmounts(
            Number(jobId),
            auth.profileId,
            nonBillableHours,
            false,
            rates
          ),
        ]);

        const [billableEntry, nonBillableEntry] = await Promise.all([
          tx.timeEntry.create({
            data: {
              jobId: Number(jobId),
              employeeProfileId: auth.profileId,
              hours: billableHours,
              description,
              dateWorked: new Date(dateWorked),
              taskId: taskId ? Number(taskId) : null,
              billable: true,
              billableAmount: billableAmounts.billableAmount,
              costAmount: billableAmounts.costAmount,
              profitLoss: billableAmounts.profitLoss,
              status: 'pending',
            },
            include: {
              job: { select: { id: true, jobName: true } },
              employee: { select: { id: true, firstName: true, lastName: true } },
            },
          }),
          tx.timeEntry.create({
            data: {
              jobId: Number(jobId),
              employeeProfileId: auth.profileId,
              hours: nonBillableHours,
              description,
              dateWorked: new Date(dateWorked),
              taskId: taskId ? Number(taskId) : null,
              billable: false,
              billableAmount: nonBillableAmounts.billableAmount,
              costAmount: nonBillableAmounts.costAmount,
              profitLoss: nonBillableAmounts.profitLoss,
              status: 'pending',
            },
          }),
        ]);

        return { ...billableEntry, splitEntries: [nonBillableEntry] };
      }

      const finalBillable = requestedBillable && !fullyNonBillable;
      const amounts = await TimeEntryService.calculateAmounts(
        Number(jobId),
        auth.profileId,
        entryHours,
        finalBillable,
        rates
      );

      const timeEntry = await tx.timeEntry.create({
        data: {
          jobId: Number(jobId),
          employeeProfileId: auth.profileId,
          hours: entryHours,
          description,
          dateWorked: new Date(dateWorked),
          taskId: taskId ? Number(taskId) : null,
          billable: finalBillable,
          billableAmount: amounts.billableAmount,
          costAmount: amounts.costAmount,
          profitLoss: amounts.profitLoss,
          status: 'pending',
        },
        include: {
          job: { select: { id: true, jobName: true } },
          employee: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      if (fullyNonBillable && requestedBillable) {
        return { ...timeEntry, forcedNonBillableReason: 'allocation_or_fee_exceeded' };
      }

      return timeEntry;
    });
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

    const roleName = auth.roleName || '';
    const isAdmin = roleName === 'admin' || roleName === 'super_admin';
    if (!timeEntry.job?.jobCosting && !isAdmin) {
      throw {
        statusCode: 400,
        message: 'Job costing must be completed before updating time',
      };
    }

    // ✅ VERIFY STATUS - can only update draft entries
    if (timeEntry.status !== 'pending') {
      throw {
        statusCode: 400,
        message: `Cannot update time entry with status: ${timeEntry.status}`,
      };
    }

    const updatedHours = typeof hours === 'number' ? hours : Number(timeEntry.hours || 0);
    if (Number.isNaN(updatedHours) || updatedHours <= 0) {
      throw { statusCode: 400, message: 'Invalid hours value' };
    }

    const allocationSummary = await TimeEntryService.getAllocationSummary(
      timeEntry.jobId,
      timeEntry.employeeProfileId
    );

    if (allocationSummary?.requiresAllocation && allocationSummary.employeeAllocatedHours <= 0) {
      throw { statusCode: 400, message: 'No time allocation assigned for this job' };
    }

    const rates = await TimeEntryService.resolveRates(
      timeEntry.jobId,
      timeEntry.employeeProfileId
    );

    const jobFee = Number(
      timeEntry.job.jobCosting?.jobFee ||
        (timeEntry.job.billingType === 'fixed_fee' ? timeEntry.job.fixedFeeAmount : 0) ||
        0
    );
    const capEnforced = allocationSummary?.capEnforced ?? true;
    const allowOverage = allocationSummary?.allowOverage ?? false;
    const maxOveragePercent = Number(allocationSummary?.maxOveragePercent ?? 0);

    const requestedBillable =
      typeof billable === 'boolean' ? billable : Boolean(timeEntry.billable);

    return TimeEntryService.runSerializable(async (tx) => {
      const [approvedExtraJob, approvedExtraEmployee] = await Promise.all([
        tx.timeEntryApprovalRequest.aggregate({
          where: { jobId: timeEntry.jobId, status: 'approved' },
          _sum: { additionalHoursRequested: true },
        }),
        tx.timeEntryApprovalRequest.aggregate({
          where: {
            jobId: timeEntry.jobId,
            employeeProfileId: timeEntry.employeeProfileId,
            status: 'approved',
          },
          _sum: { additionalHoursRequested: true },
        }),
      ]);

      const approvedExtraJobHoursRaw = Number(
        approvedExtraJob._sum.additionalHoursRequested || 0
      );
      const approvedExtraEmployeeHoursRaw = Number(
        approvedExtraEmployee._sum.additionalHoursRequested || 0
      );

      const baseJobAllocation = Number(
        allocationSummary?.jobAllocatedHours ??
          TimeEntryService.resolveJobBudgetHours(timeEntry.job) ??
          0
      );
      const baseEmployeeAllocation = Number(allocationSummary?.employeeAllocatedHours ?? 0);

      const maxExtraJobHours = allowOverage ? baseJobAllocation * maxOveragePercent : 0;
      const maxExtraEmployeeHours = allowOverage ? baseEmployeeAllocation * maxOveragePercent : 0;

      const approvedExtraJobHours = allowOverage
        ? Math.min(approvedExtraJobHoursRaw, maxExtraJobHours)
        : 0;
      const approvedExtraEmployeeHours = allowOverage
        ? Math.min(approvedExtraEmployeeHoursRaw, maxExtraEmployeeHours)
        : 0;

      const effectiveJobAllocation = capEnforced
        ? baseJobAllocation + approvedExtraJobHours
        : Number.POSITIVE_INFINITY;
      const effectiveEmployeeAllocation = capEnforced
        ? baseEmployeeAllocation + approvedExtraEmployeeHours
        : Number.POSITIVE_INFINITY;

      const [loggedJobHoursResult, loggedEmployeeHoursResult] = await Promise.all([
        tx.timeEntry.aggregate({
          where: {
            jobId: timeEntry.jobId,
            status: { in: ['pending', 'submitted', 'approved'] },
            id: { not: timeEntryId },
          },
          _sum: { hours: true },
        }),
        tx.timeEntry.aggregate({
          where: {
            jobId: timeEntry.jobId,
            employeeProfileId: timeEntry.employeeProfileId,
            status: { in: ['pending', 'submitted', 'approved'] },
            id: { not: timeEntryId },
          },
          _sum: { hours: true },
        }),
      ]);

      const loggedJobHours = Number(loggedJobHoursResult._sum.hours || 0);
      const loggedEmployeeHours = Number(loggedEmployeeHoursResult._sum.hours || 0);

      if (
        Number.isFinite(effectiveEmployeeAllocation) &&
        effectiveEmployeeAllocation > 0 &&
        loggedEmployeeHours + updatedHours > effectiveEmployeeAllocation
      ) {
        throw {
          statusCode: 400,
          message: `Time entry exceeds your allocation. Available: ${(effectiveEmployeeAllocation - loggedEmployeeHours).toFixed(2)} hours`,
        };
      }

      if (
        Number.isFinite(effectiveJobAllocation) &&
        effectiveJobAllocation > 0 &&
        loggedJobHours + updatedHours > effectiveJobAllocation
      ) {
        throw {
          statusCode: 400,
          message: `Time entry exceeds job allocation. Available: ${(effectiveJobAllocation - loggedJobHours).toFixed(2)} hours`,
        };
      }

      const remainingEmployeeAllocation = Number.isFinite(effectiveEmployeeAllocation)
        ? Math.max(0, effectiveEmployeeAllocation - loggedEmployeeHours)
        : Number.POSITIVE_INFINITY;
      const remainingJobAllocation = Number.isFinite(effectiveJobAllocation)
        ? Math.max(0, effectiveJobAllocation - loggedJobHours)
        : Number.POSITIVE_INFINITY;

      let remainingFeeCapHours = Number.POSITIVE_INFINITY;
      if (jobFee > 0 && rates.billingRate > 0) {
        const totalBillableAgg = await tx.timeEntry.aggregate({
          where: {
            jobId: timeEntry.jobId,
            status: { in: ['pending', 'submitted', 'approved'] },
            billable: true,
            id: { not: timeEntryId },
          },
          _sum: { billableAmount: true },
        });

        const currentBillable = Number(totalBillableAgg._sum.billableAmount || 0);
        remainingFeeCapHours = Math.max(
          0,
          (jobFee - currentBillable) / rates.billingRate
        );
      }

      const remainingBillableHours = Math.max(
        0,
        Math.min(remainingEmployeeAllocation, remainingJobAllocation, remainingFeeCapHours)
      );

      const shouldSplit =
        requestedBillable &&
        remainingBillableHours > 0 &&
        updatedHours > remainingBillableHours;

      const fullyNonBillable =
        !requestedBillable || remainingBillableHours <= 0 || rates.billingRate <= 0;

      if (shouldSplit) {
        const billableHours = Number(remainingBillableHours.toFixed(2));
        const nonBillableHours = Number((updatedHours - billableHours).toFixed(2));

        if (billableHours <= 0 || nonBillableHours <= 0) {
          const finalBillable = requestedBillable && billableHours > 0;
          const amounts = await TimeEntryService.calculateAmounts(
            timeEntry.jobId,
            timeEntry.employeeProfileId,
            updatedHours,
            finalBillable,
            rates
          );

          const updated = await tx.timeEntry.update({
            where: { id: timeEntryId },
            data: {
              hours: updatedHours,
              description: description || timeEntry.description,
              billable: finalBillable,
              billableAmount: amounts.billableAmount,
              costAmount: amounts.costAmount,
              profitLoss: amounts.profitLoss,
              updatedAt: new Date(),
            },
            include: {
              job: { select: { id: true, jobName: true } },
              employee: { select: { id: true, firstName: true, lastName: true } },
            },
          });

          if (!finalBillable && requestedBillable) {
            return { ...updated, forcedNonBillableReason: 'allocation_or_fee_exceeded' };
          }

          return updated;
        }

        const [billableAmounts, nonBillableAmounts] = await Promise.all([
          TimeEntryService.calculateAmounts(
            timeEntry.jobId,
            timeEntry.employeeProfileId,
            billableHours,
            true,
            rates
          ),
          TimeEntryService.calculateAmounts(
            timeEntry.jobId,
            timeEntry.employeeProfileId,
            nonBillableHours,
            false,
            rates
          ),
        ]);

        const [updated, nonBillableEntry] = await Promise.all([
          tx.timeEntry.update({
            where: { id: timeEntryId },
            data: {
              hours: billableHours,
              description: description || timeEntry.description,
              billable: true,
              billableAmount: billableAmounts.billableAmount,
              costAmount: billableAmounts.costAmount,
              profitLoss: billableAmounts.profitLoss,
              updatedAt: new Date(),
            },
            include: {
              job: { select: { id: true, jobName: true } },
              employee: { select: { id: true, firstName: true, lastName: true } },
            },
          }),
          tx.timeEntry.create({
            data: {
              jobId: timeEntry.jobId,
              employeeProfileId: timeEntry.employeeProfileId,
              hours: nonBillableHours,
              description: description || timeEntry.description,
              dateWorked: timeEntry.dateWorked,
              taskId: timeEntry.taskId,
              billable: false,
              billableAmount: nonBillableAmounts.billableAmount,
              costAmount: nonBillableAmounts.costAmount,
              profitLoss: nonBillableAmounts.profitLoss,
              status: 'pending',
            },
          }),
        ]);

        return { ...updated, splitEntries: [nonBillableEntry] };
      }

      const finalBillable = requestedBillable && !fullyNonBillable;
      const amounts = await TimeEntryService.calculateAmounts(
        timeEntry.jobId,
        timeEntry.employeeProfileId,
        updatedHours,
        finalBillable,
        rates
      );

      const updated = await tx.timeEntry.update({
        where: { id: timeEntryId },
        data: {
          hours: updatedHours,
          description: description || timeEntry.description,
          billable: finalBillable,
          billableAmount: amounts.billableAmount,
          costAmount: amounts.costAmount,
          profitLoss: amounts.profitLoss,
          updatedAt: new Date(),
        },
        include: {
          job: { select: { id: true, jobName: true } },
          employee: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      if (fullyNonBillable && requestedBillable) {
        return { ...updated, forcedNonBillableReason: 'allocation_or_fee_exceeded' };
      }

      return updated;
    });
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

      await createAudit({
        action: `time_entry_approved:job_${timeEntry.jobId}`,
        entity_type: 'time_entry',
        entity_id: updated.id,
        user_id: auth.userId,
        metadata: {
          jobId: timeEntry.jobId,
          employeeProfileId: timeEntry.employeeProfileId,
          hours: Number(timeEntry.hours || 0),
          billable: Boolean(timeEntry.billable),
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

      await createAudit({
        action: `time_entry_rejected:job_${timeEntry.jobId}`,
        entity_type: 'time_entry',
        entity_id: updated.id,
        user_id: auth.userId,
        metadata: {
          jobId: timeEntry.jobId,
          employeeProfileId: timeEntry.employeeProfileId,
          rejectionReason: rejectionReason || null,
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
    const totalHours = Number((Number(timeEntry.hours) + elapsedHours).toFixed(2));

    const job = await prisma.job.findUnique({
      where: { id: timeEntry.jobId },
      include: { jobCosting: { include: { budgetCap: true } } },
    });

    const roleName = auth.roleName || '';
    const isAdmin = roleName === 'admin' || roleName === 'super_admin';
    if (!job?.jobCosting && !isAdmin) {
      throw {
        statusCode: 400,
        message: 'Job costing must be completed before logging time',
      };
    }

    const allocationSummary = await TimeEntryService.getAllocationSummary(
      timeEntry.jobId,
      timeEntry.employeeProfileId
    );

    if (allocationSummary?.requiresAllocation && allocationSummary.employeeAllocatedHours <= 0) {
      throw { statusCode: 400, message: 'No time allocation assigned for this job' };
    }

    const rates = await TimeEntryService.resolveRates(
      timeEntry.jobId,
      timeEntry.employeeProfileId
    );

    const jobFee = Number(
      job?.jobCosting?.jobFee ||
        (job?.billingType === 'fixed_fee' ? job?.fixedFeeAmount : 0) ||
        0
    );

    const capEnforced = allocationSummary?.capEnforced ?? true;
    const allowOverage = allocationSummary?.allowOverage ?? false;
    const maxOveragePercent = Number(allocationSummary?.maxOveragePercent ?? 0);
    const requestedBillable = Boolean(timeEntry.billable);

    return TimeEntryService.runSerializable(async (tx) => {
      const [approvedExtraJob, approvedExtraEmployee] = await Promise.all([
        tx.timeEntryApprovalRequest.aggregate({
          where: { jobId: timeEntry.jobId, status: 'approved' },
          _sum: { additionalHoursRequested: true },
        }),
        tx.timeEntryApprovalRequest.aggregate({
          where: {
            jobId: timeEntry.jobId,
            employeeProfileId: timeEntry.employeeProfileId,
            status: 'approved',
          },
          _sum: { additionalHoursRequested: true },
        }),
      ]);

      const approvedExtraJobHoursRaw = Number(
        approvedExtraJob._sum.additionalHoursRequested || 0
      );
      const approvedExtraEmployeeHoursRaw = Number(
        approvedExtraEmployee._sum.additionalHoursRequested || 0
      );

      const baseJobAllocation = Number(
        allocationSummary?.jobAllocatedHours ?? TimeEntryService.resolveJobBudgetHours(job) ?? 0
      );
      const baseEmployeeAllocation = Number(allocationSummary?.employeeAllocatedHours ?? 0);

      const maxExtraJobHours = allowOverage ? baseJobAllocation * maxOveragePercent : 0;
      const maxExtraEmployeeHours = allowOverage ? baseEmployeeAllocation * maxOveragePercent : 0;

      const approvedExtraJobHours = allowOverage
        ? Math.min(approvedExtraJobHoursRaw, maxExtraJobHours)
        : 0;
      const approvedExtraEmployeeHours = allowOverage
        ? Math.min(approvedExtraEmployeeHoursRaw, maxExtraEmployeeHours)
        : 0;

      const effectiveJobAllocation = capEnforced
        ? baseJobAllocation + approvedExtraJobHours
        : Number.POSITIVE_INFINITY;
      const effectiveEmployeeAllocation = capEnforced
        ? baseEmployeeAllocation + approvedExtraEmployeeHours
        : Number.POSITIVE_INFINITY;

      const [loggedJobHoursResult, loggedEmployeeHoursResult] = await Promise.all([
        tx.timeEntry.aggregate({
          where: {
            jobId: timeEntry.jobId,
            status: { in: ['pending', 'submitted', 'approved'] },
            id: { not: timeEntryId },
          },
          _sum: { hours: true },
        }),
        tx.timeEntry.aggregate({
          where: {
            jobId: timeEntry.jobId,
            employeeProfileId: timeEntry.employeeProfileId,
            status: { in: ['pending', 'submitted', 'approved'] },
            id: { not: timeEntryId },
          },
          _sum: { hours: true },
        }),
      ]);

      const loggedJobHours = Number(loggedJobHoursResult._sum.hours || 0);
      const loggedEmployeeHours = Number(loggedEmployeeHoursResult._sum.hours || 0);

      if (
        Number.isFinite(effectiveEmployeeAllocation) &&
        effectiveEmployeeAllocation > 0 &&
        loggedEmployeeHours + totalHours > effectiveEmployeeAllocation
      ) {
        throw {
          statusCode: 400,
          message: `Adding timer duration exceeds your allocation. Available: ${(effectiveEmployeeAllocation - loggedEmployeeHours).toFixed(2)} hours`,
        };
      }

      if (
        Number.isFinite(effectiveJobAllocation) &&
        effectiveJobAllocation > 0 &&
        loggedJobHours + totalHours > effectiveJobAllocation
      ) {
        throw {
          statusCode: 400,
          message: `Adding timer duration exceeds job allocation. Available: ${(effectiveJobAllocation - loggedJobHours).toFixed(2)} hours`,
        };
      }

      const remainingEmployeeAllocation = Number.isFinite(effectiveEmployeeAllocation)
        ? Math.max(0, effectiveEmployeeAllocation - loggedEmployeeHours)
        : Number.POSITIVE_INFINITY;
      const remainingJobAllocation = Number.isFinite(effectiveJobAllocation)
        ? Math.max(0, effectiveJobAllocation - loggedJobHours)
        : Number.POSITIVE_INFINITY;

      let remainingFeeCapHours = Number.POSITIVE_INFINITY;
      if (jobFee > 0 && rates.billingRate > 0) {
        const totalBillableAgg = await tx.timeEntry.aggregate({
          where: {
            jobId: timeEntry.jobId,
            status: { in: ['pending', 'submitted', 'approved'] },
            billable: true,
            id: { not: timeEntryId },
          },
          _sum: { billableAmount: true },
        });

        const currentBillable = Number(totalBillableAgg._sum.billableAmount || 0);
        remainingFeeCapHours = Math.max(
          0,
          (jobFee - currentBillable) / rates.billingRate
        );
      }

      const remainingBillableHours = Math.max(
        0,
        Math.min(remainingEmployeeAllocation, remainingJobAllocation, remainingFeeCapHours)
      );

      const shouldSplit =
        requestedBillable &&
        remainingBillableHours > 0 &&
        totalHours > remainingBillableHours;

      const fullyNonBillable =
        !requestedBillable || remainingBillableHours <= 0 || rates.billingRate <= 0;

      if (shouldSplit) {
        const billableHours = Number(remainingBillableHours.toFixed(2));
        const nonBillableHours = Number((totalHours - billableHours).toFixed(2));

        if (billableHours <= 0 || nonBillableHours <= 0) {
          const finalBillable = requestedBillable && billableHours > 0;
          const amounts = await TimeEntryService.calculateAmounts(
            timeEntry.jobId,
            timeEntry.employeeProfileId,
            totalHours,
            finalBillable,
            rates
          );

          const updated = await tx.timeEntry.update({
            where: { id: timeEntryId },
            data: {
              startedAt: null,
              hours: totalHours,
              billable: finalBillable,
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

          if (!finalBillable && requestedBillable) {
            return { ...updated, forcedNonBillableReason: 'allocation_or_fee_exceeded' };
          }

          return updated;
        }

        const [billableAmounts, nonBillableAmounts] = await Promise.all([
          TimeEntryService.calculateAmounts(
            timeEntry.jobId,
            timeEntry.employeeProfileId,
            billableHours,
            true,
            rates
          ),
          TimeEntryService.calculateAmounts(
            timeEntry.jobId,
            timeEntry.employeeProfileId,
            nonBillableHours,
            false,
            rates
          ),
        ]);

        const [updated, nonBillableEntry] = await Promise.all([
          tx.timeEntry.update({
            where: { id: timeEntryId },
            data: {
              startedAt: null,
              hours: billableHours,
              billable: true,
              billableAmount: billableAmounts.billableAmount,
              costAmount: billableAmounts.costAmount,
              profitLoss: billableAmounts.profitLoss,
              updatedAt: new Date(),
            },
            include: {
              job: {
                select: { id: true, jobName: true },
              },
            },
          }),
          tx.timeEntry.create({
            data: {
              jobId: timeEntry.jobId,
              employeeProfileId: timeEntry.employeeProfileId,
              hours: nonBillableHours,
              description: timeEntry.description,
              dateWorked: timeEntry.dateWorked,
              taskId: timeEntry.taskId,
              billable: false,
              billableAmount: nonBillableAmounts.billableAmount,
              costAmount: nonBillableAmounts.costAmount,
              profitLoss: nonBillableAmounts.profitLoss,
              status: timeEntry.status,
            },
          }),
        ]);

        return { ...updated, splitEntries: [nonBillableEntry] };
      }

      const finalBillable = requestedBillable && !fullyNonBillable;
      const amounts = await TimeEntryService.calculateAmounts(
        timeEntry.jobId,
        timeEntry.employeeProfileId,
        totalHours,
        finalBillable,
        rates
      );

      const updated = await tx.timeEntry.update({
        where: { id: timeEntryId },
        data: {
          startedAt: null,
          hours: totalHours,
          billable: finalBillable,
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

      if (fullyNonBillable && requestedBillable) {
        return { ...updated, forcedNonBillableReason: 'allocation_or_fee_exceeded' };
      }

      return updated;
    });
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
    input: {
      jobId: number;
      additionalHours: number;
      justification: string;
      requestType?: 'additional_hours' | 'over_budget';
    },
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

    const roleName = auth.roleName || '';
    const isAdmin = roleName === 'admin' || roleName === 'super_admin';

    if (!isAdmin && job.staffing.length === 0) {
      throw { statusCode: 403, message: 'You are not assigned to this job' };
    }

    if (!job.jobCosting && !isAdmin) {
      throw { statusCode: 400, message: 'Job costing must be completed before requesting hours' };
    }

    const allocationSummary = await TimeEntryService.getAllocationSummary(
      input.jobId,
      auth.profileId
    );

    const currentAllocatedHours = Number(allocationSummary?.employeeAllocatedHours || 0);

    if (allocationSummary?.requiresAllocation && currentAllocatedHours <= 0) {
      throw { statusCode: 400, message: 'No time allocation assigned for this job' };
    }

    if (allocationSummary?.capEnforced && allocationSummary?.allowOverage === false) {
      throw { statusCode: 409, message: 'Overage is not allowed for this job' };
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

    // Allow requests even if some allocated hours remain (manager can still approve/deny).

      const requestType = input.requestType || 'additional_hours';
      const request = await prisma.timeEntryApprovalRequest.create({
        data: {
          jobId: input.jobId,
          employeeProfileId: auth.profileId,
          currentAllocatedHours,
          currentLoggedHours,
          additionalHoursRequested: input.additionalHours,
          justification: input.justification,
          requestType,
          status: 'pending',
        },
      });

      await createAudit({
        action: `approval_request_created:job_${input.jobId}`,
        entity_type: 'time_entry_approval_request',
        entity_id: request.id,
        user_id: auth.userId,
        metadata: {
          jobId: input.jobId,
          employeeProfileId: auth.profileId,
          additionalHours: input.additionalHours,
          requestType,
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
              type: 'warning',
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

        await createAudit({
          action: `approval_request_approved:job_${request.jobId}`,
          entity_type: 'time_entry_approval_request',
          entity_id: request.id,
          user_id: auth.userId,
          metadata: {
            jobId: request.jobId,
            employeeProfileId: request.employeeProfileId,
            approvedByProfileId: auth.profileId,
            approvalNotes: approvalNotes || null,
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

        await createAudit({
          action: `approval_request_rejected:job_${request.jobId}`,
          entity_type: 'time_entry_approval_request',
          entity_id: request.id,
          user_id: auth.userId,
          metadata: {
            jobId: request.jobId,
            employeeProfileId: request.employeeProfileId,
            approvedByProfileId: auth.profileId,
            approvalNotes: approvalNotes || null,
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
   * Approve over-budget request (manager stage or partner final stage)
   */
  static async approveOverBudgetRequest(
    requestId: number,
    approvalNotes: string | undefined,
    auth: AuthContext
  ) {
    if (!['manager', 'partner', 'admin', 'super_admin'].includes(auth.roleName || '')) {
      throw { statusCode: 403, message: 'Not authorized to approve over-budget requests' };
    }

    const request = await prisma.timeOverBudgetRequest.findUnique({
      where: { id: requestId },
      include: { job: true },
    });

    if (!request) {
      throw { statusCode: 404, message: 'Over-budget request not found' };
    }

    const isAdmin = ['admin', 'super_admin'].includes(auth.roleName || '');
    const isJobManager = request.job.managerProfileId === auth.profileId;
    const isJobPartner = request.job.partnerProfileId === auth.profileId;

    if (!isAdmin && !isJobManager && !isJobPartner) {
      throw { statusCode: 403, message: 'Not authorized to approve this over-budget request' };
    }

    if (
      ['manager_rejected', 'partner_rejected', 'partner_approved', 'auto_rejected'].includes(
        request.status
      )
    ) {
      throw { statusCode: 409, message: 'This over-budget request is already closed' };
    }

    const actingAsManager = isJobManager && !isJobPartner && !isAdmin;
    const finalApprove = !request.requiresPartnerApproval || isJobPartner || isAdmin;

    if (actingAsManager && request.status !== 'pending') {
      throw { statusCode: 409, message: 'Only pending over-budget requests can be manager-approved' };
    }

    const nextStatus = finalApprove ? 'partner_approved' : 'manager_approved';
    const updated = await prisma.timeOverBudgetRequest.update({
      where: { id: requestId },
      data: {
        status: nextStatus,
        managerApproved: request.managerApproved || actingAsManager || isAdmin,
        partnerApproved: finalApprove,
        approvalNotes: approvalNotes || null,
      },
      include: {
        job: { select: { id: true, jobName: true } },
        employee: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    await createAudit({
      action:
        nextStatus === 'manager_approved'
          ? `over_budget_request_manager_approved:job_${request.jobId}`
          : `over_budget_request_partner_approved:job_${request.jobId}`,
      entity_type: 'time_over_budget_request',
      entity_id: request.id,
      user_id: auth.userId,
      metadata: {
        jobId: request.jobId,
        employeeProfileId: request.employeeProfileId,
        approvedByProfileId: auth.profileId,
        stage: nextStatus,
        approvalNotes: approvalNotes || null,
      },
    });

    if (nextStatus === 'manager_approved' && request.job.partnerProfileId) {
      await NotificationService.createNotification(
        {
          recipientProfileId: request.job.partnerProfileId,
          type: 'action',
          title: `Partner approval required for ${request.job.jobName}`,
          message: `An over-budget request is awaiting partner decision for "${request.job.jobName}".`,
          actionRequired: true,
          jobId: request.job.id,
          link: `/partner-dashboard?tab=approvals`,
        },
        { userId: auth.userId, profileId: auth.profileId, roleName: auth.roleName }
      );
    }

    if (nextStatus === 'partner_approved') {
      await NotificationService.createNotification(
        {
          recipientProfileId: request.employeeProfileId,
          type: 'info',
          title: 'Over-budget request approved',
          message: `Your over-budget request for "${request.job.jobName}" was approved.`,
          actionRequired: false,
          jobId: request.job.id,
          link: `/timesheets`,
        },
        { userId: auth.userId, profileId: auth.profileId, roleName: auth.roleName }
      );
    }

    return updated;
  }

  /**
   * Reject over-budget request (manager stage or partner final stage)
   */
  static async rejectOverBudgetRequest(
    requestId: number,
    approvalNotes: string | undefined,
    auth: AuthContext
  ) {
    if (!['manager', 'partner', 'admin', 'super_admin'].includes(auth.roleName || '')) {
      throw { statusCode: 403, message: 'Not authorized to reject over-budget requests' };
    }

    const request = await prisma.timeOverBudgetRequest.findUnique({
      where: { id: requestId },
      include: { job: true },
    });

    if (!request) {
      throw { statusCode: 404, message: 'Over-budget request not found' };
    }

    const isAdmin = ['admin', 'super_admin'].includes(auth.roleName || '');
    const isJobManager = request.job.managerProfileId === auth.profileId;
    const isJobPartner = request.job.partnerProfileId === auth.profileId;

    if (!isAdmin && !isJobManager && !isJobPartner) {
      throw { statusCode: 403, message: 'Not authorized to reject this over-budget request' };
    }

    if (
      ['manager_rejected', 'partner_rejected', 'partner_approved', 'auto_rejected'].includes(
        request.status
      )
    ) {
      throw { statusCode: 409, message: 'This over-budget request is already closed' };
    }

    const actingAsManager = isJobManager && !isJobPartner && !isAdmin;
    const nextStatus = actingAsManager ? 'manager_rejected' : 'partner_rejected';

    const updated = await prisma.timeOverBudgetRequest.update({
      where: { id: requestId },
      data: {
        status: nextStatus,
        managerApproved: false,
        partnerApproved: false,
        approvalNotes: approvalNotes || null,
        rejectionReason: approvalNotes || request.rejectionReason || 'Rejected',
      },
      include: {
        job: { select: { id: true, jobName: true } },
        employee: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    await createAudit({
      action:
        nextStatus === 'manager_rejected'
          ? `over_budget_request_manager_rejected:job_${request.jobId}`
          : `over_budget_request_partner_rejected:job_${request.jobId}`,
      entity_type: 'time_over_budget_request',
      entity_id: request.id,
      user_id: auth.userId,
      metadata: {
        jobId: request.jobId,
        employeeProfileId: request.employeeProfileId,
        rejectedByProfileId: auth.profileId,
        stage: nextStatus,
        approvalNotes: approvalNotes || null,
      },
    });

    await NotificationService.createNotification(
      {
        recipientProfileId: request.employeeProfileId,
        type: 'action',
        title: 'Over-budget request rejected',
        message: `Your over-budget request for "${request.job.jobName}" was rejected.`,
        actionRequired: true,
        jobId: request.job.id,
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
      include: { jobCosting: { include: { budgetCap: true } } },
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
      budgetCap: TimeEntryService.resolveJobBudgetHours(job),
      budgetUsed: 0,
      budgetRemaining: TimeEntryService.resolveJobBudgetHours(job),
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
      const entryHours = Number(entry.hours);
      summary.totalHours += entryHours;
      summary.entriesByStatus[entry.status as keyof typeof summary.entriesByStatus]++;

      if (entry.status === 'approved') {
        summary.approvedHours += entryHours;
      } else if (entry.status === 'submitted') {
        summary.submittedHours += entryHours;
      } else if (entry.status === 'pending') {
        summary.pendingHours += entryHours;
      } else if (entry.status === 'rejected') {
        summary.rejectedHours += entryHours;
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
      summary.entriesByEmployee[empId].totalHours += entryHours;
      if (entry.status === 'approved') {
        summary.entriesByEmployee[empId].approvedHours += entryHours;
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


