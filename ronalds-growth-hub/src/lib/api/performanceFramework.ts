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
};

export default performanceFrameworkAPI;
