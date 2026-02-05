import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { apiFetch,  authAPI } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  Users, 
  TrendingUp, 
  Clock, 
  Star,
  Target,
  Award,
  Briefcase,
  CheckCircle2,
  AlertCircle,
  Search,
  Download,
  Filter,
  Plus,
  Eye,
  Calendar,
  BarChart3,
  UserPlus,
  Settings
} from "lucide-react";
import * as XLSX from "xlsx";

interface TeamMember {
  id: string;
  name: string;
  email: string;
  position: string;
  department: string;
  employeeId: string;
  startDate: string;
  manager: string;
  status: string;
  photo?: string;
  billableHours: number;
  targetHours: number;
  utilization: number;
  efficiency: number;
  clientSatisfaction: number;
  developmentScore: number;
  performanceRating: number;
  currentProjects: number;
  completedProjects: number;
  skills: string[];
  certifications: string[];
  lastReview: string;
  nextReview: string;
  salary: number;
  notes: string;
}

interface TeamProject {
  id: string;
  projectName: string;
  clientName: string;
  status: string;
  progress: number;
  teamMembers: string[];
  startDate: string;
  dueDate: string;
  budget: number;
  spent: number;
  priority: string;
}

interface TeamMetrics {
  totalMembers: number;
  activeMembers: number;
  averageUtilization: number;
  averagePerformance: number;
  averageSatisfaction: number;
  teamEfficiency: number;
  retentionRate: number;
  promotionsThisYear: number;
  trainingCompletions: number;
  overallProductivity: number;
}

const TeamOverview = () => {
  const { toast } = useToast();
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamProjects, setTeamProjects] = useState<TeamProject[]>([]);
  const [metrics, setMetrics] = useState<TeamMetrics | null>(null);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDepartment, setFilterDepartment] = useState("all");
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);

  useEffect(() => {
    loadTeamOverview();
  }, []);

  const loadTeamOverview = async () => {
    try {
      setLoading(true);
      
      // Mock comprehensive team overview data
      const mockMetrics: TeamMetrics = {
        totalMembers: 15,
        activeMembers: 14,
        averageUtilization: 87.3,
        averagePerformance: 4.2,
        averageSatisfaction: 4.4,
        teamEfficiency: 92.5,
        retentionRate: 94.7,
        promotionsThisYear: 3,
        trainingCompletions: 42,
        overallProductivity: 89.2
      };

      const positions = ["Senior Associate", "Associate", "Assistant", "Analyst", "Senior Manager", "Manager"];
      const departments = ["Audit", "Tax", "Advisory", "Risk Management"];
      const statuses = ["Active", "On Leave", "Training"];
      const skills = [
        ["Financial Auditing", "IFRS", "Risk Assessment"],
        ["Tax Planning", "Compliance", "VAT"],
        ["Financial Analysis", "Due Diligence", "Valuation"],
        ["Risk Management", "Internal Controls", "Compliance"],
        ["Project Management", "Client Relations", "Team Leadership"]
      ];

      const mockTeamMembers: TeamMember[] = Array.from({ length: 15 }, (_, i) => {
        const targetHours = 160;
        const billableHours = Math.floor(120 + Math.random() * 60);
        const utilization = (billableHours / targetHours) * 100;
        
        return {
          id: `member_${i + 1}`,
          name: `${["Priscilla", "Kenneth", "Hannah", "Emmanuel", "Caroline", "Benjamin", "Eunice", "Moses", "Lydia", "Simon", "Tabitha", "Collins", "Purity", "Kevin", "Christine"][i]} ${["Wanjiku", "Mutua", "Kiplagat", "Macharia", "Chebet", "Onyango", "Rotich", "Mwangi", "Achieng", "Kariuki"][i % 10]}`,
          email: `employee${i + 1}@ronalds.com`,
          position: positions[i % positions.length],
          department: departments[i % departments.length],
          employeeId: `EMP${String(2024)}${String(i + 1).padStart(3, '0')}`,
          startDate: new Date(2020 + (i % 4), (i * 3) % 12, (i % 28) + 1).toISOString().split('T')[0],
          manager: "Partner Lead",
          status: statuses[i % statuses.length],
          billableHours,
          targetHours,
          utilization,
          efficiency: 80 + Math.random() * 20,
          clientSatisfaction: 3.8 + Math.random() * 1.2,
          developmentScore: 3.5 + Math.random() * 1.5,
          performanceRating: 3.5 + Math.random() * 1.5,
          currentProjects: Math.floor(Math.random() * 4) + 1,
          completedProjects: Math.floor(Math.random() * 20) + 5,
          skills: skills[i % skills.length],
          certifications: ["CPA", "ACCA", "CIA", "CISA", "PMP"].slice(0, Math.floor(Math.random() * 3) + 1),
          lastReview: new Date(2024, (i % 6) + 6, (i % 28) + 1).toISOString().split('T')[0],
          nextReview: new Date(2025, (i % 6), (i % 28) + 1).toISOString().split('T')[0],
          salary: 50000 + (Math.floor(Math.random() * 100000)),
          notes: i % 4 === 0 ? `High performer with strong client relationships` : ""
        };
      });

      const projectStatuses = ["Active", "Planning", "Review", "Completed"];
      const priorities = ["High", "Medium", "Low"];
      const mockTeamProjects: TeamProject[] = Array.from({ length: 12 }, (_, i) => {
        const budget = Math.floor(Math.random() * 200000) + 50000;
        const spent = budget * (0.3 + Math.random() * 0.6);
        
        return {
          id: `project_${i + 1}`,
          projectName: `${["Annual Audit", "Tax Review", "Compliance Check", "Financial Analysis", "Risk Assessment"][i % 5]} - Q${(i % 4) + 1}`,
          clientName: `Client ${String.fromCharCode(65 + (i % 26))}${Math.floor(i / 26) + 1}`,
          status: projectStatuses[i % projectStatuses.length],
          progress: Math.floor(Math.random() * 100),
          teamMembers: mockTeamMembers.slice(i % 3, (i % 3) + 3 + Math.floor(Math.random() * 3)).map(m => m.id),
          startDate: new Date(2024, (i % 12), (i % 28) + 1).toISOString().split('T')[0],
          dueDate: new Date(2024, ((i + 2) % 12), (i % 28) + 1).toISOString().split('T')[0],
          budget,
          spent,
          priority: priorities[i % priorities.length]
        };
      });

      setMetrics(mockMetrics);
      setTeamMembers(mockTeamMembers);
      setTeamProjects(mockTeamProjects);
    } catch (error: any) {
      console.error("Error loading team overview:", error);
      if (error?.status === 404) {
        setMetrics(null);
        setTeamMembers([]);
        setTeamProjects([]);
        return;
      }
    } finally {
      setLoading(false);
    }
  };

  const filteredMembers = teamMembers.filter(member => {
    const matchesSearch = member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         member.position.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDepartment = filterDepartment === "all" || member.department.toLowerCase() === filterDepartment.toLowerCase();
    return matchesSearch && matchesDepartment;
  });

  const getStatusBadgeVariant = (status: string) => {
    switch (status.toLowerCase()) {
      case "active": return "default";
      case "on leave": return "secondary";
      case "training": return "outline";
      default: return "outline";
    }
  };

  const getPerformanceColor = (rating: number) => {
    if (rating >= 4.0) return "text-success";
    if (rating >= 3.0) return "text-warning";
    return "text-destructive";
  };

  const exportToExcel = () => {
    const memberData = filteredMembers.map(member => ({
      "Name": member.name,
      "Employee ID": member.employeeId,
      "Position": member.position,
      "Department": member.department,
      "Status": member.status,
      "Billable Hours": member.billableHours,
      "Utilization (%)": member.utilization.toFixed(1),
      "Efficiency (%)": member.efficiency.toFixed(1),
      "Performance Rating": member.performanceRating.toFixed(1),
      "Client Satisfaction": member.clientSatisfaction.toFixed(1),
      "Development Score": member.developmentScore.toFixed(1),
      "Current Projects": member.currentProjects,
      "Completed Projects": member.completedProjects,
      "Skills": member.skills.join(", "),
      "Certifications": member.certifications.join(", "),
      "Start Date": member.startDate,
      "Last Review": member.lastReview,
      "Next Review": member.nextReview
    }));

    const projectData = teamProjects.map(project => ({
      "Project Name": project.projectName,
      "Client": project.clientName,
      "Status": project.status,
      "Progress (%)": project.progress,
      "Team Size": project.teamMembers.length,
      "Priority": project.priority,
      "Budget (KES)": project.budget,
      "Spent (KES)": project.spent.toFixed(0),
      "Budget Utilization (%)": ((project.spent / project.budget) * 100).toFixed(1),
      "Start Date": project.startDate,
      "Due Date": project.dueDate
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(memberData), "Team Members");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(projectData), "Team Projects");
    XLSX.writeFile(wb, "team-overview.xlsx");

    toast({
      title: "Export Successful",
      description: "Team overview exported to Excel.",
    });
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
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
            <p className="text-muted-foreground">
              Manage team members, track performance, and monitor projects
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="icon" onClick={exportToExcel} title="Export to Excel">
              <Download className="h-4 w-4" />
            </Button>
            <Dialog open={memberDialogOpen} onOpenChange={setMemberDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Add Member
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Add Team Member</DialogTitle>
                  <DialogDescription>
                    Add a new member to your team
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Full Name</Label>
                      <Input placeholder="Enter full name" />
                    </div>
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input type="email" placeholder="employee@ronalds.com" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Position</Label>
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="Select position" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="analyst">Analyst</SelectItem>
                          <SelectItem value="assistant">Assistant</SelectItem>
                          <SelectItem value="associate">Associate</SelectItem>
                          <SelectItem value="senior-associate">Senior Associate</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Department</Label>
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="Select department" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="audit">Audit</SelectItem>
                          <SelectItem value="tax">Tax</SelectItem>
                          <SelectItem value="advisory">Advisory</SelectItem>
                          <SelectItem value="risk">Risk Management</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Start Date</Label>
                    <Input type="date" />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setMemberDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={() => {
                      toast({ title: "Team member added successfully" });
                      setMemberDialogOpen(false);
                    }}>
                      Add Member
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Team Metrics */}
        {metrics && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Team Size</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.totalMembers}</div>
                <p className="text-xs text-muted-foreground">
                  {metrics.activeMembers} active members
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Team Utilization</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.averageUtilization.toFixed(1)}%</div>
                <p className="text-xs text-success">
                  {metrics.teamEfficiency.toFixed(1)}% efficiency
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Performance</CardTitle>
                <Star className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.averagePerformance.toFixed(1)}/5.0</div>
                <p className="text-xs text-muted-foreground">
                  {metrics.averageSatisfaction.toFixed(1)}/5.0 client satisfaction
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Growth</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.promotionsThisYear}</div>
                <p className="text-xs text-muted-foreground">
                  Promotions this year
                </p>
                <p className="text-xs text-success">
                  {metrics.retentionRate.toFixed(1)}% retention rate
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        <Tabs defaultValue="members" className="space-y-4">
          <TabsList>
            <TabsTrigger value="members">Team Members</TabsTrigger>
            <TabsTrigger value="projects">Active Projects</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
            <TabsTrigger value="development">Development</TabsTrigger>
          </TabsList>

          <TabsContent value="members" className="space-y-4">
            {/* Search and Filter */}
            <div className="flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search team members..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={filterDepartment} onValueChange={setFilterDepartment}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter by department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  <SelectItem value="audit">Audit</SelectItem>
                  <SelectItem value="tax">Tax</SelectItem>
                  <SelectItem value="advisory">Advisory</SelectItem>
                  <SelectItem value="risk management">Risk Management</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Team Members Table */}
            <Card>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Member</TableHead>
                      <TableHead>Position</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Utilization</TableHead>
                      <TableHead>Performance</TableHead>
                      <TableHead>Projects</TableHead>
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
                              <AvatarImage src={member.photo} />
                              <AvatarFallback>
                                {member.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                              </AvatarFallback>
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
                            <span className="text-sm font-medium">
                              {member.utilization.toFixed(0)}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Star className="h-4 w-4 text-yellow-500" />
                            <span className={`font-medium ${getPerformanceColor(member.performanceRating)}`}>
                              {member.performanceRating.toFixed(1)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-center">
                            <p className="font-medium">{member.currentProjects}</p>
                            <p className="text-xs text-muted-foreground">
                              {member.completedProjects} completed
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStatusBadgeVariant(member.status)}>
                            {member.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => setSelectedMember(member)}
                          >
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
                <CardTitle>Active Team Projects</CardTitle>
                <CardDescription>Current projects and their progress</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Project</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Progress</TableHead>
                      <TableHead>Team Size</TableHead>
                      <TableHead>Budget</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Due Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teamProjects.slice(0, 10).map((project) => (
                      <TableRow key={project.id}>
                        <TableCell className="font-medium">{project.projectName}</TableCell>
                        <TableCell>{project.clientName}</TableCell>
                        <TableCell>
                          <Badge variant={
                            project.status === "Active" ? "default" :
                            project.status === "Planning" ? "outline" :
                            project.status === "Review" ? "secondary" : "success"
                          }>
                            {project.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={project.progress} className="w-16 h-2" />
                            <span className="text-sm">{project.progress}%</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{project.teamMembers.length} members</Badge>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">KES {(project.budget / 1000).toFixed(0)}K</p>
                            <p className="text-xs text-muted-foreground">
                              {((project.spent / project.budget) * 100).toFixed(1)}% used
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={
                            project.priority === "High" ? "destructive" :
                            project.priority === "Medium" ? "outline" : "secondary"
                          }>
                            {project.priority}
                          </Badge>
                        </TableCell>
                        <TableCell>{new Date(project.dueDate).toLocaleDateString()}</TableCell>
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
                <CardContent>
                  <div className="space-y-4">
                    {["Excellent (4.5-5.0)", "Good (3.5-4.4)", "Average (2.5-3.4)", "Below Average (<2.5)"].map((range, index) => {
                      const counts = [5, 7, 2, 1];
                      const percentages = [(5/15)*100, (7/15)*100, (2/15)*100, (1/15)*100];
                      
                      return (
                        <div key={range}>
                          <div className="flex justify-between text-sm mb-1">
                            <span>{range}</span>
                            <span>{counts[index]} members ({percentages[index].toFixed(1)}%)</span>
                          </div>
                          <Progress value={percentages[index]} className="h-2" />
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Top Performers</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {teamMembers
                      .sort((a, b) => b.performanceRating - a.performanceRating)
                      .slice(0, 5)
                      .map((member, index) => (
                        <div key={member.id} className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1">
                              <Award className={`h-4 w-4 ${index === 0 ? 'text-yellow-500' : index === 1 ? 'text-gray-400' : index === 2 ? 'text-orange-600' : 'text-muted-foreground'}`} />
                              <span className="font-medium text-sm">#{index + 1}</span>
                            </div>
                            <div>
                              <p className="font-medium text-sm">{member.name}</p>
                              <p className="text-xs text-muted-foreground">{member.position}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-medium text-sm">{member.performanceRating.toFixed(1)}</p>
                            <p className="text-xs text-muted-foreground">{member.utilization.toFixed(0)}% util</p>
                          </div>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="development" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Skills & Certifications</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {["Financial Auditing", "Tax Planning", "Risk Assessment", "IFRS", "Due Diligence"].map((skill, index) => {
                      const memberCount = teamMembers.filter(m => m.skills.includes(skill)).length;
                      const percentage = (memberCount / teamMembers.length) * 100;
                      
                      return (
                        <div key={skill}>
                          <div className="flex justify-between text-sm mb-1">
                            <span>{skill}</span>
                            <span>{memberCount} members ({percentage.toFixed(1)}%)</span>
                          </div>
                          <Progress value={percentage} className="h-2" />
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Development Tracking</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Training Completions</span>
                      <span className="text-sm font-bold">{metrics?.trainingCompletions}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Avg Development Score</span>
                      <span className="text-sm font-bold">4.1/5.0</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Career Progressions</span>
                      <span className="text-sm font-bold text-success">{metrics?.promotionsThisYear}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Retention Rate</span>
                      <span className="text-sm font-bold text-success">{metrics?.retentionRate.toFixed(1)}%</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        {/* Member Detail Dialog */}
        {selectedMember && (
          <Dialog open={!!selectedMember} onOpenChange={() => setSelectedMember(null)}>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={selectedMember.photo} />
                    <AvatarFallback>
                      {selectedMember.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  {selectedMember.name}
                </DialogTitle>
                <DialogDescription>
                  {selectedMember.position} • {selectedMember.department}
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-2">Performance Metrics</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm">Utilization</span>
                        <span className="font-medium">{selectedMember.utilization.toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">Efficiency</span>
                        <span className="font-medium">{selectedMember.efficiency.toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">Performance Rating</span>
                        <span className="font-medium">{selectedMember.performanceRating.toFixed(1)}/5.0</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">Client Satisfaction</span>
                        <span className="font-medium">{selectedMember.clientSatisfaction.toFixed(1)}/5.0</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">Project Activity</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm">Current Projects</span>
                        <span className="font-medium">{selectedMember.currentProjects}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">Completed Projects</span>
                        <span className="font-medium">{selectedMember.completedProjects}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">Billable Hours</span>
                        <span className="font-medium">{selectedMember.billableHours}h</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-2">Skills & Certifications</h4>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {selectedMember.skills.map((skill) => (
                        <Badge key={skill} variant="outline">{skill}</Badge>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedMember.certifications.map((cert) => (
                        <Badge key={cert} variant="secondary">{cert}</Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">Review Schedule</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm">Last Review</span>
                        <span className="font-medium">{new Date(selectedMember.lastReview).toLocaleDateString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">Next Review</span>
                        <span className="font-medium">{new Date(selectedMember.nextReview).toLocaleDateString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">Development Score</span>
                        <span className="font-medium">{selectedMember.developmentScore.toFixed(1)}/5.0</span>
                      </div>
                    </div>
                  </div>
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
