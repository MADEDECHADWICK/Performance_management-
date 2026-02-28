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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Pencil,
  Plus,
  Search,
  Trash2,
  XCircle,
} from "lucide-react";

type Department = {
  id: number;
  name: string;
  description?: string;
};

type PositionRole = {
  id: number;
  positionLevel?: string;
  name?: string;
};

type EmployeeProfile = {
  id: number;
  firstName: string;
  lastName: string;
  departmentId?: number | null;
  roleId?: number | null;
  department?: {
    id: number;
    name: string;
  } | null;
  role?: {
    id: number;
    name: string;
  } | null;
  user?: {
    email?: string;
  } | null;
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
  indicatorType?: string | null;
  kpiCategory?: string | null;
  measurementUnit?: string | null;
  targetValue?: number | string | null;
  targetFrequency?: string | null;
  targetDescription?: string | null;
  targetType?: string | null;
  targetText?: string | null;
  baselineText?: string | null;
  redThreshold?: number | string | null;
  amberThreshold?: number | string | null;
  greenThreshold?: number | string | null;
  weight?: number | string | null;
  departmentId?: number | null;
  roleId?: number | null;
  parentKpiId?: number | null;
  reviewOwnerProfileId?: number | null;
  reviewFrequency?: string | null;
  approvalRequired?: boolean | null;
  evidenceRequired?: boolean | null;
  commentaryRequired?: boolean | null;
  dataSourceType?: string | null;
  sourceReference?: string | null;
  formulaLocked?: boolean | null;
  rollupMethod?: string | null;
  inheritWeight?: boolean | null;
  isActive?: boolean | null;
  department?: Department | null;
  role?: PositionRole | null;
  createdAt?: string;
};

type FrameworkMetricDefinition = {
  key: string;
  name: string;
  level: string;
  perspective: string;
  owner: string;
  unit: string;
  frequency: string;
  direction: string;
  dataSignals?: string[];
};

const BSC_PERSPECTIVES = [
  { value: "financial", label: "Financial" },
  { value: "customer", label: "Customer" },
  { value: "internal_processes", label: "Internal Process" },
  { value: "learning_growth", label: "Learning & Growth" },
];

const PYRAMID_LEVELS = [
  { value: "l1_corporate_vision", label: "L1 Corporate Vision" },
  { value: "l2_business_unit", label: "L2 Business Unit" },
  { value: "l3_operations", label: "L3 Operations" },
  { value: "l4_people_capability", label: "L4 People & Capability" },
];

const DRIVER_OPTIONS = [
  { value: "customer_satisfaction", label: "Customer Satisfaction" },
  { value: "flexibility", label: "Flexibility" },
  { value: "productivity", label: "Productivity" },
  { value: "quality", label: "Quality" },
  { value: "delivery", label: "Delivery" },
  { value: "cycle_time", label: "Cycle Time" },
  { value: "waste", label: "Waste Reduction" },
];

const MEASUREMENT_TYPES = [
  { value: "cumulative", label: "Cumulative" },
  { value: "average", label: "Average" },
  { value: "latest", label: "Latest Value" },
];

const AGGREGATION_LEVELS = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Annual" },
];

const DIRECTION_OPTIONS = [
  { value: "increase", label: "Increase is better" },
  { value: "decrease", label: "Decrease is better" },
  { value: "maintain", label: "Maintain target" },
];

const INDICATOR_TYPES = [
  { value: "leading", label: "Leading" },
  { value: "lagging", label: "Lagging" },
  { value: "diagnostic", label: "Diagnostic" },
];

const TARGET_TYPES = [
  { value: "numeric", label: "Numeric" },
  { value: "percentage", label: "Percentage" },
  { value: "rating", label: "Rating / Scale" },
  { value: "yes_no", label: "Yes / No" },
  { value: "milestone", label: "Milestone" },
  { value: "qualitative", label: "Qualitative" },
];

const KPI_CATEGORIES = [
  { value: "financial", label: "Financial" },
  { value: "quality", label: "Quality" },
  { value: "risk", label: "Risk" },
  { value: "compliance", label: "Compliance" },
  { value: "people", label: "People" },
  { value: "client", label: "Client" },
];

const DATA_SOURCE_TYPES = [
  { value: "system", label: "System-integrated" },
  { value: "manual", label: "Manual entry" },
  { value: "api", label: "API source" },
];

const REVIEW_FREQUENCIES = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Annual" },
  { value: "ad_hoc", label: "Ad hoc" },
];

const ROLLUP_METHODS = [
  { value: "sum", label: "Sum" },
  { value: "average", label: "Average" },
  { value: "weighted_average", label: "Weighted average" },
  { value: "min", label: "Minimum" },
  { value: "max", label: "Maximum" },
  { value: "latest", label: "Latest value" },
  { value: "manual", label: "Manual roll-up" },
];

const ASSIGNMENT_SCOPES = [
  { value: "individual", label: "Individual KPI" },
  { value: "department", label: "Department KPI" },
];

const DEFAULT_FORM = {
  name: "",
  description: "",
  frameworkMetricKey: "",
  category: "financial",
  pyramidLevel: "l3_operations",
  assignmentScope: "individual",
  initiativesText: "",
  driver: "",
  strategicTheme: "",
  strategicObjective: "",
  criticalSuccessFactor: "",
  initiative: "",
  ownerProfileId: "",
  ownerName: "",
  kpiSignal: "leading",
  kpiCategory: "",
  measurementUnit: "",
  measurementType: "",
  aggregationLevel: "monthly",
  direction: "increase",
  dataSource: "",
  dataSourceType: "manual",
  sourceReference: "",
  formulaLocked: false,
  formula: "",
  targetValue: "",
  targetFrequency: "monthly",
  targetType: "numeric",
  targetText: "",
  baselineValue: "",
  baselineText: "",
  redThreshold: "",
  amberThreshold: "",
  greenThreshold: "",
  useToleranceBands: false,
  weight: "",
  departmentId: "",
  roleId: "",
  parentKpiId: "",
  rollupMethod: "weighted_average",
  inheritWeight: true,
  reviewOwnerProfileId: "",
  reviewFrequency: "quarterly",
  approvalRequired: false,
  evidenceRequired: false,
  commentaryRequired: false,
  notes: "",
  isActive: true,
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

const normalizePyramid = (value?: string | null) => {
  const normalized = String(value || "").toLowerCase().trim();
  if (!normalized) return "l3_operations";
  if (["l1", "l1_corporate_vision", "corporate_vision", "vision"].includes(normalized)) {
    return "l1_corporate_vision";
  }
  if (["l2", "l2_business_unit", "business_unit"].includes(normalized)) {
    return "l2_business_unit";
  }
  if (["l3", "l3_operations", "operations"].includes(normalized)) {
    return "l3_operations";
  }
  if (["l4", "l4_people_capability", "people_capability", "people"].includes(normalized)) {
    return "l4_people_capability";
  }
  return normalized;
};

const normalizeAssignmentScope = (value?: string | null) => {
  const normalized = String(value || "")
    .toLowerCase()
    .trim();
  if (normalized === "department") return "department";
  return "individual";
};

const normalizeTargetType = (value?: string | null) => {
  const normalized = String(value || "")
    .toLowerCase()
    .trim();
  if (["numeric", "number"].includes(normalized)) return "numeric";
  if (["percent", "percentage"].includes(normalized)) return "percentage";
  if (["rating", "scale", "score"].includes(normalized)) return "rating";
  if (["yes_no", "yes/no", "boolean"].includes(normalized)) return "yes_no";
  if (["milestone", "milestones"].includes(normalized)) return "milestone";
  if (["qualitative", "text"].includes(normalized)) return "qualitative";
  return "numeric";
};

const mapFrameworkPerspectiveToCategory = (value?: string | null) => {
  const normalized = String(value || "").toLowerCase().trim();
  if (normalized === "internal_process") return "internal_processes";
  return normalizeCategory(normalized);
};

const mapFrameworkLevelToPyramid = (value?: string | null) => {
  const normalized = String(value || "").toLowerCase().trim();
  if (normalized === "level_1_corporate_vision") return "l1_corporate_vision";
  if (normalized === "level_2_business_unit") return "l2_business_unit";
  if (normalized === "level_3_operational_systems") return "l3_operations";
  if (normalized === "level_4_people_capability") return "l4_people_capability";
  return normalizePyramid(normalized);
};

const isNumericTargetType = (value?: string | null) =>
  ["numeric", "percentage", "rating"].includes(String(value || "").toLowerCase().trim());

const getOptionLabel = (options: Array<{ value: string; label: string }>, value?: string | null) => {
  if (!value) return "Unassigned";
  return options.find((option) => option.value === value)?.label || value;
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
    // fall through
  }
  return { notes: value };
};

const parseInitiativesText = (value: string) =>
  value
    .split(/\r?\n/)
    .map((row) => row.trim())
    .map((row) => row.replace(/^(\d+[.)]\s*|[-*]\s*)/, "").trim())
    .filter(Boolean)
    .map((row) => {
      const [titleRaw, weightRaw] = row.split("|").map((part) => part.trim());
      const weightNumber = Number(weightRaw);
      return {
        title: titleRaw,
        weight:
          weightRaw && Number.isFinite(weightNumber)
            ? weightNumber
            : undefined,
      };
    })
    .filter((item) => item.title);

const buildTargetDescription = (form: typeof DEFAULT_FORM) => {
  const metadata: Record<string, string> = {
    frameworkMetricKey: form.frameworkMetricKey,
    initiativesText: form.initiativesText,
    assignmentScope: form.assignmentScope,
    strategicTheme: form.strategicTheme,
    driver: form.driver,
    strategicObjective: form.strategicObjective,
    criticalSuccessFactor: form.criticalSuccessFactor,
    initiative: form.initiative,
    ownerProfileId: form.ownerProfileId,
    ownerName: form.ownerName,
    indicatorType: form.kpiSignal,
    kpiCategory: form.kpiCategory,
    measurementType: form.measurementType,
    aggregationLevel: form.aggregationLevel,
    direction: form.direction,
    dataSource: form.dataSource,
    dataSourceType: form.dataSourceType,
    sourceReference: form.sourceReference,
    formula: form.formula,
    targetType: form.targetType,
    targetText: form.targetText,
    baselineValue: form.baselineValue,
    baselineText: form.baselineText,
    notes: form.notes,
  };

  const entries = Object.entries(metadata).filter(
    ([, value]) => value !== undefined && value !== null && String(value).trim() !== ""
  );

  if (entries.length === 0) return undefined;
  return JSON.stringify(Object.fromEntries(entries));
};

export default function KPIManagement() {
  const { toast } = useToast();
  const { isHR, isAdmin, isLoading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<KpiRecord[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [frameworkMetrics, setFrameworkMetrics] = useState<FrameworkMetricDefinition[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingKpi, setEditingKpi] = useState<KpiRecord | null>(null);
  const [filterText, setFilterText] = useState("");
  const [form, setForm] = useState({ ...DEFAULT_FORM });
  const [showAdvancedFields, setShowAdvancedFields] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [kpiResponse, departmentsResponse, employeesResponse, frameworkResponse] = await Promise.all([
        apiFetch("GET", "/kpis"),
        apiFetch("GET", "/departments?page=1&pageSize=200"),
        apiFetch("GET", "/employees?page=1&pageSize=200&status=active"),
        apiFetch("GET", "/performance-framework/metrics"),
      ]);

      setKpis(extractArray(kpiResponse));
      setDepartments(extractArray(departmentsResponse));
      setEmployees(extractArray(employeesResponse));
      setFrameworkMetrics(extractArray(frameworkResponse));
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
    setShowAdvancedFields(false);
    setDialogOpen(true);
  };

  const openEdit = (kpi: KpiRecord) => {
    const metadata = parseMetadata(kpi.targetDescription || undefined);
    const storedScope = normalizeAssignmentScope((metadata as any).assignmentScope);
    const inferredScope =
      storedScope === "department"
        ? "department"
        : metadata.ownerProfileId
        ? "individual"
        : kpi.departmentId
        ? "department"
        : "individual";
    const inferredTargetType = normalizeTargetType(
      (metadata as any).targetType ||
        (kpi.targetValue !== null && kpi.targetValue !== undefined ? "numeric" : "qualitative")
    );
    setEditingKpi(kpi);
    setForm({
      ...DEFAULT_FORM,
      name: kpi.name || "",
      description: kpi.description || "",
      frameworkMetricKey: String((metadata as any).frameworkMetricKey || ""),
      category: normalizeCategory(kpi.category),
      pyramidLevel: normalizePyramid(kpi.kpiType),
      assignmentScope: inferredScope,
      initiativesText: String((metadata as any).initiativesText || ""),
      strategicTheme: kpi.strategicTheme || String((metadata as any).strategicTheme || ""),
      measurementUnit: kpi.measurementUnit || "",
      targetValue: kpi.targetValue ? String(kpi.targetValue) : "",
      targetFrequency: kpi.targetFrequency || "monthly",
      targetType: inferredTargetType,
      targetText: kpi.targetText || String((metadata as any).targetText || ""),
      kpiCategory: kpi.kpiCategory || String((metadata as any).kpiCategory || ""),
      weight: kpi.weight ? String(kpi.weight) : "",
      departmentId: kpi.departmentId ? String(kpi.departmentId) : "",
      roleId: kpi.roleId ? String(kpi.roleId) : "",
      parentKpiId: kpi.parentKpiId ? String(kpi.parentKpiId) : "",
      rollupMethod: kpi.rollupMethod || "weighted_average",
      inheritWeight: kpi.inheritWeight ?? true,
      reviewOwnerProfileId: kpi.reviewOwnerProfileId ? String(kpi.reviewOwnerProfileId) : "",
      reviewFrequency: kpi.reviewFrequency || "quarterly",
      approvalRequired: kpi.approvalRequired ?? false,
      evidenceRequired: kpi.evidenceRequired ?? false,
      commentaryRequired: kpi.commentaryRequired ?? false,
      dataSourceType: kpi.dataSourceType || String((metadata as any).dataSourceType || "manual"),
      sourceReference: kpi.sourceReference || String((metadata as any).sourceReference || ""),
      formulaLocked: kpi.formulaLocked ?? false,
      isActive: kpi.isActive ?? true,
      driver: String((metadata as any).driver || ""),
      strategicObjective: kpi.strategicObjective || String((metadata as any).strategicObjective || ""),
      criticalSuccessFactor:
        kpi.criticalSuccessFactor || String((metadata as any).criticalSuccessFactor || ""),
      initiative: String((metadata as any).initiative || ""),
      ownerProfileId: String((metadata as any).ownerProfileId || ""),
      ownerName: String((metadata as any).ownerName || ""),
      kpiSignal:
        kpi.indicatorType ||
        String((metadata as any).indicatorType || (metadata as any).kpiSignal || "leading"),
      measurementType: String((metadata as any).measurementType || ""),
      aggregationLevel: String(
        (metadata as any).aggregationLevel || kpi.targetFrequency || "monthly"
      ),
      direction: String((metadata as any).direction || "increase"),
      dataSource: String((metadata as any).dataSource || ""),
      formula: String((metadata as any).formula || ""),
      baselineValue: String((metadata as any).baselineValue || ""),
      baselineText: kpi.baselineText || String((metadata as any).baselineText || ""),
      redThreshold: kpi.redThreshold ? String(kpi.redThreshold) : "",
      amberThreshold: kpi.amberThreshold ? String(kpi.amberThreshold) : "",
      greenThreshold: kpi.greenThreshold ? String(kpi.greenThreshold) : "",
      useToleranceBands: Boolean(
        kpi.redThreshold ||
          kpi.amberThreshold ||
          kpi.greenThreshold
      ),
      notes: String((metadata as any).notes || ""),
    });
    setShowAdvancedFields(true);
    setDialogOpen(true);
  };

  const parseNumber = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const formatEmployeeName = (employee?: EmployeeProfile | null) => {
    if (!employee) return "";
    return `${employee.firstName} ${employee.lastName}`.trim();
  };

  const employeeById = useMemo(() => {
    const map = new Map<number, EmployeeProfile>();
    employees.forEach((employee) => {
      map.set(employee.id, employee);
    });
    return map;
  }, [employees]);

  const frameworkMetricByKey = useMemo(() => {
    const map = new Map<string, FrameworkMetricDefinition>();
    frameworkMetrics.forEach((metric) => {
      if (metric?.key) {
        map.set(metric.key, metric);
      }
    });
    return map;
  }, [frameworkMetrics]);

  const selectedFrameworkMetric = form.frameworkMetricKey
    ? frameworkMetricByKey.get(form.frameworkMetricKey)
    : undefined;

  const selectedOwner = form.ownerProfileId
    ? employeeById.get(Number(form.ownerProfileId))
    : undefined;
  const selectedDepartment = form.departmentId
    ? departments.find((department) => department.id === Number(form.departmentId))
    : undefined;
  const departmentMemberCount = form.departmentId
    ? employees.filter((employee) => employee.departmentId === Number(form.departmentId)).length
    : 0;

  const handleAssignmentScopeChange = (value: string) => {
    const scope = normalizeAssignmentScope(value);
    setForm((prev) => ({
      ...prev,
      assignmentScope: scope,
      ownerProfileId: scope === "department" ? "" : prev.ownerProfileId,
      ownerName: scope === "department" ? "" : prev.ownerName,
      roleId: scope === "department" ? "" : prev.roleId,
    }));
  };

  const handleFrameworkMetricChange = (value: string) => {
    const metric = frameworkMetricByKey.get(value);
    if (!metric) {
      setForm((prev) => ({ ...prev, frameworkMetricKey: "" }));
      return;
    }

    setForm((prev) => ({
      ...prev,
      frameworkMetricKey: value,
      name: metric.name,
      category: mapFrameworkPerspectiveToCategory(metric.perspective),
      pyramidLevel: mapFrameworkLevelToPyramid(metric.level),
      measurementUnit: metric.unit || prev.measurementUnit,
      aggregationLevel: metric.frequency || prev.aggregationLevel,
      targetFrequency: metric.frequency || prev.targetFrequency,
      kpiSignal: metric.direction === "lower_better" ? "lagging" : prev.kpiSignal,
      description:
        prev.description.trim() ||
        `Aligned to framework metric "${metric.name}".`,
    }));
  };

  const handleCadenceChange = (value: string) => {
    setForm((prev) => ({
      ...prev,
      aggregationLevel: value,
      targetFrequency: value,
    }));
  };

  const handleTargetTypeChange = (value: string) => {
    const normalized = normalizeTargetType(value);
    setForm((prev) => ({
      ...prev,
      targetType: normalized,
      targetText: isNumericTargetType(normalized) ? "" : prev.targetText,
      baselineText: isNumericTargetType(normalized) ? "" : prev.baselineText,
      targetValue: isNumericTargetType(normalized) ? prev.targetValue : "",
      baselineValue: isNumericTargetType(normalized) ? prev.baselineValue : "",
      useToleranceBands: isNumericTargetType(normalized)
        ? prev.useToleranceBands
        : false,
      redThreshold: isNumericTargetType(normalized) ? prev.redThreshold : "",
      amberThreshold: isNumericTargetType(normalized) ? prev.amberThreshold : "",
      greenThreshold: isNumericTargetType(normalized) ? prev.greenThreshold : "",
    }));
  };

  const handleDepartmentChange = (value: string) => {
    setForm((prev) => ({
      ...prev,
      departmentId: value,
      ...(prev.assignmentScope === "department"
        ? {
            ownerProfileId: "",
            ownerName: "",
            roleId: "",
          }
        : {}),
    }));
  };

  const handleOwnerChange = (value: string) => {
    const ownerId = Number(value);
    const owner = employeeById.get(ownerId);
    setForm((prev) => ({
      ...prev,
      ownerProfileId: value,
      ownerName: formatEmployeeName(owner),
      roleId: owner?.roleId ? String(owner.roleId) : "",
      departmentId: owner?.departmentId ? String(owner.departmentId) : prev.departmentId,
    }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({
        title: "Missing KPI name",
        description: "Please provide a KPI name before saving.",
        variant: "destructive",
      });
      return;
    }

    if (!form.category || !form.pyramidLevel) {
      toast({
        title: "Missing alignment",
        description: "Select a BSC perspective and a pyramid level.",
        variant: "destructive",
      });
      return;
    }

    const numericTarget = isNumericTargetType(form.targetType);
    const targetValue = numericTarget ? parseNumber(form.targetValue) : undefined;
    if (numericTarget && form.targetValue && targetValue === undefined) {
      toast({
        title: "Invalid target value",
        description: "Target value must be a valid number.",
        variant: "destructive",
      });
      return;
    }

    if (!numericTarget && !form.targetText.trim()) {
      toast({
        title: "Missing target statement",
        description: "Provide a qualitative target statement for non-numeric KPIs.",
        variant: "destructive",
      });
      return;
    }

    const weight = parseNumber(form.weight);
    if (form.weight && weight === undefined) {
      toast({
        title: "Invalid weight",
        description: "Weight must be a valid number.",
        variant: "destructive",
      });
      return;
    }

    const assignmentScope = normalizeAssignmentScope(form.assignmentScope);

    if (assignmentScope === "individual" && !form.ownerProfileId) {
      toast({
        title: "Missing KPI owner",
        description: "Select an employee owner for an individual KPI.",
        variant: "destructive",
      });
      return;
    }

    if (assignmentScope === "department" && !form.departmentId) {
      toast({
        title: "Missing department",
        description: "Select a department for a department KPI.",
        variant: "destructive",
      });
      return;
    }

    const ownerProfileId =
      assignmentScope === "individual" && form.ownerProfileId
        ? Number(form.ownerProfileId)
        : undefined;
    const ownerProfile = ownerProfileId ? employeeById.get(ownerProfileId) : undefined;
    const ownerName = ownerProfile ? formatEmployeeName(ownerProfile) : form.ownerName;
    const resolvedDepartmentId = form.departmentId
      ? Number(form.departmentId)
      : ownerProfile?.departmentId ?? undefined;
    const resolvedRoleId =
      assignmentScope === "individual"
        ? ownerProfile?.roleId
          ? ownerProfile.roleId
          : form.roleId
          ? Number(form.roleId)
          : undefined
        : undefined;
    const resolvedCadence = form.aggregationLevel || form.targetFrequency || undefined;
    const useToleranceBands = numericTarget && form.useToleranceBands;
    const redThreshold = useToleranceBands ? parseNumber(form.redThreshold) : undefined;
    const amberThreshold = useToleranceBands ? parseNumber(form.amberThreshold) : undefined;
    const greenThreshold = useToleranceBands ? parseNumber(form.greenThreshold) : undefined;
    if (useToleranceBands) {
      const thresholdFields = [
        { label: "Red threshold", value: form.redThreshold, parsed: redThreshold },
        { label: "Amber threshold", value: form.amberThreshold, parsed: amberThreshold },
        { label: "Green threshold", value: form.greenThreshold, parsed: greenThreshold },
      ];
      for (const threshold of thresholdFields) {
        if (threshold.value && threshold.parsed === undefined) {
          toast({
            title: "Invalid threshold",
            description: `${threshold.label} must be a valid number.`,
            variant: "destructive",
          });
          return;
        }
      }
    }
    const targetDescription = buildTargetDescription({
      ...form,
      assignmentScope,
      ownerProfileId: ownerProfileId ? String(ownerProfileId) : form.ownerProfileId,
      ownerName: assignmentScope === "individual" ? ownerName : "",
    });

    const payload: any = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      category: form.category,
      kpiType: form.pyramidLevel,
      strategicTheme: form.strategicTheme.trim() || undefined,
      strategicObjective: form.strategicObjective.trim() || undefined,
      criticalSuccessFactor: form.criticalSuccessFactor.trim() || undefined,
      indicatorType: form.kpiSignal || undefined,
      kpiCategory: form.kpiCategory || undefined,
      measurementUnit: form.measurementUnit.trim() || undefined,
      targetValue,
      targetFrequency: resolvedCadence,
      targetDescription,
      targetType: form.targetType || undefined,
      targetText: numericTarget ? undefined : form.targetText.trim() || undefined,
      baselineText: numericTarget ? undefined : form.baselineText.trim() || undefined,
      redThreshold: useToleranceBands ? redThreshold : null,
      amberThreshold: useToleranceBands ? amberThreshold : null,
      greenThreshold: useToleranceBands ? greenThreshold : null,
      weight,
      departmentId: resolvedDepartmentId,
      roleId: resolvedRoleId,
      parentKpiId: form.parentKpiId ? Number(form.parentKpiId) : undefined,
      rollupMethod: form.rollupMethod || undefined,
      inheritWeight: form.inheritWeight,
      reviewOwnerProfileId: form.reviewOwnerProfileId
        ? Number(form.reviewOwnerProfileId)
        : undefined,
      reviewFrequency: form.reviewFrequency || undefined,
      approvalRequired: form.approvalRequired,
      evidenceRequired: form.evidenceRequired,
      commentaryRequired: form.commentaryRequired,
      dataSourceType: form.dataSourceType || undefined,
      sourceReference: form.sourceReference.trim() || undefined,
      formulaLocked: form.formulaLocked,
      isActive: form.isActive,
      assignmentScope,
      ownerProfileId,
      autoAssignDepartment: assignmentScope === "department",
    };

    const initiatives = parseInitiativesText(form.initiativesText);
    if (!editingKpi && initiatives.length > 0) {
      payload.initiatives = initiatives;
    }

    try {
      if (editingKpi) {
        await apiFetch("PATCH", `/kpis/${editingKpi.id}`, payload);
        toast({
          title: "KPI updated",
          description: `"${form.name}" updated successfully.`,
        });
      } else {
        const created = await apiFetch("POST", "/kpis", payload);
        const assignedCount = Number(created?.assignmentSummary?.assignedCount || 0);
        const createdObjectiveCount = Number(
          created?.initiativeSummary?.createdObjectiveCount || 0
        );
        const assignmentLabel =
          assignmentScope === "department" ? "department members" : "employee";
        const baseMessage =
          assignedCount > 0
            ? `"${form.name}" created and assigned to ${assignedCount} ${assignmentLabel}.`
            : `"${form.name}" has been added to the catalog.`;

        const initiativeMessage =
          initiatives.length === 0
            ? ""
            : createdObjectiveCount > 0
            ? ` ${createdObjectiveCount} linked goal objective(s) were generated from initiatives.`
            : " Initiatives were saved, but no objective owners were available for auto-creation.";

        toast({
          title: "KPI created",
          description: `${baseMessage}${initiativeMessage}`,
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
      const fields = [
        kpi.name,
        kpi.description,
        kpi.category,
        kpi.kpiType,
        kpi.department?.name,
        kpi.role?.positionLevel,
        kpi.role?.name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return fields.includes(query);
    });
  }, [filterText, kpis]);

  if (!isHR && !isAdmin) {
    return (
      <DashboardLayout>
        <Card>
          <CardHeader>
            <CardTitle>Access denied</CardTitle>
            <CardDescription>Only HR/Admin can manage KPIs.</CardDescription>
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
              Build KPIs aligned to BSC perspectives and the Performance Pyramid.
            </p>
          </div>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            Add KPI
          </Button>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="relative w-full md:max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search KPIs, owners, or alignment..."
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
              Each KPI links to a BSC perspective and a pyramid level for audit-ready alignment.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 text-center text-muted-foreground">Loading KPIs...</div>
            ) : filteredKpis.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                No KPIs found. Add your first KPI to start aligning performance.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>KPI</TableHead>
                    <TableHead>Alignment</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredKpis.map((kpi) => {
                    const targetValue = kpi.targetValue ?? "";
                    const metadata = parseMetadata(kpi.targetDescription || undefined);
                    const targetType = normalizeTargetType(
                      kpi.targetType || (metadata as any).targetType
                    );
                    const targetText = String(
                      (kpi.targetText ?? (metadata as any).targetText) || ""
                    ).trim();
                    const assignmentScope = normalizeAssignmentScope(
                      (metadata as any).assignmentScope ||
                        (metadata.ownerProfileId ? "individual" : kpi.departmentId ? "department" : "individual")
                    );
                    const ownerId = metadata.ownerProfileId ? Number(metadata.ownerProfileId) : null;
                    const ownerProfile = ownerId ? employeeById.get(ownerId) : undefined;
                    const ownerName =
                      assignmentScope === "department"
                        ? "Department KPI"
                        : ownerProfile
                        ? formatEmployeeName(ownerProfile)
                        : metadata.ownerName || "Unassigned";
                    const ownerRole = assignmentScope === "department" ? "" : ownerProfile?.role?.name || "";
                    const ownerDepartment =
                      assignmentScope === "department"
                        ? kpi.department?.name || ""
                        : ownerProfile?.department?.name || "";
                    return (
                      <TableRow key={kpi.id}>
                        <TableCell className="align-top">
                          <div className="font-medium">{kpi.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {kpi.description || "No description"}
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="flex flex-wrap gap-1">
                            <Badge variant="secondary">
                              {getOptionLabel(BSC_PERSPECTIVES, normalizeCategory(kpi.category))}
                            </Badge>
                            <Badge variant="outline">
                              {getOptionLabel(PYRAMID_LEVELS, normalizePyramid(kpi.kpiType))}
                            </Badge>
                          </div>
                          {(metadata?.strategicObjective || metadata?.driver) && (
                            <div className="mt-1 text-xs text-muted-foreground">
                              {metadata?.strategicObjective || metadata?.driver}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="align-top text-sm">
                          <div>
                            {targetValue
                              ? `${targetValue} ${kpi.measurementUnit || ""}`
                              : targetText
                              ? targetText
                              : "No target"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {kpi.targetFrequency || "No cadence"} |{" "}
                            {targetValue
                              ? "Numeric"
                              : targetText
                              ? targetType.replace("_", " ")
                              : "Unspecified"}{" "}
                            | Weight{" "}
                            {kpi.weight ? `${kpi.weight}%` : "n/a"}
                          </div>
                        </TableCell>
                        <TableCell className="align-top text-sm">
                          <div>{ownerName}</div>
                          <div className="text-xs text-muted-foreground">
                            {ownerRole || ownerDepartment
                              ? [ownerRole, ownerDepartment].filter(Boolean).join(" | ")
                              : kpi.department?.name || "Unassigned"}
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          {kpi.isActive !== false ? (
                            <Badge className="bg-emerald-100 text-emerald-700">Active</Badge>
                          ) : (
                            <Badge variant="outline">Inactive</Badge>
                          )}
                        </TableCell>
                        <TableCell className="align-top text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openEdit(kpi)}
                            >
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
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="space-y-1">
                  <DialogTitle>{editingKpi ? "Edit KPI" : "Create KPI"}</DialogTitle>
                  <DialogDescription>
                    Start in Quick Setup, then open Advanced Setup only when needed.
                  </DialogDescription>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2 md:shrink-0"
                  onClick={() => setShowAdvancedFields((prev) => !prev)}
                >
                  {showAdvancedFields ? (
                    <>
                      <ChevronUp className="h-4 w-4" />
                      Quick Setup
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-4 w-4" />
                      Advanced Setup
                    </>
                  )}
                </Button>
              </div>
            </DialogHeader>

            <div className="max-h-[70vh] space-y-6 overflow-y-auto pr-2">
              {!showAdvancedFields ? (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle>Quick Setup</CardTitle>
                      <CardDescription>
                        Capture the essentials. The rest stays optional in Advanced Setup.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="space-y-2 md:col-span-2">
                        <Label>KPI Name</Label>
                        <Input
                          value={form.name}
                          onChange={(event) =>
                            setForm((prev) => ({ ...prev, name: event.target.value }))
                          }
                          placeholder="Example: Engagement profitability"
                        />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label>KPI Description (Optional)</Label>
                        <Textarea
                          value={form.description}
                          onChange={(event) =>
                            setForm((prev) => ({ ...prev, description: event.target.value }))
                          }
                          placeholder="What this KPI measures and why it matters."
                        />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label>Framework Metric Template (Optional)</Label>
                        <Select
                          value={form.frameworkMetricKey}
                          onValueChange={handleFrameworkMetricChange}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Choose a framework metric to auto-fill fields" />
                          </SelectTrigger>
                          <SelectContent>
                            {frameworkMetrics.map((metric) => (
                              <SelectItem key={metric.key} value={metric.key}>
                                {metric.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="text-xs text-muted-foreground">
                          {selectedFrameworkMetric
                            ? `Template: ${selectedFrameworkMetric.perspective} | ${selectedFrameworkMetric.level} | ${selectedFrameworkMetric.frequency}`
                            : "Select a metric template to auto-fill name, perspective, level, cadence, and unit."}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>BSC Perspective</Label>
                        <Select
                          value={form.category}
                          onValueChange={(value) =>
                            setForm((prev) => ({
                              ...prev,
                              category: value,
                              targetType:
                                value !== "financial" &&
                                prev.targetType === "numeric" &&
                                !prev.targetValue
                                  ? "qualitative"
                                  : prev.targetType,
                            }))
                          }
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
                      <div className="space-y-2">
                        <Label>Pyramid Level</Label>
                        <Select
                          value={form.pyramidLevel}
                          onValueChange={(value) =>
                            setForm((prev) => ({ ...prev, pyramidLevel: value }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select level" />
                          </SelectTrigger>
                          <SelectContent>
                            {PYRAMID_LEVELS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Target Type</Label>
                        <Select value={form.targetType} onValueChange={handleTargetTypeChange}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select target type" />
                          </SelectTrigger>
                          <SelectContent>
                            {TARGET_TYPES.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {isNumericTargetType(form.targetType) ? (
                        <div className="space-y-2">
                          <Label>Target Value</Label>
                          <Input
                            value={form.targetValue}
                            onChange={(event) =>
                              setForm((prev) => ({ ...prev, targetValue: event.target.value }))
                            }
                            placeholder="Numeric target"
                          />
                        </div>
                      ) : (
                        <div className="space-y-2 md:col-span-2">
                          <Label>Target Statement</Label>
                          <Textarea
                            value={form.targetText}
                            onChange={(event) =>
                              setForm((prev) => ({ ...prev, targetText: event.target.value }))
                            }
                            placeholder="Example: Maintain zero regulatory findings throughout the cycle."
                          />
                        </div>
                      )}
                      <div className="space-y-2">
                        <Label>Measurement Unit</Label>
                        <Input
                          value={form.measurementUnit}
                          onChange={(event) =>
                            setForm((prev) => ({ ...prev, measurementUnit: event.target.value }))
                          }
                          placeholder="Percent, hours, days, KES"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Cadence</Label>
                        <Select value={form.aggregationLevel} onValueChange={handleCadenceChange}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select cadence" />
                          </SelectTrigger>
                          <SelectContent>
                            {AGGREGATION_LEVELS.map((option) => (
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
                          value={form.weight}
                          onChange={(event) =>
                            setForm((prev) => ({ ...prev, weight: event.target.value }))
                          }
                          placeholder="Contribution weight"
                        />
                      </div>
                      {!editingKpi && (
                        <div className="space-y-2 md:col-span-2">
                          <Label>Initiatives / Goal Objectives (Optional)</Label>
                          <Textarea
                            value={form.initiativesText}
                            onChange={(event) =>
                              setForm((prev) => ({
                                ...prev,
                                initiativesText: event.target.value,
                              }))
                            }
                            placeholder={`One initiative per line\nExample: Build quarterly pipeline review cadence\nOptional weight format: Improve turnaround time | 20`}
                            rows={5}
                          />
                          <div className="text-xs text-muted-foreground">
                            When you create this KPI, each initiative will auto-create a linked draft
                            goal objective for the assigned owner(s).
                          </div>
                        </div>
                      )}
                      <div className="flex items-center justify-between rounded-lg border p-3 md:col-span-2">
                        <div>
                          <div className="font-medium">Active KPI</div>
                          <div className="text-xs text-muted-foreground">
                            Inactive KPIs stay in history but do not score.
                          </div>
                        </div>
                        <Switch
                          checked={form.isActive}
                          onCheckedChange={(value) =>
                            setForm((prev) => ({ ...prev, isActive: value }))
                          }
                        />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Ownership & Scope</CardTitle>
                      <CardDescription>
                        Choose whether this KPI is assigned to one employee or a whole department.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Assignment Scope</Label>
                        <Select
                          value={form.assignmentScope}
                          onValueChange={handleAssignmentScopeChange}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select scope" />
                          </SelectTrigger>
                          <SelectContent>
                            {ASSIGNMENT_SCOPES.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="text-xs text-muted-foreground">
                          {form.assignmentScope === "department"
                            ? "Creates KPI assignments for all active employees in the selected department."
                            : "Creates KPI assignment for one selected employee owner."}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>
                          {form.assignmentScope === "department" ? "Department Target" : "KPI Owner"}
                        </Label>
                        {form.assignmentScope === "department" ? (
                          <>
                            <Select value={form.departmentId} onValueChange={handleDepartmentChange}>
                              <SelectTrigger>
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
                            <div className="text-xs text-muted-foreground">
                              {selectedDepartment
                                ? `${departmentMemberCount} active employees will receive this KPI in ${selectedDepartment.name}.`
                                : "Choose a department to auto-assign this KPI to all active members."}
                            </div>
                          </>
                        ) : (
                          <>
                            <Select value={form.ownerProfileId} onValueChange={handleOwnerChange}>
                              <SelectTrigger>
                                <SelectValue placeholder="Select employee owner" />
                              </SelectTrigger>
                              <SelectContent>
                                {employees.map((employee) => (
                                  <SelectItem key={employee.id} value={String(employee.id)}>
                                    {formatEmployeeName(employee)}{" "}
                                    {employee.role?.name ? ` - ${employee.role.name}` : ""}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <div className="text-xs text-muted-foreground">
                              {selectedOwner
                                ? `Role: ${selectedOwner.role?.name || "Unassigned"} | Dept: ${
                                    selectedOwner.department?.name || "Unassigned"
                                  }`
                                : "Owner selection auto-links role and department."}
                            </div>
                          </>
                        )}
                      </div>
                      {form.assignmentScope === "individual" && !form.ownerProfileId && (
                        <div className="space-y-2 md:col-span-2">
                          <Label>Department (Optional)</Label>
                          <Select value={form.departmentId} onValueChange={handleDepartmentChange}>
                            <SelectTrigger>
                              <SelectValue placeholder="All departments" />
                            </SelectTrigger>
                            <SelectContent>
                              {departments.map((department) => (
                                <SelectItem key={department.id} value={String(department.id)}>
                                  {department.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <div className="text-xs text-muted-foreground">
                            Optional: set a department when no owner is selected yet.
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-dashed">
                    <CardContent className="pt-6 text-sm text-muted-foreground">
                      Advanced Setup includes strategic drivers, formulas, review workflow, and KPI
                      roll-up settings. Open it only when you need those controls.
                    </CardContent>
                  </Card>
                </>
              ) : (
                <>
              <Card>
                <CardHeader>
                  <CardTitle>Strategic Alignment</CardTitle>
                  <CardDescription>
                    Define how this KPI supports the audit and tax firm strategy.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>BSC Perspective</Label>
                    <Select
                      value={form.category}
                      onValueChange={(value) =>
                        setForm((prev) => ({
                          ...prev,
                          category: value,
                          targetType:
                            value !== "financial" && prev.targetType === "numeric" && !prev.targetValue
                              ? "qualitative"
                              : prev.targetType,
                        }))
                      }
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
                  <div className="space-y-2">
                    <Label>KPI Category</Label>
                    <Select
                      value={form.kpiCategory}
                      onValueChange={(value) =>
                        setForm((prev) => ({ ...prev, kpiCategory: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {KPI_CATEGORIES.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="text-xs text-muted-foreground">
                      Use audit-specific categories to balance financial and non-financial KPIs.
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Pyramid Level</Label>
                    <Select
                      value={form.pyramidLevel}
                      onValueChange={(value) =>
                        setForm((prev) => ({ ...prev, pyramidLevel: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select level" />
                      </SelectTrigger>
                      <SelectContent>
                        {PYRAMID_LEVELS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Value Driver</Label>
                    <Select
                      value={form.driver}
                      onValueChange={(value) => setForm((prev) => ({ ...prev, driver: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select driver" />
                      </SelectTrigger>
                      <SelectContent>
                        {DRIVER_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Strategic Theme</Label>
                    <Input
                      value={form.strategicTheme}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, strategicTheme: event.target.value }))
                      }
                      placeholder="Example: Audit quality, client trust, sustainable growth"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Strategic Objective</Label>
                    <Input
                      value={form.strategicObjective}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          strategicObjective: event.target.value,
                        }))
                      }
                      placeholder="Example: Improve audit quality and regulatory compliance"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Critical Success Factor</Label>
                    <Input
                      value={form.criticalSuccessFactor}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          criticalSuccessFactor: event.target.value,
                        }))
                      }
                      placeholder="Example: Standardized file reviews completed on time"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Initiative</Label>
                    <Input
                      value={form.initiative}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, initiative: event.target.value }))
                      }
                      placeholder="Example: Standardize engagement quality reviews"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Ownership & Scope</CardTitle>
                  <CardDescription>
                    Define accountability and how this KPI is distributed.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Assignment Scope</Label>
                    <Select
                      value={form.assignmentScope}
                      onValueChange={handleAssignmentScopeChange}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select scope" />
                      </SelectTrigger>
                      <SelectContent>
                        {ASSIGNMENT_SCOPES.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="text-xs text-muted-foreground">
                      {form.assignmentScope === "department"
                        ? "Creates KPI assignments for all active employees in the selected department."
                        : "Creates KPI assignment for one selected employee owner."}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>
                      {form.assignmentScope === "department" ? "Department Target" : "KPI Owner"}
                    </Label>
                    {form.assignmentScope === "department" ? (
                      <>
                        <Select
                          value={form.departmentId}
                          onValueChange={handleDepartmentChange}
                        >
                          <SelectTrigger>
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
                        <div className="text-xs text-muted-foreground">
                          {selectedDepartment
                            ? `${departmentMemberCount} active employees will receive this KPI in ${selectedDepartment.name}.`
                            : "Choose a department to auto-assign this KPI to all active members."}
                        </div>
                      </>
                    ) : (
                      <>
                        <Select value={form.ownerProfileId} onValueChange={handleOwnerChange}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select employee owner" />
                          </SelectTrigger>
                          <SelectContent>
                            {employees.map((employee) => (
                              <SelectItem key={employee.id} value={String(employee.id)}>
                                {formatEmployeeName(employee)}{" "}
                                {employee.role?.name ? ` - ${employee.role.name}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="text-xs text-muted-foreground">
                          {selectedOwner
                            ? `Role: ${selectedOwner.role?.name || "Unassigned"} | Dept: ${
                                selectedOwner.department?.name || "Unassigned"
                              }`
                            : "Owner selection auto-links role and department."}
                        </div>
                      </>
                    )}
                  </div>
                  {form.assignmentScope === "individual" && !form.ownerProfileId && (
                    <div className="space-y-2 md:col-span-2">
                      <Label>Department (Optional)</Label>
                      <Select
                        value={form.departmentId}
                        onValueChange={handleDepartmentChange}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="All departments" />
                        </SelectTrigger>
                        <SelectContent>
                          {departments.map((department) => (
                            <SelectItem key={department.id} value={String(department.id)}>
                              {department.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="text-xs text-muted-foreground">
                        Optional: set a department when no owner is selected yet.
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>KPI Identification & Measurement</CardTitle>
                  <CardDescription>
                    Define the KPI formula, measurement unit, and signal type.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <Label>KPI Name</Label>
                    <Input
                      value={form.name}
                      onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                      placeholder="Example: Engagement profitability"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>KPI Description</Label>
                    <Textarea
                      value={form.description}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, description: event.target.value }))
                      }
                      placeholder="Define how this KPI is calculated and why it matters."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Measurement Unit</Label>
                    <Input
                      value={form.measurementUnit}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, measurementUnit: event.target.value }))
                      }
                      placeholder="Percent, hours, days, KES"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Indicator Type</Label>
                    <Select
                      value={form.kpiSignal}
                      onValueChange={(value) =>
                        setForm((prev) => ({ ...prev, kpiSignal: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select indicator type" />
                      </SelectTrigger>
                      <SelectContent>
                        {INDICATOR_TYPES.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Measurement Type</Label>
                    <Select
                      value={form.measurementType}
                      onValueChange={(value) =>
                        setForm((prev) => ({ ...prev, measurementType: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {MEASUREMENT_TYPES.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Cadence</Label>
                    <Select
                      value={form.aggregationLevel}
                      onValueChange={handleCadenceChange}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select cadence" />
                      </SelectTrigger>
                      <SelectContent>
                        {AGGREGATION_LEVELS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="text-xs text-muted-foreground">
                      Applies to measurement cadence and target review.
                    </div>
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
                  <div className="space-y-2 md:col-span-2">
                    <Label>Data Source</Label>
                    <Input
                      value={form.dataSource}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, dataSource: event.target.value }))
                      }
                      placeholder="Example: time_entries, audit reviews, client surveys"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Data Source Type</Label>
                    <Select
                      value={form.dataSourceType}
                      onValueChange={(value) =>
                        setForm((prev) => ({ ...prev, dataSourceType: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select source type" />
                      </SelectTrigger>
                      <SelectContent>
                        {DATA_SOURCE_TYPES.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Source Reference</Label>
                    <Input
                      value={form.sourceReference}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, sourceReference: event.target.value }))
                      }
                      placeholder="Example: time_entries.hours, quality_reviews.score"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Formula or Calculation Notes</Label>
                    <Textarea
                      value={form.formula}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, formula: event.target.value }))
                      }
                      placeholder="Explain the formula or calculation logic."
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-3 md:col-span-2">
                    <div>
                      <div className="font-medium">Formula Locked</div>
                      <div className="text-xs text-muted-foreground">
                        Prevents edits to the KPI formula once approved.
                      </div>
                    </div>
                    <Switch
                      checked={form.formulaLocked}
                      onCheckedChange={(value) =>
                        setForm((prev) => ({ ...prev, formulaLocked: value }))
                      }
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Targets & Governance</CardTitle>
                  <CardDescription>
                    Set targets, cadence, and accountability.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Target Type</Label>
                    <Select value={form.targetType} onValueChange={handleTargetTypeChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select target type" />
                      </SelectTrigger>
                      <SelectContent>
                        {TARGET_TYPES.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="text-xs text-muted-foreground">
                      {isNumericTargetType(form.targetType)
                        ? "Numeric targets are scored directly."
                        : "Use qualitative or milestone targets for non-financial KPIs."}
                    </div>
                  </div>
                  {isNumericTargetType(form.targetType) ? (
                  <div className="space-y-2">
                    <Label>Target Value</Label>
                    <Input
                      value={form.targetValue}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, targetValue: event.target.value }))
                      }
                      placeholder="Numeric target"
                    />
                  </div>
                  ) : (
                    <div className="space-y-2 md:col-span-2">
                      <Label>Target Statement</Label>
                      <Textarea
                        value={form.targetText}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, targetText: event.target.value }))
                        }
                        placeholder="Example: Maintain zero regulatory findings throughout the cycle."
                      />
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground md:col-span-2">
                    Target cadence follows measurement cadence: {form.aggregationLevel || "monthly"}.
                  </div>
                  {isNumericTargetType(form.targetType) ? (
                    <div className="space-y-2">
                      <Label>Baseline Value</Label>
                      <Input
                        value={form.baselineValue}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, baselineValue: event.target.value }))
                        }
                        placeholder="Starting point or benchmark"
                      />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label>Baseline (Optional)</Label>
                      <Input
                        value={form.baselineText}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, baselineText: event.target.value }))
                        }
                        placeholder="Example: 2 minor findings last quarter"
                      />
                    </div>
                  )}
                  {isNumericTargetType(form.targetType) && (
                    <>
                      <div className="flex items-center justify-between rounded-lg border p-3 md:col-span-2">
                        <div>
                          <div className="font-medium">Use Tolerance Bands</div>
                          <div className="text-xs text-muted-foreground">
                            Optional Red/Amber/Green thresholds for RAG scoring.
                          </div>
                        </div>
                        <Switch
                          checked={form.useToleranceBands}
                          onCheckedChange={(value) =>
                            setForm((prev) => ({
                              ...prev,
                              useToleranceBands: value,
                              redThreshold: value ? prev.redThreshold : "",
                              amberThreshold: value ? prev.amberThreshold : "",
                              greenThreshold: value ? prev.greenThreshold : "",
                            }))
                          }
                        />
                      </div>
                      {form.useToleranceBands && (
                        <>
                          <div className="space-y-2">
                            <Label>Red Threshold</Label>
                            <Input
                              value={form.redThreshold}
                              onChange={(event) =>
                                setForm((prev) => ({ ...prev, redThreshold: event.target.value }))
                              }
                              placeholder="Below this is red"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Amber Threshold</Label>
                            <Input
                              value={form.amberThreshold}
                              onChange={(event) =>
                                setForm((prev) => ({ ...prev, amberThreshold: event.target.value }))
                              }
                              placeholder="Lower bound for amber"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Green Threshold</Label>
                            <Input
                              value={form.greenThreshold}
                              onChange={(event) =>
                                setForm((prev) => ({ ...prev, greenThreshold: event.target.value }))
                              }
                              placeholder="Lower bound for green"
                            />
                          </div>
                        </>
                      )}
                    </>
                  )}
                  <div className="space-y-2">
                    <Label>Weight (%)</Label>
                    <Input
                      value={form.weight}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, weight: event.target.value }))
                      }
                      placeholder="Contribution weight"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Governance Notes</Label>
                    <Textarea
                      value={form.notes}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, notes: event.target.value }))
                      }
                      placeholder="Any audit, compliance, or review notes."
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-3 md:col-span-2">
                    <div>
                      <div className="font-medium">Active KPI</div>
                      <div className="text-xs text-muted-foreground">
                        Inactive KPIs remain in history but are excluded from scoring.
                      </div>
                    </div>
                    <Switch
                      checked={form.isActive}
                      onCheckedChange={(value) =>
                        setForm((prev) => ({ ...prev, isActive: value }))
                      }
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Review Workflow</CardTitle>
                  <CardDescription>
                    Define review ownership, approvals, and evidence requirements.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Review Owner</Label>
                    <Select
                      value={form.reviewOwnerProfileId}
                      onValueChange={(value) =>
                        setForm((prev) => ({ ...prev, reviewOwnerProfileId: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select reviewer" />
                      </SelectTrigger>
                      <SelectContent>
                        {employees.map((employee) => (
                          <SelectItem key={employee.id} value={String(employee.id)}>
                            {formatEmployeeName(employee)}{" "}
                            {employee.role?.name ? ` - ${employee.role.name}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Review Frequency</Label>
                    <Select
                      value={form.reviewFrequency}
                      onValueChange={(value) =>
                        setForm((prev) => ({ ...prev, reviewFrequency: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select frequency" />
                      </SelectTrigger>
                      <SelectContent>
                        {REVIEW_FREQUENCIES.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-3 md:col-span-2">
                    <div>
                      <div className="font-medium">Approval Required</div>
                      <div className="text-xs text-muted-foreground">
                        KPI changes require approval from the review owner.
                      </div>
                    </div>
                    <Switch
                      checked={form.approvalRequired}
                      onCheckedChange={(value) =>
                        setForm((prev) => ({ ...prev, approvalRequired: value }))
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-3 md:col-span-2">
                    <div>
                      <div className="font-medium">Evidence Required</div>
                      <div className="text-xs text-muted-foreground">
                        Require supporting evidence for KPI updates.
                      </div>
                    </div>
                    <Switch
                      checked={form.evidenceRequired}
                      onCheckedChange={(value) =>
                        setForm((prev) => ({ ...prev, evidenceRequired: value }))
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-3 md:col-span-2">
                    <div>
                      <div className="font-medium">Commentary Required</div>
                      <div className="text-xs text-muted-foreground">
                        Require narrative commentary with KPI updates.
                      </div>
                    </div>
                    <Switch
                      checked={form.commentaryRequired}
                      onCheckedChange={(value) =>
                        setForm((prev) => ({ ...prev, commentaryRequired: value }))
                      }
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Cascading & Roll-up</CardTitle>
                  <CardDescription>
                    Link this KPI to a parent KPI and define roll-up behavior.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Parent KPI (Optional)</Label>
                    <Select
                      value={form.parentKpiId || "none"}
                      onValueChange={(value) =>
                        setForm((prev) => ({
                          ...prev,
                          parentKpiId: value === "none" ? "" : value,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select parent KPI" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No parent KPI</SelectItem>
                        {kpis
                          .filter((kpi) => !editingKpi || kpi.id !== editingKpi.id)
                          .map((kpi) => (
                            <SelectItem key={kpi.id} value={String(kpi.id)}>
                              {kpi.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Roll-up Method</Label>
                    <Select
                      value={form.rollupMethod}
                      onValueChange={(value) =>
                        setForm((prev) => ({ ...prev, rollupMethod: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select roll-up method" />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLLUP_METHODS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-3 md:col-span-2">
                    <div>
                      <div className="font-medium">Inherit Weight</div>
                      <div className="text-xs text-muted-foreground">
                        Child KPI inherits weight from parent if enabled.
                      </div>
                    </div>
                    <Switch
                      checked={form.inheritWeight}
                      onCheckedChange={(value) =>
                        setForm((prev) => ({ ...prev, inheritWeight: value }))
                      }
                    />
                  </div>
                </CardContent>
              </Card>
                </>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave}>{editingKpi ? "Update KPI" : "Create KPI"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
