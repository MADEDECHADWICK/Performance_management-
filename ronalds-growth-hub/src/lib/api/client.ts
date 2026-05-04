/**
 * API Client - Core HTTP utilities
 * Handles authentication, error handling, and base fetch operations
 */

import { API_BASE_URL } from "@/lib/api/apiBaseUrl";

const API_URL = API_BASE_URL;
const TOKEN_KEY = 'rg_token';
const USER_KEY = 'rg_user';

// Token Management
export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setUser(user: any | null) {
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  else localStorage.removeItem(USER_KEY);
}

export function getUser(): any | null {
  const data = localStorage.getItem(USER_KEY);
  return data ? JSON.parse(data) : null;
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

// API Error class
export class ApiError extends Error {
  status: number;
  code?: string;
  
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

const toCamelCase = (value: string) =>
  value.replace(/_([a-zA-Z0-9])/g, (_, letter: string) => letter.toUpperCase());

const normalizePathQueryKeys = (path: string) => {
  const queryIndex = path.indexOf("?");
  if (queryIndex < 0) return path;

  const basePath = path.slice(0, queryIndex);
  const queryAndHash = path.slice(queryIndex + 1);
  const hashIndex = queryAndHash.indexOf("#");
  const query = hashIndex >= 0 ? queryAndHash.slice(0, hashIndex) : queryAndHash;
  const hash = hashIndex >= 0 ? queryAndHash.slice(hashIndex) : "";
  if (!query) return `${basePath}${hash}`;

  const normalized = new URLSearchParams();
  const params = new URLSearchParams(query);
  params.forEach((value, key) => {
    normalized.append(toCamelCase(key), value);
  });

  const normalizedQuery = normalized.toString();
  return normalizedQuery ? `${basePath}?${normalizedQuery}${hash}` : `${basePath}${hash}`;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && value.constructor === Object;

const camelizeKeys = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((item) => camelizeKeys(item)) as T;
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const output: Record<string, unknown> = {};
  Object.keys(value).forEach((key) => {
    output[toCamelCase(key)] = camelizeKeys((value as Record<string, unknown>)[key]);
  });
  return output as T;
};

const normalizeApiResponse = (payload: any) => {
  if (payload && typeof payload === 'object' && 'success' in payload && 'data' in payload) {
    const data = payload.data;
    if (data && typeof data === 'object' && 'items' in data && 'pagination' in data) {
      return {
        data: data.items,
        ...data.pagination,
      };
    }
    return data;
  }

  return payload;
};

// Base fetch function
export async function apiFetch<T = any>(
  method: string,
  path: string,
  body?: any,
  options?: { skipAuth?: boolean; headers?: Record<string, string> }
): Promise<T> {
  const normalizedPath = normalizePathQueryKeys(path);
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
  };
  
  const token = getToken();
  if (token && !options?.skipAuth) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (options?.headers) {
    Object.assign(headers, options.headers);
  }
  
  const fetchOptions: RequestInit = { method, headers };
  if (body !== undefined && body !== null) {
    fetchOptions.body = isFormData ? body : JSON.stringify(camelizeKeys(body));
  }
  
  try {
    const res = await fetch(`${API_URL}${normalizedPath}`, fetchOptions);
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    
    if (!res.ok) {
      const validationDetail =
        Array.isArray(data?.errors) && data.errors.length > 0
          ? data.errors
              .map((entry: any) => String(entry?.message || "").trim())
              .find(Boolean)
          : null;
      const errorMessage =
        data.error === "Validation failed" && validationDetail
          ? validationDetail
          : data.error || data.message || validationDetail || `HTTP ${res.status}`;
      // Handle 401 - clear auth and redirect
      if (res.status === 401) {
        clearAuth();
        window.location.href = '/auth';
      }
      throw new ApiError(
        errorMessage,
        res.status,
        data.code
      );
    }
    
    const normalized = normalizeApiResponse(data);
    return camelizeKeys(normalized) as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('Network error', 0, 'NETWORK_ERROR');
  }
}

// Convenience methods
export const api = {
  get: <T = any>(path: string) => apiFetch<T>('GET', path),
  post: <T = any>(path: string, body?: any) => apiFetch<T>('POST', path, body),
  put: <T = any>(path: string, body?: any) => apiFetch<T>('PUT', path, body),
  patch: <T = any>(path: string, body?: any) => apiFetch<T>('PATCH', path, body),
  delete: <T = any>(path: string) => apiFetch<T>('DELETE', path),
};

export default api;
