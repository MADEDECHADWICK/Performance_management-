import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Eye,
  Search,
  Plus,
  Pencil,
  Trash2,
  Building2,
  Users,
  ClipboardCheck,
  FileText,
  Upload,
  BookOpen,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { rolesAPI } from "@/lib/api";
import documentsAPI from "@/lib/api/documents";
import { CANONICAL_ROLES, resolveCanonicalRole } from "@/auth/canonicalRoles";
import UserRoleManagement from "@/components/UserRoleManagement";

interface Employee {
  id: string;
  user_id?: string | null;
  first_name: string;
  last_name: string;
  email: string;
  position: string;
  status: string;
  hire_date: string | null;
  hireDate?: string | null;
  department_id: string;
  manager_id?: string | null;
  managerId?: string | null;
  department?: {
    name: string;
  };
}

interface Department {
  id: string;
  name: string;
  description: string | null;
  department_head_id: string | null;
  department_head_name?: string;
  partner_profile_id?: string | null;
  partner_name?: string;
  employee_count?: number;
}

interface DepartmentFormData {
  name: string;
  description: string;
  department_head_id: string;
  partner_profile_id: string;
}

interface Role {
  id: number;
  name: string;
  billingRate?: number;
  costRate?: number;
  description?: string;
  permissions: string[];
  isActive: boolean;
  createdAt: string;
}

interface OnboardingCase {
  id: number;
  profileId?: number;
  candidateId?: number;
  status: string;
  startDate?: string;
  dueDate?: string;
  hrOwner?: {
    id: number;
    firstName: string;
    lastName: string;
  };
  employee?: {
    id: number;
    firstName: string;
    lastName: string;
    user?: { email: string };
  };
  candidate?: {
    id: number;
    fullName: string;
    stage: string;
  };
  inductionChecklist?: {
    id: number;
    status: string;
    completionPercent: number;
  };
}

interface ChecklistDocument {
  id: number;
  fileName?: string | null;
  filePath?: string | null;
  verificationStatus?: "pending" | "verified" | "rejected" | null;
  rejectionReason?: string | null;
  verifiedAt?: string | null;
}

interface InductionChecklistItem {
  id: number;
  itemName: string;
  description?: string | null;
  sectionKey?: string | null;
  sectionLabel?: string | null;
  ownerRole?: string | null;
  isCompleted: boolean;
  itemType?: string | null;
  resourceUrl?: string | null;
  comments?: string | null;
  requiresDocument: boolean;
  documentId?: number | null;
  document?: ChecklistDocument | null;
}

interface InductionChecklistDetail {
  id: number;
  checklistName?: string | null;
  status?: string | null;
  completionPercent?: number | null;
  dueDate?: string | null;
  employeeAcknowledgedAt?: string | null;
  hrSignedOffAt?: string | null;
  hrSignoffNotes?: string | null;
  items?: InductionChecklistItem[];
}

interface OffboardingCase {
  id: number;
  profileId?: number;
  status: "initiated" | "in_progress" | "completed";
  reason?: string;
  employee?: {
    id: number;
    firstName: string;
    lastName: string;
    user?: { email: string };
  };
  candidate?: {
    id: number;
    fullName: string;
  };
  initiatedAt?: string;
  completedAt?: string;
  _count?: {
    items?: number;
  };
}

type ChecklistItemType =
  | "task"
  | "document_upload"
  | "video_watch"
  | "policy_link"
  | "external_link";

interface ChecklistDraftItem {
  id: string;
  itemName: string;
  description: string;
  itemType: ChecklistItemType;
  resourceUrl: string;
  requiresDocument: boolean;
  sectionKey: string;
  sectionLabel: string;
  ownerRole: "employee" | "hr";
  comments: string;
}

interface InductionTemplateItemResponse {
  itemName: string;
  description?: string;
  itemType?: ChecklistItemType;
  resourceUrl?: string;
  requiresDocument?: boolean;
  sectionKey?: string;
  sectionLabel?: string;
  ownerRole?: "employee" | "hr";
  comments?: string;
}

interface InductionTemplateResponse {
  checklistName?: string;
  items?: InductionTemplateItemResponse[];
}

const DEFAULT_ACCESS_ROLES = [...CANONICAL_ROLES];

const CHECKLIST_ITEM_TYPE_OPTIONS: Array<{
  value: ChecklistItemType;
  label: string;
  resourceLabel?: string;
  resourcePlaceholder?: string;
}> = [
  { value: "task", label: "Task" },
  { value: "document_upload", label: "Document Upload" },
  {
    value: "video_watch",
    label: "Video to Watch",
    resourceLabel: "Video URL",
    resourcePlaceholder: "https://...",
  },
  {
    value: "policy_link",
    label: "Policy Link",
    resourceLabel: "Policy URL",
    resourcePlaceholder: "https://... or /knowledge-hub/...",
  },
  {
    value: "external_link",
    label: "External Link",
    resourceLabel: "Link URL",
    resourcePlaceholder: "https://...",
  },
];

const createChecklistDraftItem = (
  overrides: Partial<ChecklistDraftItem> = {}
): ChecklistDraftItem => {
  const itemType = (overrides.itemType || "task") as ChecklistItemType;
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    itemName: overrides.itemName || "",
    description: overrides.description || "",
    itemType,
    resourceUrl: overrides.resourceUrl || "",
    requiresDocument:
      typeof overrides.requiresDocument === "boolean"
        ? overrides.requiresDocument
        : itemType === "document_upload",
    sectionKey: overrides.sectionKey || "general",
    sectionLabel: overrides.sectionLabel || "General",
    ownerRole: overrides.ownerRole || "hr",
    comments: overrides.comments || "",
  };
};

const defaultChecklistDraftItems = (): ChecklistDraftItem[] => [
  createChecklistDraftItem({
    itemName: "Application letter & CV",
    description: "Employee file must contain the application letter and CV.",
    itemType: "document_upload",
    requiresDocument: true,
    sectionKey: "employee_file",
    sectionLabel: "Employee File",
    ownerRole: "hr",
  }),
];

const mapTemplateItemToDraft = (
  item: InductionTemplateItemResponse,
): ChecklistDraftItem =>
  createChecklistDraftItem({
    itemName: item.itemName || "",
    description: item.description || "",
    itemType: item.itemType || "task",
    resourceUrl: item.resourceUrl || "",
    requiresDocument:
      typeof item.requiresDocument === "boolean"
        ? item.requiresDocument
        : item.itemType === "document_upload",
    sectionKey: item.sectionKey || "general",
    sectionLabel: item.sectionLabel || "General",
    ownerRole: item.ownerRole || "hr",
    comments: item.comments || "",
  });

const formatShortDate = (value?: string) => {
  if (!value) return "--";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "--";
  return parsed.toLocaleDateString();
};

const statusBadgeVariant = (status?: string) => {
  if (!status) return "secondary";
  if (status === "completed") return "default";
  if (status === "in_progress") return "outline";
  return "secondary";
};

const formatOwnerRoleLabel = (ownerRole?: string | null) => {
  const normalized = String(ownerRole || "hr")
    .trim()
    .toLowerCase();
  if (normalized === "employee") return "Employee";
  return "HR";
};

const verificationBadgeVariant = (status?: string | null) => {
  if (status === "verified") return "default";
  if (status === "rejected") return "destructive";
  return "outline";
};

const groupChecklistItemsBySection = (items: InductionChecklistItem[] = []) => {
  const groups = new Map<
    string,
    { sectionKey: string; sectionLabel: string; items: InductionChecklistItem[] }
  >();

  items.forEach((item) => {
    const sectionKey = String(item.sectionKey || "general");
    const sectionLabel = String(item.sectionLabel || "General");
    if (!groups.has(sectionKey)) {
      groups.set(sectionKey, { sectionKey, sectionLabel, items: [] });
    }
    groups.get(sectionKey)!.items.push(item);
  });

  return Array.from(groups.values());
};

const isChecklistOverdue = (caseItem: OnboardingCase) => {
  if (!caseItem.dueDate || caseItem.status === "completed") return false;
  const due = new Date(caseItem.dueDate);
  if (Number.isNaN(due.getTime())) return false;
  return due.getTime() < Date.now();
};

const extractItems = (payload: any) => {
  const data = payload?.data ?? payload;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  return [];
};

const getRoleLabel = (emp: any) =>
  String(
    emp?.role?.name ??
      emp?.position ??
      emp?.positionTitle ??
      emp?.position_title ??
      ""
  );

const isPartnerEmployee = (emp: any) => {
  const label = getRoleLabel(emp).toLowerCase();
  return Boolean(emp?.is_partner || emp?.isPartner || label.includes("partner"));
};

const isManagerEmployee = (emp: any) => {
  const label = getRoleLabel(emp).toLowerCase();
  return !isPartnerEmployee(emp) && label.includes("manager");
};

const EmployeeManagement = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [departmentDialogOpen, setDepartmentDialogOpen] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
  const [deletingDepartmentId, setDeletingDepartmentId] = useState<string | null>(null);
  const [departmentManagerIds, setDepartmentManagerIds] = useState<string[]>([]);
  const [managerAssignments, setManagerAssignments] = useState<Record<string, string[]>>({});
  const [departmentForm, setDepartmentForm] = useState<DepartmentFormData>({
    name: "",
    description: "",
    department_head_id: "",
    partner_profile_id: "",
  });

  const safeDepartments = Array.isArray(departments) ? departments : [];
  const partnerEmployees = employees.filter((emp: any) => isPartnerEmployee(emp));
  const managerEmployees = employees.filter((emp: any) => isManagerEmployee(emp));
  const assignableEmployees = employees.filter(
    (emp: any) => !isManagerEmployee(emp) && !isPartnerEmployee(emp)
  );
  const selectedDepartmentManagerIds = Array.from(
    new Set(
      [departmentForm.department_head_id, ...departmentManagerIds]
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    )
  );
  const managerLoadSummary = selectedDepartmentManagerIds.map((managerId) => {
    const manager = managerEmployees.find((emp: any) => String(emp.id) === String(managerId));
    const assignedCount = (managerAssignments[managerId] || []).length;
    return {
      managerId,
      managerName: manager
        ? `${manager.first_name} ${manager.last_name}`
        : `Manager ${managerId}`,
      assignedCount,
    };
  });
  const totalAssignedEmployees = managerLoadSummary.reduce(
    (sum, row) => sum + row.assignedCount,
    0
  );
  const averageLoad =
    managerLoadSummary.length > 0 ? totalAssignedEmployees / managerLoadSummary.length : 0;
  const maxLoad =
    managerLoadSummary.length > 0
      ? Math.max(...managerLoadSummary.map((row) => row.assignedCount))
      : 0;
  const minLoad =
    managerLoadSummary.length > 0
      ? Math.min(...managerLoadSummary.map((row) => row.assignedCount))
      : 0;
  const loadSpread = maxLoad - minLoad;

  const handleDepartmentHeadChange = (nextHeadId: string) => {
    const prevHeadId = String(departmentForm.department_head_id || "");
    const normalizedHeadId = String(nextHeadId || "").trim();

    setDepartmentForm((prev) => ({
      ...prev,
      department_head_id: normalizedHeadId,
    }));

    setDepartmentManagerIds((prev) => {
      let next = prev.filter((id) => id !== normalizedHeadId);
      if (prevHeadId && prevHeadId !== normalizedHeadId) {
        const stillManager = managerEmployees.some((emp: any) => String(emp.id) === prevHeadId);
        if (stillManager) {
          next = Array.from(new Set([...next, prevHeadId]));
        }
      }
      return next;
    });

    setManagerAssignments((prev) => ({
      ...prev,
      ...(normalizedHeadId ? { [normalizedHeadId]: prev[normalizedHeadId] || [] } : {}),
    }));
  };

  const toggleAdditionalDepartmentManager = (managerId: string) => {
    if (!managerId) return;
    if (managerId === departmentForm.department_head_id) return;

    setDepartmentManagerIds((prev) => {
      const exists = prev.includes(managerId);
      if (exists) {
        const next = prev.filter((id) => id !== managerId);
        setManagerAssignments((current) => {
          const updated = { ...current };
          delete updated[managerId];
          return updated;
        });
        return next;
      }

      setManagerAssignments((current) => ({
        ...current,
        [managerId]: current[managerId] || [],
      }));
      return [...prev, managerId];
    });
  };

  const toggleManagerEmployeeAssignment = (managerId: string, employeeId: string) => {
    if (!managerId || !employeeId) return;
    setManagerAssignments((prev) => {
      const activeManagers = new Set(selectedDepartmentManagerIds);
      activeManagers.add(managerId);

      const next: Record<string, string[]> = {};
      activeManagers.forEach((id) => {
        next[id] = (prev[id] || []).filter((memberId) => memberId !== employeeId);
      });

      const wasAssignedToManager = (prev[managerId] || []).includes(employeeId);
      if (!wasAssignedToManager) {
        next[managerId] = Array.from(new Set([...(next[managerId] || []), employeeId]));
      }

      return next;
    });
  };
  const [employeeDialogOpen, setEmployeeDialogOpen] = useState(false);
  const [employeeForm, setEmployeeForm] = useState({
    email: "",
    first_name: "",
    last_name: "",
    phone: "",
    position: "",
    role_id: "",
    access_role: "employee",
    department_id: "",
    manager_id: "",
    hire_date: "",
    status: "active",
    hourly_rate: "",
    standard_daily_hours: "8",
    billable_target_percent: "80",
    non_billable_target_percent: "20",
  });
  const [accessRoles, setAccessRoles] = useState<string[]>(DEFAULT_ACCESS_ROLES);
  
  // Role management state
  const [roles, setRoles] = useState<Role[]>([]);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [roleForm, setRoleForm] = useState({
    name: "",
    description: "",
    permissions: [] as string[],
    isActive: true,
  });

  const [onboardingCases, setOnboardingCases] = useState<OnboardingCase[]>([]);
  const [offboardingCases, setOffboardingCases] = useState<OffboardingCase[]>([]);
  const [lifecycleLoading, setLifecycleLoading] = useState(false);
  const [onboardingFilter, setOnboardingFilter] = useState<"all" | "pending" | "missing">("all");
  const [checklistDialogOpen, setChecklistDialogOpen] = useState(false);
  const [checklistEmployeeId, setChecklistEmployeeId] = useState<string>("");
  const [checklistOnboardingCaseId, setChecklistOnboardingCaseId] = useState<string>("");
  const [checklistDraftItems, setChecklistDraftItems] = useState<ChecklistDraftItem[]>(
    defaultChecklistDraftItems
  );
  const [checklistTemplateLoading, setChecklistTemplateLoading] = useState(false);
  const [checklistDueDate, setChecklistDueDate] = useState("");
  const [bulkChecklistDialogOpen, setBulkChecklistDialogOpen] = useState(false);
  const [bulkChecklistDueDate, setBulkChecklistDueDate] = useState("");
  const [checklistViewOpen, setChecklistViewOpen] = useState(false);
  const [activeChecklist, setActiveChecklist] = useState<InductionChecklistDetail | null>(null);
  const [checklistViewLoading, setChecklistViewLoading] = useState(false);
  const [checklistUploadBusy, setChecklistUploadBusy] = useState<number | null>(null);
  const [checklistActionBusy, setChecklistActionBusy] = useState<string | null>(null);
  const [checklistCommentDrafts, setChecklistCommentDrafts] = useState<Record<number, string>>({});
  const [checklistSignoffNotes, setChecklistSignoffNotes] = useState("");
  const [offboardingDialogOpen, setOffboardingDialogOpen] = useState(false);
  const [remindingChecklistId, setRemindingChecklistId] = useState<number | null>(null);
  const [offboardingEmployeeId, setOffboardingEmployeeId] = useState<string>("");
  const [offboardingReason, setOffboardingReason] = useState("");
  const [offboardingTasksDialogOpen, setOffboardingTasksDialogOpen] = useState(false);
  const [activeOffboardingCaseId, setActiveOffboardingCaseId] = useState<number | null>(null);
  const [offboardingTasks, setOffboardingTasks] = useState<any[]>([]);
  const [newOffboardingTaskName, setNewOffboardingTaskName] = useState("");
  const [newOffboardingTaskDescription, setNewOffboardingTaskDescription] = useState("");
  const [newOffboardingTaskRequiresDoc, setNewOffboardingTaskRequiresDoc] = useState(false);
  const [attachDocDialogOpen, setAttachDocDialogOpen] = useState(false);
  const [attachTaskId, setAttachTaskId] = useState<number | null>(null);
  const [attachFileName, setAttachFileName] = useState("");
  const [attachFile, setAttachFile] = useState<File | null>(null);

  const [dueDateEdits, setDueDateEdits] = useState<Record<number, string>>({});
  const [savingDueDateId, setSavingDueDateId] = useState<number | null>(null);
  
  const { toast } = useToast();
  const navigate = useNavigate();

  // Intentional one-time bootstrap load for this admin screen.
  useEffect(() => {
    loadData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadData = async () => {
    try {
      setLoading(true);

      // Load employees with department info
      const employeesResponse = await apiFetch('GET', "/profiles?page=1&pageSize=100&status=active");
      const employeesData = extractItems(employeesResponse);

      // Load departments
      const departmentsResponse = await apiFetch('GET', "/departments?page=1&pageSize=100");
      const departmentsData = extractItems(departmentsResponse);

      // Count employees per department and add department head info
      const safeDepartments = Array.isArray(departmentsData) ? departmentsData : [];
      const safeEmployees = Array.isArray(employeesData) ? employeesData : [];

      const normalizedEmployees = safeEmployees.map((emp: any) => {
        const firstName = emp.first_name ?? emp.firstName ?? "";
        const lastName = emp.last_name ?? emp.lastName ?? "";
        const email = emp.email ?? emp.user?.email ?? "";
        const hireDate = emp.hire_date ?? emp.hireDate ?? null;
        const position =
          emp.position ??
          emp.positionTitle ??
          emp.position_title ??
          emp.role?.name ??
          "";
        const departmentId =
          emp.department_id ?? emp.departmentId ?? emp.department?.id ?? "";
        const managerId = emp.manager_id ?? emp.managerId ?? emp.manager?.id ?? null;
        return {
          ...emp,
          first_name: firstName,
          last_name: lastName,
          email,
          hire_date: hireDate,
          hireDate,
          position,
          department_id: departmentId,
          manager_id: managerId ? String(managerId) : null,
          managerId: managerId ? String(managerId) : null,
        };
      });

      const departmentsWithCounts = safeDepartments.map((dept: any) => {
        const empCount = normalizedEmployees.filter((e: any) => {
          // Check both snake_case and camelCase for compatibility
          const deptId = e.departmentId || e.department_id;
          return deptId === dept.id;
        }).length || 0;
        const head = dept.departmentHead ?? dept.department_head ?? null;
        const partner = dept.partner ?? null;
        const headName =
          dept.department_head_name ??
          (head
            ? `${head.firstName ?? head.first_name ?? ""} ${head.lastName ?? head.last_name ?? ""}`.trim()
            : undefined);
        const partnerName =
          dept.partner_name ??
          (partner
            ? `${partner.firstName ?? partner.first_name ?? ""} ${partner.lastName ?? partner.last_name ?? ""}`.trim()
            : undefined);
        return {
          ...dept,
          employee_count: empCount,
          department_head_name: headName,
          partner_name: partnerName,
          department_head_id:
            dept.department_head_id ?? dept.departmentHeadId ?? head?.id ?? null,
          partner_profile_id:
            dept.partner_profile_id ?? dept.partnerProfileId ?? partner?.id ?? null,
        };
      });

      setEmployees(normalizedEmployees);
      setDepartments(departmentsWithCounts);
      
      // Load roles
      try {
        const rolesData = await rolesAPI.getAll();
        setRoles(rolesData);
      } catch (roleError) {
        console.warn("Failed to load roles:", roleError);
      }

      try {
        const accessRoleResponse = await apiFetch("GET", "/module-access/roles");
        const accessRoleRows = Array.isArray((accessRoleResponse as any)?.roles)
          ? (accessRoleResponse as any).roles
          : [];
        const names = accessRoleRows
          .map((row: any) => String(row?.name || "").toLowerCase().trim())
          .map((roleName: string) => resolveCanonicalRole(roleName))
          .filter((roleName): roleName is string => Boolean(roleName));
        if (names.length > 0) {
          setAccessRoles(Array.from(new Set(names)));
        } else {
          setAccessRoles(DEFAULT_ACCESS_ROLES);
        }
      } catch (accessRoleError) {
        console.warn("Failed to load access roles:", accessRoleError);
        setAccessRoles(DEFAULT_ACCESS_ROLES);
      }

      await loadLifecycleData();
    } catch (error: any) {
      if (error?.status === 401) {
        navigate("/auth");
        return;
      }
      if (error?.status === 403) {
        setEmployees([]);
        setDepartments([]);
        return;
      }
      toast({
        title: "Error loading data",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadLifecycleData = async (): Promise<OnboardingCase[]> => {
    try {
      setLifecycleLoading(true);
      const [onboardingData, offboardingData] = await Promise.all([
        apiFetch("GET", "/onboarding"),
        apiFetch("GET", "/offboarding"),
      ]);
      const safeOnboardingCases = extractItems(onboardingData);
      const safeOffboardingCases = extractItems(offboardingData);
      const onboardingList = Array.isArray(safeOnboardingCases) ? safeOnboardingCases : [];
      const offboardingList = Array.isArray(safeOffboardingCases) ? safeOffboardingCases : [];
      setOnboardingCases(onboardingList);
      setOffboardingCases(offboardingList);
      return onboardingList;
    } catch (error: any) {
      console.warn("Failed to load lifecycle data:", error);
      return [];
    } finally {
      setLifecycleLoading(false);
    }
  };

  const safeOnboardingCases = Array.isArray(onboardingCases) ? onboardingCases : [];
  const safeEmployees = Array.isArray(employees) ? employees : [];
  const safeOffboardingCases = Array.isArray(offboardingCases) ? offboardingCases : [];
  const getOnboardingCaseForProfile = (profileId: number) =>
    safeOnboardingCases.find((caseItem) => Number(caseItem.profileId || 0) === profileId);
  const employeesWithOnboardingCases = safeEmployees.filter((emp) =>
    Boolean(getOnboardingCaseForProfile(Number(emp.id)))
  );
  const getChecklistItemTypeOption = (itemType?: string | null) =>
    CHECKLIST_ITEM_TYPE_OPTIONS.find((option) => option.value === itemType) ||
    CHECKLIST_ITEM_TYPE_OPTIONS[0];

  const hydrateChecklistDetail = (payload: any) => {
    const detail = (payload?.data ?? payload) as InductionChecklistDetail;
    setActiveChecklist(detail);
    const nextComments = Object.fromEntries(
      (detail.items || []).map((item) => [item.id, item.comments || ""])
    );
    setChecklistCommentDrafts(nextComments);
    setChecklistSignoffNotes(detail.hrSignoffNotes || "");
    return detail;
  };

  const loadDefaultChecklistTemplate = async () => {
    try {
      setChecklistTemplateLoading(true);
      const response = await apiFetch("GET", "/induction-checklist/template/default");
      const template = (response?.data ?? response) as InductionTemplateResponse;
      const templateItems = Array.isArray(template.items)
        ? template.items.map(mapTemplateItemToDraft)
        : defaultChecklistDraftItems();
      setChecklistDraftItems(templateItems.length ? templateItems : defaultChecklistDraftItems());
    } catch (error: any) {
      console.warn("Failed to load induction template:", error);
      setChecklistDraftItems(defaultChecklistDraftItems());
      toast({
        title: "Default template unavailable",
        description: "Loaded the local fallback checklist template instead.",
      });
    } finally {
      setChecklistTemplateLoading(false);
    }
  };

  const updateChecklistDraftItem = (
    id: string,
    updates: Partial<ChecklistDraftItem>
  ) => {
    setChecklistDraftItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const nextType = (updates.itemType || item.itemType) as ChecklistItemType;
        const isDocumentUpload = nextType === "document_upload";
        const keepResource =
          nextType === "video_watch" || nextType === "policy_link" || nextType === "external_link";
        return {
          ...item,
          ...updates,
          itemType: nextType,
          requiresDocument: isDocumentUpload,
          resourceUrl: keepResource ? updates.resourceUrl ?? item.resourceUrl : "",
          comments: updates.comments ?? item.comments,
          sectionKey: updates.sectionKey ?? item.sectionKey,
          sectionLabel: updates.sectionLabel ?? item.sectionLabel,
          ownerRole: updates.ownerRole ?? item.ownerRole,
        };
      })
    );
  };

  const addChecklistDraftItem = (itemType: ChecklistItemType = "task") => {
    setChecklistDraftItems((prev) => [
      ...prev,
      createChecklistDraftItem({ itemType, requiresDocument: itemType === "document_upload" }),
    ]);
  };

  const removeChecklistDraftItem = (id: string) => {
    setChecklistDraftItems((prev) =>
      prev.length <= 1 ? prev : prev.filter((item) => item.id !== id)
    );
  };

  const buildChecklistPayloadItems = () => {
    const items = checklistDraftItems
      .map((draft, index) => {
        const itemName = draft.itemName.trim();
        const description = draft.description.trim();
        const itemType = draft.itemType;
        const resourceUrl = draft.resourceUrl.trim();
        const comments = draft.comments.trim();
        return {
          itemName,
          description: description || undefined,
          orderIndex: index,
          itemType,
          resourceUrl: resourceUrl || undefined,
          requiresDocument: itemType === "document_upload",
          sectionKey: draft.sectionKey,
          sectionLabel: draft.sectionLabel,
          ownerRole: draft.ownerRole,
          comments: comments || undefined,
        };
      })
      .filter((item) => item.itemName.length > 0);

    if (items.length === 0) {
      return { error: "Add at least one checklist item." as const };
    }

    const missingResource = items.find(
      (item) =>
        (item.itemType === "video_watch" ||
          item.itemType === "policy_link" ||
          item.itemType === "external_link") &&
        !item.resourceUrl
    );

    if (missingResource) {
      return {
        error: `Add a URL for "${missingResource.itemName}" (${missingResource.itemType.replace("_", " ")}).` as const,
      };
    }

    return { items };
  };

  const filteredOnboardingCases = safeOnboardingCases.filter((caseItem) => {
    if (onboardingFilter === "pending") {
      return caseItem.status === "pending" || caseItem.status === "in_progress";
    }
    if (onboardingFilter === "missing") {
      return !caseItem.inductionChecklist;
    }
    return true;
  });

  const handleUpdateDueDate = async (caseId: number) => {
    const dueDate = dueDateEdits[caseId];
    if (!dueDate) {
      toast({
        title: "Due date required",
        description: "Pick a due date before saving.",
        variant: "destructive",
      });
      return;
    }

    try {
      setSavingDueDateId(caseId);
      await apiFetch("PATCH", `/onboarding/${caseId}`, { dueDate });
      toast({ title: "Due date updated" });
      await loadLifecycleData();
    } catch (error: any) {
      toast({
        title: "Failed to update due date",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSavingDueDateId(null);
    }
  };

  const handleSendChecklistReminder = async (checklistId: number) => {
    try {
      setRemindingChecklistId(checklistId);
      await apiFetch("POST", `/induction-checklist/${checklistId}/remind`);
      toast({
        title: "Reminder sent",
        description: "The employee has been notified to complete the checklist.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to send reminder",
        description: error.message || "Unable to send reminder.",
      });
    } finally {
      setRemindingChecklistId(null);
    }
  };

  const openChecklistDetails = async (checklistId: number) => {
    try {
      setChecklistViewLoading(true);
      setChecklistViewOpen(true);
      const response = await apiFetch("GET", `/induction-checklist/${checklistId}`);
      hydrateChecklistDetail(response);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Unable to load checklist",
        description: error.message || "Please try again.",
      });
      setChecklistViewOpen(false);
    } finally {
      setChecklistViewLoading(false);
    }
  };

  const refreshActiveChecklist = async (checklistId: number) => {
    const refreshed = await apiFetch("GET", `/induction-checklist/${checklistId}`);
    hydrateChecklistDetail(refreshed);
  };

  const attachChecklistDocument = async (checklistId: number, itemId: number, file: File) => {
    try {
      setChecklistUploadBusy(itemId);
      const upload = await documentsAPI.uploadFile(file, {
        documentType: "onboarding_checklist",
        entityType: "InductionChecklist",
        entityId: checklistId,
        accessLevel: "hr",
        isRequired: true,
        description: "Onboarding checklist evidence",
      });

      const documentId = (upload as any)?.data?.id ?? (upload as any)?.id;
      if (!documentId) {
        throw new Error("Upload succeeded but document id was missing.");
      }

      await apiFetch("PATCH", `/induction-checklist/${checklistId}/items/${itemId}/document`, {
        documentId,
      });

      await refreshActiveChecklist(checklistId);
      toast({ title: "Document attached" });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Attach failed",
        description: error.message || "Unable to attach document.",
      });
    } finally {
      setChecklistUploadBusy(null);
    }
  };

  const completeChecklistItemAsHr = async (checklistId: number, itemId: number) => {
    try {
      setChecklistActionBusy(`complete:${itemId}`);
      await apiFetch("PATCH", `/induction-checklist/${checklistId}/items/${itemId}/complete`);
      await refreshActiveChecklist(checklistId);
      toast({ title: "Checklist item completed" });
    } catch (error: any) {
      toast({
        title: "Unable to complete item",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setChecklistActionBusy(null);
    }
  };

  const verifyChecklistDocument = async (
    checklistId: number,
    itemId: number,
    documentId: number,
    verificationStatus: "verified" | "rejected"
  ) => {
    try {
      setChecklistActionBusy(`${verificationStatus}:${documentId}`);
      const rejectionReason =
        verificationStatus === "rejected"
          ? window.prompt("Enter a rejection reason for this document:", "") || ""
          : undefined;
      if (verificationStatus === "rejected" && !rejectionReason.trim()) {
        setChecklistActionBusy(null);
        return;
      }
      await documentsAPI.verify(documentId, {
        verificationStatus,
        rejectionReason: rejectionReason?.trim() || undefined,
      });
      await refreshActiveChecklist(checklistId);
      toast({
        title:
          verificationStatus === "verified" ? "Document verified" : "Document rejected",
        description:
          verificationStatus === "verified"
            ? "The checklist document is now approved for completion."
            : "The employee will need to re-upload the document.",
      });
    } catch (error: any) {
      toast({
        title: "Unable to update document",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setChecklistActionBusy(null);
    }
  };

  const saveChecklistItemComments = async (checklistId: number, itemId: number) => {
    try {
      setChecklistActionBusy(`comments:${itemId}`);
      await apiFetch("PATCH", `/induction-checklist/${checklistId}/items/${itemId}/comments`, {
        comments: checklistCommentDrafts[itemId] || "",
      });
      await refreshActiveChecklist(checklistId);
      toast({ title: "Item comments saved" });
    } catch (error: any) {
      toast({
        title: "Unable to save comments",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setChecklistActionBusy(null);
    }
  };

  const signoffChecklistAsHr = async (checklistId: number) => {
    try {
      setChecklistActionBusy(`signoff:${checklistId}`);
      await apiFetch("POST", `/induction-checklist/${checklistId}/hr-signoff`, {
        notes: checklistSignoffNotes || undefined,
      });
      await refreshActiveChecklist(checklistId);
      await loadLifecycleData();
      toast({
        title: "Checklist signed off",
        description: "Induction is now fully completed for this employee.",
      });
    } catch (error: any) {
      toast({
        title: "Unable to sign off checklist",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setChecklistActionBusy(null);
    }
  };

  const handleBulkAssignChecklist = async () => {
    const payload = buildChecklistPayloadItems();
    if ("error" in payload) {
      toast({
        title: "Checklist items required",
        description: payload.error,
        variant: "destructive",
      });
      return;
    }
    const items = payload.items;

    const targetCases = filteredOnboardingCases
      .filter((caseItem) => !caseItem.inductionChecklist && caseItem.profileId)
      .map((caseItem) => ({
        profileId: caseItem.profileId as number,
        onboardingCaseId: caseItem.id,
      }));

    if (targetCases.length === 0) {
      toast({
        title: "No eligible employees",
        description: "There are no onboarding cases ready for checklist assignment.",
        variant: "destructive",
      });
      return;
    }

    try {
      await Promise.all(
        targetCases.map(({ profileId, onboardingCaseId }) =>
          apiFetch("POST", "/induction-checklist", {
            onboardingCaseId,
            employeeProfileId: profileId,
            dueDate: bulkChecklistDueDate || undefined,
            items,
          })
        )
      );
      toast({
        title: "Checklist assigned",
        description: `Assigned to ${targetCases.length} employees.`,
      });
      setBulkChecklistDialogOpen(false);
      await loadLifecycleData();
    } catch (error: any) {
      toast({
        title: "Bulk assignment failed",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    }
  };

  const filteredEmployees = employees.filter(
    (emp) =>
      emp.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.position?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-500";
      case "on_leave":
        return "bg-yellow-500";
      case "terminated":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  const handleDeleteEmployee = async (employee: Employee) => {
    if (!confirm(`Are you sure you want to delete ${employee.first_name} ${employee.last_name}? This action cannot be undone.`)) {
      return;
    }

    try {
      // Delete the profile (which cascades to delete related data)
      await apiFetch('DELETE', `/profiles/${employee.id}`);
      
      toast({
        title: "Success",
        description: `${employee.first_name} ${employee.last_name} has been deleted.`,
      });

      // Reload the employee list
      loadData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete employee",
        variant: "destructive",
      });
    }
  };

  const handleCreateDepartment = () => {
    setEditingDepartment(null);
    setDepartmentForm({
      name: "",
      description: "",
      department_head_id: "",
      partner_profile_id: "",
    });
    setDepartmentManagerIds([]);
    setManagerAssignments({});
    setDepartmentDialogOpen(true);
  };

  const handleEditDepartment = (department: Department) => {
    setEditingDepartment(department);
    const headId = department.department_head_id
      ? String(department.department_head_id)
      : "";
    setDepartmentForm({
      name: department.name,
      description: department.description || "",
      department_head_id: headId,
      partner_profile_id: department.partner_profile_id
        ? String(department.partner_profile_id)
        : "",
    });

    const deptEmployees = employees.filter((emp: any) => {
      const deptId = emp.departmentId || emp.department_id;
      return String(deptId || "") === String(department.id);
    });

    const deptManagerIds = deptEmployees
      .filter((emp: any) => isManagerEmployee(emp))
      .map((emp: any) => String(emp.id));

    const additionalManagers = deptManagerIds.filter((id) => id !== headId);
    setDepartmentManagerIds(additionalManagers);

    const selectedManagers = Array.from(
      new Set([headId, ...additionalManagers].filter(Boolean))
    );

    const assignments: Record<string, string[]> = {};
    selectedManagers.forEach((managerId) => {
      assignments[managerId] = [];
    });

    deptEmployees
      .filter((emp: any) => !isManagerEmployee(emp) && !isPartnerEmployee(emp))
      .forEach((emp: any) => {
        const managerId = String(emp.manager_id ?? emp.managerId ?? "");
        if (managerId && selectedManagers.includes(managerId)) {
          assignments[managerId] = Array.from(
            new Set([...(assignments[managerId] || []), String(emp.id)])
          );
        }
      });

    setManagerAssignments(assignments);
    setDepartmentDialogOpen(true);
  };

  const handleSaveDepartment = async () => {
    if (!departmentForm.name.trim()) {
      toast({
        title: "Error",
        description: "Department name is required",
        variant: "destructive",
      });
      return;
    }
    if (!departmentForm.department_head_id || departmentForm.department_head_id === "none") {
      toast({
        title: "Department head required",
        description: "Please select a manager as department head.",
        variant: "destructive",
      });
      return;
    }
    if (!departmentForm.partner_profile_id || departmentForm.partner_profile_id === "none") {
      toast({
        title: "Assigned partner required",
        description: "Please select the partner responsible for this department.",
        variant: "destructive",
      });
      return;
    }
    const managerIds = new Set(managerEmployees.map((emp: any) => String(emp.id)));
    const selectedManagers = Array.from(
      new Set(
        [departmentForm.department_head_id, ...departmentManagerIds]
          .map((id) => String(id || "").trim())
          .filter(Boolean)
      )
    );

    if (!managerIds.has(String(departmentForm.department_head_id))) {
      toast({
        title: "Invalid department head",
        description: "Department head must be a manager.",
        variant: "destructive",
      });
      return;
    }
    if (selectedManagers.some((managerId) => !managerIds.has(managerId))) {
      toast({
        title: "Invalid manager selection",
        description: "All selected department managers must be manager profiles.",
        variant: "destructive",
      });
      return;
    }
    const partnerIds = new Set(partnerEmployees.map((emp: any) => String(emp.id)));
    if (!partnerIds.has(String(departmentForm.partner_profile_id))) {
      toast({
        title: "Invalid partner assignment",
        description: "Assigned partner must be a partner profile.",
        variant: "destructive",
      });
      return;
    }

    try {
      let departmentId: string | undefined;
      const departmentData = {
        name: departmentForm.name.trim(),
        description: departmentForm.description.trim() || undefined,
        departmentHeadId: departmentForm.department_head_id
          ? Number(departmentForm.department_head_id)
          : undefined,
        partnerProfileId: departmentForm.partner_profile_id
          ? Number(departmentForm.partner_profile_id)
          : undefined,
      };

      if (editingDepartment) {
        await apiFetch("PATCH", `/departments/${editingDepartment.id}`, departmentData);
        departmentId = editingDepartment.id;

        toast({
          title: "Success",
          description: "Department updated successfully",
        });
      } else {
        const createResponse = await apiFetch("POST", "/departments", departmentData);
        const createdDepartment = (createResponse as any)?.data ?? createResponse;
        departmentId = createdDepartment?.id;

        toast({
          title: "Success",
          description: "Department created successfully",
        });
      }

      if (departmentId) {
        const normalizedDepartmentId = Number(departmentId);

        const managerAssignmentEntries = selectedManagers.map((managerId) => ({
          managerId,
          employeeIds: (managerAssignments[managerId] || []).map((id) => String(id)),
        }));

        const managerUpdates = selectedManagers.map((managerId) =>
          apiFetch("PATCH", `/profiles/${managerId}`, {
            departmentId: normalizedDepartmentId,
          })
        );

        const employeeUpdates = managerAssignmentEntries.flatMap(({ managerId, employeeIds }) =>
          employeeIds.map((employeeId) =>
            apiFetch("PATCH", `/profiles/${employeeId}`, {
              departmentId: normalizedDepartmentId,
              managerId: Number(managerId),
            })
          )
        );

        if (managerUpdates.length > 0 || employeeUpdates.length > 0) {
          await Promise.all([...managerUpdates, ...employeeUpdates]);
        }
      }

      setDepartmentDialogOpen(false);
      loadData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDeleteDepartment = async (departmentId: string) => {
    try {
      // Check if department has employees
      const response = await apiFetch(
        "GET",
        `/departments/${departmentId}/employees?page=1&pageSize=1`
      );
      const payload = (response as any)?.data ?? response ?? {};
      const count = Number(
        payload?.total ??
          (Array.isArray(payload?.employees) ? payload.employees.length : 0)
      );

      if (count && count > 0) {
        toast({
          title: "Cannot Delete",
          description: `This department has ${count} employee(s). Please reassign them first.`,
          variant: "destructive",
        });
        setDeletingDepartmentId(null);
        return;
      }

      await apiFetch("DELETE", `/departments/${departmentId}`);

      toast({
        title: "Success",
        description: "Department deleted successfully",
      });

      setDeletingDepartmentId(null);
      loadData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleCreateEmployee = () => {
    setEmployeeForm({
      email: "",
      first_name: "",
      last_name: "",
      phone: "",
      position: "",
      role_id: "",
      access_role: "employee",
      department_id: "",
      manager_id: "",
      hire_date: new Date().toISOString().split("T")[0],
      status: "active",
      hourly_rate: "",
      standard_daily_hours: "8",
      billable_target_percent: "80",
      non_billable_target_percent: "20",
    });
    setEmployeeDialogOpen(true);
  };

  const handleOpenBulkChecklistDialog = async () => {
    setBulkChecklistDueDate("");
    await loadDefaultChecklistTemplate();
    setBulkChecklistDialogOpen(true);
  };

  const handleOpenChecklistDialog = async (employeeId?: string, onboardingCaseId?: number) => {
    setChecklistEmployeeId(employeeId || "");
    setChecklistOnboardingCaseId(onboardingCaseId ? String(onboardingCaseId) : "");
    setChecklistDueDate("");
    await loadDefaultChecklistTemplate();
    setChecklistDialogOpen(true);
  };

  const handleChecklistEmployeeSelect = (employeeId: string) => {
    setChecklistEmployeeId(employeeId);
    const matchedCase = getOnboardingCaseForProfile(Number(employeeId));
    setChecklistOnboardingCaseId(matchedCase ? String(matchedCase.id) : "");
  };

  const handleAssignChecklist = async () => {
    if (!checklistEmployeeId) {
      toast({
        title: "Select employee",
        description: "Choose an employee for the checklist.",
        variant: "destructive",
      });
      return;
    }
    const payload = buildChecklistPayloadItems();
    if ("error" in payload) {
      toast({
        title: "Checklist items required",
        description: payload.error,
        variant: "destructive",
      });
      return;
    }
    const items = payload.items;

    const resolvedEmployeeProfileId = Number(checklistEmployeeId);
    const resolvedCaseId =
      Number(checklistOnboardingCaseId) ||
      getOnboardingCaseForProfile(resolvedEmployeeProfileId)?.id ||
      0;

    if (!resolvedCaseId) {
      toast({
        title: "Onboarding case required",
        description: "Initialize onboarding for this employee before assigning a checklist.",
        variant: "destructive",
      });
      return;
    }

    try {
      await apiFetch("POST", "/induction-checklist", {
        onboardingCaseId: resolvedCaseId,
        employeeProfileId: resolvedEmployeeProfileId,
        dueDate: checklistDueDate || undefined,
        items,
      });
      toast({
        title: "Checklist assigned",
        description: "Onboarding checklist created successfully.",
      });
      setChecklistDialogOpen(false);
      setChecklistDueDate("");
      await loadLifecycleData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to assign checklist",
        variant: "destructive",
      });
    }
  };

  const handleOpenOffboardingDialog = (employeeId?: string) => {
    setOffboardingEmployeeId(employeeId || "");
    setOffboardingReason("");
    setOffboardingDialogOpen(true);
  };

  const handleCreateOffboarding = async () => {
    if (!offboardingEmployeeId) {
      toast({
        title: "Select employee",
        description: "Choose an employee to offboard.",
        variant: "destructive",
      });
      return;
    }

    try {
      await apiFetch("POST", "/offboarding", {
        profileId: Number(offboardingEmployeeId),
        reason: offboardingReason || undefined,
      });
      toast({
        title: "Offboarding initiated",
        description: "Offboarding case created with a default checklist template.",
      });
      setOffboardingDialogOpen(false);
      await loadLifecycleData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to initiate offboarding",
        variant: "destructive",
      });
    }
  };

  const handleUpdateOffboardingStatus = async (
    caseId: number,
    status: OffboardingCase["status"]
  ) => {
    try {
      await apiFetch("PATCH", `/offboarding/${caseId}`, { status });
      toast({
        title: "Offboarding updated",
        description: `Status set to ${status.replace("_", " ")}`,
      });
      await loadLifecycleData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update offboarding",
        variant: "destructive",
      });
    }
  };

  const openOffboardingTasks = async (caseId: number) => {
    try {
      setActiveOffboardingCaseId(caseId);
      setOffboardingTasksDialogOpen(true);
      const response = await apiFetch("GET", `/offboarding/${caseId}/items`);
      const items = response?.data ?? response ?? [];
      setOffboardingTasks(Array.isArray(items) ? items : []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load offboarding tasks",
        variant: "destructive",
      });
    }
  };

  const handleAddOffboardingTask = async () => {
    if (!activeOffboardingCaseId || !newOffboardingTaskName.trim()) {
      toast({
        title: "Task name required",
        description: "Enter a task name to add.",
        variant: "destructive",
      });
      return;
    }
    try {
      const payload = {
        items: [
          {
            itemName: newOffboardingTaskName.trim(),
            description: newOffboardingTaskDescription.trim() || undefined,
            requiresDocument: newOffboardingTaskRequiresDoc,
          },
        ],
      };
      const response = await apiFetch("POST", `/offboarding/${activeOffboardingCaseId}/items`, payload);
      const items = response?.data ?? response ?? [];
      setOffboardingTasks(Array.isArray(items) ? items : []);
      setNewOffboardingTaskName("");
      setNewOffboardingTaskDescription("");
      setNewOffboardingTaskRequiresDoc(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to add task",
        variant: "destructive",
      });
    }
  };

  const handleCompleteOffboardingTask = async (taskId: number) => {
    if (!activeOffboardingCaseId) return;
    try {
      const response = await apiFetch(
        "PATCH",
        `/offboarding/${activeOffboardingCaseId}/items/${taskId}/complete`
      );
      const items = response?.data ?? response ?? [];
      setOffboardingTasks(Array.isArray(items) ? items : []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to complete task",
        variant: "destructive",
      });
    }
  };

  const openAttachDocument = (taskId: number) => {
    setAttachTaskId(taskId);
    setAttachFileName("");
    setAttachFile(null);
    setAttachDocDialogOpen(true);
  };

  const handleAttachDocument = async () => {
    if (!activeOffboardingCaseId || !attachTaskId) return;
    if (!attachFile) {
      toast({
        title: "Document details required",
        description: "Select a file to attach.",
        variant: "destructive",
      });
      return;
    }
    try {
      const upload = await documentsAPI.uploadFile(attachFile, {
        fileName: attachFileName.trim() || attachFile.name,
        documentType: "offboarding_task",
        entityType: "OffboardingChecklistItem",
        entityId: attachTaskId,
        accessLevel: "hr",
        isRequired: true,
        description: "Offboarding task document",
      });
      const documentId = (upload as any)?.id ?? (upload as any)?.data?.id;
      if (!documentId) {
        throw new Error("Upload succeeded but document id was missing.");
      }

      const response = await apiFetch("POST", `/offboarding/${activeOffboardingCaseId}/items/${attachTaskId}/document`, {
        documentId,
      });
      const items = response?.data ?? response ?? [];
      setOffboardingTasks(Array.isArray(items) ? items : []);
      setAttachDocDialogOpen(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to attach document",
        variant: "destructive",
      });
    }
  };

  const handleSaveEmployee = async () => {
    if (!employeeForm.email || !employeeForm.first_name || !employeeForm.last_name) {
      toast({
        title: "Error",
        description: "Email, first name, and last name are required",
        variant: "destructive",
      });
      return;
    }
    if (!employeeForm.role_id) {
      toast({
        title: "Role required",
        description: "Select a billing position for this employee.",
        variant: "destructive",
      });
      return;
    }
    if (!employeeForm.access_role) {
      toast({
        title: "Access role required",
        description: "Select a system access role for this employee.",
        variant: "destructive",
      });
      return;
    }
    const canonicalAccessRole = resolveCanonicalRole(employeeForm.access_role);
    if (!canonicalAccessRole) {
      toast({
        title: "Invalid access role",
        description: "Select a canonical access role.",
        variant: "destructive",
      });
      return;
    }
    try {
      setLoading(true);

      const onboardingResponse = await apiFetch("POST", "/auth/onboard-user", {
        email: employeeForm.email.trim(),
        firstName: employeeForm.first_name.trim(),
        lastName: employeeForm.last_name.trim(),
        phone: employeeForm.phone.trim() || null,
        position: employeeForm.position.trim() || null,
        authRole: canonicalAccessRole,
        roleId: Number(employeeForm.role_id),
        departmentId: employeeForm.department_id || null,
        managerId: employeeForm.manager_id || null,
        hireDate: employeeForm.hire_date || null,
        status: employeeForm.status,
        hourlyRate: employeeForm.hourly_rate ? parseFloat(employeeForm.hourly_rate) : null,
        standardDailyHours: parseFloat(employeeForm.standard_daily_hours) || 8,
        billableTargetPercent: parseFloat(employeeForm.billable_target_percent) || 80,
        nonBillableTargetPercent:
          parseFloat(employeeForm.non_billable_target_percent) || 20,
      });

      const emailDelivery = (onboardingResponse as any)?.emailDelivery;
      const emailDeliveryReason = (onboardingResponse as any)?.emailDeliveryReason;
      const onboardingCaseId =
        (onboardingResponse as any)?.onboarding?.onboardingCaseId ??
        (onboardingResponse as any)?.user?.onboardingCaseId;
      const checklistId =
        (onboardingResponse as any)?.onboarding?.checklistId ??
        (onboardingResponse as any)?.user?.checklistId;
      const checklistProvisioned = Boolean(onboardingCaseId && checklistId);

      toast({
        title: "Success",
        description:
          emailDelivery === "sent"
            ? checklistProvisioned
              ? "Employee onboarded, checklist assigned, and the invite was sent by email."
              : "Employee onboarded and the invite was sent by email."
            : emailDeliveryReason === "dummy_mode"
              ? checklistProvisioned
                ? "Employee onboarded with checklist assigned. Email delivery is disabled in dummy mode, so no invite email was sent."
                : "Employee onboarded. Email delivery is disabled in dummy mode, so no invite email was sent."
              : checklistProvisioned
                ? "Employee onboarded with checklist assigned. Email delivery failed; configure SMTP and resend the invite."
                : "Employee onboarded. Email delivery failed; configure SMTP and resend the invite.",
      });

      setEmployeeDialogOpen(false);
      loadData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Role management functions
  const handleCreateRole = () => {
    setEditingRole(null);
    setRoleForm({
      name: "",
      description: "",
      permissions: [],
      isActive: true,
    });
    setRoleDialogOpen(true);
  };

  const handleEditRole = (role: Role) => {
    setEditingRole(role);
    setRoleForm({
      name: role.name,
      description: role.description || "",
      permissions: role.permissions || [],
      isActive: role.isActive,
    });
    setRoleDialogOpen(true);
  };

  const handleSaveRole = async () => {
    if (!roleForm.name.trim()) {
      toast({
        title: "Error",
        description: "Role name is required",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      const rolePayload = {
        name: roleForm.name.trim(),
        description: roleForm.description.trim() || undefined,
        permissions: roleForm.permissions,
        isActive: roleForm.isActive,
      };
      if (editingRole) {
        await rolesAPI.update(editingRole.id, rolePayload);
        toast({
          title: "Success",
          description: `Role "${roleForm.name}" updated successfully`,
        });
      } else {
        await rolesAPI.create(rolePayload);
        toast({
          title: "Success",
          description: `Role "${roleForm.name}" created successfully`,
        });
      }
      setRoleDialogOpen(false);
      loadData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save role",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRole = async (roleId: number) => {
    if (!confirm("Are you sure you want to deactivate this role?")) return;

    try {
      setLoading(true);
      await rolesAPI.delete(roleId);
      toast({
        title: "Success",
        description: "Role deactivated successfully",
      });
      loadData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to deactivate role",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Employee Management</h1>
            <p className="text-muted-foreground mt-1">Manage employees, departments, and organizational structure</p>
          </div>
        </div>

        <Tabs defaultValue="employees" className="space-y-4">
          <TabsList>
            <TabsTrigger value="employees" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Employees
            </TabsTrigger>
            <TabsTrigger value="departments" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Departments
            </TabsTrigger>
            <TabsTrigger value="lifecycle" className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4" />
              Lifecycle
            </TabsTrigger>
          </TabsList>

          <TabsContent value="employees" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>All Employees</CardTitle>
                    <CardDescription>View and manage all employees in the organization</CardDescription>
                  </div>
                  <Button onClick={handleCreateEmployee}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Employee
                  </Button>
                </div>
                <div className="flex items-center gap-4 mt-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search employees..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading employees...</div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Position</TableHead>
                          <TableHead>Department</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Hire Date</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredEmployees.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                              No employees found
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredEmployees.map((employee) => (
                            <TableRow key={employee.id}>
                              <TableCell className="font-medium">
                                {employee.first_name} {employee.last_name}
                              </TableCell>
                              <TableCell>{employee.email}</TableCell>
                              <TableCell>{employee.position || "-"}</TableCell>
                              <TableCell>{employee.department?.name || "-"}</TableCell>
                              <TableCell>
                                <Badge className={getStatusColor(employee.status)}>
                                  {employee.status?.replace("_", " ")}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {employee.hire_date ? new Date(employee.hire_date).toLocaleDateString() : "-"}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => navigate(`/profile?id=${employee.user_id ?? employee.id}`)}
                                  className="text-primary hover:text-primary"
                                >
                                  <Eye className="h-4 w-4 mr-1" />
                                  View
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => navigate(`/profile?id=${employee.user_id ?? employee.id}`)}
                                  className="text-primary hover:text-primary"
                                >
                                  <Pencil className="h-4 w-4 mr-1" />
                                  Edit
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteEmployee(employee)}
                                  className="text-red-500 hover:text-red-700"
                                >
                                  <Trash2 className="h-4 w-4 mr-1" />
                                  Delete
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Employee Statistics */}
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{employees.length}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Active Employees</CardTitle>
                  <Users className="h-4 w-4 text-green-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {employees.filter((e) => e.status === "active").length}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Departments</CardTitle>
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{safeDepartments.length}</div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Access Control</CardTitle>
                <CardDescription>
                  Manage access roles, billing positions, status, and account actions from this same employee screen.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <UserRoleManagement />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="departments" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Departments</CardTitle>
                    <CardDescription>Create and manage organizational departments</CardDescription>
                  </div>
                  <Button onClick={handleCreateDepartment}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Department
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading departments...</div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {safeDepartments.map((dept) => (
                      <Card key={dept.id} className="relative">
                        <CardHeader>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <CardTitle className="text-lg flex items-center gap-2">
                                <Building2 className="h-5 w-5" />
                                {dept.name}
                              </CardTitle>
                            </div>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEditDepartment(dept)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setDeletingDepartmentId(dept.id)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                          {dept.description && (
                            <CardDescription className="mt-2">{dept.description}</CardDescription>
                          )}
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Employees:</span>
                            <Badge variant="secondary">{dept.employee_count}</Badge>
                          </div>
                          {dept.department_head_name && (
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">Head:</span>
                              <span className="font-medium">{dept.department_head_name}</span>
                            </div>
                          )}
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Partner:</span>
                            <span className="font-medium">
                              {dept.partner_name || "Unassigned"}
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="lifecycle" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle>Onboarding Checklist Flow</CardTitle>
                    <CardDescription>Use checklist assignment and completion as the onboarding flow.</CardDescription>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" asChild>
                      <Link to="/onboarding-policies">
                        <BookOpen className="h-4 w-4 mr-2" />
                        Manage Policies
                      </Link>
                    </Button>
                    <Button variant="outline" onClick={() => void handleOpenBulkChecklistDialog()}>
                      <ClipboardCheck className="h-4 w-4 mr-2" />
                      Bulk Assign
                    </Button>
                    <Button onClick={() => void handleOpenChecklistDialog()}>
                      <ClipboardCheck className="h-4 w-4 mr-2" />
                      Assign Checklist
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {lifecycleLoading ? (
                  <div className="text-center py-6 text-muted-foreground">Loading onboarding cases...</div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>Total: {safeOnboardingCases.length}</span>
                      <span>
                        Pending: {safeOnboardingCases.filter((c) => c.status === "pending").length}
                      </span>
                      <span>
                        In Progress: {safeOnboardingCases.filter((c) => c.status === "in_progress").length}
                      </span>
                      <span>
                        Completed: {safeOnboardingCases.filter((c) => c.status === "completed").length}
                      </span>
                    </div>
                    <div className="space-y-3">
                      <div className="text-sm font-medium">Checklist Execution</div>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <Button
                          type="button"
                          variant={onboardingFilter === "all" ? "default" : "outline"}
                          size="sm"
                          onClick={() => setOnboardingFilter("all")}
                        >
                          All
                        </Button>
                        <Button
                          type="button"
                          variant={onboardingFilter === "pending" ? "default" : "outline"}
                          size="sm"
                          onClick={() => setOnboardingFilter("pending")}
                        >
                          Pending only
                        </Button>
                        <Button
                          type="button"
                          variant={onboardingFilter === "missing" ? "default" : "outline"}
                          size="sm"
                          onClick={() => setOnboardingFilter("missing")}
                        >
                          Missing checklist only
                        </Button>
                      </div>
                      <div className="rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Employee/Candidate</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Checklist</TableHead>
                              <TableHead>Due</TableHead>
                              <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredOnboardingCases.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                                  No onboarding cases yet.
                                </TableCell>
                              </TableRow>
                            ) : (
                              filteredOnboardingCases.map((oc) => (
                                <TableRow key={oc.id}>
                                  <TableCell>
                                    {oc.employee
                                      ? `${oc.employee.firstName} ${oc.employee.lastName}`
                                      : oc.candidate
                                        ? `${oc.candidate.fullName} (Candidate)`
                                        : "Unassigned"}
                                    {oc.candidate?.stage && (
                                      <div className="text-xs text-muted-foreground">
                                        Stage: {oc.candidate.stage.replace("_", " ")}
                                      </div>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant={statusBadgeVariant(oc.status)}>
                                      {oc.status.replace("_", " ")}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    {oc.inductionChecklist ? (
                                      <span className="text-sm text-muted-foreground">
                                        {oc.inductionChecklist.status} ({Math.round(oc.inductionChecklist.completionPercent || 0)}%)
                                      </span>
                                    ) : (
                                      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                                        <span>Not assigned</span>
                                        {isChecklistOverdue(oc) && (
                                          <Badge variant="destructive">Overdue</Badge>
                                        )}
                                      </div>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-sm text-muted-foreground">
                                    <div className="flex items-center gap-2">
                                      <Input
                                        type="date"
                                        value={dueDateEdits[oc.id] ?? (oc.dueDate ? oc.dueDate.split("T")[0] : "")}
                                        onChange={(e) =>
                                          setDueDateEdits((prev) => ({ ...prev, [oc.id]: e.target.value }))
                                        }
                                        className="h-8 w-40"
                                      />
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleUpdateDueDate(oc.id)}
                                        disabled={savingDueDateId === oc.id}
                                      >
                                        {savingDueDateId === oc.id ? "Saving..." : "Save"}
                                      </Button>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <div className="flex items-center justify-end gap-2">
                                      {oc.inductionChecklist && oc.inductionChecklist.status !== "completed" && (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          disabled={remindingChecklistId === oc.inductionChecklist.id}
                                          onClick={() => handleSendChecklistReminder(oc.inductionChecklist.id)}
                                        >
                                          {remindingChecklistId === oc.inductionChecklist.id ? "Sending..." : "Send reminder"}
                                        </Button>
                                      )}
                                      {oc.inductionChecklist && (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => openChecklistDetails(oc.inductionChecklist!.id)}
                                        >
                                          Review / finalize
                                        </Button>
                                      )}
                                      {!oc.inductionChecklist && oc.profileId && (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => void handleOpenChecklistDialog(String(oc.profileId), oc.id)}
                                        >
                                          Assign Checklist
                                        </Button>
                                      )}
                                      {!oc.inductionChecklist && !oc.profileId && (
                                        <Button variant="outline" size="sm" disabled>
                                          Await profile
                                        </Button>
                                      )}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Offboarding Workflow</CardTitle>
                    <CardDescription>Track offboarding status (initiated to in progress to completed)</CardDescription>
                  </div>
                  <Button variant="outline" onClick={() => handleOpenOffboardingDialog()}>
                    <Plus className="h-4 w-4 mr-2" />
                    Initiate Offboarding
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {lifecycleLoading ? (
                  <div className="text-center py-6 text-muted-foreground">Loading offboarding cases...</div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>
                        Initiated: {safeOffboardingCases.filter((c) => c.status === "initiated").length}
                      </span>
                      <span>
                        In Progress: {safeOffboardingCases.filter((c) => c.status === "in_progress").length}
                      </span>
                      <span>
                        Completed: {safeOffboardingCases.filter((c) => c.status === "completed").length}
                      </span>
                    </div>
                    <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Employee</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Reason</TableHead>
                          <TableHead>Initiated</TableHead>
                          <TableHead>Completed</TableHead>
                          <TableHead>Tasks</TableHead>
                          <TableHead className="text-right">Update</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {safeOffboardingCases.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                              No offboarding cases yet.
                            </TableCell>
                          </TableRow>
                        ) : (
                          safeOffboardingCases.map((oc) => (
                            <TableRow key={oc.id}>
                              <TableCell>
                                {oc.employee
                                  ? `${oc.employee.firstName} ${oc.employee.lastName}`
                                  : oc.candidate
                                    ? `${oc.candidate.fullName} (Candidate)`
                                    : "Unassigned"}
                              </TableCell>
                              <TableCell>
                                <Badge variant={statusBadgeVariant(oc.status)}>
                                  {oc.status.replace("_", " ")}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {oc.reason || "--"}
                              </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {formatShortDate(oc.initiatedAt)}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {formatShortDate(oc.completedAt)}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{oc._count?.items ?? 0}</Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openOffboardingTasks(oc.id)}
                                  >
                                    Tasks
                                  </Button>
                                  <Select
                                    value={oc.status}
                                    onValueChange={(value) =>
                                      handleUpdateOffboardingStatus(oc.id, value as OffboardingCase["status"])
                                    }
                                  >
                                    <SelectTrigger className="w-[160px]">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="initiated">Initiated</SelectItem>
                                      <SelectItem value="in_progress">In Progress</SelectItem>
                                      <SelectItem value="completed">Completed</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Create/Edit Department Dialog */}
        <Dialog open={departmentDialogOpen} onOpenChange={setDepartmentDialogOpen}>
          <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingDepartment ? "Edit Department" : "Create Department"}
              </DialogTitle>
              <DialogDescription>
                {editingDepartment
                  ? "Update department information"
                  : "Add a new department to your organization"}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Department Name *</Label>
                <Input
                  id="name"
                  value={departmentForm.name}
                  onChange={(e) =>
                    setDepartmentForm({ ...departmentForm, name: e.target.value })
                  }
                  placeholder="e.g., Engineering, Sales, HR"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="description">Description (Optional)</Label>
                <Textarea
                  id="description"
                  value={departmentForm.description}
                  onChange={(e) =>
                    setDepartmentForm({
                      ...departmentForm,
                      description: e.target.value,
                    })
                  }
                  placeholder="Brief description of the department"
                  rows={3}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="head">Department Head (Manager) *</Label>
                <Select
                  value={departmentForm.department_head_id || ""}
                  onValueChange={handleDepartmentHeadChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select department head" />
                  </SelectTrigger>
                  <SelectContent>
                    {managerEmployees.length === 0 && (
                      <SelectItem value="none" disabled>
                        No managers available
                      </SelectItem>
                    )}
                    {managerEmployees.map((emp: any) => (
                      <SelectItem key={emp.id} value={String(emp.id)}>
                        {emp.first_name} {emp.last_name} - {getRoleLabel(emp) || "Manager"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="partner">Assigned Partner *</Label>
                <Select
                  value={departmentForm.partner_profile_id || ""}
                  onValueChange={(value) =>
                    setDepartmentForm({
                      ...departmentForm,
                      partner_profile_id: value,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select partner" />
                  </SelectTrigger>
                  <SelectContent>
                    {partnerEmployees.length === 0 && (
                      <SelectItem value="none" disabled>
                        No partners available
                      </SelectItem>
                    )}
                    {partnerEmployees.map((emp: any) => (
                      <SelectItem key={emp.id} value={String(emp.id)}>
                        {emp.first_name} {emp.last_name} - {getRoleLabel(emp) || "Partner"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>Additional Managers (Optional)</Label>
                <div className="max-h-36 overflow-y-auto rounded-md border p-3 space-y-2">
                  {managerEmployees
                    .filter((emp: any) => String(emp.id) !== String(departmentForm.department_head_id || ""))
                    .map((emp: any) => {
                      const managerId = String(emp.id);
                      return (
                        <label key={managerId} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={departmentManagerIds.includes(managerId)}
                            onChange={() => toggleAdditionalDepartmentManager(managerId)}
                          />
                          <span>
                            {emp.first_name} {emp.last_name} - {getRoleLabel(emp) || "Manager"}
                          </span>
                        </label>
                      );
                    })}
                  {managerEmployees.filter((emp: any) => String(emp.id) !== String(departmentForm.department_head_id || "")).length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No additional managers available.
                    </p>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Add as many managers as needed for this department.
                </p>
              </div>

              <div className="grid gap-2">
                <Label>Assign Employees Under Managers (Optional)</Label>
                <div className="rounded-md border p-3 space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">
                    Manager load balancing
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span>Managers: {managerLoadSummary.length}</span>
                    <span>Assigned: {totalAssignedEmployees}</span>
                    <span>Avg/Manager: {averageLoad.toFixed(1)}</span>
                    <span>Spread: {loadSpread}</span>
                  </div>
                  {managerLoadSummary.length > 0 ? (
                    <div className="space-y-1">
                      {managerLoadSummary.map((row) => {
                        const delta = row.assignedCount - averageLoad;
                        return (
                          <div
                            key={`load-${row.managerId}`}
                            className="flex items-center justify-between text-xs"
                          >
                            <span className="truncate pr-3">{row.managerName}</span>
                            <span className="flex items-center gap-2">
                              <Badge variant="outline" className="h-5 text-[10px]">
                                {row.assignedCount}
                              </Badge>
                              <span className="text-muted-foreground">
                                {delta >= 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1)} vs avg
                              </span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      No managers selected yet.
                    </p>
                  )}
                </div>
                <div className="max-h-72 overflow-y-auto rounded-md border p-3 space-y-3">
                  {selectedDepartmentManagerIds.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      Select a department head or managers first.
                    </p>
                  )}

                  {selectedDepartmentManagerIds.map((managerId) => {
                    const manager = managerEmployees.find(
                      (emp: any) => String(emp.id) === String(managerId)
                    );
                    const assignedIds = managerAssignments[managerId] || [];
                    return (
                      <div key={managerId} className="rounded-md border p-2">
                        <div className="mb-2 text-sm font-medium">
                          {manager
                            ? `${manager.first_name} ${manager.last_name}`
                            : `Manager ${managerId}`}{" "}
                          <span className="text-xs text-muted-foreground">
                            ({assignedIds.length} assigned)
                          </span>
                        </div>
                        <div className="space-y-1">
                          {assignableEmployees.length === 0 && (
                            <p className="text-xs text-muted-foreground">
                              No employees available.
                            </p>
                          )}
                          {assignableEmployees.map((emp: any) => {
                            const employeeId = String(emp.id);
                            return (
                              <label key={`${managerId}-${employeeId}`} className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={assignedIds.includes(employeeId)}
                                  onChange={() =>
                                    toggleManagerEmployeeAssignment(managerId, employeeId)
                                  }
                                />
                                <span>
                                  {emp.first_name} {emp.last_name} - {getRoleLabel(emp) || "Employee"}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Each employee can be assigned to only one manager in this department.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDepartmentDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveDepartment}>
                {editingDepartment ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog
          open={!!deletingDepartmentId}
          onOpenChange={() => setDeletingDepartmentId(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete the department. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() =>
                  deletingDepartmentId && handleDeleteDepartment(deletingDepartmentId)
                }
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Create Employee Dialog */}
        <Dialog open={employeeDialogOpen} onOpenChange={setEmployeeDialogOpen}>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Employee</DialogTitle>
              <DialogDescription>
                Create a new employee account. A temporary password will be emailed automatically.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="emp-first-name">First Name *</Label>
                  <Input
                    id="emp-first-name"
                    value={employeeForm.first_name}
                    onChange={(e) =>
                      setEmployeeForm({ ...employeeForm, first_name: e.target.value })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="emp-last-name">Last Name *</Label>
                  <Input
                    id="emp-last-name"
                    value={employeeForm.last_name}
                    onChange={(e) =>
                      setEmployeeForm({ ...employeeForm, last_name: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="emp-email">Email *</Label>
                <Input
                  id="emp-email"
                  type="email"
                  value={employeeForm.email}
                  onChange={(e) =>
                    setEmployeeForm({ ...employeeForm, email: e.target.value })
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="emp-phone">Phone</Label>
                  <Input
                    id="emp-phone"
                    type="tel"
                    value={employeeForm.phone}
                    onChange={(e) =>
                      setEmployeeForm({ ...employeeForm, phone: e.target.value })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="emp-access-role">System Access Role *</Label>
                  <Select
                    value={employeeForm.access_role}
                    onValueChange={(value) =>
                      setEmployeeForm({ ...employeeForm, access_role: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select access role" />
                    </SelectTrigger>
                    <SelectContent>
                      {accessRoles.map((roleName) => (
                        <SelectItem key={roleName} value={roleName}>
                          {roleName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="emp-billing-position">Billing Position *</Label>
                <Select
                  value={employeeForm.role_id || ""}
                  onValueChange={(value) => {
                    const selectedRole = roles.find(
                      (role) => String(role.id) === value
                    );
                    setEmployeeForm({
                      ...employeeForm,
                      role_id: value,
                      position: selectedRole?.name || "",
                      hourly_rate: selectedRole?.billingRate
                        ? String(selectedRole.billingRate)
                        : "",
                    });
                  }}
                >
                  <SelectTrigger id="emp-billing-position">
                    <SelectValue placeholder="Select position" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.length === 0 && (
                      <SelectItem value="none" disabled>
                        No roles available
                      </SelectItem>
                    )}
                    {roles.map((role) => (
                      <SelectItem key={role.id} value={String(role.id)}>
                        {role.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Billing rate is derived from this position.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="emp-position">Position</Label>
                  <Input
                    id="emp-position"
                    value={employeeForm.position}
                    onChange={(e) =>
                      setEmployeeForm({ ...employeeForm, position: e.target.value })
                    }
                    placeholder="Optional title override"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="emp-department">Department</Label>
                  <Select
                    value={employeeForm.department_id || "none"}
                    onValueChange={(value) =>
                      setEmployeeForm({
                        ...employeeForm,
                        department_id: value === "none" ? "" : value,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select department" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Department</SelectItem>
                      {safeDepartments.map((dept) => (
                        <SelectItem key={dept.id} value={String(dept.id)}>
                          {dept.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="emp-manager">Manager</Label>
                  <Select
                    value={employeeForm.manager_id || "none"}
                    onValueChange={(value) =>
                      setEmployeeForm({
                        ...employeeForm,
                        manager_id: value === "none" ? "" : value,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select manager" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Manager</SelectItem>
                      {safeEmployees.map((emp) => (
                        <SelectItem key={emp.id} value={String(emp.id)}>
                          {emp.first_name} {emp.last_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="emp-hire-date">Hire Date</Label>
                  <Input
                    id="emp-hire-date"
                    type="date"
                    value={employeeForm.hire_date}
                    onChange={(e) =>
                      setEmployeeForm({ ...employeeForm, hire_date: e.target.value })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="emp-hourly-rate">Hourly Rate</Label>
                  <Input
                    id="emp-hourly-rate"
                    type="number"
                    step="0.01"
                    value={employeeForm.hourly_rate}
                    readOnly
                    disabled
                  />
                  <p className="text-xs text-muted-foreground">
                    Auto-filled from the selected position.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="emp-standard-hours">Standard Daily Hours</Label>
                  <Input
                    id="emp-standard-hours"
                    type="number"
                    step="0.25"
                    min="0.25"
                    max="24"
                    value={employeeForm.standard_daily_hours}
                    onChange={(e) =>
                      setEmployeeForm({
                        ...employeeForm,
                        standard_daily_hours: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="emp-billable-percent">Billable Threshold %</Label>
                  <Input
                    id="emp-billable-percent"
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    value={employeeForm.billable_target_percent}
                    onChange={(e) => {
                      const value = e.target.value;
                      const numeric = Number(value);
                      setEmployeeForm({
                        ...employeeForm,
                        billable_target_percent: value,
                        non_billable_target_percent:
                          Number.isFinite(numeric) && value !== ""
                            ? String(Math.max(0, 100 - numeric))
                            : employeeForm.non_billable_target_percent,
                      });
                    }}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="emp-non-billable-percent">Non-billable %</Label>
                  <Input
                    id="emp-non-billable-percent"
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    value={employeeForm.non_billable_target_percent}
                    onChange={(e) => {
                      const value = e.target.value;
                      const numeric = Number(value);
                      setEmployeeForm({
                        ...employeeForm,
                        non_billable_target_percent: value,
                        billable_target_percent:
                          Number.isFinite(numeric) && value !== ""
                            ? String(Math.max(0, 100 - numeric))
                            : employeeForm.billable_target_percent,
                      });
                    }}
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="emp-status">Status</Label>
                <Select
                  value={employeeForm.status}
                  onValueChange={(value) =>
                    setEmployeeForm({ ...employeeForm, status: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="on_leave">On Leave</SelectItem>
                    <SelectItem value="terminated">Terminated</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEmployeeDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveEmployee} disabled={loading}>
                {loading ? "Creating..." : "Create Employee"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Create/Edit Role Dialog */}
        <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>
                {editingRole ? "Edit Role" : "Create New Role"}
              </DialogTitle>
              <DialogDescription>
                {editingRole
                  ? "Update the system access role details below."
                  : "Add a new system access role. Billing rates are configured in Positions & Rates."}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="role-name">Role Name *</Label>
                <Input
                  id="role-name"
                  value={roleForm.name}
                  onChange={(e) =>
                    setRoleForm({ ...roleForm, name: e.target.value })
                  }
                  placeholder="e.g., Senior Manager"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={roleForm.description}
                  onChange={(e) =>
                    setRoleForm({ ...roleForm, description: e.target.value })
                  }
                  placeholder="Optional description of the role"
                  rows={3}
                />
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="is-active"
                  checked={roleForm.isActive}
                  onChange={(e) =>
                    setRoleForm({ ...roleForm, isActive: e.target.checked })
                  }
                />
                <Label htmlFor="is-active" className="font-normal cursor-pointer">
                  Active
                </Label>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setRoleDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleSaveRole} disabled={loading}>
                {loading
                  ? "Saving..."
                  : editingRole
                    ? "Update Role"
                    : "Create Role"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Bulk Assign Checklist Dialog */}
        <Dialog open={bulkChecklistDialogOpen} onOpenChange={setBulkChecklistDialogOpen}>
          <DialogContent className="w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-hidden">
            <DialogHeader>
              <DialogTitle>Bulk Assign Onboarding Checklist</DialogTitle>
              <DialogDescription>
                Applies to onboarding cases in the current filter that are missing a checklist.
              </DialogDescription>
            </DialogHeader>
            <div className="grid max-h-[calc(90vh-10rem)] gap-4 overflow-y-auto py-2 pr-1">
              <div className="grid gap-2">
                <Label>Checklist Items</Label>
                <p className="text-xs text-muted-foreground">
                  The default induction template mirrors the current HR induction and employee-file checklist.
                </p>
                {checklistTemplateLoading && (
                  <div className="text-xs text-muted-foreground">Loading default induction template...</div>
                )}
                <div className="space-y-3">
                  {checklistDraftItems.map((item, index) => {
                    const itemTypeOption = getChecklistItemTypeOption(item.itemType);
                    const showResourceField =
                      item.itemType === "video_watch" ||
                      item.itemType === "policy_link" ||
                      item.itemType === "external_link";
                    return (
                      <div key={item.id} className="rounded-md border p-3 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground">Item {index + 1}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeChecklistDraftItem(item.id)}
                            disabled={checklistDraftItems.length <= 1}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-1" />
                            Remove
                          </Button>
                        </div>
                        <div className="grid gap-2">
                          <Label>Title</Label>
                          <Input
                            value={item.itemName}
                            onChange={(event) =>
                              updateChecklistDraftItem(item.id, { itemName: event.target.value })
                            }
                            placeholder="e.g. Upload KRA PIN certificate"
                          />
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs">
                          <Badge variant="outline">{item.sectionLabel}</Badge>
                          <Badge variant="secondary">{formatOwnerRoleLabel(item.ownerRole)}</Badge>
                        </div>
                        <div className="grid gap-2 md:grid-cols-2">
                          <div className="grid gap-2">
                            <Label>Section</Label>
                            <Input
                              value={item.sectionLabel}
                              onChange={(event) =>
                                updateChecklistDraftItem(item.id, {
                                  sectionLabel: event.target.value,
                                  sectionKey: event.target.value
                                    .trim()
                                    .toLowerCase()
                                    .replace(/[^a-z0-9]+/g, "_")
                                    .replace(/^_+|_+$/g, "") || "general",
                                })
                              }
                              placeholder="e.g. Employee File"
                            />
                          </div>
                          <div className="grid gap-2">
                            <Label>Owner</Label>
                            <Select
                              value={item.ownerRole}
                              onValueChange={(value) =>
                                updateChecklistDraftItem(item.id, {
                                  ownerRole: value as ChecklistDraftItem["ownerRole"],
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="hr">HR</SelectItem>
                                <SelectItem value="employee">Employee</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="grid gap-2">
                          <Label>HR comments / guidance (optional)</Label>
                          <Textarea
                            rows={2}
                            value={item.comments}
                            onChange={(event) =>
                              updateChecklistDraftItem(item.id, {
                                comments: event.target.value,
                              })
                            }
                            placeholder="Add verification notes or guidance for this induction step"
                          />
                        </div>
                        <div className="grid gap-2 md:grid-cols-2">
                          <div className="grid gap-2">
                            <Label>Type</Label>
                            <Select
                              value={item.itemType}
                              onValueChange={(value) =>
                                updateChecklistDraftItem(item.id, {
                                  itemType: value as ChecklistItemType,
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {CHECKLIST_ITEM_TYPE_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          {showResourceField && (
                            <div className="grid gap-2">
                              <Label>{itemTypeOption.resourceLabel || "Resource URL"}</Label>
                              <Input
                                value={item.resourceUrl}
                                onChange={(event) =>
                                  updateChecklistDraftItem(item.id, {
                                    resourceUrl: event.target.value,
                                  })
                                }
                                placeholder={itemTypeOption.resourcePlaceholder || "https://..."}
                              />
                            </div>
                          )}
                        </div>
                        <div className="grid gap-2">
                          <Label>Description (optional)</Label>
                          <Input
                            value={item.description}
                            onChange={(event) =>
                              updateChecklistDraftItem(item.id, {
                                description: event.target.value,
                              })
                            }
                            placeholder="Guidance shown to the employee"
                          />
                        </div>
                      </div>
                    );
                  })}
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => addChecklistDraftItem("task")}>
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Add Task
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => addChecklistDraftItem("document_upload")}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Add Document Upload
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => addChecklistDraftItem("video_watch")}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Add Video
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => addChecklistDraftItem("policy_link")}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Add Policy Link
                    </Button>
                  </div>
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Due date (optional)</Label>
                <Input
                  type="date"
                  value={bulkChecklistDueDate}
                  onChange={(e) => setBulkChecklistDueDate(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setBulkChecklistDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleBulkAssignChecklist}>Assign to Filtered</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Assign Checklist Dialog */}
        <Dialog open={checklistDialogOpen} onOpenChange={setChecklistDialogOpen}>
          <DialogContent className="w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-hidden">
            <DialogHeader>
              <DialogTitle>Assign Onboarding Checklist</DialogTitle>
              <DialogDescription>
                Choose an employee with an onboarding case and define structured checklist items.
              </DialogDescription>
            </DialogHeader>
            <div className="grid max-h-[calc(90vh-10rem)] gap-4 overflow-y-auto py-2 pr-1">
              <div className="grid gap-2">
                <Label>Employee</Label>
                <Select value={checklistEmployeeId} onValueChange={handleChecklistEmployeeSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {employeesWithOnboardingCases.map((emp) => (
                      <SelectItem key={emp.id} value={String(emp.id)}>
                        {emp.first_name} {emp.last_name} ({emp.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Checklist Items</Label>
                <p className="text-xs text-muted-foreground">
                  The default induction template mirrors the current HR induction and employee-file checklist.
                </p>
                {checklistTemplateLoading && (
                  <div className="text-xs text-muted-foreground">Loading default induction template...</div>
                )}
                <div className="space-y-3">
                  {checklistDraftItems.map((item, index) => {
                    const itemTypeOption = getChecklistItemTypeOption(item.itemType);
                    const showResourceField =
                      item.itemType === "video_watch" ||
                      item.itemType === "policy_link" ||
                      item.itemType === "external_link";
                    return (
                      <div key={item.id} className="rounded-md border p-3 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground">Item {index + 1}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeChecklistDraftItem(item.id)}
                            disabled={checklistDraftItems.length <= 1}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-1" />
                            Remove
                          </Button>
                        </div>
                        <div className="grid gap-2">
                          <Label>Title</Label>
                          <Input
                            value={item.itemName}
                            onChange={(event) =>
                              updateChecklistDraftItem(item.id, { itemName: event.target.value })
                            }
                            placeholder="e.g. Upload ID card"
                          />
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs">
                          <Badge variant="outline">{item.sectionLabel}</Badge>
                          <Badge variant="secondary">{formatOwnerRoleLabel(item.ownerRole)}</Badge>
                        </div>
                        <div className="grid gap-2 md:grid-cols-2">
                          <div className="grid gap-2">
                            <Label>Section</Label>
                            <Input
                              value={item.sectionLabel}
                              onChange={(event) =>
                                updateChecklistDraftItem(item.id, {
                                  sectionLabel: event.target.value,
                                  sectionKey: event.target.value
                                    .trim()
                                    .toLowerCase()
                                    .replace(/[^a-z0-9]+/g, "_")
                                    .replace(/^_+|_+$/g, "") || "general",
                                })
                              }
                              placeholder="e.g. Employee File"
                            />
                          </div>
                          <div className="grid gap-2">
                            <Label>Owner</Label>
                            <Select
                              value={item.ownerRole}
                              onValueChange={(value) =>
                                updateChecklistDraftItem(item.id, {
                                  ownerRole: value as ChecklistDraftItem["ownerRole"],
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="hr">HR</SelectItem>
                                <SelectItem value="employee">Employee</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="grid gap-2">
                          <Label>HR comments / guidance (optional)</Label>
                          <Textarea
                            rows={2}
                            value={item.comments}
                            onChange={(event) =>
                              updateChecklistDraftItem(item.id, {
                                comments: event.target.value,
                              })
                            }
                            placeholder="Add verification notes or guidance for this induction step"
                          />
                        </div>
                        <div className="grid gap-2 md:grid-cols-2">
                          <div className="grid gap-2">
                            <Label>Type</Label>
                            <Select
                              value={item.itemType}
                              onValueChange={(value) =>
                                updateChecklistDraftItem(item.id, {
                                  itemType: value as ChecklistItemType,
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {CHECKLIST_ITEM_TYPE_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          {showResourceField && (
                            <div className="grid gap-2">
                              <Label>{itemTypeOption.resourceLabel || "Resource URL"}</Label>
                              <Input
                                value={item.resourceUrl}
                                onChange={(event) =>
                                  updateChecklistDraftItem(item.id, {
                                    resourceUrl: event.target.value,
                                  })
                                }
                                placeholder={itemTypeOption.resourcePlaceholder || "https://..."}
                              />
                            </div>
                          )}
                        </div>
                        <div className="grid gap-2">
                          <Label>Description (optional)</Label>
                          <Input
                            value={item.description}
                            onChange={(event) =>
                              updateChecklistDraftItem(item.id, {
                                description: event.target.value,
                              })
                            }
                            placeholder="Guidance shown to the employee"
                          />
                        </div>
                      </div>
                    );
                  })}
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => addChecklistDraftItem("task")}>
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Add Task
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => addChecklistDraftItem("document_upload")}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Add Document Upload
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => addChecklistDraftItem("video_watch")}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Add Video
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => addChecklistDraftItem("policy_link")}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Add Policy Link
                    </Button>
                  </div>
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Due date (optional)</Label>
                <Input
                  type="date"
                  value={checklistDueDate}
                  onChange={(e) => setChecklistDueDate(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setChecklistDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAssignChecklist}>Assign Checklist</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Checklist Details Dialog */}
        <Dialog open={checklistViewOpen} onOpenChange={setChecklistViewOpen}>
          <DialogContent className="w-[95vw] sm:max-w-[700px] max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Checklist Details</DialogTitle>
              <DialogDescription>
                Review checklist items, document evidence, and completion status.
              </DialogDescription>
            </DialogHeader>
            {checklistViewLoading ? (
              <div className="py-6 text-sm text-muted-foreground">Loading checklist...</div>
            ) : !activeChecklist ? (
              <div className="py-6 text-sm text-muted-foreground">Checklist not available.</div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-medium">
                    {activeChecklist.checklistName || "Induction Checklist"}
                  </div>
                  <Badge variant="secondary">
                    {activeChecklist.status?.replace("_", " ") || "pending"}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  Completion: {Math.round(activeChecklist.completionPercent || 0)}%
                  {activeChecklist.dueDate && (
                    <> · Due {new Date(activeChecklist.dueDate).toLocaleDateString()}</>
                  )}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-lg border border-border p-3 text-sm">
                    <div className="font-medium">Employee acknowledgement</div>
                    <div className="text-xs text-muted-foreground">
                      {activeChecklist.employeeAcknowledgedAt
                        ? `Acknowledged on ${new Date(activeChecklist.employeeAcknowledgedAt).toLocaleString()}`
                        : "Pending employee acknowledgement after all items are complete."}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border p-3 text-sm">
                    <div className="font-medium">HR signoff</div>
                    <div className="text-xs text-muted-foreground">
                      {activeChecklist.hrSignedOffAt
                        ? `Signed off on ${new Date(activeChecklist.hrSignedOffAt).toLocaleString()}`
                        : "Pending final HR signoff."}
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  {groupChecklistItemsBySection(activeChecklist.items || []).map((section) => (
                    <div key={section.sectionKey} className="space-y-3">
                      <div className="rounded-lg bg-muted/30 px-3 py-2">
                        <div className="font-medium">{section.sectionLabel}</div>
                        <div className="text-xs text-muted-foreground">
                          {section.items.filter((item) => item.isCompleted).length}/{section.items.length} complete
                        </div>
                      </div>
                      {section.items.map((item) => {
                        const filePath = item.document?.filePath;
                        const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:4000";
                        const itemTypeOption = getChecklistItemTypeOption(item.itemType);
                        const rawResourceUrl = String(item.resourceUrl || "").trim();
                        const resourceUrl = rawResourceUrl
                          ? rawResourceUrl.startsWith("/uploads/")
                            ? `${baseUrl}${rawResourceUrl}`
                            : rawResourceUrl
                          : "";
                        const documentVerified = item.document?.verificationStatus === "verified";
                        const canComplete =
                          !item.isCompleted &&
                          (!item.requiresDocument || documentVerified);

                        return (
                          <div key={item.id} className="rounded-lg border border-border p-3">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-medium">{item.itemName}</span>
                                  <Badge variant="outline" className="text-xs">
                                    {itemTypeOption.label}
                                  </Badge>
                                  <Badge variant="secondary" className="text-xs">
                                    {formatOwnerRoleLabel(item.ownerRole)}
                                  </Badge>
                                  {item.requiresDocument && (
                                    <Badge variant="outline" className="text-xs">
                                      Document required
                                    </Badge>
                                  )}
                                  {item.document?.verificationStatus && (
                                    <Badge
                                      variant={verificationBadgeVariant(item.document.verificationStatus) as any}
                                      className="text-xs"
                                    >
                                      {item.document.verificationStatus}
                                    </Badge>
                                  )}
                                  {item.isCompleted && (
                                    <Badge variant="default" className="text-xs">
                                      Completed
                                    </Badge>
                                  )}
                                </div>
                                {item.description && (
                                  <p className="text-xs text-muted-foreground">{item.description}</p>
                                )}
                                {resourceUrl && (
                                  <div className="mt-2">
                                    <Button variant="link" className="h-auto p-0 text-xs" asChild>
                                      <a href={resourceUrl} target="_blank" rel="noreferrer">
                                        Open resource
                                      </a>
                                    </Button>
                                  </div>
                                )}
                                {filePath && (
                                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                    <FileText className="h-4 w-4 text-emerald-500" />
                                    <Button variant="link" className="h-auto p-0 text-xs" asChild>
                                      <a href={`${baseUrl}${filePath}`} target="_blank" rel="noreferrer">
                                        Preview
                                      </a>
                                    </Button>
                                    <Button variant="link" className="h-auto p-0 text-xs" asChild>
                                      <a href={`${baseUrl}${filePath}`} download>
                                        Download
                                      </a>
                                    </Button>
                                    {item.document?.rejectionReason && (
                                      <span className="text-destructive">
                                        Rejection reason: {item.document.rejectionReason}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                {!item.documentId && item.requiresDocument && (
                                  <label className="inline-flex items-center">
                                    <input
                                      type="file"
                                      accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                                      className="hidden"
                                      onChange={(event) => {
                                        const file = event.target.files?.[0];
                                        if (file) {
                                          attachChecklistDocument(activeChecklist.id, item.id, file);
                                        }
                                        event.currentTarget.value = "";
                                      }}
                                    />
                                    <Button size="sm" variant="outline" asChild disabled={checklistUploadBusy === item.id}>
                                      <span>
                                        <Upload className="mr-2 h-4 w-4" />
                                        {checklistUploadBusy === item.id ? "Uploading..." : "Attach"}
                                      </span>
                                    </Button>
                                  </label>
                                )}
                                {item.documentId && item.document?.verificationStatus !== "verified" && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={Boolean(checklistActionBusy)}
                                      onClick={() =>
                                        void verifyChecklistDocument(activeChecklist.id, item.id, item.documentId!, "verified")
                                      }
                                    >
                                      Verify
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={Boolean(checklistActionBusy)}
                                      onClick={() =>
                                        void verifyChecklistDocument(activeChecklist.id, item.id, item.documentId!, "rejected")
                                      }
                                    >
                                      Reject
                                    </Button>
                                  </>
                                )}
                                {!item.isCompleted && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={!canComplete || Boolean(checklistActionBusy)}
                                    onClick={() =>
                                      void completeChecklistItemAsHr(activeChecklist.id, item.id)
                                    }
                                  >
                                    Mark complete
                                  </Button>
                                )}
                              </div>
                            </div>
                            <div className="mt-3 grid gap-2">
                              <Label className="text-xs">HR / manager comments</Label>
                              <Textarea
                                rows={2}
                                value={checklistCommentDrafts[item.id] || ""}
                                onChange={(event) =>
                                  setChecklistCommentDrafts((prev) => ({
                                    ...prev,
                                    [item.id]: event.target.value,
                                  }))
                                }
                                placeholder="Record verification notes, induction comments, or follow-up actions"
                              />
                              <div className="flex justify-end">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={Boolean(checklistActionBusy)}
                                  onClick={() =>
                                    void saveChecklistItemComments(activeChecklist.id, item.id)
                                  }
                                >
                                  Save comments
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
                <div className="space-y-3 rounded-lg border border-border p-3">
                  <div>
                    <div className="font-medium">Final HR signoff</div>
                    <div className="text-xs text-muted-foreground">
                      Sign off once every induction item is complete and the employee has acknowledged the induction.
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label>HR signoff notes</Label>
                    <Textarea
                      rows={3}
                      value={checklistSignoffNotes}
                      onChange={(event) => setChecklistSignoffNotes(event.target.value)}
                      placeholder="Summarize any final induction remarks, exceptions, or observations"
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button
                      disabled={
                        Boolean(checklistActionBusy) ||
                        !activeChecklist.employeeAcknowledgedAt ||
                        (activeChecklist.items || []).some((item) => !item.isCompleted)
                      }
                      onClick={() => void signoffChecklistAsHr(activeChecklist.id)}
                    >
                      {activeChecklist.hrSignedOffAt ? "Re-sign off checklist" : "Sign off checklist"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Initiate Offboarding Dialog */}
        <Dialog open={offboardingDialogOpen} onOpenChange={setOffboardingDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Initiate Offboarding</DialogTitle>
              <DialogDescription>
                Select the employee and provide a reason for offboarding.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label>Employee</Label>
                <Select value={offboardingEmployeeId} onValueChange={setOffboardingEmployeeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((emp) => (
                      <SelectItem key={emp.id} value={String(emp.id)}>
                        {emp.first_name} {emp.last_name} ({emp.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Reason (optional)</Label>
                <Textarea
                  rows={3}
                  value={offboardingReason}
                  onChange={(e) => setOffboardingReason(e.target.value)}
                  placeholder="Reason for offboarding"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOffboardingDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateOffboarding}>Initiate</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Offboarding Tasks Dialog */}
        <Dialog open={offboardingTasksDialogOpen} onOpenChange={setOffboardingTasksDialogOpen}>
          <DialogContent className="sm:max-w-[650px]">
            <DialogHeader>
              <DialogTitle>Offboarding Tasks</DialogTitle>
              <DialogDescription>
                Track handover, document collection, and other offboarding items.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label>New Task</Label>
                <Input
                  value={newOffboardingTaskName}
                  onChange={(e) => setNewOffboardingTaskName(e.target.value)}
                  placeholder="e.g., Return laptop and access card"
                />
                <Textarea
                  rows={2}
                  value={newOffboardingTaskDescription}
                  onChange={(e) => setNewOffboardingTaskDescription(e.target.value)}
                  placeholder="Optional notes or handover details"
                />
                <div className="flex items-center gap-2">
                  <input
                    id="offboarding-requires-doc"
                    type="checkbox"
                    checked={newOffboardingTaskRequiresDoc}
                    onChange={(e) => setNewOffboardingTaskRequiresDoc(e.target.checked)}
                  />
                  <Label htmlFor="offboarding-requires-doc" className="font-normal">
                    Requires document
                  </Label>
                </div>
                <Button onClick={handleAddOffboardingTask} className="w-fit">
                  Add Task
                </Button>
              </div>

              <div className="space-y-2">
                {offboardingTasks.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No offboarding tasks yet.</div>
                ) : (
                  offboardingTasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center justify-between rounded-lg border border-border p-3"
                    >
                      <div className="space-y-1">
                        <div className="font-medium">{task.itemName}</div>
                        {task.description && (
                          <div className="text-xs text-muted-foreground">{task.description}</div>
                        )}
                        {task.requiresDocument && (
                          <Badge variant="outline" className="text-xs">
                            Document required
                          </Badge>
                        )}
                        {task.document?.filePath && (
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <FileText className="h-4 w-4 text-emerald-500" />
                            <Button variant="link" className="h-auto p-0 text-xs" asChild>
                              <a
                                href={`${import.meta.env.VITE_API_URL || "http://localhost:4000"}${task.document.filePath}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Preview
                              </a>
                            </Button>
                            <Button variant="link" className="h-auto p-0 text-xs" asChild>
                              <a
                                href={`${import.meta.env.VITE_API_URL || "http://localhost:4000"}${task.document.filePath}`}
                                download
                              >
                                Download
                              </a>
                            </Button>
                          </div>
                        )}
                      </div>
                      {task.isCompleted ? (
                        <Badge variant="secondary">Completed</Badge>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" onClick={() => openAttachDocument(task.id)}>
                            Attach document
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCompleteOffboardingTask(task.id)}
                            disabled={Boolean(task.requiresDocument && !task.documentId)}
                          >
                            Mark complete
                          </Button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOffboardingTasksDialogOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Attach Document Dialog */}
        <Dialog open={attachDocDialogOpen} onOpenChange={setAttachDocDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Attach Document</DialogTitle>
              <DialogDescription>Link a document to this offboarding task.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label>File Name (optional)</Label>
                <Input
                  value={attachFileName}
                  onChange={(e) => setAttachFileName(e.target.value)}
                  placeholder="e.g., handover-form.pdf"
                />
              </div>
              <div className="grid gap-2">
                <Label>Upload File</Label>
                <Input
                  type="file"
                  accept=".pdf,.doc,.docx,.xlsx,.png,.jpg"
                  onChange={(e) => setAttachFile(e.target.files?.[0] ?? null)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAttachDocDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAttachDocument}>Attach</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default EmployeeManagement;
