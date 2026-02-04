/**
 * Employees API - Employee Management
 * Includes profiles, onboarding, documents, and induction
 */
import { api } from './client';
import documentsAPI from './documents';
import type { 
  Profile, 
  Document,
  EmployeeOnboardingCase,
  EmployeeOffboardingCase,
  InductionChecklist,
  InductionChecklistItem,
  PaginatedResponse,
  EmployeeStatus,
  OnboardingStatus,
  OffboardingStatus,
  BackgroundCheckStatus
} from './types';

interface CreateEmployeePayload {
  firstName: string;
  middleName?: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  employeeId?: string;
  kraPin?: string;
  nssfNumber?: string;
  dateOfBirth?: string;
  departmentId?: number;
  roleId?: number;
  positionTitle?: string;
  managerId?: number;
  hireDate?: string;
  isPartner?: boolean;
  financialTarget?: number;
  utilizationTarget?: number;
}

interface UpdateEmployeePayload extends Partial<CreateEmployeePayload> {
  status?: EmployeeStatus;
  separationDate?: string;
  backgroundCheckStatus?: BackgroundCheckStatus;
}

interface EmployeeFilters {
  page?: number;
  pageSize?: number;
  status?: EmployeeStatus;
  departmentId?: number;
  roleId?: number;
  managerId?: number;
  isPartner?: boolean;
  search?: string;
  onboardingStatus?: OnboardingStatus;
}

export const employeesAPI = {
  /**
   * List all employees with pagination and filters
   */
  list: async (filters?: EmployeeFilters): Promise<PaginatedResponse<Profile>> => {
    const params = new URLSearchParams();
    if (filters?.page) params.append('page', String(filters.page));
    if (filters?.pageSize) params.append('pageSize', String(filters.pageSize));
    if (filters?.status) params.append('status', filters.status);
    if (filters?.departmentId) params.append('departmentId', String(filters.departmentId));
    if (filters?.roleId) params.append('roleId', String(filters.roleId));
    if (filters?.managerId) params.append('managerId', String(filters.managerId));
    if (filters?.isPartner !== undefined) params.append('isPartner', String(filters.isPartner));
    if (filters?.search) params.append('search', filters.search);
    if (filters?.onboardingStatus) params.append('onboardingStatus', filters.onboardingStatus);
    
    const query = params.toString();
    return api.get(`/employees${query ? `?${query}` : ''}`);
  },

  /**
   * Get employee by ID with full profile
   */
  getById: async (id: number): Promise<Profile> => {
    return api.get(`/employees/${id}`);
  },

  /**
   * Get my profile
   */
  getMyProfile: async (): Promise<Profile> => {
    return api.get('/profiles/me');
  },

  /**
   * Create new employee
   */
  create: async (data: CreateEmployeePayload): Promise<Profile> => {
    return api.post('/employees', data);
  },

  /**
   * Update employee
   */
  update: async (id: number, data: UpdateEmployeePayload): Promise<Profile> => {
    return api.put(`/employees/${id}`, data);
  },

  /**
   * Update my profile
   */
  updateMyProfile: async (data: Partial<UpdateEmployeePayload>): Promise<Profile> => {
    return api.put('/profiles/me', data);
  },

  /**
   * Separate employee (termination)
   */
  separate: async (id: number, separationDate: string, reason?: string): Promise<Profile> => {
    return api.post(`/employees/${id}/separate`, { separationDate, reason });
  },

  /**
   * Reactivate separated employee
   */
  reactivate: async (id: number): Promise<Profile> => {
    return api.post(`/employees/${id}/reactivate`);
  },

  /**
   * Get direct reports
   */
  getDirectReports: async (managerId: number): Promise<Profile[]> => {
    return api.get(`/employees/${managerId}/direct-reports`);
  },

  /**
   * Get my direct reports
   */
  getMyDirectReports: async (): Promise<Profile[]> => {
    return api.get('/subordinates');
  },

  // ==================
  // DOCUMENTS
  // ==================

  /**
   * Get employee documents
   */
  getDocuments: async (employeeId: number): Promise<Document[]> => {
    return api.get(`/documents?entityType=Profile&entityId=${employeeId}`);
  },

  /**
   * Upload employee document
   */
  uploadDocument: async (employeeId: number, data: {
    fileName: string;
    filePath: string;
    documentType: string;
    accessLevel?: string;
    isRequired?: boolean;
  }): Promise<Document> => {
    return api.post('/documents', {
      ...data,
      entityType: 'Profile',
      entityId: employeeId,
    });
  },

  /**
   * Verify document (HR/Admin)
   */
  verifyDocument: async (documentId: number): Promise<Document> => {
    return api.post(`/documents/${documentId}/verify`);
  },

  /**
   * Reject document
   */
  rejectDocument: async (documentId: number, reason: string): Promise<Document> => {
    return api.post(`/documents/${documentId}/reject`, { reason });
  },

  // ==================
  // BACKGROUND CHECK
  // ==================

  /**
   * Update background check status
   */
  updateBackgroundCheck: async (employeeId: number, status: BackgroundCheckStatus): Promise<Profile> => {
    return api.patch(`/employees/${employeeId}/background-check`, { status });
  },

  // ==================
  // ONBOARDING
  // ==================

  /**
   * Get onboarding cases
   */
  getOnboardingCases: async (filters?: {
    status?: OnboardingStatus;
    hrOwnerProfileId?: number;
  }): Promise<EmployeeOnboardingCase[]> => {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.hrOwnerProfileId) params.append('hrOwnerProfileId', String(filters.hrOwnerProfileId));
    
    const query = params.toString();
    return api.get(`/onboarding${query ? `?${query}` : ''}`);
  },

  /**
   * Get onboarding case by ID
   */
  getOnboardingCase: async (id: number): Promise<EmployeeOnboardingCase> => {
    return api.get(`/onboarding/${id}`);
  },

  /**
   * Create onboarding case for new employee
   */
  createOnboardingCase: async (employeeId: number, data?: {
    hrOwnerProfileId?: number;
    startDate?: string;
    dueDate?: string;
  }): Promise<EmployeeOnboardingCase> => {
    return api.post('/onboarding', { profileId: employeeId, ...data });
  },

  /**
   * Update onboarding case status
   */
  updateOnboardingStatus: async (caseId: number, status: OnboardingStatus): Promise<EmployeeOnboardingCase> => {
    return api.patch(`/onboarding/${caseId}`, { status });
  },

  // ==================
  // OFFBOARDING
  // ==================

  /**
   * Get offboarding cases
   */
  getOffboardingCases: async (filters?: {
    status?: OffboardingStatus;
  }): Promise<EmployeeOffboardingCase[]> => {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    const query = params.toString();
    return api.get(`/offboarding${query ? `?${query}` : ''}`);
  },

  /**
   * Create offboarding case for employee
   */
  createOffboardingCase: async (employeeId: number, data?: {
    hrOwnerProfileId?: number;
    reason?: string;
  }): Promise<EmployeeOffboardingCase> => {
    return api.post('/offboarding', { profileId: employeeId, ...data });
  },

  /**
   * Update offboarding case status
   */
  updateOffboardingStatus: async (caseId: number, data: {
    status?: OffboardingStatus;
    reason?: string;
    notes?: string;
    separationDate?: string;
  }): Promise<EmployeeOffboardingCase> => {
    return api.patch(`/offboarding/${caseId}`, data);
  },

  // ==================
  // INDUCTION CHECKLIST
  // ==================

  /**
   * Get employee induction checklist
   */
  getInductionChecklist: async (employeeId: number): Promise<InductionChecklist> => {
    return api.get(`/induction-checklist?employeeProfileId=${employeeId}`);
  },

  /**
   * Create induction checklist for employee
   */
  createInductionChecklist: async (employeeId: number, data?: {
    checklistName?: string;
    dueDate?: string;
    items?: Array<{
      itemName: string;
      description?: string;
      requiresDocument?: boolean;
    }>;
  }): Promise<InductionChecklist> => {
    return api.post('/induction-checklist', { employeeProfileId: employeeId, ...data });
  },

  /**
   * Add item to induction checklist
   */
  addChecklistItem: async (checklistId: number, data: {
    itemName: string;
    description?: string;
    requiresDocument?: boolean;
  }): Promise<InductionChecklistItem> => {
    return api.post(`/induction-checklist/${checklistId}/items`, data);
  },

  /**
   * Mark checklist item as complete
   */
  completeChecklistItem: async (checklistId: number, itemId: number, documentId?: number): Promise<InductionChecklistItem> => {
    return api.post(`/induction-checklist/${checklistId}/items/${itemId}/complete`, { documentId });
  },

  /**
   * Upload document for checklist item
   */
  uploadChecklistDocument: async (
    checklistId: number,
    itemId: number,
    file: File,
    options?: { accessLevel?: 'employee' | 'manager' | 'hr' | 'admin'; description?: string }
  ): Promise<InductionChecklistItem> => {
    const upload = await documentsAPI.uploadFile(file, {
      documentType: 'onboarding_checklist',
      entityType: 'InductionChecklist',
      entityId: checklistId,
      accessLevel: options?.accessLevel ?? 'employee',
      isRequired: true,
      description: options?.description ?? 'Checklist item document',
    });

    const documentId = (upload as any)?.data?.id ?? (upload as any)?.id;
    if (!documentId) {
      throw new Error('Upload succeeded but document id was missing.');
    }

    return api.patch(`/induction-checklist/${checklistId}/items/${itemId}/document`, {
      documentId,
    });
  },

  // ==================
  // SUMMARY & STATS
  // ==================

  /**
   * Get employee count by status
   */
  getCountByStatus: async (): Promise<Record<EmployeeStatus, number>> => {
    return api.get('/employees/count-by-status');
  },

  /**
   * Get employees missing induction checklist
   */
  getMissingInduction: async (): Promise<Profile[]> => {
    return api.get('/employees/missing-induction');
  },

  /**
   * Get employees with pending documents
   */
  getPendingDocuments: async (): Promise<Profile[]> => {
    return api.get('/employees/pending-documents');
  },
};

export default employeesAPI;
