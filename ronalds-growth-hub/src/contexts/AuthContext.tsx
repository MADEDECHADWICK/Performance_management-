/**
 * Auth Context - Authentication state management
 * Provides user authentication, role-based access, and session management
 */
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { authAPI, getToken, getUser, clearAuth } from '@/lib/api';
import type { User, Profile } from '@/lib/api/types';

interface AuthUser extends User {
  profile?: Profile;
}

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
  isEmployee: boolean;
  
  // Permission helpers
  hasRole: (role: string) => boolean;
  hasPermission: (permission: string) => boolean;
  canAccess: (resource: string, action: string) => boolean;
  
  // Auth actions
  login: (email: string, password: string) => Promise<void>;
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
    .map((role) => (typeof role === 'string' ? role : role?.role?.name))
    .filter(Boolean) as string[];
  if (Array.isArray((user as any)?.authRoles)) {
    roleNames.push(...((user as any).authRoles as string[]));
  }
  const userRoles = Array.from(new Set(roleNames.map((role) => role.toLowerCase())));
  const positionRole = profile?.role?.name?.toLowerCase() || '';

  const isAdmin = userRoles.includes('admin') || userRoles.includes('super_admin') || userRoles.includes('administrator');
  const isHR = userRoles.includes('hr') || userRoles.includes('hr_manager') || userRoles.includes('human_resources') || positionRole.includes('hr');
  const isGMP = userRoles.includes('gmp') || userRoles.includes('group_managing_partner') || positionRole.includes('gmp');
  const isPartner = profile?.isPartner || userRoles.includes('partner') || positionRole.includes('partner');
  const isManager = userRoles.includes('manager') || positionRole.includes('manager');
  const isEmployee = isAuthenticated && !isAdmin; // All authenticated users are employees

  // Helper functions
  const hasRole = useCallback((role: string): boolean => {
    const roleLower = role.toLowerCase();
    return userRoles.includes(roleLower) || positionRole.includes(roleLower);
  }, [userRoles, positionRole]);

  const hasPermission = useCallback((permission: string): boolean => {
    // TODO: Implement proper permission checking based on user's auth role permissions
    // For now, admins have all permissions
    if (isAdmin) return true;
    return false;
  }, [isAdmin]);

  const canAccess = useCallback((resource: string, action: string): boolean => {
    // Admin can access everything
    if (isAdmin) return true;

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

    return false;
  }, [isAdmin, isHR, isGMP, isPartner, isManager]);

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
    const response = await authAPI.login(email, password);
    setUser(response.user);
  }, []);

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
    isEmployee,
    hasRole,
    hasPermission,
    canAccess,
    login,
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
