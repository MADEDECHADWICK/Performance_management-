import prisma from "../prisma";
import type { KpiSourceModule } from "./kpiEngine.service";
import { submitKpiDataPoints } from "./kpiEngine.service";
import {
  resolveTrainingData,
  resolveTimesheetData,
  resolveJobData,
  resolveEvaluationData,
  resolveFinanceData,
  resolveFinanceDataForDept,
  resolveMarketingData,
  type PeriodRange,
} from "./kpiSourceResolvers.service";

// ─── Shared types ────────────────────────────────────────────────────────────

export type KpiStatus = "on_track" | "at_risk" | "off_track" | "no_data";

export type IndividualKpiScore = {
  kpiId: number;
  kpiName: string;
  metricKey: string;
  score: number | null;
  status: KpiStatus;
  targetValue: number;
  actualValue: number | null;
};

export type EmployeeKpiRow = {
  profileId: number;
  firstName: string;
  lastName: string;
  employeeId: string | null;
  kpiScores: IndividualKpiScore[];
  overallScore: number | null;
};

export type DepartmentKpiType = {
  metricKey: string;
  kpiName: string;
  avgScore: number | null;
  status: KpiStatus;
  employeeCount: number;
  kpiWeight: number;
};

export type DepartmentScorecard = {
  departmentId: number;
  departmentName: string;
  partnerProfileId: number | null;
  overallScore: number | null;
  kpiTypes: DepartmentKpiType[];
  employees: EmployeeKpiRow[];
};

export type OrgDepartmentRow = {
  departmentId: number;
  departmentName: string;
  partnerProfileId: number | null;
  partnerName: string | null;
  overallScore: number | null;
  kpiScores: Array<{
    metricKey: string;
    score: number | null;
    status: KpiStatus;
    employeeCount: number;
  }>;
};

export type OrgKpiType = {
  metricKey: string;
  kpiName: string;
  orgWeight: number;
  orgScore: number | null;
  deptCount: number;
};

export type PartnerSummaryRow = {
  partnerProfileId: number | null;
  partnerName: string | null;
  overallScore: number | null;
  deptCount: number;
  kpiScores: Array<{ metricKey: string; score: number | null; status: KpiStatus }>;
};

export type OrgScorecard = {
  periodId: number;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  kpiTypes: OrgKpiType[];
  departments: OrgDepartmentRow[];
  partnerSummaries: PartnerSummaryRow[];
  orgOverallScore: number | null;
};

export type KpiPeriod = {
  id: number;
  label: string;
  cadence: string;
  periodStart: string;
  periodEnd: string;
  status: string;
};

export type SyncResult = { synced: number; skipped: number; errors: number };

// ─── Helpers ─────────────────────────────────────────────────────────────────

const toStatus = (score: number | null): KpiStatus => {
  if (score === null) return "no_data";
  if (score >= 80) return "on_track";
  if (score >= 60) return "at_risk";
  return "off_track";
};

const avg = (values: number[]): number | null => {
  const valid = values.filter((v) => Number.isFinite(v));
  if (valid.length === 0) return null;
  return Math.round(valid.reduce((s, v) => s + v, 0) / valid.length);
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === "object" && !Array.isArray(v);

// ─── Period listing ───────────────────────────────────────────────────────────

export async function listKpiPeriods(): Promise<KpiPeriod[]> {
  const periods = await prisma.balancedScorecardMeasurementPeriod.findMany({
    orderBy: { periodStart: "desc" },
    select: {
      id: true,
      label: true,
      cadence: true,
      periodStart: true,
      periodEnd: true,
      status: true,
    },
  });
  return periods.map((p) => ({
    id: p.id,
    label: p.label ?? `Period ${p.id}`,
    cadence: p.cadence,
    periodStart: p.periodStart.toISOString(),
    periodEnd: p.periodEnd.toISOString(),
    status: p.status,
  }));
}

// ─── Individual KPI results for a set of employees ───────────────────────────

async function fetchKpisForEmployees(employeeProfileIds: number[], periodId: number) {
  if (employeeProfileIds.length === 0) return [];
  return prisma.balancedScorecardKpi.findMany({
    where: {
      ownerProfileId: { in: employeeProfileIds },
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      metricKey: true,
      weight: true,
      targetValue: true,
      ownerProfileId: true,
      results: {
        where: { measurementPeriodId: periodId },
        select: { score: true, actualValue: true, status: true },
        take: 1,
      },
    },
  });
}

// ─── Department scorecard ─────────────────────────────────────────────────────

export async function getDepartmentScorecard(params: {
  departmentId: number;
  periodId: number;
}): Promise<DepartmentScorecard> {
  const { departmentId, periodId } = params;

  const department = await prisma.department.findUniqueOrThrow({
    where: { id: departmentId },
    select: {
      id: true,
      name: true,
      partnerProfileId: true,
      profiles: {
        where: { status: "active" },
        select: { id: true, firstName: true, lastName: true, employeeId: true },
      },
    },
  });

  const employeeIds = department.profiles.map((p) => p.id);
  const kpis = await fetchKpisForEmployees(employeeIds, periodId);

  // Per-employee rows
  const kpisByEmployee = new Map<number, typeof kpis>();
  for (const kpi of kpis) {
    const pid = kpi.ownerProfileId!;
    if (!kpisByEmployee.has(pid)) kpisByEmployee.set(pid, []);
    kpisByEmployee.get(pid)!.push(kpi);
  }

  const employees: EmployeeKpiRow[] = department.profiles.map((emp) => {
    const empKpis = kpisByEmployee.get(emp.id) ?? [];
    const kpiScores: IndividualKpiScore[] = empKpis.map((kpi) => {
      const result = kpi.results[0] ?? null;
      const score = result ? Number(result.score) : null;
      return {
        kpiId: kpi.id,
        kpiName: kpi.name,
        metricKey: kpi.metricKey,
        score,
        status: result ? (result.status as KpiStatus) : "no_data",
        targetValue: Number(kpi.targetValue ?? 0),
        actualValue: result?.actualValue != null ? Number(result.actualValue) : null,
      };
    });
    const scores = kpiScores.map((k) => k.score).filter((s): s is number => s !== null);
    return {
      profileId: emp.id,
      firstName: emp.firstName,
      lastName: emp.lastName,
      employeeId: emp.employeeId,
      kpiScores,
      overallScore: avg(scores),
    };
  });

  // Per-metricKey rollup across all employees in the department
  const metricMap = new Map<string, { name: string; scores: number[]; weight: number }>();
  for (const kpi of kpis) {
    if (!metricMap.has(kpi.metricKey)) {
      metricMap.set(kpi.metricKey, {
        name: kpi.name,
        scores: [],
        weight: Number(kpi.weight ?? 0),
      });
    }
    const entry = metricMap.get(kpi.metricKey)!;
    const result = kpi.results[0];
    if (result) entry.scores.push(Number(result.score));
  }

  const kpiTypes: DepartmentKpiType[] = Array.from(metricMap.entries()).map(
    ([metricKey, entry]) => {
      const avgScore = avg(entry.scores);
      return {
        metricKey,
        kpiName: entry.name,
        avgScore,
        status: toStatus(avgScore),
        employeeCount: entry.scores.length,
        kpiWeight: entry.weight,
      };
    }
  );

  const deptScores = kpiTypes.map((k) => k.avgScore).filter((s): s is number => s !== null);
  return {
    departmentId: department.id,
    departmentName: department.name,
    partnerProfileId: department.partnerProfileId,
    overallScore: avg(deptScores),
    kpiTypes,
    employees,
  };
}

// ─── Organization scorecard ───────────────────────────────────────────────────

export async function getOrgScorecard(params: {
  periodId: number;
  partnerProfileId?: number;
}): Promise<OrgScorecard> {
  const { periodId, partnerProfileId } = params;

  const period = await prisma.balancedScorecardMeasurementPeriod.findUniqueOrThrow({
    where: { id: periodId },
    select: { id: true, label: true, periodStart: true, periodEnd: true },
  });

  const departments = await prisma.department.findMany({
    where: partnerProfileId ? { partnerProfileId } : {},
    select: {
      id: true,
      name: true,
      partnerProfileId: true,
      partner: { select: { firstName: true, lastName: true } },
    },
    orderBy: { name: "asc" },
  });

  const deptScorecards = await Promise.all(
    departments.map((dept) =>
      getDepartmentScorecard({ departmentId: dept.id, periodId }).then((sc) => ({ dept, sc }))
    )
  );

  // Accumulate org-level stats per metricKey
  const allMetrics = new Map<
    string,
    { name: string; weight: number; scores: number[]; deptCount: number }
  >();

  const deptRows: OrgDepartmentRow[] = deptScorecards.map(({ dept, sc }) => {
    for (const kt of sc.kpiTypes) {
      if (!allMetrics.has(kt.metricKey)) {
        allMetrics.set(kt.metricKey, {
          name: kt.kpiName,
          weight: kt.kpiWeight,
          scores: [],
          deptCount: 0,
        });
      }
      const entry = allMetrics.get(kt.metricKey)!;
      if (kt.avgScore !== null) {
        entry.scores.push(kt.avgScore);
        entry.deptCount++;
      }
    }

    return {
      departmentId: dept.id,
      departmentName: dept.name,
      partnerProfileId: dept.partnerProfileId,
      partnerName: dept.partner
        ? `${dept.partner.firstName} ${dept.partner.lastName}`
        : null,
      overallScore: sc.overallScore,
      kpiScores: sc.kpiTypes.map((kt) => ({
        metricKey: kt.metricKey,
        score: kt.avgScore,
        status: kt.status,
        employeeCount: kt.employeeCount,
      })),
    };
  });

  const kpiTypes: OrgKpiType[] = Array.from(allMetrics.entries()).map(([metricKey, entry]) => ({
    metricKey,
    kpiName: entry.name,
    orgWeight: entry.weight,
    orgScore: avg(entry.scores),
    deptCount: entry.deptCount,
  }));

  const orgScores = deptRows.map((d) => d.overallScore).filter((s): s is number => s !== null);

  // Partner-level summaries: group dept rows by partnerProfileId
  const partnerMap = new Map<
    string,
    {
      partnerProfileId: number | null;
      partnerName: string | null;
      scores: number[];
      deptCount: number;
      metricScores: Map<string, number[]>;
    }
  >();

  for (const row of deptRows) {
    const key = String(row.partnerProfileId ?? "none");
    if (!partnerMap.has(key)) {
      partnerMap.set(key, {
        partnerProfileId: row.partnerProfileId,
        partnerName: row.partnerName,
        scores: [],
        deptCount: 0,
        metricScores: new Map(),
      });
    }
    const entry = partnerMap.get(key)!;
    entry.deptCount++;
    if (row.overallScore !== null) entry.scores.push(row.overallScore);
    for (const ks of row.kpiScores) {
      if (ks.score !== null) {
        if (!entry.metricScores.has(ks.metricKey)) entry.metricScores.set(ks.metricKey, []);
        entry.metricScores.get(ks.metricKey)!.push(ks.score);
      }
    }
  }

  const partnerSummaries: PartnerSummaryRow[] = Array.from(partnerMap.values()).map((p) => ({
    partnerProfileId: p.partnerProfileId,
    partnerName: p.partnerName,
    overallScore: avg(p.scores),
    deptCount: p.deptCount,
    kpiScores: Array.from(p.metricScores.entries()).map(([metricKey, scores]) => {
      const score = avg(scores);
      return { metricKey, score, status: toStatus(score) };
    }),
  }));

  return {
    periodId,
    periodLabel: period.label ?? `Period ${periodId}`,
    periodStart: period.periodStart.toISOString(),
    periodEnd: period.periodEnd.toISOString(),
    kpiTypes,
    departments: deptRows,
    partnerSummaries,
    orgOverallScore: avg(orgScores),
  };
}

// ─── Partner scorecard (one partner's departments + employees) ─────────────────

export type PartnerScorecard = {
  partnerProfileId: number;
  partnerName: string;
  periodId: number;
  overallScore: number | null;
  departments: DepartmentScorecard[];
};

export async function getPartnerScorecard(params: {
  partnerProfileId: number;
  periodId: number;
}): Promise<PartnerScorecard> {
  const { partnerProfileId, periodId } = params;

  const partner = await prisma.profile.findUniqueOrThrow({
    where: { id: partnerProfileId },
    select: { firstName: true, lastName: true },
  });

  const departments = await prisma.department.findMany({
    where: { partnerProfileId },
    select: { id: true },
  });

  const deptScorecards = await Promise.all(
    departments.map((d) => getDepartmentScorecard({ departmentId: d.id, periodId }))
  );

  const allScores = deptScorecards
    .map((sc) => sc.overallScore)
    .filter((s): s is number => s !== null);

  return {
    partnerProfileId,
    partnerName: `${partner.firstName} ${partner.lastName}`.trim(),
    periodId,
    overallScore: avg(allScores),
    departments: deptScorecards,
  };
}

// ─── Source data sync ─────────────────────────────────────────────────────────

const VALID_SOURCE_MODULES: KpiSourceModule[] = [
  "trainings",
  "timesheets",
  "jobs",
  "finance",
  "evaluations",
  "marketing",
];

const extractSourceModule = (config: unknown): KpiSourceModule | null => {
  if (!isRecord(config)) return null;
  const raw = String(config.sourceModule ?? config.module ?? "").toLowerCase();
  return VALID_SOURCE_MODULES.includes(raw as KpiSourceModule)
    ? (raw as KpiSourceModule)
    : null;
};

export async function syncKpiSourceData(periodId: number): Promise<SyncResult> {
  const period = await prisma.balancedScorecardMeasurementPeriod.findUniqueOrThrow({
    where: { id: periodId },
    select: { periodStart: true, periodEnd: true },
  });

  const range: PeriodRange = { start: period.periodStart, end: period.periodEnd };

  const kpis = await prisma.balancedScorecardKpi.findMany({
    where: { isActive: true },
    select: {
      id: true,
      ownerProfileId: true,
      trackingPlan: {
        select: {
          inputs: {
            orderBy: { sortOrder: "asc" },
            select: { inputKey: true, sourceConfig: true },
          },
        },
      },
    },
  });

  let synced = 0;
  let skipped = 0;
  let errors = 0;

  for (const kpi of kpis) {
    try {
      const inputs = kpi.trackingPlan?.inputs ?? [];
      if (inputs.length === 0) { skipped++; continue; }

      const firstSourceConfig = inputs
        .map((i) => i.sourceConfig)
        .find(isRecord) ?? {};
      const sourceModule = extractSourceModule(firstSourceConfig);

      if (!sourceModule || sourceModule === "manual") { skipped++; continue; }

      const profileId = kpi.ownerProfileId;
      if (!profileId) { skipped++; continue; }

      const definedKeys = new Set(inputs.map((i) => i.inputKey));

      let rawPoints: Array<{ inputKey: string; value: string }> = [];

      if (sourceModule === "trainings") {
        const d = await resolveTrainingData(profileId, range);
        rawPoints = [
          { inputKey: "completed_trainings", value: String(d.completed) },
          { inputKey: "required_trainings", value: String(d.total) },
        ];
      } else if (sourceModule === "timesheets") {
        const d = await resolveTimesheetData(profileId, range);
        rawPoints = [
          { inputKey: "billable_hours", value: String(d.billableHours) },
          { inputKey: "available_hours", value: String(d.totalHours) },
          { inputKey: "billable_amount", value: String(d.billableAmount) },
          { inputKey: "non_billable_amount", value: String(d.nonBillableAmount) },
        ];
      } else if (sourceModule === "jobs") {
        const d = await resolveJobData(profileId, range);
        rawPoints = [
          { inputKey: "completed_jobs", value: String(d.completedJobs) },
          { inputKey: "planned_jobs", value: String(d.plannedJobs) },
          { inputKey: "billable_amount", value: String(d.billableAmount) },
          { inputKey: "non_billable_amount", value: String(d.nonBillableAmount) },
        ];
      } else if (sourceModule === "evaluations") {
        const d = await resolveEvaluationData(profileId, range);
        if (d.score === null) { skipped++; continue; }
        rawPoints = [{ inputKey: "evaluation_score", value: String(d.score) }];
      } else if (sourceModule === "finance") {
        const d = await resolveFinanceData(profileId, range);
        rawPoints = [
          { inputKey: "invoiced_amount", value: String(d.invoiced) },
          { inputKey: "collected_amount", value: String(d.collected) },
        ];
      } else if (sourceModule === "marketing") {
        const d = await resolveMarketingData(profileId, range);
        rawPoints = [
          { inputKey: "qualified_leads", value: String(d.leads) },
          { inputKey: "converted_leads", value: String(d.converted) },
        ];
      }

      const matchedPoints = rawPoints.filter((dp) => definedKeys.has(dp.inputKey));
      if (matchedPoints.length === 0) { skipped++; continue; }

      await submitKpiDataPoints({
        kpiId: kpi.id,
        measurementPeriodId: periodId,
        values: matchedPoints.map((dp) => ({
          inputKey: dp.inputKey,
          rawValue: dp.value,
          sourceType: "system",
        })),
      });

      synced++;
    } catch {
      errors++;
    }
  }

  return { synced, skipped, errors };
}
