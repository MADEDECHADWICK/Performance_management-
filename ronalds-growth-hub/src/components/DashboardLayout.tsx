import { ReactNode, useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Building2, LogOut } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
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
  Upload,
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
} from "lucide-react";

interface DashboardLayoutProps {
  children: ReactNode;
}

type ModuleAction = "read" | "write" | "approve" | "admin";

type HasModuleAccessFn = (moduleKey: string, action?: ModuleAction) => boolean;

const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
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
      <div className="min-h-screen flex w-full bg-gradient-to-br from-primary/5 via-background to-secondary/5">
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
          isActive={isActive} 
        />

        <div className="flex-1 min-w-0 flex flex-col">
          {/* Header */}
          <header className="bg-card border-b border-border shadow-sm sticky top-0 z-50">
            <div className="px-4 sm:px-6 lg:px-8 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <SidebarTrigger />
                  <div className="flex items-center gap-2">
                    {/* <Building2 className="h-6 w-6 text-primary" /> */}
                    <img
                      src="/images/logo.png"
                      alt="Ronalds LLP Logo"
                      width={40}
                      height={10}
                    />
                    <div>
                      <h1 className="text-xl font-bold text-foreground">Ronalds LLP</h1>
                      <p className="text-xs text-muted-foreground hidden sm:block">Performance Management</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right hidden sm:block">
                    <p className="text-sm font-medium text-foreground">{user?.email}</p>
                    <p className="text-xs text-muted-foreground">{getRoleDisplay()}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleSignOut}>
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign Out
                  </Button>
                </div>
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-8">{children}</main>
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
  isActive,
}: AppSidebarProps) {
  const location = useLocation();
  const { state } = useSidebar();

  const NavItem = ({
    path,
    icon: Icon,
    label,
    module,
    action = "read",
  }: {
    path: string;
    icon: any;
    label: string;
    module?: string;
    action?: ModuleAction;
  }) => {
    if (module && !hasModuleAccess(module, action)) return null;
    return (
      <SidebarMenuItem>
        <SidebarMenuButton asChild isActive={isActive(path)}>
          <a href={path} className="flex items-center gap-2">
            <Icon className="h-4 w-4" />
            {state !== "collapsed" && <span>{label}</span>}
          </a>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-border p-4">
        <div className="flex items-center gap-1">
          <img
            src="/images/logo.png"
            alt="Ronalds LLP Logo"
            width={40}
            height={10}
          />
          {state !== "collapsed" && <span className="font-semibold">Ronalds LLP</span>}
        </div>
      </SidebarHeader>

      <SidebarContent>
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
              <NavItem path="/non-financial-analytics" icon={TrendingUp} label="Analytics" module="reports" />
              <NavItem path="/reports" icon={FileText} label="Reports" module="reports" />
              <NavItem path="/notifications" icon={Bell} label="Notifications" module="notifications" />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* My Performance */}
        <Collapsible className="group/collapsible">
          <SidebarGroup>
            <SidebarGroupLabel asChild>
              <CollapsibleTrigger className="flex w-full items-center justify-between">
                My Performance
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
        {(isEmployee || isManager || isPartner || isHROrAdmin || isGMP) && (
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
