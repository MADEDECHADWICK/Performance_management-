const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const TOKEN_KEY = 'rg_token';

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export async function apiFetch<T = any>(
  method: string,
  path: string,
  body?: any
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const opts: RequestInit = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  
  const res = await fetch(`${API_URL}${path}`, opts);
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  
  if (!res.ok) {
    const error = new Error(data.error || `HTTP ${res.status}`);
    (error as any).status = res.status;
    (error as any).code = data.code;
    throw error;
  }
  return data as T;
}

export const authAPI = {
  register: (
    emailOrPayload: { email: string; password: string; name?: string } | string,
    password?: string,
    firstName?: string,
    lastName?: string
  ) => {
    const payload = typeof emailOrPayload === 'string'
      ? { email: emailOrPayload, password: password || '', name: [firstName, lastName].filter(Boolean).join(' ').trim() || undefined }
      : emailOrPayload;
    return apiFetch('POST', '/auth/register', payload);
  },
  login: (
    emailOrPayload: { email: string; password: string } | string,
    password?: string
  ) => {
    const payload = typeof emailOrPayload === 'string'
      ? { email: emailOrPayload, password: password || '' }
      : emailOrPayload;
    return apiFetch<{ token: string; user: any }>('POST', '/auth/login', payload);
  },
  me: () => apiFetch('GET', '/auth/me'),
};

// Roles API
export const rolesAPI = {
  getAll: () => apiFetch('GET', '/roles'),
  getById: (id: number) => apiFetch(`GET`, `/roles/${id}`),
  create: (data: { name: string; billing_rate: number; permissions?: string[]; description?: string; is_active?: boolean }) =>
    apiFetch('POST', '/roles', data),
  update: (id: number, data: Partial<{ name: string; billing_rate: number; permissions: string[]; description: string; is_active: boolean }>) =>
    apiFetch('PUT', `/roles/${id}`, data),
  delete: (id: number) => apiFetch('DELETE', `/roles/${id}`),
};

// Employee Roles API
export const employeeRolesAPI = {
  getAll: () => apiFetch('GET', '/employee_roles'),
  getById: (employeeId: number) => apiFetch('GET', `/employee_roles/${employeeId}`),
  assignRole: (employeeId: number, data: { role_id: number; notes?: string }) =>
    apiFetch('PUT', `/employee_roles/${employeeId}/role`, data),
  getRoleHistory: (employeeId: number) => apiFetch('GET', `/employee_roles/${employeeId}/role-history`),
};

// Job Staff Assignment API
export const jobStaffAPI = {
  getStaffForJob: (jobId: number) => apiFetch('GET', `/jobs/${jobId}/staff`),
  assignStaffToJob: (jobId: number, employeeId: number) =>
    apiFetch('POST', `/jobs/${jobId}/assign-staff`, { employee_id: employeeId }),
  removeStaffFromJob: (jobId: number, employeeId: number) =>
    apiFetch('DELETE', `/jobs/${jobId}/staff/${employeeId}`),
};

export default apiFetch;
