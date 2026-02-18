import { ReactNode, useMemo } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export type AppRole =
  | "admin"
  | "hr"
  | "gmp"
  | "partner"
  | "manager"
  | "marketing"
  | "finance"
  | "employee";

interface AppRouteGuardProps {
  children: ReactNode;
  allow?: AppRole[];
}

type ModuleAction = "read" | "write" | "approve" | "admin";

const resolveModuleForPath = (pathname: string): { module: string; action: ModuleAction } | null => {
  const path = pathname.toLowerCase();

  if (path === "/clients/new" || /^\/clients\/[^/]+\/edit$/.test(path)) {
    return { module: "clients", action: "write" };
  }

  if (path.startsWith("/admin-job-creation") || path === "/jobs/create") {
    return { module: "jobs", action: "write" };
  }

  if (path.startsWith("/create-evaluation")) {
    return { module: "evaluations", action: "write" };
  }

  if (path.startsWith("/role-management")) {
    return { module: "access_control", action: "admin" };
  }

  if (
    path === "/dashboard" ||
    path.startsWith("/hr-dashboard") ||
    path.startsWith("/partner-dashboard") ||
    path.startsWith("/manager-dashboard") ||
    path.startsWith("/gmp-dashboard") ||
    path.startsWith("/department-dashboard") ||
    path.startsWith("/marketing-dashboard")
  ) {
    return { module: "dashboard", action: "read" };
  }

  if (
    path.startsWith("/clients") ||
    path.startsWith("/client-onboarding-queue") ||
    path.startsWith("/engagement-letters") ||
    path.startsWith("/client-portfolio")
  ) {
    return { module: "clients", action: "read" };
  }

  if (
    path.startsWith("/jobs") ||
    path.startsWith("/admin-job-creation") ||
    path.startsWith("/job-workflow-dashboard") ||
    path.startsWith("/workload-management") ||
    path.startsWith("/team-overview")
  ) {
    return { module: "jobs", action: "read" };
  }

  if (path.startsWith("/timesheets")) {
    return { module: "time_entries", action: "read" };
  }

  if (
    path.startsWith("/employee-management") ||
    path.startsWith("/profile") ||
    path.startsWith("/positions-rates") ||
    path.startsWith("/recruitment-candidates")
  ) {
    return { module: "users", action: "read" };
  }

  if (
    path.startsWith("/evaluations") ||
    path.startsWith("/evaluation-management") ||
    path.startsWith("/create-evaluation") ||
    path.startsWith("/evaluation/") ||
    path.startsWith("/manager-evaluation") ||
    path.startsWith("/project-evaluations") ||
    path.startsWith("/upward-reviews") ||
    path.startsWith("/feedback") ||
    path.startsWith("/continuous-feedback") ||
    path.startsWith("/calibration") ||
    path.startsWith("/staff-development") ||
    path.startsWith("/development-plan")
  ) {
    return { module: "evaluations", action: "read" };
  }

  if (path.startsWith("/kpi-management") || path.startsWith("/goals") || path.startsWith("/scorecard")) {
    return { module: "kpis", action: "read" };
  }

  if (
    path.startsWith("/financial-summary") ||
    path.startsWith("/finance-dashboard") ||
    path.startsWith("/finance-collections") ||
    path.startsWith("/finance-projections") ||
    path.startsWith("/finance-balances") ||
    path.startsWith("/finance-profitability") ||
    path.startsWith("/finance-allocations")
  ) {
    return { module: "finance", action: "read" };
  }

  if (path.startsWith("/business-development")) {
    return { module: "proposals", action: "read" };
  }

  if (path.startsWith("/documents")) {
    return { module: "documents", action: "read" };
  }

  if (path.startsWith("/client-surveys")) {
    return { module: "surveys", action: "read" };
  }

  if (
    path.startsWith("/reports") ||
    path.startsWith("/non-financial-analytics") ||
    path.startsWith("/audit-logs") ||
    path.startsWith("/partner-metrics") ||
    path.startsWith("/partner-portfolio-summary") ||
    path.startsWith("/team-performance")
  ) {
    return { module: "reports", action: "read" };
  }

  if (path.startsWith("/notifications")) {
    return { module: "notifications", action: "read" };
  }

  if (path.startsWith("/todos")) {
    return { module: "dashboard", action: "read" };
  }

  return null;
};

const isRoleLockedPath = (pathname: string) => {
  const path = pathname.toLowerCase();
  return (
    path.startsWith("/hr-dashboard") ||
    path.startsWith("/partner-dashboard") ||
    path.startsWith("/manager-dashboard") ||
    path.startsWith("/gmp-dashboard") ||
    path.startsWith("/department-dashboard") ||
    path.startsWith("/marketing-dashboard")
  );
};

const getDefaultRoute = (
  flags: Record<AppRole, boolean>,
  hasModuleAccess: (module: string, action?: ModuleAction) => boolean
) => {
  if (flags.gmp && hasModuleAccess("dashboard", "read")) return "/gmp-dashboard";
  if ((flags.admin || flags.hr) && hasModuleAccess("dashboard", "read")) return "/hr-dashboard";
  if (flags.partner && hasModuleAccess("dashboard", "read")) return "/partner-dashboard";
  if (flags.manager && hasModuleAccess("dashboard", "read")) return "/manager-dashboard";
  if (flags.marketing && hasModuleAccess("dashboard", "read")) return "/marketing-dashboard";
  if (flags.finance && hasModuleAccess("finance", "read")) return "/finance-dashboard";

  if (hasModuleAccess("dashboard", "read")) return "/dashboard";
  if (hasModuleAccess("users", "read")) return "/profile";
  if (hasModuleAccess("jobs", "read")) return "/job-workflow-dashboard";
  if (hasModuleAccess("clients", "read")) return "/clients";
  if (hasModuleAccess("evaluations", "read")) return "/evaluations";
  if (hasModuleAccess("kpis", "read")) return "/goals";
  if (hasModuleAccess("finance", "read")) return "/financial-summary";
  if (hasModuleAccess("proposals", "read")) return "/business-development";
  if (hasModuleAccess("surveys", "read")) return "/client-surveys";
  if (hasModuleAccess("documents", "read")) return "/documents";
  if (hasModuleAccess("notifications", "read")) return "/notifications";
  if (hasModuleAccess("reports", "read")) return "/reports";
  return "/auth";
};

export default function AppRouteGuard({ children, allow = [] }: AppRouteGuardProps) {
  const location = useLocation();
  const {
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
    hasModuleAccess,
  } = useAuth();

  const flags = useMemo<Record<AppRole, boolean>>(
    () => ({
      admin: isAdmin,
      hr: isHR,
      gmp: isGMP,
      partner: isPartner,
      manager: isManager,
      marketing: isMarketing,
      finance: isFinance,
      employee: isEmployee,
    }),
    [isAdmin, isEmployee, isFinance, isGMP, isHR, isManager, isMarketing, isPartner]
  );

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth" replace state={{ from: location.pathname }} />;
  }

  const moduleRequirement = resolveModuleForPath(location.pathname);
  const hasRequiredModule =
    !moduleRequirement ||
    hasModuleAccess(moduleRequirement.module, moduleRequirement.action);

  if (allow.length > 0 && !allow.some((role) => flags[role])) {
    // Keep strict role gates for specialized dashboards.
    if (!isRoleLockedPath(location.pathname) && hasRequiredModule) {
      return <>{children}</>;
    }

    const redirectTarget = getDefaultRoute(flags, hasModuleAccess);
    if (redirectTarget === location.pathname) {
      return <div className="p-6 text-sm text-muted-foreground">Access denied.</div>;
    }
    return <Navigate to={redirectTarget} replace />;
  }

  if (!hasRequiredModule) {
    const redirectTarget = getDefaultRoute(flags, hasModuleAccess);
    if (redirectTarget === location.pathname) {
      return <div className="p-6 text-sm text-muted-foreground">Access denied.</div>;
    }
    return <Navigate to={redirectTarget} replace />;
  }

  return <>{children}</>;
}
