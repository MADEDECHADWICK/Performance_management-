/**
 * Time Entry Service (Schema v2.1 aligned)
 * - Uses TimeEntry.dateWorked, startedAt, endedAt
 * - Status flow: pending -> submitted -> approved/rejected/cancelled
 * - Uses JobStaffAssignment for "assigned to job" checks
 * - Access checks use Job.managerProfileId / Job.partnerProfileId
 */

import { prisma } from '../prisma';
import { Prisma, NonBillableCategory } from '@prisma/client';
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
  private static normalizeRole(roleName?: string): string {
    return String(roleName || '').toLowerCase().trim();
  }

  private static isAdminRole(roleName?: string): boolean {
    const normalized = TimeEntryService.normalizeRole(roleName);
    return normalized === 'super_admin';
  }

  private static hasScopedManagerAccess(
    roleName: string | undefined,
    requesterProfileId: number,
    ctx: { jobManagerProfileId?: number | null; employeeManagerId?: number | null }
  ): boolean {
    if (TimeEntryService.normalizeRole(roleName) !== 'manager') {
      return false;
    }
    return (
      ctx.jobManagerProfileId === requesterProfileId ||
      ctx.employeeManagerId === requesterProfileId
    );
  }

  private static hasPartnerAccess(
    roleName: string | undefined,
    requesterProfileId: number,
    jobPartnerProfileId?: number | null
  ): boolean {
    return (
      TimeEntryService.normalizeRole(roleName) === 'partner' &&
      jobPartnerProfileId === requesterProfileId
    );
  }

  private static resolveJobBudgetHours(
    job:
      | {
          budgetHours?: any;
          costingCompleted?: boolean | null;
          jobCosting?:
            | {
                budgetCap?: { totalAllocatedHours?: any } | null;
                costingStatus?: string | null;
                totalEstimatedHours?: any;
              }
            | null;
        }
      | null
      | undefined
  ) {
    if (!job) return 0;
    const fromBudgetCap = Number(
      job.jobCosting?.budgetCap?.totalAllocatedHours ??
        job.jobCosting?.totalEstimatedHours ??
        0
    );
    if (fromBudgetCap > 0) return fromBudgetCap;
    return Number(job.budgetHours || 0);
  }

  private static ensureJobReadyForTimeLogging(
    job:
      | {
          costingCompleted?: boolean | null;
          jobCosting?:
            | {
                costingStatus?: string | null;
              }
            | null;
        }
      | null
      | undefined,
    isAdmin: boolean
  ) {
    if (isAdmin) return;

    const costingStatus = String(job?.jobCosting?.costingStatus || '').trim().toLowerCase();
    if (!job?.jobCosting || !job.costingCompleted || costingStatus !== 'approved') {
      throw {
        statusCode: 400,
        message: 'Job costing must be partner-approved before logging time',
      };
    }
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
        role: { select: { billingRate: true, costRate: true } },
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
    const costRate =
      Number(
        snapshot.costRate ??
          assignment?.role?.costRate ??
          snapshot.billingRate ??
          assignment?.role?.billingRate ??
          billingRate
      ) || billingRate;

    return { billingRate, costRate };
  }

  private static async calculateAmounts(
    jobId: number,
    employeeProfileId: number,
    hours: number,
    billable: boolean,
    rates?: { billingRate: number; costRate: number }
  ) {
    const resolvedRates =
      rates ?? (await TimeEntryService.resolveRates(jobId, employeeProfileId));
    const { billingRate, costRate } = resolvedRates;
    const totalHours = Number(hours || 0);
    const billableAmount = billable ? totalHours * billingRate : 0;
    const costAmount = totalHours * costRate;
    const profitLoss = billableAmount - costAmount;

    return {
      hourlyRate: billingRate,
      costRate,
      billableAmount,
      costAmount,
      profitLoss,
    };
  }

  private static readonly LUNCH_BREAK_START_HOUR = 13;
  private static readonly LUNCH_BREAK_END_HOUR = 14;

  private static parseDateInput(value: unknown): Date | null {
    if (value === undefined || value === null || value === '') return null;
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }
    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private static calculateLunchBreakOverlapHours(start: Date, end: Date): number {
    if (end <= start) return 0;

    let overlapMs = 0;
    const dayCursor = new Date(start);
    dayCursor.setHours(0, 0, 0, 0);

    const endDay = new Date(end);
    endDay.setHours(0, 0, 0, 0);

    while (dayCursor.getTime() <= endDay.getTime()) {
      const lunchStart = new Date(dayCursor);
      lunchStart.setHours(TimeEntryService.LUNCH_BREAK_START_HOUR, 0, 0, 0);
      const lunchEnd = new Date(dayCursor);
      lunchEnd.setHours(TimeEntryService.LUNCH_BREAK_END_HOUR, 0, 0, 0);

      const overlapStart = Math.max(start.getTime(), lunchStart.getTime());
      const overlapEnd = Math.min(end.getTime(), lunchEnd.getTime());
      if (overlapEnd > overlapStart) {
        overlapMs += overlapEnd - overlapStart;
      }

      dayCursor.setDate(dayCursor.getDate() + 1);
    }

    return overlapMs / (1000 * 60 * 60);
  }

  private static calculateTrackedHours(start: Date, end: Date) {
    const rawHours = Math.max(0, (end.getTime() - start.getTime()) / (1000 * 60 * 60));
    const lunchBreakHours = TimeEntryService.calculateLunchBreakOverlapHours(start, end);
    const netHours = Math.max(0, rawHours - lunchBreakHours);
    return {
      hours: Number(netHours.toFixed(2)),
      lunchBreakHours: Number(lunchBreakHours.toFixed(2)),
      rawHours: Number(rawHours.toFixed(2)),
    };
  }

  private static resolveTimeInput(
    input: { hours?: unknown; startedAt?: unknown; endedAt?: unknown },
    opts?: { fallbackHours?: number; fallbackStartedAt?: Date | null; fallbackEndedAt?: Date | null }
  ) {
    const providedStartedAt = TimeEntryService.parseDateInput(input.startedAt);
    const providedEndedAt = TimeEntryService.parseDateInput(input.endedAt);
    const hasRangeInput = input.startedAt !== undefined || input.endedAt !== undefined;

    if (hasRangeInput) {
      if (!providedStartedAt || !providedEndedAt) {
        throw { statusCode: 400, message: 'Both startedAt and endedAt are required' };
      }
      if (providedEndedAt <= providedStartedAt) {
        throw { statusCode: 400, message: 'endedAt must be after startedAt' };
      }

      const tracked = TimeEntryService.calculateTrackedHours(providedStartedAt, providedEndedAt);
      if (!Number.isFinite(tracked.hours) || tracked.hours <= 0) {
        throw { statusCode: 400, message: 'Tracked hours must be greater than zero' };
      }

      return {
        hours: tracked.hours,
        startedAt: providedStartedAt,
        endedAt: providedEndedAt,
        lunchBreakHours: tracked.lunchBreakHours,
      };
    }

    if (input.hours !== undefined && input.hours !== null && input.hours !== '') {
      const parsedHours = Number(input.hours);
      if (!Number.isFinite(parsedHours) || parsedHours <= 0) {
        throw { statusCode: 400, message: 'Invalid hours value' };
      }
      return {
        hours: parsedHours,
        startedAt: null as Date | null,
        endedAt: null as Date | null,
        lunchBreakHours: 0,
      };
    }

    if (opts?.fallbackHours !== undefined) {
      const fallbackHours = Number(opts.fallbackHours);
      if (!Number.isFinite(fallbackHours) || fallbackHours <= 0) {
        throw { statusCode: 400, message: 'Invalid hours value' };
      }
      return {
        hours: fallbackHours,
        startedAt: opts.fallbackStartedAt ?? null,
        endedAt: opts.fallbackEndedAt ?? null,
        lunchBreakHours: 0,
      };
    }

    throw { statusCode: 400, message: 'Invalid hours value' };
  }

  private static readonly HARD_CAP_OPTIONS = [
    { key: 'mark_task_complete', label: 'Mark Task as Complete' },
    { key: 'request_additional_time', label: 'Request Additional Time' },
    { key: 'dismiss', label: 'Dismiss' },
  ] as const;

  private static throwHardCapExceeded(params: {
    capType: 'employee' | 'job' | 'task';
    jobId: number;
    taskId?: number | null;
    availableHours: number;
    attemptedHours: number;
  }): never {
    const availableHours = Number(Math.max(0, params.availableHours).toFixed(2));
    const attemptedHours = Number(Math.max(0, params.attemptedHours).toFixed(2));
    const capLabel =
      params.capType === 'employee'
        ? 'your allocation'
        : params.capType === 'task'
          ? 'your task allocation'
          : 'job allocation';

    // IMPLEMENTED: Timesheet hard cap action contract — return explicit UI actions when cap is reached.
    throw {
      statusCode: 409,
      message: `Time entry exceeds ${capLabel}. Available: ${availableHours.toFixed(2)} hours`,
      details: {
        code: 'TIME_ENTRY_HARD_CAP_REACHED',
        hardCap: true,
        capType: params.capType,
        jobId: params.jobId,
        taskId: params.taskId ?? null,
        availableHours,
        attemptedHours,
        options: TimeEntryService.HARD_CAP_OPTIONS,
      },
    };
  }

  private static readonly APPROVAL_META_PREFIX = '[[RG_APPROVAL_META]]';

  private static parseApprovalMetadata(approvalNotes: string | null | undefined) {
    const raw = String(approvalNotes || '');
    if (!raw.startsWith(TimeEntryService.APPROVAL_META_PREFIX)) {
      return { meta: {} as Record<string, any>, note: raw.trim() || null };
    }

    const payload = raw.slice(TimeEntryService.APPROVAL_META_PREFIX.length);
    const newlineIndex = payload.indexOf('\n');
    const metaRaw = (newlineIndex === -1 ? payload : payload.slice(0, newlineIndex)).trim();
    const noteRaw = newlineIndex === -1 ? '' : payload.slice(newlineIndex + 1).trim();

    try {
      return {
        meta: metaRaw ? (JSON.parse(metaRaw) as Record<string, any>) : {},
        note: noteRaw || null,
      };
    } catch (_error) {
      return { meta: {}, note: noteRaw || null };
    }
  }

  private static serializeApprovalMetadata(
    meta: Record<string, any>,
    note?: string | null
  ) {
    const notePart = String(note || '').trim();
    return `${TimeEntryService.APPROVAL_META_PREFIX}${JSON.stringify(meta)}${
      notePart ? `\n${notePart}` : ''
    }`;
  }

  private static readonly NON_BILLABLE_CATEGORIES = new Set([
    'leave',
    'public_holiday',
    'internal',
    'training',
    'over_budget',
    'other',
  ]);

  private static normalizeNonBillableCategory(value: unknown): NonBillableCategory | null {
    if (value === undefined || value === null || value === '') return null;
    const normalized = String(value).trim().toLowerCase().replace(/\s+/g, '_');
    if (!TimeEntryService.NON_BILLABLE_CATEGORIES.has(normalized)) {
      throw {
        statusCode: 400,
        message:
          'nonBillableCategory must be one of: leave, public_holiday, internal, training, over_budget, other',
      };
    }
    return normalized as NonBillableCategory;
  }

  private static normalizeDescription(description: unknown) {
    const raw = String(description || '').trim();
    return raw || null;
  }

  private static resolveStoredNonBillableCategory(
    finalBillable: boolean,
    requestedBillable: boolean,
    requestedCategory: NonBillableCategory | null,
    existingCategory?: NonBillableCategory | null
  ): NonBillableCategory | null {
    if (finalBillable) return null;
    return requestedBillable
      ? NonBillableCategory.over_budget
      : requestedCategory || existingCategory || NonBillableCategory.other;
  }

  private static async resolveAdditionalHoursRisk(
    jobId: number,
    employeeProfileId: number,
    additionalHours: number
  ) {
    const [job, rates, billableAgg] = await Promise.all([
      prisma.job.findUnique({
        where: { id: jobId },
        select: {
          id: true,
          billingType: true,
          fixedFeeAmount: true,
          jobCosting: { select: { jobFee: true } },
        },
      }),
      TimeEntryService.resolveRates(jobId, employeeProfileId),
      prisma.timeEntry.aggregate({
        where: {
          jobId,
          billable: true,
          status: { in: ['pending', 'submitted', 'approved'] },
        },
        _sum: { billableAmount: true },
      }),
    ]);

    const jobFee = Number(
      job?.jobCosting?.jobFee ||
        (job?.billingType === 'fixed_fee' ? job?.fixedFeeAmount : 0) ||
        0
    );
    const currentBillableAmount = Number(billableAgg._sum.billableAmount || 0);
    const billingRate = Number(rates.billingRate || 0);
    const projectedAdditionalCost = Number(additionalHours || 0) * billingRate;
    const projectedTotalBillable = currentBillableAmount + projectedAdditionalCost;
    const wouldExceedFeeCap = jobFee > 0 && projectedTotalBillable > jobFee + 0.0001;
    const excessCost = wouldExceedFeeCap ? projectedTotalBillable - jobFee : 0;

    return {
      jobFee,
      billingRate,
      currentBillableAmount,
      projectedAdditionalCost,
      projectedTotalBillable,
      wouldExceedFeeCap,
      excessCost,
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

    const roleName = TimeEntryService.normalizeRole(auth.roleName);
    const isAdmin = TimeEntryService.isAdminRole(roleName);
    const isHr = roleName === 'hr' || roleName === 'hr';
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
    const roleName = TimeEntryService.normalizeRole(auth.roleName);
    const isElevated =
      TimeEntryService.isAdminRole(roleName) || roleName === 'manager' || roleName === 'partner';

    if (!isElevated) {
      // Regular employees only see their own entries
      where.employeeProfileId = auth.profileId;
    } else if (roleName === 'partner') {
      // Partners only see their own jobs' time entries
      where.job = {
        partnerProfileId: auth.profileId,
      };
    } else if (roleName === 'manager') {
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
    const { jobId, taskId, dateWorked, description: rawDescription } = input;
    const resolvedTimeInput = TimeEntryService.resolveTimeInput({
      hours: input.hours,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
    });
    const entryHours = resolvedTimeInput.hours;
    const resolvedDateWorked =
      TimeEntryService.parseDateInput(dateWorked) ?? resolvedTimeInput.startedAt;
    if (!resolvedDateWorked) {
      throw { statusCode: 400, message: 'dateWorked is required' };
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
    const roleName = TimeEntryService.normalizeRole(auth.roleName);
    const isAdmin = TimeEntryService.isAdminRole(roleName);
    if (!isAdmin && job.staffing.length === 0) {
      throw {
        statusCode: 403,
        message: 'You are not assigned to this job',
      };
    }

    TimeEntryService.ensureJobReadyForTimeLogging(job, isAdmin);

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

    let taskContext: { id: number; estimatedHours: number; assignedToProfileId: number | null } | null =
      null;
    // ✅ VERIFY TASK EXISTS IF PROVIDED
    if (taskId) {
      const task = await prisma.task.findUnique({
        where: { id: Number(taskId) },
        select: {
          id: true,
          jobId: true,
          estimatedHours: true,
          assignedToProfileId: true,
        },
      });

      if (!task || task.jobId !== Number(jobId)) {
        throw {
          statusCode: 404,
          message: 'Task not found or does not belong to this job',
        };
      }

      if (!isAdmin && task.assignedToProfileId && task.assignedToProfileId !== auth.profileId) {
        throw {
          statusCode: 403,
          message: 'You can only log time against tasks assigned to you',
        };
      }

      taskContext = {
        id: task.id,
        estimatedHours: Number(task.estimatedHours || 0),
        assignedToProfileId: task.assignedToProfileId,
      };
    }

    const requestedBillable = input.billable ?? true;
    const requestedNonBillableCategory = TimeEntryService.normalizeNonBillableCategory(
      input.nonBillableCategory
    );
    if (!requestedBillable && !requestedNonBillableCategory) {
      // IMPLEMENTED: Non-billable time categories — non-billable entries now require a category.
      throw {
        statusCode: 400,
        message:
          'nonBillableCategory is required for non-billable entries (leave, public_holiday, internal, training, over_budget, other)',
      };
    }
    const normalizedDescription = TimeEntryService.normalizeDescription(rawDescription);
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

      if (taskContext?.estimatedHours && taskContext.estimatedHours > 0) {
        const loggedTaskHoursResult = await tx.timeEntry.aggregate({
          where: {
            jobId: Number(jobId),
            taskId: taskContext.id,
            employeeProfileId: auth.profileId,
            status: { in: ['pending', 'submitted', 'approved'] },
          },
          _sum: { hours: true },
        });
        const loggedTaskHours = Number(loggedTaskHoursResult._sum.hours || 0);
        if (loggedTaskHours + entryHours > taskContext.estimatedHours) {
          TimeEntryService.throwHardCapExceeded({
            capType: 'task',
            jobId: Number(jobId),
            taskId: taskContext.id,
            availableHours: taskContext.estimatedHours - loggedTaskHours,
            attemptedHours: entryHours,
          });
        }
      }

      if (
        Number.isFinite(effectiveEmployeeAllocation) &&
        effectiveEmployeeAllocation > 0 &&
        loggedEmployeeHours + entryHours > effectiveEmployeeAllocation
      ) {
        TimeEntryService.throwHardCapExceeded({
          capType: 'employee',
          jobId: Number(jobId),
          taskId: taskId ? Number(taskId) : null,
          availableHours: effectiveEmployeeAllocation - loggedEmployeeHours,
          attemptedHours: entryHours,
        });
      }

      if (
        Number.isFinite(effectiveJobAllocation) &&
        effectiveJobAllocation > 0 &&
        loggedJobHours + entryHours > effectiveJobAllocation
      ) {
        TimeEntryService.throwHardCapExceeded({
          capType: 'job',
          jobId: Number(jobId),
          taskId: taskId ? Number(taskId) : null,
          availableHours: effectiveJobAllocation - loggedJobHours,
          attemptedHours: entryHours,
        });
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
              description: normalizedDescription,
              dateWorked: resolvedDateWorked,
              startedAt: resolvedTimeInput.startedAt,
              endedAt: resolvedTimeInput.endedAt,
              taskId: taskId ? Number(taskId) : null,
              billable: finalBillable,
              nonBillableCategory: TimeEntryService.resolveStoredNonBillableCategory(
                finalBillable,
                requestedBillable,
                requestedNonBillableCategory
              ),
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
              description: normalizedDescription,
              dateWorked: resolvedDateWorked,
              startedAt: resolvedTimeInput.startedAt,
              endedAt: resolvedTimeInput.endedAt,
              taskId: taskId ? Number(taskId) : null,
              billable: true,
              nonBillableCategory: null,
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
              description: normalizedDescription,
              dateWorked: resolvedDateWorked,
              taskId: taskId ? Number(taskId) : null,
              billable: false,
              nonBillableCategory:
                requestedNonBillableCategory || NonBillableCategory.over_budget,
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
          description: normalizedDescription,
          dateWorked: resolvedDateWorked,
          startedAt: resolvedTimeInput.startedAt,
          endedAt: resolvedTimeInput.endedAt,
          taskId: taskId ? Number(taskId) : null,
          billable: finalBillable,
          nonBillableCategory: TimeEntryService.resolveStoredNonBillableCategory(
            finalBillable,
            requestedBillable,
            requestedNonBillableCategory
          ),
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
            managerProfileId: true,
            partnerProfileId: true,
          },
        },
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            managerId: true,
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
      TimeEntryService.isAdminRole(auth.roleName) ||
      TimeEntryService.hasScopedManagerAccess(auth.roleName, auth.profileId, {
        jobManagerProfileId: timeEntry.job.managerProfileId,
        employeeManagerId: timeEntry.employee?.managerId,
      }) ||
      TimeEntryService.hasPartnerAccess(
        auth.roleName,
        auth.profileId,
        timeEntry.job.partnerProfileId
      ) ||
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
    const { description: rawDescription, billable } = input;

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
    const roleName = TimeEntryService.normalizeRole(auth.roleName);
    const isAdmin = TimeEntryService.isAdminRole(roleName);

    if (timeEntry.employeeProfileId !== auth.profileId && !isAdmin) {
      throw {
        statusCode: 403,
        message: 'You can only update your own time entries',
      };
    }

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

    const resolvedTimeInput = TimeEntryService.resolveTimeInput(
      {
        hours: input.hours,
        startedAt: input.startedAt,
        endedAt: input.endedAt,
      },
      {
        fallbackHours: Number(timeEntry.hours || 0),
        fallbackStartedAt: timeEntry.startedAt,
        fallbackEndedAt: timeEntry.endedAt,
      }
    );
    const updatedHours = resolvedTimeInput.hours;
    let taskContext: { id: number; estimatedHours: number } | null = null;

    if (timeEntry.taskId) {
      const task = await prisma.task.findUnique({
        where: { id: timeEntry.taskId },
        select: {
          id: true,
          estimatedHours: true,
          assignedToProfileId: true,
        },
      });
      if (!task) {
        throw { statusCode: 404, message: 'Task linked to time entry was not found' };
      }
      if (!isAdmin && task.assignedToProfileId && task.assignedToProfileId !== auth.profileId) {
        throw {
          statusCode: 403,
          message: 'You can only log time against tasks assigned to you',
        };
      }
      taskContext = { id: task.id, estimatedHours: Number(task.estimatedHours || 0) };
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
    const requestedNonBillableCategory = TimeEntryService.normalizeNonBillableCategory(
      input.nonBillableCategory
    );
    const existingNonBillableCategory = timeEntry.nonBillableCategory ?? null;
    if (billable === false && !requestedNonBillableCategory && !existingNonBillableCategory) {
      throw {
        statusCode: 400,
        message:
          'nonBillableCategory is required for non-billable entries (leave, public_holiday, internal, training, over_budget, other)',
      };
    }
    const normalizedDescription = TimeEntryService.normalizeDescription(
      rawDescription ?? timeEntry.description
    );

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

      if (taskContext?.estimatedHours && taskContext.estimatedHours > 0) {
        const loggedTaskHoursResult = await tx.timeEntry.aggregate({
          where: {
            jobId: timeEntry.jobId,
            taskId: taskContext.id,
            employeeProfileId: timeEntry.employeeProfileId,
            status: { in: ['pending', 'submitted', 'approved'] },
            id: { not: timeEntryId },
          },
          _sum: { hours: true },
        });
        const loggedTaskHours = Number(loggedTaskHoursResult._sum.hours || 0);
        if (loggedTaskHours + updatedHours > taskContext.estimatedHours) {
          TimeEntryService.throwHardCapExceeded({
            capType: 'task',
            jobId: timeEntry.jobId,
            taskId: taskContext.id,
            availableHours: taskContext.estimatedHours - loggedTaskHours,
            attemptedHours: updatedHours,
          });
        }
      }

      if (
        Number.isFinite(effectiveEmployeeAllocation) &&
        effectiveEmployeeAllocation > 0 &&
        loggedEmployeeHours + updatedHours > effectiveEmployeeAllocation
      ) {
        TimeEntryService.throwHardCapExceeded({
          capType: 'employee',
          jobId: timeEntry.jobId,
          taskId: timeEntry.taskId,
          availableHours: effectiveEmployeeAllocation - loggedEmployeeHours,
          attemptedHours: updatedHours,
        });
      }

      if (
        Number.isFinite(effectiveJobAllocation) &&
        effectiveJobAllocation > 0 &&
        loggedJobHours + updatedHours > effectiveJobAllocation
      ) {
        TimeEntryService.throwHardCapExceeded({
          capType: 'job',
          jobId: timeEntry.jobId,
          taskId: timeEntry.taskId,
          availableHours: effectiveJobAllocation - loggedJobHours,
          attemptedHours: updatedHours,
        });
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
              description: normalizedDescription,
              startedAt: resolvedTimeInput.startedAt,
              endedAt: resolvedTimeInput.endedAt,
              billable: finalBillable,
              nonBillableCategory: TimeEntryService.resolveStoredNonBillableCategory(
                finalBillable,
                requestedBillable,
                requestedNonBillableCategory,
                existingNonBillableCategory
              ),
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
              description: normalizedDescription,
              startedAt: resolvedTimeInput.startedAt,
              endedAt: resolvedTimeInput.endedAt,
              billable: true,
              nonBillableCategory: null,
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
              description: normalizedDescription,
              dateWorked: timeEntry.dateWorked,
              taskId: timeEntry.taskId,
              startedAt: null,
              endedAt: null,
              billable: false,
              nonBillableCategory:
                requestedNonBillableCategory || NonBillableCategory.over_budget,
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
          description: normalizedDescription,
          startedAt: resolvedTimeInput.startedAt,
          endedAt: resolvedTimeInput.endedAt,
          billable: finalBillable,
          nonBillableCategory: TimeEntryService.resolveStoredNonBillableCategory(
            finalBillable,
            requestedBillable,
            requestedNonBillableCategory,
            existingNonBillableCategory
          ),
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
      !TimeEntryService.isAdminRole(auth.roleName)
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
      !TimeEntryService.isAdminRole(auth.roleName)
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
    const roleName = TimeEntryService.normalizeRole(auth.roleName);
    if (!['manager', 'partner', 'super_admin'].includes(roleName)) {
      throw {
        statusCode: 403,
        message: 'Only managers/partners can approve time entries',
      };
    }

    const timeEntry = await prisma.timeEntry.findUnique({
      where: { id: timeEntryId },
      include: {
        job: true,
        employee: {
          select: {
            id: true,
            managerId: true,
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

    const isAdmin = TimeEntryService.isAdminRole(roleName);
    const isScopedManager = TimeEntryService.hasScopedManagerAccess(roleName, auth.profileId, {
      jobManagerProfileId: timeEntry.job.managerProfileId,
      employeeManagerId: timeEntry.employee?.managerId,
    });
    const isPartnerOfJob = TimeEntryService.hasPartnerAccess(
      roleName,
      auth.profileId,
      timeEntry.job.partnerProfileId
    );

    if (!isAdmin && !isScopedManager && !isPartnerOfJob) {
      throw {
        statusCode: 403,
        message: 'You do not have permission to approve this time entry',
      };
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
    const roleName = TimeEntryService.normalizeRole(auth.roleName);
    if (!['manager', 'partner', 'super_admin'].includes(roleName)) {
      throw {
        statusCode: 403,
        message: 'Only managers/partners can reject time entries',
      };
    }

    const timeEntry = await prisma.timeEntry.findUnique({
      where: { id: timeEntryId },
      include: {
        job: true,
        employee: {
          select: {
            id: true,
            managerId: true,
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

    const isAdmin = TimeEntryService.isAdminRole(roleName);
    const isScopedManager = TimeEntryService.hasScopedManagerAccess(roleName, auth.profileId, {
      jobManagerProfileId: timeEntry.job.managerProfileId,
      employeeManagerId: timeEntry.employee?.managerId,
    });
    const isPartnerOfJob = TimeEntryService.hasPartnerAccess(
      roleName,
      auth.profileId,
      timeEntry.job.partnerProfileId
    );

    if (!isAdmin && !isScopedManager && !isPartnerOfJob) {
      throw {
        statusCode: 403,
        message: 'You do not have permission to reject this time entry',
      };
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
          rejectionReason: rejectionReason || null,
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
      !TimeEntryService.isAdminRole(auth.roleName)
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
    if (timeEntry.startedAt && !timeEntry.endedAt) {
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
      !TimeEntryService.isAdminRole(auth.roleName)
    ) {
      throw {
        statusCode: 403,
        message: 'You can only stop timers for your own entries',
      };
    }

    // ✅ VERIFY TIMER WAS STARTED AND STILL RUNNING
    if (!timeEntry.startedAt || timeEntry.endedAt) {
      throw {
        statusCode: 400,
        message: 'Timer was not started for this entry',
      };
    }

    // ✅ CALCULATE ELAPSED TIME (excluding lunch overlap)
    const stoppedAt = new Date();
    const elapsedTracking = TimeEntryService.calculateTrackedHours(
      new Date(timeEntry.startedAt),
      stoppedAt
    );
    const elapsedHours = elapsedTracking.hours;
    const totalHours = Number((Number(timeEntry.hours) + elapsedHours).toFixed(2));

    const job = await prisma.job.findUnique({
      where: { id: timeEntry.jobId },
      include: { jobCosting: { include: { budgetCap: true } } },
    });

    const roleName = TimeEntryService.normalizeRole(auth.roleName);
    const isAdmin = TimeEntryService.isAdminRole(roleName);
    TimeEntryService.ensureJobReadyForTimeLogging(job, isAdmin);

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
    let taskContext: { id: number; estimatedHours: number } | null = null;

    if (timeEntry.taskId) {
      const task = await prisma.task.findUnique({
        where: { id: timeEntry.taskId },
        select: { id: true, estimatedHours: true, assignedToProfileId: true },
      });
      if (!task) {
        throw { statusCode: 404, message: 'Task linked to time entry was not found' };
      }
      if (!isAdmin && task.assignedToProfileId && task.assignedToProfileId !== auth.profileId) {
        throw {
          statusCode: 403,
          message: 'You can only log time against tasks assigned to you',
        };
      }
      taskContext = { id: task.id, estimatedHours: Number(task.estimatedHours || 0) };
    }

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

      if (taskContext?.estimatedHours && taskContext.estimatedHours > 0) {
        const loggedTaskHoursResult = await tx.timeEntry.aggregate({
          where: {
            jobId: timeEntry.jobId,
            taskId: taskContext.id,
            employeeProfileId: timeEntry.employeeProfileId,
            status: { in: ['pending', 'submitted', 'approved'] },
            id: { not: timeEntryId },
          },
          _sum: { hours: true },
        });
        const loggedTaskHours = Number(loggedTaskHoursResult._sum.hours || 0);
        if (loggedTaskHours + totalHours > taskContext.estimatedHours) {
          TimeEntryService.throwHardCapExceeded({
            capType: 'task',
            jobId: timeEntry.jobId,
            taskId: taskContext.id,
            availableHours: taskContext.estimatedHours - loggedTaskHours,
            attemptedHours: totalHours,
          });
        }
      }

      if (
        Number.isFinite(effectiveEmployeeAllocation) &&
        effectiveEmployeeAllocation > 0 &&
        loggedEmployeeHours + totalHours > effectiveEmployeeAllocation
      ) {
        TimeEntryService.throwHardCapExceeded({
          capType: 'employee',
          jobId: timeEntry.jobId,
          taskId: timeEntry.taskId,
          availableHours: effectiveEmployeeAllocation - loggedEmployeeHours,
          attemptedHours: totalHours,
        });
      }

      if (
        Number.isFinite(effectiveJobAllocation) &&
        effectiveJobAllocation > 0 &&
        loggedJobHours + totalHours > effectiveJobAllocation
      ) {
        TimeEntryService.throwHardCapExceeded({
          capType: 'job',
          jobId: timeEntry.jobId,
          taskId: timeEntry.taskId,
          availableHours: effectiveJobAllocation - loggedJobHours,
          attemptedHours: totalHours,
        });
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
              startedAt: timeEntry.startedAt,
              endedAt: stoppedAt,
              hours: totalHours,
              billable: finalBillable,
              nonBillableCategory: TimeEntryService.resolveStoredNonBillableCategory(
                finalBillable,
                requestedBillable,
                null,
                timeEntry.nonBillableCategory
              ),
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
              startedAt: timeEntry.startedAt,
              endedAt: stoppedAt,
              hours: billableHours,
              billable: true,
              nonBillableCategory: null,
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
              startedAt: null,
              endedAt: null,
              billable: false,
              nonBillableCategory: NonBillableCategory.over_budget,
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
          startedAt: timeEntry.startedAt,
          endedAt: stoppedAt,
          hours: totalHours,
          description: timeEntry.description,
          billable: finalBillable,
          nonBillableCategory: TimeEntryService.resolveStoredNonBillableCategory(
            finalBillable,
            requestedBillable,
            null,
            timeEntry.nonBillableCategory
          ),
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
    if (!TimeEntryService.isAdminRole(auth.roleName)) {
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
    const roleName = TimeEntryService.normalizeRole(auth.roleName);
    if (!['manager', 'partner', 'super_admin'].includes(roleName)) {
      throw {
        statusCode: 403,
        message: 'Only managers/partners can approve time entries',
      };
    }

    const entriesWithAccessContext = await prisma.timeEntry.findMany({
      where: {
        id: { in: timeEntryIds },
      },
      include: {
        job: {
          select: {
            id: true,
            managerProfileId: true,
            partnerProfileId: true,
          },
        },
        employee: {
          select: {
            id: true,
            managerId: true,
          },
        },
      },
    });

    const isAdmin = TimeEntryService.isAdminRole(roleName);
    if (!isAdmin) {
      const unauthorized = entriesWithAccessContext.filter((entry) => {
        if (roleName === 'partner') {
          return entry.job.partnerProfileId !== auth.profileId;
        }
        return !TimeEntryService.hasScopedManagerAccess(roleName, auth.profileId, {
          jobManagerProfileId: entry.job.managerProfileId,
          employeeManagerId: entry.employee?.managerId,
        });
      });

      if (unauthorized.length > 0) {
        throw {
          statusCode: 403,
          message: 'You do not have permission to approve all these entries',
        };
      }
    }

    const entries = entriesWithAccessContext.filter((entry) => entry.status === 'submitted');

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

    const roleName = TimeEntryService.normalizeRole(auth.roleName);
    const isAdmin = TimeEntryService.isAdminRole(roleName);

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

    const loggedEmployeeHoursResult = await prisma.timeEntry.aggregate({
      where: {
        jobId: input.jobId,
        employeeProfileId: auth.profileId,
        status: { in: ['pending', 'submitted', 'approved'] },
      },
      _sum: { hours: true },
    });

    const currentLoggedHours = Number(loggedEmployeeHoursResult._sum.hours || 0);
    const risk = await TimeEntryService.resolveAdditionalHoursRisk(
      input.jobId,
      auth.profileId,
      Number(input.additionalHours || 0)
    );
    const requestRequiresPartnerApproval = Boolean(risk.wouldExceedFeeCap);

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
          approvalNotes: TimeEntryService.serializeApprovalMetadata(
            {
              requiresPartnerApproval: requestRequiresPartnerApproval,
              managerApproved: false,
              managerApprovedByProfileId: null,
              managerApprovedAt: null,
              partnerApproved: false,
              feeRisk: {
                jobFee: risk.jobFee,
                billingRate: risk.billingRate,
                currentBillableAmount: risk.currentBillableAmount,
                projectedAdditionalCost: risk.projectedAdditionalCost,
                projectedTotalBillable: risk.projectedTotalBillable,
                wouldExceedFeeCap: risk.wouldExceedFeeCap,
                excessCost: risk.excessCost,
              },
            },
            null
          ),
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
            requiresPartnerApproval: requestRequiresPartnerApproval,
            wouldExceedFeeCap: risk.wouldExceedFeeCap,
            projectedAdditionalCost: risk.projectedAdditionalCost,
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
                role: { name: { in: ['gmp'] } },
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
    const requestMessage = requestRequiresPartnerApproval
      ? `A team member requested ${input.additionalHours} more hours for "${job.jobName}". This request may exceed fee cap and needs manager + partner approval.`
      : `A team member requested ${input.additionalHours} more hours for "${job.jobName}". Manager approval is required.`;

    if (job.managerProfileId) {
      await NotificationService.createNotification(
        {
          recipientProfileId: job.managerProfileId,
          type: 'action',
          title: requestTitle,
          message: requestMessage,
          actionRequired: true,
          jobId: job.id,
          link: `/timesheets?tab=approvals&jobId=${job.id}&approvalRequestId=${request.id}`,
        },
        { userId: auth.userId, profileId: auth.profileId, roleName: auth.roleName }
      );
    }

    if (job.partnerProfileId && requestRequiresPartnerApproval) {
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

    return {
      ...request,
      requiresPartnerApproval: requestRequiresPartnerApproval,
      projectedAdditionalCost: risk.projectedAdditionalCost,
      wouldExceedFeeCap: risk.wouldExceedFeeCap,
    };
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

    const roleName = TimeEntryService.normalizeRole(auth.roleName);
    const isElevated =
      TimeEntryService.isAdminRole(roleName) || roleName === 'manager' || roleName === 'partner';

    if (!isElevated) {
      where.employeeProfileId = auth.profileId;
    } else if (filters.employeeProfileId) {
      where.employeeProfileId = filters.employeeProfileId;
    }
    if (roleName === 'manager') {
      where.job = { managerProfileId: auth.profileId };
    }
    if (roleName === 'partner') {
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

    return requests.map((request) => {
      const { meta, note } = TimeEntryService.parseApprovalMetadata(request.approvalNotes);
      return {
        ...request,
        approvalNotes: note,
        requiresPartnerApproval: Boolean(meta.requiresPartnerApproval),
        managerApproved: Boolean(meta.managerApproved),
        pendingPartnerApproval:
          request.status === 'pending' &&
          Boolean(meta.requiresPartnerApproval) &&
          Boolean(meta.managerApproved),
      };
    });
  }

  /**
   * Approve additional hours request
   */
  static async approveApprovalRequest(
    requestId: number,
    approvalNotes: string | undefined,
    auth: AuthContext
  ) {
    const roleName = TimeEntryService.normalizeRole(auth.roleName);
    if (!['manager', 'partner', 'super_admin'].includes(roleName)) {
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
    const isAdmin = TimeEntryService.isAdminRole(roleName);

    if (!isAdmin && !isJobManager && !isJobPartner) {
      throw { statusCode: 403, message: 'Not authorized to approve this request' };
    }

    if (request.status !== 'pending') {
      throw { statusCode: 409, message: 'Only pending requests can be approved' };
    }

    const now = new Date();
    const { meta, note: existingNote } = TimeEntryService.parseApprovalMetadata(
      request.approvalNotes
    );
    const risk = await TimeEntryService.resolveAdditionalHoursRisk(
      request.jobId,
      request.employeeProfileId,
      Number(request.additionalHoursRequested || 0)
    );
    const requiresPartnerApproval = Boolean(
      meta.requiresPartnerApproval ?? risk.wouldExceedFeeCap
    );

    const mergedNote = String(approvalNotes || existingNote || '').trim() || null;

    if (requiresPartnerApproval && !isAdmin && isJobManager && !isJobPartner) {
      // IMPLEMENTED: Additional-time staged approval — manager first stage is recorded, partner must finalize.
      const stagedMeta = {
        ...meta,
        requiresPartnerApproval: true,
        managerApproved: true,
        managerApprovedByProfileId: auth.profileId,
        managerApprovedAt: now.toISOString(),
        partnerApproved: false,
        feeRisk: {
          jobFee: risk.jobFee,
          billingRate: risk.billingRate,
          currentBillableAmount: risk.currentBillableAmount,
          projectedAdditionalCost: risk.projectedAdditionalCost,
          projectedTotalBillable: risk.projectedTotalBillable,
          wouldExceedFeeCap: risk.wouldExceedFeeCap,
          excessCost: risk.excessCost,
        },
      };

      const staged = await prisma.timeEntryApprovalRequest.update({
        where: { id: requestId },
        data: {
          status: 'pending',
          approvedByProfileId: auth.profileId,
          approvedAt: now,
          approvalNotes: TimeEntryService.serializeApprovalMetadata(stagedMeta, mergedNote),
        },
      });

      if (request.job.partnerProfileId) {
        await NotificationService.createNotification(
          {
            recipientProfileId: request.job.partnerProfileId,
            type: 'action',
            title: `Partner approval required: ${request.job.jobName}`,
            message: `Manager approved an additional-hours request that may exceed fee cap for "${request.job.jobName}".`,
            actionRequired: true,
            jobId: request.jobId,
            link: `/partner-dashboard?tab=approvals`,
          },
          { userId: auth.userId, profileId: auth.profileId, roleName: auth.roleName }
        );
      }

      await createAudit({
        action: `approval_request_manager_stage_approved:job_${request.jobId}`,
        entity_type: 'time_entry_approval_request',
        entity_id: request.id,
        user_id: auth.userId,
        metadata: {
          jobId: request.jobId,
          employeeProfileId: request.employeeProfileId,
          approvedByProfileId: auth.profileId,
          requiresPartnerApproval: true,
          approvalNotes: mergedNote,
        },
      });

      return {
        ...staged,
        requiresPartnerApproval: true,
        pendingPartnerApproval: true,
      };
    }

    if (requiresPartnerApproval && !isAdmin) {
      if (!isJobPartner) {
        throw {
          statusCode: 403,
          message: 'Partner approval is required for this additional-hours request',
        };
      }

      const managerApproved = Boolean(meta.managerApproved);
      if (!managerApproved && request.job.managerProfileId && request.job.managerProfileId !== auth.profileId) {
        throw {
          statusCode: 409,
          message: 'Manager approval is required before partner final approval',
        };
      }
    }

    const finalMeta = {
      ...meta,
      requiresPartnerApproval,
      partnerApproved: requiresPartnerApproval ? true : meta.partnerApproved ?? false,
      partnerApprovedByProfileId: requiresPartnerApproval ? auth.profileId : meta.partnerApprovedByProfileId,
      partnerApprovedAt: requiresPartnerApproval ? now.toISOString() : meta.partnerApprovedAt,
      managerApproved: requiresPartnerApproval ? Boolean(meta.managerApproved) : true,
      managerApprovedByProfileId:
        requiresPartnerApproval ? meta.managerApprovedByProfileId : auth.profileId,
      managerApprovedAt:
        requiresPartnerApproval ? meta.managerApprovedAt : now.toISOString(),
      feeRisk: {
        jobFee: risk.jobFee,
        billingRate: risk.billingRate,
        currentBillableAmount: risk.currentBillableAmount,
        projectedAdditionalCost: risk.projectedAdditionalCost,
        projectedTotalBillable: risk.projectedTotalBillable,
        wouldExceedFeeCap: risk.wouldExceedFeeCap,
        excessCost: risk.excessCost,
      },
    };

    const updated = await prisma.timeEntryApprovalRequest.update({
      where: { id: requestId },
      data: {
        status: 'approved',
        approvedByProfileId: auth.profileId,
        approvalNotes: TimeEntryService.serializeApprovalMetadata(finalMeta, mergedNote),
        approvedAt: now,
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
        requiresPartnerApproval,
        approvalNotes: mergedNote,
      },
    });

    await NotificationService.createNotification(
      {
        recipientProfileId: request.employeeProfileId,
        type: 'action',
        title: 'Additional hours approved',
        message: `Your additional hours request for "${request.job.jobName}" was approved. You can continue logging time on this job.`,
        actionRequired: true,
        jobId: request.jobId,
        link: `/timesheets?tab=by-job&jobId=${request.jobId}&approvedRequestId=${request.id}`,
      },
      { userId: auth.userId, profileId: auth.profileId, roleName: auth.roleName }
    );

    return {
      ...updated,
      requiresPartnerApproval,
      pendingPartnerApproval: false,
    };
  }

  /**
   * Reject additional hours request
   */
  static async rejectApprovalRequest(
    requestId: number,
    approvalNotes: string | undefined,
    auth: AuthContext
  ) {
    const roleName = TimeEntryService.normalizeRole(auth.roleName);
    if (!['manager', 'partner', 'super_admin'].includes(roleName)) {
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
    const isAdmin = TimeEntryService.isAdminRole(roleName);

    if (!isAdmin && !isJobManager && !isJobPartner) {
      throw { statusCode: 403, message: 'Not authorized to reject this request' };
    }

    if (request.status !== 'pending') {
      throw { statusCode: 409, message: 'Only pending requests can be rejected' };
    }

    const now = new Date();
    const { meta, note: existingNote } = TimeEntryService.parseApprovalMetadata(
      request.approvalNotes
    );
    const risk = await TimeEntryService.resolveAdditionalHoursRisk(
      request.jobId,
      request.employeeProfileId,
      Number(request.additionalHoursRequested || 0)
    );
    const requiresPartnerApproval = Boolean(
      meta.requiresPartnerApproval ?? risk.wouldExceedFeeCap
    );
    const mergedNote = String(approvalNotes || existingNote || '').trim() || null;

    const rejectionMeta = {
      ...meta,
      requiresPartnerApproval,
      rejectedByProfileId: auth.profileId,
      rejectedAt: now.toISOString(),
      rejectedByRole: roleName,
      feeRisk: {
        jobFee: risk.jobFee,
        billingRate: risk.billingRate,
        currentBillableAmount: risk.currentBillableAmount,
        projectedAdditionalCost: risk.projectedAdditionalCost,
        projectedTotalBillable: risk.projectedTotalBillable,
        wouldExceedFeeCap: risk.wouldExceedFeeCap,
        excessCost: risk.excessCost,
      },
    };

    const updated = await prisma.timeEntryApprovalRequest.update({
      where: { id: requestId },
      data: {
        status: 'rejected',
        approvedByProfileId: auth.profileId,
        approvalNotes: TimeEntryService.serializeApprovalMetadata(rejectionMeta, mergedNote),
        approvedAt: now,
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
        requiresPartnerApproval,
        approvalNotes: mergedNote,
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
    const roleName = TimeEntryService.normalizeRole(auth.roleName);
    if (!['manager', 'partner', 'super_admin'].includes(roleName)) {
      throw { statusCode: 403, message: 'Not authorized to approve over-budget requests' };
    }

    const request = await prisma.timeOverBudgetRequest.findUnique({
      where: { id: requestId },
      include: { job: true },
    });

    if (!request) {
      throw { statusCode: 404, message: 'Over-budget request not found' };
    }

    const isAdmin = TimeEntryService.isAdminRole(roleName);
    const isJobManager = request.job.managerProfileId === auth.profileId;
    const isJobPartner = request.job.partnerProfileId === auth.profileId;
    const canActAsManager = isJobManager || isAdmin;
    const canActAsPartner = isJobPartner || isAdmin;

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

    let nextStatus: 'manager_approved' | 'partner_approved';
    let managerApproved = false;
    let partnerApproved = false;

    if (request.requiresPartnerApproval) {
      if (request.status === 'pending') {
        if (!canActAsManager) {
          throw {
            statusCode: 409,
            message: 'Manager approval is required before partner approval',
          };
        }
        nextStatus = 'manager_approved';
        managerApproved = true;
      } else if (request.status === 'manager_approved') {
        if (!canActAsPartner) {
          throw {
            statusCode: 409,
            message: 'Only partner can finalize approval after manager stage',
          };
        }
        nextStatus = 'partner_approved';
        managerApproved = true;
        partnerApproved = true;
      } else {
        throw { statusCode: 409, message: 'Over-budget request is not in an approvable stage' };
      }
    } else {
      if (request.status !== 'pending') {
        throw { statusCode: 409, message: 'Only pending over-budget requests can be approved' };
      }
      if (!canActAsManager) {
        throw { statusCode: 403, message: 'Manager approval is required for this request' };
      }
      nextStatus = 'partner_approved';
      managerApproved = true;
      partnerApproved = true;
    }

    const updated = await prisma.timeOverBudgetRequest.update({
      where: { id: requestId },
      data: {
        status: nextStatus,
        managerApproved,
        partnerApproved,
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

    if (
      nextStatus === 'manager_approved' &&
      request.requiresPartnerApproval &&
      request.job.partnerProfileId
    ) {
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
          type: 'action',
          title: 'Over-budget request approved',
          message: `Your over-budget request for "${request.job.jobName}" was approved. You can continue logging time on this job.`,
          actionRequired: true,
          jobId: request.job.id,
          link: `/timesheets?tab=by-job&jobId=${request.job.id}`,
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
    const roleName = TimeEntryService.normalizeRole(auth.roleName);
    if (!['manager', 'partner', 'super_admin'].includes(roleName)) {
      throw { statusCode: 403, message: 'Not authorized to reject over-budget requests' };
    }

    const request = await prisma.timeOverBudgetRequest.findUnique({
      where: { id: requestId },
      include: { job: true },
    });

    if (!request) {
      throw { statusCode: 404, message: 'Over-budget request not found' };
    }

    const isAdmin = TimeEntryService.isAdminRole(roleName);
    const isJobManager = request.job.managerProfileId === auth.profileId;
    const isJobPartner = request.job.partnerProfileId === auth.profileId;
    const canActAsManager = isJobManager || isAdmin;
    const canActAsPartner = isJobPartner || isAdmin;

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

    let nextStatus: 'manager_rejected' | 'partner_rejected';

    if (request.requiresPartnerApproval) {
      if (request.status === 'pending') {
        if (!canActAsManager) {
          throw {
            statusCode: 409,
            message: 'Manager decision is required before partner rejection',
          };
        }
        nextStatus = 'manager_rejected';
      } else if (request.status === 'manager_approved') {
        if (!canActAsPartner) {
          throw {
            statusCode: 409,
            message: 'Only partner can reject after manager approval',
          };
        }
        nextStatus = 'partner_rejected';
      } else {
        throw { statusCode: 409, message: 'Over-budget request is not in a rejectable stage' };
      }
    } else {
      if (request.status !== 'pending') {
        throw { statusCode: 409, message: 'Only pending over-budget requests can be rejected' };
      }
      if (!canActAsManager) {
        throw { statusCode: 403, message: 'Manager approval is required for this request' };
      }
      nextStatus = 'manager_rejected';
    }

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
      TimeEntryService.isAdminRole(auth.roleName) ||
      TimeEntryService.hasScopedManagerAccess(auth.roleName, auth.profileId, {
        jobManagerProfileId: job.managerProfileId,
      }) ||
      TimeEntryService.hasPartnerAccess(auth.roleName, auth.profileId, job.partnerProfileId);

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
