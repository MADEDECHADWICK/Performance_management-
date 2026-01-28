const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const API_URL = `${BASE_URL}/api`;

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
const normalizeRole = (role: any) => {
  if (!role) return role;
  const billingRate = role.billing_rate ?? role.billingRate ?? 0;
  const costRate = role.cost_rate ?? role.costRate ?? undefined;
  const isActive = role.is_active ?? role.isActive ?? true;
  return {
    ...role,
    billing_rate: billingRate,
    billingRate,
    cost_rate: costRate,
    costRate,
    is_active: isActive,
    isActive,
    permissions: role.permissions ?? [],
  };
};

export const rolesAPI = {
  getAll: async () => {
    const data = await apiFetch('GET', '/roles');
    return Array.isArray(data) ? data.map(normalizeRole) : data;
  },
  getById: async (id: number) => normalizeRole(await apiFetch(`GET`, `/roles/${id}`)),
  create: async (data: { name: string; billing_rate: number; permissions?: string[]; description?: string; is_active?: boolean }) =>
    normalizeRole(await apiFetch('POST', '/roles', data)),
  update: async (id: number, data: Partial<{ name: string; billing_rate: number; permissions: string[]; description: string; is_active: boolean }>) =>
    normalizeRole(await apiFetch('PUT', `/roles/${id}`, data)),
  delete: (id: number) => apiFetch('DELETE', `/roles/${id}`),
};

// Employee Roles API
export const employeeRolesAPI = {
  getAll: () => apiFetch('GET', '/employee-roles'),
  getById: (employeeId: number) => apiFetch('GET', `/employee-roles/${employeeId}`),
  assignRole: (employeeId: number, data: { role_id: number; notes?: string }) =>
    apiFetch('PUT', `/employee-roles/${employeeId}/role`, data),
  getRoleHistory: (employeeId: number) => apiFetch('GET', `/employee-roles/${employeeId}/role-history`),
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
