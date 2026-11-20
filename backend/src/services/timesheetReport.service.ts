import prisma from "../prisma";

export type TimesheetReportScope = "self" | "team" | "department" | "partner" | "firm";
export type TimesheetReportPeriod = "monthly" | "quarterly" | "yearly" | "custom";
export type TimesheetReportGroup = "staff" | "job" | "client";
export type TimesheetReportMode = "summary" | "detailed";

interface AuthContext {
  userId: number;
  profileId: number;
  roles?: string[];
  roleName?: string | null;
}

interface ReportFilters {
  period?: TimesheetReportPeriod;
  anchorDate?: Date;
  dateFrom?: Date;
  dateTo?: Date;
  scope?: TimesheetReportScope;
  status?: string;
  employeeProfileId?: number;
  departmentId?: number;
  partnerProfileId?: number;
  jobId?: number;
  jobKey?: string;
  clientId?: number;
  clientKey?: string;
  taskId?: number;
}

const ACTIVE_STATUSES = ["pending", "submitted", "approved"];

const roundHours = (value: number) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const roundMoney = (value: number) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const normalizeRoles = (auth: AuthContext) =>
  new Set(
    [auth.roleName, ...(auth.roles || [])]
      .filter(Boolean)
      .map((role) =>
        String(role).trim().toLowerCase().replace(/[\s-]+/g, "_")
      )
  );

const toUtcDate = (value: Date) =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));

const dateKey = (value: Date) => toUtcDate(value).toISOString().slice(0, 10);

const resolvePeriodRange = (filters: ReportFilters) => {
  if (filters.dateFrom || filters.dateTo) {
    const start = filters.dateFrom
      ? toUtcDate(filters.dateFrom)
      : new Date(Date.UTC(2000, 0, 1));
    const end = filters.dateTo
      ? new Date(toUtcDate(filters.dateTo).getTime() + 24 * 60 * 60 * 1000 - 1)
      : new Date();
    return {
      startDate: start,
      endDate: end,
      label: `${dateKey(start)} to ${dateKey(end)}`,
      period: "custom" as TimesheetReportPeriod,
    };
  }

  const anchor = filters.anchorDate ? toUtcDate(filters.anchorDate) : toUtcDate(new Date());
  const period = filters.period || "monthly";
  const year = anchor.getUTCFullYear();

  if (period === "yearly") {
    return {
      startDate: new Date(Date.UTC(year, 0, 1)),
      endDate: new Date(Date.UTC(year + 1, 0, 1) - 1),
      label: String(year),
      period,
    };
  }

  if (period === "quarterly") {
    const quarterStart = Math.floor(anchor.getUTCMonth() / 3) * 3;
    return {
      startDate: new Date(Date.UTC(year, quarterStart, 1)),
      endDate: new Date(Date.UTC(year, quarterStart + 3, 1) - 1),
      label: `${year} Q${quarterStart / 3 + 1}`,
      period,
    };
  }

  return {
    startDate: new Date(Date.UTC(year, anchor.getUTCMonth(), 1)),
    endDate: new Date(Date.UTC(year, anchor.getUTCMonth() + 1, 1) - 1),
    label: `${year}-${String(anchor.getUTCMonth() + 1).padStart(2, "0")}`,
    period: "monthly" as TimesheetReportPeriod,
  };
};

const resolveStatuses = (status?: string) => {
  const normalized = String(status || "").trim().toLowerCase();
  if (!normalized || normalized === "all") return [...ACTIVE_STATUSES];
  if (["pending", "submitted", "approved", "rejected", "cancelled"].includes(normalized)) {
    return [normalized];
  }
  return [...ACTIVE_STATUSES];
};

const getAllowedScopes = (auth: AuthContext): TimesheetReportScope[] => {
  const roles = normalizeRoles(auth);
  const isFirm = ["super_admin", "hr", "gmp", "finance"].some((role) => roles.has(role));
  const isPartner = roles.has("partner");
  const isManager = roles.has("manager");
  const scopes: TimesheetReportScope[] = ["self"];

  if (isFirm || isPartner || isManager) scopes.push("team");
  if (isFirm || isPartner || isManager) scopes.push("department");
  if (isFirm || isPartner) scopes.push("partner");
  if (isFirm) scopes.push("firm");
  return scopes;
};

const getRoleFlags = (auth: AuthContext) => {
  const roles = normalizeRoles(auth);
  return {
    isFirm: ["super_admin", "hr", "gmp", "finance"].some((role) => roles.has(role)),
    isPartner: roles.has("partner"),
    isManager: roles.has("manager"),
  };
};

interface ScopeResolution {
  scope: TimesheetReportScope;
  employeeProfileIds: number[] | null;
  departmentIds: number[] | null;
  partnerProfileIds: number[] | null;
}

const resolveScope = async (
  auth: AuthContext,
  filters: ReportFilters
): Promise<ScopeResolution> => {
  const allowed = getAllowedScopes(auth);
  const requested = filters.scope || "self";
  if (!allowed.includes(requested)) {
    throw {
      statusCode: 403,
      message: `Scope "${requested}" is not available for your role. Allowed: ${allowed.join(", ")}`,
    };
  }

  const { isFirm, isPartner, isManager } = getRoleFlags(auth);

  if (requested === "self") {
    return {
      scope: "self",
      employeeProfileIds: [auth.profileId],
      departmentIds: null,
      partnerProfileIds: null,
    };
  }

  if (requested === "team") {
    const reports = await prisma.profile.findMany({
      where: { managerId: auth.profileId, status: "active" },
      select: { id: true },
    });
    return {
      scope: "team",
      employeeProfileIds: Array.from(
        new Set([auth.profileId, ...reports.map((profile) => profile.id)])
      ),
      departmentIds: null,
      partnerProfileIds: null,
    };
  }

  if (requested === "department") {
    const departments = [];

    if (filters.departmentId) {
      const department = await prisma.department.findUnique({
        where: { id: filters.departmentId },
        select: { id: true, partnerProfileId: true },
      });
      if (!department) {
        throw { statusCode: 404, message: "Department not found" };
      }
      const canAccess =
        isFirm ||
        (isPartner && department.partnerProfileId === auth.profileId) ||
        (isManager &&
          (
            await prisma.profile.findFirst({
              where: { id: auth.profileId, departmentId: department.id },
              select: { id: true },
            })
          )?.id === auth.profileId);
      if (!canAccess) {
        throw { statusCode: 403, message: "You cannot view this department" };
      }
      departments.push(department);
    } else if (isFirm) {
      const all = await prisma.department.findMany({
        select: { id: true, partnerProfileId: true },
      });
      departments.push(...all);
    } else if (isPartner) {
      const partnerDepartments = await prisma.department.findMany({
        where: { partnerProfileId: auth.profileId },
        select: { id: true, partnerProfileId: true },
      });
      departments.push(...partnerDepartments);
    } else if (isManager) {
      const me = await prisma.profile.findUnique({
        where: { id: auth.profileId },
        select: { departmentId: true },
      });
      if (me?.departmentId) {
        const department = await prisma.department.findUnique({
          where: { id: me.departmentId },
          select: { id: true, partnerProfileId: true },
        });
        if (department) departments.push(department);
      }
    }

    const departmentIds = departments.map((department) => department.id);
    const profiles = departmentIds.length
      ? await prisma.profile.findMany({
          where: { status: "active", departmentId: { in: departmentIds } },
          select: { id: true },
        })
      : [];
    return {
      scope: "department",
      employeeProfileIds: profiles.map((profile) => profile.id),
      departmentIds,
      partnerProfileIds: Array.from(
        new Set(
          departments
            .map((department) => department.partnerProfileId)
            .filter((id): id is number => Boolean(id))
        )
      ),
    };
  }

  if (requested === "partner") {
    const partnerIds: number[] = [];
    if (filters.partnerProfileId) {
      if (!isFirm && filters.partnerProfileId !== auth.profileId) {
        throw { statusCode: 403, message: "You cannot view this partner" };
      }
      partnerIds.push(filters.partnerProfileId);
    } else if (isPartner) {
      partnerIds.push(auth.profileId);
    } else if (isFirm) {
      const partners = await prisma.department.findMany({
        where: { partnerProfileId: { not: null } },
        select: { partnerProfileId: true },
        distinct: ["partnerProfileId"],
      });
      partnerIds.push(
        ...partners
          .map((department) => department.partnerProfileId)
          .filter((id): id is number => Boolean(id))
      );
    }

    const departments = partnerIds.length
      ? await prisma.department.findMany({
          where: { partnerProfileId: { in: partnerIds } },
          select: { id: true, partnerProfileId: true },
        })
      : [];
    const departmentIds = departments.map((department) => department.id);
    const profiles = departmentIds.length
      ? await prisma.profile.findMany({
          where: { status: "active", departmentId: { in: departmentIds } },
          select: { id: true },
        })
      : [];
    return {
      scope: "partner",
      employeeProfileIds: profiles.map((profile) => profile.id),
      departmentIds,
      partnerProfileIds: partnerIds,
    };
  }

  const profiles = await prisma.profile.findMany({
    where: { status: "active" },
    select: { id: true },
  });
  return {
    scope: "firm",
    employeeProfileIds: profiles.map((profile) => profile.id),
    departmentIds: null,
    partnerProfileIds: null,
  };
};

const buildEntry = (entry: any) => {
  const job = entry.job || null;
  const proposal = entry.proposal || null;
  const employee = entry.employee || null;
  const department = job?.department || employee?.department || null;
  const partner = job?.partner || department?.partner || null;
  const client = job?.client || proposal?.client || null;
  const jobNo = job?.jobCode || (proposal ? `PROP-${proposal.id}` : "—");
  const jobName = job?.jobName || proposal?.proposalTitle || "Internal / Non-billable";
  const clientName = client?.clientName || proposal?.clientName || "Internal";
  const taskName =
    entry.task?.title ||
    entry.nonBillableActivity?.name ||
    (entry.nonBillableCategory ? String(entry.nonBillableCategory).replace(/_/g, " ") : "—");

  const hours = Number(entry.hours || 0);
  const billable = Boolean(entry.billable);
  const billableAmount = Number(entry.billableAmount || 0);
  const costAmount = Number(entry.costAmount || 0);

  return {
    id: entry.id,
    dateWorked: entry.dateWorked,
    startedAt: entry.startedAt,
    endedAt: entry.endedAt,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    status: entry.status,
    description: entry.description || null,
    employeeProfileId: entry.employeeProfileId,
    employeeName: `${employee?.firstName || ""} ${employee?.lastName || ""}`.trim(),
    employeeNumber: employee?.employeeId || null,
    departmentId: department?.id || null,
    departmentName: department?.name || null,
    partnerProfileId: partner?.id || null,
    partnerName: partner
      ? `${partner.firstName || ""} ${partner.lastName || ""}`.trim()
      : null,
    jobKey: job ? `job-${job.id}` : proposal ? `prop-${proposal.id}` : "internal",
    jobId: job?.id || proposal?.id || null,
    jobNo,
    jobName,
    jobFee: Number(job?.jobCosting?.jobFee ?? job?.fixedFeeAmount ?? 0),
    clientKey: client ? `client-${client.id}` : "internal",
    clientId: client?.id || null,
    clientName,
    taskId: entry.task?.id || null,
    taskName,
    billable,
    nonBillableCategory: entry.nonBillableCategory || null,
    nonBillableActivity: entry.nonBillableActivity?.name || null,
    hours,
    billableHours: billable ? hours : 0,
    nonBillableHours: billable ? 0 : hours,
    billableAmount: billable ? billableAmount : 0,
    nonBillableAmount: billable ? 0 : costAmount,
    costAmount,
    totalHours: hours,
    totalAmount: (billable ? billableAmount : 0) + (billable ? 0 : costAmount),
    totalCost: costAmount,
    profitLoss: Number(entry.profitLoss || 0),
    approverName: entry.approver
      ? `${entry.approver.firstName || ""} ${entry.approver.lastName || ""}`.trim()
      : null,
    approvedAt: entry.approvedAt,
    rejectionReason: entry.rejectionReason || null,
  };
};

type EntryRow = ReturnType<typeof buildEntry>;

const emptyTotals = () => ({
  nonBillableHours: 0,
  nonBillableAmount: 0,
  billableHours: 0,
  billableAmount: 0,
  totalHours: 0,
  totalAmount: 0,
  totalCost: 0,
});

const addToTotals = (totals: ReturnType<typeof emptyTotals>, row: EntryRow) => {
  totals.nonBillableHours += row.nonBillableHours;
  totals.nonBillableAmount += row.nonBillableAmount;
  totals.billableHours += row.billableHours;
  totals.billableAmount += row.billableAmount;
  totals.totalHours += row.hours;
  totals.totalAmount += row.billableAmount + row.nonBillableAmount;
  totals.totalCost += row.costAmount;
};

const finalizeTotals = (totals: ReturnType<typeof emptyTotals>) => ({
  nonBillableHours: roundHours(totals.nonBillableHours),
  nonBillableAmount: roundMoney(totals.nonBillableAmount),
  billableHours: roundHours(totals.billableHours),
  billableAmount: roundMoney(totals.billableAmount),
  totalHours: roundHours(totals.totalHours),
  totalAmount: roundMoney(totals.totalAmount),
  totalCost: roundMoney(totals.totalCost),
});

const aggregateBy = (
  rows: EntryRow[],
  keyFn: (row: EntryRow) => string,
  labelFn: (row: EntryRow) => { name: string; meta?: string | null }
) => {
  const map = new Map<string, { key: string; name: string; meta?: string | null; totals: ReturnType<typeof emptyTotals> }>();
  rows.forEach((row) => {
    const key = keyFn(row);
    const label = labelFn(row);
    const bucket =
      map.get(key) || { key, name: label.name, meta: label.meta, totals: emptyTotals() };
    addToTotals(bucket.totals, row);
    map.set(key, bucket);
  });
  return Array.from(map.values())
    .map((bucket) => ({
      key: bucket.key,
      name: bucket.name,
      meta: bucket.meta || null,
      ...finalizeTotals(bucket.totals),
    }))
    .sort((a, b) => b.billableHours - a.billableHours || a.name.localeCompare(b.name));
};

const groupSummary = (
  rows: EntryRow[],
  keyFn: (row: EntryRow) => string
) => {
  const map = new Map<string, EntryRow & { totals: ReturnType<typeof emptyTotals> }>();
  rows.forEach((row) => {
    const key = keyFn(row);
    const existing = map.get(key);
    if (existing) {
      addToTotals(existing.totals, row);
      return;
    }
    map.set(key, { ...row, totals: { ...emptyTotals() } });
    addToTotals(map.get(key)!.totals, row);
  });
  return Array.from(map.values())
    .map((row) => ({
      employeeProfileId: row.employeeProfileId,
      employeeName: row.employeeName,
      employeeNumber: row.employeeNumber,
      departmentName: row.departmentName,
      partnerName: row.partnerName,
      jobKey: row.jobKey,
      jobId: row.jobId,
      jobNo: row.jobNo,
      jobName: row.jobName,
      jobFee: row.jobFee,
      clientKey: row.clientKey,
      clientId: row.clientId,
      clientName: row.clientName,
      taskId: row.taskId,
      taskName: row.taskName,
      ...finalizeTotals(row.totals),
    }))
    .sort(
      (a, b) =>
        a.employeeName.localeCompare(b.employeeName) ||
        a.jobNo.localeCompare(b.jobNo) ||
        a.taskName.localeCompare(b.taskName)
    );
};

const buildStaffRows = (rows: EntryRow[]) => {
  const map = new Map<
    number,
    {
      employeeProfileId: number;
      employeeName: string;
      employeeNumber: string | null;
      departmentName: string | null;
      partnerName: string | null;
      entriesCount: number;
      cost: number;
      profitLoss: number;
      totals: ReturnType<typeof emptyTotals>;
    }
  >();

  rows.forEach((row) => {
    const existing =
      map.get(row.employeeProfileId) || {
        employeeProfileId: row.employeeProfileId,
        employeeName: row.employeeName,
        employeeNumber: row.employeeNumber,
        departmentName: row.departmentName,
        partnerName: row.partnerName,
        entriesCount: 0,
        cost: 0,
        profitLoss: 0,
        totals: emptyTotals(),
      };
    addToTotals(existing.totals, row);
    existing.entriesCount += 1;
    existing.cost += row.costAmount;
    existing.profitLoss += row.profitLoss;
    map.set(row.employeeProfileId, existing);
  });

  return Array.from(map.values())
    .map((row) => ({
      employeeProfileId: row.employeeProfileId,
      employeeName: row.employeeName,
      employeeNumber: row.employeeNumber,
      departmentName: row.departmentName,
      partnerName: row.partnerName,
      entriesCount: row.entriesCount,
      cost: roundMoney(row.cost),
      profitLoss: roundMoney(row.profitLoss),
      ...finalizeTotals(row.totals),
    }))
    .sort((a, b) => b.billableHours - a.billableHours || a.employeeName.localeCompare(b.employeeName));
};

export class TimesheetReportService {
  private static async fetchRows(
    auth: AuthContext,
    filters: ReportFilters,
    group: TimesheetReportGroup
  ) {
    const range = resolvePeriodRange(filters);
    const scope = await resolveScope(auth, filters);
    const statuses = resolveStatuses(filters.status);
    const { isFirm, isPartner, isManager } = getRoleFlags(auth);

    let employeeProfileIds = scope.employeeProfileIds;
    if (filters.employeeProfileId) {
      if (
        employeeProfileIds !== null &&
        !employeeProfileIds.includes(filters.employeeProfileId)
      ) {
        throw {
          statusCode: 403,
          message: "You cannot view this employee's timesheet report",
        };
      }
      employeeProfileIds = [filters.employeeProfileId];
    }

    const where: any = {
      dateWorked: { gte: range.startDate, lte: range.endDate },
      status: { in: statuses as any },
      ...(employeeProfileIds ? { employeeProfileId: { in: employeeProfileIds } } : {}),
    };

    // Job and client reports follow the job's partner/manager ownership as
    // well as the employee scope, so cross-department staffing is included.
    if ((group === "job" || group === "client") && !isFirm) {
      const orConditions: any[] = [];
      if (employeeProfileIds) {
        orConditions.push({ employeeProfileId: { in: employeeProfileIds } });
      }
      if (isPartner) {
        orConditions.push({ job: { partnerProfileId: auth.profileId } });
        orConditions.push({ proposal: { assignedPartnerProfileId: auth.profileId } });
      }
      if (isManager) {
        orConditions.push({ job: { managerProfileId: auth.profileId } });
        orConditions.push({ proposal: { managerProfileId: auth.profileId } });
      }
      if (orConditions.length > 0) {
        delete where.employeeProfileId;
        where.OR = orConditions;
      }
    }

    const entries = await prisma.timeEntry.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeId: true,
            departmentId: true,
            department: {
              select: {
                id: true,
                name: true,
                partnerProfileId: true,
                partner: { select: { id: true, firstName: true, lastName: true } },
              },
            },
          },
        },
        approver: { select: { id: true, firstName: true, lastName: true } },
        job: {
          select: {
            id: true,
            jobCode: true,
            jobName: true,
            clientId: true,
            client: { select: { id: true, clientName: true } },
            departmentId: true,
            department: {
              select: {
                id: true,
                name: true,
                partnerProfileId: true,
                partner: { select: { id: true, firstName: true, lastName: true } },
              },
            },
            partnerProfileId: true,
            partner: { select: { id: true, firstName: true, lastName: true } },
            fixedFeeAmount: true,
            jobCosting: { select: { jobFee: true } },
          },
        },
        proposal: {
          select: {
            id: true,
            proposalTitle: true,
            clientName: true,
            client: { select: { id: true, clientName: true } },
          },
        },
        task: { select: { id: true, title: true } },
        nonBillableActivity: { select: { id: true, name: true } },
      },
      orderBy: [{ dateWorked: "desc" }, { id: "desc" }],
    });

    let rows = entries.map(buildEntry);

    if (filters.departmentId) {
      rows = rows.filter((row) => row.departmentId === filters.departmentId);
    }
    if (filters.partnerProfileId) {
      rows = rows.filter((row) => row.partnerProfileId === filters.partnerProfileId);
    }
    if (filters.jobId) {
      rows = rows.filter((row) => row.jobId === filters.jobId);
    }
    if (filters.clientId) {
      rows = rows.filter((row) => row.clientId === filters.clientId);
    }
    if (filters.jobKey) {
      rows = rows.filter((row) => row.jobKey === filters.jobKey);
    }
    if (filters.clientKey) {
      rows = rows.filter((row) => row.clientKey === filters.clientKey);
    }
    if (filters.taskId) {
      rows = rows.filter((row) => row.taskId === filters.taskId);
    }

    const totals = emptyTotals();
    rows.forEach((row) => addToTotals(totals, row));

    const rollups = {
      staff: aggregateBy(
        rows,
        (row) => String(row.employeeProfileId),
        (row) => ({
          name: row.employeeName,
          meta: [row.departmentName, row.partnerName].filter(Boolean).join(" · "),
        })
      ),
      departments: aggregateBy(
        rows,
        (row) => row.departmentId ? String(row.departmentId) : "unassigned",
        (row) => ({ name: row.departmentName || "Unassigned" })
      ),
      partners: aggregateBy(
        rows,
        (row) => row.partnerProfileId ? String(row.partnerProfileId) : "unassigned",
        (row) => ({ name: row.partnerName || "Unassigned" })
      ),
      jobs: aggregateBy(
        rows,
        (row) => row.jobId ? String(row.jobId) : "internal",
        (row) => ({
          name:
            row.jobNo === "—"
              ? row.jobName
              : `${row.jobNo} · ${row.jobName}`,
          meta: row.clientName,
        })
      ),
      clients: aggregateBy(
        rows,
        (row) => row.clientId ? String(row.clientId) : "internal",
        (row) => ({ name: row.clientName })
      ),
      firm: finalizeTotals(totals),
    };

    return {
      filters: {
        period: range.period,
        dateFrom: range.startDate.toISOString(),
        dateTo: range.endDate.toISOString(),
        label: range.label,
        scope: scope.scope,
        statuses,
        employeeProfileId: filters.employeeProfileId ?? null,
        departmentId: filters.departmentId ?? null,
        partnerProfileId: filters.partnerProfileId ?? null,
        jobId: filters.jobId ?? null,
        clientId: filters.clientId ?? null,
      },
      rows,
      totals: finalizeTotals(totals),
      rollups,
    };
  }

  static async getSummary(
    group: TimesheetReportGroup,
    auth: AuthContext,
    filters: ReportFilters
  ) {
    const result = await TimesheetReportService.fetchRows(auth, filters, group);

    const keyFn =
      group === "job"
        ? (row: EntryRow) => `${row.jobNo}|${row.employeeProfileId}|${row.taskName}`
        : group === "client"
          ? (row: EntryRow) =>
              `${row.clientName}|${row.jobNo}|${row.employeeProfileId}|${row.taskName}`
          : (row: EntryRow) =>
              `${row.employeeProfileId}|${row.jobNo}|${row.taskName}`;

    return {
      ...result,
      group,
      mode: "summary" as const,
      rows: groupSummary(result.rows, keyFn),
    };
  }

  static async getDetailed(
    group: TimesheetReportGroup,
    auth: AuthContext,
    filters: ReportFilters
  ) {
    const result = await TimesheetReportService.fetchRows(auth, filters, group);
    return {
      ...result,
      group,
      mode: "detailed" as const,
      entries: result.rows,
    };
  }

  static async getJobOverview(auth: AuthContext, filters: ReportFilters) {
    const result = await TimesheetReportService.fetchRows(auth, filters, "job");
    const map = new Map<
      string,
      {
        jobKey: string;
        jobId: number | null;
        jobNo: string;
        jobName: string;
        fee: number;
        clientKey: string;
        clientName: string;
        departmentName: string | null;
        partnerName: string | null;
        staff: Set<number>;
        tasks: Set<string>;
        totals: ReturnType<typeof emptyTotals>;
      }
    >();

    result.rows.forEach((row) => {
      const key = row.jobKey || "internal";
      const existing =
        map.get(key) || {
          jobKey: key,
          jobId: row.jobId,
          jobNo: row.jobNo,
          jobName: row.jobName,
          fee: row.jobFee,
          clientKey: row.clientKey || "internal",
          clientName: row.clientName,
          departmentName: row.departmentName,
          partnerName: row.partnerName,
          staff: new Set<number>(),
          tasks: new Set<string>(),
          totals: emptyTotals(),
        };
      addToTotals(existing.totals, row);
      existing.staff.add(row.employeeProfileId);
      if (row.taskName && row.taskName !== "—") existing.tasks.add(row.taskName);
      map.set(key, existing);
    });

    return {
      ...result,
      group: "job" as const,
      mode: "summary" as const,
      rows: Array.from(map.values())
        .map(({ staff, tasks, totals, ...row }) => ({
          ...row,
          staffCount: staff.size,
          taskCount: tasks.size,
          ...finalizeTotals(totals),
        }))
        .sort(
          (a, b) =>
            b.billableHours - a.billableHours ||
            a.jobNo.localeCompare(b.jobNo)
        ),
    };
  }

  static async getClientOverview(auth: AuthContext, filters: ReportFilters) {
    const result = await TimesheetReportService.fetchRows(auth, filters, "client");
    const map = new Map<
      string,
      {
        clientKey: string;
        clientId: number | null;
        clientName: string;
        jobs: Set<string>;
        staff: Set<number>;
        totals: ReturnType<typeof emptyTotals>;
      }
    >();

    result.rows.forEach((row) => {
      const key = row.clientKey || "internal";
      const existing =
        map.get(key) || {
          clientKey: key,
          clientId: row.clientId,
          clientName: row.clientName,
          jobs: new Set<string>(),
          staff: new Set<number>(),
          totals: emptyTotals(),
        };
      addToTotals(existing.totals, row);
      if (row.jobKey) existing.jobs.add(row.jobKey);
      existing.staff.add(row.employeeProfileId);
      map.set(key, existing);
    });

    return {
      ...result,
      group: "client" as const,
      mode: "summary" as const,
      rows: Array.from(map.values())
        .map(({ jobs, staff, totals, ...row }) => ({
          ...row,
          jobCount: jobs.size,
          staffCount: staff.size,
          ...finalizeTotals(totals),
        }))
        .sort(
          (a, b) =>
            b.billableHours - a.billableHours ||
            a.clientName.localeCompare(b.clientName)
        ),
    };
  }

  static async getJobDrilldown(
    jobKey: string,
    auth: AuthContext,
    filters: ReportFilters
  ) {
    const result = await TimesheetReportService.fetchRows(auth, filters, "job");
    const rows = result.rows.filter((row) => row.jobKey === jobKey);
    const totals = emptyTotals();
    rows.forEach((row) => addToTotals(totals, row));
    const first = rows[0];

    return {
      filters: result.filters,
      job: first
        ? {
            jobKey,
            jobId: first.jobId,
            jobNo: first.jobNo,
            jobName: first.jobName,
            fee: first.jobFee,
            clientKey: first.clientKey,
            clientName: first.clientName,
            departmentName: first.departmentName,
            partnerName: first.partnerName,
            staffCount: new Set(rows.map((row) => row.employeeProfileId)).size,
            entriesCount: rows.length,
          }
        : null,
      totals: finalizeTotals(totals),
      staff: buildStaffRows(rows),
      entries: rows,
    };
  }

  static async getClientDrilldown(
    clientKey: string,
    auth: AuthContext,
    filters: ReportFilters
  ) {
    const result = await TimesheetReportService.fetchRows(auth, filters, "client");
    const rows = result.rows.filter((row) => row.clientKey === clientKey);
    const totals = emptyTotals();
    rows.forEach((row) => addToTotals(totals, row));

    const jobKeys = Array.from(new Set(rows.map((row) => row.jobKey)));
    const jobs = jobKeys
      .map((jobKey) => {
        const jobRows = rows.filter((row) => row.jobKey === jobKey);
        const first = jobRows[0];
        const jobTotals = emptyTotals();
        jobRows.forEach((row) => addToTotals(jobTotals, row));
        return {
          jobKey,
          jobId: first.jobId,
          jobNo: first.jobNo,
          jobName: first.jobName,
          fee: first.jobFee,
          staffCount: new Set(jobRows.map((row) => row.employeeProfileId)).size,
          entriesCount: jobRows.length,
          ...finalizeTotals(jobTotals),
        };
      })
      .sort((a, b) => b.billableHours - a.billableHours);

    const first = rows[0];

    return {
      filters: result.filters,
      client: first
        ? {
            clientKey,
            clientId: first.clientId,
            clientName: first.clientName,
            jobCount: jobKeys.length,
            staffCount: new Set(rows.map((row) => row.employeeProfileId)).size,
            entriesCount: rows.length,
          }
        : null,
      totals: finalizeTotals(totals),
      jobs,
      staff: buildStaffRows(rows),
      entries: rows,
    };
  }

  static async getOptions(auth: AuthContext) {
    const allowedScopes = getAllowedScopes(auth);
    const broadest = allowedScopes.includes("firm")
      ? "firm"
      : allowedScopes.includes("partner")
        ? "partner"
        : allowedScopes.includes("department")
          ? "department"
          : allowedScopes.includes("team")
            ? "team"
            : "self";

    const scope = await resolveScope(auth, { scope: broadest });

    const profiles = await prisma.profile.findMany({
      where: {
        status: "active",
        ...(scope.employeeProfileIds
          ? { id: { in: scope.employeeProfileIds } }
          : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeId: true,
        departmentId: true,
        department: { select: { id: true, name: true } },
      },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    });

    const departments = await prisma.department.findMany({
      where: scope.departmentIds
        ? { id: { in: scope.departmentIds } }
        : undefined,
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    const { isFirm, isPartner, isManager } = getRoleFlags(auth);
    const jobOr: any[] = [];
    jobOr.push({
      timeEntries: {
        some: {
          employeeProfileId: scope.employeeProfileIds
            ? { in: scope.employeeProfileIds }
            : undefined,
        },
      },
    });
    if (!isFirm && isPartner) {
      jobOr.push({ partnerProfileId: auth.profileId });
    }
    if (!isFirm && isManager) {
      jobOr.push({ managerProfileId: auth.profileId });
    }

    const jobs = await prisma.job.findMany({
      where: { OR: jobOr },
      select: {
        id: true,
        jobCode: true,
        jobName: true,
        clientId: true,
        client: { select: { id: true, clientName: true } },
      },
      orderBy: { jobName: "asc" },
      take: 500,
    });

    const clientMap = new Map<number, { id: number; clientName: string }>();
    jobs.forEach((job) => {
      if (job.client) clientMap.set(job.client.id, job.client);
    });

    return {
      allowedScopes,
      defaultScope: broadest,
      staff: profiles.map((profile) => ({
        id: profile.id,
        name: `${profile.firstName || ""} ${profile.lastName || ""}`.trim(),
        employeeId: profile.employeeId,
        departmentId: profile.departmentId,
        departmentName: profile.department?.name || null,
      })),
      departments,
      jobs: jobs.map((job) => ({
        id: job.id,
        jobCode: job.jobCode,
        jobName: job.jobName,
        clientId: job.clientId,
        clientName: job.client?.clientName || null,
      })),
      clients: Array.from(clientMap.values()),
    };
  }
}

export default TimesheetReportService;
