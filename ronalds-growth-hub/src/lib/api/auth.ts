/**
 * Auth API - Authentication & Authorization
 */
import { api, setToken, setUser, clearAuth } from './client';
import type { User, Profile } from './types';

interface LoginResponse {
  token: string;
  user: User & { profile?: Profile };
}

interface RegisterPayload {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export const authAPI = {
  /**
   * Login user with email and password
   */
  login: async (email: string, password: string): Promise<LoginResponse> => {
    const response = await api.post<LoginResponse>('/auth/login', { email, password });
    if (response.token) {
      setToken(response.token);
      setUser(response.user);
    }
    return response;
  },

  /**
   * Register a new user
   */
  register: async (payload: RegisterPayload): Promise<any> => {
    // Backend expects name or first_name/last_name in snake_case
    const response = await api.post('/auth/register', {
      email: payload.email,
      password: payload.password,
      name: `${payload.firstName} ${payload.lastName}`.trim(),
      first_name: payload.firstName,
      last_name: payload.lastName,
    });
    return response;
  },

  /**
   * Get current authenticated user
   */
  me: async (): Promise<User & { profile?: Profile }> => {
    const response = await api.get<{ user: User & { profile?: Profile } }>('/auth/me');
    if (response.user) {
      setUser(response.user);
    }
    return response.user;
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

  /**
   * Request password reset
   */
  requestPasswordReset: async (email: string): Promise<void> => {
    await api.post('/auth/forgot-password', { email });
  },

  /**
   * Reset password with token
   */
  resetPassword: async (token: string, password: string): Promise<void> => {
    await api.post('/auth/reset-password', { token, password });
  },

  /**
   * Change password (authenticated)
   */
  changePassword: async (currentPassword: string, newPassword: string): Promise<void> => {
    await api.post('/auth/change-password', { currentPassword, newPassword });
  },
};

export default authAPI;
