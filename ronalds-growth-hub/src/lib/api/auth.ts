/**
 * Auth API - Authentication & Authorization
 */
import { api, setToken, setUser, clearAuth } from './client';
import type { User, Profile } from './types';
import type { CanonicalRole } from '@/auth/canonicalRoles';

export interface LoginSuccessResponse {
  token: string;
  user: User & { profile?: Profile };
}

export interface PasswordSetupRequiredResponse {
  requiresPasswordChange: true;
  setupToken: string;
  user: {
    id: number;
    email: string;
    name?: string;
  };
}

export type LoginResponse = LoginSuccessResponse | PasswordSetupRequiredResponse;

interface RegisterPayload {
  email: string;
  firstName: string;
  lastName: string;
  authRole: CanonicalRole;
  roleId?: number;
  phone?: string;
  position?: string;
  departmentId?: number;
  managerId?: number;
  hireDate?: string;
  status?: string;
}

export interface InviteValidationResponse {
  valid: boolean;
  email: string;
  name?: string;
  expiresAt: string;
}

export const authAPI = {
  /**
   * Login user with email and password
   */
  login: async (email: string, password: string): Promise<LoginResponse> => {
    const response = await api.post<LoginResponse>('/auth/login', { email, password });
    if ('token' in response && response.token) {
      setToken(response.token);
      setUser(response.user);
    }
    return response;
  },

  /**
   * Onboard a new user (HR/Admin only)
   */
  register: async (payload: RegisterPayload): Promise<any> => {
    const response = await api.post('/auth/onboard-user', {
      email: payload.email,
      firstName: payload.firstName,
      lastName: payload.lastName,
      authRole: payload.authRole,
      roleId: payload.roleId,
      phone: payload.phone,
      position: payload.position,
      departmentId: payload.departmentId,
      managerId: payload.managerId,
      hireDate: payload.hireDate,
      status: payload.status,
    });
    return response;
  },

  /**
   * Validate a one-time onboarding invitation link.
   */
  validateInvite: async (token: string): Promise<InviteValidationResponse> => {
    const params = new URLSearchParams({ token });
    return api.get<InviteValidationResponse>(`/auth/invite/validate?${params.toString()}`);
  },

  /**
   * Accept a one-time onboarding invitation and set the password.
   */
  acceptInvite: async (
    token: string,
    newPassword: string
  ): Promise<LoginSuccessResponse> => {
    const response = await api.post<LoginSuccessResponse>('/auth/accept-invite', {
      token,
      newPassword,
    });
    if (response.token) {
      setToken(response.token);
      setUser(response.user);
    }
    return response;
  },

  /**
   * Resend a one-time onboarding invitation.
   */
  resendInvite: async (profileId: number): Promise<{
    message: string;
    emailDelivery: string;
    emailDeliveryReason?: string;
    inviteExpiresAt: string;
  }> => {
    return api.post('/auth/resend-invite', { profileId });
  },

  /**
   * Complete first-login password setup
   */
  completePasswordSetup: async (
    setupToken: string,
    newPassword: string
  ): Promise<LoginSuccessResponse> => {
    const response = await api.post<LoginSuccessResponse>('/auth/set-password', {
      setupToken,
      newPassword,
    });

    if (response.token) {
      setToken(response.token);
      setUser(response.user);
    }

    return response;
  },

  /**
   * Get current authenticated user
   */
  me: async (): Promise<User & { profile?: Profile }> => {
    const response = await api.get<User & { profile?: Profile } | { user: User & { profile?: Profile } }>('/auth/me');
    const resolvedUser = 'user' in response ? response.user : response;
    if (resolvedUser) {
      setUser(resolvedUser);
    }
    return resolvedUser;
  },

  /**
   * Logout current user
   */
  logout: async (): Promise<void> => {
    try {
      await api.post('/auth/logout');
    } finally {
      clearAuth();
    }
  },

  /**
   * Refresh access token
   */
  refreshToken: async (): Promise<{ token: string }> => {
    const response = await api.post<{ token: string }>('/auth/refresh');
    if (response.token) {
      setToken(response.token);
    }
    return response;
  },

};

export default authAPI;
