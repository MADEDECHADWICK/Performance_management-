import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { clientsAPI, employeesAPI, jobsAPI, clientOnboardingsAPI } from '@/lib/api';
import type { Client, Profile, ClientOnboarding } from '@/lib/api/types';
import {
  Calendar,
  FileText,
  Save,
  Users,
  Inbox,
  Search,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';

type BillingType = 'hourly' | 'fixed_fee';

type QueueStatus = 'all' | 'approved' | 'waiting';

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

  const [queueItems, setQueueItems] = useState<ClientOnboarding[]>([]);
  const [onboardingLookup, setOnboardingLookup] = useState<ClientOnboarding | null>(null);
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueError, setQueueError] = useState('');
  const [selectedQueueId, setSelectedQueueId] = useState<number | null>(null);
  const [queueSearch, setQueueSearch] = useState('');
  const [queueStatus, setQueueStatus] = useState<QueueStatus>('all');
  const [selectionNotice, setSelectionNotice] = useState<{ title: string; description?: string } | null>(null);
  const assignmentsRef = useRef<HTMLDivElement | null>(null);

  const handleSelectQueueItem = useCallback((item: ClientOnboarding) => {
    const clientId = item.client?.id ?? item.clientId;
    const engagementId = item.engagementLetter?.id ?? item.engagementLetterId;
    const startDate = item.engagementLetter?.startDate?.slice(0, 10);
    const endDate = item.engagementLetter?.endDate?.slice(0, 10);
    const feeAmount = item.engagementLetter?.feeAmount;
    const jobTitle = item.engagementLetter?.jobTitle;
    const clientName = item.client?.clientName || item.clientName || '';

    setSelectedQueueId(item.id);
    setFormData((prev) => ({
      ...prev,
      clientId: clientId ? String(clientId) : prev.clientId,
      engagementLetterId: engagementId ? String(engagementId) : prev.engagementLetterId,
      jobName: jobTitle || prev.jobName || (clientName ? `${clientName} Engagement` : prev.jobName),
      startDate: startDate || prev.startDate,
      dueDate: endDate || prev.dueDate,
      billingType: feeAmount ? 'fixed_fee' : prev.billingType,
      fixedFeeAmount: feeAmount ? String(feeAmount) : prev.fixedFeeAmount,
    }));

    setSelectionNotice({
      title: 'Onboarding selected',
      description: 'Scroll down to assign staff and finalize job details.',
    });

    setTimeout(() => {
      assignmentsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
  }, []);

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

  const approvedEngagementLetters = useMemo(
    () =>
      engagementLetters.filter(
        (letter) => letter.status === 'approved' && Number(letter.feeAmount || 0) > 0
      ),
    [engagementLetters]
  );

  const filteredQueue = queueItems.filter((item) => {
    const normalizedStatus: QueueStatus =
      item.status === 'approved' || item.status === 'client_created' ? 'approved' : 'waiting';
    const matchesStatus = queueStatus === 'all' || normalizedStatus === queueStatus;
    const searchValue = queueSearch.trim().toLowerCase();
    const clientName = item.client?.clientName || item.clientName || '';
    const engagementTitle = item.engagementLetter?.jobTitle || '';
    const engagementFile = item.engagementLetter?.document?.fileName || '';
    const matchesSearch =
      !searchValue ||
      clientName.toLowerCase().includes(searchValue) ||
      engagementTitle.toLowerCase().includes(searchValue) ||
      engagementFile.toLowerCase().includes(searchValue);

    return matchesStatus && matchesSearch;
  });

  useEffect(() => {
    const presetClientId = searchParams.get('clientId');
    if (presetClientId) {
      setFormData((prev) => ({ ...prev, clientId: presetClientId }));
    }
  }, [searchParams]);

  useEffect(() => {
    loadInitialData();
    loadQueue();
  }, []);

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
        title: 'Error',
        description: 'Failed to load form data. Please refresh the page.',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadQueue = async () => {
    try {
      setQueueLoading(true);
      setQueueError('');
      const response = await clientOnboardingsAPI.getUpcomingJobs({ pageSize: 50 });
      setQueueItems(response.data || []);
    } catch (error) {
      console.error('Error loading upcoming jobs:', error);
      setQueueError('Unable to load upcoming jobs. Refresh to try again.');
    } finally {
      setQueueLoading(false);
    }
  };

  const buildOnboardingNotReadyMessage = (record?: ClientOnboarding | null) => {
    if (!record) {
      return 'Choose an onboarding item from the queue to create a job.';
    }
    const status = record.status;
    if (status !== 'approved' && status !== 'client_created') {
      return `Onboarding status is "${status}". It must be approved before job creation.`;
    }
    const engagementStatus = record.engagementLetter?.status;
    if (engagementStatus !== 'approved') {
      return `Engagement letter is "${engagementStatus || 'missing'}". Approve it before creating a job.`;
    }
    if (!record.engagementLetter?.feeAmount) {
      return 'Engagement letter must include a fee amount before job creation.';
    }
    return 'Approved onboarding is not yet eligible. Refresh and try again.';
  };

  useEffect(() => {
    const onboardingIdParam =
      searchParams.get('onboardingId') ||
      searchParams.get('onboardingId'.toLowerCase()) ||
      searchParams.get('onboardingid');
    if (!onboardingIdParam) return;
    const onboardingId = Number(onboardingIdParam);
    if (!Number.isFinite(onboardingId) || selectedQueueId) return;

    const match = queueItems.find((item) => item.id === onboardingId);
    if (match) {
      setOnboardingLookup(null);
      handleSelectQueueItem(match);
      return;
    }

    let cancelled = false;
    clientOnboardingsAPI
      .getById(onboardingId)
      .then((record) => {
        if (cancelled) return;
        setOnboardingLookup(record);
        setSelectionNotice({
          title: 'Onboarding not ready',
          description: buildOnboardingNotReadyMessage(record),
        });
      })
      .catch(() => {
        if (cancelled) return;
        setOnboardingLookup(null);
      });

    return () => {
      cancelled = true;
    };
  }, [queueItems, searchParams, selectedQueueId, handleSelectQueueItem]);

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

  useEffect(() => {
    if (!formData.clientId) return;
    const selectedClient = clients.find((client) => String(client.id) === formData.clientId);
    if (!selectedClient) return;

    setFormData((prev) => ({
      ...prev,
      partnerProfileId:
        prev.partnerProfileId || (selectedClient.partnerProfileId ? String(selectedClient.partnerProfileId) : ''),
      managerProfileId:
        prev.managerProfileId || (selectedClient.managerProfileId ? String(selectedClient.managerProfileId) : ''),
    }));
  }, [clients, formData.clientId]);

  useEffect(() => {
    if (selectedQueueId || queueItems.length === 0) return;
    const selectedClientId = formData.clientId ? Number(formData.clientId) : undefined;
    const selectedLetterId = formData.engagementLetterId
      ? Number(formData.engagementLetterId)
      : undefined;

    let matches = queueItems;
    if (selectedClientId) {
      matches = matches.filter(
        (item) => (item.client?.id ?? item.clientId) === selectedClientId
      );
    }
    if (selectedLetterId) {
      matches = matches.filter(
        (item) => (item.engagementLetter?.id ?? item.engagementLetterId) === selectedLetterId
      );
    }

    if (matches.length === 1) {
      handleSelectQueueItem(matches[0]);
    }
  }, [
    queueItems,
    formData.clientId,
    formData.engagementLetterId,
    selectedQueueId,
    handleSelectQueueItem,
  ]);

  const handleInputChange = (field: keyof JobFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleEngagementSelection = (value: string) => {
    const selectedLetter = engagementLetters.find((letter) => String(letter.id) === value);
    const jobTitle = selectedLetter?.jobTitle;
    const startDate = selectedLetter?.startDate?.slice(0, 10);
    const endDate = selectedLetter?.endDate?.slice(0, 10);
    const feeAmount = selectedLetter?.feeAmount;

    setFormData((prev) => ({
      ...prev,
      engagementLetterId: value,
      jobName: jobTitle || prev.jobName,
      startDate: startDate || prev.startDate,
      dueDate: endDate || prev.dueDate,
      billingType: feeAmount ? 'fixed_fee' : prev.billingType,
      fixedFeeAmount: feeAmount ? String(feeAmount) : prev.fixedFeeAmount,
    }));
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
    if (!selectedQueueId) {
      const selectedClientId = formData.clientId ? Number(formData.clientId) : undefined;
      const hasMatchingQueueItem = selectedClientId
        ? queueItems.some((item) => (item.client?.id ?? item.clientId) === selectedClientId)
        : false;
      const description =
        onboardingLookup
          ? buildOnboardingNotReadyMessage(onboardingLookup)
          : selectedClientId && !hasMatchingQueueItem
            ? 'No approved onboarding found for this client. Approve the onboarding and engagement letter in the HR queue first.'
            : 'Choose an onboarding item from the queue to create a job.';
      toast({
        title: 'Select from HR queue',
        description,
        variant: 'destructive',
      });
      return false;
    }
    if (!formData.jobName.trim()) {
      toast({ title: 'Validation Error', description: 'Job name is required', variant: 'destructive' });
      return false;
    }
    if (!formData.partnerProfileId) {
      toast({ title: 'Validation Error', description: 'Partner assignment is required', variant: 'destructive' });
      return false;
    }
    if (!formData.managerProfileId) {
      toast({ title: 'Validation Error', description: 'Manager assignment is required', variant: 'destructive' });
      return false;
    }
    if (!formData.startDate) {
      toast({ title: 'Validation Error', description: 'Start date is required', variant: 'destructive' });
      return false;
    }
    if (!formData.dueDate) {
      toast({ title: 'Validation Error', description: 'Due date is required', variant: 'destructive' });
      return false;
    }
    return true;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validateForm()) return;

    try {
      setIsSubmitting(true);
      if (!selectedQueueId) {
        throw new Error('Select an onboarding item to create a job.');
      }

      const jobPayload = {
        jobName: formData.jobName.trim(),
        description: formData.description || undefined,
        partnerProfileId: Number(formData.partnerProfileId),
        managerProfileId: Number(formData.managerProfileId),
        startDate: formData.startDate,
        dueDate: formData.dueDate,
        priority: formData.priority,
        budgetHours: formData.budgetHours ? Number(formData.budgetHours) : undefined,
      };

      const job = await jobsAPI.createFromOnboarding(selectedQueueId, jobPayload);

      for (const assignment of assignments) {
        await jobsAPI.assignStaff(job.id, assignment);
      }

      toast({
        title: 'Success',
        description: 'Job created and staff assigned successfully.',
      });

      await loadQueue();
      setFormData(initialFormData);
      setAssignments([]);
      setSelectedQueueId(null);
      navigate(`/client-onboarding-queue?jobCreated=1&onboardingId=${selectedQueueId}`);
    } catch (error) {
      console.error('Job creation failed:', error);
      toast({
        title: 'Error',
        description: 'Failed to create job. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">HR Job Intake</h1>
          <p className="text-muted-foreground">
            Review marketing submissions, create jobs, and assign staff before managers allocate time.
          </p>
        </div>

        {selectionNotice && (
          <Alert className="border-emerald-200 bg-emerald-50">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <AlertTitle className="text-emerald-800">{selectionNotice.title}</AlertTitle>
            {selectionNotice.description && (
              <AlertDescription className="text-emerald-700">
                {selectionNotice.description}
              </AlertDescription>
            )}
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] gap-6">
          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Inbox className="h-5 w-5" />
                Upcoming Jobs
              </CardTitle>
              <CardDescription>
                Engagement letters approved by marketing appear here.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={queueSearch}
                    onChange={(event) => setQueueSearch(event.target.value)}
                    placeholder="Search by client or engagement"
                    className="pl-9"
                  />
                </div>
                <Select value={queueStatus} onValueChange={(value: QueueStatus) => setQueueStatus(value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filter status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="waiting">Waiting review</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {queueLoading ? (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  Loading upcoming jobs...
                </div>
              ) : queueError ? (
                <div className="rounded-lg border border-dashed p-4 text-sm text-red-500">
                  {queueError}
                </div>
              ) : filteredQueue.length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">No upcoming jobs yet.</p>
                  <p className="mt-1">
                    When marketing uploads an engagement letter, it will appear here for HR to
                    create the job and assign staff.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredQueue.map((item) => {
                    const clientName = item.client?.clientName || item.clientName || 'Unknown client';
                    const engagementTitle =
                      item.engagementLetter?.jobTitle ||
                      item.engagementLetter?.document?.fileName ||
                      'Engagement';
                    const feeAmount = item.engagementLetter?.feeAmount;
                    const currency = item.engagementLetter?.currency || 'KES';
                    const startDate = item.engagementLetter?.startDate?.slice(0, 10);
                    const statusLabel =
                      item.status === 'approved' || item.status === 'client_created' ? 'approved' : 'waiting';

                    return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectQueueItem(item)}
                      className={`w-full text-left rounded-lg border p-3 transition hover:border-primary/60 ${
                        selectedQueueId === item.id ? 'border-primary/70 bg-primary/5' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-sm">{clientName}</p>
                          <p className="text-xs text-muted-foreground">
                            {engagementTitle}
                          </p>
                        </div>
                        <Badge variant={statusLabel === 'approved' ? 'secondary' : 'outline'}>
                          {statusLabel}
                        </Badge>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground flex items-center gap-2">
                        <span>
                          {feeAmount
                            ? `${currency} ${Number(feeAmount).toLocaleString()}`
                            : 'Fee pending'}
                        </span>
                        <span>?</span>
                        <span>{startDate || 'Dates pending'}</span>
                      </div>
                      <div className="mt-3 flex items-center text-xs text-primary">
                        <span>Prepare job</span>
                        <ArrowRight className="ml-1 h-3 w-3" />
                      </div>
                    </button>
                  )})}
                </div>
              )}
            </CardContent>
          </Card>

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
                    disabled={isLoading || Boolean(selectedQueueId)}
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
                  <Label htmlFor="engagementLetterId">Engagement Letter *</Label>
                  <Select
                    value={formData.engagementLetterId}
                    onValueChange={handleEngagementSelection}
                    disabled={!selectedClientId || Boolean(selectedQueueId)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select engagement letter" />
                    </SelectTrigger>
                    <SelectContent>
                      {approvedEngagementLetters.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-muted-foreground">
                          No approved engagement letters with a fee yet.
                        </div>
                      ) : (
                        approvedEngagementLetters.map((letter) => (
                          <SelectItem key={letter.id} value={String(letter.id)}>
                            {letter.jobTitle || letter.engagementType || `Letter ${letter.id}`}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {selectedClientId && approvedEngagementLetters.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Upload and approve an engagement letter with a fee before creating a job.
                    </p>
                  )}
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

            <Card ref={assignmentsRef}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Ownership and Timeline
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
                    disabled={Boolean(formData.engagementLetterId)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select billing type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed_fee">Fixed Fee</SelectItem>
                      <SelectItem value="hourly">Hourly</SelectItem>
                    </SelectContent>
                  </Select>
                  {formData.engagementLetterId && (
                    <p className="text-xs text-muted-foreground">
                      Billing type is locked to the engagement letter.
                    </p>
                  )}
                </div>

                {formData.billingType === 'fixed_fee' ? (
                  <div className="space-y-2">
                    <Label htmlFor="fixedFeeAmount">Fixed Fee Amount *</Label>
                    <Input
                      id="fixedFeeAmount"
                      type="number"
                      value={formData.fixedFeeAmount}
                      onChange={(e) => handleInputChange('fixedFeeAmount', e.target.value)}
                      disabled={Boolean(formData.engagementLetterId)}
                    />
                    {formData.engagementLetterId && (
                      <p className="text-xs text-muted-foreground">
                        Fee is pulled from the approved engagement letter.
                      </p>
                    )}
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

            <div className="flex items-center justify-between">
              <Card className="flex-1 mr-4">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Selected staff</span>
                    <span className="font-medium">{assignments.length}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm mt-2">
                    <span className="text-muted-foreground">Billing type</span>
                    <span className="font-medium">{formData.billingType === 'fixed_fee' ? 'Fixed fee' : 'Hourly'}</span>
                  </div>
                </CardContent>
              </Card>
              <div className="flex gap-3">
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
            </div>
          </form>
        </div>
      </div>
    </DashboardLayout>
  );
}
