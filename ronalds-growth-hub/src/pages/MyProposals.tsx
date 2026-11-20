import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock, ExternalLink, FileText, Plus, Search, Send, XCircle } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { proposalsAPI, type CreateProposalPayload, type Proposal, type ProposalContext } from "@/lib/api/proposals";

const SERVICE_TYPES = [
  "Audit",
  "Tax Advisory",
  "Bookkeeping",
  "Payroll",
  "Secretarial",
  "Advisory",
  "Due Diligence",
  "Forensic Audit",
  "Training",
  "Other",
];

const STATUS_CONFIG: Partial<Record<Proposal["status"], { label: string; className: string; icon: React.ReactNode }>> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground border-border", icon: <Clock className="h-3 w-3" /> },
  submitted_to_manager: { label: "Manager review", className: "bg-blue-100 text-blue-800 border-blue-200", icon: <Send className="h-3 w-3" /> },
  manager_changes_requested: { label: "Changes requested", className: "bg-amber-100 text-amber-800 border-amber-200", icon: <Clock className="h-3 w-3" /> },
  manager_rejected: { label: "Rejected", className: "bg-red-100 text-red-800 border-red-200", icon: <XCircle className="h-3 w-3" /> },
  assigned_to_bd: { label: "With BD", className: "bg-indigo-100 text-indigo-800 border-indigo-200", icon: <Send className="h-3 w-3" /> },
  bd_in_progress: { label: "BD editing", className: "bg-indigo-100 text-indigo-800 border-indigo-200", icon: <Clock className="h-3 w-3" /> },
  submitted_to_client: { label: "Submitted", className: "bg-blue-100 text-blue-800 border-blue-200", icon: <Send className="h-3 w-3" /> },
  won: { label: "Won", className: "bg-emerald-100 text-emerald-800 border-emerald-200", icon: <CheckCircle2 className="h-3 w-3" /> },
  lost: { label: "Lost", className: "bg-red-100 text-red-800 border-red-200", icon: <XCircle className="h-3 w-3" /> },
};

const fmt = (n: number) =>
  new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(n);

const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "-";

const statusConfig = (status: Proposal["status"]) =>
  STATUS_CONFIG[status] || {
    label: status.replace(/_/g, " "),
    className: "bg-muted text-muted-foreground border-border",
    icon: <Clock className="h-3 w-3" />,
  };

function CreateProposalForm({
  context,
  onCreated,
  onCancel,
}: {
  context: ProposalContext | null;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [teamMemberSearch, setTeamMemberSearch] = useState("");
  const [form, setForm] = useState<CreateProposalPayload>({
    clientName: "",
    proposalTitle: "",
    serviceType: "Audit",
    requestedService: "Audit",
    proposedFee: 0,
    proposalDate: new Date().toISOString().slice(0, 10),
    deadlineDate: "",
    probability: 50,
    status: "submitted_to_manager",
    submitToManager: true,
    notes: "",
    sourceName: "",
    currency: "KES",
    managerProfileId: null,
    assignedPartnerProfileId: null,
    departmentId: null,
    teamMemberProfileIds: [],
    timeTakenHours: 0,
    timeTakenDate: new Date().toISOString().slice(0, 10),
  });
  const [selectedTeamIds, setSelectedTeamIds] = useState<number[]>([]);

  const set = (field: keyof CreateProposalPayload, value: unknown) =>
    setForm((current) => ({ ...current, [field]: value }));

  const selectedDepartmentId = form.departmentId ? Number(form.departmentId) : null;
  const selectedDepartment = (context?.departments || []).find((department) => department.id === selectedDepartmentId);
  const profiles = context?.profiles || [];
  const profileName = (profile: ProposalContext["profiles"][number]) =>
    `${profile.firstName || ""} ${profile.lastName || ""}`.trim();
  const profileHasRole = (profile: ProposalContext["profiles"][number], roles: string[]) => {
    const roleSet = new Set(
      (profile.user?.roles || []).map((entry) => String(entry.role.name || "").toLowerCase())
    );
    return roles.some((role) => roleSet.has(role));
  };
  const isDepartmentProfile = (profile: ProposalContext["profiles"][number]) =>
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
      const haystack = `${profileName(profile)} ${profile.positionTitle || ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [profiles, teamMemberSearch]);

  const handleDepartmentChange = (value: string) => {
    const departmentId = Number(value);
    setForm((current) => ({
      ...current,
      departmentId,
      managerProfileId: null,
      assignedPartnerProfileId: null,
    }));
  };
  const canSubmitProposal =
    !!form.proposalTitle.trim() &&
    !!form.clientName?.trim() &&
    !!form.departmentId &&
    !!form.assignedPartnerProfileId &&
    !!form.managerProfileId;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmitProposal) {
      toast({
        title: "Missing proposal routing",
        description: "Client, title, department, partner, and manager are required before manager review.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      await proposalsAPI.create({
        ...form,
        requestedService: form.requestedService || form.serviceType,
        proposedFee: Number(form.proposedFee),
        probability: Number(form.probability),
        teamMemberProfileIds: selectedTeamIds,
      });
      toast({ title: "Proposal sent for review", description: `"${form.proposalTitle}" is awaiting manager approval.` });
      onCreated();
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Unable to save proposal", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Proposal Title *</Label>
          <Input value={form.proposalTitle} onChange={(event) => set("proposalTitle", event.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label>Client Name *</Label>
          <Input value={form.clientName ?? ""} onChange={(event) => set("clientName", event.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label>Service Type *</Label>
          <Select
            value={form.serviceType}
            onValueChange={(value) => {
              set("serviceType", value);
              set("requestedService", value);
            }}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{SERVICE_TYPES.map((service) => <SelectItem key={service} value={service}>{service}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Proposed Fee (KES)</Label>
          <Input type="number" min={0} value={form.proposedFee} onChange={(event) => set("proposedFee", Number(event.target.value))} />
        </div>
        <div className="space-y-1.5">
          <Label>Proposal Date</Label>
          <Input type="date" value={form.proposalDate} onChange={(event) => set("proposalDate", event.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Deadline Date</Label>
          <Input type="date" value={form.deadlineDate ?? ""} onChange={(event) => set("deadlineDate", event.target.value)} />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label>Source</Label>
          <Input
            value={form.sourceName ?? ""}
            onChange={(event) => set("sourceName", event.target.value)}
            placeholder="Referral, tender portal, client request, partner lead..."
          />
        </div>
        <div className="space-y-1.5">
          <Label>Department *</Label>
          <Select value={form.departmentId ? String(form.departmentId) : ""} onValueChange={handleDepartmentChange}>
            <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
            <SelectContent>
              {(context?.departments || []).map((department) => (
                <SelectItem key={department.id} value={String(department.id)}>{department.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Manager in Charge *</Label>
          <Select value={form.managerProfileId ? String(form.managerProfileId) : ""} onValueChange={(value) => set("managerProfileId", Number(value))}>
            <SelectTrigger><SelectValue placeholder="Select manager" /></SelectTrigger>
            <SelectContent>
              {managerOptions.map((profile) => (
                <SelectItem key={profile.id} value={String(profile.id)}>{profileName(profile)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedDepartmentId && managerOptions.length === 0 && (
            <p className="text-xs text-muted-foreground">No manager is assigned to this department yet.</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Partner in Charge *</Label>
          <Select value={form.assignedPartnerProfileId ? String(form.assignedPartnerProfileId) : ""} onValueChange={(value) => set("assignedPartnerProfileId", Number(value))}>
            <SelectTrigger><SelectValue placeholder="Select partner" /></SelectTrigger>
            <SelectContent>
              {partnerOptions.map((profile) => (
                <SelectItem key={profile.id} value={String(profile.id)}>{profileName(profile)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedDepartmentId && partnerOptions.length === 0 && (
            <p className="text-xs text-muted-foreground">No partner is assigned to this department yet.</p>
          )}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Proposed Team Members</Label>
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
                <span>{profileName(profile)}</span>
              </label>
            );
          })}
          {visibleTeamMembers.length === 0 && (
            <p className="text-sm text-muted-foreground md:col-span-3">No employees match your search.</p>
          )}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Notes</Label>
        <Textarea value={form.notes ?? ""} onChange={(event) => set("notes", event.target.value)} rows={3} />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Time spent on this proposal (hours)</Label>
          <Input
            type="number"
            min={0}
            step="0.25"
            value={form.timeTakenHours ?? 0}
            onChange={(event) => set("timeTakenHours", Number(event.target.value))}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Date worked</Label>
          <Input
            type="date"
            value={form.timeTakenDate ?? ""}
            onChange={(event) => set("timeTakenDate", event.target.value)}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        This automatically creates a pending timesheet entry linked to this proposal.
      </p>
      <div className="flex justify-end gap-2 border-t pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button type="submit" disabled={saving || !canSubmitProposal}>
          {saving ? "Saving..." : "Send to Manager"}
        </Button>
      </div>
    </form>
  );
}

const EXECUTION_STATUSES: Proposal["status"][] = [
  "manager_approved",
  "assigned_to_bd",
  "bd_in_progress",
  "bd_changes_requested",
  "ready_for_client_submission",
  "submitted_to_client",
  "won",
  "lost",
];

function ProposalRow({ proposal, onRefresh }: { proposal: Proposal; onRefresh: () => void }) {
  const { toast } = useToast();
  const { profile: currentProfile } = useAuth();
  const isCreator = proposal.createdByProfileId === currentProfile?.id;
  const cfg = statusConfig(proposal.status);
  const [draftLink, setDraftLink] = useState(proposal.employeeDraftLink || "");
  const [savingDraftLink, setSavingDraftLink] = useState(false);
  const canSubmitDraft = EXECUTION_STATUSES.includes(proposal.status);

  const prepEntry = proposal.timeEntries?.find((entry) => entry.isProposalPrep);
  const [timeHours, setTimeHours] = useState(
    prepEntry ? Number(prepEntry.hours) : Number(proposal.timeTakenHours || 0)
  );
  const [timeDate, setTimeDate] = useState(
    prepEntry
      ? String(prepEntry.dateWorked).slice(0, 10)
      : new Date().toISOString().slice(0, 10)
  );
  const [savingTime, setSavingTime] = useState(false);

  useEffect(() => {
    setTimeHours(
      prepEntry ? Number(prepEntry.hours) : Number(proposal.timeTakenHours || 0)
    );
    setTimeDate(
      prepEntry
        ? String(prepEntry.dateWorked).slice(0, 10)
        : new Date().toISOString().slice(0, 10)
    );
  }, [prepEntry, proposal.timeTakenHours]);

  const saveProposalTime = async () => {
    setSavingTime(true);
    try {
      await proposalsAPI.update(proposal.id, {
        timeTakenHours: Number(timeHours),
        timeTakenDate: timeDate,
      });
      toast({
        title: "Proposal time saved",
        description: "Your timesheet entry has been updated.",
      });
      onRefresh();
    } catch (error: any) {
      toast({
        title: "Time not saved",
        description: error.message || "Unable to update the proposal time.",
        variant: "destructive",
      });
    } finally {
      setSavingTime(false);
    }
  };

  const saveDraftLink = async () => {
    if (!draftLink.trim()) return;
    setSavingDraftLink(true);
    try {
      await proposalsAPI.update(proposal.id, { employeeDraftLink: draftLink.trim() });
      toast({ title: "Draft link saved", description: "Your proposal draft has been attached for BD review." });
      onRefresh();
    } catch (error: any) {
      toast({
        title: "Draft link not saved",
        description: error.message || "Manager approval is required before submitting proposal work.",
        variant: "destructive",
      });
    } finally {
      setSavingDraftLink(false);
    }
  };

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <p className="font-medium">{proposal.proposalTitle}</p>
          </div>
          <p className="text-sm text-muted-foreground">
            {proposal.client?.clientName || proposal.clientName || "-"} · {proposal.requestedService || proposal.serviceType}
          </p>
          <p className="text-xs text-muted-foreground">
            {fmt(Number(proposal.proposedFee || 0))} · {fmtDate(proposal.proposalDate)}
          </p>
          <p className="text-xs text-muted-foreground">
            Source: {proposal.sourceName || "Not specified"} / Deadline: {fmtDate(proposal.deadlineDate)}
          </p>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${cfg.className}`}>
          {cfg.icon}
          {cfg.label}
        </span>
      </div>
      <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
        <div>
          <span className="text-muted-foreground">Employee draft: </span>
          {proposal.employeeDraftLink ? (
            <a className="inline-flex items-center gap-1 text-primary hover:underline" href={proposal.employeeDraftLink} target="_blank" rel="noreferrer">
              Open link <ExternalLink className="h-3 w-3" />
            </a>
          ) : canSubmitDraft ? (
            <div className="mt-2 flex gap-2">
              <Input
                value={draftLink}
                onChange={(event) => setDraftLink(event.target.value)}
                placeholder="https://docs.google.com/..."
                className="h-8"
              />
              <Button size="sm" onClick={saveDraftLink} disabled={savingDraftLink || !draftLink.trim()}>
                {savingDraftLink ? "Saving..." : "Save"}
              </Button>
            </div>
          ) : (
            "Awaiting manager approval"
          )}
        </div>
        <div>
          <span className="text-muted-foreground">BD final: </span>
          {proposal.bdFinalProposalLink ? (
            <a className="inline-flex items-center gap-1 text-primary hover:underline" href={proposal.bdFinalProposalLink} target="_blank" rel="noreferrer">
              Open link <ExternalLink className="h-3 w-3" />
            </a>
          ) : "Pending"}
        </div>
      </div>
      {isCreator ? (
        <>
          <div className="mt-3 grid gap-3 rounded-md border bg-muted/20 p-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <div className="space-y-1.5">
              <Label>Time spent on this proposal (hours)</Label>
              <Input
                type="number"
                min={0}
                step="0.25"
                value={timeHours}
                onChange={(event) => setTimeHours(Number(event.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Date worked</Label>
              <Input
                type="date"
                value={timeDate}
                onChange={(event) => setTimeDate(event.target.value)}
              />
            </div>
            <Button onClick={saveProposalTime} disabled={savingTime}>
              {savingTime ? "Saving..." : "Save time"}
            </Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Linked to your timesheets
            {prepEntry ? ` · entry status: ${prepEntry.status}` : ""}
          </p>
        </>
      ) : prepEntry ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Proposal time logged: {Number(prepEntry.hours).toFixed(2)}h · {prepEntry.status}
        </p>
      ) : null}
      {proposal.managerDecisionNote && (
        <p className="mt-3 rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          {proposal.managerDecisionNote}
        </p>
      )}
    </div>
  );
}

export default function MyProposals() {
  const { toast } = useToast();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [context, setContext] = useState<ProposalContext | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const response = await proposalsAPI.listMine({ page: 1, pageSize: 50, search: search || undefined });
      setProposals(response.data || []);
      setTotal(response.total || 0);
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to load proposals", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    proposalsAPI.context().then(setContext).catch(() => setContext(null));
  }, []);

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">My Proposals</h1>
            <p className="text-sm text-muted-foreground">Create proposal drafts and track manager and BD progress.</p>
          </div>
          <Button onClick={() => setShowForm((value) => !value)}>
            <Plus className="mr-2 h-4 w-4" />
            New Proposal
          </Button>
        </div>

        {showForm && (
          <div className="rounded-xl border bg-card p-4">
            <CreateProposalForm context={context} onCancel={() => setShowForm(false)} onCreated={() => { setShowForm(false); load(); }} />
          </div>
        )}

        <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search proposals" />
          <Badge variant="secondary">{total}</Badge>
        </div>

        {loading ? (
          <div className="rounded-xl border bg-card p-10 text-center text-muted-foreground">Loading proposals...</div>
        ) : proposals.length === 0 ? (
          <div className="rounded-xl border bg-card p-10 text-center text-muted-foreground">No proposals found.</div>
        ) : (
          <div className="space-y-3">
            {proposals.map((proposal) => <ProposalRow key={proposal.id} proposal={proposal} onRefresh={load} />)}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
