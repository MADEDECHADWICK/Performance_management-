/**
 * Proposals API - Marketing pipeline
 */
import { api } from './client';

export interface Proposal {
  id: number;
  clientId: number;
  proposalTitle: string;
  serviceType: string;
  proposedFee: number;
  currency: string;
  proposalDate: string;
  expectedStart?: string | null;
  expectedDurationDays?: number | null;
  status: 'draft' | 'sent' | 'won' | 'lost';
  probability: number;
  notes?: string | null;
  client?: { id: number; clientName: string; industry?: string | null };
  assignedPartner?: { id: number; firstName: string; lastName: string } | null;
}

export interface ProposalMetrics {
  totalOpportunities: number;
  pipelineValue: number;
  weightedPipelineValue: number;
  avgDealSize: number;
  conversionRate: number;
  wonThisMonth: number;
  lostThisMonth: number;
  hotLeads: number;
  pipelineTrend?: {
    month: string;
    won: number;
    lost: number;
    created: number;
  }[];
}

interface ProposalFilters {
  page?: number;
  pageSize?: number;
  status?: string;
  clientId?: number;
  search?: string;
}

export const proposalsAPI = {
  list: async (filters?: ProposalFilters) => {
    const params = new URLSearchParams();
    if (filters?.page) params.append('page', String(filters.page));
    if (filters?.pageSize) params.append('pageSize', String(filters.pageSize));
    if (filters?.status) params.append('status', filters.status);
    if (filters?.clientId) params.append('clientId', String(filters.clientId));
    if (filters?.search) params.append('search', filters.search);
    const query = params.toString();
    return api.get(`/proposals${query ? `?${query}` : ''}`);
  },

  getById: async (id: number) => {
    return api.get(`/proposals/${id}`);
  },

  create: async (data: any) => {
    return api.post('/proposals', data);
  },

  update: async (id: number, data: any) => {
    return api.patch(`/proposals/${id}`, data);
  },

  metrics: async (): Promise<ProposalMetrics> => {
    return api.get('/proposals/metrics');
  },
};

export default proposalsAPI;
