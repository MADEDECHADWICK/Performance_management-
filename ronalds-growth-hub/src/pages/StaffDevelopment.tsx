import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Textarea } from "@/components/ui/textarea";
import { 
  GraduationCap,
  BookOpen, 
  Award, 
  TrendingUp,
  Calendar as CalendarIcon,
  Plus,
  Eye,
  Edit,
  CheckCircle,
  Clock,
  Target,
  User,
  FileText,
  Users,
  Star
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import PageLoader from '@/components/ui/page-loader';
import { getToken } from "@/lib/api";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface TrainingRecord {
  id: number;
  employee_id: number;
  employee_name: string;
  course_name: string;
  training_type: 'internal' | 'external' | 'certification' | 'workshop';
  status: 'planned' | 'in_progress' | 'completed' | 'cancelled';
  start_date: string;
  end_date: string;
  provider: string;
  cost: number;
  completion_percentage: number;
  certificate_url?: string;
  notes?: string;
}

interface Certification {
  id: number;
  employee_id: number;
  employee_name: string;
  certification_name: string;
  issuing_organization: string;
  issue_date: string;
  expiry_date?: string;
  status: 'active' | 'expired' | 'expiring_soon';
  certificate_number: string;
  verification_url?: string;
}

interface SkillAssessment {
  id: number;
  employee_id: number;
  employee_name: string;
  skill_category: string;
  skill_name: string;
  current_level: number;
  target_level: number;
  assessment_date: string;
  assessor_name: string;
  notes?: string;
}

interface DevelopmentGoal {
  id: number;
  employee_id: number;
  employee_name: string;
  goal_title: string;
  goal_description: string;
  target_completion: string;
  current_progress: number;
  status: 'active' | 'completed' | 'paused' | 'cancelled';
  assigned_mentor?: string;
  created_date: string;
}

interface StaffDevelopmentMetrics {
  total_employees: number;
  active_training: number;
  completed_courses: number;
  certifications_expiring: number;
  avg_skill_level: number;
  training_budget_used: number;
  training_budget_total: number;
  development_goals_completed: number;
}

const toNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeMetrics = (payload: any): StaffDevelopmentMetrics => {
  const source = payload?.data ?? payload ?? {};
  return {
    total_employees: toNumber(source.total_employees ?? source.totalEmployees),
    active_training: toNumber(source.active_training ?? source.activeTraining),
    completed_courses: toNumber(source.completed_courses ?? source.completedCourses),
    certifications_expiring: toNumber(
      source.certifications_expiring ?? source.certificationsExpiring
    ),
    avg_skill_level: toNumber(source.avg_skill_level ?? source.avgSkillLevel),
    training_budget_used: toNumber(source.training_budget_used ?? source.trainingBudgetUsed),
    training_budget_total: toNumber(source.training_budget_total ?? source.trainingBudgetTotal),
    development_goals_completed: toNumber(
      source.development_goals_completed ?? source.developmentGoalsCompleted
    ),
  };
};

const normalizeTrainingRecord = (payload: any): TrainingRecord => {
  const source = payload ?? {};
  return {
    id: toNumber(source.id),
    employee_id: toNumber(source.employee_id ?? source.employeeId),
    employee_name: String(source.employee_name ?? source.employeeName ?? "Team Session"),
    course_name: String(source.course_name ?? source.courseName ?? ""),
    training_type: String(source.training_type ?? source.trainingType ?? "internal") as TrainingRecord["training_type"],
    status: String(source.status ?? "planned") as TrainingRecord["status"],
    start_date: String(source.start_date ?? source.startDate ?? new Date().toISOString()),
    end_date: String(source.end_date ?? source.endDate ?? source.start_date ?? source.startDate ?? new Date().toISOString()),
    provider: String(source.provider ?? "Internal"),
    cost: toNumber(source.cost),
    completion_percentage: toNumber(source.completion_percentage ?? source.completionPercentage),
    certificate_url: source.certificate_url ?? source.certificateUrl ?? undefined,
    notes: source.notes ?? undefined,
  };
};

const normalizeCertification = (payload: any): Certification => {
  const source = payload ?? {};
  return {
    id: toNumber(source.id),
    employee_id: toNumber(source.employee_id ?? source.employeeId),
    employee_name: String(source.employee_name ?? source.employeeName ?? "Team Session"),
    certification_name: String(source.certification_name ?? source.certificationName ?? ""),
    issuing_organization: String(source.issuing_organization ?? source.issuingOrganization ?? "Internal"),
    issue_date: String(source.issue_date ?? source.issueDate ?? new Date().toISOString()),
    expiry_date: source.expiry_date ?? source.expiryDate ?? undefined,
    status: String(source.status ?? "active") as Certification["status"],
    certificate_number: String(source.certificate_number ?? source.certificateNumber ?? ""),
    verification_url: source.verification_url ?? source.verificationUrl ?? undefined,
  };
};

const normalizeSkillAssessment = (payload: any): SkillAssessment => {
  const source = payload ?? {};
  return {
    id: toNumber(source.id),
    employee_id: toNumber(source.employee_id ?? source.employeeId),
    employee_name: String(source.employee_name ?? source.employeeName ?? "Employee"),
    skill_category: String(source.skill_category ?? source.skillCategory ?? "General"),
    skill_name: String(source.skill_name ?? source.skillName ?? ""),
    current_level: toNumber(source.current_level ?? source.currentLevel, 1),
    target_level: toNumber(source.target_level ?? source.targetLevel, 1),
    assessment_date: String(source.assessment_date ?? source.assessmentDate ?? new Date().toISOString()),
    assessor_name: String(source.assessor_name ?? source.assessorName ?? "Manager"),
    notes: source.notes ?? undefined,
  };
};

const normalizeDevelopmentGoal = (payload: any): DevelopmentGoal => {
  const source = payload ?? {};
  return {
    id: toNumber(source.id),
    employee_id: toNumber(source.employee_id ?? source.employeeId),
    employee_name: String(source.employee_name ?? source.employeeName ?? "Employee"),
    goal_title: String(source.goal_title ?? source.goalTitle ?? ""),
    goal_description: String(source.goal_description ?? source.goalDescription ?? ""),
    target_completion: String(source.target_completion ?? source.targetCompletion ?? new Date().toISOString()),
    current_progress: toNumber(source.current_progress ?? source.currentProgress),
    status: String(source.status ?? "active") as DevelopmentGoal["status"],
    assigned_mentor: source.assigned_mentor ?? source.assignedMentor ?? undefined,
    created_date: String(source.created_date ?? source.createdDate ?? new Date().toISOString()),
  };
};

const StaffDevelopment = () => {
  const apiBaseUrl = `${import.meta.env.VITE_API_URL || 'http://localhost:4000'}/api`;
  const [trainingRecords, setTrainingRecords] = useState<TrainingRecord[]>([]);
  const [certifications, setCertifications] = useState<Certification[]>([]);
  const [skillAssessments, setSkillAssessments] = useState<SkillAssessment[]>([]);
  const [developmentGoals, setDevelopmentGoals] = useState<DevelopmentGoal[]>([]);
  const [metrics, setMetrics] = useState<StaffDevelopmentMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedEmployee, setSelectedEmployee] = useState('all');

  // New training dialog state
  const [showNewTraining, setShowNewTraining] = useState(false);
  const [newTraining, setNewTraining] = useState({
    employee_id: '',
    course_name: '',
    training_type: 'internal',
    delivery_mode: 'physical',
    start_date: new Date(),
    provider: '',
    cost: 0,
    notes: ''
  });
  const [trainingAttachment, setTrainingAttachment] = useState<File | null>(null);

  useEffect(() => {
    fetchStaffDevelopmentData();
  }, [selectedEmployee]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchStaffDevelopmentData = async () => {
    try {
      setLoading(true);
      const token = getToken();
      if (!token) {
        setTrainingRecords([]);
        setCertifications([]);
        setSkillAssessments([]);
        setDevelopmentGoals([]);
        setMetrics(null);
        return;
      }
      
      const [
        trainingRes,
        certificationsRes,
        skillsRes,
        goalsRes,
        metricsRes
      ] = await Promise.all([
        fetch(`${apiBaseUrl}/manager/training-records?employee=${encodeURIComponent(selectedEmployee)}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${apiBaseUrl}/manager/certifications?employee=${encodeURIComponent(selectedEmployee)}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${apiBaseUrl}/manager/skill-assessments?employee=${encodeURIComponent(selectedEmployee)}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${apiBaseUrl}/manager/development-goals?employee=${encodeURIComponent(selectedEmployee)}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${apiBaseUrl}/manager/development-metrics`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      if (trainingRes.ok) {
        const data = await trainingRes.json();
        setTrainingRecords(Array.isArray(data) ? data.map(normalizeTrainingRecord) : []);
      }
      
      if (certificationsRes.ok) {
        const data = await certificationsRes.json();
        setCertifications(Array.isArray(data) ? data.map(normalizeCertification) : []);
      }
      
      if (skillsRes.ok) {
        const data = await skillsRes.json();
        setSkillAssessments(Array.isArray(data) ? data.map(normalizeSkillAssessment) : []);
      }
      
      if (goalsRes.ok) {
        const data = await goalsRes.json();
        setDevelopmentGoals(Array.isArray(data) ? data.map(normalizeDevelopmentGoal) : []);
      }
      
      if (metricsRes.ok) {
        const data = await metricsRes.json();
        setMetrics(normalizeMetrics(data));
      }
    } catch (error) {
      console.error('Error fetching staff development data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      'completed': { color: 'bg-green-100 text-green-800', text: 'Completed' },
      'in_progress': { color: 'bg-blue-100 text-blue-800', text: 'In Progress' },
      'planned': { color: 'bg-gray-100 text-gray-800', text: 'Planned' },
      'active': { color: 'bg-green-100 text-green-800', text: 'Active' },
      'expired': { color: 'bg-red-100 text-red-800', text: 'Expired' },
      'expiring_soon': { color: 'bg-yellow-100 text-yellow-800', text: 'Expiring Soon' },
      'cancelled': { color: 'bg-red-100 text-red-800', text: 'Cancelled' },
      'paused': { color: 'bg-orange-100 text-orange-800', text: 'Paused' }
    };
    
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.planned;
    return <Badge className={config.color}>{config.text}</Badge>;
  };

  const getTrainingTypeIcon = (type: string) => {
    switch (type) {
      case 'certification': return <Award className="w-4 h-4" />;
      case 'workshop': return <Users className="w-4 h-4" />;
      case 'external': return <GraduationCap className="w-4 h-4" />;
      default: return <BookOpen className="w-4 h-4" />;
    }
  };

  const scheduleTraining = async () => {
    try {
      const token = getToken();
      if (!token) return;

      const trainingPayload = {
        employeeId: newTraining.employee_id ? Number(newTraining.employee_id) : undefined,
        courseName: newTraining.course_name,
        trainingType: newTraining.training_type,
        deliveryMode: newTraining.delivery_mode,
        startDate: newTraining.start_date,
        provider: newTraining.provider,
        cost: newTraining.cost,
        notes: newTraining.notes,
      };

      const response = await fetch(`${apiBaseUrl}/manager/training-records`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(trainingPayload)
      });
      
      if (response.ok) {
        const created = await response.json().catch(() => null);
        const trainingRecordId = created?.id;

        if (trainingAttachment && trainingRecordId) {
          const formData = new FormData();
          formData.append('file', trainingAttachment);
          formData.append('documentType', 'training_material');
          formData.append('entityType', 'TrainingRecord');
          formData.append('entityId', String(trainingRecordId));
          formData.append('accessLevel', 'manager');
          formData.append('description', `Training material for ${newTraining.course_name}`);

          await fetch(`${apiBaseUrl}/documents/upload`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`
            },
            body: formData
          });
        }

        setShowNewTraining(false);
        fetchStaffDevelopmentData();
        // Reset form
        setNewTraining({
          employee_id: '',
          course_name: '',
          training_type: 'internal',
          delivery_mode: 'physical',
          start_date: new Date(),
          provider: '',
          cost: 0,
          notes: ''
        });
        setTrainingAttachment(null);
      }
    } catch (error) {
      console.error('Error scheduling training:', error);
    }
  };

  const budgetPercent =
    metrics && metrics.training_budget_total > 0
      ? (metrics.training_budget_used / metrics.training_budget_total) * 100
      : 0;

  const trainingStatusMix = useMemo(() => {
    const buckets = [
      { key: "planned", label: "Planned" },
      { key: "in_progress", label: "In Progress" },
      { key: "completed", label: "Completed" },
      { key: "cancelled", label: "Cancelled" },
    ];

    return buckets.map((bucket) => ({
      name: bucket.label,
      value: trainingRecords.filter((record) => record.status === bucket.key).length,
    }));
  }, [trainingRecords]);

  const certificationMix = useMemo(() => {
    const buckets = [
      { key: "active", label: "Active" },
      { key: "expiring_soon", label: "Expiring Soon" },
      { key: "expired", label: "Expired" },
    ];

    return buckets.map((bucket) => ({
      name: bucket.label,
      value: certifications.filter((cert) => cert.status === bucket.key).length,
    }));
  }, [certifications]);

  const skillGapData = useMemo(() => {
    const grouped = new Map<string, { category: string; gap: number }>();
    skillAssessments.forEach((skill) => {
      const key = skill.skill_category || "Other";
      const gap = Math.max(0, Number(skill.target_level || 0) - Number(skill.current_level || 0));
      if (!grouped.has(key)) {
        grouped.set(key, { category: key, gap: 0 });
      }
      grouped.get(key)!.gap += gap;
    });
    return Array.from(grouped.values()).slice(0, 6);
  }, [skillAssessments]);

  const chartPalette = ["#0ea5e9", "#22c55e", "#f97316", "#ef4444", "#6366f1", "#14b8a6"];

  if (loading) {
    return (
      <DashboardLayout>
        <PageLoader message="Loading..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
	      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Staff Development</h1>
            <p className="text-gray-600 mt-1">Manage training, certifications, and career development</p>
          </div>
          <div className="flex gap-3">
            <Dialog open={showNewTraining} onOpenChange={setShowNewTraining}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Schedule Training
                </Button>
              </DialogTrigger>
            <DialogContent className="w-[95vw] max-w-[520px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Schedule New Training</DialogTitle>
                  <DialogDescription>
                    Add a new training session for your team members
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">Course Name</label>
                    <Input
                      value={newTraining.course_name}
                      onChange={(e) => setNewTraining({...newTraining, course_name: e.target.value})}
                      placeholder="e.g., Advanced Excel for Auditors"
                    />
                  </div>
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">Training Type</label>
                    <Select
                      value={newTraining.training_type}
                      onValueChange={(value) => setNewTraining({...newTraining, training_type: value})}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="internal">Internal Training</SelectItem>
                        <SelectItem value="external">External Course</SelectItem>
                        <SelectItem value="certification">Certification</SelectItem>
                        <SelectItem value="workshop">Workshop</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">Delivery Mode</label>
                    <Select
                      value={newTraining.delivery_mode}
                      onValueChange={(value) => setNewTraining({ ...newTraining, delivery_mode: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="physical">Physical</SelectItem>
                        <SelectItem value="online">Online</SelectItem>
                        <SelectItem value="video_upload">Upload video</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">Provider</label>
                    <Input
                      value={newTraining.provider}
                      onChange={(e) => setNewTraining({...newTraining, provider: e.target.value})}
                      placeholder="Training provider"
                    />
                  </div>
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">Cost (KES)</label>
                    <Input
                      type="number"
                      value={newTraining.cost}
                      onChange={(e) => setNewTraining({...newTraining, cost: parseFloat(e.target.value)})}
                    />
                  </div>
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">Notes</label>
                    <Textarea
                      value={newTraining.notes}
                      onChange={(e) => setNewTraining({...newTraining, notes: e.target.value})}
                      placeholder="Additional notes or requirements"
                    />
                  </div>
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">
                      Training Material (optional for online/video)
                    </label>
                    <Input
                      type="file"
                      accept=".mp4,.mov,.avi,.mkv,.pdf,.doc,.docx"
                      onChange={(event) => {
                        const file = event.target.files?.[0] || null;
                        setTrainingAttachment(file);
                      }}
                    />
                    {trainingAttachment ? (
                      <p className="text-xs text-muted-foreground">
                        Selected: {trainingAttachment.name}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Upload a video or materials if needed.
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex justify-end gap-3">
                  <Button variant="outline" onClick={() => setShowNewTraining(false)}>
                    Cancel
                  </Button>
                  <Button onClick={scheduleTraining}>
                    Schedule Training
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

	        {/* Metrics Overview */}
	        {metrics && (
	          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
	            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Training</CardTitle>
                <BookOpen className="w-4 h-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.active_training}</div>
                <p className="text-xs text-gray-600">Ongoing sessions</p>
              </CardContent>
            </Card>

	            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Certifications</CardTitle>
                <Award className="w-4 h-4 text-yellow-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{metrics.certifications_expiring}</div>
                <p className="text-xs text-gray-600">Expiring soon</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Training Budget</CardTitle>
                <TrendingUp className="w-4 h-4 text-green-600" />
              </CardHeader>
	              <CardContent>
	                <div className="text-2xl font-bold">
	                  {toNumber(budgetPercent).toFixed(0)}%
	                </div>
	                <Progress
	                  value={toNumber(budgetPercent)}
	                  className="mt-2"
	                />
	              </CardContent>
	            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Skill Level</CardTitle>
                <Star className="w-4 h-4 text-purple-600" />
              </CardHeader>
	              <CardContent>
	                <div className="text-2xl font-bold">{toNumber(metrics.avg_skill_level).toFixed(1)}/5</div>
	                <p className="text-xs text-gray-600">Team average</p>
	              </CardContent>
	            </Card>
	          </div>
	        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Training Status Mix</CardTitle>
              <CardDescription>Distribution of training records by status.</CardDescription>
            </CardHeader>
            <CardContent className="h-64">
              {trainingRecords.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  No training records yet.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={trainingStatusMix}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={52}
                      outerRadius={86}
                      paddingAngle={2}
                    >
                      {trainingStatusMix.map((item, index) => (
                        <Cell key={`training-status-${item.name}`} fill={chartPalette[index % chartPalette.length]} />
                      ))}
                    </Pie>
                    <Legend verticalAlign="bottom" height={18} />
                    <Tooltip formatter={(value: number) => Number(value || 0).toFixed(0)} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Certification Health</CardTitle>
              <CardDescription>Active vs expiring vs expired certifications.</CardDescription>
            </CardHeader>
            <CardContent className="h-64">
              {certifications.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  No certifications recorded yet.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={certificationMix}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={52}
                      outerRadius={86}
                      paddingAngle={2}
                    >
                      <Cell fill="#22c55e" />
                      <Cell fill="#f59e0b" />
                      <Cell fill="#ef4444" />
                    </Pie>
                    <Legend verticalAlign="bottom" height={18} />
                    <Tooltip formatter={(value: number) => Number(value || 0).toFixed(0)} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Skill Gap by Category</CardTitle>
              <CardDescription>Total target-minus-current skill gap.</CardDescription>
            </CardHeader>
            <CardContent className="h-64">
              {skillGapData.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  No skill assessments yet.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={skillGapData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="category" tickLine={false} axisLine={false} fontSize={11} />
                    <YAxis allowDecimals={false} />
                    <Tooltip formatter={(value: number) => Number(value || 0).toFixed(1)} />
                    <Bar dataKey="gap" radius={[6, 6, 0, 0]}>
                      {skillGapData.map((item, index) => (
                        <Cell key={`skill-gap-${item.category}`} fill={chartPalette[index % chartPalette.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

	        {/* Content Tabs */}
	        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="training">Training</TabsTrigger>
            <TabsTrigger value="certifications">Certifications</TabsTrigger>
            <TabsTrigger value="skills">Skills</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Recent Training Activity */}
              <Card>
                <CardHeader>
                  <CardTitle>Recent Training Activity</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {trainingRecords.slice(0, 5).map((record) => (
                    <div key={record.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center space-x-3">
                        {getTrainingTypeIcon(record.training_type)}
                        <div>
                          <p className="font-medium">{record.course_name}</p>
                          <p className="text-sm text-gray-600">{record.employee_name}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        {getStatusBadge(record.status)}
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(record.start_date).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Development Goals Progress */}
              <Card>
                <CardHeader>
                  <CardTitle>Development Goals</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {developmentGoals.slice(0, 5).map((goal) => (
                    <div key={goal.id} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="font-medium">{goal.goal_title}</p>
                        <span className="text-sm text-gray-600">{goal.current_progress}%</span>
                      </div>
                      <Progress value={goal.current_progress} className="h-2" />
                      <p className="text-sm text-gray-600">{goal.employee_name}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="training" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Training Records</CardTitle>
                <CardDescription>Manage and track all training activities</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {trainingRecords.map((record) => (
                    <div key={record.id} className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          {getTrainingTypeIcon(record.training_type)}
                          <div>
                            <h3 className="font-semibold">{record.course_name}</h3>
                            <p className="text-sm text-gray-600">
                              {record.employee_name} - {record.provider}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-3">
                          {getStatusBadge(record.status)}
                          <Button variant="outline" size="sm">
                            <Eye className="w-4 h-4 mr-1" />
                            View
                          </Button>
                        </div>
                      </div>
                      
                      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-gray-600">Start Date</p>
                          <p className="font-medium">{new Date(record.start_date).toLocaleDateString()}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">End Date</p>
                          <p className="font-medium">{new Date(record.end_date).toLocaleDateString()}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Progress</p>
                          <div className="flex items-center space-x-2">
                            <Progress value={record.completion_percentage} className="flex-1 h-2" />
                            <span className="text-xs">{record.completion_percentage}%</span>
                          </div>
                        </div>
                        <div>
                          <p className="text-gray-600">Cost</p>
                          <p className="font-medium">KES {record.cost.toLocaleString()}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="certifications" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Certifications</CardTitle>
                <CardDescription>Track professional certifications and renewals</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {certifications.map((cert) => (
                    <div key={cert.id} className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <Award className="w-5 h-5 text-yellow-600" />
                          <div>
                            <h3 className="font-semibold">{cert.certification_name}</h3>
                            <p className="text-sm text-gray-600">
                              {cert.employee_name} - {cert.issuing_organization}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          {getStatusBadge(cert.status)}
                          <p className="text-xs text-gray-500 mt-1">{cert.certificate_number}</p>
                        </div>
                      </div>
                      
                      <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="text-gray-600">Issue Date</p>
                          <p className="font-medium">{new Date(cert.issue_date).toLocaleDateString()}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Expiry Date</p>
                          <p className="font-medium">
                            {cert.expiry_date ? new Date(cert.expiry_date).toLocaleDateString() : 'No expiry'}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-600">Actions</p>
                          <div className="flex space-x-2">
                            {cert.verification_url && (
                              <Button variant="outline" size="sm" asChild>
                                <a href={cert.verification_url} target="_blank" rel="noopener noreferrer">
                                  Verify
                                </a>
                              </Button>
                            )}
                            <Button variant="outline" size="sm">
                              <Edit className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="skills" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Skill Assessments</CardTitle>
                <CardDescription>Monitor team skill levels and development needs</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {skillAssessments.map((skill) => (
                    <div key={skill.id} className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-semibold">{skill.skill_name}</h3>
                          <p className="text-sm text-gray-600">
                            {skill.employee_name} - {skill.skill_category}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-gray-600">Assessed by {skill.assessor_name}</p>
                          <p className="text-xs text-gray-500">{new Date(skill.assessment_date).toLocaleDateString()}</p>
                        </div>
                      </div>
                      
                      <div className="mt-4 grid grid-cols-2 gap-6">
                        <div>
                          <p className="text-sm text-gray-600 mb-2">Current Level</p>
                          <div className="flex items-center space-x-2">
                            <Progress value={(skill.current_level / 5) * 100} className="flex-1" />
                            <span className="text-sm font-medium">{skill.current_level}/5</span>
                          </div>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600 mb-2">Target Level</p>
                          <div className="flex items-center space-x-2">
                            <Progress value={(skill.target_level / 5) * 100} className="flex-1" />
                            <span className="text-sm font-medium">{skill.target_level}/5</span>
                          </div>
                        </div>
                      </div>
                      
                      {skill.notes && (
                        <div className="mt-4">
                          <p className="text-sm text-gray-600">Notes:</p>
                          <p className="text-sm mt-1">{skill.notes}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default StaffDevelopment;
