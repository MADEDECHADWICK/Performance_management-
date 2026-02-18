/**
 * Auth Context - Authentication state management
 * Provides user authentication, role-based access, and session management
 */
import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { authAPI, getToken, getUser, clearAuth } from '@/lib/api';
import type { User, Profile } from '@/lib/api/types';

interface AuthUser extends User {
  profile?: Profile;
}

interface PasswordSetupRequired {
  requiresPasswordChange: true;
  setupToken: string;
  email: string;
  name?: string;
}

type ModuleAction = 'read' | 'write' | 'approve' | 'admin';

const MODULE_KEY_ALIASES: Record<string, string> = {
  dashboard: 'dashboard',
  users: 'users',
  user: 'users',
  employees: 'users',
  employee: 'users',
  profiles: 'users',
  profile: 'users',
  roles: 'users',
  clients: 'clients',
  client: 'clients',
  jobs: 'jobs',
  job: 'jobs',
  time_entries: 'time_entries',
  'time-entries': 'time_entries',
  timesheets: 'time_entries',
  evaluations: 'evaluations',
  evaluation: 'evaluations',
  feedback: 'evaluations',
  kpis: 'kpis',
  kpi: 'kpis',
  goals: 'kpis',
  okrs: 'kpis',
  finance: 'finance',
  financials: 'finance',
  proposals: 'proposals',
  surveys: 'surveys',
  documents: 'documents',
  notifications: 'notifications',
  reports: 'reports',
  analytics: 'reports',
  settings: 'settings',
  access_control: 'access_control',
  'access-control': 'access_control',
  'gmp-dashboard': 'dashboard',
  'partner-dashboard': 'dashboard',
  'manager-dashboard': 'dashboard',
  'hr-dashboard': 'dashboard',
};

const MODULE_ACTION_SET = new Set<ModuleAction>(['read', 'write', 'approve', 'admin']);

const normalizeModuleKey = (value: string) => {
  const normalized = String(value || '').toLowerCase().trim();
  return MODULE_KEY_ALIASES[normalized] || normalized;
};

const toModuleAction = (value: string): ModuleAction => {
  const normalized = String(value || '').toLowerCase().trim();
  if (MODULE_ACTION_SET.has(normalized as ModuleAction)) {
    return normalized as ModuleAction;
  }
  if (normalized === 'create' || normalized === 'update' || normalized === 'delete') {
    return 'write';
  }
  return 'read';
};

interface AuthContextType {
  user: AuthUser | null;
  profile: Profile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  
  // Role helpers
  isAdmin: boolean;
  isHR: boolean;
  isGMP: boolean;
  isPartner: boolean;
  isManager: boolean;
  isMarketing: boolean;
  isFinance: boolean;
  isEmployee: boolean;
  
  // Permission helpers
  hasRole: (role: string) => boolean;
  hasModuleAccess: (moduleKey: string, action?: ModuleAction) => boolean;
  hasPermission: (permission: string) => boolean;
  canAccess: (resource: string, action: string) => boolean;
  
  // Auth actions
  login: (email: string, password: string) => Promise<AuthUser | PasswordSetupRequired>;
  completePasswordSetup: (setupToken: string, newPassword: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Derived state
  const profile = user?.profile || null;
  const isAuthenticated = !!user && !!getToken();

  // Role checks based on user's auth roles or position
  const rawRoles = Array.isArray(user?.roles) ? user.roles : [];
  const roleNames = rawRoles
    .map((role) => (typeof role === "string" ? role : role?.role?.name))
    .filter(Boolean) as string[];
  if (Array.isArray((user as any)?.authRoles)) {
    roleNames.push(...((user as any).authRoles as string[]));
  }
  const userRoles = Array.from(new Set(roleNames.map((role) => role.toLowerCase())));
  const positionRole = profile?.role?.name?.toLowerCase() || "";
  const positionTitle = profile?.positionTitle?.toLowerCase() || "";
  const roleSource = `${positionRole} ${positionTitle}`.trim();
  const moduleAccessMatrix = useMemo<Record<string, ModuleAction[]>>(() => {
    const source = user?.moduleAccess;
    if (!source || typeof source !== 'object') return {};

    const normalizedEntries = Object.entries(source as Record<string, unknown>)
      .map(([moduleKey, actions]) => {
        if (!Array.isArray(actions)) return null;
        const normalizedKey = normalizeModuleKey(moduleKey);
        const normalizedActions = Array.from(
          new Set(
            actions
              .map((action) => toModuleAction(String(action)))
              .filter((action) => MODULE_ACTION_SET.has(action))
          )
        );
        return [normalizedKey, normalizedActions] as const;
      })
      .filter((entry): entry is readonly [string, ModuleAction[]] => !!entry);

    return Object.fromEntries(normalizedEntries);
  }, [user?.moduleAccess]);

  const isAdmin = userRoles.includes("admin") || userRoles.includes("super_admin") || userRoles.includes("administrator");
  const isHR =
    userRoles.includes("hr") ||
    userRoles.includes("hr_manager") ||
    userRoles.includes("human_resources") ||
    roleSource.includes("hr");
  const isGMP =
    userRoles.includes("gmp") ||
    userRoles.includes("group_managing_partner") ||
    roleSource.includes("group managing partner") ||
    roleSource.includes("group_managing_partner") ||
    roleSource.includes("gmp");
  const isPartner = profile?.isPartner || userRoles.includes("partner") || roleSource.includes("partner");
  const isMarketing =
    userRoles.includes("marketing") ||
    userRoles.includes("business_development") ||
    roleSource.includes("marketing") ||
    roleSource.includes("business development");
  const isFinance = userRoles.includes("finance") || roleSource.includes("finance");
  const isManager =
    !isAdmin &&
    !isHR &&
    !isGMP &&
    (userRoles.includes("manager") ||
      (roleSource.includes("manager") &&
        !roleSource.includes("hr manager") &&
        !roleSource.includes("managing partner")));
  const isEmployee = isAuthenticated && !isAdmin; // All authenticated users are employees

  // Helper functions
  const hasRole = useCallback((role: string): boolean => {
    const roleLower = role.toLowerCase();
    return userRoles.includes(roleLower) || roleSource.includes(roleLower);
  }, [userRoles, roleSource]);

  const hasModuleAccess = useCallback(
    (moduleKey: string, action: ModuleAction = 'read'): boolean => {
      if (isAdmin) return true;

      const normalizedModuleKey = normalizeModuleKey(moduleKey);
      const normalizedAction = toModuleAction(action);
      const allowedActions = moduleAccessMatrix[normalizedModuleKey] || [];

      if (allowedActions.includes('admin')) return true;
      if (allowedActions.includes(normalizedAction)) return true;

      // Defensive read implication for older payloads.
      if (
        normalizedAction === 'read' &&
        (allowedActions.includes('write') || allowedActions.includes('approve'))
      ) {
        return true;
      }

      return false;
    },
    [isAdmin, moduleAccessMatrix]
  );

  const hasPermission = useCallback((permission: string): boolean => {
    if (isAdmin) return true;
    const normalized = String(permission || '').toLowerCase().trim();
    const parts = normalized.split('.');
    if (parts.length === 3 && parts[0] === 'module') {
      return hasModuleAccess(parts[1], toModuleAction(parts[2]));
    }
    return false;
  }, [isAdmin, hasModuleAccess]);

  const canAccess = useCallback((resource: string, action: string): boolean => {
    // Admin can access everything
    if (isAdmin) return true;

    const moduleKey = normalizeModuleKey(resource);
    if (moduleAccessMatrix[moduleKey]) {
      return hasModuleAccess(moduleKey, toModuleAction(action));
    }

    // Resource-based access control
    switch (resource) {
      case 'employees':
        if (action === 'read') return true; // All can read limited employee info
        if (action === 'write') return isHR || isAdmin;
        break;
      case 'jobs':
        if (action === 'read') return true;
        if (action === 'write') return isPartner || isManager || isHR;
        if (action === 'approve') return isPartner;
        break;
      case 'time-entries':
        if (action === 'read') return true;
        if (action === 'write') return true; // Own time entries
        if (action === 'approve') return isManager || isPartner;
        break;
      case 'evaluations':
        if (action === 'read') return true;
        if (action === 'write') return isHR || isManager;
        if (action === 'admin') return isHR;
        break;
      case 'clients':
        if (action === 'read') return isPartner || isManager || isHR;
        if (action === 'write') return isPartner || isHR;
        break;
      case 'kpis':
        if (action === 'read') return true;
        if (action === 'write') return isHR || isAdmin;
        break;
      case 'reports':
        return isPartner || isManager || isGMP || isHR;
      case 'gmp-dashboard':
        return isGMP;
      case 'partner-dashboard':
        return isPartner;
      case 'manager-dashboard':
        return isManager;
      case 'hr-dashboard':
        return isHR;
    }

    return hasModuleAccess(resource, toModuleAction(action));
  }, [isAdmin, isHR, isGMP, isPartner, isManager, hasModuleAccess, moduleAccessMatrix]);

  // Load user on mount
  useEffect(() => {
    const loadUser = async () => {
      const token = getToken();
      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        const userData = await authAPI.me();
        setUser(userData);
      } catch (error) {
        console.error('Failed to load user:', error);
        clearAuth();
      } finally {
        setIsLoading(false);
      }
    };

    loadUser();
  }, []);

  // Auth actions
  const login = useCallback(async (email: string, password: string) => {
    // Ensure stale sessions do not bleed into a new login attempt.
    setUser(null);
    clearAuth();
    try {
      const response = await authAPI.login(email, password);
      if ('requiresPasswordChange' in response && response.requiresPasswordChange) {
        return {
          requiresPasswordChange: true as const,
          setupToken: response.setupToken,
          email: response.user.email,
          name: response.user.name,
        };
      }

      setUser(response.user);
      return response.user;
    } catch (error) {
      setUser(null);
      throw error;
    }
  }, []);

  const completePasswordSetup = useCallback(
    async (setupToken: string, newPassword: string) => {
      const response = await authAPI.completePasswordSetup(setupToken, newPassword);
      setUser(response.user);
      return response.user;
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await authAPI.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
      clearAuth();
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const userData = await authAPI.me();
      setUser(userData);
    } catch (error) {
      console.error('Failed to refresh user:', error);
    }
  }, []);

  const value: AuthContextType = {
    user,
    profile,
    isLoading,
    isAuthenticated,
    isAdmin,
    isHR,
    isGMP,
    isPartner,
    isManager,
    isMarketing,
    isFinance,
    isEmployee,
    hasRole,
    hasModuleAccess,
    hasPermission,
    canAccess,
    login,
    completePasswordSetup,
    logout,
    refreshUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Protected Route component
interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRoles?: string[];
  requiredPermissions?: string[];
  fallback?: React.ReactNode;
}

export function ProtectedRoute({ 
  children, 
  requiredRoles = [], 
  requiredPermissions = [],
  fallback 
}: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, hasRole, hasPermission } = useAuth();

  if (isLoading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  if (!isAuthenticated) {
    window.location.href = '/auth';
    return null;
  }

  // Check required roles
  if (requiredRoles.length > 0 && !requiredRoles.some(role => hasRole(role))) {
    if (fallback) return <>{fallback}</>;
    return <div className="p-4">Access denied. You don't have the required role.</div>;
  }

  // Check required permissions
  if (requiredPermissions.length > 0 && !requiredPermissions.some(perm => hasPermission(perm))) {
    if (fallback) return <>{fallback}</>;
    return <div className="p-4">Access denied. You don't have the required permission.</div>;
  }

  return <>{children}</>;
}

export default AuthContext;
