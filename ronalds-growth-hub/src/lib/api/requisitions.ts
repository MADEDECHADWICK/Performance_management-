import { api } from "./client";

export type RequisitionStatus =
  | "pending_manager_approval"
  | "pending_partner_approval"
  | "pending_gmp_approval"
  | "pending_finance_approval"
  | "approved"
  | "declined"
  | "cancelled";

export type RequisitionApprovalDecision = "pending" | "approved" | "declined" | "skipped";
export type RequisitionApprovalStageType = "manager" | "partner" | "gmp" | "finance";
export type RequisitionAccountabilityStatus = "not_released" | "pending" | "submitted";
export type RequisitionFieldType = "text" | "textarea" | "number" | "date" | "boolean" | "select";

type MoneyValue = number | string;

export interface RequisitionFieldSchemaOption {
  label: string;
  value: string;
}

export interface RequisitionFieldSchemaItem {
  key: string;
  label: string;
  type: RequisitionFieldType;
  required?: boolean;
  helpText?: string;
  placeholder?: string;
  options?: RequisitionFieldSchemaOption[];
}

export interface RequisitionType {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  sourceModule: string;
  isActive: boolean;
  requiresJob: boolean;
  requiresClient: boolean;
  requiresVendor: boolean;
  requiresDueDate: boolean;
  requiresAttachment: boolean;
  fieldSchema?: RequisitionFieldSchemaItem[] | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface RequisitionJobOption {
  id: number;
  jobName: string;
  jobCode?: string | null;
  status: string;
  clientId?: number | null;
  client?: {
    id: number;
    clientName: string;
    clientCode?: string | null;
  } | null;
}

export interface RequisitionApprovalStep {
  id: number;
  requisitionRequestId: number;
  stepNumber: number;
  stageType: RequisitionApprovalStageType;
  approverProfileId: number;
  decision: RequisitionApprovalDecision;
  notes?: string | null;
  actedAt?: string | null;
  approver?: {
    id: number;
    firstName: string;
    lastName: string;
  } | null;
}

export interface RequisitionAmountBreakdownItem {
  label: string;
  amount: number;
  notes?: string;
}

export interface RequisitionRequest {
  id: number;
  requisitionNumber: string;
  requisitionTypeId: number;
  requesterProfileId: number;
  requesterDepartmentId?: number | null;
  currentApproverProfileId?: number | null;
  sourceModule: string;
  status: RequisitionStatus;
  title: string;
  justification?: string | null;
  amount: MoneyValue;
  amountBreakdown?: RequisitionAmountBreakdownItem[] | null;
  currency: string;
  quantity?: MoneyValue | null;
  neededByDate?: string | null;
  vendorName?: string | null;
  clientId?: number | null;
  jobId?: number | null;
  isClientRecoverable: boolean;
  taxImpactNotes?: string | null;
  moduleData?: Record<string, unknown> | null;
  approvalRouteSnapshot?: {
    requesterRoles?: string[];
    steps?: Array<{
      stepNumber: number;
      stageType: RequisitionApprovalStageType;
      approverProfileId: number;
      approverName?: string;
    }>;
  } | null;
  declineReason?: string | null;
  cancellationReason?: string | null;
  releasedAt?: string | null;
  releasedByProfileId?: number | null;
  releaseNotes?: string | null;
  accountabilityDueAt?: string | null;
  accountabilityStatus?: RequisitionAccountabilityStatus;
  accountabilitySubmittedAt?: string | null;
  accountabilitySubmittedByProfileId?: number | null;
  accountabilityNotes?: string | null;
  submittedAt: string;
  approvedAt?: string | null;
  declinedAt?: string | null;
  cancelledAt?: string | null;
  requisitionType?: Pick<RequisitionType, "id" | "code" | "name" | "sourceModule" | "requiresAttachment">;
  requester?: {
    id: number;
    firstName: string;
    lastName: string;
    department?: {
      id: number;
      name: string;
    } | null;
  };
  requesterDepartment?: {
    id: number;
    name: string;
  } | null;
  currentApprover?: {
    id: number;
    firstName: string;
    lastName: string;
  } | null;
  releasedBy?: {
    id: number;
    firstName: string;
    lastName: string;
  } | null;
  accountabilitySubmittedBy?: {
    id: number;
    firstName: string;
    lastName: string;
  } | null;
  client?: {
    id: number;
    clientName: string;
    clientCode?: string | null;
  } | null;
  job?: {
    id: number;
    jobName: string;
  } | null;
  approvalSteps?: RequisitionApprovalStep[];
  attachmentCount?: number;
  attachments?: Array<{
    id: number;
    fileName: string;
    documentType: string;
    createdAt: string;
  }>;
}

export interface RequisitionReportSummary {
  totalRequests: number;
  pendingCount: number;
  approvedCount: number;
  declinedCount: number;
  cancelledCount: number;
  byModule: Array<{ module: string; count: number }>;
  byType: Array<{ typeName: string; count: number }>;
  pendingByStage: Array<{ stage: string; count: number }>;
  recentRequests: Array<RequisitionRequest & { requesterName: string }>;
}

export interface RequisitionFinanceTracker {
  unreleased: RequisitionRequest[];
  pending: RequisitionRequest[];
  completed: RequisitionRequest[];
  counts: {
    unreleasedCount: number;
    pendingCount: number;
    overdueCount: number;
    completedCount: number;
    pendingValue: number;
    completedValue: number;
  };
}

export interface PaginatedList<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export interface CreateRequisitionTypeData {
  code: string;
  name: string;
  description?: string;
  sourceModule: string;
  isActive?: boolean;
  requiresJob?: boolean;
  requiresClient?: boolean;
  requiresVendor?: boolean;
  requiresDueDate?: boolean;
  requiresAttachment?: boolean;
  fieldSchema?: RequisitionFieldSchemaItem[] | null;
}

export interface CreateRequisitionRequestData {
  requisitionTypeId: number;
  title: string;
  justification?: string;
  amount: number;
  amountBreakdown?: RequisitionAmountBreakdownItem[] | null;
  currency?: string;
  quantity?: number | null;
  neededByDate?: string | null;
  vendorName?: string;
  clientId?: number | null;
  jobId?: number | null;
  isClientRecoverable?: boolean;
  taxImpactNotes?: string;
  moduleData?: Record<string, unknown> | null;
  attachmentDocumentIds?: number[];
}

export interface UpdateFinanceStageRequisitionData {
  title?: string;
  justification?: string;
  amount?: number;
  amountBreakdown?: RequisitionAmountBreakdownItem[] | null;
  currency?: string;
  quantity?: number | null;
  neededByDate?: string | null;
  vendorName?: string;
  isClientRecoverable?: boolean;
  taxImpactNotes?: string;
  moduleData?: Record<string, unknown> | null;
}

export interface ReleaseRequisitionFundsData {
  notes?: string;
  releasedAt?: string | null;
}

export interface SubmitRequisitionAccountabilityData {
  notes?: string;
  attachmentDocumentIds?: number[];
}

const toQueryString = (params: Record<string, unknown>) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    query.append(key, String(value));
  });
  const rendered = query.toString();
  return rendered ? `?${rendered}` : "";
};

const requisitionsAPI = {
  listTypes: async (): Promise<RequisitionType[]> => {
    return api.get("/requisitions/types");
  },

  listAvailableJobs: async (): Promise<RequisitionJobOption[]> => {
    return api.get("/requisitions/jobs");
  },

  createType: async (payload: CreateRequisitionTypeData): Promise<RequisitionType> => {
    return api.post("/requisitions/types", payload);
  },

  updateType: async (
    requisitionTypeId: number,
    payload: Partial<CreateRequisitionTypeData>
  ): Promise<RequisitionType> => {
    return api.patch(`/requisitions/types/${requisitionTypeId}`, payload);
  },

  deleteType: async (requisitionTypeId: number) => {
    return api.delete(`/requisitions/types/${requisitionTypeId}`);
  },

  listRequests: async (params?: {
    page?: number;
    pageSize?: number;
    status?: string;
    sourceModule?: string;
    requesterProfileId?: number;
  }): Promise<PaginatedList<RequisitionRequest>> => {
    return api.get(`/requisitions/requests${toQueryString(params || {})}`);
  },

  getRequestById: async (requestId: number): Promise<RequisitionRequest> => {
    return api.get(`/requisitions/requests/${requestId}`);
  },

  createRequest: async (payload: CreateRequisitionRequestData): Promise<RequisitionRequest> => {
    return api.post("/requisitions/requests", payload);
  },

  financeEditRequest: async (
    requestId: number,
    payload: UpdateFinanceStageRequisitionData
  ): Promise<RequisitionRequest> => {
    return api.patch(`/requisitions/requests/${requestId}/finance-edit`, payload);
  },

  releaseFunds: async (
    requestId: number,
    payload?: ReleaseRequisitionFundsData
  ): Promise<RequisitionRequest> => {
    return api.patch(`/requisitions/requests/${requestId}/release`, payload || {});
  },

  submitAccountability: async (
    requestId: number,
    payload: SubmitRequisitionAccountabilityData
  ): Promise<RequisitionRequest> => {
    return api.patch(`/requisitions/requests/${requestId}/accountability`, payload);
  },

  cancelRequest: async (requestId: number, reason?: string): Promise<RequisitionRequest> => {
    return api.patch(`/requisitions/requests/${requestId}/cancel`, reason ? { reason } : {});
  },

  listApprovals: async (params?: {
    page?: number;
    pageSize?: number;
    scope?: "mine" | "all";
    status?: string;
  }): Promise<PaginatedList<RequisitionRequest>> => {
    return api.get(`/requisitions/approvals${toQueryString(params || {})}`);
  },

  approveRequest: async (requestId: number, notes?: string): Promise<RequisitionRequest> => {
    return api.patch(`/requisitions/requests/${requestId}/approve`, notes ? { notes } : {});
  },

  declineRequest: async (requestId: number, reason: string): Promise<RequisitionRequest> => {
    return api.patch(`/requisitions/requests/${requestId}/decline`, { reason });
  },

  getReportSummary: async (): Promise<RequisitionReportSummary> => {
    return api.get("/requisitions/reports/summary");
  },

  getFinanceTracker: async (): Promise<RequisitionFinanceTracker> => {
    return api.get("/requisitions/finance-tracker");
  },
};

export default requisitionsAPI;
