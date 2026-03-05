/**
 * Client Onboardings API - Marketing intake + HR queue
 */
import { api } from './client';
import type { ClientOnboarding, PaginatedResponse } from './types';

interface ClientOnboardingFilters {
  page?: number;
  pageSize?: number;
  status?: string;
  clientId?: number;
  engagementLetterId?: number;
  departmentId?: number;
}

interface CreateClientOnboardingPayload {
  engagementLetterId: number;
  clientName?: string;
  industry?: string;
  contactPerson?: string;
  contactEmail?: string;
  contactPhone?: string;
  location?: string;
  departmentId?: number;
  notes?: string;
  clientId?: number;
}

export interface ClientOnboardingChecklistItem {
  id: number;
  checklistId: number;
  itemName: string;
  description?: string;
  orderIndex: number;
  isCompleted: boolean;
  requiresDocument: boolean;
  documentId?: number | null;
  completedAt?: string | null;
  document?: {
    id: number;
    fileName?: string | null;
    filePath?: string | null;
  } | null;
}

export interface ClientOnboardingChecklist {
  id: number;
  clientOnboardingId: number;
  checklistName: string;
  status: 'pending' | 'in_progress' | 'completed';
  totalItems: number;
  completedItems: number;
  completionPercent: number;
  dueDate?: string | null;
  completedAt?: string | null;
  assignedByProfileId?: number | null;
  items?: ClientOnboardingChecklistItem[];
}

interface UpsertClientOnboardingChecklistPayload {
  checklistName?: string;
  dueDate?: string;
  items: Array<{
    itemName: string;
    description?: string;
    orderIndex?: number;
    requiresDocument?: boolean;
  }>;
}

export const clientOnboardingsAPI = {
  /**
   * List onboarding submissions
   */
  list: async (filters?: ClientOnboardingFilters): Promise<PaginatedResponse<ClientOnboarding>> => {
    const params = new URLSearchParams();
    if (filters?.page) params.append('page', String(filters.page));
    if (filters?.pageSize) params.append('pageSize', String(filters.pageSize));
    if (filters?.status) params.append('status', filters.status);
    if (filters?.clientId) params.append('clientId', String(filters.clientId));
    if (filters?.engagementLetterId) params.append('engagementLetterId', String(filters.engagementLetterId));
    if (filters?.departmentId) params.append('departmentId', String(filters.departmentId));

    const query = params.toString();
    return api.get(`/client-onboardings${query ? `?${query}` : ''}`);
  },

  /**
   * Upcoming jobs queue (approved onboarding + approved engagement letter, no job yet)
   */
  getUpcomingJobs: async (filters?: Pick<ClientOnboardingFilters, 'page' | 'pageSize'>): Promise<PaginatedResponse<ClientOnboarding>> => {
    const params = new URLSearchParams();
    if (filters?.page) params.append('page', String(filters.page));
    if (filters?.pageSize) params.append('pageSize', String(filters.pageSize));
    const query = params.toString();
    return api.get(`/client-onboardings/upcoming-jobs${query ? `?${query}` : ''}`);
  },

  /**
   * Get onboarding record by id
   */
  getById: async (id: number): Promise<ClientOnboarding> => {
    return api.get(`/client-onboardings/${id}`);
  },

  /**
   * Create onboarding record (marketing submission)
   */
  create: async (data: CreateClientOnboardingPayload): Promise<ClientOnboarding> => {
    return api.post('/client-onboardings', data);
  },

  /**
   * Approve onboarding (HR)
   */
  approve: async (id: number): Promise<ClientOnboarding> => {
    return api.post(`/client-onboardings/${id}/approve`);
  },

  /**
   * Reject onboarding (HR)
   */
  reject: async (id: number, reason?: string): Promise<ClientOnboarding> => {
    return api.post(`/client-onboardings/${id}/reject`, { reason });
  },

  /**
   * Get checklist assigned to a client onboarding record
   */
  getChecklist: async (id: number): Promise<ClientOnboardingChecklist | null> => {
    return api.get(`/client-onboardings/${id}/checklist`);
  },

  /**
   * Create or replace checklist for a client onboarding record (HR/Admin)
   */
  upsertChecklist: async (
    id: number,
    data: UpsertClientOnboardingChecklistPayload
  ): Promise<ClientOnboardingChecklist> => {
    return api.post(`/client-onboardings/${id}/checklist`, data);
  },

  /**
   * Mark a checklist item complete
   */
  completeChecklistItem: async (
    id: number,
    itemId: number
  ): Promise<ClientOnboardingChecklist> => {
    return api.patch(`/client-onboardings/${id}/checklist/items/${itemId}/complete`);
  },

  /**
   * Attach uploaded document to checklist item
   */
  attachChecklistItemDocument: async (
    id: number,
    itemId: number,
    documentId: number
  ): Promise<ClientOnboardingChecklist> => {
    return api.patch(`/client-onboardings/${id}/checklist/items/${itemId}/document`, {
      documentId,
    });
  },
};

export default clientOnboardingsAPI;
