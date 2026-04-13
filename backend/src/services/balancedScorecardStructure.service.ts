import prisma from "../prisma";

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

const uniqueKey = (prefix: string, value: string) =>
  `${prefix}-${slugify(value) || "item"}-${Date.now()}`;

const decimalValueOrNull = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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
  timeline: string | null;
  dueDate: Date | null;
  status: string;
  progress: number;
  sortOrder: number;
};

export type BalancedScorecardMetricTemplate = {
  metricKey: string;
  name: string;
  perspectiveId: "financial" | "customer" | "internal" | "people";
  defaultMeasurementType: KpiMeasurementType;
  defaultTargetDirection: KpiTargetDirection;
  defaultTargetValue: number;
  defaultFormula: string;
  defaultFrequency: string;
  defaultUnit: string;
  defaultWeight: number;
  defaultTarget: string;
  defaultOwnerName: string;
  defaultStatusLogic: string;
  defaultUpdateFrequency: string;
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

const metricTemplates: BalancedScorecardMetricTemplate[] = [
  {
    metricKey: "kpi-1",
    name: "Priority account revenue growth",
    perspectiveId: "financial",
    defaultMeasurementType: "percentage",
    defaultTargetDirection: "higher_better",
    defaultTargetValue: 12,
    defaultFormula: "((Current period revenue - Prior period revenue) / Prior period revenue) * 100",
    defaultFrequency: "Monthly",
    defaultUnit: "%",
    defaultWeight: 20,
    defaultTarget: "12%",
    defaultOwnerName: "HR / Strategy Office",
    defaultStatusLogic: "On track at 10%+, at risk between 7%-9.9%, off track below 7%.",
    defaultUpdateFrequency: "Monthly pack + quarter review",
  },
  {
    metricKey: "kpi-2",
    name: "Matter realization rate",
    perspectiveId: "financial",
    defaultMeasurementType: "percentage",
    defaultTargetDirection: "higher_better",
    defaultTargetValue: 88,
    defaultFormula: "Recovered fees / standard billable value",
    defaultFrequency: "Monthly",
    defaultUnit: "%",
    defaultWeight: 18,
    defaultTarget: "88%",
    defaultOwnerName: "Finance",
    defaultStatusLogic: "Green at 88%+, amber at 82%-87.9%, red below 82%.",
    defaultUpdateFrequency: "Monthly with finance close",
  },
  {
    metricKey: "kpi-3",
    name: "Collection cycle days",
    perspectiveId: "financial",
    defaultMeasurementType: "days",
    defaultTargetDirection: "lower_better",
    defaultTargetValue: 42,
    defaultFormula: "Average days from invoice issuance to cash collection",
    defaultFrequency: "Weekly",
    defaultUnit: "Days",
    defaultWeight: 14,
    defaultTarget: "42 days",
    defaultOwnerName: "Finance",
    defaultStatusLogic: "Green at 42 days or better, amber 43-46, red 47+.",
    defaultUpdateFrequency: "Weekly collections huddle",
  },
  {
    metricKey: "kpi-4",
    name: "Strategic client retention",
    perspectiveId: "customer",
    defaultMeasurementType: "percentage",
    defaultTargetDirection: "higher_better",
    defaultTargetValue: 92,
    defaultFormula: "Retained strategic clients / total strategic clients",
    defaultFrequency: "Quarterly",
    defaultUnit: "%",
    defaultWeight: 16,
    defaultTarget: "92%",
    defaultOwnerName: "GMP Office",
    defaultStatusLogic: "Green at 92%+, amber 88%-91.9%, red below 88%.",
    defaultUpdateFrequency: "Quarterly client review cadence",
  },
  {
    metricKey: "kpi-5",
    name: "Cross-practice conversion rate",
    perspectiveId: "customer",
    defaultMeasurementType: "percentage",
    defaultTargetDirection: "higher_better",
    defaultTargetValue: 35,
    defaultFormula: "Won cross-practice opportunities / qualified opportunities",
    defaultFrequency: "Monthly",
    defaultUnit: "%",
    defaultWeight: 12,
    defaultTarget: "35%",
    defaultOwnerName: "Partner Leadership",
    defaultStatusLogic: "Green at 35%+, amber 30%-34.9%, red below 30%.",
    defaultUpdateFrequency: "Monthly pipeline review",
  },
  {
    metricKey: "kpi-6",
    name: "Executive review completion",
    perspectiveId: "customer",
    defaultMeasurementType: "percentage",
    defaultTargetDirection: "higher_better",
    defaultTargetValue: 100,
    defaultFormula: "Completed executive reviews / scheduled executive reviews",
    defaultFrequency: "Monthly",
    defaultUnit: "%",
    defaultWeight: 10,
    defaultTarget: "100%",
    defaultOwnerName: "GMP Office",
    defaultStatusLogic: "Green at 90%+, amber 75%-89.9%, red below 75%.",
    defaultUpdateFrequency: "Monthly leadership review",
  },
  {
    metricKey: "kpi-7",
    name: "Turnaround SLA adherence",
    perspectiveId: "internal",
    defaultMeasurementType: "percentage",
    defaultTargetDirection: "higher_better",
    defaultTargetValue: 95,
    defaultFormula: "Assignments delivered within SLA / total assignments",
    defaultFrequency: "Weekly",
    defaultUnit: "%",
    defaultWeight: 16,
    defaultTarget: "95%",
    defaultOwnerName: "Operations Council",
    defaultStatusLogic: "Green at 93%+, amber 89%-92.9%, red below 89%.",
    defaultUpdateFrequency: "Weekly delivery stand-up",
  },
  {
    metricKey: "kpi-8",
    name: "Review rework ratio",
    perspectiveId: "internal",
    defaultMeasurementType: "percentage",
    defaultTargetDirection: "lower_better",
    defaultTargetValue: 10,
    defaultFormula: "Assignments with major rework / total reviewed assignments",
    defaultFrequency: "Monthly",
    defaultUnit: "%",
    defaultWeight: 12,
    defaultTarget: "10%",
    defaultOwnerName: "Manager Community",
    defaultStatusLogic: "Green at 10% or lower, amber 10.1%-12%, red above 12%.",
    defaultUpdateFrequency: "Monthly review quality panel",
  },
  {
    metricKey: "kpi-9",
    name: "Monthly coaching completion",
    perspectiveId: "people",
    defaultMeasurementType: "percentage",
    defaultTargetDirection: "higher_better",
    defaultTargetValue: 95,
    defaultFormula: "Completed coaching sessions / scheduled coaching sessions",
    defaultFrequency: "Monthly",
    defaultUnit: "%",
    defaultWeight: 14,
    defaultTarget: "95%",
    defaultOwnerName: "HR Business Partnering",
    defaultStatusLogic: "Green at 95%+, amber 85%-94.9%, red below 85%.",
    defaultUpdateFrequency: "Monthly people check-in",
  },
  {
    metricKey: "kpi-10",
    name: "Priority skill readiness",
    perspectiveId: "people",
    defaultMeasurementType: "percentage",
    defaultTargetDirection: "higher_better",
    defaultTargetValue: 85,
    defaultFormula: "Ready staff / total staff in target pool",
    defaultFrequency: "Quarterly",
    defaultUnit: "%",
    defaultWeight: 10,
    defaultTarget: "85%",
    defaultOwnerName: "HR + Practice Leads",
    defaultStatusLogic: "Green at 85%+, amber 78%-84.9%, red below 78%.",
    defaultUpdateFrequency: "Quarterly readiness review",
  },
];

const legacySeedKpis: SeedKpi[] = [
  {
    key: "kpi-1",
    goalKey: "goal-1",
    metricKey: "kpi-1",
    name: "Priority account revenue growth",
    description: "Measures incremental year-on-year revenue from the top 20 accounts.",
    formula: "((Current period revenue - Prior period revenue) / Prior period revenue) * 100",
    frequency: "Monthly",
    unit: "%",
    weight: 20,
    firmTarget: "12%",
    ownerName: "HR / Strategy Office",
    statusLogic: "On track at 10%+, at risk between 7%-9.9%, off track below 7%.",
    updateFrequency: "Monthly pack + quarter review",
    sortOrder: 1,
  },
  {
    key: "kpi-2",
    goalKey: "goal-1",
    metricKey: "kpi-2",
    name: "Matter realization rate",
    description: "Tracks recovered value versus standard billable value on priority account matters.",
    formula: "Recovered fees / standard billable value",
    frequency: "Monthly",
    unit: "%",
    weight: 18,
    firmTarget: "88%",
    ownerName: "Finance",
    statusLogic: "Green at 88%+, amber at 82%-87.9%, red below 82%.",
    updateFrequency: "Monthly with finance close",
    sortOrder: 2,
  },
  {
    key: "kpi-3",
    goalKey: "goal-2",
    metricKey: "kpi-3",
    name: "Collection cycle days",
    description: "Average days from invoice issuance to cash collection for recurring work.",
    formula: "Average invoice age at collection",
    frequency: "Weekly",
    unit: "Days",
    weight: 14,
    firmTarget: "42 days",
    ownerName: "Finance",
    statusLogic: "Green at 42 days or better, amber 43-46, red 47+.",
    updateFrequency: "Weekly collections huddle",
    sortOrder: 1,
  },
  {
    key: "kpi-4",
    goalKey: "goal-3",
    metricKey: "kpi-4",
    name: "Strategic client retention",
    description: "Share of strategic clients retained through the annual planning cycle.",
    formula: "Retained strategic clients / total strategic clients",
    frequency: "Quarterly",
    unit: "%",
    weight: 16,
    firmTarget: "92%",
    ownerName: "GMP Office",
    statusLogic: "Green at 92%+, amber 88%-91.9%, red below 88%.",
    updateFrequency: "Quarterly client review cadence",
    sortOrder: 1,
  },
  {
    key: "kpi-5",
    goalKey: "goal-3",
    metricKey: "kpi-5",
    name: "Cross-practice conversion rate",
    description: "Conversion of qualified cross-practice opportunities into active work.",
    formula: "Won cross-practice opportunities / qualified opportunities",
    frequency: "Monthly",
    unit: "%",
    weight: 12,
    firmTarget: "35%",
    ownerName: "Partner Leadership",
    statusLogic: "Green at 35%+, amber 30%-34.9%, red below 30%.",
    updateFrequency: "Monthly pipeline review",
    sortOrder: 2,
  },
  {
    key: "kpi-6",
    goalKey: "goal-4",
    metricKey: "kpi-6",
    name: "Executive review completion",
    description: "Completion of agreed executive sponsor reviews for strategic accounts.",
    formula: "Completed executive reviews / scheduled executive reviews",
    frequency: "Monthly",
    unit: "%",
    weight: 10,
    firmTarget: "100%",
    ownerName: "GMP Office",
    statusLogic: "Green at 90%+, amber 75%-89.9%, red below 75%.",
    updateFrequency: "Monthly leadership review",
    sortOrder: 1,
  },
  {
    key: "kpi-7",
    goalKey: "goal-5",
    metricKey: "kpi-7",
    name: "Turnaround SLA adherence",
    description: "Measures assignments delivered within agreed turnaround standards.",
    formula: "Assignments delivered within SLA / total assignments",
    frequency: "Weekly",
    unit: "%",
    weight: 16,
    firmTarget: "95%",
    ownerName: "Operations Council",
    statusLogic: "Green at 93%+, amber 89%-92.9%, red below 89%.",
    updateFrequency: "Weekly delivery stand-up",
    sortOrder: 1,
  },
  {
    key: "kpi-8",
    goalKey: "goal-6",
    metricKey: "kpi-8",
    name: "Review rework ratio",
    description: "Measures the share of assignments requiring significant review rework.",
    formula: "Assignments with major rework / total reviewed assignments",
    frequency: "Monthly",
    unit: "%",
    weight: 12,
    firmTarget: "10%",
    ownerName: "Manager Community",
    statusLogic: "Green at 10% or lower, amber 10.1%-12%, red above 12%.",
    updateFrequency: "Monthly review quality panel",
    sortOrder: 1,
  },
  {
    key: "kpi-9",
    goalKey: "goal-7",
    metricKey: "kpi-9",
    name: "Monthly coaching completion",
    description: "Share of scheduled coaching touchpoints completed by managers with direct reports.",
    formula: "Completed coaching sessions / scheduled coaching sessions",
    frequency: "Monthly",
    unit: "%",
    weight: 14,
    firmTarget: "95%",
    ownerName: "HR Business Partnering",
    statusLogic: "Green at 95%+, amber 85%-94.9%, red below 85%.",
    updateFrequency: "Monthly people check-in",
    sortOrder: 1,
  },
  {
    key: "kpi-10",
    goalKey: "goal-8",
    metricKey: "kpi-10",
    name: "Priority skill readiness",
    description: "Share of staff in critical delivery pools marked ready for priority client work.",
    formula: "Ready staff / total staff in target pool",
    frequency: "Quarterly",
    unit: "%",
    weight: 10,
    firmTarget: "85%",
    ownerName: "HR + Practice Leads",
    statusLogic: "Green at 85%+, amber 78%-84.9%, red below 78%.",
    updateFrequency: "Quarterly readiness review",
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
    !record.createdByProfileId &&
    !!legacy &&
    record.title === legacy.title &&
    cleanText(record.description) === cleanText(legacy.description) &&
    cleanText(record.ownerName) === cleanText(legacy.ownerName)
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
    !record.createdByProfileId &&
    !!legacy &&
    record.metricKey === legacy.metricKey &&
    record.name === legacy.name &&
    cleanText(record.description) === cleanText(legacy.description) &&
    cleanText(record.formula) === cleanText(legacy.formula) &&
    record.frequency === legacy.frequency &&
    record.unit === legacy.unit &&
    record.weight === legacy.weight &&
    record.firmTarget === legacy.firmTarget &&
    cleanText(record.ownerName) === cleanText(legacy.ownerName) &&
    cleanText(record.statusLogic) === cleanText(legacy.statusLogic) &&
    cleanText(record.updateFrequency) === cleanText(legacy.updateFrequency)
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
    !record.createdByProfileId &&
    !!legacy &&
    record.scopeRole === legacy.scopeRole &&
    record.title === legacy.title &&
    cleanText(record.summary) === cleanText(legacy.summary) &&
    cleanText(record.ownerName) === cleanText(legacy.ownerName) &&
    cleanText(record.timeline) === cleanText(legacy.timeline) &&
    toDateKey(record.dueDate) === toDateKey(legacy.dueDate) &&
    record.status === legacy.status &&
    record.progress === legacy.progress
  );
};

export async function ensureBalancedScorecardSeed() {
  const existingCount = await prisma.balancedScorecardPerspective.count();
  if (existingCount > 0) return;

  await prisma.$transaction(async (tx) => {
    const perspectiveIdByKey = new Map<string, number>();
    for (const perspective of defaultPerspectives) {
      const created = await tx.balancedScorecardPerspective.create({
        data: {
          key: perspective.key,
          name: perspective.name,
          ownerName: perspective.ownerName || null,
          summary: perspective.summary || null,
          sortOrder: perspective.sortOrder,
        },
      });
      perspectiveIdByKey.set(perspective.key, created.id);
    }

    const goalIdByKey = new Map<string, number>();
    for (const goal of defaultGoals) {
      const created = await tx.balancedScorecardGoal.create({
        data: {
          key: goal.key,
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
    for (const kpi of defaultKpis) {
      const created = await tx.balancedScorecardKpi.create({
        data: {
          key: kpi.key,
          goalId: goalIdByKey.get(kpi.goalKey)!,
          metricKey: kpi.metricKey,
          name: kpi.name,
          description: kpi.description,
          formula: kpi.formula,
          frequency: kpi.frequency,
          unit: kpi.unit,
          weight: kpi.weight,
          firmTarget: kpi.firmTarget,
          ownerName: kpi.ownerName,
          statusLogic: kpi.statusLogic,
          updateFrequency: kpi.updateFrequency,
          sortOrder: kpi.sortOrder,
        },
      });
      kpiIdByKey.set(kpi.key, created.id);
    }

    const initiativeIdByKey = new Map<string, number>();
    for (const initiative of defaultInitiatives) {
      const created = await tx.balancedScorecardInitiative.create({
        data: {
          key: initiative.key,
          goalId: goalIdByKey.get(initiative.goalKey)!,
          kpiId: kpiIdByKey.get(initiative.kpiKey)!,
          parentInitiativeId: initiative.parentKey ? initiativeIdByKey.get(initiative.parentKey) ?? null : null,
          scopeRole: initiative.scopeRole,
          title: initiative.title,
          summary: initiative.summary,
          ownerName: initiative.ownerName,
          timeline: initiative.timeline,
          dueDate: initiative.dueDate ? new Date(initiative.dueDate) : null,
          status: initiative.status,
          progress: initiative.progress,
          sortOrder: initiative.sortOrder,
        },
      });
      initiativeIdByKey.set(initiative.key, created.id);
    }
  });
}

export async function listBalancedScorecardStructure() {
  await ensureBalancedScorecardSeed();

  const [rawPerspectives, rawGoals, rawKpis, rawInitiatives] = await Promise.all([
    prisma.balancedScorecardPerspective.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    }),
    prisma.balancedScorecardGoal.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    }),
    prisma.balancedScorecardKpi.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    }),
    prisma.balancedScorecardInitiative.findMany({
      where: { isActive: true },
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

export function listBalancedScorecardMetricTemplates() {
  return metricTemplates;
}

export async function createBalancedScorecardPerspective(input: {
  name: string;
  ownerName?: string | null;
  summary?: string | null;
  createdByProfileId?: number | null;
}) {
  const sortOrder = (await prisma.balancedScorecardPerspective.count({ where: { isActive: true } })) + 1;
  return prisma.balancedScorecardPerspective.create({
    data: {
      key: uniqueKey("perspective", input.name),
      name: input.name.trim(),
      ownerName: input.ownerName?.trim() || null,
      summary: input.summary?.trim() || null,
      sortOrder,
      createdByProfileId: input.createdByProfileId ?? null,
    },
  });
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

  return prisma.balancedScorecardPerspective.update({
    where: { id: perspectiveId },
    data: {
      name: input.name.trim(),
      ownerName: input.ownerName?.trim() || null,
      summary: input.summary?.trim() || null,
    },
  });
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

  return prisma.$transaction(async (tx) => {
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

  return prisma.balancedScorecardPerspective.delete({
    where: { id: perspectiveId },
  });
}

export async function createBalancedScorecardGoal(input: {
  perspectiveId: number;
  title: string;
  description?: string | null;
  ownerName?: string | null;
  createdByProfileId?: number | null;
}) {
  const sortOrder =
    (await prisma.balancedScorecardGoal.count({
      where: { perspectiveId: input.perspectiveId, isActive: true },
    })) + 1;
  return prisma.balancedScorecardGoal.create({
    data: {
      key: uniqueKey("goal", input.title),
      perspectiveId: input.perspectiveId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      ownerName: input.ownerName?.trim() || null,
      sortOrder,
      createdByProfileId: input.createdByProfileId ?? null,
    },
  });
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
  statusLogic?: string | null;
  updateFrequency?: string | null;
  createdByProfileId?: number | null;
}) {
  const trimmedName = input.name.trim();
  const metricKey = input.metricKey?.trim() || `custom-${slugify(trimmedName) || "metric"}-${Date.now()}`;
  const trackingMode =
    input.trackingMode ?? (input.metricKey && input.metricKey.trim() ? "template" : "manual");
  const sortOrder =
    (await prisma.balancedScorecardKpi.count({
      where: { goalId: input.goalId, isActive: true },
    })) + 1;
  return prisma.balancedScorecardKpi.create({
    data: {
      key: uniqueKey("kpi", trimmedName),
      goalId: input.goalId,
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
      ownerName: input.ownerName?.trim() || null,
      statusLogic: input.statusLogic?.trim() || null,
      updateFrequency: input.updateFrequency?.trim() || null,
      sortOrder,
      createdByProfileId: input.createdByProfileId ?? null,
    },
  });
}

export async function createBalancedScorecardInitiative(input: {
  goalId: number;
  kpiId: number;
  parentInitiativeId?: number | null;
  scopeRole: string;
  title: string;
  summary?: string | null;
  ownerName?: string | null;
  timeline?: string | null;
  dueDate?: string | null;
  status?: "on_track" | "at_risk" | "off_track";
  progress?: number | null;
  createdByProfileId?: number | null;
}) {
  const sortOrder =
    (await prisma.balancedScorecardInitiative.count({
      where: { goalId: input.goalId, isActive: true },
    })) + 1;
  return prisma.balancedScorecardInitiative.create({
    data: {
      key: uniqueKey("initiative", input.title),
      goalId: input.goalId,
      kpiId: input.kpiId,
      parentInitiativeId: input.parentInitiativeId ?? null,
      scopeRole: input.scopeRole.trim().toLowerCase(),
      title: input.title.trim(),
      summary: input.summary?.trim() || null,
      ownerName: input.ownerName?.trim() || null,
      timeline: input.timeline?.trim() || null,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      status: input.status || "at_risk",
      progress: Math.max(0, Math.min(100, Math.round(input.progress ?? 0))),
      sortOrder,
      createdByProfileId: input.createdByProfileId ?? null,
    },
  });
}
