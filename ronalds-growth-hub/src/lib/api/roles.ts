/**
 * Roles API - Role Management
 * Handles role CRUD operations and employee role assignments
 */
import { api } from './client';

export interface Role {
  id: number;
  name: string;
  billingRate?: number;
  costRate?: number;
  description?: string;
  permissions: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRoleData {
  name: string;
  billingRate?: number;
  costRate?: number;
  description?: string;
  permissions?: string[];
  isActive?: boolean;
}

export interface UpdateRoleData {
  name?: string;
  billingRate?: number;
  costRate?: number;
  description?: string;
  permissions?: string[];
  isActive?: boolean;
}

export interface EmployeeRole {
  employeeId: number;
  roleId: number;
  role: Role;
  assignedAt: string;
  notes?: string;
}

export interface RoleHistory {
  id: number;
  employeeId: number;
  roleId: number;
  role: Role;
  assignedAt: string;
  removedAt?: string;
  notes?: string;
}

export const rolesAPI = {
  /**
   * Get all roles
   */
  list: async (): Promise<Role[]> => {
    return api.get('/roles');
  },

  /**
   * Alias for list (backwards compatibility)
   */
  getAll: async (): Promise<Role[]> => {
    return api.get('/roles');
  },

  /**
   * Get a role by ID
   */
  getById: async (id: number): Promise<Role> => {
    return api.get(`/roles/${id}`);
  },

  /**
   * Create a new role
   */
  create: async (data: CreateRoleData): Promise<Role> => {
    return api.post('/roles', data);
  },

  /**
   * Update a role
   */
  update: async (id: number, data: UpdateRoleData): Promise<Role> => {
    return api.put(`/roles/${id}`, data);
  },

  /**
   * Delete a role
   */
  delete: async (id: number): Promise<void> => {
    return api.delete(`/roles/${id}`);
  },

  // ==================
  // EMPLOYEE ROLES
  // ==================

  /**
   * Get employee's current role
   */
  getEmployeeRole: async (employeeId: number): Promise<EmployeeRole | null> => {
    return api.get(`/employee-roles/${employeeId}`);
  },

  /**
   * Assign a role to an employee
   */
  assignRoleToEmployee: async (
    employeeId: number,
    roleId: number,
    notes?: string
  ): Promise<EmployeeRole> => {
    return api.put(`/employee-roles/${employeeId}/role`, { roleId, notes });
  },

  /**
   * Get employee's role history
   */
  getEmployeeRoleHistory: async (employeeId: number): Promise<RoleHistory[]> => {
    return api.get(`/employee-roles/${employeeId}/role-history`);
  },
};

export default rolesAPI;
