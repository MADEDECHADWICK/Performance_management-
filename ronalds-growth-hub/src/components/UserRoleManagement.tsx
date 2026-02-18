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

const VALID_ROLES = [
  "hr",
  "hr_manager",
  "admin",
  "super_admin",
  "gmp",
  "group_managing_partner",
  "partner",
  "manager",
  "marketing",
  "finance",
  "employee",
];

// Role hierarchy for escalation warnings
const ROLE_HIERARCHY: Record<string, number> = {
  employee: 1,
  marketing: 2,
  finance: 2,
  manager: 3,
  partner: 4,
  gmp: 5,
  group_managing_partner: 5,
  hr: 6,
  hr_manager: 6,
  admin: 7,
  super_admin: 8,
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
  const [roleEditorOpen, setRoleEditorOpen] = useState(false);
  const [roleEditorUser, setRoleEditorUser] = useState<User | null>(null);
  const [roleEditorDraft, setRoleEditorDraft] = useState<string[]>([]);
  const [isSavingRoles, setIsSavingRoles] = useState(false);

  const { toast } = useToast();

  const assignableRoles = useMemo(() => {
    const roleSet = new Set<string>(VALID_ROLES);
    moduleRolePolicies.forEach((policy) => roleSet.add(String(policy.name || "").toLowerCase()));
    users.forEach((user) =>
      (user.roles || []).forEach((role) => roleSet.add(String(role || "").toLowerCase()))
    );

    return Array.from(roleSet)
      .filter(Boolean)
      .sort((a, b) => {
        const byPriority = (ROLE_HIERARCHY[b] || 0) - (ROLE_HIERARCHY[a] || 0);
        if (byPriority !== 0) return byPriority;
        return a.localeCompare(b);
      });
  }, [moduleRolePolicies, users]);

  const loadUsers = useCallback(async () => {
    try {
      setIsLoading(true);
      const [data, roles, rolePoliciesResponse, moduleCatalogResponse] = await Promise.all([
        apiFetch("GET", "/user-roles/list/all"),
        apiFetch("GET", "/roles"),
        apiFetch("GET", "/module-access/roles"),
        apiFetch("GET", "/module-access/modules"),
      ]);
      setUsers(data || []);
      setPositionRoles(roles || []);
      setModuleRolePolicies(rolePoliciesResponse?.roles || []);
      setModuleDefinitions(moduleCatalogResponse?.modules || []);

      // Extract unique departments
      const deptSet = new Set<string>();
      data?.forEach((user: User) => {
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
  }, [toast]);

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
      filtered = filtered.filter((user) =>
        user.roles.includes(roleFilter)
      );
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
    if (!selectedPolicyRole && moduleRolePolicies.length > 0) {
      setSelectedPolicyRole(moduleRolePolicies[0].name);
    }
  }, [moduleRolePolicies, selectedPolicyRole]);

  useEffect(() => {
    if (!selectedPolicyRole) return;
    const policy = moduleRolePolicies.find((item) => item.name === selectedPolicyRole);
    const draft: Record<string, string[]> = {};
    moduleDefinitions.forEach((module) => {
      const actions = policy?.explicitAccess?.[module.key] || [];
      draft[module.key] = Array.from(new Set(actions));
    });
    setModuleDraft(draft);
  }, [moduleDefinitions, moduleRolePolicies, selectedPolicyRole]);

  const openRoleEditor = (user: User) => {
    setRoleEditorUser(user);
    setRoleEditorDraft(Array.from(new Set((user.roles || []).map((role) => role.toLowerCase()))));
    setRoleEditorOpen(true);
  };

  const toggleRoleInDraft = (role: string, checked: boolean) => {
    const normalizedRole = role.toLowerCase();
    setRoleEditorDraft((prev) => {
      const current = new Set(prev.map((item) => item.toLowerCase()));
      if (checked) current.add(normalizedRole);
      else current.delete(normalizedRole);
      return Array.from(current);
    });
  };

  const saveRoleEditor = async () => {
    if (!roleEditorUser) return;

    const nextRoles = Array.from(new Set(roleEditorDraft.map((role) => role.toLowerCase())));
    if (nextRoles.length === 0) {
      toast({
        title: "At least one role required",
        description: "Select at least one access role for this user.",
        variant: "destructive",
      });
      return;
    }

    const currentRoles = Array.from(
      new Set((roleEditorUser.roles || []).map((role) => role.toLowerCase()))
    );
    const currentSet = new Set(currentRoles);
    const nextSet = new Set(nextRoles);
    const rolesToAdd = nextRoles.filter((role) => !currentSet.has(role));
    const rolesToRemove = currentRoles.filter((role) => !nextSet.has(role));

    try {
      setIsSavingRoles(true);

      for (const role of rolesToAdd) {
        await apiFetch("POST", "/user-roles", {
          userId: roleEditorUser.id,
          role,
        });
      }

      for (const role of rolesToRemove) {
        await apiFetch("DELETE", "/user-roles", {
          userId: roleEditorUser.id,
          role,
        });
      }

      const currentMax = currentRoles.reduce(
        (max, role) => Math.max(max, ROLE_HIERARCHY[role] || 0),
        0
      );
      const nextMax = nextRoles.reduce((max, role) => Math.max(max, ROLE_HIERARCHY[role] || 0), 0);
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
    return ROLE_COLORS[role] || "bg-gray-100 text-gray-800";
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
      await apiFetch("PUT", `/module-access/roles/${selectedPolicyRole}`, {
        access: moduleDraft,
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
                      {role.charAt(0).toUpperCase() + role.slice(1)}
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
                    <TableHead className="w-[12%]">Current Role</TableHead>
                    <TableHead className="w-[17%]">Billing Position</TableHead>
                    <TableHead className="w-[10%]">Department</TableHead>
                    <TableHead className="w-[8%]">Rate</TableHead>
                    <TableHead className="w-[8%]">Status</TableHead>
                    <TableHead className="w-[12%]">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium truncate" title={user.email}>
                        {user.email}
                      </TableCell>
                      <TableCell className="truncate" title={user.name || "-"}>
                        {user.name || "-"}
                      </TableCell>
                      <TableCell className="min-w-0">
                        <div className="space-y-1">
                          {user.roles.length > 0 ? (
                            user.roles.map((role) => (
                              <Badge key={role} className={getRoleColor(role)}>
                                {role}
                              </Badge>
                            ))
                          ) : (
                            <Badge variant="outline">No role</Badge>
                          )}
                        </div>
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
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => openRoleEditor(user)}
                        >
                          Manage roles...
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
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
            Configure role-level module access. HR can then assign these roles to users.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="w-full md:w-72">
              <label className="text-sm font-medium">Role policy</label>
              <Select value={selectedPolicyRole} onValueChange={setSelectedPolicyRole}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select role policy..." />
                </SelectTrigger>
                <SelectContent>
                  {moduleRolePolicies.map((rolePolicy) => (
                    <SelectItem key={rolePolicy.id} value={rolePolicy.name}>
                      {rolePolicy.name}
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
                const effectiveActions = selectedPolicy?.effectiveAccess?.[module.key] || [];

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
            <DialogTitle>Manage User Roles</DialogTitle>
            <DialogDescription>
              {roleEditorUser
                ? `Select access roles for ${roleEditorUser.email}.`
                : "Select access roles for this user."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {assignableRoles.map((role) => (
              <label key={role} className="flex items-center gap-2 rounded border p-2 text-sm">
                <Checkbox
                  checked={roleEditorDraft.includes(role)}
                  onCheckedChange={(checked) => toggleRoleInDraft(role, checked === true)}
                />
                <span>{role}</span>
              </label>
            ))}
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
            <Button onClick={saveRoleEditor} disabled={isSavingRoles || !roleEditorUser}>
              {isSavingRoles ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Roles"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UserRoleManagement;

