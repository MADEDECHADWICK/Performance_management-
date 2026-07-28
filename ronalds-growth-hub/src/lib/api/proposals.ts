/**
 * Proposals API - Business development workflow
 */
import { api } from './client';

export type ProposalStatus =
  | 'draft'
  | 'sent'
  | 'submitted_to_manager'
  | 'manager_changes_requested'
  | 'manager_rejected'
  | 'manager_approved'
  | 'assigned_to_bd'
  | 'bd_in_progress'
  | 'bd_changes_requested'
  | 'ready_for_client_submission'
  | 'submitted_to_client'
  | 'won'
  | 'lost'
  | 'cancelled';

export type ProposalTeamMemberStatus =
  | 'pending_manager_approval'
  | 'approved'
  | 'rejected'
  | 'removed';

export interface ProposalPerson {
  id: number;
  firstName: string;
  lastName: string;
  positionTitle?: string | null;
  departmentId?: number | null;
}

export interface ProposalTeamMember {
  id: number;
  proposalId: number;
  profileId: number;
  status: ProposalTeamMemberStatus;
  roleOnProposal?: string | null;
  approvedAt?: string | null;
  rejectionReason?: string | null;
  profile?: ProposalPerson;
  approvedBy?: ProposalPerson | null;
}

export interface Proposal {
  id: number;
  clientId: number | null;
  clientName: string | null;
  proposalTitle: string;
  serviceType: string;
  requestedService?: string | null;
  proposalType?: string | null;
  proposedFee: number;
  currency: string;
  proposalDate: string;
  expectedStart?: string | null;
  expectedDurationDays?: number | null;
  deadlineDate?: string | null;
  dateAssigned?: string | null;
  employeeSubmissionDate?: string | null;
  finalSubmittedAt?: string | null;
  status: ProposalStatus;
  probability: number;
  notes?: string | null;
  lostReason?: string | null;
  sourceName?: string | null;
  reviewerName?: string | null;
  employeeDraftLink?: string | null;
  bdFinalProposalLink?: string | null;
  finalSubmissionStatus?: string | null;
  awardStatus?: string | null;
  clientFeedback?: string | null;
  managerDecisionNote?: string | null;
  timeTakenHours?: number | null;
  client?: { id: number; clientName: string; industry?: string | null } | null;
  department?: { id: number; name: string; departmentCode?: string | null } | null;
  assignedPartner?: ProposalPerson | null;
  manager?: ProposalPerson | null;
  createdBy?: ProposalPerson | null;
  sourceProfile?: ProposalPerson | null;
  reviewerProfile?: ProposalPerson | null;
  bdOwner?: ProposalPerson | null;
  createdByProfileId?: number | null;
  assignedPartnerProfileId?: number | null;
  managerProfileId?: number | null;
  departmentId?: number | null;
  teamMembers?: ProposalTeamMember[];
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
}

export interface ProposalContext {
  clients: { id: number; clientName: string; industry?: string | null }[];
  departments: {
    id: number;
    name: string;
    departmentCode?: string | null;
    departmentHeadId?: number | null;
    partnerProfileId?: number | null;
  }[];
  profiles: (ProposalPerson & {
    managerId?: number | null;
    isPartner?: boolean;
    user?: { email?: string | null; roles?: { role: { name: string } }[] } | null;
  })[];
}

interface ProposalFilters {
  page?: number;
  pageSize?: number;
  status?: string;
  clientId?: number;
  search?: string;
}

export interface CreateProposalPayload {
  clientId?: number | null;
  clientName?: string;
  proposalTitle: string;
  serviceType?: string;
  requestedService?: string;
  proposalType?: string;
  proposedFee?: number;
  value?: number;
  currency?: string;
  proposalDate?: string;
  expectedStart?: string;
  expectedDurationDays?: number;
  deadlineDate?: string;
  dateAssigned?: string;
  employeeSubmissionDate?: string;
  probability?: number;
  status?: ProposalStatus;
  submitToManager?: boolean;
  notes?: string;
  sourceName?: string;
  reviewerName?: string;
  employeeDraftLink?: string;
  assignedPartnerProfileId?: number | null;
  managerProfileId?: number | null;
  departmentId?: number | null;
  sourceProfileId?: number | null;
  reviewerProfileId?: number | null;
  bdOwnerProfileId?: number | null;
  teamMemberProfileIds?: number[];
}

export interface UpdateProposalPayload extends Partial<CreateProposalPayload> {
  finalSubmittedAt?: string;
  bdFinalProposalLink?: string;
  finalSubmissionStatus?: string;
  awardStatus?: string;
  clientFeedback?: string;
  managerDecisionNote?: string;
  lostReason?: string;
  timeTakenHours?: number;
}

export interface MyProposalFilters {
  page?: number;
  pageSize?: number;
  status?: string;
  search?: string;
}

const buildQuery = (filters?: object) => {
  const params = new URLSearchParams();
  Object.entries((filters || {}) as Record<string, string | number | undefined>).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.append(key, String(value));
  });
  const query = params.toString();
  return query ? `?${query}` : '';
};

export const proposalsAPI = {
  listMine: async (
    filters?: MyProposalFilters
  ): Promise<{ data: Proposal[]; total: number; page: number; pageSize: number }> =>
    api.get(`/proposals/my${buildQuery(filters)}`),

  list: async (
    filters?: ProposalFilters
  ): Promise<{ data: Proposal[]; total: number; page: number; pageSize: number }> =>
    api.get(`/proposals${buildQuery(filters)}`),

  context: async (): Promise<ProposalContext> => api.get('/proposals/context'),

  timeLoggable: async () => api.get('/proposals/time-loggable'),

  taskTemplates: async () => api.get('/proposals/task-templates'),

  getById: async (id: number): Promise<Proposal> => api.get(`/proposals/${id}`),

  create: async (data: CreateProposalPayload) =>
    api.post<Proposal | { data?: Proposal }>('/proposals', data),

  update: async (id: number, data: UpdateProposalPayload) =>
    api.patch<Proposal | { data?: Proposal }>(`/proposals/${id}`, data),

  managerDecision: async (
    id: number,
    data: {
      decision: 'approve' | 'reject' | 'changes_requested';
      note?: string;
      approvedTeamMemberIds?: number[];
      rejectedTeamMemberIds?: number[];
    }
  ) => api.post<Proposal | { data?: Proposal }>(`/proposals/${id}/manager-decision`, data),

  updateTeamMember: async (
    proposalId: number,
    teamMemberId: number,
    data: { status: ProposalTeamMemberStatus; rejectionReason?: string }
  ) => api.patch(`/proposals/${proposalId}/team-members/${teamMemberId}`, data),

  updateBd: async (id: number, data: UpdateProposalPayload) =>
    api.patch<Proposal | { data?: Proposal }>(`/proposals/${id}/bd`, data),

  metrics: async (params?: { startDate?: string; endDate?: string }): Promise<ProposalMetrics> =>
    api.get(`/proposals/metrics${buildQuery(params)}`),
};

export default proposalsAPI;
