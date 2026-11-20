import prisma from "../prisma";
import { NonFinancialPerformanceService } from "./nonFinancialPerformance.service";

export type JobCostingPeriod = "weekly" | "monthly" | "quarterly" | "yearly";

export type JobCostingScope = "self" | "team" | "all";

interface AuthContext {
  userId: number;
  profileId: number;
  roles?: string[];
  roleName?: string | null;
}

interface PeriodRange {
  startDate: Date;
  endDate: Date;
  label: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const roundMoney = (value: number) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const roundHours = (value: number) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const roundPercent = (value: number) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const toUtcDate = (value: Date) =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));

const dateKey = (value: Date) => toUtcDate(value).toISOString().slice(0, 10);

const addUtcDays = (value: Date, days: number) =>
  new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate() + days)
  );

export const resolveCostingPeriod = (
  period: JobCostingPeriod,
  anchor: Date
): PeriodRange => {
  const day = toUtcDate(Number.isNaN(anchor.getTime()) ? new Date() : anchor);
  const year = day.getUTCFullYear();

  if (period === "yearly") {
    return {
      startDate: new Date(Date.UTC(year, 0, 1)),
      endDate: new Date(Date.UTC(year + 1, 0, 1) - 1),
      label: String(year),
    };
  }

  if (period === "weekly") {
    const weekday = day.getUTCDay();
    const diffToMonday = weekday === 0 ? -6 : 1 - weekday;
    const start = addUtcDays(day, diffToMonday);
    return {
      startDate: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())),
      endDate: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 7) - 1),
      label: `${dateKey(start)} to ${dateKey(addUtcDays(start, 6))}`,
    };
  }

  if (period === "monthly") {
    return {
      startDate: new Date(Date.UTC(year, day.getUTCMonth(), 1)),
      endDate: new Date(Date.UTC(year, day.getUTCMonth() + 1, 1) - 1),
      label: `${year}-${String(day.getUTCMonth() + 1).padStart(2, "0")}`,
    };
  }

  const quarter = Math.floor(day.getUTCMonth() / 3);
  const startMonth = quarter * 3;
  return {
    startDate: new Date(Date.UTC(year, startMonth, 1)),
    endDate: new Date(Date.UTC(year, startMonth + 3, 1) - 1),
    label: `${year} Q${quarter + 1}`,
  };
};

const getCompletionAt = async (
  jobId: number,
  date: Date,
  fallbackPercent: number
) => {
  const row = await prisma.jobCompletionHistory.findFirst({
    where: { jobId, recordedAt: { lte: date } },
    // Use id rather than recordedAt so database/server timezone differences
    // cannot reorder updates recorded on the same day.
    orderBy: { id: "desc" },
    select: { completionPercent: true },
  });
  if (row) return Number(row.completionPercent);
  return fallbackPercent;
};

const resolveCostRate = (params: {
  assignment?: {
    role?: { costRate?: unknown } | null;
    roleSnapshot?: unknown;
  } | null;
  employeeRole?: { costRate?: unknown; billingRate?: unknown } | null;
}) => {
  const snapshot = (params.assignment?.roleSnapshot || {}) as Record<string, unknown>;
  return (
    Number(
      params.assignment?.role?.costRate ??
        snapshot.costRate ??
        params.employeeRole?.costRate ??
        params.employeeRole?.billingRate ??
        0
    ) || 0
  );
};

const resolveBillingRate = (profile: {
  role?: { billingRate?: unknown } | null;
}) => Number(profile.role?.billingRate || 0) || 0;

const isHolidayOn = (
  holiday: { holidayDate: Date; isRecurring: boolean },
  day: Date
) => {
  const holidayDate = toUtcDate(new Date(holiday.holidayDate));
  if (holiday.isRecurring) {
    return (
      holidayDate.getUTCMonth() === day.getUTCMonth() &&
      holidayDate.getUTCDate() === day.getUTCDate()
    );
  }
  return dateKey(holidayDate) === dateKey(day);
};

const countWorkingDays = (
  startDate: Date,
  endDate: Date,
  holidays: Array<{ holidayDate: Date; isRecurring: boolean }>
) => {
  let workingDays = 0;
  let cursor = toUtcDate(startDate);
  const last = toUtcDate(endDate);
  while (cursor.getTime() <= last.getTime()) {
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      if (!holidays.some((holiday) => isHolidayOn(holiday, cursor))) {
        workingDays += 1;
      }
    }
    cursor = addUtcDays(cursor, 1);
  }
  return workingDays;
};

export interface JobCostingStaffRow {
  employeeProfileId: number;
  employeeName: string;
  billableHours: number;
  costRate: number;
  billableCost: number;
  costRatioPercent: number;
  allocatedBillables: number;
  surplusShare: number;
  totalReceivable: number;
  collectionRatioPercent: number;
  allocatedCollections: number;
  collectionRatePercent: number;
  chargeOutPerHour: number;
  surplusPerHour: number;
}

export interface JobCostingReport {
  period: JobCostingPeriod;
  label: string;
  startDate: string;
  endDate: string;
  jobId: number;
  jobCode: string | null;
  jobName: string;
  clientName: string | null;
  departmentName: string | null;
  partnerProfileId: number | null;
  partnerName: string | null;
  managerProfileId: number | null;
  currency: string;
  fee: number;
  startCompletionPercent: number;
  endCompletionPercent: number;
  incrementalCompletionPercent: number;
  revenueToAllocate: number;
  cumulativeRevenueToDate: number;
  totalReceivable: number;
  totalBillableHours: number;
  totalBillableCost: number;
  cumulativeBillableCost: number;
  surplusDeficit: number;
  collectionsReceived: number;
  collectionRatePercent: number;
  staff: JobCostingStaffRow[];
}

export interface EmployeePerformanceJobRow {
  jobId: number;
  jobCode: string | null;
  jobName: string;
  clientName: string | null;
  incrementalCompletionPercent: number;
  hours: number;
  allocatedBillables: number;
  totalReceivable: number;
  allocatedCollections: number;
  collectionRatePercent: number;
  surplusShare: number;
}

export interface EmployeeFinancialPerformance {
  profileId: number;
  employeeName: string;
  departmentId: number | null;
  departmentName: string | null;
  partnerProfileId: number | null;
  partnerName: string | null;
  period: JobCostingPeriod;
  label: string;
  startDate: string;
  endDate: string;
  billingRate: number;
  billableTargetPercent: number;
  targetHours: number;
  targetMoney: number;
  allocatedBillables: number;
  totalReceivable: number;
  allocatedCollections: number;
  billableHours: number;
  jobCompletionScore: number;
  collectionScore: number;
  financialScore: number;
  nonFinancialScore: number;
  overallPerformance: number;
  jobs: EmployeePerformanceJobRow[];
}

export interface PerformanceReport {
  period: JobCostingPeriod;
  label: string;
  startDate: string;
  endDate: string;
  scope: JobCostingScope;
  employees: EmployeeFinancialPerformance[];
  totals: {
    employeeCount: number;
    targetMoney: number;
    allocatedBillables: number;
    totalReceivable: number;
    allocatedCollections: number;
    averageJobCompletionScore: number;
    averageCollectionScore: number;
    averageFinancialScore: number;
    averageNonFinancialScore: number;
    averageOverallPerformance: number;
  };
}

const normalizeRoles = (auth: AuthContext) =>
  new Set(
    [auth.roleName, ...(auth.roles || [])]
      .filter(Boolean)
      .map((role) =>
        String(role).trim().toLowerCase().replace(/[\s-]+/g, "_")
      )
  );

const isElevated = (auth: AuthContext) => {
  const roles = normalizeRoles(auth);
  return ["super_admin", "hr", "gmp", "finance"].some((role) =>
    roles.has(role)
  );
};

export class JobCostingService {
  static async recordCompletion(
    jobId: number,
    completionPercent: number,
    note: string | null,
    auth: AuthContext
  ) {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        partnerProfileId: true,
        managerProfileId: true,
      },
    });
    if (!job) {
      throw { statusCode: 404, message: "Job not found" };
    }

    const roles = normalizeRoles(auth);
    const allowed =
      isElevated(auth) ||
      (roles.has("partner") && job.partnerProfileId === auth.profileId) ||
      (roles.has("manager") && job.managerProfileId === auth.profileId);
    if (!allowed) {
      throw {
        statusCode: 403,
        message: "You do not have permission to update this job's completion",
      };
    }

    const percent = Math.min(100, Math.max(0, Number(completionPercent) || 0));
    const updated = await prisma.$transaction(async (tx) => {
      await tx.job.update({
        where: { id: jobId },
        data: { completionPercent: percent },
      });
      await tx.jobCompletionHistory.create({
        data: {
          jobId,
          completionPercent: percent,
          recordedByProfileId: auth.profileId || null,
          note: note ? String(note).trim() : null,
        },
      });
      return tx.job.findUnique({
        where: { id: jobId },
        select: {
          id: true,
          jobCode: true,
          jobName: true,
          completionPercent: true,
          status: true,
        },
      });
    });

    return updated;
  }

  static async getJobReport(
    jobId: number,
    period: JobCostingPeriod,
    anchor: Date,
    rangeOverride?: { startDate: Date; endDate: Date }
  ): Promise<JobCostingReport> {
    const range: PeriodRange = rangeOverride
      ? {
          startDate: toUtcDate(rangeOverride.startDate),
          endDate: rangeOverride.endDate,
          label: `${dateKey(rangeOverride.startDate)} to ${dateKey(rangeOverride.endDate)}`,
        }
      : resolveCostingPeriod(period, anchor);

    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        client: { select: { clientName: true } },
        department: { select: { name: true } },
        partner: { select: { id: true, firstName: true, lastName: true } },
        jobCosting: { select: { jobFee: true } },
        staffing: {
          select: {
            employeeProfileId: true,
            role: { select: { costRate: true, billingRate: true } },
            roleSnapshot: true,
          },
        },
        timeEntries: {
          where: {
            status: "approved",
            billable: true,
            dateWorked: { gte: range.startDate, lte: range.endDate },
          },
          select: {
            employeeProfileId: true,
            hours: true,
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                role: { select: { costRate: true, billingRate: true } },
              },
            },
          },
        },
        payments: {
          where: { paymentDate: { gte: range.startDate, lte: range.endDate } },
          select: { paymentAmount: true },
        },
      },
    });

    if (!job) {
      throw { statusCode: 404, message: "Job not found" };
    }

    const fee = Number(job.jobCosting?.jobFee ?? job.fixedFeeAmount ?? 0);
    const startCompletionPercent = await getCompletionAt(
      jobId,
      range.startDate,
      0
    );
    const endCompletionPercent = await getCompletionAt(
      jobId,
      range.endDate,
      Number(job.completionPercent || 0)
    );
    const incrementalCompletionPercent = Math.max(
      0,
      endCompletionPercent - startCompletionPercent
    );
    const revenueToAllocate = roundMoney(
      fee * (incrementalCompletionPercent / 100)
    );

    const assignmentMap = new Map(
      job.staffing.map((assignment) => [
        assignment.employeeProfileId,
        assignment,
      ])
    );

    const cumulativeEntries = await prisma.timeEntry.findMany({
      where: {
        jobId,
        status: "approved",
        billable: true,
        dateWorked: { lte: range.endDate },
      },
      select: {
        employeeProfileId: true,
        hours: true,
        employee: {
          select: {
            firstName: true,
            lastName: true,
            role: { select: { costRate: true, billingRate: true } },
          },
        },
      },
    });

    type StaffAggregate = {
      employeeProfileId: number;
      employeeName: string;
      hours: number;
      costRate: number;
    };

    const addEntry = (map: Map<number, StaffAggregate>, entry: any) => {
      const hours = Number(entry.hours || 0);
      if (!Number.isFinite(hours) || hours <= 0) return;
      const existing = map.get(entry.employeeProfileId);
      if (existing) {
        existing.hours += hours;
        return;
      }
      const assignment = assignmentMap.get(entry.employeeProfileId) || null;
      const costRate = resolveCostRate({
        assignment,
        employeeRole: entry.employee?.role,
      });
      map.set(entry.employeeProfileId, {
        employeeProfileId: entry.employeeProfileId,
        employeeName:
          `${entry.employee?.firstName || ""} ${entry.employee?.lastName || ""}`.trim() ||
          `Employee ${entry.employeeProfileId}`,
        hours,
        costRate,
      });
    };

    const periodStaffMap = new Map<number, StaffAggregate>();
    const cumulativeStaffMap = new Map<number, StaffAggregate>();
    job.timeEntries.forEach((entry) => addEntry(periodStaffMap, entry));
    cumulativeEntries.forEach((entry) => addEntry(cumulativeStaffMap, entry));

    const periodStaffBase = Array.from(periodStaffMap.values());
    const cumulativeStaffBase = Array.from(cumulativeStaffMap.values());
    const totalBillableHours = roundHours(
      periodStaffBase.reduce((sum, item) => sum + item.hours, 0)
    );
    const totalBillableCost = roundMoney(
      periodStaffBase.reduce((sum, item) => sum + item.hours * item.costRate, 0)
    );
    const cumulativeBillableCost = roundMoney(
      cumulativeStaffBase.reduce((sum, item) => sum + item.hours * item.costRate, 0)
    );
    const surplusDeficit = roundMoney(revenueToAllocate - totalBillableCost);
    const collectionsReceived = roundMoney(
      job.payments.reduce(
        (sum, payment) => sum + Number(payment.paymentAmount || 0),
        0
      )
    );

    const cumulativeRevenueToDate = roundMoney(
      fee * (Math.max(0, endCompletionPercent) / 100)
    );
    const totalReceivable = cumulativeRevenueToDate;

    const profileIds = new Set([
      ...periodStaffMap.keys(),
      ...cumulativeStaffMap.keys(),
    ]);

    const staff: JobCostingStaffRow[] = Array.from(profileIds)
      .map((profileId) => {
        const period = periodStaffMap.get(profileId);
        const cumulative = cumulativeStaffMap.get(profileId);
        const periodHours = period?.hours || 0;
        const periodCost = periodHours * (period?.costRate || 0);
        const periodCostRatio =
          totalBillableCost > 0 ? periodCost / totalBillableCost : 0;
        const cumulativeCost = cumulative
          ? cumulative.hours * cumulative.costRate
          : 0;
        const cumulativeCostRatio =
          cumulativeBillableCost > 0 ? cumulativeCost / cumulativeBillableCost : 0;
        const cumulativeReceivable = roundMoney(
          cumulativeRevenueToDate * cumulativeCostRatio
        );
        const allocatedBillables = roundMoney(revenueToAllocate * periodCostRatio);
        const surplusShare = roundMoney(surplusDeficit * periodCostRatio);
        // Collections are allocated on the cumulative receivable ratio so
        // collections received after completion still reach the right staff.
        const allocatedCollections =
          cumulativeRevenueToDate > 0 && cumulativeReceivable > 0
            ? roundMoney(
                collectionsReceived *
                  (cumulativeReceivable / cumulativeRevenueToDate)
              )
            : 0;
        const collectionRate =
          cumulativeReceivable > 0
            ? (allocatedCollections / cumulativeReceivable) * 100
            : 0;
        const chargeOutPerHour =
          periodHours > 0
            ? (allocatedBillables + allocatedCollections) / periodHours
            : 0;
        const costRate = period?.costRate ?? cumulative?.costRate ?? 0;

        return {
          employeeProfileId: profileId,
          employeeName:
            period?.employeeName || cumulative?.employeeName || `Employee ${profileId}`,
          billableHours: roundHours(periodHours),
          costRate: roundMoney(costRate),
          billableCost: roundMoney(periodCost),
          costRatioPercent: roundPercent(periodCostRatio * 100),
          allocatedBillables,
          surplusShare,
          totalReceivable: cumulativeReceivable,
          collectionRatioPercent: roundPercent(cumulativeCostRatio * 100),
          allocatedCollections,
          collectionRatePercent: roundPercent(collectionRate),
          chargeOutPerHour: roundMoney(chargeOutPerHour),
          surplusPerHour: roundMoney(chargeOutPerHour - costRate),
        };
      })
      .sort((a, b) => b.allocatedBillables - a.allocatedBillables);

    return {
      period,
      label: range.label,
      startDate: range.startDate.toISOString(),
      endDate: range.endDate.toISOString(),
      jobId: job.id,
      jobCode: job.jobCode,
      jobName: job.jobName,
      clientName: job.client?.clientName ?? null,
      departmentName: job.department?.name ?? null,
      partnerProfileId: job.partnerProfileId,
      partnerName: job.partner
        ? `${job.partner.firstName} ${job.partner.lastName}`.trim()
        : null,
      managerProfileId: job.managerProfileId,
      currency: job.currency || "KES",
      fee: roundMoney(fee),
      startCompletionPercent: roundPercent(startCompletionPercent),
      endCompletionPercent: roundPercent(endCompletionPercent),
      incrementalCompletionPercent: roundPercent(incrementalCompletionPercent),
      revenueToAllocate,
      cumulativeRevenueToDate,
      totalReceivable,
      totalBillableHours,
      totalBillableCost,
      cumulativeBillableCost,
      surplusDeficit,
      collectionsReceived,
      collectionRatePercent:
        cumulativeRevenueToDate > 0
          ? roundPercent((collectionsReceived / cumulativeRevenueToDate) * 100)
          : 0,
      staff,
    };
  }

  static async listJobReports(
    period: JobCostingPeriod,
    anchor: Date,
    auth: AuthContext
  ) {
    const range = resolveCostingPeriod(period, anchor);
    const roles = normalizeRoles(auth);

    const activityOr = [
      {
        timeEntries: {
          some: {
            status: "approved",
            billable: true,
            dateWorked: { gte: range.startDate, lte: range.endDate },
          },
        },
      },
      {
        completionHistory: {
          some: {
            recordedAt: { gte: range.startDate, lte: range.endDate },
            completionPercent: { gt: 0 },
          },
        },
      },
      {
        payments: {
          some: { paymentDate: { gte: range.startDate, lte: range.endDate } },
        },
      },
    ];

    const andConditions: Record<string, unknown>[] = [{ OR: activityOr }];

    if (!isElevated(auth)) {
      if (roles.has("partner")) {
        andConditions.push({ partnerProfileId: auth.profileId });
      } else if (roles.has("manager")) {
        andConditions.push({ managerProfileId: auth.profileId });
      } else {
        andConditions.push({
          timeEntries: {
            some: {
              status: "approved",
              billable: true,
              employeeProfileId: auth.profileId,
              dateWorked: { lte: range.endDate },
            },
          },
        });
      }
    }

    const jobs = await prisma.job.findMany({
      where: { AND: andConditions } as any,
      select: { id: true },
      orderBy: { jobName: "asc" },
    });

    return Promise.all(
      jobs.map((job) => JobCostingService.getJobReport(job.id, period, anchor))
    );
  }

  static async getEmployeePerformance(
    profileId: number,
    period: JobCostingPeriod,
    anchor: Date
  ): Promise<EmployeeFinancialPerformance> {
    const range = resolveCostingPeriod(period, anchor);

    const profile = await prisma.profile.findUnique({
      where: { id: profileId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        departmentId: true,
        department: { select: { id: true, name: true, partnerProfileId: true } },
        standardDailyHours: true,
        billableTargetPercent: true,
        role: { select: { billingRate: true, costRate: true } },
      },
    });

    if (!profile) {
      throw { statusCode: 404, message: "Profile not found" };
    }

    const [holidays, leaveSegments, jobsWithTime] = await Promise.all([
      prisma.publicHoliday.findMany({
        select: { holidayDate: true, isRecurring: true },
      }),
      prisma.leaveRequestSegment.findMany({
        where: {
          leaveDate: { gte: range.startDate, lte: range.endDate },
          syncStatus: { not: "voided" },
          leaveRequest: { employeeProfileId: profileId, status: "approved" },
        },
        select: { hours: true },
      }),
      prisma.job.findMany({
        where: {
          timeEntries: {
            some: {
              employeeProfileId: profileId,
              status: "approved",
              billable: true,
              dateWorked: { lte: range.endDate },
            },
          },
        },
        select: { id: true },
      }),
    ]);

    const jobReports = await Promise.all(
      jobsWithTime.map((job) =>
        JobCostingService.getJobReport(job.id, period, anchor)
      )
    );

    const jobRows: EmployeePerformanceJobRow[] = [];
    jobReports.forEach((report) => {
      const staffRow = report.staff.find(
        (row) => row.employeeProfileId === profileId
      );
      if (!staffRow) return;
      jobRows.push({
        jobId: report.jobId,
        jobCode: report.jobCode,
        jobName: report.jobName,
        clientName: report.clientName,
        incrementalCompletionPercent: report.incrementalCompletionPercent,
        hours: staffRow.billableHours,
        allocatedBillables: staffRow.allocatedBillables,
        totalReceivable: staffRow.totalReceivable,
        allocatedCollections: staffRow.allocatedCollections,
        collectionRatePercent: staffRow.collectionRatePercent,
        surplusShare: staffRow.surplusShare,
      });
    });

    const allocatedBillables = roundMoney(
      jobRows.reduce((sum, row) => sum + row.allocatedBillables, 0)
    );
    const totalReceivable = roundMoney(
      jobRows.reduce((sum, row) => sum + row.totalReceivable, 0)
    );
    const allocatedCollections = roundMoney(
      jobRows.reduce((sum, row) => sum + row.allocatedCollections, 0)
    );
    const billableHours = roundHours(
      jobRows.reduce((sum, row) => sum + row.hours, 0)
    );

    const workingDays = countWorkingDays(
      range.startDate,
      range.endDate,
      holidays
    );
    const leaveHours = leaveSegments.reduce(
      (sum, segment) => sum + Number(segment.hours || 0),
      0
    );
    const standardDailyHours = Number(profile.standardDailyHours || 8) || 8;
    const billableTargetPercent =
      Number(profile.billableTargetPercent || 0) || 80;
    const availableHours = Math.max(
      0,
      workingDays * standardDailyHours - leaveHours
    );
    const targetHours = roundHours(
      availableHours * (billableTargetPercent / 100)
    );
    const billingRate = resolveBillingRate(profile);
    const targetMoney = roundMoney(targetHours * billingRate);

    const jobCompletionScore =
      targetMoney > 0 ? (allocatedBillables / targetMoney) * 100 : 0;
    const collectionScore =
      totalReceivable > 0 ? (allocatedCollections / totalReceivable) * 100 : 0;
    const financialScore =
      jobCompletionScore * 0.5 + collectionScore * 0.5;

    let nonFinancialScore = 0;
    try {
      const scores =
        await new NonFinancialPerformanceService().calculateNonFinancialScores(
          profileId,
          undefined,
          range.startDate,
          range.endDate
        );
      nonFinancialScore = Number(scores.overallNonFinancialScore || 0);
    } catch {
      nonFinancialScore = 0;
    }

    const overallPerformance =
      financialScore * 0.7 + nonFinancialScore * 0.3;

    const partnerProfileId = profile.department?.partnerProfileId ?? null;
    let partnerName: string | null = null;
    if (partnerProfileId) {
      const partner = await prisma.profile.findUnique({
        where: { id: partnerProfileId },
        select: { firstName: true, lastName: true },
      });
      partnerName = partner
        ? `${partner.firstName} ${partner.lastName}`.trim()
        : null;
    }

    return {
      profileId: profile.id,
      employeeName:
        `${profile.firstName || ""} ${profile.lastName || ""}`.trim(),
      departmentId: profile.departmentId ?? null,
      departmentName: profile.department?.name ?? null,
      partnerProfileId,
      partnerName,
      period,
      label: range.label,
      startDate: range.startDate.toISOString(),
      endDate: range.endDate.toISOString(),
      billingRate: roundMoney(billingRate),
      billableTargetPercent: roundPercent(billableTargetPercent),
      targetHours,
      targetMoney,
      allocatedBillables,
      totalReceivable,
      allocatedCollections,
      billableHours,
      jobCompletionScore: roundPercent(jobCompletionScore),
      collectionScore: roundPercent(collectionScore),
      financialScore: roundPercent(financialScore),
      nonFinancialScore: roundPercent(nonFinancialScore),
      overallPerformance: roundPercent(overallPerformance),
      jobs: jobRows.sort((a, b) => b.allocatedBillables - a.allocatedBillables),
    };
  }

  private static async resolveScopedProfileIds(
    auth: AuthContext,
    scope: JobCostingScope,
    profileId?: number | null
  ) {
    if (profileId) {
      const allowed = await JobCostingService.canViewProfile(profileId, auth);
      if (!allowed) {
        throw {
          statusCode: 403,
          message: "You do not have permission to view this performance",
        };
      }
      return [profileId];
    }

    if (scope === "self") {
      return [auth.profileId];
    }

    const roles = normalizeRoles(auth);
    if (isElevated(auth)) {
      const profiles = await prisma.profile.findMany({
        where: { status: "active" },
        select: { id: true },
      });
      return profiles.map((profile) => profile.id);
    }

    if (roles.has("partner")) {
      const departments = await prisma.department.findMany({
        where: { partnerProfileId: auth.profileId },
        select: { id: true },
      });
      const profiles = await prisma.profile.findMany({
        where: {
          status: "active",
          departmentId: { in: departments.map((department) => department.id) },
        },
        select: { id: true },
      });
      return profiles.map((profile) => profile.id);
    }

    if (roles.has("manager")) {
      const reports = await prisma.profile.findMany({
        where: { managerId: auth.profileId, status: "active" },
        select: { id: true },
      });
      return Array.from(
        new Set([auth.profileId, ...reports.map((profile) => profile.id)])
      );
    }

    return [auth.profileId];
  }

  static async assertCanViewJob(jobId: number, auth: AuthContext) {
    if (isElevated(auth)) return;

    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { partnerProfileId: true, managerProfileId: true },
    });
    if (!job) {
      throw { statusCode: 404, message: "Job not found" };
    }

    const roles = normalizeRoles(auth);
    if (roles.has("partner") && job.partnerProfileId === auth.profileId) return;
    if (roles.has("manager") && job.managerProfileId === auth.profileId) return;

    const hasTime = await prisma.timeEntry.count({
      where: {
        jobId,
        employeeProfileId: auth.profileId,
        status: "approved",
        billable: true,
      },
    });
    if (hasTime > 0) return;

    throw {
      statusCode: 403,
      message: "You do not have permission to view this job costing report",
    };
  }

  static async canViewProfile(profileId: number, auth: AuthContext) {
    if (profileId === auth.profileId) return true;
    if (isElevated(auth)) return true;

    const roles = normalizeRoles(auth);
    const target = await prisma.profile.findUnique({
      where: { id: profileId },
      select: { managerId: true, department: { select: { partnerProfileId: true } } },
    });
    if (!target) return false;

    if (roles.has("manager") && target.managerId === auth.profileId) return true;
    if (
      roles.has("partner") &&
      target.department?.partnerProfileId === auth.profileId
    ) {
      return true;
    }
    return false;
  }

  static async getPerformanceReport(
    period: JobCostingPeriod,
    anchor: Date,
    auth: AuthContext,
    options?: { scope?: JobCostingScope; profileId?: number | null }
  ): Promise<PerformanceReport> {
    const range = resolveCostingPeriod(period, anchor);
    const scope = options?.scope || "self";
    const profileIds = await JobCostingService.resolveScopedProfileIds(
      auth,
      scope,
      options?.profileId
    );

    const employees = await Promise.all(
      profileIds.map((profileId) =>
        JobCostingService.getEmployeePerformance(profileId, period, anchor)
      )
    );

    const average = (values: number[]) =>
      values.length
        ? roundPercent(
            values.reduce((sum, value) => sum + value, 0) / values.length
          )
        : 0;

    return {
      period,
      label: range.label,
      startDate: range.startDate.toISOString(),
      endDate: range.endDate.toISOString(),
      scope,
      employees: employees.sort(
        (a, b) => b.overallPerformance - a.overallPerformance
      ),
      totals: {
        employeeCount: employees.length,
        targetMoney: roundMoney(
          employees.reduce((sum, employee) => sum + employee.targetMoney, 0)
        ),
        allocatedBillables: roundMoney(
          employees.reduce(
            (sum, employee) => sum + employee.allocatedBillables,
            0
          )
        ),
        totalReceivable: roundMoney(
          employees.reduce((sum, employee) => sum + employee.totalReceivable, 0)
        ),
        allocatedCollections: roundMoney(
          employees.reduce(
            (sum, employee) => sum + employee.allocatedCollections,
            0
          )
        ),
        averageJobCompletionScore: average(
          employees.map((employee) => employee.jobCompletionScore)
        ),
        averageCollectionScore: average(
          employees.map((employee) => employee.collectionScore)
        ),
        averageFinancialScore: average(
          employees.map((employee) => employee.financialScore)
        ),
        averageNonFinancialScore: average(
          employees.map((employee) => employee.nonFinancialScore)
        ),
        averageOverallPerformance: average(
          employees.map((employee) => employee.overallPerformance)
        ),
      },
    };
  }
}

export default JobCostingService;
