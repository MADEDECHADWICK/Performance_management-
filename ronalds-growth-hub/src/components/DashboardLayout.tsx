import { ReactNode, useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import apiFetch, { authAPI, setToken } from "@/integrations/apiClient";
import { Button } from "@/components/ui/button";
import { Building2, LogOut } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
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
} from "lucide-react";

interface DashboardLayoutProps {
  children: ReactNode;
}

interface UserRole {
  role: string;
}

const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const [user, setUser] = useState<any | null>(null);
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [userProfile, setUserProfile] = useState<any | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      try {
        const me = await authAPI.me();
        setUser(me);
        // Get the user's profile to check their role
        const profiles = await apiFetch('GET', "/profiles");
        const profile = profiles?.find((p: any) => p.email === me.email);
        setUserProfile(profile);
        
        // Get the user's role - handle both object and string formats
        if (profile?.role) {
          const roleName = typeof profile.role === 'object' ? profile.role.name : profile.role;
          console.log('User role:', roleName);
          setUserRoles([roleName]);
        } else {
          console.log('No role found in profile');
          await loadUserRoles(me.id);
        }
      } catch (err) {
        console.error('Error loading user:', err);
        navigate('/auth');
      }
    })();
  }, [navigate]);

  const loadUserRoles = async (userId: any) => {
    try {
      const uid = typeof userId === 'number' ? userId : Number(userId);
      const data = await apiFetch('GET', `/user_roles?userId=${uid}`);
      setUserRoles((data as UserRole[]).map((r) => r.role) || []);
    } catch (error: any) {
      console.error("Error loading roles:", error);
    }
  };

  const handleSignOut = async () => {
    setToken(null);
    navigate("/auth");
  };

  const getRoleDisplay = () => {
    if (userRoles.length > 0) {
      const role = userRoles[0];
      if (role === 'super_admin') return "Super Administrator";
      if (role === 'hr_manager') return "HR Manager";
      if (role === 'manager' || role === 'Manager') return "Manager";
      if (role === 'partner' || role === 'Partner') return "Partner";
      if (role === 'client') return "Client";
    }
    if (user?.is_partner) return "Partner";
    return "Employee";
  };

  const isHROrAdmin = userRoles.some(r => r === 'super_admin' || r === 'hr_manager');
  const isManager = userRoles.some(r => r === 'manager' || r === 'Manager') || 
                    userProfile?.position?.toLowerCase().includes('manager');
  const isPartner = userRoles.some(r => r === 'partner' || r === 'Partner') || 
                    userProfile?.position?.toLowerCase() === 'partner' || 
                    userProfile?.is_partner === true;
  const isGMP = userProfile?.position?.toLowerCase().includes('group_managing_partner') || 
                userProfile?.position?.toLowerCase().includes('group managing partner') ||
                userProfile?.position === 'group_managing_partner' ||
                userRoles.some(r => r === 'group_managing_partner');
  const isActive = (path: string) => location.pathname === path;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gradient-to-br from-primary/5 via-background to-secondary/5">
        <AppSidebar isHROrAdmin={isHROrAdmin} isManager={isManager} isPartner={isPartner} isGMP={isGMP} isActive={isActive} />

        <div className="flex-1 flex flex-col">
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
          <main className="flex-1 px-4 sm:px-6 lg:px-8 py-8">{children}</main>
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
  isActive: (path: string) => boolean;
}

function AppSidebar({ isHROrAdmin, isManager, isPartner, isGMP, isActive }: AppSidebarProps) {
  const location = useLocation();
  const { state } = useSidebar();

  const NavItem = ({ path, icon: Icon, label }: { path: string; icon: any; label: string }) => (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive(path)}>
        <a href={path} className="flex items-center gap-2">
          <Icon className="h-4 w-4" />
          {state !== "collapsed" && <span>{label}</span>}
        </a>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

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
                <NavItem path="/gmp-dashboard" icon={Crown} label="Executive Dashboard" />
              ) : isHROrAdmin ? (
                <NavItem path="/hr-dashboard" icon={BarChart3} label="Dashboard" />
              ) : isPartner ? (
                <NavItem path="/partner-dashboard" icon={BarChart3} label="Partner Dashboard" />
              ) : isManager ? (
                <NavItem path="/manager-dashboard" icon={BarChart3} label="Manager Dashboard" />
              ) : (
                <NavItem path="/dashboard" icon={BarChart3} label="Dashboard" />
              )}
              <NavItem path="/non-financial-analytics" icon={TrendingUp} label="Analytics" />
              <NavItem path="/reports" icon={FileText} label="Reports" />
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
                  <NavItem path="/profile" icon={UserIcon} label="Profile" />
                  <NavItem path="/scorecard" icon={Target} label="Scorecard" />
                  <NavItem path="/goals" icon={Target} label="Goals" />
                  <NavItem path="/todos" icon={CheckSquare} label="My To-Dos" />
                  <NavItem path="/timesheets" icon={Clock} label="Timesheets" />
                  <NavItem path="/development-plan" icon={FileText} label="Development Plan" />
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
                  <NavItem path="/evaluations" icon={ClipboardCheck} label="Evaluations" />
                  <NavItem path="/continuous-feedback" icon={Users} label="Feedback" />
                  {(isManager || isHROrAdmin) && (
                    <NavItem path="/manager-evaluation" icon={UserCheck} label="Team Evaluations" />
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </SidebarGroup>
        </Collapsible>

        {/* Financials */}
        <SidebarGroup>
          <SidebarGroupLabel>Financials</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <NavItem path="/financial-summary" icon={DollarSign} label="Financial Summary" />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

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
                    <NavItem path="/employee-management" icon={Users} label="Employee Management" />
                    <NavItem path="/job-tracking" icon={Briefcase} label="Job Tracking" />
                    <NavItem path="/evaluation-management" icon={Calendar} label="Evaluations" />
                    <NavItem path="/kpi-management" icon={Settings} label="KPIs" />
                    <NavItem path="/audit-logs" icon={Shield} label="Audit Logs" />
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
