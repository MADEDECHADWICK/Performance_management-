import { api } from './client';

export type DashboardModuleKey =
  | 'gmp'
  | 'partner'
  | 'manager'
  | 'finance'
  | 'marketing'
  | 'hr'
  | 'employee';

export type PyramidLevel =
  | 'level_1_corporate_vision'
  | 'level_2_business_unit'
  | 'level_3_operational_systems'
  | 'level_4_people_capability';

export type BscPerspective =
  | 'financial'
  | 'customer'
  | 'internal_process'
  | 'learning_growth';

export interface FrameworkMetricDefinition {
  key: string;
  name: string;
  level: PyramidLevel;
  perspective: BscPerspective;
  owner: string;
  unit: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual';
  direction: 'higher_better' | 'lower_better';
  dataSignals: string[];
}

export interface DashboardModuleCoverageSummary {
  module: DashboardModuleKey;
  label: string;
  strategicIntent: string;
  primaryRoleOwner: string;
  cadence: 'weekly' | 'monthly' | 'quarterly';
  metricCount: number;
  coverageByLevel: Array<{ level: PyramidLevel; count: number }>;
  coverageByPerspective: Array<{ perspective: BscPerspective; count: number }>;
  perspectiveWeightLens: Record<BscPerspective, number>;
}

export interface DashboardModuleCoverage extends Omit<DashboardModuleCoverageSummary, 'metricCount'> {
  enablerFunctions: string[];
  pyramidFocus: PyramidLevel[];
  metrics: FrameworkMetricDefinition[];
}

export interface ResolveModuleResponse {
  module: DashboardModuleKey;
  roleSignals: string[];
  positionTitle: string | null;
  coverage: DashboardModuleCoverageSummary;
}

export interface FrameworkCoverageSummary {
  frameworkVersion: string;
  totalMetrics: number;
  byLevel: Array<{ id: PyramidLevel; name: string; count: number }>;
  byPerspective: Array<{ perspective: BscPerspective; count: number }>;
  byOwner: Array<{ owner: string; count: number }>;
  uniqueDataSignals: number;
  topSignals: Array<{ signal: string; count: number }>;
}

export type WorkspaceRole =
  | 'hr'
  | 'gmp'
  | 'partner'
  | 'manager'
  | 'finance'
  | 'marketing'
  | 'employee';

export type WorkspaceStatusTone = 'on_track' | 'at_risk' | 'off_track';

export interface BalancedScorecardWorkspace {
  generatedAt: string;
  effectiveRole: WorkspaceRole;
  perspectiveCards: Array<{
    id: 'financial' | 'customer' | 'internal' | 'people';
    name: string;
    score: number;
    owner: string;
    status: WorkspaceStatusTone;
    summary: string;
    goals: number;
    kpis: number;
    initiatives: number;
    cascadeProgress: number;
  }>;
  goals: Array<{
    id: string;
    perspectiveId: 'financial' | 'customer' | 'internal' | 'people';
    title: string;
    owner: string;
    description: string;
    linkedKpis: string[];
    initiativeCount: number;
    status: WorkspaceStatusTone;
  }>;
  kpis: Array<{
    id: string;
    name: string;
    perspectiveId: 'financial' | 'customer' | 'internal' | 'people';
    goalId: string;
    description: string;
    formula: string;
    frequency: string;
    unit: string;
    weight: number;
    firmTarget: string;
    actual: string;
    weightedScore: number;
    owner: string;
    status: WorkspaceStatusTone;
    statusLogic: string;
    updateFrequency: string;
    initiativeProgress: number;
    trend: number[];
    ownerUpdate: string;
  }>;
  initiatives: Array<{
    id: string;
    title: string;
    goalId: string;
    kpiId: string;
    perspectiveId: 'financial' | 'customer' | 'internal' | 'people';
    owner: string;
    timeline: string;
    dueDate: string;
    status: WorkspaceStatusTone;
    progress: number;
    drilldownCount: number;
    scopeRole: WorkspaceRole;
    parentInitiativeId: string | null;
    summary: string;
  }>;
  cascadeInitiatives: Array<{
    id: string;
    title: string;
    goalId: string;
    kpiId: string;
    perspectiveId: 'financial' | 'customer' | 'internal' | 'people';
    owner: string;
    timeline: string;
    dueDate: string;
    status: WorkspaceStatusTone;
    progress: number;
    drilldownCount: number;
    scopeRole: WorkspaceRole;
    parentInitiativeId: string | null;
    summary: string;
  }>;
  featuredCascade: Array<{
    level: 'HR' | 'GMP' | 'Partner' | 'Manager' | 'Employee';
    owner: string;
    initiative: string;
    target: string;
    progress: number;
    dueDate: string;
    status: WorkspaceStatusTone;
    note: string;
  }>;
  employeeContributions: Array<{
    id: string;
    sourceType: "evaluation_cycle" | "learning_assignment";
    sourceReferenceId: number | null;
    title: string;
    kpiId: string;
    initiative: string;
    dueDate: string;
    progress: number;
    score: number;
    status: WorkspaceStatusTone;
    acknowledged: boolean;
    managerComment: string;
    rollup: string;
    employeeComment: string | null;
    lastUpdatedAt: string | null;
    workflowRecordId: number | null;
    evidenceCount: number;
    reviewContextPath: string | null;
  }>;
  employeeKpiAssignments: Array<{
    id: number;
    profileId: number;
    kpiId: string;
    kpiName: string;
    individualTarget: number | null;
    individualWeight: number;
    actualProgress: number;
    score: number;
    status: WorkspaceStatusTone;
    initiativeTitles: string[];
    dueDate: string | null;
    owner: string;
  }>;
  evaluationSummary: {
    cycleId: number | null;
    cycleTitle: string | null;
    cycleStatus: string | null;
    startDate: string | null;
    endDate: string | null;
    totalAssignments: number;
    submittedAssignments: number;
    pendingAssignments: number;
    acknowledgedAssignments: number;
    overdueAssignments: number;
    completionPercent: number;
    acknowledgementPercent: number;
    averageScore: number;
    departmentCount: number;
    managerCount: number;
    resultCount: number;
  };
  reportBlocks: Array<{
    label: string;
    value: string;
    hint: string;
  }>;
  departmentPerformance: Array<{
    name: string;
    score: number;
    status: WorkspaceStatusTone;
  }>;
  managerPerformance: Array<{
    name: string;
    score: number;
    team: string;
  }>;
  employeePerformance: Array<{
    name: string;
    score: number;
    ack: string;
  }>;
}

export type WorkspacePerspectiveCard = BalancedScorecardWorkspace['perspectiveCards'][number];
export type WorkspaceGoal = BalancedScorecardWorkspace['goals'][number];
export type WorkspaceKpi = BalancedScorecardWorkspace['kpis'][number];
export type WorkspaceInitiative = BalancedScorecardWorkspace['initiatives'][number];
export type WorkspaceCascadeInitiative = BalancedScorecardWorkspace['cascadeInitiatives'][number];
export type WorkspaceCascadeLevel = BalancedScorecardWorkspace['featuredCascade'][number];
export type WorkspaceEmployeeContribution = BalancedScorecardWorkspace['employeeContributions'][number];
export type WorkspaceEmployeeKpiAssignment = BalancedScorecardWorkspace['employeeKpiAssignments'][number];
export type WorkspaceEvaluationSummary = BalancedScorecardWorkspace['evaluationSummary'];
export type WorkspaceReportBlock = BalancedScorecardWorkspace['reportBlocks'][number];
export type WorkspaceDepartmentRow = BalancedScorecardWorkspace['departmentPerformance'][number];
export type WorkspaceManagerRow = BalancedScorecardWorkspace['managerPerformance'][number];
export type WorkspaceEmployeeRow = BalancedScorecardWorkspace['employeePerformance'][number];

export interface BalancedScorecardPerspectiveRecord {
  id: number;
  key: string;
  name: string;
  ownerName: string | null;
  summary: string | null;
  sortOrder: number;
}

export interface BalancedScorecardGoalRecord {
  id: number;
  key: string;
  perspectiveId: number;
  title: string;
  description: string | null;
  ownerName: string | null;
  sortOrder: number;
}

export interface BalancedScorecardKpiRecord {
  id: number;
  key: string;
  goalId: number;
  metricKey: string;
  trackingMode: "template" | "manual";
  measurementType: string | null;
  targetDirection: string | null;
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
}

export interface BalancedScorecardInitiativeRecord {
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
  dueDate: string | null;
  status: WorkspaceStatusTone;
  progress: number;
  sortOrder: number;
}

export interface BalancedScorecardKpiAssignmentRecord {
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
}

export interface PerformanceBandRecord {
  id: number;
  roleId: number | null;
  roleName: string | null;
  onTrackMin: number;
  atRiskMin: number;
  label: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BalancedScorecardStructure {
  perspectives: BalancedScorecardPerspectiveRecord[];
  goals: BalancedScorecardGoalRecord[];
  kpis: BalancedScorecardKpiRecord[];
  initiatives: BalancedScorecardInitiativeRecord[];
}

export interface BalancedScorecardMetricTemplate {
  metricKey: string;
  name: string;
  perspectiveId: 'financial' | 'customer' | 'internal' | 'people';
  defaultMeasurementType: string;
  defaultTargetDirection: string;
  defaultTargetValue: number;
  defaultFormula: string;
  defaultFrequency: string;
  defaultUnit: string;
  defaultWeight: number;
  defaultTarget: string;
  defaultOwnerName: string;
  defaultStatusLogic: string;
  defaultUpdateFrequency: string;
}

export interface BalancedScorecardGovernanceVersion {
  id: number;
  cycleId: number;
  versionNumber: number;
  label: string | null;
  status: "draft" | "published" | "superseded" | "archived";
  publishedAt: string | null;
  createdAt: string;
  perspectiveCount: number;
  goalCount: number;
  kpiCount: number;
  initiativeCount: number;
}

export interface BalancedScorecardGovernanceCycle {
  id: number;
  key: string;
  name: string;
  cadence: "monthly" | "quarterly" | "annual";
  status: "draft" | "active" | "closed" | "archived";
  startDate: string;
  endDate: string;
  activeVersionId: number | null;
  versions: BalancedScorecardGovernanceVersion[];
}

export interface BalancedScorecardMeasurementReviewRecord {
  id: number;
  action:
    | "generated"
    | "submitted"
    | "review_started"
    | "changes_requested"
    | "approved"
    | "closed"
    | "reopened";
  fromStatus: "draft" | "generated" | "submitted" | "in_review" | "approved" | "closed" | null;
  toStatus: "draft" | "generated" | "submitted" | "in_review" | "approved" | "closed";
  comment: string | null;
  actedByProfileId: number | null;
  actedAt: string;
}

export interface BalancedScorecardMeasurementPeriodSummary {
  id: number;
  key: string;
  scorecardVersionId: number;
  scorecardCycleId: number;
  scorecardCycleName: string;
  scorecardLabel: string | null;
  cadence: "monthly" | "quarterly" | "annual";
  label: string;
  periodStart: string;
  periodEnd: string;
  status: "draft" | "generated" | "submitted" | "in_review" | "approved" | "closed";
  generatedAt: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  approvedAt: string | null;
  closedAt: string | null;
  latestComment: string | null;
  snapshotCount: number;
  offTrackCount: number;
  atRiskCount: number;
  warningCount: number;
  missingDataCount: number;
  reviewHistory: BalancedScorecardMeasurementReviewRecord[];
}

export interface BalancedScorecardMeasurementSnapshotTrace {
  id: number;
  sourceType: "metric_catalog" | "manual_actual" | "initiative_rollup" | "operational_signal";
  sourceKey: string;
  sourceLabel: string;
  dataQualityStatus: "healthy" | "warning" | "missing_data" | "stale_data" | "manual_override";
  recordCount: number | null;
  rawValue: number | null;
  normalizedValue: number | null;
  note: string | null;
  metadata: Record<string, unknown> | null;
}

export interface BalancedScorecardMeasurementSnapshotRecord {
  id: number;
  kpiId: number;
  kpiKey: string;
  kpiName: string;
  metricKey: string;
  goalKey: string;
  goalTitle: string;
  perspectiveKey: string;
  perspectiveName: string;
  trackingMode: string;
  frequency: string;
  unit: string;
  weight: number;
  firmTarget: string;
  targetValue: number | null;
  targetLabel: string | null;
  actualValue: number | null;
  actualLabel: string;
  weightedScore: number;
  status: WorkspaceStatusTone;
  statusLogic: string | null;
  updateFrequency: string | null;
  initiativeProgress: number;
  trend: number[];
  ownerName: string | null;
  ownerUpdate: string | null;
  snapshotStatus: "generated" | "frozen" | "stale";
  dataQualityStatus: "healthy" | "warning" | "missing_data" | "stale_data" | "manual_override";
  dataQualityNote: string | null;
  actualAsOf: string | null;
  measuredAt: string;
  traces: BalancedScorecardMeasurementSnapshotTrace[];
}

export interface BalancedScorecardContributionDetail {
  workflowId: number;
  profileId: number;
  contributionKey: string;
  title: string;
  initiative: string;
  kpiId: string;
  dueDate: string;
  progress: number;
  score: number;
  status: WorkspaceStatusTone;
  acknowledged: boolean;
  acknowledgedAt: string | null;
  managerComment: string;
  employeeComment: string | null;
  rollup: string;
  lastUpdatedAt: string | null;
  evidenceCount: number;
  reviewContextPath: string | null;
  updates: Array<{
    id: number;
    progress: number;
    comment: string | null;
    createdAt: string;
    createdByProfileId: number | null;
    createdByName: string | null;
  }>;
  evidence: Array<{
    id: number;
    fileName: string;
    filePath: string;
    mimeType: string | null;
    description: string | null;
    createdAt: string;
    uploadedBy: number | null;
    uploaderName: string | null;
  }>;
}

export interface BalancedScorecardMeasurementSnapshotPack {
  period: BalancedScorecardMeasurementPeriodSummary;
  snapshots: BalancedScorecardMeasurementSnapshotRecord[];
}

const buildQuery = (params: Record<string, string | number | undefined>) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  });
  const encoded = query.toString();
  return encoded ? `?${encoded}` : '';
};

export const performanceFrameworkAPI = {
  getBlueprint: () => api.get('/performance-framework/blueprint'),

  getCoverage: () => api.get<FrameworkCoverageSummary>('/performance-framework/coverage'),

  getMetrics: (filters?: {
    level?: PyramidLevel;
    perspective?: BscPerspective;
    owner?: string;
  }) => api.get<FrameworkMetricDefinition[]>(`/performance-framework/metrics${buildQuery(filters || {})}`),

  listModules: () =>
    api.get<{
      modules: Array<{
        module: DashboardModuleKey;
        label: string;
        strategicIntent: string;
        primaryRoleOwner: string;
        cadence: 'weekly' | 'monthly' | 'quarterly';
      }>;
      coverage: DashboardModuleCoverageSummary[];
    }>('/performance-framework/modules'),

  getModule: (module: DashboardModuleKey) =>
    api.get<DashboardModuleCoverage>(`/performance-framework/modules/${module}`),

  resolveModule: (params?: {
    profileId?: number;
    role?: string;
    positionTitle?: string;
  }) => api.get<ResolveModuleResponse>(`/performance-framework/resolve-module${buildQuery(params || {})}`),

  getDefaultScoring: (params?: {
    profileId?: number;
    role?: string;
    positionTitle?: string;
  }) =>
    api.get<{
      profileId: number | null;
      role: string | null;
      positionTitle: string | null;
      scoringConfig: Record<string, unknown>;
    }>(`/performance-framework/default-scoring${buildQuery(params || {})}`),

  getResolvedScoring: (params: {
    profileId?: number;
    evaluationCycleId?: number;
  }) =>
    api.get<{
      profileId: number;
      role: string | null;
      positionTitle: string | null;
      evaluationCycleId: number | null;
      definitionId: number | null;
      definitionCycleId: number | null;
      definitionDepartmentId: number | null;
      scoringConfig: Record<string, unknown>;
    }>(`/performance-framework/resolved-scoring${buildQuery(params || {})}`),

  getWorkspace: (params?: {
    role?: WorkspaceRole;
    profileId?: number;
    evaluationCycleId?: number;
  }) => api.get<BalancedScorecardWorkspace>(`/performance-framework/workspace${buildQuery(params || {})}`),

  getContributionDetail: (contributionKey: string, params?: { profileId?: number; evaluationCycleId?: number }) =>
    api.get<BalancedScorecardContributionDetail>(
      `/performance-framework/employee-contributions/${encodeURIComponent(contributionKey)}${buildQuery(params || {})}`
    ),

  acknowledgeContribution: (
    contributionKey: string,
    payload?: { profileId?: number; evaluationCycleId?: number }
  ) =>
    api.post<BalancedScorecardContributionDetail>(
      `/performance-framework/employee-contributions/${encodeURIComponent(contributionKey)}/acknowledge`,
      payload || {}
    ),

  updateContributionProgress: (
    contributionKey: string,
    payload: { profileId?: number; evaluationCycleId?: number; progress: number; comment?: string }
  ) =>
    api.post<BalancedScorecardContributionDetail>(
      `/performance-framework/employee-contributions/${encodeURIComponent(contributionKey)}/progress`,
      payload
    ),

  getScorecardGovernance: () =>
    api.get<BalancedScorecardGovernanceCycle[]>('/performance-framework/scorecard-governance'),

  createScorecardCycle: (payload: {
    name: string;
    cadence: "monthly" | "quarterly" | "annual";
    startDate: string;
    endDate: string;
  }) => api.post<BalancedScorecardGovernanceCycle>('/performance-framework/scorecard-cycles', payload),

  createScorecardVersion: (
    cycleId: number,
    payload?: {
      label?: string;
      sourceVersionId?: number | null;
    }
  ) =>
    api.post<BalancedScorecardGovernanceVersion>(
      `/performance-framework/scorecard-cycles/${cycleId}/versions`,
      payload || {}
    ),

  publishScorecardVersion: (versionId: number) =>
    api.post<BalancedScorecardGovernanceVersion>(
      `/performance-framework/scorecard-versions/${versionId}/publish`
    ),

  getMeasurementPeriods: (params?: { versionId?: number }) =>
    api.get<BalancedScorecardMeasurementPeriodSummary[]>(
      `/performance-framework/measurement-periods${buildQuery(params || {})}`
    ),

  createMeasurementPeriod: (payload: {
    versionId?: number;
    label?: string;
    periodStart: string;
    periodEnd: string;
  }) =>
    api.post<BalancedScorecardMeasurementPeriodSummary>(
      "/performance-framework/measurement-periods",
      payload
    ),

  generateMeasurementPeriod: (periodId: number, payload?: { comment?: string }) =>
    api.post<BalancedScorecardMeasurementPeriodSummary>(
      `/performance-framework/measurement-periods/${periodId}/generate`,
      payload || {}
    ),

  getMeasurementSnapshots: (periodId: number) =>
    api.get<BalancedScorecardMeasurementSnapshotPack>(
      `/performance-framework/measurement-periods/${periodId}/snapshots`
    ),

  submitMeasurementPeriod: (periodId: number, payload?: { comment?: string }) =>
    api.post<BalancedScorecardMeasurementPeriodSummary>(
      `/performance-framework/measurement-periods/${periodId}/submit`,
      payload || {}
    ),

  reviewMeasurementPeriod: (
    periodId: number,
    payload: { decision: "start_review" | "request_changes" | "approve"; comment?: string }
  ) =>
    api.post<BalancedScorecardMeasurementPeriodSummary>(
      `/performance-framework/measurement-periods/${periodId}/review`,
      payload
    ),

  closeMeasurementPeriod: (periodId: number, payload?: { comment?: string }) =>
    api.post<BalancedScorecardMeasurementPeriodSummary>(
      `/performance-framework/measurement-periods/${periodId}/close`,
      payload || {}
    ),

  getKpiAssignments: (params?: { scorecardVersionId?: number; profileId?: number }) =>
    api.get<BalancedScorecardKpiAssignmentRecord[]>(
      `/performance-framework/kpi-assignments${buildQuery(params || {})}`
    ),

  saveKpiAssignment: (payload: {
    kpiId: number;
    profileId: number;
    scorecardVersionId?: number;
    individualTarget?: number;
    individualWeight?: number;
  }) =>
    api.post<BalancedScorecardKpiAssignmentRecord>(
      "/performance-framework/kpi-assignments",
      payload
    ),

  deleteKpiAssignment: (assignmentId: number) =>
    api.delete<BalancedScorecardKpiAssignmentRecord>(
      `/performance-framework/kpi-assignments/${assignmentId}`
    ),

  getPerformanceBands: () =>
    api.get<PerformanceBandRecord[]>("/performance-framework/performance-bands"),

  savePerformanceBand: (payload: {
    roleId?: number | null;
    onTrackMin: number;
    atRiskMin: number;
    label?: string;
  }) =>
    api.post<PerformanceBandRecord>("/performance-framework/performance-bands", payload),

  getScorecardStructure: (params?: {
    versionId?: number;
  }) =>
    api.get<BalancedScorecardStructure>(
      `/performance-framework/scorecard-structure${buildQuery(params || {})}`
    ),

  getKpiTemplates: () =>
    api.get<BalancedScorecardMetricTemplate[]>('/performance-framework/kpi-templates'),

  bootstrapScorecardStructure: () =>
    api.post<BalancedScorecardStructure>('/performance-framework/scorecard-structure/bootstrap'),

  createPerspective: (payload: {
    name: string;
    ownerName?: string;
    summary?: string;
    versionId?: number;
  }) => api.post<BalancedScorecardPerspectiveRecord>('/performance-framework/perspectives', payload),

  updatePerspective: (
    perspectiveId: number,
    payload: {
      name: string;
      ownerName?: string;
      summary?: string;
    }
  ) => api.patch<BalancedScorecardPerspectiveRecord>(`/performance-framework/perspectives/${perspectiveId}`, payload),

  archivePerspective: (perspectiveId: number) =>
    api.delete<BalancedScorecardPerspectiveRecord>(`/performance-framework/perspectives/${perspectiveId}`),

  deletePerspective: (perspectiveId: number) =>
    api.delete<BalancedScorecardPerspectiveRecord>(
      `/performance-framework/perspectives/${perspectiveId}/hard-delete`
    ),

  createGoal: (payload: {
    perspectiveId: number;
    title: string;
    description?: string;
    ownerName?: string;
  }) => api.post<BalancedScorecardGoalRecord>('/performance-framework/goals', payload),

  updateGoal: (
    goalId: number,
    payload: { title: string; description?: string; ownerName?: string }
  ) => api.patch<BalancedScorecardGoalRecord>(`/performance-framework/goals/${goalId}`, payload),

  archiveGoal: (goalId: number) =>
    api.delete<BalancedScorecardGoalRecord>(`/performance-framework/goals/${goalId}`),

  createKpi: (payload: {
    goalId: number;
    trackingMode?: "template" | "manual";
    metricKey?: string;
    measurementType?: string;
    targetDirection?: string;
    targetValue?: number;
    currentActualValue?: number;
    lastMeasurementNote?: string;
    name: string;
    description?: string;
    formula?: string;
    frequency: string;
    unit: string;
    weight: number;
    firmTarget: string;
    ownerName?: string;
    ownerProfileId?: number | null;
    statusLogic?: string;
    updateFrequency?: string;
  }) => api.post<BalancedScorecardKpiRecord>('/performance-framework/kpis', payload),

  updateKpiActual: (
    kpiId: number,
    payload: {
      currentActualValue: number;
      lastMeasurementNote?: string;
    }
  ) => api.patch<BalancedScorecardKpiRecord>(`/performance-framework/kpis/${kpiId}/actual`, payload),

  createInitiative: (payload: {
    goalId: number;
    kpiId: number;
    parentInitiativeId?: number | null;
    scopeRole: string;
    title: string;
    summary?: string;
    ownerName?: string;
    ownerProfileId?: number | null;
    timeline?: string;
    dueDate?: string;
    status?: WorkspaceStatusTone;
    progress?: number;
  }) => api.post<BalancedScorecardInitiativeRecord>('/performance-framework/initiatives', payload),

  updateInitiative: (
    initiativeId: number,
    payload: {
      title?: string;
      summary?: string | null;
      ownerName?: string | null;
      ownerProfileId?: number | null;
      timeline?: string | null;
      dueDate?: string | null;
      status?: WorkspaceStatusTone;
      progress?: number;
      scopeRole?: string;
    }
  ) => api.patch<BalancedScorecardInitiativeRecord>(`/performance-framework/initiatives/${initiativeId}`, payload),

  archiveInitiative: (initiativeId: number) =>
    api.delete<{ count: number }>(`/performance-framework/initiatives/${initiativeId}`),

  getGoalWeightTotal: (goalId: number) =>
    api.get<{ goalId: number; totalWeight: number; kpiCount: number }>(
      `/performance-framework/goals/${goalId}/weight-summary`
    ),
};

export default performanceFrameworkAPI;
