import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Users,
  TrendingUp,
  Clock,
  Star,
  Search,
  Download,
  Eye,
  UserPlus,
} from "lucide-react";
import * as XLSX from "xlsx";

type TeamMemberApi = {
  employeeId: number;
  firstName: string;
  lastName: string;
  jobPosition: string;
  departmentName: string | null;
  status: string;
  roleName: string | null;
  hireDate: string | null;
};

type TeamPerformanceApi = {
  employeeId: number;
  employeeName: string;
  jobPosition: string;
  avgFinancialScore: number;
  avgNonFinancialScore: number;
  avgOverallRating: number;
  totalHoursThisMonth: number;
  billableHoursThisMonth: number;
  utilizationRate: number;
  lastReviewDate: string | null;
};

type TeamFinancialsApi = {
  activeTeamMembers: number;
  totalTeamHours: number;
  billableHours: number;
  totalRevenue: number;
  totalCost: number;
};

type TeamResponse = {
  teamMembers: TeamMemberApi[];
  financials: TeamFinancialsApi;
  performance: TeamPerformanceApi[];
};

type JobPortfolio = {
  jobId: number;
  title: string;
  jobNumber: string | null;
  status: string;
  billingType: string;
  budgetHours: number;
  actualHours: number;
  revenue: number;
  cost: number;
  budgetUtilization: number;
  clientName: string;
  departmentName: string | null;
  startDate: string | null;
  dueDate: string | null;
  completionPercentage: number;
};

type JobsResponse = {
  portfolio: JobPortfolio[];
};

type TeamMemberView = {
  id: string;
  name: string;
  employeeId: string;
  position: string;
  department: string;
  status: string;
  startDate: string | null;
  totalHours: number;
  billableHours: number;
  utilization: number;
  performanceRating: number;
  financialScore: number;
  nonFinancialScore: number;
  lastReviewDate: string | null;
};

const TeamOverview = () => {
  const { toast } = useToast();
  const [teamMembers, setTeamMembers] = useState<TeamMemberView[]>([]);
  const [teamProjects, setTeamProjects] = useState<JobPortfolio[]>([]);
  const [financials, setFinancials] = useState<TeamFinancialsApi | null>(null);
  const [selectedMember, setSelectedMember] = useState<TeamMemberView | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDepartment, setFilterDepartment] = useState("all");

  const loadTeamOverview = async () => {
    try {
      setLoading(true);

      const [teamResponse, jobsResponse] = await Promise.all([
        apiFetch<TeamResponse>("GET", "/manager-dashboard/team"),
        apiFetch<JobsResponse>("GET", "/manager-dashboard/jobs"),
      ]);

      const performanceById = new Map<number, TeamPerformanceApi>();
      (teamResponse.performance || []).forEach((row) => {
        performanceById.set(row.employeeId, row);
      });

      const mappedMembers = (teamResponse.teamMembers || []).map((member) => {
        const perf = performanceById.get(member.employeeId);
        const name = `${member.firstName || ""} ${member.lastName || ""}`.trim();

        return {
          id: String(member.employeeId),
          name,
          employeeId: `EMP-${member.employeeId}`,
          position: member.jobPosition || member.roleName || "Employee",
          department: member.departmentName || "Unassigned",
          status: member.status || "active",
          startDate: member.hireDate,
          totalHours: Number(perf?.totalHoursThisMonth || 0),
          billableHours: Number(perf?.billableHoursThisMonth || 0),
          utilization: Number(perf?.utilizationRate || 0),
          performanceRating: Number(perf?.avgOverallRating || 0),
          financialScore: Number(perf?.avgFinancialScore || 0),
          nonFinancialScore: Number(perf?.avgNonFinancialScore || 0),
          lastReviewDate: perf?.lastReviewDate || null,
        } as TeamMemberView;
      });

      setTeamMembers(mappedMembers);
      setTeamProjects(jobsResponse?.portfolio || []);
      setFinancials(teamResponse.financials || null);
    } catch (error: any) {
      console.error("Error loading team overview:", error);
      if (error?.status === 404) {
        setTeamMembers([]);
        setTeamProjects([]);
        setFinancials(null);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTeamOverview();
  }, []);

  const metrics = useMemo(() => {
    const totalMembers = teamMembers.length;
    const activeMembers = teamMembers.filter((member) => member.status === "active").length;
    const avgUtilization = totalMembers > 0
      ? teamMembers.reduce((sum, member) => sum + member.utilization, 0) / totalMembers
      : 0;
    const avgPerformance = totalMembers > 0
      ? teamMembers.reduce((sum, member) => sum + member.performanceRating, 0) / totalMembers
      : 0;
    const avgNonFinancial = totalMembers > 0
      ? teamMembers.reduce((sum, member) => sum + member.nonFinancialScore, 0) / totalMembers
      : 0;
    const highPerformers = teamMembers.filter((member) => member.performanceRating >= 80).length;
    const retentionRate = totalMembers > 0 ? (activeMembers / totalMembers) * 100 : 0;

    return {
      totalMembers,
      activeMembers,
      averageUtilization: avgUtilization,
      averagePerformance: avgPerformance,
      averageSatisfaction: avgNonFinancial / 20,
      teamEfficiency: avgUtilization,
      retentionRate,
      promotionsThisYear: highPerformers,
      trainingCompletions: teamMembers.filter((member) => member.nonFinancialScore > 0).length,
      overallProductivity: totalMembers > 0 ? (avgPerformance + avgUtilization) / 2 : 0,
    };
  }, [teamMembers]);

  const filteredMembers = useMemo(() => {
    return teamMembers.filter((member) => {
      const matchesSearch =
        member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        member.position.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesDepartment =
        filterDepartment === "all" || member.department.toLowerCase() === filterDepartment.toLowerCase();
      return matchesSearch && matchesDepartment;
    });
  }, [teamMembers, searchTerm, filterDepartment]);

  const departments = useMemo(() => {
    const values = new Set(teamMembers.map((member) => member.department));
    return Array.from(values).sort();
  }, [teamMembers]);

  const getStatusBadgeVariant = (status: string) => {
    const normalized = status.toLowerCase();
    if (normalized === "active") return "default";
    if (normalized === "on_leave" || normalized === "on leave") return "secondary";
    return "outline";
  };

  const getPerformanceColor = (rating: number) => {
    if (rating >= 85) return "text-success";
    if (rating >= 70) return "text-warning";
    return "text-destructive";
  };

  const exportToExcel = () => {
    const memberData = filteredMembers.map((member) => ({
      Name: member.name,
      "Employee ID": member.employeeId,
      Position: member.position,
      Department: member.department,
      Status: member.status,
      "Total Hours": member.totalHours,
      "Billable Hours": member.billableHours,
      "Utilization (%)": Number(member.utilization || 0).toFixed(2),
      "Overall Score": Number(member.performanceRating || 0).toFixed(2),
      "Financial Score": Number(member.financialScore || 0).toFixed(2),
      "Non-Financial Score": Number(member.nonFinancialScore || 0).toFixed(2),
      "Start Date": member.startDate ? new Date(member.startDate).toLocaleDateString() : "--",
      "Last Review": member.lastReviewDate ? new Date(member.lastReviewDate).toLocaleDateString() : "--",
    }));

    const projectData = teamProjects.map((project) => ({
      Job: project.title,
      "Job Number": project.jobNumber || "--",
      Client: project.clientName,
      Status: project.status,
      "Budget Hours": project.budgetHours,
      "Actual Hours": project.actualHours,
      "Completion (%)": Number(project.completionPercentage || 0).toFixed(2),
      "Revenue (KES)": project.revenue,
      "Cost (KES)": project.cost,
      "Start Date": project.startDate ? new Date(project.startDate).toLocaleDateString() : "--",
      "Due Date": project.dueDate ? new Date(project.dueDate).toLocaleDateString() : "--",
    }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(memberData), "Team Members");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(projectData), "Team Jobs");
    XLSX.writeFile(workbook, "team-overview.xlsx");

    toast({
      title: "Export successful",
      description: "Team overview exported to Excel.",
    });
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
            <p className="mt-2">Loading team overview...</p>
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
            <h2 className="text-3xl font-bold text-foreground">Team Overview</h2>
            <p className="text-muted-foreground">Manager live view for staffing, performance, and jobs</p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="icon" onClick={exportToExcel} title="Export to Excel">
              <Download className="h-4 w-4" />
            </Button>
            <Button asChild>
              <a href="/employee-management">
                <UserPlus className="h-4 w-4 mr-2" />
                Manage Team
              </a>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Team Size</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.totalMembers}</div>
              <p className="text-xs text-muted-foreground">{metrics.activeMembers} active members</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Utilization</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.averageUtilization.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground">Team billable efficiency</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Performance</CardTitle>
              <Star className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.averagePerformance.toFixed(1)}</div>
              <p className="text-xs text-muted-foreground">Average score</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Revenue</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">KES {Number(financials?.totalRevenue || 0).toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Cost KES {Number(financials?.totalCost || 0).toLocaleString()}</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="members" className="space-y-4">
          <TabsList>
            <TabsTrigger value="members">Team Members</TabsTrigger>
            <TabsTrigger value="projects">Active Jobs</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
            <TabsTrigger value="development">Development</TabsTrigger>
          </TabsList>

          <TabsContent value="members" className="space-y-4">
            <div className="flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search team members..."
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={filterDepartment} onValueChange={setFilterDepartment}>
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="Filter by department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {departments.map((department) => (
                    <SelectItem key={department} value={department.toLowerCase()}>{department}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Card>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Member</TableHead>
                      <TableHead>Position</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Utilization</TableHead>
                      <TableHead>Overall</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMembers.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback>{member.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium">{member.name}</p>
                              <p className="text-sm text-muted-foreground">{member.employeeId}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{member.position}</TableCell>
                        <TableCell>{member.department}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={member.utilization} className="w-16 h-2" />
                            <span className="text-sm font-medium">{member.utilization.toFixed(0)}%</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className={`font-medium ${getPerformanceColor(member.performanceRating)}`}>
                            {member.performanceRating.toFixed(1)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStatusBadgeVariant(member.status)}>{member.status}</Badge>
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => setSelectedMember(member)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="projects" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Manager Job Portfolio</CardTitle>
                <CardDescription>Live budget, utilization and profitability by job.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Job</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Progress</TableHead>
                      <TableHead>Hours</TableHead>
                      <TableHead>Revenue</TableHead>
                      <TableHead>Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teamProjects.map((project) => (
                      <TableRow key={project.jobId}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{project.title}</p>
                            <p className="text-xs text-muted-foreground">{project.jobNumber || `JOB-${project.jobId}`}</p>
                          </div>
                        </TableCell>
                        <TableCell>{project.clientName}</TableCell>
                        <TableCell>
                          <Badge variant={project.status === "completed" ? "default" : "outline"}>{project.status}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={project.completionPercentage} className="w-16 h-2" />
                            <span className="text-sm">{project.completionPercentage.toFixed(0)}%</span>
                          </div>
                        </TableCell>
                        <TableCell>{project.actualHours.toFixed(1)} / {project.budgetHours.toFixed(1)}</TableCell>
                        <TableCell>KES {project.revenue.toLocaleString()}</TableCell>
                        <TableCell>KES {project.cost.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="performance" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Performance Distribution</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {[
                    { label: "Excellent (>=85)", count: teamMembers.filter((m) => m.performanceRating >= 85).length },
                    { label: "Good (70-84)", count: teamMembers.filter((m) => m.performanceRating >= 70 && m.performanceRating < 85).length },
                    { label: "Average (50-69)", count: teamMembers.filter((m) => m.performanceRating >= 50 && m.performanceRating < 70).length },
                    { label: "Below 50", count: teamMembers.filter((m) => m.performanceRating < 50).length },
                  ].map((item) => {
                    const pct = teamMembers.length > 0 ? (item.count / teamMembers.length) * 100 : 0;
                    return (
                      <div key={item.label}>
                        <div className="flex justify-between text-sm mb-1">
                          <span>{item.label}</span>
                          <span>{item.count} members ({pct.toFixed(1)}%)</span>
                        </div>
                        <Progress value={pct} className="h-2" />
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Top Performers</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {teamMembers
                    .slice()
                    .sort((a, b) => b.performanceRating - a.performanceRating)
                    .slice(0, 5)
                    .map((member, index) => (
                      <div key={member.id} className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm">#{index + 1} {member.name}</p>
                          <p className="text-xs text-muted-foreground">{member.position}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium text-sm">{member.performanceRating.toFixed(1)}</p>
                          <p className="text-xs text-muted-foreground">{member.utilization.toFixed(0)}% util</p>
                        </div>
                      </div>
                    ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="development" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Development Summary</CardTitle>
                <CardDescription>Non-financial growth and review coverage.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between"><span>Average non-financial score</span><span className="font-semibold">{(teamMembers.length > 0 ? teamMembers.reduce((sum, member) => sum + member.nonFinancialScore, 0) / teamMembers.length : 0).toFixed(2)}</span></div>
                <div className="flex justify-between"><span>Reviewed this cycle</span><span className="font-semibold">{teamMembers.filter((member) => Boolean(member.lastReviewDate)).length}</span></div>
                <div className="flex justify-between"><span>Retention rate</span><span className="font-semibold">{metrics.retentionRate.toFixed(2)}%</span></div>
                <div className="flex justify-between"><span>Training completions proxy</span><span className="font-semibold">{metrics.trainingCompletions}</span></div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {selectedMember && (
          <Dialog open={!!selectedMember} onOpenChange={() => setSelectedMember(null)}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{selectedMember.name}</DialogTitle>
                <DialogDescription>{selectedMember.position} • {selectedMember.department}</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-sm">Total Hours: <span className="font-semibold">{selectedMember.totalHours.toFixed(1)}</span></p>
                  <p className="text-sm">Billable Hours: <span className="font-semibold">{selectedMember.billableHours.toFixed(1)}</span></p>
                  <p className="text-sm">Utilization: <span className="font-semibold">{selectedMember.utilization.toFixed(1)}%</span></p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm">Overall Score: <span className="font-semibold">{selectedMember.performanceRating.toFixed(1)}</span></p>
                  <p className="text-sm">Financial Score: <span className="font-semibold">{selectedMember.financialScore.toFixed(1)}</span></p>
                  <p className="text-sm">Non-Financial Score: <span className="font-semibold">{selectedMember.nonFinancialScore.toFixed(1)}</span></p>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </DashboardLayout>
  );
};

export default TeamOverview;
