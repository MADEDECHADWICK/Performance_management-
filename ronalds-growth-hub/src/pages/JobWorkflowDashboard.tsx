import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { jobsAPI } from '@/lib/api';
import type { Job, JobStaffAssignment } from '@/lib/api/types';
import { Briefcase, Calendar, RefreshCw, Users } from 'lucide-react';

const statusColors: Record<string, string> = {
  planned: 'bg-gray-100 text-gray-800',
  in_progress: 'bg-blue-100 text-blue-800',
  on_hold: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
};

export default function JobWorkflowDashboard() {
  const { toast } = useToast();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [staff, setStaff] = useState<JobStaffAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadJobs = async () => {
    try {
      setIsLoading(true);
      const response = await jobsAPI.list({ pageSize: 100 });
      setJobs(response.data || []);
    } catch (error) {
      console.error('Failed to load jobs:', error);
      toast({
        title: 'Error',
        description: 'Failed to load jobs',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadJobDetails = async (jobId: number) => {
    try {
      const [job, staffAssignments] = await Promise.all([
        jobsAPI.getById(jobId),
        jobsAPI.getStaff(jobId),
      ]);
      setSelectedJob(job);
      setStaff(staffAssignments);
    } catch (error) {
      console.error('Failed to load job details:', error);
      toast({
        title: 'Error',
        description: 'Failed to load job details',
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    loadJobs();
  }, []);

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Jobs</h1>
            <p className="text-muted-foreground">Monitor job progress and assignments</p>
          </div>
          <Button onClick={loadJobs} disabled={isLoading} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            {isLoading ? 'Loading...' : 'Refresh'}
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="h-5 w-5" />
                Jobs ({jobs.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 max-h-96 overflow-y-auto">
              {jobs.map((job) => (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => loadJobDetails(job.id)}
                  className={`w-full text-left border rounded-lg p-3 transition-colors ${
                    selectedJob?.id === job.id ? 'bg-blue-50 border-blue-300' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-sm">{job.jobName}</p>
                      <p className="text-xs text-muted-foreground">
                        {job.client?.clientName || 'Client not set'}
                      </p>
                    </div>
                    <Badge className={statusColors[job.status] || statusColors.planned}>
                      {job.status.replace('_', ' ')}
                    </Badge>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground flex items-center gap-2">
                    <Calendar className="h-3 w-3" />
                    {job.dueDate ? new Date(job.dueDate).toLocaleDateString() : 'No due date'}
                  </div>
                </button>
              ))}
              {!isLoading && jobs.length === 0 && (
                <div className="text-center text-sm text-muted-foreground py-6">
                  No jobs found.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Job Details</CardTitle>
              <CardDescription>
                {selectedJob ? 'Review job summary and staff assignments.' : 'Select a job to view details.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {selectedJob ? (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-xl font-semibold">{selectedJob.jobName}</h2>
                    <p className="text-muted-foreground">
                      {selectedJob.client?.clientName || 'Client not set'}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="border rounded-lg p-3">
                      <p className="text-xs text-muted-foreground">Partner</p>
                      <p className="font-medium">
                        {selectedJob.partner
                          ? `${selectedJob.partner.firstName} ${selectedJob.partner.lastName}`
                          : 'Not assigned'}
                      </p>
                    </div>
                    <div className="border rounded-lg p-3">
                      <p className="text-xs text-muted-foreground">Manager</p>
                      <p className="font-medium">
                        {selectedJob.manager
                          ? `${selectedJob.manager.firstName} ${selectedJob.manager.lastName}`
                          : 'Not assigned'}
                      </p>
                    </div>
                    <div className="border rounded-lg p-3">
                      <p className="text-xs text-muted-foreground">Billing</p>
                      <p className="font-medium">
                        {selectedJob.billingType === 'fixed_fee'
                          ? `KES ${Number(selectedJob.fixedFeeAmount || 0).toLocaleString()}`
                          : `${Number(selectedJob.budgetHours || 0)} hrs`}
                      </p>
                    </div>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        Staff Assignments
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {staff.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No staff assigned.</p>
                      ) : (
                        staff.map((assignment) => (
                          <div
                            key={assignment.id}
                            className="flex items-center justify-between border-b pb-2 last:border-0"
                          >
                            <div>
                              <p className="font-medium">
                                {assignment.employee
                                  ? `${assignment.employee.firstName} ${assignment.employee.lastName}`
                                  : 'Employee'}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {assignment.role?.name || 'Role not set'}
                              </p>
                            </div>
                            <div className="text-sm font-medium">
                              KES {Number(assignment.assignedHourlyRate || 0).toLocaleString()}
                            </div>
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-10">
                  Select a job from the list to view details.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
