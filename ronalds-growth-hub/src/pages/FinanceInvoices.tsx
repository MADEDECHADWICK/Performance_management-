import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import PageLoader from "@/components/ui/page-loader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiFetch, getToken } from "@/lib/api";
import { API_BASE_URL } from "@/lib/api/apiBaseUrl";
import { useAuth } from "@/contexts/AuthContext";
import { PlusCircle, Send, Ban, Download } from "lucide-react";

type Invoice = {
  id: number;
  invoiceNumber: string;
  title: string;
  status: string;
  currency: string;
  subtotalAmount: number;
  taxAmount: number;
  totalAmount: number;
  amountPaid: number;
  amountOutstanding: number;
  milestoneTaskId: number | null;
  dueDate: string | null;
  issuedAt: string | null;
  notes: string | null;
  clientId: number;
  clientName: string;
  jobId: number;
  jobCode: string | null;
  jobName: string;
  generatedByName: string | null;
  issuedByName: string | null;
  document: { id: number; fileName: string; filePath: string } | null;
};

type ClientOption = { id: number; clientName: string };
type JobOption = { id: number; jobCode: string | null; jobName: string; clientId: number | null };

const STATUS_COLORS: Record<string, "secondary" | "default" | "outline" | "destructive"> = {
  draft: "secondary",
  issued: "default",
  partially_paid: "outline",
  paid: "default",
  overdue: "destructive",
  void: "secondary",
};

const fmt = (n: number, currency = "KES") =>
  `${currency} ${n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export default function FinanceInvoices() {
  const { toast } = useToast();
  const { hasModuleAccess } = useAuth();
  const canWrite = hasModuleAccess("finance", "write");
  const canApprove = hasModuleAccess("finance", "approve");

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");

  // Create dialog state
  const [showCreate, setShowCreate] = useState(false);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    clientId: "",
    jobId: "",
    title: "",
    subtotalAmount: "",
    taxAmount: "",
    dueDate: "",
    notes: "",
    currency: "KES",
  });

  // Void dialog state
  const [voidTarget, setVoidTarget] = useState<Invoice | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voiding, setVoiding] = useState(false);

  const [issuing, setIssuing] = useState<number | null>(null);

  const fetchInvoices = async () => {
    try {
      const params = statusFilter !== "all" ? `?status=${statusFilter}` : "";
      const data = await apiFetch<Invoice[]>('GET', `/finance-dashboard/invoices${params}`);
      setInvoices(Array.isArray(data) ? data : []);
    } catch {
      toast({ title: "Failed to load invoices", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const fetchClients = async () => {
    try {
      const data = await apiFetch<ClientOption[]>('GET', "/clients");
      setClients(Array.isArray(data) ? data : []);
    } catch {
      /* ignore */
    }
  };

  const fetchJobsForClient = async (clientId: string) => {
    try {
      const data = await apiFetch<JobOption[]>('GET', `/jobs?clientId=${clientId}`);
      setJobs(Array.isArray(data) ? data : []);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    fetchInvoices();
    fetchClients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const openCreate = () => {
    setJobs([]);
    setForm({ clientId: "", jobId: "", title: "", subtotalAmount: "", taxAmount: "", dueDate: "", notes: "", currency: "KES" });
    setShowCreate(true);
  };

  const filteredJobs = useMemo(() => jobs, [jobs]);

  const handleCreate = async () => {
    if (!form.clientId || !form.jobId || !form.title.trim() || !form.subtotalAmount) {
      toast({ title: "Client, job, title, and amount are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await apiFetch('POST', "/finance-dashboard/invoices", {
        clientId: Number(form.clientId),
        jobId: Number(form.jobId),
        title: form.title.trim(),
        subtotalAmount: Number(form.subtotalAmount),
        taxAmount: form.taxAmount ? Number(form.taxAmount) : 0,
        dueDate: form.dueDate || undefined,
        notes: form.notes || undefined,
        currency: form.currency,
      });
      toast({ title: "Invoice draft created" });
      setShowCreate(false);
      await fetchInvoices();
    } catch (e: any) {
      toast({ title: e?.message || "Failed to create invoice", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleIssue = async (invoice: Invoice) => {
    setIssuing(invoice.id);
    try {
      await apiFetch('PATCH', `/finance-dashboard/invoices/${invoice.id}/issue`);
      toast({ title: `Invoice ${invoice.invoiceNumber} issued` });
      await fetchInvoices();
    } catch (e: any) {
      toast({ title: e?.message || "Failed to issue invoice", variant: "destructive" });
    } finally {
      setIssuing(null);
    }
  };

  const handleDownload = async (invoice: Invoice) => {
    try {
      const url = `${API_BASE_URL}/finance-dashboard/invoices/${invoice.id}/download`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${invoice.invoiceNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      toast({ title: "Failed to download invoice PDF", variant: "destructive" });
    }
  };

  const handleVoid = async () => {
    if (!voidTarget) return;
    setVoiding(true);
    try {
      await apiFetch('PATCH', `/finance-dashboard/invoices/${voidTarget.id}/void`, {
        reason: voidReason || "Voided by finance",
      });
      toast({ title: `Invoice ${voidTarget.invoiceNumber} voided` });
      setVoidTarget(null);
      setVoidReason("");
      await fetchInvoices();
    } catch (e: any) {
      toast({ title: e?.message || "Failed to void invoice", variant: "destructive" });
    } finally {
      setVoiding(false);
    }
  };

  if (loading) return <PageLoader />;

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Invoices</h1>
            <p className="text-muted-foreground text-sm">Create and manage job invoices</p>
          </div>
          {canWrite && (
            <Button onClick={openCreate}>
              <PlusCircle className="h-4 w-4 mr-2" />
              Create Invoice
            </Button>
          )}
        </div>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          {["all", "draft", "issued", "partially_paid", "paid", "overdue", "void"].map((s) => (
            <Button
              key={s}
              size="sm"
              variant={statusFilter === s ? "default" : "outline"}
              onClick={() => { setStatusFilter(s); setLoading(true); }}
            >
              {s === "all" ? "All" : s.replace(/_/g, " ")}
            </Button>
          ))}
        </div>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {invoices.length} invoice{invoices.length !== 1 ? "s" : ""}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Job</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                      No invoices found
                    </TableCell>
                  </TableRow>
                )}
                {invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono text-xs">{inv.invoiceNumber}</TableCell>
                    <TableCell className="font-medium">{inv.clientName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {inv.jobCode ? `${inv.jobCode}` : inv.jobName}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm">{inv.title}</TableCell>
                    <TableCell className="text-right font-medium">
                      {fmt(inv.totalAmount, inv.currency)}
                    </TableCell>
                    <TableCell className="text-right">
                      {inv.amountOutstanding > 0
                        ? <span className="text-destructive font-medium">{fmt(inv.amountOutstanding, inv.currency)}</span>
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_COLORS[inv.status] ?? "secondary"}>
                        {inv.status.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fmtDate(inv.dueDate)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {inv.milestoneTaskId ? "Milestone" : "Manual"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 justify-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Download PDF"
                          onClick={() => handleDownload(inv)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        {canWrite && inv.status === "draft" && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={issuing === inv.id}
                            onClick={() => handleIssue(inv)}
                          >
                            <Send className="h-3 w-3 mr-1" />
                            Issue
                          </Button>
                        )}
                        {canApprove && !["paid", "void"].includes(inv.status) && inv.amountPaid === 0 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => { setVoidTarget(inv); setVoidReason(""); }}
                          >
                            <Ban className="h-3 w-3 mr-1" />
                            Void
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Create Invoice Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Create Invoice</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 overflow-y-auto flex-1">
            <div className="space-y-1">
              <Label>Client *</Label>
              <Select value={form.clientId} onValueChange={(v) => { setForm((f) => ({ ...f, clientId: v, jobId: "" })); fetchJobsForClient(v); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.clientName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Job *</Label>
              <Select value={form.jobId} onValueChange={(v) => setForm((f) => ({ ...f, jobId: v }))} disabled={!form.clientId}>
                <SelectTrigger>
                  <SelectValue placeholder={form.clientId ? "Select job" : "Select a client first"} />
                </SelectTrigger>
                <SelectContent>
                  {filteredJobs.map((j) => (
                    <SelectItem key={j.id} value={String(j.id)}>
                      {j.jobCode ? `${j.jobCode} — ` : ""}{j.jobName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Invoice Title *</Label>
              <Input
                placeholder="e.g. Tax Advisory Services — Q1 2026"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Amount (excl. tax) *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={form.subtotalAmount}
                  onChange={(e) => setForm((f) => ({ ...f, subtotalAmount: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Tax Amount</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={form.taxAmount}
                  onChange={(e) => setForm((f) => ({ ...f, taxAmount: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Due Date</Label>
                <Input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Currency</Label>
                <Select value={form.currency} onValueChange={(v) => setForm((f) => ({ ...f, currency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="KES">KES</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {form.subtotalAmount && (
              <p className="text-sm text-muted-foreground">
                Total: <strong>{fmt(Number(form.subtotalAmount || 0) + Number(form.taxAmount || 0), form.currency)}</strong>
              </p>
            )}

            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea
                placeholder="Additional notes for this invoice…"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? "Creating…" : "Create Draft"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Void Confirmation Dialog */}
      <Dialog open={!!voidTarget} onOpenChange={(open) => { if (!open) setVoidTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Void Invoice</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm">
              You are about to void <strong>{voidTarget?.invoiceNumber}</strong> ({fmt(voidTarget?.totalAmount ?? 0, voidTarget?.currency)}).
              This cannot be undone.
            </p>
            <div className="space-y-1">
              <Label>Reason</Label>
              <Textarea
                placeholder="Reason for voiding…"
                rows={2}
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleVoid} disabled={voiding}>
              {voiding ? "Voiding…" : "Void Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
