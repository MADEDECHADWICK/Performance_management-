import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { apiFetch,  authAPI } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Building2, Users, TrendingUp, TrendingDown, Award, Download, FileText, Plus, Trash2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import * as XLSX from "xlsx";

const DepartmentDashboard = () => {
  const { toast } = useToast();
  const [departments, setDepartments] = useState<any[]>([]);
  const [selectedDept, setSelectedDept] = useState<string>("");
  const [deptStats, setDeptStats] = useState<any>(null);
  const [allDeptRankings, setAllDeptRankings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("performance");
  
  // Team management state
  const [teams, setTeams] = useState<any[]>([]);
  const [teamDialogOpen, setTeamDialogOpen] = useState(false);
  const [teamFormData, setTeamFormData] = useState({
    team_name: "",
    description: "",
    department_id: "",
  });
  const [departmentEmployees, setDepartmentEmployees] = useState<any[]>([]);
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [editingTeam, setEditingTeam] = useState<any>(null);
  const [rankingSearch, setRankingSearch] = useState("");
  const [rankingView, setRankingView] = useState("top");
  const [selectedTeamId, setSelectedTeamId] = useState("all");
  const [memberStatusFilter, setMemberStatusFilter] = useState("all");
  const [teamKpis, setTeamKpis] = useState<any[]>([]);

  const normalizeArray = (payload: any) => {
    if (Array.isArray(payload)) return payload;
    if (payload?.data && Array.isArray(payload.data)) return payload.data;
    if (payload?.payload && Array.isArray(payload.payload)) return payload.payload;
    return [];
  };

  const departmentList = Array.isArray(departments) ? departments : normalizeArray(departments);
  const filteredRankings = allDeptRankings
    .filter((dept) => {
      if (!rankingSearch.trim()) return true;
      const query = rankingSearch.toLowerCase();
      return [dept.name, dept.department_code, dept.department_name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    })
    .slice()
    .sort((a, b) => {
      if (rankingView === "bottom") {
        return parseFloat(a.overallScore) - parseFloat(b.overallScore);
      }
      return parseFloat(b.overallScore) - parseFloat(a.overallScore);
    });

  const toNumber = (value: any) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  };

  const loadDepartmentStats = async (deptId: string, teamId?: string, statusFilter?: string) => {
    try {
      setLoading(true);
      const employees = await apiFetch<any[]>('GET', `/profiles?department_id=${deptId}`);
      const employeesList = normalizeArray(employees);
      const [nonFinancialRes, financialRes] = await Promise.all([
        apiFetch<any>('GET', '/analytics/non-financial').catch(() => null),
        apiFetch<any[]>('GET', '/financial-summary/departments').catch(() => null),
      ]);

      const teamMemberIds = new Set<string>();
      if (teamId && teamId !== "all") {
        const selectedTeam = teams.find((team) => String(team.id) === String(teamId));
        selectedTeam?.evaluation_team_members?.forEach((member: any) => {
          const profileId =
            member.employee_id ||
            member.profile_id ||
            member.profileId ||
            member?.profiles?.id;
          if (profileId) teamMemberIds.add(String(profileId));
        });
      }

      const filteredEmployees = employeesList.filter((employee) => {
        if (teamId && teamId !== "all" && !teamMemberIds.has(String(employee.id))) return false;
        if (statusFilter && statusFilter !== "all") {
          return String(employee.status || "").toLowerCase() === statusFilter;
        }
        return true;
      });

      const activeEmployees = filteredEmployees.filter(e => e.status === 'active') || [];
      const totalEmployees = filteredEmployees.length || 0;
      const dept = departmentList.find((d) => String(d.id) === String(deptId));
      const deptName = dept?.name || dept?.department_name;
      const departmentAverages = normalizeArray(nonFinancialRes?.departmentAverages);
      const deptNonFinancial = departmentAverages.find((item: any) => {
        return String(item.department || item.department_name || "").toLowerCase() === String(deptName || "").toLowerCase();
      });
      const financialDepartments = normalizeArray(financialRes);
      const deptFinancial = financialDepartments.find((item: any) => {
        const matchId = item.department_id ?? item.departmentId ?? item.id;
        if (matchId) return String(matchId) === String(deptId);
        return String(item.department_name || item.departmentName || "").toLowerCase() === String(deptName || "").toLowerCase();
      });

      const avgNonFinancialScore = toNumber(deptNonFinancial?.avgScore);
      const avgFinancialScore = toNumber(
        deptFinancial?.avg_utilization_rate ??
          deptFinancial?.avgUtilizationRate ??
          deptFinancial?.avg_utilization ??
          0
      );
      const overallScore = avgNonFinancialScore || 0;

      setDeptStats({
        totalEmployees,
        activeEmployees: activeEmployees.length,
        avgOverallScore: overallScore.toFixed(1),
        avgFinancialScore: avgFinancialScore.toFixed(1),
        avgNonFinancialScore: avgNonFinancialScore.toFixed(1),
        avgClientRating: toNumber(deptNonFinancial?.avgClientRating).toFixed(1),
        recommendationRate: toNumber(deptNonFinancial?.recommendationRate).toFixed(1),
        reviewCount: toNumber(deptNonFinancial?.employeeCount || 0),
        openReviews: toNumber(deptNonFinancial?.openReviews || 0),
        clientEvalCount: toNumber(deptNonFinancial?.clientEvalCount || 0),
        topPerformers: filteredEmployees.slice(0, 5) || [],
      });
    } catch (error: any) {
      console.error("Error loading department stats:", error);
      setDeptStats(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDepartments();
    loadAllDepartmentRankings();
  }, []);

  useEffect(() => {
    if (selectedDept) {
      loadDepartmentStats(selectedDept, selectedTeamId, memberStatusFilter);
      loadTeams(selectedDept);
      loadDepartmentEmployees(selectedDept);
      loadTeamKpis(selectedDept, memberStatusFilter);
    }
  }, [selectedDept]);

  useEffect(() => {
    if (selectedDept) {
      loadDepartmentStats(selectedDept, selectedTeamId, memberStatusFilter);
      loadTeamKpis(selectedDept, memberStatusFilter);
    }
  }, [selectedDept, selectedTeamId, memberStatusFilter, teams]);

  const loadDepartments = async () => {
    try {
      const data = await apiFetch<any[]>('GET', '/departments');
      const list = normalizeArray(data);
      setDepartments(list);
      if (list.length > 0) setSelectedDept(String(list[0].id));
    } catch (error: any) {
      console.error("Error loading departments:", error);
      // Set empty array to prevent UI issues
      setDepartments([]);
      toast({
        title: "Unable to load departments",
        description: "Department data is unavailable right now.",
        variant: "destructive",
      });
    }
  };

  const loadAllDepartmentRankings = async () => {
    try {
      const [deptsResponse, financialRes, nonFinancialRes] = await Promise.all([
        apiFetch<any[]>('GET', '/departments'),
        apiFetch<any[]>('GET', '/financial-summary/departments').catch(() => []),
        apiFetch<any>('GET', '/analytics/non-financial').catch(() => null),
      ]);
      const depts = normalizeArray(deptsResponse);
      const financialDepartments = normalizeArray(financialRes);
      const departmentAverages = normalizeArray(nonFinancialRes?.departmentAverages);

      const rankings = depts.map((dept) => {
        const deptName = dept.name || dept.department_name;
        const fin = financialDepartments.find((item: any) => {
          const matchId = item.department_id ?? item.departmentId ?? item.id;
          if (matchId) return String(matchId) === String(dept.id);
          return String(item.department_name || item.departmentName || "").toLowerCase() === String(deptName || "").toLowerCase();
        });
        const non = departmentAverages.find((item: any) =>
          String(item.department || item.department_name || "").toLowerCase() === String(deptName || "").toLowerCase()
        );

        return {
          id: dept.id,
          name: deptName,
          memberCount: toNumber(fin?.total_employees || non?.employeeCount),
          avgFinancial: toNumber(fin?.revenue).toFixed(0),
          avgNonFinancial: toNumber(non?.avgScore).toFixed(1),
          overallScore: toNumber(non?.avgScore).toFixed(1),
          clientEvalCount: toNumber(non?.clientEvalCount || non?.employeeCount),
        };
      });

      rankings.sort((a, b) => parseFloat(b.overallScore) - parseFloat(a.overallScore));
      setAllDeptRankings(rankings);
    } catch (error: any) {
      console.error("Error loading department rankings:", error);
      setAllDeptRankings([]);
    }
  };

  const exportToExcel = () => {
    const exportData = allDeptRankings.map((dept, index) => ({
      Rank: index + 1,
      Department: dept.name,
      Members: dept.memberCount,
      "Avg Revenue Contribution": `KES ${dept.avgFinancial}`,
      "Non-Financial Score": dept.avgNonFinancial,
      "Overall Score": dept.overallScore,
      "Client Evaluations": dept.clientEvalCount,
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Department Rankings");
    XLSX.writeFile(wb, "department-rankings.xlsx");

    toast({
      title: "Export Successful",
      description: "Department rankings exported to Excel.",
    });
  };

  const exportToPDF = () => {
    window.print();
  };

  const loadTeams = async (deptId: string) => {
    try {
      const teamsData = await apiFetch<any[]>('GET', `/evaluation_teams?department_id=${deptId}`);
      setTeams(normalizeArray(teamsData));
    } catch (error: any) {
      console.error("Error loading teams:", error);
      // Set empty array on error to prevent UI issues
      setTeams([]);
    }
  };

  const loadTeamKpis = async (deptId: string, statusFilter?: string) => {
    try {
      const query = statusFilter && statusFilter !== "all" ? `?status=${statusFilter}` : "";
      const data = await apiFetch<any[]>(
        "GET",
        `/departments/${deptId}/team-kpis${query}`
      );
      setTeamKpis(normalizeArray(data));
    } catch (error: any) {
      console.error("Error loading team KPIs:", error);
      setTeamKpis([]);
    }
  };

  const loadDepartmentEmployees = async (deptId: string) => {
    try {
      const data = await apiFetch<any[]>('GET', `/profiles?department_id=${deptId}&status=active`);
      setDepartmentEmployees(normalizeArray(data));
    } catch (error: any) {
      console.error("Error loading employees:", error);
    }
  };

  const handleCreateTeam = async () => {
    try {
      if (!teamFormData.team_name.trim()) {
        toast({ title: "Please enter a team name", variant: "destructive" });
        return;
      }

      if (selectedEmployees.length === 0) {
        toast({ title: "Please select at least one team member", variant: "destructive" });
        return;
      }

      const user = await authAPI.me();
      if (editingTeam) {
        // Update existing team
        await apiFetch('PATCH', `/evaluation_teams/${editingTeam.id}`, {
          team_name: teamFormData.team_name,
          description: teamFormData.description,
        });

        await apiFetch('DELETE', `/evaluation_team_members?team_id=${editingTeam.id}`);

        const members = selectedEmployees.map(emp_id => ({ team_id: editingTeam.id, employee_id: emp_id }));
        await apiFetch('POST', '/evaluation_team_members', members);

        toast({ title: 'Team updated successfully' });
      } else {
        // Create new team
        const team = await apiFetch<any>('POST', '/evaluation_teams', {
          ...teamFormData,
          department_id: selectedDept,
          created_by: user?.id || null,
        });

        const members = selectedEmployees.map(emp_id => ({ team_id: team.id, employee_id: emp_id }));
        await apiFetch('POST', '/evaluation_team_members', members);

        toast({ title: 'Team created successfully' });
      }

      setTeamDialogOpen(false);
      setTeamFormData({ team_name: "", description: "", department_id: "" });
      setSelectedEmployees([]);
      setEditingTeam(null);
      loadTeams(selectedDept);
    } catch (error: any) {
      console.error("Error creating team:", error);
      toast({ title: "Error managing team", variant: "destructive" });
    }
  };

  const handleDeleteTeam = async (teamId: string) => {
    try {
      await apiFetch('DELETE', `/evaluation_teams/${teamId}`);
      toast({ title: 'Team deleted successfully' });
      loadTeams(selectedDept);
    } catch (error: any) {
      console.error("Error deleting team:", error);
      toast({ title: "Error deleting team", variant: "destructive" });
    }
  };

  const handleEditTeam = (team: any) => {
    setEditingTeam(team);
    setTeamFormData({
      team_name: team.team_name,
      description: team.description || "",
      department_id: team.department_id,
    });
    setSelectedEmployees(team.evaluation_team_members?.map((m: any) => m.employee_id) || []);
    setTeamDialogOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-3xl font-bold text-foreground">Department Management</h2>
            <p className="text-muted-foreground">
              Performance metrics and team management
            </p>
          </div>
          <div className="flex items-center gap-3">
            {departmentList.length > 0 ? (
              <Select value={selectedDept} onValueChange={setSelectedDept}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {departmentList.map((dept) => (
                    <SelectItem key={dept.id} value={String(dept.id)}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="text-sm text-muted-foreground">No departments available</div>
            )}
            <Button variant="outline" size="icon" onClick={exportToExcel} title="Export to Excel">
              <Download className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={exportToPDF} title="Export to PDF">
              <FileText className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <Tabs defaultValue="performance" onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="performance">Performance Overview</TabsTrigger>
            <TabsTrigger value="teams">Team Management</TabsTrigger>
          </TabsList>

          <TabsContent value="performance" className="space-y-4">
            {deptStats && selectedDept ? (
              <>
                <div className="flex flex-col gap-3 rounded-lg border border-muted/40 bg-muted/10 p-4 md:flex-row md:items-end md:justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">Department Filters</p>
                    <p className="text-xs text-muted-foreground">
                      Use these to narrow team-level insights when data is available.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Team</Label>
                      <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
                        <SelectTrigger className="w-[200px]">
                          <SelectValue placeholder="All teams" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All teams</SelectItem>
                          {teams.map((team) => (
                            <SelectItem key={team.id} value={String(team.id)}>
                              {team.team_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Member status</Label>
                      <Select value={memberStatusFilter} onValueChange={setMemberStatusFilter}>
                        <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder="All members" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All members</SelectItem>
                          <SelectItem value="active">Active only</SelectItem>
                          <SelectItem value="inactive">Inactive only</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Total Members</CardTitle>
                      <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{deptStats.totalEmployees}</div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">
                          {deptStats.activeEmployees} active
                        </span>
                        <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">
                          {deptStats.openReviews} open reviews
                        </span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Avg Performance</CardTitle>
                      <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{deptStats.avgOverallScore}%</div>
                      <p className="text-xs text-muted-foreground">
                        Department average
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Client Rating</CardTitle>
                      <Award className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{deptStats.avgClientRating}/5</div>
                      <p className="text-xs text-muted-foreground">
                        {deptStats.clientEvalCount} evaluations
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Reviews</CardTitle>
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{deptStats.reviewCount}</div>
                      <p className="text-xs text-muted-foreground">
                        Completed this period
                      </p>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>Performance Breakdown</CardTitle>
                      <CardDescription>KPI performance by category</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <div className="flex justify-between text-sm mb-2">
                          <span className="font-medium">Financial KPIs (70%)</span>
                          <span className="text-primary font-semibold">{deptStats.avgFinancialScore}%</span>
                        </div>
                        <Progress value={parseFloat(deptStats.avgFinancialScore)} className="h-2" />
                      </div>
                      <div>
                        <div className="flex justify-between text-sm mb-2">
                          <span className="font-medium">Non-Financial KPIs (30%)</span>
                          <span className="text-secondary font-semibold">{deptStats.avgNonFinancialScore}%</span>
                        </div>
                        <Progress value={parseFloat(deptStats.avgNonFinancialScore)} className="h-2" />
                      </div>
                      <div>
                        <div className="flex justify-between text-sm mb-2">
                          <span className="font-medium">Overall Performance</span>
                          <span className="text-accent font-semibold">{deptStats.avgOverallScore}%</span>
                        </div>
                        <Progress value={parseFloat(deptStats.avgOverallScore)} className="h-2" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Department Insights</CardTitle>
                      <CardDescription>Key performance indicators</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-start gap-3">
                        <div className="w-2 h-2 rounded-full bg-success mt-2" />
                        <div>
                          <p className="font-medium text-sm">Strong Client Satisfaction</p>
                          <p className="text-xs text-muted-foreground">
                            {deptStats.recommendationRate}% of clients would recommend
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-2 h-2 rounded-full bg-info mt-2" />
                        <div>
                          <p className="font-medium text-sm">Active Review Process</p>
                          <p className="text-xs text-muted-foreground">
                            {deptStats.reviewCount} completed performance reviews
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-2 h-2 rounded-full bg-accent mt-2" />
                        <div>
                          <p className="font-medium text-sm">Team Size</p>
                          <p className="text-xs text-muted-foreground">
                            {deptStats.activeEmployees} active members contributing
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Team KPI Breakdown</CardTitle>
                    <CardDescription>Snapshot by evaluation teams within this department</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full bg-muted px-2 py-1 text-muted-foreground">
                        Teams: {teamKpis.length}
                      </span>
                      <span className="rounded-full bg-rose-50 px-2 py-1 text-rose-700">
                        Needs attention:{" "}
                        {
                          teamKpis.filter((team) => {
                            const delta = Number(team.deltaOverall || 0);
                            const trend =
                              team.trendDirection ||
                              (delta > 0 ? "up" : delta < 0 ? "down" : "flat");
                            return (
                              trend === "down" &&
                              Math.abs(delta) >= 1 &&
                              Number(team.previousOverallScore || 0) > 0
                            );
                          }).length
                        }
                      </span>
                    </div>
                    {loading && teams.length > 0 ? (
                      <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20 p-6 text-center">
                        <p className="text-sm font-medium text-foreground">Loading team KPIs…</p>
                        <p className="text-xs text-muted-foreground">
                          Fetching the latest performance scores for each team.
                        </p>
                      </div>
                    ) : teamKpis.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20 p-6 text-center">
                        <p className="text-sm font-medium text-foreground">
                          {teams.length === 0 ? "No teams configured" : "No team KPI scores yet"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {teams.length === 0
                            ? "Create evaluation teams to see team-level KPI performance."
                            : "Team scores will appear after the first performance scores are calculated."}
                        </p>
                      </div>
                    ) : (
                      <>
                        {selectedTeamId !== "all" &&
                          !teamKpis.some((team) => String(team.teamId) === selectedTeamId) && (
                            <div className="mb-4 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20 p-4 text-center text-xs text-muted-foreground">
                              The selected team does not have KPI data yet.
                            </div>
                          )}
                      <div className="grid gap-4 md:grid-cols-2">
                        {teamKpis
                          .filter((team) =>
                            selectedTeamId === "all"
                              ? true
                              : String(team.teamId) === selectedTeamId
                          )
                          .map((team) => {
                            const teamOverall = Number(team.overallScore || 0).toFixed(1);
                            const teamFinancial = Number(team.financialScore || 0).toFixed(1);
                            const teamNonFinancial = Number(team.nonFinancialScore || 0).toFixed(1);
                            const delta = Number(team.deltaOverall || 0);
                            const trend =
                              team.trendDirection || (delta > 0 ? "up" : delta < 0 ? "down" : "flat");
                            const needsAttention =
                              trend === "down" &&
                              Math.abs(delta) >= 1 &&
                              Number(team.previousOverallScore || 0) > 0;

                          return (
                            <Card key={team.teamId} className="border-muted/40">
                              <CardHeader className="pb-2">
                                <CardTitle className="text-base font-semibold">{team.teamName}</CardTitle>
                                <CardDescription className="flex flex-wrap items-center gap-2">
                                  <span>{team.activeCount} active · {team.memberCount} total</span>
                                  <span
                                    className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                                    title={`Previous score: ${Number(team.previousOverallScore || 0).toFixed(1)}%`}
                                  >
                                    {trend === "up" && <TrendingUp className="h-3 w-3 text-emerald-500" />}
                                    {trend === "down" && <TrendingDown className="h-3 w-3 text-rose-500" />}
                                    {trend === "flat" && <span className="h-3 w-3 text-muted-foreground">•</span>}
                                    {Math.abs(delta).toFixed(1)} pts
                                  </span>
                                  {needsAttention && (
                                    <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
                                      Needs attention
                                    </span>
                                  )}
                                </CardDescription>
                              </CardHeader>
                              <CardContent className="space-y-3">
                                <div>
                                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                                    <span>Financial KPI</span>
                                    <span className="text-foreground font-medium">{teamFinancial}%</span>
                                  </div>
                                  <Progress value={parseFloat(teamFinancial)} className="h-2" />
                                </div>
                                <div>
                                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                                    <span>Non-Financial KPI</span>
                                    <span className="text-foreground font-medium">{teamNonFinancial}%</span>
                                  </div>
                                  <Progress value={parseFloat(teamNonFinancial)} className="h-2" />
                                </div>
                                <div>
                                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                                    <span>Overall Score</span>
                                    <span className="text-foreground font-medium">{teamOverall}%</span>
                                  </div>
                                  <Progress value={parseFloat(teamOverall)} className="h-2" />
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card>
                <CardContent className="p-8">
                  <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20 p-6 text-center">
                    <Building2 className="h-6 w-6 text-muted-foreground" />
                    <p className="text-sm font-medium text-foreground">Select a department to view performance data</p>
                    <p className="text-xs text-muted-foreground">
                      Choose a department above to load KPIs, reviews, and insights.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Department Rankings Table */}
            <Card>
              <CardHeader>
                <CardTitle>Department Rankings</CardTitle>
                <CardDescription>Comparative performance across all departments</CardDescription>
              </CardHeader>
              <CardContent>
                {allDeptRankings.length > 0 ? (
                  <>
                    <div className="flex flex-col gap-3 pb-4 md:flex-row md:items-end md:justify-between">
                      <div className="flex flex-1 flex-wrap gap-3">
                        <div className="flex flex-col gap-1">
                          <Label className="text-xs font-medium text-muted-foreground">View</Label>
                          <Select value={rankingView} onValueChange={setRankingView}>
                            <SelectTrigger className="w-[160px]">
                              <SelectValue placeholder="Ranking view" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="top">Top performers</SelectItem>
                              <SelectItem value="bottom">Bottom performers</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label className="text-xs font-medium text-muted-foreground">Search</Label>
                          <Input
                            placeholder="Department name"
                            value={rankingSearch}
                            onChange={(event) => setRankingSearch(event.target.value)}
                          />
                        </div>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setRankingSearch("");
                            setRankingView("top");
                          }}
                        >
                          Reset
                        </Button>
                      </div>
                    </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Rank</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead className="text-right">Members</TableHead>
                        <TableHead className="text-right">Avg Revenue</TableHead>
                        <TableHead className="text-right">Non-Financial</TableHead>
                        <TableHead className="text-right">Overall Score</TableHead>
                        <TableHead className="text-right">Client Evals</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRankings.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground">
                            No departments match the current filters.
                          </TableCell>
                        </TableRow>
                      )}
                      {filteredRankings.map((dept, index) => (
                        <TableRow
                          key={dept.id}
                          className={selectedDept === String(dept.id) ? "bg-muted/50" : ""}
                        >
                          <TableCell className="font-bold">
                            {index === 0 && <Award className="inline h-4 w-4 text-accent mr-1" />}
                            #{index + 1}
                          </TableCell>
                          <TableCell className="font-medium">{dept.name}</TableCell>
                          <TableCell className="text-right">{dept.memberCount}</TableCell>
                          <TableCell className="text-right text-success">KES {dept.avgFinancial}</TableCell>
                          <TableCell className="text-right text-info">{dept.avgNonFinancial}</TableCell>
                          <TableCell className="text-right">
                            <span className="font-semibold text-primary">{dept.overallScore}</span>
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">{dept.clientEvalCount}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  </>
                ) : (
                  <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20 p-6 text-center">
                    <div className="inline-flex flex-col items-center gap-2">
                      <Building2 className="h-6 w-6 text-muted-foreground" />
                      <p className="text-sm font-medium text-foreground">No department data available</p>
                      <p className="text-xs text-muted-foreground">
                        Rankings will appear once evaluations and finance data are captured.
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="teams" className="space-y-4">
            <div className="flex justify-end">
              <Dialog open={teamDialogOpen} onOpenChange={setTeamDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={() => {
                    setEditingTeam(null);
                    setTeamFormData({ team_name: "", description: "", department_id: "" });
                    setSelectedEmployees([]);
                  }}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Team
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh]">
                  <DialogHeader>
                    <DialogTitle>{editingTeam ? "Edit Team" : "Create New Team"}</DialogTitle>
                    <DialogDescription>
                      Define a team or sub-team within this department for evaluations
                    </DialogDescription>
                  </DialogHeader>
                  <ScrollArea className="max-h-[calc(90vh-120px)] pr-4">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Team Name</Label>
                        <Input
                          value={teamFormData.team_name}
                          onChange={(e) => setTeamFormData({ ...teamFormData, team_name: e.target.value })}
                          placeholder="e.g., Tax Team, Audit Team A"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Description (Optional)</Label>
                        <Textarea
                          value={teamFormData.description}
                          onChange={(e) => setTeamFormData({ ...teamFormData, description: e.target.value })}
                          placeholder="Brief description of this team"
                          rows={3}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Team Members</Label>
                        <ScrollArea className="h-[300px] border rounded-md p-4">
                          <div className="space-y-2">
                            {departmentEmployees.map((emp) => (
                              <div key={emp.id} className="flex items-center space-x-2 p-2 hover:bg-muted rounded">
                                <Checkbox
                                  checked={selectedEmployees.includes(emp.id)}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      setSelectedEmployees([...selectedEmployees, emp.id]);
                                    } else {
                                      setSelectedEmployees(selectedEmployees.filter(id => id !== emp.id));
                                    }
                                  }}
                                />
                                <div className="flex-1">
                                  <p className="font-medium">{emp.first_name} {emp.last_name}</p>
                                  {emp.position && <p className="text-sm text-muted-foreground">{emp.position}</p>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </div>

                      <div className="flex gap-2 pt-4">
                        <Button onClick={handleCreateTeam} className="flex-1">
                          {editingTeam ? "Update Team" : "Create Team"}
                        </Button>
                        <Button variant="outline" onClick={() => {
                          setTeamDialogOpen(false);
                          setEditingTeam(null);
                        }}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </ScrollArea>
                </DialogContent>
              </Dialog>
            </div>

            {teams.length === 0 ? (
              <Card>
                <CardContent className="p-8">
                  <div className="text-center text-muted-foreground">
                    No evaluation teams yet. Create one to organize department members.
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {teams.map((team) => (
                  <Card key={team.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            <Users className="h-5 w-5 text-primary" />
                            {team.team_name}
                          </CardTitle>
                          {team.description && (
                            <CardDescription className="mt-2">{team.description}</CardDescription>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="ghost" onClick={() => handleEditTeam(team)}>
                            Edit
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDeleteTeam(team.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <p className="text-sm font-medium">Team Members ({team.evaluation_team_members?.length || 0}):</p>
                        <div className="flex flex-wrap gap-2">
                          {team.evaluation_team_members?.map((member: any) => (
                            <div key={member.id} className="bg-muted px-3 py-1 rounded-md text-sm">
                              {member.profiles?.first_name} {member.profiles?.last_name}
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default DepartmentDashboard;
