export type BaselinePerspectiveSeed = {
  key: string;
  name: string;
  ownerName: string;
  summary: string;
  sortOrder: number;
};

export type BaselineGoalSeed = {
  key: string;
  perspectiveKey: string;
  title: string;
  description: string;
  ownerName: string;
  sortOrder: number;
};

export type BaselineKpiSeed = {
  key: string;
  goalKey: string;
  metricKey: string;
  trackingMode: "template" | "manual";
  measurementType:
    | "percentage"
    | "currency"
    | "number"
    | "count"
    | "days"
    | "boolean"
    | "milestone";
  targetDirection:
    | "higher_better"
    | "lower_better"
    | "exact_match"
    | "milestone_complete";
  targetValue: number;
  currentActualValue?: number | null;
  lastMeasurementNote?: string | null;
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

export type BaselineInitiativeSeed = {
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

export const baselinePerspectives: BaselinePerspectiveSeed[] = [
  {
    key: "financial",
    name: "Financial",
    ownerName: "Rachael Achola",
    summary: "Revenue growth, realization quality, and utilisation discipline across the firm portfolio.",
    sortOrder: 1,
  },
  {
    key: "customer",
    name: "Customer / Stakeholder",
    ownerName: "Grace Kariuki",
    summary: "Retention, client confidence, and cross-practice growth across strategic accounts.",
    sortOrder: 2,
  },
  {
    key: "internal",
    name: "Internal Process",
    ownerName: "Patrick Kiptoo",
    summary: "Turnaround, review quality, and delivery discipline inside active assignments.",
    sortOrder: 3,
  },
  {
    key: "people",
    name: "People / Learning & Growth",
    ownerName: "Helen Mugo",
    summary: "Coaching, readiness, and learning follow-through behind the delivery engine.",
    sortOrder: 4,
  },
];

export const baselineGoals: BaselineGoalSeed[] = [
  {
    key: "baseline-goal-financial-growth",
    perspectiveKey: "financial",
    title: "Grow recurring revenue from priority accounts",
    description: "Expand wallet share with the top strategic clients while protecting realization quality.",
    ownerName: "Grace Kariuki",
    sortOrder: 1,
  },
  {
    key: "baseline-goal-financial-discipline",
    perspectiveKey: "financial",
    title: "Improve billing discipline and billable utilization",
    description: "Reduce cash conversion lag while protecting billable capacity across the firm.",
    ownerName: "Ronald Ouma",
    sortOrder: 2,
  },
  {
    key: "baseline-goal-customer-retention",
    perspectiveKey: "customer",
    title: "Deepen client retention and cross-sell",
    description: "Lift retention for strategic clients and convert more cross-practice opportunities.",
    ownerName: "Grace Kariuki",
    sortOrder: 1,
  },
  {
    key: "baseline-goal-customer-confidence",
    perspectiveKey: "customer",
    title: "Strengthen stakeholder confidence in delivery",
    description: "Improve service reviews, response quality, and proactive communication with client teams.",
    ownerName: "Janet Mwangi",
    sortOrder: 2,
  },
  {
    key: "baseline-goal-internal-sla",
    perspectiveKey: "internal",
    title: "Tighten turnaround and SLA adherence",
    description: "Make delivery timings visible and improve control across active jobs and review cycles.",
    ownerName: "Patrick Kiptoo",
    sortOrder: 1,
  },
  {
    key: "baseline-goal-internal-quality",
    perspectiveKey: "internal",
    title: "Reduce review rework across assignments",
    description: "Build first-time-right behaviour and reduce late-stage review corrections.",
    ownerName: "Helen Mugo",
    sortOrder: 2,
  },
  {
    key: "baseline-goal-people-coaching",
    perspectiveKey: "people",
    title: "Lift coaching discipline and capability depth",
    description: "Increase scheduled coaching touchpoints and review completion across key staff bands.",
    ownerName: "Helen Mugo",
    sortOrder: 1,
  },
  {
    key: "baseline-goal-people-readiness",
    perspectiveKey: "people",
    title: "Improve readiness for priority client work",
    description: "Increase training readiness and specialist deployment confidence for complex work.",
    ownerName: "Chad Madas",
    sortOrder: 2,
  },
];

export const baselineKpis: BaselineKpiSeed[] = [
  {
    key: "baseline-kpi-priority-account-revenue-growth",
    goalKey: "baseline-goal-financial-growth",
    metricKey: "kpi-1",
    trackingMode: "template",
    measurementType: "percentage",
    targetDirection: "higher_better",
    targetValue: 90,
    name: "Priority account revenue growth",
    description: "Tracks revenue collected against the current projection pack for priority account work.",
    formula: "Current month collected revenue / current month projected revenue",
    frequency: "Monthly",
    unit: "%",
    weight: 53,
    firmTarget: "90%",
    ownerName: "Rachael Achola",
    statusLogic: "Green at 90%+, amber at 75%-89.9%, red below 75%.",
    updateFrequency: "Monthly finance close",
    sortOrder: 1,
  },
  {
    key: "baseline-kpi-matter-realization-rate",
    goalKey: "baseline-goal-financial-growth",
    metricKey: "kpi-2",
    trackingMode: "template",
    measurementType: "percentage",
    targetDirection: "higher_better",
    targetValue: 85,
    name: "Matter realization rate",
    description: "Shows how much of issued invoice value has already been recovered as cash.",
    formula: "Invoice amount paid / total issued invoice value",
    frequency: "Monthly",
    unit: "%",
    weight: 47,
    firmTarget: "85%",
    ownerName: "Ronald Ouma",
    statusLogic: "Green at 85%+, amber at 70%-84.9%, red below 70%.",
    updateFrequency: "Monthly collections review",
    sortOrder: 2,
  },
  {
    key: "baseline-kpi-collection-cycle-days",
    goalKey: "baseline-goal-financial-discipline",
    metricKey: "kpi-3",
    trackingMode: "template",
    measurementType: "days",
    targetDirection: "lower_better",
    targetValue: 42,
    name: "Collection cycle days",
    description: "Average elapsed days from invoice issue to payment or current aging for unresolved invoices.",
    formula: "Average days from invoice issue date to paid date",
    frequency: "Weekly",
    unit: "Days",
    weight: 54,
    firmTarget: "42 days",
    ownerName: "Ronald Ouma",
    statusLogic: "Green at 42 days or better, amber 43-50, red above 50 days.",
    updateFrequency: "Weekly collections huddle",
    sortOrder: 1,
  },
  {
    key: "baseline-kpi-billable-utilization",
    goalKey: "baseline-goal-financial-discipline",
    metricKey: "kpi-11",
    trackingMode: "template",
    measurementType: "percentage",
    targetDirection: "higher_better",
    targetValue: 80,
    name: "Billable utilization",
    description: "Tracks the share of recorded hours that are billable across the firm workforce.",
    formula: "Billable hours / total recorded hours",
    frequency: "Monthly",
    unit: "%",
    weight: 46,
    firmTarget: "80%",
    ownerName: "Ronald Ouma",
    statusLogic: "Green at 80%+, amber at 65%-79.9%, red below 65%.",
    updateFrequency: "Monthly time entry close",
    sortOrder: 2,
  },
  {
    key: "baseline-kpi-strategic-client-retention",
    goalKey: "baseline-goal-customer-retention",
    metricKey: "kpi-4",
    trackingMode: "template",
    measurementType: "percentage",
    targetDirection: "higher_better",
    targetValue: 70,
    name: "Strategic client retention",
    description: "Share of prior-period clients who are also active in the current period.",
    formula: "Clients retained from prior period / clients in prior period",
    frequency: "Quarterly",
    unit: "%",
    weight: 53,
    firmTarget: "70%",
    ownerName: "Grace Kariuki",
    statusLogic: "Green at 70%+, amber at 55%-69.9%, red below 55%.",
    updateFrequency: "Quarterly sponsor review",
    sortOrder: 1,
  },
  {
    key: "baseline-kpi-cross-practice-expansion",
    goalKey: "baseline-goal-customer-retention",
    metricKey: "kpi-5",
    trackingMode: "template",
    measurementType: "percentage",
    targetDirection: "higher_better",
    targetValue: 35,
    name: "Cross-practice expansion wins",
    description: "Tracks proposal conversion as a live proxy for turning growth opportunities into active work.",
    formula: "Won proposals / total proposals raised in the period",
    frequency: "Monthly",
    unit: "%",
    weight: 47,
    firmTarget: "35%",
    ownerName: "Esther Wanjiku",
    statusLogic: "Green at 35%+, amber at 22%-34.9%, red below 22%.",
    updateFrequency: "Monthly pipeline review",
    sortOrder: 2,
  },
  {
    key: "baseline-kpi-stakeholder-satisfaction",
    goalKey: "baseline-goal-customer-confidence",
    metricKey: "kpi-6",
    trackingMode: "template",
    measurementType: "percentage",
    targetDirection: "higher_better",
    targetValue: 88,
    name: "Stakeholder satisfaction score",
    description: "Average satisfaction signal from completed client surveys.",
    formula: "Average overall satisfaction score from completed client surveys",
    frequency: "Monthly",
    unit: "Score",
    weight: 100,
    firmTarget: "88%",
    ownerName: "Janet Mwangi",
    statusLogic: "Green at 88%+, amber at 75%-87.9%, red below 75%.",
    updateFrequency: "Monthly client-listening pack",
    sortOrder: 1,
  },
  {
    key: "baseline-kpi-sla-adherence",
    goalKey: "baseline-goal-internal-sla",
    metricKey: "kpi-7",
    trackingMode: "template",
    measurementType: "percentage",
    targetDirection: "higher_better",
    targetValue: 85,
    name: "Turnaround and SLA adherence",
    description: "Completed jobs delivered on or before the committed due date.",
    formula: "Completed jobs on or before due date / completed jobs with due dates",
    frequency: "Weekly",
    unit: "%",
    weight: 100,
    firmTarget: "85%",
    ownerName: "Patrick Kiptoo",
    statusLogic: "Green at 85%+, amber at 70%-84.9%, red below 70%.",
    updateFrequency: "Weekly delivery board",
    sortOrder: 1,
  },
  {
    key: "baseline-kpi-review-pass-rate",
    goalKey: "baseline-goal-internal-quality",
    metricKey: "kpi-8",
    trackingMode: "template",
    measurementType: "percentage",
    targetDirection: "higher_better",
    targetValue: 84,
    name: "Quality review pass rate",
    description: "Average project evaluation score across submitted quality reviews.",
    formula: "Average submitted project evaluation score",
    frequency: "Monthly",
    unit: "%",
    weight: 100,
    firmTarget: "84%",
    ownerName: "Patrick Kiptoo",
    statusLogic: "Green at 84%+, amber at 70%-83.9%, red below 70%.",
    updateFrequency: "Monthly quality review",
    sortOrder: 1,
  },
  {
    key: "baseline-kpi-coaching-review-completion",
    goalKey: "baseline-goal-people-coaching",
    metricKey: "kpi-9",
    trackingMode: "template",
    measurementType: "percentage",
    targetDirection: "higher_better",
    targetValue: 90,
    name: "Coaching and review completion",
    description: "Share of evaluation assignments already submitted within the active review window.",
    formula: "Submitted evaluation assignments / total assignments created in the period",
    frequency: "Monthly",
    unit: "%",
    weight: 100,
    firmTarget: "90%",
    ownerName: "Helen Mugo",
    statusLogic: "Green at 90%+, amber at 75%-89.9%, red below 75%.",
    updateFrequency: "Monthly people review",
    sortOrder: 1,
  },
  {
    key: "baseline-kpi-readiness-learning-completion",
    goalKey: "baseline-goal-people-readiness",
    metricKey: "kpi-10",
    trackingMode: "template",
    measurementType: "percentage",
    targetDirection: "higher_better",
    targetValue: 88,
    name: "Readiness and learning completion",
    description: "Blended readiness signal from learning assignment completion and employee onboarding completion.",
    formula: "Average of learning assignment completion rate and onboarding completion rate",
    frequency: "Monthly",
    unit: "%",
    weight: 100,
    firmTarget: "88%",
    ownerName: "Helen Mugo",
    statusLogic: "Green at 88%+, amber at 72%-87.9%, red below 72%.",
    updateFrequency: "Monthly readiness checkpoint",
    sortOrder: 1,
  },
];

export const baselineInitiatives: BaselineInitiativeSeed[] = [
  {
    key: "baseline-init-priority-account-expansion",
    goalKey: "baseline-goal-financial-growth",
    kpiKey: "baseline-kpi-priority-account-revenue-growth",
    scopeRole: "hr",
    title: "Top-20 account expansion programme",
    summary: "The firm-level initiative that triggers GMP, partner, manager, and employee actions around priority-account growth.",
    ownerName: "Rachael Achola",
    timeline: "Apr 2026 - Dec 2026",
    dueDate: "2026-12-31",
    status: "on_track",
    progress: 81,
    sortOrder: 1,
  },
  {
    key: "baseline-init-collections-playbook",
    goalKey: "baseline-goal-financial-discipline",
    kpiKey: "baseline-kpi-collection-cycle-days",
    scopeRole: "finance",
    title: "Write-off and collections playbook",
    summary: "Aligns finance, partners, and managers on aging-balance action ownership and billable discipline.",
    ownerName: "Ronald Ouma",
    timeline: "May 2026 - Oct 2026",
    dueDate: "2026-10-31",
    status: "at_risk",
    progress: 46,
    sortOrder: 2,
  },
  {
    key: "baseline-init-client-sponsorship",
    goalKey: "baseline-goal-customer-retention",
    kpiKey: "baseline-kpi-strategic-client-retention",
    scopeRole: "hr",
    title: "Strategic client sponsorship cadence",
    summary: "Ensures the same strategic KPI is driven through aligned initiatives at every role level.",
    ownerName: "Grace Kariuki",
    timeline: "Q2 - Q4 2026",
    dueDate: "2026-12-15",
    status: "on_track",
    progress: 74,
    sortOrder: 3,
  },
  {
    key: "baseline-init-client-confidence",
    goalKey: "baseline-goal-customer-confidence",
    kpiKey: "baseline-kpi-stakeholder-satisfaction",
    scopeRole: "partner",
    title: "Client listening pack and recovery loop",
    summary: "Converts stakeholder feedback into named service recovery actions and sponsor follow-through.",
    ownerName: "Janet Mwangi",
    timeline: "Monthly cadence",
    dueDate: "2026-11-30",
    status: "on_track",
    progress: 76,
    sortOrder: 4,
  },
  {
    key: "baseline-init-sla-wallboard",
    goalKey: "baseline-goal-internal-sla",
    kpiKey: "baseline-kpi-sla-adherence",
    scopeRole: "hr",
    title: "SLA review wallboard rollout",
    summary: "Pushes delivery visibility into department and manager workboards.",
    ownerName: "Patrick Kiptoo",
    timeline: "Apr 2026 - Jul 2026",
    dueDate: "2026-07-31",
    status: "on_track",
    progress: 77,
    sortOrder: 5,
  },
  {
    key: "baseline-init-quality-forum",
    goalKey: "baseline-goal-internal-quality",
    kpiKey: "baseline-kpi-review-pass-rate",
    scopeRole: "manager",
    title: "Quality review calibration forum",
    summary: "Builds first-time-right behaviour through manager-owned review calibration and rework reduction.",
    ownerName: "Patrick Kiptoo",
    timeline: "Monthly review rhythm",
    dueDate: "2026-10-31",
    status: "at_risk",
    progress: 63,
    sortOrder: 6,
  },
  {
    key: "baseline-init-people-readiness",
    goalKey: "baseline-goal-people-coaching",
    kpiKey: "baseline-kpi-coaching-review-completion",
    scopeRole: "hr",
    title: "Capability and review readiness drive",
    summary: "Improves coaching follow-through and readiness signals across the people perspective.",
    ownerName: "Helen Mugo",
    timeline: "Current review cycle",
    dueDate: "2026-12-20",
    status: "at_risk",
    progress: 54,
    sortOrder: 7,
  },
  {
    key: "baseline-cascade-hr",
    goalKey: "baseline-goal-customer-retention",
    kpiKey: "baseline-kpi-strategic-client-retention",
    scopeRole: "hr",
    title: "Firm-wide strategic client sponsorship programme",
    summary: "Defines the strategic goal, KPI, target, and the parent initiative for the cascade example.",
    ownerName: "Helen Mugo",
    timeline: "FY 2026 strategic cycle",
    dueDate: "2026-12-31",
    status: "on_track",
    progress: 84,
    sortOrder: 10,
  },
  {
    key: "baseline-cascade-gmp",
    goalKey: "baseline-goal-customer-retention",
    kpiKey: "baseline-kpi-strategic-client-retention",
    parentKey: "baseline-cascade-hr",
    scopeRole: "gmp",
    title: "Quarterly executive sponsor review cadence",
    summary: "Keeps the same KPI aligned while narrowing focus to executive reviews and sponsor follow-through.",
    ownerName: "Grace Kariuki",
    timeline: "Quarterly cadence",
    dueDate: "2026-12-15",
    status: "on_track",
    progress: 79,
    sortOrder: 1,
  },
  {
    key: "baseline-cascade-partner",
    goalKey: "baseline-goal-customer-retention",
    kpiKey: "baseline-kpi-cross-practice-expansion",
    parentKey: "baseline-cascade-gmp",
    scopeRole: "partner",
    title: "Practice-level client growth plans",
    summary: "Turns the KPI into portfolio-level account plans and partner-owned client actions.",
    ownerName: "Janet Mwangi",
    timeline: "Portfolio review cycle",
    dueDate: "2026-11-30",
    status: "at_risk",
    progress: 73,
    sortOrder: 1,
  },
  {
    key: "baseline-cascade-manager",
    goalKey: "baseline-goal-internal-sla",
    kpiKey: "baseline-kpi-sla-adherence",
    parentKey: "baseline-cascade-partner",
    scopeRole: "manager",
    title: "Monthly account action logs and service recovery tracking",
    summary: "Turns partner plans into team deliverables, response discipline, and action closure.",
    ownerName: "Patrick Kiptoo",
    timeline: "Weekly delivery rhythm",
    dueDate: "2026-10-31",
    status: "at_risk",
    progress: 68,
    sortOrder: 1,
  },
  {
    key: "baseline-cascade-employee",
    goalKey: "baseline-goal-internal-sla",
    kpiKey: "baseline-kpi-sla-adherence",
    parentKey: "baseline-cascade-manager",
    scopeRole: "employee",
    title: "Prepare review packs and close assigned follow-up actions",
    summary: "Represents the employee action layer in the featured cascade chain.",
    ownerName: "Chadwick Madede",
    timeline: "Weekly cadence",
    dueDate: "2026-05-31",
    status: "at_risk",
    progress: 66,
    sortOrder: 1,
  },
];

export const buildBalancedScorecardBaselineSource = () => {
  const perspectiveIdByKey = new Map<string, number>();
  const goalIdByKey = new Map<string, number>();
  const kpiIdByKey = new Map<string, number>();
  const initiativeIdByKey = new Map<string, number>();

  let nextPerspectiveId = 1;
  const perspectives = baselinePerspectives.map((perspective) => {
    const id = nextPerspectiveId++;
    perspectiveIdByKey.set(perspective.key, id);
    return {
      id,
      name: perspective.name,
      ownerName: perspective.ownerName || null,
      summary: perspective.summary || null,
      sortOrder: perspective.sortOrder,
    };
  });

  let nextGoalId = 1;
  const goals = baselineGoals.map((goal) => {
    const id = nextGoalId++;
    goalIdByKey.set(goal.key, id);
    return {
      id,
      perspectiveId: perspectiveIdByKey.get(goal.perspectiveKey)!,
      title: goal.title,
      description: goal.description || null,
      ownerName: goal.ownerName || null,
      sortOrder: goal.sortOrder,
    };
  });

  let nextKpiId = 1;
  const kpis = baselineKpis.map((kpi) => {
    const id = nextKpiId++;
    kpiIdByKey.set(kpi.key, id);
    return {
      id,
      goalId: goalIdByKey.get(kpi.goalKey)!,
      metricKey: kpi.metricKey,
      trackingMode: kpi.trackingMode,
      measurementType: kpi.measurementType,
      targetDirection: kpi.targetDirection,
      targetValue: kpi.targetValue,
      currentActualValue: kpi.currentActualValue ?? null,
      lastMeasurementNote: kpi.lastMeasurementNote ?? null,
      name: kpi.name,
      description: kpi.description || null,
      formula: kpi.formula || null,
      frequency: kpi.frequency,
      unit: kpi.unit,
      weight: kpi.weight,
      firmTarget: kpi.firmTarget,
      ownerName: kpi.ownerName || null,
      ownerProfileId: null,
      statusLogic: kpi.statusLogic || null,
      updateFrequency: kpi.updateFrequency || null,
      sortOrder: kpi.sortOrder,
    };
  });

  let nextInitiativeId = 1;
  const initiatives = baselineInitiatives.map((initiative) => {
    const id = nextInitiativeId++;
    initiativeIdByKey.set(initiative.key, id);
    return {
      id,
      goalId: goalIdByKey.get(initiative.goalKey)!,
      kpiId: kpiIdByKey.get(initiative.kpiKey)!,
      parentInitiativeId: initiative.parentKey
        ? initiativeIdByKey.get(initiative.parentKey) ?? null
        : null,
      scopeRole: initiative.scopeRole,
      title: initiative.title,
      summary: initiative.summary || null,
      ownerName: initiative.ownerName || null,
      ownerProfileId: null,
      timeline: initiative.timeline || null,
      dueDate: initiative.dueDate ? new Date(initiative.dueDate) : null,
      status: initiative.status,
      progress: initiative.progress,
      sortOrder: initiative.sortOrder,
    };
  });

  return {
    perspectives,
    goals,
    kpis,
    initiatives,
    kpiAssignments: [] as Array<never>,
  };
};
