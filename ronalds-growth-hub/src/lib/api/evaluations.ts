/**
 * Evaluations API - Performance Evaluation System
 * Supports 360-degree, ad-hoc, peer, upward, and manager evaluations
 */
import { api } from './client';
import type { 
  EvaluationCycle,
  EvaluationDefinition,
  EvaluationAssignment,
  PaginatedResponse,
  EvaluatorType,
  EvaluationDefinitionStatus,
  EvaluationAssignmentStatus
} from './types';

interface CreateEvaluationCyclePayload {
  name: string;
  description?: string;
  startDate: string;
  endDate: string;
}

interface CreateEvaluationDefinitionPayload {
  cycleId?: number;
  name: string;
  description?: string;
  evaluatorType: EvaluatorType;
  isAnonymous?: boolean;
  hideFromEvaluatee?: boolean;
  requireSignature?: boolean;
  excludeFromScoreComputation?: boolean;
  financialWeight?: number;
  nonFinancialWeight?: number;
  dueDate?: string;
  departmentId?: number;
}

interface CreateEvaluationAssignmentPayload {
  definitionId: number;
  evaluatorProfileId: number;
  evaluateeProfileId: number;
  dueDate?: string;
}

interface SubmitEvaluationPayload {
  overallScore: number;
  financialScore?: number;
  nonFinancialScore?: number;
  comments?: string;
  scores: Array<{
    criteriaId: number;
    score: number;
    comments?: string;
  }>;
}

export const evaluationsAPI = {
  // ==================
  // EVALUATION CYCLES
  // ==================

  /**
   * List evaluation cycles
   */
  getCycles: async (filters?: {
    status?: string;
    year?: number;
  }): Promise<EvaluationCycle[]> => {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.year) params.append('year', String(filters.year));
    
    const query = params.toString();
    return api.get(`/evaluation-cycles${query ? `?${query}` : ''}`);
  },

  /**
   * Get evaluation cycle by ID
   */
  getCycleById: async (id: number): Promise<EvaluationCycle> => {
    return api.get(`/evaluation-cycles/${id}`);
  },

  /**
   * Create evaluation cycle
   */
  createCycle: async (data: CreateEvaluationCyclePayload): Promise<EvaluationCycle> => {
    return api.post('/evaluation-cycles', data);
  },

  /**
   * Update evaluation cycle
   */
  updateCycle: async (id: number, data: Partial<CreateEvaluationCyclePayload & { status: string }>): Promise<EvaluationCycle> => {
    return api.put(`/evaluation-cycles/${id}`, data);
  },

  /**
   * Close evaluation cycle
   */
  closeCycle: async (id: number): Promise<EvaluationCycle> => {
    return api.post(`/evaluation-cycles/${id}/close`);
  },

  // ==================
  // EVALUATION DEFINITIONS
  // ==================

  /**
   * List evaluation definitions
   */
  getDefinitions: async (filters?: {
    cycleId?: number;
    evaluatorType?: EvaluatorType;
    status?: EvaluationDefinitionStatus;
    departmentId?: number;
  }): Promise<EvaluationDefinition[]> => {
    const params = new URLSearchParams();
    if (filters?.cycleId) params.append('cycleId', String(filters.cycleId));
    if (filters?.evaluatorType) params.append('evaluatorType', filters.evaluatorType);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.departmentId) params.append('departmentId', String(filters.departmentId));
    
    const query = params.toString();
    return api.get(`/evaluations${query ? `?${query}` : ''}`);
  },

  /**
   * Get evaluation definition by ID
   */
  getDefinitionById: async (id: number): Promise<EvaluationDefinition> => {
    return api.get(`/evaluations/${id}`);
  },

  /**
   * Create evaluation definition
   */
  createDefinition: async (data: CreateEvaluationDefinitionPayload): Promise<EvaluationDefinition> => {
    return api.post('/evaluations', data);
  },

  /**
   * Update evaluation definition
   */
  updateDefinition: async (id: number, data: Partial<CreateEvaluationDefinitionPayload & { status: EvaluationDefinitionStatus }>): Promise<EvaluationDefinition> => {
    return api.put(`/evaluations/${id}`, data);
  },

  /**
   * Publish evaluation definition
   */
  publishDefinition: async (id: number): Promise<EvaluationDefinition> => {
    return api.post(`/evaluations/${id}/publish`);
  },

  /**
   * Delete evaluation definition (draft only)
   */
  deleteDefinition: async (id: number): Promise<void> => {
    return api.delete(`/evaluations/${id}`);
  },

  // ==================
  // EVALUATION ASSIGNMENTS
  // ==================

  /**
   * List evaluation assignments
   */
  getAssignments: async (filters?: {
    definitionId?: number;
    evaluatorProfileId?: number;
    evaluateeProfileId?: number;
    status?: EvaluationAssignmentStatus;
  }): Promise<EvaluationAssignment[]> => {
    const params = new URLSearchParams();
    if (filters?.definitionId) params.append('definitionId', String(filters.definitionId));
    if (filters?.evaluatorProfileId) params.append('evaluatorProfileId', String(filters.evaluatorProfileId));
    if (filters?.evaluateeProfileId) params.append('evaluateeProfileId', String(filters.evaluateeProfileId));
    if (filters?.status) params.append('status', filters.status);
    
    const query = params.toString();
    return api.get(`/evaluation-assignments${query ? `?${query}` : ''}`);
  },

  /**
   * Get my pending evaluations (as evaluator)
   */
  getMyPendingEvaluations: async (): Promise<EvaluationAssignment[]> => {
    return api.get('/evaluation-assignments/my-pending');
  },

  /**
   * Get evaluations about me (as evaluatee)
   */
  getMyReceivedEvaluations: async (): Promise<EvaluationAssignment[]> => {
    return api.get('/evaluation-assignments/about-me');
  },

  /**
   * Get assignment by ID
   */
  getAssignmentById: async (id: number): Promise<EvaluationAssignment> => {
    return api.get(`/evaluation-assignments/${id}`);
  },

  /**
   * Create evaluation assignment
   */
  createAssignment: async (data: CreateEvaluationAssignmentPayload): Promise<EvaluationAssignment> => {
    return api.post('/evaluation-assignments', data);
  },

  /**
   * Create bulk assignments (for a team/department)
   */
  createBulkAssignments: async (data: {
    definitionId: number;
    assignments: Array<{
      evaluatorProfileId: number;
      evaluateeProfileId: number;
    }>;
  }): Promise<{ created: number; errors: string[] }> => {
    return api.post('/evaluation-assignments/bulk', data);
  },

  /**
   * Auto-assign evaluations based on org structure
   */
  autoAssign: async (definitionId: number, options?: {
    departmentId?: number;
    includePeers?: boolean;
    includeDirectReports?: boolean;
  }): Promise<{ created: number }> => {
    return api.post(`/evaluations/${definitionId}/auto-assign`, options);
  },

  /**
   * Submit evaluation
   */
  submitEvaluation: async (assignmentId: number, data: SubmitEvaluationPayload): Promise<EvaluationAssignment> => {
    return api.post(`/evaluation-assignments/${assignmentId}/submit`, data);
  },

  /**
   * Save evaluation draft
   */
  saveEvaluationDraft: async (assignmentId: number, data: Partial<SubmitEvaluationPayload>): Promise<EvaluationAssignment> => {
    return api.patch(`/evaluation-assignments/${assignmentId}/draft`, data);
  },

  /**
   * Cancel evaluation assignment
   */
  cancelAssignment: async (assignmentId: number, reason?: string): Promise<EvaluationAssignment> => {
    return api.post(`/evaluation-assignments/${assignmentId}/cancel`, { reason });
  },

  // ==================
  // SPECIFIC EVALUATION TYPES
  // ==================

  /**
   * Create 360-degree evaluation
   */
  create360Evaluation: async (evaluateeProfileId: number, data: {
    cycleId?: number;
    name: string;
    dueDate?: string;
    includeSelf?: boolean;
    includeManager?: boolean;
    includePeers?: boolean;
    includeDirectReports?: boolean;
    peerProfileIds?: number[];
  }): Promise<EvaluationDefinition> => {
    return api.post('/evaluations/360', { evaluateeProfileId, ...data });
  },

  /**
   * Create ad-hoc evaluation
   */
  createAdHocEvaluation: async (data: {
    evaluatorProfileId: number;
    evaluateeProfileId: number;
    name: string;
    description?: string;
    dueDate?: string;
  }): Promise<EvaluationAssignment> => {
    return api.post('/ad-hoc-evaluations', data);
  },

  /**
   * Get peer evaluation requests
   */
  getPeerEvaluationRequests: async (): Promise<EvaluationAssignment[]> => {
    return api.get('/peer-evaluations/requests');
  },

  /**
   * Get upward evaluations (for direct reports)
   */
  getUpwardEvaluations: async (): Promise<EvaluationAssignment[]> => {
    return api.get('/upward-evaluations');
  },

  // ==================
  // SCORES & RESULTS
  // ==================

  /**
   * Get employee evaluation scores
   */
  getEmployeeScores: async (employeeId: number, cycleId?: number): Promise<{
    overallScore: number;
    financialScore: number;
    nonFinancialScore: number;
    evaluationCount: number;
    byType: Record<EvaluatorType, { score: number; count: number }>;
  }> => {
    const query = cycleId ? `?cycleId=${cycleId}` : '';
    return api.get(`/employees/${employeeId}/evaluation-scores${query}`);
  },

  /**
   * Get department evaluation summary
   */
  getDepartmentSummary: async (departmentId: number, cycleId?: number): Promise<{
    averageScore: number;
    completionRate: number;
    employeeScores: Array<{
      employeeId: number;
      employeeName: string;
      overallScore: number;
    }>;
  }> => {
    const query = cycleId ? `?cycleId=${cycleId}` : '';
    return api.get(`/departments/${departmentId}/evaluation-summary${query}`);
  },

  /**
   * Get evaluation completion status
   */
  getCompletionStatus: async (cycleId: number): Promise<{
    total: number;
    completed: number;
    pending: number;
    overdue: number;
    completionRate: number;
  }> => {
    return api.get(`/evaluation-cycles/${cycleId}/completion-status`);
  },
};

export default evaluationsAPI;
