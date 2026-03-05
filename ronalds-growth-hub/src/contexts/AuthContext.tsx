/**
 * Auth Context - Authentication state management
 * Provides user authentication, role-based access, and session management
 */
import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { authAPI, getToken, clearAuth } from '@/lib/api';
import type { User, Profile } from '@/lib/api/types';
import PageLoader from '@/components/ui/page-loader';
import {
  canonicalizeRoles,
  resolveCanonicalRole,
  type CanonicalRole,
} from "@/auth/canonicalRoles";
import {
  getEffectiveViewEntitlements,
  getViewPermissionDefinition,
} from "@/auth/viewAccess";

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
  knowledge_hub: 'knowledge_hub',
  'knowledge-hub': 'knowledge_hub',
  knowledgehub: 'knowledge_hub',
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
  const normalized = String(value || '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_')
    .toLowerCase();
  return MODULE_KEY_ALIASES[normalized] || normalized;
};

const VIEW_MODULE_ACCESS_FALLBACKS: Record<
  string,
  Array<{ moduleKey: string; action?: ModuleAction }>
> = {
  "finance.collections": [
    { moduleKey: "finance_collections", action: "read" },
  ],
  "finance.projections": [
    { moduleKey: "finance_projections", action: "read" },
  ],
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
  roles: CanonicalRole[];
  viewAccessKeys: string[];
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
  hasAnyRole: (roles: string[]) => boolean;
  hasModuleAccess: (moduleKey: string, action?: ModuleAction) => boolean;
  hasViewAccess: (viewKey: string) => boolean;
  hasPermission: (permission: string) => boolean;
  canAccess: (resource: string, action: string) => boolean;
  
  // Auth actions
  login: (email: string, password: string) => Promise<AuthUser | PasswordSetupRequired>;
  completePasswordSetup: (setupToken: string, newPassword: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

type GlobalAuthContextStore = typeof globalThis & {
  __BSC_AUTH_CONTEXT__?: React.Context<AuthContextType | undefined>;
};

const globalAuthStore = globalThis as GlobalAuthContextStore;
const AuthContext =
  globalAuthStore.__BSC_AUTH_CONTEXT__ ??
  createContext<AuthContextType | undefined>(undefined);

if (!globalAuthStore.__BSC_AUTH_CONTEXT__) {
  globalAuthStore.__BSC_AUTH_CONTEXT__ = AuthContext;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Derived state
  const profile = user?.profile || null;
  const isAuthenticated = !!user && !!getToken();

  // Canonical role checks based on persisted auth roles.
  const rawRoles = Array.isArray(user?.roles) ? user.roles : [];
  const roleNames = rawRoles
    .map((role) => (typeof role === "string" ? role : role?.role?.name))
    .filter(Boolean) as string[];

  const canonicalRoles = useMemo<CanonicalRole[]>(() => {
    return canonicalizeRoles(roleNames);
  }, [roleNames]);

  const viewAccessKeys = useMemo(
    () => getEffectiveViewEntitlements(canonicalRoles),
    [canonicalRoles]
  );
  const viewAccessSet = useMemo(
    () => new Set(viewAccessKeys.map((key) => String(key).toLowerCase().trim())),
    [viewAccessKeys]
  );

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

  const isAdmin = canonicalRoles.includes("super_admin");
  const isHR = canonicalRoles.includes("hr");
  const isGMP = canonicalRoles.includes("gmp");
  const isPartner = canonicalRoles.includes("partner");
  const isMarketing = canonicalRoles.includes("marketing");
  const isFinance = canonicalRoles.includes("finance");
  const isManager = canonicalRoles.includes("manager");
  const isEmployee = canonicalRoles.includes("employee");

  // Helper functions
  const hasRole = useCallback((role: string): boolean => {
    const canonical = resolveCanonicalRole(role);
    return canonical ? canonicalRoles.includes(canonical) : false;
  }, [canonicalRoles]);

  const hasAnyRole = useCallback(
    (rolesToCheck: string[]) => rolesToCheck.some((role) => hasRole(role)),
    [hasRole]
  );

  const hasModuleAccess = useCallback(
    (moduleKey: string, action: ModuleAction = 'read'): boolean => {
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
    [moduleAccessMatrix]
  );

  const hasViewAccess = useCallback(
    (viewKey: string): boolean => {
      const normalizedViewKey = String(viewKey || "").toLowerCase().trim();
      if (!normalizedViewKey) return false;
      if (!viewAccessSet.has(normalizedViewKey)) return false;

      const viewDefinition = getViewPermissionDefinition(normalizedViewKey);
      if (!viewDefinition?.module) return true;

      const requiredAction = viewDefinition.action || "read";
      if (hasModuleAccess(viewDefinition.module, requiredAction)) {
        return true;
      }

      const fallbackChecks = VIEW_MODULE_ACCESS_FALLBACKS[normalizedViewKey] || [];
      return fallbackChecks.some((fallback) =>
        hasModuleAccess(fallback.moduleKey, fallback.action || requiredAction)
      );
    },
    [hasModuleAccess, viewAccessSet]
  );

  const hasPermission = useCallback((permission: string): boolean => {
    const normalized = String(permission || '').toLowerCase().trim();
    const parts = normalized.split('.');
    if (parts.length >= 2 && parts[0] === "view") {
      return hasViewAccess(parts.slice(1).join("."));
    }
    if (parts.length === 3 && parts[0] === 'module') {
      return hasModuleAccess(parts[1], toModuleAction(parts[2]));
    }
    return false;
  }, [hasModuleAccess, hasViewAccess]);

  const canAccess = useCallback((resource: string, action: string): boolean => {
    const moduleKey = normalizeModuleKey(resource);
    return hasModuleAccess(moduleKey, toModuleAction(action));
  }, [hasModuleAccess]);

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

      if (!('token' in response)) {
        throw new Error('Unexpected login response');
      }

      setUser(response.user as AuthUser);
      return response.user as AuthUser;
    } catch (error) {
      setUser(null);
      throw error;
    }
  }, []);

  const completePasswordSetup = useCallback(
    async (setupToken: string, newPassword: string) => {
      const response = await authAPI.completePasswordSetup(setupToken, newPassword);
      setUser(response.user as AuthUser);
      return response.user as AuthUser;
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
    roles: canonicalRoles,
    viewAccessKeys,
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
    hasAnyRole,
    hasModuleAccess,
    hasViewAccess,
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
    return (
      <PageLoader
        message="Checking access..."
        minHeightClassName="min-h-screen"
      />
    );
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
