import { useEffect, useState, useRef } from "react";
import {
  FileText, Plus, Upload, X, ChevronDown, ChevronRight,
  CheckCircle2, Clock, XCircle, Send, Paperclip, ExternalLink,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { proposalsAPI, type Proposal, type CreateProposalPayload } from "@/lib/api/proposals";
import documentsAPI from "@/lib/api/documents";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SERVICE_TYPES = [
  "Audit", "Tax Advisory", "Bookkeeping", "Payroll", "Secretarial",
  "Advisory", "Due Diligence", "Forensic Audit", "Training", "Other",
];

const STATUS_CONFIG: Record<Proposal["status"], { label: string; color: string; icon: React.ReactNode }> = {
  draft:  { label: "Draft",  color: "bg-muted text-muted-foreground border-border", icon: <Clock className="h-3 w-3" /> },
  sent:   { label: "Sent",   color: "bg-blue-100 text-blue-800 border-blue-200",    icon: <Send className="h-3 w-3" /> },
  won:    { label: "Won",    color: "bg-emerald-100 text-emerald-800 border-emerald-200", icon: <CheckCircle2 className="h-3 w-3" /> },
  lost:   { label: "Lost",   color: "bg-red-100 text-red-800 border-red-200",       icon: <XCircle className="h-3 w-3" /> },
};

const fmt = (n: number) =>
  new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(n);

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

const clientLabel = (p: Proposal) =>
  p.client?.clientName ?? p.clientName ?? "—";

// ─── Create Form ──────────────────────────────────────────────────────────────

function CreateProposalForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState<CreateProposalPayload>({
    clientName: "",
    proposalTitle: "",
    serviceType: "Audit",
    proposedFee: 0,
    proposalDate: new Date().toISOString().slice(0, 10),
    probability: 50,
    status: "draft",
    notes: "",
    currency: "KES",
  });

  const set = (field: keyof CreateProposalPayload, value: unknown) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.proposalTitle.trim() || !form.clientName?.trim()) return;
    setSaving(true);
    try {
      const created = await proposalsAPI.create({
        ...form,
        proposedFee: Number(form.proposedFee),
        probability: Number(form.probability),
      });

      // Upload the document if one was chosen
      const proposal = (created as any)?.data ?? (created as any);
      if (file && proposal?.id) {
        try {
          await documentsAPI.uploadFile(file, {
            documentType: "proposal",
            entityType: "Proposal",
            entityId: proposal.id,
            accessLevel: "employee",
            description: `Proposal document: ${form.proposalTitle}`,
          });
        } catch {
          toast({ title: "Proposal saved", description: "Document upload failed — you can re-upload later.", variant: "destructive" });
          onCreated();
          return;
        }
      }

      toast({ title: "Proposal recorded", description: `"${form.proposalTitle}" has been saved.` });
      onCreated();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Proposal title */}
        <div className="space-y-1.5">
          <Label>Proposal Title *</Label>
          <Input
            value={form.proposalTitle}
            onChange={(e) => set("proposalTitle", e.target.value)}
            placeholder="e.g. Annual Audit — Acme Ltd 2025"
            required
          />
        </div>

        {/* Client name */}
        <div className="space-y-1.5">
          <Label>Client Name *</Label>
          <Input
            value={form.clientName ?? ""}
            onChange={(e) => set("clientName", e.target.value)}
            placeholder="e.g. Acme Ltd"
            required
          />
        </div>

        {/* Service type */}
        <div className="space-y-1.5">
          <Label>Service Type *</Label>
          <Select value={form.serviceType} onValueChange={(v) => set("serviceType", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {SERVICE_TYPES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Proposed fee */}
        <div className="space-y-1.5">
          <Label>Proposed Fee (KES) *</Label>
          <Input
            type="number"
            min={0}
            value={form.proposedFee}
            onChange={(e) => set("proposedFee", Number(e.target.value))}
            required
          />
        </div>

        {/* Proposal date */}
        <div className="space-y-1.5">
          <Label>Proposal Date *</Label>
          <Input
            type="date"
            value={form.proposalDate}
            onChange={(e) => set("proposalDate", e.target.value)}
            required
          />
        </div>

        {/* Status */}
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={form.status} onValueChange={(v) => set("status", v as Proposal["status"])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="won">Won</SelectItem>
              <SelectItem value="lost">Lost</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Win probability */}
        <div className="space-y-1.5">
          <Label>Win Probability ({form.probability}%)</Label>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={form.probability}
            onChange={(e) => set("probability", Number(e.target.value))}
            className="w-full accent-primary"
          />
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <Label>Notes</Label>
        <Textarea
          value={form.notes ?? ""}
          onChange={(e) => set("notes", e.target.value)}
          placeholder="Scope summary, key points, follow-up actions…"
          rows={3}
        />
      </div>

      {/* Document upload */}
      <div className="space-y-1.5">
        <Label>Attach Proposal Document (optional)</Label>
        <div
          className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:bg-muted/40 transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          {file ? (
            <div className="flex items-center justify-center gap-2 text-sm">
              <Paperclip className="h-4 w-4 text-primary" />
              <span className="font-medium truncate max-w-xs">{file.name}</span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setFile(null); }}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1 text-muted-foreground">
              <Upload className="h-5 w-5" />
              <p className="text-sm">Click to upload PDF, Word, or Excel</p>
            </div>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.xls,.xlsx"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button type="submit" disabled={saving || !form.proposalTitle.trim() || !form.clientName?.trim()}>
          {saving ? "Saving…" : "Save Proposal"}
        </Button>
      </div>
    </form>
  );
}

// ─── Proposal row with document drill-down ────────────────────────────────────

function ProposalRow({ proposal, onRefresh }: { proposal: Proposal; onRefresh: () => void }) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [docs, setDocs] = useState<Awaited<ReturnType<typeof documentsAPI.list>>["documents"]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [uploading, setUploading] = useState(false);

  const cfg = STATUS_CONFIG[proposal.status];

  const loadDocs = async () => {
    setLoadingDocs(true);
    try {
      const res = await documentsAPI.list({ entityType: "Proposal", entityId: proposal.id });
      setDocs(res.documents);
    } catch {
      // ignore
    } finally {
      setLoadingDocs(false);
    }
  };

  const handleExpand = () => {
    if (!expanded) loadDocs();
    setExpanded((v) => !v);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await documentsAPI.uploadFile(file, {
        documentType: "proposal",
        entityType: "Proposal",
        entityId: proposal.id,
        accessLevel: "employee",
        description: `Proposal document: ${proposal.proposalTitle}`,
      });
      toast({ title: "Document uploaded" });
      loadDocs();
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="border rounded-xl overflow-hidden bg-card">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={handleExpand}
      >
        <span className="text-muted-foreground shrink-0">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{proposal.proposalTitle}</p>
          <p className="text-xs text-muted-foreground">{clientLabel(proposal)} · {proposal.serviceType}</p>
        </div>
        <div className="flex items-center gap-4 shrink-0 text-right">
          <div className="hidden sm:block">
            <p className="text-xs text-muted-foreground">Fee</p>
            <p className="text-sm font-semibold">{fmt(Number(proposal.proposedFee))}</p>
          </div>
          <div className="hidden sm:block">
            <p className="text-xs text-muted-foreground">Date</p>
            <p className="text-sm">{fmtDate(proposal.proposalDate)}</p>
          </div>
          <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${cfg.color}`}>
            {cfg.icon}
            {cfg.label}
          </span>
          <div className="text-xs text-muted-foreground w-10 text-right">{proposal.probability}%</div>
        </div>
      </div>

      {/* Expanded: documents */}
      {expanded && (
        <div className="border-t bg-muted/20 px-4 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Attachments</p>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <Upload className="h-3.5 w-3.5" />
              {uploading ? "Uploading…" : "Upload Document"}
            </Button>
            <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" className="hidden" onChange={handleUpload} />
          </div>

          {loadingDocs && <p className="text-sm text-muted-foreground animate-pulse">Loading…</p>}

          {!loadingDocs && docs.length === 0 && (
            <p className="text-sm text-muted-foreground">No documents attached yet.</p>
          )}

          {!loadingDocs && docs.length > 0 && (
            <div className="space-y-1.5">
              {docs.map((doc) => (
                <div key={doc.id} className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm">
                  <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="flex-1 truncate">{doc.fileName}</span>
                  <span className="text-xs text-muted-foreground">{doc.documentType}</span>
                  <a
                    href={documentsAPI.getDownloadUrl(doc.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline flex items-center gap-1 text-xs"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Open
                  </a>
                </div>
              ))}
            </div>
          )}

          {proposal.notes && (
            <div className="rounded-md bg-card border px-3 py-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Notes: </span>{proposal.notes}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MyProposals() {
  const { toast } = useToast();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const load = async () => {
    setLoading(true);
    try {
      const res = await proposalsAPI.listMine({
        search: search || undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
        pageSize: 50,
      });
      const items: Proposal[] = (res as any)?.data?.items ?? (res as any)?.data ?? (res as any)?.items ?? [];
      setProposals(items);
      setTotal((res as any)?.total ?? items.length);
    } catch (err: any) {
      toast({ title: "Error loading proposals", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [search, statusFilter]);

  // Summary counts
  const won   = proposals.filter((p) => p.status === "won").length;
  const sent  = proposals.filter((p) => p.status === "sent").length;
  const total_ = proposals.length;
  const pipeline = proposals
    .filter((p) => p.status === "sent" || p.status === "draft")
    .reduce((s, p) => s + Number(p.proposedFee), 0);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">My Proposals</h1>
            <p className="text-sm text-muted-foreground">Record proposals you've prepared and attach the documents.</p>
          </div>
        </div>
        <Button onClick={() => setShowForm(true)} className="gap-2" disabled={showForm}>
          <Plus className="h-4 w-4" />
          New Proposal
        </Button>
      </div>

      {/* Stats */}
      {proposals.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total",    value: total_,       color: "text-foreground" },
            { label: "Sent",     value: sent,         color: "text-blue-600" },
            { label: "Won",      value: won,          color: "text-emerald-600" },
            { label: "Pipeline", value: fmt(pipeline), color: "text-amber-600" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={`text-xl font-bold mt-1 ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-base">Record a Proposal</h2>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowForm(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <CreateProposalForm
            onCreated={() => { setShowForm(false); load(); }}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search proposals…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="won">Won</SelectItem>
            <SelectItem value="lost">Lost</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border h-16 bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : proposals.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card px-6 py-12 text-center space-y-3">
          <FileText className="h-8 w-8 text-muted-foreground mx-auto" />
          <p className="text-sm font-medium">No proposals recorded yet</p>
          <p className="text-xs text-muted-foreground max-w-xs mx-auto">
            Record a proposal you've prepared — track its status, fee, and attach the document.
          </p>
          <Button size="sm" onClick={() => setShowForm(true)} className="gap-2 mt-2">
            <Plus className="h-4 w-4" /> Record First Proposal
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {proposals.map((p) => (
            <ProposalRow key={p.id} proposal={p} onRefresh={load} />
          ))}
          {total > proposals.length && (
            <p className="text-xs text-center text-muted-foreground">
              Showing {proposals.length} of {total} proposals
            </p>
          )}
        </div>
      )}
    </div>
  );
}
