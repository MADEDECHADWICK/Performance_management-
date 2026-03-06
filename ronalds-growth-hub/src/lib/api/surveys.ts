/**
 * Client Satisfaction Surveys API Module
 * Handles survey creation, submission, and analytics
 */

import { api } from './client';

export interface ClientSatisfactionSurvey {
  id: number;
  clientId: number;
  jobId?: number;
  surveyToken: string;
  sentAt?: string;
  expiresAt?: string;
  
  // Ratings (1-5)
  qualityRating?: number;
  communicationRating?: number;
  timelinessRating?: number;
  professionalismRating?: number;
  valueForMoneyRating?: number;
  overallSatisfaction?: number;
  wouldRecommend?: boolean;
  
  // Feedback
  improvementSuggestions?: string;
  additionalComments?: string;
  
  completedAt?: string;
  ipAddress?: string;
  
  createdAt: string;
  updatedAt: string;
  
  // Relations
  client?: {
    id: number;
    clientName: string;
    contactPerson?: string;
    email?: string;
  };
  job?: {
    id: number;
    jobCode: string;
    jobName: string;
  };
}

export interface SurveyListParams {
  clientId?: number;
  jobId?: number;
  completed?: boolean;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export interface SurveyListResponse {
  surveys: ClientSatisfactionSurvey[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateSurveyData {
  clientId: number;
  jobId?: number;
  expiresInDays?: number; // Default 30
}

export interface SubmitSurveyData {
  qualityRating: number;
  communicationRating: number;
  timelinessRating: number;
  professionalismRating: number;
  valueForMoneyRating: number;
  overallSatisfaction: number;
  wouldRecommend: boolean;
  improvementSuggestions?: string;
  additionalComments?: string;
}

export interface SurveyAnalytics {
  totalSurveys: number;
  completedSurveys: number;
  responseRate: number;
  averageRatings: {
    quality: number;
    communication: number;
    timeliness: number;
    professionalism: number;
    valueForMoney: number;
    overall: number;
  };
  recommendationRate: number;
  trends: {
    month: string;
    avgSatisfaction: number;
    responseCount: number;
  }[];
}

export interface SurveyByClient {
  clientId: number;
  clientName: string;
  surveyCount: number;
  avgSatisfaction: number;
  lastSurveyDate?: string;
  wouldRecommendPercent: number;
}

const surveysAPI = {
  /**
   * List surveys with filtering
   */
  list: (params: SurveyListParams = {}): Promise<SurveyListResponse> => {
    const queryParams = new URLSearchParams();
    if (params.clientId) queryParams.set('clientId', params.clientId.toString());
    if (params.jobId) queryParams.set('jobId', params.jobId.toString());
    if (params.completed !== undefined) queryParams.set('completed', params.completed.toString());
    if (params.dateFrom) queryParams.set('dateFrom', params.dateFrom);
    if (params.dateTo) queryParams.set('dateTo', params.dateTo);
    if (params.page) queryParams.set('page', params.page.toString());
    if (params.pageSize) queryParams.set('pageSize', params.pageSize.toString());
    
    const query = queryParams.toString();
    return api.get(`/surveys${query ? `?${query}` : ''}`);
  },

  /**
   * Get a single survey by ID
   */
  getById: (id: number): Promise<ClientSatisfactionSurvey> => {
    return api.get(`/surveys/${id}`);
  },

  /**
   * Get a survey by token (for external/client access)
   */
  getByToken: (token: string): Promise<ClientSatisfactionSurvey> => {
    return api.get(`/surveys/token/${token}`);
  },

  /**
   * Create a new survey and send to client
   */
  create: (data: CreateSurveyData): Promise<ClientSatisfactionSurvey> => {
    return api.post('/surveys', data);
  },

  /**
   * Send survey reminder
   */
  sendReminder: (id: number): Promise<{ success: boolean; message: string }> => {
    return api.post(`/surveys/${id}/remind`);
  },

  /**
   * Submit survey response (token-based, no auth required)
   */
  submit: async (token: string, data: SubmitSurveyData): Promise<ClientSatisfactionSurvey> => {
    const baseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/+$/, '');
    const apiRoot = baseUrl.endsWith('/api') ? baseUrl : `${baseUrl}/api`;
    const res = await fetch(
      `${apiRoot}/surveys/token/${token}/submit`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }
    );
    
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(payload?.error || payload?.message || 'Failed to submit survey');
    }
    
    if (payload && typeof payload === 'object' && 'success' in payload && 'data' in payload) {
      return payload.data as ClientSatisfactionSurvey;
    }

    return payload as ClientSatisfactionSurvey;
  },

  /**
   * Get survey analytics
   */
  getAnalytics: (params?: { dateFrom?: string; dateTo?: string }): Promise<SurveyAnalytics> => {
    const queryParams = new URLSearchParams();
    if (params?.dateFrom) queryParams.set('dateFrom', params.dateFrom);
    if (params?.dateTo) queryParams.set('dateTo', params.dateTo);
    
    const query = queryParams.toString();
    return api.get(`/surveys/analytics${query ? `?${query}` : ''}`);
  },

  /**
   * Get surveys grouped by client
   */
  getByClient: (): Promise<SurveyByClient[]> => {
    return api.get('/surveys/by-client');
  },

  /**
   * Get surveys for a specific job
   */
  getJobSurveys: (jobId: number): Promise<SurveyListResponse> => {
    return surveysAPI.list({ jobId });
  },

  /**
   * Get surveys for a specific client
   */
  getClientSurveys: (clientId: number): Promise<SurveyListResponse> => {
    return surveysAPI.list({ clientId });
  },

  /**
   * Delete a survey (admin only)
   */
  delete: (id: number): Promise<{ success: boolean }> => {
    return api.delete(`/surveys/${id}`);
  },

  /**
   * Get pending (not completed) surveys
   */
  getPending: (): Promise<SurveyListResponse> => {
    return surveysAPI.list({ completed: false });
  },

  /**
   * Get completed surveys
   */
  getCompleted: (): Promise<SurveyListResponse> => {
    return surveysAPI.list({ completed: true });
  },

  /**
   * Build external survey URL for sharing
   */
  getSurveyUrl: (token: string): string => {
    return `${window.location.origin}/client-evaluation/${token}`;
  },
};

export default surveysAPI;
