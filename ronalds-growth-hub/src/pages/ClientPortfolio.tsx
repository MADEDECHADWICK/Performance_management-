import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { clientOnboardingsAPI, clientsAPI, documentsAPI, jobsAPI, surveysAPI } from "@/lib/api";
import type { Client } from "@/lib/api/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Users, Briefcase, FileText, MapPin, Search, Plus, Download, Upload } from "lucide-react";

const statusVariant = (status?: string) => {
  if (!status) return "outline" as const;
  return status === "active" ? "default" : "secondary";
};

const ENGAGEMENT_TYPES = ["audit", "tax", "advisory", "consulting", "bookkeeping", "other"];

export default function ClientPortfolio() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [letterDialogOpen, setLetterDialogOpen] = useState(false);
  const [isSubmittingLetter, setIsSubmittingLetter] = useState(false);
  const [editForm, setEditForm] = useState<{
    clientName: string;
    industry: string;
    contactPerson: string;
    contactEmail: string;
    contactPhone: string;
    location: string;
    address: string;
    status: "active" | "inactive";
  }>({
    clientName: "",
    industry: "",
    contactPerson: "",
    contactEmail: "",
    contactPhone: "",
    location: "",
    address: "",
    status: "active",
  });
  const [letterForm, setLetterForm] = useState({
    documentName: "",
    documentFile: null as File | null,
    engagementType: "",
    jobTitle: "",
    feeAmount: "",
    currency: "KES",
    startDate: "",
    endDate: "",
  });

  const { data: clientsData, isLoading } = useQuery({
    queryKey: ["client-portfolio", "clients"],
    queryFn: () => clientsAPI.list({ page: 1, pageSize: 200 }),
  });

  const { data: pendingOnboardings } = useQuery({
    queryKey: ["client-portfolio", "pending-onboardings"],
    queryFn: () => clientOnboardingsAPI.list({ page: 1, pageSize: 200, status: "pending_hr_review" }),
  });

  const clients = useMemo(() => clientsData?.data ?? [], [clientsData]);

  useEffect(() => {
    if (!selectedClientId && clients.length > 0) {
      setSelectedClientId(clients[0].id);
    }
  }, [clients, selectedClientId]);

  const filteredClients = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return clients.filter((client: Client) => {
      const matchesStatus = filterStatus === "all" || client.status === filterStatus;
      const matchesSearch =
        !term ||
        client.clientName?.toLowerCase().includes(term) ||
        client.contactPerson?.toLowerCase().includes(term) ||
        client.contactEmail?.toLowerCase().includes(term);
      return matchesStatus && matchesSearch;
    });
  }, [clients, searchTerm, filterStatus]);

  const selectedClient = useMemo(() => {
    return clients.find((client) => client.id === selectedClientId) || null;
  }, [clients, selectedClientId]);

  useEffect(() => {
    if (!selectedClient) return;
    const normalizedStatus =
      selectedClient.status === "inactive" ? "inactive" : "active";
    setEditForm({
      clientName: selectedClient.clientName || "",
      industry: selectedClient.industry || "",
      contactPerson: selectedClient.contactPerson || "",
      contactEmail: selectedClient.contactEmail || "",
      contactPhone: selectedClient.contactPhone || "",
      location: selectedClient.location || "",
      address: selectedClient.address || "",
      status: normalizedStatus,
    });
    setIsEditingDetails(false);
  }, [selectedClientId, selectedClient]);

  const updateClientMutation = useMutation({
    mutationFn: (payload: typeof editForm) => {
      return clientsAPI.update(selectedClientId as number, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-portfolio", "clients"] });
      queryClient.invalidateQueries({ queryKey: ["client-portfolio", "onboarding", selectedClientId] });
      queryClient.invalidateQueries({ queryKey: ["client-portfolio", "jobs", selectedClientId] });
      setIsEditingDetails(false);
    },
  });

  const { data: jobsData } = useQuery({
    queryKey: ["client-portfolio", "jobs", selectedClientId],
    queryFn: () => jobsAPI.list({ page: 1, pageSize: 50, clientId: selectedClientId || undefined }),
    enabled: Boolean(selectedClientId),
  });

  const { data: lettersData } = useQuery({
    queryKey: ["client-portfolio", "engagement-letters", selectedClientId],
    queryFn: () => clientsAPI.getEngagementLetters(selectedClientId as number),
    enabled: Boolean(selectedClientId),
  });

  const { data: onboardingData } = useQuery({
    queryKey: ["client-portfolio", "onboarding", selectedClientId],
    queryFn: () => clientOnboardingsAPI.list({ page: 1, pageSize: 10, clientId: selectedClientId || undefined }),
    enabled: Boolean(selectedClientId),
  });

  const { data: surveyByClientData } = useQuery({
    queryKey: ["client-portfolio", "survey-by-client"],
    queryFn: () => surveysAPI.getByClient(),
  });

  const totalClients = clients.length;
  const activeClients = clients.filter((client) => client.status === "active").length;
  const industriesServed = new Set(clients.map((client) => client.industry).filter(Boolean)).size;
  const pendingEngagements = pendingOnboardings?.data?.length || 0;
  const surveysByClient = useMemo(
    () => (Array.isArray(surveyByClientData) ? surveyByClientData : []),
    [surveyByClientData]
  );
  const isLetterReady =
    Boolean(letterForm.documentFile) &&
    letterForm.documentName.trim().length > 0 &&
    letterForm.engagementType.trim().length > 0;

  const resetLetterForm = () => {
    setLetterForm({
      documentName: "",
      documentFile: null,
      engagementType: "",
      jobTitle: "",
      feeAmount: "",
      currency: "KES",
      startDate: "",
      endDate: "",
    });
  };

  const selectedSurvey = useMemo(() => {
    if (!selectedClientId) return null;
    return surveysByClient.find((item) => item.clientId === selectedClientId) || null;
  }, [selectedClientId, surveysByClient]);

  const formatDate = (value?: string | Date | null) =>
    value ? new Date(value).toLocaleDateString() : "—";

  const handleUploadEngagement = async () => {
    if (!selectedClientId) {
      toast({
        title: "Select a client",
        description: "Choose a client before uploading an engagement letter.",
        variant: "destructive",
      });
      return;
    }

    if (!isLetterReady || !letterForm.documentFile) {
      toast({
        title: "Missing information",
        description: "Document name, file, and engagement type are required.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSubmittingLetter(true);
      const document = await documentsAPI.uploadFile(letterForm.documentFile, {
        fileName: letterForm.documentName.trim(),
        documentType: "engagement_letter",
        entityType: "Client",
        entityId: selectedClientId,
        accessLevel: "admin",
        description: `Engagement letter for ${selectedClient?.clientName || "client"}`,
      });

      await clientsAPI.uploadEngagementLetter(selectedClientId, {
        documentId: document.id,
        engagementType: letterForm.engagementType,
        jobTitle: letterForm.jobTitle || undefined,
        feeAmount: letterForm.feeAmount ? Number(letterForm.feeAmount) : undefined,
        currency: letterForm.currency || undefined,
        startDate: letterForm.startDate || undefined,
        endDate: letterForm.endDate || undefined,
      });

      queryClient.invalidateQueries({ queryKey: ["client-portfolio", "engagement-letters", selectedClientId] });
      queryClient.invalidateQueries({ queryKey: ["client-portfolio", "onboarding", selectedClientId] });
      queryClient.invalidateQueries({ queryKey: ["client-portfolio", "pending-onboardings"] });
      toast({ title: "Engagement letter added", description: "Submitted for HR review." });
      resetLetterForm();
      setLetterDialogOpen(false);
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error?.message || "Unable to add engagement letter.",
        variant: "destructive",
      });
    } finally {
      setIsSubmittingLetter(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-3xl font-bold text-foreground">Client Portfolio</h2>
            <p className="text-muted-foreground">View client records, jobs, and engagement history.</p>
          </div>
          <Button asChild>
            <Link to="/clients/new">
              <Plus className="h-4 w-4 mr-2" />
              Add Client
            </Link>
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Clients</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalClients}</div>
              <p className="text-xs text-muted-foreground">All records</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Clients</CardTitle>
              <Briefcase className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeClients}</div>
              <p className="text-xs text-muted-foreground">Currently active</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Industries Served</CardTitle>
              <MapPin className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{industriesServed}</div>
              <p className="text-xs text-muted-foreground">Distinct industries</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Engagements</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pendingEngagements}</div>
              <p className="text-xs text-muted-foreground">Awaiting HR review</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Clients</CardTitle>
              <CardDescription>Select a client to view details and jobs.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col md:flex-row gap-4 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search clients..."
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {isLoading ? (
                <div className="py-10 text-center text-muted-foreground">Loading clients...</div>
              ) : filteredClients.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground">No clients found.</div>
              ) : (
                <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Industry</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Satisfaction</TableHead>
                    <TableHead>Partner</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                  <TableBody>
                  {filteredClients.map((client) => {
                    const surveySummary =
                      surveysByClient.find((item) => item.clientId === client.id) || null;
                    return (
                      <TableRow
                        key={client.id}
                        className={client.id === selectedClientId ? "bg-muted/40" : undefined}
                        onClick={() => setSelectedClientId(client.id)}
                      >
                        <TableCell>
                          <div className="font-medium">{client.clientName}</div>
                          <div className="text-xs text-muted-foreground">
                            {client.contactPerson || client.contactEmail || "No contact"}
                          </div>
                        </TableCell>
                        <TableCell>{client.industry || "—"}</TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(client.status)}>{client.status}</Badge>
                        </TableCell>
                        <TableCell>
                          {surveySummary ? `${surveySummary.avgSatisfaction.toFixed(1)}/5` : "—"}
                        </TableCell>
                        <TableCell>
                          {client.partner ? `${client.partner.firstName} ${client.partner.lastName}` : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button asChild variant="outline" size="sm">
                              <Link to={`/clients/${client.id}`}>View</Link>
                            </Button>
                            <Button asChild variant="outline" size="sm">
                              <Link to={`/clients/${client.id}/edit`}>Edit</Link>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Client Details</CardTitle>
              <CardDescription>Everything tied to the selected client.</CardDescription>
            </CardHeader>
            <CardContent>
              {!selectedClient ? (
                <div className="py-10 text-center text-muted-foreground">Select a client to view details.</div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-xl font-semibold">{selectedClient.clientName}</h3>
                      <p className="text-sm text-muted-foreground">{selectedClient.industry || "Industry not set"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {!isEditingDetails ? (
                        <Button size="sm" variant="outline" onClick={() => setIsEditingDetails(true)}>
                          Edit
                        </Button>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            onClick={() => updateClientMutation.mutate(editForm)}
                            disabled={updateClientMutation.isPending}
                          >
                            {updateClientMutation.isPending ? "Saving..." : "Save"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                          onClick={() => {
                            setIsEditingDetails(false);
                            setEditForm({
                              clientName: selectedClient.clientName || "",
                              industry: selectedClient.industry || "",
                              contactPerson: selectedClient.contactPerson || "",
                              contactEmail: selectedClient.contactEmail || "",
                              contactPhone: selectedClient.contactPhone || "",
                              location: selectedClient.location || "",
                              address: selectedClient.address || "",
                              status:
                                selectedClient.status === "inactive" ? "inactive" : "active",
                            });
                          }}
                        >
                            Cancel
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {!isEditingDetails ? (
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span>Contact</span>
                        <span className="font-medium">{selectedClient.contactPerson || "—"}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Email</span>
                        <span className="font-medium">{selectedClient.contactEmail || "—"}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Phone</span>
                        <span className="font-medium">{selectedClient.contactPhone || "—"}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Location</span>
                        <span className="font-medium">{selectedClient.location || "—"}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Address</span>
                        <span className="font-medium">{selectedClient.address || "—"}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Status</span>
                        <Badge variant={statusVariant(selectedClient.status)}>{selectedClient.status}</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Client Satisfaction</span>
                        <span className="font-medium">
                          {selectedSurvey ? `${selectedSurvey.avgSatisfaction.toFixed(1)}/5` : "—"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Last Survey</span>
                        <span className="font-medium">
                          {selectedSurvey?.lastSurveyDate ? formatDate(selectedSurvey.lastSurveyDate) : "—"}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Client Name</label>
                        <Input
                          value={editForm.clientName}
                          onChange={(event) =>
                            setEditForm((prev) => ({ ...prev, clientName: event.target.value }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Industry</label>
                        <Input
                          value={editForm.industry}
                          onChange={(event) =>
                            setEditForm((prev) => ({ ...prev, industry: event.target.value }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Contact Person</label>
                        <Input
                          value={editForm.contactPerson}
                          onChange={(event) =>
                            setEditForm((prev) => ({ ...prev, contactPerson: event.target.value }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Email</label>
                        <Input
                          type="email"
                          value={editForm.contactEmail}
                          onChange={(event) =>
                            setEditForm((prev) => ({ ...prev, contactEmail: event.target.value }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Phone</label>
                        <Input
                          value={editForm.contactPhone}
                          onChange={(event) =>
                            setEditForm((prev) => ({ ...prev, contactPhone: event.target.value }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Location</label>
                        <Input
                          value={editForm.location}
                          onChange={(event) =>
                            setEditForm((prev) => ({ ...prev, location: event.target.value }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Address</label>
                        <Input
                          value={editForm.address}
                          onChange={(event) =>
                            setEditForm((prev) => ({ ...prev, address: event.target.value }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Status</label>
                        <Select
                          value={editForm.status}
                          onValueChange={(value) =>
                            setEditForm((prev) => ({
                              ...prev,
                              status: value === "inactive" ? "inactive" : "active",
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="inactive">Inactive</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  <Tabs defaultValue="jobs" className="w-full">
                    <TabsList className="grid grid-cols-3 w-full">
                      <TabsTrigger value="jobs">Jobs</TabsTrigger>
                      <TabsTrigger value="engagements">Engagements</TabsTrigger>
                      <TabsTrigger value="onboarding">Onboarding</TabsTrigger>
                    </TabsList>
                    <TabsContent value="jobs" className="pt-4">
                      <div className="space-y-2">
                        {(jobsData?.data || []).length === 0 ? (
                          <p className="text-sm text-muted-foreground">No jobs for this client yet.</p>
                        ) : (
                          (jobsData?.data || []).map((job) => (
                            <div key={job.id} className="rounded-lg border p-3 space-y-3">
                              <div className="flex items-start justify-between gap-4">
                                <div>
                                  <p className="font-medium">{job.jobName}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {job.status} • {job.billingType === "fixed_fee" ? "Fixed fee" : "Hourly"}
                                  </p>
                                </div>
                                <div className="text-right text-xs text-muted-foreground">
                                  <div>Due: {job.dueDate ? new Date(job.dueDate).toLocaleDateString() : "—"}</div>
                                  <div>Start: {job.startDate ? new Date(job.startDate).toLocaleDateString() : "—"}</div>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-muted-foreground">
                                <div>
                                  Fee:{" "}
                                  <span className="text-foreground font-medium">
                                    {job.billingType === "fixed_fee" && job.fixedFeeAmount
                                      ? `KES ${Number(job.fixedFeeAmount).toLocaleString()}`
                                      : "—"}
                                  </span>
                                </div>
                                <div>
                                  Budget Hours:{" "}
                                  <span className="text-foreground font-medium">
                                    {job.budgetHours ? Number(job.budgetHours).toLocaleString() : "—"}
                                  </span>
                                </div>
                                <div>
                                  Allocated Cost:{" "}
                                  <span className="text-foreground font-medium">
                                    {job.jobCosting?.allocatedCost
                                      ? `KES ${Number(job.jobCosting.allocatedCost).toLocaleString()}`
                                      : "—"}
                                  </span>
                                </div>
                                <div>
                                  Remaining Budget:{" "}
                                  <span className="text-foreground font-medium">
                                    {job.jobCosting?.remainingBudget
                                      ? `KES ${Number(job.jobCosting.remainingBudget).toLocaleString()}`
                                      : "—"}
                                  </span>
                                </div>
                              </div>

                              <div className="space-y-2">
                                <p className="text-xs text-muted-foreground">Assigned Staff</p>
                                {job.staffing && job.staffing.length > 0 ? (
                                  <div className="flex flex-wrap gap-2">
                                    {job.staffing.map((assignment) => (
                                      <Badge key={assignment.id} variant="outline">
                                        {assignment.employee
                                          ? `${assignment.employee.firstName} ${assignment.employee.lastName}`
                                          : `Employee #${assignment.employeeProfileId}`}{" "}
                                        {assignment.role ? `(${assignment.role.name})` : ""}
                                      </Badge>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-xs text-muted-foreground">No staff assigned.</p>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </TabsContent>
                    <TabsContent value="engagements" className="pt-4">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-muted-foreground">Engagement letters for the client.</p>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setLetterDialogOpen(true)}
                          >
                            <Upload className="h-4 w-4 mr-2" />
                            Add Engagement
                          </Button>
                        </div>
                        {(lettersData || []).length === 0 ? (
                          <p className="text-sm text-muted-foreground">No engagement letters yet.</p>
                        ) : (
                          (lettersData || []).map((letter) => (
                            <div
                              key={letter.id}
                              className="flex items-center justify-between text-sm border-b pb-2"
                            >
                              <div>
                                <p className="font-medium">{letter.jobTitle || letter.engagementType}</p>
                                <p className="text-xs text-muted-foreground">{letter.status}</p>
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>
                                  {letter.createdAt ? new Date(letter.createdAt).toLocaleDateString() : "N/A"}
                                </span>
                                {letter.document?.filePath && (
                                  <a href={letter.document.filePath} target="_blank" rel="noopener noreferrer">
                                    <Button variant="ghost" size="icon" title="Download">
                                      <Download className="h-4 w-4" />
                                    </Button>
                                  </a>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </TabsContent>
                    <TabsContent value="onboarding" className="pt-4">
                      <div className="space-y-2 text-sm">
                        {(onboardingData?.data || []).length === 0 ? (
                          <p className="text-muted-foreground">No onboarding record found.</p>
                        ) : (
                          onboardingData?.data?.map((item) => (
                            <div key={item.id} className="flex items-center justify-between border-b pb-2">
                              <div>
                                <p className="font-medium">{item.status}</p>
                                <p className="text-xs text-muted-foreground">{item.notes || "—"}</p>
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "—"}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={letterDialogOpen} onOpenChange={setLetterDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Engagement Letter</DialogTitle>
            <DialogDescription>
              Upload a new engagement letter for the selected client. This will appear in the HR queue.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Document Name *</Label>
                <Input
                  value={letterForm.documentName}
                  onChange={(event) =>
                    setLetterForm((prev) => ({ ...prev, documentName: event.target.value }))
                  }
                  placeholder="Engagement letter title"
                />
              </div>
              <div className="space-y-2">
                <Label>Upload File *</Label>
                <Input
                  type="file"
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    setLetterForm((prev) => ({
                      ...prev,
                      documentFile: file,
                      documentName: prev.documentName || file?.name || "",
                    }));
                  }}
                />
                {letterForm.documentFile && (
                  <p className="text-xs text-muted-foreground">Selected: {letterForm.documentFile.name}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Engagement Type *</Label>
                <Select
                  value={letterForm.engagementType}
                  onValueChange={(value) =>
                    setLetterForm((prev) => ({ ...prev, engagementType: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select engagement type" />
                  </SelectTrigger>
                  <SelectContent>
                    {ENGAGEMENT_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Job Title</Label>
                <Input
                  value={letterForm.jobTitle}
                  onChange={(event) =>
                    setLetterForm((prev) => ({ ...prev, jobTitle: event.target.value }))
                  }
                  placeholder="Optional job title"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Fee Amount</Label>
                <Input
                  type="number"
                  value={letterForm.feeAmount}
                  onChange={(event) =>
                    setLetterForm((prev) => ({ ...prev, feeAmount: event.target.value }))
                  }
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Input
                  value={letterForm.currency}
                  onChange={(event) =>
                    setLetterForm((prev) => ({ ...prev, currency: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={letterForm.startDate}
                  onChange={(event) =>
                    setLetterForm((prev) => ({ ...prev, startDate: event.target.value }))
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={letterForm.endDate}
                  onChange={(event) =>
                    setLetterForm((prev) => ({ ...prev, endDate: event.target.value }))
                  }
                />
              </div>
            </div>
          </div>
          <DialogFooter className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                resetLetterForm();
                setLetterDialogOpen(false);
              }}
              disabled={isSubmittingLetter}
            >
              Cancel
            </Button>
            <Button onClick={handleUploadEngagement} disabled={!isLetterReady || isSubmittingLetter}>
              {isSubmittingLetter ? "Uploading..." : "Submit Engagement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
