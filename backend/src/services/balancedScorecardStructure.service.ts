import prisma from "../prisma";
import { randomUUID } from "crypto";
import { resolveActiveBalancedScorecardVersionId } from "./balancedScorecardGovernance.service";
import cacheService from "./cache.service";
import {
  baselineGoals,
  baselineInitiatives,
  baselineKpis,
  baselinePerspectives,
} from "./balancedScorecardBaseline";

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

// Uses a UUID suffix to prevent key collisions during bulk inserts or concurrent requests.
const uniqueKey = (prefix: string, value: string) =>
  `${prefix}-${slugify(value) || "item"}-${randomUUID().replace(/-/g, "").slice(0, 8)}`;

const decimalValueOrNull = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const resolveOwnerReference = async (input: {
  ownerName?: string | null;
  ownerProfileId?: number | null;
}) => {
  const ownerName = input.ownerName?.trim() || null;

  if (input.ownerProfileId === undefined) {
    return { ownerName, ownerProfileId: undefined as number | null | undefined };
  }

  if (input.ownerProfileId === null) {
    return { ownerName, ownerProfileId: null };
  }

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

const resolveVersionScope = async (scorecardVersionId?: number | null) => {
  const resolvedVersionId =
    scorecardVersionId !== undefined
      ? scorecardVersionId
      : await resolveActiveBalancedScorecardVersionId();
  return {
    resolvedVersionId,
    versionWhere:
      resolvedVersionId !== null
        ? { scorecardVersionId: resolvedVersionId }
        : { scorecardVersionId: null },
  };
};

const invalidateBalancedScorecardWorkspaceCache = () => {
  cacheService.invalidate("^bsc:workspace:");
};

const mapConflict = (message: string) => {
  const err = new Error(message) as Error & { statusCode?: number };
  err.statusCode = 409;
  throw err;
};

const assertKpiWeightValue = (incomingWeight: number) => {
  if (!Number.isFinite(incomingWeight) || incomingWeight < 0 || incomingWeight > 100) {
    const err = new Error("KPI weight must be between 0 and 100") as Error & { statusCode?: number };
    err.statusCode = 400;
    throw err;
  }
};

export type StructurePerspective = {
  id: number;
  key: string;
  name: string;
  ownerName: string | null;
  summary: string | null;
  sortOrder: number;
};

export type StructureGoal = {
  id: number;
  key: string;
  perspectiveId: number;
  title: string;
  description: string | null;
  ownerName: string | null;
  sortOrder: number;
};

export type StructureKpi = {
  id: number;
  key: string;
  goalId: number;
  metricKey: string;
  trackingMode: KpiTrackingMode;
  measurementType: KpiMeasurementType | null;
  targetDirection: KpiTargetDirection | null;
  targetValue: number | null;
  currentActualValue: number | null;
  lastMeasurementNote: string | null;
  name: string;
  description: string | null;
  formula: string | null;
  frequency: string;
  unit: string;
  weight: number;
  firmTarget: string;
  ownerName: string | null;
  ownerProfileId: number | null;
  statusLogic: string | null;
  updateFrequency: string | null;
  sortOrder: number;
};

export type StructureInitiative = {
  id: number;
  key: string;
  goalId: number;
  kpiId: number;
  parentInitiativeId: number | null;
  scopeRole: string;
  title: string;
  summary: string | null;
  ownerName: string | null;
  ownerProfileId: number | null;
  timeline: string | null;
  dueDate: Date | null;
  status: string;
  progress: number;
  sortOrder: number;
};

export type BalancedScorecardKpiAssignmentRecord = {
  id: number;
  kpiId: number;
  kpiKey: string;
  kpiName: string;
  profileId: number;
  profileName: string;
  roleId: number | null;
  roleName: string | null;
  scorecardVersionId: number;
  individualTarget: number | null;
  individualWeight: number;
  createdByProfileId: number | null;
  createdAt: string;
  updatedAt: string;
};

export type PerformanceBandRecord = {
  id: number;
  roleId: number | null;
  roleName: string | null;
  onTrackMin: number;
  atRiskMin: number;
  label: string | null;
  createdAt: string;
  updatedAt: string;
};

export type KpiTrackingMode = "template" | "manual";
export type KpiMeasurementType =
  | "percentage"
  | "currency"
  | "number"
  | "count"
  | "days"
  | "boolean"
  | "milestone";
export type KpiTargetDirection =
  | "higher_better"
  | "lower_better"
  | "exact_match"
  | "milestone_complete";

type SeedPerspective = {
  key: string;
  name: string;
  ownerName: string;
  summary: string;
  sortOrder: number;
};

type SeedGoal = {
  key: string;
  perspectiveKey: string;
  title: string;
  description: string;
  ownerName: string;
  sortOrder: number;
};

type SeedKpi = {
  key: string;
  goalKey: string;
  metricKey: string;
  name: string;
  description: string;
  formula: string;
  frequency: string;
  unit: string;
  weight: number;
  firmTarget: string;
  ownerName: string;
  statusLogic: string;
  updateFrequency: string;
  sortOrder: number;
};

type SeedInitiative = {
  key: string;
  goalKey: string;
  kpiKey: string;
  parentKey?: string;
  scopeRole: string;
  title: string;
  summary: string;
  ownerName: string;
  timeline: string;
  dueDate?: string;
  status: "on_track" | "at_risk" | "off_track";
  progress: number;
  sortOrder: number;
};

const legacySeedPerspectives: SeedPerspective[] = [
  {
    key: "financial",
    name: "Financial",
    ownerName: "HR / Strategy Office",
    summary: "Revenue growth, realization, and margin discipline across the firm portfolio.",
    sortOrder: 1,
  },
  {
    key: "customer",
    name: "Customer / Stakeholder",
    ownerName: "GMP Office",
    summary: "Retention, client share-of-wallet, and stakeholder confidence for priority accounts.",
    sortOrder: 2,
  },
  {
    key: "internal",
    name: "Internal Process",
    ownerName: "Operations Council",
    summary: "Delivery quality, turnaround discipline, and matter execution performance.",
    sortOrder: 3,
  },
  {
    key: "people",
    name: "People / Learning & Growth",
    ownerName: "HR Business Partnering",
    summary: "Capability development, coaching, and resource readiness behind the delivery engine.",
    sortOrder: 4,
  },
];

const legacySeedGoals: SeedGoal[] = [
  {
    key: "goal-1",
    perspectiveKey: "financial",
    title: "Grow recurring revenue from priority accounts",
    description: "Expand wallet share with the top 20 strategic clients while protecting realization quality.",
    ownerName: "Grace Njeri",
    sortOrder: 1,
  },
  {
    key: "goal-2",
    perspectiveKey: "financial",
    title: "Improve matter recovery and billing discipline",
    description: "Reduce write-offs and improve collection efficiency across recurring matters.",
    ownerName: "Victor Omondi",
    sortOrder: 2,
  },
  {
    key: "goal-3",
    perspectiveKey: "customer",
    title: "Deepen client retention and cross-sell",
    description: "Lift retention for strategic clients and convert more cross-practice opportunities.",
    ownerName: "Grace Njeri",
    sortOrder: 1,
  },
  {
    key: "goal-4",
    perspectiveKey: "customer",
    title: "Strengthen stakeholder confidence in delivery",
    description: "Improve service reviews, response quality, and proactive communication with client teams.",
    ownerName: "James Mutua",
    sortOrder: 2,
  },
  {
    key: "goal-5",
    perspectiveKey: "internal",
    title: "Tighten turnaround and SLA adherence",
    description: "Make delivery timings visible and improve control across active jobs and review cycles.",
    ownerName: "Brian Mwangi",
    sortOrder: 1,
  },
  {
    key: "goal-6",
    perspectiveKey: "internal",
    title: "Reduce review rework across assignments",
    description: "Build first-time-right behavior and reduce late-stage review corrections.",
    ownerName: "Agnes Wairimu",
    sortOrder: 2,
  },
  {
    key: "goal-7",
    perspectiveKey: "people",
    title: "Lift coaching discipline and capability depth",
    description: "Increase scheduled coaching touchpoints and learning completion across key staff bands.",
    ownerName: "Sarah Mwikali",
    sortOrder: 1,
  },
  {
    key: "goal-8",
    perspectiveKey: "people",
    title: "Improve readiness for priority client work",
    description: "Increase training readiness and specialist deployment confidence for complex work.",
    ownerName: "Sarah Mwikali",
    sortOrder: 2,
  },
];

const legacySeedKpis: SeedKpi[] = [
  {
    key: "kpi-1",
    goalKey: "goal-1",
    metricKey: "kpi-1",
    name: "Priority account revenue growth",
    description: "Tracks revenue collected against the current projection pack for priority account work.",
    formula: "Current month collected revenue / current month projected revenue",
    frequency: "Monthly",
    unit: "%",
    weight: 20,
    firmTarget: "90%",
    ownerName: "HR / Strategy Office",
    statusLogic: "Green at 90%+, amber at 75%-89.9%, red below 75%.",
    updateFrequency: "Monthly finance close",
    sortOrder: 1,
  },
  {
    key: "kpi-2",
    goalKey: "goal-1",
    metricKey: "kpi-2",
    name: "Matter realization rate",
    description: "Shows how much of issued invoice value has already been recovered as cash.",
    formula: "Invoice amount paid / total issued invoice value",
    frequency: "Monthly",
    unit: "%",
    weight: 18,
    firmTarget: "85%",
    ownerName: "Finance",
    statusLogic: "Green at 85%+, amber at 70%-84.9%, red below 70%.",
    updateFrequency: "Monthly collections review",
    sortOrder: 2,
  },
  {
    key: "kpi-3",
    goalKey: "goal-2",
    metricKey: "kpi-3",
    name: "Collection cycle days",
    description: "Average elapsed days from invoice issue to payment or current aging for unresolved invoices.",
    formula: "Average days from invoice issue date to paid date",
    frequency: "Weekly",
    unit: "Days",
    weight: 14,
    firmTarget: "42 days",
    ownerName: "Finance",
    statusLogic: "Green at 42 days or better, amber 43-50, red above 50 days.",
    updateFrequency: "Weekly collections huddle",
    sortOrder: 1,
  },
  {
    key: "kpi-4",
    goalKey: "goal-3",
    metricKey: "kpi-4",
    name: "Strategic client retention",
    description: "Share of prior-period clients who are also active in the current period — true carry-forward retention.",
    formula: "Clients retained from prior period / clients in prior period",
    frequency: "Quarterly",
    unit: "%",
    weight: 16,
    firmTarget: "70%",
    ownerName: "GMP Office",
    statusLogic: "Green at 70%+, amber at 55%-69.9%, red below 55%.",
    updateFrequency: "Quarterly sponsor review",
    sortOrder: 1,
  },
  {
    key: "kpi-5",
    goalKey: "goal-3",
    metricKey: "kpi-5",
    name: "Cross-practice expansion wins",
    description: "Tracks proposal conversion as a live proxy for turning growth opportunities into active work.",
    formula: "Won proposals / total proposals raised in the period",
    frequency: "Monthly",
    unit: "%",
    weight: 14,
    firmTarget: "35%",
    ownerName: "Marketing",
    statusLogic: "Green at 35%+, amber at 22%-34.9%, red below 22%.",
    updateFrequency: "Monthly pipeline review",
    sortOrder: 2,
  },
  {
    key: "kpi-6",
    goalKey: "goal-4",
    metricKey: "kpi-6",
    name: "Stakeholder satisfaction score",
    description: "Average satisfaction signal from completed client surveys.",
    formula: "Average overall satisfaction score from completed client surveys",
    frequency: "Monthly",
    unit: "Score",
    weight: 12,
    firmTarget: "88%",
    ownerName: "Partner Office",
    statusLogic: "Green at 88%+, amber at 75%-87.9%, red below 75%.",
    updateFrequency: "Monthly client-listening pack",
    sortOrder: 1,
  },
  {
    key: "kpi-7",
    goalKey: "goal-5",
    metricKey: "kpi-7",
    name: "Turnaround and SLA adherence",
    description: "Completed jobs delivered on or before the committed due date.",
    formula: "Completed jobs on or before due date / completed jobs with due dates",
    frequency: "Weekly",
    unit: "%",
    weight: 12,
    firmTarget: "85%",
    ownerName: "Operations Council",
    statusLogic: "Green at 85%+, amber at 70%-84.9%, red below 70%.",
    updateFrequency: "Weekly delivery board",
    sortOrder: 1,
  },
  {
    key: "kpi-8",
    goalKey: "goal-6",
    metricKey: "kpi-8",
    name: "Quality review pass rate",
    description: "Average project evaluation score across submitted quality reviews.",
    formula: "Average submitted project evaluation score",
    frequency: "Monthly",
    unit: "%",
    weight: 10,
    firmTarget: "84%",
    ownerName: "Manager Quality Forum",
    statusLogic: "Green at 84%+, amber at 70%-83.9%, red below 70%.",
    updateFrequency: "Monthly quality review",
    sortOrder: 1,
  },
  {
    key: "kpi-9",
    goalKey: "goal-7",
    metricKey: "kpi-9",
    name: "Coaching and review completion",
    description: "Share of evaluation assignments already submitted within the active review window.",
    formula: "Submitted evaluation assignments / total assignments created in the period",
    frequency: "Monthly",
    unit: "%",
    weight: 12,
    firmTarget: "90%",
    ownerName: "HR Business Partnering",
    statusLogic: "Green at 90%+, amber at 75%-89.9%, red below 75%.",
    updateFrequency: "Monthly people review",
    sortOrder: 1,
  },
  {
    key: "kpi-10",
    goalKey: "goal-8",
    metricKey: "kpi-10",
    name: "Readiness and learning completion",
    description: "Blended readiness signal from learning assignment completion and employee onboarding completion.",
    formula: "Average of learning completion rate and onboarding completion rate",
    frequency: "Monthly",
    unit: "%",
    weight: 12,
    firmTarget: "88%",
    ownerName: "HR Capability Office",
    statusLogic: "Green at 88%+, amber at 72%-87.9%, red below 72%.",
    updateFrequency: "Monthly readiness checkpoint",
    sortOrder: 1,
  },
];

const legacySeedInitiatives: SeedInitiative[] = [
  {
    key: "init-1",
    goalKey: "goal-1",
    kpiKey: "kpi-1",
    scopeRole: "hr",
    title: "Top-20 account expansion programme",
    summary: "The firm-level initiative that triggers GMP, partner, manager, and employee actions around priority-account growth.",
    ownerName: "HR / Strategy Office",
    timeline: "Apr 2026 - Dec 2026",
    dueDate: "2026-12-31",
    status: "on_track",
    progress: 81,
    sortOrder: 1,
  },
  {
    key: "init-2",
    goalKey: "goal-2",
    kpiKey: "kpi-3",
    scopeRole: "finance",
    title: "Write-off recovery playbook",
    summary: "Aligns finance, partners, and managers on aging-balance action ownership.",
    ownerName: "Finance",
    timeline: "May 2026 - Oct 2026",
    dueDate: "2026-10-31",
    status: "at_risk",
    progress: 46,
    sortOrder: 2,
  },
  {
    key: "init-3",
    goalKey: "goal-3",
    kpiKey: "kpi-4",
    scopeRole: "hr",
    title: "Strategic client sponsorship cadence",
    summary: "Ensures the same strategic KPI is driven through aligned initiatives at every role level.",
    ownerName: "GMP Office",
    timeline: "Q2 - Q4 2026",
    dueDate: "2026-12-15",
    status: "on_track",
    progress: 74,
    sortOrder: 3,
  },
  {
    key: "init-4",
    goalKey: "goal-5",
    kpiKey: "kpi-7",
    scopeRole: "hr",
    title: "SLA review wallboard rollout",
    summary: "Pushes delivery visibility into department and manager workboards.",
    ownerName: "Operations Council",
    timeline: "Apr 2026 - Jul 2026",
    dueDate: "2026-07-31",
    status: "on_track",
    progress: 77,
    sortOrder: 4,
  },
  {
    key: "init-5",
    goalKey: "goal-7",
    kpiKey: "kpi-9",
    scopeRole: "hr",
    title: "Capability and review readiness drive",
    summary: "Improves coaching follow-through and readiness signals across the people perspective.",
    ownerName: "HR Business Partnering",
    timeline: "Current review cycle",
    dueDate: "2026-12-20",
    status: "at_risk",
    progress: 54,
    sortOrder: 5,
  },
  {
    key: "cascade-growth-hr",
    goalKey: "goal-3",
    kpiKey: "kpi-4",
    scopeRole: "hr",
    title: "Firm-wide strategic client sponsorship programme",
    summary: "Defines the strategic goal, KPI, target, and the parent initiative for the cascade example.",
    ownerName: "Sarah Mwikali",
    timeline: "FY 2026 strategic cycle",
    dueDate: "2026-12-31",
    status: "on_track",
    progress: 84,
    sortOrder: 10,
  },
  {
    key: "cascade-growth-gmp",
    goalKey: "goal-3",
    kpiKey: "kpi-4",
    parentKey: "cascade-growth-hr",
    scopeRole: "gmp",
    title: "Quarterly executive sponsor review cadence",
    summary: "Keeps the same KPI aligned while narrowing focus to executive reviews and sponsor follow-through.",
    ownerName: "Grace Njeri",
    timeline: "Quarterly cadence",
    dueDate: "2026-12-15",
    status: "on_track",
    progress: 79,
    sortOrder: 1,
  },
  {
    key: "cascade-growth-partner",
    goalKey: "goal-3",
    kpiKey: "kpi-5",
    parentKey: "cascade-growth-gmp",
    scopeRole: "partner",
    title: "Practice-level client growth plans",
    summary: "Turns the KPI into portfolio-level account plans and partner-owned client actions.",
    ownerName: "James Mutua",
    timeline: "Portfolio review cycle",
    dueDate: "2026-11-30",
    status: "at_risk",
    progress: 73,
    sortOrder: 1,
  },
  {
    key: "cascade-growth-manager",
    goalKey: "goal-5",
    kpiKey: "kpi-7",
    parentKey: "cascade-growth-partner",
    scopeRole: "manager",
    title: "Monthly account action logs and service recovery tracking",
    summary: "Turns partner plans into team deliverables, response discipline, and action closure.",
    ownerName: "Brian Mwangi",
    timeline: "Weekly delivery rhythm",
    dueDate: "2026-10-31",
    status: "at_risk",
    progress: 68,
    sortOrder: 1,
  },
  {
    key: "cascade-growth-employee",
    goalKey: "goal-5",
    kpiKey: "kpi-7",
    parentKey: "cascade-growth-manager",
    scopeRole: "employee",
    title: "Prepare review packs and close assigned follow-up actions",
    summary: "Represents the employee action layer in the featured cascade chain.",
    ownerName: "Employee layer",
    timeline: "Weekly cadence",
    dueDate: "2026-05-31",
    status: "at_risk",
    progress: 66,
    sortOrder: 1,
  },
];

const defaultPerspectives: SeedPerspective[] = [
  {
    key: "financial",
    name: "Financial",
    ownerName: "",
    summary: "",
    sortOrder: 1,
  },
  {
    key: "customer",
    name: "Customer / Stakeholder",
    ownerName: "",
    summary: "",
    sortOrder: 2,
  },
  {
    key: "internal",
    name: "Internal Process",
    ownerName: "",
    summary: "",
    sortOrder: 3,
  },
  {
    key: "people",
    name: "People / Learning & Growth",
    ownerName: "",
    summary: "",
    sortOrder: 4,
  },
];

const defaultGoals: SeedGoal[] = [];
const defaultKpis: SeedKpi[] = [];
const defaultInitiatives: SeedInitiative[] = [];

const cleanText = (value: string | null | undefined) => value?.trim() || "";
const toDateKey = (value: Date | string | null | undefined) => {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value;
};

const legacyPerspectiveByKey = new Map(
  legacySeedPerspectives.map((record) => [record.key, record])
);
const legacyGoalByKey = new Map(legacySeedGoals.map((record) => [record.key, record]));
const legacyKpiByKey = new Map(legacySeedKpis.map((record) => [record.key, record]));
const legacyInitiativeByKey = new Map(
  legacySeedInitiatives.map((record) => [record.key, record])
);
const legacyGoalKeys = new Set(legacySeedGoals.map((record) => record.key));
const legacyKpiKeys = new Set(legacySeedKpis.map((record) => record.key));
const legacyInitiativeKeys = new Set(legacySeedInitiatives.map((record) => record.key));

const isLegacySeedPerspective = (record: {
  key: string;
  name: string;
  ownerName: string | null;
  summary: string | null;
  createdByProfileId: number | null;
}) => {
  const legacy = legacyPerspectiveByKey.get(record.key);
  return (
    !record.createdByProfileId &&
    !!legacy &&
    record.name === legacy.name &&
    cleanText(record.ownerName) === cleanText(legacy.ownerName) &&
    cleanText(record.summary) === cleanText(legacy.summary)
  );
};

const isLegacySeedGoal = (record: {
  key: string;
  title: string;
  description: string | null;
  ownerName: string | null;
  createdByProfileId: number | null;
}) => {
  const legacy = legacyGoalByKey.get(record.key);
  return (
    legacyGoalKeys.has(record.key) &&
    (!legacy ||
      !record.createdByProfileId ||
      (record.title === legacy.title &&
        cleanText(record.description) === cleanText(legacy.description) &&
        cleanText(record.ownerName) === cleanText(legacy.ownerName)))
  );
};

const isLegacySeedKpi = (record: {
  key: string;
  metricKey: string;
  name: string;
  description: string | null;
  formula: string | null;
  frequency: string;
  unit: string;
  weight: number;
  firmTarget: string;
  ownerName: string | null;
  statusLogic: string | null;
  updateFrequency: string | null;
  createdByProfileId: number | null;
}) => {
  const legacy = legacyKpiByKey.get(record.key);
  return (
    legacyKpiKeys.has(record.key) &&
    (!legacy ||
      !record.createdByProfileId ||
      (record.metricKey === legacy.metricKey &&
        record.name === legacy.name &&
        cleanText(record.description) === cleanText(legacy.description) &&
        cleanText(record.formula) === cleanText(legacy.formula) &&
        record.frequency === legacy.frequency &&
        record.unit === legacy.unit &&
        record.weight === legacy.weight &&
        record.firmTarget === legacy.firmTarget &&
        cleanText(record.ownerName) === cleanText(legacy.ownerName) &&
        cleanText(record.statusLogic) === cleanText(legacy.statusLogic) &&
        cleanText(record.updateFrequency) === cleanText(legacy.updateFrequency)))
  );
};

const isLegacySeedInitiative = (record: {
  key: string;
  scopeRole: string;
  title: string;
  summary: string | null;
  ownerName: string | null;
  timeline: string | null;
  dueDate: Date | null;
  status: string;
  progress: number;
  createdByProfileId: number | null;
}) => {
  const legacy = legacyInitiativeByKey.get(record.key);
  return (
    legacyInitiativeKeys.has(record.key) &&
    (!legacy ||
      !record.createdByProfileId ||
      (record.scopeRole === legacy.scopeRole &&
        record.title === legacy.title &&
        cleanText(record.summary) === cleanText(legacy.summary) &&
        cleanText(record.ownerName) === cleanText(legacy.ownerName) &&
        cleanText(record.timeline) === cleanText(legacy.timeline) &&
        toDateKey(record.dueDate) === toDateKey(legacy.dueDate) &&
        record.status === legacy.status &&
        record.progress === legacy.progress))
  );
};

export async function ensureBalancedScorecardSeed() {
  await prisma.$transaction(async (tx) => {
    const perspectiveIdByKey = new Map<string, number>();
    for (const perspective of baselinePerspectives) {
      const existing = await tx.balancedScorecardPerspective.findUnique({
        where: { key: perspective.key },
        select: { id: true },
      });
      if (existing) {
        perspectiveIdByKey.set(perspective.key, existing.id);
        continue;
      }
      const created = await tx.balancedScorecardPerspective.create({
        data: {
          key: perspective.key,
          scorecardVersionId: null,
          name: perspective.name,
          ownerName: perspective.ownerName || null,
          summary: perspective.summary || null,
          sortOrder: perspective.sortOrder,
        },
      });
      perspectiveIdByKey.set(perspective.key, created.id);
    }

    const goalIdByKey = new Map<string, number>();
    for (const goal of baselineGoals) {
      const existing = await tx.balancedScorecardGoal.findUnique({
        where: { key: goal.key },
        select: { id: true },
      });
      if (existing) {
        goalIdByKey.set(goal.key, existing.id);
        continue;
      }
      const created = await tx.balancedScorecardGoal.create({
        data: {
          key: goal.key,
          scorecardVersionId: null,
          perspectiveId: perspectiveIdByKey.get(goal.perspectiveKey)!,
          title: goal.title,
          description: goal.description,
          ownerName: goal.ownerName,
          sortOrder: goal.sortOrder,
        },
      });
      goalIdByKey.set(goal.key, created.id);
    }

    const kpiIdByKey = new Map<string, number>();
    for (const kpi of baselineKpis) {
      const existing = await tx.balancedScorecardKpi.findUnique({
        where: { key: kpi.key },
        select: { id: true },
      });
      if (existing) {
        kpiIdByKey.set(kpi.key, existing.id);
        continue;
      }
      const created = await tx.balancedScorecardKpi.create({
        data: {
          key: kpi.key,
          scorecardVersionId: null,
          goalId: goalIdByKey.get(kpi.goalKey)!,
          metricKey: kpi.metricKey,
          trackingMode: kpi.trackingMode,
          measurementType: kpi.measurementType,
          targetDirection: kpi.targetDirection,
          targetValue: kpi.targetValue,
          currentActualValue: kpi.currentActualValue ?? null,
          lastMeasurementNote: kpi.lastMeasurementNote ?? null,
          name: kpi.name,
          description: kpi.description,
          formula: kpi.formula,
          frequency: kpi.frequency,
          unit: kpi.unit,
          weight: kpi.weight,
          firmTarget: kpi.firmTarget,
          ownerName: kpi.ownerName,
          ownerProfileId: null,
          statusLogic: kpi.statusLogic,
          updateFrequency: kpi.updateFrequency,
          sortOrder: kpi.sortOrder,
        },
      });
      kpiIdByKey.set(kpi.key, created.id);
    }

    const initiativeIdByKey = new Map<string, number>();
    for (const initiative of baselineInitiatives) {
      const existing = await tx.balancedScorecardInitiative.findUnique({
        where: { key: initiative.key },
        select: { id: true },
      });
      if (existing) {
        initiativeIdByKey.set(initiative.key, existing.id);
        continue;
      }
      const created = await tx.balancedScorecardInitiative.create({
        data: {
          key: initiative.key,
          scorecardVersionId: null,
          goalId: goalIdByKey.get(initiative.goalKey)!,
          kpiId: kpiIdByKey.get(initiative.kpiKey)!,
          parentInitiativeId: initiative.parentKey
            ? initiativeIdByKey.get(initiative.parentKey) ?? null
            : null,
          scopeRole: initiative.scopeRole,
          title: initiative.title,
          summary: initiative.summary,
          ownerName: initiative.ownerName,
          ownerProfileId: null,
          timeline: initiative.timeline,
          dueDate: initiative.dueDate ? new Date(initiative.dueDate) : null,
          status: initiative.status,
          progress: initiative.progress,
          sortOrder: initiative.sortOrder,
        },
      });
      initiativeIdByKey.set(initiative.key, created.id);
    }
  }, { timeout: 60000 });
  invalidateBalancedScorecardWorkspaceCache();
}

export async function listBalancedScorecardStructure(input?: {
  scorecardVersionId?: number | null;
}) {
  const { versionWhere } = await resolveVersionScope(input?.scorecardVersionId);
  const [rawPerspectives, rawGoals, rawKpis, rawInitiatives] = await Promise.all([
    prisma.balancedScorecardPerspective.findMany({
      where: { isActive: true, ...versionWhere },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    }),
    prisma.balancedScorecardGoal.findMany({
      where: { isActive: true, ...versionWhere },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    }),
    prisma.balancedScorecardKpi.findMany({
      where: { isActive: true, ...versionWhere },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    }),
    prisma.balancedScorecardInitiative.findMany({
      where: { isActive: true, ...versionWhere },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    }),
  ]);

  const perspectives = rawPerspectives.map((record) =>
    isLegacySeedPerspective(record)
      ? {
          ...record,
          ownerName: null,
          summary: null,
        }
      : record
  );
  const goals = rawGoals.filter((record) => !isLegacySeedGoal(record));
  const visibleGoalIds = new Set(goals.map((goal) => goal.id));

  const kpis = rawKpis
    .filter((record) => !isLegacySeedKpi(record) && visibleGoalIds.has(record.goalId))
    .map((record) => ({
      ...record,
      trackingMode: (record.trackingMode as KpiTrackingMode) || "template",
      measurementType: (record.measurementType as KpiMeasurementType | null) ?? null,
      targetDirection: (record.targetDirection as KpiTargetDirection | null) ?? null,
      targetValue: decimalValueOrNull(record.targetValue),
      currentActualValue: decimalValueOrNull(record.currentActualValue),
      lastMeasurementNote: record.lastMeasurementNote ?? null,
      ownerProfileId: record.ownerProfileId ?? null,
    }));
  const visibleKpiIds = new Set(kpis.map((kpi) => kpi.id));

  const initiativeCandidates = rawInitiatives.filter(
    (record) =>
      !isLegacySeedInitiative(record) &&
      visibleGoalIds.has(record.goalId) &&
      visibleKpiIds.has(record.kpiId)
  );
  const visibleInitiativeIds = new Set<number>();
  let didAddInitiative = true;

  while (didAddInitiative) {
    didAddInitiative = false;
    initiativeCandidates.forEach((record) => {
      if (visibleInitiativeIds.has(record.id)) return;
      if (!record.parentInitiativeId || visibleInitiativeIds.has(record.parentInitiativeId)) {
        visibleInitiativeIds.add(record.id);
        didAddInitiative = true;
      }
    });
  }

  const initiatives = initiativeCandidates.filter((record) =>
    visibleInitiativeIds.has(record.id)
  );

  return { perspectives, goals, kpis, initiatives };
}

export async function createBalancedScorecardPerspective(input: {
  name: string;
  ownerName?: string | null;
  summary?: string | null;
  scorecardVersionId?: number | null;
  createdByProfileId?: number | null;
}) {
  const { resolvedVersionId, versionWhere } = await resolveVersionScope(input.scorecardVersionId);
  const sortOrder =
    (await prisma.balancedScorecardPerspective.count({
      where: { isActive: true, ...versionWhere },
    })) + 1;
  const created = await prisma.balancedScorecardPerspective.create({
    data: {
      key: uniqueKey("perspective", input.name),
      scorecardVersionId: resolvedVersionId,
      name: input.name.trim(),
      ownerName: input.ownerName?.trim() || null,
      summary: input.summary?.trim() || null,
      sortOrder,
      createdByProfileId: input.createdByProfileId ?? null,
    },
  });
  invalidateBalancedScorecardWorkspaceCache();
  return created;
}

export async function updateBalancedScorecardPerspective(
  perspectiveId: number,
  input: {
    name: string;
    ownerName?: string | null;
    summary?: string | null;
  }
) {
  const existing = await prisma.balancedScorecardPerspective.findUnique({
    where: { id: perspectiveId },
    select: { id: true, isActive: true },
  });

  if (!existing || !existing.isActive) {
    const err = new Error("Perspective not found") as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }

  const updated = await prisma.balancedScorecardPerspective.update({
    where: { id: perspectiveId },
    data: {
      name: input.name.trim(),
      ownerName: input.ownerName?.trim() || null,
      summary: input.summary?.trim() || null,
    },
  });
  invalidateBalancedScorecardWorkspaceCache();
  return updated;
}

export async function archiveBalancedScorecardPerspective(perspectiveId: number) {
  const existing = await prisma.balancedScorecardPerspective.findUnique({
    where: { id: perspectiveId },
    select: { id: true, isActive: true },
  });

  if (!existing || !existing.isActive) {
    const err = new Error("Perspective not found") as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }

  const activeGoals = await prisma.balancedScorecardGoal.findMany({
    where: { perspectiveId, isActive: true },
    select: {
      id: true,
      key: true,
      title: true,
      description: true,
      ownerName: true,
      createdByProfileId: true,
    },
  });

  const realGoals = activeGoals.filter((goal) => !isLegacySeedGoal(goal));
  if (realGoals.length > 0) {
    const err = new Error(
      `Cannot archive this perspective while ${realGoals.length} active goal${
        realGoals.length === 1 ? " is" : "s are"
      } still linked to it`
    ) as Error & { statusCode?: number };
    err.statusCode = 409;
    throw err;
  }

  const goalIds = activeGoals.map((goal) => goal.id);

  const archived = await prisma.$transaction(async (tx) => {
    if (goalIds.length > 0) {
      await tx.balancedScorecardInitiative.updateMany({
        where: { goalId: { in: goalIds }, isActive: true },
        data: { isActive: false },
      });

      await tx.balancedScorecardKpi.updateMany({
        where: { goalId: { in: goalIds }, isActive: true },
        data: { isActive: false },
      });

      await tx.balancedScorecardGoal.updateMany({
        where: { id: { in: goalIds }, isActive: true },
        data: { isActive: false },
      });
    }

    return tx.balancedScorecardPerspective.update({
      where: { id: perspectiveId },
      data: { isActive: false },
    });
  });
  invalidateBalancedScorecardWorkspaceCache();
  return archived;
}

export async function deleteBalancedScorecardPerspective(perspectiveId: number) {
  const existing = await prisma.balancedScorecardPerspective.findUnique({
    where: { id: perspectiveId },
    select: { id: true },
  });

  if (!existing) {
    const err = new Error("Perspective not found") as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }

  const linkedGoals = await prisma.balancedScorecardGoal.count({
    where: { perspectiveId },
  });

  if (linkedGoals > 0) {
    const err = new Error(
      "Cannot delete this perspective while goals are still linked to it"
    ) as Error & { statusCode?: number };
    err.statusCode = 409;
    throw err;
  }

  const deleted = await prisma.balancedScorecardPerspective.delete({
    where: { id: perspectiveId },
  });
  invalidateBalancedScorecardWorkspaceCache();
  return deleted;
}

export async function createBalancedScorecardGoal(input: {
  perspectiveId: number;
  title: string;
  description?: string | null;
  ownerName?: string | null;
  createdByProfileId?: number | null;
}) {
  const perspective = await prisma.balancedScorecardPerspective.findUnique({
    where: { id: input.perspectiveId },
    select: { id: true, isActive: true, scorecardVersionId: true },
  });

  if (!perspective || !perspective.isActive) {
    const err = new Error("Perspective not found") as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }

  const sortOrder =
    (await prisma.balancedScorecardGoal.count({
      where: { perspectiveId: input.perspectiveId, isActive: true },
    })) + 1;
  const created = await prisma.balancedScorecardGoal.create({
    data: {
      key: uniqueKey("goal", input.title),
      perspectiveId: input.perspectiveId,
      scorecardVersionId: perspective.scorecardVersionId ?? null,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      ownerName: input.ownerName?.trim() || null,
      sortOrder,
      createdByProfileId: input.createdByProfileId ?? null,
    },
  });
  invalidateBalancedScorecardWorkspaceCache();
  return created;
}

export async function createBalancedScorecardKpi(input: {
  goalId: number;
  metricKey?: string | null;
  trackingMode?: KpiTrackingMode | null;
  measurementType?: KpiMeasurementType | null;
  targetDirection?: KpiTargetDirection | null;
  targetValue?: number | null;
  currentActualValue?: number | null;
  lastMeasurementNote?: string | null;
  name: string;
  description?: string | null;
  formula?: string | null;
  frequency: string;
  unit: string;
  weight: number;
  firmTarget: string;
  ownerName?: string | null;
  ownerProfileId?: number | null;
  statusLogic?: string | null;
  updateFrequency?: string | null;
  createdByProfileId?: number | null;
}) {
  const goal = await prisma.balancedScorecardGoal.findUnique({
    where: { id: input.goalId },
    select: { id: true, isActive: true, scorecardVersionId: true },
  });

  if (!goal || !goal.isActive) {
    const err = new Error("Goal not found") as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }

  const trimmedName = input.name.trim();
  const metricKey = input.metricKey?.trim() || `custom-${slugify(trimmedName) || "metric"}-${randomUUID().replace(/-/g, "").slice(0, 8)}`;
  const trackingMode =
    input.trackingMode ?? (input.metricKey && input.metricKey.trim() ? "template" : "manual");
  assertKpiWeightValue(input.weight);
  const owner = await resolveOwnerReference({
    ownerName: input.ownerName,
    ownerProfileId: input.ownerProfileId,
  });
  const sortOrder =
    (await prisma.balancedScorecardKpi.count({
      where: { goalId: input.goalId, isActive: true },
    })) + 1;
  const created = await prisma.balancedScorecardKpi.create({
    data: {
      key: uniqueKey("kpi", trimmedName),
      goalId: input.goalId,
      scorecardVersionId: goal.scorecardVersionId ?? null,
      metricKey,
      trackingMode,
      measurementType: input.measurementType ?? null,
      targetDirection: input.targetDirection ?? null,
      targetValue:
        input.targetValue !== null &&
        input.targetValue !== undefined &&
        Number.isFinite(Number(input.targetValue))
          ? Number(input.targetValue)
          : null,
      currentActualValue:
        input.currentActualValue !== null &&
        input.currentActualValue !== undefined &&
        Number.isFinite(Number(input.currentActualValue))
          ? Number(input.currentActualValue)
          : null,
      lastMeasurementNote: input.lastMeasurementNote?.trim() || null,
      name: trimmedName,
      description: input.description?.trim() || null,
      formula: input.formula?.trim() || null,
      frequency: input.frequency.trim(),
      unit: input.unit.trim(),
      weight: Math.max(0, Math.round(input.weight)),
      firmTarget: input.firmTarget.trim(),
      ownerName: owner.ownerName,
      ownerProfileId: owner.ownerProfileId ?? null,
      statusLogic: input.statusLogic?.trim() || null,
      updateFrequency: input.updateFrequency?.trim() || null,
      sortOrder,
      createdByProfileId: input.createdByProfileId ?? null,
    },
  });
  invalidateBalancedScorecardWorkspaceCache();
  return created;
}

export async function createBalancedScorecardInitiative(input: {
  goalId: number;
  kpiId: number;
  parentInitiativeId?: number | null;
  scopeRole: string;
  title: string;
  summary?: string | null;
  ownerName?: string | null;
  ownerProfileId?: number | null;
  timeline?: string | null;
  dueDate?: string | null;
  status?: "on_track" | "at_risk" | "off_track";
  progress?: number | null;
  createdByProfileId?: number | null;
}) {
  const [goal, kpi] = await Promise.all([
    prisma.balancedScorecardGoal.findUnique({
      where: { id: input.goalId },
      select: { id: true, isActive: true, scorecardVersionId: true },
    }),
    prisma.balancedScorecardKpi.findUnique({
      where: { id: input.kpiId },
      select: { id: true, isActive: true, scorecardVersionId: true },
    }),
  ]);

  if (!goal || !goal.isActive) {
    const err = new Error("Goal not found") as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }
  if (!kpi || !kpi.isActive) {
    const err = new Error("KPI not found") as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }
  if ((goal.scorecardVersionId ?? null) !== (kpi.scorecardVersionId ?? null)) {
    const err = new Error("Goal and KPI must belong to the same scorecard version") as Error & {
      statusCode?: number;
    };
    err.statusCode = 409;
    throw err;
  }

  const owner = await resolveOwnerReference({
    ownerName: input.ownerName,
    ownerProfileId: input.ownerProfileId,
  });
  const sortOrder =
    (await prisma.balancedScorecardInitiative.count({
      where: { goalId: input.goalId, isActive: true },
    })) + 1;
  const created = await prisma.balancedScorecardInitiative.create({
    data: {
      key: uniqueKey("initiative", input.title),
      goalId: input.goalId,
      kpiId: input.kpiId,
      scorecardVersionId: goal.scorecardVersionId ?? null,
      parentInitiativeId: input.parentInitiativeId ?? null,
      scopeRole: input.scopeRole.trim().toLowerCase(),
      title: input.title.trim(),
      summary: input.summary?.trim() || null,
      ownerName: owner.ownerName,
      ownerProfileId: owner.ownerProfileId ?? null,
      timeline: input.timeline?.trim() || null,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      status: input.status || "at_risk",
      progress: Math.max(0, Math.min(100, Math.round(input.progress ?? 0))),
      sortOrder,
      createdByProfileId: input.createdByProfileId ?? null,
    },
  });
  invalidateBalancedScorecardWorkspaceCache();
  return created;
}

export async function updateBalancedScorecardKpiActual(
  kpiId: number,
  input: {
    currentActualValue: number;
    lastMeasurementNote?: string | null;
    recordedByProfileId?: number | null;
  }
) {
  const existing = await prisma.balancedScorecardKpi.findUnique({
    where: { id: kpiId },
    select: { id: true, isActive: true },
  });

  if (!existing || !existing.isActive) {
    const err = new Error("KPI not found") as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }

  const updated = await prisma.$transaction(async (tx) => {
    // Append an immutable history record before overwriting the current value.
    await tx.balancedScorecardKpiActualHistory.create({
      data: {
        kpiId,
        actualValue: input.currentActualValue,
        note: input.lastMeasurementNote?.trim() || null,
        recordedByProfileId: input.recordedByProfileId ?? null,
      },
    });

    return tx.balancedScorecardKpi.update({
      where: { id: kpiId },
      data: {
        currentActualValue: input.currentActualValue,
        lastMeasurementNote: input.lastMeasurementNote?.trim() || null,
      },
    });
  });
  invalidateBalancedScorecardWorkspaceCache();
  return updated;
}

export async function updateBalancedScorecardGoal(
  goalId: number,
  input: {
    title: string;
    description?: string | null;
    ownerName?: string | null;
  }
) {
  const existing = await prisma.balancedScorecardGoal.findUnique({
    where: { id: goalId },
    select: { id: true, isActive: true },
  });

  if (!existing || !existing.isActive) {
    const err = new Error("Goal not found") as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }

  const updated = await prisma.balancedScorecardGoal.update({
    where: { id: goalId },
    data: {
      title: input.title.trim(),
      description: input.description?.trim() || null,
      ownerName: input.ownerName?.trim() || null,
    },
  });
  invalidateBalancedScorecardWorkspaceCache();
  return updated;
}

export async function archiveBalancedScorecardGoal(goalId: number) {
  const existing = await prisma.balancedScorecardGoal.findUnique({
    where: { id: goalId },
    select: { id: true, isActive: true },
  });

  if (!existing || !existing.isActive) {
    const err = new Error("Goal not found") as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }

  const archived = await prisma.$transaction(async (tx) => {
    // Cascade archive KPIs and their initiatives
    const kpis = await tx.balancedScorecardKpi.findMany({
      where: { goalId, isActive: true },
      select: { id: true },
    });
    const kpiIds = kpis.map((k) => k.id);

    if (kpiIds.length > 0) {
      await tx.balancedScorecardInitiative.updateMany({
        where: { kpiId: { in: kpiIds }, isActive: true },
        data: { isActive: false },
      });
      await tx.balancedScorecardKpi.updateMany({
        where: { id: { in: kpiIds } },
        data: { isActive: false },
      });
    }

    await tx.balancedScorecardInitiative.updateMany({
      where: { goalId, isActive: true },
      data: { isActive: false },
    });

    return tx.balancedScorecardGoal.update({
      where: { id: goalId },
      data: { isActive: false },
    });
  });
  invalidateBalancedScorecardWorkspaceCache();
  return archived;
}

export async function updateBalancedScorecardInitiative(
  initiativeId: number,
  input: {
    title?: string;
    summary?: string | null;
    ownerName?: string | null;
    ownerProfileId?: number | null;
    timeline?: string | null;
    dueDate?: string | null;
    status?: "on_track" | "at_risk" | "off_track";
    progress?: number;
    scopeRole?: string;
  }
) {
  const existing = await prisma.balancedScorecardInitiative.findUnique({
    where: { id: initiativeId },
    select: { id: true, isActive: true },
  });

  if (!existing || !existing.isActive) {
    const err = new Error("Initiative not found") as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }

  const owner =
    input.ownerName !== undefined || input.ownerProfileId !== undefined
      ? await resolveOwnerReference({
          ownerName: input.ownerName,
          ownerProfileId: input.ownerProfileId,
        })
      : null;
  const updated = await prisma.balancedScorecardInitiative.update({
    where: { id: initiativeId },
    data: {
      ...(input.title !== undefined && { title: input.title.trim() }),
      ...(input.summary !== undefined && { summary: input.summary?.trim() || null }),
      ...(owner && {
        ownerName: owner.ownerName,
        ownerProfileId: owner.ownerProfileId ?? null,
      }),
      ...(input.timeline !== undefined && { timeline: input.timeline?.trim() || null }),
      ...(input.dueDate !== undefined && { dueDate: input.dueDate ? new Date(input.dueDate) : null }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.progress !== undefined && {
        progress: Math.max(0, Math.min(100, Math.round(input.progress))),
      }),
      ...(input.scopeRole !== undefined && { scopeRole: input.scopeRole.trim().toLowerCase() }),
    },
  });
  invalidateBalancedScorecardWorkspaceCache();
  return updated;
}

export async function archiveBalancedScorecardInitiative(initiativeId: number) {
  const existing = await prisma.balancedScorecardInitiative.findUnique({
    where: { id: initiativeId },
    select: { id: true, isActive: true },
  });

  if (!existing || !existing.isActive) {
    const err = new Error("Initiative not found") as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }

  // Also archive all child initiatives in the cascade tree
  const allInitiatives = await prisma.balancedScorecardInitiative.findMany({
    where: { isActive: true },
    select: { id: true, parentInitiativeId: true },
  });

  const toArchive = new Set<number>([initiativeId]);
  let changed = true;
  while (changed) {
    changed = false;
    allInitiatives.forEach((record) => {
      if (record.parentInitiativeId && toArchive.has(record.parentInitiativeId) && !toArchive.has(record.id)) {
        toArchive.add(record.id);
        changed = true;
      }
    });
  }

  const archived = await prisma.balancedScorecardInitiative.updateMany({
    where: { id: { in: Array.from(toArchive) } },
    data: { isActive: false },
  });
  invalidateBalancedScorecardWorkspaceCache();
  return archived;
}

export async function listBalancedScorecardKpiAssignments(input?: {
  scorecardVersionId?: number | null;
  profileId?: number | null;
}) {
  const { resolvedVersionId } = await resolveVersionScope(input?.scorecardVersionId);
  if (resolvedVersionId === null) {
    return [] as BalancedScorecardKpiAssignmentRecord[];
  }

  const records = await prisma.balancedScorecardKpiAssignment.findMany({
    where: {
      scorecardVersionId: resolvedVersionId,
      ...(input?.profileId ? { profileId: input.profileId } : {}),
    },
    orderBy: [
      { profile: { lastName: "asc" } },
      { profile: { firstName: "asc" } },
      { kpi: { sortOrder: "asc" } },
      { id: "asc" },
    ],
    include: {
      kpi: { select: { id: true, key: true, name: true } },
      profile: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          roleId: true,
          role: { select: { name: true } },
        },
      },
    },
  });

  return records.map(
    (record) =>
      ({
        id: record.id,
        kpiId: record.kpiId,
        kpiKey: record.kpi.key,
        kpiName: record.kpi.name,
        profileId: record.profileId,
        profileName: `${record.profile.firstName} ${record.profile.lastName}`.trim(),
        roleId: record.profile.roleId ?? null,
        roleName: record.profile.role?.name ?? null,
        scorecardVersionId: record.scorecardVersionId,
        individualTarget: decimalValueOrNull(record.individualTarget),
        individualWeight: record.individualWeight,
        createdByProfileId: record.createdByProfileId ?? null,
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
      }) satisfies BalancedScorecardKpiAssignmentRecord
  );
}

export async function upsertBalancedScorecardKpiAssignment(input: {
  kpiId: number;
  profileId: number;
  scorecardVersionId?: number | null;
  individualTarget?: number | null;
  individualWeight?: number | null;
  createdByProfileId?: number | null;
}) {
  const [kpi, profile] = await Promise.all([
    prisma.balancedScorecardKpi.findUnique({
      where: { id: input.kpiId },
      select: { id: true, isActive: true, scorecardVersionId: true, weight: true },
    }),
    prisma.profile.findUnique({
      where: { id: input.profileId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        roleId: true,
        role: { select: { name: true } },
      },
    }),
  ]);

  if (!kpi || !kpi.isActive) {
    const err = new Error("KPI not found") as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }
  if (!profile) {
    const err = new Error("Profile not found") as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }

  const resolvedVersionId =
    input.scorecardVersionId ??
    kpi.scorecardVersionId ??
    (await resolveActiveBalancedScorecardVersionId());
  if (!resolvedVersionId) {
    const err = new Error("KPI assignments require a published scorecard version") as Error & {
      statusCode?: number;
    };
    err.statusCode = 409;
    throw err;
  }
  if (kpi.scorecardVersionId && kpi.scorecardVersionId !== resolvedVersionId) {
    const err = new Error("Assignment version must match the KPI scorecard version") as Error & {
      statusCode?: number;
    };
    err.statusCode = 409;
    throw err;
  }

  const record = await prisma.balancedScorecardKpiAssignment.upsert({
    where: {
      kpiId_profileId_scorecardVersionId: {
        kpiId: input.kpiId,
        profileId: input.profileId,
        scorecardVersionId: resolvedVersionId,
      },
    },
    update: {
      individualTarget:
        input.individualTarget !== undefined && input.individualTarget !== null
          ? input.individualTarget
          : null,
      individualWeight:
        input.individualWeight !== undefined && input.individualWeight !== null
          ? Math.max(0, Math.round(input.individualWeight))
          : kpi.weight,
      createdByProfileId: input.createdByProfileId ?? undefined,
    },
    create: {
      kpiId: input.kpiId,
      profileId: input.profileId,
      scorecardVersionId: resolvedVersionId,
      individualTarget:
        input.individualTarget !== undefined && input.individualTarget !== null
          ? input.individualTarget
          : null,
      individualWeight:
        input.individualWeight !== undefined && input.individualWeight !== null
          ? Math.max(0, Math.round(input.individualWeight))
          : kpi.weight,
      createdByProfileId: input.createdByProfileId ?? null,
    },
    include: {
      kpi: { select: { key: true, name: true } },
      profile: {
        select: {
          firstName: true,
          lastName: true,
          roleId: true,
          role: { select: { name: true } },
        },
      },
    },
  });

  const assignment = {
    id: record.id,
    kpiId: record.kpiId,
    kpiKey: record.kpi.key,
    kpiName: record.kpi.name,
    profileId: record.profileId,
    profileName: `${record.profile.firstName} ${record.profile.lastName}`.trim(),
    roleId: record.profile.roleId ?? null,
    roleName: record.profile.role?.name ?? null,
    scorecardVersionId: record.scorecardVersionId,
    individualTarget: decimalValueOrNull(record.individualTarget),
    individualWeight: record.individualWeight,
    createdByProfileId: record.createdByProfileId ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  } satisfies BalancedScorecardKpiAssignmentRecord;
  invalidateBalancedScorecardWorkspaceCache();
  return assignment;
}

export async function deleteBalancedScorecardKpiAssignment(assignmentId: number) {
  const existing = await prisma.balancedScorecardKpiAssignment.findUnique({
    where: { id: assignmentId },
    select: { id: true },
  });

  if (!existing) {
    const err = new Error("KPI assignment not found") as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }

  const deleted = await prisma.balancedScorecardKpiAssignment.delete({
    where: { id: assignmentId },
  });
  invalidateBalancedScorecardWorkspaceCache();
  return deleted;
}

export async function listPerformanceBands() {
  const records = await prisma.performanceBand.findMany({
    orderBy: [{ roleId: "asc" }, { id: "asc" }],
    include: {
      role: { select: { id: true, name: true } },
    },
  });

  return records.map(
    (record) =>
      ({
        id: record.id,
        roleId: record.roleId ?? null,
        roleName: record.role?.name ?? null,
        onTrackMin: decimalValueOrNull(record.onTrackMin) ?? 85,
        atRiskMin: decimalValueOrNull(record.atRiskMin) ?? 65,
        label: record.label ?? null,
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
      }) satisfies PerformanceBandRecord
  );
}

export async function upsertPerformanceBand(input: {
  roleId?: number | null;
  onTrackMin: number;
  atRiskMin: number;
  label?: string | null;
}) {
  if (input.atRiskMin > input.onTrackMin) {
    const err = new Error("At-risk threshold cannot exceed the on-track threshold") as Error & {
      statusCode?: number;
    };
    err.statusCode = 400;
    throw err;
  }

  if (input.roleId !== undefined && input.roleId !== null) {
    const role = await prisma.positionRole.findUnique({
      where: { id: input.roleId },
      select: { id: true },
    });
    if (!role) {
      const err = new Error("Role not found") as Error & { statusCode?: number };
      err.statusCode = 404;
      throw err;
    }
  }

  const existing = await prisma.performanceBand.findFirst({
    where: { roleId: input.roleId ?? null },
    orderBy: { id: "asc" },
  });

  const record = existing
    ? await prisma.performanceBand.update({
        where: { id: existing.id },
        data: {
          onTrackMin: input.onTrackMin,
          atRiskMin: input.atRiskMin,
          label: input.label?.trim() || null,
        },
        include: { role: { select: { id: true, name: true } } },
      })
    : await prisma.performanceBand.create({
        data: {
          roleId: input.roleId ?? null,
          onTrackMin: input.onTrackMin,
          atRiskMin: input.atRiskMin,
          label: input.label?.trim() || null,
        },
        include: { role: { select: { id: true, name: true } } },
      });

  const band = {
    id: record.id,
    roleId: record.roleId ?? null,
    roleName: record.role?.name ?? null,
    onTrackMin: decimalValueOrNull(record.onTrackMin) ?? 85,
    atRiskMin: decimalValueOrNull(record.atRiskMin) ?? 65,
    label: record.label ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  } satisfies PerformanceBandRecord;
  invalidateBalancedScorecardWorkspaceCache();
  return band;
}
