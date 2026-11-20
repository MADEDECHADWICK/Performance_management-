import prisma from "../prisma";
import { JobCostingService, type JobCostingPeriod } from "./jobCosting.service";

export type PerformancePeriod = "weekly" | "monthly" | "quarterly" | "yearly";
export type PerformanceScope = "self" | "department" | "partner" | "firm";
export type PerformanceStatus = "on_track" | "at_risk" | "off_track";

interface AuthContext {
  userId: number;
  profileId: number;
  roles?: string[];
  roleName?: string | null;
}

interface PerformanceProfile {
  id: number;
  firstName: string;
  lastName: string;
  employeeId: string | null;
  positionTitle: string | null;
  departmentId: number | null;
  standardDailyHours: unknown;
  billableTargetPercent: unknown;
  role: { name: string; billingRate: unknown } | null;
  department: {
    id: number;
    name: string;
    partnerProfileId: number | null;
    partner: { id: number; firstName: string; lastName: string } | null;
  } | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const roundHours = (value: number) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const roundMoney = (value: number) =>
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

const normalizeRoles = (auth: AuthContext) =>
  new Set(
    [auth.roleName, ...(auth.roles || [])]
      .filter(Boolean)
      .map((role) =>
        String(role).trim().toLowerCase().replace(/[\s-]+/g, "_")
      )
  );

const resolvePeriodRange = (period: PerformancePeriod, anchor: Date) => {
  const day = toUtcDate(Number.isNaN(anchor.getTime()) ? new Date() : anchor);
  const year = day.getUTCFullYear();

  if (period === "weekly") {
    const weekday = day.getUTCDay();
    const diffToMonday = weekday === 0 ? -6 : 1 - weekday;
    const start = addUtcDays(day, diffToMonday);
    return {
      startDate: toUtcDate(start),
      endDate: new Date(toUtcDate(start).getTime() + 7 * DAY_MS - 1),
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

  if (period === "quarterly") {
    const quarter = Math.floor(day.getUTCMonth() / 3);
    return {
      startDate: new Date(Date.UTC(year, quarter * 3, 1)),
      endDate: new Date(Date.UTC(year, quarter * 3 + 3, 1) - 1),
      label: `${year} Q${quarter + 1}`,
    };
  }

  return {
    startDate: new Date(Date.UTC(year, 0, 1)),
    endDate: new Date(Date.UTC(year + 1, 0, 1) - 1),
    label: String(year),
  };
};

const resolveReportRange = (options: {
  period: PerformancePeriod;
  anchorDate: Date;
  dateFrom?: Date;
  dateTo?: Date;
}) => {
  const base = resolvePeriodRange(options.period, options.anchorDate);
  if (!options.dateFrom && !options.dateTo) return base;

  const startDate = options.dateFrom
    ? toUtcDate(options.dateFrom)
    : base.startDate;
  const endDate = options.dateTo
    ? new Date(toUtcDate(options.dateTo).getTime() + DAY_MS - 1)
    : base.endDate;

  if (startDate.getTime() > endDate.getTime()) {
    return { startDate: endDate, endDate, label: dateKey(endDate) };
  }

  return {
    startDate,
    endDate,
    label: `${dateKey(startDate)} to ${dateKey(endDate)}`,
  };
};

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

const resolveStatus = (achievement: number): PerformanceStatus => {
  if (achievement >= 100) return "on_track";
  if (achievement >= 85) return "at_risk";
  return "off_track";
};

export interface IndividualPerformanceRow {
  profileId: number;
  name: string;
  employeeNumber: string | null;
  departmentId: number | null;
  departmentName: string | null;
  partnerProfileId: number | null;
  partnerName: string | null;
  staffLevel: string;
  staffRate: number;
  expectedBillableThreshold: number;
  expectedTotalTime: number;
  expectedBillableTime: number;
  expectedBillableTarget: number;
  actualBillableTime: number;
  nonBillableTime: number;
  total: number;
  achievedBillableAmount: number;
  billableAchievement: number;
  utilization: number;
  collections: number;
  status: PerformanceStatus;
}

export interface DepartmentPerformanceRow {
  departmentId: number;
  name: string;
  partnerProfileId: number | null;
  partnerName: string | null;
  expectedBillableTarget: number;
  actualBillableAmount: number;
  collections: number;
  utilizationRate: number;
  collectionsEfficiency: number;
  collectionsVsTarget: number;
  staffMeetingTargets: number;
  staffBelowTargets: number;
  staffAboveTargets: number;
  totalStaff: number;
  staffPctBelowTargets: number;
  staffPctAboveTargets: number;
}

export interface PerformanceTrendBucket {
  key: string;
  label: string;
  startDate: string;
  endDate: string;
  expectedTarget: number;
  billableAmount: number;
  collections: number;
  utilization: number;
  collectionsEfficiency: number;
}

export interface PerformanceTrend {
  granularity: "daily" | "monthly";
  buckets: PerformanceTrendBucket[];
}

export interface PerformanceReport {
  period: PerformancePeriod;
  label: string;
  startDate: string;
  endDate: string;
  workingDays: number;
  holidayDays: number;
  scope: PerformanceScope;
  scopeLabel: string;
  canViewDepartments: boolean;
  individuals: IndividualPerformanceRow[];
  departments: DepartmentPerformanceRow[];
  totals: {
    expectedBillableTarget: number;
    actualBillableAmount: number;
    collections: number;
    utilizationRate: number;
    staffMeetingTargets: number;
    staffBelowTargets: number;
    totalStaff: number;
    staffPctBelowTargets: number;
    staffPctAboveTargets: number;
  };
  trend: PerformanceTrend;
}

export type PerformanceTrendGranularity = "weekly" | "monthly" | "yearly";

export interface DepartmentTrendPoint {
  departmentId: number;
  expectedTarget: number;
  billableAmount: number;
  collections: number;
  utilization: number;
  collectionsEfficiency: number;
}

export interface DepartmentTrendBucket {
  key: string;
  label: string;
  startDate: string;
  endDate: string;
  departments: DepartmentTrendPoint[];
}

export interface DepartmentTrendsReport {
  granularity: PerformanceTrendGranularity;
  scope: PerformanceScope;
  scopeLabel: string;
  canViewDepartments: boolean;
  departments: Array<{ departmentId: number; name: string }>;
  buckets: DepartmentTrendBucket[];
}

const TREND_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const buildTrendBuckets = (
  granularity: PerformanceTrendGranularity,
  anchor: Date,
  count: number
) => {
  const day = toUtcDate(Number.isNaN(anchor.getTime()) ? new Date() : anchor);
  const year = day.getUTCFullYear();
  const month = day.getUTCMonth();
  const buckets: Array<{
    key: string;
    label: string;
    startDate: Date;
    endDate: Date;
  }> = [];

  if (granularity === "weekly") {
    const weekday = day.getUTCDay();
    const diffToMonday = weekday === 0 ? -6 : 1 - weekday;
    const currentWeekStart = addUtcDays(day, diffToMonday);
    for (let offset = count - 1; offset >= 0; offset -= 1) {
      const start = addUtcDays(currentWeekStart, -7 * offset);
      const end = addUtcDays(start, 6);
      buckets.push({
        key: dateKey(start),
        label: `${start.getUTCDate()} ${TREND_MONTHS[start.getUTCMonth()]}`,
        startDate: start,
        endDate: end,
      });
    }
    return buckets;
  }

  if (granularity === "monthly") {
    for (let offset = count - 1; offset >= 0; offset -= 1) {
      const start = new Date(Date.UTC(year, month - offset, 1));
      const end = new Date(Date.UTC(year, month - offset + 1, 0));
      buckets.push({
        key: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`,
        label: `${TREND_MONTHS[start.getUTCMonth()]} ${start.getUTCFullYear()}`,
        startDate: start,
        endDate: end,
      });
    }
    return buckets;
  }

  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const start = new Date(Date.UTC(year - offset, 0, 1));
    const end = new Date(Date.UTC(year - offset, 11, 31));
    buckets.push({
      key: String(start.getUTCFullYear()),
      label: String(start.getUTCFullYear()),
      startDate: start,
      endDate: end,
    });
  }
  return buckets;
};

const trendScopeLabel = (scope: PerformanceScope) =>
  scope === "self"
    ? "My performance"
    : scope === "department"
      ? "My department"
      : scope === "partner"
        ? "Partner team"
        : "Firm-wide";

const TREND_DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const buildDailyTrendBuckets = (range: {
  startDate: Date;
  endDate: Date;
}) => {
  const buckets: Array<{
    key: string;
    label: string;
    startDate: Date;
    endDate: Date;
  }> = [];
  let cursor = toUtcDate(range.startDate);
  const last = toUtcDate(range.endDate);
  while (cursor.getTime() <= last.getTime()) {
    buckets.push({
      key: dateKey(cursor),
      label: `${TREND_DAY_NAMES[cursor.getUTCDay()]} ${cursor.getUTCDate()}`,
      startDate: cursor,
      endDate: cursor,
    });
    cursor = addUtcDays(cursor, 1);
  }
  return buckets;
};

const buildMonthlyTrendBuckets = (range: {
  startDate: Date;
  endDate: Date;
}) => {
  const buckets: Array<{
    key: string;
    label: string;
    startDate: Date;
    endDate: Date;
  }> = [];
  const startRange = toUtcDate(range.startDate);
  const endRange = toUtcDate(range.endDate);
  let cursor = new Date(
    Date.UTC(startRange.getUTCFullYear(), startRange.getUTCMonth(), 1)
  );

  while (cursor.getTime() <= endRange.getTime()) {
    const monthStart = new Date(
      Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1)
    );
    const monthEnd = new Date(
      Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)
    );
    const start =
      monthStart.getTime() < startRange.getTime() ? startRange : monthStart;
    const end = monthEnd.getTime() > endRange.getTime() ? endRange : monthEnd;
    buckets.push({
      key: `${cursor.getUTCFullYear()}-${String(
        cursor.getUTCMonth() + 1
      ).padStart(2, "0")}`,
      label: `${TREND_MONTHS[cursor.getUTCMonth()]} ${cursor.getUTCFullYear()}`,
      startDate: start,
      endDate: end,
    });
    cursor = new Date(
      Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1)
    );
  }

  return buckets;
};

export class PerformanceReportService {
  private static resolveScope(auth: AuthContext): PerformanceScope {
    const roles = normalizeRoles(auth);
    if (["super_admin", "hr", "gmp", "finance"].some((role) => roles.has(role))) {
      return "firm";
    }
    if (roles.has("partner")) return "partner";
    if (roles.has("manager")) return "department";
    return "self";
  }

  private static async resolveProfiles(
    auth: AuthContext,
    scope: PerformanceScope
  ): Promise<PerformanceProfile[]> {
    if (scope === "self") {
      return prisma.profile.findMany({
        where: { id: auth.profileId, status: "active" },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeId: true,
          positionTitle: true,
          departmentId: true,
          standardDailyHours: true,
          billableTargetPercent: true,
          role: { select: { name: true, billingRate: true } },
          department: {
            select: {
              id: true,
              name: true,
              partnerProfileId: true,
              partner: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
      });
    }

    if (scope === "department") {
      const me = await prisma.profile.findUnique({
        where: { id: auth.profileId },
        select: { departmentId: true },
      });
      if (!me?.departmentId) {
        return this.resolveProfiles(auth, "self");
      }
      return prisma.profile.findMany({
        where: {
          status: "active",
          OR: [{ id: auth.profileId }, { departmentId: me.departmentId }],
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeId: true,
          positionTitle: true,
          departmentId: true,
          standardDailyHours: true,
          billableTargetPercent: true,
          role: { select: { name: true, billingRate: true } },
          department: {
            select: {
              id: true,
              name: true,
              partnerProfileId: true,
              partner: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
      });
    }

    if (scope === "partner") {
      const departments = await prisma.department.findMany({
        where: { partnerProfileId: auth.profileId },
        select: { id: true },
      });
      const departmentIds = departments.map((department) => department.id);
      return prisma.profile.findMany({
        where: {
          status: "active",
          OR: [
            { id: auth.profileId },
            { departmentId: { in: departmentIds } },
          ],
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeId: true,
          positionTitle: true,
          departmentId: true,
          standardDailyHours: true,
          billableTargetPercent: true,
          role: { select: { name: true, billingRate: true } },
          department: {
            select: {
              id: true,
              name: true,
              partnerProfileId: true,
              partner: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
      });
    }

    return prisma.profile.findMany({
      where: { status: "active" },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeId: true,
        positionTitle: true,
        departmentId: true,
        standardDailyHours: true,
        billableTargetPercent: true,
        role: { select: { name: true, billingRate: true } },
        department: {
          select: {
            id: true,
            name: true,
            partnerProfileId: true,
            partner: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });
  }

  private static async buildTrend(
    auth: AuthContext,
    options: { period: PerformancePeriod; includeTrend?: boolean },
    range: { startDate: Date; endDate: Date }
  ): Promise<PerformanceTrend> {
    if (options.includeTrend === false || options.period === "monthly") {
      return { granularity: "monthly", buckets: [] };
    }

    const buckets =
      options.period === "weekly"
        ? buildDailyTrendBuckets(range)
        : buildMonthlyTrendBuckets(range);

    const results = await Promise.all(
      buckets.map(async (bucket) => {
        const startDate = bucket.startDate.toISOString();
        const endDate = new Date(
          bucket.endDate.getTime() + DAY_MS - 1
        ).toISOString();
        try {
          const report = await PerformanceReportService.getReport(auth, {
            period: options.period,
            anchorDate: bucket.startDate,
            dateFrom: bucket.startDate,
            dateTo: bucket.endDate,
            includeTrend: false,
          });
          const totals = report.totals;
          return {
            key: bucket.key,
            label: bucket.label,
            startDate,
            endDate,
            expectedTarget: totals.expectedBillableTarget,
            billableAmount: totals.actualBillableAmount,
            collections: totals.collections,
            utilization:
              totals.expectedBillableTarget > 0
                ? roundPercent(
                    (totals.actualBillableAmount /
                      totals.expectedBillableTarget) *
                      100
                  )
                : 0,
            collectionsEfficiency:
              totals.actualBillableAmount > 0
                ? roundPercent(
                    (totals.collections / totals.actualBillableAmount) * 100
                  )
                : 0,
          };
        } catch {
          return {
            key: bucket.key,
            label: bucket.label,
            startDate,
            endDate,
            expectedTarget: 0,
            billableAmount: 0,
            collections: 0,
            utilization: 0,
            collectionsEfficiency: 0,
          };
        }
      })
    );

    return {
      granularity: options.period === "weekly" ? "daily" : "monthly",
      buckets: results,
    };
  }

  static async getDepartmentTrends(
    auth: AuthContext,
    options: {
      granularity: PerformanceTrendGranularity;
      anchorDate: Date;
    }
  ): Promise<DepartmentTrendsReport> {
    const scope = PerformanceReportService.resolveScope(auth);
    const count =
      options.granularity === "weekly"
        ? 8
        : options.granularity === "monthly"
          ? 6
          : 3;
    const buckets = buildTrendBuckets(
      options.granularity,
      options.anchorDate,
      count
    ).map((bucket, index, list) => {
      if (index !== list.length - 1) return bucket;
      const anchorDay = toUtcDate(options.anchorDate);
      return anchorDay.getTime() < bucket.endDate.getTime()
        ? { ...bucket, endDate: anchorDay }
        : bucket;
    });

    const reports = await Promise.all(
      buckets.map(async (bucket) => {
        try {
          const report = await PerformanceReportService.getReport(auth, {
            period: options.granularity,
            anchorDate: bucket.startDate,
            dateFrom: bucket.startDate,
            dateTo: bucket.endDate,
            includeTrend: false,
          });
          return { bucket, report };
        } catch {
          return { bucket, report: null };
        }
      })
    );

    const departmentMap = new Map<number, string>();
    reports.forEach(({ report }) => {
      report?.departments.forEach((department) =>
        departmentMap.set(department.departmentId, department.name)
      );
    });

    return {
      granularity: options.granularity,
      scope,
      scopeLabel: trendScopeLabel(scope),
      canViewDepartments: scope !== "self",
      departments: Array.from(departmentMap.entries())
        .map(([departmentId, name]) => ({ departmentId, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      buckets: reports.map(({ bucket, report }) => ({
        key: bucket.key,
        label: bucket.label,
        startDate: bucket.startDate.toISOString(),
        endDate: new Date(bucket.endDate.getTime() + DAY_MS - 1).toISOString(),
        departments: (report?.departments || []).map((department) => ({
          departmentId: department.departmentId,
          expectedTarget: department.expectedBillableTarget,
          billableAmount: department.actualBillableAmount,
          collections: department.collections,
          utilization:
            department.expectedBillableTarget > 0
              ? roundPercent(
                  (department.actualBillableAmount /
                    department.expectedBillableTarget) *
                    100
                )
              : 0,
          collectionsEfficiency:
            department.actualBillableAmount > 0
              ? roundPercent(
                  (department.collections / department.actualBillableAmount) *
                    100
                )
              : 0,
        })),
      })),
    };
  }

  static async getReport(
    auth: AuthContext,
    options: {
      period: PerformancePeriod;
      anchorDate: Date;
      dateFrom?: Date;
      dateTo?: Date;
      includeTrend?: boolean;
    }
  ): Promise<PerformanceReport> {
    const scope = PerformanceReportService.resolveScope(auth);
    const range = resolveReportRange(options);
    const profiles = await PerformanceReportService.resolveProfiles(auth, scope);
    const profileIds = profiles.map((profile) => profile.id);

    const [holidays, leaveSegments, timeEntries] = await Promise.all([
      prisma.publicHoliday.findMany({
        select: { holidayDate: true, isRecurring: true },
      }),
      profileIds.length
        ? prisma.leaveRequestSegment.findMany({
            where: {
              leaveDate: { gte: range.startDate, lte: range.endDate },
              syncStatus: { not: "voided" },
              leaveRequest: {
                employeeProfileId: { in: profileIds },
                status: "approved",
              },
            },
            select: {
              hours: true,
              leaveRequest: { select: { employeeProfileId: true } },
            },
          })
        : [],
      profileIds.length
        ? prisma.timeEntry.findMany({
            where: {
              employeeProfileId: { in: profileIds },
              status: "approved",
              dateWorked: { gte: range.startDate, lte: range.endDate },
            },
            select: {
              employeeProfileId: true,
              hours: true,
              billable: true,
              billableAmount: true,
              nonBillableCategory: true,
            },
          })
        : [],
    ]);

    const workingDays = countWorkingDays(
      range.startDate,
      range.endDate,
      holidays
    );
    const holidayDays = Math.max(
      0,
      countCalendarWeekdays(range.startDate, range.endDate) - workingDays
    );

    const leaveByProfile = new Map<number, number>();
    leaveSegments.forEach((segment) => {
      const profileId = segment.leaveRequest?.employeeProfileId;
      if (!profileId) return;
      leaveByProfile.set(
        profileId,
        (leaveByProfile.get(profileId) || 0) + Number(segment.hours || 0)
      );
    });

    const billableHoursByProfile = new Map<number, number>();
    const billableAmountByProfile = new Map<number, number>();
    const nonBillableHoursByProfile = new Map<number, number>();

    timeEntries.forEach((entry) => {
      const hours = Number(entry.hours || 0);
      if (!Number.isFinite(hours) || hours <= 0) return;
      if (entry.billable) {
        billableHoursByProfile.set(
          entry.employeeProfileId,
          (billableHoursByProfile.get(entry.employeeProfileId) || 0) + hours
        );
        billableAmountByProfile.set(
          entry.employeeProfileId,
          (billableAmountByProfile.get(entry.employeeProfileId) || 0) +
            Number(entry.billableAmount || 0)
        );
        return;
      }
      const category = String(entry.nonBillableCategory || "").toLowerCase();
      if (category === "leave" || category === "public_holiday") return;
      nonBillableHoursByProfile.set(
        entry.employeeProfileId,
        (nonBillableHoursByProfile.get(entry.employeeProfileId) || 0) + hours
      );
    });

    const collectionsByProfile = await PerformanceReportService.loadCollections(
      profileIds,
      options.period,
      options.anchorDate,
      range
    );

    const individuals: IndividualPerformanceRow[] = profiles
      .map((profile) => {
        const dailyHours = Number(profile.standardDailyHours || 8) || 8;
        const threshold = Number(profile.billableTargetPercent || 0) || 80;
        const leaveHours = leaveByProfile.get(profile.id) || 0;
        const availableHours = Math.max(0, workingDays * dailyHours - leaveHours);
        const expectedBillableTime = availableHours * (threshold / 100);
        const billingRate = Number(profile.role?.billingRate || 0);
        const expectedBillableTarget = expectedBillableTime * billingRate;
        const actualBillableTime = billableHoursByProfile.get(profile.id) || 0;
        const achievedBillableAmount = billableAmountByProfile.get(profile.id) || 0;
        const nonBillableTime = nonBillableHoursByProfile.get(profile.id) || 0;
        const billableAchievement =
          expectedBillableTarget > 0
            ? (achievedBillableAmount / expectedBillableTarget) * 100
            : achievedBillableAmount > 0
              ? 100
              : 0;
        const utilization =
          expectedBillableTime > 0
            ? (actualBillableTime / expectedBillableTime) * 100
            : 0;

        return {
          profileId: profile.id,
          name: `${profile.firstName || ""} ${profile.lastName || ""}`.trim(),
          employeeNumber: profile.employeeId,
          departmentId: profile.departmentId ?? null,
          departmentName: profile.department?.name ?? null,
          partnerProfileId: profile.department?.partnerProfileId ?? null,
          partnerName: profile.department?.partner
            ? `${profile.department.partner.firstName} ${profile.department.partner.lastName}`.trim()
            : null,
          staffLevel: profile.role?.name || profile.positionTitle || "—",
          staffRate: roundMoney(billingRate),
          expectedBillableThreshold: roundPercent(threshold),
          expectedTotalTime: roundHours(availableHours),
          expectedBillableTime: roundHours(expectedBillableTime),
          expectedBillableTarget: roundMoney(expectedBillableTarget),
          actualBillableTime: roundHours(actualBillableTime),
          nonBillableTime: roundHours(nonBillableTime),
          total: roundHours(actualBillableTime + nonBillableTime),
          achievedBillableAmount: roundMoney(achievedBillableAmount),
          billableAchievement: roundPercent(billableAchievement),
          utilization: roundPercent(utilization),
          collections: roundMoney(collectionsByProfile.get(profile.id) || 0),
          status: resolveStatus(billableAchievement),
        };
      })
      .sort(
        (a, b) =>
          (a.departmentName || "").localeCompare(b.departmentName || "") ||
          a.name.localeCompare(b.name)
      );

    const departmentMap = new Map<number, IndividualPerformanceRow[]>();
    individuals.forEach((row) => {
      if (!row.departmentId) return;
      const list = departmentMap.get(row.departmentId) || [];
      list.push(row);
      departmentMap.set(row.departmentId, list);
    });

    const departments: DepartmentPerformanceRow[] = Array.from(
      departmentMap.entries()
    )
      .map(([departmentId, rows]) => {
        const expectedBillableTarget = rows.reduce(
          (sum, row) => sum + row.expectedBillableTarget,
          0
        );
        const actualBillableAmount = rows.reduce(
          (sum, row) => sum + row.achievedBillableAmount,
          0
        );
        const collections = rows.reduce(
          (sum, row) => sum + row.collections,
          0
        );
        const expectedBillableTime = rows.reduce(
          (sum, row) => sum + row.expectedBillableTime,
          0
        );
        const actualBillableTime = rows.reduce(
          (sum, row) => sum + row.actualBillableTime,
          0
        );
        const utilizationRate =
          expectedBillableTime > 0
            ? (actualBillableTime / expectedBillableTime) * 100
            : 0;
        const staffMeetingTargets = rows.filter(
          (row) => row.billableAchievement >= 100
        ).length;
        const staffBelowTargets = rows.filter(
          (row) => row.billableAchievement < 100
        ).length;
        const staffAboveTargets = rows.filter(
          (row) => row.billableAchievement > 100
        ).length;
        const totalStaff = rows.length;
        const first = rows[0];

        return {
          departmentId,
          name: first.departmentName || `Department ${departmentId}`,
          partnerProfileId: first.partnerProfileId,
          partnerName: first.partnerName,
          expectedBillableTarget: roundMoney(expectedBillableTarget),
          actualBillableAmount: roundMoney(actualBillableAmount),
          collections: roundMoney(collections),
          utilizationRate: roundPercent(utilizationRate),
          collectionsEfficiency:
            actualBillableAmount > 0
              ? roundPercent((collections / actualBillableAmount) * 100)
              : 0,
          collectionsVsTarget:
            expectedBillableTarget > 0
              ? roundPercent((collections / expectedBillableTarget) * 100)
              : 0,
          staffMeetingTargets,
          staffBelowTargets,
          staffAboveTargets,
          totalStaff,
          staffPctBelowTargets:
            totalStaff > 0
              ? roundPercent((staffBelowTargets / totalStaff) * 100)
              : 0,
          staffPctAboveTargets:
            totalStaff > 0
              ? roundPercent((staffAboveTargets / totalStaff) * 100)
              : 0,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    const totalExpectedBillableTarget = roundMoney(
      individuals.reduce((sum, row) => sum + row.expectedBillableTarget, 0)
    );
    const totalActualBillableAmount = roundMoney(
      individuals.reduce((sum, row) => sum + row.achievedBillableAmount, 0)
    );
    const totalCollections = roundMoney(
      individuals.reduce((sum, row) => sum + row.collections, 0)
    );
    const totalExpectedBillableTime = individuals.reduce(
      (sum, row) => sum + row.expectedBillableTime,
      0
    );
    const totalActualBillableTime = individuals.reduce(
      (sum, row) => sum + row.actualBillableTime,
      0
    );
    const totalStaff = individuals.length;
    const totalBelow = individuals.filter(
      (row) => row.billableAchievement < 100
    ).length;
    const totalAbove = individuals.filter(
      (row) => row.billableAchievement > 100
    ).length;

    const trend = await PerformanceReportService.buildTrend(
      auth,
      options,
      range
    );

    return {
      period: options.period,
      label: range.label,
      startDate: range.startDate.toISOString(),
      endDate: range.endDate.toISOString(),
      workingDays,
      holidayDays,
      scope,
      scopeLabel:
        scope === "self"
          ? "My performance"
          : scope === "department"
            ? "My department"
            : scope === "partner"
              ? "Partner team"
              : "Firm-wide",
      canViewDepartments: scope !== "self",
      individuals,
      departments,
      totals: {
        expectedBillableTarget: totalExpectedBillableTarget,
        actualBillableAmount: totalActualBillableAmount,
        collections: totalCollections,
        utilizationRate:
          totalExpectedBillableTime > 0
            ? roundPercent(
                (totalActualBillableTime / totalExpectedBillableTime) * 100
              )
            : 0,
        staffMeetingTargets: totalStaff - totalBelow,
        staffBelowTargets: totalBelow,
        totalStaff,
        staffPctBelowTargets:
          totalStaff > 0 ? roundPercent((totalBelow / totalStaff) * 100) : 0,
        staffPctAboveTargets:
          totalStaff > 0 ? roundPercent((totalAbove / totalStaff) * 100) : 0,
      },
      trend,
    };
  }

  private static async loadCollections(
    profileIds: number[],
    period: PerformancePeriod,
    anchorDate: Date,
    range: { startDate: Date; endDate: Date }
  ) {
    if (profileIds.length === 0) return new Map<number, number>();

    const jobs = await prisma.job.findMany({
      where: {
        timeEntries: {
          some: {
            employeeProfileId: { in: profileIds },
            status: "approved",
            billable: true,
            dateWorked: { gte: range.startDate, lte: range.endDate },
          },
        },
      },
      select: { id: true },
    });

    const collections = new Map<number, number>();
    for (const job of jobs) {
      try {
        const report = await JobCostingService.getJobReport(
          job.id,
          period as JobCostingPeriod,
          anchorDate,
          range
        );
        report.staff.forEach((row) => {
          if (!profileIds.includes(row.employeeProfileId)) return;
          collections.set(
            row.employeeProfileId,
            (collections.get(row.employeeProfileId) || 0) +
              row.allocatedCollections
          );
        });
      } catch {
        // A single job failure should not blank the whole performance report.
      }
    }

    return collections;
  }
}

const countCalendarWeekdays = (startDate: Date, endDate: Date) => {
  let count = 0;
  let cursor = toUtcDate(startDate);
  const last = toUtcDate(endDate);
  while (cursor.getTime() <= last.getTime()) {
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) count += 1;
    cursor = addUtcDays(cursor, 1);
  }
  return count;
};

export default PerformanceReportService;
