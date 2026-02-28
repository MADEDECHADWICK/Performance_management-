import { useEffect, useState, useCallback, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { Loader2, Search } from "lucide-react";

interface User {
  id: number;
  profileId?: number;
  email: string;
  name: string;
  roles: string[];
  status: string;
  department: string;
  position?: string;
  positionRoleId?: number;
  positionRoleName?: string;
  billingRate?: number | null;
  createdAt: string;
}

interface PositionRole {
  id: number;
  name: string;
  billingRate: number;
  costRate: number;
  isActive: boolean;
}

interface ModuleDefinition {
  key: string;
  label: string;
  description: string;
  actions: string[];
}

interface ModuleRolePolicy {
  id: number;
  name: string;
  isActive: boolean;
  explicitAccess: Record<string, string[]>;
  effectiveAccess: Record<string, string[]>;
  permissionKeys: string[];
}

const MODULE_ACTION_GUIDE: Array<{
  action: string;
  label: string;
  description: string;
}> = [
  {
    action: "read",
    label: "View",
    description: "Can view records, dashboards, and reports.",
  },
  {
    action: "write",
    label: "Create/Update",
    description: "Can add or edit records in the module.",
  },
  {
    action: "approve",
    label: "Approve/Escalate",
    description: "Can approve controlled actions and escalation steps.",
  },
  {
    action: "admin",
    label: "Admin Control",
    description: "Full control, including reassignment and policy-critical actions.",
  },
];

const PRIMARY_ACCESS_ROLE_OPTIONS = [
  { value: "gmp", label: "GMP" },
  { value: "admin", label: "HR/Admin" },
  { value: "partner", label: "Partner" },
  { value: "manager", label: "Manager" },
  { value: "marketing", label: "Marketing" },
  { value: "finance", label: "Finance" },
  { value: "employee", label: "Employee" },
] as const;

const PRIMARY_ACCESS_ROLE_SET = new Set<string>(
  PRIMARY_ACCESS_ROLE_OPTIONS.map((option) => option.value)
);

const PRIMARY_ACCESS_ROLE_LABELS = PRIMARY_ACCESS_ROLE_OPTIONS.reduce<Record<string, string>>(
  (acc, option) => {
    acc[option.value] = option.label;
    return acc;
  },
  {}
);

const PRIMARY_ROLE_ALIASES: Record<string, string> = {
  gmp: "gmp",
  group_managing_partner: "gmp",
  admin: "admin",
  super_admin: "admin",
  hr: "admin",
  hr_manager: "admin",
  partner: "partner",
  manager: "manager",
  marketing: "marketing",
  finance: "finance",
  employee: "employee",
};

const normalizeRoleValue = (value: unknown) => String(value || "").toLowerCase().trim();
const toPrimaryAccessRole = (roleName: unknown) =>
  PRIMARY_ROLE_ALIASES[normalizeRoleValue(roleName)] || normalizeRoleValue(roleName);
const USER_OVERRIDE_ROLE_PREFIX = "user_override_";
const toCamelModuleKey = (value: string) =>
  String(value || "").replace(/_([a-zA-Z0-9])/g, (_, ch: string) => ch.toUpperCase());

const getModuleMatrixActions = (
  matrix: Record<string, string[]> | undefined,
  moduleKey: string
) => {
  if (!matrix) return [];
  const direct = matrix[moduleKey];
  if (Array.isArray(direct)) return direct;
  const camel = matrix[toCamelModuleKey(moduleKey)];
  return Array.isArray(camel) ? camel : [];
};

// Role hierarchy for escalation warnings
const ROLE_HIERARCHY: Record<string, number> = {
  employee: 1,
  marketing: 2,
  finance: 2,
  manager: 3,
  partner: 4,
  gmp: 5,
  admin: 7,
};

// Role color mapping
const ROLE_COLORS: Record<string, string> = {
  admin: "bg-red-100 text-red-800",
  super_admin: "bg-rose-100 text-rose-800",
  hr: "bg-amber-100 text-amber-800",
  hr_manager: "bg-amber-100 text-amber-800",
  gmp: "bg-violet-100 text-violet-800",
  group_managing_partner: "bg-violet-100 text-violet-800",
  partner: "bg-purple-100 text-purple-800",
  manager: "bg-blue-100 text-blue-800",
  marketing: "bg-emerald-100 text-emerald-800",
  finance: "bg-cyan-100 text-cyan-800",
  employee: "bg-gray-100 text-gray-800",
};

const UserRoleManagement = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [departments, setDepartments] = useState<Set<string>>(new Set());
  const [positionRoles, setPositionRoles] = useState<PositionRole[]>([]);
  const [moduleDefinitions, setModuleDefinitions] = useState<ModuleDefinition[]>([]);
  const [moduleRolePolicies, setModuleRolePolicies] = useState<ModuleRolePolicy[]>([]);
  const [selectedPolicyRole, setSelectedPolicyRole] = useState<string>("");
  const [moduleDraft, setModuleDraft] = useState<Record<string, string[]>>({});
  const [isSavingPolicy, setIsSavingPolicy] = useState(false);
  const [showPolicyEditor, setShowPolicyEditor] = useState(false);
  const [showRoleMatrix, setShowRoleMatrix] = useState(false);
  const [roleEditorOpen, setRoleEditorOpen] = useState(false);
  const [roleEditorUser, setRoleEditorUser] = useState<User | null>(null);
  const [roleEditorDraft, setRoleEditorDraft] = useState<string[]>([]);
  const [isSavingRoles, setIsSavingRoles] = useState(false);

  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const currentUserId = Number(currentUser?.id || 0);

  const roleSortWeight = useCallback((role: string) => {
    const normalizedPrimaryRole = toPrimaryAccessRole(role);
    const primaryRoleIndex = PRIMARY_ACCESS_ROLE_OPTIONS.findIndex(
      (option) => option.value === normalizedPrimaryRole
    );
    if (primaryRoleIndex >= 0) return primaryRoleIndex;
    return PRIMARY_ACCESS_ROLE_OPTIONS.length + 100 + (ROLE_HIERARCHY[normalizedPrimaryRole] || 0);
  }, []);

  const isUserOverrideRole = useCallback(
    (roleName: string) =>
      String(roleName || "").toLowerCase().startsWith(USER_OVERRIDE_ROLE_PREFIX),
    []
  );

  const formatRoleLabel = useCallback(
    (roleName: string) => {
      const normalized = toPrimaryAccessRole(roleName);
      const predefinedLabel = PRIMARY_ACCESS_ROLE_LABELS[normalized];
      if (predefinedLabel) return predefinedLabel;
      return String(normalized || "")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase())
        .trim();
    },
    []
  );

  const isSelfRoleEdit = useCallback(
    (targetUser: User | null | undefined) =>
      !!targetUser && currentUserId > 0 && Number(targetUser.id) === currentUserId,
    [currentUserId]
  );

  const assignableRoles = useMemo<string[]>(() => {
    return PRIMARY_ACCESS_ROLE_OPTIONS.map((option) => option.value);
  }, []);

  const sortedRolePolicies = useMemo(
    () =>
      [...moduleRolePolicies].sort((a, b) => {
        const byCoreOrder = roleSortWeight(a.name) - roleSortWeight(b.name);
        if (byCoreOrder !== 0) return byCoreOrder;
        return String(a.name || "").localeCompare(String(b.name || ""));
      }),
    [moduleRolePolicies, roleSortWeight]
  );

  const coreRolePolicies = useMemo(
    () => {
      const matchedPolicies: ModuleRolePolicy[] = [];
      const seenPolicyIds = new Set<number>();

      PRIMARY_ACCESS_ROLE_OPTIONS.forEach((roleOption) => {
        const policy = sortedRolePolicies.find(
          (item) => toPrimaryAccessRole(item.name) === roleOption.value
        );
        if (!policy || seenPolicyIds.has(policy.id)) return;
        seenPolicyIds.add(policy.id);
        matchedPolicies.push(policy);
      });

      return matchedPolicies;
    },
    [sortedRolePolicies]
  );

  const formatActionSummary = useCallback((actions: string[]) => {
    if (!actions || actions.length === 0) return "none";
    const normalized = actions.map((action) => String(action).toLowerCase());
    if (normalized.includes("admin")) return "ADMIN";
    const order = ["read", "write", "approve"];
    return order
      .filter((action) => normalized.includes(action))
      .map((action) => action.charAt(0).toUpperCase())
      .join("/");
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      setIsLoading(true);
      const [data, roles, rolePoliciesResponse, moduleCatalogResponse] = await Promise.all([
        apiFetch("GET", "/user-roles/list/all"),
        apiFetch("GET", "/roles"),
        apiFetch("GET", "/module-access/roles"),
        apiFetch("GET", "/module-access/modules"),
      ]);
      const normalizedUsers = (data || []).map((user: User) => ({
        ...user,
        roles: (user.roles || []).filter((role) => !isUserOverrideRole(role)),
      }));
      setUsers(normalizedUsers);
      setPositionRoles(roles || []);
      setModuleRolePolicies(
        (rolePoliciesResponse?.roles || []).filter(
          (policy: ModuleRolePolicy) => !isUserOverrideRole(policy.name)
        )
      );
      setModuleDefinitions(moduleCatalogResponse?.modules || []);

      // Extract unique departments
      const deptSet = new Set<string>();
      normalizedUsers.forEach((user: User) => {
        if (user.department) deptSet.add(user.department);
      });
      setDepartments(deptSet);
    } catch (error: unknown) {
      const err = error as Record<string, string>;
      console.error("Error loading users:", error);
      toast({
        title: "Error",
        description: err.error || "Failed to load users",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast, isUserOverrideRole]);

  const applyFilters = useCallback(() => {
    let filtered = users;

    // Search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (user) =>
          user.email.toLowerCase().includes(term) ||
          (user.name && user.name.toLowerCase().includes(term))
      );
    }

    // Role filter
    if (roleFilter !== "all") {
      filtered = filtered.filter((user) => {
        const mappedRoles = new Set((user.roles || []).map((role) => toPrimaryAccessRole(role)));
        return mappedRoles.has(roleFilter);
      });
    }

    // Department filter
    if (departmentFilter !== "all") {
      filtered = filtered.filter(
        (user) => user.department === departmentFilter
      );
    }

    // Status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter(
        (user) => user.status === statusFilter
      );
    }

    setFilteredUsers(filtered);
  }, [users, searchTerm, roleFilter, departmentFilter, statusFilter]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  useEffect(() => {
    if (coreRolePolicies.length === 0) return;
    const selectedIsAvailable = coreRolePolicies.some(
      (policy) => policy.name === selectedPolicyRole
    );
    if (!selectedPolicyRole || !selectedIsAvailable) {
      setSelectedPolicyRole(coreRolePolicies[0].name);
    }
  }, [coreRolePolicies, selectedPolicyRole]);

  useEffect(() => {
    if (!selectedPolicyRole) return;
    const policy = moduleRolePolicies.find((item) => item.name === selectedPolicyRole);
    const draft: Record<string, string[]> = {};
    moduleDefinitions.forEach((module) => {
      const actions = getModuleMatrixActions(policy?.explicitAccess, module.key);
      draft[module.key] = Array.from(new Set(actions));
    });
    setModuleDraft(draft);
  }, [moduleDefinitions, moduleRolePolicies, selectedPolicyRole]);

  const openRoleEditor = (user: User) => {
    if (isSelfRoleEdit(user)) {
      toast({
        title: "Action blocked",
        description: "You cannot change your own access roles. Use another HR/Admin account.",
        variant: "destructive",
      });
      return;
    }
    const normalizedRoles = Array.from(
      new Set((user.roles || []).map((role) => String(role || "").toLowerCase().trim()))
    ).sort((a, b) => roleSortWeight(a) - roleSortWeight(b));

    const selectableCurrentRole = normalizedRoles
      .map((role) => toPrimaryAccessRole(role))
      .find((role) => assignableRoles.includes(role));
    setRoleEditorUser(user);
    setRoleEditorDraft(selectableCurrentRole ? [selectableCurrentRole] : []);
    setRoleEditorOpen(true);
  };

  const saveRoleEditor = async () => {
    if (!roleEditorUser) return;
    if (isSelfRoleEdit(roleEditorUser)) {
      toast({
        title: "Action blocked",
        description: "You cannot change your own access roles. Use another HR/Admin account.",
        variant: "destructive",
      });
      return;
    }

    const nextRole = String(roleEditorDraft[0] || "").toLowerCase();
    if (!nextRole) {
      toast({
        title: "Select role",
        description: "Choose one access role for this user.",
        variant: "destructive",
      });
      return;
    }
    if (!PRIMARY_ACCESS_ROLE_SET.has(nextRole)) {
      toast({
        title: "Unsupported role",
        description: "Choose one of the primary access roles.",
        variant: "destructive",
      });
      return;
    }

    const currentRoles = Array.from(
      new Set((roleEditorUser.roles || []).map((role) => String(role || "").toLowerCase().trim()))
    ).sort((a, b) => roleSortWeight(a) - roleSortWeight(b));
    const currentPrimaryRole = currentRoles[0];
    const currentPrimaryAccessRole = toPrimaryAccessRole(currentPrimaryRole);

    if (currentPrimaryAccessRole === nextRole) {
      toast({
        title: "No changes",
        description: `${roleEditorUser.email} is already assigned to ${formatRoleLabel(nextRole)}.`,
      });
      setRoleEditorOpen(false);
      setRoleEditorUser(null);
      setRoleEditorDraft([]);
      return;
    }

    try {
      setIsSavingRoles(true);

      if (currentPrimaryRole) {
        await apiFetch("PUT", "/user-roles/change", {
          userId: roleEditorUser.id,
          oldRole: currentPrimaryRole,
          newRole: nextRole,
        });
      } else {
        await apiFetch("POST", "/user-roles", {
          userId: roleEditorUser.id,
          role: nextRole,
        });
      }

      const currentMax = currentRoles.reduce(
        (max, role) => Math.max(max, ROLE_HIERARCHY[toPrimaryAccessRole(role)] || 0),
        0
      );
      const nextMax = ROLE_HIERARCHY[toPrimaryAccessRole(nextRole)] || 0;
      const escalated = nextMax > currentMax;

      toast({
        title: "Roles updated",
        description: escalated
          ? `${roleEditorUser.email} now has higher-privilege access.`
          : `${roleEditorUser.email} role assignment saved.`,
      });

      setRoleEditorOpen(false);
      setRoleEditorUser(null);
      setRoleEditorDraft([]);
      await loadUsers();
    } catch (error: unknown) {
      const err = error as Record<string, string>;
      console.error("Error saving roles:", error);
      toast({
        title: "Error",
        description: err.error || "Failed to update roles",
        variant: "destructive",
      });
    } finally {
      setIsSavingRoles(false);
    }
  };

  const handlePositionChange = async (user: User, roleId: number) => {
    if (!user.profileId) {
      toast({
        title: "Error",
        description: "Missing profile for this user",
        variant: "destructive",
      });
      return;
    }
    try {
      await apiFetch("PUT", `/employee-roles/${user.profileId}/role`, {
        roleId,
      });

      toast({
        title: "Billing Position Updated",
        description: `${user.email} billing position updated successfully`,
      });

      await loadUsers();
    } catch (error: unknown) {
      const err = error as Record<string, string>;
      console.error("Error updating position:", error);
      toast({
        title: "Error",
        description: err.error || "Failed to update billing position",
        variant: "destructive",
      });
    }
  };

  const getRoleColor = (role: string): string => {
    const normalized = toPrimaryAccessRole(role);
    return ROLE_COLORS[normalized] || "bg-gray-100 text-gray-800";
  };
  const selectedPolicy = moduleRolePolicies.find(
    (item) => item.name === selectedPolicyRole
  );

  const toggleModuleAction = (moduleKey: string, action: string, checked: boolean) => {
    setModuleDraft((prev) => {
      const current = new Set(prev[moduleKey] || []);
      if (checked) current.add(action);
      else current.delete(action);
      return {
        ...prev,
        [moduleKey]: Array.from(current),
      };
    });
  };

  const saveModulePolicy = async () => {
    if (!selectedPolicyRole) {
      toast({
        title: "Select role",
        description: "Choose a role before saving module access.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSavingPolicy(true);
      const accessPayload = Object.fromEntries(
        Object.entries(moduleDraft).map(([moduleKey, actions]) => [
          toCamelModuleKey(moduleKey),
          actions,
        ])
      );
      await apiFetch("PUT", `/module-access/roles/${selectedPolicyRole}`, {
        access: accessPayload,
      });
      toast({
        title: "Module policy updated",
        description: `${selectedPolicyRole} permissions updated successfully.`,
      });
      await loadUsers();
    } catch (error: unknown) {
      const err = error as Record<string, string>;
      toast({
        title: "Failed to update policy",
        description: err.error || "Unable to save module access policy.",
        variant: "destructive",
      });
    } finally {
      setIsSavingPolicy(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-6">
      <div>
        <h3 className="text-2xl font-bold text-foreground mb-2">User Role Management</h3>
        <p className="text-muted-foreground">
          Manage organizational roles and permissions for all users
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Access roles control authorization. Billing position controls job costing/rates.
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Search Users</label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Email or name..."
                  className="pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Role</label>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roles</SelectItem>
                  {assignableRoles.map((role) => (
                    <SelectItem key={role} value={role}>
                      {formatRoleLabel(role)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Department</label>
              <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All departments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All departments</SelectItem>
                  {Array.from(departments).map((dept) => (
                    <SelectItem key={dept} value={dept}>
                      {dept}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>Users ({filteredUsers.length})</CardTitle>
          <CardDescription>
            {filteredUsers.length} of {users.length} users shown
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredUsers.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No users found matching your criteria</p>
            </div>
          ) : (
            <div className="w-full min-w-0">
              <Table className="w-full table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[20%]">Email</TableHead>
                    <TableHead className="w-[13%]">Name</TableHead>
                    <TableHead className="w-[12%]">Access Role</TableHead>
                    <TableHead className="w-[17%]">Billing Position</TableHead>
                    <TableHead className="w-[10%]">Department</TableHead>
                    <TableHead className="w-[8%]">Rate</TableHead>
                    <TableHead className="w-[8%]">Status</TableHead>
                    <TableHead className="w-[13%]">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => {
                    const editingSelf = isSelfRoleEdit(user);
                    const normalizedRoles = Array.from(
                      new Set((user.roles || []).map((role) => String(role || "").toLowerCase().trim()))
                    );
                    const summarizedRoles = Array.from(
                      new Set(normalizedRoles.map((role) => toPrimaryAccessRole(role)))
                    ).sort((a, b) => roleSortWeight(a) - roleSortWeight(b));
                    const primaryRole = summarizedRoles[0];
                    const additionalRoles = Math.max(0, summarizedRoles.length - 1);

                    return (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium truncate" title={user.email}>
                        {user.email}
                      </TableCell>
                      <TableCell className="truncate" title={user.name || "-"}>
                        {user.name || "-"}
                      </TableCell>
                      <TableCell className="min-w-0">
                        {primaryRole ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Badge className={getRoleColor(primaryRole)}>
                                {formatRoleLabel(primaryRole)}
                              </Badge>
                              {additionalRoles > 0 && (
                                <Badge variant="outline">+{additionalRoles}</Badge>
                              )}
                            </div>
                            <div
                              className="text-xs text-muted-foreground truncate"
                              title={summarizedRoles.map((role) => formatRoleLabel(role)).join(", ")}
                            >
                              {summarizedRoles.map((role) => formatRoleLabel(role)).join(", ")}
                            </div>
                          </div>
                        ) : (
                          <Badge variant="outline">No role</Badge>
                        )}
                      </TableCell>
                      <TableCell className="min-w-0">
                        <Select
                          value={user.positionRoleId ? String(user.positionRoleId) : ""}
                          onValueChange={(value) => handlePositionChange(user, Number(value))}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Assign position..." />
                          </SelectTrigger>
                          <SelectContent>
                            {positionRoles.map((role) => (
                              <SelectItem key={role.id} value={String(role.id)}>
                                {role.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div
                          className="text-xs text-muted-foreground mt-1 truncate"
                          title={user.positionRoleName || user.position || "No billing position"}
                        >
                          {user.positionRoleName || user.position || "No billing position"}
                        </div>
                      </TableCell>
                      <TableCell className="truncate" title={user.department || "-"}>
                        {user.department || "-"}
                      </TableCell>
                      <TableCell>
                        {typeof user.billingRate === "number"
                          ? `KES ${user.billingRate.toLocaleString()}`
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={user.status === "active" ? "default" : "secondary"}
                        >
                          {user.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="min-w-0">
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full px-2 text-sm whitespace-nowrap overflow-hidden text-ellipsis"
                          disabled={editingSelf}
                          title={
                            editingSelf
                              ? "Use another HR/Admin account to edit your own roles."
                              : undefined
                          }
                          onClick={() => openRoleEditor(user)}
                        >
                          {editingSelf ? "Current user" : "Manage access"}
                        </Button>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Module Access Policies</CardTitle>
          <CardDescription>
            Configure role-level module access (advanced). Day-to-day assignment should use
            a primary access role per user.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowPolicyEditor((prev) => !prev)}
            >
              {showPolicyEditor ? "Hide policy editor" : "Open policy editor (advanced)"}
            </Button>
          </div>
          {!showPolicyEditor ? (
            <p className="text-sm text-muted-foreground">
              Policy editor is hidden to keep role assignment simple. Open it only when you need
              to customize module rights beyond standard role behavior.
            </p>
          ) : (
            <>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="w-full md:w-72">
              <label className="text-sm font-medium">Role policy</label>
              <Select value={selectedPolicyRole} onValueChange={setSelectedPolicyRole}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select role policy..." />
                </SelectTrigger>
                <SelectContent>
                  {coreRolePolicies.map((rolePolicy) => (
                    <SelectItem key={rolePolicy.id} value={rolePolicy.name}>
                      {formatRoleLabel(rolePolicy.name)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={saveModulePolicy} disabled={!selectedPolicyRole || isSavingPolicy}>
              {isSavingPolicy ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving policy...
                </>
              ) : (
                "Save Module Policy"
              )}
            </Button>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Primary role quick switch</label>
            <div className="flex flex-wrap gap-2">
              {coreRolePolicies.map((rolePolicy) => {
                const active = selectedPolicyRole === rolePolicy.name;
                return (
                  <Button
                    key={`quick-role-${rolePolicy.id}`}
                    type="button"
                    size="sm"
                    variant={active ? "default" : "outline"}
              onClick={() => setSelectedPolicyRole(rolePolicy.name)}
            >
              {formatRoleLabel(rolePolicy.name)}
                  </Button>
                );
              })}
            </div>
          </div>

          {coreRolePolicies.length > 0 && moduleDefinitions.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Primary role access matrix</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowRoleMatrix((prev) => !prev)}
                >
                  {showRoleMatrix ? "Hide matrix" : "Show matrix (advanced)"}
                </Button>
              </div>
              {showRoleMatrix && (
                <>
                  <div className="rounded-md border overflow-x-auto">
                    <Table className="min-w-[980px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[260px]">Module</TableHead>
                          {coreRolePolicies.map((rolePolicy) => (
                            <TableHead
                              key={`matrix-head-${rolePolicy.id}`}
                              className="text-center whitespace-nowrap"
                            >
                              {formatRoleLabel(rolePolicy.name)}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {moduleDefinitions.map((module) => (
                          <TableRow key={`matrix-row-${module.key}`}>
                            <TableCell>
                              <div className="font-medium">{module.label}</div>
                              <div className="text-xs text-muted-foreground">{module.key}</div>
                            </TableCell>
                            {coreRolePolicies.map((rolePolicy) => {
                              const actions = getModuleMatrixActions(
                                rolePolicy.effectiveAccess,
                                module.key
                              );
                              const summary = formatActionSummary(actions);
                              return (
                                <TableCell
                                  key={`matrix-cell-${module.key}-${rolePolicy.id}`}
                                  className="text-center"
                                >
                                  <Badge
                                    variant={summary === "none" ? "secondary" : "outline"}
                                    className="font-mono"
                                  >
                                    {summary}
                                  </Badge>
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Legend: R = read, W = write, A = approve, ADMIN = full module control.
                  </p>
                </>
              )}
            </div>
          )}

          <div className="rounded-md border bg-muted/30 p-3">
            <p className="text-sm font-medium">Action levels</p>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              {MODULE_ACTION_GUIDE.map((item) => (
                <div key={item.action} className="rounded border bg-background p-2">
                  <p className="text-sm font-medium">
                    <span className="mr-2 inline-block rounded bg-muted px-2 py-0.5 font-mono text-xs">
                      {item.action}
                    </span>
                    {item.label}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
                </div>
              ))}
            </div>
          </div>

          {!selectedPolicyRole ? (
            <p className="text-sm text-muted-foreground">
              Select a role to edit module-level permissions.
            </p>
          ) : (
            <div className="space-y-3">
              {moduleDefinitions.map((module) => {
                const currentActions = new Set(moduleDraft[module.key] || []);
                const effectiveActions = getModuleMatrixActions(
                  selectedPolicy?.effectiveAccess,
                  module.key
                );

                return (
                  <div key={module.key} className="rounded border p-3">
                    <div className="mb-2">
                      <p className="font-medium">{module.label}</p>
                      <p className="text-xs text-muted-foreground">{module.description}</p>
                    </div>
                    <div className="flex flex-wrap gap-4">
                      {module.actions.map((action) => (
                        <label key={`${module.key}:${action}`} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={currentActions.has(action)}
                            onCheckedChange={(checked) =>
                              toggleModuleAction(module.key, action, checked === true)
                            }
                          />
                          {action}
                        </label>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Effective access: {effectiveActions.length > 0 ? effectiveActions.join(", ") : "none"}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={roleEditorOpen}
        onOpenChange={(open) => {
          setRoleEditorOpen(open);
          if (!open) {
            setRoleEditorUser(null);
            setRoleEditorDraft([]);
          }
        }}
      >
        <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Access Roles</DialogTitle>
            <DialogDescription>
              {roleEditorUser
                ? `Select a primary access role for ${roleEditorUser.email}.`
                : "Select a primary access role for this user."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <label className="text-sm font-medium">Primary access role</label>
            <Select
              value={roleEditorDraft[0] || ""}
              onValueChange={(value) => setRoleEditorDraft(value ? [value.toLowerCase()] : [])}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select access role..." />
              </SelectTrigger>
              <SelectContent>
                {assignableRoles.map((role) => (
                  <SelectItem key={role} value={role}>
                    {formatRoleLabel(role)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              This sets one primary access role for predictable module authorization.
            </p>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setRoleEditorOpen(false);
                setRoleEditorUser(null);
                setRoleEditorDraft([]);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={saveRoleEditor}
              disabled={isSavingRoles || !roleEditorUser || !roleEditorDraft[0]}
            >
              {isSavingRoles ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Access Role"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UserRoleManagement;

