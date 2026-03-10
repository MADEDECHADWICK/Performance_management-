/**
 * Client Form Page - Create or Edit Client
 * Includes engagement letter capture for intake
 */
import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clientsAPI, employeesAPI, documentsAPI, departmentsAPI, clientOnboardingsAPI } from '@/lib/api';
import type { CreateClientPayload, UpdateClientPayload } from '@/lib/api/clients';
import type { Client, Department, Profile } from '@/lib/api/types';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Building2, ArrowLeft, Save, Loader2, FileText } from 'lucide-react';

const INDUSTRIES = [
  'Financial Services',
  'Healthcare',
  'Technology',
  'Manufacturing',
  'Retail',
  'Education',
  'Non-Profit',
  'Real Estate',
  'Agriculture',
  'Professional Services',
  'Other',
];

const ENGAGEMENT_TYPES = [
  'audit',
  'tax',
  'advisory',
  'consulting',
  'bookkeeping',
  'other',
];

const MAX_INT_32 = 2_147_483_647;

const createDraftDocumentEntityId = () => {
  const candidate = Date.now() % MAX_INT_32;
  return candidate > 0 ? candidate : 1;
};

interface ClientFormData {
  clientName: string;
  clientCode: string;
  industry: string;
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  location: string;
  address: string;
  departmentId: string;
  partnerProfileId: string;
  managerProfileId: string;
  isActive: boolean;
}

interface EngagementLetterFormData {
  documentName: string;
  documentFile: File | null;
  engagementType: string;
  jobTitle: string;
  feeAmount: string;
  currency: string;
  startDate: string;
  endDate: string;
  scopeDescription: string;
  termsConditions: string;
}

type ClientIntakeMode = 'new' | 'existing';

const initialFormData: ClientFormData = {
  clientName: '',
  clientCode: '',
  industry: '',
  contactPerson: '',
  contactEmail: '',
  contactPhone: '',
  location: '',
  address: '',
  departmentId: '',
  partnerProfileId: '',
  managerProfileId: '',
  isActive: true,
};

const initialEngagementLetter: EngagementLetterFormData = {
  documentName: '',
  documentFile: null,
  engagementType: '',
  jobTitle: '',
  feeAmount: '',
  currency: 'KES',
  startDate: '',
  endDate: '',
  scopeDescription: '',
  termsConditions: '',
};

export function ClientFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEditing = Boolean(id);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { canAccess, hasAnyRole } = useAuth();

  const [formData, setFormData] = useState<ClientFormData>(initialFormData);
  const [clientMode, setClientMode] = useState<ClientIntakeMode>('new');
  const [selectedExistingClientId, setSelectedExistingClientId] = useState('');
  const [engagementLetter, setEngagementLetter] = useState<EngagementLetterFormData>(
    initialEngagementLetter
  );
  const [errors, setErrors] = useState<Partial<Record<keyof ClientFormData, string>>>({});
  const [duplicateClients, setDuplicateClients] = useState<Client[]>([]);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const canSubmitMarketingIntake =
    canAccess('clients', 'write') && hasAnyRole(['marketing', 'super_admin']);
  const resubmissionOnboardingId = Number(searchParams.get('onboardingId') || '');
  const isResubmissionFlow =
    isEditing &&
    searchParams.get('resubmit') === '1' &&
    Number.isFinite(resubmissionOnboardingId) &&
    resubmissionOnboardingId > 0;

  const { data: client, isLoading: isLoadingClient } = useQuery({
    queryKey: ['client', id],
    queryFn: () => clientsAPI.getById(Number(id)),
    enabled: isEditing,
  });

  const { data: resubmissionOnboarding, isLoading: isLoadingResubmission } = useQuery({
    queryKey: ['client-onboarding', resubmissionOnboardingId],
    queryFn: () => clientOnboardingsAPI.getById(resubmissionOnboardingId),
    enabled: isResubmissionFlow,
  });

  const { data: partnersData } = useQuery({
    queryKey: ['employees', 'partners'],
    queryFn: () => employeesAPI.listPartners(),
  });

  const { data: managersData } = useQuery({
    queryKey: ['employees', 'managers'],
    queryFn: () => employeesAPI.list({ pageSize: 200 }),
  });

  const { data: departmentsData } = useQuery({
    queryKey: ['departments', 'client-intake'],
    queryFn: () => departmentsAPI.list({ page: 1, pageSize: 200 }),
  });

  const { data: existingClientsData } = useQuery({
    queryKey: ['clients', 'intake-options'],
    queryFn: () => clientsAPI.list({ page: 1, pageSize: 200 }),
    enabled: !isEditing,
  });

  const partners = partnersData || [];
  const managers = (managersData?.data || []).filter((employee: Profile) => {
    const title = String(employee.positionTitle || '').toLowerCase();
    return title.includes('manager') && !employee.isPartner;
  });
  const departments = departmentsData?.data || [];
  const existingClients = existingClientsData?.data || [];
  const isExistingClientFlow = !isEditing && clientMode === 'existing';
  const selectedExistingClient =
    existingClients.find((item) => String(item.id) === selectedExistingClientId) || null;
  const currentResubmissionLetter = resubmissionOnboarding?.engagementLetter;
  const selectedDepartment = useMemo(
    () => departments.find((department: Department) => String(department.id) === formData.departmentId) || null,
    [departments, formData.departmentId]
  );
  const availableManagers = useMemo(() => {
    const scopedManagers = formData.departmentId
      ? managers.filter(
          (manager) =>
            String(manager.departmentId || '') === formData.departmentId ||
            manager.id === selectedDepartment?.departmentHeadId ||
            manager.id === selectedDepartment?.departmentHead?.id
        )
      : managers;

    const departmentHead = selectedDepartment?.departmentHead;
    if (!departmentHead) {
      return scopedManagers;
    }

    const alreadyIncluded = scopedManagers.some((manager) => manager.id === departmentHead.id);
    return alreadyIncluded ? scopedManagers : [...scopedManagers, departmentHead];
  }, [formData.departmentId, managers, selectedDepartment]);

  const toDateInputValue = (value?: string | null) => {
    if (!value) return '';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
  };

  const resetNewClientForm = () => {
    setSelectedExistingClientId('');
    setFormData((prev) => ({
      ...initialFormData,
      departmentId: prev.departmentId,
      partnerProfileId: prev.partnerProfileId,
      managerProfileId: prev.managerProfileId,
    }));
  };

  const applyExistingClient = (selectedClient: Client | null) => {
    if (!selectedClient) {
      resetNewClientForm();
      return;
    }

    setFormData({
      clientName: selectedClient.clientName || '',
      clientCode: selectedClient.clientCode || `CL-${String(selectedClient.id).padStart(4, '0')}`,
      industry: selectedClient.industry || '',
      contactPerson: selectedClient.contactPerson || '',
      contactEmail: selectedClient.contactEmail || '',
      contactPhone: selectedClient.contactPhone || '',
      location: selectedClient.location || '',
      address: selectedClient.address || '',
      departmentId: selectedClient.departmentId ? String(selectedClient.departmentId) : '',
      partnerProfileId: selectedClient.partnerProfileId ? String(selectedClient.partnerProfileId) : '',
      managerProfileId: selectedClient.managerProfileId ? String(selectedClient.managerProfileId) : '',
      isActive: selectedClient.status === 'active',
    });
  };

  useEffect(() => {
    if (client) {
      setFormData({
        clientName: client.clientName || '',
        clientCode: client.clientCode || '',
        industry: client.industry || '',
        contactPerson: client.contactPerson || '',
        contactEmail: client.contactEmail || '',
        contactPhone: client.contactPhone || '',
        location: client.location || '',
        address: client.address || '',
        departmentId: client.departmentId ? String(client.departmentId) : '',
        partnerProfileId: client.partnerProfileId ? String(client.partnerProfileId) : '',
        managerProfileId: client.managerProfileId ? String(client.managerProfileId) : '',
        isActive: client.status === 'active',
      });
    }
  }, [client]);

  useEffect(() => {
    if (!isExistingClientFlow) return;
    applyExistingClient(selectedExistingClient);
  }, [isExistingClientFlow, selectedExistingClientId, existingClientsData]);

  useEffect(() => {
    if (!isResubmissionFlow || !resubmissionOnboarding?.engagementLetter) return;

    const letter = resubmissionOnboarding.engagementLetter;
    setEngagementLetter({
      documentName: letter.document?.fileName || '',
      documentFile: null,
      engagementType: letter.engagementType || '',
      jobTitle: letter.jobTitle || '',
      feeAmount:
        letter.feeAmount !== undefined && letter.feeAmount !== null ? String(letter.feeAmount) : '',
      currency: letter.currency || 'KES',
      startDate: toDateInputValue(letter.startDate),
      endDate: toDateInputValue(letter.endDate),
      scopeDescription: letter.scopeDescription || '',
      termsConditions: letter.termsConditions || '',
    });
  }, [isResubmissionFlow, resubmissionOnboarding?.id]);

  useEffect(() => {
    if (isExistingClientFlow) {
      setDuplicateClients([]);
      return;
    }
    if (!formData.clientName && !formData.contactEmail && !formData.contactPhone) {
      setDuplicateClients([]);
      return;
    }

    const handle = setTimeout(async () => {
      try {
        setCheckingDuplicates(true);
        const query = formData.clientName || formData.contactEmail || formData.contactPhone;
        const result = await clientsAPI.list({ search: query, page: 1, pageSize: 5 });
        const items = result?.data || [];
        const filtered = items.filter((item: Client) => String(item.id) !== id);
        setDuplicateClients(filtered);
      } catch {
        setDuplicateClients([]);
      } finally {
        setCheckingDuplicates(false);
      }
    }, 500);

    return () => clearTimeout(handle);
  }, [formData.clientName, formData.contactEmail, formData.contactPhone, id, isExistingClientFlow]);

  useEffect(() => {
    if (!formData.managerProfileId) return;
    const managerStillAvailable = availableManagers.some(
      (manager) => String(manager.id) === formData.managerProfileId
    );
    if (managerStillAvailable) return;

    setFormData((prev) => ({ ...prev, managerProfileId: '' }));
  }, [availableManagers, formData.managerProfileId]);

  useEffect(() => {
    if (!selectedDepartment || !formData.departmentId) return;

    const nextPartnerProfileId =
      !formData.partnerProfileId && selectedDepartment.partnerProfileId
        ? String(selectedDepartment.partnerProfileId)
        : formData.partnerProfileId;
    const nextManagerProfileId =
      !formData.managerProfileId &&
      (selectedDepartment.departmentHeadId || selectedDepartment.departmentHead?.id)
        ? String(selectedDepartment.departmentHeadId || selectedDepartment.departmentHead?.id)
        : formData.managerProfileId;

    if (
      nextPartnerProfileId === formData.partnerProfileId &&
      nextManagerProfileId === formData.managerProfileId
    ) {
      return;
    }

    setFormData((prev) => ({
      ...prev,
      partnerProfileId: nextPartnerProfileId,
      managerProfileId: nextManagerProfileId,
    }));
  }, [
    formData.departmentId,
    formData.managerProfileId,
    formData.partnerProfileId,
    selectedDepartment,
  ]);

const hasExistingResubmissionDocument =
  Boolean(currentResubmissionLetter?.document?.filePath) || Boolean(currentResubmissionLetter?.documentId);

const hasEngagementLetter =
  engagementLetter.documentName.trim() &&
  (Boolean(engagementLetter.documentFile) || hasExistingResubmissionDocument) &&
  engagementLetter.engagementType.trim();

  const engagementStatusLabel = hasEngagementLetter
    ? isResubmissionFlow
      ? 'Ready to Resubmit'
      : 'Ready'
    : isEditing
      ? 'Optional'
      : 'Required';
  const engagementStatusVariant = hasEngagementLetter
    ? 'default'
    : isEditing
      ? 'secondary'
      : 'destructive';

  const requiredChecks = isResubmissionFlow
    ? [
        { label: 'Client name', done: Boolean(formData.clientName.trim()) },
        { label: 'Department assigned', done: Boolean(formData.departmentId) },
        { label: 'Partner assigned', done: Boolean(formData.partnerProfileId) },
        { label: 'Manager assigned', done: Boolean(formData.managerProfileId) },
        { label: 'Engagement letter', done: hasEngagementLetter },
      ]
    : isExistingClientFlow
    ? [
        { label: 'Client selected', done: Boolean(selectedExistingClientId) },
        { label: 'Department assigned', done: Boolean(formData.departmentId) },
        { label: 'Partner assigned', done: Boolean(formData.partnerProfileId) },
        { label: 'Manager assigned', done: Boolean(formData.managerProfileId) },
        { label: 'Engagement letter', done: hasEngagementLetter },
      ]
    : [
        { label: 'Client name', done: Boolean(formData.clientName.trim()) },
        { label: 'Department assigned', done: Boolean(formData.departmentId) },
        { label: 'Partner assigned', done: Boolean(formData.partnerProfileId) },
        { label: 'Manager assigned', done: Boolean(formData.managerProfileId) },
        { label: 'Engagement letter', done: isEditing || hasEngagementLetter },
      ];
  const completedRequired = requiredChecks.filter((item) => item.done).length;
  const intakeReady = completedRequired === requiredChecks.length;

  const uploadEngagementDocument = async (clientId?: number) => {
    const draftEntityId = clientId ?? createDraftDocumentEntityId();
    const document = await documentsAPI.uploadFile(engagementLetter.documentFile!, {
      fileName: engagementLetter.documentName.trim(),
      documentType: 'engagement_letter',
      // New-client intake uploads happen before a client record exists.
      entityType: clientId ? 'Client' : 'ClientIntake',
      entityId: draftEntityId,
      accessLevel: 'admin',
      description: `Engagement letter for ${formData.clientName}`,
    });

    return document;
  };

  const uploadEngagementLetter = async (clientId: number) => {
    if (!hasEngagementLetter) return;
    if (!canSubmitMarketingIntake) {
      throw new Error('Only marketing can submit engagement letters for HR review.');
    }

    const document = await uploadEngagementDocument(clientId);

    await clientsAPI.uploadEngagementLetter(clientId, {
      documentId: document.id,
      engagementType: engagementLetter.engagementType,
      departmentId: formData.departmentId ? Number(formData.departmentId) : undefined,
      partnerProfileId: formData.partnerProfileId ? Number(formData.partnerProfileId) : undefined,
      managerProfileId: formData.managerProfileId ? Number(formData.managerProfileId) : undefined,
      jobTitle: engagementLetter.jobTitle || undefined,
      feeAmount: engagementLetter.feeAmount ? Number(engagementLetter.feeAmount) : undefined,
      currency: engagementLetter.currency || undefined,
      startDate: engagementLetter.startDate || undefined,
      endDate: engagementLetter.endDate || undefined,
      scopeDescription: engagementLetter.scopeDescription || undefined,
      termsConditions: engagementLetter.termsConditions || undefined,
    });
  };

  const saveMutation = useMutation({
    mutationFn: async (data: CreateClientPayload | UpdateClientPayload) => {
      if (isResubmissionFlow) {
        const clientId = Number(id);
        const savedClient = await clientsAPI.update(clientId, data as UpdateClientPayload);
        const replacementDocument = engagementLetter.documentFile
          ? await uploadEngagementDocument(savedClient.id)
          : null;

        await clientOnboardingsAPI.resubmit(resubmissionOnboardingId, {
          clientName: data.clientName,
          clientCode: formData.clientCode || undefined,
          industry: data.industry,
          contactPerson: data.contactPerson,
          contactEmail: data.contactEmail,
          contactPhone: data.contactPhone,
          location: data.location,
          address: data.address,
          departmentId: data.departmentId,
          partnerProfileId: data.partnerProfileId,
          managerProfileId: data.managerProfileId,
          status: data.status,
          documentId: replacementDocument?.id,
          engagementType: engagementLetter.engagementType,
          jobTitle: engagementLetter.jobTitle || undefined,
          feeAmount: engagementLetter.feeAmount ? Number(engagementLetter.feeAmount) : undefined,
          currency: engagementLetter.currency || undefined,
          startDate: engagementLetter.startDate || undefined,
          endDate: engagementLetter.endDate || undefined,
          scopeDescription: engagementLetter.scopeDescription || undefined,
          termsConditions: engagementLetter.termsConditions || undefined,
        });

        return savedClient;
      }

      if (isExistingClientFlow) {
        const clientId = Number(selectedExistingClientId);
        if (!Number.isFinite(clientId) || clientId <= 0) {
          throw new Error('Select an existing client before submitting an engagement letter.');
        }

        await uploadEngagementLetter(clientId);
        return selectedExistingClient || (await clientsAPI.getById(clientId));
      }

      if (!isEditing && hasEngagementLetter) {
        const document = await uploadEngagementDocument();
        return clientsAPI.create({
          ...(data as CreateClientPayload),
          engagementLetter: {
            documentId: document.id,
            engagementType: engagementLetter.engagementType,
            jobTitle: engagementLetter.jobTitle || undefined,
            feeAmount: Number(engagementLetter.feeAmount),
            currency: engagementLetter.currency || undefined,
            startDate: engagementLetter.startDate || undefined,
            endDate: engagementLetter.endDate || undefined,
            scopeDescription: engagementLetter.scopeDescription || undefined,
            termsConditions: engagementLetter.termsConditions || undefined,
          },
        });
      }

      const savedClient = isEditing
        ? await clientsAPI.update(Number(id), data as UpdateClientPayload)
        : await clientsAPI.create(data as CreateClientPayload);

      if (isEditing && hasEngagementLetter) {
        await uploadEngagementLetter(savedClient.id);
      }

      return savedClient;
    },
    onSuccess: (savedClient) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['client', String(savedClient.id)] });
      queryClient.invalidateQueries({ queryKey: ['engagement-letters', String(savedClient.id)] });
      queryClient.invalidateQueries({ queryKey: ['client-onboardings'] });
      queryClient.invalidateQueries({ queryKey: ['client-onboarding', resubmissionOnboardingId] });

      if (isExistingClientFlow) {
        toast({
          title: 'Engagement Letter Submitted',
          description: `The engagement letter for ${savedClient.clientName} has been submitted for HR review.`,
        });
        navigate(`/clients/${savedClient.id}`);
        return;
      }

      if (isResubmissionFlow) {
        toast({
          title: 'Returned to HR',
          description: `The revised submission for ${savedClient.clientName} has been sent back to HR for review.`,
        });
        navigate('/client-onboarding-queue');
        return;
      }

      toast({
        title: isEditing ? 'Client Updated' : 'Client Created',
        description: isEditing
          ? 'The client has been updated successfully.'
          : 'The client has been created successfully.',
      });
      navigate(isEditing ? `/clients/${savedClient.id}` : '/clients');
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save client.',
        variant: 'destructive',
      });
    },
  });

  const isSubmitting = saveMutation.isPending;

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof ClientFormData, string>> = {};
    const ownershipRequired = !isEditing || isResubmissionFlow;

    if (!isExistingClientFlow && !formData.clientName.trim()) {
      newErrors.clientName = 'Client name is required';
    }

    if (formData.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.contactEmail)) {
      newErrors.contactEmail = 'Invalid email address';
    }

    if (ownershipRequired && !formData.partnerProfileId) {
      newErrors.partnerProfileId = 'Partner in charge is required';
    }

    if (ownershipRequired && !formData.managerProfileId) {
      newErrors.managerProfileId = 'Manager in charge is required';
    }

    if (ownershipRequired && !formData.departmentId) {
      newErrors.departmentId = 'Department is required';
    }

    setErrors(newErrors);

    if (isExistingClientFlow && !selectedExistingClientId) {
      toast({
        title: 'Existing Client Required',
        description: 'Select an existing client before submitting the engagement letter.',
        variant: 'destructive',
      });
      return false;
    }

    if ((!isEditing || isResubmissionFlow) && !canSubmitMarketingIntake) {
      toast({
        title: 'Marketing Only',
        description: 'Only marketing can submit or resubmit this onboarding package to HR.',
        variant: 'destructive',
      });
      return false;
    }

    if (isEditing && hasEngagementLetter && !canSubmitMarketingIntake) {
      toast({
        title: 'Marketing Only',
        description: 'Only marketing can add a new engagement letter to an existing client.',
        variant: 'destructive',
      });
      return false;
    }

    if ((!isEditing || isResubmissionFlow) && !hasEngagementLetter) {
      toast({
        title: 'Engagement Letter Required',
        description: isResubmissionFlow
          ? 'Keep or replace the engagement letter details before resubmitting to HR.'
          : 'Upload engagement letter metadata before creating the client.',
        variant: 'destructive',
      });
      return false;
    }

    if (!isEditing || isResubmissionFlow) {
      const feeAmount = Number(engagementLetter.feeAmount);
      if (!Number.isFinite(feeAmount) || feeAmount <= 0) {
        toast({
          title: 'Engagement Fee Required',
          description: isResubmissionFlow
            ? 'Enter the engagement fee before resubmitting this item to HR.'
            : 'Enter the engagement fee before submitting a new client intake.',
          variant: 'destructive',
        });
        return false;
      }
    }

    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    const clientData: CreateClientPayload = {
      clientName: formData.clientName.trim(),
      clientCode: isEditing ? formData.clientCode || undefined : undefined,
      industry: formData.industry || undefined,
      contactPerson: formData.contactPerson || undefined,
      contactEmail: formData.contactEmail || undefined,
      contactPhone: formData.contactPhone || undefined,
      location: formData.location || undefined,
      address: formData.address || undefined,
      departmentId: formData.departmentId ? Number(formData.departmentId) : undefined,
      partnerProfileId: formData.partnerProfileId ? Number(formData.partnerProfileId) : undefined,
      managerProfileId: formData.managerProfileId ? Number(formData.managerProfileId) : undefined,
      status: formData.isActive ? 'active' : 'inactive',
    };

    saveMutation.mutate(clientData);
  };

  const handleChange = (field: keyof ClientFormData, value: string | boolean) => {
    if (field === 'departmentId') {
      const nextDepartmentId = String(value || '');
      const department =
        departments.find((item: Department) => String(item.id) === nextDepartmentId) || null;

      setFormData((prev) => ({
        ...prev,
        departmentId: nextDepartmentId,
        partnerProfileId: department?.partnerProfileId
          ? String(department.partnerProfileId)
          : department?.partner?.id
            ? String(department.partner.id)
            : '',
        managerProfileId: department?.departmentHeadId
          ? String(department.departmentHeadId)
          : department?.departmentHead?.id
            ? String(department.departmentHead.id)
            : '',
      }));
      setErrors((prev) => ({
        ...prev,
        departmentId: undefined,
        partnerProfileId: undefined,
        managerProfileId: undefined,
      }));
    } else {
      setFormData((prev) => ({ ...prev, [field]: value }));
      if (errors[field]) {
        setErrors((prev) => ({ ...prev, [field]: undefined }));
      }
    }
  };

  const handleClientModeChange = (value: ClientIntakeMode) => {
    setClientMode(value);
    setErrors({});
    if (value === 'new') {
      resetNewClientForm();
      return;
    }
    setFormData(initialFormData);
  };

  const clientIdentifierValue = isExistingClientFlow
    ? selectedExistingClient?.clientCode || (selectedExistingClient ? `CL-${String(selectedExistingClient.id).padStart(4, '0')}` : '')
    : formData.clientCode;

  if ((isEditing && isLoadingClient) || (isResubmissionFlow && isLoadingResubmission)) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold flex items-center gap-2">
                <Building2 className="h-8 w-8 text-primary" />
                {isResubmissionFlow ? 'Revise Client Submission' : isEditing ? 'Edit Client' : 'Client Intake'}
              </h1>
              <Badge variant={intakeReady ? 'default' : 'outline'}>
                {intakeReady ? (isResubmissionFlow ? 'Ready to Resubmit' : 'Ready for HR') : 'Draft'}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1">
              {isResubmissionFlow
                ? 'Update the client details or engagement letter based on HR feedback, then resubmit it for review.'
                : isEditing
                ? 'Update client information and engagement details'
                : isExistingClientFlow
                  ? 'Select an existing client, then submit the new engagement letter for HR review'
                  : 'Marketing captures the client profile and engagement letter, then HR reviews it for job creation'}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6">
            <div className="space-y-6">
              {isResubmissionFlow && (
                <Card>
                  <CardContent className="pt-6">
                    <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">
                      <p className="font-medium">HR review feedback</p>
                      {resubmissionOnboarding?.notes && (
                        <p className="mt-2">
                          <span className="font-medium">Client details:</span> {resubmissionOnboarding.notes}
                        </p>
                      )}
                      {currentResubmissionLetter?.latestRejectionReason && (
                        <p className="mt-2">
                          <span className="font-medium">Engagement letter:</span>{" "}
                          {currentResubmissionLetter.latestRejectionReason}
                        </p>
                      )}
                      {!resubmissionOnboarding?.notes && !currentResubmissionLetter?.latestRejectionReason && (
                        <p className="mt-2">HR returned this item for revision. Update it and resubmit.</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle>Client Identity</CardTitle>
                  <CardDescription>
                    {isExistingClientFlow
                      ? 'Select an existing client record. You can still set the routing partner, manager, and department for this engagement.'
                      : 'Core details for the client record'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!isEditing && (
                    <div className="space-y-2">
                      <Label htmlFor="clientMode">Client Record Type</Label>
                      <Select
                        value={clientMode}
                        onValueChange={(value: ClientIntakeMode) => handleClientModeChange(value)}
                      >
                        <SelectTrigger id="clientMode">
                          <SelectValue placeholder="Select client record type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="new">New client</SelectItem>
                          <SelectItem value="existing">Existing client</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="clientName">{isExistingClientFlow ? 'Existing Client *' : 'Client Name *'}</Label>
                      {isExistingClientFlow ? (
                        <Select
                          value={selectedExistingClientId}
                          onValueChange={(value) => setSelectedExistingClientId(value)}
                        >
                          <SelectTrigger id="clientName" className={errors.clientName ? 'border-red-500' : ''}>
                            <SelectValue placeholder="Select an existing client" />
                          </SelectTrigger>
                          <SelectContent>
                            {existingClients.map((existingClient) => (
                              <SelectItem key={existingClient.id} value={String(existingClient.id)}>
                                {existingClient.clientName} {existingClient.clientCode ? `(${existingClient.clientCode})` : `(#${existingClient.id})`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          id="clientName"
                          value={formData.clientName}
                          onChange={(e) => handleChange('clientName', e.target.value)}
                          placeholder="Enter client name"
                          className={errors.clientName ? 'border-red-500' : ''}
                        />
                      )}
                      {errors.clientName && (
                        <p className="text-sm text-red-500">{errors.clientName}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="clientCode">Client ID</Label>
                      <Input
                        id="clientCode"
                        value={clientIdentifierValue}
                        readOnly
                        disabled
                        placeholder={isEditing ? 'Client ID' : 'Auto-generated by the system'}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="industry">Industry</Label>
                      <Select
                        value={formData.industry}
                        onValueChange={(value) => handleChange('industry', value)}
                        disabled={isExistingClientFlow}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select industry" />
                        </SelectTrigger>
                        <SelectContent>
                          {INDUSTRIES.map((industry) => (
                            <SelectItem key={industry} value={industry}>
                              {industry}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center space-x-2 pt-6">
                      <Switch
                        id="isActive"
                        checked={formData.isActive}
                        onCheckedChange={(checked) => handleChange('isActive', checked)}
                        disabled={isExistingClientFlow}
                      />
                      <Label htmlFor="isActive">Active Client</Label>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Primary Contact</CardTitle>
                  <CardDescription>Who the team should reach out to</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="contactPerson">Contact Person</Label>
                      <Input
                        id="contactPerson"
                        value={formData.contactPerson}
                        onChange={(e) => handleChange('contactPerson', e.target.value)}
                        placeholder="Enter contact person name"
                        disabled={isExistingClientFlow}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="contactEmail">Email Address</Label>
                      <Input
                        id="contactEmail"
                        type="email"
                        value={formData.contactEmail}
                        onChange={(e) => handleChange('contactEmail', e.target.value)}
                        placeholder="client@example.com"
                        className={errors.contactEmail ? 'border-red-500' : ''}
                        disabled={isExistingClientFlow}
                      />
                      {errors.contactEmail && (
                        <p className="text-sm text-red-500">{errors.contactEmail}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="contactPhone">Phone Number</Label>
                      <Input
                        id="contactPhone"
                        value={formData.contactPhone}
                        onChange={(e) => handleChange('contactPhone', e.target.value)}
                        placeholder="+254 700 000 000"
                        disabled={isExistingClientFlow}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="location">Location</Label>
                      <Input
                        id="location"
                        value={formData.location}
                        onChange={(e) => handleChange('location', e.target.value)}
                        placeholder="City, Country"
                        disabled={isExistingClientFlow}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="address">Full Address</Label>
                    <Textarea
                      id="address"
                      value={formData.address}
                      onChange={(e) => handleChange('address', e.target.value)}
                      placeholder="Enter full postal address"
                      rows={3}
                      disabled={isExistingClientFlow}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Ownership</CardTitle>
                  <CardDescription>Assign the department, partner, and manager that should own this engagement</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="departmentId">Department *</Label>
                      <Select
                        value={formData.departmentId}
                        onValueChange={(value) => handleChange('departmentId', value)}
                      >
                        <SelectTrigger className={errors.departmentId ? 'border-red-500' : ''}>
                          <SelectValue placeholder="Select department" />
                        </SelectTrigger>
                        <SelectContent>
                          {departments.map((department) => (
                            <SelectItem key={department.id} value={String(department.id)}>
                              {department.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.departmentId && (
                        <p className="text-sm text-red-500">{errors.departmentId}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="partnerProfileId">Partner In Charge *</Label>
                      <Select
                        value={formData.partnerProfileId}
                        onValueChange={(value) => handleChange('partnerProfileId', value)}
                      >
                        <SelectTrigger className={errors.partnerProfileId ? 'border-red-500' : ''}>
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
                      {errors.partnerProfileId && (
                        <p className="text-sm text-red-500">{errors.partnerProfileId}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="managerProfileId">Manager In Charge *</Label>
                      <Select
                        value={formData.managerProfileId}
                        onValueChange={(value) => handleChange('managerProfileId', value)}
                      >
                        <SelectTrigger className={errors.managerProfileId ? 'border-red-500' : ''}>
                          <SelectValue placeholder="Select manager" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableManagers.map((manager) => (
                            <SelectItem key={manager.id} value={String(manager.id)}>
                              {manager.firstName} {manager.lastName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.managerProfileId && (
                        <p className="text-sm text-red-500">{errors.managerProfileId}</p>
                      )}
                    </div>
                  </div>
                  {formData.departmentId && availableManagers.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No managers were found for the selected department.
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Engagement Letter
                    <Badge variant={engagementStatusVariant}>{engagementStatusLabel}</Badge>
                  </CardTitle>
                  <CardDescription>
                    Marketing submits the engagement letter here before HR can create a job.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="documentName">Document Name *</Label>
                      <Input
                        id="documentName"
                        value={engagementLetter.documentName}
                        onChange={(e) =>
                          setEngagementLetter((prev) => ({ ...prev, documentName: e.target.value }))
                        }
                        placeholder="Engagement letter title"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="documentFile">
                        {isResubmissionFlow
                          ? 'Upload Replacement Engagement Letter'
                          : 'Upload Engagement Letter *'}
                      </Label>
                      <Input
                        id="documentFile"
                        type="file"
                        accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null;
                          setEngagementLetter((prev) => ({
                            ...prev,
                            documentFile: file,
                            documentName: prev.documentName || file?.name || '',
                          }));
                        }}
                      />
                      {isResubmissionFlow && currentResubmissionLetter?.document?.fileName && !engagementLetter.documentFile && (
                        <p className="text-xs text-muted-foreground">
                          Current file: {currentResubmissionLetter.document.fileName}. Leave this blank to keep it, or upload a replacement.
                        </p>
                      )}
                      {engagementLetter.documentFile && (
                        <p className="text-xs text-muted-foreground">
                          Selected: {engagementLetter.documentFile.name}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="engagementType">Engagement Type *</Label>
                      <Select
                        value={engagementLetter.engagementType}
                        onValueChange={(value) =>
                          setEngagementLetter((prev) => ({ ...prev, engagementType: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select engagement type" />
                        </SelectTrigger>
                        <SelectContent>
                          {ENGAGEMENT_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>
                              {type.replace('_', ' ')}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="jobTitle">Job Title</Label>
                      <Input
                        id="jobTitle"
                        value={engagementLetter.jobTitle}
                        onChange={(e) =>
                          setEngagementLetter((prev) => ({ ...prev, jobTitle: e.target.value }))
                        }
                        placeholder="Optional job title"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="feeAmount">Fee Amount</Label>
                      <Input
                        id="feeAmount"
                        type="number"
                        value={engagementLetter.feeAmount}
                        onChange={(e) =>
                          setEngagementLetter((prev) => ({ ...prev, feeAmount: e.target.value }))
                        }
                        placeholder="0.00"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="currency">Currency</Label>
                      <Input
                        id="currency"
                        value={engagementLetter.currency}
                        onChange={(e) =>
                          setEngagementLetter((prev) => ({ ...prev, currency: e.target.value }))
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="startDate">Start Date</Label>
                      <Input
                        id="startDate"
                        type="date"
                        value={engagementLetter.startDate}
                        onChange={(e) =>
                          setEngagementLetter((prev) => ({ ...prev, startDate: e.target.value }))
                        }
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="endDate">End Date</Label>
                      <Input
                        id="endDate"
                        type="date"
                        value={engagementLetter.endDate}
                        onChange={(e) =>
                          setEngagementLetter((prev) => ({ ...prev, endDate: e.target.value }))
                        }
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="scopeDescription">Scope Description</Label>
                    <Textarea
                      id="scopeDescription"
                      value={engagementLetter.scopeDescription}
                      onChange={(e) =>
                        setEngagementLetter((prev) => ({ ...prev, scopeDescription: e.target.value }))
                      }
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="termsConditions">Terms and Conditions</Label>
                    <Textarea
                      id="termsConditions"
                      value={engagementLetter.termsConditions}
                      onChange={(e) =>
                        setEngagementLetter((prev) => ({ ...prev, termsConditions: e.target.value }))
                      }
                      rows={3}
                    />
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate(-1)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                  <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {isResubmissionFlow ? 'Resubmitting...' : isEditing ? 'Updating...' : 'Creating...'}
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      {isResubmissionFlow
                        ? 'Resubmit to HR'
                        : isEditing
                          ? 'Update Client'
                          : isExistingClientFlow
                            ? 'Submit Engagement'
                            : 'Submit Intake'}
                    </>
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>{isResubmissionFlow ? 'Resubmission Checklist' : 'Intake Checklist'}</CardTitle>
                  <CardDescription>{completedRequired} of {requiredChecks.length} required items completed</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {requiredChecks.map((item) => (
                    <div key={item.label} className="flex items-center justify-between text-sm">
                      <span>{item.label}</span>
                      <Badge variant={item.done ? 'secondary' : 'outline'}>
                        {item.done ? 'Done' : 'Pending'}
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{isExistingClientFlow ? 'Selected Client' : 'Duplicate Check'}</CardTitle>
                  <CardDescription>
                    {isExistingClientFlow
                      ? 'The engagement letter will be attached to this existing client record.'
                      : 'Helps avoid duplicate client records.'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {isExistingClientFlow ? (
                    selectedExistingClient ? (
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{selectedExistingClient.clientName}</p>
                          <p className="text-xs text-muted-foreground">
                            {selectedExistingClient.clientCode || `CL-${String(selectedExistingClient.id).padStart(4, '0')}`}
                          </p>
                        </div>
                        <Badge variant="outline">Existing</Badge>
                      </div>
                    ) : (
                      <p className="text-muted-foreground">Select a client from the dropdown above.</p>
                    )
                  ) : (
                    <>
                      {checkingDuplicates && <p className="text-muted-foreground">Checking...</p>}
                      {!checkingDuplicates && duplicateClients.length === 0 && (
                        <p className="text-muted-foreground">No similar clients found.</p>
                      )}
                      {!checkingDuplicates &&
                        duplicateClients.map((dup) => (
                          <div key={dup.id} className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">{dup.clientName}</p>
                              <p className="text-xs text-muted-foreground">
                                {dup.contactEmail || dup.contactPhone || 'No contact info'}
                              </p>
                            </div>
                            <Badge variant="outline">Existing</Badge>
                          </div>
                        ))}
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Engagement Summary</CardTitle>
                  <CardDescription>What HR will see in the queue</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Type</span>
                    <span>{engagementLetter.engagementType || 'Not set'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Job Title</span>
                    <span>{engagementLetter.jobTitle || 'Not set'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Fee</span>
                    <span>
                      {engagementLetter.feeAmount
                        ? `${engagementLetter.currency} ${Number(engagementLetter.feeAmount).toLocaleString()}`
                        : 'Not set'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Dates</span>
                    <span>
                      {engagementLetter.startDate || engagementLetter.endDate
                        ? `${engagementLetter.startDate || 'TBD'} to ${engagementLetter.endDate || 'TBD'}`
                        : 'Not set'}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Client Snapshot</CardTitle>
                  <CardDescription>Quick view of ownership and contact</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Department</span>
                    <span>
                      {formData.departmentId
                        ? departments.find((item) => String(item.id) === formData.departmentId)?.name || 'Selected'
                        : 'Not set'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Partner</span>
                    <span>
                      {formData.partnerProfileId
                        ? (() => {
                            const partner = partners.find(
                              (item) => String(item.id) === formData.partnerProfileId
                            );
                            return partner
                              ? `${partner.firstName} ${partner.lastName}`
                              : 'Selected';
                          })()
                        : 'Not set'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Manager</span>
                    <span>
                      {formData.managerProfileId
                        ? (() => {
                            const manager = availableManagers.find(
                              (item) => String(item.id) === formData.managerProfileId
                            );
                            return manager
                              ? `${manager.firstName} ${manager.lastName}`
                              : 'Selected';
                          })()
                        : 'Not set'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Contact</span>
                    <span>{formData.contactPerson || 'Not set'}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}

export default ClientFormPage;
