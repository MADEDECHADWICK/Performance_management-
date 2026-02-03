import { api } from "./client";
import type { RecruitmentCandidate, RecruitmentStage } from "./types";

interface ListFilters {
  page?: number;
  pageSize?: number;
  stage?: RecruitmentStage;
  departmentId?: number;
  search?: string;
}

interface CreateCandidatePayload {
  fullName: string;
  email?: string | null;
  phoneNumber?: string | null;
  positionApplied: string;
  departmentId?: number | null;
  stage?: RecruitmentStage;
  notes?: string | null;
}

export const recruitmentCandidatesAPI = {
  list: async (filters?: ListFilters) => {
    const params = new URLSearchParams();
    if (filters?.page) params.append("page", String(filters.page));
    if (filters?.pageSize) params.append("pageSize", String(filters.pageSize));
    if (filters?.stage) params.append("stage", filters.stage);
    if (filters?.departmentId) params.append("departmentId", String(filters.departmentId));
    if (filters?.search) params.append("search", filters.search);
    const query = params.toString();
    return api.get(`/recruitment-candidates${query ? `?${query}` : ""}`);
  },

  getById: async (id: number): Promise<RecruitmentCandidate> => {
    return api.get(`/recruitment-candidates/${id}`);
  },

  create: async (payload: CreateCandidatePayload): Promise<RecruitmentCandidate> => {
    return api.post(`/recruitment-candidates`, payload);
  },

  update: async (id: number, payload: Partial<CreateCandidatePayload>): Promise<RecruitmentCandidate> => {
    return api.patch(`/recruitment-candidates/${id}`, payload);
  },

  updateStage: async (id: number, stage: RecruitmentStage): Promise<RecruitmentCandidate> => {
    return api.patch(`/recruitment-candidates/${id}/stage`, { stage });
  },

  attachOfferLetter: async (id: number, documentId: number): Promise<RecruitmentCandidate> => {
    return api.patch(`/recruitment-candidates/${id}/offer-letter`, { documentId });
  },

  createOnboardingCase: async (candidateId: number, data?: {
    hrOwnerProfileId?: number;
    startDate?: string;
    dueDate?: string;
    notes?: string;
  }) => {
    return api.post('/onboarding', { candidateId, ...data });
  },

  remove: async (id: number) => {
    return api.delete(`/recruitment-candidates/${id}`);
  },
};

export default recruitmentCandidatesAPI;
