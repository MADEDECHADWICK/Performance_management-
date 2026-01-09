import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import apiFetch, { authAPI } from "@/integrations/apiClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Building2, Users, TrendingUp, Award, Download, FileText, Plus, Trash2 } from "lucide-react";
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

  const loadDepartmentStats = async (deptId: string) => {
    try {
      setLoading(true);
      const employees = await apiFetch<any[]>('GET', `/profiles?department_id=${deptId}`);
      const employeeIds = employees?.map(e => e.id) || [];

      const reviews = employeeIds.length > 0
        ? await apiFetch<any[]>('GET', `/performance_reviews?employee_ids=${employeeIds.join(',')}`)
        : [];

      const clientEvals = employeeIds.length > 0
        ? await apiFetch<any[]>('GET', `/client_evaluations?employee_ids=${employeeIds.join(',')}`)
        : [];

      const avgOverallScore = reviews && reviews.length > 0
        ? reviews.reduce((sum: number, r: any) => sum + (r.overall_score || 0), 0) / reviews.length
        : 0;

      const avgFinancialScore = reviews && reviews.length > 0
        ? reviews.reduce((sum: number, r: any) => sum + (r.financial_score || 0), 0) / reviews.length
        : 0;

      const avgNonFinancialScore = reviews && reviews.length > 0
        ? reviews.reduce((sum: number, r: any) => sum + (r.non_financial_score || 0), 0) / reviews.length
        : 0;

      const avgClientRating = clientEvals && clientEvals.length > 0
        ? clientEvals.reduce((sum: number, e: any) => sum + (e.overall_rating || 0), 0) / clientEvals.length
        : 0;

      const recommendationRate = clientEvals && clientEvals.length > 0
        ? (clientEvals.filter((e: any) => e.would_recommend).length / clientEvals.length) * 100
        : 0;

      setDeptStats({
        totalEmployees: employees?.length || 0,
        activeEmployees: employees?.filter((e: any) => e.status === 'active').length || 0,
        avgOverallScore: avgOverallScore.toFixed(1),
        avgFinancialScore: avgFinancialScore.toFixed(1),
        avgNonFinancialScore: avgNonFinancialScore.toFixed(1),
        avgClientRating: avgClientRating.toFixed(1),
        recommendationRate: recommendationRate.toFixed(1),
        reviewCount: reviews?.length || 0,
        clientEvalCount: clientEvals?.length || 0,
        topPerformers: employees?.slice(0, 5) || [],
      });
    } catch (error: any) {
      console.error("Error loading department stats:", error);
      toast({ title: "Error", description: "Failed to load department statistics.", variant: "destructive" });
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
      loadDepartmentStats(selectedDept);
      loadTeams(selectedDept);
      loadDepartmentEmployees(selectedDept);
    }
  }, [selectedDept]);

  const loadDepartments = async () => {
    try {
      const data = await apiFetch<any[]>('GET', '/departments');
      setDepartments(data || []);
      if (data && data.length > 0) setSelectedDept(data[0].id);
    } catch (error: any) {
      console.error("Error loading departments:", error);
      toast({
        title: "Error",
        description: "Failed to load departments.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadAllDepartmentRankings = async () => {
    try {
      const depts = await apiFetch<any[]>('GET', '/departments');
      const rankings = await Promise.all(
        (depts || []).map(async (dept) => {
          const employees = await apiFetch<any[]>('GET', `/profiles?department_id=${dept.id}`);
          const employeeIds = employees?.map(e => e.id) || [];
          const memberCount = employees?.filter(e => e.status === 'active').length || 0;

          const allocations = employeeIds.length > 0
            ? await apiFetch<any[]>('GET', `/employee_project_allocations?employee_ids=${employeeIds.join(',')}`)
            : [];
          const totalRevenue = allocations?.reduce((sum, a) => sum + (a.allocation_amount || 0), 0) || 0;
          const avgFinancial = memberCount > 0 ? totalRevenue / memberCount : 0;

          const evaluations = employeeIds.length > 0
            ? await apiFetch<any[]>('GET', `/employee_evaluations?employee_ids=${employeeIds.join(',')}`)
            : [];

          const clientEvals = employeeIds.length > 0
            ? await apiFetch<any[]>('GET', `/client_evaluations?employee_ids=${employeeIds.join(',')}`)
            : [];

          let avgNonFinancial = 0;
          if (evaluations && evaluations.length > 0) {
            const evalScores = evaluations.map((e: any) => {
              const scores = [
                e.manager_technical_expertise,
                e.manager_communication,
                e.manager_collaboration,
                e.manager_problem_solving,
                e.manager_time_management,
                e.manager_innovation
              ].filter((s: any) => s !== null && s !== undefined);
              return scores.length > 0 ? scores.reduce((sum: number, s: number) => sum + s, 0) / scores.length : 0;
            });
            avgNonFinancial = evalScores.reduce((sum: number, s: number) => sum + s, 0) / evalScores.length;
          }

          const avgClientRating = clientEvals && clientEvals.length > 0
            ? (clientEvals.reduce((sum: number, e: any) => sum + (e.overall_rating || 0), 0) / clientEvals.length) * 20
            : 0;

          const finalNonFinancial = avgNonFinancial * 0.6 + avgClientRating * 0.4;
          const overallScore = (avgFinancial / 10000) * 70 + finalNonFinancial * 0.3;

          return {
            id: dept.id,
            name: dept.name,
            memberCount,
            avgFinancial: avgFinancial.toFixed(0),
            avgNonFinancial: finalNonFinancial.toFixed(1),
            overallScore: overallScore.toFixed(1),
            clientEvalCount: clientEvals?.length || 0,
          };
        })
      );

      rankings.sort((a, b) => parseFloat(b.overallScore) - parseFloat(a.overallScore));
      setAllDeptRankings(rankings);
    } catch (error: any) {
      console.error("Error loading department rankings:", error);
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
    toast({
      title: "Print Dialog Opened",
      description: "Use your browser's print function to save as PDF.",
    });
  };

  const loadTeams = async (deptId: string) => {
    try {
      const teamsData = await apiFetch<any[]>('GET', `/evaluation_teams?department_id=${deptId}`);
      setTeams(teamsData || []);
    } catch (error: any) {
      console.error("Error loading teams:", error);
    }
  };

  const loadDepartmentEmployees = async (deptId: string) => {
    try {
      const data = await apiFetch<any[]>('GET', `/profiles?department_id=${deptId}&status=active`);
      setDepartmentEmployees(data || []);
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
            <Select value={selectedDept} onValueChange={setSelectedDept}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Select department" />
              </SelectTrigger>
              <SelectContent>
                {departments.map((dept) => (
                  <SelectItem key={dept.id} value={dept.id}>
                    {dept.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={exportToExcel} title="Export to Excel">
              <Download className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={exportToPDF} title="Export to PDF">
              <FileText className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList>
            <TabsTrigger value="performance">Performance</TabsTrigger>
            <TabsTrigger value="teams">Evaluation Teams</TabsTrigger>
          </TabsList>

          <TabsContent value="performance" className="space-y-6">

        {loading ? (
          <Card>
            <CardContent className="p-8">
              <div className="text-center text-muted-foreground">Loading department data...</div>
            </CardContent>
          </Card>
        ) : deptStats ? (
          <>
            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
                  <Users className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{deptStats.totalEmployees}</div>
                  <p className="text-xs text-muted-foreground">
                    {deptStats.activeEmployees} active
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Avg Overall Score</CardTitle>
                  <Award className="h-4 w-4 text-accent" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{deptStats.avgOverallScore}</div>
                  <p className="text-xs text-muted-foreground">
                    From {deptStats.reviewCount} reviews
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Client Rating</CardTitle>
                  <TrendingUp className="h-4 w-4 text-success" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{deptStats.avgClientRating}/5.0</div>
                  <p className="text-xs text-muted-foreground">
                    {deptStats.clientEvalCount} evaluations
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Recommendation Rate</CardTitle>
                  <Building2 className="h-4 w-4 text-info" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{deptStats.recommendationRate}%</div>
                  <p className="text-xs text-muted-foreground">
                    Client recommendations
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Performance Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Performance Breakdown</CardTitle>
                  <CardDescription>Average scores by category</CardDescription>
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
          </>
        ) : (
          <Card>
            <CardContent className="p-8">
              <div className="text-center text-muted-foreground">
                Select a department to view performance data
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
                  {allDeptRankings.map((dept, index) => (
                    <TableRow 
                      key={dept.id}
                      className={selectedDept === dept.id ? "bg-muted/50" : ""}
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
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No department data available
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

