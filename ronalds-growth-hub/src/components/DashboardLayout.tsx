import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
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
} from "lucide-react";

interface DashboardLayoutProps {
  children: ReactNode;
}

type ModuleAction = "read" | "write" | "approve" | "admin";

type HasModuleAccessFn = (moduleKey: string, action?: ModuleAction) => boolean;

const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    user,
    profile: userProfile,
    isLoading: authLoading,
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
    logout,
  } = useAuth();

  const normalizedRoles = useMemo(() => {
    const roleCandidates = Array.isArray(user?.roles)
      ? user.roles
      : Array.isArray((user as any)?.authRoles)
        ? (user as any).authRoles
        : [];
    return roleCandidates
      .map((role: any) => (typeof role === "string" ? role : role?.role?.name))
      .filter(Boolean)
      .map((role: string) => role.toLowerCase());
  }, [user]);
  const normalizedPosition = userProfile?.positionTitle?.toLowerCase() || '';
  const isHROrAdmin =
    isAdmin ||
    isHR ||
    normalizedPosition.includes('administrator') ||
    normalizedPosition.includes('hr') ||
    false;
  const isSeniorAssociate = hasRole('senior associate');
  const isAssociate = hasRole('associate');

  const isActive = (path: string) => location.pathname === path;

  // Auto-redirect to appropriate dashboard based on role
  useEffect(() => {
    if (authLoading) return;
    if (user && location.pathname === '/dashboard') {
      if (isGMP) {
        navigate('/gmp-dashboard', { replace: true });
      } else if (isHROrAdmin) {
        navigate('/hr-dashboard', { replace: true });
      } else if (isPartner) {
        navigate('/partner-dashboard', { replace: true });
      } else if (isManager) {
        navigate('/manager-dashboard', { replace: true });
      } else if (isMarketing) {
        navigate('/marketing-dashboard', { replace: true });
      } else if (isFinance) {
        navigate('/finance-dashboard', { replace: true });
      }
    }
  }, [
    authLoading,
    user,
    userProfile,
    isGMP,
    isHROrAdmin,
    isPartner,
    isManager,
    isMarketing,
    isFinance,
    location.pathname,
    navigate,
  ]);

  const handleSignOut = async () => {
    await logout();
    navigate("/auth");
  };

  const getRoleDisplay = () => {
    // Check if user is GMP first (highest level)
    if (normalizedRoles.includes('group managing partner') || normalizedRoles.includes('group_managing_partner') || normalizedRoles.includes('gmp') ||
        userProfile?.positionTitle?.toLowerCase().includes('group managing partner')) {
      return "Group Managing Partner";
    }
    
    // Check if user is partner based on is_partner flag
    if (userProfile?.isPartner) return "Partner";
    
    // Check position for admin
    if (userProfile?.positionTitle?.toLowerCase().includes('administrator')) return "System Administrator";
    
    // Check role from database
    if (normalizedRoles.length > 0) {
      const role = normalizedRoles[0];
      if (role === 'partner') return "Partner";
      if (role === 'manager') return "Manager";
      if (role === 'marketing') return "Marketing";
      if (role === 'finance') return "Finance";
      if (role === 'senior associate') return "Senior Associate";
      if (role === 'associate') return "Associate";
      if (role === 'super_admin' || role === 'admin') return "Super Administrator";
      if (role === 'hr_manager' || role === 'hr') return "HR Manager";
    }
    
    // Check position for manager roles
    if (userProfile?.positionTitle?.toLowerCase().includes('manager')) return "Manager";
    
  return "Employee";
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-transparent">
        <AppSidebar 
          isHROrAdmin={isHROrAdmin} 
          isManager={isManager} 
          isPartner={isPartner} 
          isGMP={isGMP} 
          isEmployee={isEmployee}
          isSeniorAssociate={isSeniorAssociate}
          isAssociate={isAssociate}
          isMarketing={isMarketing}
          isFinance={isFinance}
          hasModuleAccess={hasModuleAccess}
          userId={user?.id ?? null}
          profileId={userProfile?.id ?? null}
          roleName={userProfile?.role?.name || normalizedRoles[0] || ""}
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
  isHROrAdmin: boolean;
  isManager: boolean;
  isPartner: boolean;
  isGMP: boolean;
  isEmployee: boolean;
  isSeniorAssociate: boolean;
  isAssociate: boolean;
  isMarketing: boolean;
  isFinance: boolean;
  hasModuleAccess: HasModuleAccessFn;
  userId: number | null;
  profileId: number | null;
  roleName: string;
  isActive: (path: string) => boolean;
}

function AppSidebar({
  isHROrAdmin,
  isManager,
  isPartner,
  isGMP,
  isEmployee,
  isSeniorAssociate,
  isAssociate,
  isMarketing,
  isFinance,
  hasModuleAccess,
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

  const analyticsNav = useMemo<{
    path: string;
    module?: string;
    action?: ModuleAction;
    label: string;
  }>(() => {
    if (isGMP) {
      return { path: "/analytics/gmp", label: "Analytics" };
    }

    if (isHROrAdmin) {
      return { path: "/analytics/hr", label: "Analytics" };
    }

    if (isPartner) {
      return { path: "/analytics/partner", label: "Analytics" };
    }

    if (isManager) {
      return { path: "/analytics/manager", label: "Analytics" };
    }

    if (isMarketing) {
      return { path: "/analytics/marketing", label: "Analytics" };
    }

    if (isFinance) {
      return { path: "/analytics/finance", label: "Analytics" };
    }

    if (isEmployee) {
      return { path: "/analytics/employee", label: "Analytics" };
    }

    return { path: "/analytics/employee", label: "Analytics" };
  }, [
    isEmployee,
    isFinance,
    isGMP,
    isHROrAdmin,
    isManager,
    isMarketing,
    isPartner,
  ]);

  const NavItem = ({
    path,
    icon: Icon,
    label,
    module,
    action = "read",
    badgeCount,
  }: {
    path: string;
    icon: any;
    label: string;
    module?: string;
    action?: ModuleAction;
    badgeCount?: number;
  }) => {
    if (module && !hasModuleAccess(module, action)) return null;
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          asChild
          isActive={isActive(path)}
          className={badgeCount && badgeCount > 0 ? "pr-8" : undefined}
        >
          <a href={path} className="flex w-full items-center gap-2 rounded-xl">
            <Icon className="h-4 w-4" />
            {state !== "collapsed" && <span>{label}</span>}
          </a>
        </SidebarMenuButton>
        {badgeCount && badgeCount > 0 && (
          <SidebarMenuBadge className="bg-destructive text-destructive-foreground">
            {badgeCount > 99 ? "99+" : badgeCount}
          </SidebarMenuBadge>
        )}
      </SidebarMenuItem>
    );
  };

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
              {isGMP ? (
                <NavItem path="/gmp-dashboard" icon={Crown} label="Executive Dashboard" module="dashboard" />
              ) : isHROrAdmin ? (
                <NavItem path="/hr-dashboard" icon={BarChart3} label="Dashboard" module="dashboard" />
              ) : isPartner ? (
                <NavItem path="/partner-dashboard" icon={BarChart3} label="Partner Dashboard" module="dashboard" />
              ) : isManager ? (
                <NavItem path="/manager-dashboard" icon={BarChart3} label="Manager Dashboard" module="dashboard" />
              ) : isMarketing ? (
                <NavItem path="/marketing-dashboard" icon={BarChart3} label="Marketing Overview" module="dashboard" />
              ) : isFinance ? (
                <NavItem path="/finance-dashboard" icon={BarChart3} label="Finance Overview" module="dashboard" />
              ) : (
                <NavItem path="/dashboard" icon={BarChart3} label="Dashboard" module="dashboard" />
              )}
              <NavItem
                path={analyticsNav.path}
                icon={TrendingUp}
                label={analyticsNav.label}
                module={analyticsNav.module}
                action={analyticsNav.action}
              />
              <NavItem path="/reports" icon={FileText} label="Reports" module="reports" />
              <NavItem path="/knowledge-hub" icon={BookOpen} label="Knowledge Hub" module="knowledge_hub" />
              <NavItem
                path="/notifications"
                icon={Bell}
                label="Notifications"
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
                  <NavItem path="/profile" icon={UserIcon} label="Profile" module="users" />
                  <NavItem path="/scorecard" icon={Target} label="Scorecard" module="kpis" />
                  <NavItem path="/goals" icon={Target} label="Goals" module="kpis" />
                  <NavItem path="/todos" icon={CheckSquare} label="My To-Dos" />
                  <NavItem path="/timesheets" icon={Clock} label="Timesheets" module="time_entries" />
                  <NavItem path="/development-plan" icon={FileText} label="Development Plan" module="evaluations" />
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
                  <NavItem path="/evaluations" icon={ClipboardCheck} label="Evaluations" module="evaluations" />
                  <NavItem path="/continuous-feedback" icon={Users} label="Feedback" module="evaluations" />
                  {(isManager || isHROrAdmin) && (
                    <NavItem path="/manager-evaluation" icon={UserCheck} label="Team Evaluations" module="evaluations" />
                  )}
                  {(isManager || isPartner || isHROrAdmin) && (
                    <NavItem path="/project-evaluations" icon={ClipboardCheck} label="Project Evaluations" module="evaluations" />
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </SidebarGroup>
        </Collapsible>

        {/* Financials */}
        {hasModuleAccess("finance", "read") && (
          <SidebarGroup>
            <SidebarGroupLabel>Financials</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <NavItem path="/financial-summary" icon={DollarSign} label="Financial Summary" module="finance" />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Marketing */}
        {isMarketing && (
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
                    <NavItem path="/clients" icon={Users} label="Client Intake" module="clients" />
                    <NavItem path="/clients/new" icon={Plus} label="New Client" module="clients" action="write" />
                    <NavItem path="/engagement-letters" icon={FileText} label="Engagement Letters" module="clients" />
                    <NavItem path="/client-onboarding-queue" icon={ClipboardCheck} label="Onboarding Queue" module="clients" />
                    <NavItem path="/business-development" icon={TrendingUp} label="Pipeline" module="proposals" />
                    <NavItem path="/client-surveys" icon={FileText} label="Client Surveys" module="surveys" />
                    <NavItem path="/client-portfolio" icon={Briefcase} label="Client Portfolio" module="clients" />
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        )}

        {/* Finance */}
        {isFinance && (
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
                    <NavItem path="/finance-collections" icon={DollarSign} label="Collections" module="finance" />
                    <NavItem path="/finance-projections" icon={TrendingUp} label="Projections" module="finance" />
                    <NavItem path="/finance-balances" icon={BarChart3} label="Balances" module="finance" />
                    <NavItem path="/finance-profitability" icon={TrendingUp} label="Profitability" module="finance" />
                    <NavItem path="/finance-allocations" icon={FileSpreadsheet} label="Allocations" module="finance" />
                    <NavItem path="/reports" icon={FileSpreadsheet} label="Reports" module="reports" />
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        )}

        {/* HR/Admin: Management */}
        {isHROrAdmin && (
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
                    <NavItem path="/employee-management" icon={Users} label="Employee Management" module="users" />

                    <NavItem path="/recruitment-candidates" icon={UserCheck} label="Recruitment Pipeline" module="users" />
                    <NavItem path="/client-onboarding-queue" icon={ClipboardCheck} label="Onboarding Queue" module="clients" />
                    <NavItem path="/admin-job-creation" icon={Plus} label="Create Job" module="jobs" action="write" />
                    <NavItem path="/job-workflow-dashboard" icon={ChartCandlestick} label="Job Workflow" module="jobs" />
                    <NavItem path="/evaluation-management" icon={Calendar} label="Evaluations" module="evaluations" />
                    <NavItem path="/kpi-management" icon={Settings} label="KPIs" module="kpis" />
                    <NavItem path="/calibration" icon={Settings} label="Calibration" module="evaluations" />
                    <NavItem path="/positions-rates" icon={DollarSign} label="Positions & Rates" module="users" />
                    <NavItem path="/audit-logs" icon={Shield} label="Audit Logs" module="reports" />
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        )}

        {/* Partner-specific features */}
        {isPartner && (
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
                    <NavItem path="/client-portfolio" icon={Users} label="Client Portfolio" module="clients" />
                    <NavItem path="/business-development" icon={TrendingUp} label="Business Development" module="proposals" />
                    <NavItem path="/partner-metrics" icon={BarChart3} label="Partner Metrics" module="reports" />
                    <NavItem path="/team-overview" icon={Briefcase} label="Team Overview" module="jobs" />
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        )}

        {/* Manager-specific features */}
        {isManager && !isPartner && (
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
                    <NavItem path="/team-performance" icon={Users} label="Team Performance" module="reports" />
                    <NavItem path="/department-dashboard" icon={BarChart3} label="Department Dashboard" module="dashboard" />
                    <NavItem path="/staff-development" icon={ArrowUpCircle} label="Staff Development" module="evaluations" />
                    <NavItem path="/workload-management" icon={Briefcase} label="Workload Management" module="jobs" />
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

