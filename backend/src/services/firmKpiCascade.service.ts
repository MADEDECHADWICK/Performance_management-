import { randomUUID } from "crypto";
import prisma from "../prisma";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CascadeScope = "all" | "by_department" | "by_role_type";
export type RoleType = "employee" | "manager" | "partner";

export type FirmKpiTemplateInput = {
  name: string;
  description?: string | null;
  metricKey?: string | null;
  sourceModule: string;
  measurementType: string;
  targetValue: number;
  unit: string;
  weight?: number;
  frequency?: string;
  formulaType: string;
  formulaNumeratorKey?: string;
  formulaDenominatorKey?: string;
  formulaValueKey?: string;
  scoringType: string;
  greenThreshold?: number | null;
  amberThreshold?: number | null;
  redThreshold?: number | null;
  cascadeScope: CascadeScope;
  departmentIds?: number[];
  roleTypes?: RoleType[];
  createdByProfileId?: number | null;
};

export type FirmKpiTemplate = {
  id: number;
  name: string;
  metricKey: string;
  sourceModule: string;
  targetValue: number;
  unit: string;
  cascadeScope: string;
  spawnedCount: number;
  isActive: boolean;
  createdAt: string;
};

export type CascadeStatusRow = {
  profileId: number;
  employeeName: string;
  departmentName: string | null;
  kpiId: number;
  score: number | null;
  status: string;
};

export type FirmKpiCascadeStatus = {
  templateId: number;
  templateName: string;
  metricKey: string;
  periodId: number;
  spawnedCount: number;
  onTrack: number;
  atRisk: number;
  offTrack: number;
  noData: number;
  firmAvgScore: number | null;
  rows: CascadeStatusRow[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const slug = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

const uniqueKey = (prefix: string, value: string) =>
  `${prefix}-${slug(value) || "item"}-${randomUUID().replace(/-/g, "").slice(0, 8)}`;

const avg = (values: number[]): number | null => {
  const valid = values.filter((v) => Number.isFinite(v));
  if (valid.length === 0) return null;
  return Math.round(valid.reduce((s, v) => s + v, 0) / valid.length);
};

// ─── Firm-level perspective + goal (upsert) ───────────────────────────────────

async function getOrCreateFirmCascadeGoal(): Promise<number> {
  const perspectiveKey = "firm-cascade-perspective";
  const goalKey = "firm-cascade-objectives";

  // Resolve the active scorecard version (may be null for standalone KPIs)
  const activeVersion = await prisma.balancedScorecardVersion.findFirst({
    where: { status: "published" },
    select: { id: true },
  });
  const scorecardVersionId = activeVersion?.id ?? null;

  // Upsert the firm perspective
  const perspective = await prisma.balancedScorecardPerspective.upsert({
    where: { key: perspectiveKey },
    update: {},
    create: {
      key: perspectiveKey,
      name: "Firm-Wide KPIs",
      scorecardVersionId,
      sortOrder: 999,
      isActive: true,
    },
  });

  // Upsert the firm goal
  const goal = await prisma.balancedScorecardGoal.upsert({
    where: { key: goalKey },
    update: {},
    create: {
      key: goalKey,
      perspectiveId: perspective.id,
      title: "Firm-Level Cascade Objectives",
      scorecardVersionId,
      sortOrder: 999,
      isActive: true,
    },
  });

  return goal.id;
}

// ─── Spawn one individual KPI from a template ─────────────────────────────────

async function spawnKpiForProfile(params: {
  template: {
    id: number;
    name: string;
    metricKey: string;
    goalId: number;
    scorecardVersionId: number | null;
    targetValue: number | null;
    unit: string;
    weight: number;
    frequency: string;
    firmTarget: string;
    formula: string | null;
    statusLogic: string | null;
    measurementType: string | null;
    targetDirection: string | null;
    engineFormula: { formulaType: string; config: any } | null;
    scoringRule: {
      scoringType: string;
      targetValue: any;
      greenThreshold: any;
      amberThreshold: any;
      redThreshold: any;
      minValue: any;
      maxValue: any;
      capScore: number;
      config: any;
    } | null;
    trackingPlan: {
      trackingType: string;
      frequency: string;
      dataQualityRule: string | null;
      requiresEvidence: boolean;
      inputs: Array<{
        inputKey: string;
        label: string;
        inputType: string;
        sourceType: string;
        sourceConfig: any;
        isRequired: boolean;
        sortOrder: number;
      }>;
    } | null;
  };
  profileId: number;
  ownerName: string;
  createdByProfileId?: number | null;
}): Promise<number> {
  const { template, profileId, ownerName, createdByProfileId } = params;

  return prisma.$transaction(async (tx) => {
    const kpi = await tx.balancedScorecardKpi.create({
      data: {
        key: uniqueKey("cascade", template.name),
        goalId: template.goalId,
        scorecardVersionId: template.scorecardVersionId,
        metricKey: template.metricKey,
        trackingMode: "manual",
        measurementType: template.measurementType,
        targetDirection: template.targetDirection,
        targetValue: template.targetValue,
        name: template.name,
        formula: template.formula,
        frequency: template.frequency,
        unit: template.unit,
        weight: template.weight,
        firmTarget: template.firmTarget,
        ownerName,
        ownerProfileId: profileId,
        statusLogic: template.statusLogic,
        updateFrequency: template.frequency,
        firmTemplateId: template.id,
        createdByProfileId: createdByProfileId ?? null,
      },
    });

    if (template.engineFormula) {
      await tx.balancedScorecardKpiFormula.create({
        data: {
          kpiId: kpi.id,
          formulaType: template.engineFormula.formulaType,
          config: template.engineFormula.config ?? {},
        },
      });
    }

    if (template.scoringRule) {
      await tx.balancedScorecardKpiScoringRule.create({
        data: {
          kpiId: kpi.id,
          scoringType: template.scoringRule.scoringType,
          targetValue: template.scoringRule.targetValue,
          greenThreshold: template.scoringRule.greenThreshold,
          amberThreshold: template.scoringRule.amberThreshold,
          redThreshold: template.scoringRule.redThreshold,
          minValue: template.scoringRule.minValue,
          maxValue: template.scoringRule.maxValue,
          capScore: template.scoringRule.capScore,
          config: template.scoringRule.config ?? {},
        },
      });
    }

    if (template.trackingPlan) {
      const plan = await tx.balancedScorecardKpiTrackingPlan.create({
        data: {
          kpiId: kpi.id,
          trackingType: template.trackingPlan.trackingType,
          frequency: template.trackingPlan.frequency,
          dataQualityRule: template.trackingPlan.dataQualityRule,
          requiresEvidence: template.trackingPlan.requiresEvidence,
        },
      });

      if (template.trackingPlan.inputs.length > 0) {
        await tx.balancedScorecardKpiTrackingInput.createMany({
          data: template.trackingPlan.inputs.map((inp) => ({
            trackingPlanId: plan.id,
            inputKey: inp.inputKey,
            label: inp.label,
            inputType: inp.inputType,
            sourceType: inp.sourceType,
            sourceConfig: inp.sourceConfig ?? {},
            isRequired: inp.isRequired,
            sortOrder: inp.sortOrder,
          })),
        });
      }
    }

    return kpi.id;
  });
}

// ─── Find employees matching cascade scope ────────────────────────────────────

async function resolveTargetProfiles(params: {
  cascadeScope: CascadeScope;
  departmentIds?: number[];
  roleTypes?: RoleType[];
}): Promise<Array<{ id: number; firstName: string; lastName: string }>> {
  const where: Record<string, unknown> = { status: "active" };

  if (params.cascadeScope === "by_department" && params.departmentIds?.length) {
    where.departmentId = { in: params.departmentIds };
  } else if (params.cascadeScope === "by_role_type" && params.roleTypes?.length) {
    const conditions: object[] = [];
    if (params.roleTypes.includes("partner")) {
      conditions.push({ isPartner: true });
    }
    if (params.roleTypes.includes("manager")) {
      conditions.push({ departmentsHeaded: { some: {} } });
    }
    if (params.roleTypes.includes("employee")) {
      conditions.push({ isPartner: false, departmentsHeaded: { none: {} } });
    }
    if (conditions.length === 1) {
      Object.assign(where, conditions[0]);
    } else if (conditions.length > 1) {
      where.OR = conditions;
    }
  }

  return prisma.profile.findMany({
    where: where as any,
    select: { id: true, firstName: true, lastName: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
}

// ─── Build tracking inputs for source module ──────────────────────────────────

function buildSourceInputs(sourceModule: string): Array<{
  inputKey: string;
  label: string;
  inputType: string;
  sourceType: string;
  sourceConfig: object;
  isRequired: boolean;
  sortOrder: number;
}> {
  const base = { sourceType: "system", isRequired: true, sourceConfig: { sourceModule } };
  switch (sourceModule) {
    case "timesheets":
      return [
        { ...base, inputKey: "billable_hours", label: "Billable Hours", inputType: "number", sortOrder: 1 },
        { ...base, inputKey: "available_hours", label: "Available Hours", inputType: "number", sortOrder: 2 },
      ];
    case "jobs":
      return [
        { ...base, inputKey: "completed_jobs", label: "Completed Jobs", inputType: "number", sortOrder: 1 },
        { ...base, inputKey: "planned_jobs", label: "Planned Jobs", inputType: "number", sortOrder: 2 },
      ];
    case "trainings":
      return [
        { ...base, inputKey: "completed_trainings", label: "Completed Trainings", inputType: "number", sortOrder: 1 },
        { ...base, inputKey: "required_trainings", label: "Required Trainings", inputType: "number", sortOrder: 2 },
      ];
    case "evaluations":
      return [
        { ...base, inputKey: "evaluation_score", label: "Evaluation Score", inputType: "number", sortOrder: 1 },
      ];
    case "finance":
      return [
        { ...base, inputKey: "invoiced_amount", label: "Invoiced Amount", inputType: "currency", sortOrder: 1 },
        { ...base, inputKey: "collected_amount", label: "Collected Amount", inputType: "currency", sortOrder: 2 },
      ];
    case "marketing":
      return [
        { ...base, inputKey: "qualified_leads", label: "Qualified Leads", inputType: "number", sortOrder: 1 },
        { ...base, inputKey: "converted_leads", label: "Converted Leads", inputType: "number", sortOrder: 2 },
      ];
    default:
      return [
        { ...base, sourceType: "manual", inputKey: "actual_value", label: "Actual Value", inputType: "number", sortOrder: 1 },
      ];
  }
}

// ─── Build formula config from source module ──────────────────────────────────

function buildFormulaConfig(sourceModule: string, formulaType: string, input: FirmKpiTemplateInput) {
  if (formulaType === "ratio") {
    const num = input.formulaNumeratorKey ?? "billable_hours";
    const den = input.formulaDenominatorKey ?? "available_hours";
    return { numeratorKey: num, denominatorKey: den, multiplier: 100 };
  }
  if (formulaType === "direct") {
    return { valueKey: input.formulaValueKey ?? "actual_value" };
  }
  // Default ratio per module
  switch (sourceModule) {
    case "timesheets": return { numeratorKey: "billable_hours", denominatorKey: "available_hours", multiplier: 100 };
    case "jobs": return { numeratorKey: "completed_jobs", denominatorKey: "planned_jobs", multiplier: 100 };
    case "trainings": return { numeratorKey: "completed_trainings", denominatorKey: "required_trainings", multiplier: 100 };
    case "finance": return { numeratorKey: "collected_amount", denominatorKey: "invoiced_amount", multiplier: 100 };
    case "marketing": return { numeratorKey: "converted_leads", denominatorKey: "qualified_leads", multiplier: 100 };
    case "evaluations": return { valueKey: "evaluation_score" };
    default: return { valueKey: "actual_value" };
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function createFirmKpiAndCascade(input: FirmKpiTemplateInput): Promise<{
  templateKpiId: number;
  spawnedCount: number;
  skipped: number;
}> {
  const goalId = await getOrCreateFirmCascadeGoal();

  const activeVersion = await prisma.balancedScorecardVersion.findFirst({
    where: { status: "published" },
    select: { id: true },
  });
  const scorecardVersionId = activeVersion?.id ?? null;

  const metricKey = input.metricKey?.trim()
    ? slug(input.metricKey)
    : uniqueKey("firm", input.name);

  const formulaTypeResolved = input.formulaType || (input.sourceModule === "evaluations" ? "direct" : "ratio");
  const formulaConfig = buildFormulaConfig(input.sourceModule, formulaTypeResolved, input);
  const trackingInputs = buildSourceInputs(input.sourceModule);

  const targetValue = input.targetValue;
  const greenThreshold = input.greenThreshold ?? targetValue * 0.8;
  const amberThreshold = input.amberThreshold ?? targetValue * 0.6;
  const firmTarget = `${targetValue}${input.unit ? ` ${input.unit}` : ""}`;

  // Build formula label
  const formulaLabel =
    formulaTypeResolved === "ratio"
      ? `(${(formulaConfig as any).numeratorKey} / ${(formulaConfig as any).denominatorKey}) × 100`
      : `${(formulaConfig as any).valueKey}`;

  // Create the template KPI (ownerProfileId = null)
  const templateKpi = await prisma.$transaction(async (tx) => {
    const kpi = await tx.balancedScorecardKpi.create({
      data: {
        key: uniqueKey("firm-template", input.name),
        goalId,
        scorecardVersionId,
        metricKey,
        trackingMode: "manual",
        measurementType: input.measurementType,
        targetDirection: "higher_better",
        targetValue,
        name: input.name,
        description: input.description?.trim() || null,
        formula: formulaLabel,
        frequency: input.frequency ?? "monthly",
        unit: input.unit,
        weight: input.weight ?? 100,
        firmTarget,
        ownerName: "Firm",
        ownerProfileId: null,
        statusLogic: `Green ≥${greenThreshold}, amber ≥${amberThreshold}, red below.`,
        updateFrequency: input.frequency ?? "monthly",
        firmTemplateId: null,
        createdByProfileId: input.createdByProfileId ?? null,
      },
    });

    await tx.balancedScorecardKpiFormula.create({
      data: { kpiId: kpi.id, formulaType: formulaTypeResolved, config: formulaConfig as any },
    });

    await tx.balancedScorecardKpiScoringRule.create({
      data: {
        kpiId: kpi.id,
        scoringType: input.scoringType ?? "higher_better",
        targetValue,
        greenThreshold,
        amberThreshold,
        redThreshold: input.redThreshold ?? 0,
        capScore: 100,
        config: { sourceModule: input.sourceModule },
      },
    });

    const plan = await tx.balancedScorecardKpiTrackingPlan.create({
      data: {
        kpiId: kpi.id,
        trackingType: "system_data_source",
        frequency: input.frequency ?? "monthly",
        dataQualityRule: `${input.sourceModule} source data; auto-synced.`,
        requiresEvidence: false,
      },
    });

    await tx.balancedScorecardKpiTrackingInput.createMany({
      data: trackingInputs.map((inp) => ({ trackingPlanId: plan.id, ...inp })),
    });

    return kpi;
  });

  // Fetch the full template for cloning
  const templateFull = await prisma.balancedScorecardKpi.findUniqueOrThrow({
    where: { id: templateKpi.id },
    select: {
      id: true, name: true, metricKey: true, goalId: true, scorecardVersionId: true,
      targetValue: true, unit: true, weight: true, frequency: true, firmTarget: true,
      formula: true, statusLogic: true, measurementType: true, targetDirection: true,
      engineFormula: { select: { formulaType: true, config: true } },
      scoringRule: {
        select: {
          scoringType: true, targetValue: true, greenThreshold: true,
          amberThreshold: true, redThreshold: true, minValue: true, maxValue: true,
          capScore: true, config: true,
        },
      },
      trackingPlan: {
        select: {
          trackingType: true, frequency: true, dataQualityRule: true, requiresEvidence: true,
          inputs: {
            select: { inputKey: true, label: true, inputType: true, sourceType: true, sourceConfig: true, isRequired: true, sortOrder: true },
          },
        },
      },
    },
  });

  // Resolve target profiles
  const profiles = await resolveTargetProfiles({
    cascadeScope: input.cascadeScope,
    departmentIds: input.departmentIds,
    roleTypes: input.roleTypes,
  });

  // Spawn individual KPIs
  let spawnedCount = 0;
  let skipped = 0;
  for (const profile of profiles) {
    try {
      const ownerName = `${profile.firstName} ${profile.lastName}`.trim();
      await spawnKpiForProfile({
        template: {
          ...templateFull,
          targetValue: templateFull.targetValue ? Number(templateFull.targetValue) : null,
        },
        profileId: profile.id,
        ownerName,
        createdByProfileId: input.createdByProfileId,
      });
      spawnedCount++;
    } catch {
      skipped++;
    }
  }

  return { templateKpiId: templateKpi.id, spawnedCount, skipped };
}

export async function listFirmKpiTemplates(): Promise<FirmKpiTemplate[]> {
  const templates = await prisma.balancedScorecardKpi.findMany({
    where: { ownerProfileId: null, firmTemplateId: null, isActive: true },
    select: {
      id: true, name: true, metricKey: true, unit: true, targetValue: true,
      frequency: true, isActive: true, createdAt: true,
      trackingPlan: {
        select: { inputs: { select: { sourceConfig: true }, take: 1 } },
      },
      _count: { select: { cascadedInstances: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return templates.map((t) => {
    const sourceConfig = t.trackingPlan?.inputs[0]?.sourceConfig;
    const sourceModule =
      sourceConfig && typeof sourceConfig === "object" && !Array.isArray(sourceConfig)
        ? String((sourceConfig as any).sourceModule ?? "manual")
        : "manual";
    return {
      id: t.id,
      name: t.name,
      metricKey: t.metricKey,
      sourceModule,
      targetValue: t.targetValue ? Number(t.targetValue) : 0,
      unit: t.unit,
      cascadeScope: "all",
      spawnedCount: t._count.cascadedInstances,
      isActive: t.isActive,
      createdAt: t.createdAt.toISOString(),
    };
  });
}

export async function getFirmKpiCascadeStatus(
  templateKpiId: number,
  periodId: number
): Promise<FirmKpiCascadeStatus> {
  const template = await prisma.balancedScorecardKpi.findUniqueOrThrow({
    where: { id: templateKpiId },
    select: { id: true, name: true, metricKey: true },
  });

  const spawned = await prisma.balancedScorecardKpi.findMany({
    where: { firmTemplateId: templateKpiId, isActive: true },
    select: {
      id: true,
      ownerProfileId: true,
      ownerProfile: {
        select: {
          firstName: true, lastName: true,
          department: { select: { name: true } },
        },
      },
      results: {
        where: { measurementPeriodId: periodId },
        select: { score: true, status: true },
        take: 1,
      },
    },
  });

  let onTrack = 0, atRisk = 0, offTrack = 0, noData = 0;
  const scores: number[] = [];
  const rows: CascadeStatusRow[] = [];

  for (const kpi of spawned) {
    const result = kpi.results[0] ?? null;
    const score = result?.score != null ? Number(result.score) : null;
    const status = result?.status ?? "no_data";
    if (status === "on_track") onTrack++;
    else if (status === "at_risk") atRisk++;
    else if (status === "off_track") offTrack++;
    else noData++;
    if (score !== null) scores.push(score);
    rows.push({
      profileId: kpi.ownerProfileId!,
      employeeName: kpi.ownerProfile
        ? `${kpi.ownerProfile.firstName} ${kpi.ownerProfile.lastName}`.trim()
        : "Unknown",
      departmentName: kpi.ownerProfile?.department?.name ?? null,
      kpiId: kpi.id,
      score,
      status,
    });
  }

  rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

  return {
    templateId: template.id,
    templateName: template.name,
    metricKey: template.metricKey,
    periodId,
    spawnedCount: spawned.length,
    onTrack,
    atRisk,
    offTrack,
    noData,
    firmAvgScore: avg(scores),
    rows,
  };
}

export async function deleteFirmKpiTemplate(templateKpiId: number): Promise<void> {
  await prisma.balancedScorecardKpi.updateMany({
    where: { firmTemplateId: templateKpiId },
    data: { isActive: false },
  });
  await prisma.balancedScorecardKpi.update({
    where: { id: templateKpiId },
    data: { isActive: false },
  });
}

// Re-sync a firm template to cover employees who joined after initial creation
export async function resyncFirmKpiTemplate(
  templateKpiId: number,
  createdByProfileId?: number | null
): Promise<{ created: number; alreadyExists: number }> {
  const templateFull = await prisma.balancedScorecardKpi.findUniqueOrThrow({
    where: { id: templateKpiId, firmTemplateId: null, ownerProfileId: null },
    select: {
      id: true, name: true, metricKey: true, goalId: true, scorecardVersionId: true,
      targetValue: true, unit: true, weight: true, frequency: true, firmTarget: true,
      formula: true, statusLogic: true, measurementType: true, targetDirection: true,
      engineFormula: { select: { formulaType: true, config: true } },
      scoringRule: {
        select: {
          scoringType: true, targetValue: true, greenThreshold: true,
          amberThreshold: true, redThreshold: true, minValue: true, maxValue: true,
          capScore: true, config: true,
        },
      },
      trackingPlan: {
        select: {
          trackingType: true, frequency: true, dataQualityRule: true, requiresEvidence: true,
          inputs: {
            select: { inputKey: true, label: true, inputType: true, sourceType: true, sourceConfig: true, isRequired: true, sortOrder: true },
          },
        },
      },
      cascadedInstances: {
        where: { isActive: true },
        select: { ownerProfileId: true },
      },
    },
  });

  // Find all currently active employees
  const allActiveProfiles = await prisma.profile.findMany({
    where: { status: "active" },
    select: { id: true, firstName: true, lastName: true },
  });

  // Determine which employees already have this KPI
  const existingProfileIds = new Set(
    templateFull.cascadedInstances
      .map((i) => i.ownerProfileId)
      .filter((id): id is number => id !== null)
  );

  const missing = allActiveProfiles.filter((p) => !existingProfileIds.has(p.id));

  let created = 0;
  for (const profile of missing) {
    try {
      const ownerName = `${profile.firstName} ${profile.lastName}`.trim();
      await spawnKpiForProfile({
        template: {
          ...templateFull,
          targetValue: templateFull.targetValue ? Number(templateFull.targetValue) : null,
        },
        profileId: profile.id,
        ownerName,
        createdByProfileId: createdByProfileId ?? null,
      });
      created++;
    } catch {
      // skip individuals that fail — don't abort the whole re-sync
    }
  }

  return { created, alreadyExists: existingProfileIds.size };
}
