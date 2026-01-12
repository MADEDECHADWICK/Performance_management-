import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  const [workloadData, setWorkloadData] = useState<WorkloadData[]>([]);
  const [projectAssignments, setProjectAssignments] = useState<ProjectAssignment[]>([]);
  const [metrics, setMetrics] = useState<WorkloadMetrics | null>(null);
  const [recommendations, setRecommendations] = useState<CapacityRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState('current_week');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortBy, setSortBy] = useState('utilization_rate');

  useEffect(() => {
    fetchWorkloadData();
  }, [selectedPeriod, filterStatus]);

  const fetchWorkloadData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      const [workloadRes, assignmentsRes, metricsRes, recommendationsRes] = await Promise.all([
        fetch(`http://localhost:4000/api/manager/workload-analysis?period=${selectedPeriod}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`http://localhost:4000/api/manager/project-assignments`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`http://localhost:4000/api/manager/workload-metrics`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`http://localhost:4000/api/manager/capacity-recommendations`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      if (workloadRes.ok) {
        const data = await workloadRes.json();
        setWorkloadData(data);
      }
      
      if (assignmentsRes.ok) {
        const data = await assignmentsRes.json();
        setProjectAssignments(data);
      }
      
      if (metricsRes.ok) {
        const data = await metricsRes.json();
        setMetrics(data);
      }
      
      if (recommendationsRes.ok) {
        const data = await recommendationsRes.json();
        setRecommendations(data);
      }
    } catch (error) {
      console.error('Error fetching workload data:', error);
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

  const filteredWorkload = workloadData
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

  const redistributeWorkload = async (fromEmployee: number, toEmployee: number, projectId: number) => {
    try {
      const token = localStorage.getItem('token');
      await fetch('http://localhost:4000/api/manager/redistribute-workload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          from_employee_id: fromEmployee,
          to_employee_id: toEmployee,
          project_id: projectId
        })
      });
      
      fetchWorkloadData(); // Refresh data
    } catch (error) {
      console.error('Error redistributing workload:', error);
    }
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
            <Button variant="outline">
              <PieChart className="w-4 h-4 mr-2" />
              Capacity Planning
            </Button>
            <Button>
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

        {/* Key Metrics */}
        {metrics && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Utilization</CardTitle>
                <BarChart3 className="w-4 h-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.avg_utilization.toFixed(1)}%</div>
                <div className="flex items-center mt-2">
                  {metrics.avg_utilization >= 80 ? (
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
                <div className="text-2xl font-bold text-red-600">{metrics.overloaded_employees}</div>
                <p className="text-xs text-gray-600">Employees at risk</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Critical Deadlines</CardTitle>
                <Clock className="w-4 h-4 text-orange-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">{metrics.critical_deadlines}</div>
                <p className="text-xs text-gray-600">Next 7 days</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Burnout Risk</CardTitle>
                <Activity className="w-4 h-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{metrics.burnout_risk}</div>
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
              {recommendations.slice(0, 3).map((rec, index) => (
                <Alert key={index} className={rec.priority === 'urgent' ? 'border-red-200 bg-red-50' : 'border-blue-200 bg-blue-50'}>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>
                    {rec.priority === 'urgent' ? 'Urgent Action Required' : 'Optimization Opportunity'}
                  </AlertTitle>
                  <AlertDescription className="mt-2">
                    <p>{rec.description}</p>
                    {rec.affected_employees.length > 0 && (
                      <p className="text-sm mt-1">
                        Affects: {rec.affected_employees.join(', ')}
                      </p>
                    )}
                  </AlertDescription>
                </Alert>
              ))}
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
                          {employee.employee_name.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <h3 className="font-semibold text-gray-900">{employee.employee_name}</h3>
                        <p className="text-sm text-gray-600">{employee.role} • {employee.position_level}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      {getWorkloadStatusBadge(employee.workload_status)}
                      <Button variant="outline" size="sm">
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
                  {(employee.stress_indicators.missed_deadlines > 0 || 
                    employee.stress_indicators.overtime_hours > 10) && (
                    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <div className="flex items-center space-x-2">
                        <AlertTriangle className="w-4 h-4 text-red-600" />
                        <span className="text-sm font-medium text-red-800">Stress Indicators</span>
                      </div>
                      <div className="mt-2 flex space-x-4 text-sm text-red-700">
                        {employee.stress_indicators.missed_deadlines > 0 && (
                          <span>Missed Deadlines: {employee.stress_indicators.missed_deadlines}</span>
                        )}
                        {employee.stress_indicators.overtime_hours > 10 && (
                          <span>Overtime: {employee.stress_indicators.overtime_hours}h</span>
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
              {projectAssignments.map((assignment) => (
                <div key={assignment.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex-1">
                    <h3 className="font-semibold">{assignment.project_name}</h3>
                    <p className="text-sm text-gray-600">
                      {assignment.client_name} • {assignment.employee_name} ({assignment.role_in_project})
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
                        Due: {new Date(assignment.deadline).toLocaleDateString()}
                      </p>
                      <p className="text-xs text-gray-600">
                        {Math.ceil((new Date(assignment.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))} days
                      </p>
                    </div>
                    <Button variant="outline" size="sm">
                      Reassign
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default WorkloadManagement;