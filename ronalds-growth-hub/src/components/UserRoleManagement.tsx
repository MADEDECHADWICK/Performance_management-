import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import apiFetch from "@/integrations/apiClient";
import { Loader2, Search, AlertTriangle, CheckCircle2 } from "lucide-react";

interface User {
  id: number;
  email: string;
  name: string;
  roles: string[];
  status: string;
  department: string;
  position?: string;
  createdAt: string;
}

const VALID_ROLES = ["admin", "partner", "manager", "associate", "intern"];

// Role hierarchy for escalation warnings
const ROLE_HIERARCHY: Record<string, number> = {
  intern: 1,
  associate: 2,
  manager: 3,
  partner: 4,
  admin: 5,
};

// Role color mapping
const ROLE_COLORS: Record<string, string> = {
  admin: "bg-red-100 text-red-800",
  partner: "bg-purple-100 text-purple-800",
  manager: "bg-blue-100 text-blue-800",
  associate: "bg-green-100 text-green-800",
  intern: "bg-gray-100 text-gray-800",
};

interface RoleChangeRequest {
  userId: number;
  userEmail: string;
  oldRole: string;
  newRole: string;
  isEscalation: boolean;
}

const UserRoleManagement = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [departments, setDepartments] = useState<Set<string>>(new Set());

  // Role change confirmation state
  const [roleChangeRequest, setRoleChangeRequest] = useState<RoleChangeRequest | null>(null);
  const [isChanging, setIsChanging] = useState(false);

  const { toast } = useToast();

  const loadUsers = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await apiFetch("GET", "/user-roles/list/all");
      setUsers(data || []);

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

  const handleRoleChange = (user: User, currentRole: string, newRole: string) => {
    if (!currentRole) {
      toast({
        title: "Error",
        description: "User has no role to change",
        variant: "destructive",
      });
      return;
    }

    const isEscalation =
      (ROLE_HIERARCHY[newRole] || 0) > (ROLE_HIERARCHY[currentRole] || 0);

    setRoleChangeRequest({
      userId: user.id,
      userEmail: user.email,
      oldRole: currentRole,
      newRole,
      isEscalation,
    });
  };

  const confirmRoleChange = async () => {
    if (!roleChangeRequest) return;

    try {
      setIsChanging(true);
      await apiFetch("PUT", "/user-roles/change", {
        userId: roleChangeRequest.userId,
        oldRole: roleChangeRequest.oldRole,
        newRole: roleChangeRequest.newRole,
      });

      toast({
        title: "Role Updated",
        description: `${roleChangeRequest.userEmail}'s role changed from ${roleChangeRequest.oldRole} to ${roleChangeRequest.newRole}`,
      });

      setRoleChangeRequest(null);
      await loadUsers(); // Refresh the list
    } catch (error: unknown) {
      const err = error as Record<string, string>;
      console.error("Error changing role:", error);
      toast({
        title: "Error",
        description: err.error || "Failed to change role",
        variant: "destructive",
      });
    } finally {
      setIsChanging(false);
    }
  };

  const getRoleColor = (role: string): string => {
    return ROLE_COLORS[role] || "bg-gray-100 text-gray-800";
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
                  {VALID_ROLES.map((role) => (
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
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Current Role</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.email}</TableCell>
                      <TableCell>{user.name || "-"}</TableCell>
                      <TableCell>
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
                      <TableCell>{user.department || "-"}</TableCell>
                      <TableCell>
                        <Badge
                          variant={user.status === "active" ? "default" : "secondary"}
                        >
                          {user.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {user.roles.length > 0 ? (
                          <Select
                            onValueChange={(newRole) =>
                              handleRoleChange(
                                user,
                                user.roles[0], // Use first role as current
                                newRole
                              )
                            }
                          >
                            <SelectTrigger className="w-40">
                              <SelectValue placeholder="Change role..." />
                            </SelectTrigger>
                            <SelectContent>
                              {VALID_ROLES.filter((r) => r !== user.roles[0]).map(
                                (role) => (
                                  <SelectItem key={role} value={role}>
                                    Change to {role}
                                  </SelectItem>
                                )
                              )}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Select
                            onValueChange={(newRole) =>
                              handleRoleChange(user, "", newRole)
                            }
                          >
                            <SelectTrigger className="w-40">
                              <SelectValue placeholder="Assign role..." />
                            </SelectTrigger>
                            <SelectContent>
                              {VALID_ROLES.map((role) => (
                                <SelectItem key={role} value={role}>
                                  {role}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Role Change Confirmation Dialog */}
      <AlertDialog
        open={roleChangeRequest !== null}
        onOpenChange={(open) => {
          if (!open) setRoleChangeRequest(null);
        }}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {roleChangeRequest?.isEscalation ? (
                <>
                  <AlertTriangle className="h-5 w-5 text-yellow-600" />
                  Confirm Role Escalation
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-5 w-5 text-blue-600" />
                  Confirm Role Change
                </>
              )}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4 mt-4">
              {roleChangeRequest?.isEscalation && (
                <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                  <p className="text-sm text-yellow-800">
                    <strong>⚠️ Escalation Warning:</strong> You are promoting this user to a
                    higher-privilege role. This action grants expanded permissions.
                  </p>
                </div>
              )}
              <div className="space-y-2">
                <p className="text-sm">
                  <strong>User:</strong> {roleChangeRequest?.userEmail}
                </p>
                <p className="text-sm">
                  <strong>Change:</strong> {roleChangeRequest?.oldRole} →{" "}
                  <span className="font-semibold text-primary">
                    {roleChangeRequest?.newRole}
                  </span>
                </p>
                <p className="text-sm text-muted-foreground">
                  This change will take effect immediately and be logged in audit records.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-3">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRoleChange}
              disabled={isChanging}
              className="bg-primary hover:bg-primary/90"
            >
              {isChanging ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                "Confirm Change"
              )}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default UserRoleManagement;

