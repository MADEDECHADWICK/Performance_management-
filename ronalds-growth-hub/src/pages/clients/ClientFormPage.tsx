/**
 * Client Form Page - Create or Edit Client
 * Includes engagement letter capture for intake
 */
import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clientsAPI, employeesAPI, documentsAPI } from '@/lib/api';
import type { Client } from '@/lib/api/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
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

interface ClientFormData {
  clientName: string;
  clientCode: string;
  industry: string;
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  location: string;
  address: string;
  partnerProfileId: string;
  managerProfileId: string;
  isActive: boolean;
}

interface EngagementLetterFormData {
  documentName: string;
  documentPath: string;
  engagementType: string;
  jobTitle: string;
  feeAmount: string;
  currency: string;
  startDate: string;
  endDate: string;
  scopeDescription: string;
  termsConditions: string;
}

const initialFormData: ClientFormData = {
  clientName: '',
  clientCode: '',
  industry: '',
  contactPerson: '',
  contactEmail: '',
  contactPhone: '',
  location: '',
  address: '',
  partnerProfileId: '',
  managerProfileId: '',
  isActive: true,
};

const initialEngagementLetter: EngagementLetterFormData = {
  documentName: '',
  documentPath: '',
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
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [formData, setFormData] = useState<ClientFormData>(initialFormData);
  const [engagementLetter, setEngagementLetter] = useState<EngagementLetterFormData>(
    initialEngagementLetter
  );
  const [errors, setErrors] = useState<Partial<Record<keyof ClientFormData, string>>>({});

  const { data: client, isLoading: isLoadingClient } = useQuery({
    queryKey: ['client', id],
    queryFn: () => clientsAPI.getById(Number(id)),
    enabled: isEditing,
  });

  const { data: partnersData } = useQuery({
    queryKey: ['employees', 'partners'],
    queryFn: () => employeesAPI.list({ isPartner: true, pageSize: 100 }),
  });

  const { data: managersData } = useQuery({
    queryKey: ['employees', 'managers'],
    queryFn: () => employeesAPI.list({ pageSize: 100 }),
  });

  const partners = partnersData?.data || [];
  const managers = managersData?.data || [];

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
        partnerProfileId: client.partnerProfileId ? String(client.partnerProfileId) : '',
        managerProfileId: client.managerProfileId ? String(client.managerProfileId) : '',
        isActive: client.status === 'active',
      });
    }
  }, [client]);

  const hasEngagementLetter =
    engagementLetter.documentName.trim() &&
    engagementLetter.documentPath.trim() &&
    engagementLetter.engagementType.trim();

  const uploadEngagementLetter = async (clientId: number) => {
    if (!hasEngagementLetter) return;

    const document = await documentsAPI.upload({
      fileName: engagementLetter.documentName.trim(),
      filePath: engagementLetter.documentPath.trim(),
      documentType: 'engagement_letter',
      entityType: 'Client',
      entityId: clientId,
      accessLevel: 'admin',
      description: `Engagement letter for ${formData.clientName}`,
    });

    await clientsAPI.uploadEngagementLetter(clientId, {
      documentId: document.id,
      engagementType: engagementLetter.engagementType,
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
    mutationFn: async (data: Partial<Client>) => {
      const savedClient = isEditing
        ? await clientsAPI.update(Number(id), data)
        : await clientsAPI.create(data);

      if (hasEngagementLetter) {
        await uploadEngagementLetter(savedClient.id);
      }

      return savedClient;
    },
    onSuccess: (savedClient) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['client', String(savedClient.id)] });
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

    if (!formData.clientName.trim()) {
      newErrors.clientName = 'Client name is required';
    }

    if (formData.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.contactEmail)) {
      newErrors.contactEmail = 'Invalid email address';
    }

    if (!formData.partnerProfileId) {
      newErrors.partnerProfileId = 'Partner in charge is required';
    }

    setErrors(newErrors);

    if (!isEditing && !hasEngagementLetter) {
      toast({
        title: 'Engagement Letter Required',
        description: 'Upload engagement letter metadata before creating the client.',
        variant: 'destructive',
      });
      return false;
    }

    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    const clientData: Partial<Client> = {
      clientName: formData.clientName.trim(),
      clientCode: formData.clientCode || undefined,
      industry: formData.industry || undefined,
      contactPerson: formData.contactPerson || undefined,
      contactEmail: formData.contactEmail || undefined,
      contactPhone: formData.contactPhone || undefined,
      location: formData.location || undefined,
      address: formData.address || undefined,
      partnerProfileId: formData.partnerProfileId ? Number(formData.partnerProfileId) : undefined,
      managerProfileId: formData.managerProfileId ? Number(formData.managerProfileId) : undefined,
      status: formData.isActive ? 'active' : 'inactive',
    };

    saveMutation.mutate(clientData);
  };

  const handleChange = (field: keyof ClientFormData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  if (isEditing && isLoadingClient) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Building2 className="h-8 w-8 text-primary" />
            {isEditing ? 'Edit Client' : 'Add New Client'}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isEditing
              ? 'Update client information and engagement details'
              : 'Create a new client profile with engagement details'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>Enter the client's primary details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="clientName">Client Name *</Label>
                <Input
                  id="clientName"
                  value={formData.clientName}
                  onChange={(e) => handleChange('clientName', e.target.value)}
                  placeholder="Enter client name"
                  className={errors.clientName ? 'border-red-500' : ''}
                />
                {errors.clientName && (
                  <p className="text-sm text-red-500">{errors.clientName}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="clientCode">Client Code</Label>
                <Input
                  id="clientCode"
                  value={formData.clientCode}
                  onChange={(e) => handleChange('clientCode', e.target.value)}
                  placeholder="Optional client code"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="industry">Industry</Label>
                <Select
                  value={formData.industry}
                  onValueChange={(value) => handleChange('industry', value)}
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
                />
                <Label htmlFor="isActive">Active Client</Label>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contact Information</CardTitle>
            <CardDescription>Primary contact details for this client</CardDescription>
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
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  value={formData.location}
                  onChange={(e) => handleChange('location', e.target.value)}
                  placeholder="City, Country"
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
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Team Assignment</CardTitle>
            <CardDescription>Assign partner and manager responsible for this client</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                <Label htmlFor="managerProfileId">Manager In Charge</Label>
                <Select
                  value={formData.managerProfileId}
                  onValueChange={(value) => handleChange('managerProfileId', value)}
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
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Engagement Letter
            </CardTitle>
            <CardDescription>
              Capture engagement letter details for client intake
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
                  placeholder="Engagement letter file name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="documentPath">Document URL/Path *</Label>
                <Input
                  id="documentPath"
                  value={engagementLetter.documentPath}
                  onChange={(e) =>
                    setEngagementLetter((prev) => ({ ...prev, documentPath: e.target.value }))
                  }
                  placeholder="https://... or storage path"
                />
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
              <Label htmlFor="termsConditions">Terms & Conditions</Label>
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
                {isEditing ? 'Updating...' : 'Creating...'}
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                {isEditing ? 'Update Client' : 'Create Client'}
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default ClientFormPage;
