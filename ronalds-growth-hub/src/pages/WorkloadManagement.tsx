import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { 
  BarChart3,
  Users,
  AlertTriangle,
  Clock,
  Target,
  TrendingUp,
  TrendingDown,
  Calendar,
  UserCheck,
  UserX,
  Timer,
  Briefcase,
  PieChart,
  Activity
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { apiFetch } from "@/lib/api";

interface WorkloadData {
  employee_id: number;
  employee_name: string;
  role: string;
  position_level: string;
  avatar?: string;
  current_capacity: number; // Percentage of full capacity
  allocated_hours: number;
  available_hours: number;
  utilization_rate: number;
  active_projects: number;
  upcoming_deadlines: number;
  overdue_tasks: number;
  workload_status: 'underutilized' | 'optimal' | 'overloaded' | 'critical';
  weekly_hours: number[];
  stress_indicators: {
    missed_deadlines: number;
    overtime_hours: number;
    quality_scores: number[];
  };
}

interface ProjectAssignment {
  id: number;
  job_id?: number;
  project_name: string;
  client_name: string;
  employee_id: number;
  employee_name: string;
  role_in_project: string;
  allocated_hours: number;
  deadline: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  completion_percentage: number;
  estimated_remaining_hours: number;
}

interface WorkloadMetrics {
  total_team_members: number;
  avg_utilization: number;
  overloaded_employees: number;
  underutilized_employees: number;
  critical_deadlines: number;
  capacity_variance: number;
  burnout_risk: number;
}

interface CapacityRecommendation {
  type: 'redistribute' | 'hire' | 'training' | 'deadline_extension';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  description: string;
  affected_employees: string[];
  impact_score: number;
}

const WorkloadManagement = () => {
  const { toast } = useToast();
  const [workloadData, setWorkloadData] = useState<WorkloadData[]>([]);
  const [projectAssignments, setProjectAssignments] = useState<ProjectAssignment[]>([]);
  const [metrics, setMetrics] = useState<WorkloadMetrics | null>(null);
  const [recommendations, setRecommendations] = useState<CapacityRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState('current_week');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortBy, setSortBy] = useState('utilization_rate');
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignTarget, setReassignTarget] = useState<ProjectAssignment | null>(null);
  const [reassignTo, setReassignTo] = useState('');
  const [reassignNotes, setReassignNotes] = useState('');
  const [reassigning, setReassigning] = useState(false);
  const [reassignSource, setReassignSource] = useState<'assignment' | 'employee'>('assignment');
  const [reassignJobId, setReassignJobId] = useState('');
  const [reassignFromEmployeeId, setReassignFromEmployeeId] = useState<number | null>(null);
  const [capacityOpen, setCapacityOpen] = useState(false);
  const [rebalanceOpen, setRebalanceOpen] = useState(false);

  const extractItems = (payload: any) => {
    const data = payload?.data ?? payload;
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.items)) return data.items;
    if (Array.isArray(data?.data)) return data.data;
    return [];
  };

  useEffect(() => {
    fetchWorkloadData();
  }, [selectedPeriod, filterStatus]);

  const fetchWorkloadData = async () => {
    try {
      setLoading(true);
      setErrorMessage(null);
      
      const [workloadRes, assignmentsRes, metricsRes, recommendationsRes] = await Promise.all([
        apiFetch("GET", `/team-management/workload-analysis?period=${selectedPeriod}`),
        apiFetch("GET", "/team-management/project-assignments"),
        apiFetch("GET", "/team-management/workload-metrics"),
        apiFetch("GET", "/team-management/capacity-recommendations"),
      ]);

      const assignmentItems = extractItems(assignmentsRes);
      const normalizedAssignments = Array.isArray(assignmentItems)
        ? assignmentItems
            .filter(Boolean)
            .map((assignment: any) => ({
            id: Number(assignment.id ?? assignment.jobId ?? assignment.project_id ?? 0),
            project_name: String(assignment.project_name ?? assignment.jobName ?? 'Job'),
            client_name: String(assignment.client_name ?? assignment.clientName ?? 'Client'),
            employee_id: Number(assignment.employee_id ?? assignment.employeeId ?? 0),
            employee_name: String(assignment.employee_name ?? assignment.employeeName ?? 'Unassigned'),
            role_in_project: String(assignment.role_in_project ?? assignment.role ?? 'Team'),
            allocated_hours: Number(assignment.allocated_hours ?? 0),
            deadline: assignment.deadline ?? assignment.dueDate ?? assignment.due_date ?? null,
            priority: assignment.priority ?? 'medium',
            completion_percentage: Number(assignment.completion_percentage ?? 0),
            estimated_remaining_hours: Number(assignment.estimated_remaining_hours ?? 0),
            job_id: Number(assignment.jobId ?? assignment.job_id ?? assignment.id ?? 0),
          }))
        : [];

      const workloadItems = extractItems(workloadRes);
      const normalizedWorkload = Array.isArray(workloadItems)
        ? workloadItems
            .filter(Boolean)
            .map((item: any) => {
            const utilizationRate = Number(item.utilizationRate ?? item.utilization_rate ?? 0);
            const capacity = Math.round(utilizationRate * 100);
            const stress = item?.stress_indicators ?? {};
            return {
              employee_id: Number(item.employeeId ?? item.employee_id ?? 0),
              employee_name: String(item.name ?? item.employee_name ?? 'Team member'),
              role: String(item.role ?? 'Role'),
              position_level: String(item.position_level ?? item.positionLevel ?? 'Level'),
              avatar: item.avatar,
              current_capacity: Number.isFinite(capacity) ? capacity : 0,
              allocated_hours: Number(item.allocatedHours ?? item.allocated_hours ?? 0),
              available_hours: Number(item.availableHours ?? item.available_hours ?? 0),
              utilization_rate: Number.isFinite(utilizationRate)
                ? Math.round(utilizationRate * 100)
                : 0,
              active_projects: Number(item.jobsAssigned ?? item.active_projects ?? 0),
              upcoming_deadlines: Number(item.upcoming_deadlines ?? 0),
              overdue_tasks: Number(item.overdue_tasks ?? 0),
              workload_status:
                item.workload_status ??
                (utilizationRate > 1
                  ? 'overloaded'
                  : utilizationRate < 0.6
                  ? 'underutilized'
                  : 'optimal'),
              weekly_hours: Array.isArray(item.weekly_hours) ? item.weekly_hours : [],
              stress_indicators: {
                missed_deadlines: Number(stress.missed_deadlines ?? 0),
                overtime_hours: Number(stress.overtime_hours ?? 0),
                quality_scores: Array.isArray(stress.quality_scores)
                  ? stress.quality_scores
                  : [],
              },
            };
          })
        : [];
      const recommendationItems = extractItems(recommendationsRes);
      const normalizedRecommendations = Array.isArray(recommendationItems)
        ? recommendationItems.map((rec: any) => ({
            type: rec.type ?? 'redistribute',
            priority: rec.priority ?? 'medium',
            description:
              rec.description ??
              `Recommendation for ${rec.name || 'team member'}: ${rec.recommendation || 'review workload'}`,
            affected_employees: Array.isArray(rec.affected_employees)
              ? rec.affected_employees
              : rec.name
              ? [rec.name]
              : [],
            impact_score: Number(rec.impact_score ?? 0),
          }))
        : [];

      setWorkloadData(normalizedWorkload);
      setProjectAssignments(normalizedAssignments);
      setMetrics(metricsRes && typeof metricsRes === "object" ? metricsRes : null);
      setRecommendations(normalizedRecommendations);
    } catch (error: any) {
      if (error?.status === 401) {
        window.location.href = "/auth";
        return;
      }
      if (error?.status === 403) {
        setWorkloadData([]);
        setProjectAssignments([]);
        setMetrics(null);
        setRecommendations([]);
        setErrorMessage("You don't have permission to view workload analytics.");
        return;
      }
      if (error?.status === 404) {
        setWorkloadData([]);
        setProjectAssignments([]);
        setMetrics(null);
        setRecommendations([]);
        setErrorMessage(null);
        return;
      }
      console.error('Error fetching workload data:', error);
      setErrorMessage(error?.message || 'Failed to load workload data.');
    } finally {
      setLoading(false);
    }
  };

  const getWorkloadStatusBadge = (status: string) => {
    const statusConfig = {
      'underutilized': { color: 'bg-blue-100 text-blue-800', text: 'Underutilized' },
      'optimal': { color: 'bg-green-100 text-green-800', text: 'Optimal' },
      'overloaded': { color: 'bg-orange-100 text-orange-800', text: 'Overloaded' },
      'critical': { color: 'bg-red-100 text-red-800', text: 'Critical' }
    };
    
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.optimal;
    return <Badge className={config.color}>{config.text}</Badge>;
  };

  const getPriorityBadge = (priority: string) => {
    const priorityConfig = {
      'low': { color: 'bg-gray-100 text-gray-800', text: 'Low' },
      'medium': { color: 'bg-blue-100 text-blue-800', text: 'Medium' },
      'high': { color: 'bg-orange-100 text-orange-800', text: 'High' },
      'critical': { color: 'bg-red-100 text-red-800', text: 'Critical' }
    };
    
    const config = priorityConfig[priority as keyof typeof priorityConfig] || priorityConfig.low;
    return <Badge className={config.color}>{config.text}</Badge>;
  };

  const getUtilizationColor = (rate: number) => {
    if (rate > 100) return "text-red-600";
    if (rate > 85) return "text-orange-600";
    if (rate > 70) return "text-green-600";
    return "text-blue-600";
  };

  const safeWorkload = Array.isArray(workloadData) ? workloadData.filter(Boolean) : [];
  const safeAssignments = Array.isArray(projectAssignments) ? projectAssignments.filter(Boolean) : [];

  const openReassign = (assignment: ProjectAssignment) => {
    setReassignSource('assignment');
    setReassignTarget(assignment);
    setReassignTo('');
    setReassignNotes('');
    setReassignJobId(String((assignment as any).job_id ?? assignment.id));
    setReassignFromEmployeeId(assignment.employee_id || null);
    setReassignOpen(true);
  };

  const openEmployeeReassign = (employee: WorkloadData) => {
    const assignmentsForEmployee = safeAssignments.filter(
      (assignment) => assignment.employee_id === employee.employee_id
    );
    const defaultJobId =
      assignmentsForEmployee.length === 1
        ? String((assignmentsForEmployee[0] as any).job_id ?? assignmentsForEmployee[0].id)
        : '';
    setReassignSource('employee');
    setReassignTarget(null);
    setReassignTo('');
    setReassignNotes('');
    setReassignJobId(defaultJobId);
    setReassignFromEmployeeId(employee.employee_id ?? null);
    setReassignOpen(true);
  };

  const handleReassign = async () => {
    if (!reassignTo) return;
    const jobId =
      reassignSource === 'employee'
        ? Number(reassignJobId)
        : Number((reassignTarget as any)?.job_id ?? reassignTarget?.id);
    if (!jobId) return;
    try {
      setReassigning(true);
      await apiFetch('POST', '/team-management/redistribute-workload', {
        jobId,
        fromEmployeeId: reassignFromEmployeeId || reassignTarget?.employee_id || undefined,
        toEmployeeId: Number(reassignTo),
        notes: reassignNotes || undefined,
      });
      setReassignOpen(false);
      fetchWorkloadData();
    } catch (error) {
      console.error('Error reassigning workload:', error);
      const message =
        (error as any)?.message ||
        (error as any)?.data?.error ||
        'Failed to reassign workload.';
      toast({ title: 'Reassignment failed', description: message, variant: 'destructive' });
    } finally {
      setReassigning(false);
    }
  };
  const filteredWorkload = safeWorkload
    .filter(employee => 
      filterStatus === 'all' || employee.workload_status === filterStatus
    )
    .sort((a, b) => {
      switch (sortBy) {
        case 'utilization_rate':
          return b.utilization_rate - a.utilization_rate;
        case 'current_capacity':
          return b.current_capacity - a.current_capacity;
        case 'overdue_tasks':
          return b.overdue_tasks - a.overdue_tasks;
        case 'name':
          return a.employee_name.localeCompare(b.employee_name);
        default:
          return 0;
      }
    });

  const overloadedEmployees = filteredWorkload.filter(
    (employee) => employee.utilization_rate > 100
  );
  const underutilizedEmployees = filteredWorkload.filter(
    (employee) => employee.utilization_rate < 60
  );

  const upcomingAssignments = safeAssignments
    .filter((assignment) => assignment.deadline)
    .sort((a, b) => {
      const aTime = a.deadline ? new Date(a.deadline).getTime() : 0;
      const bTime = b.deadline ? new Date(b.deadline).getTime() : 0;
      return aTime - bTime;
    })
    .slice(0, 6);

  const redistributeWorkload = async (fromEmployee: number, toEmployee: number, projectId: number) => {
    try {
      await apiFetch("POST", "/team-management/redistribute-workload", {
        from_employee_id: fromEmployee,
        to_employee_id: toEmployee,
        project_id: projectId,
      });
      
      fetchWorkloadData(); // Refresh data
    } catch (error) {
      console.error('Error redistributing workload:', error);
    }
  };

  const safeMetrics: WorkloadMetrics = {
    total_team_members: metrics?.total_team_members ?? 0,
    avg_utilization: Number(metrics?.avg_utilization ?? 0) || 0,
    overloaded_employees: metrics?.overloaded_employees ?? 0,
    underutilized_employees: metrics?.underutilized_employees ?? 0,
    critical_deadlines: metrics?.critical_deadlines ?? 0,
    capacity_variance: metrics?.capacity_variance ?? 0,
    burnout_risk: Number(metrics?.burnout_risk ?? 0) || 0,
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading workload data...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Workload Management</h1>
            <p className="text-gray-600 mt-1">Monitor team capacity and optimize resource allocation</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setCapacityOpen(true)}>
              <PieChart className="w-4 h-4 mr-2" />
              Capacity Planning
            </Button>
            <Button onClick={() => setRebalanceOpen(true)}>
              <Users className="w-4 h-4 mr-2" />
              Rebalance Workload
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-4 bg-white p-4 rounded-lg border">
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current_week">Current Week</SelectItem>
              <SelectItem value="current_month">Current Month</SelectItem>
              <SelectItem value="next_month">Next Month</SelectItem>
              <SelectItem value="quarter">Quarter</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Filter status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Employees</SelectItem>
              <SelectItem value="underutilized">Underutilized</SelectItem>
              <SelectItem value="optimal">Optimal</SelectItem>
              <SelectItem value="overloaded">Overloaded</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="utilization_rate">Utilization</SelectItem>
              <SelectItem value="current_capacity">Capacity</SelectItem>
              <SelectItem value="overdue_tasks">Overdue Tasks</SelectItem>
              <SelectItem value="name">Name</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {(errorMessage || (workloadData.length === 0 && projectAssignments.length === 0 && !metrics)) && (
          <Alert>
            <AlertTitle>{errorMessage ? "Access limited" : "No workload data yet"}</AlertTitle>
            <AlertDescription>
              {errorMessage
                ? errorMessage
                : "Workload analytics will appear once jobs, assignments, and time entries are available."}
            </AlertDescription>
          </Alert>
        )}

        {/* Key Metrics */}
        {metrics && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Utilization</CardTitle>
                <BarChart3 className="w-4 h-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{safeMetrics.avg_utilization.toFixed(1)}%</div>
                <div className="flex items-center mt-2">
                  {safeMetrics.avg_utilization >= 80 ? (
                    <TrendingUp className="w-4 h-4 text-green-600 mr-1" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-red-600 mr-1" />
                  )}
                  <p className="text-xs text-gray-600">Team average</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Overloaded</CardTitle>
                <AlertTriangle className="w-4 h-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{safeMetrics.overloaded_employees}</div>
                <p className="text-xs text-gray-600">Employees at risk</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Critical Deadlines</CardTitle>
                <Clock className="w-4 h-4 text-orange-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">{safeMetrics.critical_deadlines}</div>
                <p className="text-xs text-gray-600">Next 7 days</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Burnout Risk</CardTitle>
                <Activity className="w-4 h-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{safeMetrics.burnout_risk}</div>
                <p className="text-xs text-gray-600">High-risk employees</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Recommendations */}
        {recommendations.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Workload Optimization Recommendations</CardTitle>
              <CardDescription>AI-powered suggestions to improve team balance</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {recommendations.slice(0, 3).map((rec, index) => {
                const affected = Array.isArray(rec.affected_employees)
                  ? rec.affected_employees
                  : [];
                return (
                <Alert key={index} className={rec.priority === 'urgent' ? 'border-red-200 bg-red-50' : 'border-blue-200 bg-blue-50'}>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>
                    {rec.priority === 'urgent' ? 'Urgent Action Required' : 'Optimization Opportunity'}
                  </AlertTitle>
                  <AlertDescription className="mt-2">
                    <p>{rec.description}</p>
                    {affected.length > 0 && (
                      <p className="text-sm mt-1">
                        Affects: {affected.join(', ')}
                      </p>
                    )}
                  </AlertDescription>
                </Alert>
              )})}
            </CardContent>
          </Card>
        )}

        {/* Team Workload Overview */}
        <Card>
          <CardHeader>
            <CardTitle>Team Workload Overview</CardTitle>
            <CardDescription>Current capacity and utilization rates</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {filteredWorkload.map((employee) => (
                <div key={employee.employee_id} className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-4">
                      <Avatar>
                        <AvatarImage src={employee.avatar} alt={employee.employee_name} />
                        <AvatarFallback>
                          {(employee.employee_name || "NA").slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <h3 className="font-semibold text-gray-900">
                          {employee.employee_name || "Team member"}
                        </h3>
                        <p className="text-sm text-gray-600">
                          {employee.role || "Role"} - {employee.position_level || "Level"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      {getWorkloadStatusBadge(employee.workload_status)}
                      <Button variant="outline" size="sm" onClick={() => openEmployeeReassign(employee)}>
                        <Users className="w-4 h-4 mr-1" />
                        Reassign
                      </Button>
                    </div>
                  </div>

                  {/* Workload Metrics */}
                  <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-4">
                    <div>
                      <p className="text-sm text-gray-600">Utilization</p>
                      <p className={`text-lg font-semibold ${getUtilizationColor(employee.utilization_rate)}`}>
                        {employee.utilization_rate}%
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Capacity</p>
                      <p className="text-lg font-semibold">{employee.current_capacity}%</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Active Projects</p>
                      <p className="text-lg font-semibold">{employee.active_projects}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Allocated Hours</p>
                      <p className="text-lg font-semibold">{employee.allocated_hours}h</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Upcoming Deadlines</p>
                      <p className="text-lg font-semibold text-orange-600">{employee.upcoming_deadlines}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Overdue Tasks</p>
                      <p className="text-lg font-semibold text-red-600">{employee.overdue_tasks}</p>
                    </div>
                  </div>

                  {/* Capacity Progress Bar */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Capacity Utilization</span>
                      <span className="text-sm font-medium">{employee.current_capacity}%</span>
                    </div>
                    <Progress 
                      value={employee.current_capacity} 
                      className={`h-3 ${
                        employee.current_capacity > 100 
                          ? 'bg-red-100' 
                          : employee.current_capacity > 85 
                          ? 'bg-orange-100' 
                          : 'bg-green-100'
                      }`}
                    />
                  </div>

                  {/* Stress Indicators */}
                  {((employee.stress_indicators?.missed_deadlines ?? 0) > 0 || 
                    (employee.stress_indicators?.overtime_hours ?? 0) > 10) && (
                    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <div className="flex items-center space-x-2">
                        <AlertTriangle className="w-4 h-4 text-red-600" />
                        <span className="text-sm font-medium text-red-800">Stress Indicators</span>
                      </div>
                      <div className="mt-2 flex space-x-4 text-sm text-red-700">
                        {(employee.stress_indicators?.missed_deadlines ?? 0) > 0 && (
                          <span>Missed Deadlines: {employee.stress_indicators?.missed_deadlines ?? 0}</span>
                        )}
                        {(employee.stress_indicators?.overtime_hours ?? 0) > 10 && (
                          <span>Overtime: {employee.stress_indicators?.overtime_hours ?? 0}h</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {filteredWorkload.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-gray-500">No employees found matching your criteria.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Current Project Assignments */}
        <Card>
          <CardHeader>
            <CardTitle>Current Project Assignments</CardTitle>
            <CardDescription>Active projects and resource allocation</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {safeAssignments.map((assignment) => (
                <div key={assignment.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex-1">
                    <h3 className="font-semibold">{assignment.project_name}</h3>
                    <p className="text-sm text-gray-600">
                      {assignment.client_name} - {assignment.employee_name} ({assignment.role_in_project})
                    </p>
                    <div className="mt-2 flex items-center space-x-4">
                      <div className="flex items-center space-x-2">
                        <Progress value={assignment.completion_percentage} className="w-20 h-2" />
                        <span className="text-xs text-gray-600">{assignment.completion_percentage}%</span>
                      </div>
                      <span className="text-xs text-gray-600">
                        {assignment.allocated_hours}h allocated
                      </span>
                      <span className="text-xs text-gray-600">
                        {assignment.estimated_remaining_hours}h remaining
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    {getPriorityBadge(assignment.priority)}
                    <div className="text-right">
                      <p className="text-sm font-medium">
                        Due: {assignment.deadline && !Number.isNaN(new Date(assignment.deadline).getTime())
                          ? new Date(assignment.deadline).toLocaleDateString()
                          : 'Not set'}
                      </p>
                      <p className="text-xs text-gray-600">
                        {assignment.deadline && !Number.isNaN(new Date(assignment.deadline).getTime())
                          ? `${Math.ceil((new Date(assignment.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))} days`
                          : '--'}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => openReassign(assignment)}>
                      Reassign
                    </Button>
                  </div>
                </div>
              ))}
              {safeAssignments.length === 0 && (
                <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No project assignments yet.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Dialog open={reassignOpen} onOpenChange={setReassignOpen}>
          <DialogContent className="max-w-[420px]">
            <DialogHeader>
              <DialogTitle>Reassign Work</DialogTitle>
              <DialogDescription>
                Move {reassignTarget?.project_name ?? 'this job'} to another team member.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {reassignSource === 'employee' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Job to reassign</label>
                  <Select value={reassignJobId} onValueChange={setReassignJobId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select job" />
                    </SelectTrigger>
                    <SelectContent>
                      {safeAssignments
                        .filter((assignment) =>
                          reassignFromEmployeeId
                            ? assignment.employee_id === reassignFromEmployeeId
                            : false
                        )
                        .map((assignment) => (
                          <SelectItem
                            key={`${assignment.id}-job`}
                            value={String((assignment as any).job_id ?? assignment.id)}
                          >
                            {assignment.project_name || 'Job'}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {reassignFromEmployeeId &&
                    safeAssignments.filter(
                      (assignment) => assignment.employee_id === reassignFromEmployeeId
                    ).length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        No active assignments for this team member.
                      </p>
                    )}
                </div>
              )}
              <div className="space-y-2">
                <label className="text-sm font-medium">Assign to</label>
                <Select value={reassignTo} onValueChange={setReassignTo}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select team member" />
                  </SelectTrigger>
                  <SelectContent>
                    {safeWorkload.map((member) => (
                      <SelectItem key={member.employee_id} value={String(member.employee_id)}>
                        {member.employee_name || 'Team member'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Notes</label>
                <Textarea
                  value={reassignNotes}
                  onChange={(event) => setReassignNotes(event.target.value)}
                  placeholder="Optional context for reassignment"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setReassignOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={async () => {
                    if (!reassignTo) {
                      toast({ title: 'Select a team member', variant: 'destructive' });
                      return;
                    }
                    if (reassignSource === 'employee' && !reassignJobId) {
                      toast({ title: 'Select a job to reassign', variant: 'destructive' });
                      return;
                    }
                    await handleReassign();
                    toast({ title: 'Reassignment saved' });
                  }}
                  disabled={!reassignTo || reassigning || (reassignSource === 'employee' && !reassignJobId)}
                >
                  {reassigning ? 'Reassigning...' : 'Reassign'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={capacityOpen} onOpenChange={setCapacityOpen}>
          <DialogContent className="w-[94vw] max-w-[680px] max-h-[88vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Capacity Planning</DialogTitle>
              <DialogDescription>
                Forecast team capacity vs demand for the selected period and upcoming work.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Avg Utilization</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {metrics ? Math.round(metrics.avg_utilization) : 0}%
                  </div>
                  <p className="text-xs text-muted-foreground">Current period</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Overloaded</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-destructive">
                    {metrics?.overloaded_employees ?? 0}
                  </div>
                  <p className="text-xs text-muted-foreground">Employees at risk</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Critical Deadlines</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {metrics?.critical_deadlines ?? 0}
                  </div>
                  <p className="text-xs text-muted-foreground">Next 7 days</p>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium">Upcoming assignments</p>
                <p className="text-xs text-muted-foreground">
                  Focus on upcoming due dates to plan capacity.
                </p>
              </div>
              {upcomingAssignments.length === 0 ? (
                <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No upcoming assignments to plan for.
                </div>
              ) : (
                <div className="space-y-2">
                  {upcomingAssignments.map((assignment) => (
                    <div key={assignment.id} className="flex items-center justify-between rounded-md border p-3">
                      <div>
                        <p className="font-medium">{assignment.project_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {assignment.client_name} · {assignment.employee_name}
                        </p>
                      </div>
                      <div className="text-right text-sm text-muted-foreground">
                        {assignment.deadline
                          ? new Date(assignment.deadline).toLocaleDateString()
                          : 'No due date'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setCapacityOpen(false)}>
                Close
              </Button>
              <Button variant="outline">Export Plan</Button>
              <Button>Reserve Capacity</Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={rebalanceOpen} onOpenChange={setRebalanceOpen}>
          <DialogContent className="w-[94vw] max-w-[720px] max-h-[88vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Rebalance Workload</DialogTitle>
              <DialogDescription>
                Move assignments from overloaded team members to underutilized staff.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Overloaded</CardTitle>
                  <CardDescription>Employees above 100% utilization.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {overloadedEmployees.length === 0 ? (
                    <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                      No overloaded employees right now.
                    </div>
                  ) : (
                    overloadedEmployees.map((employee) => (
                      <div key={employee.employee_id} className="flex items-center justify-between gap-2 rounded-md border p-3">
                        <div>
                          <p className="font-medium">{employee.employee_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {employee.role} - {employee.position_level}
                          </p>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => openEmployeeReassign(employee)}>
                          Reassign
                        </Button>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Underutilized</CardTitle>
                  <CardDescription>Employees below 60% utilization.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {underutilizedEmployees.length === 0 ? (
                    <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                      No underutilized employees right now.
                    </div>
                  ) : (
                    underutilizedEmployees.map((employee) => (
                      <div key={employee.employee_id} className="rounded-md border p-3">
                        <p className="font-medium">{employee.employee_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {employee.role} - {employee.position_level}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Utilization: {employee.utilization_rate}%
                        </p>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRebalanceOpen(false)}>
                Close
              </Button>
              <Button onClick={() => setRebalanceOpen(false)}>Done</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default WorkloadManagement;
