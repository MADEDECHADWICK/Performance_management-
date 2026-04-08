import { api } from "./client";

export interface OnboardingPolicy {
  id: number;
  slug: string;
  title: string;
  summary: string | null;
  content: string | null;
  sectionKey: string;
  sectionLabel: string;
  orderIndex: number;
  requiresAcknowledgement: boolean;
  isActive: boolean;
  isPublished: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdByProfileId: number | null;
  updatedByProfileId: number | null;
  createdByName: string | null;
  updatedByName: string | null;
}

export interface OnboardingPoliciesListResponse {
  policies: OnboardingPolicy[];
}

export interface UpsertOnboardingPolicyInput {
  title: string;
  slug?: string;
  summary?: string | null;
  content?: string | null;
  sectionKey?: string;
  sectionLabel?: string;
  orderIndex?: number;
  requiresAcknowledgement?: boolean;
  isActive?: boolean;
  isPublished?: boolean;
}

const onboardingPoliciesAPI = {
  list: () => api.get<OnboardingPoliciesListResponse>("/onboarding-policies"),
  get: (policyId: number) => api.get<OnboardingPolicy>(`/onboarding-policies/${policyId}`),
  getBySlug: (slug: string) => api.get<OnboardingPolicy>(`/onboarding-policies/slug/${slug}`),
  create: (payload: UpsertOnboardingPolicyInput) =>
    api.post<OnboardingPolicy>("/onboarding-policies", payload),
  update: (policyId: number, payload: Partial<UpsertOnboardingPolicyInput>) =>
    api.patch<OnboardingPolicy>(`/onboarding-policies/${policyId}`, payload),
};

export default onboardingPoliciesAPI;
