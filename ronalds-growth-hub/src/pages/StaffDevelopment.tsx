import React, { useState, useEffect } from 'react';
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

const StaffDevelopment = () => {
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
    start_date: new Date(),
    provider: '',
    cost: 0,
    notes: ''
  });

  useEffect(() => {
    fetchStaffDevelopmentData();
  }, [selectedEmployee]);

  const fetchStaffDevelopmentData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      const [
        trainingRes,
        certificationsRes,
        skillsRes,
        goalsRes,
        metricsRes
      ] = await Promise.all([
        fetch(`http://localhost:4000/api/manager/training-records?employee=${selectedEmployee}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`http://localhost:4000/api/manager/certifications?employee=${selectedEmployee}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`http://localhost:4000/api/manager/skill-assessments?employee=${selectedEmployee}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`http://localhost:4000/api/manager/development-goals?employee=${selectedEmployee}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`http://localhost:4000/api/manager/development-metrics`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      if (trainingRes.ok) {
        const data = await trainingRes.json();
        setTrainingRecords(data);
      }
      
      if (certificationsRes.ok) {
        const data = await certificationsRes.json();
        setCertifications(data);
      }
      
      if (skillsRes.ok) {
        const data = await skillsRes.json();
        setSkillAssessments(data);
      }
      
      if (goalsRes.ok) {
        const data = await goalsRes.json();
        setDevelopmentGoals(data);
      }
      
      if (metricsRes.ok) {
        const data = await metricsRes.json();
        setMetrics(data);
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
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:4000/api/manager/training-records', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(newTraining)
      });
      
      if (response.ok) {
        setShowNewTraining(false);
        fetchStaffDevelopmentData();
        // Reset form
        setNewTraining({
          employee_id: '',
          course_name: '',
          training_type: 'internal',
          start_date: new Date(),
          provider: '',
          cost: 0,
          notes: ''
        });
      }
    } catch (error) {
      console.error('Error scheduling training:', error);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading staff development data...</p>
          </div>
        </div>
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
              <DialogContent className="sm:max-w-[500px]">
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
                  {((metrics.training_budget_used / metrics.training_budget_total) * 100).toFixed(0)}%
                </div>
                <Progress 
                  value={(metrics.training_budget_used / metrics.training_budget_total) * 100} 
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
                <div className="text-2xl font-bold">{metrics.avg_skill_level.toFixed(1)}/5</div>
                <p className="text-xs text-gray-600">Team average</p>
              </CardContent>
            </Card>
          </div>
        )}

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
                              {record.employee_name} • {record.provider}
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
                              {cert.employee_name} • {cert.issuing_organization}
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
                            {skill.employee_name} • {skill.skill_category}
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