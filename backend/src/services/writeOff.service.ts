import prisma from "../prisma";

export type WriteOffPeriod =
  | "daily"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "yearly";

const PERIODS: WriteOffPeriod[] = [
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
];

const FULL_DAY_MS = 24 * 60 * 60 * 1000;

const toNumber = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundMoney = (value: number) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const roundHours = (value: number) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const percent = (numerator: number, denominator: number) =>
  denominator > 0 ? Math.round((numerator / denominator) * 10000) / 100 : 0;

const toUtcDate = (value: Date) =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));

const addUtcDays = (value: Date, days: number) =>
  new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate() + days)
  );

const dateKey = (value: Date) => value.toISOString().slice(0, 10);

const startOfUtcDay = (value: Date) => toUtcDate(value);
const endOfUtcDay = (value: Date) =>
  new Date(toUtcDate(value).getTime() + FULL_DAY_MS - 1);

export interface WriteOffRange {
  startDate: Date;
  endDate: Date;
  label: string;
  period: WriteOffPeriod | "custom";
}

const parseOptionalDate = (value: unknown): Date | null => {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const resolveWriteOffRange = (input: {
  period?: unknown;
  date?: unknown;
  dateFrom?: unknown;
  dateTo?: unknown;
}): WriteOffRange => {
  const from = parseOptionalDate(input.dateFrom);
  const to = parseOptionalDate(input.dateTo);
  if (from || to) {
    const start = startOfUtcDay(from ?? to ?? new Date());
    const end = endOfUtcDay(to ?? from ?? new Date());
    return {
      startDate: start,
      endDate: end,
      label: `${dateKey(start)} to ${dateKey(end)}`,
      period: "custom",
    };
  }

  const anchor = parseOptionalDate(input.date) ?? new Date();
  const rawPeriod = String(input.period || "monthly").toLowerCase();
  const period = PERIODS.includes(rawPeriod as WriteOffPeriod)
    ? (rawPeriod as WriteOffPeriod)
    : "monthly";
  const day = toUtcDate(anchor);

  if (period === "daily") {
    return {
      startDate: startOfUtcDay(day),
      endDate: endOfUtcDay(day),
      label: dateKey(day),
      period,
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
      period,
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
      period,
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
      period,
    };
  }

  const start = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
  const endExclusive = new Date(Date.UTC(day.getUTCFullYear() + 1, 0, 1));
  return {
    startDate: startOfUtcDay(start),
    endDate: new Date(endExclusive.getTime() - 1),
    label: String(day.getUTCFullYear()),
    period,
  };
};

type WriteOffValuation = "none" | "billing_rate" | "cost_rate";

const legacyValuation = (category?: string | null): WriteOffValuation => {
  const normalized = String(category || "").toLowerCase();
  if (normalized === "over_budget") return "billing_rate";
  if (normalized === "other") return "cost_rate";
  return "none";
};

const legacyActivityLabel = (category?: string | null) => {
  const normalized = String(category || "unclassified").toLowerCase();
  return normalized
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

interface Bucket {
  key: string;
  name: string;
  departmentId: number | null;
  departmentName: string | null;
  partnerProfileId: number | null;
  partnerName: string | null;
  loggedHours: number;
  billableHours: number;
  nonBillableHours: number;
  writeOffHours: number;
  writeOffValue: number;
}

const ensureBucket = (
  map: Map<string, Bucket>,
  key: string,
  init: Partial<Bucket> & { name: string }
): Bucket => {
  const existing = map.get(key);
  if (existing) return existing;
  const bucket: Bucket = {
    key,
    name: init.name,
    departmentId: init.departmentId ?? null,
    departmentName: init.departmentName ?? null,
    partnerProfileId: init.partnerProfileId ?? null,
    partnerName: null,
    loggedHours: 0,
    billableHours: 0,
    nonBillableHours: 0,
    writeOffHours: 0,
    writeOffValue: 0,
  };
  map.set(key, bucket);
  return bucket;
};

const finalizeBucket = (bucket: Bucket) => ({
  ...bucket,
  loggedHours: roundHours(bucket.loggedHours),
  billableHours: roundHours(bucket.billableHours),
  nonBillableHours: roundHours(bucket.nonBillableHours),
  writeOffHours: roundHours(bucket.writeOffHours),
  writeOffValue: roundMoney(bucket.writeOffValue),
  writeOffRatePercent: percent(bucket.writeOffHours, bucket.loggedHours),
  writeOffNonBillablePercent: percent(
    bucket.writeOffHours,
    bucket.nonBillableHours
  ),
});

export interface TimeWriteOffResult {
  period: WriteOffRange["period"];
  label: string;
  startDate: string;
  endDate: string;
  firm: ReturnType<typeof finalizeBucket> & { currency: string };
  byEmployee: ReturnType<typeof finalizeBucket>[];
  byDepartment: ReturnType<typeof finalizeBucket>[];
  byPartner: ReturnType<typeof finalizeBucket>[];
  byActivity: Array<{
    key: string;
    name: string;
    valuation: WriteOffValuation;
    hours: number;
    value: number;
  }>;
}

export class WriteOffService {
  static async getTimeWriteOffs(input: {
    period?: unknown;
    date?: unknown;
    dateFrom?: unknown;
    dateTo?: unknown;
  }): Promise<TimeWriteOffResult> {
    const range = resolveWriteOffRange(input);

    const entries = await prisma.timeEntry.findMany({
      where: {
        status: "approved",
        dateWorked: { gte: range.startDate, lte: range.endDate },
      },
      select: {
        id: true,
        hours: true,
        billable: true,
        employeeProfileId: true,
        nonBillableCategory: true,
        nonBillableActivity: {
          select: {
            id: true,
            code: true,
            name: true,
            categoryGroup: true,
            isProductive: true,
            writeOffValuation: true,
          },
        },
        job: {
          select: {
            id: true,
            departmentId: true,
            partnerProfileId: true,
            department: { select: { id: true, name: true, partnerProfileId: true } },
          },
        },
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            departmentId: true,
            department: { select: { id: true, name: true, partnerProfileId: true } },
            role: { select: { billingRate: true, costRate: true } },
          },
        },
      },
    });

    const jobIds = Array.from(
      new Set(entries.map((entry) => entry.job?.id).filter((id): id is number => !!id))
    );
    const assignments = jobIds.length
      ? await prisma.jobStaffAssignment.findMany({
          where: { jobId: { in: jobIds } },
          select: {
            jobId: true,
            employeeProfileId: true,
            assignedHourlyRate: true,
          },
        })
      : [];
    const assignmentRate = new Map<string, number>();
    assignments.forEach((assignment) => {
      assignmentRate.set(
        `${assignment.jobId}:${assignment.employeeProfileId}`,
        toNumber(assignment.assignedHourlyRate)
      );
    });

    const employeeBuckets = new Map<string, Bucket>();
    const departmentBuckets = new Map<string, Bucket>();
    const partnerBuckets = new Map<string, Bucket>();
    const firmBucket = ensureBucket(new Map(), "firm", { name: "Firm" });
    const activityMap = new Map<
      string,
      { key: string; name: string; valuation: WriteOffValuation; hours: number; value: number }
    >();

    const partnerIds = new Set<number>();

    entries.forEach((entry) => {
      const hours = toNumber(entry.hours);
      if (hours <= 0) return;

      const employee = entry.employee;
      const employeeName =
        `${employee?.firstName || ""} ${employee?.lastName || ""}`.trim() ||
        `Employee ${entry.employeeProfileId}`;

      const departmentId =
        entry.job?.departmentId ?? employee?.departmentId ?? null;
      const departmentName =
        entry.job?.department?.name ?? employee?.department?.name ?? "Unassigned";
      const partnerProfileId =
        entry.job?.partnerProfileId ??
        entry.job?.department?.partnerProfileId ??
        employee?.department?.partnerProfileId ??
        null;

      const employeeBucket = ensureBucket(
        employeeBuckets,
        String(entry.employeeProfileId),
        {
          name: employeeName,
          departmentId,
          departmentName,
          partnerProfileId,
        }
      );
      const departmentBucket = ensureBucket(
        departmentBuckets,
        departmentId ? String(departmentId) : "unassigned",
        {
          name: departmentName,
          departmentId,
          departmentName,
          partnerProfileId,
        }
      );
      const partnerBucket = partnerProfileId
        ? ensureBucket(partnerBuckets, String(partnerProfileId), {
            name: `Partner ${partnerProfileId}`,
            departmentId,
            departmentName,
            partnerProfileId,
          })
        : null;

      if (partnerProfileId) partnerIds.add(partnerProfileId);

      const targets = [employeeBucket, departmentBucket, firmBucket];
      if (partnerBucket) targets.push(partnerBucket);

      targets.forEach((bucket) => {
        bucket.loggedHours += hours;
        if (entry.billable) {
          bucket.billableHours += hours;
        } else {
          bucket.nonBillableHours += hours;
        }
      });

      if (entry.billable) return;

      const valuation: WriteOffValuation =
        (entry.nonBillableActivity?.writeOffValuation as WriteOffValuation) ||
        legacyValuation(entry.nonBillableCategory);

      if (valuation === "none") return;

      const assignmentKey = entry.job ? `${entry.job.id}:${entry.employeeProfileId}` : "";
      const assignedRate = assignmentRate.get(assignmentKey) ?? 0;
      const billingRate =
        assignedRate || toNumber(employee?.role?.billingRate);
      const costRate =
        toNumber(employee?.role?.costRate) || toNumber(employee?.role?.billingRate);
      const rate = valuation === "billing_rate" ? billingRate : costRate;
      const value = roundMoney(hours * rate);

      targets.forEach((bucket) => {
        bucket.writeOffHours += hours;
        bucket.writeOffValue += value;
      });

      const activityKey =
        entry.nonBillableActivity?.code ||
        `legacy_${String(entry.nonBillableCategory || "other").toLowerCase()}`;
      const activityName =
        entry.nonBillableActivity?.name ||
        legacyActivityLabel(entry.nonBillableCategory);
      const currentActivity =
        activityMap.get(activityKey) || {
          key: activityKey,
          name: activityName,
          valuation,
          hours: 0,
          value: 0,
        };
      currentActivity.hours += hours;
      currentActivity.value += value;
      activityMap.set(activityKey, currentActivity);
    });

    const partners = partnerIds.size
      ? await prisma.profile.findMany({
          where: { id: { in: Array.from(partnerIds) } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const partnerNameMap = new Map<number, string>();
    partners.forEach((partner) => {
      partnerNameMap.set(
        partner.id,
        `${partner.firstName} ${partner.lastName}`.trim()
      );
    });

    partnerBuckets.forEach((bucket) => {
      if (bucket.partnerProfileId) {
        bucket.partnerName =
          partnerNameMap.get(bucket.partnerProfileId) || bucket.name;
        bucket.name = bucket.partnerName;
      }
    });

    const sortBuckets = (buckets: Bucket[]) =>
      buckets
        .map(finalizeBucket)
        .sort((a, b) => b.writeOffValue - a.writeOffValue);

    return {
      period: range.period,
      label: range.label,
      startDate: range.startDate.toISOString(),
      endDate: range.endDate.toISOString(),
      firm: { ...finalizeBucket(firmBucket), currency: "KES" },
      byEmployee: sortBuckets(Array.from(employeeBuckets.values())),
      byDepartment: sortBuckets(Array.from(departmentBuckets.values())),
      byPartner: sortBuckets(Array.from(partnerBuckets.values())),
      byActivity: Array.from(activityMap.values())
        .map((item) => ({
          ...item,
          hours: roundHours(item.hours),
          value: roundMoney(item.value),
        }))
        .sort((a, b) => b.value - a.value),
    };
  }

  static async getJobWriteOffs(input: {
    period?: unknown;
    date?: unknown;
    dateFrom?: unknown;
    dateTo?: unknown;
  }) {
    const range = resolveWriteOffRange(input);

    const jobs = await prisma.job.findMany({
      where: {
        timeEntries: {
          some: {
            status: "approved",
            dateWorked: { gte: range.startDate, lte: range.endDate },
          },
        },
      },
      select: {
        id: true,
        jobCode: true,
        jobName: true,
        billingType: true,
        fixedFeeAmount: true,
        currency: true,
        status: true,
        departmentId: true,
        partnerProfileId: true,
        client: { select: { clientName: true } },
        department: { select: { id: true, name: true, partnerProfileId: true } },
        partner: { select: { id: true, firstName: true, lastName: true } },
        jobCosting: {
          select: {
            jobFee: true,
            totalEstimatedHours: true,
            allocations: {
              select: {
                employeeProfileId: true,
                allocatedHours: true,
                hourlyRate: true,
                estimatedCost: true,
                employee: { select: { firstName: true, lastName: true } },
              },
            },
          },
        },
        timeEntries: {
          where: {
            status: "approved",
            dateWorked: { gte: range.startDate, lte: range.endDate },
          },
          select: {
            employeeProfileId: true,
            hours: true,
            billable: true,
            billableAmount: true,
            costAmount: true,
            employee: { select: { firstName: true, lastName: true } },
          },
        },
        invoices: {
          where: { status: { in: ["issued", "partially_paid", "paid", "overdue"] } },
          select: { totalAmount: true },
        },
        payments: { select: { paymentAmount: true } },
      },
    });

    const jobIds = jobs.map((job) => job.id);
    const lifetimeRows = jobIds.length
      ? await prisma.timeEntry.groupBy({
          by: ["jobId"],
          where: {
            jobId: { in: jobIds },
            status: "approved",
            billable: true,
          },
          _sum: { billableAmount: true },
        })
      : [];
    const lifetimeValueMap = new Map<number, number>();
    lifetimeRows.forEach((row) => {
      if (row.jobId) {
        lifetimeValueMap.set(row.jobId, toNumber(row._sum.billableAmount));
      }
    });

    const jobRows = jobs.map((job) => {
      const periodBillableValue = roundMoney(
        job.timeEntries
          .filter((entry) => entry.billable)
          .reduce((sum, entry) => sum + toNumber(entry.billableAmount), 0)
      );
      const periodBillableHours = roundHours(
        job.timeEntries
          .filter((entry) => entry.billable)
          .reduce((sum, entry) => sum + toNumber(entry.hours), 0)
      );
      const periodNonBillableHours = roundHours(
        job.timeEntries
          .filter((entry) => !entry.billable)
          .reduce((sum, entry) => sum + toNumber(entry.hours), 0)
      );
      const lifetimeBillableValue = lifetimeValueMap.get(job.id) ?? periodBillableValue;
      const agreedFee = toNumber(job.jobCosting?.jobFee) || toNumber(job.fixedFeeAmount);
      const feeBasis =
        lifetimeBillableValue > 0
          ? roundMoney(agreedFee * (periodBillableValue / lifetimeBillableValue))
          : roundMoney(agreedFee);
      const writeOffValue = roundMoney(Math.max(0, periodBillableValue - feeBasis));
      const writeUpValue = roundMoney(Math.max(0, feeBasis - periodBillableValue));
      const plannedValue = roundMoney(
        (job.jobCosting?.allocations || []).reduce(
          (sum, allocation) =>
            sum + toNumber(allocation.allocatedHours) * toNumber(allocation.hourlyRate),
          0
        )
      );
      const plannedCost = roundMoney(
        (job.jobCosting?.allocations || []).reduce(
          (sum, allocation) => sum + toNumber(allocation.estimatedCost),
          0
        )
      );
      const collectedRevenue = roundMoney(
        job.payments.reduce((sum, payment) => sum + toNumber(payment.paymentAmount), 0)
      );
      const invoicedRevenue = roundMoney(
        job.invoices.reduce((sum, invoice) => sum + toNumber(invoice.totalAmount), 0)
      );

      const teamMap = new Map<
        number,
        { employeeProfileId: number; employeeName: string; billableHours: number; billableValue: number }
      >();
      job.timeEntries.forEach((entry) => {
        const current =
          teamMap.get(entry.employeeProfileId) || {
            employeeProfileId: entry.employeeProfileId,
            employeeName:
              `${entry.employee?.firstName || ""} ${entry.employee?.lastName || ""}`.trim(),
            billableHours: 0,
            billableValue: 0,
          };
        if (entry.billable) {
          current.billableHours = roundHours(
            current.billableHours + toNumber(entry.hours)
          );
          current.billableValue = roundMoney(
            current.billableValue + toNumber(entry.billableAmount)
          );
        }
        teamMap.set(entry.employeeProfileId, current);
      });

      return {
        jobId: job.id,
        jobCode: job.jobCode,
        jobName: job.jobName,
        clientName: job.client?.clientName ?? "Unassigned",
        status: job.status,
        billingType: job.billingType,
        currency: job.currency,
        departmentId: job.departmentId,
        departmentName: job.department?.name ?? "Unassigned",
        partnerProfileId: job.partnerProfileId,
        partnerName: job.partner
          ? `${job.partner.firstName} ${job.partner.lastName}`.trim()
          : null,
        agreedFee: roundMoney(agreedFee),
        feeBasis,
        deliveredValue: periodBillableValue,
        deliveredHours: periodBillableHours,
        nonBillableHours: periodNonBillableHours,
        writeOffValue,
        writeUpValue,
        writeOffPercent: percent(writeOffValue, periodBillableValue),
        plannedValue,
        plannedCost,
        invoicedRevenue,
        collectedRevenue,
        team: Array.from(teamMap.values()).sort(
          (a, b) => b.billableValue - a.billableValue
        ),
      };
    });

    const withWriteOff = jobRows.filter((row) => row.writeOffValue > 0);

    const summarizeRows = (rows: typeof jobRows) => {
      const deliveredValue = roundMoney(
        rows.reduce((sum, row) => sum + row.deliveredValue, 0)
      );
      const writeOffValue = roundMoney(
        rows.reduce((sum, row) => sum + row.writeOffValue, 0)
      );
      return {
        jobCount: rows.length,
        jobsWithWriteOff: rows.filter((row) => row.writeOffValue > 0).length,
        deliveredValue,
        feeBasis: roundMoney(rows.reduce((sum, row) => sum + row.feeBasis, 0)),
        writeOffValue,
        writeUpValue: roundMoney(
          rows.reduce((sum, row) => sum + row.writeUpValue, 0)
        ),
        writeOffRatePercent: percent(writeOffValue, deliveredValue),
        plannedValue: roundMoney(
          rows.reduce((sum, row) => sum + row.plannedValue, 0)
        ),
        invoicedRevenue: roundMoney(
          rows.reduce((sum, row) => sum + row.invoicedRevenue, 0)
        ),
        collectedRevenue: roundMoney(
          rows.reduce((sum, row) => sum + row.collectedRevenue, 0)
        ),
      };
    };

    const groupJobs = (
      keyFn: (row: (typeof jobRows)[number]) => string,
      nameFn: (row: (typeof jobRows)[number]) => string,
      extraFn?: (row: (typeof jobRows)[number]) => Record<string, unknown>
    ) => {
      const groups = new Map<string, typeof jobRows>();
      jobRows.forEach((row) => {
        const key = keyFn(row);
        const current = groups.get(key) || [];
        current.push(row);
        groups.set(key, current);
      });
      return Array.from(groups.entries())
        .map(([key, rows]) => ({
          key,
          name: nameFn(rows[0]),
          ...(extraFn ? extraFn(rows[0]) : {}),
          ...summarizeRows(rows),
        }))
        .sort((a, b) => b.writeOffValue - a.writeOffValue);
    };

    return {
      period: range.period,
      label: range.label,
      startDate: range.startDate.toISOString(),
      endDate: range.endDate.toISOString(),
      currency: "KES",
      firm: { key: "firm", name: "Firm", ...summarizeRows(jobRows) },
      byPartner: groupJobs(
        (row) => (row.partnerProfileId ? String(row.partnerProfileId) : "unassigned"),
        (row) => row.partnerName || "Unassigned partner",
        (row) => ({
          partnerProfileId: row.partnerProfileId,
        })
      ),
      byDepartment: groupJobs(
        (row) => (row.departmentId ? String(row.departmentId) : "unassigned"),
        (row) => row.departmentName,
        (row) => ({
          departmentId: row.departmentId,
          departmentName: row.departmentName,
          partnerProfileId: row.partnerProfileId,
        })
      ),
      jobs: jobRows.sort((a, b) => b.writeOffValue - a.writeOffValue),
      topWriteOffs: withWriteOff
        .slice()
        .sort((a, b) => b.writeOffValue - a.writeOffValue)
        .slice(0, 25),
    };
  }
}

export default WriteOffService;
