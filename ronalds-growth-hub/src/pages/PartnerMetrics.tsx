import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import apiFetch, { authAPI } from "@/integrations/apiClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  BarChart3, 
  TrendingUp, 
  DollarSign, 
  Users, 
  Clock,
  Target,
  Award,
  Briefcase,
  CheckCircle2,
  AlertTriangle,
  Download,
  Calendar,
  Activity
} from "lucide-react";
import * as XLSX from "xlsx";

interface PartnerKPIs {
  revenue: {
    current: number;
    target: number;
    previousYear: number;
    growth: number;
  };
  billableHours: {
    current: number;
    target: number;
    utilization: number;
  };
  clientMetrics: {
    totalClients: number;
    newClients: number;
    retention: number;
    satisfaction: number;
  };
  teamMetrics: {
    teamSize: number;
    averageUtilization: number;
    developmentScore: number;
  };
  businessDevelopment: {
    pipelineValue: number;
    conversionRate: number;
    newOpportunities: number;
  };
}

interface PerformanceData {
  month: string;
  revenue: number;
  billableHours: number;
  newClients: number;
  satisfaction: number;
}

interface JobPerformance {
  jobCode: string;
  clientName: string;
  serviceType: string;
  budgetHours: number;
  actualHours: number;
  budgetRevenue: number;
  actualRevenue: number;
  profitMargin: number;
  status: string;
  completionDate: string;
  efficiency: number;
}

interface TeamMember {
  id: string;
  name: string;
  position: string;
  utilization: number;
  billableHours: number;
  efficiency: number;
  developmentScore: number;
  clientSatisfaction: number;
}

const PartnerMetrics = () => {
  const [kpis, setKpis] = useState<PartnerKPIs | null>(null);
  const [performanceData, setPerformanceData] = useState<PerformanceData[]>([]);
  const [jobPerformance, setJobPerformance] = useState<JobPerformance[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState("current-year");
  const [lossAlertCount, setLossAlertCount] = useState(0);

  useEffect(() => {
    loadPartnerMetrics();
  }, [selectedPeriod]);

  const loadPartnerMetrics = async () => {
    try {
      setLoading(true);
      
      // Mock comprehensive partner metrics data
      const mockKPIs: PartnerKPIs = {
        revenue: {
          current: 3200000,
          target: 3600000,
          previousYear: 2800000,
          growth: 14.3
        },
        billableHours: {
          current: 1640,
          target: 1800,
          utilization: 91.1
        },
        clientMetrics: {
          totalClients: 24,
          newClients: 4,
          retention: 95.8,
          satisfaction: 4.7
        },
        teamMetrics: {
          teamSize: 12,
          averageUtilization: 87.5,
          developmentScore: 4.3
        },
        businessDevelopment: {
          pipelineValue: 2400000,
          conversionRate: 42.6,
          newOpportunities: 8
        }
      };

      const mockPerformanceData: PerformanceData[] = [
        { month: "Jan", revenue: 280000, billableHours: 142, newClients: 1, satisfaction: 4.6 },
        { month: "Feb", revenue: 295000, billableHours: 138, newClients: 0, satisfaction: 4.5 },
        { month: "Mar", revenue: 310000, billableHours: 145, newClients: 1, satisfaction: 4.7 },
        { month: "Apr", revenue: 275000, billableHours: 140, newClients: 1, satisfaction: 4.6 },
        { month: "May", revenue: 320000, billableHours: 148, newClients: 0, satisfaction: 4.8 },
        { month: "Jun", revenue: 290000, billableHours: 135, newClients: 2, satisfaction: 4.7 },
        { month: "Jul", revenue: 305000, billableHours: 142, newClients: 0, satisfaction: 4.6 },
        { month: "Aug", revenue: 315000, billableHours: 150, newClients: 1, satisfaction: 4.8 },
        { month: "Sep", revenue: 285000, billableHours: 138, newClients: 0, satisfaction: 4.5 },
        { month: "Oct", revenue: 330000, billableHours: 155, newClients: 2, satisfaction: 4.9 },
        { month: "Nov", revenue: 295000, billableHours: 144, newClients: 1, satisfaction: 4.7 },
        { month: "Dec", revenue: 300000, billableHours: 143, newClients: 1, satisfaction: 4.8 }
      ];

      const serviceTypes = ["Annual Audit", "Tax Advisory", "Financial Review", "Due Diligence", "Risk Assessment"];
      const statuses = ["Completed", "In Progress", "On Hold"];
      const mockJobPerformance: JobPerformance[] = Array.from({ length: 30 }, (_, i) => {
        const budgetHours = Math.floor(Math.random() * 200) + 50;
        const actualHours = budgetHours + Math.floor(Math.random() * 40) - 20;
        const budgetRevenue = budgetHours * (800 + Math.random() * 400);
        const actualRevenue = budgetRevenue * (0.95 + Math.random() * 0.1);
        
        return {
          jobCode: `JOB${String(2024)}${String(i + 1).padStart(3, '0')}`,
          clientName: `Client ${String.fromCharCode(65 + (i % 26))}${Math.floor(i / 26) + 1}`,
          serviceType: serviceTypes[i % serviceTypes.length],
          budgetHours,
          actualHours,
          budgetRevenue,
          actualRevenue,
          profitMargin: ((actualRevenue - (actualHours * 400)) / actualRevenue) * 100,
          status: statuses[i % statuses.length],
          completionDate: new Date(2024, (i % 12), Math.floor(Math.random() * 28) + 1).toISOString().split('T')[0],
          efficiency: (budgetHours / Math.max(actualHours, 1)) * 100
        };
      });

      const positions = ["Senior Associate", "Associate", "Assistant", "Analyst"];
      const mockTeamMembers: TeamMember[] = Array.from({ length: 12 }, (_, i) => ({
        id: `member_${i + 1}`,
        name: `${["Beatrice", "Francis", "Joyce", "Timothy", "Mercy", "Vincent", "Gladys", "Patrick", "Janet", "George", "Winnie", "Andrew"][i % 12]} ${["Kemboi", "Wanjala", "Cheptoo", "Gitonga", "Lagat", "Ndung'u", "Langat", "Mbugua", "Tanui", "Gathogo"][i % 10]}`,
        position: positions[i % positions.length],
        utilization: 70 + Math.random() * 25,
        billableHours: Math.floor(120 + Math.random() * 60),
        efficiency: 85 + Math.random() * 15,
        developmentScore: 3.5 + Math.random() * 1.5,
        clientSatisfaction: 4.0 + Math.random() * 1.0
      }));

      setKpis(mockKPIs);
      setPerformanceData(mockPerformanceData);
      setJobPerformance(mockJobPerformance);
      setTeamMembers(mockTeamMembers);

      try {
        const notifications: any = await apiFetch("GET", "/notifications?type=warning&status=unread&page=1&pageSize=50");
        const payload = notifications?.data ?? notifications ?? {};
        const items = Array.isArray(payload.items)
          ? payload.items
          : payload.items?.items ?? payload.notifications ?? payload.data ?? [];
        const lossAlerts = (Array.isArray(items) ? items : []).filter((item: any) => {
          const title = String(item?.title || "").toLowerCase();
          const message = String(item?.message || "").toLowerCase();
          return title.includes("loss") || message.includes("loss");
        });
        setLossAlertCount(lossAlerts.length);
      } catch (error) {
        setLossAlertCount(0);
      }
    } catch (error: any) {
      console.error("Error loading partner metrics:", error);
      setKpis(null);
      setPerformanceData([]);
      setJobPerformance([]);
      setTeamMembers([]);
      setLossAlertCount(0);
    } finally {
      setLoading(false);
    }
  };

  const exportToExcel = () => {
    const performanceExportData = performanceData.map(data => ({
      "Month": data.month,
      "Revenue (KES)": data.revenue,
      "Billable Hours": data.billableHours,
      "New Clients": data.newClients,
      "Client Satisfaction": data.satisfaction
    }));

    const jobExportData = jobPerformance.map(job => ({
      "Job Code": job.jobCode,
      "Client Name": job.clientName,
      "Service Type": job.serviceType,
      "Budget Hours": job.budgetHours,
      "Actual Hours": job.actualHours,
      "Budget Revenue (KES)": job.budgetRevenue.toFixed(0),
      "Actual Revenue (KES)": job.actualRevenue.toFixed(0),
      "Profit Margin (%)": job.profitMargin.toFixed(1),
      "Efficiency (%)": job.efficiency.toFixed(1),
      "Status": job.status,
      "Completion Date": job.completionDate
    }));

    const teamExportData = teamMembers.map(member => ({
      "Name": member.name,
      "Position": member.position,
      "Utilization (%)": member.utilization.toFixed(1),
      "Billable Hours": member.billableHours,
      "Efficiency (%)": member.efficiency.toFixed(1),
      "Development Score": member.developmentScore.toFixed(1),
      "Client Satisfaction": member.clientSatisfaction.toFixed(1)
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(performanceExportData), "Monthly Performance");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(jobExportData), "Job Performance");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(teamExportData), "Team Performance");
    XLSX.writeFile(wb, "partner-metrics.xlsx");

    toast({
      title: "Export Successful",
      description: "Partner metrics exported to Excel.",
    });
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="mt-2">Loading partner metrics...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-3xl font-bold text-foreground">Partner Metrics</h2>
            <p className="text-muted-foreground">
              Track performance, KPIs, and business outcomes
            </p>
          </div>
          {lossAlertCount > 0 && (
            <Badge variant="destructive">Loss alerts {lossAlertCount}</Badge>
          )}
          <div className="flex items-center gap-3">
            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current-year">Current Year</SelectItem>
                <SelectItem value="last-year">Last Year</SelectItem>
                <SelectItem value="ytd">Year to Date</SelectItem>
                <SelectItem value="quarter">This Quarter</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={exportToExcel} title="Export to Excel">
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Key Performance Indicators */}
        {!kpis && (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle>No partner analytics yet</CardTitle>
              <CardDescription>
                Metrics will populate once portfolio activity is recorded.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
        {kpis && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Revenue Performance</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  KES {(kpis.revenue.current / 1000000).toFixed(1)}M
                </div>
                <div className="space-y-2 mt-2">
                  <Progress 
                    value={(kpis.revenue.current / kpis.revenue.target) * 100} 
                    className="h-2" 
                  />
                  <p className="text-xs text-muted-foreground">
                    {((kpis.revenue.current / kpis.revenue.target) * 100).toFixed(1)}% of target
                  </p>
                  <p className="text-xs text-success">
                    +{kpis.revenue.growth}% YoY growth
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Billable Utilization</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{kpis.billableHours.utilization}%</div>
                <div className="space-y-2 mt-2">
                  <Progress value={kpis.billableHours.utilization} className="h-2" />
                  <p className="text-xs text-muted-foreground">
                    {kpis.billableHours.current} of {kpis.billableHours.target} hours
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Client Satisfaction</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{kpis.clientMetrics.satisfaction}/5.0</div>
                <div className="space-y-1 mt-2">
                  <p className="text-xs text-muted-foreground">
                    {kpis.clientMetrics.totalClients} total clients
                  </p>
                  <p className="text-xs text-success">
                    {kpis.clientMetrics.retention}% retention rate
                  </p>
                  <p className="text-xs text-muted-foreground">
                    +{kpis.clientMetrics.newClients} new this year
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Business Development</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  KES {(kpis.businessDevelopment.pipelineValue / 1000000).toFixed(1)}M
                </div>
                <div className="space-y-1 mt-2">
                  <p className="text-xs text-muted-foreground">Pipeline value</p>
                  <p className="text-xs text-success">
                    {kpis.businessDevelopment.conversionRate}% conversion rate
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {kpis.businessDevelopment.newOpportunities} new opportunities
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="jobs">Job Performance</TabsTrigger>
            <TabsTrigger value="team">Team Metrics</TabsTrigger>
            <TabsTrigger value="trends">Trends</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Financial Summary */}
              <Card>
                <CardHeader>
                  <CardTitle>Financial Summary</CardTitle>
                  <CardDescription>Revenue and profitability metrics</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Target Achievement</span>
                      <span className="text-sm font-bold">
                        {kpis ? ((kpis.revenue.current / kpis.revenue.target) * 100).toFixed(1) : 0}%
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Year-over-Year Growth</span>
                      <span className="text-sm font-bold text-success">
                        +{kpis?.revenue.growth}%
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Average Monthly Revenue</span>
                      <span className="text-sm font-bold">
                        KES {kpis ? ((kpis.revenue.current / 12) / 1000).toFixed(0) : 0}K
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Q4 Pipeline</span>
                      <span className="text-sm font-bold">
                        KES {kpis ? (kpis.businessDevelopment.pipelineValue / 1000000).toFixed(1) : 0}M
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Team Performance */}
              <Card>
                <CardHeader>
                  <CardTitle>Team Performance</CardTitle>
                  <CardDescription>Team efficiency and development</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Team Size</span>
                      <span className="text-sm font-bold">{kpis?.teamMetrics.teamSize} members</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Average Utilization</span>
                      <span className="text-sm font-bold">{kpis?.teamMetrics.averageUtilization}%</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Development Score</span>
                      <span className="text-sm font-bold">{kpis?.teamMetrics.developmentScore}/5.0</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Retention Rate</span>
                      <span className="text-sm font-bold text-success">96.2%</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Client Health */}
              <Card>
                <CardHeader>
                  <CardTitle>Client Portfolio Health</CardTitle>
                  <CardDescription>Client relationship metrics</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Active Clients</span>
                      <span className="text-sm font-bold">{kpis?.clientMetrics.totalClients}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Client Satisfaction</span>
                      <span className="text-sm font-bold">{kpis?.clientMetrics.satisfaction}/5.0</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Retention Rate</span>
                      <span className="text-sm font-bold text-success">{kpis?.clientMetrics.retention}%</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">New Clients YTD</span>
                      <span className="text-sm font-bold">+{kpis?.clientMetrics.newClients}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Key Achievements */}
              <Card>
                <CardHeader>
                  <CardTitle>Key Achievements</CardTitle>
                  <CardDescription>Notable accomplishments this year</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Award className="h-4 w-4 text-success" />
                      <span className="text-sm">Exceeded revenue target by 12%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-success" />
                      <span className="text-sm">Maintained 95%+ client retention</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-success" />
                      <span className="text-sm">Increased team efficiency by 8%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-success" />
                      <span className="text-sm">Onboarded 4 new high-value clients</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="jobs" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Job Performance Analysis</CardTitle>
                <CardDescription>Detailed breakdown of job profitability and efficiency</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Job Code</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Service</TableHead>
                      <TableHead>Efficiency</TableHead>
                      <TableHead>Margin</TableHead>
                      <TableHead>Revenue</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobPerformance.slice(0, 15).map((job) => (
                      <TableRow key={job.jobCode}>
                        <TableCell className="font-medium">{job.jobCode}</TableCell>
                        <TableCell>{job.clientName}</TableCell>
                        <TableCell>{job.serviceType}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={job.efficiency} className="w-16 h-2" />
                            <span className={`text-sm font-medium ${job.efficiency >= 100 ? 'text-success' : job.efficiency >= 80 ? 'text-warning' : 'text-destructive'}`}>
                              {job.efficiency.toFixed(0)}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className={`font-medium ${job.profitMargin >= 30 ? 'text-success' : job.profitMargin >= 15 ? 'text-warning' : 'text-destructive'}`}>
                            {job.profitMargin.toFixed(1)}%
                          </span>
                        </TableCell>
                        <TableCell>
                          KES {(job.actualRevenue / 1000).toFixed(0)}K
                        </TableCell>
                        <TableCell>
                          <Badge variant={job.status === "Completed" ? "default" : job.status === "In Progress" ? "outline" : "secondary"}>
                            {job.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="team" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Team Performance Metrics</CardTitle>
                <CardDescription>Individual team member performance and development</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Position</TableHead>
                      <TableHead>Utilization</TableHead>
                      <TableHead>Billable Hours</TableHead>
                      <TableHead>Efficiency</TableHead>
                      <TableHead>Development</TableHead>
                      <TableHead>Client Rating</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teamMembers.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell className="font-medium">{member.name}</TableCell>
                        <TableCell>{member.position}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={member.utilization} className="w-16 h-2" />
                            <span className="text-sm font-medium">
                              {member.utilization.toFixed(0)}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>{member.billableHours}h</TableCell>
                        <TableCell>
                          <span className={`font-medium ${member.efficiency >= 90 ? 'text-success' : member.efficiency >= 80 ? 'text-warning' : 'text-destructive'}`}>
                            {member.efficiency.toFixed(0)}%
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{member.developmentScore.toFixed(1)}</span>
                            <Progress value={member.developmentScore * 20} className="w-12 h-2" />
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-medium">{member.clientSatisfaction.toFixed(1)}/5.0</span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="trends" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Monthly Revenue Trend</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {performanceData.map((data, index) => (
                      <div key={data.month} className="flex justify-between items-center">
                        <span className="text-sm font-medium">{data.month}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-24">
                            <Progress value={(data.revenue / 350000) * 100} className="h-2" />
                          </div>
                          <span className="text-sm font-medium w-16 text-right">
                            {(data.revenue / 1000).toFixed(0)}K
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Performance Indicators</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Revenue Growth</span>
                        <span className="text-success">+14.3%</span>
                      </div>
                      <Progress value={75} className="h-2" />
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Client Satisfaction</span>
                        <span>94%</span>
                      </div>
                      <Progress value={94} className="h-2" />
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Team Utilization</span>
                        <span>87.5%</span>
                      </div>
                      <Progress value={87.5} className="h-2" />
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Pipeline Conversion</span>
                        <span>42.6%</span>
                      </div>
                      <Progress value={42.6} className="h-2" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default PartnerMetrics;
