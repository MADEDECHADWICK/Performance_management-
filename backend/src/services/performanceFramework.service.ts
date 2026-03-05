import { normalizeWeights, resolveRoleConfig } from "./performanceRoleConfig";

export type PyramidLevel =
  | "level_1_corporate_vision"
  | "level_2_business_unit"
  | "level_3_operational_systems"
  | "level_4_people_capability";

export type BscPerspective =
  | "financial"
  | "customer"
  | "internal_process"
  | "learning_growth";

export type MetricDirection = "higher_better" | "lower_better";

export interface FrameworkMetricDefinition {
  key: string;
  name: string;
  level: PyramidLevel;
  perspective: BscPerspective;
  owner: string;
  unit: string;
  frequency: "daily" | "weekly" | "monthly" | "quarterly" | "annual";
  direction: MetricDirection;
  dataSignals: string[];
}

type RoleProfileShape = {
  role?: { name?: string | null } | null;
  positionTitle?: string | null;
};

type ScoringConfigShape = Record<string, any>;

export const PERFORMANCE_FRAMEWORK_METRICS: FrameworkMetricDefinition[] = [
  // Level 1 - Corporate vision and strategic outcomes
  {
    key: "revenue_growth_rate",
    name: "Revenue growth rate",
    level: "level_1_corporate_vision",
    perspective: "financial",
    owner: "gmp",
    unit: "%",
    frequency: "monthly",
    direction: "higher_better",
    dataSignals: ["client_payments", "revenue_projections"],
  },
  {
    key: "operating_profit_margin",
    name: "Operating profit margin",
    level: "level_1_corporate_vision",
    perspective: "financial",
    owner: "gmp",
    unit: "%",
    frequency: "monthly",
    direction: "higher_better",
    dataSignals: ["revenue_allocations", "time_entries", "job_costings"],
  },
  {
    key: "revenue_per_partner",
    name: "Revenue per partner",
    level: "level_1_corporate_vision",
    perspective: "financial",
    owner: "gmp",
    unit: "currency",
    frequency: "monthly",
    direction: "higher_better",
    dataSignals: ["partners", "jobs", "client_payments"],
  },
  {
    key: "cost_to_income_ratio",
    name: "Cost-to-income ratio",
    level: "level_1_corporate_vision",
    perspective: "financial",
    owner: "finance",
    unit: "%",
    frequency: "monthly",
    direction: "lower_better",
    dataSignals: ["time_entries", "job_costings", "client_payments"],
  },
  {
    key: "client_retention_rate",
    name: "Client retention rate",
    level: "level_1_corporate_vision",
    perspective: "customer",
    owner: "gmp",
    unit: "%",
    frequency: "quarterly",
    direction: "higher_better",
    dataSignals: ["clients", "jobs", "proposals"],
  },
  {
    key: "net_promoter_score",
    name: "Net Promoter Score (proxy via recommend rate)",
    level: "level_1_corporate_vision",
    perspective: "customer",
    owner: "marketing",
    unit: "score",
    frequency: "monthly",
    direction: "higher_better",
    dataSignals: ["client_satisfaction_surveys"],
  },
  {
    key: "regulatory_sanctions_count",
    name: "Regulatory sanctions",
    level: "level_1_corporate_vision",
    perspective: "internal_process",
    owner: "gmp",
    unit: "count",
    frequency: "quarterly",
    direction: "lower_better",
    dataSignals: ["project_evaluations", "documents", "status_transitions"],
  },
  {
    key: "audit_quality_findings_high_risk",
    name: "High-risk audit quality findings",
    level: "level_1_corporate_vision",
    perspective: "internal_process",
    owner: "partner",
    unit: "count",
    frequency: "monthly",
    direction: "lower_better",
    dataSignals: ["project_evaluations", "feedback"],
  },

  // Level 2 - Business unit objectives
  {
    key: "client_satisfaction_score",
    name: "Client satisfaction score",
    level: "level_2_business_unit",
    perspective: "customer",
    owner: "partner",
    unit: "%",
    frequency: "monthly",
    direction: "higher_better",
    dataSignals: ["client_satisfaction_surveys"],
  },
  {
    key: "proposal_win_rate",
    name: "Proposal win rate",
    level: "level_2_business_unit",
    perspective: "customer",
    owner: "marketing",
    unit: "%",
    frequency: "monthly",
    direction: "higher_better",
    dataSignals: ["proposals"],
  },
  {
    key: "engagement_profitability",
    name: "Engagement profitability",
    level: "level_2_business_unit",
    perspective: "financial",
    owner: "partner",
    unit: "%",
    frequency: "monthly",
    direction: "higher_better",
    dataSignals: ["jobs", "revenue_allocations", "time_entries"],
  },
  {
    key: "budget_variance_per_engagement",
    name: "Budget variance per engagement",
    level: "level_2_business_unit",
    perspective: "financial",
    owner: "finance",
    unit: "%",
    frequency: "monthly",
    direction: "lower_better",
    dataSignals: ["job_costings", "job_time_allocations", "time_entries"],
  },
  {
    key: "billing_realization_rate",
    name: "Billing realization rate",
    level: "level_2_business_unit",
    perspective: "financial",
    owner: "finance",
    unit: "%",
    frequency: "monthly",
    direction: "higher_better",
    dataSignals: ["client_payments", "jobs", "job_costings"],
  },
  {
    key: "mql_count",
    name: "Marketing qualified leads",
    level: "level_2_business_unit",
    perspective: "customer",
    owner: "marketing",
    unit: "count",
    frequency: "monthly",
    direction: "higher_better",
    dataSignals: ["proposals", "client_onboardings"],
  },
  {
    key: "new_client_revenue_share",
    name: "Revenue from new clients",
    level: "level_2_business_unit",
    perspective: "financial",
    owner: "marketing",
    unit: "%",
    frequency: "monthly",
    direction: "higher_better",
    dataSignals: ["clients", "client_payments"],
  },

  // Level 3 - Operational systems
  {
    key: "file_quality_pass_rate",
    name: "Files passing quality review",
    level: "level_3_operational_systems",
    perspective: "internal_process",
    owner: "manager",
    unit: "%",
    frequency: "monthly",
    direction: "higher_better",
    dataSignals: ["project_evaluations"],
  },
  {
    key: "review_points_per_file",
    name: "Review points per file",
    level: "level_3_operational_systems",
    perspective: "internal_process",
    owner: "manager",
    unit: "count",
    frequency: "monthly",
    direction: "lower_better",
    dataSignals: ["project_evaluations", "feedback"],
  },
  {
    key: "rework_hours_per_engagement",
    name: "Rework hours per engagement",
    level: "level_3_operational_systems",
    perspective: "internal_process",
    owner: "manager",
    unit: "hours",
    frequency: "monthly",
    direction: "lower_better",
    dataSignals: ["time_entries", "tasks", "project_evaluations"],
  },
  {
    key: "actual_vs_budget_hours",
    name: "Actual hours vs budget hours",
    level: "level_3_operational_systems",
    perspective: "internal_process",
    owner: "manager",
    unit: "%",
    frequency: "weekly",
    direction: "lower_better",
    dataSignals: ["job_time_allocations", "time_entries"],
  },
  {
    key: "audit_cycle_time",
    name: "Audit cycle time",
    level: "level_3_operational_systems",
    perspective: "internal_process",
    owner: "manager",
    unit: "days",
    frequency: "monthly",
    direction: "lower_better",
    dataSignals: ["jobs"],
  },
  {
    key: "utilization_rate",
    name: "Utilization rate",
    level: "level_3_operational_systems",
    perspective: "internal_process",
    owner: "manager",
    unit: "%",
    frequency: "weekly",
    direction: "higher_better",
    dataSignals: ["time_entries", "job_time_allocations"],
  },
  {
    key: "documentation_completeness",
    name: "Documentation completeness score",
    level: "level_3_operational_systems",
    perspective: "internal_process",
    owner: "manager",
    unit: "%",
    frequency: "monthly",
    direction: "higher_better",
    dataSignals: ["documents", "project_evaluations"],
  },

  // Level 4 - Enabling functions and individuals
  {
    key: "staff_turnover_rate",
    name: "Staff turnover rate",
    level: "level_4_people_capability",
    perspective: "learning_growth",
    owner: "hr",
    unit: "%",
    frequency: "monthly",
    direction: "lower_better",
    dataSignals: ["profiles"],
  },
  {
    key: "time_to_fill_roles",
    name: "Time-to-fill critical roles",
    level: "level_4_people_capability",
    perspective: "learning_growth",
    owner: "hr",
    unit: "days",
    frequency: "monthly",
    direction: "lower_better",
    dataSignals: ["recruitment_candidates"],
  },
  {
    key: "cpd_compliance_rate",
    name: "CPD compliance rate",
    level: "level_4_people_capability",
    perspective: "learning_growth",
    owner: "hr",
    unit: "%",
    frequency: "monthly",
    direction: "higher_better",
    dataSignals: ["evaluation_assignments", "feedback", "okr_objectives"],
  },
  {
    key: "review_completion_rate",
    name: "Performance review completion rate",
    level: "level_4_people_capability",
    perspective: "learning_growth",
    owner: "hr",
    unit: "%",
    frequency: "monthly",
    direction: "higher_better",
    dataSignals: ["evaluation_assignments"],
  },
  {
    key: "campaign_roi",
    name: "Campaign ROI",
    level: "level_4_people_capability",
    perspective: "customer",
    owner: "marketing",
    unit: "%",
    frequency: "monthly",
    direction: "higher_better",
    dataSignals: ["proposals", "client_payments"],
  },
  {
    key: "lead_to_engagement_conversion",
    name: "Lead-to-engagement conversion rate",
    level: "level_4_people_capability",
    perspective: "customer",
    owner: "marketing",
    unit: "%",
    frequency: "monthly",
    direction: "higher_better",
    dataSignals: ["proposals", "client_onboardings", "jobs"],
  },
  {
    key: "dso",
    name: "Debtor days (DSO)",
    level: "level_4_people_capability",
    perspective: "financial",
    owner: "finance",
    unit: "days",
    frequency: "monthly",
    direction: "lower_better",
    dataSignals: ["jobs", "client_payments", "receivable_follow_up_actions"],
  },
  {
    key: "forecast_accuracy",
    name: "Forecast accuracy",
    level: "level_4_people_capability",
    perspective: "financial",
    owner: "finance",
    unit: "%",
    frequency: "monthly",
    direction: "higher_better",
    dataSignals: ["revenue_projections", "client_payments"],
  },
  {
    key: "budget_adherence_rate",
    name: "Budget adherence rate",
    level: "level_4_people_capability",
    perspective: "financial",
    owner: "finance",
    unit: "%",
    frequency: "monthly",
    direction: "higher_better",
    dataSignals: ["job_costings", "time_entries"],
  },
  {
    key: "employee_billable_vs_target",
    name: "Billable hours vs target",
    level: "level_4_people_capability",
    perspective: "internal_process",
    owner: "employee",
    unit: "%",
    frequency: "weekly",
    direction: "higher_better",
    dataSignals: ["time_entries", "profiles"],
  },
  {
    key: "employee_task_ontime_rate",
    name: "Task completion on time",
    level: "level_4_people_capability",
    perspective: "internal_process",
    owner: "employee",
    unit: "%",
    frequency: "weekly",
    direction: "higher_better",
    dataSignals: ["tasks"],
  },
  {
    key: "employee_accuracy_working_papers",
    name: "Accuracy of working papers",
    level: "level_4_people_capability",
    perspective: "internal_process",
    owner: "employee",
    unit: "%",
    frequency: "monthly",
    direction: "higher_better",
    dataSignals: ["project_evaluations", "feedback"],
  },
  {
    key: "employee_skills_competency",
    name: "Skills competency rating",
    level: "level_4_people_capability",
    perspective: "learning_growth",
    owner: "employee",
    unit: "score",
    frequency: "quarterly",
    direction: "higher_better",
    dataSignals: ["evaluation_assignments", "okr_key_results"],
  },
  {
    key: "brand_awareness_index",
    name: "Brand awareness index",
    level: "level_1_corporate_vision",
    perspective: "customer",
    owner: "marketing",
    unit: "score",
    frequency: "quarterly",
    direction: "higher_better",
    dataSignals: ["client_satisfaction_surveys", "proposals"],
  },
  {
    key: "strategic_market_share",
    name: "Strategic market share",
    level: "level_1_corporate_vision",
    perspective: "customer",
    owner: "gmp",
    unit: "%",
    frequency: "quarterly",
    direction: "higher_better",
    dataSignals: ["clients", "jobs", "proposals"],
  },
  {
    key: "audits_passing_external_review_rate",
    name: "Audits passing external or peer review",
    level: "level_1_corporate_vision",
    perspective: "internal_process",
    owner: "gmp",
    unit: "%",
    frequency: "quarterly",
    direction: "higher_better",
    dataSignals: ["project_evaluations", "documents"],
  },
  {
    key: "repeat_engagement_rate",
    name: "Repeat engagement rate",
    level: "level_2_business_unit",
    perspective: "customer",
    owner: "partner",
    unit: "%",
    frequency: "monthly",
    direction: "higher_better",
    dataSignals: ["jobs", "clients"],
  },
  {
    key: "client_complaint_resolution_days",
    name: "Client complaint resolution time",
    level: "level_2_business_unit",
    perspective: "customer",
    owner: "partner",
    unit: "days",
    frequency: "monthly",
    direction: "lower_better",
    dataSignals: ["feedback", "notifications"],
  },
  {
    key: "write_offs_write_ups_value",
    name: "Write-offs and write-ups",
    level: "level_2_business_unit",
    perspective: "financial",
    owner: "finance",
    unit: "currency",
    frequency: "monthly",
    direction: "lower_better",
    dataSignals: ["job_costings", "client_payments", "time_entries"],
  },
  {
    key: "cross_selling_ratio",
    name: "Cross-selling ratio across service lines",
    level: "level_2_business_unit",
    perspective: "customer",
    owner: "marketing",
    unit: "%",
    frequency: "monthly",
    direction: "higher_better",
    dataSignals: ["clients", "jobs", "proposals"],
  },
  {
    key: "methodology_compliance_score",
    name: "Methodology compliance score",
    level: "level_3_operational_systems",
    perspective: "internal_process",
    owner: "manager",
    unit: "%",
    frequency: "monthly",
    direction: "higher_better",
    dataSignals: ["project_evaluations", "documents"],
  },
  {
    key: "cost_per_engagement",
    name: "Cost per engagement",
    level: "level_3_operational_systems",
    perspective: "financial",
    owner: "finance",
    unit: "currency",
    frequency: "monthly",
    direction: "lower_better",
    dataSignals: ["jobs", "time_entries", "job_costings"],
  },
  {
    key: "late_risk_escalations_count",
    name: "Late risk escalations",
    level: "level_3_operational_systems",
    perspective: "internal_process",
    owner: "manager",
    unit: "count",
    frequency: "monthly",
    direction: "lower_better",
    dataSignals: ["tasks", "project_evaluations", "feedback"],
  },
  {
    key: "post_completion_high_risk_issue_rate",
    name: "High-risk issues identified post-completion",
    level: "level_3_operational_systems",
    perspective: "internal_process",
    owner: "manager",
    unit: "%",
    frequency: "monthly",
    direction: "lower_better",
    dataSignals: ["project_evaluations", "feedback"],
  },
  {
    key: "high_potential_retention_rate",
    name: "High-potential retention rate",
    level: "level_4_people_capability",
    perspective: "learning_growth",
    owner: "hr",
    unit: "%",
    frequency: "quarterly",
    direction: "higher_better",
    dataSignals: ["profiles", "evaluation_assignments"],
  },
  {
    key: "cost_per_qualified_lead",
    name: "Cost per qualified lead",
    level: "level_4_people_capability",
    perspective: "financial",
    owner: "marketing",
    unit: "currency",
    frequency: "monthly",
    direction: "lower_better",
    dataSignals: ["proposals", "client_onboardings"],
  },
  {
    key: "website_traffic_growth",
    name: "Website traffic growth",
    level: "level_4_people_capability",
    perspective: "customer",
    owner: "marketing",
    unit: "%",
    frequency: "monthly",
    direction: "higher_better",
    dataSignals: ["proposals", "clients"],
  },
  {
    key: "thought_leadership_publications_count",
    name: "Thought leadership publications",
    level: "level_4_people_capability",
    perspective: "learning_growth",
    owner: "marketing",
    unit: "count",
    frequency: "monthly",
    direction: "higher_better",
    dataSignals: ["documents", "notifications"],
  },
  {
    key: "billing_cycle_time_days",
    name: "Billing cycle time",
    level: "level_4_people_capability",
    perspective: "financial",
    owner: "finance",
    unit: "days",
    frequency: "monthly",
    direction: "lower_better",
    dataSignals: ["client_payments", "jobs", "job_costings"],
  },
  {
    key: "management_reports_on_time_rate",
    name: "Management reports issued on time",
    level: "level_4_people_capability",
    perspective: "internal_process",
    owner: "finance",
    unit: "%",
    frequency: "monthly",
    direction: "higher_better",
    dataSignals: ["notifications", "tasks"],
  },
  {
    key: "ethics_independence_breaches_count",
    name: "Ethics and independence breaches",
    level: "level_4_people_capability",
    perspective: "internal_process",
    owner: "employee",
    unit: "count",
    frequency: "monthly",
    direction: "lower_better",
    dataSignals: ["project_evaluations", "feedback", "documents"],
  },
  {
    key: "review_notes_per_file",
    name: "Review notes per file",
    level: "level_4_people_capability",
    perspective: "internal_process",
    owner: "employee",
    unit: "count",
    frequency: "monthly",
    direction: "lower_better",
    dataSignals: ["project_evaluations", "feedback"],
  },
  {
    key: "teamwork_professionalism_score",
    name: "Teamwork and professionalism score",
    level: "level_4_people_capability",
    perspective: "learning_growth",
    owner: "employee",
    unit: "score",
    frequency: "quarterly",
    direction: "higher_better",
    dataSignals: ["evaluation_assignments", "feedback"],
  },
];

export const PERFORMANCE_FRAMEWORK_BLUEPRINT = {
  framework: "bsc_pyramid_audit_tax_v1",
  sourceModels: ["balanced_scorecard", "mcnair_lynch_cross_pyramid"],
  corporateVision:
    "Long-term profitability, professional credibility, regulatory compliance, and sustainable market growth.",
  levels: [
    {
      id: "level_1_corporate_vision",
      name: "Corporate Vision & Strategic Outcomes",
      owner: "gmp",
      intent:
        "Translate strategy into enterprise outcomes across financial sustainability, market position, and governance quality.",
    },
    {
      id: "level_2_business_unit",
      name: "Customer & Business Unit Performance",
      owner: "partner",
      intent:
        "Convert strategic intent into client value, engagement economics, and business development outcomes.",
    },
    {
      id: "level_3_operational_systems",
      name: "Internal Operations & Delivery Systems",
      owner: "manager",
      intent:
        "Control quality, cycle time, productivity, and risk in day-to-day engagement delivery.",
    },
    {
      id: "level_4_people_capability",
      name: "People, Capability & Enabling Functions",
      owner: "hr_marketing_finance_employee",
      intent:
        "Build capability, discipline, and behavior that drive process quality and client outcomes.",
    },
  ],
  causeEffectChain: [
    "skills_and_cpd -> audit_quality",
    "audit_quality -> client_trust",
    "client_trust -> retention_and_growth",
    "retention_and_growth -> profitability",
    "utilization_and_cycle_control -> cost_efficiency",
    "cost_efficiency -> margin_improvement",
    "marketing_pipeline -> proposal_wins",
    "proposal_wins -> revenue_growth",
  ],
  metrics: PERFORMANCE_FRAMEWORK_METRICS,
} as const;

const normalizeWeightValue = (value: number | undefined, fallback: number) => {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  if (value > 1) return value / 100;
  return value;
};

export const normalizePerformanceMix = (mix: Record<string, any> | undefined) => {
  const financialRaw = normalizeWeightValue(mix?.financial, 0.7);
  const nonFinancialRaw = normalizeWeightValue(mix?.nonFinancial, 0.3);
  const total = financialRaw + nonFinancialRaw;
  if (total <= 0) {
    return { financial: 0.7, nonFinancial: 0.3 };
  }
  return {
    financial: financialRaw / total,
    nonFinancial: nonFinancialRaw / total,
  };
};

export const normalizeOperationalBlend = (blend: Record<string, any> | undefined) => {
  const coreRaw = normalizeWeightValue(blend?.coreNonFinancial, 0.7);
  const opsRaw = normalizeWeightValue(blend?.operationalEfficiency, 0.3);
  const total = coreRaw + opsRaw;
  if (total <= 0) {
    return { coreNonFinancial: 0.7, operationalEfficiency: 0.3 };
  }
  return {
    coreNonFinancial: coreRaw / total,
    operationalEfficiency: opsRaw / total,
  };
};

export const buildDefaultScoringConfig = (profile?: RoleProfileShape): ScoringConfigShape => {
  const roleConfig = resolveRoleConfig(profile || {});
  const financialBreakdown = normalizeWeights(roleConfig.financial) as Record<string, number> & {
    total: number;
  };

  return {
    frameworkVersion: PERFORMANCE_FRAMEWORK_BLUEPRINT.framework,
    performanceMix: {
      financial: 0.7,
      nonFinancial: 0.3,
    },
    nonFinancialBreakdown: {
      learningGrowth: 0.35,
      customer: 0.35,
      internal: 0.3,
    },
    learningGrowthBreakdown: {
      evaluation: 0.5,
      okr: 0.3,
      feedback: 0.2,
    },
    // This blend keeps operational efficiency visible but inside the non-financial block.
    operationalBlend: {
      coreNonFinancial: 0.7,
      operationalEfficiency: 0.3,
    },
    financialBreakdown: {
      revenue: Number(financialBreakdown.revenue || 0),
      profit: Number(financialBreakdown.profit || 0),
      bd: Number(financialBreakdown.bd || 0),
    },
    lossPenaltyPercent: 0,
  };
};

export const mergeWithDefaultScoringConfig = (
  incoming: ScoringConfigShape | null | undefined,
  profile?: RoleProfileShape
): ScoringConfigShape => {
  const defaults = buildDefaultScoringConfig(profile);
  const payload = incoming && typeof incoming === "object" ? incoming : {};

  return {
    ...defaults,
    ...payload,
    performanceMix: {
      ...defaults.performanceMix,
      ...(payload.performanceMix || {}),
    },
    nonFinancialBreakdown: {
      ...defaults.nonFinancialBreakdown,
      ...(payload.nonFinancialBreakdown || {}),
    },
    learningGrowthBreakdown: {
      ...defaults.learningGrowthBreakdown,
      ...(payload.learningGrowthBreakdown || {}),
    },
    operationalBlend: {
      ...defaults.operationalBlend,
      ...(payload.operationalBlend || {}),
    },
    financialBreakdown: {
      ...defaults.financialBreakdown,
      ...(payload.financialBreakdown || {}),
    },
    lossPenaltyPercent:
      typeof payload.lossPenaltyPercent === "number"
        ? payload.lossPenaltyPercent
        : defaults.lossPenaltyPercent,
  };
};

export const listFrameworkMetrics = (filters?: {
  level?: PyramidLevel;
  perspective?: BscPerspective;
  owner?: string;
}) =>
  PERFORMANCE_FRAMEWORK_METRICS.filter((metric) => {
    if (filters?.level && metric.level !== filters.level) return false;
    if (filters?.perspective && metric.perspective !== filters.perspective) return false;
    if (filters?.owner && metric.owner !== filters.owner) return false;
    return true;
  });

export type DashboardModuleKey =
  | "gmp"
  | "partner"
  | "manager"
  | "finance"
  | "marketing"
  | "hr"
  | "employee";

export interface DashboardModuleCoverageConfig {
  module: DashboardModuleKey;
  label: string;
  strategicIntent: string;
  primaryRoleOwner: string;
  enablerFunctions: string[];
  cadence: "weekly" | "monthly" | "quarterly";
  pyramidFocus: PyramidLevel[];
  perspectiveWeightLens: Record<BscPerspective, number>;
  metricKeys: string[];
}

const DASHBOARD_MODULE_COVERAGE: Record<
  DashboardModuleKey,
  DashboardModuleCoverageConfig
> = {
  gmp: {
    module: "gmp",
    label: "Group Managing Partner Dashboard",
    strategicIntent:
      "Steer enterprise profitability, market reputation, and quality governance across all functions.",
    primaryRoleOwner: "gmp",
    enablerFunctions: ["finance", "marketing", "hr", "partners", "managers"],
    cadence: "monthly",
    pyramidFocus: [
      "level_1_corporate_vision",
      "level_2_business_unit",
      "level_3_operational_systems",
      "level_4_people_capability",
    ],
    perspectiveWeightLens: {
      financial: 0.35,
      customer: 0.25,
      internal_process: 0.25,
      learning_growth: 0.15,
    },
    metricKeys: [
      "revenue_growth_rate",
      "operating_profit_margin",
      "revenue_per_partner",
      "cost_to_income_ratio",
      "brand_awareness_index",
      "strategic_market_share",
      "client_retention_rate",
      "net_promoter_score",
      "audits_passing_external_review_rate",
      "regulatory_sanctions_count",
      "audit_quality_findings_high_risk",
      "file_quality_pass_rate",
      "audit_cycle_time",
      "staff_turnover_rate",
      "cpd_compliance_rate",
      "review_completion_rate",
      "forecast_accuracy",
      "dso",
    ],
  },
  partner: {
    module: "partner",
    label: "Partner Dashboard",
    strategicIntent:
      "Convert client trust and portfolio quality into profitable, compliant engagements.",
    primaryRoleOwner: "partner",
    enablerFunctions: ["finance", "marketing", "managers"],
    cadence: "monthly",
    pyramidFocus: ["level_2_business_unit", "level_3_operational_systems"],
    perspectiveWeightLens: {
      financial: 0.3,
      customer: 0.3,
      internal_process: 0.25,
      learning_growth: 0.15,
    },
    metricKeys: [
      "client_satisfaction_score",
      "repeat_engagement_rate",
      "proposal_win_rate",
      "engagement_profitability",
      "budget_variance_per_engagement",
      "billing_realization_rate",
      "write_offs_write_ups_value",
      "cross_selling_ratio",
      "file_quality_pass_rate",
      "review_points_per_file",
      "methodology_compliance_score",
      "rework_hours_per_engagement",
      "audit_cycle_time",
      "documentation_completeness",
      "late_risk_escalations_count",
      "post_completion_high_risk_issue_rate",
      "utilization_rate",
    ],
  },
  manager: {
    module: "manager",
    label: "Manager Dashboard",
    strategicIntent:
      "Control delivery quality, cycle time, and team productivity at engagement level.",
    primaryRoleOwner: "manager",
    enablerFunctions: ["hr", "finance"],
    cadence: "weekly",
    pyramidFocus: ["level_3_operational_systems", "level_4_people_capability"],
    perspectiveWeightLens: {
      financial: 0.15,
      customer: 0.2,
      internal_process: 0.45,
      learning_growth: 0.2,
    },
    metricKeys: [
      "actual_vs_budget_hours",
      "audit_cycle_time",
      "file_quality_pass_rate",
      "review_points_per_file",
      "rework_hours_per_engagement",
      "methodology_compliance_score",
      "documentation_completeness",
      "late_risk_escalations_count",
      "post_completion_high_risk_issue_rate",
      "utilization_rate",
      "employee_task_ontime_rate",
      "review_completion_rate",
      "employee_accuracy_working_papers",
    ],
  },
  finance: {
    module: "finance",
    label: "Finance Dashboard",
    strategicIntent:
      "Enforce financial discipline, cash conversion, and forecast reliability across engagements.",
    primaryRoleOwner: "finance",
    enablerFunctions: ["partners", "managers", "gmp"],
    cadence: "monthly",
    pyramidFocus: [
      "level_1_corporate_vision",
      "level_2_business_unit",
      "level_3_operational_systems",
      "level_4_people_capability",
    ],
    perspectiveWeightLens: {
      financial: 0.55,
      customer: 0.15,
      internal_process: 0.2,
      learning_growth: 0.1,
    },
    metricKeys: [
      "revenue_growth_rate",
      "operating_profit_margin",
      "cost_to_income_ratio",
      "revenue_per_partner",
      "engagement_profitability",
      "budget_variance_per_engagement",
      "billing_realization_rate",
      "write_offs_write_ups_value",
      "cost_per_engagement",
      "dso",
      "forecast_accuracy",
      "budget_adherence_rate",
      "billing_cycle_time_days",
      "management_reports_on_time_rate",
    ],
  },
  marketing: {
    module: "marketing",
    label: "Marketing Dashboard",
    strategicIntent:
      "Drive qualified demand, brand strength, and pipeline-to-revenue conversion.",
    primaryRoleOwner: "marketing",
    enablerFunctions: ["partners", "finance", "gmp"],
    cadence: "monthly",
    pyramidFocus: ["level_1_corporate_vision", "level_2_business_unit", "level_4_people_capability"],
    perspectiveWeightLens: {
      financial: 0.2,
      customer: 0.45,
      internal_process: 0.2,
      learning_growth: 0.15,
    },
    metricKeys: [
      "brand_awareness_index",
      "strategic_market_share",
      "client_retention_rate",
      "net_promoter_score",
      "mql_count",
      "proposal_win_rate",
      "new_client_revenue_share",
      "cross_selling_ratio",
      "campaign_roi",
      "lead_to_engagement_conversion",
      "cost_per_qualified_lead",
      "website_traffic_growth",
      "thought_leadership_publications_count",
    ],
  },
  hr: {
    module: "hr",
    label: "HR Dashboard",
    strategicIntent:
      "Build capability, retention, and performance culture that sustains audit quality and growth.",
    primaryRoleOwner: "hr",
    enablerFunctions: ["gmp", "managers", "partners"],
    cadence: "monthly",
    pyramidFocus: ["level_4_people_capability", "level_3_operational_systems"],
    perspectiveWeightLens: {
      financial: 0.1,
      customer: 0.2,
      internal_process: 0.25,
      learning_growth: 0.45,
    },
    metricKeys: [
      "staff_turnover_rate",
      "time_to_fill_roles",
      "cpd_compliance_rate",
      "review_completion_rate",
      "high_potential_retention_rate",
      "employee_skills_competency",
      "teamwork_professionalism_score",
      "ethics_independence_breaches_count",
      "methodology_compliance_score",
      "documentation_completeness",
    ],
  },
  employee: {
    module: "employee",
    label: "Employee Dashboard",
    strategicIntent:
      "Reinforce productive behavior, professional quality, and continuous learning at individual level.",
    primaryRoleOwner: "employee",
    enablerFunctions: ["manager", "hr"],
    cadence: "weekly",
    pyramidFocus: ["level_4_people_capability", "level_3_operational_systems"],
    perspectiveWeightLens: {
      financial: 0.2,
      customer: 0.2,
      internal_process: 0.35,
      learning_growth: 0.25,
    },
    metricKeys: [
      "employee_billable_vs_target",
      "utilization_rate",
      "employee_task_ontime_rate",
      "employee_accuracy_working_papers",
      "review_notes_per_file",
      "ethics_independence_breaches_count",
      "cpd_compliance_rate",
      "employee_skills_competency",
      "teamwork_professionalism_score",
      "client_satisfaction_score",
    ],
  },
};

const FRAMEWORK_METRIC_BY_KEY = new Map(
  PERFORMANCE_FRAMEWORK_METRICS.map((metric) => [metric.key, metric] as const)
);

const MODULE_ORDER: DashboardModuleKey[] = [
  "gmp",
  "partner",
  "manager",
  "finance",
  "marketing",
  "hr",
  "employee",
];

export const isDashboardModuleKey = (value: string): value is DashboardModuleKey =>
  Object.prototype.hasOwnProperty.call(DASHBOARD_MODULE_COVERAGE, value);

const getModuleMetrics = (module: DashboardModuleKey) => {
  const config = DASHBOARD_MODULE_COVERAGE[module];
  const seen = new Set<string>();
  return config.metricKeys
    .filter((key) => {
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((key) => FRAMEWORK_METRIC_BY_KEY.get(key))
    .filter((metric): metric is FrameworkMetricDefinition => Boolean(metric));
};

const buildLevelCoverage = (metrics: FrameworkMetricDefinition[]) =>
  PERFORMANCE_FRAMEWORK_BLUEPRINT.levels.map((level) => ({
    level: level.id as PyramidLevel,
    count: metrics.filter((metric) => metric.level === level.id).length,
  }));

const PERSPECTIVE_ORDER: BscPerspective[] = [
  "financial",
  "customer",
  "internal_process",
  "learning_growth",
];

const buildPerspectiveCoverage = (metrics: FrameworkMetricDefinition[]) =>
  PERSPECTIVE_ORDER.map((perspective) => ({
    perspective,
    count: metrics.filter((metric) => metric.perspective === perspective).length,
  }));

export const getDashboardModuleCoverage = (module: DashboardModuleKey) => {
  const config = DASHBOARD_MODULE_COVERAGE[module];
  const metrics = getModuleMetrics(module);
  return {
    ...config,
    metrics,
    coverageByLevel: buildLevelCoverage(metrics),
    coverageByPerspective: buildPerspectiveCoverage(metrics),
  };
};

export const getDashboardModuleCoverageSummary = (module: DashboardModuleKey) => {
  const config = DASHBOARD_MODULE_COVERAGE[module];
  const metrics = getModuleMetrics(module);
  return {
    module: config.module,
    label: config.label,
    strategicIntent: config.strategicIntent,
    primaryRoleOwner: config.primaryRoleOwner,
    cadence: config.cadence,
    metricCount: metrics.length,
    coverageByLevel: buildLevelCoverage(metrics),
    coverageByPerspective: buildPerspectiveCoverage(metrics),
    perspectiveWeightLens: config.perspectiveWeightLens,
  };
};

export const listDashboardModuleCoverageSummaries = () =>
  MODULE_ORDER.map((module) => getDashboardModuleCoverageSummary(module));

export const listDashboardModules = () =>
  MODULE_ORDER.map((module) => {
    const config = DASHBOARD_MODULE_COVERAGE[module];
    return {
      module: config.module,
      label: config.label,
      strategicIntent: config.strategicIntent,
      primaryRoleOwner: config.primaryRoleOwner,
      cadence: config.cadence,
    };
  });

export const resolveDashboardModuleForContext = (input: {
  roles?: string[] | null;
  positionTitle?: string | null;
}): DashboardModuleKey => {
  const roles = (input.roles || []).map((role) => role.toLowerCase().trim());
  const positionTitle = (input.positionTitle || "").toLowerCase();

  const hasRole = (...candidates: string[]) =>
    candidates.some((candidate) =>
      roles.some((role) => role === candidate || role.includes(candidate))
    );

  if (
    hasRole("gmp") ||
    positionTitle.includes("group managing partner") ||
    positionTitle.includes("gmp")
  ) {
    return "gmp";
  }

  if (hasRole("hr")) return "hr";
  if (hasRole("partner")) return "partner";
  if (hasRole("manager")) return "manager";
  if (hasRole("finance") || positionTitle.includes("finance")) return "finance";
  if (
    hasRole("marketing", "business_development") ||
    positionTitle.includes("marketing") ||
    positionTitle.includes("business development")
  ) {
    return "marketing";
  }

  if (hasRole("super_admin")) return "hr";

  return "employee";
};
