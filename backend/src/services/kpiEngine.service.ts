import { randomUUID } from "crypto";
import prisma from "../prisma";
import cacheService from "./cache.service";
import { resolveActiveBalancedScorecardVersionId } from "./balancedScorecardGovernance.service";

export type KpiTrackingType =
  | "manual_entry"
  | "system_data_source"
  | "calculated_inputs"
  | "milestone_evidence"
  | "survey_rating"
  | "composite_child_kpis";

export type KpiInputType =
  | "number"
  | "currency"
  | "percentage"
  | "boolean"
  | "rating"
  | "text";

export type KpiSourceType =
  | "manual"
  | "system"
  | "calculated"
  | "evidence"
  | "survey"
  | "child_kpi";

export type KpiFormulaType =
  | "direct"
  | "ratio"
  | "sum"
  | "average"
  | "variance"
  | "growth_rate"
  | "milestone"
  | "survey_average"
  | "composite";

export type KpiScoringType =
  | "higher_better"
  | "lower_better"
  | "target_range"
  | "exact_match"
  | "milestone_complete"
  | "threshold_bands";

export type KpiMeasurementType =
  | "percentage"
  | "currency"
  | "number"
  | "count"
  | "days"
  | "boolean"
  | "milestone";

type DashboardStatus = "on_track" | "at_risk" | "off_track";

type FormulaConfig = {
  valueKey?: string;
  numeratorKey?: string;
  denominatorKey?: string;
  inputKeys?: string[];
  actualKey?: string;
  targetKey?: string;
  currentKey?: string;
  previousKey?: string;
  completedKey?: string;
  multiplier?: number;
  mode?: "absolute" | "percent";
  childKpis?: Array<{ kpiId: number; weight: number }>;
};

type TrackingInput = {
  inputKey: string;
  label: string;
  inputType: KpiInputType;
  sourceType: KpiSourceType;
  sourceConfig?: Record<string, unknown>;
  isRequired?: boolean;
};

type ScoringInput = {
  scoringType: KpiScoringType;
  targetValue?: number | null;
  greenThreshold?: number | null;
  amberThreshold?: number | null;
  redThreshold?: number | null;
  minValue?: number | null;
  maxValue?: number | null;
  capScore?: number | null;
  config?: Record<string, unknown>;
};

const validTrackingTypes: KpiTrackingType[] = [
  "manual_entry",
  "system_data_source",
  "calculated_inputs",
  "milestone_evidence",
  "survey_rating",
  "composite_child_kpis",
];

const validFormulaTypes: KpiFormulaType[] = [
  "direct",
  "ratio",
  "sum",
  "average",
  "variance",
  "growth_rate",
  "milestone",
  "survey_average",
  "composite",
];

const validScoringTypes: KpiScoringType[] = [
  "higher_better",
  "lower_better",
  "target_range",
  "exact_match",
  "milestone_complete",
  "threshold_bands",
];

const validInputTypes: KpiInputType[] = [
  "number",
  "currency",
  "percentage",
  "boolean",
  "rating",
  "text",
];

const validSourceTypes: KpiSourceType[] = [
  "manual",
  "system",
  "calculated",
  "evidence",
  "survey",
  "child_kpi",
];

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

const uniqueKey = (prefix: string, value: string) =>
  `${prefix}-${slugify(value) || "item"}-${randomUUID().replace(/-/g, "").slice(0, 8)}`;

const clamp = (value: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, Number.isFinite(value) ? value : 0));

const toNumberOrNull = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const requireValid = <T extends string>(value: string, allowed: T[], label: string): T => {
  if (!allowed.includes(value as T)) {
    const err = new Error(`Unsupported ${label}`) as Error & { statusCode?: number };
    err.statusCode = 400;
    throw err;
  }
  return value as T;
};

const scoreToStatus = (score: number): DashboardStatus => {
  if (score >= 85) return "on_track";
  if (score >= 65) return "at_risk";
  return "off_track";
};

const statusLabel = (status: DashboardStatus) => {
  if (status === "on_track") return "green";
  if (status === "at_risk") return "amber";
  return "red";
};

const normalizeInputKey = (value: string) =>
  slugify(value).replace(/-/g, "_") || `input_${randomUUID().slice(0, 6)}`;

const normalizeTrackingInputs = (inputs: TrackingInput[]) => {
  if (!Array.isArray(inputs) || inputs.length === 0) {
    const err = new Error("At least one tracking input is required") as Error & {
      statusCode?: number;
    };
    err.statusCode = 400;
    throw err;
  }

  const seen = new Set<string>();
  return inputs.map((input, index) => {
    const inputKey = normalizeInputKey(input.inputKey || input.label);
    if (seen.has(inputKey)) {
      const err = new Error(`Duplicate tracking input key: ${inputKey}`) as Error & {
        statusCode?: number;
      };
      err.statusCode = 400;
      throw err;
    }
    seen.add(inputKey);
    return {
      inputKey,
      label: input.label?.trim() || inputKey,
      inputType: requireValid(input.inputType, validInputTypes, "input type"),
      sourceType: requireValid(input.sourceType, validSourceTypes, "source type"),
      sourceConfig: input.sourceConfig ?? {},
      isRequired: input.isRequired ?? true,
      sortOrder: index + 1,
    };
  });
};

const normalizeFormulaConfig = (
  formulaType: KpiFormulaType,
  config: FormulaConfig,
  inputs: ReturnType<typeof normalizeTrackingInputs>
): FormulaConfig => {
  const firstInput = inputs[0]?.inputKey;
  const numericKeys = inputs
    .filter((input) => input.inputType !== "text")
    .map((input) => input.inputKey);

  if (formulaType === "direct") {
    return { valueKey: config.valueKey || firstInput };
  }
  if (formulaType === "ratio") {
    const numeratorKey = config.numeratorKey || numericKeys[0];
    const denominatorKey = config.denominatorKey || numericKeys[1];
    if (!numeratorKey || !denominatorKey) {
      const err = new Error("Ratio KPIs require numerator and denominator inputs") as Error & {
        statusCode?: number;
      };
      err.statusCode = 400;
      throw err;
    }
    return {
      numeratorKey,
      denominatorKey,
      multiplier: toNumberOrNull(config.multiplier) ?? 100,
    };
  }
  if (formulaType === "sum" || formulaType === "average" || formulaType === "survey_average") {
    return { inputKeys: config.inputKeys?.length ? config.inputKeys : numericKeys };
  }
  if (formulaType === "variance") {
    return {
      actualKey: config.actualKey || numericKeys[0],
      targetKey: config.targetKey || numericKeys[1],
      mode: config.mode || "absolute",
      multiplier: toNumberOrNull(config.multiplier) ?? 100,
    };
  }
  if (formulaType === "growth_rate") {
    return {
      currentKey: config.currentKey || numericKeys[0],
      previousKey: config.previousKey || numericKeys[1],
      multiplier: toNumberOrNull(config.multiplier) ?? 100,
    };
  }
  if (formulaType === "milestone") {
    return { completedKey: config.completedKey || firstInput };
  }
  if (formulaType === "composite") {
    const childKpis = Array.isArray(config.childKpis) ? config.childKpis : [];
    if (childKpis.length === 0) {
      const err = new Error("Composite KPIs require at least one child KPI") as Error & {
        statusCode?: number;
      };
      err.statusCode = 400;
      throw err;
    }
    return {
      childKpis: childKpis
        .filter((child) => Number.isFinite(Number(child.kpiId)))
        .map((child) => ({
          kpiId: Number(child.kpiId),
          weight: Math.max(0, Number(child.weight || 0)),
        })),
    };
  }
  return config;
};

const buildFormulaLabel = (formulaType: KpiFormulaType, config: FormulaConfig) => {
  if (formulaType === "direct") return `${config.valueKey || "value"}`;
  if (formulaType === "ratio") {
    return `(${config.numeratorKey || "numerator"} / ${config.denominatorKey || "denominator"}) x ${
      config.multiplier ?? 100
    }`;
  }
  if (formulaType === "sum") return `sum(${(config.inputKeys || []).join(", ")})`;
  if (formulaType === "average" || formulaType === "survey_average") {
    return `average(${(config.inputKeys || []).join(", ")})`;
  }
  if (formulaType === "variance") {
    return `${config.actualKey || "actual"} - ${config.targetKey || "target"}`;
  }
  if (formulaType === "growth_rate") {
    return `((${config.currentKey || "current"} - ${config.previousKey || "previous"}) / ${
      config.previousKey || "previous"
    }) x ${config.multiplier ?? 100}`;
  }
  if (formulaType === "milestone") return `${config.completedKey || "completed"} is complete`;
  return "weighted average of child KPI scores";
};

const buildTargetLabel = (measurementType: KpiMeasurementType, unit: string, scoring: ScoringInput) => {
  if (scoring.scoringType === "target_range") {
    const min = scoring.minValue ?? "";
    const max = scoring.maxValue ?? "";
    return `${min}-${max}${unit ? ` ${unit}` : ""}`;
  }
  const target =
    scoring.targetValue ??
    scoring.greenThreshold ??
    scoring.minValue ??
    scoring.maxValue ??
    null;
  if (target === null || target === undefined) return "Engine-scored";
  if (measurementType === "percentage") return `${target}%`;
  return unit ? `${target} ${unit}` : String(target);
};

const buildStatusLogicLabel = (scoring: ScoringInput) => {
  if (scoring.scoringType === "target_range") {
    return `Green inside ${scoring.minValue ?? "min"}-${scoring.maxValue ?? "max"}, amber near range, red outside tolerance.`;
  }
  if (scoring.scoringType === "milestone_complete") {
    return "Green when the milestone is complete, red while incomplete.";
  }
  if (scoring.scoringType === "exact_match") {
    return `Green when actual equals ${scoring.targetValue ?? "target"}, red otherwise.`;
  }
  if (scoring.greenThreshold !== null && scoring.greenThreshold !== undefined) {
    return `Green at ${scoring.greenThreshold}+, amber at ${scoring.amberThreshold ?? "review band"}+, red below ${
      scoring.redThreshold ?? scoring.amberThreshold ?? "threshold"
    }.`;
  }
  return `${scoring.scoringType.replace(/_/g, " ")} scoring against target ${scoring.targetValue ?? "value"}.`;
};

const targetDirectionForScoring = (scoringType: KpiScoringType) => {
  if (scoringType === "lower_better") return "lower_better";
  if (scoringType === "exact_match" || scoringType === "target_range") return "exact_match";
  if (scoringType === "milestone_complete") return "milestone_complete";
  return "higher_better";
};

const resolveOwnerReference = async (input: {
  ownerName?: string | null;
  ownerProfileId?: number | null;
}) => {
  const ownerName = input.ownerName?.trim() || null;
  if (!input.ownerProfileId) return { ownerName, ownerProfileId: input.ownerProfileId ?? null };

  const ownerProfile = await prisma.profile.findUnique({
    where: { id: input.ownerProfileId },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!ownerProfile) {
    const err = new Error("Owner profile not found") as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }
  return {
    ownerName: ownerName || `${ownerProfile.firstName} ${ownerProfile.lastName}`.trim() || null,
    ownerProfileId: ownerProfile.id,
  };
};

const assertGoalKpiWeightBudget = async (params: {
  goalId: number;
  incomingWeight: number;
}) => {
  if (!Number.isFinite(params.incomingWeight) || params.incomingWeight < 0 || params.incomingWeight > 100) {
    const err = new Error("KPI weight must be between 0 and 100") as Error & { statusCode?: number };
    err.statusCode = 400;
    throw err;
  }

  const aggregate = await prisma.balancedScorecardKpi.aggregate({
    where: { goalId: params.goalId, isActive: true },
    _sum: { weight: true },
  });
  const proposedTotal = Number(aggregate._sum.weight ?? 0) + Math.round(params.incomingWeight);
  if (proposedTotal > 100) {
    const err = new Error(
      `KPI weights for this goal would total ${proposedTotal}%. Keep the goal at or below 100%.`
    ) as Error & { statusCode?: number };
    err.statusCode = 409;
    throw err;
  }
};

const normalizeDataPointValue = (rawValue: unknown, inputType: string) => {
  if (inputType === "boolean") {
    if (rawValue === true || rawValue === 1 || String(rawValue).toLowerCase() === "true") return 1;
    return 0;
  }
  if (inputType === "text") return null;
  return toNumberOrNull(rawValue);
};

const getDataPointMap = (
  dataPoints: Array<{ inputKey: string; normalizedValue: unknown; rawValue: string }>
) => {
  const values = new Map<string, number>();
  dataPoints.forEach((point) => {
    const normalized = toNumberOrNull(point.normalizedValue);
    const fallback = toNumberOrNull(point.rawValue);
    if (normalized !== null) values.set(point.inputKey, normalized);
    else if (fallback !== null) values.set(point.inputKey, fallback);
  });
  return values;
};

const valueForKey = (values: Map<string, number>, key?: string) =>
  key ? values.get(key) ?? null : null;

const computeFormulaValue = async (params: {
  formulaType: KpiFormulaType;
  config: FormulaConfig;
  dataPoints: Array<{ inputKey: string; normalizedValue: unknown; rawValue: string }>;
  measurementPeriodId: number;
}) => {
  const values = getDataPointMap(params.dataPoints);
  const config = params.config;
  if (params.formulaType === "direct") {
    return valueForKey(values, config.valueKey);
  }
  if (params.formulaType === "ratio") {
    const numerator = valueForKey(values, config.numeratorKey);
    const denominator = valueForKey(values, config.denominatorKey);
    if (numerator === null || denominator === null || denominator === 0) return null;
    return (numerator / denominator) * (config.multiplier ?? 100);
  }
  if (params.formulaType === "sum") {
    const selected = (config.inputKeys || []).map((key) => valueForKey(values, key)).filter((v): v is number => v !== null);
    return selected.reduce((sum, value) => sum + value, 0);
  }
  if (params.formulaType === "average" || params.formulaType === "survey_average") {
    const selected = (config.inputKeys || []).map((key) => valueForKey(values, key)).filter((v): v is number => v !== null);
    if (selected.length === 0) return null;
    return selected.reduce((sum, value) => sum + value, 0) / selected.length;
  }
  if (params.formulaType === "variance") {
    const actual = valueForKey(values, config.actualKey);
    const target = valueForKey(values, config.targetKey);
    if (actual === null || target === null) return null;
    if (config.mode === "percent") {
      if (target === 0) return null;
      return ((actual - target) / target) * (config.multiplier ?? 100);
    }
    return actual - target;
  }
  if (params.formulaType === "growth_rate") {
    const current = valueForKey(values, config.currentKey);
    const previous = valueForKey(values, config.previousKey);
    if (current === null || previous === null || previous === 0) return null;
    return ((current - previous) / previous) * (config.multiplier ?? 100);
  }
  if (params.formulaType === "milestone") {
    const completed = valueForKey(values, config.completedKey);
    return completed && completed >= 1 ? 1 : 0;
  }
  if (params.formulaType === "composite") {
    const childKpis = config.childKpis || [];
    if (childKpis.length === 0) return null;
    const childScores = await Promise.all(
      childKpis.map(async (child) => {
        const result =
          (await prisma.balancedScorecardKpiResult.findUnique({
            where: {
              measurementPeriodId_kpiId: {
                measurementPeriodId: params.measurementPeriodId,
                kpiId: child.kpiId,
              },
            },
            select: { score: true },
          })) ||
          (await prisma.balancedScorecardKpiResult.findFirst({
            where: { kpiId: child.kpiId },
            orderBy: { calculatedAt: "desc" },
            select: { score: true },
          }));
        return { score: result?.score ?? 0, weight: child.weight };
      })
    );
    const weightTotal = childScores.reduce((sum, child) => sum + child.weight, 0);
    if (weightTotal <= 0) {
      return childScores.reduce((sum, child) => sum + child.score, 0) / childScores.length;
    }
    return childScores.reduce((sum, child) => sum + child.score * child.weight, 0) / weightTotal;
  }
  return null;
};

const scoreFormulaValue = (
  actualValue: number | null,
  scoring: {
    scoringType: string;
    targetValue: unknown;
    greenThreshold: unknown;
    amberThreshold: unknown;
    redThreshold: unknown;
    minValue: unknown;
    maxValue: unknown;
    capScore: number;
  }
) => {
  if (actualValue === null || !Number.isFinite(actualValue)) return 0;
  const capScore = scoring.capScore || 100;
  const target = toNumberOrNull(scoring.targetValue);
  const green = toNumberOrNull(scoring.greenThreshold);
  const amber = toNumberOrNull(scoring.amberThreshold);
  const min = toNumberOrNull(scoring.minValue);
  const max = toNumberOrNull(scoring.maxValue);

  if (scoring.scoringType === "lower_better") {
    const comparison = target ?? green;
    if (!comparison || comparison <= 0) return 0;
    if (actualValue <= 0) return capScore;
    return clamp((comparison / actualValue) * 100, 0, capScore);
  }
  if (scoring.scoringType === "exact_match") {
    return target !== null && actualValue === target ? capScore : 0;
  }
  if (scoring.scoringType === "milestone_complete") {
    return actualValue >= 1 ? capScore : 0;
  }
  if (scoring.scoringType === "target_range") {
    if (min === null || max === null) return 0;
    if (actualValue >= min && actualValue <= max) return capScore;
    const nearestBoundary = actualValue < min ? min : max;
    const tolerance = Math.max(Math.abs(amber ?? nearestBoundary * 0.15), 1);
    return clamp(capScore - (Math.abs(actualValue - nearestBoundary) / tolerance) * 35, 0, capScore);
  }
  if (scoring.scoringType === "threshold_bands" && green !== null) {
    const floor = amber ?? green * 0.75;
    if (actualValue >= green) return capScore;
    if (actualValue >= floor) return clamp(65 + ((actualValue - floor) / Math.max(green - floor, 1)) * 20, 65, 84);
    return clamp((actualValue / Math.max(floor, 1)) * 64, 0, 64);
  }
  const comparison = target ?? green;
  if (!comparison || comparison <= 0) return 0;
  return clamp((actualValue / comparison) * 100, 0, capScore);
};

const buildCurrentMonthPeriod = (date = new Date()) => {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return {
    start,
    end,
    keySuffix: `${date.getFullYear()}-${month}`,
    label: `${date.toLocaleString("en-GB", { month: "short" })} ${date.getFullYear()} KPI tracking`,
  };
};

export async function resolveKpiMeasurementPeriod(kpiId: number, periodId?: number | null) {
  if (periodId) {
    const period = await prisma.balancedScorecardMeasurementPeriod.findUnique({
      where: { id: periodId },
    });
    if (!period) {
      const err = new Error("Measurement period not found") as Error & { statusCode?: number };
      err.statusCode = 404;
      throw err;
    }
    return period;
  }

  const kpi = await prisma.balancedScorecardKpi.findUnique({
    where: { id: kpiId },
    select: { scorecardVersionId: true },
  });
  if (!kpi) {
    const err = new Error("KPI not found") as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }

  const scorecardVersionId =
    kpi.scorecardVersionId ?? (await resolveActiveBalancedScorecardVersionId());
  if (!scorecardVersionId) {
    const err = new Error("An active scorecard version is required before KPI tracking can start") as Error & {
      statusCode?: number;
    };
    err.statusCode = 409;
    throw err;
  }

  const current = buildCurrentMonthPeriod();
  const existing =
    (await prisma.balancedScorecardMeasurementPeriod.findFirst({
      where: {
        scorecardVersionId,
        periodStart: { lte: new Date() },
        periodEnd: { gte: new Date() },
      },
      orderBy: { periodStart: "desc" },
    })) ||
    (await prisma.balancedScorecardMeasurementPeriod.findFirst({
      where: { scorecardVersionId },
      orderBy: { periodEnd: "desc" },
    }));

  if (existing) return existing;

  const key = `kpi-tracking-${scorecardVersionId}-${current.keySuffix}`;
  return prisma.balancedScorecardMeasurementPeriod.upsert({
    where: { key },
    update: {},
    create: {
      key,
      scorecardVersionId,
      label: current.label,
      cadence: "monthly",
      periodStart: current.start,
      periodEnd: current.end,
      status: "draft",
    },
  });
}

export async function createKpiWithEngine(input: {
  goalId: number;
  name: string;
  description?: string | null;
  ownerName?: string | null;
  ownerProfileId?: number | null;
  measurementType: KpiMeasurementType;
  frequency: string;
  unit: string;
  weight: number;
  tracking: {
    trackingType: KpiTrackingType;
    frequency: string;
    updateOwnerProfileId?: number | null;
    dueDay?: number | null;
    graceDays?: number | null;
    requiresEvidence?: boolean;
    dataQualityRule?: string | null;
    inputs: TrackingInput[];
  };
  formula: {
    formulaType: KpiFormulaType;
    config?: FormulaConfig;
  };
  scoring: ScoringInput;
  createdByProfileId?: number | null;
}) {
  const trimmedName = input.name.trim();
  if (trimmedName.length < 3) {
    const err = new Error("KPI name is required") as Error & { statusCode?: number };
    err.statusCode = 400;
    throw err;
  }

  const goal = await prisma.balancedScorecardGoal.findUnique({
    where: { id: input.goalId },
    select: { id: true, isActive: true, scorecardVersionId: true },
  });
  if (!goal || !goal.isActive) {
    const err = new Error("Goal not found") as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }

  const trackingType = requireValid(input.tracking.trackingType, validTrackingTypes, "tracking type");
  const formulaType = requireValid(input.formula.formulaType, validFormulaTypes, "formula type");
  const scoringType = requireValid(input.scoring.scoringType, validScoringTypes, "scoring type");
  const inputs = normalizeTrackingInputs(input.tracking.inputs);
  const formulaConfig = normalizeFormulaConfig(formulaType, input.formula.config ?? {}, inputs);
  const scoringInput = { ...input.scoring, scoringType };

  await assertGoalKpiWeightBudget({ goalId: input.goalId, incomingWeight: input.weight });
  const owner = await resolveOwnerReference({
    ownerName: input.ownerName,
    ownerProfileId: input.ownerProfileId,
  });
  const sortOrder =
    (await prisma.balancedScorecardKpi.count({
      where: { goalId: input.goalId, isActive: true },
    })) + 1;
  const targetLabel = buildTargetLabel(input.measurementType, input.unit, scoringInput);
  const formulaLabel = buildFormulaLabel(formulaType, formulaConfig);
  const statusLogic = buildStatusLogicLabel(scoringInput);

  const created = await prisma.$transaction(async (tx) => {
    const kpi = await tx.balancedScorecardKpi.create({
      data: {
        key: uniqueKey("kpi", trimmedName),
        goalId: input.goalId,
        scorecardVersionId: goal.scorecardVersionId ?? null,
        metricKey: uniqueKey("engine", trimmedName),
        trackingMode: "manual",
        measurementType: input.measurementType,
        targetDirection: targetDirectionForScoring(scoringType),
        targetValue:
          input.scoring.targetValue ??
          input.scoring.greenThreshold ??
          input.scoring.minValue ??
          null,
        currentActualValue: null,
        lastMeasurementNote: null,
        name: trimmedName,
        description: input.description?.trim() || null,
        formula: formulaLabel,
        frequency: input.frequency.trim(),
        unit: input.unit.trim(),
        weight: Math.max(0, Math.round(input.weight)),
        firmTarget: targetLabel,
        ownerName: owner.ownerName,
        ownerProfileId: owner.ownerProfileId ?? null,
        statusLogic,
        updateFrequency: input.tracking.frequency.trim() || input.frequency.trim(),
        sortOrder,
        createdByProfileId: input.createdByProfileId ?? null,
      },
    });

    await tx.balancedScorecardKpiFormula.create({
      data: {
        kpiId: kpi.id,
        formulaType,
        config: formulaConfig as any,
      },
    });

    await tx.balancedScorecardKpiScoringRule.create({
      data: {
        kpiId: kpi.id,
        scoringType,
        targetValue: input.scoring.targetValue ?? null,
        greenThreshold: input.scoring.greenThreshold ?? null,
        amberThreshold: input.scoring.amberThreshold ?? null,
        redThreshold: input.scoring.redThreshold ?? null,
        minValue: input.scoring.minValue ?? null,
        maxValue: input.scoring.maxValue ?? null,
        capScore: Math.max(1, Math.min(100, Math.round(input.scoring.capScore ?? 100))),
        config: (input.scoring.config ?? {}) as any,
      },
    });

    const plan = await tx.balancedScorecardKpiTrackingPlan.create({
      data: {
        kpiId: kpi.id,
        trackingType,
        frequency: input.tracking.frequency.trim() || input.frequency.trim(),
        updateOwnerProfileId: input.tracking.updateOwnerProfileId ?? null,
        dueDay:
          input.tracking.dueDay !== null && input.tracking.dueDay !== undefined
            ? Math.max(1, Math.min(31, Math.round(input.tracking.dueDay)))
            : null,
        graceDays: Math.max(0, Math.round(input.tracking.graceDays ?? 0)),
        requiresEvidence: input.tracking.requiresEvidence ?? false,
        dataQualityRule: input.tracking.dataQualityRule?.trim() || null,
      },
    });

    await tx.balancedScorecardKpiTrackingInput.createMany({
      data: inputs.map((trackingInput) => ({
        trackingPlanId: plan.id,
        inputKey: trackingInput.inputKey,
        label: trackingInput.label,
        inputType: trackingInput.inputType,
        sourceType: trackingInput.sourceType,
        sourceConfig: trackingInput.sourceConfig as any,
        isRequired: trackingInput.isRequired,
        sortOrder: trackingInput.sortOrder,
      })),
    });

    return kpi;
  });

  cacheService.invalidate("^bsc:workspace:");
  return getKpiEngineDetail(created.id);
}

export async function getKpiEngineDetail(kpiId: number) {
  const detail = await prisma.balancedScorecardKpi.findUnique({
    where: { id: kpiId },
    include: {
      engineFormula: true,
      scoringRule: true,
      trackingPlan: {
        include: {
          inputs: { orderBy: { sortOrder: "asc" } },
          updateOwner: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      },
      results: {
        orderBy: { calculatedAt: "desc" },
        take: 6,
        include: {
          measurementPeriod: {
            select: { id: true, label: true, periodStart: true, periodEnd: true, status: true },
          },
        },
      },
      dataPoints: {
        orderBy: { submittedAt: "desc" },
        take: 20,
      },
      actions: {
        where: { status: { not: "closed" } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!detail) {
    const err = new Error("KPI not found") as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }
  return detail;
}

export async function calculateKpiResult(input: {
  kpiId: number;
  measurementPeriodId?: number | null;
}) {
  const period = await resolveKpiMeasurementPeriod(input.kpiId, input.measurementPeriodId);
  const kpi = await prisma.balancedScorecardKpi.findUnique({
    where: { id: input.kpiId },
    include: {
      engineFormula: true,
      scoringRule: true,
      trackingPlan: { include: { inputs: true } },
    },
  });
  if (!kpi || !kpi.isActive) {
    const err = new Error("KPI not found") as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }
  if (!kpi.engineFormula || !kpi.scoringRule || !kpi.trackingPlan) {
    const err = new Error("This KPI does not have an engine tracking plan") as Error & {
      statusCode?: number;
    };
    err.statusCode = 409;
    throw err;
  }

  const dataPoints = await prisma.balancedScorecardKpiDataPoint.findMany({
    where: { kpiId: input.kpiId, measurementPeriodId: period.id },
    select: { inputKey: true, rawValue: true, normalizedValue: true },
  });
  const presentKeys = new Set(dataPoints.map((point) => point.inputKey));
  const missingRequiredInputs = kpi.trackingPlan.inputs
    .filter((trackingInput) => trackingInput.isRequired && !presentKeys.has(trackingInput.inputKey))
    .map((trackingInput) => trackingInput.label);

  if (missingRequiredInputs.length > 0 && kpi.engineFormula.formulaType !== "composite") {
    const err = new Error(`Missing KPI input data: ${missingRequiredInputs.join(", ")}`) as Error & {
      statusCode?: number;
    };
    err.statusCode = 400;
    throw err;
  }

  const actualValue = await computeFormulaValue({
    formulaType: kpi.engineFormula.formulaType as KpiFormulaType,
    config: kpi.engineFormula.config as FormulaConfig,
    dataPoints,
    measurementPeriodId: period.id,
  });
  const score = Math.round(
    scoreFormulaValue(actualValue, {
      scoringType: kpi.scoringRule.scoringType,
      targetValue: kpi.scoringRule.targetValue,
      greenThreshold: kpi.scoringRule.greenThreshold,
      amberThreshold: kpi.scoringRule.amberThreshold,
      redThreshold: kpi.scoringRule.redThreshold,
      minValue: kpi.scoringRule.minValue,
      maxValue: kpi.scoringRule.maxValue,
      capScore: kpi.scoringRule.capScore,
    })
  );
  const status = scoreToStatus(score);

  const previousResults = await prisma.balancedScorecardKpiResult.findMany({
    where: { kpiId: input.kpiId, measurementPeriodId: { not: period.id } },
    orderBy: { calculatedAt: "desc" },
    take: 5,
    select: { actualValue: true },
  });
  const trend = [
    ...previousResults
      .slice()
      .reverse()
      .map((result) => toNumberOrNull(result.actualValue) ?? 0),
    actualValue ?? 0,
  ];

  const result = await prisma.balancedScorecardKpiResult.upsert({
    where: {
      measurementPeriodId_kpiId: {
        measurementPeriodId: period.id,
        kpiId: input.kpiId,
      },
    },
    update: {
      actualValue,
      score,
      status: status as any,
      trend,
      calculatedAt: new Date(),
    },
    create: {
      kpiId: input.kpiId,
      measurementPeriodId: period.id,
      actualValue,
      score,
      status: status as any,
      trend,
    },
  });

  await prisma.balancedScorecardKpi.update({
    where: { id: input.kpiId },
    data: {
      currentActualValue: actualValue,
      lastMeasurementNote: `Engine calculated ${actualValue ?? "no value"} with ${score}% score (${statusLabel(status)}).`,
    },
  });

  if (status === "on_track") {
    await prisma.balancedScorecardKpiAction.updateMany({
      where: { kpiId: input.kpiId, status: "open" },
      data: { status: "closed" },
    });
  } else {
    const existingAction = await prisma.balancedScorecardKpiAction.findFirst({
      where: { kpiId: input.kpiId, resultId: result.id, status: "open" },
      select: { id: true },
    });
    if (!existingAction) {
      await prisma.balancedScorecardKpiAction.create({
        data: {
          kpiId: input.kpiId,
          resultId: result.id,
          title: `Review ${kpi.name} (${statusLabel(status)})`,
          ownerProfileId: kpi.ownerProfileId ?? null,
          status: "open",
        },
      });
    }
  }

  cacheService.invalidate("^bsc:workspace:");
  return getKpiEngineDetail(input.kpiId);
}

export async function submitKpiDataPoints(input: {
  kpiId: number;
  measurementPeriodId?: number | null;
  values: Array<{
    inputKey: string;
    rawValue: unknown;
    evidenceUrl?: string | null;
    note?: string | null;
    sourceType?: KpiSourceType | null;
  }>;
  submittedByProfileId?: number | null;
}) {
  const period = await resolveKpiMeasurementPeriod(input.kpiId, input.measurementPeriodId);
  const kpi = await prisma.balancedScorecardKpi.findUnique({
    where: { id: input.kpiId },
    include: { trackingPlan: { include: { inputs: true } } },
  });
  if (!kpi?.trackingPlan) {
    const err = new Error("This KPI does not have a tracking plan") as Error & {
      statusCode?: number;
    };
    err.statusCode = 409;
    throw err;
  }
  if (!Array.isArray(input.values) || input.values.length === 0) {
    const err = new Error("At least one data point is required") as Error & { statusCode?: number };
    err.statusCode = 400;
    throw err;
  }

  const inputMap = new Map(kpi.trackingPlan.inputs.map((trackingInput) => [trackingInput.inputKey, trackingInput]));
  for (const value of input.values) {
    const inputKey = normalizeInputKey(value.inputKey);
    const trackingInput = inputMap.get(inputKey);
    if (!trackingInput) {
      const err = new Error(`Unknown tracking input: ${value.inputKey}`) as Error & {
        statusCode?: number;
      };
      err.statusCode = 400;
      throw err;
    }
    const normalizedValue = normalizeDataPointValue(value.rawValue, trackingInput.inputType);
    await prisma.balancedScorecardKpiDataPoint.upsert({
      where: {
        measurementPeriodId_kpiId_inputKey: {
          measurementPeriodId: period.id,
          kpiId: input.kpiId,
          inputKey,
        },
      },
      update: {
        rawValue: String(value.rawValue ?? ""),
        normalizedValue,
        evidenceUrl: value.evidenceUrl?.trim() || null,
        note: value.note?.trim() || null,
        sourceType: value.sourceType || trackingInput.sourceType,
        submittedByProfileId: input.submittedByProfileId ?? null,
        submittedAt: new Date(),
        dataQualityStatus:
          normalizedValue === null && trackingInput.inputType !== "text"
            ? ("warning" as any)
            : ("healthy" as any),
      },
      create: {
        kpiId: input.kpiId,
        measurementPeriodId: period.id,
        inputKey,
        rawValue: String(value.rawValue ?? ""),
        normalizedValue,
        evidenceUrl: value.evidenceUrl?.trim() || null,
        note: value.note?.trim() || null,
        sourceType: value.sourceType || trackingInput.sourceType,
        submittedByProfileId: input.submittedByProfileId ?? null,
        dataQualityStatus:
          normalizedValue === null && trackingInput.inputType !== "text"
            ? ("warning" as any)
            : ("healthy" as any),
      },
    });
  }

  return calculateKpiResult({ kpiId: input.kpiId, measurementPeriodId: period.id });
}
