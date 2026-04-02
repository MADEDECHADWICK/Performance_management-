import { api } from "./client";

export interface KnowledgeHubResource {
  id: number;
  title: string;
  summary: string | null;
  domain: string;
  resourceType: string;
  assetKind: string;
  submodules: string[];
  tags: string[];
  linkUrl: string | null;
  assetFileName: string | null;
  assetMimeType: string | null;
  content: string | null;
  allowDownload: boolean;
  isFeatured: boolean;
  isPublished: boolean;
  publishedAt: string | null;
  estimatedDurationMinutes: number | null;
  completionMode: "video_end" | "watch_percent" | "document_scroll" | "manual";
  completionThresholdPercent: number | null;
  minReadSeconds: number | null;
  pointsOnCompletion: number;
  createdByProfileId: number | null;
  updatedByProfileId: number | null;
  createdAt: string;
  updatedAt: string;
  createdByName: string | null;
  updatedByName: string | null;
}

export interface KnowledgeHubListResponse {
  resources: KnowledgeHubResource[];
  total: number;
  page: number;
  pageSize: number;
}

export interface KnowledgeHubModuleOption {
  key: string;
  label: string;
}

export interface KnowledgeHubMeta {
  domains: string[];
  resourceTypes: string[];
  assetKinds: string[];
  modules: KnowledgeHubModuleOption[];
}

export interface KnowledgeHubListParams {
  search?: string;
  domain?: string;
  resourceType?: string;
  moduleKey?: string;
  featured?: boolean;
  includeDrafts?: boolean;
  page?: number;
  pageSize?: number;
}

export interface UpsertKnowledgeHubResourceInput {
  title: string;
  summary?: string | null;
  domain: string;
  resourceType: string;
  assetKind?: string;
  submodules?: string[];
  tags?: string[];
  linkUrl?: string | null;
  content?: string | null;
  allowDownload?: boolean;
  isFeatured?: boolean;
  isPublished?: boolean;
  estimatedDurationMinutes?: number | null;
  completionMode?: KnowledgeHubResource["completionMode"];
  completionThresholdPercent?: number | null;
  minReadSeconds?: number | null;
  pointsOnCompletion?: number;
}

export interface KnowledgeHubProgress {
  id: number;
  resourceId: number;
  profileId: number;
  status: "not_started" | "in_progress" | "completed" | "skipped";
  startedAt: string | null;
  lastInteractedAt: string | null;
  timeSpentSeconds: number;
  scrollPercent: number;
  watchSeconds: number;
  watchPercent: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeHubPointEntry {
  id: number;
  eventType: string;
  sourceType: string;
  sourceId: number;
  points: number;
  awardedAt: string;
  metadata?: Record<string, unknown> | null;
}

export interface KnowledgeHubProgressResponse {
  resource: {
    id: number;
    pointsOnCompletion: number;
    completionMode: KnowledgeHubResource["completionMode"];
    completionThresholdPercent: number | null;
    minReadSeconds: number | null;
    quiz?: { id: number } | null;
  };
  progress: KnowledgeHubProgress | null;
  points: KnowledgeHubPointEntry[];
}

export interface KnowledgeHubQuizOption {
  id: number;
  label: string;
  displayOrder: number;
  isCorrect?: boolean;
}

export interface KnowledgeHubQuizQuestion {
  id: number;
  questionType: "single_choice" | "multiple_choice" | "true_false" | "short_text";
  prompt: string;
  displayOrder: number;
  required: boolean;
  explanation: string | null;
  options: KnowledgeHubQuizOption[];
}

export interface KnowledgeHubQuizAttemptSummary {
  id: number;
  attemptNo: number;
  score: number;
  status: "in_progress" | "submitted" | "passed" | "failed";
  submittedAt: string | null;
  passedAt: string | null;
}

export interface KnowledgeHubQuiz {
  id: number;
  resourceId: number;
  title: string;
  passMark: number;
  pointsOnPass: number;
  attemptLimit: number | null;
  isActive: boolean;
  questions: KnowledgeHubQuizQuestion[];
  attempts?: KnowledgeHubQuizAttemptSummary[];
}

export interface UpsertKnowledgeHubQuizInput {
  title: string;
  passMark: number;
  pointsOnPass?: number;
  attemptLimit?: number | null;
  isActive?: boolean;
  questions: Array<{
    questionType: KnowledgeHubQuizQuestion["questionType"];
    prompt: string;
    displayOrder?: number;
    required?: boolean;
    explanation?: string | null;
    options?: Array<{
      label: string;
      isCorrect?: boolean;
      displayOrder?: number;
    }>;
  }>;
}

export interface SubmitKnowledgeHubQuizAttemptInput {
  answers: Array<{
    questionId: number;
    optionIds?: number[];
    freeTextAnswer?: string | null;
  }>;
}

export interface KnowledgeHubPointsSummary {
  totalPoints: number;
  entries: KnowledgeHubPointEntry[];
}

const toQueryString = (params?: KnowledgeHubListParams) => {
  if (!params) return "";
  const search = new URLSearchParams();

  if (params.search) search.set("search", params.search);
  if (params.domain) search.set("domain", params.domain);
  if (params.resourceType) search.set("resourceType", params.resourceType);
  if (params.moduleKey) search.set("moduleKey", params.moduleKey);
  if (typeof params.featured === "boolean") search.set("featured", String(params.featured));
  if (typeof params.includeDrafts === "boolean") {
    search.set("includeDrafts", String(params.includeDrafts));
  }
  if (typeof params.page === "number") search.set("page", String(params.page));
  if (typeof params.pageSize === "number") search.set("pageSize", String(params.pageSize));

  const query = search.toString();
  return query ? `?${query}` : "";
};

const knowledgeHubAPI = {
  list: (params?: KnowledgeHubListParams) =>
    api.get<KnowledgeHubListResponse>(`/knowledge-hub${toQueryString(params)}`),

  meta: () => api.get<KnowledgeHubMeta>("/knowledge-hub/meta"),

  get: (resourceId: number) =>
    api.get<KnowledgeHubResource>(`/knowledge-hub/${resourceId}`),

  points: () => api.get<KnowledgeHubPointsSummary>("/knowledge-hub/points/me"),

  getProgress: (resourceId: number) =>
    api.get<KnowledgeHubProgressResponse>(`/knowledge-hub/${resourceId}/progress`),

  updateProgress: (
    resourceId: number,
    payload: {
      timeSpentSeconds?: number | null;
      scrollPercent?: number | null;
      watchSeconds?: number | null;
      watchPercent?: number | null;
      completed?: boolean;
    }
  ) => api.put(`/knowledge-hub/${resourceId}/progress`, payload),

  getQuiz: (resourceId: number) =>
    api.get<KnowledgeHubQuiz>(`/knowledge-hub/${resourceId}/quiz`),

  upsertQuiz: (resourceId: number, payload: UpsertKnowledgeHubQuizInput) =>
    api.put<KnowledgeHubQuiz>(`/knowledge-hub/${resourceId}/quiz`, payload),

  deleteQuiz: (resourceId: number) =>
    api.delete<{ success: boolean }>(`/knowledge-hub/${resourceId}/quiz`),

  submitQuizAttempt: (resourceId: number, payload: SubmitKnowledgeHubQuizAttemptInput) =>
    api.post(`/knowledge-hub/${resourceId}/quiz-attempts`, payload),

  create: (payload: UpsertKnowledgeHubResourceInput | FormData) =>
    api.post<KnowledgeHubResource>("/knowledge-hub", payload),

  update: (resourceId: number, payload: Partial<UpsertKnowledgeHubResourceInput> | FormData) =>
    api.patch<KnowledgeHubResource>(`/knowledge-hub/${resourceId}`, payload),

  remove: (resourceId: number) =>
    api.delete<{ success: boolean }>(`/knowledge-hub/${resourceId}`),
};

export default knowledgeHubAPI;
