import { useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { proposalsAPI } from "@/lib/api";
import type {
  CreateProposalPayload,
  Proposal,
  ProposalStatus,
  UpdateProposalPayload,
} from "@/lib/api/proposals";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Check, ExternalLink, Plus, Search, Send, X } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  submitted_to_manager: "Manager review",
  manager_changes_requested: "Changes requested",
  manager_rejected: "Rejected",
  manager_approved: "Manager approved",
  assigned_to_bd: "With BD",
  bd_in_progress: "BD editing",
  bd_changes_requested: "BD changes",
  ready_for_client_submission: "Ready",
  submitted_to_client: "Submitted",
  won: "Won",
  lost: "Lost",
  cancelled: "Cancelled",
};

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "secondary",
  submitted_to_manager: "outline",
  manager_changes_requested: "outline",
  manager_rejected: "destructive",
  manager_approved: "default",
  assigned_to_bd: "default",
  bd_in_progress: "outline",
  ready_for_client_submission: "default",
  submitted_to_client: "secondary",
  won: "default",
  lost: "destructive",
  cancelled: "destructive",
};

const PROPOSAL_TYPES = ["proposal", "tender", "eoi", "quotation", "prequalification"];

type ProposalFormState = {
  clientId: string;
  clientName: string;
  proposalTitle: string;
  proposalType: string;
  requestedService: string;
  proposedFee: string;
  currency: string;
  sourceName: string;
  departmentId: string;
  assignedPartnerProfileId: string;
  managerProfileId: string;
  deadlineDate: string;
  employeeDraftLink: string;
  notes: string;
};

const emptyForm: ProposalFormState = {
  clientId: "",
  clientName: "",
  proposalTitle: "",
  proposalType: "proposal",
  requestedService: "",
  proposedFee: "",
  currency: "KES",
  sourceName: "",
  departmentId: "",
  assignedPartnerProfileId: "",
  managerProfileId: "",
  deadlineDate: "",
  employeeDraftLink: "",
  notes: "",
};

const getName = (person?: { firstName?: string; lastName?: string } | null) =>
  person ? `${person.firstName || ""} ${person.lastName || ""}`.trim() : "";

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

const unwrapProposal = (payload: Proposal | { data?: Proposal }) =>
  "id" in payload ? payload : payload.data;

export default function BusinessDevelopment() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isAdmin, isHR, isGMP, isManager, isPartner, isMarketing } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTeamIds, setSelectedTeamIds] = useState<number[]>([]);
  const [teamMemberSearch, setTeamMemberSearch] = useState("");
  const [bdDrafts, setBdDrafts] = useState<Record<number, Partial<UpdateProposalPayload>>>({});
  const [form, setForm] = useState<ProposalFormState>(emptyForm);

  const canManagerReview = isAdmin || isHR || isGMP || isManager || isPartner;
  const canBdFinalize = isAdmin || isHR || isGMP || isMarketing;

  const { data: metrics } = useQuery({
    queryKey: ["proposal-metrics"],
    queryFn: () => proposalsAPI.metrics(),
  });

  const { data: context } = useQuery({
    queryKey: ["proposal-context"],
    queryFn: () => proposalsAPI.context(),
  });

  const { data: proposalsData, isLoading } = useQuery({
    queryKey: ["proposals", searchTerm, filterStatus],
    queryFn: () =>
      proposalsAPI.list({
        page: 1,
        pageSize: 100,
        search: searchTerm || undefined,
        status: filterStatus === "all" ? undefined : filterStatus,
      }),
  });

  const proposals = useMemo(() => proposalsData?.data || [], [proposalsData]);
  const profiles = context?.profiles || [];
  const departments = context?.departments || [];
  const clients = context?.clients || [];
  const selectedDepartmentId = form.departmentId ? Number(form.departmentId) : null;
  const selectedDepartment = departments.find((department) => department.id === selectedDepartmentId);

  const profileHasRole = (profile: typeof profiles[number], roles: string[]) => {
    const roleSet = new Set(
      (profile.user?.roles || []).map((entry) => String(entry.role.name || "").toLowerCase())
    );
    return roles.some((role) => roleSet.has(role));
  };
  const isDepartmentProfile = (profile: typeof profiles[number]) =>
    !selectedDepartmentId || profile.departmentId === selectedDepartmentId;
  const managerOptions = profiles.filter((profile) => {
    const isManager = profileHasRole(profile, ["manager"]) || profile.id === selectedDepartment?.departmentHeadId;
    return isManager && isDepartmentProfile(profile);
  });
  const partnerOptions = profiles.filter((profile) => {
    const isPartner = !!profile.isPartner || profileHasRole(profile, ["partner"]);
    const ownsSelectedDepartment = selectedDepartment?.partnerProfileId === profile.id;
    return isPartner && (!selectedDepartmentId || profile.departmentId === selectedDepartmentId || ownsSelectedDepartment);
  });
  const visibleTeamMembers = useMemo(() => {
    const query = teamMemberSearch.trim().toLowerCase();
    return profiles.filter((profile) => {
      if (!query) return true;
      const haystack = `${getName(profile)} ${profile.positionTitle || ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [profiles, teamMemberSearch]);
  const handleDepartmentChange = (departmentId: string) => {
    setForm((prev) => ({
      ...prev,
      departmentId,
      assignedPartnerProfileId: "",
      managerProfileId: "",
    }));
  };
  const requiresManagerReviewRouting = !canBdFinalize;
  const canSubmitProposal =
    !!form.proposalTitle.trim() &&
    !!form.requestedService.trim() &&
    (!!form.clientId || !!form.clientName.trim()) &&
    (!requiresManagerReviewRouting ||
      (!!form.departmentId && !!form.assignedPartnerProfileId && !!form.managerProfileId));

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload: CreateProposalPayload = {
        clientId: form.clientId ? Number(form.clientId) : null,
        clientName: form.clientId ? undefined : form.clientName,
        proposalTitle: form.proposalTitle,
        proposalType: form.proposalType,
        requestedService: form.requestedService,
        serviceType: form.requestedService,
        proposedFee: Number(form.proposedFee || 0),
        currency: form.currency,
        sourceName: form.sourceName,
        departmentId: form.departmentId ? Number(form.departmentId) : null,
        assignedPartnerProfileId: form.assignedPartnerProfileId ? Number(form.assignedPartnerProfileId) : null,
        managerProfileId: form.managerProfileId ? Number(form.managerProfileId) : null,
        deadlineDate: form.deadlineDate || undefined,
        employeeDraftLink: canBdFinalize ? form.employeeDraftLink || undefined : undefined,
        notes: form.notes || undefined,
        teamMemberProfileIds: selectedTeamIds,
        submitToManager: true,
      };
      const created = await proposalsAPI.create(payload);
      return unwrapProposal(created);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["proposals"] });
      queryClient.invalidateQueries({ queryKey: ["proposal-metrics"] });
      toast({ title: "Proposal request created", description: "It is now in manager review." });
      setDialogOpen(false);
      setForm(emptyForm);
      setSelectedTeamIds([]);
      setTeamMemberSearch("");
    },
    onError: (error) =>
      toast({
        title: "Proposal not saved",
        description: getErrorMessage(error, "Failed to create proposal"),
        variant: "destructive",
      }),
  });

  const managerMutation = useMutation({
    mutationFn: ({ id, decision }: { id: number; decision: "approve" | "reject" | "changes_requested" }) =>
      proposalsAPI.managerDecision(id, { decision }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["proposals"] });
      toast({ title: "Manager decision saved" });
    },
    onError: (error) =>
      toast({
        title: "Decision failed",
        description: getErrorMessage(error, "Could not save manager decision"),
        variant: "destructive",
      }),
  });

  const teamMemberMutation = useMutation({
    mutationFn: ({
      proposalId,
      teamMemberId,
      status,
    }: {
      proposalId: number;
      teamMemberId: number;
      status: "approved" | "rejected";
    }) => proposalsAPI.updateTeamMember(proposalId, teamMemberId, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["proposals"] });
      toast({ title: "Team member decision saved" });
    },
    onError: (error) =>
      toast({
        title: "Team member update failed",
        description: getErrorMessage(error, "Could not update proposal team member"),
        variant: "destructive",
      }),
  });

  const bdMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateProposalPayload }) =>
      proposalsAPI.updateBd(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["proposals"] });
      queryClient.invalidateQueries({ queryKey: ["proposal-metrics"] });
      toast({ title: "BD details saved" });
    },
    onError: (error) =>
      toast({
        title: "BD update failed",
        description: getErrorMessage(error, "Could not update proposal"),
        variant: "destructive",
      }),
  });

  const setBdField = (proposalId: number, patch: Partial<UpdateProposalPayload>) => {
    setBdDrafts((current) => ({
      ...current,
      [proposalId]: { ...current[proposalId], ...patch },
    }));
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold text-foreground">Business Development</h2>
            <p className="text-muted-foreground">
              Proposal requests, manager approval, BD finalization, and client submission tracking.
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New Proposal
              </Button>
            </DialogTrigger>
            <DialogContent className="w-[94vw] max-w-4xl max-h-[86vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Proposal Request</DialogTitle>
                <DialogDescription>Store Google Workspace links only. Documents are not uploaded here.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Existing client</Label>
                  <Select value={form.clientId} onValueChange={(clientId) => setForm((prev) => ({ ...prev, clientId }))}>
                    <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                    <SelectContent>
                      {clients.map((client) => (
                        <SelectItem key={client.id} value={String(client.id)}>{client.clientName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Client name</Label>
                  <Input value={form.clientName} onChange={(event) => setForm((prev) => ({ ...prev, clientName: event.target.value }))} disabled={!!form.clientId} />
                </div>
                <div className="space-y-2">
                  <Label>Proposal title</Label>
                  <Input value={form.proposalTitle} onChange={(event) => setForm((prev) => ({ ...prev, proposalTitle: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Proposal type</Label>
                  <Select value={form.proposalType} onValueChange={(proposalType) => setForm((prev) => ({ ...prev, proposalType }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PROPOSAL_TYPES.map((type) => <SelectItem key={type} value={type}>{type.toUpperCase()}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Requested service</Label>
                  <Input value={form.requestedService} onChange={(event) => setForm((prev) => ({ ...prev, requestedService: event.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Currency</Label>
                    <Input value={form.currency} onChange={(event) => setForm((prev) => ({ ...prev, currency: event.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Value</Label>
                    <Input type="number" value={form.proposedFee} onChange={(event) => setForm((prev) => ({ ...prev, proposedFee: event.target.value }))} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Source</Label>
                  <Input value={form.sourceName} onChange={(event) => setForm((prev) => ({ ...prev, sourceName: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Deadline</Label>
                  <Input type="date" value={form.deadlineDate} onChange={(event) => setForm((prev) => ({ ...prev, deadlineDate: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Department{requiresManagerReviewRouting ? " *" : ""}</Label>
                  <Select value={form.departmentId} onValueChange={handleDepartmentChange}>
                    <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                    <SelectContent>
                      {departments.map((department) => <SelectItem key={department.id} value={String(department.id)}>{department.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Partner in charge{requiresManagerReviewRouting ? " *" : ""}</Label>
                  <Select value={form.assignedPartnerProfileId} onValueChange={(assignedPartnerProfileId) => setForm((prev) => ({ ...prev, assignedPartnerProfileId }))}>
                    <SelectTrigger><SelectValue placeholder="Select partner" /></SelectTrigger>
                    <SelectContent>
                      {partnerOptions.map((profile) => <SelectItem key={profile.id} value={String(profile.id)}>{getName(profile)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {selectedDepartmentId && partnerOptions.length === 0 && (
                    <p className="text-xs text-muted-foreground">No partner is assigned to this department yet.</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Manager in charge{requiresManagerReviewRouting ? " *" : ""}</Label>
                  <Select value={form.managerProfileId} onValueChange={(managerProfileId) => setForm((prev) => ({ ...prev, managerProfileId }))}>
                    <SelectTrigger><SelectValue placeholder="Select manager" /></SelectTrigger>
                    <SelectContent>
                      {managerOptions.map((profile) => <SelectItem key={profile.id} value={String(profile.id)}>{getName(profile)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {selectedDepartmentId && managerOptions.length === 0 && (
                    <p className="text-xs text-muted-foreground">No manager is assigned to this department yet.</p>
                  )}
                </div>
                {canBdFinalize && (
                  <div className="space-y-2">
                    <Label>Employee draft Google link</Label>
                    <Input value={form.employeeDraftLink} onChange={(event) => setForm((prev) => ({ ...prev, employeeDraftLink: event.target.value }))} placeholder="https://docs.google.com/..." />
                  </div>
                )}
                <div className="space-y-2 md:col-span-2">
                  <Label>Team members</Label>
                  <Input
                    value={teamMemberSearch}
                    onChange={(event) => setTeamMemberSearch(event.target.value)}
                    placeholder="Search employees by name or position"
                    className="h-9"
                  />
                  <div className="grid max-h-44 gap-2 overflow-y-auto rounded-md border p-3 md:grid-cols-3">
                    {visibleTeamMembers.map((profile) => {
                      const checked = selectedTeamIds.includes(profile.id);
                      return (
                        <label key={profile.id} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(value) =>
                              setSelectedTeamIds((current) =>
                                value ? [...current, profile.id] : current.filter((id) => id !== profile.id)
                              )
                            }
                          />
                          <span>{getName(profile)}</span>
                        </label>
                      );
                    })}
                    {visibleTeamMembers.length === 0 && (
                      <p className="text-sm text-muted-foreground md:col-span-3">No employees match your search.</p>
                    )}
                  </div>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Notes</Label>
                  <Textarea value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !canSubmitProposal}>
                  {createMutation.isPending ? "Saving..." : "Submit to Manager"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card><CardHeader><CardTitle className="text-sm">Pipeline Value</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">KES {Number(metrics?.pipelineValue || 0).toLocaleString()}</div></CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm">Weighted Pipeline</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">KES {Number(metrics?.weightedPipelineValue || 0).toLocaleString()}</div></CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm">Conversion</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{Number(metrics?.conversionRate || 0).toFixed(1)}%</div></CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm">Hot Leads</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{metrics?.hotLeads || 0}</div></CardContent></Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Proposal Workflow</CardTitle>
            <CardDescription>Manager approval controls whether proposal time can be logged.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex flex-col gap-3 md:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9" placeholder="Search proposals or clients" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
              </div>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="md:w-64"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {Object.keys(STATUS_LABELS).map((status) => <SelectItem key={status} value={status}>{STATUS_LABELS[status]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {isLoading ? (
              <div className="py-10 text-center text-muted-foreground">Loading proposals...</div>
            ) : proposals.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground">No proposals found.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Proposal</TableHead>
                    <TableHead>Ownership</TableHead>
                    <TableHead>Team</TableHead>
                    <TableHead>Links</TableHead>
                    <TableHead>BD Finalization</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {proposals.map((proposal) => {
                    const bdDraft = bdDrafts[proposal.id] || {};
                    return (
                      <TableRow key={proposal.id} className="align-top">
                        <TableCell className="min-w-64">
                          <div className="font-medium">{proposal.proposalTitle}</div>
                          <div className="text-xs text-muted-foreground">{proposal.client?.clientName || proposal.clientName} · {proposal.requestedService || proposal.serviceType}</div>
                          <Badge className="mt-2" variant={STATUS_VARIANTS[proposal.status] || "outline"}>{STATUS_LABELS[proposal.status] || proposal.status}</Badge>
                          <div className="mt-2 text-xs text-muted-foreground">
                            {proposal.currency} {Number(proposal.proposedFee || 0).toLocaleString()} · deadline {proposal.deadlineDate ? new Date(proposal.deadlineDate).toLocaleDateString() : "-"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">Dept: {proposal.department?.name || "-"}</div>
                          <div className="text-sm">Partner: {getName(proposal.assignedPartner) || "-"}</div>
                          <div className="text-sm">Manager: {getName(proposal.manager) || "-"}</div>
                          <div className="text-xs text-muted-foreground">Source: {proposal.sourceName || getName(proposal.sourceProfile) || "-"}</div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            {(proposal.teamMembers || []).map((member) => (
                              <div key={member.id} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1 text-xs">
                                <span>{getName(member.profile)}</span>
                                <div className="flex items-center gap-1">
                                  <Badge variant={member.status === "approved" ? "default" : member.status === "rejected" ? "destructive" : "outline"}>{member.status.replace(/_/g, " ")}</Badge>
                                  {canManagerReview && !["approved", "removed"].includes(member.status) && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-6 px-2 text-xs"
                                      onClick={() => teamMemberMutation.mutate({ proposalId: proposal.id, teamMemberId: member.id, status: "approved" })}
                                      disabled={teamMemberMutation.isPending}
                                    >
                                      Approve
                                    </Button>
                                  )}
                                  {canManagerReview && !["rejected", "removed"].includes(member.status) && (
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      className="h-6 px-2 text-xs"
                                      onClick={() => teamMemberMutation.mutate({ proposalId: proposal.id, teamMemberId: member.id, status: "rejected" })}
                                      disabled={teamMemberMutation.isPending}
                                    >
                                      Reject
                                    </Button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-2 text-sm">
                            {proposal.employeeDraftLink ? (
                              <a className="inline-flex items-center gap-1 text-primary hover:underline" href={proposal.employeeDraftLink} target="_blank" rel="noreferrer">
                                Employee draft <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : <div className="text-muted-foreground">No employee draft link</div>}
                            {proposal.bdFinalProposalLink ? (
                              <a className="inline-flex items-center gap-1 text-primary hover:underline" href={proposal.bdFinalProposalLink} target="_blank" rel="noreferrer">
                                BD final <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : <div className="text-muted-foreground">No BD final link</div>}
                          </div>
                        </TableCell>
                        <TableCell className="min-w-72">
                          {canBdFinalize ? (
                            <div className="space-y-2">
                              <Input placeholder="Final Google link" value={bdDraft.bdFinalProposalLink ?? proposal.bdFinalProposalLink ?? ""} onChange={(event) => setBdField(proposal.id, { bdFinalProposalLink: event.target.value })} />
                              <div className="grid grid-cols-2 gap-2">
                                <Input type="date" value={bdDraft.finalSubmittedAt ?? proposal.finalSubmittedAt?.slice(0, 10) ?? ""} onChange={(event) => setBdField(proposal.id, { finalSubmittedAt: event.target.value })} />
                                <Select value={(bdDraft.status as ProposalStatus) || proposal.status} onValueChange={(status) => setBdField(proposal.id, { status: status as ProposalStatus })}>
                                  <SelectTrigger><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="bd_in_progress">BD editing</SelectItem>
                                    <SelectItem value="ready_for_client_submission">Ready</SelectItem>
                                    <SelectItem value="submitted_to_client">Submitted</SelectItem>
                                    <SelectItem value="won">Won</SelectItem>
                                    <SelectItem value="lost">Lost</SelectItem>
                                    <SelectItem value="cancelled">Cancelled</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <Input placeholder="Final submission status" value={bdDraft.finalSubmissionStatus ?? proposal.finalSubmissionStatus ?? ""} onChange={(event) => setBdField(proposal.id, { finalSubmissionStatus: event.target.value })} />
                                <Input placeholder="Award status" value={bdDraft.awardStatus ?? proposal.awardStatus ?? ""} onChange={(event) => setBdField(proposal.id, { awardStatus: event.target.value })} />
                              </div>
                              <Textarea placeholder="Client feedback" value={bdDraft.clientFeedback ?? proposal.clientFeedback ?? ""} onChange={(event) => setBdField(proposal.id, { clientFeedback: event.target.value })} />
                              <Textarea placeholder="Comments" value={bdDraft.notes ?? proposal.notes ?? ""} onChange={(event) => setBdField(proposal.id, { notes: event.target.value })} />
                              <Button size="sm" onClick={() => bdMutation.mutate({ id: proposal.id, data: bdDraft })} disabled={bdMutation.isPending}>
                                <Send className="mr-2 h-3 w-3" /> Save BD update
                              </Button>
                            </div>
                          ) : (
                            <div className="text-sm text-muted-foreground">BD finalization is restricted.</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {canManagerReview && ["submitted_to_manager", "manager_changes_requested", "draft"].includes(proposal.status) ? (
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="outline" onClick={() => managerMutation.mutate({ id: proposal.id, decision: "changes_requested" })}>Changes</Button>
                              <Button size="sm" variant="destructive" onClick={() => managerMutation.mutate({ id: proposal.id, decision: "reject" })}><X className="h-3 w-3" /></Button>
                              <Button size="sm" onClick={() => managerMutation.mutate({ id: proposal.id, decision: "approve" })}><Check className="h-3 w-3" /></Button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">No action</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
