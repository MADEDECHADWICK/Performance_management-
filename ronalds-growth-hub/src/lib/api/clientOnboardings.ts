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
};

export default clientOnboardingsAPI;
