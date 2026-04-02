import { api } from "./client";

export type LeaveRequestStatus =
  | "pending_manager_approval"
  | "pending_partner_approval"
  | "pending_hr_approval"
  | "approved"
  | "declined"
  | "cancelled";

export type LeaveDayPortion = "full_day" | "half_day_am" | "half_day_pm";
export type LeaveUnitType = "day" | "hour";
export type LeavePolicyAssignmentScope = "global" | "department" | "role" | "employee";
export type LeaveNoticeUnit = "calendar_days" | "business_days";
export type LeaveApprovalStageType = "manager" | "partner" | "hr";
export type LeaveApproverSource =
  | "employee_manager"
  | "department_partner"
  | "hr_pool"
  | "specific_profile";

export interface LeavePolicyNoticeRule {
  id?: number;
  sequenceNo: number;
  minHours?: number | null;
  maxHours?: number | null;
  noticeValue: number;
  noticeUnit: LeaveNoticeUnit;
  isActive: boolean;
}

export interface LeavePolicyApprovalRouteStep {
  id?: number;
  stepNumber: number;
  stageType: LeaveApprovalStageType;
  approverSource: LeaveApproverSource;
  approverProfileId?: number | null;
}

export interface LeavePolicyApprovalRoute {
  id?: number;
  name: string;
  minHours?: number | null;
  maxHours?: number | null;
  isActive: boolean;
  steps: LeavePolicyApprovalRouteStep[];
}

export interface LeaveType {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  color?: string | null;
  isActive: boolean;
  isPaid: boolean;
  balanceTracked: boolean;
  requiresAttachment: boolean;
  allowsHalfDay: boolean;
  unitType: LeaveUnitType;
  defaultNoticeDays: number;
  defaultMaxUnits?: number | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface LeavePolicy {
  id: number;
  leaveTypeId: number;
  name: string;
  description?: string | null;
  isActive: boolean;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  annualEntitlement: number;
  carryoverCap: number;
  accrualEnabled: boolean;
  accrualFrequency: string;
  accrualRate: number;
  requiresManagerApproval: boolean;
  requiresHrApproval: boolean;
  excludeWeekends: boolean;
  excludePublicHolidays: boolean;
  minNoticeDays: number;
  hoursPerWorkday: number;
  autoProjectToTimesheet: boolean;
  maxConsecutiveUnits: number;
  maxUnitsPerRequest: number;
  allowNegativeBalance: boolean;
  noticeRules?: LeavePolicyNoticeRule[];
  approvalRoutes?: LeavePolicyApprovalRoute[];
  leaveType?: Pick<LeaveType, "id" | "code" | "name">;
}

export interface LeaveBalance {
  id: number;
  employeeProfileId: number;
  leaveTypeId: number;
  leaveYear: number;
  openingBalance: number;
  accruedUnits: number;
  carriedOverUnits: number;
  adjustedUnits: number;
  usedUnits: number;
  pendingUnits: number;
  availableUnits: number;
  leaveType?: Pick<LeaveType, "id" | "code" | "name" | "color" | "unitType" | "isPaid">;
}

export interface LeaveApprovalStep {
  id: number;
  leaveRequestId: number;
  stepNumber: number;
  stageType: string;
  approverProfileId: number;
  delegatedFromProfileId?: number | null;
  decision: string;
  notes?: string | null;
  actedAt?: string | null;
  approver?: {
    id: number;
    firstName: string;
    lastName: string;
  } | null;
  delegatedFrom?: {
    id: number;
    firstName: string;
    lastName: string;
  } | null;
}

export interface LeaveRequest {
  id: number;
  employeeProfileId: number;
  leaveTypeId: number;
  leavePolicyId?: number | null;
  currentApproverProfileId?: number | null;
  status: LeaveRequestStatus;
  startDate: string;
  endDate: string;
  startsAt?: string | null;
  endsAt?: string | null;
  startDayPortion: LeaveDayPortion;
  endDayPortion: LeaveDayPortion;
  requestedUnits: number;
  deductedUnits: number;
  requestedHours: number;
  deductedHours: number;
  reason?: string | null;
  declineReason?: string | null;
  cancellationReason?: string | null;
  createdAt: string;
  updatedAt?: string;
  approvedAt?: string | null;
  cancelledAt?: string | null;
  employee?: {
    id: number;
    firstName: string;
    lastName: string;
    department?: {
      id: number;
      name: string;
    } | null;
  };
  leaveType?: Pick<
    LeaveType,
    "id" | "code" | "name" | "color" | "isPaid" | "requiresAttachment" | "unitType"
  >;
  policy?: Pick<
    LeavePolicy,
    "id" | "name" | "requiresManagerApproval" | "requiresHrApproval" | "hoursPerWorkday"
  > | null;
  approvalSteps?: LeaveApprovalStep[];
  attachmentCount?: number;
  attachments?: Array<{
    id: number;
    fileName: string;
    documentType: string;
    createdAt: string;
  }>;
}

export interface PublicHoliday {
  id: number;
  name: string;
  holidayDate: string;
  countryCode?: string | null;
  region?: string | null;
  isRecurring: boolean;
}

export interface LeavePolicyAssignment {
  id: number;
  policyId: number;
  scope: LeavePolicyAssignmentScope;
  priority: number;
  departmentId?: number | null;
  roleId?: number | null;
  profileId?: number | null;
  policy?: LeavePolicy;
  department?: { id: number; name: string } | null;
  role?: { id: number; name: string } | null;
  profile?: { id: number; firstName: string; lastName: string } | null;
}

export interface LeaveReportSummary {
  totalRequests: number;
  pendingApprovals: number;
  declinedCount: number;
  cancelledCount: number;
  utilizationByType: Array<{ leaveType: string; units: number }>;
  departmentUsage: Array<{ departmentName: string; units: number }>;
  pendingByStage?: {
    manager: number;
    partner: number;
    hr: number;
  };
  upcomingAbsences: Array<{
    id: number;
    employeeName: string;
    leaveType: string;
    startDate: string;
    endDate: string;
    units: number;
    hours?: number;
  }>;
  employeesOnLeaveNow?: Array<{
    id: number;
    employeeName: string;
    departmentName: string;
    leaveType: string;
    startDate: string;
    endDate: string;
    units: number;
    hours: number;
  }>;
  leaveBalances?: Array<{
    id: number;
    employeeProfileId: number;
    employeeName: string;
    departmentName: string;
    leaveType: string;
    leaveUnitType: LeaveUnitType;
    availableUnits: number;
    pendingUnits: number;
    usedUnits: number;
  }>;
  departmentBalances?: Array<{
    departmentName: string;
    availableUnits: number;
    pendingUnits: number;
    usedUnits: number;
  }>;
}

export interface PaginatedList<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export interface LeaveCalendarResponse {
  requests: LeaveRequest[];
  holidays: PublicHoliday[];
}

export interface CreateLeaveRequestData {
  leaveTypeId: number;
  startDate: string;
  endDate: string;
  startsAt?: string;
  endsAt?: string;
  startDayPortion?: LeaveDayPortion;
  endDayPortion?: LeaveDayPortion;
  requestedHours?: number;
  reason?: string;
  attachmentDocumentIds?: number[];
}

export interface CreateLeaveTypeData {
  code: string;
  name: string;
  description?: string;
  color?: string;
  isActive?: boolean;
  isPaid?: boolean;
  balanceTracked?: boolean;
  requiresAttachment?: boolean;
  allowsHalfDay?: boolean;
  unitType?: LeaveUnitType;
  defaultNoticeDays?: number;
  defaultMaxUnits?: number | null;
}

export interface CreateLeavePolicyData {
  leaveTypeId: number;
  name: string;
  description?: string;
  isActive?: boolean;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  annualEntitlement?: number;
  carryoverCap?: number;
  accrualEnabled?: boolean;
  accrualFrequency?: string;
  accrualRate?: number;
  requiresManagerApproval?: boolean;
  requiresHrApproval?: boolean;
  excludeWeekends?: boolean;
  excludePublicHolidays?: boolean;
  minNoticeDays?: number;
  hoursPerWorkday?: number;
  autoProjectToTimesheet?: boolean;
  maxConsecutiveUnits?: number;
  maxUnitsPerRequest?: number;
  allowNegativeBalance?: boolean;
  noticeRules?: Array<{
    sequenceNo?: number;
    minHours?: number | null;
    maxHours?: number | null;
    noticeValue: number;
    noticeUnit?: LeaveNoticeUnit;
    isActive?: boolean;
  }>;
  approvalRoutes?: Array<{
    name: string;
    minHours?: number | null;
    maxHours?: number | null;
    isActive?: boolean;
    steps: Array<{
      stepNumber?: number;
      stageType: LeaveApprovalStageType;
      approverSource?: LeaveApproverSource;
      approverProfileId?: number | null;
    }>;
  }>;
}

export interface CreateLeavePolicyAssignmentData {
  policyId: number;
  scope: LeavePolicyAssignmentScope;
  departmentId?: number | null;
  roleId?: number | null;
  profileId?: number | null;
  priority?: number;
}

export interface CreatePublicHolidayData {
  name: string;
  holidayDate: string;
  countryCode?: string;
  region?: string | null;
  isRecurring?: boolean;
}

export interface AdjustLeaveBalanceData {
  employeeProfileId: number;
  leaveTypeId: number;
  leaveYear?: number;
  units: number;
  note?: string;
  effectiveDate?: string | null;
}

const toQueryString = (params: Record<string, unknown>) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    if (Array.isArray(value)) {
      value.forEach((item) => query.append(key, String(item)));
      return;
    }
    query.append(key, String(value));
  });
  const rendered = query.toString();
  return rendered ? `?${rendered}` : "";
};

const leaveAPI = {
  listMyBalances: async (year?: number): Promise<LeaveBalance[]> => {
    return api.get(`/leave/balances/my${toQueryString({ year })}`);
  },

  listRequests: async (params?: {
    page?: number;
    pageSize?: number;
    status?: string;
    employeeProfileId?: number;
  }): Promise<PaginatedList<LeaveRequest>> => {
    return api.get(`/leave/requests${toQueryString(params || {})}`);
  },

  getRequestById: async (requestId: number): Promise<LeaveRequest> => {
    return api.get(`/leave/requests/${requestId}`);
  },

  createRequest: async (payload: CreateLeaveRequestData): Promise<LeaveRequest> => {
    const response = await api.post<any>("/leave/requests", payload);
    return response?.request ?? response;
  },

  cancelRequest: async (requestId: number, reason?: string): Promise<LeaveRequest> => {
    return api.patch(`/leave/requests/${requestId}/cancel`, reason ? { reason } : {});
  },

  getCalendar: async (params: {
    scope?: "mine" | "team" | "org";
    dateFrom: string;
    dateTo: string;
    status?: string[];
  }): Promise<LeaveCalendarResponse> => {
    return api.get(`/leave/calendar${toQueryString(params)}`);
  },

  listApprovals: async (params?: {
    page?: number;
    pageSize?: number;
    scope?: "mine" | "all";
    status?: string;
  }): Promise<PaginatedList<LeaveRequest>> => {
    return api.get(`/leave/approvals${toQueryString(params || {})}`);
  },

  approveRequest: async (requestId: number, notes?: string): Promise<LeaveRequest> => {
    return api.patch(`/leave/requests/${requestId}/approve`, notes ? { notes } : {});
  },

  declineRequest: async (requestId: number, reason: string): Promise<LeaveRequest> => {
    return api.patch(`/leave/requests/${requestId}/decline`, { reason });
  },

  listLeaveTypes: async (): Promise<LeaveType[]> => {
    return api.get("/leave/types");
  },

  createLeaveType: async (payload: CreateLeaveTypeData): Promise<LeaveType> => {
    return api.post("/leave/types", payload);
  },

  updateLeaveType: async (leaveTypeId: number, payload: Partial<CreateLeaveTypeData>): Promise<LeaveType> => {
    return api.patch(`/leave/types/${leaveTypeId}`, payload);
  },

  deleteLeaveType: async (leaveTypeId: number) => {
    return api.delete(`/leave/types/${leaveTypeId}`);
  },

  listPolicies: async (): Promise<LeavePolicy[]> => {
    return api.get("/leave/policies");
  },

  createPolicy: async (payload: CreateLeavePolicyData): Promise<LeavePolicy> => {
    return api.post("/leave/policies", payload);
  },

  updatePolicy: async (policyId: number, payload: Partial<CreateLeavePolicyData>): Promise<LeavePolicy> => {
    return api.patch(`/leave/policies/${policyId}`, payload);
  },

  deletePolicy: async (policyId: number) => {
    return api.delete(`/leave/policies/${policyId}`);
  },

  listPolicyAssignments: async (): Promise<LeavePolicyAssignment[]> => {
    return api.get("/leave/policy-assignments");
  },

  createPolicyAssignment: async (
    payload: CreateLeavePolicyAssignmentData
  ): Promise<LeavePolicyAssignment> => {
    return api.post("/leave/policy-assignments", payload);
  },

  deletePolicyAssignment: async (assignmentId: number) => {
    return api.delete(`/leave/policy-assignments/${assignmentId}`);
  },

  listPublicHolidays: async (params?: { dateFrom?: string; dateTo?: string }): Promise<PublicHoliday[]> => {
    return api.get(`/leave/public-holidays${toQueryString(params || {})}`);
  },

  createPublicHoliday: async (payload: CreatePublicHolidayData): Promise<PublicHoliday> => {
    return api.post("/leave/public-holidays", payload);
  },

  updatePublicHoliday: async (
    holidayId: number,
    payload: Partial<CreatePublicHolidayData>
  ): Promise<PublicHoliday> => {
    return api.patch(`/leave/public-holidays/${holidayId}`, payload);
  },

  deletePublicHoliday: async (holidayId: number) => {
    return api.delete(`/leave/public-holidays/${holidayId}`);
  },

  adjustBalance: async (payload: AdjustLeaveBalanceData): Promise<LeaveBalance> => {
    return api.post("/leave/balances/adjust", payload);
  },

  getReportSummary: async (params?: { dateFrom?: string; dateTo?: string }): Promise<LeaveReportSummary> => {
    return api.get(`/leave/reports/summary${toQueryString(params || {})}`);
  },
};

export default leaveAPI;
