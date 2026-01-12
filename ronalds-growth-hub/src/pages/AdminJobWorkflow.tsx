import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
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
  FileCheck,
  Settings,
  BarChart3,
  Zap,
  PlayCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { format, addDays } from 'date-fns';

// Professional services configuration
const SERVICE_CONFIGURATIONS = {
  audit: {
    name: 'Audit & Assurance',
    icon: Shield,
    color: 'blue',
    subtypes: [
      'Statutory Audit',
      'Internal Audit',
      'Management Audit',
      'IT Systems Audit',
      'Compliance Audit',
      'Forensic Audit',
      'Due Diligence',
      'Risk Assessment'
    ],
    standardRates: {
      partner: 15000,
      manager: 8000,
      senior: 5000,
      junior: 3000
    },
    estimatedDuration: '8-12 weeks',
    deliverables: [
      'Management Letter',
      'Audited Financial Statements',
      'Audit Completion Report',
      'Internal Control Letter'
    ]
  },
  tax: {
    name: 'Tax Services',
    icon: Calculator,
    color: 'green',
    subtypes: [
      'Corporate Tax Return',
      'Individual Tax Return',
      'VAT Compliance',
      'Transfer Pricing',
      'Tax Planning',
      'Tax Appeals',
      'Withholding Tax',
      'PAYE Management'
    ],
    standardRates: {
      partner: 12000,
      manager: 6000,
      senior: 4000,
      junior: 2500
    },
    estimatedDuration: '2-4 weeks',
    deliverables: [
      'Tax Computation',
      'Tax Returns Filed',
      'Tax Clearance Certificate',
      'Advisory Report'
    ]
  },
  advisory: {
    name: 'Advisory Services',
    icon: TrendingUp,
    color: 'purple',
    subtypes: [
      'Business Valuation',
      'Financial Advisory',
      'Restructuring',
      'Corporate Finance',
      'Investment Advisory',
      'Feasibility Studies',
      'Market Research',
      'Strategic Planning'
    ],
    standardRates: {
      partner: 18000,
      manager: 10000,
      senior: 6000,
      junior: 3500
    },
    estimatedDuration: '4-8 weeks',
    deliverables: [
      'Analysis Report',
      'Recommendations Document',
      'Implementation Roadmap',
      'Executive Summary'
    ]
  },
  consulting: {
    name: 'Management Consulting',
    icon: Briefcase,
    color: 'orange',
    subtypes: [
      'Process Improvement',
      'Change Management',
      'Organizational Design',
      'Performance Management',
      'Digital Transformation',
      'Risk Management',
      'Compliance Review',
      'Training & Development'
    ],
    standardRates: {
      partner: 20000,
      manager: 12000,
      senior: 7000,
      junior: 4000
    },
    estimatedDuration: '6-10 weeks',
    deliverables: [
      'Current State Assessment',
      'Future State Design',
      'Implementation Plan',
      'Change Management Strategy'
    ]
  }
};

const PRIORITY_LEVELS = [
  { value: 'critical', label: 'Critical', color: 'red' },
  { value: 'high', label: 'High', color: 'orange' },
  { value: 'normal', label: 'Normal', color: 'blue' },
  { value: 'low', label: 'Low', color: 'gray' }
];

const COMPLEXITY_LEVELS = [
  { value: 'low', label: 'Low', description: 'Routine work, standard procedures' },
  { value: 'medium', label: 'Medium', description: 'Some complexity, requires experience' },
  { value: 'high', label: 'High', description: 'Complex issues, specialist knowledge required' },
  { value: 'critical', label: 'Critical', description: 'Highly complex, expert-level engagement' }
];

const RISK_LEVELS = [
  { value: 'low', label: 'Low', color: 'green' },
  { value: 'medium', label: 'Medium', color: 'yellow' },
  { value: 'high', label: 'High', color: 'orange' },
  { value: 'critical', label: 'Critical', color: 'red' }
];

const WORKFLOW_STAGES = [
  { value: 'draft', label: 'Draft', color: 'gray' },
  { value: 'partner_review', label: 'Partner Review', color: 'blue' },
  { value: 'manager_assignment', label: 'Manager Assignment', color: 'purple' },
  { value: 'team_assignment', label: 'Team Assignment', color: 'cyan' },
  { value: 'in_progress', label: 'In Progress', color: 'orange' },
  { value: 'partner_review_final', label: 'Final Review', color: 'indigo' },
  { value: 'client_delivery', label: 'Client Delivery', color: 'green' },
  { value: 'completed', label: 'Completed', color: 'emerald' }
];

interface JobFormData {
  title: string;
  description: string;
  serviceType: string;
  serviceSubtype: string;
  priority: string;
  clientId: string;
  departmentId: string;
  partnerId: string;
  managerId: string;
  startDate: string;
  dueDate: string;
  estimatedHours: number;
  budgetAmount: number;
  billingType: string;
  currencyCode: string;
  taxRate: number;
  discountPercentage: number;
  complexity: string;
  riskLevel: string;
  job_code: string;
  status: string;
}

interface StaffAssignment {
  employeeId: string;
  employeeName: string;
  role: string;
  budgetHours: number;
  billingRate: number;
}

const AdminJobWorkflowManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState('create');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [workflowTemplates, setWorkflowTemplates] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [activeJobs, setActiveJobs] = useState<any[]>([]);
  const [dashboardData, setDashboardData] = useState<any>({});
  
  // Form state
  const [formData, setFormData] = useState<JobFormData>({
    title: '',
    description: '',
    serviceType: '',
    serviceSubtype: '',
    priority: 'normal',
    clientId: '',
    departmentId: '',
    partnerId: '',
    managerId: '',
    startDate: format(new Date(), 'yyyy-MM-dd'),
    dueDate: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
    estimatedHours: 0,
    budgetAmount: 0,
    billingType: 'fixed',
    currencyCode: 'KES',
    taxRate: 16,
    discountPercentage: 0,
    complexity: 'medium',
    riskLevel: 'medium',
    job_code: '',
    status: 'active'
  });

  const [staffAssignments, setStaffAssignments] = useState<StaffAssignment[]>([]);
  const [selectedDeliverables, setSelectedDeliverables] = useState<string[]>([]);
  const [regulatoryRequirements, setRegulatoryRequirements] = useState<string[]>([]);

  // Load initial data
  useEffect(() => {
    Promise.all([
      fetchWorkflowTemplates(),
      fetchClients(),
      fetchDepartments(),
      fetchEmployees(),
      fetchActiveJobs(),
      fetchDashboardData()
    ]);
  }, []);

  // Generate job code when service type changes
  useEffect(() => {
    if (formData.serviceType && formData.clientId) {
      generateJobCode();
    }
  }, [formData.serviceType, formData.clientId]);

  // Auto-update estimated hours and budget when assignments change
  useEffect(() => {
    const totalHours = staffAssignments.reduce((sum, assignment) => sum + assignment.budgetHours, 0);
    const totalBudget = staffAssignments.reduce((sum, assignment) => 
      sum + (assignment.budgetHours * assignment.billingRate), 0);
    
    setFormData(prev => ({
      ...prev,
      estimatedHours: totalHours,
      budgetAmount: totalBudget
    }));
  }, [staffAssignments]);

  const fetchWorkflowTemplates = async () => {
    try {
      const response = await fetch('/api/admin/jobs/workflow-templates', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await response.json();
      if (data.success) {
        setWorkflowTemplates(data.templates);
      }
    } catch (error) {
      console.error('Error fetching workflow templates:', error);
    }
  };

  const fetchClients = async () => {
    try {
      const response = await fetch('/api/clients', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await response.json();
      if (data.success) {
        setClients(data.clients || []);
      }
    } catch (error) {
      console.error('Error fetching clients:', error);
    }
  };

  const fetchDepartments = async () => {
    try {
      const response = await fetch('/api/departments', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await response.json();
      if (data.success) {
        setDepartments(data.departments || []);
      }
    } catch (error) {
      console.error('Error fetching departments:', error);
    }
  };

  const fetchEmployees = async () => {
    try {
      const response = await fetch('/api/employees', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await response.json();
      if (data.success) {
        setEmployees(data.employees || []);
      }
    } catch (error) {
      console.error('Error fetching employees:', error);
    }
  };

  const fetchActiveJobs = async () => {
    try {
      const response = await fetch('/api/admin/jobs/active?limit=50', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await response.json();
      if (data.success) {
        setActiveJobs(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching active jobs:', error);
    }
  };

  const fetchDashboardData = async () => {
    try {
      const response = await fetch('/api/admin/jobs/dashboard', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await response.json();
      if (data.success) {
        setDashboardData(data.data);
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    }
  };

  const generateJobCode = () => {
    const client = clients.find(c => c.id === parseInt(formData.clientId));
    const serviceConfig = SERVICE_CONFIGURATIONS[formData.serviceType as keyof typeof SERVICE_CONFIGURATIONS];
    
    if (client && serviceConfig) {
      const clientCode = client.client_name.substring(0, 3).toUpperCase();
      const serviceCode = formData.serviceType.toUpperCase().substring(0, 3);
      const year = new Date().getFullYear();
      const month = String(new Date().getMonth() + 1).padStart(2, '0');
      const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      
      const jobCode = `${clientCode}-${serviceCode}-${year}${month}-${random}`;
      setFormData(prev => ({ ...prev, job_code: jobCode }));
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const addStaffAssignment = () => {
    const serviceConfig = SERVICE_CONFIGURATIONS[formData.serviceType as keyof typeof SERVICE_CONFIGURATIONS];
    const defaultRate = serviceConfig?.standardRates.senior || 5000;
    
    setStaffAssignments(prev => [...prev, {
      employeeId: '',
      employeeName: '',
      role: 'Senior',
      budgetHours: 40,
      billingRate: defaultRate
    }]);
  };

  const updateStaffAssignment = (index: number, field: string, value: any) => {
    setStaffAssignments(prev => prev.map((assignment, i) => 
      i === index ? { ...assignment, [field]: value } : assignment
    ));
  };

  const removeStaffAssignment = (index: number) => {
    setStaffAssignments(prev => prev.filter((_, i) => i !== index));
  };

  const handleServiceTypeChange = (serviceType: string) => {
    const config = SERVICE_CONFIGURATIONS[serviceType as keyof typeof SERVICE_CONFIGURATIONS];
    
    setFormData(prev => ({
      ...prev,
      serviceType,
      serviceSubtype: '' // Reset subtype when service type changes
    }));

    // Auto-select default deliverables and regulatory requirements
    if (config) {
      setSelectedDeliverables(config.deliverables);
      setRegulatoryRequirements([]); // Will be populated from workflow templates
    }
  };

  const submitJobWithWorkflow = async () => {
    setIsSubmitting(true);
    
    try {
      // Validate required fields
      if (!formData.title || !formData.serviceType || !formData.clientId || !formData.partnerId) {
        toast.error('Please fill in all required fields');
        setIsSubmitting(false);
        return;
      }

      if (staffAssignments.length === 0) {
        toast.error('Please assign at least one team member');
        setIsSubmitting(false);
        return;
      }

      // Prepare submission data
      const submissionData = {
        ...formData,
        deliverables: selectedDeliverables,
        regulatoryRequirements,
        staffAssignments,
        requiresPartnerReview: true,
        requiresManagerApproval: true,
        autoAssignWorkflow: true,
        notifyStakeholders: formData.status !== 'draft'
      };

      console.log('🚀 Submitting comprehensive job with workflow:', submissionData);

      const response = await fetch('/api/admin/jobs/create-with-workflow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(submissionData)
      });

      const result = await response.json();
      
      if (result.success) {
        toast.success(`Job "${formData.title}" created successfully with comprehensive workflow!`, {
          description: `${result.teamMembersAssigned} team members assigned. Workflow initiated at ${result.workflowStage}.`
        });

        // Reset form
        setFormData({
          title: '',
          description: '',
          serviceType: '',
          serviceSubtype: '',
          priority: 'normal',
          clientId: '',
          departmentId: '',
          partnerId: '',
          managerId: '',
          startDate: format(new Date(), 'yyyy-MM-dd'),
          dueDate: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
          estimatedHours: 0,
          budgetAmount: 0,
          billingType: 'fixed',
          currencyCode: 'KES',
          taxRate: 16,
          discountPercentage: 0,
          complexity: 'medium',
          riskLevel: 'medium',
          job_code: '',
          status: 'active'
        });
        setStaffAssignments([]);
        setSelectedDeliverables([]);
        setRegulatoryRequirements([]);

        // Refresh data
        await Promise.all([
          fetchActiveJobs(),
          fetchDashboardData()
        ]);

        // Switch to management tab to see the created job
        setActiveTab('management');

      } else {
        toast.error('Failed to create job', {
          description: result.message || 'Please try again'
        });
      }

    } catch (error) {
      console.error('❌ Error creating job:', error);
      toast.error('Error creating job', {
        description: 'Please check your connection and try again'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderJobCreationForm = () => (
    <div className="space-y-6">
      {/* Job Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5" />
            Job Information
          </CardTitle>
          <CardDescription>Define the core details of the professional engagement</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="title">Job Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => handleInputChange('title', e.target.value)}
                placeholder="Enter job title"
                className="w-full"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="job_code">Job Code</Label>
              <Input
                id="job_code"
                value={formData.job_code}
                onChange={(e) => handleInputChange('job_code', e.target.value)}
                placeholder="Auto-generated based on service type"
                className="w-full"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder="Detailed description of the engagement scope and objectives"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="serviceType">Service Type *</Label>
              <Select value={formData.serviceType} onValueChange={handleServiceTypeChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select service type" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SERVICE_CONFIGURATIONS).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-2">
                        <config.icon className="h-4 w-4" />
                        {config.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {formData.serviceType && (
              <div className="space-y-2">
                <Label htmlFor="serviceSubtype">Service Subtype</Label>
                <Select value={formData.serviceSubtype} onValueChange={(value) => handleInputChange('serviceSubtype', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select subtype" />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVICE_CONFIGURATIONS[formData.serviceType as keyof typeof SERVICE_CONFIGURATIONS]?.subtypes.map((subtype) => (
                      <SelectItem key={subtype} value={subtype}>
                        {subtype}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="priority">Priority Level</Label>
              <Select value={formData.priority} onValueChange={(value) => handleInputChange('priority', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_LEVELS.map((priority) => (
                    <SelectItem key={priority.value} value={priority.value}>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className={`bg-${priority.color}-100 text-${priority.color}-800`}>
                          {priority.label}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Client and Department Assignment */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Client & Department Assignment
          </CardTitle>
          <CardDescription>Assign the job to client and internal department</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="clientId">Client *</Label>
              <Select value={formData.clientId} onValueChange={(value) => handleInputChange('clientId', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id.toString()}>
                      <div className="flex flex-col">
                        <span className="font-medium">{client.client_name}</span>
                        <span className="text-sm text-gray-500">{client.contact_person}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="departmentId">Department</Label>
              <Select value={formData.departmentId} onValueChange={(value) => handleInputChange('departmentId', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id.toString()}>
                      {dept.department_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Leadership Assignment */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Leadership Assignment
          </CardTitle>
          <CardDescription>Assign partner in charge and manager for oversight</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="partnerId">Partner in Charge *</Label>
              <Select value={formData.partnerId} onValueChange={(value) => handleInputChange('partnerId', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select partner" />
                </SelectTrigger>
                <SelectContent>
                  {employees.filter(emp => emp.job_title?.toLowerCase().includes('partner')).map((partner) => (
                    <SelectItem key={partner.id} value={partner.id.toString()}>
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4" />
                        {partner.first_name} {partner.last_name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="managerId">Manager in Charge</Label>
              <Select value={formData.managerId} onValueChange={(value) => handleInputChange('managerId', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select manager" />
                </SelectTrigger>
                <SelectContent>
                  {employees.filter(emp => emp.job_title?.toLowerCase().includes('manager')).map((manager) => (
                    <SelectItem key={manager.id} value={manager.id.toString()}>
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        {manager.first_name} {manager.last_name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Timeline and Budget */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Timeline & Budget
          </CardTitle>
          <CardDescription>Define project timeline and financial parameters</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date</Label>
              <Input
                id="startDate"
                type="date"
                value={formData.startDate}
                onChange={(e) => handleInputChange('startDate', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dueDate">Due Date</Label>
              <Input
                id="dueDate"
                type="date"
                value={formData.dueDate}
                onChange={(e) => handleInputChange('dueDate', e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="budgetAmount">Budget Amount (KES)</Label>
              <Input
                id="budgetAmount"
                type="number"
                value={formData.budgetAmount}
                onChange={(e) => handleInputChange('budgetAmount', parseFloat(e.target.value) || 0)}
                placeholder="0"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="estimatedHours">Estimated Hours</Label>
              <Input
                id="estimatedHours"
                type="number"
                value={formData.estimatedHours}
                onChange={(e) => handleInputChange('estimatedHours', parseFloat(e.target.value) || 0)}
                placeholder="0"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="billingType">Billing Type</Label>
              <Select value={formData.billingType} onValueChange={(value) => handleInputChange('billingType', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select billing type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Fixed Fee</SelectItem>
                  <SelectItem value="hourly">Hourly Rate</SelectItem>
                  <SelectItem value="retainer">Retainer</SelectItem>
                  <SelectItem value="success">Success Fee</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="taxRate">Tax Rate (%)</Label>
              <Input
                id="taxRate"
                type="number"
                value={formData.taxRate}
                onChange={(e) => handleInputChange('taxRate', parseFloat(e.target.value) || 0)}
                placeholder="16"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="discountPercentage">Discount (%)</Label>
              <Input
                id="discountPercentage"
                type="number"
                value={formData.discountPercentage}
                onChange={(e) => handleInputChange('discountPercentage', parseFloat(e.target.value) || 0)}
                placeholder="0"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Risk and Complexity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Risk Assessment & Complexity
          </CardTitle>
          <CardDescription>Evaluate engagement complexity and risk factors</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="complexity">Complexity Level</Label>
              <Select value={formData.complexity} onValueChange={(value) => handleInputChange('complexity', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select complexity" />
                </SelectTrigger>
                <SelectContent>
                  {COMPLEXITY_LEVELS.map((level) => (
                    <SelectItem key={level.value} value={level.value}>
                      <div className="flex flex-col">
                        <span className="font-medium">{level.label}</span>
                        <span className="text-sm text-gray-500">{level.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="riskLevel">Risk Level</Label>
              <Select value={formData.riskLevel} onValueChange={(value) => handleInputChange('riskLevel', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select risk level" />
                </SelectTrigger>
                <SelectContent>
                  {RISK_LEVELS.map((risk) => (
                    <SelectItem key={risk.value} value={risk.value}>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className={`bg-${risk.color}-100 text-${risk.color}-800`}>
                          {risk.label}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Staff Assignments */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Team Assignment
          </CardTitle>
          <CardDescription>Assign team members with roles and budget allocation</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between items-center">
            <h4 className="text-sm font-medium">Team Members</h4>
            <Button onClick={addStaffAssignment} size="sm" variant="outline">
              <UserPlus className="h-4 w-4 mr-2" />
              Add Team Member
            </Button>
          </div>

          {staffAssignments.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Users className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No team members assigned yet. Click "Add Team Member" to begin.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {staffAssignments.map((assignment, index) => (
                <div key={index} className="border rounded-lg p-4 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                    <div className="space-y-2">
                      <Label>Employee</Label>
                      <Select 
                        value={assignment.employeeId} 
                        onValueChange={(value) => {
                          const employee = employees.find(emp => emp.id === parseInt(value));
                          updateStaffAssignment(index, 'employeeId', value);
                          updateStaffAssignment(index, 'employeeName', employee ? `${employee.first_name} ${employee.last_name}` : '');
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select employee" />
                        </SelectTrigger>
                        <SelectContent>
                          {employees.map((employee) => (
                            <SelectItem key={employee.id} value={employee.id.toString()}>
                              <div className="flex flex-col">
                                <span className="font-medium">{employee.first_name} {employee.last_name}</span>
                                <span className="text-sm text-gray-500">{employee.job_title}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Role on Job</Label>
                      <Select value={assignment.role} onValueChange={(value) => updateStaffAssignment(index, 'role', value)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Partner">Partner</SelectItem>
                          <SelectItem value="Manager">Manager</SelectItem>
                          <SelectItem value="Senior">Senior</SelectItem>
                          <SelectItem value="Junior">Junior</SelectItem>
                          <SelectItem value="Specialist">Specialist</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Budget Hours</Label>
                      <Input
                        type="number"
                        value={assignment.budgetHours}
                        onChange={(e) => updateStaffAssignment(index, 'budgetHours', parseFloat(e.target.value) || 0)}
                        placeholder="0"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Billing Rate (KES/hr)</Label>
                      <Input
                        type="number"
                        value={assignment.billingRate}
                        onChange={(e) => updateStaffAssignment(index, 'billingRate', parseFloat(e.target.value) || 0)}
                        placeholder="0"
                      />
                    </div>

                    <div className="flex items-end">
                      <Button 
                        onClick={() => removeStaffAssignment(index)} 
                        variant="outline" 
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  <div className="pt-2 border-t">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Assignment Value:</span>
                      <span className="font-medium">
                        KES {(assignment.budgetHours * assignment.billingRate).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {staffAssignments.length > 0 && (
            <div className="border-t pt-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div className="bg-blue-50 p-3 rounded-lg">
                  <div className="text-blue-600 font-medium">Total Hours</div>
                  <div className="text-2xl font-bold text-blue-800">
                    {staffAssignments.reduce((sum, a) => sum + a.budgetHours, 0)}
                  </div>
                </div>
                <div className="bg-green-50 p-3 rounded-lg">
                  <div className="text-green-600 font-medium">Total Budget</div>
                  <div className="text-2xl font-bold text-green-800">
                    KES {staffAssignments.reduce((sum, a) => sum + (a.budgetHours * a.billingRate), 0).toLocaleString()}
                  </div>
                </div>
                <div className="bg-purple-50 p-3 rounded-lg">
                  <div className="text-purple-600 font-medium">Team Size</div>
                  <div className="text-2xl font-bold text-purple-800">
                    {staffAssignments.length}
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Deliverables */}
      {formData.serviceType && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Deliverables
            </CardTitle>
            <CardDescription>
              Select required deliverables for this {SERVICE_CONFIGURATIONS[formData.serviceType as keyof typeof SERVICE_CONFIGURATIONS]?.name} engagement
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {SERVICE_CONFIGURATIONS[formData.serviceType as keyof typeof SERVICE_CONFIGURATIONS]?.deliverables.map((deliverable) => (
                <div key={deliverable} className="flex items-center space-x-2">
                  <Checkbox
                    id={deliverable}
                    checked={selectedDeliverables.includes(deliverable)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedDeliverables(prev => [...prev, deliverable]);
                      } else {
                        setSelectedDeliverables(prev => prev.filter(d => d !== deliverable));
                      }
                    }}
                  />
                  <Label htmlFor={deliverable} className="text-sm font-normal cursor-pointer">
                    {deliverable}
                  </Label>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      <div className="flex justify-between">
        <div className="space-y-2">
          <Label htmlFor="status">Job Status</Label>
          <Select value={formData.status} onValueChange={(value) => handleInputChange('status', value)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">
                <Badge variant="secondary" className="bg-gray-100">Draft</Badge>
              </SelectItem>
              <SelectItem value="active">
                <Badge variant="secondary" className="bg-green-100 text-green-800">Active</Badge>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-x-3">
          <Button variant="outline" onClick={() => setActiveTab('management')}>
            Cancel
          </Button>
          <Button 
            onClick={submitJobWithWorkflow} 
            disabled={isSubmitting}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isSubmitting ? (
              <>
                <div className="animate-spin h-4 w-4 mr-2 border-2 border-white border-t-transparent rounded-full" />
                Creating Job...
              </>
            ) : (
              <>
                <PlayCircle className="h-4 w-4 mr-2" />
                Create Job & Start Workflow
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );

  const renderJobManagement = () => (
    <div className="space-y-6">
      {/* Dashboard Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Active Jobs</p>
                <p className="text-3xl font-bold text-blue-600">
                  {dashboardData.summary?.activeJobs || 0}
                </p>
              </div>
              <Briefcase className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">In Progress</p>
                <p className="text-3xl font-bold text-orange-600">
                  {dashboardData.summary?.inProgressJobs || 0}
                </p>
              </div>
              <PlayCircle className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Partners</p>
                <p className="text-3xl font-bold text-purple-600">
                  {dashboardData.summary?.totalPartners || 0}
                </p>
              </div>
              <Shield className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Critical Items</p>
                <p className="text-3xl font-bold text-red-600">
                  {dashboardData.summary?.criticalItemsCount || 0}
                </p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active Jobs Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Active Jobs Management
            </span>
            <Button onClick={() => setActiveTab('create')} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              New Job
            </Button>
          </CardTitle>
          <CardDescription>
            Monitor and manage all active professional engagements
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Partner</TableHead>
                  <TableHead>Service Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Budget</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeJobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{job.title}</span>
                        <span className="text-sm text-gray-500">{job.job_code}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{job.client?.client_name}</span>
                        <span className="text-sm text-gray-500">{job.client?.contact_person}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {job.partner && (
                        <span>{job.partner.first_name} {job.partner.last_name}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {SERVICE_CONFIGURATIONS[job.service_type as keyof typeof SERVICE_CONFIGURATIONS] && (
                          <>
                            {React.createElement(
                              SERVICE_CONFIGURATIONS[job.service_type as keyof typeof SERVICE_CONFIGURATIONS].icon,
                              { className: "h-4 w-4" }
                            )}
                            <span className="text-sm">{job.service_subtype || job.service_type}</span>
                          </>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant="secondary" 
                        className={`
                          ${job.workflow_stage === 'completed' ? 'bg-green-100 text-green-800' : ''}
                          ${job.workflow_stage === 'in_progress' ? 'bg-blue-100 text-blue-800' : ''}
                          ${job.workflow_stage === 'partner_review' ? 'bg-yellow-100 text-yellow-800' : ''}
                        `}
                      >
                        {WORKFLOW_STAGES.find(s => s.value === job.workflow_stage)?.label || job.workflow_stage}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className={job.isOverdue ? 'text-red-600 font-medium' : ''}>
                          {format(new Date(job.due_date), 'MMM dd, yyyy')}
                        </span>
                        <span className="text-sm text-gray-500">
                          {job.daysUntilDue < 0 ? `${Math.abs(job.daysUntilDue)} days overdue` : 
                           job.daysUntilDue === 0 ? 'Due today' :
                           `${job.daysUntilDue} days left`}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">
                          KES {job.budget_amount?.toLocaleString()}
                        </span>
                        <span className="text-sm text-gray-500">
                          {job.budgetUtilization}% utilized
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Progress value={job.completionPercentage || 0} className="w-full h-2" />
                        <span className="text-xs text-gray-500">
                          {Math.round(job.completionPercentage || 0)}% complete
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm">
                          <Edit className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {activeJobs.length === 0 && (
            <div className="text-center py-12">
              <Briefcase className="h-12 w-12 mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No active jobs</h3>
              <p className="text-gray-500 mb-4">Get started by creating your first professional engagement</p>
              <Button onClick={() => setActiveTab('create')}>
                <Plus className="h-4 w-4 mr-2" />
                Create New Job
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  const renderAnalytics = () => (
    <div className="space-y-6">
      {/* Financial Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Total Budget</p>
                <p className="text-3xl font-bold text-green-600">
                  KES {dashboardData.overview?.totalBudget?.toLocaleString() || '0'}
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Total Hours</p>
                <p className="text-3xl font-bold text-blue-600">
                  {dashboardData.overview?.totalEstimatedHours?.toLocaleString() || '0'}
                </p>
              </div>
              <Clock className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Total Jobs</p>
                <p className="text-3xl font-bold text-purple-600">
                  {dashboardData.overview?.totalJobs || 0}
                </p>
              </div>
              <Target className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Service Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Service Type Distribution
          </CardTitle>
          <CardDescription>Revenue and job count by service type</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {dashboardData.serviceDistribution?.map((service: any) => (
              <div key={`${service.service_type}-${service.service_subtype}`} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  {SERVICE_CONFIGURATIONS[service.service_type as keyof typeof SERVICE_CONFIGURATIONS] && 
                    React.createElement(
                      SERVICE_CONFIGURATIONS[service.service_type as keyof typeof SERVICE_CONFIGURATIONS].icon,
                      { className: "h-5 w-5" }
                    )
                  }
                  <div>
                    <p className="font-medium">{service.service_subtype || service.service_type}</p>
                    <p className="text-sm text-gray-500">{service._count.id} jobs</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-medium">KES {service._sum.budget_amount?.toLocaleString() || '0'}</p>
                  <p className="text-sm text-gray-500">{Math.round(service._avg.estimated_hours || 0)} avg hours</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Partner Performance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Partner Performance
          </CardTitle>
          <CardDescription>Performance metrics by partner</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Partner</TableHead>
                  <TableHead>Active Jobs</TableHead>
                  <TableHead>Total Budget</TableHead>
                  <TableHead>Efficiency</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead>Overdue Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(Array.isArray(dashboardData.partnerPerformance) ? dashboardData.partnerPerformance : []).map((partner: any) => (
                  <TableRow key={partner.partner_id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4" />
                        {partner.first_name} {partner.last_name}
                      </div>
                    </TableCell>
                    <TableCell>{partner.active_jobs || 0}</TableCell>
                    <TableCell>KES {partner.total_budget?.toLocaleString() || '0'}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={partner.avg_efficiency || 0} className="w-16 h-2" />
                        <span className="text-sm">{Math.round(partner.avg_efficiency || 0)}%</span>
                      </div>
                    </TableCell>
                    <TableCell>{partner.completed_jobs || 0}</TableCell>
                    <TableCell>
                      <Badge 
                        variant="secondary"
                        className={`${
                          partner.overdue_rate > 20 ? 'bg-red-100 text-red-800' :
                          partner.overdue_rate > 10 ? 'bg-yellow-100 text-yellow-800' :
                          'bg-green-100 text-green-800'
                        }`}
                      >
                        {Math.round(partner.overdue_rate || 0)}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Professional Services Job Management</h1>
            <p className="text-gray-500 mt-1">
              Comprehensive workflow management for audit, tax, advisory, and consulting engagements
            </p>
          </div>
          <Badge variant="secondary" className="bg-blue-100 text-blue-800">
            Ronalds LLP Management System
          </Badge>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="create" className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Create Job
            </TabsTrigger>
            <TabsTrigger value="management" className="flex items-center gap-2">
              <Briefcase className="h-4 w-4" />
              Job Management
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Analytics
            </TabsTrigger>
          </TabsList>

          <TabsContent value="create">
            {renderJobCreationForm()}
          </TabsContent>

          <TabsContent value="management">
            {renderJobManagement()}
          </TabsContent>

          <TabsContent value="analytics">
            {renderAnalytics()}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default AdminJobWorkflowManagement;