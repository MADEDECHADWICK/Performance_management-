import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { apiFetch } from '@/integrations/apiClient';
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  TrendingUp,
  Users,
  DollarSign,
  Calendar,
  BarChart3,
  FileText,
  Play,
  Pause,
  CheckSquare
} from 'lucide-react';

interface Job {
  id: number;
  title: string;
  job_code: string;
  status: string;
  client: { client_name: string };
  partner: { first_name: string; last_name: string };
  manager: { first_name: string; last_name: string };
  due_date: string;
  estimated_hours: number;
  budget: number;
  milestones: any[];
  workLogs: any[];
  jobStaffAssignments: any[];
}

interface WorkflowData {
  progress: number;
  totalHoursLogged: number;
  totalCost: number;
  utilization: number;
  profitability: number;
}

const statusColors = {
  'not_started': 'bg-gray-100 text-gray-800',
  'in_progress': 'bg-blue-100 text-blue-800',
  'completed': 'bg-green-100 text-green-800',
  'on_hold': 'bg-yellow-100 text-yellow-800',
  'cancelled': 'bg-red-100 text-red-800'
};

const priorityColors = {
  'low': 'bg-gray-100 text-gray-800',
  'medium': 'bg-blue-100 text-blue-800',
  'high': 'bg-orange-100 text-orange-800',
  'urgent': 'bg-red-100 text-red-800'
};

export default function JobWorkflowDashboard() {
  const { toast } = useToast();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [workflowData, setWorkflowData] = useState<WorkflowData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadActiveJobs();
  }, []);

  const loadActiveJobs = async () => {
    try {
      setIsLoading(true);
      const response = await apiFetch('GET', '/job-workflow/active');
      setJobs(response.jobs || []);
    } catch (error) {
      console.error('Failed to load jobs:', error);
      toast({
        title: "Error",
        description: "Failed to load active jobs",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadJobWorkflow = async (jobId: number) => {
    try {
      const response = await apiFetch('GET', `/job-workflow/${jobId}/workflow`);
      setSelectedJob(response.job);
      setWorkflowData(response.workflow);
    } catch (error) {
      console.error('Failed to load workflow:', error);
      toast({
        title: "Error",
        description: "Failed to load job workflow",
        variant: "destructive"
      });
    }
  };

  const updateMilestone = async (jobId: number, milestoneId: number, status: string) => {
    try {
      await apiFetch('PUT', `/job-workflow/${jobId}/milestone/${milestoneId}`, { status });
      await loadJobWorkflow(jobId);
      toast({
        title: "Success",
        description: "Milestone updated successfully"
      });
    } catch (error) {
      console.error('Failed to update milestone:', error);
      toast({
        title: "Error",
        description: "Failed to update milestone",
        variant: "destructive"
      });
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const getDaysUntilDue = (dueDate: string) => {
    const due = new Date(dueDate);
    const now = new Date();
    const diffTime = due.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Job Workflow Dashboard</h1>
            <p className="text-gray-600">Monitor active jobs and workflow progress across all departments</p>
          </div>
          <Button onClick={loadActiveJobs} disabled={isLoading}>
            <BarChart3 className="h-4 w-4 mr-2" />
            {isLoading ? 'Loading...' : 'Refresh Data'}
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Job List */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <FileText className="h-5 w-5 mr-2" />
                  Active Jobs ({jobs.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 max-h-96 overflow-y-auto">
                {jobs.map((job) => {
                  const daysUntilDue = getDaysUntilDue(job.due_date);
                  const isOverdue = daysUntilDue < 0;
                  const isUrgent = daysUntilDue <= 3 && daysUntilDue >= 0;

                  return (
                    <div
                      key={job.id}
                      className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedJob?.id === job.id ? 'bg-blue-50 border-blue-300' : 'hover:bg-gray-50'
                      }`}
                      onClick={() => loadJobWorkflow(job.id)}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-semibold text-sm">{job.title}</h4>
                        <Badge className={statusColors[job.status]}>
                          {job.status.replace('_', ' ')}
                        </Badge>
                      </div>
                      
                      <p className="text-xs text-gray-600 mb-1">{job.job_code}</p>
                      <p className="text-xs text-gray-600 mb-2">{job.client?.client_name}</p>
                      
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-gray-500">
                          {job.partner?.first_name} {job.partner?.last_name}
                        </span>
                        <span className={`font-medium ${isOverdue ? 'text-red-600' : isUrgent ? 'text-orange-600' : 'text-gray-600'}`}>
                          {isOverdue ? `${Math.abs(daysUntilDue)} days overdue` : `${daysUntilDue} days left`}
                        </span>
                      </div>
                    </div>
                  );
                })}
                
                {jobs.length === 0 && !isLoading && (
                  <div className="text-center py-6 text-gray-500">
                    <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No active jobs found</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Job Details */}
          <div className="lg:col-span-2">
            {selectedJob ? (
              <div className="space-y-6">
                {/* Job Overview */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>{selectedJob.title}</span>
                      <Badge className={statusColors[selectedJob.status]}>
                        {selectedJob.status.replace('_', ' ')}
                      </Badge>
                    </CardTitle>
                    <CardDescription>
                      {selectedJob.job_code} • {selectedJob.client?.client_name}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {workflowData && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-blue-600">{workflowData.progress}%</div>
                          <div className="text-sm text-gray-600">Progress</div>
                          <Progress value={workflowData.progress} className="mt-1" />
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-green-600">
                            {workflowData.totalHoursLogged}h
                          </div>
                          <div className="text-sm text-gray-600">Hours Logged</div>
                          <div className="text-xs text-gray-500">
                            {workflowData.utilization.toFixed(1)}% utilization
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-purple-600">
                            {formatCurrency(workflowData.totalCost)}
                          </div>
                          <div className="text-sm text-gray-600">Total Cost</div>
                        </div>
                        <div className="text-center">
                          <div className={`text-2xl font-bold ${workflowData.profitability > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {workflowData.profitability.toFixed(1)}%
                          </div>
                          <div className="text-sm text-gray-600">Profitability</div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Milestones */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <CheckSquare className="h-5 w-5 mr-2" />
                      Job Milestones
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {selectedJob.milestones?.map((milestone, index) => (
                        <div key={milestone.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center space-x-3">
                            {milestone.status === 'completed' ? (
                              <CheckCircle2 className="h-5 w-5 text-green-600" />
                            ) : milestone.status === 'in_progress' ? (
                              <Clock className="h-5 w-5 text-blue-600" />
                            ) : (
                              <AlertCircle className="h-5 w-5 text-gray-400" />
                            )}
                            <div>
                              <h4 className="font-medium">{milestone.name}</h4>
                              <p className="text-sm text-gray-600">
                                Due: {new Date(milestone.due_date).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Badge 
                              variant={milestone.status === 'completed' ? 'default' : 'secondary'}
                              className={
                                milestone.status === 'completed' ? 'bg-green-100 text-green-800' :
                                milestone.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                                'bg-gray-100 text-gray-800'
                              }
                            >
                              {milestone.status.replace('_', ' ')}
                            </Badge>
                            {milestone.status !== 'completed' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => updateMilestone(selectedJob.id, milestone.id, 'completed')}
                              >
                                Mark Complete
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Team & Recent Activity */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center">
                        <Users className="h-5 w-5 mr-2" />
                        Team Assignment
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Partner:</span>
                          <span className="font-medium">
                            {selectedJob.partner?.first_name} {selectedJob.partner?.last_name}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Manager:</span>
                          <span className="font-medium">
                            {selectedJob.manager?.first_name} {selectedJob.manager?.last_name}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Team Size:</span>
                          <span className="font-medium">{selectedJob.jobStaffAssignments?.length || 0}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center">
                        <Calendar className="h-5 w-5 mr-2" />
                        Recent Activity
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 max-h-32 overflow-y-auto">
                        {selectedJob.workLogs?.map((log, index) => (
                          <div key={index} className="flex justify-between text-sm">
                            <span>
                              {log.employee?.first_name} {log.employee?.last_name}
                            </span>
                            <span className="text-gray-600">
                              {log.hours_worked}h • {new Date(log.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        ))}
                        {(!selectedJob.workLogs || selectedJob.workLogs.length === 0) && (
                          <p className="text-sm text-gray-500">No recent activity</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            ) : (
              <Card>
                <CardContent className="flex items-center justify-center h-96">
                  <div className="text-center text-gray-500">
                    <FileText className="h-16 w-16 mx-auto mb-4 opacity-50" />
                    <h3 className="text-lg font-medium mb-2">Select a Job</h3>
                    <p>Choose a job from the list to view its workflow details</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}