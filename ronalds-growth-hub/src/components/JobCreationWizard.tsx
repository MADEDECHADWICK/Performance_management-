import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { apiFetch, rolesAPI, jobStaffAPI } from '@/integrations/apiClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StaffAssignmentList } from './StaffAssignmentList';

interface Employee {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  role_id: number;
  role?: {
    id: number;
    name: string;
    billing_rate: number;
  };
}

interface JobFormData {
  title: string;
  description: string;
  client: string;
  start_date: string;
  end_date: string;
  billing_type: string;
}

interface AssignedStaff {
  employee_id: number;
  employee: Employee;
  assigned_role_id: number;
  assigned_hourly_rate: number;
}

interface JobCreationWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function JobCreationWizard({ isOpen, onClose, onSuccess }: JobCreationWizardProps) {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [assignedStaff, setAssignedStaff] = useState<AssignedStaff[]>([]);
  const [jobId, setJobId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [formData, setFormData] = useState<JobFormData>({
    title: '',
    description: '',
    client: '',
    start_date: '',
    end_date: '',
    billing_type: 'hourly',
  });

  useEffect(() => {
    if (isOpen && step === 2) {
      loadEmployees();
    }
  }, [isOpen, step]);

  const loadEmployees = async () => {
    try {
      const data = await apiFetch('GET', '/profiles');
      setEmployees(Array.isArray(data) ? data : []);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to load employees',
        variant: 'destructive',
      });
    }
  };

  const handleCreateJob = async () => {
    if (!formData.title.trim() || !formData.client.trim()) {
      toast({
        title: 'Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    try {
      setLoading(true);
      const response = await apiFetch('POST', '/jobs', {
        title: formData.title,
        description: formData.description,
        client: formData.client,
        start_date: formData.start_date,
        end_date: formData.end_date,
        billing_type: formData.billing_type,
        status: 'active',
      });

      setJobId(response.id);
      setStep(2);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create job',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAssignStaff = async (employeeId: number) => {
    try {
      if (!jobId) return;
      
      const employee = employees.find(e => e.id === employeeId);
      if (!employee || !employee.role) {
        toast({
          title: 'Error',
          description: 'Employee does not have an assigned role',
          variant: 'destructive',
        });
        return;
      }

      // Call API to assign staff
      const response = await jobStaffAPI.assignStaffToJob(jobId, employeeId);
      
      // Add to local state
      setAssignedStaff([...assignedStaff, {
        employee_id: employeeId,
        employee,
        assigned_role_id: employee.role.id,
        assigned_hourly_rate: employee.role.billing_rate,
      }]);

      setSearchTerm('');
      toast({
        title: 'Success',
        description: `${employee.first_name} ${employee.last_name} assigned to job`,
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to assign staff',
        variant: 'destructive',
      });
    }
  };

  const handleRemoveStaff = async (employeeId: number) => {
    try {
      if (!jobId) return;
      
      await jobStaffAPI.removeStaffFromJob(jobId, employeeId);
      setAssignedStaff(assignedStaff.filter(s => s.employee_id !== employeeId));
      
      toast({
        title: 'Success',
        description: 'Staff member removed from job',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to remove staff',
        variant: 'destructive',
      });
    }
  };

  const handleFinish = () => {
    toast({
      title: 'Success',
      description: 'Job created successfully',
    });
    onSuccess?.();
    handleClose();
  };

  const handleClose = () => {
    setStep(1);
    setJobId(null);
    setAssignedStaff([]);
    setFormData({
      title: '',
      description: '',
      client: '',
      start_date: '',
      end_date: '',
      billing_type: 'hourly',
    });
    setSearchTerm('');
    onClose();
  };

  const filteredEmployees = employees.filter(
    emp => !assignedStaff.find(s => s.employee_id === emp.id) &&
           (emp.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            emp.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            emp.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>
            {step === 1 ? 'Create New Job' : 'Assign Staff to Job'}
          </DialogTitle>
          <DialogDescription>
            {step === 1
              ? 'Step 1 of 2: Enter job details'
              : `Step 2 of 2: Assign staff to "${formData.title}"`}
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Job Details */}
        {step === 1 && (
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="title">Job Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g., Website Redesign"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="client">Client *</Label>
              <Input
                id="client"
                value={formData.client}
                onChange={(e) => setFormData({ ...formData, client: e.target.value })}
                placeholder="e.g., ABC Corporation"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Enter job description"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="start-date">Start Date</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="end-date">End Date</Label>
                <Input
                  id="end-date"
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="billing-type">Billing Type</Label>
              <Select value={formData.billing_type} onValueChange={(value) => setFormData({ ...formData, billing_type: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hourly">Hourly</SelectItem>
                  <SelectItem value="fixed">Fixed Price</SelectItem>
                  <SelectItem value="retainer">Retainer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Step 2: Assign Staff */}
        {step === 2 && (
          <div className="space-y-4 py-4">
            <div>
              <h3 className="font-semibold mb-2">Currently Assigned Staff</h3>
              <StaffAssignmentList
                staff={assignedStaff.map(s => ({
                  employee_id: s.employee_id,
                  name: `${s.employee.first_name} ${s.employee.last_name}`,
                  role_name: s.employee.role?.name || 'Unknown',
                  assigned_hourly_rate: s.assigned_hourly_rate,
                }))}
                onRemove={handleRemoveStaff}
                editable={true}
              />
            </div>

            <div className="border-t pt-4">
              <h3 className="font-semibold mb-2">Add More Staff</h3>
              <div className="space-y-2">
                <Input
                  type="search"
                  placeholder="Search employees by name or email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />

                <div className="max-h-64 overflow-y-auto border rounded p-2 space-y-1">
                  {filteredEmployees.length > 0 ? (
                    filteredEmployees.map(emp => (
                      <div
                        key={emp.id}
                        className="flex items-center justify-between p-2 hover:bg-gray-100 rounded cursor-pointer"
                      >
                        <div>
                          <p className="font-medium">{emp.first_name} {emp.last_name}</p>
                          <p className="text-xs text-gray-600">{emp.email}</p>
                          {emp.role && (
                            <p className="text-xs text-gray-500">
                              {emp.role.name} · {emp.role.billing_rate.toLocaleString()} KES/hr
                            </p>
                          )}
                        </div>
                        <Button
                          size="sm"
                          onClick={() => handleAssignStaff(emp.id)}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          Add
                        </Button>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-gray-600 p-2">
                      {employees.length === 0
                        ? 'No employees available'
                        : 'No more employees to add'}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={step === 1 ? handleClose : () => setStep(1)}
            disabled={loading}
          >
            {step === 1 ? 'Cancel' : 'Back'}
          </Button>

          {step === 1 ? (
            <Button
              onClick={handleCreateJob}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {loading ? 'Creating...' : 'Next'}
            </Button>
          ) : (
            <Button
              onClick={handleFinish}
              disabled={loading || assignedStaff.length === 0}
              className="bg-green-600 hover:bg-green-700"
            >
              {loading ? 'Finishing...' : 'Finish'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
