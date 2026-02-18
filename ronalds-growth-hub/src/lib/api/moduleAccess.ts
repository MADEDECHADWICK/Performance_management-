import { api } from "./client";

export interface ModuleDefinition {
  key: string;
  label: string;
  description: string;
  actions: string[];
}

export interface ModuleRolePolicy {
  id: number;
  name: string;
  description?: string | null;
  isActive: boolean;
  permissionKeys: string[];
  explicitAccess: Record<string, string[]>;
  effectiveAccess: Record<string, string[]>;
}

export interface ModuleUserAccess {
  user: {
    id: number;
    email: string;
    profile?: {
      id: number;
      firstName: string;
      lastName: string;
      status: string;
    } | null;
  };
  roles: string[];
  permissionKeys: string[];
  explicitAccess: Record<string, string[]>;
  effectiveAccess: Record<string, string[]>;
}

const moduleAccessAPI = {
  listModules: () =>
    api.get<{
      modules: ModuleDefinition[];
      actions: string[];
    }>("/module-access/modules"),

  listRolePolicies: () =>
    api.get<{
      roles: ModuleRolePolicy[];
    }>("/module-access/roles"),

  updateRolePolicy: (
    roleName: string,
    access: Record<string, string[]>
  ) =>
    api.put<{
      role: ModuleRolePolicy;
      message: string;
    }>(`/module-access/roles/${roleName}`, { access }),

  getUserAccess: (userId: number) =>
    api.get<ModuleUserAccess>(`/module-access/users/${userId}`),

  getMyAccess: () =>
    api.get<{
      userId: number;
      roles: string[];
      permissionKeys: string[];
      effectiveAccess: Record<string, string[]>;
    }>("/module-access/me"),
};

export default moduleAccessAPI;

