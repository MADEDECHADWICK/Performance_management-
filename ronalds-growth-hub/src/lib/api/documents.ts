/**
 * Documents API Module
 * Handles document uploads, management, and role-based access
 */

import { api, apiFetch } from './client';

export interface Document {
  id: number;
  fileName: string;
  filePath: string;
  fileSize?: number;
  mimeType?: string;
  documentType: string;
  entityType: string; // 'employee', 'client', 'job', 'candidate'
  entityId?: number;
  accessLevel: 'employee' | 'manager' | 'hr' | 'admin';
  isRequired: boolean;
  verificationStatus: 'pending' | 'verified' | 'rejected';
  rejectionReason?: string;
  uploadedBy?: number;
  verifiedBy?: number;
  verifiedAt?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  uploader?: {
    id: number;
    firstName: string;
    lastName: string;
  };
  verifier?: {
    id: number;
    firstName: string;
    lastName: string;
  };
}

export interface DocumentListParams {
  entityType?: string;
  entityId?: number;
  documentType?: string;
  accessLevel?: string;
  verificationStatus?: string;
  uploadedBy?: number;
  page?: number;
  pageSize?: number;
}

export interface DocumentListResponse {
  documents: Document[];
  total: number;
  page: number;
  pageSize: number;
}

export interface UploadDocumentData {
  fileName: string;
  filePath: string;
  fileSize?: number;
  mimeType?: string;
  documentType: string;
  entityType: string;
  entityId?: number;
  accessLevel?: 'employee' | 'manager' | 'hr' | 'admin';
  isRequired?: boolean;
  description?: string;
}

export interface VerifyDocumentData {
  verificationStatus: 'verified' | 'rejected';
  rejectionReason?: string;
}

// Document Types by Entity
export const DOCUMENT_TYPES = {
  employee: [
    'national_id',
    'passport',
    'kra_pin',
    'nssf_card',
    'nhif_card',
    'academic_certificate',
    'professional_certificate',
    'cv_resume',
    'employment_contract',
    'appointment_letter',
    'performance_review',
    'disciplinary_record',
    'training_certificate',
    'medical_certificate',
    'bank_details',
    'next_of_kin',
    'photo',
    'other',
  ],
  client: [
    'engagement_letter',
    'contract',
    'proposal',
    'kyc_document',
    'registration_certificate',
    'tax_compliance',
    'correspondence',
    'financial_statement',
    'other',
  ],
  job: [
    'work_paper',
    'audit_report',
    'management_letter',
    'financial_statement',
    'tax_return',
    'supporting_document',
    'correspondence',
    'deliverable',
    'other',
  ],
  candidate: [
    'cv_resume',
    'cover_letter',
    'academic_certificate',
    'professional_certificate',
    'national_id',
    'reference_letter',
    'offer_letter',
    'other',
  ],
} as const;

const documentsAPI = {
  /**
   * List documents with filtering
   */
  list: (params: DocumentListParams = {}): Promise<DocumentListResponse> => {
    const queryParams = new URLSearchParams();
    if (params.entityType) queryParams.set('entityType', params.entityType);
    if (params.entityId) queryParams.set('entityId', params.entityId.toString());
    if (params.documentType) queryParams.set('documentType', params.documentType);
    if (params.accessLevel) queryParams.set('accessLevel', params.accessLevel);
    if (params.verificationStatus) queryParams.set('verificationStatus', params.verificationStatus);
    if (params.uploadedBy) queryParams.set('uploadedBy', params.uploadedBy.toString());
    if (params.page) queryParams.set('page', params.page.toString());
    if (params.pageSize) queryParams.set('pageSize', params.pageSize.toString());
    
    const query = queryParams.toString();
    return api.get(`/documents${query ? `?${query}` : ''}`);
  },

  /**
   * Get a single document by ID
   */
  getById: (id: number): Promise<Document> => {
    return api.get(`/documents/${id}`);
  },

  /**
   * Upload a new document
   */
  upload: (data: UploadDocumentData): Promise<Document> => {
    return api.post('/documents', data);
  },

  /**
   * Upload document with file (multipart)
   * Note: This requires backend support for file uploads
   */
  uploadFile: async (
    file: File,
    metadata: Omit<UploadDocumentData, 'fileName' | 'filePath' | 'fileSize' | 'mimeType'>
  ): Promise<Document> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('documentType', metadata.documentType);
    formData.append('entityType', metadata.entityType);
    if (metadata.entityId) formData.append('entityId', metadata.entityId.toString());
    if (metadata.accessLevel) formData.append('accessLevel', metadata.accessLevel);
    if (metadata.isRequired !== undefined) formData.append('isRequired', metadata.isRequired.toString());
    if (metadata.description) formData.append('description', metadata.description);

    const token = localStorage.getItem('rg_token');
    const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:4000'}/documents/upload`, {
      method: 'POST',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      body: formData,
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.message || 'Upload failed');
    }

    return res.json();
  },

  /**
   * Delete a document
   */
  delete: (id: number): Promise<{ success: boolean }> => {
    return api.delete(`/documents/${id}`);
  },

  /**
   * Verify a document (HR/Admin only)
   */
  verify: (id: number, data: VerifyDocumentData): Promise<Document> => {
    return api.patch(`/documents/${id}/verify`, data);
  },

  /**
   * Get documents for an employee
   */
  getEmployeeDocuments: (employeeId: number): Promise<DocumentListResponse> => {
    return documentsAPI.list({ entityType: 'Profile', entityId: employeeId });
  },

  /**
   * Get documents for a client
   */
  getClientDocuments: (clientId: number): Promise<DocumentListResponse> => {
    return documentsAPI.list({ entityType: 'Client', entityId: clientId });
  },

  /**
   * Get documents for a job
   */
  getJobDocuments: (jobId: number): Promise<DocumentListResponse> => {
    return documentsAPI.list({ entityType: 'Job', entityId: jobId });
  },

  /**
   * Get pending verification documents (HR view)
   */
  getPendingVerification: (): Promise<DocumentListResponse> => {
    return documentsAPI.list({ verificationStatus: 'pending' });
  },

  /**
   * Get document download URL
   */
  getDownloadUrl: (id: number): string => {
    const token = localStorage.getItem('rg_token');
    return `${import.meta.env.VITE_API_URL || 'http://localhost:4000'}/documents/${id}/download?token=${token}`;
  },
};

export default documentsAPI;
