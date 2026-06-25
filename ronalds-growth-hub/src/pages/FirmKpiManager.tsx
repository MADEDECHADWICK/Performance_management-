import { useEffect, useState } from "react";
import {
  Building2, Plus, Trash2, ChevronDown, ChevronRight,
  RefreshCw, CheckCircle2, AlertTriangle, XCircle, HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  kpiCascadeApi,
  type FirmKpiTemplate,
  type FirmKpiCascadeStatus,
  type KpiPeriod,
  type CreateFirmKpiInput,
  type CascadeScope,
} from "@/lib/api/kpiCascade";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SOURCE_MODULES = [
  { value: "timesheets", label: "Timesheets (Billable Hours)" },
  { value: "jobs", label: "Jobs (Completion Rate)" },
  { value: "trainings", label: "Trainings (Completion Rate)" },
  { value: "evaluations", label: "Evaluations (Score)" },
  { value: "finance", label: "Finance (Collection Rate)" },
  { value: "marketing", label: "Marketing (Lead Conversion)" },
  { value: "manual", label: "Manual Entry" },
];

const MODULE_UNIT: Record<string, string> = {
  timesheets: "%",
  jobs: "%",
  trainings: "%",
  evaluations: "pts",
  finance: "%",
  marketing: "%",
  manual: "",
};

const MODULE_TARGET: Record<string, number> = {
  timesheets: 80,
  jobs: 90,
  trainings: 100,
  evaluations: 75,
  finance: 85,
  marketing: 60,
  manual: 100,
};

const statusIcon = (status: string) => {
  if (status === "on_track") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (status === "at_risk") return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  if (status === "off_track") return <XCircle className="h-4 w-4 text-red-500" />;
  return <HelpCircle className="h-4 w-4 text-muted-foreground" />;
};

const statusLabel: Record<string, string> = {
  on_track: "On Track", at_risk: "At Risk", off_track: "Off Track", no_data: "No Data",
};

const statusColor: Record<string, string> = {
  on_track: "bg-emerald-100 text-emerald-800 border-emerald-200",
  at_risk: "bg-amber-100 text-amber-800 border-amber-200",
  off_track: "bg-red-100 text-red-800 border-red-200",
  no_data: "bg-muted text-muted-foreground border-border",
};

// ─── Create Form ──────────────────────────────────────────────────────────────

function CreateFirmKpiForm({
  departments,
  onCreated,
  onCancel,
}: {
  departments: Array<{ id: number; name: string; partnerName: string | null }>;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CreateFirmKpiInput>({
    name: "",
    description: "",
    sourceModule: "timesheets",
    measurementType: "percentage",
    targetValue: 80,
    unit: "%",
    weight: 100,
    frequency: "monthly",
    formulaType: "ratio",
    scoringType: "higher_better",
    cascadeScope: "all",
    departmentIds: [],
    roleTypes: [],
  });

  const set = (field: keyof CreateFirmKpiInput, value: unknown) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleModuleChange = (mod: string) => {
    set("sourceModule", mod);
    set("unit", MODULE_UNIT[mod] ?? "");
    set("targetValue", MODULE_TARGET[mod] ?? 80);
    set("formulaType", mod === "evaluations" ? "direct" : "ratio");
  };

  const toggleDept = (id: number) => {
    const ids = form.departmentIds ?? [];
    set("departmentIds", ids.includes(id) ? ids.filter((d) => d !== id) : [...ids, id]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const result = await kpiCascadeApi.createFirmKpi(form);
      toast({
        title: "KPI cascaded",
        description: `"${form.name}" was created and pushed to ${result.spawnedCount} employees.`,
      });
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
        <div className="space-y-1.5">
          <Label>KPI Name *</Label>
          <Input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. Billable Hours Utilisation"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>Source Module *</Label>
          <Select value={form.sourceModule} onValueChange={handleModuleChange}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {SOURCE_MODULES.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Target Value *</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={form.targetValue}
              onChange={(e) => set("targetValue", Number(e.target.value))}
              min={0}
              className="flex-1"
            />
            <Input
              value={form.unit}
              onChange={(e) => set("unit", e.target.value)}
              placeholder="unit"
              className="w-16 text-center"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Frequency</Label>
          <Select value={form.frequency ?? "monthly"} onValueChange={(v) => set("frequency", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="quarterly">Quarterly</SelectItem>
              <SelectItem value="annually">Annually</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Description</Label>
        <Input
          value={form.description ?? ""}
          onChange={(e) => set("description", e.target.value)}
          placeholder="Optional — explain why this KPI matters"
        />
      </div>

      {/* Cascade scope */}
      <div className="space-y-2">
        <Label>Cascade To</Label>
        <div className="flex gap-2 flex-wrap">
          {(["all", "by_department", "by_role_type"] as CascadeScope[]).map((scope) => (
            <button
              key={scope}
              type="button"
              onClick={() => set("cascadeScope", scope)}
              className={`px-3 py-1.5 rounded-md border text-sm font-medium transition-colors ${
                form.cascadeScope === scope
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border text-foreground hover:bg-muted"
              }`}
            >
              {scope === "all" ? "All Employees" : scope === "by_department" ? "Specific Departments" : "By Role Type"}
            </button>
          ))}
        </div>
      </div>

      {form.cascadeScope === "by_department" && (
        <div className="space-y-2">
          <Label>Select Departments</Label>
          <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
            {departments.map((dept) => (
              <label key={dept.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50">
                <input
                  type="checkbox"
                  checked={(form.departmentIds ?? []).includes(dept.id)}
                  onChange={() => toggleDept(dept.id)}
                  className="rounded"
                />
                <span className="text-sm flex-1">{dept.name}</span>
                {dept.partnerName && (
                  <span className="text-xs text-muted-foreground">{dept.partnerName}</span>
                )}
              </label>
            ))}
          </div>
        </div>
      )}

      {form.cascadeScope === "by_role_type" && (
        <div className="space-y-2">
          <Label>Role Types</Label>
          <div className="flex gap-2 flex-wrap">
            {(["employee", "manager", "partner"] as const).map((role) => (
              <label key={role} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={(form.roleTypes ?? []).includes(role)}
                  onChange={() => {
                    const roles = form.roleTypes ?? [];
                    set("roleTypes", roles.includes(role) ? roles.filter((r) => r !== role) : [...roles, role]);
                  }}
                  className="rounded"
                />
                <span className="text-sm capitalize">{role}s</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving || !form.name.trim()}>
          {saving ? "Creating…" : "Create & Cascade"}
        </Button>
      </div>
    </form>
  );
}

// ─── Template card with drill-down ───────────────────────────────────────────

function TemplateRow({
  template,
  periods,
  onDeleted,
}: {
  template: FirmKpiTemplate;
  periods: KpiPeriod[];
  onDeleted: () => void;
}) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null);
  const [status, setStatus] = useState<FirmKpiCascadeStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [resyncing, setResyncing] = useState(false);

  const activePeriod = periods.find((p) => p.status === "active" || p.status === "open") ?? periods[0];

  const loadStatus = async (periodId: number) => {
    setLoading(true);
    try {
      const data = await kpiCascadeApi.getFirmKpiStatus(template.id, periodId);
      setStatus(data);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleExpand = () => {
    if (!expanded) {
      const pid = selectedPeriodId ?? activePeriod?.id ?? null;
      if (pid) { setSelectedPeriodId(pid); loadStatus(pid); }
    }
    setExpanded((v) => !v);
  };

  const handlePeriodChange = (id: number) => {
    setSelectedPeriodId(id);
    loadStatus(id);
  };

  const handleResync = async () => {
    setResyncing(true);
    try {
      const result = await kpiCascadeApi.resyncFirmKpi(template.id);
      toast({
        title: "Re-sync complete",
        description: result.created > 0
          ? `${result.created} new employees added, ${result.alreadyExists} already covered.`
          : `All ${result.alreadyExists} employees already have this KPI.`,
      });
      if (selectedPeriodId) loadStatus(selectedPeriodId);
    } catch (err: any) {
      toast({ title: "Re-sync failed", description: err.message, variant: "destructive" });
    } finally {
      setResyncing(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Deactivate "${template.name}" and all ${template.spawnedCount} employee copies?`)) return;
    setDeleting(true);
    try {
      await kpiCascadeApi.deleteFirmKpi(template.id);
      toast({ title: "Template deactivated" });
      onDeleted();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const srcLabel = SOURCE_MODULES.find((m) => m.value === template.sourceModule)?.label ?? template.sourceModule;

  return (
    <div className="border rounded-xl overflow-hidden bg-card">
      {/* Header row */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={handleExpand}
      >
        <span className="text-muted-foreground">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{template.name}</p>
          <p className="text-xs text-muted-foreground">{srcLabel}</p>
        </div>
        <div className="flex items-center gap-4 text-right shrink-0">
          <div>
            <p className="text-xs text-muted-foreground">Target</p>
            <p className="text-sm font-semibold">{template.targetValue}{template.unit}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Employees</p>
            <p className="text-sm font-semibold">{template.spawnedCount}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            title="Re-sync new hires"
            className="h-7 w-7 text-muted-foreground hover:text-primary"
            onClick={(e) => { e.stopPropagation(); handleResync(); }}
            disabled={resyncing}
          >
            <RefreshCw className={`h-4 w-4 ${resyncing ? "animate-spin" : ""}`} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={(e) => { e.stopPropagation(); handleDelete(); }}
            disabled={deleting}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Expanded cascade status */}
      {expanded && (
        <div className="border-t bg-muted/20 px-4 py-4 space-y-4">
          {/* Period selector */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-muted-foreground">Period:</span>
            <Select
              value={String(selectedPeriodId ?? "")}
              onValueChange={(v) => handlePeriodChange(Number(v))}
            >
              <SelectTrigger className="h-8 w-48 text-xs">
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                {periods.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1 text-xs"
              onClick={() => selectedPeriodId && loadStatus(selectedPeriodId)}
              disabled={loading}
            >
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          {loading && <p className="text-sm text-muted-foreground animate-pulse">Loading…</p>}

          {status && !loading && (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Firm Average", value: status.firmAvgScore !== null ? `${status.firmAvgScore}%` : "—", color: "text-foreground" },
                  { label: "On Track", value: status.onTrack, color: "text-emerald-600" },
                  { label: "At Risk", value: status.atRisk, color: "text-amber-600" },
                  { label: "Off Track / No Data", value: status.offTrack + status.noData, color: "text-red-600" },
                ].map((card) => (
                  <div key={card.label} className="rounded-lg border bg-card p-3 text-center">
                    <p className="text-xs text-muted-foreground">{card.label}</p>
                    <p className={`text-xl font-bold mt-1 ${card.color}`}>{card.value}</p>
                  </div>
                ))}
              </div>

              {/* Employee breakdown table */}
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                      <th className="text-left px-3 py-2 font-medium">Employee</th>
                      <th className="text-left px-3 py-2 font-medium">Department</th>
                      <th className="text-right px-3 py-2 font-medium">Score</th>
                      <th className="text-right px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {status.rows.map((row) => (
                      <tr key={row.kpiId} className="hover:bg-muted/20">
                        <td className="px-3 py-2 font-medium">{row.employeeName}</td>
                        <td className="px-3 py-2 text-muted-foreground">{row.departmentName ?? "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">
                          {row.score !== null ? `${row.score}%` : "—"}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span
                            className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${
                              statusColor[row.status] ?? statusColor.no_data
                            }`}
                          >
                            {statusIcon(row.status)}
                            {statusLabel[row.status] ?? row.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {status.rows.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground text-sm">
                          No employee data for this period. Run a sync first.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function FirmKpiManager() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<FirmKpiTemplate[]>([]);
  const [periods, setPeriods] = useState<KpiPeriod[]>([]);
  const [departments, setDepartments] = useState<Array<{ id: number; name: string; partnerName: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const handleSyncAll = async () => {
    setSyncing(true);
    try {
      const result = await kpiCascadeApi.syncAll();
      toast({
        title: "Sync complete",
        description: `${result.periodsProcessed} periods synced — ${result.synced} updated, ${result.skipped} skipped.`,
      });
      setTemplates((prev) => [...prev]); // trigger re-render to refresh counts
    } catch (err: any) {
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      const [tmplRes, pRes, dRes] = await Promise.all([
        kpiCascadeApi.listFirmKpiTemplates(),
        kpiCascadeApi.listPeriods(),
        kpiCascadeApi.listDepartments(),
      ]);
      setTemplates(tmplRes.templates);
      setPeriods(pRes.periods);
      setDepartments(dRes.departments);
    } catch (err: any) {
      toast({ title: "Error loading data", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Firm KPI Templates</h1>
            <p className="text-sm text-muted-foreground">
              Create KPIs at the firm level — they cascade automatically to partners, managers, and employees.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handleSyncAll}
            disabled={syncing}
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing…" : "Sync All Periods"}
          </Button>
          <Button onClick={() => setShowForm(true)} className="gap-2" disabled={showForm}>
            <Plus className="h-4 w-4" />
            New Firm KPI
          </Button>
        </div>
      </div>

      {/* Stats bar */}
      {templates.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Active Templates", value: templates.length },
            { label: "Total Employees Covered", value: templates.reduce((s, t) => s + t.spawnedCount, 0) },
            { label: "Source Modules", value: new Set(templates.map((t) => t.sourceModule)).size },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className="text-2xl font-bold mt-1">{stat.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-base">New Firm KPI</h2>
            <Badge variant="outline" className="text-xs">Will cascade to all matching employees</Badge>
          </div>
          <CreateFirmKpiForm
            departments={departments}
            onCreated={() => { setShowForm(false); loadAll(); }}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {/* Template list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="rounded-xl border h-16 bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : templates.length === 0 && !showForm ? (
        <div className="rounded-xl border border-dashed bg-card px-6 py-12 text-center space-y-3">
          <Building2 className="h-8 w-8 text-muted-foreground mx-auto" />
          <p className="text-sm font-medium">No firm KPI templates yet</p>
          <p className="text-xs text-muted-foreground max-w-xs mx-auto">
            Create a firm-level KPI and it will be automatically cascaded to every employee, partner, and manager in the firm.
          </p>
          <Button size="sm" onClick={() => setShowForm(true)} className="gap-2 mt-2">
            <Plus className="h-4 w-4" /> Create First Firm KPI
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => (
            <TemplateRow
              key={t.id}
              template={t}
              periods={periods}
              onDeleted={loadAll}
            />
          ))}
        </div>
      )}
    </div>
  );
}
