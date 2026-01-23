import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { jobsAPI } from '@/lib/api';
import type { Job, JobStaffAssignment } from '@/lib/api/types';
import { Briefcase, Calendar, RefreshCw, Users, Loader2 } from 'lucide-react';

const statusColors: Record<string, string> = {
  planned: 'bg-gray-100 text-gray-800',
  in_progress: 'bg-blue-100 text-blue-800',
  on_hold: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
};

interface AllocationInput {
  employeeProfileId: number;
  roleId: number;
  employeeName: string;
  roleName: string;
  allocatedHours: string;
  hourlyRate: string;
  billable: boolean;
  taskDescription: string;
}

interface CostingFormState {
  jobFee: string;
  notes: string;
  capEnforced: boolean;
  allowOverage: boolean;
  maxOveragePercent: string;
  allocations: AllocationInput[];
}

export default function JobWorkflowDashboard() {
  const { toast } = useToast();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [staff, setStaff] = useState<JobStaffAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [costingForm, setCostingForm] = useState<CostingFormState | null>(null);
  const [costingLoading, setCostingLoading] = useState(false);
  const [costingSaving, setCostingSaving] = useState(false);

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
      await initializeCosting(job, staffAssignments);
    } catch (error) {
      console.error('Failed to load job details:', error);
      toast({
        title: 'Error',
        description: 'Failed to load job details',
        variant: 'destructive',
      });
    }
  };

  const buildAllocationsFromStaff = (staffAssignments: JobStaffAssignment[]): AllocationInput[] => {
    return staffAssignments.map((assignment) => ({
      employeeProfileId: assignment.employeeProfileId,
      roleId: assignment.assignedRoleId,
      employeeName: assignment.employee
        ? `${assignment.employee.firstName} ${assignment.employee.lastName}`
        : `Employee ${assignment.employeeProfileId}`,
      roleName: assignment.role?.name || 'Role',
      allocatedHours: '',
      hourlyRate: String(assignment.assignedHourlyRate || 0),
      billable: true,
      taskDescription: '',
    }));
  };

  const initializeCosting = async (job: Job, staffAssignments: JobStaffAssignment[]) => {
    setCostingLoading(true);
    try {
      const costing: any = await jobsAPI.getCosting(job.id);
      const staffMap = new Map(
        staffAssignments.map((assignment) => [
          `${assignment.employeeProfileId}-${assignment.assignedRoleId}`,
          {
            employeeName: assignment.employee
              ? `${assignment.employee.firstName} ${assignment.employee.lastName}`
              : `Employee ${assignment.employeeProfileId}`,
            roleName: assignment.role?.name || 'Role',
            hourlyRate: assignment.assignedHourlyRate || 0,
          },
        ])
      );

      const allocations: AllocationInput[] = (costing?.allocations || []).map((allocation: any) => {
        const key = `${allocation.employeeProfileId}-${allocation.roleId}`;
        const staffInfo = staffMap.get(key);
        return {
          employeeProfileId: allocation.employeeProfileId,
          roleId: allocation.roleId,
          employeeName: staffInfo?.employeeName || `Employee ${allocation.employeeProfileId}`,
          roleName: staffInfo?.roleName || 'Role',
          allocatedHours: String(allocation.allocatedHours ?? 0),
          hourlyRate: String(allocation.hourlyRate ?? staffInfo?.hourlyRate ?? 0),
          billable: allocation.billable ?? true,
          taskDescription: allocation.taskDescription || '',
        };
      });

      setCostingForm({
        jobFee: String(costing?.jobFee ?? job.fixedFeeAmount ?? ''),
        notes: costing?.notes || '',
        capEnforced: costing?.budgetCap?.capEnforced ?? true,
        allowOverage: costing?.budgetCap?.allowOverage ?? false,
        maxOveragePercent: String(costing?.budgetCap?.maxOveragePercent ?? 0.2),
        allocations: allocations.length > 0 ? allocations : buildAllocationsFromStaff(staffAssignments),
      });
    } catch (error: any) {
      if (error?.status === 404) {
        setCostingForm({
          jobFee: String(job.fixedFeeAmount || ''),
          notes: '',
          capEnforced: true,
          allowOverage: false,
          maxOveragePercent: '0.2',
          allocations: buildAllocationsFromStaff(staffAssignments),
        });
      } else {
        toast({
          title: 'Costing Load Error',
          description: 'Unable to load job costing details.',
          variant: 'destructive',
        });
      }
    } finally {
      setCostingLoading(false);
    }
  };

  const updateAllocation = (
    employeeProfileId: number,
    roleId: number,
    field: keyof AllocationInput,
    value: string | boolean
  ) => {
    if (!costingForm) return;
    setCostingForm((prev) => {
      if (!prev) return prev;
      const allocations = prev.allocations.map((allocation) => {
        if (allocation.employeeProfileId === employeeProfileId && allocation.roleId === roleId) {
          return { ...allocation, [field]: value };
        }
        return allocation;
      });
      return { ...prev, allocations };
    });
  };

  const handleSaveCosting = async () => {
    if (!selectedJob || !costingForm) return;

    if (!costingForm.jobFee || Number(costingForm.jobFee) <= 0) {
      toast({
        title: 'Validation Error',
        description: 'Job fee is required before saving costing.',
        variant: 'destructive',
      });
      return;
    }

    const allocations = costingForm.allocations
      .filter((allocation) => Number(allocation.allocatedHours) > 0)
      .map((allocation) => ({
        employeeProfileId: allocation.employeeProfileId,
        roleId: allocation.roleId,
        allocatedHours: Number(allocation.allocatedHours),
        hourlyRate: Number(allocation.hourlyRate),
        billable: allocation.billable,
        taskDescription: allocation.taskDescription || undefined,
      }));

    if (allocations.length === 0) {
      toast({
        title: 'Validation Error',
        description: 'Allocate at least one staff member before saving.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setCostingSaving(true);
      await jobsAPI.upsertCosting(selectedJob.id, {
        jobFee: Number(costingForm.jobFee),
        allocations,
        notes: costingForm.notes || undefined,
        capEnforced: costingForm.capEnforced,
        allowOverage: costingForm.allowOverage,
        maxOveragePercent: Number(costingForm.maxOveragePercent),
      });
      toast({
        title: 'Costing Saved',
        description: 'Job costing and allocations updated successfully.',
      });
    } catch (error) {
      console.error('Failed to save costing:', error);
      toast({
        title: 'Error',
        description: 'Failed to save job costing.',
        variant: 'destructive',
      });
    } finally {
      setCostingSaving(false);
    }
  };

  useEffect(() => {
    loadJobs();
  }, []);

  const totalAllocatedHours = costingForm
    ? costingForm.allocations.reduce((sum, allocation) => sum + Number(allocation.allocatedHours || 0), 0)
    : 0;
  const totalEstimatedCost = costingForm
    ? costingForm.allocations.reduce(
        (sum, allocation) => sum + Number(allocation.allocatedHours || 0) * Number(allocation.hourlyRate || 0),
        0
      )
    : 0;
  const remainingBudget = costingForm ? Number(costingForm.jobFee || 0) - totalEstimatedCost : 0;

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

                  <Card>
                    <CardHeader>
                      <CardTitle>Job Costing & Allocations</CardTitle>
                      <CardDescription>
                        Managers allocate hours per staff member before time logging begins.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {costingLoading ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading costing details...
                        </div>
                      ) : !costingForm ? (
                        <p className="text-sm text-muted-foreground">Select a job to begin costing.</p>
                      ) : staff.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Assign staff before entering job costing.
                        </p>
                      ) : (
                        <div className="space-y-5">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="jobFee">Job Fee *</Label>
                              <Input
                                id="jobFee"
                                type="number"
                                min="0"
                                value={costingForm.jobFee}
                                onChange={(event) =>
                                  setCostingForm((prev) =>
                                    prev ? { ...prev, jobFee: event.target.value } : prev
                                  )
                                }
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="maxOveragePercent">Max Overage %</Label>
                              <Input
                                id="maxOveragePercent"
                                type="number"
                                step="0.05"
                                min="0"
                                max="1"
                                value={costingForm.maxOveragePercent}
                                onChange={(event) =>
                                  setCostingForm((prev) =>
                                    prev ? { ...prev, maxOveragePercent: event.target.value } : prev
                                  )
                                }
                              />
                            </div>
                            <div className="flex flex-col gap-3 pt-2">
                              <div className="flex items-center justify-between">
                                <Label>Enforce Cap</Label>
                                <Switch
                                  checked={costingForm.capEnforced}
                                  onCheckedChange={(checked) =>
                                    setCostingForm((prev) =>
                                      prev ? { ...prev, capEnforced: checked } : prev
                                    )
                                  }
                                />
                              </div>
                              <div className="flex items-center justify-between">
                                <Label>Allow Overage</Label>
                                <Switch
                                  checked={costingForm.allowOverage}
                                  onCheckedChange={(checked) =>
                                    setCostingForm((prev) =>
                                      prev ? { ...prev, allowOverage: checked } : prev
                                    )
                                  }
                                />
                              </div>
                            </div>
                          </div>

                          <div className="space-y-3">
                            {costingForm.allocations.map((allocation) => (
                              <div
                                key={`${allocation.employeeProfileId}-${allocation.roleId}`}
                                className="grid grid-cols-1 md:grid-cols-[1fr_120px_120px_120px] gap-3 items-start border rounded-lg p-3"
                              >
                                <div>
                                  <p className="font-medium">{allocation.employeeName}</p>
                                  <p className="text-xs text-muted-foreground">{allocation.roleName}</p>
                                  <Textarea
                                    value={allocation.taskDescription}
                                    onChange={(event) =>
                                      updateAllocation(
                                        allocation.employeeProfileId,
                                        allocation.roleId,
                                        'taskDescription',
                                        event.target.value
                                      )
                                    }
                                    placeholder="Task focus"
                                    rows={2}
                                    className="mt-2"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label>Hours</Label>
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.25"
                                    value={allocation.allocatedHours}
                                    onChange={(event) =>
                                      updateAllocation(
                                        allocation.employeeProfileId,
                                        allocation.roleId,
                                        'allocatedHours',
                                        event.target.value
                                      )
                                    }
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label>Rate</Label>
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={allocation.hourlyRate}
                                    onChange={(event) =>
                                      updateAllocation(
                                        allocation.employeeProfileId,
                                        allocation.roleId,
                                        'hourlyRate',
                                        event.target.value
                                      )
                                    }
                                  />
                                </div>
                                <div className="flex flex-col gap-2 pt-6">
                                  <Label>Billable</Label>
                                  <Switch
                                    checked={allocation.billable}
                                    onCheckedChange={(checked) =>
                                      updateAllocation(
                                        allocation.employeeProfileId,
                                        allocation.roleId,
                                        'billable',
                                        checked
                                      )
                                    }
                                  />
                                </div>
                              </div>
                            ))}
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="border rounded-lg p-3">
                              <p className="text-xs text-muted-foreground">Total Hours</p>
                              <p className="text-lg font-semibold">{totalAllocatedHours.toFixed(2)}h</p>
                            </div>
                            <div className="border rounded-lg p-3">
                              <p className="text-xs text-muted-foreground">Estimated Cost</p>
                              <p className="text-lg font-semibold">
                                KES {totalEstimatedCost.toLocaleString()}
                              </p>
                            </div>
                            <div className="border rounded-lg p-3">
                              <p className="text-xs text-muted-foreground">Remaining Fee</p>
                              <p className={`text-lg font-semibold ${remainingBudget < 0 ? 'text-red-600' : ''}`}>
                                KES {remainingBudget.toLocaleString()}
                              </p>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="costingNotes">Notes</Label>
                            <Textarea
                              id="costingNotes"
                              value={costingForm.notes}
                              onChange={(event) =>
                                setCostingForm((prev) =>
                                  prev ? { ...prev, notes: event.target.value } : prev
                                )
                              }
                              rows={3}
                              placeholder="Manager notes for this costing"
                            />
                          </div>

                          <div className="flex justify-end">
                            <Button onClick={handleSaveCosting} disabled={costingSaving}>
                              {costingSaving ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  Saving...
                                </>
                              ) : (
                                'Save Costing'
                              )}
                            </Button>
                          </div>
                        </div>
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
