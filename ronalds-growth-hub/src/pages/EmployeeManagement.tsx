import { useState, useEffect } from "react";
import { apiFetch, authAPI } from "@/integrations/apiClient";
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
import { Eye, Search, Plus, Pencil, Trash2, Building2, Users, Shield, ClipboardCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { rolesAPI, employeeRolesAPI } from "@/integrations/apiClient";
import documentsAPI from "@/lib/api/documents";

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  position: string;
  status: string;
  hire_date: string;
  department_id: string;
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
  billing_rate: number;
  description?: string;
  permissions: string[];
  is_active: boolean;
  createdAt: string;
}

interface OnboardingCase {
  id: number;
  profileId?: number;
  candidateId?: number;
  status: string;
  startDate?: string;
  dueDate?: string;
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
}

interface InductionChecklistItem {
  id: number;
  itemName: string;
  description?: string | null;
  isCompleted: boolean;
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
  const [departmentMemberIds, setDepartmentMemberIds] = useState<string[]>([]);
  const [departmentForm, setDepartmentForm] = useState<DepartmentFormData>({
    name: "",
    description: "",
    department_head_id: "",
    partner_profile_id: "",
  });

  const safeDepartments = Array.isArray(departments) ? departments : [];
  const partnerEmployees = employees.filter((emp: any) => isPartnerEmployee(emp));
  const managerEmployees = employees.filter((emp: any) => isManagerEmployee(emp));

  const toggleDepartmentMember = (employeeId: string) => {
    setDepartmentMemberIds((prev) =>
      prev.includes(employeeId)
        ? prev.filter((id) => id !== employeeId)
        : [...prev, employeeId]
    );
  };
  const [employeeDialogOpen, setEmployeeDialogOpen] = useState(false);
  const [employeeForm, setEmployeeForm] = useState({
    email: "",
    password: "",
    first_name: "",
    last_name: "",
    phone: "",
    position: "",
    role_id: "",
    department_id: "",
    manager_id: "",
    hire_date: "",
    status: "active",
    hourly_rate: "",
  });
  
  // Role management state
  const [roles, setRoles] = useState<Role[]>([]);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [roleForm, setRoleForm] = useState({
    name: "",
    billing_rate: 0,
    description: "",
    permissions: [] as string[],
    is_active: true,
  });

  const [onboardingCases, setOnboardingCases] = useState<OnboardingCase[]>([]);
  const [offboardingCases, setOffboardingCases] = useState<OffboardingCase[]>([]);
  const [lifecycleLoading, setLifecycleLoading] = useState(false);
  const [onboardingFilter, setOnboardingFilter] = useState<"all" | "pending" | "missing">("all");
  const [checklistDialogOpen, setChecklistDialogOpen] = useState(false);
  const [checklistEmployeeId, setChecklistEmployeeId] = useState<string>("");
  const [checklistItemsText, setChecklistItemsText] = useState(
    "Provide ID documents\nComplete induction briefing\nAccept company policies"
  );
  const [checklistDueDate, setChecklistDueDate] = useState("");
  const [bulkChecklistDialogOpen, setBulkChecklistDialogOpen] = useState(false);
  const [bulkChecklistDueDate, setBulkChecklistDueDate] = useState("");
  const [checklistViewOpen, setChecklistViewOpen] = useState(false);
  const [activeChecklist, setActiveChecklist] = useState<InductionChecklistDetail | null>(null);
  const [checklistViewLoading, setChecklistViewLoading] = useState(false);
  const [checklistUploadBusy, setChecklistUploadBusy] = useState<number | null>(null);
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

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load employees with department info
      const employeesResponse = await apiFetch('GET', "/profiles?include_department=true&page=1&pageSize=100");
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
        const position =
          emp.position ??
          emp.positionTitle ??
          emp.position_title ??
          emp.role?.name ??
          "";
        const departmentId =
          emp.department_id ?? emp.departmentId ?? emp.department?.id ?? "";
        return {
          ...emp,
          first_name: firstName,
          last_name: lastName,
          email,
          position,
          department_id: departmentId,
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

  const loadLifecycleData = async () => {
    try {
      setLifecycleLoading(true);
      const [onboardingData, offboardingData] = await Promise.all([
        apiFetch("GET", "/onboarding"),
        apiFetch("GET", "/offboarding"),
      ]);
      const safeOnboardingCases = extractItems(onboardingData);
      const safeOffboardingCases = extractItems(offboardingData);
      setOnboardingCases(Array.isArray(safeOnboardingCases) ? safeOnboardingCases : []);
      setOffboardingCases(Array.isArray(safeOffboardingCases) ? safeOffboardingCases : []);
    } catch (error: any) {
      console.warn("Failed to load lifecycle data:", error);
    } finally {
      setLifecycleLoading(false);
    }
  };

  const safeOnboardingCases = Array.isArray(onboardingCases) ? onboardingCases : [];
  const safeEmployees = Array.isArray(employees) ? employees : [];
  const safeOffboardingCases = Array.isArray(offboardingCases) ? offboardingCases : [];

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
      const data = (response as any)?.data ?? response;
      setActiveChecklist(data);
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

      const refreshed = await apiFetch("GET", `/induction-checklist/${checklistId}`);
      setActiveChecklist((refreshed as any)?.data ?? refreshed);
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

  const handleBulkAssignChecklist = async () => {
    const items = checklistItemsText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (items.length === 0) {
      toast({
        title: "Checklist items required",
        description: "Add at least one checklist item.",
        variant: "destructive",
      });
      return;
    }

    const targetProfiles = filteredOnboardingCases
      .filter((caseItem) => !caseItem.inductionChecklist && caseItem.profileId)
      .map((caseItem) => caseItem.profileId as number);

    if (targetProfiles.length === 0) {
      toast({
        title: "No eligible employees",
        description: "There are no onboarding cases ready for checklist assignment.",
        variant: "destructive",
      });
      return;
    }

    try {
      await Promise.all(
        targetProfiles.map((profileId) =>
          apiFetch("POST", "/induction-checklist", {
            employeeProfileId: profileId,
            dueDate: bulkChecklistDueDate || undefined,
            items: items.map((itemName) => ({ itemName })),
          })
        )
      );
      toast({
        title: "Checklist assigned",
        description: `Assigned to ${targetProfiles.length} employees.`,
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
    setDepartmentMemberIds([]);
    setDepartmentDialogOpen(true);
  };

  const handleEditDepartment = (department: Department) => {
    setEditingDepartment(department);
    setDepartmentForm({
      name: department.name,
      description: department.description || "",
      department_head_id: department.department_head_id
        ? String(department.department_head_id)
        : "",
      partner_profile_id: department.partner_profile_id
        ? String(department.partner_profile_id)
        : "",
    });
    const selectedMembers = employees
      .filter((emp: any) => {
        const deptId = emp.departmentId || emp.department_id;
        return String(deptId || "") === String(department.id);
      })
      .map((emp: any) => String(emp.id));
    setDepartmentMemberIds(selectedMembers);
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
    if (!managerIds.has(String(departmentForm.department_head_id))) {
      toast({
        title: "Invalid department head",
        description: "Department head must be a manager.",
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
        description: departmentForm.description.trim() || null,
        departmentHeadId: departmentForm.department_head_id
          ? Number(departmentForm.department_head_id)
          : null,
        partnerProfileId: departmentForm.partner_profile_id
          ? Number(departmentForm.partner_profile_id)
          : null,
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

      if (departmentId && departmentMemberIds.length > 0) {
        await Promise.all(
          departmentMemberIds.map((empId) =>
            apiFetch("PATCH", `/profiles/${empId}`, {
              department_id: departmentId,
            })
          )
        );
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
      const response = await apiFetch("GET", `/profiles?department_id=${departmentId}`);
      const payload = (response as any)?.data ?? response ?? [];
      const safeEmployees = Array.isArray(payload) ? payload : [];
      const count = safeEmployees.length || 0;

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
      password: Math.random().toString(36).slice(-8) + "Aa1!", // Auto-generate password
      first_name: "",
      last_name: "",
      phone: "",
      position: "",
      role_id: "",
      department_id: "",
      manager_id: "",
      hire_date: new Date().toISOString().split("T")[0],
      status: "active",
      hourly_rate: "",
    });
    setEmployeeDialogOpen(true);
  };

  const handleOpenChecklistDialog = (employeeId?: string) => {
    setChecklistEmployeeId(employeeId || "");
    setChecklistDialogOpen(true);
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
    const items = checklistItemsText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((itemName) => ({ itemName }));
    if (items.length === 0) {
      toast({
        title: "Checklist items required",
        description: "Add at least one checklist item.",
        variant: "destructive",
      });
      return;
    }

    try {
      await apiFetch("POST", "/induction-checklist", {
        employeeProfileId: Number(checklistEmployeeId),
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
        description: "Offboarding case created.",
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
    try {
      setLoading(true);

      await apiFetch("POST", "/auth/register", {
        email: employeeForm.email.trim(),
        password: employeeForm.password,
        first_name: employeeForm.first_name.trim(),
        last_name: employeeForm.last_name.trim(),
        phone: employeeForm.phone.trim() || null,
        position: employeeForm.position.trim() || null,
        department_id: employeeForm.department_id || null,
        manager_id: employeeForm.manager_id || null,
        hire_date: employeeForm.hire_date || null,
        status: employeeForm.status,
        hourly_rate: employeeForm.hourly_rate ? parseFloat(employeeForm.hourly_rate) : null,
      });

      const profileResponse = await apiFetch(
        "GET",
        `/profiles/email/${encodeURIComponent(employeeForm.email.trim())}`
      );
      const profile = (profileResponse as any)?.data ?? profileResponse;
      const profileId = profile?.id;
      if (profileId && employeeForm.role_id) {
        await apiFetch("PUT", `/employees/${profileId}/role`, {
          roleId: Number(employeeForm.role_id),
        });
      }

      toast({
        title: "Success",
        description: "Employee created successfully",
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
      billing_rate: 0,
      description: "",
      permissions: [],
      is_active: true,
    });
    setRoleDialogOpen(true);
  };

  const handleEditRole = (role: Role) => {
    setEditingRole(role);
    setRoleForm({
      name: role.name,
      billing_rate: role.billing_rate,
      description: role.description || "",
      permissions: role.permissions || [],
      is_active: role.is_active,
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
      if (editingRole) {
        await rolesAPI.update(editingRole.id, roleForm);
        toast({
          title: "Success",
          description: `Role "${roleForm.name}" updated successfully`,
        });
      } else {
        await rolesAPI.create(roleForm);
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
            <TabsTrigger value="roles" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Roles
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
                                  onClick={() => navigate(`/profile?id=${employee.user_id}`)}
                                  className="text-primary hover:text-primary"
                                >
                                  <Eye className="h-4 w-4 mr-1" />
                                  View
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

          {/* Roles Tab */}
          <TabsContent value="roles" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>All Roles</CardTitle>
                    <CardDescription>Manage job roles and billing rates</CardDescription>
                  </div>
                  <Button onClick={handleCreateRole}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Role
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Role Name</TableHead>
                      <TableHead>Billing Rate</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Permissions</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {roles.map((role) => (
                      <TableRow key={role.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{role.name}</p>
                            {role.description && (
                              <p className="text-sm text-muted-foreground">{role.description}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono font-semibold">{role.billing_rate.toLocaleString()} KES/hr</span>
                        </TableCell>
                        <TableCell>
                          {role.is_active ? (
                            <Badge variant="default" className="bg-green-600">Active</Badge>
                          ) : (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {role.permissions && role.permissions.length > 0 ? (
                              role.permissions.slice(0, 2).map((perm, idx) => (
                                <Badge key={idx} variant="outline" className="text-xs">
                                  {perm}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-sm text-muted-foreground">No permissions</span>
                            )}
                            {role.permissions && role.permissions.length > 2 && (
                              <Badge variant="outline" className="text-xs">
                                +{role.permissions.length - 2}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditRole(role)}
                          >
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit
                          </Button>
                          {!['super_admin', 'hr_manager', 'Partner', 'Manager', 'Associate', 'Intern', 'Employee'].includes(role.name) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteRole(role.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {roles.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No roles found. Create one to get started.
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
                    <CardTitle>Onboarding Checklists</CardTitle>
                    <CardDescription>Assign induction checklists per employee</CardDescription>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" onClick={() => setBulkChecklistDialogOpen(true)}>
                      <ClipboardCheck className="h-4 w-4 mr-2" />
                      Bulk Assign
                    </Button>
                    <Button onClick={() => handleOpenChecklistDialog()}>
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
                                      View checklist
                                    </Button>
                                  )}
                                  {!oc.inductionChecklist && oc.profileId && (
                                    <Button variant="outline" size="sm" onClick={() => handleOpenChecklistDialog(String(oc.profileId))}>
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
                  onValueChange={(value) =>
                    setDepartmentForm({
                      ...departmentForm,
                      department_head_id: value,
                    })
                  }
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
                      <SelectItem key={emp.id} value={emp.id}>
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
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.first_name} {emp.last_name} - {getRoleLabel(emp) || "Partner"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Assign Employees (Optional)</Label>
                <div className="max-h-48 overflow-y-auto rounded-md border p-3 space-y-2">
                  {employees.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No employees available for assignment.
                    </p>
                  )}
                  {employees.map((emp: any) => (
                    <label key={emp.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={departmentMemberIds.includes(String(emp.id))}
                        onChange={() => toggleDepartmentMember(String(emp.id))}
                      />
                      <span className="flex flex-wrap items-center gap-2">
                        <span>
                          {emp.first_name} {emp.last_name} - {getRoleLabel(emp) || "Employee"}
                        </span>
                        {isManagerEmployee(emp) && (
                          <Badge variant="outline" className="text-[10px]">Manager</Badge>
                        )}
                        {isPartnerEmployee(emp) && (
                          <Badge variant="outline" className="text-[10px]">Partner</Badge>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Selected employees will be assigned to this department.
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
                Create a new employee account with login credentials
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

              <div className="grid gap-2">
                <Label htmlFor="emp-password">Temporary Password *</Label>
                <Input
                  id="emp-password"
                  type="text"
                  value={employeeForm.password}
                  onChange={(e) =>
                    setEmployeeForm({ ...employeeForm, password: e.target.value })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Employee will use this to login. They should change it after first login.
                </p>
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
                  <Label htmlFor="emp-position">Position</Label>
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
                        hourly_rate: selectedRole?.billing_rate
                          ? String(selectedRole.billing_rate)
                          : "",
                      });
                    }}
                  >
                    <SelectTrigger>
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
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
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
                        <SelectItem key={dept.id} value={dept.id}>
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
                        <SelectItem key={emp.id} value={emp.id}>
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
                  ? "Update the role details below."
                  : "Add a new job role with billing rate and permissions."}
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
                <Label htmlFor="billing-rate">Billing Rate (KES/hr) *</Label>
                <Input
                  id="billing-rate"
                  type="number"
                  value={roleForm.billing_rate}
                  onChange={(e) =>
                    setRoleForm({
                      ...roleForm,
                      billing_rate: parseFloat(e.target.value) || 0,
                    })
                  }
                  placeholder="e.g., 10000"
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
                  checked={roleForm.is_active}
                  onChange={(e) =>
                    setRoleForm({ ...roleForm, is_active: e.target.checked })
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
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Bulk Assign Onboarding Checklist</DialogTitle>
              <DialogDescription>
                Applies to onboarding cases in the current filter that are missing a checklist.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label>Checklist Items</Label>
                <Textarea
                  rows={6}
                  value={checklistItemsText}
                  onChange={(e) => setChecklistItemsText(e.target.value)}
                  placeholder="Enter one checklist item per line"
                />
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
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Assign Onboarding Checklist</DialogTitle>
              <DialogDescription>
                Choose an employee and define checklist items (one per line).
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label>Employee</Label>
                <Select value={checklistEmployeeId} onValueChange={setChecklistEmployeeId}>
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
                <Label>Checklist Items</Label>
                <Textarea
                  rows={6}
                  value={checklistItemsText}
                  onChange={(e) => setChecklistItemsText(e.target.value)}
                  placeholder="Enter one checklist item per line"
                />
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
          <DialogContent className="sm:max-w-[700px]">
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
                <div className="space-y-3">
                  {(activeChecklist.items || []).map((item) => {
                    const filePath = item.document?.filePath;
                    const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:4000";
                    return (
                      <div key={item.id} className="rounded-lg border border-border p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{item.itemName}</span>
                              {item.requiresDocument && (
                                <Badge variant="outline" className="text-xs">
                                  Document required
                                </Badge>
                              )}
                              {item.isCompleted && (
                                <Badge variant="secondary" className="text-xs">
                                  Completed
                                </Badge>
                              )}
                            </div>
                            {item.description && (
                              <p className="text-xs text-muted-foreground">{item.description}</p>
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
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
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
                          </div>
                        </div>
                      </div>
                    );
                  })}
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
                          <Button size="sm" variant="outline" onClick={() => handleCompleteOffboardingTask(task.id)}>
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
