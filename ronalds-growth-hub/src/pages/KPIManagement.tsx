import { useState, useEffect } from "react";
import { apiFetch, authAPI } from "@/integrations/apiClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Plus, Edit, Trash2, DollarSign, TrendingUp, ChevronDown, ChevronRight, Building2, Users, Globe, Briefcase, Target, BarChart3, Users2, Lightbulb } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";

interface KPI {
  id: string;
  name: string;
  description: string;
  category: 'financial' | 'non_financial';
  weight: number;
  is_active: boolean;
  parent_kpi_id?: string | null;
  type: 'general' | 'department' | 'role';
  department_id?: string | null;
  job_title?: string | null;
  employee_id?: string | null;
  measurement_unit?: string | null;
  target_value?: number | null;
  frequency: 'monthly' | 'quarterly' | 'annually';
  status: 'active' | 'inactive';
  bsc_category?: string | null;
  sub_kpis?: KPI[];
}

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  position: string | null;
  department_id: string | null;
}

interface Department {
  id: string;
  name: string;
}

const KPIManagement = () => {
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingKPI, setEditingKPI] = useState<KPI | null>(null);
  const [parentKpiId, setParentKpiId] = useState<string | null>(null);
  const [filter, setFilter] = useState({
    category: 'all',
    type: 'all',
    bscCategory: 'all',
    status: 'all'
  });
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    category: "financial" as 'financial' | 'non_financial',
    weight: 0,
    type: "general" as 'general' | 'department' | 'role',
    department_id: null as string | null,
    employee_id: null as string | null,
    job_title: "",
    measurement_unit: "%",
    target_value: null as number | null,
    frequency: "annually" as 'monthly' | 'quarterly' | 'annually',
    status: "active" as 'active' | 'inactive',
    bsc_category: "" as string,
    parent_kpi_id: null as string | null,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [kpisData, deptsData, employeesData] = await Promise.all([
        apiFetch('GET', "/kpis"),
        apiFetch('GET', "/departments"),
        apiFetch('GET', "/profiles?status=active")
      ]);

      // Organize KPIs into hierarchy
      const allKPIs = (kpisData || []) as any[];
      const parentKPIs = allKPIs.filter(k => !k.parent_kpi_id);
      const hierarchicalKPIs = parentKPIs.map(parent => ({
        ...parent,
        sub_kpis: allKPIs.filter(k => k.parent_kpi_id === parent.id)
      })) as KPI[];

      setKpis(hierarchicalKPIs);
      setDepartments(deptsData || []);
      setEmployees(employeesData || []);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const submitData = {
        ...formData,
        parent_kpi_id: parentKpiId || formData.parent_kpi_id,
        department_id: formData.type === 'department' ? formData.department_id : null,
        employee_id: formData.type === 'role' ? formData.employee_id : null,
        job_title: formData.type === 'role' ? formData.job_title : null,
      };

      if (editingKPI) {
        await apiFetch('PATCH', `/kpis/${editingKPI.id}`, submitData);
        toast({ title: "Success", description: "KPI updated successfully" });
      } else {
        await apiFetch('POST', `/kpis`, submitData);
        toast({ title: "Success", description: parentKpiId ? "Sub-KPI created successfully" : "KPI created successfully" });
      }

      setDialogOpen(false);
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

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this KPI? This will also delete all sub-KPIs.")) return;

    try {
      await apiFetch('DELETE', `/kpis/${id}`);
      toast({ title: "Success", description: "KPI deleted successfully" });
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
      name: "",
      description: "",
      category: "financial",
      weight: 0,
      type: "general",
      department_id: null,
      employee_id: null,
      job_title: "",
      measurement_unit: "%",
      target_value: null,
      frequency: "annually",
      status: "active",
      bsc_category: "",
      parent_kpi_id: null,
    });
    setEditingKPI(null);
    setParentKpiId(null);
  };

  const openEditDialog = (kpi: KPI) => {
    setEditingKPI(kpi);
    setFormData({
      name: kpi.name,
      description: kpi.description || "",
      category: kpi.category,
      weight: kpi.weight,
      type: kpi.type,
      department_id: kpi.department_id || null,
      employee_id: kpi.employee_id || null,
      job_title: kpi.job_title || "",
      measurement_unit: kpi.measurement_unit || "%",
      target_value: kpi.target_value || null,
      frequency: kpi.frequency,
      status: kpi.status,
      bsc_category: kpi.bsc_category || "",
      parent_kpi_id: kpi.parent_kpi_id || null,
    });
    setDialogOpen(true);
  };

  const openSubKPIDialog = (parentId: string) => {
    setParentKpiId(parentId);
    setDialogOpen(true);
  };

  // Filtering
  const filteredKPIs = kpis.filter(kpi => {
    if (filter.category !== 'all' && kpi.category !== filter.category) return false;
    if (filter.type !== 'all' && kpi.type !== filter.type) return false;
    if (filter.bscCategory !== 'all' && kpi.bsc_category !== filter.bscCategory) return false;
    if (filter.status !== 'all' && kpi.status !== filter.status) return false;
    return true;
  });

  const financialKPIs = filteredKPIs.filter(k => k.category === "financial");
  const nonFinancialKPIs = filteredKPIs.filter(k => k.category === "non_financial");

  const totalFinancialWeight = financialKPIs.reduce((sum, k) => sum + Number(k.weight), 0);
  const totalNonFinancialWeight = nonFinancialKPIs.reduce((sum, k) => sum + Number(k.weight), 0);

  const getTypeIcon = (type: string) => {
    switch(type) {
      case 'general': return <Globe className="h-4 w-4" />;
      case 'department': return <Building2 className="h-4 w-4" />;
      case 'role': return <Briefcase className="h-4 w-4" />;
      default: return null;
    }
  };

  const getBSCIcon = (category: string) => {
    switch(category) {
      case 'Financial': return <DollarSign className="h-4 w-4" />;
      case 'Customer': return <Users className="h-4 w-4" />;
      case 'Internal Processes': return <BarChart3 className="h-4 w-4" />;
      case 'Learning & Growth': return <Lightbulb className="h-4 w-4" />;
      default: return <Target className="h-4 w-4" />;
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    );
  }

  const KPICard = ({ kpi, isSubKPI = false }: { kpi: KPI; isSubKPI?: boolean }) => {
    const [isOpen, setIsOpen] = useState(true);
    const dept = departments.find(d => d.id === kpi.department_id);
    
    return (
      <div className={`border rounded-lg ${isSubKPI ? 'ml-8 mt-2' : ''}`}>
        <div className="p-4 bg-muted/30">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                {!isSubKPI && kpi.sub_kpis && kpi.sub_kpis.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setIsOpen(!isOpen)} className="h-6 w-6 p-0">
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </Button>
                )}
                <h3 className="font-semibold text-foreground">{kpi.name}</h3>
                <Badge variant="outline" className="flex items-center gap-1">
                  {getTypeIcon(kpi.type)}
                  <span className="capitalize">{kpi.type}</span>
                </Badge>
                {kpi.bsc_category && (
                  <Badge variant="secondary" className="flex items-center gap-1">
                    {getBSCIcon(kpi.bsc_category)}
                    <span>{kpi.bsc_category}</span>
                  </Badge>
                )}
                {kpi.status === 'inactive' && (
                  <Badge variant="destructive">Inactive</Badge>
                )}
              </div>
              
              <p className="text-sm text-muted-foreground mb-2">{kpi.description}</p>
              
              <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span className="font-medium">Weight: {kpi.weight}%</span>
                {kpi.target_value && (
                  <span>Target: {kpi.target_value} {kpi.measurement_unit}</span>
                )}
                <span className="capitalize">Frequency: {kpi.frequency}</span>
                {dept && <span>Department: {dept.name}</span>}
                  {kpi.employee_id && (() => {
                    const assignedEmployee = employees.find(e => e.id === kpi.employee_id);
                    return assignedEmployee ? (
                      <span className="flex items-center gap-1">
                        <Users2 className="h-3 w-3" />
                        Assigned to: {assignedEmployee.first_name} {assignedEmployee.last_name}
                      </span>
                    ) : null;
                  })()}
              </div>
            </div>
            
            <div className="flex gap-2">
              {!isSubKPI && (
                <Button variant="ghost" size="sm" onClick={() => openSubKPIDialog(kpi.id)}>
                  <Plus className="h-4 w-4" />
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => openEditDialog(kpi)}>
                <Edit className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => handleDelete(kpi.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
        </div>
        
        {!isSubKPI && isOpen && kpi.sub_kpis && kpi.sub_kpis.length > 0 && (
          <div className="p-4 space-y-2">
            <p className="text-sm font-medium text-muted-foreground mb-2">Sub-KPIs:</p>
            {kpi.sub_kpis.map(subKPI => (
              <KPICard key={subKPI.id} kpi={subKPI} isSubKPI />
            ))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">KPI Management</h1>
            <p className="text-muted-foreground">Create and manage hierarchical performance indicators</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                {parentKpiId ? "Add Sub-KPI" : "Add KPI"}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingKPI ? "Edit KPI" : parentKpiId ? "Create Sub-KPI" : "Create New KPI"}
                </DialogTitle>
                <DialogDescription>
                  {parentKpiId ? "Define a sub-KPI under the parent KPI" : "Define a key performance indicator for employee evaluation"}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="name">KPI Title *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>
                  
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      rows={2}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Category *</Label>
                    <Select
                      value={formData.category}
                      onValueChange={(value: any) => setFormData({ ...formData, category: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="financial">Financial</SelectItem>
                        <SelectItem value="non_financial">Non-Financial</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>BSC Category</Label>
                    <Select
                      value={formData.bsc_category}
                      onValueChange={(value) => setFormData({ ...formData, bsc_category: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select BSC category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Financial">Financial</SelectItem>
                        <SelectItem value="Customer">Customer</SelectItem>
                        <SelectItem value="Internal Processes">Internal Processes</SelectItem>
                        <SelectItem value="Learning & Growth">Learning & Growth</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Type *</Label>
                    <Select
                      value={formData.type}
                      onValueChange={(value: any) => setFormData({ ...formData, type: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="general">General (All Employees)</SelectItem>
                        <SelectItem value="department">Department-Specific</SelectItem>
                        <SelectItem value="role">Role-Specific</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {formData.type === 'department' && (
                    <div className="space-y-2">
                      <Label>Department *</Label>
                      <Select
                        value={formData.department_id || "none"}
                        onValueChange={(value) => setFormData({ ...formData, department_id: value === "none" ? null : value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select department" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {departments.map(dept => (
                            <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {formData.type === 'role' && (
                    <div className="space-y-2">
                      <Label>Assign to Employee *</Label>
                      <Select
                        value={formData.employee_id || "none"}
                        onValueChange={(value) => setFormData({ 
                          ...formData, 
                          employee_id: value === "none" ? null : value 
                        })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select an employee" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {employees.map(emp => (
                            <SelectItem key={emp.id} value={emp.id}>
                              {emp.first_name} {emp.last_name} 
                              {emp.position && ` - ${emp.position}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="weight">Weight (%) *</Label>
                    <Input
                      id="weight"
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={formData.weight}
                      onChange={(e) => setFormData({ ...formData, weight: parseFloat(e.target.value) || 0 })}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Measurement Unit</Label>
                    <Select
                      value={formData.measurement_unit || "%"}
                      onValueChange={(value) => setFormData({ ...formData, measurement_unit: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="%">Percentage (%)</SelectItem>
                        <SelectItem value="amount">Amount</SelectItem>
                        <SelectItem value="score">Score</SelectItem>
                        <SelectItem value="hours">Hours</SelectItem>
                        <SelectItem value="count">Count</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="target">Target Value</Label>
                    <Input
                      id="target"
                      type="number"
                      step="0.01"
                      value={formData.target_value || ""}
                      onChange={(e) => setFormData({ ...formData, target_value: e.target.value ? parseFloat(e.target.value) : null })}
                      placeholder="Optional target"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Frequency *</Label>
                    <Select
                      value={formData.frequency}
                      onValueChange={(value: any) => setFormData({ ...formData, frequency: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="quarterly">Quarterly</SelectItem>
                        <SelectItem value="annually">Annually</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Status *</Label>
                    <Select
                      value={formData.status}
                      onValueChange={(value: any) => setFormData({ ...formData, status: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit">
                    {editingKPI ? "Update" : "Create"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={filter.category} onValueChange={(value) => setFilter({ ...filter, category: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="financial">Financial</SelectItem>
                    <SelectItem value="non_financial">Non-Financial</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={filter.type} onValueChange={(value) => setFilter({ ...filter, type: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="department">Department</SelectItem>
                    <SelectItem value="role">Role-Specific</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>BSC Category</Label>
                <Select value={filter.bscCategory} onValueChange={(value) => setFilter({ ...filter, bscCategory: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All BSC</SelectItem>
                    <SelectItem value="Financial">Financial</SelectItem>
                    <SelectItem value="Customer">Customer</SelectItem>
                    <SelectItem value="Internal Processes">Internal Processes</SelectItem>
                    <SelectItem value="Learning & Growth">Learning & Growth</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={filter.status} onValueChange={(value) => setFilter({ ...filter, status: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Weight Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-success" />
                Financial KPIs
              </CardTitle>
              <CardDescription>Total Weight: {totalFinancialWeight.toFixed(1)}%</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="w-full bg-muted rounded-full h-4">
                <div
                  className="bg-gradient-to-r from-success to-info h-4 rounded-full transition-all"
                  style={{ width: `${Math.min(totalFinancialWeight, 100)}%` }}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-secondary" />
                Non-Financial KPIs
              </CardTitle>
              <CardDescription>Total Weight: {totalNonFinancialWeight.toFixed(1)}%</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="w-full bg-muted rounded-full h-4">
                <div
                  className="bg-gradient-to-r from-secondary to-accent h-4 rounded-full transition-all"
                  style={{ width: `${Math.min(totalNonFinancialWeight, 100)}%` }}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* KPI Lists */}
        <Tabs defaultValue="financial" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="financial">Financial KPIs ({financialKPIs.length})</TabsTrigger>
            <TabsTrigger value="non-financial">Non-Financial KPIs ({nonFinancialKPIs.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="financial" className="space-y-4 mt-6">
            {financialKPIs.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  No financial KPIs found. Create one to get started.
                </CardContent>
              </Card>
            ) : (
              financialKPIs.map((kpi) => <KPICard key={kpi.id} kpi={kpi} />)
            )}
          </TabsContent>

          <TabsContent value="non-financial" className="space-y-4 mt-6">
            {nonFinancialKPIs.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  No non-financial KPIs found. Create one to get started.
                </CardContent>
              </Card>
            ) : (
              nonFinancialKPIs.map((kpi) => <KPICard key={kpi.id} kpi={kpi} />)
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default KPIManagement;