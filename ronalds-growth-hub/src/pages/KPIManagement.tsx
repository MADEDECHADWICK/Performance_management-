import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CheckCircle2, Pencil, Plus, Search, Trash2, XCircle } from "lucide-react";
import KpiCascadeTracker from "@/components/kpi/KpiCascadeTracker";

type KpiAssignmentRecord = {
  id: number;
  employeeProfileId: number;
  targetValue?: number | string | null;
  weight?: number | string | null;
  status?: string | null;
};

type KpiRecord = {
  id: number;
  name: string;
  description?: string | null;
  category?: string | null;
  kpiType?: string | null;
  strategicTheme?: string | null;
  strategicObjective?: string | null;
  criticalSuccessFactor?: string | null;
  targetDescription?: string | null;
  measurementUnit?: string | null;
  targetValue?: number | string | null;
  targetFrequency?: string | null;
  targetType?: string | null;
  baselineText?: string | null;
  weight?: number | string | null;
  redThreshold?: number | string | null;
  amberThreshold?: number | string | null;
  greenThreshold?: number | string | null;
  reviewOwnerProfileId?: number | null;
  isActive?: boolean | null;
  employeeAssignments?: KpiAssignmentRecord[];
};

type ProfileOption = {
  id: number;
  label: string;
  roleName?: string;
  departmentName?: string;
};

type FrameworkForm = {
  name: string;
  description: string;
  category: string;
  ownerProfileId: string;
  baseline: string;
  targetValue: string;
  measurementUnit: string;
  targetFrequency: string;
  weight: string;
  direction: string;
  redThreshold: string;
  amberThreshold: string;
  greenThreshold: string;
  firmInitiative: string;
  teamInitiative: string;
  departmentInitiative: string;
  employeeInitiative: string;
  isActive: boolean;
};

const BSC_PERSPECTIVES = [
  { value: "financial", label: "Financial" },
  { value: "customer", label: "Customer" },
  { value: "internal_processes", label: "Internal Process" },
  { value: "learning_growth", label: "Learning & Growth" },
];

const UPDATE_FREQUENCIES = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Biweekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Annual" },
];

const DIRECTION_OPTIONS = [
  { value: "higher_better", label: "Higher is better" },
  { value: "lower_better", label: "Lower is better" },
  { value: "milestone", label: "Milestone based" },
];

const DEFAULT_FORM: FrameworkForm = {
  name: "",
  description: "",
  category: "financial",
  ownerProfileId: "",
  baseline: "",
  targetValue: "",
  measurementUnit: "",
  targetFrequency: "monthly",
  weight: "",
  direction: "higher_better",
  redThreshold: "",
  amberThreshold: "",
  greenThreshold: "",
  firmInitiative: "",
  teamInitiative: "",
  departmentInitiative: "",
  employeeInitiative: "",
  isActive: true,
};

const extractArray = (payload: any) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
};

const parseMetadata = (value?: string | null): Record<string, string> => {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
  } catch {
    // ignore malformed metadata
  }
  return {};
};

const normalizeCategory = (value?: string | null) => {
  const normalized = String(value || "").toLowerCase().trim();
  if (!normalized) return "financial";
  if (["financial", "finance"].includes(normalized)) return "financial";
  if (["customer", "client"].includes(normalized)) return "customer";
  if (["internal_process", "internal_processes", "process", "operations"].includes(normalized)) {
    return "internal_processes";
  }
  if (["learning", "learning_growth", "learning & growth", "growth"].includes(normalized)) {
    return "learning_growth";
  }
  return normalized;
};

const getOptionLabel = (
  options: Array<{ value: string; label: string }>,
  value?: string | null
) => {
  if (!value) return "Unassigned";
  return options.find((option) => option.value === value)?.label || value;
};

const toInputNumber = (value?: string | number | null) => {
  if (value === undefined || value === null || value === "") return "";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(parsed) : String(value);
};

const toDisplayNumber = (value?: string | number | null) => {
  if (value === undefined || value === null || value === "") return "Not set";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return String(value);
  return parsed.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

const toOptionalNumber = (value: string): number | undefined => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const buildMetadata = (form: FrameworkForm) =>
  JSON.stringify({
    firmInitiative: form.firmInitiative.trim(),
    teamInitiative: form.teamInitiative.trim(),
    departmentInitiative: form.departmentInitiative.trim(),
    employeeInitiative: form.employeeInitiative.trim(),
  });

const getOwnerId = (kpi: KpiRecord) => {
  const assignmentOwner = kpi.employeeAssignments?.[0]?.employeeProfileId;
  if (assignmentOwner) return assignmentOwner;
  if (kpi.reviewOwnerProfileId) return kpi.reviewOwnerProfileId;
  return undefined;
};

const getProfileDisplayName = (profile: any): string => {
  const firstName = String(profile?.firstName || "").trim();
  const lastName = String(profile?.lastName || "").trim();
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  const email = String(profile?.email || profile?.user?.email || "").trim();
  if (fullName) return fullName;
  if (email) return email;
  return `Profile #${profile?.id ?? "unknown"}`;
};

export default function KPIManagement() {
  const { toast } = useToast();
  const { isHR, isAdmin, hasModuleAccess, isLoading: authLoading } = useAuth();
  const canManageCatalog = isHR || isAdmin;

  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<KpiRecord[]>([]);
  const [profileOptions, setProfileOptions] = useState<ProfileOption[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingKpi, setEditingKpi] = useState<KpiRecord | null>(null);
  const [filterText, setFilterText] = useState("");
  const [form, setForm] = useState<FrameworkForm>({ ...DEFAULT_FORM });

  const ownerLookup = useMemo(() => {
    const lookup = new Map<number, ProfileOption>();
    profileOptions.forEach((profile) => lookup.set(profile.id, profile));
    return lookup;
  }, [profileOptions]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      const [kpiResponse, profilesResponse] = await Promise.all([
        apiFetch("GET", "/kpis"),
        apiFetch("GET", "/employees?status=active&page=1&pageSize=200"),
      ]);

      const kpiRows = extractArray(kpiResponse) as KpiRecord[];
      const profileRows = extractArray(profilesResponse);

      const ownerRows: ProfileOption[] = profileRows
        .map((profile: any) => ({
          id: Number(profile?.id),
          label: getProfileDisplayName(profile),
          roleName: String(profile?.role?.name || "").trim() || undefined,
          departmentName: String(profile?.department?.name || "").trim() || undefined,
        }))
        .filter((profile) => Number.isFinite(profile.id) && profile.id > 0)
        .sort((a, b) => a.label.localeCompare(b.label));

      setKpis(kpiRows);
      setProfileOptions(ownerRows);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to load KPI data.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (authLoading) return;
    loadData();
  }, [authLoading, loadData]);

  const openCreate = () => {
    setEditingKpi(null);
    setForm({ ...DEFAULT_FORM });
    setDialogOpen(true);
  };

  const openEdit = (kpi: KpiRecord) => {
    const metadata = parseMetadata(kpi.targetDescription || undefined);
    const ownerId = getOwnerId(kpi);

    setEditingKpi(kpi);
    setForm({
      name: kpi.name || "",
      description: kpi.description || "",
      category: normalizeCategory(kpi.category),
      ownerProfileId: ownerId ? String(ownerId) : "",
      baseline: toInputNumber(kpi.baselineText || metadata.baseline || ""),
      targetValue: toInputNumber(kpi.targetValue),
      measurementUnit: String(kpi.measurementUnit || "").trim(),
      targetFrequency: String(kpi.targetFrequency || "monthly").trim().toLowerCase() || "monthly",
      weight: toInputNumber(kpi.weight),
      direction: String(kpi.targetType || "higher_better").trim().toLowerCase() || "higher_better",
      redThreshold: toInputNumber(kpi.redThreshold),
      amberThreshold: toInputNumber(kpi.amberThreshold),
      greenThreshold: toInputNumber(kpi.greenThreshold),
      firmInitiative: String(metadata.firmInitiative || kpi.strategicTheme || ""),
      teamInitiative: String(metadata.teamInitiative || kpi.strategicObjective || ""),
      departmentInitiative: String(
        metadata.departmentInitiative || kpi.criticalSuccessFactor || ""
      ),
      employeeInitiative: String(metadata.employeeInitiative || ""),
      isActive: kpi.isActive ?? true,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({
        title: "Missing goal",
        description: "Provide the Goal before saving.",
        variant: "destructive",
      });
      return;
    }

    if (!form.description.trim()) {
      toast({
        title: "Missing metric",
        description: "Provide the measurable Metric definition.",
        variant: "destructive",
      });
      return;
    }

    if (!form.category) {
      toast({
        title: "Missing alignment",
        description: "Select a BSC perspective.",
        variant: "destructive",
      });
      return;
    }

    if (!form.ownerProfileId.trim()) {
      toast({
        title: "Missing owner",
        description: "Select a KPI owner to enable assignment and tracking.",
        variant: "destructive",
      });
      return;
    }

    if (!form.measurementUnit.trim()) {
      toast({
        title: "Missing unit",
        description: "Provide a measurement unit (for example %, KES, hours).",
        variant: "destructive",
      });
      return;
    }

    const ownerProfileId = Number(form.ownerProfileId);
    const baseline = Number(form.baseline);
    const targetValue = Number(form.targetValue);
    const weight = Number(form.weight);

    if (!Number.isFinite(ownerProfileId) || ownerProfileId <= 0) {
      toast({
        title: "Invalid owner",
        description: "Select a valid KPI owner profile.",
        variant: "destructive",
      });
      return;
    }

    if (!Number.isFinite(baseline)) {
      toast({
        title: "Invalid baseline",
        description: "Baseline must be a numeric value.",
        variant: "destructive",
      });
      return;
    }

    if (!Number.isFinite(targetValue)) {
      toast({
        title: "Invalid target",
        description: "Target must be a numeric value.",
        variant: "destructive",
      });
      return;
    }

    if (!Number.isFinite(weight) || weight <= 0 || weight > 100) {
      toast({
        title: "Invalid weight",
        description: "Weight must be greater than 0 and up to 100.",
        variant: "destructive",
      });
      return;
    }

    const redThreshold = toOptionalNumber(form.redThreshold);
    const amberThreshold = toOptionalNumber(form.amberThreshold);
    const greenThreshold = toOptionalNumber(form.greenThreshold);

    if (form.redThreshold.trim() && redThreshold === undefined) {
      toast({
        title: "Invalid red threshold",
        description: "Red threshold must be numeric.",
        variant: "destructive",
      });
      return;
    }
    if (form.amberThreshold.trim() && amberThreshold === undefined) {
      toast({
        title: "Invalid amber threshold",
        description: "Amber threshold must be numeric.",
        variant: "destructive",
      });
      return;
    }
    if (form.greenThreshold.trim() && greenThreshold === undefined) {
      toast({
        title: "Invalid green threshold",
        description: "Green threshold must be numeric.",
        variant: "destructive",
      });
      return;
    }

    const payload: any = {
      name: form.name.trim(),
      description: form.description.trim(),
      category: form.category,
      kpiType: "framework_v2",
      strategicTheme: form.firmInitiative.trim() || undefined,
      strategicObjective: form.teamInitiative.trim() || undefined,
      criticalSuccessFactor: form.departmentInitiative.trim() || undefined,
      targetDescription: buildMetadata(form),
      measurementUnit: form.measurementUnit.trim(),
      targetValue,
      targetFrequency: form.targetFrequency,
      targetType: form.direction,
      baselineText: String(baseline),
      weight,
      reviewOwnerProfileId: ownerProfileId,
      redThreshold,
      amberThreshold,
      greenThreshold,
      isActive: form.isActive,
    };

    try {
      if (editingKpi) {
        await apiFetch("PATCH", `/kpis/${editingKpi.id}`, payload);
        toast({
          title: "KPI updated",
          description: `"${form.name}" updated successfully.`,
        });
      } else {
        await apiFetch("POST", "/kpis", {
          ...payload,
          assignmentScope: "individual",
          ownerProfileId,
        });
        toast({
          title: "KPI created",
          description: `"${form.name}" was created and assigned for measurable tracking.`,
        });
      }

      setDialogOpen(false);
      setEditingKpi(null);
      setForm({ ...DEFAULT_FORM });
      await loadData();
    } catch (error: any) {
      toast({
        title: "Save failed",
        description: error?.message || "Unable to save KPI changes.",
        variant: "destructive",
      });
    }
  };

  const handleToggleActive = async (kpi: KpiRecord) => {
    try {
      await apiFetch("PATCH", `/kpis/${kpi.id}`, { isActive: !kpi.isActive });
      await loadData();
    } catch (error: any) {
      toast({
        title: "Update failed",
        description: error?.message || "Unable to update KPI status.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (kpi: KpiRecord) => {
    if (!confirm(`Delete KPI "${kpi.name}"? This cannot be undone.`)) return;
    try {
      await apiFetch("DELETE", `/kpis/${kpi.id}`);
      toast({
        title: "KPI deleted",
        description: `"${kpi.name}" has been removed.`,
      });
      await loadData();
    } catch (error: any) {
      toast({
        title: "Delete failed",
        description: error?.message || "Unable to delete KPI.",
        variant: "destructive",
      });
    }
  };

  const filteredKpis = useMemo(() => {
    const query = filterText.trim().toLowerCase();
    if (!query) return kpis;

    return kpis.filter((kpi) => {
      const metadata = parseMetadata(kpi.targetDescription || undefined);
      const ownerId = getOwnerId(kpi);
      const ownerLabel = ownerId ? ownerLookup.get(ownerId)?.label || `profile ${ownerId}` : "";
      const fields = [
        kpi.name,
        kpi.description,
        kpi.category,
        kpi.kpiType,
        kpi.measurementUnit,
        kpi.targetFrequency,
        kpi.targetType,
        kpi.baselineText,
        kpi.targetValue,
        kpi.weight,
        ownerLabel,
        metadata.firmInitiative,
        metadata.teamInitiative,
        metadata.departmentInitiative,
        metadata.employeeInitiative,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return fields.includes(query);
    });
  }, [filterText, kpis, ownerLookup]);

  if (!hasModuleAccess("kpis", "read")) {
    return (
      <DashboardLayout>
        <Card>
          <CardHeader>
            <CardTitle>Access denied</CardTitle>
            <CardDescription>You do not have KPI access.</CardDescription>
          </CardHeader>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-3xl font-bold text-foreground">KPI Management</h2>
            <p className="text-muted-foreground">
              Framework setup with measurable targets, owner assignment, and BSC alignment.
            </p>
          </div>
          {canManageCatalog && (
            <Button onClick={openCreate} className="gap-2">
              <Plus className="h-4 w-4" />
              Add KPI
            </Button>
          )}
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="relative w-full md:max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search goal, owner, metric, or BSC..."
                  value={filterText}
                  onChange={(event) => setFilterText(event.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">{filteredKpis.length} KPIs</Badge>
                <Badge variant="outline">
                  {filteredKpis.filter((item) => item.isActive !== false).length} active
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>KPI Catalog</CardTitle>
            <CardDescription>
              Each KPI includes owner, quantifiable targets, and cascade design.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 text-center text-muted-foreground">Loading KPIs...</div>
            ) : filteredKpis.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                No KPI entries found. Add your first Goal and Metric.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Goal</TableHead>
                    <TableHead>BSC</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Metric</TableHead>
                    <TableHead>Measure</TableHead>
                    <TableHead>Cascade</TableHead>
                    <TableHead>Status</TableHead>
                    {canManageCatalog && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredKpis.map((kpi) => {
                    const metadata = parseMetadata(kpi.targetDescription || undefined);
                    const ownerId = getOwnerId(kpi);
                    const owner = ownerId ? ownerLookup.get(ownerId) : undefined;
                    const firmInitiative = String(
                      metadata.firmInitiative || kpi.strategicTheme || ""
                    ).trim();
                    const teamInitiative = String(
                      metadata.teamInitiative || kpi.strategicObjective || ""
                    ).trim();
                    const departmentInitiative = String(
                      metadata.departmentInitiative || kpi.criticalSuccessFactor || ""
                    ).trim();
                    const employeeInitiative = String(metadata.employeeInitiative || "").trim();

                    return (
                      <TableRow key={kpi.id}>
                        <TableCell className="align-top">
                          <div className="font-medium">{kpi.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {(kpi.kpiType || "framework_v2").replaceAll("_", " ")}
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          <Badge variant="secondary">
                            {getOptionLabel(BSC_PERSPECTIVES, normalizeCategory(kpi.category))}
                          </Badge>
                        </TableCell>
                        <TableCell className="align-top text-xs">
                          <div className="font-medium">{owner?.label || "Unassigned"}</div>
                          <div className="text-muted-foreground">
                            {owner?.departmentName || "No department"}
                          </div>
                        </TableCell>
                        <TableCell className="align-top text-sm">
                          {kpi.description || "No metric defined"}
                        </TableCell>
                        <TableCell className="align-top text-xs">
                          <div>
                            <span className="font-medium">Baseline:</span>{" "}
                            {toDisplayNumber(kpi.baselineText)}
                          </div>
                          <div>
                            <span className="font-medium">Target:</span>{" "}
                            {toDisplayNumber(kpi.targetValue)} {kpi.measurementUnit || ""}
                          </div>
                          <div>
                            <span className="font-medium">Cadence:</span>{" "}
                            {getOptionLabel(UPDATE_FREQUENCIES, kpi.targetFrequency)}
                          </div>
                          <div>
                            <span className="font-medium">Weight:</span>{" "}
                            {toDisplayNumber(kpi.weight)}%
                          </div>
                        </TableCell>
                        <TableCell className="align-top text-sm">
                          <div className="text-xs">
                            <span className="font-medium">Firm:</span> {firmInitiative || "Not set"}
                          </div>
                          <div className="text-xs">
                            <span className="font-medium">Team:</span> {teamInitiative || "Not set"}
                          </div>
                          <div className="text-xs">
                            <span className="font-medium">Dept:</span>{" "}
                            {departmentInitiative || "Not set"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            <span className="font-medium">Employee:</span>{" "}
                            {employeeInitiative || "Not set"}
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          {kpi.isActive !== false ? (
                            <Badge className="bg-emerald-100 text-emerald-700">Active</Badge>
                          ) : (
                            <Badge variant="outline">Inactive</Badge>
                          )}
                        </TableCell>
                        {canManageCatalog && (
                          <TableCell className="align-top text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button size="sm" variant="outline" onClick={() => openEdit(kpi)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleToggleActive(kpi)}
                              >
                                {kpi.isActive !== false ? (
                                  <XCircle className="h-4 w-4" />
                                ) : (
                                  <CheckCircle2 className="h-4 w-4" />
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleDelete(kpi)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <KpiCascadeTracker
          kpis={kpis.map((kpi) => ({
            id: kpi.id,
            name: kpi.name,
            category: kpi.category || null,
          }))}
        />

        {canManageCatalog && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent className="max-w-4xl">
              <DialogHeader>
                <DialogTitle>{editingKpi ? "Edit KPI" : "Create KPI"}</DialogTitle>
                <DialogDescription>
                  Framework-only setup with measurable fields: Goal, Metric, BSC perspective,
                  owner, targets, and cascade initiatives.
                </DialogDescription>
              </DialogHeader>

              <div className="max-h-[70vh] space-y-6 overflow-y-auto pr-2">
                <Card>
                  <CardHeader>
                    <CardTitle>KPI Design Framework</CardTitle>
                    <CardDescription>
                      Capture the cascade framework fields with BSC alignment.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <Label>Goal</Label>
                    <Input
                      value={form.name}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, name: event.target.value }))
                      }
                      placeholder="Example: Improve Client Delivery"
                    />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label>Metric</Label>
                    <Textarea
                      value={form.description}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, description: event.target.value }))
                      }
                      placeholder="Example: % on-time client delivery"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>BSC Perspective</Label>
                    <Select
                      value={form.category}
                      onValueChange={(value) => setForm((prev) => ({ ...prev, category: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select perspective" />
                      </SelectTrigger>
                      <SelectContent>
                        {BSC_PERSPECTIVES.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Measurability and Ownership</CardTitle>
                  <CardDescription>
                    Define who owns the KPI and how progress will be quantified and tracked.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <Label>KPI Owner</Label>
                    <Select
                      value={form.ownerProfileId || undefined}
                      onValueChange={(value) =>
                        setForm((prev) => ({ ...prev, ownerProfileId: value }))
                      }
                      disabled={Boolean(editingKpi)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select KPI owner" />
                      </SelectTrigger>
                      <SelectContent>
                        {profileOptions.map((option) => (
                          <SelectItem key={option.id} value={String(option.id)}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {editingKpi && (
                      <p className="text-xs text-muted-foreground">
                        Owner is locked after creation. Use reassignment workflow for ownership
                        transfers.
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Baseline</Label>
                    <Input
                      type="number"
                      value={form.baseline}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, baseline: event.target.value }))
                      }
                      placeholder="0"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Target</Label>
                    <Input
                      type="number"
                      value={form.targetValue}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, targetValue: event.target.value }))
                      }
                      placeholder="100"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Measurement Unit</Label>
                    <Input
                      value={form.measurementUnit}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, measurementUnit: event.target.value }))
                      }
                      placeholder="Percent, KES, hours"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Update Frequency</Label>
                    <Select
                      value={form.targetFrequency}
                      onValueChange={(value) =>
                        setForm((prev) => ({ ...prev, targetFrequency: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select frequency" />
                      </SelectTrigger>
                      <SelectContent>
                        {UPDATE_FREQUENCIES.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Weight (%)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={form.weight}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, weight: event.target.value }))
                      }
                      placeholder="20"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Direction</Label>
                    <Select
                      value={form.direction}
                      onValueChange={(value) => setForm((prev) => ({ ...prev, direction: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select direction" />
                      </SelectTrigger>
                      <SelectContent>
                        {DIRECTION_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Red Threshold (Optional)</Label>
                    <Input
                      type="number"
                      value={form.redThreshold}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, redThreshold: event.target.value }))
                      }
                      placeholder="60"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Amber Threshold (Optional)</Label>
                    <Input
                      type="number"
                      value={form.amberThreshold}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, amberThreshold: event.target.value }))
                      }
                      placeholder="80"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Green Threshold (Optional)</Label>
                    <Input
                      type="number"
                      value={form.greenThreshold}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, greenThreshold: event.target.value }))
                      }
                      placeholder="100"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Cascade Initiatives</CardTitle>
                  <CardDescription>
                    Keep each initiative clear for the HR to employee cascade.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4">
                  <div className="space-y-2">
                    <Label>Firm Initiative (HR)</Label>
                    <Textarea
                      value={form.firmInitiative}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, firmInitiative: event.target.value }))
                      }
                      placeholder="Firm-level initiative for this metric"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Team Initiative (Partner)</Label>
                    <Textarea
                      value={form.teamInitiative}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, teamInitiative: event.target.value }))
                      }
                      placeholder="Partner/team cascade initiative"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Department Initiative (Manager)</Label>
                    <Textarea
                      value={form.departmentInitiative}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, departmentInitiative: event.target.value }))
                      }
                      placeholder="Manager/department cascade initiative"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Employee Initiative</Label>
                    <Textarea
                      value={form.employeeInitiative}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, employeeInitiative: event.target.value }))
                      }
                      placeholder="Employee-level initiative outcome"
                    />
                  </div>
                </CardContent>
              </Card>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <div className="font-medium">Active KPI</div>
                  <div className="text-xs text-muted-foreground">
                    Inactive KPIs stay in history but do not score.
                  </div>
                </div>
                <Switch
                  checked={form.isActive}
                  onCheckedChange={(value) => setForm((prev) => ({ ...prev, isActive: value }))}
                />
              </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSave}>{editingKpi ? "Update KPI" : "Create KPI"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </DashboardLayout>
  );
}
