import React, { useState, useEffect } from 'react';
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend
} from 'recharts';
import {
  TrendingUp,
  Users,
  DollarSign,
  Building,
  Award,
  AlertTriangle,
  CheckCircle,
  Calendar,
  Target,
  BarChart3,
  UserCheck,
  Briefcase,
  FileText,
  Settings,
  Shield,
  Crown,
  Building2,
  TrendingDown,
  Clock,
  ChevronRight,
  Eye,
  Filter,
  Download,
  RefreshCw,
  Loader2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, authAPI } from '@/integrations/apiClient';
import { useToast } from '@/hooks/use-toast';

// TypeScript interfaces for the original dashboard structure
interface FirmMetrics {
  total_employees: number;
  total_partners: number;
  total_managers: number;
  total_revenue: number;
  total_fees: number;
  active_jobs: number;
  active_clients: number;
  total_departments: number;
  evaluations_this_month: number;
}

interface PartnerRanking {
  partner_id: number;
  name: string;
  department: string;
  position: string;
  portfolio_revenue: number;
  portfolio_fees: number;
  active_jobs: number;
  direct_reports: number;
  client_count: number;
  avg_team_score: number;
}

interface ManagerRanking {
  manager_id: number;
  name: string;
  department: string;
  position: string;
  reports_to: string;
  team_size: number;
  team_total_hours: number;
  evaluation_count: number;
  avg_performance: number;
  jobs_managed: number;
}

interface DepartmentData {
  department_id: number;
  department_name: string;
  department_code: string;
  employee_count: number;
  partner_count: number;
  manager_count: number;
  department_revenue: number;
  department_fees: number;
  jobs_count: number;
  avg_department_performance: number;
}

interface DashboardData {
  firmMetrics: FirmMetrics;
  partnerRankings: PartnerRanking[];
  managerRankings: ManagerRanking[];
  departmentBreakdown: DepartmentData[];
}

interface PersonalData {
  personalMetrics: {
    activeJobs: number;
    totalRevenue: number;
    totalFees: number;
    directReports: number;
    overallScore: number;
  };
  jobs: any[];
  directReports: any[];
}

interface AlertsData {
  jobsAtRisk: any[];
  pendingEvaluations: any[];
  lowUtilizationPartners: any[];
}

// Enhanced mock data for improved visualization
const enhancedMetrics = [
  {
    title: 'Firm Revenue',
    value: 'KES 45.2M',
    change: '+12.5%',
    icon: DollarSign,
    color: 'text-green-600',
    trend: 'up'
  },
  {
    title: 'Active Partners',
    value: '8',
    change: '+1',
    icon: Crown,
    color: 'text-blue-600',
    trend: 'up'
  },
  {
    title: 'Client Satisfaction',
    value: '94.2%',
    change: '+2.1%',
    icon: Award,
    color: 'text-purple-600',
    trend: 'up'
  },
  {
    title: 'Profit Margin',
    value: '32.8%',
    change: '+3.2%',
    icon: TrendingUp,
    color: 'text-green-600',
    trend: 'up'
  }
];

const strategicInitiatives = [
  {
    title: 'Digital Transformation',
    status: 'In Progress',
    progress: 75,
    deadline: '2024-06-30',
    owner: 'Grace Wanjiku'
  },
  {
    title: 'Market Expansion - Coast Region',
    status: 'Planning',
    progress: 25,
    deadline: '2024-09-15',
    owner: 'Samuel Kamau'
  },
  {
    title: 'ESG Advisory Launch',
    status: 'Completed',
    progress: 100,
    deadline: '2024-03-31',
    owner: 'Beatrice Muthoni'
  }
];

const riskAlerts = [
  {
    type: 'High',
    message: 'Partner utilization below target in Advisory department',
    department: 'Advisory',
    severity: 'high'
  },
  {
    type: 'Medium',
    message: 'Client retention rate declining in mid-market segment',
    department: 'Business Development',
    severity: 'medium'
  },
  {
    type: 'Low',
    message: 'Staff satisfaction survey due next month',
    department: 'HR',
    severity: 'low'
  }
];

export default function GMPDashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [personalData, setPersonalData] = useState<PersonalData | null>(null);
  const [alertsData, setAlertsData] = useState<AlertsData | null>(null);
  const [selectedPartner, setSelectedPartner] = useState<any>(null);
  const [selectedTab, setSelectedTab] = useState("executive");
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  useEffect(() => {
    verifyGMPAccessAndLoadData();
  }, []);

  const verifyGMPAccessAndLoadData = async () => {
    try {
      setIsLoading(true);
      
      // Verify user access and redirect if needed
      const user = await authAPI.me();
      if (!user) {
        navigate("/auth");
        return;
      }

      // Load all dashboard data
      await Promise.all([
        loadDashboardData(),
        loadPersonalData(),
        loadAlertsData()
      ]);

      setLastUpdated(new Date());
    } catch (error) {
      console.error("Error loading GMP dashboard:", error);
      
      // If access denied, redirect to appropriate dashboard
      if (error?.status === 403) {
        toast({
          title: "Access Denied",
          description: "Group Managing Partner privileges required. Redirecting...",
          variant: "destructive"
        });
        
        // Redirect to appropriate dashboard based on role
        setTimeout(() => {
          navigate("/dashboard");
        }, 2000);
        return;
      }
      
      toast({
        title: "Error",
        description: "Failed to load dashboard data",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadDashboardData = async () => {
    try {
      const data = await apiFetch("GET", "/gmp-dashboard/overview");
      setDashboardData(data);
    } catch (error) {
      console.error("Error loading dashboard overview:", error);
      // Use fallback data to show the UI
      setDashboardData({
        firmMetrics: {
          total_employees: 156,
          total_partners: 8,
          total_managers: 24,
          total_revenue: 45200000,
          total_fees: 38400000,
          active_jobs: 89,
          active_clients: 156,
          total_departments: 6,
          evaluations_this_month: 45
        },
        partnerRankings: [
          {
            partner_id: 1,
            name: "Grace Wanjiku",
            department: "Audit & Assurance",
            position: "Senior Partner",
            portfolio_revenue: 8500000,
            portfolio_fees: 7200000,
            active_jobs: 28,
            direct_reports: 15,
            client_count: 45,
            avg_team_score: 92.5
          },
          {
            partner_id: 2,
            name: "Samuel Kamau",
            department: "Tax Services",
            position: "Senior Partner",
            portfolio_revenue: 7200000,
            portfolio_fees: 6100000,
            active_jobs: 32,
            direct_reports: 12,
            client_count: 38,
            avg_team_score: 88.7
          }
        ],
        managerRankings: [
          {
            manager_id: 1,
            name: "Beatrice Muthoni",
            department: "Advisory Services",
            position: "Partner",
            reports_to: "Grace Wanjiku",
            team_size: 8,
            team_total_hours: 1240,
            evaluation_count: 12,
            avg_performance: 91.2,
            jobs_managed: 18
          }
        ],
        departmentBreakdown: [
          {
            department_id: 1,
            department_name: "Audit & Assurance",
            department_code: "AUD",
            employee_count: 45,
            partner_count: 3,
            manager_count: 8,
            department_revenue: 18500000,
            department_fees: 15600000,
            jobs_count: 67,
            avg_department_performance: 89.5
          }
        ]
      });
    }
  };

  const loadPersonalData = async () => {
    try {
      const data = await apiFetch("GET", "/gmp-dashboard/personal");
      setPersonalData(data);
    } catch (error) {
      console.error("Error loading personal data:", error);
      // Use fallback data
      setPersonalData({
        personalMetrics: {
          activeJobs: 12,
          totalRevenue: 8900000,
          totalFees: 7500000,
          directReports: 8,
          overallScore: 94.2
        },
        jobs: [],
        directReports: []
      });
    }
  };

  const loadAlertsData = async () => {
    try {
      const data = await apiFetch("GET", "/gmp-dashboard/alerts");
      setAlertsData(data);
    } catch (error) {
      console.error("Error loading alerts:", error);
      setAlertsData({
        jobsAtRisk: [],
        pendingEvaluations: [],
        lowUtilizationPartners: []
      });
    }
  };

  const loadPartnerDetails = async (partnerId: number) => {
    try {
      const data = await apiFetch("GET", `/gmp-dashboard/partner/${partnerId}`);
      setSelectedPartner(data);
    } catch (error) {
      console.error("Error loading partner details:", error);
      toast({
        title: "Error",
        description: "Failed to load partner details",
        variant: "destructive"
      });
    }
  };

  const handleRefresh = async () => {
    await verifyGMPAccessAndLoadData();
    toast({
      title: "Dashboard Refreshed",
      description: "All data has been updated",
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatPercentage = (value: number) => {
    return `${(value || 0).toFixed(1)}%`;
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-96">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Loading Executive Dashboard...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Enhanced Header */}
        <div className="flex justify-between items-center">
          <div>
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-gradient-to-r from-amber-400 to-yellow-600 rounded-full flex items-center justify-center">
                <Crown className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Executive Command Center</h1>
                <p className="text-gray-600">Group Managing Partner Dashboard</p>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <div className="text-right text-sm">
              <p className="text-gray-600">Last Updated</p>
              <p className="font-semibold">{lastUpdated.toLocaleTimeString()}</p>
            </div>
            <Button variant="outline" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button>
              <Settings className="h-4 w-4 mr-2" />
              Admin Panel
            </Button>
          </div>
        </div>

        {/* Key Metrics Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {enhancedMetrics.map((metric) => (
            <Card key={metric.title} className="relative overflow-hidden">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">{metric.title}</p>
                    <p className="text-2xl font-bold">{metric.value}</p>
                    <div className="flex items-center space-x-1">
                      <TrendingUp className={`h-3 w-3 ${metric.color}`} />
                      <p className={`text-sm ${metric.color}`}>{metric.change}</p>
                    </div>
                  </div>
                  <div className="relative">
                    <metric.icon className="h-8 w-8 text-gray-400" />
                    {dashboardData && (
                      <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full"></div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Risk Alerts - Enhanced */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <AlertTriangle className="h-5 w-5 mr-2 text-amber-500" />
              Executive Alerts & Risk Management
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {riskAlerts.map((alert, index) => (
                <div key={index} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                  <div className="flex items-center space-x-3">
                    <Badge 
                      variant={alert.severity === 'high' ? 'destructive' : alert.severity === 'medium' ? 'default' : 'secondary'}
                    >
                      {alert.type}
                    </Badge>
                    <span className="font-medium">{alert.message}</span>
                    <Badge variant="outline">{alert.department}</Badge>
                  </div>
                  <div className="flex space-x-2">
                    <Button size="sm" variant="outline">
                      <Eye className="h-4 w-4 mr-1" />
                      Review
                    </Button>
                    <Button size="sm">Action</Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Main Content Tabs - Enhanced */}
        <Tabs value={selectedTab} onValueChange={setSelectedTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="executive">Executive Overview</TabsTrigger>
            <TabsTrigger value="partners">Partner Performance</TabsTrigger>
            <TabsTrigger value="strategy">Strategic Initiatives</TabsTrigger>
            <TabsTrigger value="governance">Governance & Risk</TabsTrigger>
          </TabsList>

          <TabsContent value="executive" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Department Performance Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>Department Revenue Performance</CardTitle>
                </CardHeader>
                <CardContent>
                  {dashboardData?.departmentBreakdown && dashboardData.departmentBreakdown.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={dashboardData.departmentBreakdown}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="department_code" />
                        <YAxis />
                        <Tooltip formatter={(value) => [`KES ${(Number(value) / 1000000).toFixed(1)}M`, 'Revenue']} />
                        <Bar dataKey="department_revenue" name="Department Revenue" fill="#3b82f6" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-64 text-gray-500">
                      <p>Loading department data...</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Firm Metrics Summary */}
              <Card>
                <CardHeader>
                  <CardTitle>Firm Overview</CardTitle>
                </CardHeader>
                <CardContent>
                  {dashboardData?.firmMetrics ? (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-3 bg-blue-50 rounded-lg">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-blue-600">Total Employees</span>
                          <Users className="h-4 w-4 text-blue-600" />
                        </div>
                        <p className="text-xl font-bold">{dashboardData.firmMetrics.total_employees}</p>
                      </div>
                      <div className="p-3 bg-green-50 rounded-lg">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-green-600">Active Jobs</span>
                          <Briefcase className="h-4 w-4 text-green-600" />
                        </div>
                        <p className="text-xl font-bold">{dashboardData.firmMetrics.active_jobs}</p>
                      </div>
                      <div className="p-3 bg-purple-50 rounded-lg">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-purple-600">Partners</span>
                          <Crown className="h-4 w-4 text-purple-600" />
                        </div>
                        <p className="text-xl font-bold">{dashboardData.firmMetrics.total_partners}</p>
                      </div>
                      <div className="p-3 bg-orange-50 rounded-lg">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-orange-600">Departments</span>
                          <Building2 className="h-4 w-4 text-orange-600" />
                        </div>
                        <p className="text-xl font-bold">{dashboardData.firmMetrics.total_departments}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="animate-pulse space-y-3">
                      <div className="h-16 bg-gray-200 rounded"></div>
                      <div className="h-16 bg-gray-200 rounded"></div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="partners" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Partner Performance Rankings</CardTitle>
                <CardDescription>Performance metrics and portfolio analytics</CardDescription>
              </CardHeader>
              <CardContent>
                {dashboardData?.partnerRankings && dashboardData.partnerRankings.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Partner</TableHead>
                          <TableHead>Department</TableHead>
                          <TableHead className="text-right">Revenue</TableHead>
                          <TableHead className="text-right">Active Jobs</TableHead>
                          <TableHead className="text-right">Team Size</TableHead>
                          <TableHead className="text-right">Avg Score</TableHead>
                          <TableHead className="text-center">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dashboardData.partnerRankings.map((partner, index) => (
                          <TableRow key={partner.partner_id} className="hover:bg-gray-50">
                            <TableCell>
                              <div className="flex items-center space-x-2">
                                {index === 0 && <Award className="h-4 w-4 text-yellow-500" />}
                                <div>
                                  <div className="font-semibold">{partner.name}</div>
                                  <div className="text-sm text-gray-600">{partner.position}</div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>{partner.department}</TableCell>
                            <TableCell className="text-right font-semibold">
                              {formatCurrency(partner.portfolio_revenue)}
                            </TableCell>
                            <TableCell className="text-right">{partner.active_jobs}</TableCell>
                            <TableCell className="text-right">{partner.direct_reports}</TableCell>
                            <TableCell className="text-right">
                              <Badge variant={partner.avg_team_score >= 90 ? "default" : "secondary"}>
                                {formatPercentage(partner.avg_team_score)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => loadPartnerDetails(partner.partner_id)}
                              >
                                <Eye className="h-4 w-4 mr-1" />
                                Details
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-64 text-gray-500">
                    <p>Loading partner performance data...</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="strategy" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Strategic Initiatives</CardTitle>
                <CardDescription>Firm-wide strategic projects and progress tracking</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {strategicInitiatives.map((initiative, index) => (
                    <div key={index} className="p-4 border rounded-lg">
                      <div className="flex justify-between items-start mb-3">
                        <h4 className="font-semibold text-lg">{initiative.title}</h4>
                        <Badge 
                          variant={
                            initiative.status === 'Completed' ? 'default' : 
                            initiative.status === 'In Progress' ? 'secondary' : 
                            'outline'
                          }
                        >
                          {initiative.status}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <p className="text-sm text-gray-600 mb-1">Progress</p>
                          <div className="w-full bg-gray-200 rounded-full h-3">
                            <div 
                              className="bg-blue-600 h-3 rounded-full transition-all duration-500" 
                              style={{ width: `${initiative.progress}%` }}
                            />
                          </div>
                          <p className="text-sm font-semibold mt-1">{initiative.progress}% Complete</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Deadline</p>
                          <p className="font-semibold flex items-center">
                            <Calendar className="h-4 w-4 mr-1" />
                            {new Date(initiative.deadline).toLocaleDateString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Owner</p>
                          <p className="font-semibold flex items-center">
                            <UserCheck className="h-4 w-4 mr-1" />
                            {initiative.owner}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="governance" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Governance & Compliance</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center p-3 border rounded hover:bg-gray-50">
                    <span>Board Meeting Schedule</span>
                    <Button size="sm" variant="outline">
                      <Calendar className="h-4 w-4 mr-2" />
                      View Calendar
                    </Button>
                  </div>
                  <div className="flex justify-between items-center p-3 border rounded hover:bg-gray-50">
                    <span>Risk Assessment Reports</span>
                    <Button size="sm" variant="outline">
                      <FileText className="h-4 w-4 mr-2" />
                      View Reports
                    </Button>
                  </div>
                  <div className="flex justify-between items-center p-3 border rounded hover:bg-gray-50">
                    <span>Compliance Monitoring</span>
                    <Button size="sm" variant="outline">
                      <CheckCircle className="h-4 w-4 mr-2" />
                      View Status
                    </Button>
                  </div>
                  <div className="flex justify-between items-center p-3 border rounded hover:bg-gray-50">
                    <span>Audit Trail</span>
                    <Button size="sm" variant="outline">
                      <Shield className="h-4 w-4 mr-2" />
                      Access Logs
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Key Performance Indicators</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm">Client Retention</span>
                        <span className="text-sm font-semibold">96.5%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-green-600 h-2 rounded-full" style={{ width: '96.5%' }} />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm">Employee Satisfaction</span>
                        <span className="text-sm font-semibold">88.2%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-blue-600 h-2 rounded-full" style={{ width: '88.2%' }} />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm">Quality Score</span>
                        <span className="text-sm font-semibold">92.7%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-purple-600 h-2 rounded-full" style={{ width: '92.7%' }} />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm">Market Share Growth</span>
                        <span className="text-sm font-semibold">15.3%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-orange-600 h-2 rounded-full" style={{ width: '76.5%' }} />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        {/* Partner Details Modal */}
        <Dialog open={!!selectedPartner} onOpenChange={() => setSelectedPartner(null)}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>Partner Performance Details</DialogTitle>
              <DialogDescription>
                Comprehensive performance analytics and portfolio overview
              </DialogDescription>
            </DialogHeader>
            {selectedPartner && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-3 bg-blue-50 rounded">
                    <p className="text-sm text-blue-600">Revenue</p>
                    <p className="text-xl font-bold">{formatCurrency(selectedPartner.financials?.totalRevenue || 0)}</p>
                  </div>
                  <div className="p-3 bg-green-50 rounded">
                    <p className="text-sm text-green-600">Active Jobs</p>
                    <p className="text-xl font-bold">{selectedPartner.financials?.activeJobsCount || 0}</p>
                  </div>
                  <div className="p-3 bg-purple-50 rounded">
                    <p className="text-sm text-purple-600">Team Size</p>
                    <p className="text-xl font-bold">{selectedPartner.team?.length || 0}</p>
                  </div>
                  <div className="p-3 bg-orange-50 rounded">
                    <p className="text-sm text-orange-600">Avg Job Value</p>
                    <p className="text-xl font-bold">{formatCurrency(selectedPartner.financials?.averageJobValue || 0)}</p>
                  </div>
                </div>
                <div className="text-center">
                  <Button onClick={() => setSelectedPartner(null)}>Close</Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}