import React, { Suspense, lazy, useState, useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AnalyticsChartShell,
  AnalyticsLegendContent,
  AnalyticsTooltipContent,
  analyticsAxisProps,
  analyticsColorAt,
  analyticsDonutProps,
  analyticsGridProps,
} from "@/components/ui/analytics-chart";
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
  Star,
  Trash2,
  Download
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import PageLoader from '@/components/ui/page-loader';
import LearningAssignmentDialog from "@/components/staff-development/LearningAssignmentDialog";
import LearningAttendanceBulkDialog from "@/components/staff-development/LearningAttendanceBulkDialog";
import LearningProgramDialog from "@/components/staff-development/LearningProgramDialog";
import type { TrackedContentProgress } from "@/components/learning/TrackedContentViewer";
import {
  createLearningProgramBuilderState,
  type LearningProgramBuilderState,
} from "@/components/staff-development/learningProgramBuilder";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { getToken } from "@/lib/api";
import { employeesAPI } from "@/lib/api";
import documentsAPI, { type Document as ManagedDocument } from "@/lib/api/documents";
import type { Profile } from "@/lib/api/types";
import knowledgeHubAPI from "@/lib/api/knowledgeHub";
import learningDevelopmentAPI, {
  GlobalCertificateTemplateRecord,
  LearningAssignment,
  LearningModuleRecord,
  LearningProgramRecord,
  LearningPersonSummary,
  LearningProgramVersionPayload,
  LearningQuizRecord,
  LearningQuizQuestionRecord,
} from "@/lib/api/learningDevelopment";
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

const TrackedContentViewer = lazy(() => import("@/components/learning/TrackedContentViewer"));

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

interface StaffDevelopmentMetrics {
  total_employees: number;
  active_training: number;
  completed_courses: number;
  certifications_expiring: number;
  avg_skill_level: number;
  training_budget_used: number;
  training_budget_total: number;
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

const formatPersonName = (person?: LearningPersonSummary | null) => {
  if (!person) return "Not assigned";
  return [person.firstName, person.lastName].filter(Boolean).join(" ").trim() || "Not assigned";
};

const resolveDocumentUrl = (value: string | null | undefined) => {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';
  return value.startsWith('/') ? `${baseUrl}${value}` : `${baseUrl}/${value}`;
};

const getUrlExtension = (value: string | null | undefined) => {
  if (!value) return "";
  const normalized = value.split("?")[0].toLowerCase();
  const extensionIndex = normalized.lastIndexOf(".");
  return extensionIndex >= 0 ? normalized.slice(extensionIndex) : "";
};

const videoExtensions = new Set([".mp4", ".webm", ".ogg", ".mov", ".m4v"]);
const documentExtensions = new Set([".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".txt", ".md", ".rtf"]);

const inferWorkspaceModuleCompletionMode = (module: LearningModuleRecord) => {
  if (module.contentType === "knowledge_resource" && module.knowledgeHubResource) {
    return module.knowledgeHubResource.completionMode;
  }
  if (module.contentType === "video") return "watch_percent" as const;
  if (module.contentType === "document") return "document_scroll" as const;
  if (module.contentType === "link") {
    const extension = getUrlExtension(module.contentUrl);
    if (videoExtensions.has(extension)) return "watch_percent" as const;
    if (documentExtensions.has(extension)) return "document_scroll" as const;
  }
  return "manual" as const;
};

type LearningFeedbackFormState = {
  overallRating: string;
  contentRating: string;
  deliveryRating: string;
  relevanceRating: string;
  comment: string;
};

type LearningImpactAssessmentFormState = {
  behaviorChangeScore: string;
  productivityImpactScore: string;
  qualityImpactScore: string;
  businessImpactScore: string;
  comment: string;
};

type LearningQuizAnswerFormState = {
  optionIds: number[];
  freeTextAnswer: string;
};

type LearningAttendanceFormState = {
  attendanceStatus: 'invited' | 'attended' | 'missed' | 'excused';
  notes: string;
};

type GlobalCertificateTemplateFormState = {
  name: string;
  issuedByLabel: string;
  title: string;
  body: string;
  backgroundDocumentId: string;
  signatureDocumentId: string;
  isActive: boolean;
};

const createLearningFeedbackFormState = (): LearningFeedbackFormState => ({
  overallRating: "5",
  contentRating: "5",
  deliveryRating: "5",
  relevanceRating: "5",
  comment: "",
});

const createLearningImpactAssessmentFormState = (): LearningImpactAssessmentFormState => ({
  behaviorChangeScore: "",
  productivityImpactScore: "",
  qualityImpactScore: "",
  businessImpactScore: "",
  comment: "",
});

const createGlobalCertificateTemplateFormState = (
  template?: GlobalCertificateTemplateRecord | null
): GlobalCertificateTemplateFormState => {
  const templateDefinition =
    template?.templateDefinition && typeof template.templateDefinition === "object"
      ? template.templateDefinition
      : {};

  return {
    name: template?.name || "Standard Completion Certificate",
    issuedByLabel: template?.issuedByLabel || "",
    title: String(templateDefinition.title || "Certificate of Completion"),
    body: String(
      templateDefinition.body || 'has successfully completed the training "{{trainingName}}".'
    ),
    backgroundDocumentId: template?.backgroundDocumentId ? String(template.backgroundDocumentId) : "",
    signatureDocumentId: template?.signatureDocumentId ? String(template.signatureDocumentId) : "",
    isActive: template?.isActive ?? true,
  };
};

const ratingScaleOptions = [1, 2, 3, 4, 5];

const StaffDevelopment = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { hasRole, profile } = useAuth();
  const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';
  const apiBaseUrl = `${baseUrl}/api`;
  const [trainingRecords, setTrainingRecords] = useState<TrainingRecord[]>([]);
  const [certifications, setCertifications] = useState<Certification[]>([]);
  const [skillAssessments, setSkillAssessments] = useState<SkillAssessment[]>([]);
  const [metrics, setMetrics] = useState<StaffDevelopmentMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedEmployee, setSelectedEmployee] = useState('all');
  const [showLearningProgramDialog, setShowLearningProgramDialog] = useState(false);
  const [showLearningAssignmentDialog, setShowLearningAssignmentDialog] = useState(false);
  const [showLearningAttendanceDialog, setShowLearningAttendanceDialog] = useState(false);
  const [showLearningFeedbackDialog, setShowLearningFeedbackDialog] = useState(false);
  const [showImpactAssessmentDialog, setShowImpactAssessmentDialog] = useState(false);
  const [showLearningWorkspaceDialog, setShowLearningWorkspaceDialog] = useState(false);
  const [showGlobalCertificateTemplateDialog, setShowGlobalCertificateTemplateDialog] = useState(false);
  const [defaultAttendanceVersionId, setDefaultAttendanceVersionId] = useState('');
  const [selectedWorkspaceAssignmentId, setSelectedWorkspaceAssignmentId] = useState<number | null>(null);
  const [selectedFeedbackAssignment, setSelectedFeedbackAssignment] = useState<LearningAssignment | null>(null);
  const [selectedImpactAssignment, setSelectedImpactAssignment] = useState<LearningAssignment | null>(null);
  const [learningProgramForm, setLearningProgramForm] = useState<LearningProgramBuilderState>(
    createLearningProgramBuilderState()
  );
  const [learningAssignmentForm, setLearningAssignmentForm] = useState({
    programVersionId: '',
    dueAt: '',
    employeeIds: [] as number[],
  });
  const [learningFeedbackForm, setLearningFeedbackForm] = useState<LearningFeedbackFormState>(
    createLearningFeedbackFormState()
  );
  const [learningImpactAssessmentForm, setLearningImpactAssessmentForm] =
    useState<LearningImpactAssessmentFormState>(createLearningImpactAssessmentFormState());
  const [learningQuizAnswers, setLearningQuizAnswers] = useState<
    Record<number, LearningQuizAnswerFormState>
  >({});
  const [learningAttendanceForms, setLearningAttendanceForms] = useState<
    Record<number, LearningAttendanceFormState>
  >({});
  const [globalCertificateTemplateForm, setGlobalCertificateTemplateForm] =
    useState<GlobalCertificateTemplateFormState>(createGlobalCertificateTemplateFormState());
  const [activeWorkspaceModuleId, setActiveWorkspaceModuleId] = useState<number | null>(null);
  const [activeWorkspaceModuleOpenedAt, setActiveWorkspaceModuleOpenedAt] = useState<number | null>(null);
  const [workspaceModuleTrackingSupport, setWorkspaceModuleTrackingSupport] = useState<
    Record<number, boolean | null>
  >({});

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
  const canManageLearning = hasRole('super_admin') || hasRole('hr') || hasRole('gmp') || hasRole('partner') || hasRole('manager');

  useEffect(() => {
    fetchStaffDevelopmentData();
  }, [selectedEmployee]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedEmployeeId = selectedEmployee !== 'all' ? Number(selectedEmployee) : undefined;

  const {
    data: learningAssignments = [],
    isLoading: learningAssignmentsLoading,
  } = useQuery({
    queryKey: ['learning-assignments', selectedEmployeeId ?? 'all'],
    queryFn: async () => {
      try {
        return await learningDevelopmentAPI.listAssignments(
          selectedEmployeeId ? { employeeId: selectedEmployeeId } : undefined
        );
      } catch (error: any) {
        if ([403, 404].includes(Number(error?.status))) {
          return [] as LearningAssignment[];
        }
        throw error;
      }
    },
  });

  const { data: learningPoints } = useQuery({
    queryKey: ['learning-points', selectedEmployeeId ?? 'self'],
    queryFn: async () => {
      try {
        return await learningDevelopmentAPI.getPoints(selectedEmployeeId);
      } catch (error: any) {
        if ([403, 404].includes(Number(error?.status))) {
          return null;
        }
        throw error;
      }
    },
  });

  const { data: learningPrograms = [], isLoading: learningProgramsLoading } = useQuery({
    queryKey: ['learning-programs'],
    enabled: canManageLearning,
    queryFn: async () => {
      try {
        return await learningDevelopmentAPI.listPrograms();
      } catch (error: any) {
        if ([403, 404].includes(Number(error?.status))) {
          return [] as LearningProgramRecord[];
        }
        throw error;
      }
    },
  });

  const { data: employeesResponse } = useQuery({
    queryKey: ['learning-assignment-employees'],
    enabled: canManageLearning,
    queryFn: () => employeesAPI.list({ page: 1, pageSize: 200, status: 'active' }),
  });

  const { data: learningKnowledgeResources } = useQuery({
    queryKey: ['learning-knowledge-resources'],
    enabled: canManageLearning,
    queryFn: async () => {
      try {
        return await knowledgeHubAPI.list({ page: 1, pageSize: 100 });
      } catch (error: any) {
        if ([403, 404].includes(Number(error?.status))) {
          return { resources: [] };
        }
        throw error;
      }
    },
  });

  const { data: certificateAssetDocuments } = useQuery({
    queryKey: ['learning-certificate-assets'],
    enabled: canManageLearning,
    queryFn: async () => {
      try {
        return await documentsAPI.list({ page: 1, pageSize: 200 });
      } catch (error: any) {
        if ([403, 404].includes(Number(error?.status))) {
          return { documents: [] as ManagedDocument[], total: 0, page: 1, pageSize: 200 };
        }
        throw error;
      }
    },
  });

  const { data: globalCertificateTemplate } = useQuery({
    queryKey: ['global-certificate-template'],
    enabled: canManageLearning,
    queryFn: async () => {
      try {
        return await learningDevelopmentAPI.getGlobalCertificateTemplate();
      } catch (error: any) {
        if ([403, 404].includes(Number(error?.status))) {
          return null;
        }
        throw error;
      }
    },
  });

  const { data: manageableLearningAssignments = [] } = useQuery({
    queryKey: ['learning-assignments-bulk'],
    enabled: canManageLearning,
    queryFn: async () => {
      try {
        return await learningDevelopmentAPI.listAssignments();
      } catch (error: any) {
        if ([403, 404].includes(Number(error?.status))) {
          return [] as LearningAssignment[];
        }
        throw error;
      }
    },
  });

  const selectedWorkspaceAssignment = useMemo(
    () =>
      learningAssignments.find((assignment) => assignment.id === selectedWorkspaceAssignmentId) ??
      null,
    [learningAssignments, selectedWorkspaceAssignmentId]
  );

  const workspaceProgramId = selectedWorkspaceAssignment?.programVersion?.program?.id;
  const workspaceVersionId = selectedWorkspaceAssignment?.programVersion?.id;

  const { data: workspaceProgram, isLoading: workspaceProgramLoading } = useQuery({
    queryKey: ['learning-program-detail', workspaceProgramId],
    enabled: showLearningWorkspaceDialog && Boolean(workspaceProgramId),
    queryFn: () => learningDevelopmentAPI.getProgram(Number(workspaceProgramId)),
  });

  const workspaceProgramVersion = useMemo(
    () =>
      workspaceProgram?.versions.find((version) => version.id === workspaceVersionId) ?? null,
    [workspaceProgram, workspaceVersionId]
  );

  const workspaceQuizzes = useMemo(
    () => workspaceProgramVersion?.quizzes.filter((quiz) => quiz.isActive) ?? [],
    [workspaceProgramVersion]
  );

  useEffect(() => {
    if (!selectedWorkspaceAssignment || !workspaceProgramVersion) {
      setLearningAttendanceForms({});
      return;
    }

    const nextForms = Object.fromEntries(
      workspaceProgramVersion.sessions.map((session) => {
        const record = selectedWorkspaceAssignment.attendanceRecords?.find(
          (attendanceRecord) => attendanceRecord.sessionId === session.id
        );
        return [
          session.id,
          {
            attendanceStatus: record?.attendanceStatus ?? 'invited',
            notes: record?.notes ?? '',
          },
        ];
      })
    ) as Record<number, LearningAttendanceFormState>;

    setLearningAttendanceForms(nextForms);
  }, [selectedWorkspaceAssignment, workspaceProgramVersion]);

  useEffect(() => {
    if (!workspaceProgramVersion || workspaceProgramVersion.modules.length === 0) {
      setActiveWorkspaceModuleId(null);
      setActiveWorkspaceModuleOpenedAt(null);
      setWorkspaceModuleTrackingSupport({});
      return;
    }

    setWorkspaceModuleTrackingSupport({});
    setActiveWorkspaceModuleId((current) => {
      if (current && workspaceProgramVersion.modules.some((module) => module.id === current)) {
        return current;
      }

      const firstIncompleteModule = workspaceProgramVersion.modules.find((module) => {
        const progressEntry = selectedWorkspaceAssignment?.moduleProgressEntries?.find(
          (entry) => entry.moduleId === module.id
        );
        return progressEntry?.status !== "completed";
      });

      return firstIncompleteModule?.id ?? workspaceProgramVersion.modules[0]?.id ?? null;
    });
    setActiveWorkspaceModuleOpenedAt(Date.now());
  }, [selectedWorkspaceAssignment, workspaceProgramVersion]);

  useEffect(() => {
    if (!globalCertificateTemplate) {
      return;
    }
    setGlobalCertificateTemplateForm(createGlobalCertificateTemplateFormState(globalCertificateTemplate));
  }, [globalCertificateTemplate]);

  const createLearningProgramMutation = useMutation({
    mutationFn: (payload: {
      title: string;
      description?: string | null;
      status?: "draft" | "published" | "archived";
      version: LearningProgramVersionPayload;
    }) => learningDevelopmentAPI.createProgram(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['learning-programs'] });
      toast({
        title: 'Learning program created',
        description: 'The program and its first version were saved.',
      });
      setShowLearningProgramDialog(false);
      setLearningProgramForm(createLearningProgramBuilderState());
    },
    onError: (error: any) => {
      toast({
        title: 'Program creation failed',
        description: error?.message || 'Unable to create the learning program.',
        variant: 'destructive',
      });
    },
  });

  const createLearningAssignmentsMutation = useMutation({
    mutationFn: (payload: {
      programVersionId: number;
      employeeIds: number[];
      dueAt?: string | null;
    }) => learningDevelopmentAPI.createAssignments(payload),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['learning-assignments'] }),
        queryClient.invalidateQueries({ queryKey: ['learning-programs'] }),
      ]);
      toast({
        title: 'Learning assigned',
        description: 'The selected employees now have the program in their assigned learning.',
      });
      setShowLearningAssignmentDialog(false);
      setLearningAssignmentForm({
        programVersionId: '',
        dueAt: '',
        employeeIds: [],
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Assignment failed',
        description: error?.message || 'Unable to assign the learning program.',
        variant: 'destructive',
      });
    },
  });

  const issueCertificateMutation = useMutation({
    mutationFn: (assignmentId: number) => learningDevelopmentAPI.issueCertificate(assignmentId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['learning-assignments'] });
      toast({
        title: 'Certificate issued',
        description: 'The learner certificate is now available.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Certificate issuance failed',
        description: error?.message || 'Unable to issue the certificate.',
        variant: 'destructive',
      });
    },
  });

  const updateGlobalCertificateTemplateMutation = useMutation({
    mutationFn: (payload: GlobalCertificateTemplateRecord) =>
      learningDevelopmentAPI.updateGlobalCertificateTemplate(payload),
    onSuccess: async (savedTemplate) => {
      await queryClient.invalidateQueries({ queryKey: ['global-certificate-template'] });
      setGlobalCertificateTemplateForm(createGlobalCertificateTemplateFormState(savedTemplate));
      setShowGlobalCertificateTemplateDialog(false);
      toast({
        title: 'Standard certificate updated',
        description: 'Future training certificates will use the updated default template.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Template update failed',
        description: error?.message || 'Unable to update the standard certificate template.',
        variant: 'destructive',
      });
    },
  });

  const submitLearningFeedbackMutation = useMutation({
    mutationFn: (payload: {
      assignmentId: number;
      overallRating: number;
      contentRating: number;
      deliveryRating: number;
      relevanceRating: number;
      comment: string;
    }) =>
      learningDevelopmentAPI.submitFeedback(payload.assignmentId, {
        overallRating: payload.overallRating,
        contentRating: payload.contentRating,
        deliveryRating: payload.deliveryRating,
        relevanceRating: payload.relevanceRating,
        comment: payload.comment,
      }),
    onSuccess: async (result: any) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['learning-assignments'] }),
        queryClient.invalidateQueries({ queryKey: ['learning-points'] }),
      ]);
      toast({
        title: 'Feedback submitted',
        description: result?.certificate
          ? 'Your feedback was recorded and your certificate has been issued.'
          : 'Your trainer feedback has been recorded.',
      });
      setShowLearningFeedbackDialog(false);
      setSelectedFeedbackAssignment(null);
      setLearningFeedbackForm(createLearningFeedbackFormState());
    },
    onError: (error: any) => {
      toast({
        title: 'Feedback submission failed',
        description: error?.message || 'Unable to submit trainer feedback.',
        variant: 'destructive',
      });
    },
  });

  const submitImpactAssessmentMutation = useMutation({
    mutationFn: (payload: {
      taskId: number;
      behaviorChangeScore?: number | null;
      productivityImpactScore?: number | null;
      qualityImpactScore?: number | null;
      businessImpactScore?: number | null;
      comment?: string | null;
    }) =>
      learningDevelopmentAPI.submitImpactResponse(payload.taskId, {
        behaviorChangeScore: payload.behaviorChangeScore,
        productivityImpactScore: payload.productivityImpactScore,
        qualityImpactScore: payload.qualityImpactScore,
        businessImpactScore: payload.businessImpactScore,
        comment: payload.comment,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['learning-assignments'] });
      toast({
        title: 'Impact assessment submitted',
        description: 'The training impact review has been saved.',
      });
      setShowImpactAssessmentDialog(false);
      setSelectedImpactAssignment(null);
      setLearningImpactAssessmentForm(createLearningImpactAssessmentFormState());
    },
    onError: (error: any) => {
      toast({
        title: 'Impact submission failed',
        description: error?.message || 'Unable to submit the impact assessment.',
        variant: 'destructive',
      });
    },
  });

  const updateLearningModuleProgressMutation = useMutation({
    mutationFn: (payload: {
      assignmentId: number;
      moduleId: number;
      completionPercent?: number;
      watchPercent?: number;
      scrollPercent?: number;
      timeSpentSeconds?: number;
      completed?: boolean;
    }) =>
      learningDevelopmentAPI.updateModuleProgress(payload.assignmentId, payload.moduleId, {
        completionPercent: payload.completionPercent,
        watchPercent: payload.watchPercent,
        scrollPercent: payload.scrollPercent,
        timeSpentSeconds: payload.timeSpentSeconds,
        completed: payload.completed,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['learning-assignments'] });
      toast({
        title: 'Module progress updated',
        description: 'The learning tracker has been refreshed.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Module update failed',
        description: error?.message || 'Unable to update module progress.',
        variant: 'destructive',
      });
    },
  });

  const markLearningAttendanceMutation = useMutation({
    mutationFn: (payload: {
      sessionId: number;
      assignmentId: number;
      attendanceStatus: 'invited' | 'attended' | 'missed' | 'excused';
      notes?: string | null;
    }) =>
      learningDevelopmentAPI.markAttendance(payload.sessionId, {
        records: [
          {
            assignmentId: payload.assignmentId,
            attendanceStatus: payload.attendanceStatus,
            notes: payload.notes,
          },
        ],
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['learning-assignments'] }),
        queryClient.invalidateQueries({ queryKey: ['learning-points'] }),
      ]);
      toast({
        title: 'Attendance updated',
        description: 'The live-session attendance record has been saved.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Attendance update failed',
        description: error?.message || 'Unable to save session attendance.',
        variant: 'destructive',
      });
    },
  });

  const bulkMarkLearningAttendanceMutation = useMutation({
    mutationFn: (payload: {
      sessionId: number;
      records: Array<{
        assignmentId: number;
        attendanceStatus: 'invited' | 'attended' | 'missed' | 'excused';
        notes?: string | null;
      }>;
    }) => learningDevelopmentAPI.markAttendance(payload.sessionId, { records: payload.records }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['learning-assignments'] }),
        queryClient.invalidateQueries({ queryKey: ['learning-assignments-bulk'] }),
        queryClient.invalidateQueries({ queryKey: ['learning-points'] }),
      ]);
      toast({
        title: 'Bulk attendance saved',
        description: 'Attendance has been updated for the selected session roster.',
      });
      setShowLearningAttendanceDialog(false);
      setDefaultAttendanceVersionId('');
    },
    onError: (error: any) => {
      toast({
        title: 'Bulk attendance failed',
        description: error?.message || 'Unable to save bulk attendance.',
        variant: 'destructive',
      });
    },
  });

  const submitLearningQuizAttemptMutation = useMutation({
    mutationFn: (payload: {
      quizId: number;
      assignmentId: number;
      answers: Array<{
        questionId: number;
        optionIds?: number[];
        freeTextAnswer?: string | null;
      }>;
    }) => learningDevelopmentAPI.submitQuizAttempt(payload.quizId, payload),
    onSuccess: async (result: any) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['learning-assignments'] }),
        queryClient.invalidateQueries({ queryKey: ['learning-points'] }),
      ]);
      toast({
        title: result?.passed ? 'Quiz passed' : 'Quiz submitted',
        description: result?.passed
          ? 'The learner passed the training quiz.'
          : 'The attempt was recorded.',
      });
      if (result?.passed) {
        setLearningQuizAnswers({});
      }
    },
    onError: (error: any) => {
      toast({
        title: 'Quiz submission failed',
        description: error?.message || 'Unable to submit the learning quiz.',
        variant: 'destructive',
      });
    },
  });

  const fetchStaffDevelopmentData = async () => {
    try {
      setLoading(true);
      const token = getToken();
      if (!token) {
        setTrainingRecords([]);
        setCertifications([]);
        setSkillAssessments([]);
        setMetrics(null);
        return;
      }
      
      const [
        trainingRes,
        certificationsRes,
        skillsRes,
        metricsRes
      ] = await Promise.all([
        fetch(`${apiBaseUrl}/team-management/training-records?employee=${encodeURIComponent(selectedEmployee)}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${apiBaseUrl}/team-management/certifications?employee=${encodeURIComponent(selectedEmployee)}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${apiBaseUrl}/team-management/skill-assessments?employee=${encodeURIComponent(selectedEmployee)}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${apiBaseUrl}/team-management/development-metrics`, {
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
      'assigned': { color: 'bg-slate-100 text-slate-800', text: 'Assigned' },
      'overdue': { color: 'bg-red-100 text-red-800', text: 'Overdue' },
      'active': { color: 'bg-green-100 text-green-800', text: 'Active' },
      'expired': { color: 'bg-red-100 text-red-800', text: 'Expired' },
      'expiring_soon': { color: 'bg-yellow-100 text-yellow-800', text: 'Expiring Soon' },
      'cancelled': { color: 'bg-red-100 text-red-800', text: 'Cancelled' },
      'paused': { color: 'bg-orange-100 text-orange-800', text: 'Paused' },
      'pending': { color: 'bg-amber-100 text-amber-800', text: 'Pending' },
      'submitted': { color: 'bg-green-100 text-green-800', text: 'Submitted' },
      'invited': { color: 'bg-slate-100 text-slate-800', text: 'Invited' },
      'attended': { color: 'bg-green-100 text-green-800', text: 'Attended' },
      'missed': { color: 'bg-red-100 text-red-800', text: 'Missed' },
      'excused': { color: 'bg-yellow-100 text-yellow-800', text: 'Excused' },
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

      const response = await fetch(`${apiBaseUrl}/team-management/training-records`, {
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

  const toggleAssignmentEmployee = (employeeId: number, checked: boolean) => {
    setLearningAssignmentForm((prev) => ({
      ...prev,
      employeeIds: checked
        ? Array.from(new Set([...prev.employeeIds, employeeId]))
        : prev.employeeIds.filter((id) => id !== employeeId),
    }));
  };

  const openLearningProgramDialog = () => {
    setLearningProgramForm(createLearningProgramBuilderState());
    setShowLearningProgramDialog(true);
  };

  const openGlobalCertificateTemplateDialog = () => {
    setGlobalCertificateTemplateForm(
      createGlobalCertificateTemplateFormState(globalCertificateTemplate)
    );
    setShowGlobalCertificateTemplateDialog(true);
  };

  const openLearningAssignmentDialog = (programVersionId?: number) => {
    setLearningAssignmentForm({
      programVersionId: programVersionId ? String(programVersionId) : '',
      dueAt: '',
      employeeIds: [],
    });
    setShowLearningAssignmentDialog(true);
  };

  const openLearningAttendanceDialog = (programVersionId?: number) => {
    setDefaultAttendanceVersionId(programVersionId ? String(programVersionId) : '');
    setShowLearningAttendanceDialog(true);
  };

  const openLearningFeedbackDialog = (assignment: LearningAssignment) => {
    setSelectedFeedbackAssignment(assignment);
    setLearningFeedbackForm(createLearningFeedbackFormState());
    setShowLearningFeedbackDialog(true);
  };

  const openImpactAssessmentDialog = (assignment: LearningAssignment) => {
    setSelectedImpactAssignment(assignment);
    setLearningImpactAssessmentForm(createLearningImpactAssessmentFormState());
    setShowImpactAssessmentDialog(true);
  };

  const validateLearningProgramBuilder = () => {
    if (!learningProgramForm.title.trim()) {
      return 'Program title is required.';
    }

    const namedModules = learningProgramForm.modules.filter((module) => module.title.trim());
    if (namedModules.length === 0) {
      return 'Add at least one training module.';
    }

    for (const [index, module] of namedModules.entries()) {
      if (module.contentType === 'knowledge_resource' && !module.knowledgeHubResourceId) {
        return `Module ${index + 1} must reference a Knowledge Hub resource.`;
      }
      if (
        (module.contentType === 'video' || module.contentType === 'document' || module.contentType === 'link') &&
        !module.contentUrl.trim()
      ) {
        return `Module ${index + 1} needs a content URL.`;
      }
    }

    for (const [index, session] of learningProgramForm.sessions.entries()) {
      if (!session.title.trim()) {
        return `Session ${index + 1} needs a title.`;
      }
      if (!session.startsAt || !session.endsAt) {
        return `Session ${index + 1} needs both start and end times.`;
      }
      if (session.moduleFormId && !namedModules.some((module) => module.id === session.moduleFormId)) {
        return `Session ${index + 1} is linked to an unknown module.`;
      }
    }

    for (const [quizIndex, quiz] of learningProgramForm.quizzes.entries()) {
      if (!quiz.title.trim()) {
        return `Quiz ${quizIndex + 1} needs a title.`;
      }

      if (quiz.moduleFormId && !namedModules.some((module) => module.id === quiz.moduleFormId)) {
        return `Quiz ${quizIndex + 1} is linked to an unknown module.`;
      }

      if (quiz.questions.length === 0) {
        return `Quiz ${quizIndex + 1} needs at least one question.`;
      }

      for (const [index, question] of quiz.questions.entries()) {
        if (!question.prompt.trim()) {
          return `Quiz ${quizIndex + 1}, question ${index + 1} needs a prompt.`;
        }
        if (question.questionType === 'short_text') {
          continue;
        }
        const validOptions = question.options.filter((option) => option.label.trim());
        if (validOptions.length < 2) {
          return `Quiz ${quizIndex + 1}, question ${index + 1} needs at least two options.`;
        }
        const correctOptions = validOptions.filter((option) => option.isCorrect);
        if (question.questionType === 'multiple_choice') {
          if (correctOptions.length === 0) {
            return `Quiz ${quizIndex + 1}, question ${index + 1} needs at least one correct option.`;
          }
        } else if (correctOptions.length !== 1) {
          return `Quiz ${quizIndex + 1}, question ${index + 1} must have exactly one correct option.`;
        }
      }
    }

    if (learningProgramForm.certificateEnabled && !learningProgramForm.certificateName.trim()) {
      return 'Certificate name is required when certificate generation is enabled.';
    }

    return null;
  };

  const buildLearningProgramPayload = () => {
    const versionTitle =
      learningProgramForm.versionTitle.trim() || `${learningProgramForm.title.trim()} v1`;
    const namedModules = learningProgramForm.modules.filter((module) => module.title.trim());
    const moduleSequenceByFormId = new Map(
      namedModules.map((module, index) => [module.id, index + 1] as const)
    );

    const version: LearningProgramVersionPayload = {
      title: versionTitle,
      description: learningProgramForm.description.trim() || null,
      trainingType: learningProgramForm.trainingType,
      deliveryMode: learningProgramForm.deliveryMode.trim() || null,
      provider: learningProgramForm.provider.trim() || null,
      trainerProfileId: learningProgramForm.trainerProfileId
        ? Number(learningProgramForm.trainerProfileId)
        : null,
      externalTrainerName: learningProgramForm.externalTrainerName.trim() || null,
      isMandatory: learningProgramForm.isMandatory,
      feedbackPoints: Number(learningProgramForm.feedbackPoints || 0),
      impactAssessmentDelayDays: learningProgramForm.impactAssessmentDelayDays
        ? Number(learningProgramForm.impactAssessmentDelayDays)
        : null,
      status: learningProgramForm.versionStatus,
      publishedAt:
        learningProgramForm.versionStatus === 'published' ? new Date().toISOString() : null,
      modules: namedModules.map((module, index) => ({
          title: module.title.trim(),
          description: module.description.trim() || null,
          contentType: module.contentType,
          knowledgeHubResourceId: module.knowledgeHubResourceId
            ? Number(module.knowledgeHubResourceId)
            : null,
          contentUrl: module.contentUrl.trim() || null,
          sequenceNo: index + 1,
          required: module.required,
          estimatedMinutes: module.estimatedMinutes ? Number(module.estimatedMinutes) : null,
        })),
      sessions: learningProgramForm.sessions.map((session) => ({
        title: session.title.trim(),
        startsAt: new Date(session.startsAt).toISOString(),
        endsAt: new Date(session.endsAt).toISOString(),
        location: session.location.trim() || null,
        trainerProfileId: learningProgramForm.trainerProfileId
          ? Number(learningProgramForm.trainerProfileId)
          : null,
        externalTrainerName: learningProgramForm.externalTrainerName.trim() || null,
        attendancePoints: Number(session.attendancePoints || 0),
        attendanceRequired: session.attendanceRequired,
        moduleSequenceNo: session.moduleFormId
          ? moduleSequenceByFormId.get(session.moduleFormId) ?? null
          : null,
      })),
      quizzes: learningProgramForm.quizzes.map((quiz) => ({
        title: quiz.title.trim(),
        instructions: quiz.instructions.trim() || null,
        passMark: Number(quiz.passMark || 0),
        pointsOnPass: Number(quiz.pointsOnPass || 0),
        attemptLimit: quiz.attemptLimit ? Number(quiz.attemptLimit) : null,
        isMandatory: quiz.isMandatory,
        isActive: quiz.isActive,
        moduleSequenceNo: quiz.moduleFormId ? moduleSequenceByFormId.get(quiz.moduleFormId) ?? null : null,
        questions: quiz.questions.map((question, questionIndex) => ({
          questionType: question.questionType,
          prompt: question.prompt.trim(),
          displayOrder: questionIndex + 1,
          required: question.required,
          explanation: question.explanation.trim() || null,
          options:
            question.questionType === 'short_text'
              ? []
              : question.options
                  .filter((option) => option.label.trim())
                  .map((option, optionIndex) => ({
                    label: option.label.trim(),
                    isCorrect: option.isCorrect,
                    displayOrder: optionIndex + 1,
                  })),
        })),
      })),
      certificateTemplate: learningProgramForm.certificateEnabled
        ? {
            name: learningProgramForm.certificateName.trim(),
            issuedByLabel: learningProgramForm.certificateIssuedBy.trim() || null,
            backgroundDocumentId: learningProgramForm.certificateBackgroundDocumentId
              ? Number(learningProgramForm.certificateBackgroundDocumentId)
              : null,
            signatureDocumentId: learningProgramForm.certificateSignatureDocumentId
              ? Number(learningProgramForm.certificateSignatureDocumentId)
              : null,
            templateDefinition: {
              title: learningProgramForm.certificateTitle.trim() || 'Certificate of Completion',
              body:
                learningProgramForm.certificateBody.trim() ||
                `has successfully completed the training "${versionTitle}".`,
            },
            isDefault: true,
          }
        : null,
    };

    return {
      title: learningProgramForm.title.trim(),
      description: learningProgramForm.description.trim() || null,
      status: learningProgramForm.status,
      version,
    };
  };

  const handleCreateLearningProgram = () => {
    const validationError = validateLearningProgramBuilder();
    if (validationError) {
      toast({
        title: 'Learning program incomplete',
        description: validationError,
        variant: 'destructive',
      });
      return;
    }

    createLearningProgramMutation.mutate(buildLearningProgramPayload());
  };

  const handleSaveGlobalCertificateTemplate = () => {
    if (!globalCertificateTemplateForm.name.trim()) {
      toast({
        title: 'Template name required',
        description: 'Provide a name for the standard certificate template.',
        variant: 'destructive',
      });
      return;
    }

    if (!globalCertificateTemplateForm.title.trim()) {
      toast({
        title: 'Certificate title required',
        description: 'Provide the certificate title shown at the top of the document.',
        variant: 'destructive',
      });
      return;
    }

    updateGlobalCertificateTemplateMutation.mutate({
      name: globalCertificateTemplateForm.name.trim(),
      issuedByLabel: globalCertificateTemplateForm.issuedByLabel.trim() || null,
      backgroundDocumentId: globalCertificateTemplateForm.backgroundDocumentId
        ? Number(globalCertificateTemplateForm.backgroundDocumentId)
        : null,
      signatureDocumentId: globalCertificateTemplateForm.signatureDocumentId
        ? Number(globalCertificateTemplateForm.signatureDocumentId)
        : null,
      isActive: globalCertificateTemplateForm.isActive,
      templateDefinition: {
        title: globalCertificateTemplateForm.title.trim(),
        body:
          globalCertificateTemplateForm.body.trim() ||
          'has successfully completed the training "{{trainingName}}".',
      },
    });
  };

  const handleAssignLearningProgram = () => {
    if (!learningAssignmentForm.programVersionId) {
      toast({
        title: 'Select a published version',
        description: 'Choose which published learning version to assign.',
        variant: 'destructive',
      });
      return;
    }

    if (learningAssignmentForm.employeeIds.length === 0) {
      toast({
        title: 'Select employees',
        description: 'Pick at least one employee for this assignment.',
        variant: 'destructive',
      });
      return;
    }

    createLearningAssignmentsMutation.mutate({
      programVersionId: Number(learningAssignmentForm.programVersionId),
      employeeIds: learningAssignmentForm.employeeIds,
      dueAt: learningAssignmentForm.dueAt
        ? new Date(learningAssignmentForm.dueAt).toISOString()
        : null,
    });
  };

  const handleSubmitBulkAttendance = (payload: {
    sessionId: number;
    records: Array<{
      assignmentId: number;
      attendanceStatus: 'invited' | 'attended' | 'missed' | 'excused';
      notes?: string | null;
    }>;
  }) => {
    if (payload.records.length === 0) {
      toast({
        title: 'No learners to update',
        description: 'This session has no assigned learners yet.',
        variant: 'destructive',
      });
      return;
    }

    bulkMarkLearningAttendanceMutation.mutate(payload);
  };

  const handleSubmitLearningFeedback = () => {
    if (!selectedFeedbackAssignment) {
      return;
    }
    if (!learningFeedbackForm.comment.trim()) {
      toast({
        title: 'Add feedback comments',
        description: 'Include a short comment so the trainer feedback is meaningful.',
        variant: 'destructive',
      });
      return;
    }

    submitLearningFeedbackMutation.mutate({
      assignmentId: selectedFeedbackAssignment.id,
      overallRating: Number(learningFeedbackForm.overallRating),
      contentRating: Number(learningFeedbackForm.contentRating),
      deliveryRating: Number(learningFeedbackForm.deliveryRating),
      relevanceRating: Number(learningFeedbackForm.relevanceRating),
      comment: learningFeedbackForm.comment.trim(),
    });
  };

  const handleSubmitImpactAssessment = () => {
    const taskId = selectedImpactAssignment?.impactAssessmentTask?.id;
    if (!taskId) {
      return;
    }

    const hasAnyScore = [
      learningImpactAssessmentForm.behaviorChangeScore,
      learningImpactAssessmentForm.productivityImpactScore,
      learningImpactAssessmentForm.qualityImpactScore,
      learningImpactAssessmentForm.businessImpactScore,
    ].some((value) => value !== '');

    if (!hasAnyScore && !learningImpactAssessmentForm.comment.trim()) {
      toast({
        title: 'Impact assessment incomplete',
        description: 'Provide at least one score or a short impact comment.',
        variant: 'destructive',
      });
      return;
    }

    submitImpactAssessmentMutation.mutate({
      taskId,
      behaviorChangeScore: learningImpactAssessmentForm.behaviorChangeScore
        ? Number(learningImpactAssessmentForm.behaviorChangeScore)
        : null,
      productivityImpactScore: learningImpactAssessmentForm.productivityImpactScore
        ? Number(learningImpactAssessmentForm.productivityImpactScore)
        : null,
      qualityImpactScore: learningImpactAssessmentForm.qualityImpactScore
        ? Number(learningImpactAssessmentForm.qualityImpactScore)
        : null,
      businessImpactScore: learningImpactAssessmentForm.businessImpactScore
        ? Number(learningImpactAssessmentForm.businessImpactScore)
        : null,
      comment: learningImpactAssessmentForm.comment.trim() || null,
    });
  };

  const canSubmitImpactAssessment = (assignment: LearningAssignment) =>
    Boolean(
      assignment.impactAssessmentTask &&
        !assignment.impactAssessmentTask.response &&
        (profile?.id === assignment.managerProfileId ||
          hasRole('super_admin') ||
          hasRole('hr') ||
          hasRole('gmp') ||
          hasRole('partner'))
    );

  const openLearningWorkspace = (assignmentId: number) => {
    setSelectedWorkspaceAssignmentId(assignmentId);
    setLearningQuizAnswers({});
    setShowLearningWorkspaceDialog(true);
  };

  const closeLearningWorkspace = () => {
    setShowLearningWorkspaceDialog(false);
    setSelectedWorkspaceAssignmentId(null);
    setLearningQuizAnswers({});
    setActiveWorkspaceModuleId(null);
    setActiveWorkspaceModuleOpenedAt(null);
    setWorkspaceModuleTrackingSupport({});
  };

  const activateWorkspaceModule = (moduleId: number) => {
    setActiveWorkspaceModuleId(moduleId);
    setActiveWorkspaceModuleOpenedAt(Date.now());
  };

  const updateLearningQuizAnswer = (
    questionId: number,
    updater: (current: LearningQuizAnswerFormState) => LearningQuizAnswerFormState
  ) => {
    setLearningQuizAnswers((prev) => ({
      ...prev,
      [questionId]: updater(prev[questionId] ?? { optionIds: [], freeTextAnswer: '' }),
    }));
  };

  const toggleLearningQuizOption = (
    questionId: number,
    optionId: number,
    checked: boolean,
    questionType: LearningQuizQuestionRecord['questionType']
  ) => {
    updateLearningQuizAnswer(questionId, (current) => {
      if (questionType === 'multiple_choice') {
        const optionIds = checked
          ? Array.from(new Set([...current.optionIds, optionId]))
          : current.optionIds.filter((id) => id !== optionId);
        return { ...current, optionIds };
      }
      return {
        ...current,
        optionIds: checked ? [optionId] : [],
      };
    });
  };

  const handleUpdateWorkspaceModuleProgress = (moduleId: number, completed: boolean) => {
    if (!selectedWorkspaceAssignment) {
      return;
    }

    updateLearningModuleProgressMutation.mutate({
      assignmentId: selectedWorkspaceAssignment.id,
      moduleId,
      completionPercent: completed ? 100 : 25,
      timeSpentSeconds: completed ? 300 : 60,
      completed,
    });
  };

  const handleWorkspaceModuleTrackingProgress = (
    moduleId: number,
    progress: TrackedContentProgress
  ) => {
    if (!selectedWorkspaceAssignment) {
      return;
    }

    const completionPercent = Math.max(
      Number(progress.scrollPercent || 0),
      Number(progress.watchPercent || 0),
      progress.completed ? 100 : 0
    );

    updateLearningModuleProgressMutation.mutate({
      assignmentId: selectedWorkspaceAssignment.id,
      moduleId,
      completionPercent: completionPercent > 0 ? completionPercent : undefined,
      scrollPercent: progress.scrollPercent,
      watchPercent: progress.watchPercent,
      timeSpentSeconds: activeWorkspaceModuleOpenedAt
        ? Math.max(1, Math.floor((Date.now() - activeWorkspaceModuleOpenedAt) / 1000))
        : undefined,
      completed: progress.completed,
    });
  };

  const updateLearningAttendanceForm = (
    sessionId: number,
    updater: (current: LearningAttendanceFormState) => LearningAttendanceFormState
  ) => {
    setLearningAttendanceForms((prev) => ({
      ...prev,
      [sessionId]: updater(
        prev[sessionId] ?? {
          attendanceStatus: 'invited',
          notes: '',
        }
      ),
    }));
  };

  const handleSaveSessionAttendance = (sessionId: number) => {
    if (!selectedWorkspaceAssignment) {
      return;
    }

    const form = learningAttendanceForms[sessionId] ?? {
      attendanceStatus: 'invited' as const,
      notes: '',
    };

    markLearningAttendanceMutation.mutate({
      sessionId,
      assignmentId: selectedWorkspaceAssignment.id,
      attendanceStatus: form.attendanceStatus,
      notes: form.notes.trim() || null,
    });
  };

  const handleSubmitWorkspaceQuiz = (quiz: LearningQuizRecord) => {
    if (!selectedWorkspaceAssignment) {
      return;
    }

    for (const question of quiz.questions) {
      const currentAnswer = learningQuizAnswers[question.id];
      const hasAnswer =
        question.questionType === 'short_text'
          ? Boolean(currentAnswer?.freeTextAnswer?.trim())
          : Boolean(currentAnswer?.optionIds?.length);

      if (question.required && !hasAnswer) {
        toast({
          title: 'Quiz incomplete',
          description: 'Answer all required quiz questions before submitting.',
          variant: 'destructive',
        });
        return;
      }
    }

    submitLearningQuizAttemptMutation.mutate({
      quizId: quiz.id,
      assignmentId: selectedWorkspaceAssignment.id,
      answers: quiz.questions.map((question) => {
        const currentAnswer = learningQuizAnswers[question.id];
        return {
          questionId: question.id,
          optionIds: currentAnswer?.optionIds ?? [],
          freeTextAnswer:
            question.questionType === 'short_text'
              ? currentAnswer?.freeTextAnswer?.trim() || null
              : null,
        };
      }),
    });
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

  const assignedLearningSummary = useMemo(() => {
    const total = learningAssignments.length;
    const completed = learningAssignments.filter((assignment) => assignment.status === 'completed').length;
    const inProgress = learningAssignments.filter((assignment) => assignment.status === 'in_progress').length;
    const overdue = learningAssignments.filter((assignment) => assignment.status === 'overdue').length;
    const certificates = learningAssignments.filter((assignment) => assignment.certificate).length;
    const feedbackSubmitted = learningAssignments.filter((assignment) => assignment.trainingFeedback).length;

    return {
      total,
      completed,
      inProgress,
      overdue,
      certificates,
      feedbackSubmitted,
    };
  }, [learningAssignments]);

  const recentLearningPoints = useMemo(
    () => (learningPoints?.entries || []).slice(0, 6),
    [learningPoints]
  );

  const employeeOptions = useMemo(() => employeesResponse?.data || [], [employeesResponse]);
  const learningResourceOptions = useMemo(
    () => learningKnowledgeResources?.resources || [],
    [learningKnowledgeResources]
  );
  const certificateAssetOptions = useMemo(
    () =>
      (certificateAssetDocuments?.documents || [])
        .filter((document) => {
          const mime = String(document.mimeType || '').toLowerCase();
          return mime.startsWith('image/');
        })
        .map((document) => ({
          id: document.id,
          label: document.description?.trim() || document.fileName,
        })),
    [certificateAssetDocuments]
  );

  const publishedLearningVersions = useMemo(
    () =>
      learningPrograms.flatMap((program) =>
        program.versions
          .filter((version) => version.status === 'published')
          .map((version) => ({
            ...version,
            programTitle: program.title,
          }))
      ),
    [learningPrograms]
  );

  const attendanceEnabledLearningVersions = useMemo(
    () => publishedLearningVersions.filter((version) => version.sessions.length > 0),
    [publishedLearningVersions]
  );

  if (loading) {
    return (
      <DashboardLayout>
        <PageLoader message="Loading..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
	      <div className="min-w-0 max-w-full space-y-6 overflow-x-hidden p-4 sm:p-6">
        {/* Header */}
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Staff Development</h1>
            <p className="mt-1 max-w-2xl text-gray-600">
              Manage training, certifications, and career development
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 xl:justify-end">
            {canManageLearning && (
              <>
                <Button size="sm" variant="outline" onClick={openGlobalCertificateTemplateDialog}>
                  <Award className="w-4 h-4 mr-2" />
                  Standard Certificate
                </Button>
                <Button size="sm" variant="outline" onClick={openLearningProgramDialog}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Program
                </Button>
                <Button size="sm" onClick={() => openLearningAssignmentDialog()}>
                  <Users className="w-4 h-4 mr-2" />
                  Assign Program
                </Button>
                <Button size="sm" variant="outline" onClick={() => openLearningAttendanceDialog()}>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Mark Attendance
                </Button>
              </>
            )}
            <Dialog open={showNewTraining} onOpenChange={setShowNewTraining}>
              <DialogTrigger asChild>
                <Button size="sm">
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
            {canManageLearning && (
              <>
                <Dialog
                  open={showGlobalCertificateTemplateDialog}
                  onOpenChange={(open) => {
                    setShowGlobalCertificateTemplateDialog(open);
                    if (!open) {
                      setGlobalCertificateTemplateForm(
                        createGlobalCertificateTemplateFormState(globalCertificateTemplate)
                      );
                    }
                  }}
                >
                  <DialogContent className="max-h-[85vh] w-[95vw] max-w-3xl overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Standard Certificate Template</DialogTitle>
                      <DialogDescription>
                        This template is used automatically by trainings that do not define their
                        own certificate override.
                      </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Template Name</label>
                          <Input
                            value={globalCertificateTemplateForm.name}
                            onChange={(event) =>
                              setGlobalCertificateTemplateForm((prev) => ({
                                ...prev,
                                name: event.target.value,
                              }))
                            }
                            placeholder="Standard Completion Certificate"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Issued By Label</label>
                          <Input
                            value={globalCertificateTemplateForm.issuedByLabel}
                            onChange={(event) =>
                              setGlobalCertificateTemplateForm((prev) => ({
                                ...prev,
                                issuedByLabel: event.target.value,
                              }))
                            }
                            placeholder="HR Department"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Certificate Title</label>
                          <Input
                            value={globalCertificateTemplateForm.title}
                            onChange={(event) =>
                              setGlobalCertificateTemplateForm((prev) => ({
                                ...prev,
                                title: event.target.value,
                              }))
                            }
                            placeholder="Certificate of Completion"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Background Asset</label>
                          <Select
                            value={
                              globalCertificateTemplateForm.backgroundDocumentId || "__none__"
                            }
                            onValueChange={(value) =>
                              setGlobalCertificateTemplateForm((prev) => ({
                                ...prev,
                                backgroundDocumentId: value === "__none__" ? "" : value,
                              }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Choose background" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">No background</SelectItem>
                              {certificateAssetOptions.map((document) => (
                                <SelectItem key={`global-bg-${document.id}`} value={String(document.id)}>
                                  {document.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Signature Asset</label>
                          <Select
                            value={
                              globalCertificateTemplateForm.signatureDocumentId || "__none__"
                            }
                            onValueChange={(value) =>
                              setGlobalCertificateTemplateForm((prev) => ({
                                ...prev,
                                signatureDocumentId: value === "__none__" ? "" : value,
                              }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Choose signature" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">No signature</SelectItem>
                              {certificateAssetOptions.map((document) => (
                                <SelectItem key={`global-sign-${document.id}`} value={String(document.id)}>
                                  {document.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Template Status</label>
                          <Select
                            value={globalCertificateTemplateForm.isActive ? "active" : "inactive"}
                            onValueChange={(value) =>
                              setGlobalCertificateTemplateForm((prev) => ({
                                ...prev,
                                isActive: value === "active",
                              }))
                            }
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

                      <div className="space-y-2">
                        <label className="text-sm font-medium">Certificate Body</label>
                        <Textarea
                          rows={5}
                          value={globalCertificateTemplateForm.body}
                          onChange={(event) =>
                            setGlobalCertificateTemplateForm((prev) => ({
                              ...prev,
                              body: event.target.value,
                            }))
                          }
                          placeholder='has successfully completed the training "{{trainingName}}".'
                        />
                        <p className="text-xs text-muted-foreground">
                          Use <code>{"{{trainingName}}"}</code> for the training name. The learner
                          name is filled automatically by the system.
                        </p>
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                        This standard certificate is applied immediately to trainings that rely on
                        the shared template instead of a program-specific override.
                      </div>
                    </div>

                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setShowGlobalCertificateTemplateDialog(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleSaveGlobalCertificateTemplate}
                        disabled={updateGlobalCertificateTemplateMutation.isPending}
                      >
                        Save Template
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                <LearningProgramDialog
                  open={showLearningProgramDialog}
                  onOpenChange={setShowLearningProgramDialog}
                  form={learningProgramForm}
                  setForm={setLearningProgramForm}
                  employeeOptions={employeeOptions}
                  learningResourceOptions={learningResourceOptions}
                  certificateAssetOptions={certificateAssetOptions}
                  onSubmit={handleCreateLearningProgram}
                  isSubmitting={createLearningProgramMutation.isPending}
                />
                <LearningAssignmentDialog
                  open={showLearningAssignmentDialog}
                  onOpenChange={setShowLearningAssignmentDialog}
                  form={learningAssignmentForm}
                  setForm={setLearningAssignmentForm}
                  publishedVersions={publishedLearningVersions}
                  employeeOptions={employeeOptions}
                  onToggleEmployee={toggleAssignmentEmployee}
                  onSubmit={handleAssignLearningProgram}
                  isSubmitting={createLearningAssignmentsMutation.isPending}
                />
                <LearningAttendanceBulkDialog
                  open={showLearningAttendanceDialog}
                  onOpenChange={(open) => {
                    setShowLearningAttendanceDialog(open);
                    if (!open) {
                      setDefaultAttendanceVersionId('');
                    }
                  }}
                  defaultProgramVersionId={defaultAttendanceVersionId}
                  publishedVersions={attendanceEnabledLearningVersions}
                  assignments={manageableLearningAssignments}
                  onSubmit={handleSubmitBulkAttendance}
                  isSubmitting={bulkMarkLearningAttendanceMutation.isPending}
                />
              </>
            )}
            <Dialog
              open={showLearningFeedbackDialog}
              onOpenChange={(open) => {
                setShowLearningFeedbackDialog(open);
                if (!open) {
                  setSelectedFeedbackAssignment(null);
                  setLearningFeedbackForm(createLearningFeedbackFormState());
                }
              }}
            >
              <DialogContent className="max-h-[85vh] w-[95vw] max-w-2xl overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Training Feedback</DialogTitle>
                  <DialogDescription>
                    Share feedback on{' '}
                    {selectedFeedbackAssignment?.programVersion?.title ||
                      selectedFeedbackAssignment?.programVersion?.program?.title ||
                      'this training'}
                    .
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Overall Rating</label>
                      <Select
                        value={learningFeedbackForm.overallRating}
                        onValueChange={(value) =>
                          setLearningFeedbackForm((prev) => ({
                            ...prev,
                            overallRating: value,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ratingScaleOptions.map((value) => (
                            <SelectItem key={`overall-${value}`} value={String(value)}>
                              {value} / 5
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Content Rating</label>
                      <Select
                        value={learningFeedbackForm.contentRating}
                        onValueChange={(value) =>
                          setLearningFeedbackForm((prev) => ({
                            ...prev,
                            contentRating: value,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ratingScaleOptions.map((value) => (
                            <SelectItem key={`content-${value}`} value={String(value)}>
                              {value} / 5
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Delivery Rating</label>
                      <Select
                        value={learningFeedbackForm.deliveryRating}
                        onValueChange={(value) =>
                          setLearningFeedbackForm((prev) => ({
                            ...prev,
                            deliveryRating: value,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ratingScaleOptions.map((value) => (
                            <SelectItem key={`delivery-${value}`} value={String(value)}>
                              {value} / 5
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Relevance Rating</label>
                      <Select
                        value={learningFeedbackForm.relevanceRating}
                        onValueChange={(value) =>
                          setLearningFeedbackForm((prev) => ({
                            ...prev,
                            relevanceRating: value,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ratingScaleOptions.map((value) => (
                            <SelectItem key={`relevance-${value}`} value={String(value)}>
                              {value} / 5
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Comments</label>
                    <Textarea
                      rows={4}
                      placeholder="What worked well, what should improve, and how relevant was the training?"
                      value={learningFeedbackForm.comment}
                      onChange={(event) =>
                        setLearningFeedbackForm((prev) => ({
                          ...prev,
                          comment: event.target.value,
                        }))
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Comments help the trainer improve delivery and are used for feedback-point awards.
                    </p>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <Button variant="outline" onClick={() => setShowLearningFeedbackDialog(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSubmitLearningFeedback}
                    disabled={submitLearningFeedbackMutation.isPending}
                  >
                    Submit Feedback
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog
              open={showImpactAssessmentDialog}
              onOpenChange={(open) => {
                setShowImpactAssessmentDialog(open);
                if (!open) {
                  setSelectedImpactAssignment(null);
                  setLearningImpactAssessmentForm(createLearningImpactAssessmentFormState());
                }
              }}
            >
              <DialogContent className="max-h-[85vh] w-[95vw] max-w-2xl overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Impact Assessment</DialogTitle>
                  <DialogDescription>
                    Assess the impact of{' '}
                    {selectedImpactAssignment?.programVersion?.title ||
                      selectedImpactAssignment?.programVersion?.program?.title ||
                      'this training'}{' '}
                    on {formatPersonName(selectedImpactAssignment?.employee)}.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Behavior Change</label>
                      <Select
                        value={learningImpactAssessmentForm.behaviorChangeScore || 'none'}
                        onValueChange={(value) =>
                          setLearningImpactAssessmentForm((prev) => ({
                            ...prev,
                            behaviorChangeScore: value === 'none' ? '' : value,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select score" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Not scored</SelectItem>
                          {ratingScaleOptions.map((value) => (
                            <SelectItem key={`behavior-${value}`} value={String(value)}>
                              {value} / 5
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Productivity Impact</label>
                      <Select
                        value={learningImpactAssessmentForm.productivityImpactScore || 'none'}
                        onValueChange={(value) =>
                          setLearningImpactAssessmentForm((prev) => ({
                            ...prev,
                            productivityImpactScore: value === 'none' ? '' : value,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select score" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Not scored</SelectItem>
                          {ratingScaleOptions.map((value) => (
                            <SelectItem key={`productivity-${value}`} value={String(value)}>
                              {value} / 5
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Quality Impact</label>
                      <Select
                        value={learningImpactAssessmentForm.qualityImpactScore || 'none'}
                        onValueChange={(value) =>
                          setLearningImpactAssessmentForm((prev) => ({
                            ...prev,
                            qualityImpactScore: value === 'none' ? '' : value,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select score" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Not scored</SelectItem>
                          {ratingScaleOptions.map((value) => (
                            <SelectItem key={`quality-${value}`} value={String(value)}>
                              {value} / 5
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Business Impact</label>
                      <Select
                        value={learningImpactAssessmentForm.businessImpactScore || 'none'}
                        onValueChange={(value) =>
                          setLearningImpactAssessmentForm((prev) => ({
                            ...prev,
                            businessImpactScore: value === 'none' ? '' : value,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select score" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Not scored</SelectItem>
                          {ratingScaleOptions.map((value) => (
                            <SelectItem key={`business-${value}`} value={String(value)}>
                              {value} / 5
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Manager Comments</label>
                    <Textarea
                      rows={4}
                      placeholder="Describe the observed impact after the training period."
                      value={learningImpactAssessmentForm.comment}
                      onChange={(event) =>
                        setLearningImpactAssessmentForm((prev) => ({
                          ...prev,
                          comment: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <Button variant="outline" onClick={() => setShowImpactAssessmentDialog(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSubmitImpactAssessment}
                    disabled={submitImpactAssessmentMutation.isPending}
                  >
                    Submit Impact Review
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog
              open={showLearningWorkspaceDialog}
              onOpenChange={(open) => {
                if (!open) {
                  closeLearningWorkspace();
                } else {
                  setShowLearningWorkspaceDialog(true);
                }
              }}
            >
              <DialogContent className="max-h-[90vh] w-[95vw] max-w-5xl overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    {selectedWorkspaceAssignment?.programVersion?.title ||
                      selectedWorkspaceAssignment?.programVersion?.program?.title ||
                      'Assigned Learning Workspace'}
                  </DialogTitle>
                  <DialogDescription>
                    Review modules, session details, and the final quiz for this assigned training.
                  </DialogDescription>
                </DialogHeader>

                {workspaceProgramLoading ? (
                  <PageLoader message="Loading learning workspace..." minHeightClassName="min-h-[320px]" />
                ) : !selectedWorkspaceAssignment ? (
                  <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                    No assignment is selected.
                  </div>
                ) : !workspaceProgramVersion ? (
                  <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                    Full program details are not available for this assignment yet.
                  </div>
                ) : (
                  <div className="space-y-6 py-2">
                    <div className="grid gap-4 md:grid-cols-3">
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium">Learner</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="font-semibold">
                            {formatPersonName(selectedWorkspaceAssignment.employee)}
                          </p>
                          <p className="text-xs text-gray-600">
                            Status: {selectedWorkspaceAssignment.status.replace(/_/g, ' ')}
                          </p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium">Progress</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center justify-between text-sm">
                            <span>Overall completion</span>
                            <span>
                              {Number(selectedWorkspaceAssignment.progressPercent || 0).toFixed(0)}%
                            </span>
                          </div>
                          <Progress
                            value={selectedWorkspaceAssignment.progressPercent}
                            className="mt-2 h-2"
                          />
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium">Schedule</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="font-semibold">
                            {selectedWorkspaceAssignment.dueAt
                              ? new Date(selectedWorkspaceAssignment.dueAt).toLocaleDateString()
                              : 'No due date'}
                          </p>
                          <p className="text-xs text-gray-600">Assignment due date</p>
                        </CardContent>
                      </Card>
                    </div>

                    <Card>
                      <CardHeader>
                        <CardTitle>Learning Modules</CardTitle>
                        <CardDescription>
                          Complete each required module to move the assignment toward completion.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {workspaceProgramVersion.modules.length === 0 ? (
                          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                            This program has no configured modules.
                          </div>
                        ) : (
                          workspaceProgramVersion.modules.map((module) => {
                            const linkedKnowledgeResource = module.knowledgeHubResource ?? null;
                            const moduleProgress = selectedWorkspaceAssignment.moduleProgressEntries?.find(
                              (entry) => entry.moduleId === module.id
                            );
                            const moduleCompleted = moduleProgress?.status === 'completed';
                            const isActiveModule = activeWorkspaceModuleId === module.id;
                            const moduleMaterialUrl = resolveDocumentUrl(
                              linkedKnowledgeResource?.linkUrl ?? module.contentUrl
                            );
                            const moduleCompletionMode = inferWorkspaceModuleCompletionMode(module);
                            const moduleCompletionThreshold =
                              linkedKnowledgeResource?.completionThresholdPercent ??
                              (moduleCompletionMode === "watch_percent" ? 95 : null);
                            const moduleTrackingStatus = workspaceModuleTrackingSupport[module.id] ?? null;
                            const canFallbackToManualModuleCompletion =
                              profile?.id === selectedWorkspaceAssignment.employeeProfileId &&
                              !moduleCompleted &&
                              (moduleCompletionMode === "manual" || moduleTrackingStatus === false);
                            const canOpenModuleViewer =
                              module.contentType !== "live_session" &&
                              Boolean(moduleMaterialUrl || linkedKnowledgeResource?.content);

                            return (
                              <div key={module.id} className="rounded-lg border p-4">
                                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                                  <div className="space-y-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <p className="font-semibold">
                                        {module.sequenceNo}. {module.title}
                                      </p>
                                      {module.required && <Badge variant="outline">Required</Badge>}
                                      <Badge variant="secondary">
                                        {module.contentType.replace(/_/g, ' ')}
                                      </Badge>
                                    </div>
                                    {module.description && (
                                      <p className="text-sm text-gray-600">{module.description}</p>
                                    )}
                                    <div className="flex flex-wrap gap-4 text-xs text-gray-600">
                                      <span>
                                        Estimated time: {module.estimatedMinutes || 0} minutes
                                      </span>
                                      {moduleMaterialUrl && (
                                        <a
                                          href={moduleMaterialUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="font-medium text-blue-600 hover:underline"
                                        >
                                          Open material
                                        </a>
                                      )}
                                      {module.contentType === 'knowledge_resource' && linkedKnowledgeResource && (
                                        <span>
                                          Mirrors Knowledge Hub: {linkedKnowledgeResource.title}
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  <div className="min-w-[220px] space-y-2">
                                    <div className="flex items-center justify-between text-sm">
                                      <span>Module progress</span>
                                      <span>
                                        {Number(moduleProgress?.completionPercent || 0).toFixed(0)}%
                                      </span>
                                    </div>
                                    <Progress
                                      value={Number(moduleProgress?.completionPercent || 0)}
                                      className="h-2"
                                    />
                                    <div className="flex flex-wrap gap-2 pt-1">
                                      {canOpenModuleViewer && (
                                        <Button
                                          size="sm"
                                          variant={isActiveModule ? "default" : "outline"}
                                          onClick={() => activateWorkspaceModule(module.id)}
                                        >
                                          {isActiveModule ? "Viewing Module" : "Open Module"}
                                        </Button>
                                      )}
                                      {profile?.id === selectedWorkspaceAssignment.employeeProfileId &&
                                        !moduleCompleted &&
                                        canFallbackToManualModuleCompletion && (
                                          <>
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              onClick={() =>
                                                handleUpdateWorkspaceModuleProgress(module.id, false)
                                              }
                                              disabled={updateLearningModuleProgressMutation.isPending}
                                            >
                                              Mark In Progress
                                            </Button>
                                            <Button
                                              size="sm"
                                              onClick={() =>
                                                handleUpdateWorkspaceModuleProgress(module.id, true)
                                              }
                                              disabled={updateLearningModuleProgressMutation.isPending}
                                            >
                                              Mark Complete
                                            </Button>
                                          </>
                                        )}
                                      {moduleCompleted && (
                                        <Badge className="bg-green-100 text-green-800">
                                          Completed
                                        </Badge>
                                      )}
                                      {!moduleCompleted &&
                                        isActiveModule &&
                                        moduleTrackingStatus === true && (
                                          <Badge variant="outline">Tracked automatically</Badge>
                                        )}
                                    </div>
                                  </div>
                                </div>

                                {isActiveModule && canOpenModuleViewer && (
                                  <div className="mt-4 space-y-3 border-t pt-4">
                                    <Suspense
                                      fallback={
                                        <div className="flex min-h-[360px] items-center justify-center rounded-lg border bg-muted/20 text-sm text-muted-foreground">
                                          Loading module viewer...
                                        </div>
                                      }
                                    >
                                      <TrackedContentViewer
                                        title={linkedKnowledgeResource?.title || module.title}
                                        sourceUrl={moduleMaterialUrl}
                                        fileName={linkedKnowledgeResource?.assetFileName || null}
                                        mimeType={linkedKnowledgeResource?.assetMimeType || null}
                                        textContent={linkedKnowledgeResource?.content || null}
                                        completionMode={moduleCompletionMode}
                                        completionThresholdPercent={moduleCompletionThreshold}
                                        className="min-h-[360px]"
                                        onProgress={(progress) =>
                                          handleWorkspaceModuleTrackingProgress(module.id, progress)
                                        }
                                        onTrackingSupportChange={(supported) =>
                                          setWorkspaceModuleTrackingSupport((prev) =>
                                            prev[module.id] === supported
                                              ? prev
                                              : {
                                                  ...prev,
                                                  [module.id]: supported,
                                                }
                                          )
                                        }
                                      />
                                    </Suspense>
                                    {moduleTrackingStatus === true && (
                                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                                        This module updates learner progress automatically as they
                                        consume the material.
                                      </div>
                                    )}
                                    {moduleTrackingStatus === false && (
                                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                                        This source cannot report progress automatically, so manual
                                        completion remains available for the learner.
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </CardContent>
                    </Card>

                    {workspaceProgramVersion.sessions.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle>Instructor Sessions</CardTitle>
                          <CardDescription>
                            Scheduled live sessions that may carry attendance points.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {workspaceProgramVersion.sessions.map((session) => (
                            <div key={session.id} className="rounded-lg border p-4">
                              {(() => {
                                const attendanceRecord =
                                  selectedWorkspaceAssignment.attendanceRecords?.find(
                                    (record) => record.sessionId === session.id
                                  );
                                const attendanceForm = learningAttendanceForms[session.id] ?? {
                                  attendanceStatus: attendanceRecord?.attendanceStatus ?? 'invited',
                                  notes: attendanceRecord?.notes ?? '',
                                };

                                return (
                                  <div className="space-y-4">
                                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                      <div>
                                        <div className="flex flex-wrap items-center gap-2">
                                          <p className="font-semibold">{session.title}</p>
                                          {getStatusBadge(
                                            attendanceRecord?.attendanceStatus ?? 'invited'
                                          )}
                                        </div>
                                        <p className="text-sm text-gray-600">
                                          {new Date(session.startsAt).toLocaleString()} to{' '}
                                          {new Date(session.endsAt).toLocaleString()}
                                        </p>
                                        {session.location && (
                                          <p className="text-sm text-gray-600">{session.location}</p>
                                        )}
                                        {attendanceRecord?.attendedAt && (
                                          <p className="text-xs text-gray-500">
                                            Marked on{' '}
                                            {new Date(attendanceRecord.attendedAt).toLocaleString()}
                                          </p>
                                        )}
                                      </div>
                                      <div className="text-sm text-gray-600">
                                        <p>Attendance points: {session.attendancePoints}</p>
                                        <p>
                                          {session.attendanceRequired
                                            ? 'Attendance required'
                                            : 'Attendance optional'}
                                        </p>
                                      </div>
                                    </div>

                                    {canManageLearning ? (
                                      <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)_auto]">
                                        <div className="space-y-2">
                                          <label className="text-sm font-medium">
                                            Attendance Status
                                          </label>
                                          <Select
                                            value={attendanceForm.attendanceStatus}
                                            onValueChange={(value) =>
                                              updateLearningAttendanceForm(session.id, (current) => ({
                                                ...current,
                                                attendanceStatus:
                                                  value as LearningAttendanceFormState['attendanceStatus'],
                                              }))
                                            }
                                          >
                                            <SelectTrigger>
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="invited">Invited</SelectItem>
                                              <SelectItem value="attended">Attended</SelectItem>
                                              <SelectItem value="missed">Missed</SelectItem>
                                              <SelectItem value="excused">Excused</SelectItem>
                                            </SelectContent>
                                          </Select>
                                        </div>
                                        <div className="space-y-2">
                                          <label className="text-sm font-medium">Notes</label>
                                          <Textarea
                                            rows={2}
                                            placeholder="Optional attendance notes"
                                            value={attendanceForm.notes}
                                            onChange={(event) =>
                                              updateLearningAttendanceForm(session.id, (current) => ({
                                                ...current,
                                                notes: event.target.value,
                                              }))
                                            }
                                          />
                                        </div>
                                        <div className="flex items-end">
                                          <Button
                                            variant="outline"
                                            onClick={() => handleSaveSessionAttendance(session.id)}
                                            disabled={markLearningAttendanceMutation.isPending}
                                          >
                                            Save Attendance
                                          </Button>
                                        </div>
                                      </div>
                                    ) : attendanceRecord?.notes ? (
                                      <div className="rounded-lg bg-slate-50 p-3 text-sm text-gray-600">
                                        {attendanceRecord.notes}
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              })()}
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    )}

                    <Card>
                      <CardHeader>
                        <CardTitle>Quizzes</CardTitle>
                        <CardDescription>
                          Complete any module checks and the final assessment from this workspace.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {workspaceQuizzes.length === 0 ? (
                          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                            No quizzes are configured for this version.
                          </div>
                        ) : (
                          <div className="space-y-6">
                            {workspaceQuizzes.map((quiz, quizIndex) => {
                              const quizPassed = Boolean(
                                selectedWorkspaceAssignment.quizAttempts?.some(
                                  (attempt) => attempt.quizId === quiz.id && attempt.status === 'passed'
                                )
                              );
                              const linkedModule = quiz.moduleId
                                ? workspaceProgramVersion?.modules.find((module) => module.id === quiz.moduleId)
                                : null;

                              return (
                                <div key={quiz.id} className="space-y-4 rounded-lg border p-4">
                                  <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                      <p className="font-semibold">{quiz.title || `Quiz ${quizIndex + 1}`}</p>
                                      <p className="text-sm text-muted-foreground">
                                        {linkedModule
                                          ? `Linked to ${linkedModule.title}`
                                          : 'Final or standalone quiz'}
                                      </p>
                                    </div>
                                    {quizPassed ? <Badge className="bg-green-600">Passed</Badge> : null}
                                  </div>

                                  {quiz.instructions ? (
                                    <div className="rounded-lg bg-slate-50 p-3 text-sm text-gray-600">
                                      {quiz.instructions}
                                    </div>
                                  ) : null}

                                  <div className="grid gap-4 md:grid-cols-3">
                                    <div className="rounded-lg border p-3 text-sm">
                                      <p className="text-gray-600">Pass mark</p>
                                      <p className="font-semibold">{quiz.passMark}%</p>
                                    </div>
                                    <div className="rounded-lg border p-3 text-sm">
                                      <p className="text-gray-600">Points on pass</p>
                                      <p className="font-semibold">{quiz.pointsOnPass}</p>
                                    </div>
                                    <div className="rounded-lg border p-3 text-sm">
                                      <p className="text-gray-600">Attempt limit</p>
                                      <p className="font-semibold">{quiz.attemptLimit || 'Unlimited'}</p>
                                    </div>
                                  </div>

                                  {quizPassed ? (
                                    <div className="rounded-lg bg-green-50 p-4 text-sm">
                                      <p className="font-medium text-green-800">Quiz passed</p>
                                      <p className="mt-1 text-green-700">
                                        The learner has already passed this quiz.
                                      </p>
                                    </div>
                                  ) : (
                                    <>
                                      <div className="space-y-4">
                                        {quiz.questions.map((question, index) => {
                                          const currentAnswer = learningQuizAnswers[question.id] ?? {
                                            optionIds: [],
                                            freeTextAnswer: '',
                                          };

                                          return (
                                            <div key={question.id} className="rounded-lg border p-4">
                                              <div className="flex flex-wrap items-center gap-2">
                                                <p className="font-medium">
                                                  Question {index + 1}. {question.prompt}
                                                </p>
                                                {question.required ? (
                                                  <Badge variant="outline">Required</Badge>
                                                ) : null}
                                              </div>
                                              {question.explanation ? (
                                                <p className="mt-1 text-sm text-gray-600">
                                                  {question.explanation}
                                                </p>
                                              ) : null}

                                              <div className="mt-3 space-y-3">
                                                {question.questionType === 'short_text' ? (
                                                  <Textarea
                                                    rows={3}
                                                    value={currentAnswer.freeTextAnswer}
                                                    onChange={(event) =>
                                                      updateLearningQuizAnswer(question.id, (current) => ({
                                                        ...current,
                                                        freeTextAnswer: event.target.value,
                                                      }))
                                                    }
                                                    disabled={
                                                      profile?.id !==
                                                        selectedWorkspaceAssignment.employeeProfileId ||
                                                      submitLearningQuizAttemptMutation.isPending
                                                    }
                                                  />
                                                ) : (
                                                  question.options.map((option) => (
                                                    <label
                                                      key={option.id}
                                                      className="flex items-start gap-3 rounded-md border p-3 text-sm"
                                                    >
                                                      <Checkbox
                                                        checked={currentAnswer.optionIds.includes(option.id)}
                                                        disabled={
                                                          profile?.id !==
                                                            selectedWorkspaceAssignment.employeeProfileId ||
                                                          submitLearningQuizAttemptMutation.isPending
                                                        }
                                                        onCheckedChange={(checked) =>
                                                          toggleLearningQuizOption(
                                                            question.id,
                                                            option.id,
                                                            checked === true,
                                                            question.questionType
                                                          )
                                                        }
                                                      />
                                                      <span>{option.label}</span>
                                                    </label>
                                                  ))
                                                )}
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>

                                      {selectedWorkspaceAssignment &&
                                      profile?.id === selectedWorkspaceAssignment.employeeProfileId ? (
                                        <div className="flex justify-end">
                                          <Button
                                            onClick={() => handleSubmitWorkspaceQuiz(quiz)}
                                            disabled={submitLearningQuizAttemptMutation.isPending}
                                          >
                                            Submit Quiz
                                          </Button>
                                        </div>
                                      ) : null}
                                    </>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-4">
                  <Button variant="outline" onClick={closeLearningWorkspace}>
                    Close
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

	        {/* Metrics Overview */}
	        {metrics && (
	          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
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

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
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
                <AnalyticsChartShell>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={trainingStatusMix}
                        dataKey="value"
                        nameKey="name"
                        {...analyticsDonutProps}
                      >
                        {trainingStatusMix.map((item, index) => (
                          <Cell key={`training-status-${item.name}`} fill={analyticsColorAt(index)} />
                        ))}
                      </Pie>
                      <Legend content={<AnalyticsLegendContent />} />
                      <Tooltip
                        content={
                          <AnalyticsTooltipContent
                            valueFormatter={(value) => Number(value || 0).toFixed(0)}
                          />
                        }
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </AnalyticsChartShell>
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
                <AnalyticsChartShell>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={certificationMix}
                        dataKey="value"
                        nameKey="name"
                        {...analyticsDonutProps}
                      >
                        <Cell fill="#22c55e" />
                        <Cell fill="#f59e0b" />
                        <Cell fill="#ef4444" />
                      </Pie>
                      <Legend content={<AnalyticsLegendContent />} />
                      <Tooltip
                        content={
                          <AnalyticsTooltipContent
                            valueFormatter={(value) => Number(value || 0).toFixed(0)}
                          />
                        }
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </AnalyticsChartShell>
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
                <AnalyticsChartShell>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={skillGapData}>
                      <CartesianGrid {...analyticsGridProps} />
                      <XAxis dataKey="category" {...analyticsAxisProps} />
                      <YAxis allowDecimals={false} {...analyticsAxisProps} />
                      <Tooltip
                        content={
                          <AnalyticsTooltipContent
                            valueFormatter={(value) => Number(value || 0).toFixed(1)}
                          />
                        }
                      />
                      <Bar dataKey="gap" radius={[10, 10, 4, 4]}>
                        {skillGapData.map((item, index) => (
                          <Cell key={`skill-gap-${item.category}`} fill={analyticsColorAt(index)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </AnalyticsChartShell>
              )}
            </CardContent>
          </Card>
        </div>

	        {/* Content Tabs */}
	        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid h-auto w-full grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
            <TabsTrigger className="whitespace-normal text-center" value="overview">Overview</TabsTrigger>
            <TabsTrigger className="whitespace-normal text-center" value="training">Training</TabsTrigger>
            <TabsTrigger className="whitespace-normal text-center" value="learning">Assigned Learning</TabsTrigger>
            <TabsTrigger className="whitespace-normal text-center" value="certifications">Certifications</TabsTrigger>
            <TabsTrigger className="whitespace-normal text-center" value="skills">Skills</TabsTrigger>
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

          <TabsContent value="learning" className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Assigned Programs</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{assignedLearningSummary.total}</div>
                  <p className="text-xs text-gray-600">Visible learning assignments</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Completed</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{assignedLearningSummary.completed}</div>
                  <p className="text-xs text-gray-600">Finished assigned learning</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Certificates Issued</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{assignedLearningSummary.certificates}</div>
                  <p className="text-xs text-gray-600">Generated training certificates</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Learning Points</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{learningPoints?.totalPoints ?? 0}</div>
                  <p className="text-xs text-gray-600">Attendance, quiz, and feedback points</p>
                </CardContent>
              </Card>
            </div>

            {canManageLearning && (
              <Card>
                <CardHeader>
                  <CardTitle>Program Catalog</CardTitle>
                  <CardDescription>
                    Published and draft assigned-learning programs available for rollout.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {learningProgramsLoading ? (
                    <PageLoader message="Loading learning programs..." minHeightClassName="min-h-[180px]" />
                  ) : learningPrograms.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                      No learning programs have been created yet.
                    </div>
                  ) : (
                    <div className="grid gap-4 lg:grid-cols-2">
                      {learningPrograms.map((program) => {
                        const latestVersion = program.versions[0];
                        const publishedVersion = program.versions.find((version) => version.status === 'published');
                        return (
                          <div key={program.id} className="rounded-lg border p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h3 className="font-semibold">{program.title}</h3>
                                  <Badge variant="outline">{program.status}</Badge>
                                </div>
                                {program.description && (
                                  <p className="text-sm text-gray-600">{program.description}</p>
                                )}
                              </div>
                              {publishedVersion && (
                                <div className="flex flex-wrap gap-2">
                                  {publishedVersion.sessions.length > 0 && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => openLearningAttendanceDialog(publishedVersion.id)}
                                    >
                                      <CheckCircle className="mr-2 h-4 w-4" />
                                      Attendance
                                    </Button>
                                  )}
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openLearningAssignmentDialog(publishedVersion.id)}
                                  >
                                    <Users className="mr-2 h-4 w-4" />
                                    Assign
                                  </Button>
                                </div>
                              )}
                            </div>

                            <div className="mt-4 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
                              <div>
                                <p className="text-gray-600">Versions</p>
                                <p className="font-medium">{program.versions.length}</p>
                              </div>
                              <div>
                                <p className="text-gray-600">Latest</p>
                                <p className="font-medium">{latestVersion?.title || 'n/a'}</p>
                              </div>
                              <div>
                                <p className="text-gray-600">Modules</p>
                                <p className="font-medium">{latestVersion?.modules.length || 0}</p>
                              </div>
                              <div>
                                <p className="text-gray-600">Assignments</p>
                                <p className="font-medium">{latestVersion?._count?.assignments || 0}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
              <Card>
                <CardHeader>
                  <CardTitle>Assigned Learning Tracker</CardTitle>
                  <CardDescription>
                    Structured trainings assigned by managers or HR, including completion and certificate status.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {learningAssignmentsLoading ? (
                    <PageLoader message="Loading assigned learning..." minHeightClassName="min-h-[220px]" />
                  ) : learningAssignments.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                      No assigned learning records are available yet.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {learningAssignments.map((assignment) => {
                        const totalModules = assignment.moduleProgressEntries?.length || 0;
                        const completedModules =
                          assignment.moduleProgressEntries?.filter((entry) => entry.status === 'completed').length || 0;
                        const certificateUrl = resolveDocumentUrl(assignment.certificate?.document?.fileUrl);
                        const verificationUrl = assignment.certificate?.verificationUrl || null;
                        const canSubmitFeedback =
                          profile?.id === assignment.employeeProfileId &&
                          assignment.status === 'completed' &&
                          !assignment.trainingFeedback;
                        const canSubmitImpact = canSubmitImpactAssessment(assignment);

                        return (
                          <div key={assignment.id} className="rounded-lg border p-4">
                            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                              <div className="space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h3 className="font-semibold">
                                    {assignment.programVersion?.title || assignment.programVersion?.program?.title || 'Assigned learning'}
                                  </h3>
                                  {getStatusBadge(assignment.status)}
                                </div>
                                <p className="text-sm text-gray-600">
                                  Learner: {formatPersonName(assignment.employee)}
                                </p>
                                <p className="text-sm text-gray-600">
                                  Trainer: {formatPersonName(assignment.programVersion?.trainer)}
                                </p>
                                {assignment.dueAt && (
                                  <p className="text-sm text-gray-600">
                                    Due: {new Date(assignment.dueAt).toLocaleDateString()}
                                  </p>
                                )}
                              </div>

                              <div className="min-w-[220px] space-y-2">
                                <div className="flex items-center justify-between text-sm">
                                  <span>Overall progress</span>
                                  <span>{Number(assignment.progressPercent || 0).toFixed(0)}%</span>
                                </div>
                                <Progress value={assignment.progressPercent} className="h-2" />
                                <div className="flex flex-wrap gap-2 pt-1">
                                  {totalModules > 0 && (
                                    <Badge variant="outline">
                                      Modules {completedModules}/{totalModules}
                                    </Badge>
                                  )}
                                  {assignment.quizAttempts?.some((attempt) => attempt.status === 'passed') && (
                                    <Badge variant="outline">Quiz passed</Badge>
                                  )}
                                  {assignment.trainingFeedback && (
                                    <Badge variant="outline">Feedback sent</Badge>
                                  )}
                                  {assignment.impactAssessmentTask && (
                                    <Badge variant="outline">
                                      Impact {assignment.impactAssessmentTask.status.replace(/_/g, ' ')}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="mt-4 grid grid-cols-1 gap-4 text-sm md:grid-cols-3">
                              <div>
                                <p className="text-gray-600">Delivery</p>
                                <p className="font-medium">
                                  {assignment.programVersion?.deliveryMode || assignment.programVersion?.trainingType || 'Mixed'}
                                </p>
                              </div>
                              <div>
                                <p className="text-gray-600">Provider</p>
                                <p className="font-medium">{assignment.programVersion?.provider || 'Internal'}</p>
                              </div>
                              <div>
                                <p className="text-gray-600">Certificate</p>
                                {assignment.certificate ? (
                                  certificateUrl ? (
                                    <a
                                      href={certificateUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="font-medium text-blue-600 hover:underline"
                                    >
                                      {assignment.certificate.certificateNumber}
                                    </a>
                                  ) : (
                                    <p className="font-medium">{assignment.certificate.certificateNumber}</p>
                                  )
                                ) : assignment.status === 'completed' && !assignment.trainingFeedback ? (
                                  <p className="font-medium text-gray-500">Awaiting feedback</p>
                                ) : (
                                  <p className="font-medium text-gray-500">Pending</p>
                                )}
                              </div>
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2">
                              {assignment.programVersion?.program?.id && assignment.programVersion?.id && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openLearningWorkspace(assignment.id)}
                                >
                                  <Eye className="mr-2 h-4 w-4" />
                                  Open Workspace
                                </Button>
                              )}
                              {canSubmitFeedback && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openLearningFeedbackDialog(assignment)}
                                >
                                  <Star className="mr-2 h-4 w-4" />
                                  Give Feedback
                                </Button>
                              )}
                              {canSubmitImpact && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openImpactAssessmentDialog(assignment)}
                                >
                                  <Target className="mr-2 h-4 w-4" />
                                  Submit Impact Review
                                </Button>
                              )}
                              {assignment.status === 'completed' &&
                                assignment.trainingFeedback &&
                                !assignment.certificate && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => issueCertificateMutation.mutate(assignment.id)}
                                  disabled={issueCertificateMutation.isPending}
                                >
                                  <Award className="mr-2 h-4 w-4" />
                                  Issue Certificate
                                </Button>
                              )}
                              {assignment.certificate && certificateUrl && (
                                <Button variant="outline" size="sm" asChild>
                                  <a href={certificateUrl} target="_blank" rel="noopener noreferrer">
                                    <Download className="mr-2 h-4 w-4" />
                                    Download Certificate
                                  </a>
                                </Button>
                              )}
                              {assignment.certificate && verificationUrl && (
                                <Button variant="outline" size="sm" asChild>
                                  <a href={verificationUrl} target="_blank" rel="noopener noreferrer">
                                    Verify Certificate
                                  </a>
                                </Button>
                              )}
                            </div>

                            {(assignment.trainingFeedback || assignment.impactAssessmentTask?.response) && (
                              <div className="mt-4 grid gap-3 md:grid-cols-2">
                                {assignment.trainingFeedback && (
                                  <div className="rounded-lg bg-slate-50 p-3 text-sm">
                                    <div className="flex items-center justify-between gap-3">
                                      <p className="font-medium">Trainer feedback submitted</p>
                                      <Badge variant="secondary">
                                        {assignment.trainingFeedback.overallRating}/5
                                      </Badge>
                                    </div>
                                    {assignment.trainingFeedback.comment && (
                                      <p className="mt-2 text-gray-600">
                                        {assignment.trainingFeedback.comment}
                                      </p>
                                    )}
                                  </div>
                                )}
                                {assignment.impactAssessmentTask?.response && (
                                  <div className="rounded-lg bg-amber-50 p-3 text-sm">
                                    <div className="flex items-center justify-between gap-3">
                                      <p className="font-medium">Impact assessment submitted</p>
                                      <Badge variant="secondary">
                                        {new Date(
                                          assignment.impactAssessmentTask.response.submittedAt
                                        ).toLocaleDateString()}
                                      </Badge>
                                    </div>
                                    {assignment.impactAssessmentTask.response.comment && (
                                      <p className="mt-2 text-gray-600">
                                        {assignment.impactAssessmentTask.response.comment}
                                      </p>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Recent Point Activity</CardTitle>
                  <CardDescription>
                    Reward points earned from attendance, quiz completion, and feedback.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {recentLearningPoints.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                      No point activity has been recorded yet.
                    </div>
                  ) : (
                    recentLearningPoints.map((entry) => (
                      <div key={entry.id} className="rounded-lg border p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-medium">
                              {entry.eventType.replace(/_/g, ' ')}
                            </p>
                            <p className="text-xs text-gray-600">
                              {new Date(entry.awardedAt).toLocaleString()}
                            </p>
                          </div>
                          <Badge variant="secondary">+{entry.points}</Badge>
                        </div>
                      </div>
                    ))
                  )}

                  <div className="rounded-lg bg-slate-50 p-4 text-sm">
                    <p className="font-medium">Point rules in use</p>
                    <p className="mt-1 text-gray-600">
                      Training attendance, quiz passes, and feedback submissions now contribute to the learner's total score.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
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
