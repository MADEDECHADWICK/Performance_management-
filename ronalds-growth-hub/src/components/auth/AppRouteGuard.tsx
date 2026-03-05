import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import PageLoader from "@/components/ui/page-loader";
import {
  getPreferredHomeRoute,
  getRouteAccessRule,
} from "@/auth/routeAccess";

interface AppRouteGuardProps {
  children: ReactNode;
}

export default function AppRouteGuard({ children }: AppRouteGuardProps) {
  const location = useLocation();
  const {
    isLoading,
    isAuthenticated,
    roles,
    profile,
    isAdmin,
    isHR,
    isGMP,
    hasModuleAccess,
    hasViewAccess,
  } = useAuth();

  if (isLoading) {
    return (
      <div className="p-6">
        <PageLoader message="Loading..." minHeightClassName="min-h-[220px]" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth" replace state={{ from: location.pathname }} />;
  }

  const onboardingRequired =
    !!profile &&
    !isAdmin &&
    !isHR &&
    !isGMP &&
    (String(profile.onboardingStatus || "").toLowerCase() !== "completed" ||
      !profile.onboardingChecklistCompleted ||
      !profile.inductionCompleted);

  if (onboardingRequired) {
    const normalizedPath = String(location.pathname || "").toLowerCase();
    const isProfilePath = normalizedPath === "/profile";
    const isOnboardingTab =
      isProfilePath &&
      String(new URLSearchParams(location.search).get("tab") || "").toLowerCase() === "onboarding";
    const allowlistedPath = normalizedPath.startsWith("/notifications");

    if (!isOnboardingTab && !allowlistedPath) {
      return <Navigate to="/profile?tab=onboarding" replace />;
    }
  }

  const routeRule = getRouteAccessRule(location.pathname);
  const hasRouteViewAccess = !routeRule?.viewKey || hasViewAccess(routeRule.viewKey);
  const routeAction = routeRule?.action || "read";
  const hasRouteModuleFallback =
    routeRule?.viewKey === "finance.collections"
      ? hasModuleAccess("finance_collections", routeAction)
      : routeRule?.viewKey === "finance.projections"
        ? hasModuleAccess("finance_projections", routeAction)
        : false;
  const hasRouteModuleAccess =
    !routeRule?.module ||
    hasModuleAccess(routeRule.module, routeAction) ||
    hasRouteModuleFallback;

  if (!hasRouteViewAccess || !hasRouteModuleAccess) {
    const redirectTarget = getPreferredHomeRoute(roles, hasViewAccess);
    if (redirectTarget === location.pathname) {
      return <div className="p-6 text-sm text-muted-foreground">Access denied.</div>;
    }
    return <Navigate to={redirectTarget} replace />;
  }

  return <>{children}</>;
}
