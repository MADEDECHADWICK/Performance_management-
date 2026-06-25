import {
  DocumentAccessLevel,
  LeaveApproverSource,
  LeaveApprovalDecision,
  LeaveApprovalStageType,
  LeaveBalanceTransactionType,
  LeaveDayPortion,
  LeaveNoticeUnit,
  LeavePolicyAssignmentScope,
  LeaveRequestStatus,
  LeaveRequestSegmentSyncStatus,
  LeaveUnitType,
  Prisma,
} from "@prisma/client";
import prisma from "../prisma";
import { NotificationService } from "./notifications.service";
import { createAudit } from "../utils/audit";

type Tx = Prisma.TransactionClient;

type AuthContext = {
  userId: number;
  profileId: number;
  roleName?: string | null;
  roles?: string[];
};

type ListLeaveRequestOptions = {
  page: number;
  pageSize: number;
  status?: string;
  employeeProfileId?: number;
};

type ListApprovalOptions = {
  page: number;
  pageSize: number;
  scope?: "mine" | "all";
  status?: string;
};

type CalendarOptions = {
  scope?: "mine" | "team" | "org";
  dateFrom: Date;
  dateTo: Date;
  statuses?: string[];
};

type CreateLeaveRequestInput = {
  leaveTypeId: number;
  startDate: string | Date;
  endDate: string | Date;
  startsAt?: string | Date;
  endsAt?: string | Date;
  startDayPortion?: LeaveDayPortion;
  endDayPortion?: LeaveDayPortion;
  requestedUnits?: number;
  requestedHours?: number;
  reason?: string;
  attachmentDocumentIds?: number[];
};

type ManageLeaveRequestInput = {
  notes?: string;
  reason?: string;
};

type CreateLeaveTypeInput = {
  code: string;
  name: string;
  description?: string;
  color?: string;
  isActive?: boolean;
  isPaid?: boolean;
  balanceTracked?: boolean;
  requiresAttachment?: boolean;
  allowsHalfDay?: boolean;
  unitType?: LeaveUnitType;
  defaultNoticeDays?: number;
  defaultMaxUnits?: number | null;
};

type CreateLeavePolicyInput = {
  leaveTypeId: number;
  name: string;
  description?: string;
  isActive?: boolean;
  effectiveFrom?: string | Date | null;
  effectiveTo?: string | Date | null;
  annualEntitlement?: number;
  carryoverCap?: number;
  accrualEnabled?: boolean;
  accrualFrequency?: string;
  accrualRate?: number;
  requiresManagerApproval?: boolean;
  requiresHrApproval?: boolean;
  excludeWeekends?: boolean;
  excludePublicHolidays?: boolean;
  minNoticeDays?: number;
  hoursPerWorkday?: number;
  autoProjectToTimesheet?: boolean;
  maxConsecutiveUnits?: number;
  maxUnitsPerRequest?: number;
  allowNegativeBalance?: boolean;
  noticeRules?: Array<{
    sequenceNo?: number;
    minHours?: number | null;
    maxHours?: number | null;
    noticeValue: number;
    noticeUnit?: LeaveNoticeUnit;
    isActive?: boolean;
  }>;
  approvalRoutes?: Array<{
    name: string;
    minHours?: number | null;
    maxHours?: number | null;
    isActive?: boolean;
    steps: Array<{
      stepNumber?: number;
      stageType: LeaveApprovalStageType;
      approverSource?: LeaveApproverSource;
      approverProfileId?: number | null;
    }>;
  }>;
};

type CreatePolicyAssignmentInput = {
  policyId: number;
  scope?: string;
  departmentId?: number | null;
  roleId?: number | null;
  profileId?: number | null;
  priority?: number;
};

type CreatePublicHolidayInput = {
  name: string;
  holidayDate: string | Date;
  countryCode?: string;
  region?: string | null;
  isRecurring?: boolean;
};

type AdjustBalanceInput = {
  employeeProfileId: number;
  leaveTypeId: number;
  leaveYear?: number;
  units: number;
  note?: string;
  effectiveDate?: string | Date | null;
};

const HR_ROLE_NAMES = ["hr", "super_admin", "gmp"];
const PRIVILEGED_ROLES = new Set(["hr", "super_admin", "gmp"]);
const MANAGER_ROLES = new Set(["manager", "partner"]);
const PENDING_REQUEST_STATUSES = [
  LeaveRequestStatus.pending_manager_approval,
  LeaveRequestStatus.pending_partner_approval,
  LeaveRequestStatus.pending_hr_approval,
];
const DEFAULT_COUNTRY_CODE = "KE";
const EPSILON = 0.0001;

const REQUEST_INCLUDE = {
  employee: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      departmentId: true,
      department: { select: { id: true, name: true } },
      managerId: true,
    },
  },
  leaveType: {
    select: {
      id: true,
      code: true,
      name: true,
      color: true,
      isPaid: true,
      balanceTracked: true,
      requiresAttachment: true,
      allowsHalfDay: true,
      unitType: true,
    },
  },
  policy: {
    select: {
      id: true,
      name: true,
      annualEntitlement: true,
      carryoverCap: true,
      accrualEnabled: true,
      accrualFrequency: true,
      accrualRate: true,
      requiresManagerApproval: true,
      requiresHrApproval: true,
      excludeWeekends: true,
      excludePublicHolidays: true,
      minNoticeDays: true,
      hoursPerWorkday: true,
      autoProjectToTimesheet: true,
      maxConsecutiveUnits: true,
      maxUnitsPerRequest: true,
      allowNegativeBalance: true,
    },
  },
  currentApprover: {
    select: { id: true, firstName: true, lastName: true },
  },
  approvalSteps: {
    select: {
      id: true,
      stepNumber: true,
      stageType: true,
      approverProfileId: true,
      delegatedFromProfileId: true,
      decision: true,
      notes: true,
      actedAt: true,
      approver: { select: { id: true, firstName: true, lastName: true } },
      delegatedFrom: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { stepNumber: "asc" as const },
  },
} as const;

const POLICY_INCLUDE = {
  leaveType: { select: { id: true, code: true, name: true } },
  noticeRules: {
    orderBy: { sequenceNo: "asc" as const },
  },
  approvalRoutes: {
    orderBy: { id: "asc" as const },
    include: {
      steps: {
        orderBy: { stepNumber: "asc" as const },
      },
    },
  },
} as const;

const normalizeRole = (value: string | null | undefined) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

const toUnique = <T>(items: T[]) => Array.from(new Set(items));

const toNumber = (value: unknown) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundUnits = (value: number) => Math.round(value * 100) / 100;
const roundHours = (value: number) => Math.round(value * 100) / 100;

const parseDateOnly = (value: string | Date) => {
  if (value instanceof Date) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  const raw = String(value || "").trim();
  if (!raw) throw { statusCode: 400, message: "Date value is required" };
  const datePart = raw.slice(0, 10);
  const [year, month, day] = datePart.split("-").map((item) => Number(item));
  const normalized = new Date(Date.UTC(year, (month || 1) - 1, day || 1));
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    Number.isNaN(normalized.getTime())
  ) {
    throw { statusCode: 400, message: "Invalid date value" };
  }
  return normalized;
};

const parseDateTimeInput = (value: string | Date | null | undefined) => {
  if (!value) return null;
  const date = value instanceof Date ? new Date(value) : new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw { statusCode: 400, message: "Invalid datetime value" };
  }
  return date;
};

const startOfTodayUtc = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

const addUtcDays = (date: Date, days: number) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));

const dateKey = (date: Date) => date.toISOString().slice(0, 10);

const isWeekend = (date: Date) => {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
};

const isSameDate = (left: Date, right: Date) => dateKey(left) === dateKey(right);

const beginningOfYear = (year: number) => new Date(Date.UTC(year, 0, 1));
const endOfYear = (year: number) => new Date(Date.UTC(year + 1, 0, 1));

const buildNotificationAuth = (auth: AuthContext) => ({
  userId: auth.userId,
  profileId: auth.profileId,
  roleName: auth.roleName || auth.roles?.[0],
});

const isPendingRequestStatus = (status: LeaveRequestStatus) =>
  status === LeaveRequestStatus.pending_manager_approval ||
  status === LeaveRequestStatus.pending_partner_approval ||
  status === LeaveRequestStatus.pending_hr_approval;

const isClosedRequestStatus = (status: LeaveRequestStatus) =>
  status === LeaveRequestStatus.declined || status === LeaveRequestStatus.cancelled;

const resolveStatusForStage = (stageType: LeaveApprovalStageType) => {
  switch (stageType) {
    case LeaveApprovalStageType.partner:
      return LeaveRequestStatus.pending_partner_approval;
    case LeaveApprovalStageType.hr:
      return LeaveRequestStatus.pending_hr_approval;
    case LeaveApprovalStageType.manager:
    default:
      return LeaveRequestStatus.pending_manager_approval;
  }
};

const startOfDayPortionMinute = (portion: LeaveDayPortion) => {
  switch (portion) {
    case LeaveDayPortion.half_day_pm:
      return 240;
    case LeaveDayPortion.half_day_am:
    case LeaveDayPortion.full_day:
    default:
      return 0;
  }
};

const endOfDayPortionMinute = (portion: LeaveDayPortion, hoursPerWorkday: number) => {
  const fullDayMinutes = Math.round(hoursPerWorkday * 60);
  switch (portion) {
    case LeaveDayPortion.half_day_am:
      return Math.round(fullDayMinutes / 2);
    case LeaveDayPortion.half_day_pm:
    case LeaveDayPortion.full_day:
    default:
      return fullDayMinutes;
  }
};

const minuteOfDay = (date: Date) => date.getUTCHours() * 60 + date.getUTCMinutes();

type ResolvedLeaveSegment = {
  leaveDate: Date;
  startMinuteOfDay: number | null;
  endMinuteOfDay: number | null;
  hours: number;
};

type ResolvedLeaveMetrics = {
  startDate: Date;
  endDate: Date;
  startsAt: Date | null;
  endsAt: Date | null;
  startDayPortion: LeaveDayPortion;
  endDayPortion: LeaveDayPortion;
  requestedUnits: number;
  requestedHours: number;
  segments: ResolvedLeaveSegment[];
};

export class LeaveService {
  private static getRoleSet(auth: AuthContext) {
    return new Set(
      toUnique(
        [auth.roleName || "", ...(auth.roles || [])]
          .filter(Boolean)
          .map((role) => normalizeRole(role))
      )
    );
  }

  private static isPrivileged(auth: AuthContext) {
    const roles = this.getRoleSet(auth);
    return Array.from(roles).some((role) => PRIVILEGED_ROLES.has(role));
  }

  private static isManagerLike(auth: AuthContext) {
    const roles = this.getRoleSet(auth);
    return Array.from(roles).some(
      (role) => MANAGER_ROLES.has(role) || role.includes("manager") || role.includes("team_lead")
    );
  }

  private static ensureAdminAccess(auth: AuthContext) {
    if (!this.isPrivileged(auth)) {
      throw { statusCode: 403, message: "HR/Admin access is required" };
    }
  }

  private static ensureApprovalAccess(auth: AuthContext) {
    if (!this.isPrivileged(auth) && !this.isManagerLike(auth)) {
      throw { statusCode: 403, message: "Manager or HR access is required" };
    }
  }

  private static async getEmployeeProfile(tx: Tx, profileId: number) {
    const profile = await tx.profile.findUnique({
      where: { id: profileId },
      select: {
        id: true,
        userId: true,
        firstName: true,
        lastName: true,
        status: true,
        managerId: true,
        departmentId: true,
        roleId: true,
      },
    });

    if (!profile) {
      throw { statusCode: 404, message: "Employee profile not found" };
    }

    return profile;
  }

  private static async getTeamProfileIds(tx: Tx, managerProfileId: number) {
    const [directReports, partneredDepartments] = await Promise.all([
      tx.profile.findMany({
        where: { managerId: managerProfileId, status: "active" },
        select: { id: true },
      }),
      tx.department.findMany({
        where: { partnerProfileId: managerProfileId },
        select: { id: true },
      }),
    ]);

    const departmentIds = partneredDepartments.map((row) => row.id);
    const departmentMembers = departmentIds.length
      ? await tx.profile.findMany({
          where: {
            departmentId: { in: departmentIds },
            status: "active",
          },
          select: { id: true },
        })
      : [];

    return toUnique(
      [...directReports, ...departmentMembers]
        .map((row) => row.id)
        .filter((profileId) => profileId !== managerProfileId)
    );
  }

  private static async getScopedProfileIds(
    tx: Tx,
    auth: AuthContext,
    employeeProfileId?: number
  ) {
    if (this.isPrivileged(auth)) {
      if (employeeProfileId) return [employeeProfileId];
      return null;
    }

    if (this.isManagerLike(auth)) {
      const teamIds = await this.getTeamProfileIds(tx, auth.profileId);
      const allowed = new Set<number>([auth.profileId, ...teamIds]);
      if (employeeProfileId && !allowed.has(employeeProfileId)) {
        throw { statusCode: 403, message: "Selected employee is outside your scope" };
      }
      return employeeProfileId ? [employeeProfileId] : Array.from(allowed);
    }

    if (employeeProfileId && employeeProfileId !== auth.profileId) {
      throw { statusCode: 403, message: "You can only access your own leave data" };
    }

    return [auth.profileId];
  }

  private static async getActiveHrApprover(tx: Tx) {
    const hrProfile = await tx.profile.findFirst({
      where: {
        status: "active",
        user: {
          roles: {
            some: {
              role: {
                name: { in: HR_ROLE_NAMES },
              },
            },
          },
        },
      },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ id: "asc" }],
    });

    if (!hrProfile) {
      throw { statusCode: 422, message: "No HR approver is configured for leave approval" };
    }

    return hrProfile;
  }

  private static async resolveDelegatedApprover(
    tx: Tx,
    approverProfileId: number,
    onDate: Date
  ) {
    const delegation = await tx.leaveDelegation.findFirst({
      where: {
        approverProfileId,
        isActive: true,
        startDate: { lte: onDate },
        endDate: { gte: onDate },
      },
      select: { delegateProfileId: true },
      orderBy: [{ updatedAt: "desc" }],
    });

    if (!delegation) {
      return {
        approverProfileId,
        delegatedFromProfileId: null as number | null,
      };
    }

    return {
      approverProfileId: delegation.delegateProfileId,
      delegatedFromProfileId: approverProfileId,
    };
  }

  private static async resolvePolicy(
    tx: Tx,
    leaveTypeId: number,
    employee: { id: number; departmentId: number | null; roleId: number | null },
    referenceDate: Date
  ) {
    const assignments = await tx.leavePolicyAssignment.findMany({
      where: {
        policy: {
          leaveTypeId,
          isActive: true,
          OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: referenceDate } }],
          AND: [{ OR: [{ effectiveTo: null }, { effectiveTo: { gte: referenceDate } }] }],
        },
        OR: [
          { scope: LeavePolicyAssignmentScope.employee, profileId: employee.id },
          ...(employee.roleId
            ? [{ scope: LeavePolicyAssignmentScope.role, roleId: employee.roleId }]
            : []),
          ...(employee.departmentId
            ? [{ scope: LeavePolicyAssignmentScope.department, departmentId: employee.departmentId }]
            : []),
          { scope: LeavePolicyAssignmentScope.global },
        ],
      },
      include: { policy: true },
      orderBy: [{ priority: "asc" }],
    });

    const scopeRank: Record<LeavePolicyAssignmentScope, number> = {
      [LeavePolicyAssignmentScope.employee]: 1,
      [LeavePolicyAssignmentScope.role]: 2,
      [LeavePolicyAssignmentScope.department]: 3,
      [LeavePolicyAssignmentScope.global]: 4,
    };

    const assignment = assignments.sort((left, right) => {
      const rankDiff = scopeRank[left.scope] - scopeRank[right.scope];
      if (rankDiff !== 0) return rankDiff;
      return left.priority - right.priority;
    })[0];

    if (assignment?.policy) return assignment.policy;

    const fallback = await tx.leavePolicy.findFirst({
      where: {
        leaveTypeId,
        isActive: true,
        OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: referenceDate } }],
        AND: [{ OR: [{ effectiveTo: null }, { effectiveTo: { gte: referenceDate } }] }],
      },
      orderBy: [{ id: "asc" }],
    });

    if (!fallback) {
      throw {
        statusCode: 422,
        message: "No active leave policy could be resolved for this leave type",
      };
    }

    return fallback;
  }

  private static async getLeaveType(tx: Tx, leaveTypeId: number) {
    const leaveType = await tx.leaveType.findUnique({ where: { id: leaveTypeId } });
    if (!leaveType || !leaveType.isActive) {
      throw { statusCode: 404, message: "Leave type not found or inactive" };
    }
    return leaveType;
  }

  private static async loadHolidayKeys(
    tx: Tx,
    dateFrom: Date,
    dateTo: Date,
    countryCode = DEFAULT_COUNTRY_CODE
  ) {
    const holidays = await tx.publicHoliday.findMany({
      where: {
        countryCode,
        OR: [{ holidayDate: { gte: dateFrom, lte: dateTo } }, { isRecurring: true }],
      },
      select: { holidayDate: true, isRecurring: true },
    });

    const keys = new Set<string>();
    for (const holiday of holidays) {
      if (holiday.isRecurring) {
        let cursor = new Date(dateFrom);
        while (cursor <= dateTo) {
          if (
            cursor.getUTCMonth() === holiday.holidayDate.getUTCMonth() &&
            cursor.getUTCDate() === holiday.holidayDate.getUTCDate()
          ) {
            keys.add(dateKey(cursor));
          }
          cursor = addUtcDays(cursor, 1);
        }
        continue;
      }
      keys.add(dateKey(holiday.holidayDate));
    }

    return keys;
  }

  private static computeAccrualTarget(policy: any, asOfDate: Date) {
    if (!policy.accrualEnabled) return 0;

    const annualEntitlement = toNumber(policy.annualEntitlement);
    const explicitRate = toNumber(policy.accrualRate);
    const monthIndex = asOfDate.getUTCMonth();

    switch (policy.accrualFrequency) {
      case "quarterly": {
        const quartersElapsed = Math.floor(monthIndex / 3) + 1;
        const rate = explicitRate > 0 ? explicitRate : annualEntitlement / 4;
        return roundUnits(rate * quartersElapsed);
      }
      case "annually":
        return roundUnits(explicitRate > 0 ? explicitRate : annualEntitlement);
      case "manual":
        return 0;
      case "monthly":
      default: {
        const monthsElapsed = monthIndex + 1;
        const rate = explicitRate > 0 ? explicitRate : annualEntitlement / 12;
        return roundUnits(rate * monthsElapsed);
      }
    }
  }

  private static matchesHoursRange(
    value: number,
    minHours: number | null | undefined,
    maxHours: number | null | undefined
  ) {
    if (minHours !== null && minHours !== undefined && value + EPSILON < minHours) return false;
    if (maxHours !== null && maxHours !== undefined && value - EPSILON > maxHours) return false;
    return true;
  }

  private static validatePortions(
    startDate: Date,
    endDate: Date,
    startDayPortion: LeaveDayPortion,
    endDayPortion: LeaveDayPortion
  ) {
    if (isSameDate(startDate, endDate) && startDayPortion !== endDayPortion) {
      throw {
        statusCode: 400,
        message: "Single-day leave requests must use the same day portion for start and end",
      };
    }
  }

  private static async calculateRequestedUnitsFromPortions(
    tx: Tx,
    input: {
      startDate: Date;
      endDate: Date;
      startDayPortion: LeaveDayPortion;
      endDayPortion: LeaveDayPortion;
      requestedUnits?: number;
    },
    leaveType: any,
    policy: any
  ) {
    this.validatePortions(input.startDate, input.endDate, input.startDayPortion, input.endDayPortion);

    if (!leaveType.allowsHalfDay) {
      if (
        input.startDayPortion !== LeaveDayPortion.full_day ||
        input.endDayPortion !== LeaveDayPortion.full_day
      ) {
        throw {
          statusCode: 400,
          message: "This leave type does not allow half-day selections",
        };
      }
    }

    if (leaveType.unitType === LeaveUnitType.hour) {
      const requestedUnits = roundUnits(toNumber(input.requestedUnits));
      if (requestedUnits <= 0) {
        throw {
          statusCode: 400,
          message: "requestedUnits is required for hour-based leave types",
        };
      }
      if (!isSameDate(input.startDate, input.endDate)) {
        throw {
          statusCode: 400,
          message: "Hour-based leave requests must start and end on the same day",
        };
      }
      return requestedUnits;
    }

    const holidayKeys = policy.excludePublicHolidays
      ? await this.loadHolidayKeys(tx, input.startDate, input.endDate)
      : new Set<string>();

    let totalUnits = 0;
    let cursor = new Date(input.startDate);
    while (cursor <= input.endDate) {
      const key = dateKey(cursor);
      if ((policy.excludeWeekends && isWeekend(cursor)) || holidayKeys.has(key)) {
        cursor = addUtcDays(cursor, 1);
        continue;
      }

      let unitsForDay = 1;
      if (isSameDate(input.startDate, input.endDate)) {
        unitsForDay = input.startDayPortion === LeaveDayPortion.full_day ? 1 : 0.5;
      } else {
        if (isSameDate(cursor, input.startDate) && input.startDayPortion !== LeaveDayPortion.full_day) {
          unitsForDay -= 0.5;
        }
        if (isSameDate(cursor, input.endDate) && input.endDayPortion !== LeaveDayPortion.full_day) {
          unitsForDay -= 0.5;
        }
      }

      totalUnits += unitsForDay;
      cursor = addUtcDays(cursor, 1);
    }

    const rounded = roundUnits(totalUnits);
    if (rounded <= 0) {
      throw {
        statusCode: 400,
        message: "The selected leave dates do not produce any deductible leave units",
      };
    }

    return rounded;
  }

  private static async calculateRequestedUnits(
    tx: Tx,
    input: {
      startDate: Date;
      endDate: Date;
      startDayPortion: LeaveDayPortion;
      endDayPortion: LeaveDayPortion;
      requestedUnits?: number;
    },
    leaveType: any,
    policy: any
  ) {
    return this.calculateRequestedUnitsFromPortions(tx, input, leaveType, policy);
  }

  private static async resolveRequestedMetrics(
    tx: Tx,
    input: CreateLeaveRequestInput,
    leaveType: any,
    policy: any
  ): Promise<ResolvedLeaveMetrics> {
    const startDate = parseDateOnly(input.startDate);
    const endDate = parseDateOnly(input.endDate);
    const startDayPortion = input.startDayPortion || LeaveDayPortion.full_day;
    const endDayPortion = input.endDayPortion || LeaveDayPortion.full_day;
    const startsAt = parseDateTimeInput(input.startsAt);
    const endsAt = parseDateTimeInput(input.endsAt);
    const hoursPerWorkday = Math.max(0.25, toNumber(policy.hoursPerWorkday || 8));

    if ((startsAt && !endsAt) || (!startsAt && endsAt)) {
      throw {
        statusCode: 400,
        message: "startsAt and endsAt must be provided together for timed leave requests",
      };
    }

    if (startsAt && endsAt) {
      if (endsAt <= startsAt) {
        throw { statusCode: 400, message: "endsAt must be after startsAt" };
      }

      const timedStartDate = parseDateOnly(startsAt);
      const timedEndDate = parseDateOnly(endsAt);
      if (!isSameDate(timedStartDate, timedEndDate)) {
        throw {
          statusCode: 400,
          message: "Timed leave requests must start and end on the same day in this implementation",
        };
      }
      if (!isSameDate(timedStartDate, startDate) || !isSameDate(timedEndDate, endDate)) {
        throw {
          statusCode: 400,
          message: "startDate and endDate must match the day covered by startsAt/endsAt",
        };
      }

      const requestedHours = roundHours((endsAt.getTime() - startsAt.getTime()) / (1000 * 60 * 60));
      if (requestedHours <= 0) {
        throw { statusCode: 400, message: "Timed leave request must cover at least some hours" };
      }

      const requestedUnits =
        leaveType.unitType === LeaveUnitType.hour
          ? requestedHours
          : roundUnits(requestedHours / hoursPerWorkday);

      return {
        startDate,
        endDate,
        startsAt,
        endsAt,
        startDayPortion: LeaveDayPortion.full_day,
        endDayPortion: LeaveDayPortion.full_day,
        requestedUnits,
        requestedHours,
        segments: [
          {
            leaveDate: startDate,
            startMinuteOfDay: minuteOfDay(startsAt),
            endMinuteOfDay: minuteOfDay(endsAt),
            hours: requestedHours,
          },
        ],
      };
    }

    const requestedUnits = await this.calculateRequestedUnitsFromPortions(
      tx,
      {
        startDate,
        endDate,
        startDayPortion,
        endDayPortion,
        requestedUnits: input.requestedUnits,
      },
      leaveType,
      policy
    );

    const requestedHours =
      leaveType.unitType === LeaveUnitType.hour
        ? roundHours(requestedUnits)
        : roundHours(requestedUnits * hoursPerWorkday);

    const holidayKeys = policy.excludePublicHolidays
      ? await this.loadHolidayKeys(tx, startDate, endDate)
      : new Set<string>();

    const segments: ResolvedLeaveSegment[] = [];
    let cursor = new Date(startDate);
    while (cursor <= endDate) {
      const key = dateKey(cursor);
      if ((policy.excludeWeekends && isWeekend(cursor)) || holidayKeys.has(key)) {
        cursor = addUtcDays(cursor, 1);
        continue;
      }

      let unitsForDay = 1;
      let segmentStartMinute: number | null = null;
      let segmentEndMinute: number | null = null;

      if (isSameDate(startDate, endDate)) {
        unitsForDay = startDayPortion === LeaveDayPortion.full_day ? 1 : 0.5;
        if (startDayPortion !== LeaveDayPortion.full_day) {
          segmentStartMinute = startOfDayPortionMinute(startDayPortion);
          segmentEndMinute = endOfDayPortionMinute(startDayPortion, hoursPerWorkday);
        }
      } else {
        if (isSameDate(cursor, startDate) && startDayPortion !== LeaveDayPortion.full_day) {
          unitsForDay -= 0.5;
          segmentStartMinute = startOfDayPortionMinute(startDayPortion);
          segmentEndMinute = endOfDayPortionMinute(startDayPortion, hoursPerWorkday);
        } else if (isSameDate(cursor, endDate) && endDayPortion !== LeaveDayPortion.full_day) {
          unitsForDay -= 0.5;
          segmentStartMinute = startOfDayPortionMinute(endDayPortion);
          segmentEndMinute = endOfDayPortionMinute(endDayPortion, hoursPerWorkday);
        }
      }

      if (unitsForDay > EPSILON) {
        segments.push({
          leaveDate: new Date(cursor),
          startMinuteOfDay: segmentStartMinute,
          endMinuteOfDay: segmentEndMinute,
          hours:
            leaveType.unitType === LeaveUnitType.hour
              ? roundHours(unitsForDay)
              : roundHours(unitsForDay * hoursPerWorkday),
        });
      }

      cursor = addUtcDays(cursor, 1);
    }

    return {
      startDate,
      endDate,
      startsAt: null,
      endsAt: null,
      startDayPortion,
      endDayPortion,
      requestedUnits,
      requestedHours,
      segments,
    };
  }

  private static async resolveNoticeRule(
    tx: Tx,
    policyId: number,
    requestedHours: number
  ) {
    const rules = await tx.leavePolicyNoticeRule.findMany({
      where: { policyId, isActive: true },
      orderBy: [{ sequenceNo: "asc" }],
    });

    return (
      rules.find((rule) =>
        this.matchesHoursRange(
          requestedHours,
          rule.minHours === null ? null : toNumber(rule.minHours),
          rule.maxHours === null ? null : toNumber(rule.maxHours)
        )
      ) || null
    );
  }

  private static async calculateNoticeLead(
    tx: Tx,
    fromDate: Date,
    startDate: Date,
    noticeValue: number,
    noticeUnit: LeaveNoticeUnit,
    policy: {
      excludeWeekends?: boolean;
      excludePublicHolidays?: boolean;
    }
  ) {
    if (noticeValue <= 0) return Number.MAX_SAFE_INTEGER;
    if (startDate <= fromDate) {
      return 0;
    }

    if (noticeUnit === LeaveNoticeUnit.calendar_days) {
      const diffMs = startDate.getTime() - fromDate.getTime();
      return Math.floor(diffMs / (1000 * 60 * 60 * 24));
    }

    const noticeWindowEnd = addUtcDays(startDate, -1);
    const holidayKeys =
      policy.excludePublicHolidays && noticeWindowEnd >= fromDate
        ? await this.loadHolidayKeys(tx, fromDate, noticeWindowEnd)
        : new Set<string>();

    let noticeDays = 0;
    let cursor = new Date(fromDate);
    while (cursor < startDate) {
      const key = dateKey(cursor);
      if ((policy.excludeWeekends && isWeekend(cursor)) || holidayKeys.has(key)) {
        cursor = addUtcDays(cursor, 1);
        continue;
      }
      noticeDays += 1;
      cursor = addUtcDays(cursor, 1);
    }

    return noticeDays;
  }

  private static async calculateNoticeDays(
    tx: Tx,
    fromDate: Date,
    startDate: Date,
    policy: {
      excludeWeekends?: boolean;
      excludePublicHolidays?: boolean;
    }
  ) {
    return this.calculateNoticeLead(
      tx,
      fromDate,
      startDate,
      Number.MAX_SAFE_INTEGER,
      LeaveNoticeUnit.business_days,
      policy
    );
  }

  private static async ensureBalanceSnapshot(
    tx: Tx,
    employeeProfileId: number,
    leaveTypeId: number,
    leaveYear: number,
    policy: any,
    asOfDate: Date
  ) {
    const existingBalance = await tx.leaveBalance.findUnique({
      where: {
        employeeProfileId_leaveTypeId_leaveYear: {
          employeeProfileId,
          leaveTypeId,
          leaveYear,
        },
      },
    });

    if (!existingBalance) {
      await tx.leaveBalance.create({
        data: {
          employeeProfileId,
          leaveTypeId,
          leaveYear,
          openingBalance: 0,
          accruedUnits: 0,
          carriedOverUnits: 0,
          adjustedUnits: 0,
          usedUnits: 0,
          pendingUnits: 0,
          availableUnits: 0,
        },
      });
    }

    const currentEntries = await tx.leaveLedgerEntry.findMany({
      where: { employeeProfileId, leaveTypeId, leaveYear },
      orderBy: [{ createdAt: "asc" }],
    });

    const openingCurrent = currentEntries
      .filter((entry) => entry.transactionType === LeaveBalanceTransactionType.opening_balance)
      .reduce((sum, entry) => sum + toNumber(entry.units), 0);
    const accrualCurrent = currentEntries
      .filter((entry) => entry.transactionType === LeaveBalanceTransactionType.accrual)
      .reduce((sum, entry) => sum + toNumber(entry.units), 0);

    const openingTarget = policy.accrualEnabled ? 0 : roundUnits(toNumber(policy.annualEntitlement));
    const accrualTarget = this.computeAccrualTarget(policy, asOfDate);

    if (openingTarget > openingCurrent + EPSILON) {
      await tx.leaveLedgerEntry.create({
        data: {
          leaveBalanceId: existingBalance?.id,
          employeeProfileId,
          leaveTypeId,
          leaveYear,
          transactionType: LeaveBalanceTransactionType.opening_balance,
          units: roundUnits(openingTarget - openingCurrent),
          note: "Opening balance seeded from leave policy",
          effectiveDate: beginningOfYear(leaveYear),
        },
      });
    }

    if (accrualTarget > accrualCurrent + EPSILON) {
      await tx.leaveLedgerEntry.create({
        data: {
          leaveBalanceId: existingBalance?.id,
          employeeProfileId,
          leaveTypeId,
          leaveYear,
          transactionType: LeaveBalanceTransactionType.accrual,
          units: roundUnits(accrualTarget - accrualCurrent),
          note: "Accrual refreshed from leave policy",
          effectiveDate: asOfDate,
        },
      });
    }

    const entries = await tx.leaveLedgerEntry.findMany({
      where: { employeeProfileId, leaveTypeId, leaveYear },
      orderBy: [{ createdAt: "asc" }],
    });

    const pendingAggregate = await tx.leaveRequest.aggregate({
      where: {
        employeeProfileId,
        leaveTypeId,
        status: { in: PENDING_REQUEST_STATUSES },
        startDate: { gte: beginningOfYear(leaveYear), lt: endOfYear(leaveYear) },
      },
      _sum: { requestedUnits: true },
    });

    const sumByType = (transactionTypes: LeaveBalanceTransactionType[]) =>
      entries
        .filter((entry) => transactionTypes.includes(entry.transactionType))
        .reduce((sum, entry) => sum + toNumber(entry.units), 0);

    const openingBalance = roundUnits(sumByType([LeaveBalanceTransactionType.opening_balance]));
    const accruedUnits = roundUnits(sumByType([LeaveBalanceTransactionType.accrual]));
    const carriedOverUnits = roundUnits(sumByType([LeaveBalanceTransactionType.carryover]));
    const adjustedUnits = roundUnits(sumByType([LeaveBalanceTransactionType.adjustment]));
    const deductionNet = roundUnits(
      sumByType([
        LeaveBalanceTransactionType.deduction,
        LeaveBalanceTransactionType.reversal,
      ])
    );
    const expiryUnits = roundUnits(sumByType([LeaveBalanceTransactionType.expiry]));
    const pendingUnits = roundUnits(toNumber(pendingAggregate._sum.requestedUnits));
    const usedUnits = roundUnits(Math.max(0, -deductionNet));
    const availableUnits = roundUnits(
      openingBalance + accruedUnits + carriedOverUnits + adjustedUnits + deductionNet + expiryUnits - pendingUnits
    );

    return tx.leaveBalance.update({
      where: {
        employeeProfileId_leaveTypeId_leaveYear: {
          employeeProfileId,
          leaveTypeId,
          leaveYear,
        },
      },
      data: {
        openingBalance,
        accruedUnits,
        carriedOverUnits,
        adjustedUnits,
        usedUnits,
        pendingUnits,
        availableUnits,
        lastCalculatedAt: new Date(),
      },
      include: {
        leaveType: {
          select: { id: true, code: true, name: true, color: true, unitType: true, isPaid: true },
        },
      },
    });
  }

  private static async validateAttachments(
    tx: Tx,
    auth: AuthContext,
    attachmentDocumentIds: number[] | undefined,
    requiresAttachment: boolean
  ) {
    const attachmentIds = Array.isArray(attachmentDocumentIds)
      ? attachmentDocumentIds
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id) && id > 0)
      : [];

    if (requiresAttachment && attachmentIds.length === 0) {
      throw { statusCode: 400, message: "This leave type requires at least one attachment" };
    }

    if (attachmentIds.length === 0) {
      return [] as number[];
    }

    const documents = await tx.document.findMany({
      where: {
        id: { in: attachmentIds },
        uploadedBy: auth.profileId,
      },
      select: { id: true },
    });

    if (documents.length !== attachmentIds.length) {
      throw {
        statusCode: 400,
        message: "One or more attachment documents were not found in your document workspace",
      };
    }

    return attachmentIds;
  }

  private static async syncRequestDocuments(
    tx: Tx,
    leaveRequestId: number,
    attachmentDocumentIds: number[]
  ) {
    if (!attachmentDocumentIds.length) return;
    await tx.document.updateMany({
      where: { id: { in: attachmentDocumentIds } },
      data: {
        entityType: "LeaveRequest",
        entityId: leaveRequestId,
        accessLevel: DocumentAccessLevel.manager,
      },
    });
  }

  private static async resolveApprovalRoute(
    tx: Tx,
    policyId: number,
    requestedHours: number
  ) {
    const routes = await tx.leavePolicyApprovalRoute.findMany({
      where: { policyId, isActive: true },
      include: {
        steps: {
          orderBy: [{ stepNumber: "asc" }],
        },
      },
      orderBy: [{ id: "asc" }],
    });

    return (
      routes.find((route) =>
        this.matchesHoursRange(
          requestedHours,
          route.minHours === null ? null : toNumber(route.minHours),
          route.maxHours === null ? null : toNumber(route.maxHours)
        )
      ) || null
    );
  }

  private static async resolveRouteApprover(
    tx: Tx,
    employee: { managerId: number | null; departmentId: number | null },
    step: {
      stageType: LeaveApprovalStageType;
      approverSource: LeaveApproverSource;
      approverProfileId: number | null;
    },
    onDate: Date
  ) {
    let sourceProfileId: number | null = null;

    switch (step.approverSource) {
      case LeaveApproverSource.employee_manager:
        sourceProfileId = employee.managerId;
        if (!sourceProfileId) {
          throw {
            statusCode: 422,
            message: "This employee does not have a reporting manager configured",
          };
        }
        break;
      case LeaveApproverSource.department_partner: {
        if (!employee.departmentId) {
          throw {
            statusCode: 422,
            message: "This employee does not have a department configured for partner approval",
          };
        }
        const department = await tx.department.findUnique({
          where: { id: employee.departmentId },
          select: { partnerProfileId: true },
        });
        sourceProfileId = department?.partnerProfileId ?? null;
        if (!sourceProfileId) {
          throw {
            statusCode: 422,
            message: "No department partner is configured for this employee's department",
          };
        }
        break;
      }
      case LeaveApproverSource.hr_pool: {
        const hrApprover = await this.getActiveHrApprover(tx);
        sourceProfileId = hrApprover.id;
        break;
      }
      case LeaveApproverSource.specific_profile:
        sourceProfileId = step.approverProfileId ?? null;
        if (!sourceProfileId) {
          throw {
            statusCode: 422,
            message: "A specific approver profile is required for this leave approval route step",
          };
        }
        break;
      default:
        sourceProfileId = step.approverProfileId ?? null;
        break;
    }

    if (!sourceProfileId) {
      throw { statusCode: 422, message: "No active approver could be resolved for the leave route" };
    }

    return this.resolveDelegatedApprover(tx, sourceProfileId, onDate);
  }

  private static async buildApprovalSteps(
    tx: Tx,
    employee: { managerId: number | null; departmentId: number | null },
    policy: any,
    requestedHours: number,
    onDate: Date
  ) {
    const route = await this.resolveApprovalRoute(tx, policy.id, requestedHours);
    if (route?.steps?.length) {
      const resolvedSteps: Array<{
        stepNumber: number;
        stageType: LeaveApprovalStageType;
        approverProfileId: number;
        delegatedFromProfileId: number | null;
      }> = [];

      for (const routeStep of route.steps) {
        const delegated = await this.resolveRouteApprover(
          tx,
          employee,
          {
            stageType: routeStep.stageType,
            approverSource: routeStep.approverSource,
            approverProfileId: routeStep.approverProfileId,
          },
          onDate
        );

        resolvedSteps.push({
          stepNumber: routeStep.stepNumber,
          stageType: routeStep.stageType,
          approverProfileId: delegated.approverProfileId,
          delegatedFromProfileId: delegated.delegatedFromProfileId,
        });
      }

      return {
        route,
        steps: resolvedSteps.sort((left, right) => left.stepNumber - right.stepNumber),
      };
    }

    const steps: Array<{
      stepNumber: number;
      stageType: LeaveApprovalStageType;
      approverProfileId: number;
      delegatedFromProfileId: number | null;
    }> = [];

    if (policy.requiresManagerApproval) {
      if (!employee.managerId) {
        throw {
          statusCode: 422,
          message: "This employee does not have a reporting manager configured",
        };
      }
      const managerStep = await this.resolveDelegatedApprover(tx, employee.managerId, onDate);
      steps.push({
        stepNumber: steps.length + 1,
        stageType: LeaveApprovalStageType.manager,
        approverProfileId: managerStep.approverProfileId,
        delegatedFromProfileId: managerStep.delegatedFromProfileId,
      });
    }

    if (policy.requiresHrApproval) {
      const hrApprover = await this.getActiveHrApprover(tx);
      const hrStep = await this.resolveDelegatedApprover(tx, hrApprover.id, onDate);
      steps.push({
        stepNumber: steps.length + 1,
        stageType: LeaveApprovalStageType.hr,
        approverProfileId: hrStep.approverProfileId,
        delegatedFromProfileId: hrStep.delegatedFromProfileId,
      });
    }

    return { route: null, steps };
  }

  private static async createLeaveRequestSegments(
    tx: Tx,
    leaveRequestId: number,
    segments: ResolvedLeaveSegment[],
    syncStatus: LeaveRequestSegmentSyncStatus
  ) {
    if (!segments.length) return;
    await tx.leaveRequestSegment.createMany({
      data: segments.map((segment) => ({
        leaveRequestId,
        leaveDate: segment.leaveDate,
        startMinuteOfDay: segment.startMinuteOfDay,
        endMinuteOfDay: segment.endMinuteOfDay,
        hours: roundHours(segment.hours),
        syncStatus,
      })),
    });
  }

  private static normalizePolicyNoticeRules(input: CreateLeavePolicyInput["noticeRules"]) {
    return (input || [])
      .map((rule, index) => ({
        sequenceNo: Number(rule.sequenceNo || index + 1),
        minHours:
          rule.minHours === null || rule.minHours === undefined ? null : roundHours(Number(rule.minHours)),
        maxHours:
          rule.maxHours === null || rule.maxHours === undefined ? null : roundHours(Number(rule.maxHours)),
        noticeValue: Math.max(0, Number(rule.noticeValue || 0)),
        noticeUnit: rule.noticeUnit || LeaveNoticeUnit.calendar_days,
        isActive: rule.isActive ?? true,
      }))
      .filter((rule) => Number.isFinite(rule.noticeValue));
  }

  private static resolvePolicyStepSource(
    stageType: LeaveApprovalStageType,
    approverSource?: LeaveApproverSource
  ) {
    if (approverSource) return approverSource;
    switch (stageType) {
      case LeaveApprovalStageType.manager:
        return LeaveApproverSource.employee_manager;
      case LeaveApprovalStageType.partner:
        return LeaveApproverSource.department_partner;
      case LeaveApprovalStageType.hr:
        return LeaveApproverSource.hr_pool;
      default:
        return LeaveApproverSource.specific_profile;
    }
  }

  private static normalizePolicyApprovalRoutes(input: CreateLeavePolicyInput["approvalRoutes"]) {
    return (input || [])
      .map((route, routeIndex) => ({
        name: String(route.name || `Approval route ${routeIndex + 1}`).trim(),
        minHours:
          route.minHours === null || route.minHours === undefined ? null : roundHours(Number(route.minHours)),
        maxHours:
          route.maxHours === null || route.maxHours === undefined ? null : roundHours(Number(route.maxHours)),
        isActive: route.isActive ?? true,
        steps: (route.steps || [])
          .map((step, stepIndex) => ({
            stepNumber: Number(step.stepNumber || stepIndex + 1),
            stageType: step.stageType,
            approverSource: this.resolvePolicyStepSource(step.stageType, step.approverSource),
            approverProfileId:
              step.approverProfileId === null || step.approverProfileId === undefined
                ? null
                : Number(step.approverProfileId),
          }))
          .sort((left, right) => left.stepNumber - right.stepNumber),
      }))
      .filter((route) => route.name && route.steps.length > 0);
  }

  private static async syncPolicyRules(
    tx: Tx,
    policyId: number,
    input: Pick<CreateLeavePolicyInput, "noticeRules" | "approvalRoutes">
  ) {
    if (input.noticeRules !== undefined) {
      const noticeRules = this.normalizePolicyNoticeRules(input.noticeRules);
      await tx.leavePolicyNoticeRule.deleteMany({ where: { policyId } });
      if (noticeRules.length > 0) {
        await tx.leavePolicyNoticeRule.createMany({
          data: noticeRules.map((rule) => ({
            policyId,
            sequenceNo: rule.sequenceNo,
            minHours: rule.minHours,
            maxHours: rule.maxHours,
            noticeValue: rule.noticeValue,
            noticeUnit: rule.noticeUnit,
            isActive: rule.isActive,
          })),
        });
      }
    }

    if (input.approvalRoutes !== undefined) {
      const approvalRoutes = this.normalizePolicyApprovalRoutes(input.approvalRoutes);
      await tx.leavePolicyApprovalRoute.deleteMany({ where: { policyId } });
      for (const route of approvalRoutes) {
        await tx.leavePolicyApprovalRoute.create({
          data: {
            policyId,
            name: route.name,
            minHours: route.minHours,
            maxHours: route.maxHours,
            isActive: route.isActive,
            steps: {
              create: route.steps.map((step) => ({
                stepNumber: step.stepNumber,
                stageType: step.stageType,
                approverSource: step.approverSource,
                approverProfileId: step.approverProfileId,
              })),
            },
          },
        });
      }
    }
  }

  private static async updateLeaveRequestSegmentStatus(
    tx: Tx,
    leaveRequestId: number,
    syncStatus: LeaveRequestSegmentSyncStatus
  ) {
    if (!("leaveRequestSegment" in tx) || !(tx as any).leaveRequestSegment?.updateMany) {
      return;
    }
    await tx.leaveRequestSegment.updateMany({
      where: { leaveRequestId },
      data: { syncStatus },
    });
  }

  private static segmentsOverlap(
    left: Pick<ResolvedLeaveSegment, "leaveDate" | "startMinuteOfDay" | "endMinuteOfDay">,
    right: Pick<ResolvedLeaveSegment, "leaveDate" | "startMinuteOfDay" | "endMinuteOfDay">
  ) {
    if (!isSameDate(left.leaveDate, right.leaveDate)) return false;
    if (
      left.startMinuteOfDay !== null &&
      left.endMinuteOfDay !== null &&
      right.startMinuteOfDay !== null &&
      right.endMinuteOfDay !== null
    ) {
      return left.startMinuteOfDay < right.endMinuteOfDay && right.startMinuteOfDay < left.endMinuteOfDay;
    }
    return true;
  }

  private static async ensureNoOverlappingLeave(
    tx: Tx,
    employeeProfileId: number,
    metrics: ResolvedLeaveMetrics
  ) {
    const requests = await tx.leaveRequest.findMany({
      where: {
        employeeProfileId,
        status: { in: [...PENDING_REQUEST_STATUSES, LeaveRequestStatus.approved] },
        startDate: { lte: metrics.endDate },
        endDate: { gte: metrics.startDate },
      },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        segments: {
          select: {
            leaveDate: true,
            startMinuteOfDay: true,
            endMinuteOfDay: true,
          },
        },
      },
    });

    for (const request of requests) {
      if (!request.segments.length) {
        const overlapsLegacyRange = metrics.segments.some(
          (segment) => request.startDate <= segment.leaveDate && request.endDate >= segment.leaveDate
        );
        if (overlapsLegacyRange) {
          throw {
            statusCode: 409,
            message: "This leave request overlaps an existing pending or approved leave request",
          };
        }
        continue;
      }

      const overlaps = metrics.segments.some((segment) =>
        request.segments.some((existingSegment) =>
          this.segmentsOverlap(segment, {
            leaveDate: existingSegment.leaveDate,
            startMinuteOfDay: existingSegment.startMinuteOfDay,
            endMinuteOfDay: existingSegment.endMinuteOfDay,
          })
        )
      );

      if (overlaps) {
        throw {
          statusCode: 409,
          message: "This leave request overlaps an existing pending or approved leave request",
        };
      }
    }
  }

  private static async fetchAttachments(tx: Tx, leaveRequestIds: number[]) {
    if (leaveRequestIds.length === 0) return new Map<number, any[]>();
    const documents = await tx.document.findMany({
      where: {
        entityType: "LeaveRequest",
        entityId: { in: leaveRequestIds },
      },
      select: {
        id: true,
        entityId: true,
        fileName: true,
        documentType: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: "desc" }],
    });

    const byRequestId = new Map<number, any[]>();
    for (const document of documents) {
      const requestId = Number(document.entityId || 0);
      if (!byRequestId.has(requestId)) byRequestId.set(requestId, []);
      byRequestId.get(requestId)?.push(document);
    }
    return byRequestId;
  }

  private static async mapRequestResponse(tx: Tx, request: any, includeAttachments = true) {
    const attachmentMap = includeAttachments
      ? await this.fetchAttachments(tx, [request.id])
      : new Map<number, any[]>();
    return {
      ...request,
      requestedUnits: roundUnits(toNumber(request.requestedUnits)),
      deductedUnits: roundUnits(toNumber(request.deductedUnits)),
      requestedHours: roundHours(toNumber(request.requestedHours)),
      deductedHours: roundHours(toNumber(request.deductedHours)),
      attachments: attachmentMap.get(request.id) || [],
      attachmentCount: (attachmentMap.get(request.id) || []).length,
    };
  }

  private static async logAudit(
    auth: AuthContext,
    action: string,
    entityId: number,
    metadata?: Record<string, unknown>
  ) {
    await createAudit({
      action,
      entity_type: "leave_request",
      entity_id: entityId,
      user_id: auth.userId,
      metadata: {
        actorProfileId: auth.profileId,
        ...(metadata || {}),
      },
    });
  }

  private static async dispatchRequestNotification(
    recipientProfileId: number,
    title: string,
    message: string,
    requestId: number,
    auth: AuthContext
  ) {
    await NotificationService.createNotification(
      {
        recipientProfileId,
        type: "action",
        title,
        message,
        actionRequired: true,
        link: `/leave`,
        eventType: "leave.request",
        targetEntityType: "LeaveRequest",
        targetEntityId: requestId,
        canonicalRoute: `/leave`,
      },
      buildNotificationAuth(auth)
    );
  }

  static async listMyBalances(options: { year?: number } | undefined, auth: AuthContext) {
    const year = Number(options?.year || startOfTodayUtc().getUTCFullYear());

    return prisma.$transaction(async (tx) => {
      const employee = await this.getEmployeeProfile(tx, auth.profileId);
      const leaveTypes = await tx.leaveType.findMany({
        where: { isActive: true },
        orderBy: [{ name: "asc" }],
      });

      const balances = [] as any[];
      for (const leaveType of leaveTypes) {
        const policy = await this.resolvePolicy(tx, leaveType.id, employee, endOfYear(year - 1));
        const balance = await this.ensureBalanceSnapshot(
          tx,
          employee.id,
          leaveType.id,
          year,
          policy,
          startOfTodayUtc()
        );
        balances.push(balance);
      }

      return balances.map((balance) => ({
        ...balance,
        openingBalance: roundUnits(toNumber(balance.openingBalance)),
        accruedUnits: roundUnits(toNumber(balance.accruedUnits)),
        carriedOverUnits: roundUnits(toNumber(balance.carriedOverUnits)),
        adjustedUnits: roundUnits(toNumber(balance.adjustedUnits)),
        usedUnits: roundUnits(toNumber(balance.usedUnits)),
        pendingUnits: roundUnits(toNumber(balance.pendingUnits)),
        availableUnits: roundUnits(toNumber(balance.availableUnits)),
      }));
    });
  }

  static async listLeaveRequests(options: ListLeaveRequestOptions, auth: AuthContext) {
    return prisma.$transaction(async (tx) => {
      const scopedProfileIds = await this.getScopedProfileIds(tx, auth, options.employeeProfileId);
      const where: Prisma.LeaveRequestWhereInput = {
        ...(scopedProfileIds ? { employeeProfileId: { in: scopedProfileIds } } : {}),
        ...(options.status ? { status: options.status as LeaveRequestStatus } : {}),
      };

      const skip = (options.page - 1) * options.pageSize;
      const [items, total] = await Promise.all([
        tx.leaveRequest.findMany({
          where,
          include: REQUEST_INCLUDE,
          orderBy: [{ createdAt: "desc" }],
          skip,
          take: options.pageSize,
        }),
        tx.leaveRequest.count({ where }),
      ]);

      const attachmentMap = await this.fetchAttachments(
        tx,
        items.map((item) => item.id)
      );

        return {
          requests: items.map((item) => ({
            ...item,
            requestedUnits: roundUnits(toNumber(item.requestedUnits)),
            deductedUnits: roundUnits(toNumber(item.deductedUnits)),
            requestedHours: roundHours(toNumber(item.requestedHours)),
            deductedHours: roundHours(toNumber(item.deductedHours)),
            attachmentCount: (attachmentMap.get(item.id) || []).length,
          })),
          total,
        };
    });
  }

  static async getLeaveRequest(requestId: number, auth: AuthContext) {
    return prisma.$transaction(async (tx) => {
      const request = await tx.leaveRequest.findUnique({
        where: { id: requestId },
        include: REQUEST_INCLUDE,
      });

      if (!request) {
        throw { statusCode: 404, message: "Leave request not found" };
      }

      const scopedProfileIds = await this.getScopedProfileIds(tx, auth);
      if (scopedProfileIds && !scopedProfileIds.includes(request.employeeProfileId)) {
        throw { statusCode: 403, message: "You do not have access to this leave request" };
      }

      return this.mapRequestResponse(tx, request);
    });
  }

  static async createLeaveRequest(input: CreateLeaveRequestInput, auth: AuthContext) {
    const startDate = parseDateOnly(input.startDate);
    const endDate = parseDateOnly(input.endDate);
    if (startDate > endDate) {
      throw { statusCode: 400, message: "startDate must be on or before endDate" };
    }

    if (startDate.getUTCFullYear() !== endDate.getUTCFullYear()) {
      throw {
        statusCode: 400,
        message: "Leave requests must fall within a single leave year in this implementation",
      };
    }

    const reason = String(input.reason || "").trim() || null;

    const result = await prisma.$transaction(async (tx) => {
      const employee = await this.getEmployeeProfile(tx, auth.profileId);
      if (employee.status !== "active") {
        throw { statusCode: 409, message: "Only active employees can submit leave requests" };
      }

      const leaveType = await this.getLeaveType(tx, Number(input.leaveTypeId));
      const policy = await this.resolvePolicy(tx, leaveType.id, employee, startDate);
      const attachmentDocumentIds = await this.validateAttachments(
        tx,
        auth,
        input.attachmentDocumentIds,
        leaveType.requiresAttachment
      );
      const metrics = await this.resolveRequestedMetrics(tx, input, leaveType, policy);

      const today = startOfTodayUtc();
      const noticeRule = await this.resolveNoticeRule(tx, policy.id, metrics.requestedHours);
      const requiredNoticeValue = noticeRule?.noticeValue ?? Number(policy.minNoticeDays || 0);
      const requiredNoticeUnit =
        noticeRule?.noticeUnit ??
        (policy.excludeWeekends || policy.excludePublicHolidays
          ? LeaveNoticeUnit.business_days
          : LeaveNoticeUnit.calendar_days);
      const noticeLead = await this.calculateNoticeLead(
        tx,
        today,
        metrics.startDate,
        requiredNoticeValue,
        requiredNoticeUnit,
        policy
      );
      if (requiredNoticeValue > 0 && noticeLead < requiredNoticeValue) {
        const noticeUnitLabel =
          requiredNoticeUnit === LeaveNoticeUnit.business_days ? "working day(s)" : "calendar day(s)";
        throw {
          statusCode: 400,
          message: `This leave type requires at least ${requiredNoticeValue} ${noticeUnitLabel} notice`,
        };
      }

      await this.ensureNoOverlappingLeave(tx, employee.id, metrics);

      const maxConsecutiveUnits = toNumber(policy.maxConsecutiveUnits);
      if (maxConsecutiveUnits > 0 && metrics.requestedUnits - maxConsecutiveUnits > EPSILON) {
        throw {
          statusCode: 400,
          message: `This leave type allows a maximum of ${maxConsecutiveUnits} unit(s) per stretch`,
        };
      }

      const maxUnitsPerRequest = toNumber(policy.maxUnitsPerRequest);
      if (maxUnitsPerRequest > 0 && metrics.requestedUnits - maxUnitsPerRequest > EPSILON) {
        throw {
          statusCode: 400,
          message: `This leave type allows a maximum of ${maxUnitsPerRequest} unit(s) per request`,
        };
      }

      const leaveYear = metrics.startDate.getUTCFullYear();
      const balance = await this.ensureBalanceSnapshot(
        tx,
        employee.id,
        leaveType.id,
        leaveYear,
        policy,
        metrics.startDate
      );

      if (
        leaveType.balanceTracked &&
        !policy.allowNegativeBalance &&
        toNumber(balance.availableUnits) - metrics.requestedUnits < -EPSILON
      ) {
        throw {
          statusCode: 409,
          message: "Insufficient leave balance for this request",
          details: {
            availableUnits: roundUnits(toNumber(balance.availableUnits)),
            requestedUnits: metrics.requestedUnits,
          },
        };
      }

      const { route, steps } = await this.buildApprovalSteps(
        tx,
        employee,
        policy,
        metrics.requestedHours,
        today
      );
      const initialStatus = steps.length > 0 ? resolveStatusForStage(steps[0].stageType) : LeaveRequestStatus.approved;

      const created = await tx.leaveRequest.create({
        data: {
          employeeProfileId: employee.id,
          leaveTypeId: leaveType.id,
          policyId: policy.id,
          currentApproverProfileId: steps[0]?.approverProfileId || null,
          startDate: metrics.startDate,
          endDate: metrics.endDate,
          startsAt: metrics.startsAt,
          endsAt: metrics.endsAt,
          startDayPortion: metrics.startDayPortion,
          endDayPortion: metrics.endDayPortion,
          requestedUnits: metrics.requestedUnits,
          deductedUnits: steps.length > 0 ? 0 : metrics.requestedUnits,
          requestedHours: metrics.requestedHours,
          deductedHours: steps.length > 0 ? 0 : metrics.requestedHours,
          status: initialStatus,
          reason,
          approvedAt: steps.length === 0 ? new Date() : null,
          approvalRouteSnapshot: route
            ? {
                routeId: route.id,
                routeName: route.name,
                matchedHours: metrics.requestedHours,
                stages: route.steps.map((step) => ({
                  stepNumber: step.stepNumber,
                  stageType: step.stageType,
                  approverSource: step.approverSource,
                  approverProfileId: step.approverProfileId,
                })),
              }
            : {
                routeName: "legacy_policy_route",
                matchedHours: metrics.requestedHours,
                requiresManagerApproval: Boolean(policy.requiresManagerApproval),
                requiresHrApproval: Boolean(policy.requiresHrApproval),
              },
          validationSnapshot: {
            policyId: policy.id,
            calculatedUnits: metrics.requestedUnits,
            calculatedHours: metrics.requestedHours,
            leaveYear,
            excludeWeekends: !!policy.excludeWeekends,
            excludePublicHolidays: !!policy.excludePublicHolidays,
            hoursPerWorkday: roundHours(toNumber(policy.hoursPerWorkday || 8)),
            startsAt: metrics.startsAt?.toISOString() || null,
            endsAt: metrics.endsAt?.toISOString() || null,
            attachmentDocumentIds,
          },
        },
        include: REQUEST_INCLUDE,
      });

      if (steps.length > 0) {
        await tx.leaveApprovalStep.createMany({
          data: steps.map((step) => ({
            leaveRequestId: created.id,
            stepNumber: step.stepNumber,
            stageType: step.stageType,
            approverProfileId: step.approverProfileId,
            delegatedFromProfileId: step.delegatedFromProfileId,
            decision: LeaveApprovalDecision.pending,
          })),
        });
      } else {
        await tx.leaveLedgerEntry.create({
          data: {
            employeeProfileId: employee.id,
            leaveTypeId: leaveType.id,
            leaveRequestId: created.id,
            leaveYear,
            transactionType: LeaveBalanceTransactionType.deduction,
            units: -metrics.requestedUnits,
            note: "Leave request auto-approved",
            effectiveDate: metrics.startDate,
            createdByProfileId: auth.profileId,
          },
        });
      }

      if (policy.autoProjectToTimesheet) {
        await this.createLeaveRequestSegments(
          tx,
          created.id,
          metrics.segments,
          steps.length > 0 ? LeaveRequestSegmentSyncStatus.projected : LeaveRequestSegmentSyncStatus.confirmed
        );
      }

      await this.syncRequestDocuments(tx, created.id, attachmentDocumentIds);
      await this.ensureBalanceSnapshot(
        tx,
        employee.id,
        leaveType.id,
        leaveYear,
        policy,
        metrics.startDate
      );

      const hydrated = await tx.leaveRequest.findUnique({
        where: { id: created.id },
        include: REQUEST_INCLUDE,
      });

      if (!hydrated) {
        throw { statusCode: 500, message: "Failed to reload created leave request" };
      }

      return {
        request: await this.mapRequestResponse(tx, hydrated),
        steps,
        employee,
        leaveType,
        requestedHours: metrics.requestedHours,
      };
    });

    await this.logAudit(auth, "leave.request_created", result.request.id, {
      leaveTypeId: result.leaveType.id,
      requestedUnits: result.request.requestedUnits,
      requestedHours: result.request.requestedHours,
      status: result.request.status,
    });

    if (result.steps[0]?.approverProfileId) {
      await this.dispatchRequestNotification(
        result.steps[0].approverProfileId,
        "Leave request awaiting approval",
        `${result.employee.firstName} ${result.employee.lastName} submitted a ${result.leaveType.name} request.`,
        result.request.id,
        auth
      );
    } else {
      await this.dispatchRequestNotification(
        result.employee.id,
        "Leave request approved",
        `Your ${result.leaveType.name} request was approved automatically.`,
        result.request.id,
        auth
      );
    }

    return result.request;
  }

  static async listApprovals(options: ListApprovalOptions, auth: AuthContext) {
    this.ensureApprovalAccess(auth);

    return prisma.$transaction(async (tx) => {
      const where: Prisma.LeaveRequestWhereInput = {
        status: options.status
          ? (options.status as LeaveRequestStatus)
          : { in: PENDING_REQUEST_STATUSES },
      };

      if (!(this.isPrivileged(auth) && options.scope === "all")) {
        where.currentApproverProfileId = auth.profileId;
      }

      const skip = (options.page - 1) * options.pageSize;
      const [items, total] = await Promise.all([
        tx.leaveRequest.findMany({
          where,
          include: REQUEST_INCLUDE,
          orderBy: [{ submittedAt: "asc" }],
          skip,
          take: options.pageSize,
        }),
        tx.leaveRequest.count({ where }),
      ]);

      return {
        approvals: items.map((item) => ({
          ...item,
          requestedUnits: roundUnits(toNumber(item.requestedUnits)),
          deductedUnits: roundUnits(toNumber(item.deductedUnits)),
          requestedHours: roundHours(toNumber(item.requestedHours)),
          deductedHours: roundHours(toNumber(item.deductedHours)),
        })),
        total,
      };
    });
  }

  static async approveLeaveRequest(requestId: number, input: ManageLeaveRequestInput, auth: AuthContext) {
    this.ensureApprovalAccess(auth);

    const result = await prisma.$transaction(async (tx) => {
      const request = await tx.leaveRequest.findUnique({
        where: { id: requestId },
        include: REQUEST_INCLUDE,
      });

      if (!request) {
        throw { statusCode: 404, message: "Leave request not found" };
      }
      if (!isPendingRequestStatus(request.status)) {
        throw { statusCode: 409, message: "Only pending leave requests can be approved" };
      }

      const pendingStep = request.approvalSteps.find(
        (step) => step.decision === LeaveApprovalDecision.pending
      );

      if (!pendingStep) {
        throw { statusCode: 409, message: "This leave request has no pending approval step" };
      }

      if (!this.isPrivileged(auth) && pendingStep.approverProfileId !== auth.profileId) {
        throw { statusCode: 403, message: "You are not the active approver for this leave request" };
      }

      await tx.leaveApprovalStep.update({
        where: { id: pendingStep.id },
        data: {
          decision: LeaveApprovalDecision.approved,
          notes: String(input.notes || "").trim() || null,
          actedAt: new Date(),
        },
      });

      const nextStep = request.approvalSteps.find(
        (step) => step.decision === LeaveApprovalDecision.pending && step.stepNumber > pendingStep.stepNumber
      );

      let updatedRequest;
      if (nextStep) {
        updatedRequest = await tx.leaveRequest.update({
          where: { id: request.id },
          data: {
            currentApproverProfileId: nextStep.approverProfileId,
            status: resolveStatusForStage(nextStep.stageType),
          },
          include: REQUEST_INCLUDE,
        });
      } else {
        const conflictingTimeEntries = await tx.timeEntry.count({
          where: {
            employeeProfileId: request.employeeProfileId,
            dateWorked: { gte: request.startDate, lte: request.endDate },
            status: { in: ["submitted", "approved"] as any },
          },
        });
        if (conflictingTimeEntries > 0) {
          throw {
            statusCode: 409,
            message: `Cannot approve leave: ${conflictingTimeEntries} time entr${conflictingTimeEntries === 1 ? "y" : "ies"} already exist for these dates. Reject or remove them before approving leave.`,
          };
        }

        const leaveYear = request.startDate.getUTCFullYear();
        await tx.leaveLedgerEntry.create({
          data: {
            employeeProfileId: request.employeeProfileId,
            leaveTypeId: request.leaveTypeId,
            leaveRequestId: request.id,
            createdByProfileId: auth.profileId,
            leaveYear,
            transactionType: LeaveBalanceTransactionType.deduction,
            units: -roundUnits(toNumber(request.requestedUnits)),
            note: String(input.notes || "").trim() || "Leave approved",
            effectiveDate: request.startDate,
          },
        });

        if (request.policy) {
          await this.ensureBalanceSnapshot(
            tx,
            request.employeeProfileId,
            request.leaveTypeId,
            leaveYear,
            request.policy,
            request.startDate
          );
        }

        updatedRequest = await tx.leaveRequest.update({
          where: { id: request.id },
          data: {
            status: LeaveRequestStatus.approved,
            currentApproverProfileId: null,
            approvedAt: new Date(),
            deductedUnits: request.requestedUnits,
            deductedHours: request.requestedHours,
          },
          include: REQUEST_INCLUDE,
        });

        await this.updateLeaveRequestSegmentStatus(
          tx,
          request.id,
          LeaveRequestSegmentSyncStatus.confirmed
        );
      }

      return { request: updatedRequest, pendingStep, nextStep };
    });

    await this.logAudit(auth, "leave.request_approved", result.request.id, {
      stepId: result.pendingStep.id,
      nextApproverProfileId: result.nextStep?.approverProfileId ?? null,
      status: result.request.status,
    });

    if (result.nextStep?.approverProfileId) {
      await this.dispatchRequestNotification(
        result.nextStep.approverProfileId,
        "Leave request awaiting your review",
        `${result.request.employee.firstName} ${result.request.employee.lastName}'s leave request advanced to your approval step.`,
        result.request.id,
        auth
      );
    }

    await this.dispatchRequestNotification(
      result.request.employeeProfileId,
      result.request.status === LeaveRequestStatus.approved
        ? "Leave request approved"
        : "Leave request advanced",
      result.request.status === LeaveRequestStatus.approved
        ? `Your ${result.request.leaveType.name} request has been approved.`
        : `Your ${result.request.leaveType.name} request moved to the next approval step.`,
      result.request.id,
      auth
    );

    return result.request;
  }

  static async declineLeaveRequest(requestId: number, input: ManageLeaveRequestInput, auth: AuthContext) {
    this.ensureApprovalAccess(auth);
    const reason = String(input.reason || input.notes || "").trim();
    if (!reason) {
      throw { statusCode: 400, message: "A decline reason is required" };
    }

    const result = await prisma.$transaction(async (tx) => {
      const request = await tx.leaveRequest.findUnique({
        where: { id: requestId },
        include: REQUEST_INCLUDE,
      });

      if (!request) throw { statusCode: 404, message: "Leave request not found" };
      if (!isPendingRequestStatus(request.status)) {
        throw { statusCode: 409, message: "Only pending leave requests can be declined" };
      }

      const pendingStep = request.approvalSteps.find(
        (step) => step.decision === LeaveApprovalDecision.pending
      );
      if (!pendingStep) {
        throw { statusCode: 409, message: "This leave request has no pending approval step" };
      }
      if (!this.isPrivileged(auth) && pendingStep.approverProfileId !== auth.profileId) {
        throw { statusCode: 403, message: "You are not the active approver for this leave request" };
      }

      await tx.leaveApprovalStep.update({
        where: { id: pendingStep.id },
        data: {
          decision: LeaveApprovalDecision.declined,
          notes: reason,
          actedAt: new Date(),
        },
      });

      await tx.leaveApprovalStep.updateMany({
        where: {
          leaveRequestId: request.id,
          decision: LeaveApprovalDecision.pending,
        },
        data: {
          decision: LeaveApprovalDecision.skipped,
          notes: "Skipped because the leave request was declined",
          actedAt: new Date(),
        },
      });

      const declined = await tx.leaveRequest.update({
        where: { id: request.id },
        data: {
          status: LeaveRequestStatus.declined,
          currentApproverProfileId: null,
          declineReason: reason,
          declinedAt: new Date(),
        },
        include: REQUEST_INCLUDE,
      });

      if (request.policy) {
        await this.ensureBalanceSnapshot(
          tx,
          request.employeeProfileId,
          request.leaveTypeId,
          request.startDate.getUTCFullYear(),
          request.policy,
          request.startDate
        );
      }

      await this.updateLeaveRequestSegmentStatus(
        tx,
        request.id,
        LeaveRequestSegmentSyncStatus.voided
      );

      return { request: declined, pendingStep };
    });

    await this.logAudit(auth, "leave.request_declined", result.request.id, {
      stepId: result.pendingStep.id,
      reason,
    });

    await this.dispatchRequestNotification(
      result.request.employeeProfileId,
      "Leave request declined",
      `Your ${result.request.leaveType.name} request was declined. Reason: ${reason}`,
      result.request.id,
      auth
    );

    return result.request;
  }

  static async cancelLeaveRequest(requestId: number, input: ManageLeaveRequestInput, auth: AuthContext) {
    const cancellationReason = String(input.reason || input.notes || "").trim() || null;

    const result = await prisma.$transaction(async (tx) => {
      const request = await tx.leaveRequest.findUnique({
        where: { id: requestId },
        include: REQUEST_INCLUDE,
      });

      if (!request) {
        throw { statusCode: 404, message: "Leave request not found" };
      }

      const directReportIds = this.isManagerLike(auth)
        ? await this.getTeamProfileIds(tx, auth.profileId)
        : [];
      const inScope =
        request.employeeProfileId === auth.profileId ||
        this.isPrivileged(auth) ||
        directReportIds.includes(request.employeeProfileId);
      if (!inScope) {
        throw { statusCode: 403, message: "You cannot cancel this leave request" };
      }

      if (isClosedRequestStatus(request.status)) {
        throw { statusCode: 409, message: "This leave request is already closed" };
      }

      await tx.leaveApprovalStep.updateMany({
        where: {
          leaveRequestId: request.id,
          decision: LeaveApprovalDecision.pending,
        },
        data: {
          decision: LeaveApprovalDecision.skipped,
          notes: "Skipped because the leave request was cancelled",
          actedAt: new Date(),
        },
      });

      if (request.status === LeaveRequestStatus.approved) {
        await tx.leaveLedgerEntry.create({
          data: {
            employeeProfileId: request.employeeProfileId,
            leaveTypeId: request.leaveTypeId,
            leaveRequestId: request.id,
            createdByProfileId: auth.profileId,
            leaveYear: request.startDate.getUTCFullYear(),
            transactionType: LeaveBalanceTransactionType.reversal,
            units: roundUnits(toNumber(request.deductedUnits || request.requestedUnits)),
            note: cancellationReason || "Approved leave request cancelled",
            effectiveDate: new Date(),
          },
        });
      }

      await this.updateLeaveRequestSegmentStatus(
        tx,
        request.id,
        LeaveRequestSegmentSyncStatus.voided
      );

      const cancelled = await tx.leaveRequest.update({
        where: { id: request.id },
        data: {
          status: LeaveRequestStatus.cancelled,
          currentApproverProfileId: null,
          cancellationReason,
          cancelledAt: new Date(),
        },
        include: REQUEST_INCLUDE,
      });

      if (request.policy) {
        await this.ensureBalanceSnapshot(
          tx,
          request.employeeProfileId,
          request.leaveTypeId,
          request.startDate.getUTCFullYear(),
          request.policy,
          request.startDate
        );
      }

      return cancelled;
    });

    await this.logAudit(auth, "leave.request_cancelled", result.id, {
      reason: cancellationReason,
    });

    if (result.employeeProfileId !== auth.profileId) {
      await this.dispatchRequestNotification(
        result.employeeProfileId,
        "Leave request cancelled",
        `Your ${result.leaveType.name} request was cancelled.`,
        result.id,
        auth
      );
    }

    return result;
  }

  static async listCalendar(options: CalendarOptions, auth: AuthContext) {
    return prisma.$transaction(async (tx) => {
      let scopedProfileIds: number[] | null = null;
      switch (options.scope) {
        case "org":
          if (!this.isPrivileged(auth)) {
            throw { statusCode: 403, message: "Only HR/Admin can view the organization leave calendar" };
          }
          break;
        case "team":
          if (!this.isPrivileged(auth) && !this.isManagerLike(auth)) {
            throw { statusCode: 403, message: "Team calendar access requires manager scope" };
          }
          scopedProfileIds = this.isPrivileged(auth)
            ? null
            : [auth.profileId, ...(await this.getTeamProfileIds(tx, auth.profileId))];
          break;
        case "mine":
        default:
          scopedProfileIds = [auth.profileId];
          break;
      }

      const leaveWhere: Prisma.LeaveRequestWhereInput = {
        startDate: { lte: options.dateTo },
        endDate: { gte: options.dateFrom },
        status: {
          in: (options.statuses?.length
            ? options.statuses
            : [
              LeaveRequestStatus.pending_manager_approval,
                LeaveRequestStatus.pending_partner_approval,
                LeaveRequestStatus.pending_hr_approval,
                LeaveRequestStatus.approved,
              ]) as LeaveRequestStatus[],
        },
        ...(scopedProfileIds ? { employeeProfileId: { in: scopedProfileIds } } : {}),
      };

      const [requests, holidays] = await Promise.all([
        tx.leaveRequest.findMany({
          where: leaveWhere,
          include: {
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                department: { select: { id: true, name: true } },
              },
            },
            leaveType: { select: { id: true, name: true, color: true } },
          },
          orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
        }),
        tx.publicHoliday.findMany({
          where: {
            OR: [
              { holidayDate: { gte: options.dateFrom, lte: options.dateTo } },
              { isRecurring: true },
            ],
          },
          orderBy: [{ holidayDate: "asc" }],
        }),
      ]);

      return {
        requests: requests.map((request) => ({
          ...request,
          requestedUnits: roundUnits(toNumber(request.requestedUnits)),
          deductedUnits: roundUnits(toNumber(request.deductedUnits)),
          requestedHours: roundHours(toNumber(request.requestedHours)),
          deductedHours: roundHours(toNumber(request.deductedHours)),
        })),
        holidays,
      };
    });
  }

  static async listLeaveTypes(auth: AuthContext) {
    const canAdmin = this.isPrivileged(auth);
    return prisma.leaveType.findMany({
      where: canAdmin ? undefined : { isActive: true },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    });
  }

  static async createLeaveType(input: CreateLeaveTypeInput, auth: AuthContext) {
    this.ensureAdminAccess(auth);
    const created = await prisma.leaveType.create({
      data: {
        code: String(input.code || "").trim().toUpperCase(),
        name: String(input.name || "").trim(),
        description: String(input.description || "").trim() || null,
        color: String(input.color || "").trim() || null,
        isActive: input.isActive ?? true,
        isPaid: input.isPaid ?? true,
        balanceTracked: input.balanceTracked ?? true,
        requiresAttachment: input.requiresAttachment ?? false,
        allowsHalfDay: input.allowsHalfDay ?? true,
        unitType: input.unitType || LeaveUnitType.day,
        defaultNoticeDays: Number(input.defaultNoticeDays || 0),
        defaultMaxUnits:
          input.defaultMaxUnits === null || input.defaultMaxUnits === undefined
            ? null
            : roundUnits(Number(input.defaultMaxUnits)),
      },
    });

    await createAudit({
      action: "leave.type_created",
      entity_type: "leave_type",
      entity_id: created.id,
      user_id: auth.userId,
      metadata: { actorProfileId: auth.profileId, code: created.code },
    });

    return created;
  }

  static async updateLeaveType(leaveTypeId: number, input: Partial<CreateLeaveTypeInput>, auth: AuthContext) {
    this.ensureAdminAccess(auth);
    const updated = await prisma.leaveType.update({
      where: { id: leaveTypeId },
      data: {
        ...(input.code !== undefined ? { code: String(input.code || "").trim().toUpperCase() } : {}),
        ...(input.name !== undefined ? { name: String(input.name || "").trim() } : {}),
        ...(input.description !== undefined ? { description: String(input.description || "").trim() || null } : {}),
        ...(input.color !== undefined ? { color: String(input.color || "").trim() || null } : {}),
        ...(input.isActive !== undefined ? { isActive: Boolean(input.isActive) } : {}),
        ...(input.isPaid !== undefined ? { isPaid: Boolean(input.isPaid) } : {}),
        ...(input.balanceTracked !== undefined ? { balanceTracked: Boolean(input.balanceTracked) } : {}),
        ...(input.requiresAttachment !== undefined ? { requiresAttachment: Boolean(input.requiresAttachment) } : {}),
        ...(input.allowsHalfDay !== undefined ? { allowsHalfDay: Boolean(input.allowsHalfDay) } : {}),
        ...(input.unitType !== undefined ? { unitType: input.unitType } : {}),
        ...(input.defaultNoticeDays !== undefined ? { defaultNoticeDays: Number(input.defaultNoticeDays || 0) } : {}),
        ...(input.defaultMaxUnits !== undefined
          ? {
              defaultMaxUnits:
                input.defaultMaxUnits === null ? null : roundUnits(Number(input.defaultMaxUnits || 0)),
            }
          : {}),
      },
    });

    await createAudit({
      action: "leave.type_updated",
      entity_type: "leave_type",
      entity_id: updated.id,
      user_id: auth.userId,
      metadata: { actorProfileId: auth.profileId },
    });

    return updated;
  }

  static async deleteLeaveType(leaveTypeId: number, auth: AuthContext) {
    this.ensureAdminAccess(auth);
    const updated = await prisma.leaveType.update({
      where: { id: leaveTypeId },
      data: { isActive: false },
    });
    await createAudit({
      action: "leave.type_deactivated",
      entity_type: "leave_type",
      entity_id: updated.id,
      user_id: auth.userId,
      metadata: { actorProfileId: auth.profileId },
    });
    return updated;
  }

  static async listPolicies(auth: AuthContext) {
    this.ensureAdminAccess(auth);
    return prisma.leavePolicy.findMany({
      include: POLICY_INCLUDE,
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    });
  }

  static async createPolicy(input: CreateLeavePolicyInput, auth: AuthContext) {
    this.ensureAdminAccess(auth);
    const created = await prisma.$transaction(async (tx) => {
      const basePolicy = await tx.leavePolicy.create({
        data: {
          leaveTypeId: Number(input.leaveTypeId),
          name: String(input.name || "").trim(),
          description: String(input.description || "").trim() || null,
          isActive: input.isActive ?? true,
          effectiveFrom: input.effectiveFrom ? parseDateOnly(input.effectiveFrom) : null,
          effectiveTo: input.effectiveTo ? parseDateOnly(input.effectiveTo) : null,
          annualEntitlement: roundUnits(Number(input.annualEntitlement || 0)),
          carryoverCap: roundUnits(Number(input.carryoverCap || 0)),
          accrualEnabled: input.accrualEnabled ?? true,
          accrualFrequency: String(input.accrualFrequency || "monthly") as any,
          accrualRate: roundUnits(Number(input.accrualRate || 0)),
          requiresManagerApproval: input.requiresManagerApproval ?? true,
          requiresHrApproval: input.requiresHrApproval ?? false,
          excludeWeekends: input.excludeWeekends ?? true,
          excludePublicHolidays: input.excludePublicHolidays ?? true,
          minNoticeDays: Number(input.minNoticeDays || 0),
          hoursPerWorkday: Math.max(0.25, roundHours(Number(input.hoursPerWorkday || 8))),
          autoProjectToTimesheet: input.autoProjectToTimesheet ?? true,
          maxConsecutiveUnits: roundUnits(Number(input.maxConsecutiveUnits || 0)),
          maxUnitsPerRequest: roundUnits(Number(input.maxUnitsPerRequest || 0)),
          allowNegativeBalance: input.allowNegativeBalance ?? false,
        },
      });

      await this.syncPolicyRules(tx, basePolicy.id, input);
      return tx.leavePolicy.findUniqueOrThrow({
        where: { id: basePolicy.id },
        include: POLICY_INCLUDE,
      });
    });

    await createAudit({
      action: "leave.policy_created",
      entity_type: "leave_policy",
      entity_id: created.id,
      user_id: auth.userId,
      metadata: { actorProfileId: auth.profileId, leaveTypeId: created.leaveTypeId },
    });

    return created;
  }

  static async updatePolicy(policyId: number, input: Partial<CreateLeavePolicyInput>, auth: AuthContext) {
    this.ensureAdminAccess(auth);
    const updated = await prisma.$transaction(async (tx) => {
      await tx.leavePolicy.update({
        where: { id: policyId },
        data: {
          ...(input.leaveTypeId !== undefined ? { leaveTypeId: Number(input.leaveTypeId) } : {}),
          ...(input.name !== undefined ? { name: String(input.name || "").trim() } : {}),
          ...(input.description !== undefined
            ? { description: String(input.description || "").trim() || null }
            : {}),
          ...(input.isActive !== undefined ? { isActive: Boolean(input.isActive) } : {}),
          ...(input.effectiveFrom !== undefined
            ? { effectiveFrom: input.effectiveFrom ? parseDateOnly(input.effectiveFrom) : null }
            : {}),
          ...(input.effectiveTo !== undefined
            ? { effectiveTo: input.effectiveTo ? parseDateOnly(input.effectiveTo) : null }
            : {}),
          ...(input.annualEntitlement !== undefined
            ? { annualEntitlement: roundUnits(Number(input.annualEntitlement || 0)) }
            : {}),
          ...(input.carryoverCap !== undefined
            ? { carryoverCap: roundUnits(Number(input.carryoverCap || 0)) }
            : {}),
          ...(input.accrualEnabled !== undefined
            ? { accrualEnabled: Boolean(input.accrualEnabled) }
            : {}),
          ...(input.accrualFrequency !== undefined
            ? { accrualFrequency: String(input.accrualFrequency) as any }
            : {}),
          ...(input.accrualRate !== undefined
            ? { accrualRate: roundUnits(Number(input.accrualRate || 0)) }
            : {}),
          ...(input.requiresManagerApproval !== undefined
            ? { requiresManagerApproval: Boolean(input.requiresManagerApproval) }
            : {}),
          ...(input.requiresHrApproval !== undefined
            ? { requiresHrApproval: Boolean(input.requiresHrApproval) }
            : {}),
          ...(input.excludeWeekends !== undefined
            ? { excludeWeekends: Boolean(input.excludeWeekends) }
            : {}),
          ...(input.excludePublicHolidays !== undefined
            ? { excludePublicHolidays: Boolean(input.excludePublicHolidays) }
            : {}),
          ...(input.minNoticeDays !== undefined ? { minNoticeDays: Number(input.minNoticeDays || 0) } : {}),
          ...(input.hoursPerWorkday !== undefined
            ? { hoursPerWorkday: Math.max(0.25, roundHours(Number(input.hoursPerWorkday || 8))) }
            : {}),
          ...(input.autoProjectToTimesheet !== undefined
            ? { autoProjectToTimesheet: Boolean(input.autoProjectToTimesheet) }
            : {}),
          ...(input.maxConsecutiveUnits !== undefined
            ? { maxConsecutiveUnits: roundUnits(Number(input.maxConsecutiveUnits || 0)) }
            : {}),
          ...(input.maxUnitsPerRequest !== undefined
            ? { maxUnitsPerRequest: roundUnits(Number(input.maxUnitsPerRequest || 0)) }
            : {}),
          ...(input.allowNegativeBalance !== undefined
            ? { allowNegativeBalance: Boolean(input.allowNegativeBalance) }
            : {}),
        },
      });

      await this.syncPolicyRules(tx, policyId, input);
      return tx.leavePolicy.findUniqueOrThrow({
        where: { id: policyId },
        include: POLICY_INCLUDE,
      });
    });

    await createAudit({
      action: "leave.policy_updated",
      entity_type: "leave_policy",
      entity_id: updated.id,
      user_id: auth.userId,
      metadata: { actorProfileId: auth.profileId },
    });

    return updated;
  }

  static async deletePolicy(policyId: number, auth: AuthContext) {
    this.ensureAdminAccess(auth);
    const updated = await prisma.leavePolicy.update({
      where: { id: policyId },
      data: { isActive: false },
    });
    await createAudit({
      action: "leave.policy_deactivated",
      entity_type: "leave_policy",
      entity_id: updated.id,
      user_id: auth.userId,
      metadata: { actorProfileId: auth.profileId },
    });
    return updated;
  }

  static async listPolicyAssignments(auth: AuthContext) {
    this.ensureAdminAccess(auth);
    return prisma.leavePolicyAssignment.findMany({
      include: {
        policy: {
          include: { leaveType: { select: { id: true, code: true, name: true } } },
        },
        department: { select: { id: true, name: true } },
        role: { select: { id: true, name: true } },
        profile: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [{ priority: "asc" }, { id: "asc" }],
    });
  }

  static async createPolicyAssignment(input: CreatePolicyAssignmentInput, auth: AuthContext) {
    this.ensureAdminAccess(auth);
    const scope = String(input.scope || "global") as LeavePolicyAssignmentScope;
    if (scope === LeavePolicyAssignmentScope.department && !input.departmentId) {
      throw { statusCode: 400, message: "departmentId is required for department assignments" };
    }
    if (scope === LeavePolicyAssignmentScope.role && !input.roleId) {
      throw { statusCode: 400, message: "roleId is required for role assignments" };
    }
    if (scope === LeavePolicyAssignmentScope.employee && !input.profileId) {
      throw { statusCode: 400, message: "profileId is required for employee assignments" };
    }

    const created = await prisma.leavePolicyAssignment.create({
      data: {
        policyId: Number(input.policyId),
        scope,
        departmentId: input.departmentId ? Number(input.departmentId) : null,
        roleId: input.roleId ? Number(input.roleId) : null,
        profileId: input.profileId ? Number(input.profileId) : null,
        priority: Number(input.priority || 100),
      },
      include: {
        policy: { include: { leaveType: { select: { id: true, code: true, name: true } } } },
        department: { select: { id: true, name: true } },
        role: { select: { id: true, name: true } },
        profile: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    await createAudit({
      action: "leave.policy_assignment_created",
      entity_type: "leave_policy_assignment",
      entity_id: created.id,
      user_id: auth.userId,
      metadata: { actorProfileId: auth.profileId, scope },
    });

    return created;
  }

  static async deletePolicyAssignment(assignmentId: number, auth: AuthContext) {
    this.ensureAdminAccess(auth);
    const deleted = await prisma.leavePolicyAssignment.delete({ where: { id: assignmentId } });
    await createAudit({
      action: "leave.policy_assignment_deleted",
      entity_type: "leave_policy_assignment",
      entity_id: deleted.id,
      user_id: auth.userId,
      metadata: { actorProfileId: auth.profileId },
    });
    return deleted;
  }

  static async listPublicHolidays(auth: AuthContext, filters?: { dateFrom?: Date; dateTo?: Date }) {
    this.ensureAdminAccess(auth);
    return prisma.publicHoliday.findMany({
      where: {
        ...(filters?.dateFrom || filters?.dateTo
          ? {
              holidayDate: {
                ...(filters?.dateFrom ? { gte: filters.dateFrom } : {}),
                ...(filters?.dateTo ? { lte: filters.dateTo } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ holidayDate: "asc" }],
    });
  }

  static async createPublicHoliday(input: CreatePublicHolidayInput, auth: AuthContext) {
    this.ensureAdminAccess(auth);
    const created = await prisma.publicHoliday.create({
      data: {
        name: String(input.name || "").trim(),
        holidayDate: parseDateOnly(input.holidayDate),
        countryCode: String(input.countryCode || DEFAULT_COUNTRY_CODE).trim().toUpperCase(),
        region: String(input.region || "").trim() || null,
        isRecurring: input.isRecurring ?? false,
      },
    });
    await createAudit({
      action: "leave.public_holiday_created",
      entity_type: "public_holiday",
      entity_id: created.id,
      user_id: auth.userId,
      metadata: { actorProfileId: auth.profileId, countryCode: created.countryCode },
    });
    return created;
  }

  static async updatePublicHoliday(holidayId: number, input: Partial<CreatePublicHolidayInput>, auth: AuthContext) {
    this.ensureAdminAccess(auth);
    const updated = await prisma.publicHoliday.update({
      where: { id: holidayId },
      data: {
        ...(input.name !== undefined ? { name: String(input.name || "").trim() } : {}),
        ...(input.holidayDate !== undefined ? { holidayDate: parseDateOnly(input.holidayDate) } : {}),
        ...(input.countryCode !== undefined
          ? { countryCode: String(input.countryCode || DEFAULT_COUNTRY_CODE).trim().toUpperCase() }
          : {}),
        ...(input.region !== undefined ? { region: String(input.region || "").trim() || null } : {}),
        ...(input.isRecurring !== undefined ? { isRecurring: Boolean(input.isRecurring) } : {}),
      },
    });
    await createAudit({
      action: "leave.public_holiday_updated",
      entity_type: "public_holiday",
      entity_id: updated.id,
      user_id: auth.userId,
      metadata: { actorProfileId: auth.profileId },
    });
    return updated;
  }

  static async deletePublicHoliday(holidayId: number, auth: AuthContext) {
    this.ensureAdminAccess(auth);
    const deleted = await prisma.publicHoliday.delete({ where: { id: holidayId } });
    await createAudit({
      action: "leave.public_holiday_deleted",
      entity_type: "public_holiday",
      entity_id: deleted.id,
      user_id: auth.userId,
      metadata: { actorProfileId: auth.profileId },
    });
    return deleted;
  }

  static async adjustBalance(input: AdjustBalanceInput, auth: AuthContext) {
    this.ensureAdminAccess(auth);

    return prisma.$transaction(async (tx) => {
      const employee = await this.getEmployeeProfile(tx, Number(input.employeeProfileId));
      const leaveType = await this.getLeaveType(tx, Number(input.leaveTypeId));
      const effectiveDate = input.effectiveDate ? parseDateOnly(input.effectiveDate) : startOfTodayUtc();
      const leaveYear = Number(input.leaveYear || effectiveDate.getUTCFullYear());
      const policy = await this.resolvePolicy(tx, leaveType.id, employee, effectiveDate);

      await this.ensureBalanceSnapshot(tx, employee.id, leaveType.id, leaveYear, policy, effectiveDate);
      await tx.leaveLedgerEntry.create({
        data: {
          employeeProfileId: employee.id,
          leaveTypeId: leaveType.id,
          createdByProfileId: auth.profileId,
          leaveYear,
          transactionType: LeaveBalanceTransactionType.adjustment,
          units: roundUnits(Number(input.units || 0)),
          note: String(input.note || "").trim() || "Manual leave balance adjustment",
          effectiveDate,
        },
      });

      const balance = await this.ensureBalanceSnapshot(
        tx,
        employee.id,
        leaveType.id,
        leaveYear,
        policy,
        effectiveDate
      );

      await createAudit({
        action: "leave.balance_adjusted",
        entity_type: "leave_balance",
        entity_id: balance.id,
        user_id: auth.userId,
        metadata: {
          actorProfileId: auth.profileId,
          employeeProfileId: employee.id,
          leaveTypeId: leaveType.id,
          units: roundUnits(Number(input.units || 0)),
          leaveYear,
        },
      });

      return {
        ...balance,
        availableUnits: roundUnits(toNumber(balance.availableUnits)),
        adjustedUnits: roundUnits(toNumber(balance.adjustedUnits)),
      };
    });
  }

  static async getReportSummary(auth: AuthContext, options?: { dateFrom?: Date; dateTo?: Date }) {
    if (!this.isPrivileged(auth) && !this.isManagerLike(auth)) {
      throw { statusCode: 403, message: "Manager or HR access is required" };
    }
    const dateFrom = options?.dateFrom || beginningOfYear(startOfTodayUtc().getUTCFullYear());
    const dateTo = options?.dateTo || endOfYear(startOfTodayUtc().getUTCFullYear());
    return prisma.$transaction(async (tx) => {
      const scopedProfileIds = await this.getScopedProfileIds(tx, auth);
      const currentYear = startOfTodayUtc().getUTCFullYear();
      const scopeWhere = scopedProfileIds ? { employeeProfileId: { in: scopedProfileIds } } : {};

      const [requests, balances] = await Promise.all([
        tx.leaveRequest.findMany({
          where: {
            ...scopeWhere,
            startDate: { lte: dateTo },
            endDate: { gte: dateFrom },
          },
          include: {
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                department: { select: { id: true, name: true } },
              },
            },
            leaveType: { select: { id: true, name: true } },
          },
          orderBy: [{ startDate: "asc" }],
        }),
        tx.leaveBalance.findMany({
          where: {
            ...(scopedProfileIds ? { employeeProfileId: { in: scopedProfileIds } } : {}),
            leaveYear: currentYear,
          },
          include: {
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                department: { select: { id: true, name: true } },
              },
            },
            leaveType: { select: { id: true, name: true, unitType: true } },
          },
          orderBy: [{ availableUnits: "asc" }],
        }),
      ]);

      const today = startOfTodayUtc();
      const upcomingAbsences = requests
        .filter(
          (request) =>
            request.status === LeaveRequestStatus.approved && request.startDate >= startOfTodayUtc()
        )
        .slice(0, 10)
        .map((request) => ({
          id: request.id,
          employeeName: `${request.employee.firstName} ${request.employee.lastName}`.trim(),
          leaveType: request.leaveType.name,
          startDate: request.startDate,
          endDate: request.endDate,
          units: roundUnits(toNumber(request.requestedUnits)),
          hours: roundHours(toNumber(request.requestedHours)),
        }));

      const employeesOnLeaveNow = requests
        .filter(
          (request) =>
            request.status === LeaveRequestStatus.approved &&
            request.startDate <= today &&
            request.endDate >= today
        )
        .map((request) => ({
          id: request.id,
          employeeName: `${request.employee.firstName} ${request.employee.lastName}`.trim(),
          departmentName: request.employee.department?.name || "Unassigned",
          leaveType: request.leaveType.name,
          startDate: request.startDate,
          endDate: request.endDate,
          units: roundUnits(toNumber(request.requestedUnits)),
          hours: roundHours(toNumber(request.requestedHours)),
        }));

      const byType = new Map<string, number>();
      const byDepartment = new Map<string, number>();
      const pendingByStage = {
        manager: 0,
        partner: 0,
        hr: 0,
      };
      let pendingApprovals = 0;
      let declinedCount = 0;
      let cancelledCount = 0;

      for (const request of requests) {
        if (request.status === LeaveRequestStatus.pending_manager_approval) {
          pendingApprovals += 1;
          pendingByStage.manager += 1;
        } else if (request.status === LeaveRequestStatus.pending_partner_approval) {
          pendingApprovals += 1;
          pendingByStage.partner += 1;
        } else if (request.status === LeaveRequestStatus.pending_hr_approval) {
          pendingApprovals += 1;
          pendingByStage.hr += 1;
        }

        if (request.status === LeaveRequestStatus.declined) declinedCount += 1;
        if (request.status === LeaveRequestStatus.cancelled) cancelledCount += 1;
        if (request.status !== LeaveRequestStatus.approved) continue;

        const units = roundUnits(toNumber(request.requestedUnits));
        byType.set(request.leaveType.name, roundUnits((byType.get(request.leaveType.name) || 0) + units));
        const departmentName = request.employee.department?.name || "Unassigned";
        byDepartment.set(departmentName, roundUnits((byDepartment.get(departmentName) || 0) + units));
      }

      const leaveBalances = balances.map((balance) => ({
        id: balance.id,
        employeeProfileId: balance.employeeProfileId,
        employeeName: `${balance.employee.firstName} ${balance.employee.lastName}`.trim(),
        departmentName: balance.employee.department?.name || "Unassigned",
        leaveType: balance.leaveType.name,
        leaveUnitType: balance.leaveType.unitType,
        availableUnits: roundUnits(toNumber(balance.availableUnits)),
        pendingUnits: roundUnits(toNumber(balance.pendingUnits)),
        usedUnits: roundUnits(toNumber(balance.usedUnits)),
      }));

      const departmentBalancesMap = new Map<
        string,
        { departmentName: string; availableUnits: number; pendingUnits: number; usedUnits: number }
      >();
      for (const balance of balances) {
        const departmentName = balance.employee.department?.name || "Unassigned";
        const current =
          departmentBalancesMap.get(departmentName) || {
            departmentName,
            availableUnits: 0,
            pendingUnits: 0,
            usedUnits: 0,
          };
        current.availableUnits = roundUnits(current.availableUnits + toNumber(balance.availableUnits));
        current.pendingUnits = roundUnits(current.pendingUnits + toNumber(balance.pendingUnits));
        current.usedUnits = roundUnits(current.usedUnits + toNumber(balance.usedUnits));
        departmentBalancesMap.set(departmentName, current);
      }

      return {
        totalRequests: requests.length,
        pendingApprovals,
        declinedCount,
        cancelledCount,
        pendingByStage,
        utilizationByType: Array.from(byType.entries()).map(([leaveType, units]) => ({
          leaveType,
          units,
        })),
        departmentUsage: Array.from(byDepartment.entries()).map(([departmentName, units]) => ({
          departmentName,
          units,
        })),
        upcomingAbsences,
        employeesOnLeaveNow,
        leaveBalances,
        departmentBalances: Array.from(departmentBalancesMap.values()).sort((left, right) =>
          left.departmentName.localeCompare(right.departmentName)
        ),
      };
    });
  }
}

export default LeaveService;
