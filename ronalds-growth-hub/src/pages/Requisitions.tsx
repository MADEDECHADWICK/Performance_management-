import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import PageLoader from "@/components/ui/page-loader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import clientsAPI from "@/lib/api/clients";
import documentsAPI from "@/lib/api/documents";
import requisitionsAPI, {
  type RequisitionAmountBreakdownItem,
  type RequisitionFieldSchemaItem,
  type RequisitionJobOption,
  type RequisitionRequest,
  type RequisitionStatus,
  type RequisitionType,
} from "@/lib/api/requisitions";

type RequestFormState = {
  requisitionTypeId: string;
  title: string;
  justification: string;
  amount: string;
  amountBreakdown: RequisitionAmountBreakdownItem[];
  currency: string;
  quantity: string;
  neededByDate: string;
  vendorName: string;
  clientId: string;
  jobId: string;
  isClientRecoverable: boolean;
  taxImpactNotes: string;
  moduleData: Record<string, string | boolean>;
};

const initialFormState: RequestFormState = {
  requisitionTypeId: "",
  title: "",
  justification: "",
  amount: "",
  amountBreakdown: [],
  currency: "KES",
  quantity: "",
  neededByDate: "",
  vendorName: "",
  clientId: "",
  jobId: "",
  isClientRecoverable: false,
  taxImpactNotes: "",
  moduleData: {},
};

const extractItems = <T,>(payload: any): T[] => {
  if (Array.isArray(payload)) return payload as T[];
  if (Array.isArray(payload?.data)) return payload.data as T[];
  return [];
};

const formatDate = (value?: string | null) => {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-KE", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
};

const formatAmount = (value: number | string | null | undefined, currency = "KES") => {
  const numericValue = Number(value || 0);
  return `${currency} ${numericValue.toLocaleString("en-KE", {
    minimumFractionDigits: numericValue % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
};

const formatStatus = (status: RequisitionStatus) =>
  status.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());

const formatStage = (value?: string | null) =>
  String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

const formatAccountabilityStatus = (request: RequisitionRequest) => {
  if (!request.releasedAt) return "Awaiting release";
  if (request.accountabilityStatus === "submitted") return "Completed";
  if (request.accountabilityDueAt && new Date(request.accountabilityDueAt).getTime() < Date.now()) {
    return "Overdue";
  }
  return "Pending";
};

const formatModule = (value?: string | null) =>
  String(value || "general")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

const statusVariant = (status: RequisitionStatus) => {
  switch (status) {
    case "approved":
      return "default";
    case "declined":
      return "destructive";
    case "cancelled":
      return "secondary";
    default:
      return "outline";
  }
};

const isPendingStatus = (status: RequisitionStatus) =>
  status === "pending_manager_approval" ||
  status === "pending_partner_approval" ||
  status === "pending_gmp_approval" ||
  status === "pending_finance_approval";

const emptyFieldValueFor = (field: RequisitionFieldSchemaItem) =>
  field.type === "boolean" ? false : "";

const approvalRouteHint = (
  roles: string[],
  selectedType: RequisitionType | null,
  isPartnerProfile: boolean
) => {
  const normalizedRoles = roles.map((role) => String(role || "").toLowerCase());
  const sourceModule = String(selectedType?.sourceModule || "").toLowerCase();

  if (normalizedRoles.includes("super_admin") || normalizedRoles.includes("gmp")) {
    return ["Finance"];
  }
  if (
    sourceModule === "finance" ||
    sourceModule === "marketing" ||
    normalizedRoles.includes("finance") ||
    normalizedRoles.includes("marketing")
  ) {
    return ["GMP", "Finance"];
  }
  if (normalizedRoles.includes("partner") || isPartnerProfile) {
    return ["GMP", "Finance"];
  }
  if (normalizedRoles.includes("manager")) {
    return ["Partner", "Finance"];
  }
  return ["Manager", "Partner", "Finance"];
};

export default function Requisitions() {
  const { toast } = useToast();
  const { roles, profile, hasViewAccess } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requests, setRequests] = useState<RequisitionRequest[]>([]);
  const [types, setTypes] = useState<RequisitionType[]>([]);
  const [clients, setClients] = useState<Array<{ id: number; clientName: string; clientCode?: string | null }>>([]);
  const [jobs, setJobs] = useState<RequisitionJobOption[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [form, setForm] = useState<RequestFormState>(initialFormState);
  const [selectedRequest, setSelectedRequest] = useState<RequisitionRequest | null>(null);
  const [accountabilityNotes, setAccountabilityNotes] = useState("");
  const [accountabilityFiles, setAccountabilityFiles] = useState<File[]>([]);
  const [isSubmittingAccountability, setIsSubmittingAccountability] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [typeRows, requestRows, clientResult, jobResult] = await Promise.all([
        requisitionsAPI.listTypes(),
        requisitionsAPI.listRequests({ page: 1, pageSize: 12 }),
        clientsAPI.list({ page: 1, pageSize: 200 }).catch(() => null),
        requisitionsAPI.listAvailableJobs().catch(() => null),
      ]);
      setTypes(typeRows.filter((item) => item.isActive));
      setRequests(requestRows.data || []);
      setClients(clientResult ? extractItems(clientResult) : []);
      setJobs(jobResult ? extractItems(jobResult) : []);
    } catch (error: any) {
      toast({
        title: "Requisitions unavailable",
        description: error?.message || "Failed to load requisition workspace.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    resetAccountabilityState();
  }, [selectedRequest?.id]);

  const selectedType = useMemo(
    () => types.find((item) => item.id === Number(form.requisitionTypeId)) || null,
    [form.requisitionTypeId, types]
  );

  const pendingRequests = requests.filter((request) => isPendingStatus(request.status));
  const approvedRequests = requests.filter((request) => request.status === "approved");
  const breakdownTotal = useMemo(
    () => form.amountBreakdown.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    [form.amountBreakdown]
  );

  const filteredJobs = useMemo(() => {
    if (!form.clientId) return jobs;
    return jobs.filter((job) => Number(job.clientId || 0) === Number(form.clientId));
  }, [form.clientId, jobs]);

  const routePreview = useMemo(
    () => approvalRouteHint(roles, selectedType, Boolean(profile?.isPartner)),
    [profile?.isPartner, roles, selectedType]
  );

  const handleFormChange = (field: keyof RequestFormState, value: string | boolean) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleClientChange = (value: string) => {
    setForm((current) => ({
      ...current,
      clientId: value,
      jobId:
        value && current.jobId
          ? jobs.some(
              (job) =>
                Number(job.id) === Number(current.jobId) &&
                Number(job.clientId || 0) === Number(value || 0)
            )
            ? current.jobId
            : ""
          : current.jobId,
    }));
  };

  const handleJobChange = (value: string) => {
    const selectedJob = jobs.find((job) => Number(job.id) === Number(value)) || null;
    setForm((current) => ({
      ...current,
      jobId: value,
      clientId: selectedJob?.clientId ? String(selectedJob.clientId) : current.clientId,
    }));
  };

  const handleModuleFieldChange = (field: RequisitionFieldSchemaItem, value: string | boolean) => {
    setForm((current) => ({
      ...current,
      moduleData: {
        ...current.moduleData,
        [field.key]: value,
      },
    }));
  };

  const resetForm = () => {
    setForm(initialFormState);
    setSelectedFiles([]);
  };

  const resetAccountabilityState = () => {
    setAccountabilityNotes("");
    setAccountabilityFiles([]);
  };

  const handleTypeChange = (value: string) => {
    const nextType = types.find((item) => item.id === Number(value)) || null;
    const nextModuleData: Record<string, string | boolean> = {};
    (nextType?.fieldSchema || []).forEach((field) => {
      nextModuleData[field.key] = emptyFieldValueFor(field);
    });
    setForm((current) => ({
      ...initialFormState,
      currency: current.currency || "KES",
      requisitionTypeId: value,
      moduleData: nextModuleData,
    }));
    setSelectedFiles([]);
  };

  const handleBreakdownChange = (
    index: number,
    field: keyof RequisitionAmountBreakdownItem,
    value: string
  ) => {
    setForm((current) => ({
      ...current,
      amountBreakdown: current.amountBreakdown.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              [field]: field === "amount" ? Number(value || 0) : value,
            }
          : item
      ),
    }));
  };

  const addBreakdownItem = () => {
    setForm((current) => ({
      ...current,
      amountBreakdown: [...current.amountBreakdown, { label: "", amount: 0, notes: "" }],
    }));
  };

  const removeBreakdownItem = (index: number) => {
    setForm((current) => ({
      ...current,
      amountBreakdown: current.amountBreakdown.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const renderDynamicField = (field: RequisitionFieldSchemaItem) => {
    const value = form.moduleData[field.key];
    if (field.type === "textarea") {
      return (
        <Textarea
          value={String(value ?? "")}
          onChange={(event) => handleModuleFieldChange(field, event.target.value)}
          placeholder={field.placeholder || field.label}
        />
      );
    }
    if (field.type === "select") {
      return (
        <select
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={String(value ?? "")}
          onChange={(event) => handleModuleFieldChange(field, event.target.value)}
        >
          <option value="">Select {field.label.toLowerCase()}</option>
          {(field.options || []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }
    if (field.type === "boolean") {
      return (
        <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(event) => handleModuleFieldChange(field, event.target.checked)}
          />
          <span>{field.label}</span>
        </label>
      );
    }
    return (
      <Input
        type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
        value={String(value ?? "")}
        onChange={(event) => handleModuleFieldChange(field, event.target.value)}
        placeholder={field.placeholder || field.label}
      />
    );
  };

  const handleSubmit = async () => {
    if (!selectedType) {
      toast({
        title: "Requisition type required",
        description: "Select the requisition type before submitting.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const attachmentDocumentIds: number[] = [];
      for (const file of selectedFiles) {
        const document = await documentsAPI.uploadFile(file, {
          documentType: "requisition_supporting_document",
          entityType: "RequisitionRequest",
          accessLevel: "employee",
          description: "Requisition supporting document",
          isRequired: selectedType.requiresAttachment,
        });
        attachmentDocumentIds.push(Number(document.id));
      }

      const normalizedModuleData = Object.entries(form.moduleData).reduce<Record<string, unknown>>(
        (acc, [key, value]) => {
          if (value === "" || value === null || value === undefined) return acc;
          acc[key] = value;
          return acc;
        },
        {}
      );

      await requisitionsAPI.createRequest({
        requisitionTypeId: Number(form.requisitionTypeId),
        title: form.title,
        justification: form.justification || undefined,
        amount: form.amountBreakdown.length ? breakdownTotal : Number(form.amount),
        amountBreakdown: form.amountBreakdown.length ? form.amountBreakdown : null,
        currency: form.currency || "KES",
        quantity: form.quantity ? Number(form.quantity) : null,
        neededByDate: form.neededByDate || null,
        vendorName: form.vendorName || undefined,
        clientId: form.clientId ? Number(form.clientId) : null,
        jobId: form.jobId ? Number(form.jobId) : null,
        isClientRecoverable: form.isClientRecoverable,
        taxImpactNotes: form.taxImpactNotes || undefined,
        moduleData: normalizedModuleData,
        attachmentDocumentIds,
      });

      toast({
        title: "Requisition submitted",
        description: "The requisition entered the approval trail successfully.",
      });
      resetForm();
      setActiveTab("history");
      await loadData();
    } catch (error: any) {
      toast({
        title: "Submission failed",
        description: error?.message || "Unable to submit the requisition.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = async (request: RequisitionRequest) => {
    const reason = window.prompt(`Cancel requisition ${request.requisitionNumber}? Optional reason:`, "") || "";
    try {
      await requisitionsAPI.cancelRequest(request.id, reason || undefined);
      toast({
        title: "Requisition cancelled",
        description: "The requisition was withdrawn successfully.",
      });
      if (selectedRequest?.id === request.id) {
        setSelectedRequest(null);
      }
      await loadData();
    } catch (error: any) {
      toast({
        title: "Cancellation failed",
        description: error?.message || "Unable to cancel this requisition.",
        variant: "destructive",
      });
    }
  };

  const handleSubmitAccountability = async () => {
    if (!selectedRequest) return;
    try {
      setIsSubmittingAccountability(true);
      const attachmentDocumentIds: number[] = [];
      for (const file of accountabilityFiles) {
        const document = await documentsAPI.uploadFile(file, {
          documentType: "requisition_accountability_document",
          entityType: "RequisitionRequest",
          accessLevel: "employee",
          description: "Requisition accountability document",
          isRequired: false,
        });
        attachmentDocumentIds.push(Number(document.id));
      }

      const updated = await requisitionsAPI.submitAccountability(selectedRequest.id, {
        notes: accountabilityNotes || undefined,
        attachmentDocumentIds,
      });

      toast({
        title: "Accountability submitted",
        description: `${updated.requisitionNumber} accountability was sent to finance.`,
      });
      setSelectedRequest(updated);
      resetAccountabilityState();
      await loadData();
    } catch (error: any) {
      toast({
        title: "Accountability failed",
        description: error?.message || "Unable to submit accountability for this requisition.",
        variant: "destructive",
      });
    } finally {
      setIsSubmittingAccountability(false);
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <PageLoader message="Loading requisition workspace..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Requisitions</h1>
            <p className="text-muted-foreground">
              Raise internal spend requests, attach support, and follow the approval trail.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {hasViewAccess("requisitions.approvals") ? (
              <Button variant="outline" asChild>
                <a href="/requisitions/approvals">Approval Desk</a>
              </Button>
            ) : null}
            {hasViewAccess("requisitions.admin") ? (
              <Button variant="outline" asChild>
                <a href="/requisitions/admin">Admin</a>
              </Button>
            ) : null}
            <Button onClick={() => setActiveTab("request")}>New requisition</Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Submitted</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{requests.length}</div>
              <p className="text-sm text-muted-foreground">Your latest requisition volume.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{pendingRequests.length}</div>
              <p className="text-sm text-muted-foreground">Still in manager, partner, GMP, or finance review.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Approved</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{approvedRequests.length}</div>
              <p className="text-sm text-muted-foreground">Fully approved requisitions.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Available types</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{types.length}</div>
              <p className="text-sm text-muted-foreground">Configured request categories.</p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid h-auto w-full grid-cols-1 gap-1 sm:grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="request">New Request</TabsTrigger>
            <TabsTrigger value="history">My Requests</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
              <Card>
                <CardHeader>
                  <CardTitle>Approval trail</CardTitle>
                  <CardDescription>How requisitions move through the firm.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-lg border p-4">
                    <div className="text-sm font-medium">Standard requester route</div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <Badge variant="outline">Employee</Badge>
                      <span>-&gt;</span>
                      <Badge variant="outline">Manager</Badge>
                      <span>-&gt;</span>
                      <Badge variant="outline">Partner</Badge>
                      <span>-&gt;</span>
                      <Badge variant="outline">Finance</Badge>
                    </div>
                  </div>
                  <div className="rounded-lg border p-4">
                    <div className="text-sm font-medium">Finance and marketing route</div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <Badge variant="outline">Requester</Badge>
                      <span>-&gt;</span>
                      <Badge variant="outline">GMP</Badge>
                      <span>-&gt;</span>
                      <Badge variant="outline">Finance</Badge>
                    </div>
                  </div>
                  <div className="rounded-lg border p-4">
                    <div className="text-sm font-medium">Current form preview</div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {routePreview.map((step, index) => (
                        <div key={`${step}-${index}`} className="flex items-center gap-2 text-sm">
                          <Badge variant="secondary">{step}</Badge>
                          {index < routePreview.length - 1 ? <span>-&gt;</span> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Recent requisitions</CardTitle>
                  <CardDescription>Latest requests and where they stand.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {requests.length ? (
                    requests.slice(0, 5).map((request) => (
                      <button
                        key={request.id}
                        type="button"
                        onClick={() => setSelectedRequest(request)}
                        className="w-full rounded-lg border p-4 text-left transition hover:border-primary/40"
                      >
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                          <div>
                            <div className="font-medium">{request.title}</div>
                            <div className="text-sm text-muted-foreground">
                              {request.requisitionNumber} | {request.requisitionType?.name || "Requisition"} |{" "}
                              {formatAmount(request.amount, request.currency)}
                            </div>
                          </div>
                          <Badge variant={statusVariant(request.status)}>{formatStatus(request.status)}</Badge>
                        </div>
                      </button>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No requisitions submitted yet. Start with a new request.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="request" className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
              <Card>
                <CardHeader>
                  <CardTitle>New requisition</CardTitle>
                  <CardDescription>
                    Only the fields required for the selected requisition type are shown.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Requisition type</label>
                      <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={form.requisitionTypeId}
                        onChange={(event) => handleTypeChange(event.target.value)}
                      >
                        <option value="">Select requisition type</option>
                        {types.map((type) => (
                          <option key={type.id} value={type.id}>
                            {type.name} ({formatModule(type.sourceModule)})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Title</label>
                      <Input
                        value={form.title}
                        onChange={(event) => handleFormChange("title", event.target.value)}
                        placeholder="Short title for the requisition"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Amount</label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.amount}
                        onChange={(event) => handleFormChange("amount", event.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Currency</label>
                      <Input
                        value={form.currency}
                        onChange={(event) => handleFormChange("currency", event.target.value.toUpperCase())}
                        placeholder="KES"
                      />
                    </div>
                  </div>

                  <div className="space-y-3 rounded-lg border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium">Amount breakdown</div>
                        <p className="text-xs text-muted-foreground">
                          Break down the requested amount into line items. If provided, the total is used as the requisition amount.
                        </p>
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={addBreakdownItem}>
                        Add line
                      </Button>
                    </div>

                    {form.amountBreakdown.length ? (
                      <div className="space-y-3">
                        {form.amountBreakdown.map((item, index) => (
                          <div key={`breakdown-${index}`} className="grid gap-3 md:grid-cols-[1.3fr_0.8fr_1fr_auto]">
                            <Input
                              value={item.label}
                              onChange={(event) => handleBreakdownChange(index, "label", event.target.value)}
                              placeholder="Item label"
                            />
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={String(item.amount || "")}
                              onChange={(event) => handleBreakdownChange(index, "amount", event.target.value)}
                              placeholder="0.00"
                            />
                            <Input
                              value={item.notes || ""}
                              onChange={(event) => handleBreakdownChange(index, "notes", event.target.value)}
                              placeholder="Optional note"
                            />
                            <Button type="button" variant="ghost" size="sm" onClick={() => removeBreakdownItem(index)}>
                              Remove
                            </Button>
                          </div>
                        ))}
                        <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-sm">
                          <span>Total from breakdown</span>
                          <span className="font-medium">{formatAmount(breakdownTotal, form.currency || "KES")}</span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No line items added yet. Use this when finance needs a clear spend breakdown.
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Business justification</label>
                    <Textarea
                      value={form.justification}
                      onChange={(event) => handleFormChange("justification", event.target.value)}
                      placeholder="Why the firm should approve this spend"
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Quantity</label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.quantity}
                        onChange={(event) => handleFormChange("quantity", event.target.value)}
                        placeholder="Optional"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Needed by</label>
                      <Input
                        type="date"
                        value={form.neededByDate}
                        onChange={(event) => handleFormChange("neededByDate", event.target.value)}
                      />
                    </div>
                  </div>

                  {selectedType?.requiresVendor ? (
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Vendor / Payee</label>
                      <Input
                        value={form.vendorName}
                        onChange={(event) => handleFormChange("vendorName", event.target.value)}
                        placeholder="Vendor or payee name"
                      />
                    </div>
                  ) : null}

                  {(selectedType?.requiresClient || selectedType?.requiresJob) && clients.length ? (
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Client</label>
                      <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={form.clientId}
                        onChange={(event) => handleClientChange(event.target.value)}
                      >
                        <option value="">Select client</option>
                        {clients.map((client) => (
                          <option key={client.id} value={client.id}>
                            {client.clientName}
                            {client.clientCode ? ` (${client.clientCode})` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  {selectedType?.requiresJob ? (
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Job / Engagement</label>
                      <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={form.jobId}
                        onChange={(event) => handleJobChange(event.target.value)}
                      >
                        <option value="">Select job</option>
                        {filteredJobs.map((job) => (
                          <option key={job.id} value={job.id}>
                            {job.jobCode ? `${job.jobCode} · ${job.jobName}` : job.jobName}
                          </option>
                        ))}
                      </select>
                      {!filteredJobs.length ? (
                        <p className="text-xs text-muted-foreground">
                          No active jobs are currently assigned to you for requisition charging.
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Tax or finance notes</label>
                    <Textarea
                      value={form.taxImpactNotes}
                      onChange={(event) => handleFormChange("taxImpactNotes", event.target.value)}
                      placeholder="VAT, withholding, recoverable disbursement, or ledger notes"
                    />
                  </div>

                  <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.isClientRecoverable}
                      onChange={(event) => handleFormChange("isClientRecoverable", event.target.checked)}
                    />
                    <span>Charge this back to the client where applicable</span>
                  </label>

                  {(selectedType?.fieldSchema || []).length ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      {selectedType?.fieldSchema?.map((field) => (
                        <div
                          key={field.key}
                          className={field.type === "textarea" ? "space-y-2 md:col-span-2" : "space-y-2"}
                        >
                          <label className="text-sm font-medium">
                            {field.label}
                            {field.required ? " *" : ""}
                          </label>
                          {renderDynamicField(field)}
                          {field.helpText ? (
                            <p className="text-xs text-muted-foreground">{field.helpText}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Attachments
                      {selectedType?.requiresAttachment ? " *" : ""}
                    </label>
                    <Input
                      type="file"
                      multiple
                      onChange={(event) => setSelectedFiles(Array.from(event.target.files || []))}
                    />
                    {selectedFiles.length ? (
                      <div className="text-sm text-muted-foreground">
                        {selectedFiles.map((file) => file.name).join(", ")}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <Button onClick={() => void handleSubmit()} disabled={isSubmitting}>
                      {isSubmitting ? "Submitting..." : "Submit requisition"}
                    </Button>
                    <Button variant="outline" onClick={resetForm} disabled={isSubmitting}>
                      Clear form
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Selected type rules</CardTitle>
                    <CardDescription>What this requisition requires before it can move.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {selectedType ? (
                      <>
                        <div className="rounded-lg border p-3">
                          <div className="font-medium">{selectedType.name}</div>
                          <div className="text-sm text-muted-foreground">{selectedType.description}</div>
                        </div>
                        <div className="grid gap-2 text-sm">
                          <div className="flex items-center justify-between rounded-lg border p-3">
                            <span>Source module</span>
                            <Badge variant="outline">{formatModule(selectedType.sourceModule)}</Badge>
                          </div>
                          <div className="flex items-center justify-between rounded-lg border p-3">
                            <span>Approval route</span>
                            <span className="text-muted-foreground">{routePreview.join(" -> ")}</span>
                          </div>
                          <div className="flex items-center justify-between rounded-lg border p-3">
                            <span>Job required</span>
                            <Badge variant={selectedType.requiresJob ? "default" : "secondary"}>
                              {selectedType.requiresJob ? "Yes" : "No"}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between rounded-lg border p-3">
                            <span>Vendor required</span>
                            <Badge variant={selectedType.requiresVendor ? "default" : "secondary"}>
                              {selectedType.requiresVendor ? "Yes" : "No"}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between rounded-lg border p-3">
                            <span>Attachment required</span>
                            <Badge variant={selectedType.requiresAttachment ? "default" : "secondary"}>
                              {selectedType.requiresAttachment ? "Yes" : "No"}
                            </Badge>
                          </div>
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Select a requisition type to preview its required fields and route.
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Active items in flight</CardTitle>
                    <CardDescription>Requests still awaiting a decision.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {pendingRequests.length ? (
                      pendingRequests.map((request) => (
                        <button
                          key={request.id}
                          type="button"
                          onClick={() => setSelectedRequest(request)}
                          className="w-full rounded-lg border p-3 text-left transition hover:border-primary/40"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">{request.title}</span>
                            <Badge variant={statusVariant(request.status)}>{formatStatus(request.status)}</Badge>
                          </div>
                          <div className="mt-1 text-sm text-muted-foreground">
                            {request.currentApprover
                              ? `Waiting on ${request.currentApprover.firstName} ${request.currentApprover.lastName}`
                              : "Awaiting next action"}
                          </div>
                        </button>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">No active requisitions in the approval queue.</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="history" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>My requisition history</CardTitle>
                <CardDescription>Track status, decisions, and supporting documents.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Requisition</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requests.length ? (
                      requests.map((request) => (
                        <TableRow key={request.id}>
                          <TableCell>
                            <div className="font-medium">{request.title}</div>
                            <div className="text-xs text-muted-foreground">{request.requisitionNumber}</div>
                          </TableCell>
                          <TableCell>{request.requisitionType?.name || "Requisition"}</TableCell>
                          <TableCell>{formatAmount(request.amount, request.currency)}</TableCell>
                          <TableCell>
                            <Badge variant={statusVariant(request.status)}>{formatStatus(request.status)}</Badge>
                          </TableCell>
                          <TableCell>{formatDate(request.submittedAt)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="outline" onClick={() => setSelectedRequest(request)}>
                                View
                              </Button>
                              {isPendingStatus(request.status) ? (
                                <Button size="sm" variant="outline" onClick={() => void handleCancel(request)}>
                                  Cancel
                                </Button>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">
                          No requisitions submitted yet.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={Boolean(selectedRequest)} onOpenChange={(open) => (!open ? setSelectedRequest(null) : null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{selectedRequest?.title}</DialogTitle>
            <DialogDescription>
              {selectedRequest?.requisitionNumber} | {selectedRequest?.requisitionType?.name || "Requisition"}
            </DialogDescription>
          </DialogHeader>

          {selectedRequest ? (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border p-4">
                  <div className="text-sm font-medium">Amount</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {formatAmount(selectedRequest.amount, selectedRequest.currency)}
                  </div>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="text-sm font-medium">Status</div>
                  <div className="mt-1">
                    <Badge variant={statusVariant(selectedRequest.status)}>
                      {formatStatus(selectedRequest.status)}
                    </Badge>
                  </div>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="text-sm font-medium">Due date</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {formatDate(selectedRequest.neededByDate)}
                  </div>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="text-sm font-medium">Vendor / Payee</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {selectedRequest.vendorName || "Not specified"}
                  </div>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="text-sm font-medium">Funds released</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {selectedRequest.releasedAt ? formatDate(selectedRequest.releasedAt) : "Awaiting finance release"}
                  </div>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="text-sm font-medium">Accountability</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {formatAccountabilityStatus(selectedRequest)}
                    {selectedRequest.accountabilityDueAt
                      ? ` • Due ${formatDate(selectedRequest.accountabilityDueAt)}`
                      : ""}
                  </div>
                </div>
              </div>

              <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                <div className="space-y-4">
                  <div className="rounded-lg border p-4">
                    <div className="text-sm font-medium">Justification</div>
                    <div className="mt-2 text-sm text-muted-foreground">
                      {selectedRequest.justification || "No justification provided."}
                    </div>
                  </div>

                  {selectedRequest.taxImpactNotes ? (
                    <div className="rounded-lg border p-4">
                      <div className="text-sm font-medium">Tax / finance notes</div>
                      <div className="mt-2 text-sm text-muted-foreground">{selectedRequest.taxImpactNotes}</div>
                    </div>
                  ) : null}

                  {selectedRequest.amountBreakdown?.length ? (
                    <div className="rounded-lg border p-4">
                      <div className="text-sm font-medium">Amount breakdown</div>
                      <div className="mt-3 space-y-2">
                        {selectedRequest.amountBreakdown.map((item, index) => (
                          <div key={`${item.label}-${index}`} className="rounded-md border p-3 text-sm">
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-medium">{item.label}</span>
                              <span>{formatAmount(item.amount, selectedRequest.currency)}</span>
                            </div>
                            {item.notes ? (
                              <div className="mt-1 text-muted-foreground">{item.notes}</div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {selectedRequest.moduleData && Object.keys(selectedRequest.moduleData).length ? (
                    <div className="rounded-lg border p-4">
                      <div className="text-sm font-medium">Module-specific details</div>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        {Object.entries(selectedRequest.moduleData).map(([key, value]) => (
                          <div key={key} className="rounded-md border p-3">
                            <div className="text-xs uppercase tracking-wide text-muted-foreground">
                              {formatStage(key)}
                            </div>
                            <div className="mt-1 text-sm">
                              {typeof value === "boolean" ? (value ? "Yes" : "No") : String(value)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="space-y-4">
                  <div className="rounded-lg border p-4">
                    <div className="text-sm font-medium">Approval steps</div>
                    <div className="mt-3 space-y-3">
                      {(selectedRequest.approvalSteps || []).length ? (
                        selectedRequest.approvalSteps?.map((step) => (
                          <div key={step.id} className="rounded-md border p-3 text-sm">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium">{formatStage(step.stageType)}</span>
                              <Badge variant="outline">{formatStage(step.decision)}</Badge>
                            </div>
                            <div className="mt-1 text-muted-foreground">
                              {step.approver
                                ? `${step.approver.firstName} ${step.approver.lastName}`
                                : `Profile #${step.approverProfileId}`}
                            </div>
                            {step.notes ? <div className="mt-2 text-muted-foreground">{step.notes}</div> : null}
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">No approval steps captured.</p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg border p-4">
                    <div className="text-sm font-medium">Attachments</div>
                    <div className="mt-3 space-y-2">
                      {selectedRequest.attachments?.length ? (
                        selectedRequest.attachments.map((attachment) => (
                          <div key={attachment.id} className="rounded-md border p-3 text-sm">
                            <div className="font-medium">{attachment.fileName}</div>
                            <div className="text-muted-foreground">{formatDate(attachment.createdAt)}</div>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          {selectedRequest.attachmentCount || 0} attachment(s) on record.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg border p-4">
                    <div className="text-sm font-medium">Release & accountability trail</div>
                    <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                      <div>
                        Released by:{" "}
                        {selectedRequest.releasedBy
                          ? `${selectedRequest.releasedBy.firstName} ${selectedRequest.releasedBy.lastName}`
                          : "Not recorded"}
                      </div>
                      <div>Release notes: {selectedRequest.releaseNotes || "None"}</div>
                      <div>
                        Accountability submitted by:{" "}
                        {selectedRequest.accountabilitySubmittedBy
                          ? `${selectedRequest.accountabilitySubmittedBy.firstName} ${selectedRequest.accountabilitySubmittedBy.lastName}`
                          : "Not yet submitted"}
                      </div>
                      <div>Accountability notes: {selectedRequest.accountabilityNotes || "None"}</div>
                    </div>
                  </div>
                </div>
              </div>

              {selectedRequest.releasedAt && selectedRequest.accountabilityStatus === "pending" ? (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                  <div className="text-sm font-medium">Submit accountability</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Finance released these funds on {formatDate(selectedRequest.releasedAt)}. Submit your accountability before{" "}
                    {formatDate(selectedRequest.accountabilityDueAt)}.
                  </p>
                  <div className="mt-4 space-y-3">
                    <Textarea
                      value={accountabilityNotes}
                      onChange={(event) => setAccountabilityNotes(event.target.value)}
                      placeholder="Summarize how the funds were used and any key accountability notes"
                    />
                    <Input
                      type="file"
                      multiple
                      onChange={(event) => setAccountabilityFiles(Array.from(event.target.files || []))}
                    />
                    {accountabilityFiles.length ? (
                      <div className="text-sm text-muted-foreground">
                        {accountabilityFiles.map((file) => file.name).join(", ")}
                      </div>
                    ) : null}
                    <div className="flex justify-end">
                      <Button onClick={() => void handleSubmitAccountability()} disabled={isSubmittingAccountability}>
                        {isSubmittingAccountability ? "Submitting..." : "Submit accountability"}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}

              {selectedRequest.declineReason ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
                  <div className="font-medium text-destructive">Decline reason</div>
                  <div className="mt-1 text-muted-foreground">{selectedRequest.declineReason}</div>
                </div>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
