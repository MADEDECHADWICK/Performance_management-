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
import { Eye, Search, Plus, Pencil, Trash2, Building2, Users, Shield } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { rolesAPI, employeeRolesAPI } from "@/integrations/apiClient";

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
  department_code: string | null;
  department_head_id: string | null;
  department_head_name?: string;
  employee_count?: number;
}

interface DepartmentFormData {
  name: string;
  description: string;
  department_code: string;
  department_head_id: string;
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

const EmployeeManagement = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [departmentDialogOpen, setDepartmentDialogOpen] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
  const [deletingDepartmentId, setDeletingDepartmentId] = useState<string | null>(null);
  const [departmentForm, setDepartmentForm] = useState<DepartmentFormData>({
    name: "",
    description: "",
    department_code: "",
    department_head_id: "",
  });
  const [employeeDialogOpen, setEmployeeDialogOpen] = useState(false);
  const [employeeForm, setEmployeeForm] = useState({
    email: "",
    password: "",
    first_name: "",
    last_name: "",
    phone: "",
    position: "",
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
  
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load employees with department info
      const employeesData = await apiFetch('GET', "/profiles?include_department=true");

      // Load departments
      const departmentsData = await apiFetch('GET', "/departments");

      // Count employees per department and add department head info
      const departmentsWithCounts = (departmentsData || []).map((dept: any) => {
        const empCount = employeesData?.filter((e: any) => {
          // Check both snake_case and camelCase for compatibility
          const deptId = e.departmentId || e.department_id;
          return deptId === dept.id;
        }).length || 0;
        return { 
          ...dept, 
          employee_count: empCount,
          department_head_name: dept.department_head_name 
        };
      });

      setEmployees(employeesData || []);
      setDepartments(departmentsWithCounts);
      
      // Load roles
      try {
        const rolesData = await rolesAPI.getAll();
        setRoles(rolesData);
      } catch (roleError) {
        console.warn("Failed to load roles:", roleError);
      }
    } catch (error: any) {
      toast({
        title: "Error loading data",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
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
      department_code: "",
      department_head_id: "",
    });
    setDepartmentDialogOpen(true);
  };

  const handleEditDepartment = (department: Department) => {
    setEditingDepartment(department);
    setDepartmentForm({
      name: department.name,
      description: department.description || "",
      department_code: department.department_code || "",
      department_head_id: department.department_head_id || "",
    });
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

    try {
      const departmentData = {
        name: departmentForm.name.trim(),
        description: departmentForm.description.trim() || null,
        department_code: departmentForm.department_code.trim() || null,
        department_head_id: departmentForm.department_head_id && departmentForm.department_head_id !== "none" 
          ? departmentForm.department_head_id 
          : null,
      };

      if (editingDepartment) {
        await apiFetch("PATCH", `/departments/${editingDepartment.id}`, departmentData);

        toast({
          title: "Success",
          description: "Department updated successfully",
        });
      } else {
        await apiFetch("POST", "/departments", departmentData);

        toast({
          title: "Success",
          description: "Department created successfully",
        });
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
      const employees = await apiFetch("GET", `/profiles?department_id=${departmentId}`);
      const count = employees?.length || 0;

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
      department_id: "",
      manager_id: "",
      hire_date: new Date().toISOString().split("T")[0],
      status: "active",
      hourly_rate: "",
    });
    setEmployeeDialogOpen(true);
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
                  <div className="text-2xl font-bold">{departments.length}</div>
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
                    {departments.map((dept) => (
                      <Card key={dept.id} className="relative">
                        <CardHeader>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <CardTitle className="text-lg flex items-center gap-2">
                                <Building2 className="h-5 w-5" />
                                {dept.name}
                              </CardTitle>
                              {dept.department_code && (
                                <p className="text-sm text-muted-foreground mt-1">
                                  Code: {dept.department_code}
                                </p>
                              )}
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
        </Tabs>

        {/* Create/Edit Department Dialog */}
        <Dialog open={departmentDialogOpen} onOpenChange={setDepartmentDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
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
                <Label htmlFor="code">Department Code (Optional)</Label>
                <Input
                  id="code"
                  value={departmentForm.department_code}
                  onChange={(e) =>
                    setDepartmentForm({
                      ...departmentForm,
                      department_code: e.target.value,
                    })
                  }
                  placeholder="e.g., ENG, SAL, HR"
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
                <Label htmlFor="head">Department Head (Optional)</Label>
                <Select
                  value={departmentForm.department_head_id || "none"}
                  onValueChange={(value) =>
                    setDepartmentForm({
                      ...departmentForm,
                      department_head_id: value === "none" ? "" : value,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select department head" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {employees.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.first_name} {emp.last_name} - {emp.position}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                  <Input
                    id="emp-position"
                    value={employeeForm.position}
                    onChange={(e) =>
                      setEmployeeForm({ ...employeeForm, position: e.target.value })
                    }
                  />
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
                      {departments.map((dept) => (
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
                      {employees.map((emp) => (
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
                    onChange={(e) =>
                      setEmployeeForm({ ...employeeForm, hourly_rate: e.target.value })
                    }
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
      </div>
    </DashboardLayout>
  );
};

export default EmployeeManagement;