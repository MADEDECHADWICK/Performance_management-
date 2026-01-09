import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiFetch, authAPI } from "@/integrations/apiClient";
import { Plus, Users, DollarSign, TrendingUp, Search, FileText } from "lucide-react";
import { format } from "date-fns";

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  position: string | null;
  department_id: string | null;
  role_id?: string | null;
}

interface JobStaffAssignment {
  employee_id: string;
  employee?: {
    id: string;
    first_name: string;
    last_name: string;
    position: string | null;
  };
}

interface Department {
  id: string;
  name: string;
}

interface Role {
  id: string;
  name: string;
  billing_rate: number;
}

interface Client {
  id: string;
  client_name: string;
}

interface Job {
  id: string;
  job_name: string;
  title?: string; // Fallback for old data
  description: string | null;
  assigned_to: string;
  start_date: string;
  due_date: string | null;
  billable_hours: number | null;
  hourly_rate: number | null;
  fees: number | null;
  status: string;
  job_number: string | null;
  job_code?: string; // Backend uses job_code
  completion_percentage: number | null;
  amount_collected: number | null;
  collection_period: string | null;
  department?: { name: string };
  client?: { client_name: string };
  profile?: {
    id: string;
    first_name: string;
    last_name: string;
    position: string | null;
  };
  job_staff_assignments?: JobStaffAssignment[];
}

interface JobFinancials {
  total_actual_hours: number | null;
  billable_actual_hours: number | null;
  efficiency_ratio: number | null;
  collection_rate: number | null;
  net_revenue: number | null;
}

export default function JobTracking() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStaff, setSelectedStaff] = useState<string[]>([]);
  const { toast } = useToast();

  const [jobFinancials, setJobFinancials] = useState<Record<string, JobFinancials>>({});

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    department_id: "",
    partner_id: "",
    manager_id: "",
    client_id: "",
    start_date: format(new Date(), "yyyy-MM-dd"),
    due_date: "",
    billable_hours: "",
    hourly_rate: "",
    fees: "",
    completion_percentage: "0",
    amount_collected: "",
    collection_period: "",
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      console.log('Loading jobs data...');
      const [jobsData, employeesData, departmentsData, rolesData, clientsData] = await Promise.all([
        apiFetch('GET', "/jobs"),
        apiFetch('GET', "/profiles"),
        apiFetch('GET', "/departments"),
        apiFetch('GET', "/roles"),
        apiFetch('GET', "/clients"),
      ]);

      console.log('Jobs loaded:', jobsData?.length || 0, 'jobs');

      // Transform jobStaffAssignments to job_staff_assignments for consistency
      const transformedJobs = (jobsData || []).map((job: any) => ({
        ...job,
        job_staff_assignments: job.jobStaffAssignments || [],
      }));

      console.log('Transformed jobs:', transformedJobs);
      if (transformedJobs.length > 0) {
        console.log('First transformed job structure:', transformedJobs[0]);
        console.log('First job staff assignments:', transformedJobs[0].job_staff_assignments);
      }
      setJobs(transformedJobs);
      setEmployees(employeesData || []);
      setDepartments(departmentsData || []);
      setRoles(rolesData || []);
      setClients(clientsData || []);

      // Load financial metrics from the job_profitability endpoint
      const finData = await apiFetch('GET', "/job_profitability");
      
      if (finData) {
        const finMap: Record<string, JobFinancials> = {};
        finData.forEach((fin: any) => {
          finMap[fin.job_id] = {
            total_actual_hours: fin.total_actual_hours,
            billable_actual_hours: fin.billable_actual_hours,
            efficiency_ratio: fin.efficiency_ratio,
            collection_rate: fin.collection_rate,
            net_revenue: fin.net_revenue,
          };
        });
        setJobFinancials(finMap);
      }
    } catch (error: any) {
      console.error('Error loading data:', error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedStaff.length === 0) {
      toast({
        title: "Error",
        description: "Please select at least one staff member",
        variant: "destructive",
      });
      return;
    }

    try {
      const user = await authAPI.me();
      if (!user) throw new Error("Not authenticated");

      // Auto-generate job number: JOB-YYYYMMDD-XXXXX
      const now = new Date();
      const dateStr = format(now, "yyyyMMdd");
      const randomNum = Math.floor(Math.random() * 100000).toString().padStart(5, "0");
      const jobNumber = `JOB-${dateStr}-${randomNum}`;

      // Create the job (NO role or rate - it's per-employee based on their own role)
      const jobData = await apiFetch('POST', "/jobs", {
        job_name: formData.title,
        description: formData.description || null,
        assigned_to: selectedStaff[0],
        assigned_by: user.id,
        department_id: formData.department_id || null,
        client_id: formData.client_id || null,
        start_date: formData.start_date,
        due_date: formData.due_date || null,
        billable_hours: formData.billable_hours ? parseFloat(formData.billable_hours) : null,
        hourly_rate: null,
        fees: formData.fees ? parseFloat(formData.fees) : null,
        job_code: jobNumber,
        completion_percentage: formData.completion_percentage ? parseFloat(formData.completion_percentage) : 0,
        amount_collected: formData.amount_collected ? parseFloat(formData.amount_collected) : 0,
        collection_period: formData.collection_period || null,
        status: "pending",
        partner_id: formData.partner_id ? parseInt(formData.partner_id) : null,
        manager_id: formData.manager_id ? parseInt(formData.manager_id) : null,
      });

      console.log(`✓ Job created:`, jobData);
      console.log('Job ID:', jobData.id);
      console.log('Job returned with staff assignments:', jobData.jobStaffAssignments);
      for (const employeeId of selectedStaff) {
        console.log(`Processing employee ID: ${employeeId}`);
        const employee = employees.find(e => e.id === employeeId);
        console.log(`Found employee:`, employee);
        
        if (employee?.role_id) {
          console.log(`Employee has role_id: ${employee.role_id}`);
          const employeeRole = roles.find(r => r.id === employee.role_id);
          console.log(`Found role:`, employeeRole);
          
          if (employeeRole) {
            try {
              const staffAssignmentData = {
                employee_id: parseInt(employeeId),
                assigned_role_id: parseInt(employee.role_id as string),
                assigned_hourly_rate: parseFloat(employeeRole.billing_rate.toString()),
              };
              console.log('Sending staff assignment:', staffAssignmentData);
              
              const assignmentResult = await apiFetch('POST', `/jobs/${jobData.id}/staff`, staffAssignmentData);
              console.log(`✓ Assigned ${employee.first_name} ${employee.last_name} to job ${jobData.id}`, assignmentResult);
            } catch (assignError) {
              console.error(`✗ Failed to assign ${employee.first_name}:`, assignError);
              throw assignError;
            }
          } else {
            console.warn(`No role found for role_id: ${employee.role_id}`);
          }
        } else {
          console.warn(`Employee ${employee?.first_name} has no role_id`);
        }
      }

      toast({
        title: "Success",
        description: `Job ${jobNumber} created! ${selectedStaff.length} staff member${selectedStaff.length > 1 ? 's' : ''} assigned.`,
      });

      setIsDialogOpen(false);
      resetForm();
      loadData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setFormData({
      title: "",
      description: "",
      department_id: "",
      partner_id: "",
      manager_id: "",
      client_id: "",
      start_date: format(new Date(), "yyyy-MM-dd"),
      due_date: "",
      billable_hours: "",
      hourly_rate: "",
      fees: "",
      completion_percentage: "0",
      amount_collected: "",
      collection_period: "",
    });
    setSelectedStaff([]);
  };

  const getStats = () => {
    const pending = jobs.filter(j => j.status === "pending").length;
    const inProgress = jobs.filter(j => j.status === "in_progress").length;
    const completed = jobs.filter(j => j.status === "completed").length;
    
    const totalCollected = jobs
      .filter(j => j.status === "completed")
      .reduce((sum, job) => sum + (job.amount_collected || 0), 0);
    
    const totalRevenue = jobs
      .filter(j => j.status === "completed")
      .reduce((sum, job) => {
        const jobFin = jobFinancials[job.id];
        return sum + (jobFin?.net_revenue || 0);
      }, 0);

    const avgEfficiency = jobs
      .filter(j => j.status === "completed" && jobFinancials[j.id]?.efficiency_ratio)
      .reduce((sum, job) => sum + (jobFinancials[job.id]?.efficiency_ratio || 0), 0) / 
      (jobs.filter(j => j.status === "completed" && jobFinancials[j.id]?.efficiency_ratio).length || 1);

    return { pending, inProgress, completed, totalCollected, totalRevenue, avgEfficiency, total: jobs.length };
  };

  const stats = getStats();

  console.log('Before filtering - jobs state:', jobs);
  console.log('jobs.length:', jobs.length);
  if (jobs.length > 0) {
    console.log('First job for filter test:', jobs[0]);
    console.log('First job.job_name:', jobs[0].job_name);
    console.log('First job.profile:', jobs[0].profile);
  }

  const filteredJobs = jobs.filter(job => {
    const jobTitle = job.job_name || job.title || "";
    const firstName = job.profile?.first_name || "";
    const lastName = job.profile?.last_name || "";
    
    return (
      jobTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
      firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lastName.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  // Filter employees by selected department
  const filteredEmployees = employees;

  // Staff selection handlers
  const handleStaffToggle = (employeeId: string) => {
    setSelectedStaff(prev =>
      prev.includes(employeeId)
        ? prev.filter(id => id !== employeeId)
        : [...prev, employeeId]
    );
  };

  const handleSelectAll = () => {
    setSelectedStaff(filteredEmployees.map(emp => emp.id));
  };

  const handleClearAll = () => {
    setSelectedStaff([]);
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-muted-foreground">Loading job tracking data...</div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Job Tracking Dashboard</h1>
            <p className="text-muted-foreground">Manage and monitor all assigned jobs</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Assign New Job
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[95vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create New Job</DialogTitle>
                <DialogDescription>
                  Create and assign a new job with role-based staff allocation
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Job Information Section */}
                <div className="border-b pb-6">
                  <h3 className="text-lg font-semibold mb-4">Job Information</h3>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="title">Job Title *</Label>
                      <Input
                        id="title"
                        required
                        placeholder="e.g., Website Redesign Project"
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        placeholder="Provide project details and requirements"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        rows={3}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="client_id">Client</Label>
                        <Select
                          value={formData.client_id}
                          onValueChange={(value) => setFormData({ ...formData, client_id: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select client" />
                          </SelectTrigger>
                          <SelectContent>
                            {clients.filter(client => client.id && client.id.trim() !== '').map((client) => (
                              <SelectItem key={client.id} value={client.id}>
                                {client.client_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Schedule Information Section */}
                <div className="border-b pb-6">
                  <h3 className="text-lg font-semibold mb-4">Schedule Information</h3>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="start_date">Start Date *</Label>
                        <Input
                          id="start_date"
                          type="date"
                          required
                          value={formData.start_date}
                          onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="due_date">Due Date</Label>
                        <Input
                          id="due_date"
                          type="date"
                          value={formData.due_date}
                          onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Partners & Management Section */}
                <div className="border-b pb-6">
                  <h3 className="text-lg font-semibold mb-4">Partners & Management</h3>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="partner_id">Partner</Label>
                        <Select
                          value={formData.partner_id}
                          onValueChange={(value) => setFormData({ ...formData, partner_id: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select partner" />
                          </SelectTrigger>
                          <SelectContent>
                            {employees.filter(emp => emp.id && emp.first_name).map((emp) => (
                              <SelectItem key={emp.id} value={emp.id}>
                                {emp.first_name} {emp.last_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="manager_id">Manager</Label>
                        <Select
                          value={formData.manager_id}
                          onValueChange={(value) => setFormData({ ...formData, manager_id: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select manager" />
                          </SelectTrigger>
                          <SelectContent>
                            {employees.filter(emp => emp.id && emp.first_name).map((emp) => (
                              <SelectItem key={emp.id} value={emp.id}>
                                {emp.first_name} {emp.last_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Assignment Section */}
                <div className="border-b pb-6">
                  <h3 className="text-lg font-semibold mb-4">Staff Assignment</h3>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Department</Label>
                      <Select
                        value={formData.department_id}
                        onValueChange={(value) => setFormData({ ...formData, department_id: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select department (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          {departments.filter(dept => dept.id && dept.name).map((dept) => (
                            <SelectItem key={dept.id} value={String(dept.id)}>
                              {dept.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Assign Staff * ({selectedStaff.length} selected)</Label>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleSelectAll}
                            disabled={filteredEmployees.length === 0}
                          >
                            Select All
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleClearAll}
                            disabled={selectedStaff.length === 0}
                          >
                            Clear All
                          </Button>
                        </div>
                      </div>
                      <div className="border rounded-lg p-4 max-h-[250px] overflow-y-auto space-y-2 bg-muted/30">
                        {filteredEmployees.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-8">
                            No employees available
                          </p>
                        ) : (
                          filteredEmployees.map((employee) => (
                            <div key={employee.id} className="flex items-center space-x-3 p-3 hover:bg-accent rounded-md transition">
                              <Checkbox
                                id={`staff-${employee.id}`}
                                checked={selectedStaff.includes(employee.id)}
                                onCheckedChange={() => handleStaffToggle(employee.id)}
                              />
                              <label
                                htmlFor={`staff-${employee.id}`}
                                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                              >
                                <div>{employee.first_name} {employee.last_name}</div>
                                <div className="text-xs text-muted-foreground">
                                  {employee.position || "No position"}
                                </div>
                              </label>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Budget & Billing Section */}
                <div className="border-b pb-6">
                  <h3 className="text-lg font-semibold mb-4">Budget & Billing</h3>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="billable_hours">Estimated Billable Hours</Label>
                        <Input
                          id="billable_hours"
                          type="number"
                          step="0.1"
                          placeholder="0.0"
                          value={formData.billable_hours}
                          onChange={(e) => setFormData({ ...formData, billable_hours: e.target.value })}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="fees">Total Fees (KES)</Label>
                        <Input
                          id="fees"
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={formData.fees}
                          onChange={(e) => setFormData({ ...formData, fees: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Progress Section */}
                <div>
                  <h3 className="text-lg font-semibold mb-4">Progress</h3>
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="completion_percentage">Completion %</Label>
                        <Input
                          id="completion_percentage"
                          type="number"
                          min="0"
                          max="100"
                          placeholder="0"
                          value={formData.completion_percentage}
                          onChange={(e) => setFormData({ ...formData, completion_percentage: e.target.value })}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="amount_collected">Amount Collected (KES)</Label>
                        <Input
                          id="amount_collected"
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={formData.amount_collected}
                          onChange={(e) => setFormData({ ...formData, amount_collected: e.target.value })}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="collection_period">Collection Period</Label>
                        <Input
                          id="collection_period"
                          placeholder="Q1 2024"
                          value={formData.collection_period}
                          onChange={(e) => setFormData({ ...formData, collection_period: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 justify-end pt-4 border-t">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                    Create & Assign Job
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Jobs</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Jobs</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pending + stats.inProgress}</div>
              <p className="text-xs text-muted-foreground">
                {stats.pending} pending, {stats.inProgress} in progress
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed</CardTitle>
              <TrendingUp className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.completed}</div>
              <p className="text-xs text-muted-foreground">
                {stats.total > 0 ? ((stats.completed / stats.total) * 100).toFixed(0) : 0}% completion rate
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Collections</CardTitle>
              <DollarSign className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">KES {stats.totalCollected.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                Net: KES {stats.totalRevenue.toLocaleString()}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Efficiency</CardTitle>
              <TrendingUp className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.avgEfficiency.toFixed(0)}%</div>
              <p className="text-xs text-muted-foreground">Billable hours ratio</p>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by job title or employee name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-sm"
          />
        </div>

        {/* Jobs Table */}
        <Tabs defaultValue="all">
          <TabsList>
            <TabsTrigger value="all">All Jobs ({stats.total})</TabsTrigger>
            <TabsTrigger value="pending">Pending ({stats.pending})</TabsTrigger>
            <TabsTrigger value="in_progress">In Progress ({stats.inProgress})</TabsTrigger>
            <TabsTrigger value="completed">Completed ({stats.completed})</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-4">
            <JobsTable jobs={filteredJobs} />
          </TabsContent>

          <TabsContent value="pending" className="space-y-4">
            <JobsTable jobs={filteredJobs.filter(j => j.status === "pending")} />
          </TabsContent>

          <TabsContent value="in_progress" className="space-y-4">
            <JobsTable jobs={filteredJobs.filter(j => j.status === "in_progress")} />
          </TabsContent>

          <TabsContent value="completed" className="space-y-4">
            <JobsTable jobs={filteredJobs.filter(j => j.status === "completed")} />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

function JobsTable({ jobs }: { jobs: Job[] }) {
  console.log('JobsTable received jobs:', jobs);
  console.log('JobsTable jobs.length:', jobs.length);
  if (jobs.length > 0) {
    console.log('First job:', jobs[0]);
  }
  
  const [jobFinancials, setJobFinancials] = useState<Record<string, JobFinancials>>({});

  useEffect(() => {
    loadJobFinancials();
  }, [jobs]);

  const loadJobFinancials = async () => {
    const finData = await apiFetch('GET', "/job_profitability");
    
    if (finData) {
      const finMap: Record<string, JobFinancials> = {};
      finData.forEach((fin: any) => {
        finMap[fin.job_id] = {
          total_actual_hours: fin.total_actual_hours,
          billable_actual_hours: fin.billable_actual_hours,
          efficiency_ratio: fin.efficiency_ratio,
          collection_rate: fin.collection_rate,
          net_revenue: fin.net_revenue,
        };
      });
      setJobFinancials(finMap);
    }
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      pending: "bg-yellow-100 text-yellow-800",
      in_progress: "bg-blue-100 text-blue-800",
      completed: "bg-green-100 text-green-800",
      approved: "bg-purple-100 text-purple-800",
    };
    return (
      <Badge className={styles[status as keyof typeof styles] || ""}>
        {status.replace("_", " ")}
      </Badge>
    );
  };

  const calculateValue = (job: Job) => {
    let value = 0;
    // Calculate from billable hours and hourly rate if available
    if (job.billable_hours && job.hourly_rate) {
      value += job.billable_hours * job.hourly_rate;
    }
    // Add fees/fixed amount
    if (job.fees) {
      value += job.fees;
    }
    // If no hourly calculation, just use fees (which may be 0)
    return value || 0;
  };

  const getStaffDisplay = (job: Job) => {
    const staffCount = job.job_staff_assignments?.length || 0;
    const staffNames = job.job_staff_assignments
      ?.map(assignment => {
        const emp = assignment.employee;
        return emp ? `${emp.first_name} ${emp.last_name}` : 'Unknown';
      })
      .join(", ") || "No staff assigned";
    
    return { staffCount, staffNames };
  };

  if (jobs.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-32">
          <p className="text-muted-foreground">No jobs found</p>
        </CardContent>
      </Card>
    );
  }

  console.log('First job object:', jobs[0]);
  console.log('First job staff assignments:', (jobs[0] as any).job_staff_assignments);
  console.log('First job fees:', (jobs[0] as any).fees);


  return (
    <div className="space-y-4">
      {jobs.map((job) => {
        const staffInfo = getStaffDisplay(job);
        const financials = jobFinancials[job.id];
        
        return (
          <Card key={job.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <CardTitle className="text-lg">{job.job_name || job.title || 'Untitled Job'}</CardTitle>
                    {job.job_number && (
                      <Badge variant="outline" className="text-xs">
                        {job.job_number}
                      </Badge>
                    )}
                    {getStatusBadge(job.status)}
                  </div>
                  <CardDescription>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">Staff:</span>
                        <Badge variant="secondary" className="text-xs">
                          {staffInfo.staffCount} member{staffInfo.staffCount !== 1 ? 's' : ''}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {staffInfo.staffNames}
                        </span>
                      </div>
                      {job.department && <p>Department: {job.department.name}</p>}
                      {job.client && <p>Client: {job.client.client_name}</p>}
                      <p>
                        Start: {format(new Date(job.start_date), "MMM dd, yyyy")}
                        {job.due_date && ` • Due: ${format(new Date(job.due_date), "MMM dd, yyyy")}`}
                      </p>
                      {job.completion_percentage !== null && job.completion_percentage > 0 && (
                        <p>Completion: {job.completion_percentage}%</p>
                      )}
                    </div>
                  </CardDescription>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold text-success">
                    KES {calculateValue(job).toLocaleString()}
                  </div>
                  {job.billable_hours && (
                    <p className="text-xs text-muted-foreground">
                      {job.billable_hours}h × KES {job.hourly_rate?.toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {job.description && (
                <p className="text-sm text-muted-foreground">{job.description}</p>
              )}
              
              {job.status === "completed" && financials && (
                <div className="border-t pt-3">
                  <h4 className="text-sm font-semibold mb-2">Financial Performance</h4>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Estimated Hours</p>
                      <p className="font-medium">{job.billable_hours || 0}h</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Actual Hours</p>
                      <p className="font-medium">{financials.billable_actual_hours?.toFixed(1) || 0}h</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Efficiency</p>
                      <p className="font-medium">{financials.efficiency_ratio?.toFixed(0) || 0}%</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Amount Collected</p>
                      <p className="font-medium text-success">KES {(job.amount_collected || 0).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Net Revenue</p>
                      <p className="font-medium text-success">KES {(financials.net_revenue || 0).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Collection Rate</p>
                      <p className="font-medium">{financials.collection_rate?.toFixed(0) || 0}%</p>
                    </div>
                  </div>
                  {job.collection_period && (
                    <div className="mt-2">
                      <p className="text-xs text-muted-foreground">
                        Collection Period: {job.collection_period}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
