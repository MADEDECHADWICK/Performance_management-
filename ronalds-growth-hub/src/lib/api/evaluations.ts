import { ApiError, api, getToken } from "./client";
import type { Department, Profile } from "./types";

const API_BASE_URL = `${import.meta.env.VITE_API_URL || "http://localhost:4000"}/api`;

export type EvaluationCycleType = "annual" | "mid_year" | "quarterly" | "probation";
export type EvaluationCycleStatus = "draft" | "active" | "closed";
export type EvaluationRelationship = "self" | "peer" | "manager" | "subordinate" | "client";
export type EvaluationAssignmentStatus = "pending" | "in_progress" | "submitted";
export type EvaluationQuestionCategory = "competency" | "behavior" | "culture";
export type FeedbackType = "praise" | "coaching" | "concern";
export type FeedbackVisibility = "self" | "manager" | "hr" | "all";
export type CheckInStatus = "scheduled" | "completed" | "missed";
export type EvaluationWorkflowType =
  | "self"
  | "manager"
  | "peer"
  | "direct_report"
  | "client"
  | "custom";

export interface EvaluationTemplateQuestion {
  id: number;
  text: string;
  category: EvaluationQuestionCategory;
  weight: number;
  order: number;
}

export interface EvaluationTemplate {
  id: number;
  name: string;
  description?: string | null;
  isDefault?: boolean;
  templateType?: string | null;
  questions: EvaluationTemplateQuestion[];
}

export interface EvaluationTemplateQuestionInput {
  text: string;
  category: EvaluationQuestionCategory;
  weight: number;
  order: number;
}

export interface EvaluationCycleSummary {
  id: number;
  title: string;
  description?: string | null;
  cycleType: EvaluationCycleType;
  startDate: string;
  endDate: string;
  status: EvaluationCycleStatus;
  department?: Department | null;
  totalAssignments: number;
  submittedAssignments: number;
  pendingAssignments: number;
  completionPercent: number;
  departmentProgress: Array<{
    departmentId: number | null;
    departmentName: string;
    total: number;
    submitted: number;
    completionPercent: number;
  }>;
  template?: EvaluationTemplate | null;
  definition?: {
    id: number;
    dueDate?: string | null;
    enableSelfEvaluation?: boolean;
	    enablePeerEvaluation?: boolean;
	    enableUpwardEvaluation?: boolean;
	    enableDownwardEvaluation?: boolean;
	    enableClientEvaluation?: boolean;
	    processAnonymously?: boolean;
    hideFromDashboard?: boolean;
    excludeFromScore?: boolean;
    requireEvaluatorSignature?: boolean;
    requireEvaluateeSignature?: boolean;
    enabledEvaluatorTypes?: EvaluationWorkflowType[];
    scoringConfig?: Record<string, unknown> | null;
  } | null;
  assignments?: EvaluationAssignment[];
}

export interface EvaluationAssignment {
  id: number;
  cycleId?: number | null;
  evaluateeId: number;
  evaluatorId: number;
  relationship: EvaluationRelationship | string;
  status: EvaluationAssignmentStatus | string;
  dueDate?: string | null;
  submittedAt?: string | null;
  evaluatee?: Partial<Profile> | null;
  evaluator?: Partial<Profile> | null;
  cycle?: {
    id: number;
    title: string;
    endDate?: string | null;
    status?: EvaluationCycleStatus | string;
  } | null;
  questionCount?: number;
  template?: EvaluationTemplate | null;
  responses?: Array<{
    questionId: number;
    score: number;
    comment?: string | null;
  }>;
  definition?: {
    id: number;
    dueDate?: string | null;
    processAnonymously?: boolean;
    hideFromDashboard?: boolean;
    excludeFromScore?: boolean;
    requireEvaluatorSignature?: boolean;
    requireEvaluateeSignature?: boolean;
    scoringConfig?: Record<string, unknown> | null;
  } | null;
  workflow?: {
    dueDate?: string | null;
    isOverdue?: boolean;
    cancelIfPastDue?: boolean;
    reminderCadence?: string | null;
  } | null;
  viewerContext?: {
    isEvaluator?: boolean;
    isEvaluatee?: boolean;
    canSubmit?: boolean;
    canAcknowledge?: boolean;
    canViewScoreReport?: boolean;
  } | null;
  anonymity?: {
    processAnonymously?: boolean;
    viewerSeesEvaluatorIdentity?: boolean;
    evaluatorLabel?: string | null;
  } | null;
  signatureStatus?: {
    evaluatorSigned?: boolean;
    evaluatorSignedAt?: string | null;
    evaluateeAcknowledged?: boolean;
    evaluateeAcknowledgedAt?: string | null;
  } | null;
  submissionSummary?: {
    evaluatorComment?: string | null;
    submittedAt?: string | null;
    evaluatorSigned?: boolean;
    evaluateeAcknowledged?: boolean;
  } | null;
  scoreReport?: CycleScoreReport | null;
}

export interface CycleScoreReport {
  cycleId: number;
  evaluateeId: number;
  overall: number;
  byCategory: Record<string, number>;
  ratingBand: string;
  peerVsManagerVariance: number;
  averageByRelationship: Record<string, number>;
  totalScore: number;
}

export interface FeedbackItem {
  id: number;
  giverId: number;
  receiverId: number;
  jobId?: number | null;
  feedbackType: FeedbackType | string;
  message: string;
  isPrivate: boolean;
  visibility: FeedbackVisibility | string;
  createdAt: string;
  giver?: Partial<Profile> | null;
}

export interface CheckInItem {
  id: number;
  managerId: number;
  employeeId: number;
  scheduledAt: string;
  completedAt?: string | null;
  notes?: string | null;
  actionItems: Array<{ title?: string; owner?: string; dueDate?: string; note?: string }>;
  status: CheckInStatus | string;
  manager?: Partial<Profile> | null;
  employee?: Partial<Profile> | null;
}

export interface EmployeeEvaluationDashboard {
  userId: number;
  pendingEvaluations: EvaluationAssignment[];
  recentFeedback: FeedbackItem[];
  upcomingCheckIns: CheckInItem[];
}

export interface CreateCyclePayload {
  title: string;
  description?: string;
  cycleType?: EvaluationCycleType;
  startDate: string;
  endDate: string;
  dueDate?: string;
  departmentId?: number;
  templateId?: number;
  questions?: Array<Record<string, unknown>>;
  enableSelfEvaluation?: boolean;
	  enablePeerEvaluation?: boolean;
	  enableUpwardEvaluation?: boolean;
	  enableDownwardEvaluation?: boolean;
	  enableClientEvaluation?: boolean;
	  processAnonymously?: boolean;
  hideFromDashboard?: boolean;
  excludeFromScore?: boolean;
  requireEvaluatorSignature?: boolean;
  requireEvaluateeSignature?: boolean;
  scoringConfig?: Record<string, unknown>;
}

export interface AssignEvaluatorsPayload {
  assignments: Array<{
    evaluateeId: number;
    evaluatorId: number;
    relationship: EvaluationRelationship;
    dueDate?: string;
  }>;
}

export interface SubmitEvaluationPayload {
  responses: Array<{
    questionId: number;
    score: number;
    comment?: string;
  }>;
  evaluatorComment?: string;
  evaluatorSigned?: boolean;
}

export interface CycleResultItem {
  performanceScoreId: number;
  evaluateeId: number;
  employee?: Partial<Profile> | null;
  overallScore: number;
  totalScore: number;
  ratingBand?: string | null;
  scoreBreakdown?: Record<string, unknown>;
  scoreReport?: CycleScoreReport | null;
  assignmentSummary?: {
    total: number;
    submitted: number;
    pending: number;
    completionPercent: number;
  };
  signatureStatus?: {
    evaluatorSignedCount: number;
    evaluateeAcknowledgedCount: number;
    requiredEvaluatorSignatures: number;
    requiredEvaluateeAcknowledgements: number;
  };
  commentHighlights?: Array<{
    id: string;
    questionText: string;
    relationship: string;
    evaluatorLabel: string;
    comment: string;
  }>;
}

export interface CycleResultsResponse extends EvaluationCycleSummary {
  ratingDistribution?: Record<string, number>;
  signatureSummary?: {
    evaluatorSignedCount: number;
    evaluateeAcknowledgedCount: number;
    requiredEvaluatorSignatures: number;
    requiredEvaluateeAcknowledgements: number;
  };
  results: CycleResultItem[];
}

export interface SubmitFeedbackPayload {
  receiverId: number;
  jobId?: number;
  feedbackType: FeedbackType;
  message: string;
  isPrivate?: boolean;
  visibility?: FeedbackVisibility;
}

export interface ScheduleCheckInPayload {
  managerId: number;
  employeeId: number;
  scheduledAt: string;
}

export interface CompleteCheckInPayload {
  notes?: string;
  actionItems?: Array<{
    title?: string;
    owner?: string;
    dueDate?: string;
    note?: string;
  }>;
}

export interface TeamDirectoryPerson {
  id: number;
  firstName: string;
  lastName: string;
  department?: Department | null;
  managerId?: number | null;
  positionTitle?: string | null;
}

export interface EvaluationResultAreaLibraryItem {
  id: string;
  name: string;
  description: string;
  category: EvaluationQuestionCategory;
  domain: string;
  roleFamily: string;
  evaluatorTypes: EvaluationWorkflowType[];
  weight: number;
  order: number;
}

export interface EvaluationResultAreaLibraryResponse {
  total: number;
  limit: number;
  offset: number;
  items: EvaluationResultAreaLibraryItem[];
  facets?: {
    domains?: string[];
    roleFamilies?: string[];
    categories?: EvaluationQuestionCategory[];
  };
}

type RawTemplateQuestionSection = {
  title?: string;
  category?: string;
  items?: Array<{
    id?: string | number;
    text?: string;
    label?: string;
    title?: string;
    category?: string;
    weight?: number | string;
  }>;
};

const inferTemplateQuestionCategory = (
  value: unknown,
  fallback: EvaluationQuestionCategory = "competency"
): EvaluationQuestionCategory => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  if (!normalized) return fallback;
  if (normalized.includes("culture") || normalized.includes("value")) return "culture";
  if (
    normalized.includes("behavior") ||
    normalized.includes("behaviour") ||
    normalized.includes("collaboration")
  ) {
    return "behavior";
  }
  return "competency";
};

const normalizeTemplateQuestions = (value: unknown): EvaluationTemplateQuestion[] => {
  if (!Array.isArray(value)) return [];

  const normalized: EvaluationTemplateQuestion[] = [];

  value.forEach((entry, sectionIndex) => {
    if (!entry || typeof entry !== "object") return;
    const section = entry as RawTemplateQuestionSection;
    const items = Array.isArray(section.items)
      ? section.items
      : [entry as RawTemplateQuestionSection["items"][number]];
    const sectionCategory = inferTemplateQuestionCategory(section.category || section.title);

    items.forEach((item) => {
      if (!item || typeof item !== "object") return;
      const text = String(item.text || item.label || item.title || "").trim();
      if (!text) return;
      normalized.push({
        id: normalized.length + 1,
        text,
        category: inferTemplateQuestionCategory(item.category, sectionCategory),
        weight: Number(item.weight) > 0 ? Number(item.weight) : 1,
        order: normalized.length + 1 + sectionIndex * 1000,
      });
    });
  });

  return normalized.map((question, index) => ({
    ...question,
    id: index + 1,
    order: index + 1,
  }));
};

const normalizeTemplate = (template: any): EvaluationTemplate => ({
  id: Number(template.id),
  name: String(template.name || "Untitled template"),
  description: template.description || null,
  isDefault: Boolean(template.isDefault),
  templateType: template.templateType || null,
  questions: normalizeTemplateQuestions(template.questions),
});

const buildQuery = (params?: Record<string, unknown>) => {
  if (!params) return "";
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    query.set(key, String(value));
  });
  const suffix = query.toString();
  return suffix ? `?${suffix}` : "";
};

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const evaluationsAPI = {
	  getTemplates: async (): Promise<EvaluationTemplate[]> => {
	    const templates = await api.get<any[]>("/evaluation-templates?isActive=true");
	    return templates.map(normalizeTemplate);
	  },

  getResultAreaLibrary: async (params?: {
    search?: string;
    category?: EvaluationQuestionCategory;
    domain?: string;
    roleFamily?: string;
    limit?: number;
    offset?: number;
  }): Promise<EvaluationResultAreaLibraryResponse> =>
    api.get(`/evaluation-templates/result-area-library${buildQuery(params)}`),

  importResultAreaTemplate: async (data: {
    name: string;
    description?: string;
    templateType?: string;
    bscCategory?: string;
    questions: EvaluationTemplateQuestionInput[];
  }): Promise<EvaluationTemplate> => {
    const template = await api.post<any>("/evaluation-templates/import", data);
    return normalizeTemplate(template);
  },

  downloadResultAreaLibraryCsv: async (): Promise<void> => {
    const token = getToken();
    const response = await fetch(`${API_BASE_URL}/evaluation-templates/result-area-library/export.csv`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) {
      throw new ApiError(`HTTP ${response.status}`, response.status);
    }
    const blob = await response.blob();
    downloadBlob(blob, "evaluation-result-area-library.csv");
  },

  getMyCycles: async (): Promise<EvaluationCycleSummary[]> =>
    api.get("/evaluations/cycles"),

  getCycleById: async (id: number): Promise<EvaluationCycleSummary> =>
    api.get(`/evaluations/cycles/${id}`),

  createCycle: async (data: CreateCyclePayload): Promise<EvaluationCycleSummary> =>
    api.post("/evaluations/cycles", data),

	  assignEvaluators: async (
    cycleId: number,
    data: AssignEvaluatorsPayload
	  ): Promise<{ cycleId: number; count: number; assignments: EvaluationAssignment[] }> =>
	    api.post(`/evaluations/cycles/${cycleId}/assign`, data),

  closeCycle: async (cycleId: number): Promise<unknown> =>
    api.patch(`/evaluation-cycles/${cycleId}`, { status: "closed" }),

  getMyAssignments: async (): Promise<EvaluationAssignment[]> =>
    api.get("/evaluations/assignments/mine"),

  getAssignmentById: async (assignmentId: number): Promise<EvaluationAssignment> =>
    api.get(`/evaluations/assignments/${assignmentId}`),

  submitEvaluation: async (
    assignmentId: number,
    data: SubmitEvaluationPayload
  ): Promise<EvaluationAssignment> =>
    api.post(`/evaluations/assignments/${assignmentId}/submit`, data),

  acknowledgeEvaluation: async (assignmentId: number): Promise<EvaluationAssignment> =>
    api.patch(`/evaluations/assignments/${assignmentId}/acknowledge`),

  getEmployeeDashboard: async (userId: number): Promise<EmployeeEvaluationDashboard> =>
    api.get(`/evaluations/dashboard/${userId}`),

  submitFeedback: async (data: SubmitFeedbackPayload): Promise<FeedbackItem> =>
    api.post("/feedback", data),

  getReceivedFeedback: async (userId: number): Promise<FeedbackItem[]> =>
    api.get(`/feedback/received/${userId}`),

  scheduleCheckIn: async (data: ScheduleCheckInPayload): Promise<CheckInItem> =>
    api.post("/checkins", data),

  completeCheckIn: async (
    checkInId: number,
    data: CompleteCheckInPayload
  ): Promise<CheckInItem> =>
    api.patch(`/checkins/${checkInId}/complete`, data),

  getTeamCheckIns: async (managerId: number): Promise<CheckInItem[]> =>
    api.get(`/checkins/team/${managerId}`),

  getCycleResults: async (cycleId: number): Promise<CycleResultsResponse> =>
    api.get(`/evaluations/cycles/${cycleId}/results`),

  getAssignableEmployees: async (): Promise<TeamDirectoryPerson[]> => {
    const response = await api.get<{ employees: TeamDirectoryPerson[]; departments: Department[] }>(
      "/evaluations/directory"
    );
    return response.employees || [];
  },

  getDepartments: async (): Promise<Department[]> => {
    const response = await api.get<{ employees: TeamDirectoryPerson[]; departments: Department[] }>(
      "/evaluations/directory"
    );
    return response.departments || [];
  },
};

export default evaluationsAPI;
