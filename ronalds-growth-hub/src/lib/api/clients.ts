/**
 * Clients API - Client Management
 * CRITICAL: Clients must be created before Jobs
 */
import { api } from './client';
import type { Client, EngagementLetter, Job, PaginatedResponse } from './types';

export interface CreateClientPayload {
  clientName: string;
  clientCode?: string;
  industry?: string;
  contactPerson?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  location?: string;
  partnerProfileId?: number;
  managerProfileId?: number;
  departmentId?: number;
  status?: 'active' | 'inactive';
  engagementLetter?: {
    documentId: number;
    engagementType: string;
    jobTitle?: string;
    feeAmount: number;
    currency?: string;
    startDate?: string;
    endDate?: string;
    scopeDescription?: string;
    termsConditions?: string;
  };
}

export interface UpdateClientPayload extends Partial<CreateClientPayload> {
}

export interface ClientFilters {
  page?: number;
  pageSize?: number;
  status?: 'active' | 'inactive';
  industry?: string;
  partnerProfileId?: number;
  managerProfileId?: number;
  departmentId?: number;
  search?: string;
}

export const clientsAPI = {
  /**
   * List all clients with pagination and filters
   */
  list: async (filters?: ClientFilters): Promise<PaginatedResponse<Client>> => {
    const params = new URLSearchParams();
    if (filters?.page) params.append('page', String(filters.page));
    if (filters?.pageSize) params.append('pageSize', String(filters.pageSize));
    if (filters?.status) params.append('status', filters.status);
    if (filters?.industry) params.append('industry', filters.industry);
    if (filters?.partnerProfileId) params.append('partnerProfileId', String(filters.partnerProfileId));
    if (filters?.managerProfileId) params.append('managerProfileId', String(filters.managerProfileId));
    if (filters?.departmentId) params.append('departmentId', String(filters.departmentId));
    if (filters?.search) params.append('search', filters.search);
    
    const query = params.toString();
    return api.get(`/clients${query ? `?${query}` : ''}`);
  },

  /**
   * Get client by ID with related data
   */
  getById: async (id: number): Promise<Client> => {
    return api.get(`/clients/${id}`);
  },

  /**
   * Create a new client
   */
  create: async (data: CreateClientPayload): Promise<Client> => {
    return api.post('/clients', data);
  },

  /**
   * Update an existing client
   */
  update: async (id: number, data: UpdateClientPayload): Promise<Client> => {
    return api.patch(`/clients/${id}`, data);
  },

  /**
   * Delete a client
   */
  delete: async (id: number): Promise<void> => {
    return api.delete(`/clients/${id}`);
  },

  /**
   * Get client's jobs
   */
  getJobs: async (clientId: number): Promise<Job[]> => {
    return api.get(`/clients/${clientId}/jobs`);
  },

  /**
   * Get client's engagement letters
   */
  getEngagementLetters: async (clientId: number): Promise<EngagementLetter[]> => {
    return api.get(`/clients/${clientId}/engagement-letters`);
  },

  /**
   * Upload engagement letter for client
   */
  uploadEngagementLetter: async (clientId: number, data: {
    documentId: number;
    departmentId?: number;
    partnerProfileId?: number;
    managerProfileId?: number;
    jobTitle?: string;
    engagementType: string;
    startDate?: string;
    endDate?: string;
    feeAmount?: number;
    currency?: string;
    scopeDescription?: string;
    termsConditions?: string;
  }): Promise<EngagementLetter> => {
    return api.post(`/clients/${clientId}/engagement-letters`, data);
  },

  /**
   * Approve engagement letter
   */
  approveEngagementLetter: async (letterId: number): Promise<EngagementLetter> => {
    return api.post(`/clients/engagement-letters/${letterId}/approve`);
  },

  /**
   * Reject engagement letter
   */
  rejectEngagementLetter: async (letterId: number, reason?: string): Promise<EngagementLetter> => {
    return api.post(`/clients/engagement-letters/${letterId}/reject`, { reason });
  },
};

export default clientsAPI;
