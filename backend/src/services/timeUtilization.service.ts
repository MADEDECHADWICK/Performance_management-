import prisma from "../prisma";

export type UtilizationPeriod =
  | "daily"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "yearly";

export type UtilizationStatus = "on_track" | "at_risk" | "off_track";

export const UTILIZATION_PERIODS: UtilizationPeriod[] = [
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
];

interface AuthContext {
  userId: number;
  profileId: number;
  roleName?: string;
}

interface PublicHolidayRecord {
  holidayDate: Date;
  isRecurring: boolean;
}

const ACTIVE_TIME_ENTRY_STATUSES = ["pending", "submitted", "approved"] as const;
const PRODUCTIVE_LEGACY_CATEGORIES = new Set(["internal", "training"]);
const FULL_DAY_MS = 24 * 60 * 60 * 1000;

const toUtcDate = (value: Date) =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));

const addUtcDays = (value: Date, days: number) =>
  new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate() + days)
  );

const dateKey = (value: Date) => value.toISOString().slice(0, 10);

const startOfUtcDay = (value: Date) => toUtcDate(value);
const endOfUtcDay = (value: Date) => new Date(toUtcDate(value).getTime() + FULL_DAY_MS - 1);

const roundHours = (value: number) => Number(value.toFixed(2));
const roundPercent = (value: number) => Number(value.toFixed(1));

const resolveStatus = (achievementPercent: number): UtilizationStatus => {
  if (achievementPercent >= 100) return "on_track";
  if (achievementPercent >= 85) return "at_risk";
  return "off_track";
};

const resolveBenchmarkStatus = (
  utilizationPercent: number,
  benchmarkPercent: number
): UtilizationStatus => {
  const benchmark = Number.isFinite(benchmarkPercent) ? benchmarkPercent : 100;
  if (utilizationPercent >= benchmark) return "on_track";
  if (utilizationPercent >= Math.max(0, benchmark - 15)) return "at_risk";
  return "off_track";
};

const average = (values: number[]) =>
  values.length
    ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1))
    : 0;

const resolvePeriodRange = (period: UtilizationPeriod, anchor: Date) => {
  const day = toUtcDate(
    Number.isNaN(anchor.getTime()) ? new Date() : anchor
  );

  if (period === "daily") {
    return {
      startDate: startOfUtcDay(day),
      endDate: endOfUtcDay(day),
      label: dateKey(day),
    };
  }

  if (period === "weekly") {
    const weekday = day.getUTCDay();
    const diffToMonday = weekday === 0 ? -6 : 1 - weekday;
    const start = addUtcDays(day, diffToMonday);
    return {
      startDate: startOfUtcDay(start),
      endDate: endOfUtcDay(addUtcDays(start, 6)),
      label: `${dateKey(start)} to ${dateKey(addUtcDays(start, 6))}`,
    };
  }

  if (period === "monthly") {
    const start = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1));
    const endExclusive = new Date(
      Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 1)
    );
    return {
      startDate: startOfUtcDay(start),
      endDate: new Date(endExclusive.getTime() - 1),
      label: `${day.getUTCFullYear()}-${String(day.getUTCMonth() + 1).padStart(2, "0")}`,
    };
  }

  if (period === "quarterly") {
    const quarterStartMonth = Math.floor(day.getUTCMonth() / 3) * 3;
    const start = new Date(Date.UTC(day.getUTCFullYear(), quarterStartMonth, 1));
    const endExclusive = new Date(
      Date.UTC(day.getUTCFullYear(), quarterStartMonth + 3, 1)
    );
    return {
      startDate: startOfUtcDay(start),
      endDate: new Date(endExclusive.getTime() - 1),
      label: `${day.getUTCFullYear()} Q${Math.floor(day.getUTCMonth() / 3) + 1}`,
    };
  }

  const start = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
  const endExclusive = new Date(Date.UTC(day.getUTCFullYear() + 1, 0, 1));
  return {
    startDate: startOfUtcDay(start),
    endDate: new Date(endExclusive.getTime() - 1),
    label: String(day.getUTCFullYear()),
  };
};

const isHolidayOn = (holiday: PublicHolidayRecord, day: Date) => {
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
  holidays: PublicHolidayRecord[]
) => {
  let workingDays = 0;
  let holidayDays = 0;
  let cursor = startOfUtcDay(startDate);
  const last = startOfUtcDay(endDate);

  while (cursor.getTime() <= last.getTime()) {
    const weekday = cursor.getUTCDay();
    const isWeekend = weekday === 0 || weekday === 6;
    if (!isWeekend) {
      const holiday = holidays.find((item) => isHolidayOn(item, cursor));
      if (holiday) {
        holidayDays += 1;
      } else {
        workingDays += 1;
      }
    }
    cursor = addUtcDays(cursor, 1);
  }

  return { workingDays, holidayDays };
};

const getApprovedLeaveHours = async (
  profileId: number,
  startDate: Date,
  endDate: Date
) => {
  const segments = await prisma.leaveRequestSegment.findMany({
    where: {
      leaveDate: { gte: startDate, lte: endDate },
      syncStatus: { not: "voided" },
      leaveRequest: {
        employeeProfileId: profileId,
        status: "approved",
      },
    },
    select: { hours: true },
  });

  return segments.reduce((sum, segment) => sum + Number(segment.hours || 0), 0);
};

const getThresholds = async (profileId: number) => {
  const profile = await prisma.profile.findUnique({
    where: { id: profileId },
    select: {
      standardDailyHours: true,
      billableTargetPercent: true,
      nonBillableTargetPercent: true,
      utilizationTarget: true,
    },
  });

  if (!profile) {
    throw { statusCode: 404, message: "Profile not found" };
  }

  const standardDailyHours = Number(profile.standardDailyHours || 8) || 8;

  let billableTargetPercent = Number(profile.billableTargetPercent || 0);
  if (billableTargetPercent <= 0) {
    const utilization = Number(profile.utilizationTarget || 0);
    billableTargetPercent = utilization > 1 ? utilization : utilization * 100;
  }
  if (billableTargetPercent <= 0) billableTargetPercent = 80;

  let nonBillableTargetPercent = Number(profile.nonBillableTargetPercent || 0);
  if (nonBillableTargetPercent <= 0) {
    nonBillableTargetPercent = Math.max(0, 100 - billableTargetPercent);
  }

  return {
    standardDailyHours,
    billableTargetPercent,
    nonBillableTargetPercent,
  };
};

const isProductiveEntry = (entry: {
  billable: boolean;
  nonBillableCategory?: string | null;
  nonBillableActivity?: { isProductive: boolean } | null;
}) => {
  if (entry.billable) return true;
  if (entry.nonBillableActivity) return Boolean(entry.nonBillableActivity.isProductive);
  const category = String(entry.nonBillableCategory || "").toLowerCase();
  return PRODUCTIVE_LEGACY_CATEGORIES.has(category);
};

export interface UtilizationSummary {
  profileId: number;
  period: UtilizationPeriod;
  label: string;
  startDate: string;
  endDate: string;
  standardDailyHours: number;
  billableTargetPercent: number;
  nonBillableTargetPercent: number;
  workingDays: number;
  holidayDays: number;
  approvedLeaveHours: number;
  expectedWorkingHours: number;
  expectedBillableHours: number;
  expectedNonBillableHours: number;
  actualBillableHours: number;
  actualNonBillableHours: number;
  actualProductiveNonBillableHours: number;
  actualOtherNonBillableHours: number;
  billableAchievementPercent: number;
  nonBillableAchievementPercent: number;
  billableVarianceHours: number;
  nonBillableVarianceHours: number;
  targetHours: number;
  utilizationPercent: number;
  utilizationVarianceHours: number;
  utilizationStatus: UtilizationStatus;
  benchmarkPercent: number;
  status: UtilizationStatus;
  statusBasis: "billable" | "non_billable";
}

export interface UtilizationCascadeMember {
  profileId: number;
  name: string;
  departmentId: number | null;
  departmentName: string | null;
  partnerProfileId: number | null;
  partnerName: string | null;
  billableHours: number;
  loggedHours: number;
  targetHours: number;
  approvedLeaveHours: number;
  utilizationPercent: number;
  benchmarkPercent: number;
  varianceHours: number;
  status: UtilizationStatus;
  includedInAverages: boolean;
}

export interface UtilizationCascadeDepartment {
  departmentId: number | null;
  name: string;
  partnerProfileId: number | null;
  partnerName: string | null;
  billableHours: number;
  targetHours: number;
  loggedHours: number;
  utilizationPercent: number;
  benchmarkPercent: number;
  memberCount: number;
  eligibleMemberCount: number;
  status: UtilizationStatus;
}

export interface UtilizationCascadePartner {
  partnerProfileId: number;
  name: string;
  billableHours: number;
  targetHours: number;
  loggedHours: number;
  utilizationPercent: number;
  benchmarkPercent: number;
  departmentCount: number;
  memberCount: number;
  status: UtilizationStatus;
}

export interface UtilizationCascadeResult {
  period: UtilizationPeriod;
  label: string;
  startDate: string;
  endDate: string;
  workingDays: number;
  holidayDays: number;
  organization: {
    utilizationPercent: number;
    benchmarkPercent: number;
    billableHours: number;
    targetHours: number;
    loggedHours: number;
    partnerCount: number;
    departmentCount: number;
    memberCount: number;
    status: UtilizationStatus;
  };
  byPartner: UtilizationCascadePartner[];
  byDepartment: UtilizationCascadeDepartment[];
  byEmployee: UtilizationCascadeMember[];
}

export class TimeUtilizationService {
  static async getSummary(
    profileId: number,
    period: UtilizationPeriod,
    anchorDate: Date
  ): Promise<UtilizationSummary> {
    const range = resolvePeriodRange(period, anchorDate);
    const [thresholds, leaveHours, holidays] = await Promise.all([
      getThresholds(profileId),
      getApprovedLeaveHours(profileId, range.startDate, range.endDate),
      prisma.publicHoliday.findMany({
        select: { holidayDate: true, isRecurring: true },
      }),
    ]);

    const { workingDays, holidayDays } = countWorkingDays(
      range.startDate,
      range.endDate,
      holidays
    );

    const entries = await prisma.timeEntry.findMany({
      where: {
        employeeProfileId: profileId,
        dateWorked: { gte: range.startDate, lte: range.endDate },
        status: { in: [...ACTIVE_TIME_ENTRY_STATUSES] },
      },
      select: {
        hours: true,
        billable: true,
        nonBillableCategory: true,
        nonBillableActivity: { select: { isProductive: true } },
      },
    });

    let actualBillableHours = 0;
    let actualProductiveNonBillableHours = 0;
    let actualOtherNonBillableHours = 0;

    entries.forEach((entry) => {
      const hours = Number(entry.hours || 0);
      if (!Number.isFinite(hours) || hours <= 0) return;

      if (entry.billable) {
        actualBillableHours += hours;
        return;
      }

      const category = String(entry.nonBillableCategory || "").toLowerCase();
      if (category === "leave" || category === "public_holiday") {
        return;
      }

      if (isProductiveEntry(entry)) {
        actualProductiveNonBillableHours += hours;
      } else {
        actualOtherNonBillableHours += hours;
      }
    });

    const actualNonBillableHours =
      actualProductiveNonBillableHours + actualOtherNonBillableHours;

    const expectedWorkingHours = Math.max(
      0,
      workingDays * thresholds.standardDailyHours - leaveHours
    );
    const expectedBillableHours =
      (expectedWorkingHours * thresholds.billableTargetPercent) / 100;
    const expectedNonBillableHours =
      (expectedWorkingHours * thresholds.nonBillableTargetPercent) / 100;

    const billableAchievementPercent =
      expectedBillableHours > 0
        ? (actualBillableHours / expectedBillableHours) * 100
        : actualBillableHours > 0
          ? 100
          : 0;

    const nonBillableAchievementPercent =
      expectedNonBillableHours > 0
        ? (actualProductiveNonBillableHours / expectedNonBillableHours) * 100
        : 0;

    const statusBasis =
      actualBillableHours >= actualProductiveNonBillableHours
        ? "billable"
        : "non_billable";
    const statusAchievement =
      statusBasis === "billable"
        ? billableAchievementPercent
        : nonBillableAchievementPercent;

    const utilizationPercent =
      expectedWorkingHours > 0
        ? (actualBillableHours / expectedWorkingHours) * 100
        : 0;

    return {
      profileId,
      period,
      label: range.label,
      startDate: range.startDate.toISOString(),
      endDate: range.endDate.toISOString(),
      standardDailyHours: thresholds.standardDailyHours,
      billableTargetPercent: thresholds.billableTargetPercent,
      nonBillableTargetPercent: thresholds.nonBillableTargetPercent,
      workingDays,
      holidayDays,
      approvedLeaveHours: roundHours(leaveHours),
      expectedWorkingHours: roundHours(expectedWorkingHours),
      expectedBillableHours: roundHours(expectedBillableHours),
      expectedNonBillableHours: roundHours(expectedNonBillableHours),
      actualBillableHours: roundHours(actualBillableHours),
      actualNonBillableHours: roundHours(actualNonBillableHours),
      actualProductiveNonBillableHours: roundHours(actualProductiveNonBillableHours),
      actualOtherNonBillableHours: roundHours(actualOtherNonBillableHours),
      billableAchievementPercent: roundPercent(billableAchievementPercent),
      nonBillableAchievementPercent: roundPercent(nonBillableAchievementPercent),
      billableVarianceHours: roundHours(actualBillableHours - expectedBillableHours),
      nonBillableVarianceHours: roundHours(
        actualProductiveNonBillableHours - expectedNonBillableHours
      ),
      targetHours: roundHours(expectedWorkingHours),
      utilizationPercent: roundPercent(utilizationPercent),
      utilizationVarianceHours: roundHours(
        actualBillableHours - expectedWorkingHours
      ),
      utilizationStatus: resolveBenchmarkStatus(
        utilizationPercent,
        thresholds.billableTargetPercent
      ),
      benchmarkPercent: roundPercent(thresholds.billableTargetPercent),
      status: resolveStatus(statusAchievement),
      statusBasis,
    };
  }

  static async getSummaries(
    profileId: number,
    periods: UtilizationPeriod[],
    anchorDate: Date
  ) {
    return Promise.all(
      periods.map((period) => this.getSummary(profileId, period, anchorDate))
    );
  }

  static async getCascade(input: {
    period?: UtilizationPeriod;
    anchorDate?: Date;
    dateFrom?: Date;
    dateTo?: Date;
  }): Promise<UtilizationCascadeResult> {
    const period = input.period || "monthly";
    let range = resolvePeriodRange(period, input.anchorDate || new Date());
    if (input.dateFrom || input.dateTo) {
      const start = input.dateFrom
        ? startOfUtcDay(input.dateFrom)
        : range.startDate;
      const end = input.dateTo ? endOfUtcDay(input.dateTo) : range.endDate;
      range = {
        startDate: start,
        endDate: end,
        label: `${dateKey(start)} to ${dateKey(end)}`,
      };
    }

    const [profiles, holidays] = await Promise.all([
      prisma.profile.findMany({
        where: { status: "active" },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          departmentId: true,
          standardDailyHours: true,
          billableTargetPercent: true,
          department: { select: { id: true, name: true, partnerProfileId: true } },
        },
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      }),
      prisma.publicHoliday.findMany({
        select: { holidayDate: true, isRecurring: true },
      }),
    ]);

    const profileIds = profiles.map((profile) => profile.id);
    const { workingDays, holidayDays } = countWorkingDays(
      range.startDate,
      range.endDate,
      holidays
    );

    const [entries, leaveSegments] = profileIds.length
      ? await Promise.all([
          prisma.timeEntry.findMany({
            where: {
              employeeProfileId: { in: profileIds },
              dateWorked: { gte: range.startDate, lte: range.endDate },
              status: { in: [...ACTIVE_TIME_ENTRY_STATUSES] },
            },
            select: { employeeProfileId: true, hours: true, billable: true },
          }),
          prisma.leaveRequestSegment.findMany({
            where: {
              leaveDate: { gte: range.startDate, lte: range.endDate },
              syncStatus: { not: "voided" },
              leaveRequest: {
                status: "approved",
                employeeProfileId: { in: profileIds },
              },
            },
            select: {
              hours: true,
              leaveRequest: { select: { employeeProfileId: true } },
            },
          }),
        ])
      : [[], []];

    const billableMap = new Map<number, number>();
    const loggedMap = new Map<number, number>();
    entries.forEach((entry) => {
      const hours = Number(entry.hours || 0);
      if (!Number.isFinite(hours) || hours <= 0) return;
      loggedMap.set(
        entry.employeeProfileId,
        (loggedMap.get(entry.employeeProfileId) || 0) + hours
      );
      if (entry.billable) {
        billableMap.set(
          entry.employeeProfileId,
          (billableMap.get(entry.employeeProfileId) || 0) + hours
        );
      }
    });

    const leaveMap = new Map<number, number>();
    leaveSegments.forEach((segment) => {
      const profileId = segment.leaveRequest?.employeeProfileId;
      if (!profileId) return;
      leaveMap.set(profileId, (leaveMap.get(profileId) || 0) + Number(segment.hours || 0));
    });

    const members: UtilizationCascadeMember[] = profiles.map((profile) => {
      const billableHours = billableMap.get(profile.id) || 0;
      const loggedHours = loggedMap.get(profile.id) || 0;
      const approvedLeaveHours = leaveMap.get(profile.id) || 0;
      const dailyHours = Number(profile.standardDailyHours || 8) || 8;
      const targetHours = Math.max(0, workingDays * dailyHours - approvedLeaveHours);
      const utilizationPercent =
        targetHours > 0 ? (billableHours / targetHours) * 100 : 0;
      const benchmarkPercent = Number(profile.billableTargetPercent || 0) || 80;
      const department = profile.department;
      return {
        profileId: profile.id,
        name: `${profile.firstName || ""} ${profile.lastName || ""}`.trim(),
        departmentId: profile.departmentId ?? null,
        departmentName: department?.name ?? null,
        partnerProfileId: department?.partnerProfileId ?? null,
        partnerName: null,
        billableHours: roundHours(billableHours),
        loggedHours: roundHours(loggedHours),
        targetHours: roundHours(targetHours),
        approvedLeaveHours: roundHours(approvedLeaveHours),
        utilizationPercent: roundPercent(utilizationPercent),
        benchmarkPercent: roundPercent(benchmarkPercent),
        varianceHours: roundHours(billableHours - targetHours),
        status: resolveBenchmarkStatus(utilizationPercent, benchmarkPercent),
        includedInAverages: targetHours > 0,
      };
    });

    const departmentMembers = new Map<number, UtilizationCascadeMember[]>();
    const departmentInfo = new Map<
      number,
      { name: string; partnerProfileId: number | null }
    >();
    members.forEach((member) => {
      if (member.departmentId === null) return;
      const list = departmentMembers.get(member.departmentId) || [];
      list.push(member);
      departmentMembers.set(member.departmentId, list);
      if (!departmentInfo.has(member.departmentId)) {
        departmentInfo.set(member.departmentId, {
          name: member.departmentName || `Department ${member.departmentId}`,
          partnerProfileId: member.partnerProfileId,
        });
      }
    });

    const departments: UtilizationCascadeDepartment[] = Array.from(
      departmentMembers.entries()
    ).map(([departmentId, deptMembers]) => {
      const info = departmentInfo.get(departmentId);
      const eligible = deptMembers.filter((member) => member.includedInAverages);
      const utilizationPercent = average(
        eligible.map((member) => member.utilizationPercent)
      );
      const benchmarkPercent = average(
        eligible.map((member) => member.benchmarkPercent)
      );
      return {
        departmentId,
        name: info?.name || `Department ${departmentId}`,
        partnerProfileId: info?.partnerProfileId ?? null,
        partnerName: null,
        billableHours: roundHours(
          deptMembers.reduce((sum, member) => sum + member.billableHours, 0)
        ),
        targetHours: roundHours(
          deptMembers.reduce((sum, member) => sum + member.targetHours, 0)
        ),
        loggedHours: roundHours(
          deptMembers.reduce((sum, member) => sum + member.loggedHours, 0)
        ),
        utilizationPercent,
        benchmarkPercent,
        memberCount: deptMembers.length,
        eligibleMemberCount: eligible.length,
        status: resolveBenchmarkStatus(utilizationPercent, benchmarkPercent),
      };
    });

    const partnerDepartments = new Map<number, UtilizationCascadeDepartment[]>();
    departments.forEach((department) => {
      if (!department.partnerProfileId) return;
      const list = partnerDepartments.get(department.partnerProfileId) || [];
      list.push(department);
      partnerDepartments.set(department.partnerProfileId, list);
    });

    const partnerIds = Array.from(partnerDepartments.keys());
    const partnerProfiles = partnerIds.length
      ? await prisma.profile.findMany({
          where: { id: { in: partnerIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const partnerNameMap = new Map<number, string>();
    partnerProfiles.forEach((partner) => {
      partnerNameMap.set(
        partner.id,
        `${partner.firstName} ${partner.lastName}`.trim()
      );
    });

    const partners: UtilizationCascadePartner[] = partnerIds
      .map((partnerProfileId) => {
        const deptList = partnerDepartments.get(partnerProfileId) || [];
        const eligibleDepartments = deptList.filter(
          (department) => department.eligibleMemberCount > 0
        );
        const utilizationPercent = average(
          eligibleDepartments.map((department) => department.utilizationPercent)
        );
        const benchmarkPercent = average(
          eligibleDepartments.map((department) => department.benchmarkPercent)
        );
        return {
          partnerProfileId,
          name:
            partnerNameMap.get(partnerProfileId) ||
            `Partner ${partnerProfileId}`,
          billableHours: roundHours(
            deptList.reduce((sum, department) => sum + department.billableHours, 0)
          ),
          targetHours: roundHours(
            deptList.reduce((sum, department) => sum + department.targetHours, 0)
          ),
          loggedHours: roundHours(
            deptList.reduce((sum, department) => sum + department.loggedHours, 0)
          ),
          utilizationPercent,
          benchmarkPercent,
          departmentCount: eligibleDepartments.length,
          memberCount: deptList.reduce(
            (sum, department) => sum + department.memberCount,
            0
          ),
          status: resolveBenchmarkStatus(utilizationPercent, benchmarkPercent),
        };
      })
      .sort((a, b) => a.utilizationPercent - b.utilizationPercent);

    const partnerNameByDept = new Map<number, string | null>();
    partners.forEach((partner) => {
      partnerDepartments.get(partner.partnerProfileId)?.forEach((department) => {
        if (department.departmentId !== null) {
          partnerNameByDept.set(department.departmentId, partner.name);
        }
      });
    });

    departments.forEach((department) => {
      if (department.departmentId !== null) {
        department.partnerName =
          partnerNameByDept.get(department.departmentId) ?? null;
      }
    });
    members.forEach((member) => {
      if (member.departmentId !== null) {
        member.partnerName =
          partnerNameByDept.get(member.departmentId) ?? null;
      }
    });

    const eligiblePartners = partners.filter(
      (partner) => partner.departmentCount > 0 && partner.memberCount > 0
    );
    const organizationUtilization = average(
      eligiblePartners.map((partner) => partner.utilizationPercent)
    );
    const organizationBenchmark = average(
      eligiblePartners.map((partner) => partner.benchmarkPercent)
    );

    return {
      period,
      label: range.label,
      startDate: range.startDate.toISOString(),
      endDate: range.endDate.toISOString(),
      workingDays,
      holidayDays,
      organization: {
        utilizationPercent: organizationUtilization,
        benchmarkPercent: organizationBenchmark,
        billableHours: roundHours(
          eligiblePartners.reduce((sum, partner) => sum + partner.billableHours, 0)
        ),
        targetHours: roundHours(
          eligiblePartners.reduce((sum, partner) => sum + partner.targetHours, 0)
        ),
        loggedHours: roundHours(
          eligiblePartners.reduce((sum, partner) => sum + partner.loggedHours, 0)
        ),
        partnerCount: eligiblePartners.length,
        departmentCount: eligiblePartners.reduce(
          (sum, partner) => sum + partner.departmentCount,
          0
        ),
        memberCount: eligiblePartners.reduce(
          (sum, partner) => sum + partner.memberCount,
          0
        ),
        status: resolveBenchmarkStatus(
          organizationUtilization,
          organizationBenchmark
        ),
      },
      byPartner: partners,
      byDepartment: departments.sort(
        (a, b) => a.utilizationPercent - b.utilizationPercent
      ),
      byEmployee: members.sort(
        (a, b) => a.utilizationPercent - b.utilizationPercent
      ),
    };
  }

  static async assertCanViewProfile(
    targetProfileId: number,
    auth: AuthContext
  ) {
    if (targetProfileId === auth.profileId) return;

    const roles = new Set(
      [auth.roleName]
        .filter(Boolean)
        .map((role) => String(role).toLowerCase())
    );
    const elevated =
      roles.has("super_admin") ||
      roles.has("hr") ||
      roles.has("gmp") ||
      roles.has("partner");

    if (elevated) return;

    if (roles.has("manager")) {
      const report = await prisma.profile.findFirst({
        where: { id: targetProfileId, managerId: auth.profileId },
        select: { id: true },
      });
      if (report) return;
    }

    throw {
      statusCode: 403,
      message: "You do not have permission to view this utilization summary",
    };
  }

  static resolvePeriod(value: unknown): UtilizationPeriod {
    const normalized = String(value || "").trim().toLowerCase();
    if (UTILIZATION_PERIODS.includes(normalized as UtilizationPeriod)) {
      return normalized as UtilizationPeriod;
    }
    throw {
      statusCode: 400,
      message: `period must be one of: ${UTILIZATION_PERIODS.join(", ")}`,
    };
  }

  static resolvePeriods(value: unknown): UtilizationPeriod[] {
    if (Array.isArray(value)) {
      return value.map((item) => this.resolvePeriod(item));
    }
    const raw = String(value || "").trim();
    if (!raw) return UTILIZATION_PERIODS;
    return raw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => this.resolvePeriod(item));
  }
}
