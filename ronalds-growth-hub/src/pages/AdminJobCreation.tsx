import React, { useState, useEffect } from 'react';
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from '@/hooks/use-toast';
import { apiFetch } from '@/integrations/apiClient';
import { Checkbox } from "@/components/ui/checkbox";
import {
  Building2,
  Users,
  DollarSign,
  Calendar,
  FileText,
  Send,
  User,
  Briefcase,
  Clock,
  AlertTriangle,
  CheckCircle,
  Plus,
  Search,
  Filter,
  Download,
  Eye,
  Edit,
  Trash2,
  UserPlus,
  Target,
  TrendingUp,
  Shield,
  BookOpen,
  Calculator,
  Scale,
} from 'lucide-react';

// Interfaces for job creation and workflow
interface JobFormData {
  title: string;
  description: string;
  jobType: string;
  category: string;
  clientId: number;
  partnerId: number;
  managerId: number;
  selectedTeamMembers: number[];
  priority: string;
  complexity: string;
  estimatedHours: number;
  budget: number;
  dueDate: string;
  requiresApproval: boolean;
  milestones: Milestone[];
  staffRequirements: StaffRequirement[];
  specialInstructions: string;
}

interface Milestone {
  id?: number;
  name: string;
  description: string;
  dueDate: string;
  requiredHours: number;
  assigneeId: number;
  dependencies: number[];
}

interface StaffRequirement {
  roleId: number;
  count: number;
  requiredSkills: string[];
  minExperience: number;
  billableRate: number;
}

interface Client {
  id: number;
  client_name: string;
  client_type: string;
  industry: string;
}

interface Employee {
  id: number;
  first_name: string;
  last_name: string;
  role: string;
  department: string;
  hourly_rate: number;
  experience_years: number;
}

// Tax and Audit specific job types and categories
const JOB_TYPES = {
  AUDIT: {
    label: 'Audit & Assurance',
    categories: [
      'Statutory Audit',
      'Internal Audit', 
      'Management Audit',
      'IT Systems Audit',
      'Compliance Audit',
      'Forensic Audit',
      'Due Diligence',
      'Risk Assessment'
    ],
    icon: Shield
  },
  TAX: {
    label: 'Tax Services',
    categories: [
      'Corporate Tax Return',
      'Individual Tax Return',
      'VAT Compliance',
      'Transfer Pricing',
      'Tax Planning',
      'Tax Appeals',
      'Withholding Tax',
      'PAYE Management'
    ],
    icon: Calculator
  },
  ADVISORY: {
    label: 'Advisory Services',
    categories: [
      'Business Valuation',
      'Financial Advisory',
      'Restructuring',
      'Corporate Finance',
      'Investment Advisory',
      'Feasibility Studies',
      'Business Planning',
      'ESG Consulting'
    ],
    icon: TrendingUp
  },
  LEGAL: {
    label: 'Legal & Compliance',
    categories: [
      'Company Secretarial',
      'Regulatory Compliance',
      'Contract Review',
      'Legal Documentation',
      'Board Resolutions',
      'Annual Returns',
      'Licensing',
      'Intellectual Property'
    ],
    icon: Scale
  },
  BOOKKEEPING: {
    label: 'Bookkeeping & Accounting',
    categories: [
      'Monthly Bookkeeping',
      'Financial Statements',
      'Management Accounts',
      'Payroll Processing',
      'Bank Reconciliation',
      'Fixed Assets Register',
      'Cash Flow Management',
      'Budget Preparation'
    ],
    icon: BookOpen
  }
};

const PRIORITY_LEVELS = {
  URGENT: { label: 'Urgent', color: 'bg-red-500', textColor: 'text-red-700' },
  HIGH: { label: 'High', color: 'bg-orange-500', textColor: 'text-orange-700' },
  MEDIUM: { label: 'Medium', color: 'bg-yellow-500', textColor: 'text-yellow-700' },
  LOW: { label: 'Low', color: 'bg-green-500', textColor: 'text-green-700' }
};

const COMPLEXITY_LEVELS = {
  SIMPLE: { label: 'Simple', hours: 8, rate_multiplier: 1.0 },
  MODERATE: { label: 'Moderate', hours: 24, rate_multiplier: 1.2 },
  COMPLEX: { label: 'Complex', hours: 80, rate_multiplier: 1.5 },
  HIGHLY_COMPLEX: { label: 'Highly Complex', hours: 160, rate_multiplier: 1.8 }
};

export default function AdminJobCreation() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [partners, setPartners] = useState<Employee[]>([]);
  const [managers, setManagers] = useState<Employee[]>([]);
  const [selectedTab, setSelectedTab] = useState('create');

  const [formData, setFormData] = useState<JobFormData>({
    title: '',
    description: '',
    jobType: '',
    category: '',
    clientId: 0,
    partnerId: 0,
    managerId: 0,
    selectedTeamMembers: [],
    priority: 'MEDIUM',
    complexity: 'MODERATE',
    estimatedHours: 0,
    budget: 0,
    dueDate: '',
    requiresApproval: false,
    milestones: [],
    staffRequirements: [],
    specialInstructions: ''
  });

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      setIsLoading(true);
      const [clientsRes, employeesRes] = await Promise.all([
        apiFetch('GET', '/clients'),
        apiFetch('GET', '/employees')
      ]);

      setClients(clientsRes.clients || clientsRes || []);
      setEmployees(employeesRes.employees || employeesRes || []);
      
      // Filter partners and managers from the employee data
      const allEmployees = employeesRes.employees || employeesRes || [];
      setPartners(allEmployees.filter(emp => emp.is_partner || emp.position?.toLowerCase().includes('partner')));
      setManagers(allEmployees.filter(emp => 
        emp.position?.toLowerCase().includes('manager') && !emp.position?.toLowerCase().includes('partner')
      ));

    } catch (error) {
      console.error('Error loading initial data:', error);
      toast({
        title: "Error",
        description: "Failed to load form data. Please refresh the page.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: keyof JobFormData, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));

    // Auto-calculate estimated hours based on complexity
    if (field === 'complexity') {
      const complexityData = COMPLEXITY_LEVELS[value as keyof typeof COMPLEXITY_LEVELS];
      if (complexityData) {
        setFormData(prev => ({
          ...prev,
          estimatedHours: complexityData.hours
        }));
      }
    }
  };

  const addMilestone = () => {
    const newMilestone: Milestone = {
      name: '',
      description: '',
      dueDate: '',
      requiredHours: 0,
      assigneeId: 0,
      dependencies: []
    };

    setFormData(prev => ({
      ...prev,
      milestones: [...prev.milestones, newMilestone]
    }));
  };

  const updateMilestone = (index: number, milestone: Milestone) => {
    setFormData(prev => ({
      ...prev,
      milestones: prev.milestones.map((m, i) => i === index ? milestone : m)
    }));
  };

  const removeMilestone = (index: number) => {
    setFormData(prev => ({
      ...prev,
      milestones: prev.milestones.filter((_, i) => i !== index)
    }));
  };

  const addStaffRequirement = () => {
    const newRequirement: StaffRequirement = {
      roleId: 0,
      count: 1,
      requiredSkills: [],
      minExperience: 0,
      billableRate: 0
    };

    setFormData(prev => ({
      ...prev,
      staffRequirements: [...prev.staffRequirements, newRequirement]
    }));
  };

  const updateStaffRequirement = (index: number, requirement: StaffRequirement) => {
    setFormData(prev => ({
      ...prev,
      staffRequirements: prev.staffRequirements.map((r, i) => i === index ? requirement : r)
    }));
  };

  const removeStaffRequirement = (index: number) => {
    setFormData(prev => ({
      ...prev,
      staffRequirements: prev.staffRequirements.filter((_, i) => i !== index)
    }));
  };

  const generateJobCode = () => {
    if (!formData.jobType || !formData.clientId) return '';
    
    const client = clients.find(c => c.id === formData.clientId);
    const typePrefix = formData.jobType.substring(0, 3).toUpperCase();
    const clientPrefix = client?.client_name.substring(0, 3).toUpperCase() || 'CLI';
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    
    return `${typePrefix}-${clientPrefix}-${year}${month}-${random}`;
  };

  const validateForm = (): boolean => {
    if (!formData.title.trim()) {
      toast({ title: "Validation Error", description: "Job title is required", variant: "destructive" });
      return false;
    }
    if (!formData.clientId) {
      toast({ title: "Validation Error", description: "Client selection is required", variant: "destructive" });
      return false;
    }
    if (!formData.partnerId) {
      toast({ title: "Validation Error", description: "Partner assignment is required", variant: "destructive" });
      return false;
    }
    if (!formData.managerId) {
      toast({ title: "Validation Error", description: "Manager assignment is required", variant: "destructive" });
      return false;
    }
    if (!formData.dueDate) {
      toast({ title: "Validation Error", description: "Due date is required", variant: "destructive" });
      return false;
    }
    return true;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    
    if (!validateForm()) return;

    try {
      setIsSubmitting(true);
      
      const jobData = {
        title: formData.title,
        description: formData.description,
        jobType: formData.jobType,
        category: formData.category,
        clientId: formData.clientId,
        partnerId: formData.partnerId,
        managerId: formData.managerId,
        selectedTeamMembers: formData.selectedTeamMembers,
        priority: formData.priority,
        complexity: formData.complexity,
        estimatedHours: formData.estimatedHours,
        budget: formData.budget,
        dueDate: formData.dueDate,
        requiresApproval: formData.requiresApproval,
        milestones: formData.milestones,
        staffRequirements: formData.staffRequirements,
        specialInstructions: formData.specialInstructions
      };

      const response = await apiFetch('POST', '/job-workflow/create', jobData);

      if (response.success) {
        toast({
          title: "Success",
          description: `Job created successfully with ID: ${response.jobId}`,
          variant: "default"
        });

        // Reset form
        setFormData({
          title: '',
          description: '',
          jobType: '',
          category: '',
          clientId: 0,
          partnerId: 0,
          managerId: 0,
          selectedTeamMembers: [],
          priority: 'MEDIUM',
          complexity: 'MODERATE',
          estimatedHours: 0,
          budget: 0,
          dueDate: '',
          requiresApproval: false,
          milestones: [],
          staffRequirements: [],
          specialInstructions: ''
        });
        
        setSelectedTab('recent');
      }
    } catch (error) {
      console.error('Job creation failed:', error);
      toast({
        title: "Error",
        description: "Failed to create job. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const calculateEstimatedBudget = () => {
    const complexityMultiplier = COMPLEXITY_LEVELS[formData.complexity as keyof typeof COMPLEXITY_LEVELS]?.rate_multiplier || 1.0;
    const baseRate = 5000; // Base hourly rate in KES
    return formData.estimatedHours * baseRate * complexityMultiplier;
  };

  // Auto-update budget when hours or complexity changes
  useEffect(() => {
    if (formData.estimatedHours > 0) {
      const budget = calculateEstimatedBudget();
      setFormData(prev => ({ ...prev, budget }));
    }
  }, [formData.estimatedHours, formData.complexity]);

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Job Creation & Workflow Management</h1>
            <p className="text-gray-600">Create comprehensive audit and tax jobs with automated workflow assignments</p>
          </div>
          <Button
            onClick={() => setSelectedTab('dashboard')}
            variant="outline"
            className="flex items-center space-x-2"
          >
            <Target className="h-4 w-4" />
            <span>View Dashboard</span>
          </Button>
        </div>

        <Tabs value={selectedTab} onValueChange={setSelectedTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="create" className="flex items-center space-x-2">
              <Plus className="h-4 w-4" />
              <span>Create Job</span>
            </TabsTrigger>
            <TabsTrigger value="recent" className="flex items-center space-x-2">
              <FileText className="h-4 w-4" />
              <span>Recent Jobs</span>
            </TabsTrigger>
            <TabsTrigger value="dashboard" className="flex items-center space-x-2">
              <TrendingUp className="h-4 w-4" />
              <span>Dashboard</span>
            </TabsTrigger>
          </TabsList>

          {/* CREATE JOB TAB */}
          <TabsContent value="create">
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Form */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Basic Information */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center">
                        <FileText className="h-5 w-5 mr-2" />
                        Basic Job Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="title">Job Title *</Label>
                          <Input
                            id="title"
                            value={formData.title}
                            onChange={(e) => handleInputChange('title', e.target.value)}
                            placeholder="e.g. Statutory Audit - ABC Limited"
                            required
                          />
                        </div>
                        <div>
                          <Label htmlFor="client">Client *</Label>
                          <Select 
                            value={formData.clientId?.toString()} 
                            onValueChange={(value) => handleInputChange('clientId', parseInt(value))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select client" />
                            </SelectTrigger>
                            <SelectContent>
                              {clients.map(client => (
                                <SelectItem key={client.id} value={client.id.toString()}>
                                  {client.client_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="jobType">Job Type *</Label>
                          <Select 
                            value={formData.jobType} 
                            onValueChange={(value) => handleInputChange('jobType', value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select job type" />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(JOB_TYPES).map(([key, type]) => {
                                const IconComponent = type.icon;
                                return (
                                  <SelectItem key={key} value={key}>
                                    <div className="flex items-center">
                                      <IconComponent className="h-4 w-4 mr-2" />
                                      {type.label}
                                    </div>
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor="category">Category *</Label>
                          <Select 
                            value={formData.category} 
                            onValueChange={(value) => handleInputChange('category', value)}
                            disabled={!formData.jobType}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                            <SelectContent>
                              {formData.jobType && JOB_TYPES[formData.jobType as keyof typeof JOB_TYPES]?.categories.map(category => (
                                <SelectItem key={category} value={category}>
                                  {category}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div>
                        <Label htmlFor="description">Job Description</Label>
                        <Textarea
                          id="description"
                          value={formData.description}
                          onChange={(e) => handleInputChange('description', e.target.value)}
                          placeholder="Provide detailed job description, scope, and requirements"
                          rows={3}
                        />
                      </div>
                    </CardContent>
                  </Card>

                  {/* Assignment & Workflow */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center">
                        <Users className="h-5 w-5 mr-2" />
                        Team Assignment
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="partner">Responsible Partner *</Label>
                          <Select 
                            value={formData.partnerId?.toString()} 
                            onValueChange={(value) => handleInputChange('partnerId', parseInt(value))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select partner" />
                            </SelectTrigger>
                            <SelectContent>
                              {partners.map(partner => (
                                <SelectItem key={partner.id} value={partner.id.toString()}>
                                  {partner.first_name} {partner.last_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor="manager">Engagement Manager *</Label>
                          <Select 
                            value={formData.managerId?.toString()} 
                            onValueChange={(value) => handleInputChange('managerId', parseInt(value))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select manager" />
                            </SelectTrigger>
                            <SelectContent>
                              {managers.map(manager => (
                                <SelectItem key={manager.id} value={manager.id.toString()}>
                                  {manager.first_name} {manager.last_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Assign Members */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center">
                        <UserPlus className="h-5 w-5 mr-2" />
                        Assign Members
                      </CardTitle>
                      <CardDescription>
                        Select additional team members to assign to this job
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {employees
                          .filter(emp => 
                            emp.id !== formData.partnerId && 
                            emp.id !== formData.managerId && 
                            !emp.is_partner &&
                            !emp.position?.toLowerCase().includes('partner') &&
                            !emp.position?.toLowerCase().includes('manager')
                          )
                          .map(employee => (
                            <div key={employee.id} className="flex items-center space-x-2">
                              <Checkbox
                                id={`employee-${employee.id}`}
                                checked={formData.selectedTeamMembers.includes(employee.id)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    handleInputChange('selectedTeamMembers', [...formData.selectedTeamMembers, employee.id]);
                                  } else {
                                    handleInputChange('selectedTeamMembers', formData.selectedTeamMembers.filter(id => id !== employee.id));
                                  }
                                }}
                              />
                              <Label htmlFor={`employee-${employee.id}`} className="flex items-center space-x-2 cursor-pointer">
                                <div className="flex-1">
                                  <span className="font-medium">{employee.first_name} {employee.last_name}</span>
                                  <div className="text-sm text-gray-500">
                                    {employee.position} • {employee.department}
                                  </div>
                                </div>
                              </Label>
                            </div>
                          ))
                        }
                        {employees.filter(emp => 
                          emp.id !== formData.partnerId && 
                          emp.id !== formData.managerId && 
                          !emp.is_partner &&
                          !emp.position?.toLowerCase().includes('partner') &&
                          !emp.position?.toLowerCase().includes('manager')
                        ).length === 0 && (
                          <div className="text-gray-500 text-sm py-4">
                            No available team members to assign
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Timeline & Financial Planning */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center">
                        <DollarSign className="h-5 w-5 mr-2" />
                        Timeline & Financial Planning
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <Label htmlFor="priority">Priority Level</Label>
                          <Select 
                            value={formData.priority} 
                            onValueChange={(value) => handleInputChange('priority', value)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(PRIORITY_LEVELS).map(([key, priority]) => (
                                <SelectItem key={key} value={key}>
                                  <div className="flex items-center">
                                    <div className={`w-3 h-3 rounded-full ${priority.color} mr-2`} />
                                    {priority.label}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor="complexity">Complexity Level</Label>
                          <Select 
                            value={formData.complexity} 
                            onValueChange={(value) => handleInputChange('complexity', value)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(COMPLEXITY_LEVELS).map(([key, complexity]) => (
                                <SelectItem key={key} value={key}>
                                  {complexity.label} ({complexity.hours}h)
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor="dueDate">Due Date *</Label>
                          <Input
                            id="dueDate"
                            type="date"
                            value={formData.dueDate}
                            onChange={(e) => handleInputChange('dueDate', e.target.value)}
                            required
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="estimatedHours">Estimated Hours</Label>
                          <Input
                            id="estimatedHours"
                            type="number"
                            value={formData.estimatedHours}
                            onChange={(e) => handleInputChange('estimatedHours', parseFloat(e.target.value))}
                            min="0"
                            step="0.5"
                          />
                        </div>
                        <div>
                          <Label htmlFor="budget">Estimated Budget (KES)</Label>
                          <Input
                            id="budget"
                            type="number"
                            value={formData.budget}
                            onChange={(e) => handleInputChange('budget', parseFloat(e.target.value))}
                            min="0"
                            step="1000"
                          />
                        </div>
                      </div>

                      <div>
                        <Label htmlFor="specialInstructions">Special Instructions</Label>
                        <Textarea
                          id="specialInstructions"
                          value={formData.specialInstructions}
                          onChange={(e) => handleInputChange('specialInstructions', e.target.value)}
                          placeholder="Any special requirements, regulatory considerations, or client preferences"
                          rows={2}
                        />
                      </div>
                    </CardContent>
                  </Card>

                  {/* Milestones Management */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <div className="flex items-center">
                          <Target className="h-5 w-5 mr-2" />
                          Job Milestones
                        </div>
                        <Button type="button" size="sm" onClick={addMilestone}>
                          <Plus className="h-4 w-4 mr-2" />
                          Add Milestone
                        </Button>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {formData.milestones.length === 0 ? (
                        <div className="text-center py-6 text-gray-500">
                          <Target className="h-12 w-12 mx-auto mb-2 opacity-50" />
                          <p>No milestones defined</p>
                          <p className="text-sm">Add milestones to track job progress</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {formData.milestones.map((milestone, index) => (
                            <div key={index} className="border rounded-lg p-4">
                              <div className="flex items-center justify-between mb-3">
                                <h4 className="font-medium">Milestone {index + 1}</h4>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => removeMilestone(index)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <Label>Milestone Name</Label>
                                  <Input
                                    value={milestone.name}
                                    onChange={(e) => updateMilestone(index, { ...milestone, name: e.target.value })}
                                    placeholder="e.g. Planning & Risk Assessment"
                                  />
                                </div>
                                <div>
                                  <Label>Due Date</Label>
                                  <Input
                                    type="date"
                                    value={milestone.dueDate}
                                    onChange={(e) => updateMilestone(index, { ...milestone, dueDate: e.target.value })}
                                  />
                                </div>
                              </div>
                              <div className="mt-3">
                                <Label>Description</Label>
                                <Textarea
                                  value={milestone.description}
                                  onChange={(e) => updateMilestone(index, { ...milestone, description: e.target.value })}
                                  placeholder="Describe milestone deliverables and requirements"
                                  rows={2}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Sidebar - Job Summary & Actions */}
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center">
                        <Calculator className="h-5 w-5 mr-2" />
                        Job Summary
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Job Code:</span>
                          <span className="font-mono">{generateJobCode() || 'Auto-generated'}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Priority:</span>
                          <Badge className={PRIORITY_LEVELS[formData.priority as keyof typeof PRIORITY_LEVELS]?.textColor}>
                            {PRIORITY_LEVELS[formData.priority as keyof typeof PRIORITY_LEVELS]?.label}
                          </Badge>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Complexity:</span>
                          <span>{COMPLEXITY_LEVELS[formData.complexity as keyof typeof COMPLEXITY_LEVELS]?.label}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Estimated Hours:</span>
                          <span>{formData.estimatedHours}h</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Estimated Budget:</span>
                          <span className="font-semibold">
                            KES {formData.budget.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Milestones:</span>
                          <span>{formData.milestones.length}</span>
                        </div>
                      </div>

                      <Separator />

                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="requiresApproval"
                          checked={formData.requiresApproval}
                          onCheckedChange={(checked) => handleInputChange('requiresApproval', checked)}
                        />
                        <Label htmlFor="requiresApproval" className="text-sm">
                          Requires approval before start
                        </Label>
                      </div>

                      {formData.title && formData.clientId && (
                        <Alert>
                          <CheckCircle className="h-4 w-4" />
                          <AlertDescription>
                            Job is ready for submission. All required fields are complete.
                          </AlertDescription>
                        </Alert>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Actions</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Button 
                        type="submit" 
                        className="w-full"
                        disabled={isSubmitting || !formData.title || !formData.clientId}
                      >
                        {isSubmitting ? (
                          <>
                            <Clock className="h-4 w-4 mr-2 animate-spin" />
                            Creating Job...
                          </>
                        ) : (
                          <>
                            <Send className="h-4 w-4 mr-2" />
                            Create Job & Initiate Workflow
                          </>
                        )}
                      </Button>
                      
                      <Button type="button" variant="outline" className="w-full">
                        <FileText className="h-4 w-4 mr-2" />
                        Save as Draft
                      </Button>
                      
                      <Button type="button" variant="outline" className="w-full">
                        <Eye className="h-4 w-4 mr-2" />
                        Preview Workflow
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </form>
          </TabsContent>

          {/* RECENT JOBS TAB */}
          <TabsContent value="recent">
            <Card>
              <CardHeader>
                <CardTitle>Recent Jobs</CardTitle>
                <CardDescription>Recently created jobs and their current status</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-6 text-gray-500">
                  <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No recent jobs found</p>
                  <p className="text-sm">Jobs you create will appear here</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* DASHBOARD TAB */}
          <TabsContent value="dashboard">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Active Jobs</p>
                      <p className="text-3xl font-bold">0</p>
                    </div>
                    <Briefcase className="h-8 w-8 text-blue-600" />
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Pending Approval</p>
                      <p className="text-3xl font-bold">0</p>
                    </div>
                    <Clock className="h-8 w-8 text-orange-600" />
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Total Budget</p>
                      <p className="text-3xl font-bold">KES 0</p>
                    </div>
                    <DollarSign className="h-8 w-8 text-green-600" />
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Staff Utilization</p>
                      <p className="text-3xl font-bold">0%</p>
                    </div>
                    <Users className="h-8 w-8 text-purple-600" />
                  </div>
                </CardContent>
              </Card>
            </div>
            
            <Card>
              <CardHeader>
                <CardTitle>Job Creation Analytics</CardTitle>
                <CardDescription>Overview of job creation trends and workflow performance</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-6 text-gray-500">
                  <TrendingUp className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No analytics data available</p>
                  <p className="text-sm">Create jobs to see performance metrics</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}