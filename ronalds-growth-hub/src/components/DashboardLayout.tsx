import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { getPreferredHomeRoute } from "@/auth/routeAccess";
import { apiFetch, getToken } from "@/lib/api";
import { io, Socket } from "socket.io-client";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  ChevronDown,
  Activity,
  BarChart3,
  DollarSign,
  TrendingUp,
  FileText,
  Target,
  Users,
  ClipboardCheck,
  UserCheck,
  ArrowUpCircle,
  Settings,
  Shield,
  ChartCandlestick,
  FileSpreadsheet,
  User as UserIcon,
  Clock,
  Plus,
  Calendar,
  CheckSquare,
  Briefcase,
  Crown,
  Bell,
  BookOpen,
  Building2,
  ScrollText,
} from "lucide-react";

interface DashboardLayoutProps {
  children: ReactNode;
}

type ModuleAction = "read" | "write" | "approve" | "admin";

type HasModuleAccessFn = (moduleKey: string, action?: ModuleAction) => boolean;
type HasViewAccessFn = (viewKey: string) => boolean;

const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    user,
    profile: userProfile,
    roles,
    homeViewKey,
    isLoading: authLoading,
    hasModuleAccess,
    hasViewAccess,
    logout,
  } = useAuth();

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(`${path}/`);

  // Auto-redirect to appropriate dashboard based on role
  useEffect(() => {
    if (authLoading) return;
    if (user && location.pathname === '/dashboard') {
      const preferredRoute = getPreferredHomeRoute(roles, hasViewAccess, homeViewKey);
      if (preferredRoute !== "/dashboard") {
        navigate(preferredRoute, { replace: true });
      }
    }
  }, [
    authLoading,
    hasViewAccess,
    homeViewKey,
    user,
    roles,
    location.pathname,
    navigate,
  ]);

  const handleSignOut = async () => {
    await logout();
    navigate("/auth");
  };

  const getRoleDisplay = () => {
    if (roles.includes("gmp")) return "Group Managing Partner";
    if (roles.includes("super_admin")) return "Super Administrator";
    if (roles.includes("hr")) return "HR";
    if (roles.includes("partner")) return "Partner";
    if (roles.includes("manager")) return "Manager";
    if (roles.includes("finance")) return "Finance";
    if (roles.includes("marketing")) return "Marketing";
    if (roles.includes("employee")) return "Employee";
    return "User";
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-transparent">
        <AppSidebar 
          hasModuleAccess={hasModuleAccess}
          hasViewAccess={hasViewAccess}
          userId={user?.id ?? null}
          profileId={userProfile?.id ?? null}
          roleName={roles[0] || ""}
          isActive={isActive} 
        />

        <div className="flex-1 min-w-0 flex flex-col">
          {/* Header */}
          <header className="sticky top-0 z-40 border-b border-border/70 bg-background/75 backdrop-blur-xl">
            <div className="px-4 sm:px-6 lg:px-8 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <SidebarTrigger />
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl border border-border/70 bg-background/70 p-1.5 shadow-sm">
                      <img
                        src="/images/logo.png"
                        alt="Ronalds LLP Logo"
                        width={28}
                        height={28}
                      />
                    </div>
                    <div className="space-y-0.5">
                      <h1 className="text-base sm:text-lg font-bold text-foreground">Ronalds LLP</h1>
                      <p className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground hidden sm:block">Performance Management</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right hidden sm:block">
                    <p className="text-sm font-medium text-foreground">{user?.email}</p>
                    <p className="text-xs text-muted-foreground">{getRoleDisplay()}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleSignOut} className="hidden sm:inline-flex">
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign Out
                  </Button>
                  <Button variant="outline" size="icon" onClick={handleSignOut} className="sm:hidden">
                    <LogOut className="h-4 w-4" />
                    <span className="sr-only">Sign Out</span>
                  </Button>
                </div>
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="page-enter flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-6 sm:py-7">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

interface AppSidebarProps {
  hasModuleAccess: HasModuleAccessFn;
  hasViewAccess: HasViewAccessFn;
  userId: number | null;
  profileId: number | null;
  roleName: string;
  isActive: (path: string) => boolean;
}

function AppSidebar({
  hasModuleAccess,
  hasViewAccess,
  userId,
  profileId,
  roleName,
  isActive,
}: AppSidebarProps) {
  const location = useLocation();
  const { state } = useSidebar();
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const socketRef = useRef<Socket | null>(null);
  const canReadNotifications = hasModuleAccess("notifications", "read");

  const loadUnreadNotificationCount = useCallback(async () => {
    if (!canReadNotifications) {
      setUnreadNotificationCount(0);
      return;
    }

    try {
      const response: any = await apiFetch("GET", "/notifications/unread-count");
      const nextCount =
        typeof response?.unreadCount === "number"
          ? response.unreadCount
          : typeof response?.count === "number"
            ? response.count
            : 0;
      setUnreadNotificationCount(Math.max(0, nextCount));
    } catch {
      // Keep current badge value if refresh fails.
    }
  }, [canReadNotifications]);

  useEffect(() => {
    void loadUnreadNotificationCount();
  }, [loadUnreadNotificationCount, location.pathname]);

  useEffect(() => {
    if (!canReadNotifications) return undefined;

    const intervalId = window.setInterval(() => {
      void loadUnreadNotificationCount();
    }, 30000);

    return () => window.clearInterval(intervalId);
  }, [canReadNotifications, loadUnreadNotificationCount]);

  useEffect(() => {
    const handleFocus = () => {
      void loadUnreadNotificationCount();
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [loadUnreadNotificationCount]);

  useEffect(() => {
    if (!canReadNotifications) return undefined;
    if (!profileId) return undefined;

    const token = getToken();
    if (!token) return undefined;

    const socketBaseUrl = (import.meta.env.VITE_API_URL || "http://localhost:4000")
      .replace(/\/api\/?$/, "");

    const socket = io(socketBaseUrl, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionDelay: 3000,
      reconnectionDelayMax: 10000,
      auth: {
        token,
        profileId: String(profileId),
        userId: String(userId ?? ""),
        roleName: roleName || "",
      },
    });

    socketRef.current = socket;

    const refreshBadge = () => {
      void loadUnreadNotificationCount();
    };

    socket.on("connect", refreshBadge);
    socket.on("notification", refreshBadge);

    return () => {
      socket.off("connect", refreshBadge);
      socket.off("notification", refreshBadge);
      socket.disconnect();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [canReadNotifications, loadUnreadNotificationCount, profileId, roleName, userId]);

  const dashboardNav = useMemo<{
    path: string;
    viewKey: string;
    icon: any;
    label: string;
  }>(() => {
    const candidates = [
      {
        path: "/gmp-dashboard",
        viewKey: "dashboard.gmp",
        icon: Crown,
        label: "Executive Dashboard",
      },
      {
        path: "/hr-dashboard",
        viewKey: "dashboard.hr",
        icon: BarChart3,
        label: "Dashboard",
      },
      {
        path: "/partner-dashboard",
        viewKey: "dashboard.partner",
        icon: BarChart3,
        label: "Partner Dashboard",
      },
      {
        path: "/manager-dashboard",
        viewKey: "dashboard.manager",
        icon: BarChart3,
        label: "Manager Dashboard",
      },
      {
        path: "/marketing-dashboard",
        viewKey: "dashboard.marketing",
        icon: BarChart3,
        label: "Marketing Overview",
      },
      {
        path: "/finance-dashboard",
        viewKey: "dashboard.finance",
        icon: BarChart3,
        label: "Finance Overview",
      },
      {
        path: "/dashboard",
        viewKey: "dashboard.employee",
        icon: BarChart3,
        label: "Dashboard",
      },
    ];

    return (
      candidates.find((candidate) => hasViewAccess(candidate.viewKey)) || candidates[candidates.length - 1]
    );
  }, [hasViewAccess]);

  const analyticsNav = useMemo<{
    viewKey: string;
    icon: any;
    label: string;
    path: string;
    module?: string;
    action?: ModuleAction;
  }>(() => {
    const candidates = [
      { viewKey: "analytics.gmp", path: "/analytics/gmp", icon: TrendingUp, label: "Analytics" },
      { viewKey: "analytics.hr", path: "/analytics/hr", icon: TrendingUp, label: "Analytics" },
      { viewKey: "analytics.partner", path: "/analytics/partner", icon: TrendingUp, label: "Analytics" },
      { viewKey: "analytics.manager", path: "/analytics/manager", icon: TrendingUp, label: "Analytics" },
      { viewKey: "analytics.marketing", path: "/analytics/marketing", icon: TrendingUp, label: "Analytics" },
      { viewKey: "analytics.finance", path: "/analytics/finance", icon: TrendingUp, label: "Analytics" },
      { viewKey: "analytics.employee", path: "/analytics/employee", icon: TrendingUp, label: "Analytics" },
    ];

    return (
      candidates.find((candidate) => hasViewAccess(candidate.viewKey)) || candidates[candidates.length - 1]
    );
  }, [hasViewAccess]);

  const canShowAnyView = useCallback(
    (viewKeys: string[]) => viewKeys.some((viewKey) => hasViewAccess(viewKey)),
    [hasViewAccess]
  );

  const NavItem = ({
    path,
    icon: Icon,
    label,
    viewKey,
    module,
    action = "read",
    badgeCount,
  }: {
    path: string;
    icon: any;
    label: string;
    viewKey?: string;
    module?: string;
    action?: ModuleAction;
    badgeCount?: number;
  }) => {
    if (viewKey && !hasViewAccess(viewKey)) return null;
    if (module && !hasModuleAccess(module, action)) return null;
    const hasBadge = typeof badgeCount === "number" && badgeCount > 0;
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          asChild
          isActive={isActive(path)}
          className={hasBadge ? "pr-8" : undefined}
        >
          <a href={path} className="flex w-full items-center gap-2 rounded-xl">
            <Icon className="h-4 w-4" />
            {state !== "collapsed" && <span>{label}</span>}
          </a>
        </SidebarMenuButton>
        {hasBadge ? (
          <SidebarMenuBadge className="bg-destructive text-destructive-foreground">
            {badgeCount > 99 ? "99+" : badgeCount}
          </SidebarMenuBadge>
        ) : null}
      </SidebarMenuItem>
    );
  };

  const hasMarketingSectionAccess = canShowAnyView([
    "clients.list",
    "clients.create_edit",
    "clients.engagement_letters",
    "clients.onboarding_queue",
    "clients.business_development",
    "clients.surveys",
    "clients.portfolio",
  ]);

  const hasFinanceSectionAccess = canShowAnyView([
    "finance.collections",
    "finance.projections",
    "finance.balances",
    "finance.profitability",
    "finance.allocations",
    "finance.invoices",
  ]);

  const hasManagementSectionAccess = canShowAnyView([
    "people.employee_management",
    "leave.admin",
    "requisitions.admin",
    "people.recruitment_candidates",
    "jobs.admin_create",
    "jobs.workflow",
    "evaluations.management",
    "evaluations.calibration",
    "people.positions_rates",
    "reports.audit_logs",
    "reports.ops_center",
  ]);

  const hasPartnerToolsSectionAccess = canShowAnyView([
    "clients.portfolio",
    "clients.business_development",
    "partner.metrics",
    "jobs.team_overview",
  ]);

  const hasTeamManagementSectionAccess = canShowAnyView([
    "leave.approvals",
    "requisitions.approvals",
    "team.performance",
    "dashboard.department",
    "team.staff_development",
    "jobs.workload_management",
  ]);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border/80 p-4">
        <div className="flex items-center gap-2">
          <img
            src="/images/logo.png"
            alt="Ronalds LLP Logo"
            width={36}
            height={36}
          />
          {state !== "collapsed" && <span className="text-sm font-semibold tracking-wide">Ronalds LLP</span>}
        </div>
      </SidebarHeader>

      <SidebarContent className="stagger-in pb-4">
        {/* Dashboard */}
        <SidebarGroup>
          <SidebarGroupLabel>Overview</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <NavItem
                path={dashboardNav.path}
                icon={dashboardNav.icon}
                label={dashboardNav.label}
                viewKey={dashboardNav.viewKey}
              />
              <NavItem
                path={analyticsNav.path}
                icon={analyticsNav.icon}
                label={analyticsNav.label}
                viewKey={analyticsNav.viewKey}
                module={analyticsNav.module}
                action={analyticsNav.action}
              />
              <NavItem
                path="/bsc-management"
                icon={Target}
                label="BSC & KPIs"
              />
              <NavItem
                path="/kpi-scorecard"
                icon={TrendingUp}
                label="KPI Scorecard"
                viewKey="kpi.scorecard"
              />
              <NavItem
                path="/firm-kpi-manager"
                icon={Building2}
                label="Firm KPI Templates"
                viewKey="kpi.firm_templates"
              />
              <NavItem
                path="/my-proposals"
                icon={ScrollText}
                label="My Proposals"
                viewKey="proposals.my"
              />
              <NavItem
                path="/reports"
                icon={FileSpreadsheet}
                label="Reports"
                viewKey="reports.workspace"
                module="reports"
              />
              <NavItem
                path="/knowledge-hub"
                icon={BookOpen}
                label="Knowledge Hub"
                viewKey="knowledge.hub"
                module="knowledge_hub"
              />
              <NavItem
                path="/notifications"
                icon={Bell}
                label="Notifications"
                viewKey="notifications.center"
                module="notifications"
                badgeCount={unreadNotificationCount}
              />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* My Portforlio */}
        <Collapsible className="group/collapsible">
          <SidebarGroup>
            <SidebarGroupLabel asChild>
              <CollapsibleTrigger className="flex w-full items-center justify-between">
                My Portfolio
                <ChevronDown className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-180" />
              </CollapsibleTrigger>
            </SidebarGroupLabel>
            <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <NavItem path="/profile" icon={UserIcon} label="Profile" viewKey="profile.my" module="users" />
		                    <NavItem path="/todos" icon={CheckSquare} label="My To-Dos" viewKey="todos.my" />
		                    <NavItem path="/timesheets" icon={Clock} label="Timesheets" viewKey="timesheets.my" module="time_entries" />
			                    <NavItem path="/leave" icon={Calendar} label="My Leave" viewKey="leave.my" module="leave" />
		                    <NavItem path="/requisitions" icon={FileText} label="Requisitions" viewKey="requisitions.my" module="requisitions" />
		                    <NavItem path="/development-plan" icon={FileText} label="Development Plan" viewKey="development.plan" module="evaluations" />
	                  </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </SidebarGroup>
        </Collapsible>

        {/* Evaluations */}
        <Collapsible className="group/collapsible">
          <SidebarGroup>
            <SidebarGroupLabel asChild>
              <CollapsibleTrigger className="flex w-full items-center justify-between">
                Evaluations
                <ChevronDown className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-180" />
              </CollapsibleTrigger>
            </SidebarGroupLabel>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  <NavItem
                    path="/evaluations"
                    icon={ClipboardCheck}
                    label="Evaluations"
                    viewKey="evaluations.my"
                    module="evaluations"
                  />
                  <NavItem
                    path="/evaluations/cycles"
                    icon={Calendar}
                    label="Create & Launch"
                    viewKey="evaluations.management"
                    module="evaluations"
                  />
                  <NavItem
                    path="/evaluations/feedback"
                    icon={Users}
                    label="Feedback"
                    viewKey="feedback.continuous"
                    module="evaluations"
                  />
                  <NavItem
                    path="/project-evaluations"
                    icon={ClipboardCheck}
                    label="Project Evaluations"
                    viewKey="evaluations.project_view"
                    module="evaluations"
                  />
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </SidebarGroup>
        </Collapsible>

        {/* Financials */}
        {hasViewAccess("finance.summary") && (
          <SidebarGroup>
            <SidebarGroupLabel>Financials</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <NavItem
                  path="/financial-summary"
                  icon={DollarSign}
                  label="Financial Summary"
                  viewKey="finance.summary"
                  module="finance"
                />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Marketing */}
        {hasMarketingSectionAccess && (
          <Collapsible className="group/collapsible">
            <SidebarGroup>
              <SidebarGroupLabel asChild>
                <CollapsibleTrigger className="flex w-full items-center justify-between">
                  Marketing
                  <ChevronDown className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-180" />
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <NavItem path="/clients" icon={Users} label="Client Management" viewKey="clients.list" module="clients" />
                    <NavItem path="/clients/new" icon={Plus} label="New Client" viewKey="clients.create_edit" module="clients" action="write" />
                    <NavItem path="/engagement-letters" icon={FileText} label="Engagement Letters" viewKey="clients.engagement_letters" module="clients" />
                    <NavItem path="/client-onboarding-queue" icon={ClipboardCheck} label="Jobs Creation" viewKey="clients.onboarding_queue" module="clients" />
                    <NavItem path="/business-development" icon={TrendingUp} label="Pipeline" viewKey="clients.business_development" module="proposals" />
                    <NavItem path="/client-surveys" icon={FileText} label="Client Surveys" viewKey="clients.surveys" module="surveys" />
                    <NavItem path="/client-portfolio" icon={Briefcase} label="Client Portfolio" viewKey="clients.portfolio" module="clients" />
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        )}

        {/* Finance */}
        {hasFinanceSectionAccess && (
          <Collapsible className="group/collapsible">
            <SidebarGroup>
              <SidebarGroupLabel asChild>
                <CollapsibleTrigger className="flex w-full items-center justify-between">
                  Finance
                  <ChevronDown className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-180" />
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <NavItem path="/finance-collections" icon={DollarSign} label="Collections" viewKey="finance.collections" />
                    <NavItem path="/finance-projections" icon={TrendingUp} label="Projections" viewKey="finance.projections" />
                    <NavItem path="/finance-balances" icon={BarChart3} label="Balances" viewKey="finance.balances" module="finance" />
                    <NavItem path="/finance-profitability" icon={TrendingUp} label="Profitability" viewKey="finance.profitability" module="finance" />
                    <NavItem path="/finance-allocations" icon={FileSpreadsheet} label="Allocations" viewKey="finance.allocations" module="finance" />
                    <NavItem path="/finance-invoices" icon={FileText} label="Invoices" viewKey="finance.invoices" module="finance" />
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        )}

        {/* HR/Admin: Management */}
        {hasManagementSectionAccess && (
          <Collapsible className="group/collapsible">
            <SidebarGroup>
              <SidebarGroupLabel asChild>
                <CollapsibleTrigger className="flex w-full items-center justify-between">
                  Management
                  <ChevronDown className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-180" />
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
	                    <NavItem path="/employee-management" icon={Users} label="Employee Management" viewKey="people.employee_management" module="users" action="approve" />
		                    <NavItem path="/leave/admin" icon={Calendar} label="Leave Admin" viewKey="leave.admin" module="leave" action="admin" />
		                    <NavItem path="/requisitions/admin" icon={FileText} label="Requisition Admin" viewKey="requisitions.admin" module="requisitions" action="admin" />
		                    <NavItem path="/recruitment-candidates" icon={UserCheck} label="Recruitment Pipeline" viewKey="people.recruitment_candidates" module="users" />
	                    <NavItem path="/admin-job-creation" icon={Plus} label="Create Job" viewKey="jobs.admin_create" module="jobs" action="write" />
                    <NavItem path="/job-workflow-dashboard" icon={ChartCandlestick} label="Job Operations" viewKey="jobs.workflow" module="jobs" />
	                    <NavItem path="/calibration" icon={Settings} label="Calibration" viewKey="evaluations.calibration" module="evaluations" />
                    <NavItem path="/positions-rates" icon={DollarSign} label="Positions & Rates" viewKey="people.positions_rates" module="users" />
                    <NavItem path="/audit-logs" icon={Shield} label="Audit Logs" viewKey="reports.audit_logs" module="reports" />
                    <NavItem path="/ops-center" icon={Activity} label="Ops Center" viewKey="reports.ops_center" module="reports" />
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        )}

        {/* Partner-specific features */}
        {hasPartnerToolsSectionAccess && (
          <Collapsible className="group/collapsible">
            <SidebarGroup>
              <SidebarGroupLabel asChild>
                <CollapsibleTrigger className="flex w-full items-center justify-between">
                  Partner Tools
                  <ChevronDown className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-180" />
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <NavItem path="/client-portfolio" icon={Users} label="Client Portfolio" viewKey="clients.portfolio" module="clients" />
                    <NavItem path="/business-development" icon={TrendingUp} label="Business Development" viewKey="clients.business_development" module="proposals" />
                    <NavItem path="/partner-metrics" icon={BarChart3} label="Partner Metrics" viewKey="partner.metrics" module="reports" />
                    <NavItem path="/team-overview" icon={Briefcase} label="Team Overview" viewKey="jobs.team_overview" module="jobs" />
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        )}

        {/* Manager-specific features */}
        {hasTeamManagementSectionAccess && (
          <Collapsible className="group/collapsible">
            <SidebarGroup>
              <SidebarGroupLabel asChild>
                <CollapsibleTrigger className="flex w-full items-center justify-between">
                  Team Management
                  <ChevronDown className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-180" />
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
	                    <NavItem path="/team-performance" icon={Users} label="Team Performance" viewKey="team.performance" module="reports" />
	                    <NavItem path="/department-dashboard" icon={BarChart3} label="Department Dashboard" viewKey="dashboard.department" module="dashboard" />
		                    <NavItem path="/leave/approvals" icon={Calendar} label="Leave Approvals" viewKey="leave.approvals" module="leave" action="approve" />
		                    <NavItem path="/requisitions/approvals" icon={FileText} label="Requisition Approvals" viewKey="requisitions.approvals" module="requisitions" action="approve" />
		                    <NavItem path="/staff-development" icon={ArrowUpCircle} label="Staff Development" viewKey="team.staff_development" module="evaluations" />
	                    <NavItem path="/workload-management" icon={Briefcase} label="Workload Management" viewKey="jobs.workload_management" module="jobs" />
	                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        )}
      </SidebarContent>
    </Sidebar>
  );
}

export default DashboardLayout;
