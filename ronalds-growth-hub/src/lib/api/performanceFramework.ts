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
  timeline: string | null;
  dueDate: string | null;
  status: WorkspaceStatusTone;
  progress: number;
  sortOrder: number;
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

  getScorecardStructure: () =>
    api.get<BalancedScorecardStructure>('/performance-framework/scorecard-structure'),

  getKpiTemplates: () =>
    api.get<BalancedScorecardMetricTemplate[]>('/performance-framework/kpi-templates'),

  bootstrapScorecardStructure: () =>
    api.post<BalancedScorecardStructure>('/performance-framework/scorecard-structure/bootstrap'),

  createPerspective: (payload: {
    name: string;
    ownerName?: string;
    summary?: string;
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

  createGoal: (payload: {
    perspectiveId: number;
    title: string;
    description?: string;
    ownerName?: string;
  }) => api.post<BalancedScorecardGoalRecord>('/performance-framework/goals', payload),

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
    statusLogic?: string;
    updateFrequency?: string;
  }) => api.post<BalancedScorecardKpiRecord>('/performance-framework/kpis', payload),

  createInitiative: (payload: {
    goalId: number;
    kpiId: number;
    parentInitiativeId?: number | null;
    scopeRole: string;
    title: string;
    summary?: string;
    ownerName?: string;
    timeline?: string;
    dueDate?: string;
    status?: WorkspaceStatusTone;
    progress?: number;
  }) => api.post<BalancedScorecardInitiativeRecord>('/performance-framework/initiatives', payload),
};

export default performanceFrameworkAPI;
