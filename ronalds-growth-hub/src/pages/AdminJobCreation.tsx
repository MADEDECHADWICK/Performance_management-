import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from '@/hooks/use-toast';
import { clientsAPI, employeesAPI, jobsAPI } from '@/lib/api';
import type { Client, Profile } from '@/lib/api/types';
import { Calendar, FileText, Save, Users } from 'lucide-react';

type BillingType = 'hourly' | 'fixed_fee';

interface JobFormData {
  jobName: string;
  description: string;
  clientId: string;
  engagementLetterId: string;
  partnerProfileId: string;
  managerProfileId: string;
  startDate: string;
  dueDate: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  billingType: BillingType;
  fixedFeeAmount: string;
  budgetHours: string;
}

interface StaffAssignmentInput {
  employeeProfileId: number;
  assignedRoleId: number;
  assignedHourlyRate: number;
  roleOnJob?: string;
}

const initialFormData: JobFormData = {
  jobName: '',
  description: '',
  clientId: '',
  engagementLetterId: '',
  partnerProfileId: '',
  managerProfileId: '',
  startDate: new Date().toISOString().slice(0, 10),
  dueDate: '',
  priority: 'medium',
  billingType: 'fixed_fee',
  fixedFeeAmount: '',
  budgetHours: '',
};

export default function AdminJobCreation() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [formData, setFormData] = useState<JobFormData>(initialFormData);
  const [clients, setClients] = useState<Client[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [engagementLetters, setEngagementLetters] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<StaffAssignmentInput[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedClientId = Number(formData.clientId || 0);

  const partners = useMemo(
    () => employees.filter((employee) => employee.isPartner),
    [employees]
  );

  const managers = useMemo(
    () =>
      employees.filter(
        (employee) =>
          employee.positionTitle?.toLowerCase().includes('manager') && !employee.isPartner
      ),
    [employees]
  );

  useEffect(() => {
    const presetClientId = searchParams.get('clientId');
    if (presetClientId) {
      setFormData((prev) => ({ ...prev, clientId: presetClientId }));
    }
  }, [searchParams]);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (!selectedClientId) {
      setEngagementLetters([]);
      return;
    }

    const loadEngagementLetters = async () => {
      try {
        const letters = await clientsAPI.getEngagementLetters(selectedClientId);
        setEngagementLetters(letters);
      } catch (error) {
        console.error('Failed to load engagement letters:', error);
      }
    };

    loadEngagementLetters();
  }, [selectedClientId]);

  const loadInitialData = async () => {
    try {
      setIsLoading(true);
      const [clientsResponse, employeesResponse] = await Promise.all([
        clientsAPI.list({ pageSize: 200 }),
        employeesAPI.list({ pageSize: 200 }),
      ]);

      setClients(clientsResponse.data || []);
      setEmployees(employeesResponse.data || []);
    } catch (error) {
      console.error('Error loading initial data:', error);
      toast({
        title: "Error",
        description: "Failed to load form data. Please refresh the page.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: keyof JobFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const toggleAssignment = (employee: Profile, isChecked: boolean) => {
    if (!employee.role?.id || !employee.role?.billingRate) {
      toast({
        title: 'Missing Role',
        description: `${employee.firstName} ${employee.lastName} does not have a role with billing rate.`,
        variant: 'destructive',
      });
      return;
    }

    setAssignments((prev) => {
      if (isChecked) {
        return [
          ...prev,
          {
            employeeProfileId: employee.id,
            assignedRoleId: employee.role.id,
            assignedHourlyRate: Number(employee.role.billingRate),
          },
        ];
      }

      return prev.filter((assignment) => assignment.employeeProfileId !== employee.id);
    });
  };

  const updateAssignmentRate = (employeeProfileId: number, rate: string) => {
    const value = Number(rate);
    if (Number.isNaN(value)) return;

    setAssignments((prev) =>
      prev.map((assignment) =>
        assignment.employeeProfileId === employeeProfileId
          ? { ...assignment, assignedHourlyRate: value }
          : assignment
      )
    );
  };

  const validateForm = () => {
    if (!formData.jobName.trim()) {
      toast({ title: "Validation Error", description: "Job name is required", variant: "destructive" });
      return false;
    }
    if (!formData.clientId) {
      toast({ title: "Validation Error", description: "Client selection is required", variant: "destructive" });
      return false;
    }
    if (!formData.partnerProfileId) {
      toast({ title: "Validation Error", description: "Partner assignment is required", variant: "destructive" });
      return false;
    }
    if (!formData.managerProfileId) {
      toast({ title: "Validation Error", description: "Manager assignment is required", variant: "destructive" });
      return false;
    }
    if (!formData.startDate) {
      toast({ title: "Validation Error", description: "Start date is required", variant: "destructive" });
      return false;
    }
    if (!formData.dueDate) {
      toast({ title: "Validation Error", description: "Due date is required", variant: "destructive" });
      return false;
    }
    if (formData.billingType === 'fixed_fee' && !formData.fixedFeeAmount) {
      toast({ title: "Validation Error", description: "Fixed fee amount is required", variant: "destructive" });
      return false;
    }
    if (formData.billingType === 'hourly' && !formData.budgetHours) {
      toast({ title: "Validation Error", description: "Budget hours are required", variant: "destructive" });
      return false;
    }
    return true;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validateForm()) return;

    try {
      setIsSubmitting(true);

      const jobPayload = {
        jobName: formData.jobName.trim(),
        description: formData.description || undefined,
        clientId: Number(formData.clientId),
        engagementLetterId: formData.engagementLetterId
          ? Number(formData.engagementLetterId)
          : undefined,
        partnerProfileId: Number(formData.partnerProfileId),
        managerProfileId: Number(formData.managerProfileId),
        startDate: formData.startDate,
        dueDate: formData.dueDate,
        priority: formData.priority,
        billingType: formData.billingType,
        fixedFeeAmount:
          formData.billingType === 'fixed_fee'
            ? Number(formData.fixedFeeAmount)
            : undefined,
        budgetHours:
          formData.billingType === 'hourly'
            ? Number(formData.budgetHours)
            : undefined,
      };

      const job = await jobsAPI.create(jobPayload);

      for (const assignment of assignments) {
        await jobsAPI.assignStaff(job.id, assignment);
      }

      toast({
        title: "Success",
        description: "Job created and staff assigned successfully.",
      });

      navigate(`/jobs?highlight=${job.id}`);
    } catch (error) {
      console.error('Job creation failed:', error);
      toast({
        title: "Error",
        description: "Failed to create job. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Create Job</h1>
          <p className="text-muted-foreground">
            Create a new job with engagement letter and staff assignments.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Job Details
              </CardTitle>
              <CardDescription>Core job information and client link</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="jobName">Job Name *</Label>
                <Input
                  id="jobName"
                  value={formData.jobName}
                  onChange={(e) => handleInputChange('jobName', e.target.value)}
                  placeholder="e.g. Statutory Audit - ABC Limited"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="clientId">Client *</Label>
                <Select
                  value={formData.clientId}
                  onValueChange={(value) => handleInputChange('clientId', value)}
                  disabled={isLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={String(client.id)}>
                        {client.clientName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="engagementLetterId">Engagement Letter</Label>
                <Select
                  value={formData.engagementLetterId}
                  onValueChange={(value) => handleInputChange('engagementLetterId', value)}
                  disabled={!selectedClientId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select engagement letter" />
                  </SelectTrigger>
                  <SelectContent>
                    {engagementLetters.map((letter) => (
                      <SelectItem key={letter.id} value={String(letter.id)}>
                        {letter.jobTitle || letter.engagementType || `Letter ${letter.id}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Ownership & Timeline
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="partnerProfileId">Partner *</Label>
                <Select
                  value={formData.partnerProfileId}
                  onValueChange={(value) => handleInputChange('partnerProfileId', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select partner" />
                  </SelectTrigger>
                  <SelectContent>
                    {partners.map((partner) => (
                      <SelectItem key={partner.id} value={String(partner.id)}>
                        {partner.firstName} {partner.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="managerProfileId">Manager *</Label>
                <Select
                  value={formData.managerProfileId}
                  onValueChange={(value) => handleInputChange('managerProfileId', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select manager" />
                  </SelectTrigger>
                  <SelectContent>
                    {managers.map((manager) => (
                      <SelectItem key={manager.id} value={String(manager.id)}>
                        {manager.firstName} {manager.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="startDate">Start Date *</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => handleInputChange('startDate', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dueDate">Due Date *</Label>
                <Input
                  id="dueDate"
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => handleInputChange('dueDate', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="priority">Priority</Label>
                <Select
                  value={formData.priority}
                  onValueChange={(value) => handleInputChange('priority', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Billing
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="billingType">Billing Type</Label>
                <Select
                  value={formData.billingType}
                  onValueChange={(value) => handleInputChange('billingType', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select billing type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed_fee">Fixed Fee</SelectItem>
                    <SelectItem value="hourly">Hourly</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.billingType === 'fixed_fee' ? (
                <div className="space-y-2">
                  <Label htmlFor="fixedFeeAmount">Fixed Fee Amount *</Label>
                  <Input
                    id="fixedFeeAmount"
                    type="number"
                    value={formData.fixedFeeAmount}
                    onChange={(e) => handleInputChange('fixedFeeAmount', e.target.value)}
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="budgetHours">Budget Hours *</Label>
                  <Input
                    id="budgetHours"
                    type="number"
                    value={formData.budgetHours}
                    onChange={(e) => handleInputChange('budgetHours', e.target.value)}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Staff Assignment
              </CardTitle>
              <CardDescription>Select staff to assign to this job</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {employees.length === 0 ? (
                <p className="text-sm text-muted-foreground">No employees available.</p>
              ) : (
                <div className="space-y-3">
                  {employees.map((employee) => {
                    const isChecked = assignments.some(
                      (assignment) => assignment.employeeProfileId === employee.id
                    );
                    return (
                      <div key={employee.id} className="flex items-center gap-3">
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={(checked) => toggleAssignment(employee, Boolean(checked))}
                        />
                        <div className="flex-1">
                          <div className="font-medium">
                            {employee.firstName} {employee.lastName}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {employee.role?.name || 'No role assigned'}
                          </div>
                        </div>
                        {isChecked && (
                          <div className="w-32">
                            <Input
                              type="number"
                              value={
                                assignments.find((assignment) => assignment.employeeProfileId === employee.id)
                                  ?.assignedHourlyRate || 0
                              }
                              onChange={(e) => updateAssignmentRate(employee.id, e.target.value)}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => navigate(-1)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Save className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Create Job
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
