import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { apiFetch, jobStaffAPI } from '@/integrations/apiClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StaffAssignmentList } from '@/components/StaffAssignmentList';
import { ProfitabilityCard } from '@/components/ProfitabilityCard';
import { ArrowLeft, Plus } from 'lucide-react';

interface Job {
  id: number;
  title: string;
  client: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  status: string;
  billing_type: string;
  created_at?: string;
  updated_at?: string;
}

interface StaffAssignment {
  id?: number;
  employee_id: number;
  name: string;
  role_name: string;
  assigned_hourly_rate: number;
  assigned_at?: string;
}

interface Profitability {
  total_hours: number;
  total_revenue: number;
  total_cost: number;
  profit: number;
  profit_margin: number;
  staff_assignments: Array<{
    employee_id: number;
    employee_name: string;
    role_name: string;
    assigned_hourly_rate: number;
    estimated_hours?: number;
  }>;
}

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [job, setJob] = useState<Job | null>(null);
  const [staff, setStaff] = useState<StaffAssignment[]>([]);
  const [profitability, setProfitability] = useState<Profitability | null>(null);
  const [loading, setLoading] = useState(true);
  const [assigningStaff, setAssigningStaff] = useState(false);

  useEffect(() => {
    loadJobDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadJobDetails = async () => {
    if (!id) return;

    try {
      setLoading(true);

      // Load job details
      const jobData = await apiFetch('GET', `/jobs/${id}`);
      setJob(jobData);

      // Load assigned staff
      const staffData = await jobStaffAPI.getStaffForJob(parseInt(id));
      setStaff(
        staffData.map((s: Record<string, unknown>) => ({
          employee_id: s.employee_id,
          name: `${s.employee && typeof s.employee === 'object' && 'first_name' in s.employee ? (s.employee as Record<string, string>).first_name : ''} ${s.employee && typeof s.employee === 'object' && 'last_name' in s.employee ? (s.employee as Record<string, string>).last_name : ''}`.trim(),
          role_name: s.employee && typeof s.employee === 'object' && 'role' in s.employee && s.employee.role && typeof s.employee.role === 'object' && 'name' in s.employee.role ? (s.employee.role as Record<string, string>).name : 'Unknown',
          assigned_hourly_rate: s.assigned_hourly_rate as number,
        }))
      );

      // Load profitability data
      const profitData = await apiFetch('GET', `/job_profitability/${id}`);
      setProfitability(profitData);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load job details';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveStaff = async (employeeId: number) => {
    if (!id) return;

    try {
      setAssigningStaff(true);
      await jobStaffAPI.removeStaffFromJob(parseInt(id), employeeId);
      setStaff(staff.filter(s => s.employee_id !== employeeId));
      toast({
        title: 'Success',
        description: 'Staff member removed from job',
      });
      loadJobDetails();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to remove staff';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setAssigningStaff(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'completed':
        return 'bg-blue-100 text-blue-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-600">Loading job details...</p>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="p-6 text-center">
        <p className="text-red-600 mb-4">Job not found</p>
        <Button onClick={() => navigate('/jobs')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Jobs
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="ghost"
          onClick={() => navigate('/jobs')}
          className="hover:bg-gray-100"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">{job.title}</h1>
          <p className="text-gray-600 text-sm mt-1">{job.client}</p>
        </div>
        <Badge className={`${getStatusColor(job.status)} text-sm`}>
          {job.status}
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Job Details Card */}
          <Card>
            <CardHeader>
              <CardTitle>Job Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {job.description && (
                <div>
                  <p className="font-semibold text-sm">Description</p>
                  <p className="text-gray-600 text-sm mt-1">{job.description}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {job.start_date && (
                  <div>
                    <p className="font-semibold text-sm">Start Date</p>
                    <p className="text-gray-600 text-sm mt-1">
                      {new Date(job.start_date).toLocaleDateString()}
                    </p>
                  </div>
                )}

                {job.end_date && (
                  <div>
                    <p className="font-semibold text-sm">End Date</p>
                    <p className="text-gray-600 text-sm mt-1">
                      {new Date(job.end_date).toLocaleDateString()}
                    </p>
                  </div>
                )}

                {job.billing_type && (
                  <div>
                    <p className="font-semibold text-sm">Billing Type</p>
                    <p className="text-gray-600 text-sm mt-1 capitalize">{job.billing_type}</p>
                  </div>
                )}
              </div>

              {job.created_at && (
                <div className="border-t pt-4">
                  <p className="text-xs text-gray-500">
                    Created on {new Date(job.created_at).toLocaleDateString()}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Staff Assignment Card */}
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Assigned Staff</CardTitle>
                  <CardDescription>{staff.length} team member{staff.length !== 1 ? 's' : ''}</CardDescription>
                </div>
                <Button
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700"
                  onClick={() => {
                    // TODO: Open staff assignment modal
                    toast({
                      title: 'Info',
                      description: 'Staff assignment feature coming soon',
                    });
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Staff
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {staff.length > 0 ? (
                <StaffAssignmentList
                  staff={staff}
                  onRemove={handleRemoveStaff}
                  editable={true}
                />
              ) : (
                <div className="text-center py-8 text-gray-600">
                  <p>No staff assigned yet. Add team members to get started.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar - Profitability */}
        <div className="space-y-6">
          {profitability && (
            <ProfitabilityCard
              data={profitability}
              title={`${job.title} Profitability`}
            />
          )}

          {/* Quick Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Quick Stats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Total Staff</span>
                <span className="font-semibold">{staff.length}</span>
              </div>

              {staff.length > 0 && (
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Total Hourly Rate</span>
                  <span className="font-semibold">
                    {staff.reduce((sum, s) => sum + s.assigned_hourly_rate, 0).toLocaleString()} KES/hr
                  </span>
                </div>
              )}

              {profitability && (
                <>
                  <div className="border-t pt-3 flex justify-between">
                    <span className="text-sm text-gray-600">Estimated Profit</span>
                    <span className={`font-semibold ${profitability.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {profitability.profit.toLocaleString()} KES
                    </span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
