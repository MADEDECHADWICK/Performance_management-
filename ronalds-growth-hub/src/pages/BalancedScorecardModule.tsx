import { Link, useNavigate, useParams } from "react-router-dom";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Briefcase,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  FileText,
  Filter,
  Flag,
  Layers,
  LineChart,
  MessageSquare,
  Search,
  Settings2,
  ShieldCheck,
  Target,
  User,
  Users,
  Workflow,
} from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/contexts/AuthContext";
import {
  performanceFrameworkAPI,
  type BalancedScorecardContributionDetail,
  type BalancedScorecardGovernanceCycle,
  type BalancedScorecardKpiAssignmentRecord,
  type BalancedScorecardGovernanceVersion,
  type BalancedScorecardMeasurementPeriodSummary,
  type BalancedScorecardMeasurementReviewPack,
  type BalancedScorecardMeasurementSnapshotPack,
  type BalancedScorecardPerspectiveRecord,
  type BalancedScorecardGoalRecord,
  type BalancedScorecardInitiativeRecord,
  type BalancedScorecardKpiRecord,
  type PerformanceBandRecord,
  type WorkspaceEvaluationSummary,
  type BalancedScorecardWorkspace,
  type BalancedScorecardStructure,
  type KpiEngineDetail,
  type WorkspaceCascadeInitiative,
  type WorkspaceCascadeLevel as CascadeLevel,
  type WorkspaceDepartmentRow,
  type WorkspaceEmployeeContribution as EmployeeContribution,
  type WorkspaceEmployeeKpiAssignment,
  type WorkspaceEmployeeRow,
  type WorkspaceInitiative as InitiativeDefinition,
  type WorkspaceKpi as KpiDefinition,
  type WorkspaceManagerRow,
  type WorkspaceGoal as GoalDefinition,
  type WorkspacePerspectiveCard as PerspectiveCard,
  type WorkspaceReportBlock,
} from "@/lib/api/performanceFramework";
import documentsAPI from "@/lib/api/documents";
import employeesAPI from "@/lib/api/employees";
import rolesAPI, { type Role } from "@/lib/api/roles";
import type { Profile } from "@/lib/api/types";
import {
  getPreferredRoleView,
  getRoleTabLabel,
  isRoleKey,
  kpiContractSteps,
  kpiGovernanceRules,
  moduleTabs,
  roleHomeConfigs,
  roleProfiles,
  roleTabVisibility,
  strategyFlowSteps,
  strategyReviewPoints,
  type KpiSheetMode,
  type ModuleTabValue,
  type RoleBoardItem,
  type RoleHomeMetric,
  type RoleKey,
  type SetupSheetMode,
  type StatusTone,
} from "@/lib/balancedScorecardUiConfig";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import {
  averageScore,
  MetricCard,
  parseAcknowledgementState,
  scoreToStatus,
  SectionTitle,
  StatusBadge,
  TrendBars,
} from "@/components/framework/BalancedScorecardPrimitives";
import { BalancedScorecardPeopleAdminPanel } from "@/components/framework/BalancedScorecardPeopleAdminPanel";
import { KpiEngineDesigner } from "@/components/framework/KpiEngineDesigner";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const emptyStructure: BalancedScorecardStructure = {
  perspectives: [],
  goals: [],
  kpis: [],
  initiatives: [],
};

export default function BalancedScorecardModule() {
  const navigate = useNavigate();
  const { workspaceRole } = useParams<{ workspaceRole?: string }>();
  const { roles, hasAnyRole, profile } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<ModuleTabValue>("dashboard");
  const [selectedCycle, setSelectedCycle] = useState<string>("latest");
  const [search, setSearch] = useState("");
  const [setupSheetMode, setSetupSheetMode] = useState<SetupSheetMode>(null);
  const [kpiSheetMode, setKpiSheetMode] = useState<KpiSheetMode>(null);
  const [authoringSubmitting, setAuthoringSubmitting] = useState<string | null>(null);
  const [perspectiveForm, setPerspectiveForm] = useState({
    name: "",
    ownerName: "",
    summary: "",
  });
  const [editingPerspectiveId, setEditingPerspectiveId] = useState<number | null>(null);
  const [editingGoalId, setEditingGoalId] = useState<number | null>(null);
  const [editingInitiativeId, setEditingInitiativeId] = useState<number | null>(null);
  const [goalForm, setGoalForm] = useState({
    perspectiveId: "",
    title: "",
    ownerName: "",
    description: "",
  });
  const [goalEditForm, setGoalEditForm] = useState({
    title: "",
    ownerName: "",
    description: "",
  });
  const [initiativeEditForm, setInitiativeEditForm] = useState({
    title: "",
    summary: "",
    ownerName: "",
    timeline: "",
    dueDate: "",
    status: "at_risk" as StatusTone,
    progress: "0",
    scopeRole: "hr",
  });
  const [initiativeForm, setInitiativeForm] = useState({
    goalId: "",
    kpiId: "",
    parentInitiativeId: "none",
    scopeRole: "hr",
    title: "",
    summary: "",
    ownerName: "",
    timeline: "",
    dueDate: "",
    status: "at_risk" as StatusTone,
    progress: "0",
  });
  const [kpiActualDialogOpen, setKpiActualDialogOpen] = useState(false);
  const [kpiActualTarget, setKpiActualTarget] = useState<KpiDefinition | null>(null);
  const [kpiActualEngine, setKpiActualEngine] = useState<KpiEngineDetail | null>(null);
  const [kpiActualValues, setKpiActualValues] = useState<Record<string, string>>({});
  const [kpiActualForm, setKpiActualForm] = useState({
    actualValue: "",
    note: "",
  });
  const [selectedStructureVersionId, setSelectedStructureVersionId] = useState<string>("current");
  const [cycleDialogOpen, setCycleDialogOpen] = useState(false);
  const [versionDialogOpen, setVersionDialogOpen] = useState(false);
  const [measurementPeriodDialogOpen, setMeasurementPeriodDialogOpen] = useState(false);
  const [measurementSubmitting, setMeasurementSubmitting] = useState<string | null>(null);
  const [measurementPackDownloading, setMeasurementPackDownloading] = useState(false);
  const [contributionDialogMode, setContributionDialogMode] = useState<"detail" | "progress" | "evidence" | null>(null);
  const [selectedContributionId, setSelectedContributionId] = useState<string | null>(null);
  const [contributionSubmitting, setContributionSubmitting] = useState<string | null>(null);
  const [selectedMeasurementPeriodId, setSelectedMeasurementPeriodId] = useState<string>("latest");
  const [hasInitializedStructureVersion, setHasInitializedStructureVersion] = useState(false);
  const [cycleForm, setCycleForm] = useState<{
    name: string;
    cadence: "monthly" | "quarterly" | "annual";
    startDate: string;
    endDate: string;
  }>({
    name: "",
    cadence: "quarterly",
    startDate: "",
    endDate: "",
  });
  const [versionForm, setVersionForm] = useState({
    cycleId: "",
    label: "",
    sourceVersionId: "auto",
  });
  const [measurementPeriodForm, setMeasurementPeriodForm] = useState({
    label: "",
    periodStart: "",
    periodEnd: "",
  });
  const [contributionProgressForm, setContributionProgressForm] = useState({
    progress: "",
    comment: "",
  });
  const [contributionEvidenceNote, setContributionEvidenceNote] = useState("");
  const [contributionEvidenceFile, setContributionEvidenceFile] = useState<File | null>(null);

  const canPreviewAllRoles = roles.includes("hr") || roles.includes("super_admin");
  const preferredRole = useMemo(() => getPreferredRoleView(roles), [roles]);
  const routeRole = isRoleKey(workspaceRole) ? workspaceRole : null;
  const selectedRole = canPreviewAllRoles ? routeRole ?? preferredRole : preferredRole;

  const selectedCycleId =
    selectedCycle !== "latest" && Number.isFinite(Number(selectedCycle))
      ? Number(selectedCycle)
      : undefined;
  const resolvedStructureVersionId =
    selectedStructureVersionId !== "current" && Number.isFinite(Number(selectedStructureVersionId))
      ? Number(selectedStructureVersionId)
      : undefined;

  const queryClient = useQueryClient();

  const { data: availableCycles = [] } = useQuery({
    queryKey: ["evaluation-cycles"],
    queryFn: () => performanceFrameworkAPI.getEvaluationCycles(),
    staleTime: 60_000,
  });

  const {
    data: workspaceData,
    isLoading: workspaceLoading,
    error: workspaceRawError,
  } = useQuery({
    queryKey: ["bsc-workspace", selectedRole, selectedCycleId, profile?.id],
    queryFn: () =>
      performanceFrameworkAPI.getWorkspace({
        role: selectedRole,
        profileId: profile?.id,
        evaluationCycleId: selectedCycleId,
      }),
    enabled: !!profile,
  });

  const { data: structureData } = useQuery({
    queryKey: ["bsc-structure", resolvedStructureVersionId ?? "current"],
    queryFn: () =>
      performanceFrameworkAPI.getScorecardStructure({
        versionId: resolvedStructureVersionId,
      }),
    staleTime: 30_000,
  });

  const { data: governanceCycles = [] } = useQuery<BalancedScorecardGovernanceCycle[]>({
    queryKey: ["bsc-governance"],
    queryFn: () => performanceFrameworkAPI.getScorecardGovernance(),
    enabled: canPreviewAllRoles,
    staleTime: 30_000,
  });

  const { data: employeeDirectoryResponse } = useQuery({
    queryKey: ["bsc-assignment-profiles"],
    queryFn: () => employeesAPI.list({ page: 1, pageSize: 200, status: "active" }),
    enabled: canPreviewAllRoles,
    staleTime: 60_000,
  });

  const { data: positionRoles = [] } = useQuery<Role[]>({
    queryKey: ["bsc-position-roles"],
    queryFn: () => rolesAPI.list(),
    enabled: canPreviewAllRoles,
    staleTime: 60_000,
  });

  const workspaceError =
    workspaceRawError instanceof Error
      ? workspaceRawError.message.includes("Failed to fetch")
        ? "Balanced scorecard workspace is unavailable. Check that the backend API is running and reachable."
        : workspaceRawError.message
      : workspaceRawError
        ? "Failed to load the live balanced scorecard workspace."
        : null;

  const {
    data: contributionDetail,
    isFetching: contributionDetailLoading,
  } = useQuery<BalancedScorecardContributionDetail>({
    queryKey: ["bsc-contribution-detail", selectedContributionId, selectedCycleId, profile?.id],
    queryFn: () =>
      performanceFrameworkAPI.getContributionDetail(selectedContributionId!, {
        profileId: profile?.id,
        evaluationCycleId: selectedCycleId,
      }),
    enabled: Boolean(profile?.id && selectedContributionId && selectedRole === "employee"),
    staleTime: 0,
  });

  const deferredSearch = useDeferredValue(search);
  const searchTerm = deferredSearch.trim().toLowerCase();
  const perspectiveData: PerspectiveCard[] = workspaceData?.perspectiveCards ?? [];
  const goalData: GoalDefinition[] = workspaceData?.goals ?? [];
  const kpiData: KpiDefinition[] = useMemo(() => workspaceData?.kpis ?? [], [workspaceData?.kpis]);
  const initiativeData: InitiativeDefinition[] = useMemo(() => workspaceData?.initiatives ?? [], [workspaceData?.initiatives]);
  const cascadeInitiativeData: WorkspaceCascadeInitiative[] =
    workspaceData?.cascadeInitiatives ?? [];
  const featuredCascadeData: CascadeLevel[] = workspaceData?.featuredCascade ?? [];
  const employeeContributionData: EmployeeContribution[] =
    workspaceData?.employeeContributions ?? [];
  const employeeKpiAssignmentData: WorkspaceEmployeeKpiAssignment[] =
    workspaceData?.employeeKpiAssignments ?? [];
  const selectedContributionItem =
    employeeContributionData.find((item) => item.id === selectedContributionId) ?? null;
  const evaluationSummary: WorkspaceEvaluationSummary = workspaceData?.evaluationSummary ?? {
    cycleId: null,
    cycleTitle: null,
    cycleStatus: null,
    startDate: null,
    endDate: null,
    totalAssignments: 0,
    submittedAssignments: 0,
    pendingAssignments: 0,
    acknowledgedAssignments: 0,
    overdueAssignments: 0,
    completionPercent: 0,
    acknowledgementPercent: 0,
    averageScore: 0,
    departmentCount: 0,
    managerCount: 0,
    resultCount: 0,
  };
  const reportBlockData: WorkspaceReportBlock[] = workspaceData?.reportBlocks ?? [];
  const departmentPerformanceData: WorkspaceDepartmentRow[] =
    workspaceData?.departmentPerformance ?? [];
  const managerPerformanceData: WorkspaceManagerRow[] =
    workspaceData?.managerPerformance ?? [];
  const employeePerformanceData: WorkspaceEmployeeRow[] =
    workspaceData?.employeePerformance ?? [];
  const structureSnapshot = structureData ?? emptyStructure;
  const allGovernanceVersions = governanceCycles.flatMap((cycle) => cycle.versions);
  const selectedGovernanceVersion: BalancedScorecardGovernanceVersion | null =
    resolvedStructureVersionId !== undefined
      ? allGovernanceVersions.find((version) => version.id === resolvedStructureVersionId) ?? null
      : null;
  const selectedGovernanceCycle =
    selectedGovernanceVersion
      ? governanceCycles.find((cycle) => cycle.id === selectedGovernanceVersion.cycleId) ?? null
      : null;
  const activeGovernanceCycle =
    governanceCycles.find((cycle) => cycle.status === "active") ?? governanceCycles[0] ?? null;
  const activeGovernanceVersion =
    activeGovernanceCycle?.versions.find(
      (version) => version.id === activeGovernanceCycle.activeVersionId
    ) ?? null;
  const adminVersionId = resolvedStructureVersionId ?? activeGovernanceVersion?.id ?? null;
  const adminVersionLabel =
    selectedGovernanceVersion?.label ||
    (selectedGovernanceVersion
      ? `v${selectedGovernanceVersion.versionNumber}`
      : activeGovernanceVersion?.label ||
        (activeGovernanceVersion ? `v${activeGovernanceVersion.versionNumber}` : "No published version"));
  const measurementVersionId = resolvedStructureVersionId ?? activeGovernanceVersion?.id ?? undefined;
  const { data: kpiAssignments = [] } = useQuery<BalancedScorecardKpiAssignmentRecord[]>({
    queryKey: ["bsc-kpi-assignments", adminVersionId ?? "current"],
    queryFn: () =>
      performanceFrameworkAPI.getKpiAssignments(
        adminVersionId ? { scorecardVersionId: adminVersionId } : undefined
      ),
    enabled: canPreviewAllRoles,
    staleTime: 30_000,
  });
  const { data: performanceBands = [] } = useQuery<PerformanceBandRecord[]>({
    queryKey: ["bsc-performance-bands"],
    queryFn: () => performanceFrameworkAPI.getPerformanceBands(),
    enabled: canPreviewAllRoles,
    staleTime: 30_000,
  });
  const { data: measurementPeriods = [] } = useQuery<BalancedScorecardMeasurementPeriodSummary[]>({
    queryKey: ["bsc-measurement-periods", measurementVersionId ?? "none"],
    queryFn: () =>
      performanceFrameworkAPI.getMeasurementPeriods({
        versionId: measurementVersionId,
      }),
    enabled: canPreviewAllRoles && Boolean(measurementVersionId),
    staleTime: 30_000,
  });
  const selectedMeasurementPeriod =
    selectedMeasurementPeriodId !== "latest" && Number.isFinite(Number(selectedMeasurementPeriodId))
      ? measurementPeriods.find((period) => period.id === Number(selectedMeasurementPeriodId)) ?? null
      : measurementPeriods[0] ?? null;
  const {
    data: measurementSnapshotPack,
  } = useQuery<BalancedScorecardMeasurementSnapshotPack>({
    queryKey: ["bsc-measurement-snapshots", selectedMeasurementPeriod?.id ?? "none"],
    queryFn: () =>
      performanceFrameworkAPI.getMeasurementSnapshots(selectedMeasurementPeriod!.id),
    enabled: canPreviewAllRoles && Boolean(selectedMeasurementPeriod?.id),
    staleTime: 30_000,
  });
  const { data: measurementReviewPack } = useQuery<BalancedScorecardMeasurementReviewPack>({
    queryKey: ["bsc-measurement-review-pack", selectedMeasurementPeriod?.id ?? "none"],
    queryFn: () =>
      performanceFrameworkAPI.getMeasurementReviewPack(selectedMeasurementPeriod!.id),
    enabled:
      canPreviewAllRoles &&
      Boolean(selectedMeasurementPeriod?.id) &&
      (selectedMeasurementPeriod?.snapshotCount ?? 0) > 0,
    staleTime: 30_000,
  });
  const perspectiveRecords = structureSnapshot.perspectives;
  const goalRecords = structureSnapshot.goals;
  const kpiRecords = structureSnapshot.kpis;
  const initiativeRecords = structureSnapshot.initiatives;
  const employeeDirectory: Profile[] = employeeDirectoryResponse?.data ?? [];
  const measurementSnapshots = measurementSnapshotPack?.snapshots ?? [];
  const highlightedMeasurementSnapshot =
    measurementSnapshots.find((snapshot) => snapshot.status !== "on_track") ??
    measurementSnapshots[0] ??
    null;
  const filteredKpis = kpiData.filter((kpi) => {
    if (!searchTerm) return true;
    const goal = goalData.find((candidate) => candidate.id === kpi.goalId);
    const perspective = perspectiveData.find((candidate) => candidate.id === kpi.perspectiveId);
    const haystack = [kpi.name, kpi.description, kpi.owner, goal?.title, perspective?.name]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(searchTerm);
  });
  const highlightedKpi: KpiDefinition | null = filteredKpis[0] ?? kpiData[0] ?? null;

  const selectedRoleProfile = roleProfiles[selectedRole];
  const selectedRoleHomeBase = roleHomeConfigs[selectedRole];
  const linkedGoal = goalData.find((goal) => goal.id === highlightedKpi?.goalId);
  const highlightedPerspective = perspectiveData.find((perspective) => perspective.id === highlightedKpi?.perspectiveId);
  const initiativeGoalId = Number(initiativeForm.goalId);
  const initiativeKpiOptions = Number.isFinite(initiativeGoalId) && initiativeGoalId > 0
    ? kpiRecords.filter((kpi) => kpi.goalId === initiativeGoalId)
    : kpiRecords;
  const activeFeaturedRootInitiative =
    initiativeRecords.find(
      (initiative) =>
        initiative.scopeRole === "hr" &&
        initiativeRecords.some((candidate) => candidate.parentInitiativeId === initiative.id)
    ) ?? null;
  const featuredGoalRecord = activeFeaturedRootInitiative
    ? goalRecords.find((goal) => goal.id === activeFeaturedRootInitiative.goalId) ?? null
    : null;
  const featuredKpiRecord = activeFeaturedRootInitiative
    ? kpiRecords.find((kpi) => kpi.id === activeFeaturedRootInitiative.kpiId) ?? null
    : null;
  const featuredLiveKpi = featuredKpiRecord
    ? kpiData.find((kpi) => kpi.id === featuredKpiRecord.key) ?? null
    : null;
  const isEditingPerspective = setupSheetMode === "editPerspective";
  const editingPerspective = isEditingPerspective
    ? perspectiveRecords.find((perspective) => perspective.id === editingPerspectiveId) ?? null
    : null;

  const closeSetupSheet = () => {
    setSetupSheetMode(null);
    setEditingPerspectiveId(null);
    setEditingGoalId(null);
    setPerspectiveForm({ name: "", ownerName: "", summary: "" });
    setGoalEditForm({ title: "", ownerName: "", description: "" });
  };

  const openCreatePerspective = () => {
    setEditingPerspectiveId(null);
    setPerspectiveForm({
      name: "",
      ownerName: "",
      summary: "",
    });
    setSetupSheetMode("createPerspective");
  };

  const openEditPerspective = (perspective: BalancedScorecardPerspectiveRecord) => {
    setEditingPerspectiveId(perspective.id);
    setPerspectiveForm({
      name: perspective.name,
      ownerName: perspective.ownerName ?? "",
      summary: perspective.summary ?? "",
    });
    setSetupSheetMode("editPerspective");
  };
  const scopedPerspectives = perspectiveData;
  const visibleTabs = (roleTabVisibility[selectedRole] ?? roleTabVisibility.employee)
    .map((value) => moduleTabs.find((tab) => tab.value === value))
    .filter((tab): tab is (typeof moduleTabs)[number] => Boolean(tab))
    .map((tab) => ({ ...tab, label: getRoleTabLabel(selectedRole, tab.value) }));
  const setupMetrics = useMemo<RoleHomeMetric[]>(
    () => [
      {
        label: "Perspectives configured",
        value: String(perspectiveData.length),
        hint: "The strategic lenses currently flowing into the scorecard.",
        icon: Layers,
      },
      {
        label: "Strategic goals",
        value: String(goalData.length),
        hint: "Firm-owned goals linked to the live BSC structure.",
        icon: Flag,
      },
      {
        label: "Linked KPIs",
        value: String(kpiData.length),
        hint: "Measurement contracts attached to the strategy layer.",
        icon: Target,
      },
      {
        label: "Evaluation cycle",
        value: evaluationSummary.cycleId ? evaluationSummary.cycleTitle : "0",
        hint: evaluationSummary.cycleId
          ? `${evaluationSummary.completionPercent}% review completion aligned to the current BSC window.`
          : "Select a live evaluation cycle to join scorecard and review signals.",
        icon: Workflow,
      },
    ],
    [
      evaluationSummary.completionPercent,
      evaluationSummary.cycleId,
      evaluationSummary.cycleTitle,
      goalData.length,
      kpiData.length,
      perspectiveData.length,
    ]
  );
  const governanceMetrics = useMemo<RoleHomeMetric[]>(
    () => [
      {
        label: "Governed KPIs",
        value: String(kpiData.length),
        hint: "KPIs formally attached to strategic goals in the live scorecard.",
        icon: Target,
      },
      {
        label: "On-track rate",
        value: kpiData.length > 0
          ? `${Math.round((kpiData.filter((kpi) => kpi.status === "on_track").length / kpiData.length) * 100)}%`
          : "0%",
        hint: "Share of governed KPIs currently on track.",
        icon: ShieldCheck,
      },
      {
        label: "Monthly cadence",
        value: `${kpiData.filter((kpi) => kpi.frequency.toLowerCase().includes("month")).length} KPIs`,
        hint: "Largest update load sits in monthly review cycles.",
        icon: Calendar,
      },
      {
        label: "At-risk signals",
        value: String(kpiData.filter((kpi) => kpi.status !== "on_track").length),
        hint: "KPIs needing governance attention before the next close.",
        icon: CircleAlert,
      },
    ],
    [kpiData]
  );
  const overviewMetrics = useMemo(
    () => ({
      perspectives: perspectiveData.length,
      goals: goalData.length,
      kpis: kpiData.length,
      cascadeReadiness:
        initiativeData.length > 0
          ? `${Math.round(initiativeData.reduce((sum, initiative) => sum + initiative.progress, 0) / initiativeData.length)}%`
          : "0%",
    }),
    [goalData.length, initiativeData, kpiData.length, perspectiveData.length]
  );
  const averagePerspectiveScore = averageScore(perspectiveData.map((perspective) => perspective.score));
  const averageManagerScore = averageScore(managerPerformanceData.map((manager) => manager.score));
  const averageEmployeeScore = averageScore(employeePerformanceData.map((employee) => employee.score));
  const averageContributionProgress = averageScore(
    employeeContributionData.map((contribution) => contribution.progress)
  );
  const averageContributionScore = averageScore(
    employeeContributionData.map((contribution) => contribution.score)
  );
  const employeeContributionDetails = useMemo(
    () =>
      employeeContributionData.map((item) => {
        const kpi = item.kpiId
          ? kpiData.find((candidate) => candidate.id === item.kpiId) ?? null
          : null;
        const goal = kpi
          ? goalData.find((candidate) => candidate.id === kpi.goalId) ?? null
          : null;
        const perspective = kpi
          ? perspectiveData.find((candidate) => candidate.id === kpi.perspectiveId) ?? null
          : null;
        return {
          item,
          kpi,
          goal,
          perspective,
        };
      }),
    [employeeContributionData, goalData, kpiData, perspectiveData]
  );
  const employeeKpiAssignmentDetails = useMemo(
    () =>
      employeeKpiAssignmentData.map((assignment) => {
        const kpi = kpiData.find((candidate) => candidate.id === assignment.kpiId) ?? null;
        const goal = kpi
          ? goalData.find((candidate) => candidate.id === kpi.goalId) ?? null
          : null;
        const perspective = kpi
          ? perspectiveData.find((candidate) => candidate.id === kpi.perspectiveId) ?? null
          : null;
        return {
          assignment,
          kpi,
          goal,
          perspective,
        };
      }),
    [employeeKpiAssignmentData, goalData, kpiData, perspectiveData]
  );
  const employeeLinkedKpiCount = new Set(
    [
      ...employeeContributionDetails.map((entry) => entry.kpi?.id),
      ...employeeKpiAssignmentDetails.map((entry) => entry.assignment.kpiId),
    ].filter((value): value is string => Boolean(value))
  ).size;
  const employeeGoalCount = new Set(
    [
      ...employeeContributionDetails.map((entry) => entry.goal?.id),
      ...employeeKpiAssignmentDetails.map((entry) => entry.goal?.id),
    ].filter((value): value is string => Boolean(value))
  ).size;
  const employeePrimaryContribution = employeeContributionDetails[0] ?? null;
  const linkedContributionDetails = employeeContributionDetails.filter((d) => d.kpi !== null);
  const unlinkedContributionDetails = employeeContributionDetails.filter((d) => d.kpi === null);
  const linkedPrimaryContribution = linkedContributionDetails[0] ?? null;
  const employeeKpiScore = averageScore(employeeKpiAssignmentData.map((assignment) => assignment.score));
  const employeeDisplayScore =
    employeeKpiAssignmentData.length > 0 ? employeeKpiScore : averageContributionScore;
  const employeeWorkItemCount = employeeContributionData.length + employeeKpiAssignmentData.length;
  const employeePendingKpiUpdateCount = employeeKpiAssignmentData.filter(
    (assignment) => assignment.status !== "on_track" || assignment.actualProgress <= 0
  ).length;
  const employeePendingUpdateCount = employeeContributionData.filter(
    (item) => !item.acknowledged || item.status !== "on_track"
  ).length + employeePendingKpiUpdateCount;
  const employeeAcknowledgedCount = employeeContributionData.filter((item) => item.acknowledged).length;
  const employeeOverallStatus: StatusTone | null =
    employeeWorkItemCount === 0
      ? null
      : employeePendingUpdateCount === 0
        ? "on_track"
        : (employeeKpiAssignmentData.length > 0 ? employeeKpiScore : averageContributionProgress) >= 70
          ? "at_risk"
          : "off_track";
  const atRiskGoalCount = goalData.filter((goal) => goal.status !== "on_track").length;
  const atRiskKpiCount = kpiData.filter((kpi) => kpi.status !== "on_track").length;
  const atRiskInitiativeCount = initiativeData.filter((initiative) => initiative.status !== "on_track").length;
  const financialKpis = kpiData.filter((kpi) => kpi.perspectiveId === "financial");
  const customerKpis = kpiData.filter((kpi) => kpi.perspectiveId === "customer");
  const internalKpis = kpiData.filter((kpi) => kpi.perspectiveId === "internal");
  const peopleKpis = kpiData.filter((kpi) => kpi.perspectiveId === "people");
  const customerGoalIds = new Set(
    goalData.filter((goal) => goal.perspectiveId === "customer").map((goal) => goal.id)
  );
  const financialGoalIds = new Set(
    goalData.filter((goal) => goal.perspectiveId === "financial").map((goal) => goal.id)
  );
  const internalGoalIds = new Set(
    goalData.filter((goal) => goal.perspectiveId === "internal").map((goal) => goal.id)
  );
  const customerInitiatives = initiativeData.filter((initiative) => customerGoalIds.has(initiative.goalId));
  const financialInitiatives = initiativeData.filter((initiative) => financialGoalIds.has(initiative.goalId));
  const internalInitiatives = initiativeData.filter((initiative) => internalGoalIds.has(initiative.goalId));
  const gmpCascadeCards = cascadeInitiativeData
    .filter(
      (initiative) =>
        initiative.scopeRole === "gmp" ||
        (initiative.scopeRole === "hr" && initiative.drilldownCount > 0)
    )
    .map((initiative) => ({
      id: initiative.id,
      title: initiative.title,
      owner: initiative.owner,
      summary: initiative.summary,
      dueDate: initiative.dueDate,
      timeline: initiative.timeline,
      badge:
        initiative.scopeRole === "gmp"
          ? "GMP layer"
          : `${initiative.drilldownCount} downstream layers`,
      status: initiative.status,
      progress: initiative.progress,
    }));
  const partnerCascadeCards = cascadeInitiativeData
    .filter((initiative) => initiative.scopeRole === "partner")
    .map((initiative) => ({
      id: initiative.id,
      title: initiative.title,
      owner: initiative.owner,
      summary: initiative.summary,
      dueDate: initiative.dueDate,
      timeline: initiative.timeline,
      badge: "Partner initiative",
      status: initiative.status,
      progress: initiative.progress,
    }));
  const managerCascadeCardsLive = cascadeInitiativeData
    .filter((initiative) => initiative.scopeRole === "manager")
    .map((initiative) => ({
      id: initiative.id,
      title: initiative.title,
      owner: initiative.owner,
      summary: initiative.summary,
      dueDate: initiative.dueDate,
      timeline: initiative.timeline,
      badge: "Manager deliverable",
      status: initiative.status,
      progress: initiative.progress,
    }));
  const marketingCascadeCards = cascadeInitiativeData
    .filter((initiative) => initiative.perspectiveId === "customer")
    .map((initiative) => ({
      id: initiative.id,
      title: initiative.title,
      owner: initiative.owner,
      summary: initiative.summary,
      dueDate: initiative.dueDate,
      timeline: initiative.timeline,
      badge:
        initiative.scopeRole === "partner"
          ? "Portfolio handoff"
          : initiative.scopeRole === "manager"
            ? "Delivery follow-through"
            : "Growth-aligned initiative",
      status: initiative.status,
      progress: initiative.progress,
    }));
  const collectionsKpi = kpiData.find((kpi) => kpi.id === "kpi-3");
  const realizationKpi = kpiData.find((kpi) => kpi.id === "kpi-2");
  const retentionKpi = kpiData.find((kpi) => kpi.id === "kpi-4");
  const crossSellKpi = kpiData.find((kpi) => kpi.id === "kpi-5");
  const coachingKpi = kpiData.find((kpi) => kpi.id === "kpi-9");
  const acknowledgementStates = employeePerformanceData.map((employee) =>
    parseAcknowledgementState(employee.ack)
  );
  const acknowledgedEmployeeCount = acknowledgementStates.filter((state) => state.acknowledged).length;
  const pendingAcknowledgementCount = acknowledgementStates.filter((state) => state.pending).length;
  const overdueEmployeeCount = acknowledgementStates.filter((state) => state.overdue).length;
  const acknowledgementRate =
    employeePerformanceData.length > 0
      ? Math.round((acknowledgedEmployeeCount / employeePerformanceData.length) * 100)
      : 0;
  const managerEmployeeItems = employeePerformanceData.map((employee) => {
    const ackState = parseAcknowledgementState(employee.ack);
    return {
      id: `team-${employee.name.replace(/\s+/g, "-").toLowerCase()}`,
      employee: employee.name,
      title: `${employee.name} contribution follow-up`,
      dueDate: ackState.overdue ? "Immediate follow-up" : "Next weekly check-in",
      progress: employee.score,
      acknowledged: ackState.acknowledged,
      status: scoreToStatus(employee.score),
      note: employee.ack,
    };
  });
  const visibleSectionItems: RoleBoardItem[] = visibleTabs.map((tab) => ({
    label: tab.label,
    value: "Visible",
    note: `Available in the ${selectedRoleProfile.label} workspace.`,
  }));
  const selectedRoleHome = (() => {
    switch (selectedRole) {
      case "hr":
        return {
          ...selectedRoleHomeBase,
          primaryBoardTitle: "Governance state",
          primaryBoardDescription: "Current strategy and review signals pulled from the active BSC workspace.",
          secondaryBoardTitle: "Live scorecard state",
          secondaryBoardDescription: "Only live structure, KPI, initiative, and evaluation state is shown here.",
          metrics: setupMetrics,
          primaryBoardItems: [
            {
              label: "Perspective setup",
              value: `${perspectiveData.length} active perspectives`,
              note: `${goalData.length} firm-owned goals are already mapped into the current strategic structure.`,
              status: perspectiveData.length >= 4 ? "on_track" : "at_risk",
              progress: Math.min(100, Math.round((perspectiveData.length / 4) * 100)),
            },
            {
              label: "Strategic goals",
              value: `${goalData.length} active goals`,
              note: `${atRiskGoalCount} goals need closer governance attention before the next close.`,
              status: atRiskGoalCount === 0 ? "on_track" : "at_risk",
              progress: averagePerspectiveScore,
            },
            {
              label: "Review readiness",
              value: evaluationSummary.cycleTitle || `${initiativeData.length} initiatives in flight`,
              note: evaluationSummary.cycleId
                ? `${evaluationSummary.pendingAssignments} evaluation assignments are still open and ${evaluationSummary.overdueAssignments} are overdue in the selected cycle.`
                : `${atRiskInitiativeCount} initiatives are still at risk or off track in the live workspace.`,
              status: atRiskInitiativeCount === 0 ? "on_track" : "at_risk",
              progress: evaluationSummary.cycleId
                ? evaluationSummary.completionPercent
                : initiativeData.length > 0
                  ? averageScore(initiativeData.map((initiative) => initiative.progress))
                  : 0,
            },
          ],
          secondaryBoardItems: [
            {
              label: "Evaluation cycle",
              value: evaluationSummary.cycleId ? evaluationSummary.cycleTitle : "0",
              note: evaluationSummary.cycleId
                ? `${evaluationSummary.pendingAssignments} assignments are pending and ${evaluationSummary.overdueAssignments} are overdue.`
                : "Create or select an evaluation cycle to connect scorecard progress to reviews.",
            },
            {
              label: "KPIs",
              value: `${kpiData.length} configured`,
              note:
                atRiskKpiCount > 0
                  ? `${atRiskKpiCount} KPIs are currently amber or red.`
                  : "All live KPIs are currently on track.",
            },
            {
              label: "Cascade chain",
              value: `${featuredCascadeData.length} levels`,
              note: activeFeaturedRootInitiative
                ? `${activeFeaturedRootInitiative.title} is the active parent initiative in the shared cascade.`
                : "No featured cascade chain is available yet.",
            },
          ],
          allowedActions: [],
          hiddenByDefault: [],
        };
      case "gmp":
        return {
          ...selectedRoleHomeBase,
          primaryBoardTitle: "Executive review queue",
          primaryBoardDescription: "Live approval and risk signals from the current scorecard.",
          secondaryBoardTitle: "Current executive signals",
          secondaryBoardDescription: "Decision-ready items only, derived from the live structure and review state.",
          metrics: [
            {
              label: "Approval queue",
              value: String(atRiskInitiativeCount),
              hint: "Initiatives or chains needing executive review before they drift further.",
              icon: ShieldCheck,
            },
            {
              label: "At-risk goals",
              value: String(atRiskGoalCount),
              hint: "Strategic goals currently signalling amber or red.",
              icon: CircleAlert,
            },
            {
              label: "Cascade health",
              value: `${averageScore(featuredCascadeData.map((node) => node.progress))}%`,
              hint: "Average health across the live strategic chain now shown on the page.",
              icon: Workflow,
            },
            {
              label: "Review cycle",
              value: evaluationSummary.cycleId
                ? `${evaluationSummary.completionPercent}%`
                : `${averagePerspectiveScore}%`,
              hint: evaluationSummary.cycleId
                ? `${evaluationSummary.pendingAssignments} review assignments still need closure in ${evaluationSummary.cycleTitle}.`
                : "Average perspective score in the live executive scorecard.",
              icon: FileText,
            },
          ],
          primaryBoardItems: [
            {
              label: "Firm initiative approvals",
              value: `${atRiskInitiativeCount} needing decision`,
              note: gmpCascadeCards.length > 0
                ? `${gmpCascadeCards.length} executive-layer initiatives are currently visible in the approval queue.`
                : "No executive-layer initiatives are currently awaiting approval.",
              status: atRiskInitiativeCount > 0 ? "at_risk" : "on_track",
              progress: averageScore(initiativeData.map((initiative) => initiative.progress)),
            },
            {
              label: "Strategic risk items",
              value: `${atRiskGoalCount} goals flagged`,
              note: `${atRiskKpiCount} KPIs are also amber or red in the current executive slice.`,
              status: atRiskGoalCount > 0 ? "at_risk" : "on_track",
              progress: averagePerspectiveScore,
            },
            {
              label: "Executive review readiness",
              value: `${averagePerspectiveScore}%`,
              note: evaluationSummary.cycleId
                ? `${evaluationSummary.resultCount} scored results are available in ${evaluationSummary.cycleTitle}.`
                : `${perspectiveData.length} perspectives are contributing to the live executive score.`,
              status: scoreToStatus(averagePerspectiveScore),
              progress: averagePerspectiveScore,
            },
          ],
          secondaryBoardItems: [
            {
              label: "Escalated cascades",
              value: String(featuredCascadeData.filter((node) => node.status !== "on_track").length),
              note: featuredCascadeData.length > 0
                ? `${featuredCascadeData.filter((node) => node.status !== "on_track").length} cascade levels are amber or red.`
                : "No cascade chain is available yet.",
            },
            {
              label: "Review completion",
              value: evaluationSummary.cycleId ? `${evaluationSummary.completionPercent}%` : "0",
              note: evaluationSummary.cycleId
                ? `${evaluationSummary.submittedAssignments} of ${evaluationSummary.totalAssignments} assignments are submitted.`
                : "Start an evaluation cycle to join scorecard and review signals.",
            },
            {
              label: "Strategic KPI risks",
              value: String(atRiskKpiCount),
              note: atRiskKpiCount > 0
                ? `${atRiskKpiCount} KPIs need executive attention.`
                : "No KPI risks are currently flagged in the live scorecard.",
            },
          ],
          allowedActions: [],
          hiddenByDefault: [],
        };
      case "partner":
        return {
          ...selectedRoleHomeBase,
          primaryBoardTitle: "Portfolio performance focus",
          primaryBoardDescription: "Live client, manager, and initiative signals in the partner slice.",
          secondaryBoardTitle: "Current portfolio signals",
          secondaryBoardDescription: "Only live downstream coverage and account risk is shown here.",
          metrics: [
            {
              label: "Portfolio initiatives",
              value: String(partnerCascadeCards.length),
              hint: "Live initiatives currently translating the strategic KPI chain into portfolio execution.",
              icon: Briefcase,
            },
            {
              label: "Manager coverage",
              value: `${managerPerformanceData.length} teams`,
              hint: "Managers currently contributing to this live portfolio slice.",
              icon: Users,
            },
            {
              label: "Growth score",
              value: `${averageScore(
                perspectiveData
                  .filter((perspective) => ["financial", "customer", "internal"].includes(perspective.id))
                  .map((perspective) => perspective.score)
              )}%`,
              hint: "Average of the partner-relevant perspective scores.",
              icon: BarChart3,
            },
            {
              label: "Client risk",
              value: String(customerKpis.filter((kpi) => kpi.status !== "on_track").length),
              hint: "Customer KPIs in amber or red that still need portfolio attention.",
              icon: CircleAlert,
            },
          ],
          primaryBoardItems: [
            {
              label: "Partner initiatives",
              value: `${partnerCascadeCards.length} active`,
              note: `${customerInitiatives.length} of them are directly feeding customer and stakeholder outcomes.`,
              status: atRiskInitiativeCount > 0 ? "at_risk" : "on_track",
              progress: averageScore(partnerCascadeCards.map((initiative) => initiative.progress)),
            },
            {
              label: "Manager alignment",
              value: `${managerPerformanceData.length} managers in scope`,
              note: `${managerPerformanceData.filter((manager) => manager.score < 70).length} manager lanes need closer partner follow-through.`,
              status:
                managerPerformanceData.some((manager) => manager.score < 70) ? "at_risk" : "on_track",
              progress: averageManagerScore,
            },
            {
              label: "Client/account risk",
              value: `${customerKpis.filter((kpi) => kpi.status !== "on_track").length} KPI risks`,
              note: customerKpis.length > 0
                ? `${customerKpis.length} customer KPIs are feeding this portfolio slice.`
                : "No customer KPIs are mapped into this portfolio slice yet.",
              status:
                customerKpis.some((kpi) => kpi.status !== "on_track") ? "at_risk" : "on_track",
              progress: averageScore(customerKpis.map((kpi) => kpi.weightedScore)),
            },
          ],
          secondaryBoardItems: [
            {
              label: "Customer KPI risks",
              value: String(customerKpis.filter((kpi) => kpi.status !== "on_track").length),
              note: customerKpis.length > 0
                ? `${customerKpis.length} customer-facing KPIs are in scope for this portfolio view.`
                : "No customer KPIs are mapped into this view yet.",
            },
            {
              label: "Manager coverage",
              value: `${managerPerformanceData.length} teams`,
              note: managerPerformanceData.length > 0
                ? `${managerPerformanceData.filter((manager) => manager.score < 70).length} manager lanes are below the expected threshold.`
                : "No manager performance rows are available yet.",
            },
            {
              label: "Active portfolio initiatives",
              value: `${partnerCascadeCards.length} live`,
              note: customerInitiatives.length > 0
                ? `${customerInitiatives.length} initiatives directly support customer and stakeholder outcomes.`
                : "No portfolio initiatives are currently mapped into the customer slice.",
            },
          ],
          allowedActions: [],
          hiddenByDefault: [],
        };
      case "manager":
        return {
          ...selectedRoleHomeBase,
          primaryBoardTitle: "Team execution focus",
          primaryBoardDescription: "Live delivery, coaching, and acknowledgement signals for the manager lane.",
          secondaryBoardTitle: "Current team signals",
          secondaryBoardDescription: "This view is driven by live employee actions and manager-owned work only.",
          metrics: [
            {
              label: "Deliverables active",
              value: String(managerCascadeCardsLive.length),
              hint: "Live delivery workstreams currently flowing through the manager view.",
              icon: ClipboardCheck,
            },
            {
              label: "Employee actions",
              value: String(managerEmployeeItems.length),
              hint: "Employee contribution rows now pulled from the live workforce slice.",
              icon: Users,
            },
            {
              label: "Team contribution",
              value: `${averageEmployeeScore}%`,
              hint: "Average score of employees currently represented in the team board.",
              icon: Workflow,
            },
            {
              label: "Overdue items",
              value: String(overdueEmployeeCount),
              hint: "Overdue acknowledgement or action signals needing immediate manager follow-up.",
              icon: CircleAlert,
            },
          ],
          primaryBoardItems: [
            {
              label: "Team deliverables",
              value: `${managerCascadeCardsLive.length} active`,
              note: `${internalKpis.length} internal or people KPIs are currently visible in the manager operating slice.`,
              status: scoreToStatus(averageScore(internalKpis.map((kpi) => kpi.weightedScore))),
              progress: averageScore(managerCascadeCardsLive.map((initiative) => initiative.progress)),
            },
            {
              label: "Employee action queue",
              value: `${managerEmployeeItems.length} assigned actions`,
              note: `${pendingAcknowledgementCount} still need cleaner acknowledgement or status coverage.`,
              status: pendingAcknowledgementCount > 0 ? "at_risk" : "on_track",
              progress: averageScore(managerEmployeeItems.map((item) => item.progress)),
            },
            {
              label: "Coaching cadence",
              value: coachingKpi?.actual || `${averageScore(peopleKpis.map((kpi) => kpi.weightedScore))}%`,
              note:
                coachingKpi?.ownerUpdate ||
                `${peopleKpis.filter((kpi) => kpi.status !== "on_track").length} people KPIs need coaching follow-through.`,
              status: coachingKpi?.status || scoreToStatus(averageScore(peopleKpis.map((kpi) => kpi.weightedScore))),
              progress: coachingKpi?.weightedScore || averageScore(peopleKpis.map((kpi) => kpi.weightedScore)),
            },
          ],
          secondaryBoardItems: [
            {
              label: "Employee action queue",
              value: `${managerEmployeeItems.length} items`,
              note: managerEmployeeItems.length > 0
                ? `${pendingAcknowledgementCount} actions still need acknowledgement or cleaner status coverage.`
                : "No employee contribution items are currently assigned in this view.",
            },
            {
              label: "Overdue follow-up",
              value: String(overdueEmployeeCount),
              note: overdueEmployeeCount > 0
                ? `${overdueEmployeeCount} employee items are overdue.`
                : "No overdue employee follow-up is currently flagged.",
            },
            {
              label: "Manager-owned deliverables",
              value: `${managerCascadeCardsLive.length} live`,
              note: managerCascadeCardsLive.length > 0
                ? `${internalKpis.length} internal or people KPIs are represented in this operating slice.`
                : "No manager deliverables are linked to the active cascade yet.",
            },
          ],
          allowedActions: [],
          hiddenByDefault: [],
        };
      case "finance":
        return {
          ...selectedRoleHomeBase,
          primaryBoardTitle: "Financial control focus",
          primaryBoardDescription: "Live finance KPI and initiative signals only.",
          secondaryBoardTitle: "Current finance signals",
          secondaryBoardDescription: "Collections, realization, and finance execution are derived from the active workspace.",
          metrics: [
            {
              label: "Financial KPIs",
              value: `${financialKpis.length} live`,
              hint: "Financial perspective measures synced from current operational data.",
              icon: BarChart3,
            },
            {
              label: "Collections risk",
              value: collectionsKpi?.actual || "0",
              hint: "Current collection-cycle signal against the live target contract.",
              icon: Activity,
            },
            {
              label: "Weighted score",
              value: String(averageScore(financialKpis.map((kpi) => kpi.weightedScore))),
              hint: "Average score across the live financial KPI mix.",
              icon: Target,
            },
            {
              label: "Close tasks",
              value: String(financialKpis.filter((kpi) => kpi.status !== "on_track").length),
              hint: "Financial measures still needing commentary or intervention.",
              icon: FileText,
            },
          ],
          primaryBoardItems: [
            {
              label: "Realization",
              value: realizationKpi?.actual || "0",
              note: realizationKpi?.ownerUpdate || "No live realization KPI is mapped yet.",
              status: realizationKpi?.status || "at_risk",
              progress: realizationKpi?.weightedScore || 0,
            },
            {
              label: "Collections cycle",
              value: collectionsKpi?.actual || "0",
              note: collectionsKpi?.ownerUpdate || "No live collections KPI is mapped yet.",
              status: collectionsKpi?.status || "at_risk",
              progress: collectionsKpi?.weightedScore || 0,
            },
            {
              label: "Finance initiatives",
              value: `${financialInitiatives.length} active`,
              note: `${financialKpis.filter((kpi) => kpi.status !== "on_track").length} financial KPIs still need stronger recovery action.`,
              status:
                financialKpis.some((kpi) => kpi.status !== "on_track") ? "at_risk" : "on_track",
              progress: averageScore(financialInitiatives.map((initiative) => initiative.progress)),
            },
          ],
          secondaryBoardItems: [
            {
              label: "Realization KPI",
              value: realizationKpi?.actual || "Not mapped",
              note: realizationKpi?.ownerUpdate || "No live realization KPI is mapped yet.",
            },
            {
              label: "Collections KPI",
              value: collectionsKpi?.actual || "Not mapped",
              note: collectionsKpi?.ownerUpdate || "No live collections KPI is mapped yet.",
            },
            {
              label: "Finance initiatives",
              value: `${financialInitiatives.length} live`,
              note: financialInitiatives.length > 0
                ? `${financialKpis.filter((kpi) => kpi.status !== "on_track").length} financial KPIs still need recovery action.`
                : "No finance initiatives are linked to the active scorecard yet.",
            },
          ],
          allowedActions: [],
          hiddenByDefault: [],
        };
      case "marketing":
        return {
          ...selectedRoleHomeBase,
          primaryBoardTitle: "Customer-growth focus",
          primaryBoardDescription: "Live retention, cross-sell, and customer initiative signals only.",
          secondaryBoardTitle: "Current customer signals",
          secondaryBoardDescription: "This view is driven by actual customer KPI and initiative data.",
          metrics: [
            {
              label: "Customer KPIs",
              value: `${customerKpis.length} live`,
              hint: "Customer and stakeholder measures synced from live proposal and survey data.",
              icon: Users,
            },
            {
              label: "Cross-sell",
              value: crossSellKpi?.actual || "0",
              hint: "Current customer growth signal from the live conversion KPI.",
              icon: Target,
            },
            {
              label: "Client insight actions",
              value: String(marketingCascadeCards.length),
              hint: "Open growth initiatives currently feeding the customer KPI chain.",
              icon: Workflow,
            },
            {
              label: "Feedback watch",
              value: String(customerKpis.filter((kpi) => kpi.status !== "on_track").length),
              hint: "Customer KPIs still showing amber or red movement.",
              icon: MessageSquare,
            },
          ],
          primaryBoardItems: [
            {
              label: "Retention support",
              value: retentionKpi?.actual || "0",
              note: retentionKpi?.ownerUpdate || "No live retention KPI is mapped yet.",
              status: retentionKpi?.status || "at_risk",
              progress: retentionKpi?.weightedScore || 0,
            },
            {
              label: "Cross-sell conversion",
              value: crossSellKpi?.actual || "0",
              note: crossSellKpi?.ownerUpdate || "No live cross-sell KPI is mapped yet.",
              status: crossSellKpi?.status || "at_risk",
              progress: crossSellKpi?.weightedScore || 0,
            },
            {
              label: "Client insight actions",
              value: `${marketingCascadeCards.length} active`,
              note: `${customerKpis.filter((kpi) => kpi.status !== "on_track").length} customer KPIs still need stronger handoff and follow-through.`,
              status:
                customerKpis.some((kpi) => kpi.status !== "on_track") ? "at_risk" : "on_track",
              progress: averageScore(marketingCascadeCards.map((initiative) => initiative.progress)),
            },
          ],
          secondaryBoardItems: [
            {
              label: "Retention KPI",
              value: retentionKpi?.actual || "Not mapped",
              note: retentionKpi?.ownerUpdate || "No live retention KPI is mapped yet.",
            },
            {
              label: "Cross-sell KPI",
              value: crossSellKpi?.actual || "Not mapped",
              note: crossSellKpi?.ownerUpdate || "No live cross-sell KPI is mapped yet.",
            },
            {
              label: "Growth initiatives",
              value: `${marketingCascadeCards.length} live`,
              note: marketingCascadeCards.length > 0
                ? `${customerKpis.filter((kpi) => kpi.status !== "on_track").length} customer KPIs still need stronger handoff and follow-through.`
                : "No marketing initiatives are linked to the active cascade yet.",
            },
          ],
          allowedActions: [],
          hiddenByDefault: [],
        };
      case "employee":
        return {
          ...selectedRoleHomeBase,
          primaryBoardTitle: "My contribution focus",
          primaryBoardDescription: "Live employee actions and acknowledgement state only.",
          secondaryBoardTitle: "Current work signals",
          secondaryBoardDescription: "This view is driven by assigned contribution items, not generic submodule examples.",
          metrics: [
            {
              label: "Assigned items",
              value: String(employeeWorkItemCount),
              hint: "Assigned KPIs and contribution items owned by the signed-in employee slice.",
              icon: ClipboardCheck,
            },
            {
              label: "Progress",
              value: `${employeeKpiAssignmentData.length > 0 ? employeeKpiScore : averageContributionProgress}%`,
              hint: "Average score across assigned employee KPIs, falling back to contribution progress.",
              icon: Activity,
            },
            {
              label: "My score",
              value: String(employeeDisplayScore),
              hint: "Current score pulled from assigned KPI targets and live contribution actions.",
              icon: BarChart3,
            },
            {
              label: "Pending updates",
              value: String(employeePendingUpdateCount),
              hint: "Assigned KPIs or contribution items still needing employee action.",
              icon: CheckCircle2,
            },
          ],
          primaryBoardItems: [
            {
              label: "Assigned actions",
              value: `${employeeWorkItemCount} active`,
              note: evaluationSummary.cycleId
                ? `${evaluationSummary.cycleTitle} is the active cycle for these contribution items.`
                : `${employeeContributionData.filter((item) => item.status !== "on_track").length} assigned items are currently amber or red.`,
              status:
                employeeWorkItemCount > 0
                  ? scoreToStatus(employeeDisplayScore)
                  : undefined,
              progress: employeeDisplayScore,
            },
            {
              label: "Acknowledgement",
              value: `${employeeContributionData.filter((item) => item.acknowledged).length} of ${employeeContributionData.length} done`,
              note: `${employeeContributionData.filter((item) => !item.acknowledged).length} items still need acknowledgement before tracking is complete.`,
              status:
                employeeContributionData.every((item) => item.acknowledged) ? "on_track" : "at_risk",
              progress:
                employeeContributionData.length > 0
                  ? Math.round(
                      (employeeContributionData.filter((item) => item.acknowledged).length /
                        employeeContributionData.length) *
                        100
                    )
                  : 0,
            },
            {
              label: "Manager notes",
              value: `${employeeContributionData.filter((item) => item.managerComment).length} live notes`,
              note: employeeContributionData.filter((item) => item.managerComment).length > 0
                ? `${employeeContributionData.filter((item) => item.managerComment).length} contribution items include manager commentary.`
                : "No manager commentary is attached to the current contribution items.",
              status: "on_track",
              progress: 100,
            },
          ],
          secondaryBoardItems: [
            {
              label: "Assigned actions",
              value: `${employeeContributionData.length} active`,
              note: employeeContributionData.length > 0
                ? `${employeeContributionData.filter((item) => !item.acknowledged).length} items still need acknowledgement.`
                : "No live contribution items are assigned yet.",
            },
            {
              label: "Average progress",
              value: `${employeeKpiAssignmentData.length > 0 ? employeeKpiScore : averageContributionProgress}%`,
              note: employeeWorkItemCount > 0
                ? `${employeeDisplayScore} is the current score across assigned KPI and contribution work.`
                : "Progress will appear once contribution items are assigned.",
            },
            {
              label: "Manager notes",
              value: `${employeeContributionData.filter((item) => item.managerComment).length} live`,
              note: employeeContributionData.some((item) => item.managerComment)
                ? "Manager commentary is attached to the live contribution items in this workspace."
                : "No manager notes are attached to the current contribution items.",
            },
          ],
          allowedActions: [],
          hiddenByDefault: [],
        };
      default:
        return {
          ...selectedRoleHomeBase,
          secondaryBoardItems: visibleSectionItems,
          allowedActions: [],
          hiddenByDefault: [],
        };
    }
  })();

  const cascadeView = (() => {
    switch (selectedRole) {
      case "gmp":
        return {
          title: "Executive approval flow",
          description: "GMP should see approvals, escalations, and the strength of the strategic chain before it moves deeper into portfolio execution.",
          metrics: [
            {
              label: "Pending approvals",
              value: String(gmpCascadeCards.filter((card) => card.status !== "on_track").length),
              hint: "Initiatives still needing executive scrutiny before they move further down the chain.",
              icon: ShieldCheck,
            },
            {
              label: "Escalated cascades",
              value: String(featuredCascadeData.filter((node) => node.status !== "on_track").length),
              hint: "Live cascade layers currently signalling amber or red.",
              icon: CircleAlert,
            },
            {
              label: "Executive review cadence",
              value: evaluationSummary.cycleId
                ? `${evaluationSummary.completionPercent}%`
                : `${averagePerspectiveScore}%`,
              hint: evaluationSummary.cycleId
                ? `Current review completion in ${evaluationSummary.cycleTitle}.`
                : "Current executive scorecard health across the live perspective mix.",
              icon: Calendar,
            },
          ],
          cards: gmpCascadeCards,
          boardTitle: "Approval queue",
        };
      case "partner":
        return {
          title: "Portfolio cascade board",
          description: "Partners need a portfolio view of approved parent initiatives, account plans, and manager commitments tied to the same KPI outcome.",
          metrics: [
            {
              label: "Parent initiatives",
              value: String(partnerCascadeCards.length),
              hint: "Approved initiatives the partner portfolio is translating into account-level work.",
              icon: Briefcase,
            },
            {
              label: "Manager plans",
              value: String(managerPerformanceData.length),
              hint: "Managers currently visible in the live portfolio review slice.",
              icon: Users,
            },
            {
              label: "Accounts at risk",
              value: String(customerKpis.filter((kpi) => kpi.status !== "on_track").length),
              hint: "Customer KPI signals needing partner intervention before they affect portfolio health.",
              icon: CircleAlert,
            },
          ],
          cards: partnerCascadeCards,
          boardTitle: "Portfolio initiatives",
        };
      case "manager":
        return {
          title: "Team delivery cascade",
          description: "Managers convert partner priorities into concrete team deliverables and employee actions, with coaching and due-date discipline built in.",
          metrics: [
            {
              label: "Team deliverables",
              value: String(managerCascadeCardsLive.length),
              hint: "Manager-owned deliverables actively contributing to the parent initiative.",
              icon: ClipboardCheck,
            },
            {
              label: "Employee actions",
              value: String(managerEmployeeItems.length),
              hint: "Named employee contributions pulled from the live workforce slice.",
              icon: Users,
            },
            {
              label: "Overdue follow-up",
              value: String(overdueEmployeeCount),
              hint: "Actions needing escalation, coaching, or acknowledgement follow-through.",
              icon: CircleAlert,
            },
          ],
          cards: managerCascadeCardsLive,
          boardTitle: "Team deliverables",
        };
      case "marketing":
        return {
          title: "Customer-growth alignment",
          description: "Marketing needs a clean view of how customer insight, sponsorship support, and campaign work plug into the shared growth KPI chain.",
          metrics: [
            {
              label: "Growth initiatives",
              value: String(marketingCascadeCards.length),
              hint: "Marketing-owned actions linked to customer and stakeholder goals.",
              icon: Workflow,
            },
            {
              label: "Client insight briefs",
              value: String(customerKpis.length),
              hint: "Customer KPI signals currently feeding partner and manager follow-through.",
              icon: MessageSquare,
            },
            {
              label: "Handoffs to partners",
              value: String(managerPerformanceData.length),
              hint: "Current downstream manager lanes influenced by the customer-growth slice.",
              icon: ArrowRight,
            },
          ],
          cards: marketingCascadeCards,
          boardTitle: "Growth initiatives",
        };
      default:
        return {
          title: "Initiative module and cascade view",
          description: "Initiatives are the execution layer. They are defined at firm level, then translated into more specific work at lower levels without losing the strategic KPI alignment.",
          metrics: [
            {
              label: "Firm initiatives",
              value: String(initiativeData.length),
              hint: "The current set of firm-level initiatives linked to strategic goals and KPIs.",
              icon: Briefcase,
            },
            {
              label: "Active cascade layers",
              value: String(featuredCascadeData.length),
              hint: "HR to employee layers represented in the active live chain.",
              icon: Workflow,
            },
            {
              label: "Employee coverage",
              value: `${acknowledgementRate}%`,
              hint: "Share of visible employee work with acknowledgement or progress visibility.",
              icon: Users,
            },
          ],
          cards: initiativeData.map((initiative) => ({
            id: initiative.id,
            title: initiative.title,
            owner: initiative.owner,
            summary: initiative.summary,
            dueDate: initiative.dueDate,
            timeline: initiative.timeline,
            badge: `${initiative.drilldownCount} drill-down layers`,
            status: initiative.status,
            progress: initiative.progress,
          })),
          boardTitle: "Firm initiatives",
        };
    }
  })();

  const trackingView = (() => {
    const employeeScopedKpiIds = new Set(
      employeeContributionData.map((item) => item.kpiId).filter(Boolean)
    );
    const kpis = filteredKpis.filter((kpi) =>
      selectedRole === "employee" ? employeeScopedKpiIds.has(kpi.id) : true
    );
    const averageScore = kpis.length > 0 ? Math.round(kpis.reduce((sum, kpi) => sum + kpi.weightedScore, 0) / kpis.length) : 0;
    const riskCount = kpis.filter((kpi) => kpi.status !== "on_track").length;
    const averageInitiativeProgress = kpis.length > 0 ? Math.round(kpis.reduce((sum, kpi) => sum + kpi.initiativeProgress, 0) / kpis.length) : 0;

    const shared = {
      kpis,
      metrics: [
        { label: "Tracked KPIs", value: String(kpis.length), hint: "KPIs visible in this role's tracking lens.", icon: Target },
        { label: "Average weighted score", value: String(averageScore), hint: "Composite signal from the role-scoped KPI mix.", icon: BarChart3 },
        { label: "At risk / off track", value: String(riskCount), hint: "Signals that need commentary, intervention, or closer follow-up.", icon: CircleAlert },
        { label: "Initiative completion", value: `${averageInitiativeProgress}%`, hint: "Average execution-layer health across the tracked KPIs.", icon: Workflow },
      ] satisfies RoleHomeMetric[],
    };

    switch (selectedRole) {
      case "gmp":
        return { ...shared, title: "Executive tracking", boardTitle: "KPI watchlist" };
      case "partner":
        return { ...shared, title: "Portfolio tracking", boardTitle: "Portfolio KPIs" };
      case "manager":
        return { ...shared, title: "Team tracking", boardTitle: "Team KPIs" };
      case "finance":
        return { ...shared, title: "Financial KPI tracking", boardTitle: "Financial KPIs" };
      case "marketing":
        return { ...shared, title: "Growth KPI tracking", boardTitle: "Growth KPIs" };
      default:
        return { ...shared, title: "KPI tracking", boardTitle: "KPI board" };
    }
  })();

  const employeeView = (() => {
    if (selectedRole === "manager") {
      return {
        title: "Team actions",
        description: "Managers should see employee acknowledgements, progress, and coaching notes without carrying the full firm structure.",
        metrics: [
          {
            label: "Assigned actions",
            value: String(managerEmployeeItems.length),
            hint: "Employee actions currently visible in this manager's live team slice.",
            icon: ClipboardCheck,
          },
          {
            label: "Pending acknowledgement",
            value: String(pendingAcknowledgementCount),
            hint: "Actions that still need acknowledgement before progress becomes trustworthy.",
            icon: CheckCircle2,
          },
          {
            label: "Average progress",
            value: `${averageScore(managerEmployeeItems.map((item) => item.progress))}%`,
            hint: "Progress across active employee contribution items.",
            icon: Activity,
          },
          {
            label: "Intervention needed",
            value: String(managerEmployeeItems.filter((item) => item.status !== "on_track").length),
            hint: "Employees or actions that need an immediate manager follow-up.",
            icon: CircleAlert,
          },
        ],
        items: managerEmployeeItems,
      };
    }

    if (selectedRole === "hr") {
      return {
        title: "Workforce contribution view",
        description: "HR should see workforce acknowledgement, contribution health, and where employee follow-through is weakening the cascade.",
        metrics: [
          {
            label: "Employees in scope",
            value: String(employeePerformanceData.length),
            hint: "Employees with active contribution items in the current workforce slice.",
            icon: Users,
          },
          {
            label: "Acknowledgement rate",
            value: `${acknowledgementRate}%`,
            hint: "Share of assigned employee items already acknowledged or in motion.",
            icon: CheckCircle2,
          },
          {
            label: "Average contribution",
            value: String(averageEmployeeScore),
            hint: "Weighted contribution score across the current workforce slice.",
            icon: BarChart3,
          },
          {
            label: "Needs escalation",
            value: String(employeePerformanceData.filter((employee) => employee.score < 65).length + overdueEmployeeCount),
            hint: "Employees or teams needing HR follow-up on the cascade health.",
            icon: CircleAlert,
          },
        ],
        items: employeePerformanceData.map((employee) => ({
          id: `hr-workforce-${employee.name}`,
          employee: employee.name,
          title: `${employee.name} contribution health`,
          dueDate: parseAcknowledgementState(employee.ack).overdue ? "Immediate follow-up" : "Monthly review pack",
          progress: employee.score,
          acknowledged: employee.ack.toLowerCase().includes("all") || employee.ack.startsWith("2/3"),
          status: employee.score >= 75 ? "on_track" : employee.score >= 60 ? "at_risk" : "off_track",
          note: employee.ack,
        })),
      };
    }

    return {
      title: "Employee view",
      metrics: [
        {
          label: "Current period",
          value: evaluationSummary.cycleTitle || "Live KPI view",
          hint: evaluationSummary.startDate && evaluationSummary.endDate
            ? `${new Date(evaluationSummary.startDate).toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "short",
              })} to ${new Date(evaluationSummary.endDate).toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "short",
              })}.`
            : "Your current contribution window and review pack.",
          icon: Calendar,
        },
        {
          label: "Strategic links",
          value: `${employeeGoalCount} goals - ${employeeLinkedKpiCount} KPIs`,
          hint: "The goals and KPIs this employee currently supports.",
          icon: Target,
        },
        {
          label: "Updates needed",
          value: String(employeePendingUpdateCount),
          hint: "Items needing acknowledgement, progress, or recovery action.",
          icon: ClipboardCheck,
        },
        {
          label: "My score",
          value: String(employeeDisplayScore),
          hint: "Current score from assigned KPIs and contribution work items.",
          icon: BarChart3,
        },
      ],
      items: [
        ...employeeKpiAssignmentData.map((assignment) => ({
          id: `kpi-assignment-${assignment.id}`,
          employee: "Me",
          title: assignment.kpiName,
          dueDate: assignment.dueDate || "Current period",
          progress: assignment.score,
          acknowledged: assignment.status === "on_track",
          status: assignment.status,
          note: `Target ${assignment.individualTarget ?? "default"}; actual ${assignment.actualProgress}%.`,
        })),
        ...employeeContributionData.map((item) => ({
          id: item.id,
          employee: "Me",
          title: item.title,
          dueDate: item.dueDate,
          progress: item.progress,
          acknowledged: item.acknowledged,
          status: item.status,
          note: item.managerComment,
        })),
      ],
    };
  })();

  const reportsView = (() => {
    const perspectiveRows = perspectiveData;
    const departmentRows =
      selectedRole === "finance"
        ? departmentPerformanceData.slice(0, 3)
        : selectedRole === "marketing"
          ? departmentPerformanceData.filter((department) => department.status !== "off_track").slice(0, 3)
          : selectedRole === "partner"
            ? departmentPerformanceData.filter((department) => department.status !== "off_track").slice(0, 4)
            : departmentPerformanceData;
    const managerRows: WorkspaceManagerRow[] =
      selectedRole === "gmp" || selectedRole === "hr" || selectedRole === "partner"
        ? managerPerformanceData
        : [];
    const employeeRows: WorkspaceEmployeeRow[] =
      selectedRole === "gmp" || selectedRole === "hr" || selectedRole === "partner"
        ? employeePerformanceData
        : [];
    const reportBlocks = reportBlockData.map((block) =>
      block.label === "Performance by manager"
        ? {
            ...block,
            value: `${managerRows.length} managers`,
            hint:
              managerRows.length > 0
                ? block.hint
                : "No manager rows are in scope for the current workspace.",
          }
        : block
    );

    switch (selectedRole) {
      case "gmp":
        return {
          title: "Executive review layout",
          description: "GMP reporting should stay short, strategic, and risk-led: perspective movement, portfolio health, and decisions needed now.",
          blocks: [
            { label: "Executive scorecards", value: `${perspectiveRows.length} perspectives`, hint: "High-level movement across the strategic map." },
            { label: "Partner portfolios", value: `${departmentRows.length} departments`, hint: "Portfolio slices summarized for executive review." },
            { label: "Red / amber KPIs", value: String(atRiskKpiCount), hint: "Items needing a decision, escalation, or direct intervention." },
            { label: "Snapshot readiness", value: `${averagePerspectiveScore}%`, hint: "Current review-readiness signal from the live scorecard." },
          ],
          perspectiveRows,
          departmentRows,
          managerRows,
          employeeRows,
        };
      case "partner":
        return {
          title: "Portfolio review layout",
          description: "Partner reporting should focus on portfolio movement, manager execution, and where account risks are affecting the KPI chain.",
          blocks: [
            {
              label: "Portfolio score",
              value: `${averageScore(perspectiveRows.map((perspective) => perspective.score))}%`,
              hint: "Weighted score for the partner's current portfolio slice.",
            },
            { label: "Managers in scope", value: String(managerRows.length), hint: "Managers contributing to the current portfolio review." },
            {
              label: "At-risk accounts",
              value: String(customerKpis.filter((kpi) => kpi.status !== "on_track").length),
              hint: "Strategic customer signals needing stronger partner attention.",
            },
            { label: "Initiatives active", value: String(initiativeData.length), hint: "Partner and manager initiatives under the current portfolio." },
          ],
          perspectiveRows,
          departmentRows,
          managerRows,
          employeeRows,
        };
      case "finance":
        return {
          title: "Financial review layout",
          description: "Finance reporting should be focused on the financial perspective, collection pressure, close notes, and initiative support.",
          blocks: [
            { label: "Financial KPIs", value: String(perspectiveRows.length), hint: "The financial lens only, without unrelated perspectives." },
            { label: "Collections pressure", value: collectionsKpi?.actual || "0", hint: "Current collection-cycle signal against the target." },
            {
              label: "Close notes open",
              value: String(financialKpis.filter((kpi) => kpi.status !== "on_track").length),
              hint: "Finance-owned period-close commentary still outstanding.",
            },
            {
              label: "Recovery initiatives",
              value: String(financialInitiatives.length),
              hint: "Finance initiatives supporting realization and collections.",
            },
          ],
          perspectiveRows,
          departmentRows,
          managerRows,
          employeeRows,
        };
      case "marketing":
        return {
          title: "Growth review layout",
          description: "Marketing reporting should show how customer insight, conversion, and sponsor support are influencing shared growth outcomes.",
          blocks: [
            { label: "Customer KPIs", value: String(perspectiveRows.length), hint: "The customer and stakeholder growth lens." },
            { label: "Cross-sell watch", value: crossSellKpi?.actual || "0", hint: "Current conversion performance against the target." },
            {
              label: "Survey actions",
              value: `${customerKpis.filter((kpi) => kpi.status !== "on_track").length} open`,
              hint: "Client listening and growth actions still feeding the KPI chain.",
            },
            {
              label: "Initiative support",
              value: `${averageScore(customerInitiatives.map((initiative) => initiative.progress))}%`,
              hint: "Average progress of marketing-linked initiatives.",
            },
          ],
          perspectiveRows,
          departmentRows,
          managerRows,
          employeeRows,
        };
      default:
        return {
          title: "Reporting roll-up",
          description: "Perspective, department, manager, employee, KPI, and initiative summaries from the live workspace.",
          blocks: reportBlocks,
          perspectiveRows,
          departmentRows,
          managerRows,
          employeeRows,
        };
    }
  })();

  const refreshBalancedScorecardData = (_role?: RoleKey) => {
    queryClient.invalidateQueries({ queryKey: ["bsc-workspace"] });
    queryClient.invalidateQueries({ queryKey: ["bsc-structure"] });
    queryClient.invalidateQueries({ queryKey: ["bsc-governance"] });
    queryClient.invalidateQueries({ queryKey: ["bsc-kpi-assignments"] });
    queryClient.invalidateQueries({ queryKey: ["bsc-performance-bands"] });
    queryClient.invalidateQueries({ queryKey: ["bsc-measurement-periods"] });
    queryClient.invalidateQueries({ queryKey: ["bsc-measurement-snapshots"] });
    queryClient.invalidateQueries({ queryKey: ["bsc-measurement-review-pack"] });
    queryClient.invalidateQueries({ queryKey: ["bsc-contribution-detail"] });
  };

  const closeContributionDialogs = () => {
    setContributionDialogMode(null);
    setSelectedContributionId(null);
    setContributionProgressForm({ progress: "", comment: "" });
    setContributionEvidenceNote("");
    setContributionEvidenceFile(null);
  };

  const openContributionDetail = (item: EmployeeContribution) => {
    setSelectedContributionId(item.id);
    setContributionDialogMode("detail");
  };

  const openContributionProgressDialog = (item: EmployeeContribution) => {
    setSelectedContributionId(item.id);
    setContributionProgressForm({
      progress: String(item.progress),
      comment: item.employeeComment || "",
    });
    setContributionDialogMode("progress");
  };

  const openContributionEvidenceDialog = (item: EmployeeContribution) => {
    setSelectedContributionId(item.id);
    setContributionEvidenceNote("");
    setContributionEvidenceFile(null);
    setContributionDialogMode("evidence");
  };

  const handleAcknowledgeContribution = async (item: EmployeeContribution) => {
    if (!profile?.id) return;
    try {
      setContributionSubmitting(`ack:${item.id}`);
      await performanceFrameworkAPI.acknowledgeContribution(item.id, {
        profileId: profile.id,
        evaluationCycleId: selectedCycleId,
      });
      refreshBalancedScorecardData();
      toast({
        title: "Contribution acknowledged",
        description: "Your acknowledgement has been recorded for this scorecard item.",
      });
    } catch (error) {
      toast({
        title: "Acknowledgement failed",
        description: error instanceof Error ? error.message : "The contribution could not be acknowledged.",
        variant: "destructive",
      });
    } finally {
      setContributionSubmitting(null);
    }
  };

  const handleSubmitContributionProgress = async () => {
    if (!profile?.id || !selectedContributionId) return;
    const progress = Number(contributionProgressForm.progress);
    if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
      toast({
        title: "Progress is required",
        description: "Enter a progress value between 0 and 100.",
        variant: "destructive",
      });
      return;
    }
    try {
      setContributionSubmitting(`progress:${selectedContributionId}`);
      await performanceFrameworkAPI.updateContributionProgress(selectedContributionId, {
        profileId: profile.id,
        evaluationCycleId: selectedCycleId,
        progress,
        comment: contributionProgressForm.comment || undefined,
      });
      refreshBalancedScorecardData();
      setContributionDialogMode("detail");
      toast({
        title: "Progress updated",
        description: "Your contribution update has been saved.",
      });
    } catch (error) {
      toast({
        title: "Progress update failed",
        description: error instanceof Error ? error.message : "The contribution update could not be saved.",
        variant: "destructive",
      });
    } finally {
      setContributionSubmitting(null);
    }
  };

  const handleUploadContributionEvidence = async () => {
    if (!selectedContributionId || !profile?.id) return;
    if (!contributionEvidenceFile) {
      toast({
        title: "Evidence file required",
        description: "Choose a file before uploading evidence.",
        variant: "destructive",
      });
      return;
    }
    try {
      setContributionSubmitting(`evidence:${selectedContributionId}`);
      await performanceFrameworkAPI.uploadContributionEvidence(selectedContributionId, {
        profileId: profile.id,
        evaluationCycleId: selectedCycleId,
        file: contributionEvidenceFile,
        description: contributionEvidenceNote || undefined,
      });
      refreshBalancedScorecardData();
      setContributionDialogMode("detail");
      setContributionEvidenceFile(null);
      setContributionEvidenceNote("");
      toast({
        title: "Evidence uploaded",
        description: "The evidence file is now linked to this contribution item.",
      });
    } catch (error) {
      toast({
        title: "Evidence upload failed",
        description: error instanceof Error ? error.message : "The evidence file could not be uploaded.",
        variant: "destructive",
      });
    } finally {
      setContributionSubmitting(null);
    }
  };

  const handleOpenContributionReviewContext = (item: EmployeeContribution | null) => {
    if (!item?.reviewContextPath) {
      toast({
        title: "No review context linked",
        description: "This contribution item does not yet have a linked review path.",
        variant: "destructive",
      });
      return;
    }
    navigate(item.reviewContextPath);
  };

  const handleCreateScorecardCycle = async () => {
    try {
      setAuthoringSubmitting("createScorecardCycle");
      await performanceFrameworkAPI.createScorecardCycle({
        name: cycleForm.name,
        cadence: cycleForm.cadence,
        startDate: cycleForm.startDate,
        endDate: cycleForm.endDate,
      });
      await refreshBalancedScorecardData(selectedRole);
      setCycleDialogOpen(false);
      setCycleForm({
        name: "",
        cadence: "quarterly",
        startDate: "",
        endDate: "",
      });
      toast({
        title: "Scorecard cycle created",
        description: "You can now create a draft scorecard version inside this cycle.",
      });
    } catch (error) {
      toast({
        title: "Cycle creation failed",
        description: error instanceof Error ? error.message : "The scorecard cycle could not be created.",
        variant: "destructive",
      });
    } finally {
      setAuthoringSubmitting(null);
    }
  };

  const handleBootstrapScorecardStructure = async () => {
    try {
      setAuthoringSubmitting("bootstrapScorecardStructure");
      await performanceFrameworkAPI.bootstrapScorecardStructure();
      await refreshBalancedScorecardData(selectedRole);
      toast({
        title: "Scorecard library bootstrapped",
        description: "Default perspectives, goals, KPIs, and initiatives are now available for governance.",
      });
    } catch (error) {
      toast({
        title: "Bootstrap failed",
        description:
          error instanceof Error ? error.message : "The scorecard library could not be bootstrapped.",
        variant: "destructive",
      });
    } finally {
      setAuthoringSubmitting(null);
    }
  };

  const handleCreateScorecardVersion = async () => {
    const cycleId = Number(versionForm.cycleId);
    if (!Number.isFinite(cycleId) || cycleId <= 0) return;

    try {
      setAuthoringSubmitting("createScorecardVersion");
      const createdVersion = await performanceFrameworkAPI.createScorecardVersion(cycleId, {
        label: versionForm.label.trim() || undefined,
        sourceVersionId:
          versionForm.sourceVersionId === "auto"
            ? undefined
            : versionForm.sourceVersionId === "baseline"
              ? null
              : Number(versionForm.sourceVersionId),
      });
      await refreshBalancedScorecardData(selectedRole);
      setSelectedStructureVersionId(String(createdVersion.id));
      setVersionDialogOpen(false);
      setVersionForm({
        cycleId: String(cycleId),
        label: "",
        sourceVersionId: "auto",
      });
      toast({
        title: "Scorecard version created",
        description: "The draft version was cloned and is ready for strategy authoring.",
      });
    } catch (error) {
      toast({
        title: "Version creation failed",
        description: error instanceof Error ? error.message : "The scorecard version could not be created.",
        variant: "destructive",
      });
    } finally {
      setAuthoringSubmitting(null);
    }
  };

  const handlePublishScorecardVersion = async () => {
    if (!selectedGovernanceVersion) return;
    if (
      !window.confirm(
        `Publish scorecard version ${selectedGovernanceVersion.versionNumber}${
          selectedGovernanceCycle ? ` for ${selectedGovernanceCycle.name}` : ""
        }?`
      )
    ) {
      return;
    }

    try {
      setAuthoringSubmitting(`publishScorecardVersion:${selectedGovernanceVersion.id}`);
      await performanceFrameworkAPI.publishScorecardVersion(selectedGovernanceVersion.id);
      await refreshBalancedScorecardData(selectedRole);
      toast({
        title: "Scorecard published",
        description: "This version is now the active scorecard for the workspace.",
      });
    } catch (error) {
      toast({
        title: "Publish failed",
        description: error instanceof Error ? error.message : "The scorecard version could not be published.",
        variant: "destructive",
      });
    } finally {
      setAuthoringSubmitting(null);
    }
  };

  const handleCreateMeasurementPeriod = async () => {
    if (!measurementVersionId) return;
    try {
      setMeasurementSubmitting("createMeasurementPeriod");
      const created = await performanceFrameworkAPI.createMeasurementPeriod({
        versionId: measurementVersionId,
        label: measurementPeriodForm.label.trim() || undefined,
        periodStart: measurementPeriodForm.periodStart,
        periodEnd: measurementPeriodForm.periodEnd,
      });
      await refreshBalancedScorecardData(selectedRole);
      setMeasurementPeriodDialogOpen(false);
      setSelectedMeasurementPeriodId(String(created.id));
      setMeasurementPeriodForm({
        label: "",
        periodStart: "",
        periodEnd: "",
      });
      toast({
        title: "Measurement period created",
        description: "The period is ready for KPI snapshot generation.",
      });
    } catch (error) {
      toast({
        title: "Measurement period creation failed",
        description:
          error instanceof Error ? error.message : "The measurement period could not be created.",
        variant: "destructive",
      });
    } finally {
      setMeasurementSubmitting(null);
    }
  };

  const handleGenerateMeasurementPeriod = async () => {
    if (!selectedMeasurementPeriod) return;
    try {
      setMeasurementSubmitting(`generateMeasurement:${selectedMeasurementPeriod.id}`);
      await performanceFrameworkAPI.generateMeasurementPeriod(selectedMeasurementPeriod.id);
      await refreshBalancedScorecardData(selectedRole);
      toast({
        title: "Measurement snapshots generated",
        description: "The KPI pack has been recalculated for the selected period.",
      });
    } catch (error) {
      toast({
        title: "Snapshot generation failed",
        description:
          error instanceof Error ? error.message : "The measurement snapshot pack could not be generated.",
        variant: "destructive",
      });
    } finally {
      setMeasurementSubmitting(null);
    }
  };

  const handleSubmitMeasurementPeriod = async () => {
    if (!selectedMeasurementPeriod) return;
    try {
      setMeasurementSubmitting(`submitMeasurement:${selectedMeasurementPeriod.id}`);
      await performanceFrameworkAPI.submitMeasurementPeriod(selectedMeasurementPeriod.id);
      await refreshBalancedScorecardData(selectedRole);
      toast({
        title: "Measurement period submitted",
        description: "The period is now in the review workflow.",
      });
    } catch (error) {
      toast({
        title: "Measurement submit failed",
        description:
          error instanceof Error ? error.message : "The measurement period could not be submitted.",
        variant: "destructive",
      });
    } finally {
      setMeasurementSubmitting(null);
    }
  };

  const handleReviewMeasurementPeriod = async (
    decision: "start_review" | "request_changes" | "approve"
  ) => {
    if (!selectedMeasurementPeriod) return;
    try {
      setMeasurementSubmitting(`${decision}:${selectedMeasurementPeriod.id}`);
      await performanceFrameworkAPI.reviewMeasurementPeriod(selectedMeasurementPeriod.id, {
        decision,
      });
      await refreshBalancedScorecardData(selectedRole);
      toast({
        title:
          decision === "approve"
            ? "Measurement period approved"
            : decision === "request_changes"
              ? "Changes requested"
              : "Review started",
        description:
          decision === "approve"
            ? "The KPI pack is approved and ready to close."
            : decision === "request_changes"
              ? "The period has been returned to draft for another generation or edit."
              : "The KPI pack is now formally in review.",
      });
    } catch (error) {
      toast({
        title: "Measurement review failed",
        description:
          error instanceof Error ? error.message : "The measurement review action could not be completed.",
        variant: "destructive",
      });
    } finally {
      setMeasurementSubmitting(null);
    }
  };

  const handleCloseMeasurementPeriod = async () => {
    if (!selectedMeasurementPeriod) return;
    try {
      setMeasurementSubmitting(`closeMeasurement:${selectedMeasurementPeriod.id}`);
      await performanceFrameworkAPI.closeMeasurementPeriod(selectedMeasurementPeriod.id);
      await refreshBalancedScorecardData(selectedRole);
      toast({
        title: "Measurement period closed",
        description: "The selected KPI pack is now frozen for this period.",
      });
    } catch (error) {
      toast({
        title: "Measurement close failed",
        description:
          error instanceof Error ? error.message : "The measurement period could not be closed.",
        variant: "destructive",
      });
    } finally {
      setMeasurementSubmitting(null);
    }
  };

  const handleDownloadMeasurementReviewPack = async (format: "xlsx" | "pdf" = "xlsx") => {
    if (!selectedMeasurementPeriod) return;
    try {
      setMeasurementPackDownloading(true);
      const { blob, fileName } =
        format === "pdf"
          ? await performanceFrameworkAPI.downloadMeasurementReviewPackPdf(selectedMeasurementPeriod.id)
          : await performanceFrameworkAPI.downloadMeasurementReviewPackExcel(selectedMeasurementPeriod.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast({
        title: "Review pack downloaded",
        description: "The review pack has been generated for the selected period.",
      });
    } catch (error) {
      toast({
        title: "Review pack download failed",
        description:
          error instanceof Error ? error.message : "The review pack could not be downloaded.",
        variant: "destructive",
      });
    } finally {
      setMeasurementPackDownloading(false);
    }
  };

  const handleSaveKpiAssignment = async (payload: {
    kpiId: number;
    profileId: number;
    individualTarget?: number;
    individualWeight?: number;
  }) => {
    try {
      setAuthoringSubmitting("saveKpiAssignment");
      await performanceFrameworkAPI.saveKpiAssignment({
        ...payload,
        scorecardVersionId: adminVersionId ?? undefined,
      });
      await refreshBalancedScorecardData(selectedRole);
      toast({
        title: "KPI assignment saved",
        description: "The employee target is now linked to the active scorecard version.",
      });
    } catch (error) {
      toast({
        title: "Assignment save failed",
        description: error instanceof Error ? error.message : "The KPI assignment could not be saved.",
        variant: "destructive",
      });
      throw error;
    } finally {
      setAuthoringSubmitting(null);
    }
  };

  const handleDeleteKpiAssignment = async (assignmentId: number) => {
    try {
      setAuthoringSubmitting(`deleteKpiAssignment:${assignmentId}`);
      await performanceFrameworkAPI.deleteKpiAssignment(assignmentId);
      await refreshBalancedScorecardData(selectedRole);
      toast({
        title: "KPI assignment removed",
        description: "The employee-level KPI target has been removed from this version.",
      });
    } catch (error) {
      toast({
        title: "Assignment removal failed",
        description: error instanceof Error ? error.message : "The KPI assignment could not be removed.",
        variant: "destructive",
      });
    } finally {
      setAuthoringSubmitting(null);
    }
  };

  const handleSavePerformanceBand = async (payload: {
    roleId?: number | null;
    onTrackMin: number;
    atRiskMin: number;
    label?: string;
  }) => {
    try {
      setAuthoringSubmitting("savePerformanceBand");
      await performanceFrameworkAPI.savePerformanceBand(payload);
      await refreshBalancedScorecardData(selectedRole);
      toast({
        title: "Performance band saved",
        description: "Score-to-status thresholds have been updated.",
      });
    } catch (error) {
      toast({
        title: "Performance band save failed",
        description: error instanceof Error ? error.message : "The performance band could not be saved.",
        variant: "destructive",
      });
      throw error;
    } finally {
      setAuthoringSubmitting(null);
    }
  };

  const handleCreatePerspective = async () => {
    try {
      setAuthoringSubmitting("createPerspective");
      await performanceFrameworkAPI.createPerspective({
        name: perspectiveForm.name,
        ownerName: perspectiveForm.ownerName || undefined,
        summary: perspectiveForm.summary || undefined,
        versionId: resolvedStructureVersionId,
      });
      await refreshBalancedScorecardData(selectedRole);
      closeSetupSheet();
      toast({
        title: "Perspective created",
        description: "The strategic perspective is now stored in the live scorecard structure.",
      });
    } catch (error) {
      toast({
        title: "Perspective creation failed",
        description: error instanceof Error ? error.message : "The perspective could not be saved.",
        variant: "destructive",
      });
    } finally {
      setAuthoringSubmitting(null);
    }
  };

  const handleUpdatePerspective = async () => {
    if (!editingPerspectiveId) return;

    try {
      setAuthoringSubmitting("editPerspective");
      await performanceFrameworkAPI.updatePerspective(editingPerspectiveId, {
        name: perspectiveForm.name,
        ownerName: perspectiveForm.ownerName || undefined,
        summary: perspectiveForm.summary || undefined,
      });
      await refreshBalancedScorecardData(selectedRole);
      closeSetupSheet();
      toast({
        title: "Perspective updated",
        description: "The perspective details were saved to the live scorecard structure.",
      });
    } catch (error) {
      toast({
        title: "Perspective update failed",
        description: error instanceof Error ? error.message : "The perspective could not be updated.",
        variant: "destructive",
      });
    } finally {
      setAuthoringSubmitting(null);
    }
  };

  const handleArchivePerspective = async (perspective: BalancedScorecardPerspectiveRecord) => {
    const activePerspectiveGoals = goalRecords.filter((goal) => goal.perspectiveId === perspective.id);
    if (activePerspectiveGoals.length > 0) {
      toast({
        title: "Perspective still has goals",
        description: "Archive or remove the active goals under this perspective first.",
        variant: "destructive",
      });
      return;
    }

    if (!window.confirm(`Archive "${perspective.name}" from the scorecard structure?`)) {
      return;
    }

    try {
      setAuthoringSubmitting(`archivePerspective:${perspective.id}`);
      await performanceFrameworkAPI.archivePerspective(perspective.id);
      await refreshBalancedScorecardData(selectedRole);
      if (editingPerspectiveId === perspective.id) {
        closeSetupSheet();
      }
      toast({
        title: "Perspective archived",
        description: "The perspective was removed from the live scorecard structure.",
      });
    } catch (error) {
      toast({
        title: "Perspective archive failed",
        description: error instanceof Error ? error.message : "The perspective could not be archived.",
        variant: "destructive",
      });
    } finally {
      setAuthoringSubmitting(null);
    }
  };

  const handleDeletePerspective = async (perspective: BalancedScorecardPerspectiveRecord) => {
    const linkedGoals = goalRecords.filter((goal) => goal.perspectiveId === perspective.id);
    if (linkedGoals.length > 0) {
      toast({
        title: "Perspective still has goals",
        description: "Remove the linked goals before permanently deleting this perspective.",
        variant: "destructive",
      });
      return;
    }

    if (!window.confirm(`Delete "${perspective.name}" permanently? This cannot be undone.`)) {
      return;
    }

    try {
      setAuthoringSubmitting(`deletePerspective:${perspective.id}`);
      await performanceFrameworkAPI.deletePerspective(perspective.id);
      await refreshBalancedScorecardData(selectedRole);
      if (editingPerspectiveId === perspective.id) {
        closeSetupSheet();
      }
      toast({
        title: "Perspective deleted",
        description: "The perspective was permanently removed from the scorecard structure.",
      });
    } catch (error) {
      toast({
        title: "Perspective deletion failed",
        description: error instanceof Error ? error.message : "The perspective could not be deleted.",
        variant: "destructive",
      });
    } finally {
      setAuthoringSubmitting(null);
    }
  };

  const handleCreateGoal = async () => {
    try {
      setAuthoringSubmitting("createGoal");
      await performanceFrameworkAPI.createGoal({
        perspectiveId: Number(goalForm.perspectiveId),
        title: goalForm.title,
        ownerName: goalForm.ownerName || undefined,
        description: goalForm.description || undefined,
      });
      await refreshBalancedScorecardData(selectedRole);
      setGoalForm((current) => ({
        perspectiveId: current.perspectiveId,
        title: "",
        ownerName: "",
        description: "",
      }));
      setSetupSheetMode(null);
      toast({
        title: "Strategic goal created",
        description: "The goal now lives under the selected BSC perspective.",
      });
    } catch (error) {
      toast({
        title: "Goal creation failed",
        description: error instanceof Error ? error.message : "The goal could not be saved.",
        variant: "destructive",
      });
    } finally {
      setAuthoringSubmitting(null);
    }
  };

  const openEditGoal = (goal: BalancedScorecardGoalRecord) => {
    setEditingGoalId(goal.id);
    setGoalEditForm({
      title: goal.title,
      ownerName: goal.ownerName ?? "",
      description: goal.description ?? "",
    });
    setSetupSheetMode("editGoal");
  };

  const handleUpdateGoal = async () => {
    if (!editingGoalId) return;
    try {
      setAuthoringSubmitting("editGoal");
      await performanceFrameworkAPI.updateGoal(editingGoalId, {
        title: goalEditForm.title,
        ownerName: goalEditForm.ownerName || undefined,
        description: goalEditForm.description || undefined,
      });
      refreshBalancedScorecardData();
      closeSetupSheet();
      toast({ title: "Goal updated", description: "The strategic goal has been saved." });
    } catch (error) {
      toast({
        title: "Goal update failed",
        description: error instanceof Error ? error.message : "The goal could not be updated.",
        variant: "destructive",
      });
    } finally {
      setAuthoringSubmitting(null);
    }
  };

  const handleArchiveGoal = async (goal: BalancedScorecardGoalRecord) => {
    if (!window.confirm(`Archive "${goal.title}"? This will also archive its linked KPIs and initiatives.`)) {
      return;
    }
    try {
      setAuthoringSubmitting(`archiveGoal:${goal.id}`);
      await performanceFrameworkAPI.archiveGoal(goal.id);
      refreshBalancedScorecardData();
      if (editingGoalId === goal.id) closeSetupSheet();
      toast({ title: "Goal archived", description: "The goal and its linked items were archived." });
    } catch (error) {
      toast({
        title: "Goal archive failed",
        description: error instanceof Error ? error.message : "The goal could not be archived.",
        variant: "destructive",
      });
    } finally {
      setAuthoringSubmitting(null);
    }
  };

  const openEditInitiative = (initiative: BalancedScorecardInitiativeRecord) => {
    setEditingInitiativeId(initiative.id);
    setInitiativeEditForm({
      title: initiative.title,
      summary: initiative.summary ?? "",
      ownerName: initiative.ownerName ?? "",
      timeline: initiative.timeline ?? "",
      dueDate: initiative.dueDate ?? "",
      status: (initiative.status as StatusTone) ?? "at_risk",
      progress: String(initiative.progress ?? 0),
      scopeRole: initiative.scopeRole ?? "hr",
    });
    setKpiSheetMode("editInitiative" as KpiSheetMode);
  };

  const handleUpdateInitiative = async () => {
    if (!editingInitiativeId) return;
    try {
      setAuthoringSubmitting("editInitiative");
      await performanceFrameworkAPI.updateInitiative(editingInitiativeId, {
        title: initiativeEditForm.title || undefined,
        summary: initiativeEditForm.summary || null,
        ownerName: initiativeEditForm.ownerName || null,
        timeline: initiativeEditForm.timeline || null,
        dueDate: initiativeEditForm.dueDate || null,
        status: initiativeEditForm.status,
        progress: Number(initiativeEditForm.progress),
        scopeRole: initiativeEditForm.scopeRole || undefined,
      });
      refreshBalancedScorecardData();
      setKpiSheetMode(null);
      setEditingInitiativeId(null);
      toast({ title: "Initiative updated", description: "The initiative has been saved." });
    } catch (error) {
      toast({
        title: "Initiative update failed",
        description: error instanceof Error ? error.message : "The initiative could not be updated.",
        variant: "destructive",
      });
    } finally {
      setAuthoringSubmitting(null);
    }
  };

  const handleArchiveInitiative = async (initiative: BalancedScorecardInitiativeRecord) => {
    if (!window.confirm(`Archive "${initiative.title}"? Child initiatives will also be archived.`)) {
      return;
    }
    try {
      setAuthoringSubmitting(`archiveInitiative:${initiative.id}`);
      await performanceFrameworkAPI.archiveInitiative(initiative.id);
      refreshBalancedScorecardData();
      if (editingInitiativeId === initiative.id) {
        setKpiSheetMode(null);
        setEditingInitiativeId(null);
      }
      toast({ title: "Initiative archived", description: "The initiative was removed from the cascade." });
    } catch (error) {
      toast({
        title: "Initiative archive failed",
        description: error instanceof Error ? error.message : "The initiative could not be archived.",
        variant: "destructive",
      });
    } finally {
      setAuthoringSubmitting(null);
    }
  };

  const handleCreateInitiative = async () => {
    try {
      setAuthoringSubmitting("createInitiative");
      await performanceFrameworkAPI.createInitiative({
        goalId: Number(initiativeForm.goalId),
        kpiId: Number(initiativeForm.kpiId),
        parentInitiativeId:
          initiativeForm.parentInitiativeId !== "none"
            ? Number(initiativeForm.parentInitiativeId)
            : null,
        scopeRole: initiativeForm.scopeRole,
        title: initiativeForm.title,
        summary: initiativeForm.summary || undefined,
        ownerName: initiativeForm.ownerName || undefined,
        timeline: initiativeForm.timeline || undefined,
        dueDate: initiativeForm.dueDate || undefined,
        status: initiativeForm.status,
        progress: Number(initiativeForm.progress),
      });
      await refreshBalancedScorecardData(selectedRole);
      setInitiativeForm((current) => ({
        goalId: current.goalId,
        kpiId: current.kpiId,
        parentInitiativeId: "none",
        scopeRole: current.scopeRole,
        title: "",
        summary: "",
        ownerName: "",
        timeline: "",
        dueDate: "",
        status: "at_risk",
        progress: "0",
      }));
      setKpiSheetMode(null);
      toast({
        title: "Initiative created",
        description: "The initiative is now part of the live cascade structure.",
      });
    } catch (error) {
      toast({
        title: "Initiative creation failed",
        description: error instanceof Error ? error.message : "The initiative could not be saved.",
        variant: "destructive",
      });
    } finally {
      setAuthoringSubmitting(null);
    }
  };

  const canUpdateKpiActuals = hasAnyRole(["hr", "finance", "marketing", "super_admin"]);

  const handleUpdateKpiActual = async (kpi: KpiDefinition) => {
    if (!canUpdateKpiActuals) return;

    const record = kpiRecords.find((item) => item.key === kpi.id);
    if (!record) {
      toast({
        title: "KPI mapping missing",
        description: "This KPI could not be mapped back to a scorecard record.",
        variant: "destructive",
      });
      return;
    }

    try {
      setAuthoringSubmitting(`loadKpiEngine:${kpi.id}`);
      const engine = await performanceFrameworkAPI.getKpiEngine(record.id);
      const values = Object.fromEntries(
        (engine.trackingPlan?.inputs ?? []).map((input) => [
          input.inputKey,
          input.inputType === "boolean" ? "false" : "",
        ])
      );
      setKpiActualTarget(kpi);
      setKpiActualEngine(engine);
      setKpiActualValues(values);
      setKpiActualForm({ actualValue: "", note: "" });
      setKpiActualDialogOpen(true);
    } catch (error) {
      toast({
        title: "KPI engine failed to load",
        description: error instanceof Error ? error.message : "The KPI tracking plan could not be opened.",
        variant: "destructive",
      });
    } finally {
      setAuthoringSubmitting(null);
    }
  };

  const handleRecalculateKpi = async (kpi: KpiDefinition) => {
    const record = kpiRecords.find((item) => item.key === kpi.id);
    if (!record) {
      toast({
        title: "KPI mapping missing",
        description: "This KPI could not be mapped to a scorecard record.",
        variant: "destructive",
      });
      return;
    }
    try {
      setAuthoringSubmitting(`recalculateKpi:${kpi.id}`);
      await performanceFrameworkAPI.calculateKpiResult(record.id);
      await queryClient.invalidateQueries({ queryKey: ["bsc-workspace", selectedRole, selectedCycleId, profile?.id] });
      toast({ title: "KPI recalculated", description: `${kpi.name} result has been refreshed.` });
    } catch (error) {
      toast({
        title: "Recalculation failed",
        description: error instanceof Error ? error.message : "Could not recalculate this KPI.",
        variant: "destructive",
      });
    } finally {
      setAuthoringSubmitting(null);
    }
  };

  const closeKpiActualDialog = () => {
    setKpiActualDialogOpen(false);
    setKpiActualTarget(null);
    setKpiActualEngine(null);
    setKpiActualValues({});
    setKpiActualForm({ actualValue: "", note: "" });
  };

  const submitKpiActualUpdate = async () => {
    if (!kpiActualTarget) return;

    const record = kpiRecords.find((item) => item.key === kpiActualTarget.id);
    if (!record) {
      toast({
        title: "KPI mapping missing",
        description: "This KPI could not be mapped back to a scorecard record.",
        variant: "destructive",
      });
      return;
    }

    try {
      setAuthoringSubmitting(`updateKpiActual:${kpiActualTarget.id}`);
      if (kpiActualEngine?.trackingPlan?.inputs?.length) {
        const missingInput = kpiActualEngine.trackingPlan.inputs.find(
          (input) =>
            input.inputType !== "boolean" &&
            input.isRequired &&
            !String(kpiActualValues[input.inputKey] ?? "").trim()
        );
        if (missingInput) {
          toast({
            title: "Missing tracking input",
            description: `${missingInput.label} is required before the KPI can be scored.`,
            variant: "destructive",
          });
          setAuthoringSubmitting(null);
          return;
        }

        await performanceFrameworkAPI.submitKpiDataPoints(record.id, {
          values: kpiActualEngine.trackingPlan.inputs.map((input) => ({
            inputKey: input.inputKey,
            rawValue:
              input.inputType === "boolean"
                ? kpiActualValues[input.inputKey] === "true"
                : kpiActualValues[input.inputKey] ?? "",
            note: kpiActualForm.note.trim() ? kpiActualForm.note.trim() : undefined,
            sourceType: input.sourceType,
          })),
        });
      } else {
        const actualValue = Number(kpiActualForm.actualValue);
        if (!Number.isFinite(actualValue)) {
          toast({
            title: "Invalid value",
            description: "Please enter a numeric value for the KPI actual.",
            variant: "destructive",
          });
          setAuthoringSubmitting(null);
          return;
        }
        await performanceFrameworkAPI.updateKpiActual(record.id, {
          currentActualValue: actualValue,
          lastMeasurementNote: kpiActualForm.note.trim() ? kpiActualForm.note.trim() : undefined,
        });
      }
      await refreshBalancedScorecardData(selectedRole);
      toast({
        title: "KPI tracking updated",
        description: "The engine recalculated the result, status, and trend.",
      });
      closeKpiActualDialog();
    } catch (error) {
      toast({
        title: "KPI update failed",
        description: error instanceof Error ? error.message : "The KPI actual could not be updated.",
        variant: "destructive",
      });
    } finally {
      setAuthoringSubmitting(null);
    }
  };

  const handlePrimaryActionClick = () => {
    switch (selectedRole) {
      case "hr":
        setActiveTab("setup");
        return;
      case "gmp":
      case "partner":
        setActiveTab("tracking");
        return;
      case "manager":
        setActiveTab("employee");
        return;
      case "finance":
      case "marketing":
        setActiveTab("tracking");
        return;
      case "employee":
      default:
        setActiveTab("employee");
        return;
    }
  };

  useEffect(() => {
    if (!routeRole) {
      navigate(`/bsc-management/${selectedRole}`, { replace: true });
      return;
    }
    if (!canPreviewAllRoles && routeRole !== preferredRole) {
      navigate(`/bsc-management/${preferredRole}`, { replace: true });
    }
  }, [canPreviewAllRoles, navigate, preferredRole, routeRole, selectedRole]);

  useEffect(() => {
    if (availableCycles.length === 0) return;
    setSelectedCycle((current) => {
      if (current !== "latest" && availableCycles.some((c) => String(c.id) === current)) {
        return current;
      }
      const active = availableCycles.find((c) => c.status === "active");
      return active ? String(active.id) : "latest";
    });
  }, [availableCycles]);

  useEffect(() => {
    if (!canPreviewAllRoles) {
      setSelectedStructureVersionId("current");
      setHasInitializedStructureVersion(false);
      return;
    }
    if (governanceCycles.length === 0) {
      if (selectedStructureVersionId !== "current") {
        setSelectedStructureVersionId("current");
      }
      setHasInitializedStructureVersion(false);
      return;
    }

    const hasSelectedVersion =
      selectedStructureVersionId !== "current" &&
      allGovernanceVersions.some((version) => String(version.id) === selectedStructureVersionId);
    if (!hasSelectedVersion && selectedStructureVersionId !== "current") {
      setSelectedStructureVersionId("current");
      return;
    }

    if (!hasInitializedStructureVersion && selectedStructureVersionId === "current") {
      const latestDraft =
        allGovernanceVersions.find((version) => version.status === "draft") ?? null;
      if (latestDraft) {
        setSelectedStructureVersionId(String(latestDraft.id));
        setHasInitializedStructureVersion(true);
        return;
      }
      if (activeGovernanceVersion) {
        setSelectedStructureVersionId(String(activeGovernanceVersion.id));
        setHasInitializedStructureVersion(true);
        return;
      }
      setHasInitializedStructureVersion(true);
    }
  }, [
    activeGovernanceVersion,
    allGovernanceVersions,
    canPreviewAllRoles,
    governanceCycles.length,
    hasInitializedStructureVersion,
    selectedStructureVersionId,
  ]);

  useEffect(() => {
    if (!canPreviewAllRoles) return;
    if (!versionDialogOpen) return;
    if (versionForm.cycleId) return;
    if (activeGovernanceCycle) {
      setVersionForm((current) => ({ ...current, cycleId: String(activeGovernanceCycle.id) }));
    }
  }, [activeGovernanceCycle, canPreviewAllRoles, versionDialogOpen, versionForm.cycleId]);

  useEffect(() => {
    if (!canPreviewAllRoles) {
      setSelectedMeasurementPeriodId("latest");
      return;
    }
    if (measurementPeriods.length === 0) {
      if (selectedMeasurementPeriodId !== "latest") {
        setSelectedMeasurementPeriodId("latest");
      }
      return;
    }
    if (
      selectedMeasurementPeriodId !== "latest" &&
      !measurementPeriods.some((period) => String(period.id) === selectedMeasurementPeriodId)
    ) {
      setSelectedMeasurementPeriodId("latest");
    }
  }, [canPreviewAllRoles, measurementPeriods, selectedMeasurementPeriodId]);

  useEffect(() => {
    if (!goalForm.perspectiveId && perspectiveRecords[0]) {
      setGoalForm((current) => ({
        ...current,
        perspectiveId: String(perspectiveRecords[0].id),
      }));
    }
  }, [goalForm.perspectiveId, perspectiveRecords]);

  useEffect(() => {
    if (!initiativeForm.goalId && goalRecords[0]) {
      setInitiativeForm((current) => ({
        ...current,
        goalId: String(goalRecords[0].id),
      }));
    }
  }, [goalRecords, initiativeForm.goalId]);

  useEffect(() => {
    if (!initiativeForm.kpiId && initiativeKpiOptions[0]) {
      setInitiativeForm((current) => ({
        ...current,
        kpiId: String(initiativeKpiOptions[0].id),
      }));
    }
  }, [initiativeForm.kpiId, initiativeKpiOptions]);

  useEffect(() => {
    if (
      initiativeForm.goalId &&
      initiativeForm.kpiId &&
      !initiativeKpiOptions.some((kpi) => String(kpi.id) === initiativeForm.kpiId)
    ) {
      setInitiativeForm((current) => ({
        ...current,
        kpiId: initiativeKpiOptions[0] ? String(initiativeKpiOptions[0].id) : "",
      }));
    }
  }, [initiativeForm.goalId, initiativeForm.kpiId, initiativeKpiOptions]);

  useEffect(() => {
    if (!roleTabVisibility[selectedRole].includes(activeTab)) {
      setActiveTab("dashboard");
    }
  }, [activeTab, selectedRole]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <Card className="overflow-hidden rounded-[28px] border-border/70 shadow-sm">
          <CardContent className="relative grid gap-6 p-6 lg:grid-cols-[minmax(0,1.45fr)_360px] lg:p-8">
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.08]"
              style={{
                backgroundImage:
                  "linear-gradient(to right, rgba(15,23,42,0.15) 1px, transparent 1px), linear-gradient(to bottom, rgba(15,23,42,0.15) 1px, transparent 1px)",
                backgroundSize: "36px 36px",
              }}
            />
            <div className="relative space-y-5">
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link to="/dashboard">Dashboard</Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator>
                    <ChevronRight />
                  </BreadcrumbSeparator>
                  <BreadcrumbItem>
                    <BreadcrumbPage>BSC & KPI Management</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>

              <div className="space-y-3">
                {/* <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="rounded-full border-primary/20 bg-primary/5 text-primary">
                    Balanced Scorecard
                  </Badge>
                  <Badge variant="outline" className="rounded-full">
                    {workspaceLoading
                      ? "Syncing live data"
                      : workspaceError
                        ? "Workspace unavailable"
                        : "Live operational data"}
                  </Badge>
                  <Badge variant="outline" className="rounded-full">
                    BSC = strategy structure
                  </Badge>
                  <Badge variant="outline" className="rounded-full">
                    KPI = measurement layer
                  </Badge>
                  <Badge variant="outline" className="rounded-full">
                    Initiative = execution layer
                  </Badge>
                </div> */}
                <div className="space-y-2">
                  <h1 className="max-w-4xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                    Scorecard Management
                  </h1>
                </div>
              </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-4">
                  <MetricCard
                    label="Strategic perspectives"
                    value={String(overviewMetrics.perspectives)}
                    icon={Layers}
                  />
                  <MetricCard
                    label="Active strategic goals"
                    value={String(overviewMetrics.goals)}
                    icon={Flag}
                  />
                  <MetricCard
                    label="Tracked KPIs"
                    value={String(overviewMetrics.kpis)}
                    icon={Target}
                  />
                  <MetricCard
                    label="Cascade readiness"
                    value={overviewMetrics.cascadeReadiness}
                    icon={Workflow}
                  />
                </div>
            </div>

            <Card className="relative rounded-[24px] border-border/70 bg-background/80 shadow-none">
              <CardHeader className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg">{selectedRoleProfile.label} view</CardTitle>
                  </div>
                  <StatusBadge
                    status={
                      perspectiveData.length > 0
                        ? scoreToStatus(
                            Math.round(
                              perspectiveData.reduce((sum, perspective) => sum + perspective.score, 0) /
                                perspectiveData.length
                            )
                          )
                        : "at_risk"
                    }
                  />
                </div>

                <div className="space-y-3">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {canPreviewAllRoles ? "Workspace switcher" : "Workspace"}
                    </p>
                    {canPreviewAllRoles ? (
                      <Select
                        value={selectedRole}
                        onValueChange={(value: RoleKey) => {
                          setActiveTab("dashboard");
                          navigate(`/bsc-management/${value}`);
                        }}
                      >
                        <SelectTrigger className="h-11 rounded-2xl">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="hr">HR / Admin</SelectItem>
                          <SelectItem value="gmp">GMP</SelectItem>
                          <SelectItem value="partner">Partner</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="finance">Finance</SelectItem>
                          <SelectItem value="marketing">Marketing</SelectItem>
                          <SelectItem value="employee">Employee</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="flex h-11 items-center rounded-2xl border border-border/70 bg-muted/20 px-4 text-sm font-medium text-foreground">
                        {selectedRoleProfile.label}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Cycle</p>
                    <Select value={selectedCycle} onValueChange={setSelectedCycle}>
                      <SelectTrigger className="h-11 rounded-2xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="latest">Live KPI view</SelectItem>
                        {availableCycles.map((cycle) => (
                          <SelectItem key={cycle.id} value={String(cycle.id)}>
                            {cycle.title} · {cycle.status}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Filter</p>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search goals, KPIs, owners or perspectives"
                        className="h-11 rounded-2xl pl-9"
                      />
                    </div>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {workspaceError ? (
                  <div className="rounded-3xl border border-amber-200 bg-amber-50/80 p-4">
                    <p className="text-sm text-amber-700">{workspaceError}</p>
                  </div>
                ) : null}
                <div className="grid gap-3">
                  <Button className="h-11 rounded-2xl" onClick={handlePrimaryActionClick}>
                    {selectedRoleProfile.primaryAction}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ModuleTabValue)}>
          <div className="w-full rounded-[24px] border border-border/70 bg-card px-2 py-2 shadow-sm">
            <TabsList className="flex w-full h-auto bg-transparent p-0">
              {visibleTabs.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="flex-1 rounded-2xl px-2 py-2 text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="dashboard" className="space-y-6">
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
              {selectedRoleHome.metrics.map((metric) => (
                  <MetricCard
                    key={metric.label}
                    label={metric.label}
                    value={metric.value}
                    icon={metric.icon}
                  />
              ))}
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_380px]">
              <Card className="rounded-[28px] border-border/70 shadow-sm">
                <CardHeader>
                  <SectionTitle
                    icon={Layers}
                    title={selectedRoleHome.title}
                  />
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    {selectedRoleHome.primaryBoardItems.map((item) => (
                      <div key={item.label} className="rounded-[24px] border border-border/60 bg-muted/20 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0 flex-1 space-y-1">
                            <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
                            <p className="text-sm font-semibold leading-snug text-foreground break-words">{item.value}</p>
                          </div>
                          {item.status ? <StatusBadge status={item.status} /> : null}
                        </div>
                        {typeof item.progress === "number" ? (
                          <div className="mt-4 space-y-2">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">Health</span>
                              <span className="font-medium text-foreground">{item.progress}%</span>
                            </div>
                            <Progress value={item.progress} className="h-2.5 rounded-full" />
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>

                </CardContent>
              </Card>

              <div className="space-y-6">
                {selectedRoleHome.secondaryBoardItems.length > 0 ? (
                  <Card className="rounded-[28px] border-border/70 shadow-sm">
                    <CardHeader>
                      <CardTitle className="text-lg">{selectedRoleHome.secondaryBoardTitle}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {selectedRoleHome.secondaryBoardItems.map((item) => (
                        <div key={item.label} className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-medium text-foreground">{item.label}</p>
                            </div>
                            <Badge variant="outline" className="rounded-full bg-background">
                              {item.value}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                ) : null}

              </div>
            </div>

            {selectedRole !== "employee" ? (
              <Card className="rounded-[28px] border-border/70 shadow-sm">
                <CardHeader>
                  <SectionTitle
                    icon={BarChart3}
                    title="Scorecard perspectives"
                  />
                </CardHeader>
                <CardContent className="space-y-5">
                  {/* Radar health overview */}
                  {scopedPerspectives.length >= 2 && (
                    <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Health overview</p>
                      <ResponsiveContainer width="100%" height={180}>
                        <RadarChart
                          data={scopedPerspectives.map((p) => ({
                            subject: p.name.split(" ")[0],
                            score: p.score,
                            fullMark: 100,
                          }))}
                        >
                          <PolarGrid stroke="#e2e8f0" />
                          <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: "#64748b" }} />
                          <Radar
                            dataKey="score"
                            fill="#6366f1"
                            fillOpacity={0.2}
                            stroke="#6366f1"
                            strokeWidth={2}
                            dot={{ r: 3, fill: "#6366f1" } as any}
                          />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* Perspective cards with progress + goals */}
                  <div className={cn("grid gap-4", scopedPerspectives.length === 1 ? "md:grid-cols-1" : scopedPerspectives.length === 2 ? "xl:grid-cols-2" : "xl:grid-cols-3")}>
                    {scopedPerspectives.map((perspective) => {
                      const perspectiveGoals = goalData.filter((goal) => goal.perspectiveId === perspective.id);
                      const onTrackCount = perspectiveGoals.filter((g) => g.status === "on_track").length;
                      return (
                        <Card key={perspective.id} className="rounded-[24px] border-border/60 bg-muted/20 shadow-none">
                          <CardHeader className="space-y-3">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <CardTitle className="text-base">{perspective.name}</CardTitle>
                                {perspective.summary ? (
                                  <CardDescription>{perspective.summary}</CardDescription>
                                ) : null}
                              </div>
                              <StatusBadge status={perspective.status} />
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            {/* Score ring + progress */}
                            <div className="flex items-center gap-4">
                              <div className="relative flex-shrink-0" style={{ width: 56, height: 56 }}>
                                {(() => {
                                  const size = 56;
                                  const r = (size - 8) / 2;
                                  const circ = 2 * Math.PI * r;
                                  const pct = Math.min(100, Math.max(0, perspective.score));
                                  const offset = circ - (pct / 100) * circ;
                                  const color = perspective.score >= 80 ? "#10b981" : perspective.score >= 60 ? "#f59e0b" : "#ef4444";
                                  return (
                                    <>
                                      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
                                        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth="6" />
                                        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="6"
                                          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
                                          style={{ transition: "stroke-dashoffset 0.5s ease" }} />
                                      </svg>
                                      <div className="absolute inset-0 flex items-center justify-center">
                                        <span className="text-[10px] font-bold" style={{ color }}>{perspective.score}%</span>
                                      </div>
                                    </>
                                  );
                                })()}
                              </div>
                              <div className="flex-1 space-y-1">
                                <div className="flex justify-between text-xs text-muted-foreground">
                                  <span>{perspectiveGoals.length} goals</span>
                                  <span>{onTrackCount} on track</span>
                                </div>
                                <Progress value={perspective.score} className="h-2 rounded-full" />
                              </div>
                            </div>
                            {/* Goal pills */}
                            <div className="space-y-1.5">
                              {perspectiveGoals.slice(0, 3).map((goal) => (
                                <div key={goal.id} className="flex items-center justify-between rounded-xl border border-border/60 bg-background px-3 py-2">
                                  <p className="text-xs font-medium text-foreground truncate">{goal.title}</p>
                                  <StatusBadge status={goal.status} />
                                </div>
                              ))}
                              {perspectiveGoals.length > 3 && (
                                <p className="text-xs text-muted-foreground text-center">+{perspectiveGoals.length - 3} more</p>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </TabsContent>

          <TabsContent value="setup" className="space-y-6">
            <Card className="rounded-[28px] border-border/70 shadow-sm">
              <CardHeader className="space-y-4">
                <SectionTitle
                  icon={Settings2}
                  title="Strategy setup"
                />
                <div className="flex flex-wrap gap-3">
                  <Button className="rounded-2xl" onClick={() => setSetupSheetMode("flow")}>
                    Open strategy flow
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-2xl"
                    onClick={openCreatePerspective}
                  >
                    Add perspective
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-2xl"
                    onClick={() => setSetupSheetMode("createGoal")}
                  >
                    Add strategic goal
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_360px]">
                <div className="space-y-4">
                  <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                    {setupMetrics.map((metric) => (
                      <MetricCard
                        key={metric.label}
                        label={metric.label}
                        value={metric.value}
                        icon={metric.icon}
                      />
                    ))}
                  </div>
                  <Card className="rounded-[24px] border-border/60 shadow-none">
                    <CardHeader>
                      <CardTitle className="text-base">Strategy map</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {perspectiveRecords.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-6">No perspectives yet.</p>
                      ) : (
                        perspectiveRecords.map((perspective, idx) => {
                          const perspGoals = goalRecords.filter((g) => g.perspectiveId === perspective.id);
                          const paletteDot = ["bg-indigo-500", "bg-sky-500", "bg-amber-500", "bg-emerald-500"][idx % 4];
                          const paletteBg = ["bg-indigo-50/60", "bg-sky-50/60", "bg-amber-50/60", "bg-emerald-50/60"][idx % 4];
                          const paletteBorder = ["border-indigo-200", "border-sky-200", "border-amber-200", "border-emerald-200"][idx % 4];
                          return (
                            <div key={perspective.id} className={`rounded-2xl border p-4 ${paletteBg} ${paletteBorder}`}>
                              <div className="flex items-center gap-2 mb-3">
                                <div className={`h-2.5 w-2.5 rounded-full ${paletteDot}`} />
                                <span className="font-semibold text-sm text-foreground">{perspective.name}</span>
                                <Badge variant="outline" className="text-[10px] rounded-full ml-auto">
                                  {perspGoals.length} goal{perspGoals.length !== 1 ? "s" : ""}
                                </Badge>
                              </div>
                              {perspGoals.length === 0 ? (
                                <p className="text-xs text-muted-foreground italic pl-4">No goals yet.</p>
                              ) : (
                                <div className="flex flex-wrap gap-2">
                                  {perspGoals.map((goal) => {
                                    const kpiCount = kpiRecords.filter((k) => k.goalId === goal.id).length;
                                    return (
                                      <div
                                        key={goal.id}
                                        className="flex items-center gap-2 rounded-xl border border-border/50 bg-background/80 px-3 py-2 shadow-sm"
                                      >
                                        <div className="min-w-0">
                                          <p className="text-xs font-medium text-foreground leading-tight">{goal.title}</p>
                                          {goal.ownerName ? (
                                            <p className="text-[10px] text-muted-foreground">{goal.ownerName}</p>
                                          ) : null}
                                        </div>
                                        <Badge
                                          variant="outline"
                                          className={`text-[10px] rounded-full shrink-0 ${kpiCount > 0 ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}
                                        >
                                          {kpiCount} KPI{kpiCount !== 1 ? "s" : ""}
                                        </Badge>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-6 px-1.5 text-[10px] shrink-0"
                                          onClick={() => openEditGoal(goal)}
                                        >
                                          Edit
                                        </Button>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </CardContent>
                  </Card>
                </div>

                <div className="space-y-4">
                  {canPreviewAllRoles ? (
                    <Card className="rounded-[24px] border-border/60 bg-muted/20 shadow-none">
                      <CardHeader>
                        <CardTitle className="text-base">Scorecard governance</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {/* Active cycle status */}
                        <div className="rounded-2xl border border-border/60 bg-background p-4">
                          <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">
                            Active cycle
                          </p>
                          {activeGovernanceCycle ? (
                            <>
                              <p className="mt-2 font-medium text-foreground">
                                {activeGovernanceCycle.name}
                              </p>
                              <p className="mt-1 text-sm text-muted-foreground">
                                {activeGovernanceVersion
                                  ? `Scorecard v${activeGovernanceVersion.versionNumber}${activeGovernanceVersion.label ? ` · ${activeGovernanceVersion.label}` : ""} · published`
                                  : "No published version yet"}
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="mt-2 text-sm text-muted-foreground">No cycle yet.</p>
                              <Button
                                size="sm"
                                variant="outline"
                                className="mt-3 rounded-xl"
                                onClick={() => setCycleDialogOpen(true)}
                              >
                                Create scorecard cycle
                              </Button>
                            </>
                          )}
                        </div>

                        {/* Authoring version selector + next action */}
                        {governanceCycles.length > 0 ? (
                          <div className="rounded-2xl border border-border/60 bg-background p-4 space-y-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">
                                Authoring version
                              </p>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 rounded-lg px-2 text-xs"
                                onClick={() => setVersionDialogOpen(true)}
                              >
                                + New draft
                              </Button>
                            </div>
                            <Select
                              value={selectedStructureVersionId}
                              onValueChange={setSelectedStructureVersionId}
                            >
                              <SelectTrigger className="h-9 rounded-xl text-sm">
                                <SelectValue placeholder="Select version" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="current">Current live structure</SelectItem>
                                {governanceCycles.map((cycle) =>
                                  cycle.versions.map((version) => (
                                    <SelectItem key={version.id} value={String(version.id)}>
                                      {cycle.name} · v{version.versionNumber}
                                      {version.label ? ` · ${version.label}` : ""} · {version.status}
                                    </SelectItem>
                                  ))
                                )}
                              </SelectContent>
                            </Select>
                            {selectedGovernanceVersion && selectedGovernanceVersion.status !== "published" ? (
                              <Button
                                className="w-full rounded-xl"
                                disabled={
                                  authoringSubmitting ===
                                  `publishScorecardVersion:${selectedGovernanceVersion.id}`
                                }
                                onClick={handlePublishScorecardVersion}
                              >
                                {authoringSubmitting ===
                                `publishScorecardVersion:${selectedGovernanceVersion.id}`
                                  ? "Publishing..."
                                  : `Publish v${selectedGovernanceVersion.versionNumber}`}
                              </Button>
                            ) : selectedGovernanceVersion?.status === "published" ? (
                              <p className="text-xs text-muted-foreground text-center">Live version.</p>
                            ) : null}
                          </div>
                        ) : null}

                        {/* Cycle list */}
                        {governanceCycles.length > 0 ? (
                          <div className="space-y-2">
                            {governanceCycles.slice(0, 3).map((cycle) => (
                              <div
                                key={cycle.id}
                                className="rounded-2xl border border-border/60 bg-background px-4 py-3"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-medium text-foreground">{cycle.name}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {cycle.cadence} · {cycle.status}
                                    </p>
                                  </div>
                                  <Badge variant="outline" className="rounded-full text-xs">
                                    {cycle.versions.length}v
                                  </Badge>
                                </div>
                              </div>
                            ))}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="w-full rounded-xl text-xs text-muted-foreground"
                              onClick={() => setCycleDialogOpen(true)}
                            >
                              + New cycle
                            </Button>
                          </div>
                        ) : null}
                      </CardContent>
                    </Card>
                  ) : null}
                  <Card className="rounded-[24px] border-border/60 bg-muted/20 shadow-none">
                    <CardHeader>
                      <CardTitle className="text-base">Scorecard structure</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {perspectiveRecords.map((perspective) => {
                        const perspectiveGoals = goalRecords.filter(
                          (goal) => goal.perspectiveId === perspective.id
                        );

                        return (
                        <div key={perspective.id} className="rounded-2xl border border-border/60 bg-background p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 space-y-0.5">
                              <p className="font-medium text-foreground">{perspective.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {perspective.ownerName || "Unassigned"}
                              </p>
                            </div>
                            <Badge variant="outline" className="rounded-full">
                              {perspectiveGoals.length} goals
                            </Badge>
                          </div>
                          {perspectiveGoals.length > 0 ? (
                            <div className="mt-3 space-y-2">
                              {perspectiveGoals.map((goal) => (
                                <div key={goal.id} className="flex items-center justify-between gap-2 rounded-xl border border-border/50 bg-muted/20 px-3 py-2">
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-medium text-foreground">{goal.title}</p>
                                    {goal.ownerName ? (
                                      <p className="text-xs text-muted-foreground">{goal.ownerName}</p>
                                    ) : null}
                                  </div>
                                  <div className="flex shrink-0 gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 rounded-lg px-2 text-xs"
                                      onClick={() => openEditGoal(goal)}
                                    >
                                      Edit
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 rounded-lg px-2 text-xs text-destructive hover:text-destructive"
                                      disabled={authoringSubmitting === `archiveGoal:${goal.id}`}
                                      onClick={() => handleArchiveGoal(goal)}
                                    >
                                      {authoringSubmitting === `archiveGoal:${goal.id}` ? "..." : "Archive"}
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : null}
                          <div className="mt-4 flex flex-wrap justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-xl"
                              onClick={() => openEditPerspective(perspective)}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="rounded-xl"
                              disabled={
                                perspectiveGoals.length > 0 ||
                                authoringSubmitting === `archivePerspective:${perspective.id}`
                              }
                              onClick={() => handleArchivePerspective(perspective)}
                            >
                              {authoringSubmitting === `archivePerspective:${perspective.id}`
                                ? "Archiving..."
                                : "Archive"}
                            </Button>
                          </div>
                        </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>
            <Sheet open={setupSheetMode !== null} onOpenChange={(open) => !open && closeSetupSheet()}>
              <SheetContent className="w-full sm:max-w-2xl">
                <ScrollArea className="h-full pr-4">
                  <SheetHeader className="space-y-2">
                    <SheetTitle>
                      {setupSheetMode === "flow"
                        ? "Strategy setup flow"
                        : setupSheetMode === "createPerspective"
                          ? "Create perspective"
                          : setupSheetMode === "editPerspective"
                            ? "Edit perspective"
                          : setupSheetMode === "createGoal"
                            ? "Create strategic goal"
                            : setupSheetMode === "editGoal"
                              ? "Edit strategic goal"
                              : "Strategy governance checks"}
                    </SheetTitle>
                    <SheetDescription>
                      {setupSheetMode === "flow"
                        ? "Strategy authoring guide"
                        : setupSheetMode === "createPerspective"
                          ? "Add a BSC perspective"
                          : setupSheetMode === "editPerspective"
                            ? "Edit perspective"
                          : setupSheetMode === "createGoal"
                            ? "Add a strategic goal"
                            : setupSheetMode === "editGoal"
                              ? "Edit strategic goal"
                              : "Strategy governance checks"}
                    </SheetDescription>
                  </SheetHeader>
                  <div className="mt-6 space-y-4">
                    {setupSheetMode === "flow" ? (
                      strategyFlowSteps.map((step) => (
                        <div key={step.step} className="rounded-2xl border border-border/60 bg-muted/15 p-5">
                          <div className="flex items-start gap-4">
                            <div className="rounded-2xl bg-primary/10 px-3 py-2 text-sm font-semibold text-primary">
                              {step.step}
                            </div>
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <step.icon className="h-4 w-4 text-primary" />
                                <p className="font-medium text-foreground">{step.title}</p>
                              </div>
                              <p className="text-sm text-muted-foreground">{step.body}</p>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : setupSheetMode === "createPerspective" || setupSheetMode === "editPerspective" ? (
                      <div className="space-y-5 rounded-2xl border border-border/60 bg-muted/15 p-5">
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-foreground">Perspective name</label>
                          <Input
                            value={perspectiveForm.name}
                            onChange={(event) =>
                              setPerspectiveForm((current) => ({ ...current, name: event.target.value }))
                            }
                            placeholder="Enter perspective name"
                            className="rounded-2xl"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-foreground">Owner</label>
                          <Input
                            value={perspectiveForm.ownerName}
                            onChange={(event) =>
                              setPerspectiveForm((current) => ({ ...current, ownerName: event.target.value }))
                            }
                            placeholder="Enter perspective owner"
                            className="rounded-2xl"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-foreground">Summary</label>
                          <Textarea
                            value={perspectiveForm.summary}
                            onChange={(event) =>
                              setPerspectiveForm((current) => ({ ...current, summary: event.target.value }))
                            }
                            placeholder="Short explanation of what this perspective is meant to measure."
                            className="min-h-[120px] rounded-2xl"
                          />
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          {isEditingPerspective && editingPerspective ? (
                            <Button
                              variant="destructive"
                              className="rounded-2xl"
                              disabled={
                                authoringSubmitting !== null ||
                                goalRecords.some((goal) => goal.perspectiveId === editingPerspective.id)
                              }
                              onClick={() => handleDeletePerspective(editingPerspective)}
                            >
                              {authoringSubmitting === `deletePerspective:${editingPerspective.id}`
                                ? "Deleting..."
                                : "Delete perspective"}
                            </Button>
                          ) : (
                            <span />
                          )}
                          <div className="flex items-center gap-3">
                            <Button variant="outline" className="rounded-2xl" onClick={closeSetupSheet}>
                              Cancel
                            </Button>
                            <Button
                              className="rounded-2xl"
                              disabled={!perspectiveForm.name.trim() || authoringSubmitting !== null}
                              onClick={isEditingPerspective ? handleUpdatePerspective : handleCreatePerspective}
                            >
                              {authoringSubmitting === "createPerspective" || authoringSubmitting === "editPerspective"
                                ? "Saving..."
                                : isEditingPerspective
                                  ? "Update perspective"
                                  : "Save perspective"}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : setupSheetMode === "createGoal" ? (
                      <div className="space-y-5 rounded-2xl border border-border/60 bg-muted/15 p-5">
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-foreground">Perspective</label>
                          <Select
                            value={goalForm.perspectiveId}
                            onValueChange={(value) =>
                              setGoalForm((current) => ({ ...current, perspectiveId: value }))
                            }
                          >
                            <SelectTrigger className="rounded-2xl">
                              <SelectValue placeholder="Select perspective" />
                            </SelectTrigger>
                            <SelectContent>
                              {perspectiveRecords.map((perspective) => (
                                <SelectItem key={perspective.id} value={String(perspective.id)}>
                                  {perspective.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-foreground">Goal title</label>
                          <Input
                            value={goalForm.title}
                            onChange={(event) =>
                              setGoalForm((current) => ({ ...current, title: event.target.value }))
                            }
                            placeholder="Enter goal title"
                            className="rounded-2xl"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-foreground">Goal owner</label>
                          <Input
                            value={goalForm.ownerName}
                            onChange={(event) =>
                              setGoalForm((current) => ({ ...current, ownerName: event.target.value }))
                            }
                            placeholder="Enter goal owner"
                            className="rounded-2xl"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-foreground">Description</label>
                          <Textarea
                            value={goalForm.description}
                            onChange={(event) =>
                              setGoalForm((current) => ({ ...current, description: event.target.value }))
                            }
                            placeholder="What strategic outcome is this goal supposed to drive?"
                            className="min-h-[120px] rounded-2xl"
                          />
                        </div>
                        <div className="flex items-center justify-end gap-3">
                          <Button variant="outline" className="rounded-2xl" onClick={closeSetupSheet}>
                            Cancel
                          </Button>
                          <Button
                            className="rounded-2xl"
                            disabled={
                              !goalForm.perspectiveId ||
                              !goalForm.title.trim() ||
                              authoringSubmitting !== null
                            }
                            onClick={handleCreateGoal}
                          >
                            {authoringSubmitting === "createGoal" ? "Saving..." : "Save goal"}
                          </Button>
                        </div>
                      </div>
                    ) : setupSheetMode === "editGoal" ? (
                      <div className="space-y-5 rounded-2xl border border-border/60 bg-muted/15 p-5">
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-foreground">Goal title</label>
                          <Input
                            value={goalEditForm.title}
                            onChange={(e) =>
                              setGoalEditForm((c) => ({ ...c, title: e.target.value }))
                            }
                            placeholder="Enter goal title"
                            className="rounded-2xl"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-foreground">Goal owner</label>
                          <Input
                            value={goalEditForm.ownerName}
                            onChange={(e) =>
                              setGoalEditForm((c) => ({ ...c, ownerName: e.target.value }))
                            }
                            placeholder="Enter goal owner"
                            className="rounded-2xl"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-foreground">Description</label>
                          <Textarea
                            value={goalEditForm.description}
                            onChange={(e) =>
                              setGoalEditForm((c) => ({ ...c, description: e.target.value }))
                            }
                            placeholder="What strategic outcome does this goal drive?"
                            className="min-h-[120px] rounded-2xl"
                          />
                        </div>
                        <div className="flex items-center justify-end gap-3">
                          <Button variant="outline" className="rounded-2xl" onClick={closeSetupSheet}>
                            Cancel
                          </Button>
                          <Button
                            className="rounded-2xl"
                            disabled={!goalEditForm.title.trim() || authoringSubmitting !== null}
                            onClick={handleUpdateGoal}
                          >
                            {authoringSubmitting === "editGoal" ? "Saving..." : "Save changes"}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      strategyReviewPoints.map((group) => (
                        <div key={group.title} className="rounded-2xl border border-border/60 bg-muted/15 p-5">
                          <p className="font-medium text-foreground">{group.title}</p>
                          <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                            {group.lines.map((line) => (
                              <p key={line}>{line}</p>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </SheetContent>
            </Sheet>
          </TabsContent>

          <TabsContent value="kpis" className="space-y-6">
            <Card className="rounded-[28px] border-border/70 shadow-sm">
              <CardHeader className="space-y-4">
                <SectionTitle
                  icon={Target}
                  title="KPI governance"
                />
                <div className="flex flex-wrap gap-3">
                  <Button className="rounded-2xl" onClick={() => setKpiSheetMode("contract")}>
                    Open KPI engine flow
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-2xl"
                    onClick={() => setKpiSheetMode("createKpi")}
                  >
                    Create KPI
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-2xl"
                    onClick={() => setKpiSheetMode("createInitiative")}
                  >
                    Create initiative
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-2xl"
                    onClick={() => setKpiSheetMode("rules")}
                  >
                    Review governance rules
                  </Button>
                </div>
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search KPI library"
                      className="h-11 rounded-2xl pl-9"
                    />
                  </div>
                  <Select defaultValue="all-perspectives">
                    <SelectTrigger className="h-11 rounded-2xl">
                      <SelectValue placeholder="All perspectives" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all-perspectives">All perspectives</SelectItem>
                      <SelectItem value="financial">Financial</SelectItem>
                      <SelectItem value="customer">Customer / Stakeholder</SelectItem>
                      <SelectItem value="internal">Internal Process</SelectItem>
                      <SelectItem value="people">People / Learning & Growth</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select defaultValue="all-statuses">
                    <SelectTrigger className="h-11 rounded-2xl">
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all-statuses">All statuses</SelectItem>
                      <SelectItem value="on-track">On track</SelectItem>
                      <SelectItem value="at-risk">At risk</SelectItem>
                      <SelectItem value="off-track">Off track</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {governanceMetrics.map((metric) => (
                      <MetricCard
                        key={metric.label}
                        label={metric.label}
                        value={metric.value}
                        icon={metric.icon}
                      />
                    ))}
                  </div>

                  <Card className="rounded-[24px] border-border/60 shadow-none">
                    <CardHeader>
                      <CardTitle className="text-base">KPI definitions</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>KPI</TableHead>
                            <TableHead>Goal</TableHead>
                            <TableHead>Frequency</TableHead>
                            <TableHead>Owner</TableHead>
                            <TableHead>Target</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Detail</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredKpis.map((kpi) => {
                            const goal = goalData.find((candidate) => candidate.id === kpi.goalId);
                            return (
                              <TableRow key={kpi.id}>
                                <TableCell>
                                  <div>
                                    <p className="font-medium text-foreground">{kpi.name}</p>
                                    <p className="text-xs text-muted-foreground">{kpi.description}</p>
                                  </div>
                                </TableCell>
                                <TableCell>{goal?.title}</TableCell>
                                <TableCell>{kpi.frequency}</TableCell>
                                <TableCell>{kpi.owner}</TableCell>
                                <TableCell>{kpi.firmTarget}</TableCell>
                                <TableCell>
                                  <StatusBadge status={kpi.status} />
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex flex-col items-end gap-2 sm:flex-row sm:justify-end">
                                    {canUpdateKpiActuals && (
                                      <Button
                                        variant="secondary"
                                        size="sm"
                                        className="rounded-xl"
                                        onClick={() => handleUpdateKpiActual(kpi)}
                                        disabled={authoringSubmitting !== null}
                                      >
                                        Update actual
                                      </Button>
                                    )}
                                    {canUpdateKpiActuals && (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="rounded-xl"
                                        onClick={() => handleRecalculateKpi(kpi)}
                                        disabled={authoringSubmitting !== null}
                                      >
                                        {authoringSubmitting === `recalculateKpi:${kpi.id}`
                                          ? "Recalculating..."
                                          : "Recalculate"}
                                      </Button>
                                    )}
                                    <Sheet>
                                      <SheetTrigger asChild>
                                        <Button variant="outline" size="sm" className="rounded-xl">
                                          Inspect
                                        </Button>
                                      </SheetTrigger>
                                      <SheetContent className="w-full sm:max-w-xl">
                                      <ScrollArea className="h-full pr-4">
                                        <SheetHeader className="space-y-2">
                                          <SheetTitle>{kpi.name}</SheetTitle>
                                          <SheetDescription>
                                            KPI definition linked to the BSC goal <span className="font-medium text-foreground">{goal?.title}</span>.
                                          </SheetDescription>
                                        </SheetHeader>
                                        <div className="mt-6 space-y-5">
                                          <div className="grid gap-3 sm:grid-cols-2">
                                            <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                                              <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Perspective</p>
                                              <p className="mt-2 font-medium text-foreground">
                                                {perspectiveData.find((candidate) => candidate.id === kpi.perspectiveId)?.name}
                                              </p>
                                            </div>
                                            <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                                              <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Owner</p>
                                              <p className="mt-2 font-medium text-foreground">{kpi.owner}</p>
                                            </div>
                                            <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                                              <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Frequency</p>
                                              <p className="mt-2 font-medium text-foreground">{kpi.frequency}</p>
                                            </div>
                                            <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                                              <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Unit & weight</p>
                                              <p className="mt-2 font-medium text-foreground">
                                                {kpi.unit} · {kpi.weight}%
                                              </p>
                                            </div>
                                          </div>
                                          <div className="rounded-2xl border border-border/60 p-4">
                                            <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Formula</p>
                                            <p className="mt-2 text-sm text-foreground">{kpi.formula}</p>
                                          </div>
                                          <div className="rounded-2xl border border-border/60 p-4">
                                            <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Scoring rule</p>
                                            <p className="mt-2 text-sm text-foreground">{kpi.statusLogic}</p>
                                          </div>
                                          <div className="rounded-2xl border border-border/60 p-4">
                                            <div className="flex flex-wrap items-start justify-between gap-3">
                                              <div className="min-w-0">
                                                <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Current target vs actual</p>
                                                <p className="mt-2 font-medium text-foreground">
                                                  {kpi.actual} actual against {kpi.firmTarget} target
                                                </p>
                                              </div>
                                              <StatusBadge status={kpi.status} />
                                            </div>
                                            <div className="mt-4 flex items-center justify-between">
                                              <TrendBars points={kpi.trend} />
                                              <div className="text-right">
                                                <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Weighted score</p>
                                                <p className="mt-1 text-2xl font-semibold text-foreground">{kpi.weightedScore}</p>
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      </ScrollArea>
                                      </SheetContent>
                                    </Sheet>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
              </CardContent>
            </Card>

            <Card className="rounded-[28px] border-border/70 shadow-sm">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">Initiative library</CardTitle>
                    </div>
                    <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setKpiSheetMode("createInitiative")}>
                      Add initiative
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Title</TableHead>
                        <TableHead>Scope</TableHead>
                        <TableHead>Owner</TableHead>
                        <TableHead>Progress</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {initiativeRecords.map((initiative) => (
                        <TableRow key={initiative.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium text-foreground">{initiative.title}</p>
                              {initiative.summary ? (
                                <p className="text-xs text-muted-foreground line-clamp-1">{initiative.summary}</p>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{initiative.scopeRole}</TableCell>
                          <TableCell className="text-sm">{initiative.ownerName || "—"}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Progress value={initiative.progress} className="h-2 w-16 rounded-full" />
                              <span className="text-xs text-muted-foreground">{initiative.progress}%</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={initiative.status as StatusTone} />
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="rounded-xl"
                                onClick={() => openEditInitiative(initiative)}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="rounded-xl text-destructive hover:text-destructive"
                                disabled={authoringSubmitting === `archiveInitiative:${initiative.id}`}
                                onClick={() => handleArchiveInitiative(initiative)}
                              >
                                {authoringSubmitting === `archiveInitiative:${initiative.id}` ? "..." : "Archive"}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
            </Card>

            <Sheet open={kpiSheetMode !== null} onOpenChange={(open) => !open && setKpiSheetMode(null)}>
              <SheetContent className="w-full sm:max-w-2xl">
                <ScrollArea className="h-full pr-4">
                  <SheetHeader className="space-y-2">
                    <SheetTitle>
                      {kpiSheetMode === "contract"
                        ? "KPI engine flow"
                        : kpiSheetMode === "createKpi"
                          ? "Create KPI"
                          : kpiSheetMode === "createInitiative"
                            ? "Create initiative"
                            : kpiSheetMode === "editInitiative"
                              ? "Edit initiative"
                              : "KPI governance rules"}
                    </SheetTitle>
                    <SheetDescription>
                      {kpiSheetMode === "contract"
                        ? "KPI definition guide"
                        : kpiSheetMode === "createKpi"
                          ? "Define a new KPI"
                          : kpiSheetMode === "createInitiative"
                            ? "Add an initiative"
                            : kpiSheetMode === "editInitiative"
                              ? "Edit initiative"
                              : "KPI governance rules"}
                    </SheetDescription>
                  </SheetHeader>
                  <div className="mt-6 space-y-4">
                    {kpiSheetMode === "contract" ? (
                      <>
                        {kpiContractSteps.map((step) => (
                          <div key={step.step} className="rounded-2xl border border-border/60 bg-muted/15 p-5">
                            <div className="flex items-start gap-4">
                              <div className="rounded-2xl bg-primary/10 px-3 py-2 text-sm font-semibold text-primary">
                                {step.step}
                              </div>
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <step.icon className="h-4 w-4 text-primary" />
                                  <p className="font-medium text-foreground">{step.title}</p>
                                </div>
                                <p className="text-sm text-muted-foreground">{step.body}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                        {highlightedKpi ? (
                          <div className="rounded-2xl border border-border/60 bg-background p-5">
                            <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">
                              Current live example
                            </p>
                            <p className="mt-2 text-lg font-semibold text-foreground">
                              {highlightedKpi.name}
                            </p>
                            <p className="mt-2 text-sm text-muted-foreground">
                              {linkedGoal?.title} · {highlightedPerspective?.name}
                            </p>
                            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                              <div className="rounded-2xl border border-border/60 bg-muted/15 p-4">
                                <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">
                                  Target
                                </p>
                                <p className="mt-2 font-medium text-foreground">
                                  {highlightedKpi.firmTarget}
                                </p>
                              </div>
                              <div className="rounded-2xl border border-border/60 bg-muted/15 p-4">
                                <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">
                                  Owner
                                </p>
                                <p className="mt-2 font-medium text-foreground">
                                  {highlightedKpi.owner}
                                </p>
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </>
                    ) : kpiSheetMode === "createKpi" ? (
                      <KpiEngineDesigner
                        goals={goalRecords}
                        kpis={kpiRecords}
                        onCancel={() => setKpiSheetMode(null)}
                        onCreated={async () => {
                          await refreshBalancedScorecardData(selectedRole);
                          setKpiSheetMode(null);
                        }}
                      />
                    ) : kpiSheetMode === "createInitiative" ? (
                      <div className="space-y-5 rounded-2xl border border-border/60 bg-muted/15 p-5">
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Strategic goal</label>
                            <Select
                              value={initiativeForm.goalId}
                              onValueChange={(value) =>
                                setInitiativeForm((current) => ({ ...current, goalId: value }))
                              }
                            >
                              <SelectTrigger className="rounded-2xl">
                                <SelectValue placeholder="Select goal" />
                              </SelectTrigger>
                              <SelectContent>
                                {goalRecords.map((goal) => (
                                  <SelectItem key={goal.id} value={String(goal.id)}>
                                    {goal.title}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Linked KPI</label>
                            <Select
                              value={initiativeForm.kpiId}
                              onValueChange={(value) =>
                                setInitiativeForm((current) => ({ ...current, kpiId: value }))
                              }
                            >
                              <SelectTrigger className="rounded-2xl">
                                <SelectValue placeholder="Select KPI" />
                              </SelectTrigger>
                              <SelectContent>
                                {initiativeKpiOptions.map((kpi) => (
                                  <SelectItem key={kpi.id} value={String(kpi.id)}>
                                    {kpi.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Scope role</label>
                            <Select
                              value={initiativeForm.scopeRole}
                              onValueChange={(value) =>
                                setInitiativeForm((current) => ({ ...current, scopeRole: value }))
                              }
                            >
                              <SelectTrigger className="rounded-2xl">
                                <SelectValue placeholder="Select role layer" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="hr">HR</SelectItem>
                                <SelectItem value="gmp">GMP</SelectItem>
                                <SelectItem value="partner">Partner</SelectItem>
                                <SelectItem value="manager">Manager</SelectItem>
                                <SelectItem value="employee">Employee</SelectItem>
                                <SelectItem value="finance">Finance</SelectItem>
                                <SelectItem value="marketing">Marketing</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Parent initiative</label>
                            <Select
                              value={initiativeForm.parentInitiativeId}
                              onValueChange={(value) =>
                                setInitiativeForm((current) => ({ ...current, parentInitiativeId: value }))
                              }
                            >
                              <SelectTrigger className="rounded-2xl">
                                <SelectValue placeholder="Optional parent initiative" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">No parent</SelectItem>
                                {initiativeRecords
                                  .filter(
                                    (initiative) =>
                                      !initiativeForm.goalId || initiative.goalId === Number(initiativeForm.goalId)
                                  )
                                  .map((initiative) => (
                                    <SelectItem key={initiative.id} value={String(initiative.id)}>
                                      {initiative.title}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-foreground">Initiative title</label>
                          <Input
                            value={initiativeForm.title}
                            onChange={(event) =>
                              setInitiativeForm((current) => ({ ...current, title: event.target.value }))
                            }
                            placeholder="Enter initiative title"
                            className="rounded-2xl"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-foreground">Summary</label>
                          <Textarea
                            value={initiativeForm.summary}
                            onChange={(event) =>
                              setInitiativeForm((current) => ({ ...current, summary: event.target.value }))
                            }
                            placeholder="How does this initiative drive the KPI?"
                            className="min-h-[96px] rounded-2xl"
                          />
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Owner</label>
                            <Input
                              value={initiativeForm.ownerName}
                              onChange={(event) =>
                                setInitiativeForm((current) => ({ ...current, ownerName: event.target.value }))
                              }
                              placeholder="Initiative owner"
                              className="rounded-2xl"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Timeline</label>
                            <Input
                              value={initiativeForm.timeline}
                              onChange={(event) =>
                                setInitiativeForm((current) => ({ ...current, timeline: event.target.value }))
                              }
                              placeholder="Apr 2026 - Dec 2026"
                              className="rounded-2xl"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Due date</label>
                            <Input
                              type="date"
                              value={initiativeForm.dueDate}
                              onChange={(event) =>
                                setInitiativeForm((current) => ({ ...current, dueDate: event.target.value }))
                              }
                              className="rounded-2xl"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Progress</label>
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              value={initiativeForm.progress}
                              onChange={(event) =>
                                setInitiativeForm((current) => ({ ...current, progress: event.target.value }))
                              }
                              placeholder="0"
                              className="rounded-2xl"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-foreground">Status</label>
                          <Select
                            value={initiativeForm.status}
                            onValueChange={(value: StatusTone) =>
                              setInitiativeForm((current) => ({ ...current, status: value }))
                            }
                          >
                            <SelectTrigger className="rounded-2xl">
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="on_track">On track</SelectItem>
                              <SelectItem value="at_risk">At risk</SelectItem>
                              <SelectItem value="off_track">Off track</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center justify-end gap-3">
                          <Button variant="outline" className="rounded-2xl" onClick={() => setKpiSheetMode(null)}>
                            Cancel
                          </Button>
                          <Button
                            className="rounded-2xl"
                            disabled={
                              !initiativeForm.goalId ||
                              !initiativeForm.kpiId ||
                              !initiativeForm.scopeRole ||
                              !initiativeForm.title.trim() ||
                              authoringSubmitting !== null
                            }
                            onClick={handleCreateInitiative}
	                          >
	                            {authoringSubmitting === "createInitiative" ? "Saving..." : "Save initiative"}
	                          </Button>
	                        </div>
	                      </div>
	                    ) : kpiSheetMode === "editInitiative" ? (
                      <div className="space-y-5 rounded-2xl border border-border/60 bg-muted/15 p-5">
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-foreground">Title</label>
                          <Input
                            value={initiativeEditForm.title}
                            onChange={(e) => setInitiativeEditForm((c) => ({ ...c, title: e.target.value }))}
                            placeholder="Initiative title"
                            className="rounded-2xl"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-foreground">Summary</label>
                          <Textarea
                            value={initiativeEditForm.summary}
                            onChange={(e) => setInitiativeEditForm((c) => ({ ...c, summary: e.target.value }))}
                            placeholder="What does this initiative deliver?"
                            className="min-h-[100px] rounded-2xl"
                          />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Owner</label>
                            <Input
                              value={initiativeEditForm.ownerName}
                              onChange={(e) => setInitiativeEditForm((c) => ({ ...c, ownerName: e.target.value }))}
                              placeholder="Owner name"
                              className="rounded-2xl"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Scope role</label>
                            <Select value={initiativeEditForm.scopeRole} onValueChange={(v) => setInitiativeEditForm((c) => ({ ...c, scopeRole: v }))}>
                              <SelectTrigger className="rounded-2xl"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {["hr","gmp","partner","manager","finance","marketing","employee"].map((r) => (
                                  <SelectItem key={r} value={r}>{r}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Timeline</label>
                            <Input
                              value={initiativeEditForm.timeline}
                              onChange={(e) => setInitiativeEditForm((c) => ({ ...c, timeline: e.target.value }))}
                              placeholder="e.g. Q2 2026"
                              className="rounded-2xl"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Due date</label>
                            <Input
                              type="date"
                              value={initiativeEditForm.dueDate}
                              onChange={(e) => setInitiativeEditForm((c) => ({ ...c, dueDate: e.target.value }))}
                              className="rounded-2xl"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Status</label>
                            <Select value={initiativeEditForm.status} onValueChange={(v) => setInitiativeEditForm((c) => ({ ...c, status: v as StatusTone }))}>
                              <SelectTrigger className="rounded-2xl"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="on_track">On track</SelectItem>
                                <SelectItem value="at_risk">At risk</SelectItem>
                                <SelectItem value="off_track">Off track</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Progress — {initiativeEditForm.progress}%</label>
                            <Input
                              type="number" min={0} max={100}
                              value={initiativeEditForm.progress}
                              onChange={(e) => setInitiativeEditForm((c) => ({ ...c, progress: e.target.value }))}
                              className="rounded-2xl"
                            />
                          </div>
                        </div>
                        <div className="flex items-center justify-end gap-3">
                          <Button variant="outline" className="rounded-2xl" onClick={() => { setKpiSheetMode(null); setEditingInitiativeId(null); }}>
                            Cancel
                          </Button>
                          <Button
                            className="rounded-2xl"
                            disabled={!initiativeEditForm.title.trim() || authoringSubmitting !== null}
                            onClick={handleUpdateInitiative}
                          >
                            {authoringSubmitting === "editInitiative" ? "Saving..." : "Save changes"}
                          </Button>
                        </div>
                      </div>
	                    ) : (
	                      kpiGovernanceRules.map((rule) => (
                        <div key={rule} className="rounded-2xl border border-border/60 bg-muted/15 p-5 text-sm text-muted-foreground">
                          {rule}
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </SheetContent>
            </Sheet>
          </TabsContent>

          <TabsContent value="peopleAdmin" className="space-y-6">
            <BalancedScorecardPeopleAdminPanel
              currentVersionId={adminVersionId}
              currentVersionLabel={adminVersionLabel}
              assignments={kpiAssignments}
              performanceBands={performanceBands}
              kpis={kpiRecords as BalancedScorecardKpiRecord[]}
              employeeOptions={employeeDirectory}
              roleOptions={positionRoles}
              submittingKey={authoringSubmitting}
              onSaveAssignment={handleSaveKpiAssignment}
              onDeleteAssignment={handleDeleteKpiAssignment}
              onSavePerformanceBand={handleSavePerformanceBand}
            />
          </TabsContent>

          <TabsContent value="tracking" className="space-y-6">
            <Card className="rounded-[28px] border-border/70 shadow-sm">
              <CardHeader className="space-y-4">
                <SectionTitle
                  icon={LineChart}
                  title={trackingView.title}
                />
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search tracked KPIs"
                      className="h-11 rounded-2xl pl-9"
                    />
                  </div>
                  <Button variant="outline" className="h-11 rounded-2xl justify-start gap-2">
                    <Filter className="h-4 w-4" />
                    Advanced filters
                  </Button>
                </div>
                {canPreviewAllRoles ? (
                  <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_240px_auto_auto_auto_auto_auto]">
                    <Select
                      value={selectedMeasurementPeriodId}
                      onValueChange={setSelectedMeasurementPeriodId}
                    >
                      <SelectTrigger className="h-11 rounded-2xl">
                        <SelectValue placeholder="Select measurement period" />
                      </SelectTrigger>
                      <SelectContent>
                        {measurementPeriods.map((period) => (
                          <SelectItem key={period.id} value={String(period.id)}>
                            {period.label} · {period.status}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      className="h-11 rounded-2xl"
                      onClick={() => setMeasurementPeriodDialogOpen(true)}
                      disabled={!measurementVersionId}
                    >
                      Create period
                    </Button>
                    <Button
                      variant="outline"
                      className="h-11 rounded-2xl"
                      onClick={handleGenerateMeasurementPeriod}
                      disabled={
                        !selectedMeasurementPeriod ||
                        measurementSubmitting === `generateMeasurement:${selectedMeasurementPeriod?.id}`
                      }
                    >
                      {selectedMeasurementPeriod &&
                      measurementSubmitting === `generateMeasurement:${selectedMeasurementPeriod.id}`
                        ? "Generating..."
                        : "Generate pack"}
                    </Button>
                    <Button
                      variant="outline"
                      className="h-11 rounded-2xl"
                      onClick={handleSubmitMeasurementPeriod}
                      disabled={
                        !selectedMeasurementPeriod ||
                        !["draft", "generated"].includes(selectedMeasurementPeriod.status) ||
                        measurementSubmitting === `submitMeasurement:${selectedMeasurementPeriod?.id}`
                      }
                    >
                      {selectedMeasurementPeriod &&
                      measurementSubmitting === `submitMeasurement:${selectedMeasurementPeriod.id}`
                        ? "Submitting..."
                        : "Submit"}
                    </Button>
                    <Button
                      variant="outline"
                      className="h-11 rounded-2xl"
                      onClick={handleCloseMeasurementPeriod}
                      disabled={
                        !selectedMeasurementPeriod ||
                        selectedMeasurementPeriod.status !== "approved" ||
                        measurementSubmitting === `closeMeasurement:${selectedMeasurementPeriod?.id}`
                      }
                    >
                      {selectedMeasurementPeriod &&
                      measurementSubmitting === `closeMeasurement:${selectedMeasurementPeriod.id}`
                        ? "Closing..."
                        : "Close"}
                    </Button>
                    <Button
                      variant="outline"
                      className="h-11 rounded-2xl"
                      onClick={() => handleDownloadMeasurementReviewPack("xlsx")}
                      disabled={
                        !selectedMeasurementPeriod ||
                        selectedMeasurementPeriod.snapshotCount <= 0 ||
                        measurementPackDownloading
                      }
                    >
                      {measurementPackDownloading ? "Downloading..." : "Download pack"}
                    </Button>
                  </div>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-2 xl:grid-cols-4">
                  {trackingView.metrics.map((metric) => (
                    <MetricCard
                      key={metric.label}
                      label={metric.label}
                      value={metric.value}
                      icon={metric.icon}
                    />
                  ))}
                </div>

                {/* Visual KPI health overview */}
                {trackingView.kpis.length >= 2 && (
                  <div className="grid gap-4 xl:grid-cols-2">
                    {/* KPI score bar chart */}
                    <div className="rounded-[24px] border border-border/60 bg-muted/20 p-4 space-y-3">
                      <p className="text-sm font-medium text-foreground">KPI score overview</p>
                      <ResponsiveContainer width="100%" height={Math.max(140, trackingView.kpis.length * 38)}>
                        <BarChart
                          data={trackingView.kpis.map((kpi) => ({
                            name: String("kpiName" in kpi ? kpi.kpiName : kpi.name).split(" ").slice(0, 3).join(" "),
                            score: kpi.weightedScore,
                            fill: kpi.status === "on_track" ? "#10b981" : kpi.status === "at_risk" ? "#f59e0b" : "#ef4444",
                          }))}
                          layout="vertical"
                          margin={{ top: 4, right: 40, left: 8, bottom: 4 }}
                        >
                          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                          <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                          <Tooltip formatter={(v: number) => [`${v}%`, "Score"]} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} />
                          <ReferenceLine x={80} stroke="#10b981" strokeDasharray="3 3" label={{ value: "Target", position: "top", fontSize: 10, fill: "#10b981" }} />
                          <ReferenceLine x={60} stroke="#f59e0b" strokeDasharray="3 3" />
                          <Bar dataKey="score" radius={[0, 4, 4, 0]} maxBarSize={22}>
                            {trackingView.kpis.map((kpi, i) => (
                              <Cell key={i} fill={kpi.status === "on_track" ? "#10b981" : kpi.status === "at_risk" ? "#f59e0b" : "#ef4444"} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Perspective radar / department breakdown */}
                    {(selectedRole === "manager" || selectedRole === "partner") && departmentPerformanceData.length >= 2 ? (
                      <div className="rounded-[24px] border border-border/60 bg-muted/20 p-4 space-y-3">
                        <p className="text-sm font-medium text-foreground">Department health snapshot</p>
                        <ResponsiveContainer width="100%" height={Math.max(140, departmentPerformanceData.length * 38)}>
                          <BarChart
                            data={[...departmentPerformanceData].sort((a, b) => b.score - a.score).map((d) => ({
                              name: d.name.split(" ").slice(0, 2).join(" "),
                              score: d.score,
                            }))}
                            layout="vertical"
                            margin={{ top: 4, right: 40, left: 8, bottom: 4 }}
                          >
                            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                            <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                            <Tooltip formatter={(v: number) => [`${v}%`, "Score"]} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} />
                            <ReferenceLine x={80} stroke="#10b981" strokeDasharray="3 3" />
                            <Bar dataKey="score" radius={[0, 4, 4, 0]} maxBarSize={22}>
                              {[...departmentPerformanceData].sort((a, b) => b.score - a.score).map((d, i) => (
                                <Cell key={i} fill={d.status === "on_track" ? "#10b981" : d.status === "at_risk" ? "#f59e0b" : "#ef4444"} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    ) : scopedPerspectives.length >= 2 ? (
                      <div className="rounded-[24px] border border-border/60 bg-muted/20 p-4 space-y-3">
                        <p className="text-sm font-medium text-foreground">Perspective health radar</p>
                        <ResponsiveContainer width="100%" height={180}>
                          <RadarChart data={scopedPerspectives.map((p) => ({ subject: p.name.split(" ")[0], score: p.score, fullMark: 100 }))}>
                            <PolarGrid stroke="#e2e8f0" />
                            <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: "#64748b" }} />
                            <Radar dataKey="score" fill="#6366f1" fillOpacity={0.2} stroke="#6366f1" strokeWidth={2} />
                          </RadarChart>
                        </ResponsiveContainer>
                      </div>
                    ) : null}
                  </div>
                )}

                {/* Manager: team employee contribution chart */}
                {selectedRole === "manager" && managerEmployeeItems.length > 0 && (
                  <div className="rounded-[24px] border border-border/60 bg-muted/20 p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-foreground">Team contribution scores</p>
                      <div className="flex gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500" />On track</span>
                        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400" />At risk</span>
                        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-red-400" />Off track</span>
                      </div>
                    </div>
                    <ResponsiveContainer width="100%" height={Math.max(120, managerEmployeeItems.length * 40)}>
                      <BarChart
                        data={[...managerEmployeeItems].sort((a, b) => b.progress - a.progress).map((item) => ({
                          name: item.employee.split(" ")[0],
                          progress: item.progress,
                          fill: item.status === "on_track" ? "#10b981" : item.status === "at_risk" ? "#f59e0b" : "#ef4444",
                        }))}
                        layout="vertical"
                        margin={{ top: 4, right: 40, left: 4, bottom: 4 }}
                      >
                        <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                        <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                        <Tooltip formatter={(v: number) => [`${v}%`, "Progress"]} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} />
                        <ReferenceLine x={80} stroke="#10b981" strokeDasharray="3 3" />
                        <Bar dataKey="progress" radius={[0, 4, 4, 0]} maxBarSize={24}>
                          {[...managerEmployeeItems].sort((a, b) => b.progress - a.progress).map((item, i) => (
                            <Cell key={i} fill={item.status === "on_track" ? "#10b981" : item.status === "at_risk" ? "#f59e0b" : "#ef4444"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
                {canPreviewAllRoles && selectedMeasurementPeriod ? (
                  <Card className="rounded-[24px] border-border/60 bg-muted/20 shadow-none">
                    <CardHeader>
                      <CardTitle className="text-base">Measurement workflow</CardTitle>
                      <CardDescription>
                        {selectedMeasurementPeriod.label} · {selectedMeasurementPeriod.status}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_320px]">
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-2xl border border-border/60 bg-background p-4">
                          <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Snapshots</p>
                          <p className="mt-2 text-2xl font-semibold text-foreground">{selectedMeasurementPeriod.snapshotCount}</p>
                        </div>
                        <div className="rounded-2xl border border-border/60 bg-background p-4">
                          <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">At risk / off track</p>
                          <p className="mt-2 text-2xl font-semibold text-foreground">
                            {selectedMeasurementPeriod.atRiskCount + selectedMeasurementPeriod.offTrackCount}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-border/60 bg-background p-4">
                          <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Warnings</p>
                          <p className="mt-2 text-2xl font-semibold text-foreground">{selectedMeasurementPeriod.warningCount}</p>
                        </div>
                        <div className="rounded-2xl border border-border/60 bg-background p-4">
                          <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Missing data</p>
                          <p className="mt-2 text-2xl font-semibold text-foreground">{selectedMeasurementPeriod.missingDataCount}</p>
                        </div>
                      </div>
                      <div className="space-y-2 rounded-2xl border border-border/60 bg-background p-4">
                        <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Review actions</p>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            className="rounded-xl"
                            disabled={
                              !selectedMeasurementPeriod ||
                              selectedMeasurementPeriod.status !== "submitted" ||
                              measurementSubmitting === `start_review:${selectedMeasurementPeriod.id}`
                            }
                            onClick={() => handleReviewMeasurementPeriod("start_review")}
                          >
                            Start review
                          </Button>
                          <Button
                            variant="outline"
                            className="rounded-xl"
                            disabled={
                              !selectedMeasurementPeriod ||
                              !["submitted", "in_review"].includes(selectedMeasurementPeriod.status) ||
                              measurementSubmitting === `request_changes:${selectedMeasurementPeriod.id}`
                            }
                            onClick={() => handleReviewMeasurementPeriod("request_changes")}
                          >
                            Request changes
                          </Button>
                          <Button
                            className="rounded-xl"
                            disabled={
                              !selectedMeasurementPeriod ||
                              !["submitted", "in_review"].includes(selectedMeasurementPeriod.status) ||
                              measurementSubmitting === `approve:${selectedMeasurementPeriod.id}`
                            }
                            onClick={() => handleReviewMeasurementPeriod("approve")}
                          >
                            Approve pack
                          </Button>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Generated snapshots stay editable until the period is closed, then the pack freezes.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ) : null}
                <Card className="rounded-[24px] border-border/60 shadow-none">
                  <CardHeader>
                    <CardTitle className="text-base">
                      {canPreviewAllRoles && selectedMeasurementPeriod
                        ? "Measurement snapshot pack"
                        : trackingView.boardTitle}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>KPI</TableHead>
                          <TableHead>Target vs actual</TableHead>
                          <TableHead>Weighted score</TableHead>
                          <TableHead>Update frequency</TableHead>
                          <TableHead>Trend</TableHead>
                          <TableHead>Initiative progress</TableHead>
                          {canPreviewAllRoles && selectedMeasurementPeriod ? (
                            <TableHead>Data quality</TableHead>
                          ) : null}
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(canPreviewAllRoles && selectedMeasurementPeriod
                          ? measurementSnapshots
                          : trackingView.kpis
                        ).map((kpi) => (
                          <TableRow key={kpi.id}>
                            <TableCell className="min-w-[240px]">
                              <div className="space-y-1">
                                <p className="font-medium text-foreground">
                                  {"kpiName" in kpi ? kpi.kpiName : kpi.name}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <p className="font-medium text-foreground">
                                  {"actualLabel" in kpi ? kpi.actualLabel : kpi.actual} / {kpi.firmTarget}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell className="font-semibold text-foreground">{kpi.weightedScore}</TableCell>
                            <TableCell>{kpi.updateFrequency}</TableCell>
                            <TableCell>
                              <TrendBars points={kpi.trend} />
                            </TableCell>
                            <TableCell className="min-w-[180px]">
                              <div className="space-y-2">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-muted-foreground">Linked initiatives</span>
                                  <span className="font-medium text-foreground">{kpi.initiativeProgress}%</span>
                                </div>
                                <Progress value={kpi.initiativeProgress} className="h-2.5 rounded-full" />
                              </div>
                            </TableCell>
                            {canPreviewAllRoles && selectedMeasurementPeriod ? (
                              <TableCell>
                                {"dataQualityStatus" in kpi ? (
                                  <Badge variant="outline" className="rounded-full">
                                    {kpi.dataQualityStatus.replace(/_/g, " ")}
                                  </Badge>
                                ) : null}
                              </TableCell>
                            ) : null}
                            <TableCell>
                              <StatusBadge status={kpi.status} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
                {canPreviewAllRoles && selectedMeasurementPeriod && highlightedMeasurementSnapshot ? (
                  <Card className="rounded-[24px] border-border/60 bg-muted/20 shadow-none">
                    <CardHeader>
                      <CardTitle className="text-base">Trace and data quality</CardTitle>
                      <CardDescription>
                        {highlightedMeasurementSnapshot.kpiName} · {highlightedMeasurementSnapshot.dataQualityStatus.replace(/_/g, " ")}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_320px]">
                      <div className="space-y-3">
                        {highlightedMeasurementSnapshot.traces.map((trace) => (
                          <div key={trace.id} className="rounded-2xl border border-border/60 bg-background p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-medium text-foreground">{trace.sourceLabel}</p>
                                <p className="text-sm text-muted-foreground">{trace.note || "No supporting note yet."}</p>
                              </div>
                              <Badge variant="outline" className="rounded-full">
                                {trace.dataQualityStatus.replace(/_/g, " ")}
                              </Badge>
                            </div>
                            <div className="mt-3 grid gap-3 sm:grid-cols-3">
                              <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
                                <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Records</p>
                                <p className="mt-2 font-medium text-foreground">{trace.recordCount ?? 0}</p>
                              </div>
                              <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
                                <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Raw value</p>
                                <p className="mt-2 font-medium text-foreground">{trace.rawValue ?? "-"}</p>
                              </div>
                              <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
                                <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Normalized</p>
                                <p className="mt-2 font-medium text-foreground">{trace.normalizedValue ?? "-"}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="space-y-3 rounded-[24px] border border-border/60 bg-background p-4">
                        <p className="text-sm font-medium text-foreground">Snapshot summary</p>
                        <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                          <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Owner update</p>
                          <p className="mt-2 text-sm text-muted-foreground">
                            {highlightedMeasurementSnapshot.ownerUpdate || "No owner commentary captured in this snapshot."}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                          <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Data-quality note</p>
                          <p className="mt-2 text-sm text-muted-foreground">
                            {highlightedMeasurementSnapshot.dataQualityNote || "No additional data-quality note for this KPI."}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ) : null}

                
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="employee" className="space-y-6">
            <Card className="rounded-[28px] border-border/70 shadow-sm">
              <CardHeader className="space-y-4">
                <SectionTitle
                  icon={User}
                  title={employeeView.title}
                />
                {/* <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="rounded-full">
                    {selectedRole === "employee"
                      ? "Lightweight by default"
                      : selectedRole === "manager"
                        ? "Manager action board"
                        : "Workforce governance lens"}
                  </Badge>
                  <Badge variant="outline" className="rounded-full">
                    {selectedRole === "employee"
                      ? "Personal work only"
                      : selectedRole === "manager"
                        ? "Team action focus"
                        : "Cross-team signal only"}
                  </Badge>
                  <Badge variant="outline" className="rounded-full">
                    {selectedRole === "employee" ? "Includes a small upward-connect section" : "Roll-up and acknowledgement visibility"}
                  </Badge>
                </div> */}
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 2xl:grid-cols-4">
                    {employeeView.metrics.map((metric) => (
                      <MetricCard
                        key={metric.label}
                        label={metric.label}
                        value={metric.value}
                        icon={metric.icon}
                      />
                    ))}
                  </div>

	                  <div className="space-y-4">
	                    {selectedRole === "employee"
	                      ? (
	                        <>
                          {employeeKpiAssignmentDetails.length > 0 ? (
                            <Card className="rounded-[24px] border-border/60 bg-muted/20 shadow-none">
                              <CardContent className="space-y-5 p-5">
                                {/* Header */}
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="min-w-0 space-y-1">
                                    <p className="text-lg font-semibold text-foreground">My KPI Performance</p>
                                  </div>
                                  <StatusBadge status={scoreToStatus(employeeKpiScore)} />
                                </div>

                                {/* Visual summary: gauge + stats */}
                                <div className="flex flex-col sm:flex-row items-center gap-5 rounded-2xl border border-border/60 bg-background p-4">
                                  {/* Radial gauge */}
                                  {(() => {
                                    const size = 100;
                                    const r = (size - 12) / 2;
                                    const circ = 2 * Math.PI * r;
                                    const pct = Math.min(100, Math.max(0, employeeKpiScore));
                                    const offset = circ - (pct / 100) * circ;
                                    const color = employeeKpiScore >= 80 ? "#10b981" : employeeKpiScore >= 60 ? "#f59e0b" : "#ef4444";
                                    return (
                                      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
                                        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
                                          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth="9" />
                                          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="9"
                                            strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
                                            style={{ transition: "stroke-dashoffset 0.6s ease" }} />
                                        </svg>
                                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                                          <span className="text-xl font-bold" style={{ color }}>{employeeKpiScore}%</span>
                                          <span className="text-[9px] text-muted-foreground mt-0.5">MY SCORE</span>
                                        </div>
                                      </div>
                                    );
                                  })()}
                                  {/* Stat tiles */}
                                  <div className="flex-1 grid gap-3 sm:grid-cols-3 w-full">
                                    <div className="rounded-xl border border-border/60 bg-muted/30 p-3 text-center">
                                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">KPIs Assigned</p>
                                      <p className="mt-1 text-2xl font-bold text-foreground">{employeeKpiAssignmentData.length}</p>
                                    </div>
                                    <div className="rounded-xl border border-border/60 bg-muted/30 p-3 text-center">
                                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Avg Actual</p>
                                      <p className="mt-1 text-2xl font-bold text-foreground">
                                        {employeeKpiAssignmentData.length > 0
                                          ? Math.round(employeeKpiAssignmentData.reduce((s, a) => s + a.actualProgress, 0) / employeeKpiAssignmentData.length)
                                          : 0}%
                                      </p>
                                    </div>
                                    <div className="rounded-xl border border-border/60 bg-muted/30 p-3 text-center">
                                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Cascade</p>
                                      <p className="mt-1 text-xs font-semibold text-foreground leading-tight">You → Dept → Firm</p>
                                    </div>
                                  </div>
                                </div>

                                {/* Individual KPI cards with target vs actual chart */}
                                <div className="space-y-4">
                                  {employeeKpiAssignmentDetails.map(({ assignment, kpi, goal, perspective }) => {
                                    const target = Number(assignment.individualTarget ?? kpi?.firmTarget ?? 85);
                                    const actual = assignment.actualProgress;
                                    const score = assignment.score;
                                    const barColor = score >= 80 ? "#10b981" : score >= 60 ? "#f59e0b" : "#ef4444";
                                    const chartData = [
                                      { label: "Actual", value: actual, fill: barColor },
                                      { label: "Target", value: Number.isFinite(target) ? target : 85, fill: "#e2e8f0" },
                                    ];
                                    return (
                                      <div key={assignment.id} className="rounded-2xl border border-border/60 bg-background p-4 space-y-4">
                                        {/* KPI header */}
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                          <div className="min-w-0">
                                            <p className="font-semibold text-foreground break-words">{assignment.kpiName}</p>
                                            <p className="mt-0.5 text-sm text-muted-foreground">
                                              {perspective?.name || "Perspective pending"} · {goal?.title || "Goal pending"}
                                            </p>
                                          </div>
                                          <StatusBadge status={assignment.status} />
                                        </div>

                                        {/* Target vs Actual chart + score ring side-by-side */}
                                        <div className="flex flex-col sm:flex-row gap-4 items-center">
                                          {/* Mini gauge */}
                                          {(() => {
                                            const sz = 72;
                                            const rad = (sz - 8) / 2;
                                            const c = 2 * Math.PI * rad;
                                            const off = c - (Math.min(100, score) / 100) * c;
                                            return (
                                              <div className="relative flex-shrink-0" style={{ width: sz, height: sz }}>
                                                <svg width={sz} height={sz} style={{ transform: "rotate(-90deg)" }}>
                                                  <circle cx={sz/2} cy={sz/2} r={rad} fill="none" stroke="#e2e8f0" strokeWidth="7" />
                                                  <circle cx={sz/2} cy={sz/2} r={rad} fill="none" stroke={barColor} strokeWidth="7"
                                                    strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
                                                    style={{ transition: "stroke-dashoffset 0.5s ease" }} />
                                                </svg>
                                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                                  <span className="text-sm font-bold" style={{ color: barColor }}>{score}%</span>
                                                  <span className="text-[9px] text-muted-foreground">Score</span>
                                                </div>
                                              </div>
                                            );
                                          })()}

                                          {/* Target vs Actual bar chart */}
                                          <div className="flex-1 w-full">
                                            <p className="text-xs text-muted-foreground mb-1">Target vs Actual</p>
                                            <ResponsiveContainer width="100%" height={80}>
                                              <BarChart data={chartData} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
                                                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                                                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                                                <Tooltip formatter={(v: number) => [`${v}%`]} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} />
                                                <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={36}>
                                                  {chartData.map((entry, i) => (
                                                    <Cell key={i} fill={entry.fill} />
                                                  ))}
                                                </Bar>
                                              </BarChart>
                                            </ResponsiveContainer>
                                          </div>

                                          {/* Stats column */}
                                          <div className="grid grid-cols-2 sm:grid-cols-1 gap-2 text-sm shrink-0">
                                            <div>
                                              <p className="text-xs text-muted-foreground">Actual</p>
                                              <p className="font-semibold text-foreground">{actual}%</p>
                                            </div>
                                            <div>
                                              <p className="text-xs text-muted-foreground">Target</p>
                                              <p className="font-semibold text-foreground">{Number.isFinite(target) ? `${target}%` : "Default"}</p>
                                            </div>
                                            <div>
                                              <p className="text-xs text-muted-foreground">Due</p>
                                              <p className="font-semibold text-foreground">{assignment.dueDate || "Period end"}</p>
                                            </div>
                                          </div>
                                        </div>

                                        {/* Status logic */}
                                        {kpi?.statusLogic && (
                                          <p className="text-xs text-muted-foreground border-t border-border/50 pt-3">
                                            {kpi.statusLogic}
                                          </p>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </CardContent>
                            </Card>
                          ) : (
                            <Card className="rounded-[24px] border-border/60 bg-muted/20 shadow-none">
                              <CardContent className="space-y-4 p-5">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <p className="text-lg font-semibold text-foreground">No employee KPI assignment yet</p>
                                    <p className="mt-1 text-sm text-muted-foreground">No KPIs assigned yet.</p>
                                  </div>
                                  <Badge variant="outline" className="rounded-full">Awaiting KPI assignment</Badge>
                                </div>
                                <div className="grid gap-3 md:grid-cols-3">
                                  <div className="rounded-2xl border border-border/60 bg-background p-4">
                                    <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Step 1</p>
                                    <p className="mt-2 font-medium text-foreground">Create KPI</p>
                                  </div>
                                  <div className="rounded-2xl border border-border/60 bg-background p-4">
                                    <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Step 2</p>
                                    <p className="mt-2 font-medium text-foreground">Assign KPI to employee</p>
                                  </div>
                                  <div className="rounded-2xl border border-border/60 bg-background p-4">
                                    <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Step 3</p>
                                    <p className="mt-2 font-medium text-foreground">Track individual to firm score</p>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          )}

                          {linkedPrimaryContribution ? (
                            <Card className="rounded-[24px] border-border/60 bg-muted/20 shadow-none">
                              <CardContent className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1.35fr)_320px]">
                                <div className="space-y-4">
                                  <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0 space-y-2">
                                      <p className="text-lg font-semibold text-foreground">Current contribution line of sight</p>
                                    </div>
                                    {employeeOverallStatus ? <StatusBadge status={employeeOverallStatus} /> : null}
                                  </div>
                                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                    <div className="rounded-2xl border border-border/60 bg-background p-4">
                                      <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Perspective</p>
                                      <p className="mt-2 font-medium text-foreground">
                                        {linkedPrimaryContribution.perspective?.name || "Not linked yet"}
                                      </p>
                                    </div>
                                    <div className="rounded-2xl border border-border/60 bg-background p-4">
                                      <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Strategic goal</p>
                                      <p className="mt-2 font-medium text-foreground">
                                        {linkedPrimaryContribution.goal?.title || "No goal linked"}
                                      </p>
                                    </div>
                                    <div className="rounded-2xl border border-border/60 bg-background p-4">
                                      <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Linked KPI</p>
                                      <p className="mt-2 font-medium text-foreground">
                                        {linkedPrimaryContribution.kpi?.name || "No KPI linked"}
                                      </p>
                                    </div>
                                    <div className="rounded-2xl border border-border/60 bg-background p-4">
                                      <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Initiative</p>
                                      <p className="mt-2 font-medium text-foreground">
                                        {linkedPrimaryContribution.item.initiative || linkedPrimaryContribution.item.title}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="grid gap-3 lg:grid-cols-2">
                                    <div className="rounded-2xl border border-border/60 bg-background p-4">
                                      <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">KPI</p>
                                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                        <div>
                                          <p className="text-xs text-muted-foreground">Target</p>
                                          <p className="mt-1 text-base font-semibold text-foreground">
                                            {linkedPrimaryContribution.kpi?.firmTarget || "Not set"}
                                          </p>
                                        </div>
                                        <div>
                                          <p className="text-xs text-muted-foreground">Current actual</p>
                                          <p className="mt-1 text-base font-semibold text-foreground">
                                            {linkedPrimaryContribution.kpi?.actual || "Awaiting update"}
                                          </p>
                                        </div>
                                      </div>
                                      <p className="mt-3 text-sm text-muted-foreground">
                                        {linkedPrimaryContribution.item.rollup || "No roll-up note yet."}
                                      </p>
                                    </div>
                                    <div className="rounded-2xl border border-border/60 bg-background p-4">
                                      <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">What needs my attention</p>
                                      <div className="mt-3 space-y-3 text-sm text-muted-foreground">
                                        <div className="flex items-center justify-between gap-3">
                                          <span>Pending updates</span>
                                          <span className="font-medium text-foreground">{employeePendingUpdateCount}</span>
                                        </div>
                                        <div className="flex items-center justify-between gap-3">
                                          <span>Acknowledged items</span>
                                          <span className="font-medium text-foreground">
                                            {employeeAcknowledgedCount}/{employeeContributionData.length}
                                          </span>
                                        </div>
                                        <div className="flex items-center justify-between gap-3">
                                          <span>Next due date</span>
                                          <span className="font-medium text-foreground">{linkedPrimaryContribution.item.dueDate}</span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                <div className="space-y-3 rounded-[24px] border border-border/60 bg-background p-4">
                                  <p className="text-sm font-medium text-foreground">Current period</p>
                                  <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                                    <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Review window</p>
                                    <p className="mt-2 font-medium text-foreground">
                                      {evaluationSummary.cycleTitle || "Live KPI view"}
                                    </p>
                                    <p className="mt-2 text-sm text-muted-foreground">
                                      {evaluationSummary.startDate && evaluationSummary.endDate
                                        ? `${new Date(evaluationSummary.startDate).toLocaleDateString("en-GB", {
                                            day: "2-digit",
                                            month: "short",
                                          })} to ${new Date(evaluationSummary.endDate).toLocaleDateString("en-GB", {
                                            day: "2-digit",
                                            month: "short",
                                          })}`
                                        : "Live KPI view"}
                                    </p>
                                  </div>
                                  <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                                    <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Execution health</p>
                                    <p className="mt-2 text-2xl font-semibold text-foreground">{averageContributionProgress}%</p>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                      Based on your assigned action progress in the current window.
                                    </p>
                                  </div>
                                  <Button
                                    className="h-10 rounded-2xl w-full"
                                    disabled={contributionSubmitting === `ack:${linkedPrimaryContribution.item.id}`}
                                    onClick={() =>
                                      linkedPrimaryContribution.item.acknowledged
                                        ? openContributionProgressDialog(linkedPrimaryContribution.item)
                                        : handleAcknowledgeContribution(linkedPrimaryContribution.item)
                                    }
                                  >
                                    {contributionSubmitting === `ack:${linkedPrimaryContribution.item.id}`
                                      ? "Recording..."
                                      : linkedPrimaryContribution.item.acknowledged
                                        ? "Update my progress"
                                        : "Acknowledge my item"}
                                  </Button>
                                  <Button
                                    variant="outline"
                                    className="h-10 rounded-2xl w-full"
                                    onClick={() => handleOpenContributionReviewContext(linkedPrimaryContribution.item)}
                                  >
                                    Open evaluation context
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>
                          ) : (
                            <Card className="rounded-[24px] border-border/60 shadow-none">
                              <CardContent className="space-y-3 p-5">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <p className="text-lg font-semibold text-foreground">No current contribution items</p>
                                    <p className="mt-1 text-sm text-muted-foreground">No items assigned in the current window.</p>
                                  </div>
                                  <Badge variant="outline" className="rounded-full">Awaiting allocation</Badge>
                                </div>
                                <div className="grid gap-3 md:grid-cols-3">
                                  <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                                    <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Current period</p>
                                    <p className="mt-2 font-medium text-foreground">{evaluationSummary.cycleTitle || "Live KPI view"}</p>
                                  </div>
                                  <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                                    <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Next expectation</p>
                                    <p className="mt-2 font-medium text-foreground">Pending assignment</p>
                                  </div>
                                  <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                                    <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">My score</p>
                                    <p className="mt-2 font-medium text-foreground">{averageContributionScore}</p>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          )}

                          {unlinkedContributionDetails.length > 0 && (
                            <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
                              <div className="flex items-start gap-3">
                                <div className="mt-0.5 flex-shrink-0 rounded-xl bg-amber-100 p-2 text-amber-600">
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                                  </svg>
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-amber-800">
                                    {unlinkedContributionDetails.length} contribution {unlinkedContributionDetails.length === 1 ? "item" : "items"} pending BSC setup
                                  </p>
                                  <p className="mt-0.5 text-xs text-amber-700">
                                    The following items are not yet linked to a KPI in the scorecard. Ask your manager to complete the cascade mapping.
                                  </p>
                                  <ul className="mt-2 space-y-1">
                                    {unlinkedContributionDetails.map((d) => (
                                      <li key={d.item.id} className="text-xs text-amber-800 truncate">
                                        · {d.item.title || d.item.initiative || "Unnamed item"}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              </div>
                            </div>
                          )}

                          {employeeContributionData.map((item) => {
                          const kpi = item.kpiId
                            ? kpiData.find((candidate) => candidate.id === item.kpiId)
                            : undefined;
                          const goal = kpi
                            ? goalData.find((candidate) => candidate.id === kpi.goalId)
                            : undefined;
                          const perspective = kpi
                            ? perspectiveData.find((candidate) => candidate.id === kpi.perspectiveId)
                            : undefined;
                          const contributionContext = [
                            perspective?.name ? `Perspective: ${perspective.name}` : null,
                            goal?.title ? `Goal: ${goal.title}` : null,
                            kpi?.name ? `KPI: ${kpi.name}` : null,
                            item.initiative ? `Initiative: ${item.initiative}` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ");
                          return (
                            <Card key={item.id} className="rounded-[24px] border-border/60 shadow-none">
                              <CardContent className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1.4fr)_220px]">
                                <div className="space-y-3">
                                  <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="text-lg font-semibold text-foreground break-words">{item.title}</p>
                                      {contributionContext ? (
                                        <p className="text-sm text-muted-foreground break-words">
                                          {contributionContext}
                                        </p>
                                      ) : null}
                                    </div>
                                    <StatusBadge status={item.status} />
                                  </div>
                                  <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3">
                                    <div className="min-w-0 rounded-2xl border border-border/60 bg-muted/20 p-3">
                                      <p className="text-[11px] uppercase leading-tight tracking-[0.12em] text-muted-foreground break-words">Due date</p>
                                      <p className="mt-2 font-medium text-foreground break-words">{item.dueDate}</p>
                                    </div>
                                    <div className="min-w-0 rounded-2xl border border-border/60 bg-muted/20 p-3">
                                      <p className="text-[11px] uppercase leading-tight tracking-[0.12em] text-muted-foreground break-words">Acknowledgement</p>
                                      <p className="mt-2 font-medium text-foreground break-words">{item.acknowledged ? "Acknowledged" : "Pending"}</p>
                                    </div>
                                    <div className="min-w-0 rounded-2xl border border-border/60 bg-muted/20 p-3">
                                      <p className="text-[11px] uppercase leading-tight tracking-[0.12em] text-muted-foreground break-words">My score</p>
                                      <p className="mt-2 font-medium text-foreground break-words">{item.score}</p>
                                    </div>
                                  </div>
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between text-sm">
                                      <span className="text-muted-foreground">Progress against target</span>
                                      <span className="font-medium text-foreground">{item.progress}%</span>
                                    </div>
                                    <Progress value={item.progress} className="h-2.5 rounded-full" />
                                  </div>
                                  <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 2xl:grid-cols-4">
                                    <div className="min-w-0 rounded-2xl border border-border/60 bg-background p-3">
                                      <p className="text-[11px] uppercase leading-tight tracking-[0.12em] text-muted-foreground break-words">Perspective</p>
                                      <p className="mt-2 font-medium text-foreground break-words">{perspective?.name || "Pending link"}</p>
                                    </div>
                                    <div className="min-w-0 rounded-2xl border border-border/60 bg-background p-3">
                                      <p className="text-[11px] uppercase leading-tight tracking-[0.12em] text-muted-foreground break-words">Strategic goal</p>
                                      <p className="mt-2 font-medium text-foreground break-words">{goal?.title || "Pending link"}</p>
                                    </div>
                                    <div className="min-w-0 rounded-2xl border border-border/60 bg-background p-3">
                                      <p className="text-[11px] uppercase leading-tight tracking-[0.12em] text-muted-foreground break-words">KPI target</p>
                                      <p className="mt-2 font-medium text-foreground break-words">{kpi?.firmTarget || "Not set"}</p>
                                    </div>
                                    <div className="min-w-0 rounded-2xl border border-border/60 bg-background p-3">
                                      <p className="text-[11px] uppercase leading-tight tracking-[0.12em] text-muted-foreground break-words">KPI actual</p>
                                      <p className="mt-2 font-medium text-foreground break-words">{kpi?.actual || "Awaiting update"}</p>
                                    </div>
                                  </div>
                                  <div className="rounded-2xl border border-border/60 bg-primary/5 p-4">
                                    <div className="flex items-start gap-2">
                                      <MessageSquare className="mt-0.5 h-4 w-4 text-primary" />
                                      <div>
                                        <p className="text-sm font-medium text-foreground">Manager note</p>
                                        <p className="mt-1 text-sm text-muted-foreground">{item.managerComment}</p>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                <div className="space-y-3 rounded-[24px] border border-border/60 bg-muted/20 p-4">
                                  <p className="text-sm font-medium text-foreground">My next move</p>
                                  <div className="rounded-2xl border border-border/60 bg-background p-3">
                                    <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Acknowledgement</p>
                                    <p className="mt-2 font-medium text-foreground">
                                      {item.acknowledged ? "Acknowledged" : "Pending acknowledgement"}
                                    </p>
                                  </div>
                                  <div className="rounded-2xl border border-border/60 bg-background p-3">
                                    <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Contribution score</p>
                                    <p className="mt-2 font-medium text-foreground">{item.score}</p>
                                  </div>
                                  <div className="rounded-2xl border border-border/60 bg-background p-3">
                                    <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Evidence linked</p>
                                    <p className="mt-2 font-medium text-foreground">{item.evidenceCount}</p>
                                  </div>
                                  <Button
                                    className="h-10 rounded-2xl w-full"
                                    disabled={contributionSubmitting === `ack:${item.id}`}
                                    onClick={() =>
                                      item.acknowledged
                                        ? openContributionProgressDialog(item)
                                        : handleAcknowledgeContribution(item)
                                    }
                                  >
                                    {contributionSubmitting === `ack:${item.id}`
                                      ? "Recording..."
                                      : item.acknowledged
                                        ? "Update progress"
                                        : "Acknowledge item"}
                                  </Button>
                                  <Button
                                    variant="outline"
                                    className="h-10 rounded-2xl w-full"
                                    onClick={() => openContributionDetail(item)}
                                  >
                                    View contribution detail
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                        </>
                      )
                      : (
                        <>
                          {/* Team health visual overview (manager / HR) */}
                          {employeeView.items.length > 0 && (
                            <div className="space-y-4">
                              {/* Overall gauge + distribution */}
                              <div className="grid gap-4 xl:grid-cols-2">
                                {/* Team health gauge + stat strip */}
                                <div className="flex items-center gap-5 rounded-[24px] border border-border/60 bg-muted/20 p-5">
                                  {(() => {
                                    const teamScore = averageScore(employeeView.items.map((i) => i.progress));
                                    const size = 96;
                                    const r = (size - 12) / 2;
                                    const circ = 2 * Math.PI * r;
                                    const off = circ - (Math.min(100, teamScore) / 100) * circ;
                                    const color = teamScore >= 80 ? "#10b981" : teamScore >= 60 ? "#f59e0b" : "#ef4444";
                                    return (
                                      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
                                        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
                                          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e2e8f0" strokeWidth="9" />
                                          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="9"
                                            strokeDasharray={circ} strokeDashoffset={off} strokeLinecap="round"
                                            style={{ transition: "stroke-dashoffset 0.6s ease" }} />
                                        </svg>
                                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                                          <span className="text-xl font-bold" style={{ color }}>{teamScore}%</span>
                                          <span className="text-[9px] text-muted-foreground mt-0.5">TEAM</span>
                                        </div>
                                      </div>
                                    );
                                  })()}
                                  <div className="grid flex-1 gap-3 grid-cols-3">
                                    <div className="text-center">
                                      <p className="text-2xl font-bold text-emerald-600">{employeeView.items.filter((i) => i.status === "on_track").length}</p>
                                      <p className="text-[10px] uppercase text-muted-foreground mt-0.5">On track</p>
                                    </div>
                                    <div className="text-center">
                                      <p className="text-2xl font-bold text-amber-500">{employeeView.items.filter((i) => i.status === "at_risk").length}</p>
                                      <p className="text-[10px] uppercase text-muted-foreground mt-0.5">At risk</p>
                                    </div>
                                    <div className="text-center">
                                      <p className="text-2xl font-bold text-red-500">{employeeView.items.filter((i) => i.status === "off_track").length}</p>
                                      <p className="text-[10px] uppercase text-muted-foreground mt-0.5">Off track</p>
                                    </div>
                                  </div>
                                </div>

                                {/* Employee ranking chart */}
                                <div className="rounded-[24px] border border-border/60 bg-muted/20 p-4 space-y-2">
                                  <p className="text-sm font-medium text-foreground">Team ranking by progress</p>
                                  <ResponsiveContainer width="100%" height={Math.max(120, employeeView.items.length * 36)}>
                                    <BarChart
                                      data={[...employeeView.items].sort((a, b) => b.progress - a.progress).map((item) => ({
                                        name: item.employee.split(" ")[0],
                                        progress: item.progress,
                                        fill: item.status === "on_track" ? "#10b981" : item.status === "at_risk" ? "#f59e0b" : "#ef4444",
                                      }))}
                                      layout="vertical"
                                      margin={{ top: 4, right: 40, left: 4, bottom: 4 }}
                                    >
                                      <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                                      <YAxis type="category" dataKey="name" width={72} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                                      <Tooltip formatter={(v: number) => [`${v}%`, "Progress"]} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} />
                                      <ReferenceLine x={80} stroke="#10b981" strokeDasharray="3 3" />
                                      <Bar dataKey="progress" radius={[0, 4, 4, 0]} maxBarSize={22}>
                                        {[...employeeView.items].sort((a, b) => b.progress - a.progress).map((item, i) => (
                                          <Cell key={i} fill={item.status === "on_track" ? "#10b981" : item.status === "at_risk" ? "#f59e0b" : "#ef4444"} />
                                        ))}
                                      </Bar>
                                    </BarChart>
                                  </ResponsiveContainer>
                                </div>
                              </div>

                              {/* Coaching attention list */}
                              {employeeView.items.filter((i) => i.status !== "on_track").length > 0 && (
                                <div className="rounded-[24px] border border-amber-200 bg-amber-50/50 p-4 space-y-3">
                                  <p className="text-sm font-semibold text-amber-800">
                                    {employeeView.items.filter((i) => i.status !== "on_track").length} team {employeeView.items.filter((i) => i.status !== "on_track").length === 1 ? "member" : "members"} need attention
                                  </p>
                                  <div className="grid gap-2 sm:grid-cols-2">
                                    {employeeView.items.filter((i) => i.status !== "on_track").map((item) => (
                                      <div key={item.id} className="flex items-center gap-3 rounded-2xl border border-amber-100 bg-white p-3">
                                        <div className={`h-2 w-2 flex-shrink-0 rounded-full ${item.status === "at_risk" ? "bg-amber-400" : "bg-red-400"}`} />
                                        <div className="min-w-0 flex-1">
                                          <p className="text-sm font-medium text-foreground truncate">{item.employee}</p>
                                          <p className="text-xs text-muted-foreground">{item.progress}% · {item.status === "at_risk" ? "At risk" : "Off track"}</p>
                                        </div>
                                        <Badge variant="outline" className={`rounded-full flex-shrink-0 text-xs ${item.acknowledged ? "border-emerald-200 text-emerald-700" : "border-amber-200 text-amber-700"}`}>
                                          {item.acknowledged ? "Ack" : "Pending"}
                                        </Badge>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Individual action cards */}
                          {employeeView.items.map((item) => (
                            <Card key={item.id} className="rounded-[24px] border-border/60 shadow-none">
                              <CardContent className="p-5">
                                <div className="space-y-3">
                                  <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="text-lg font-semibold text-foreground break-words">{item.title}</p>
                                      <p className="text-sm text-muted-foreground break-words">
                                        {item.employee} · Due {item.dueDate}
                                      </p>
                                    </div>
                                    <StatusBadge status={item.status as StatusTone} />
                                  </div>
                                  <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3">
                                    <div className="min-w-0 rounded-2xl border border-border/60 bg-muted/20 p-3">
                                      <p className="text-[11px] uppercase leading-tight tracking-[0.12em] text-muted-foreground break-words">Owner</p>
                                      <p className="mt-2 font-medium text-foreground break-words">{item.employee}</p>
                                    </div>
                                    <div className="min-w-0 rounded-2xl border border-border/60 bg-muted/20 p-3">
                                      <p className="text-[11px] uppercase leading-tight tracking-[0.12em] text-muted-foreground break-words">Acknowledgement</p>
                                      <p className="mt-2 font-medium text-foreground break-words">{item.acknowledged ? "Acknowledged" : "Pending"}</p>
                                    </div>
                                    <div className="min-w-0 rounded-2xl border border-border/60 bg-muted/20 p-3">
                                      <p className="text-[11px] uppercase leading-tight tracking-[0.12em] text-muted-foreground break-words">Progress</p>
                                      <p className="mt-2 font-medium text-foreground break-words">{item.progress}%</p>
                                    </div>
                                  </div>
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between text-sm">
                                      <span className="text-muted-foreground">Execution health</span>
                                      <span className="font-medium text-foreground">{item.progress}%</span>
                                    </div>
                                    <Progress value={item.progress} className="h-2.5 rounded-full" />
                                  </div>
                                  <div className="rounded-2xl border border-border/60 bg-primary/5 p-4">
                                    <div className="flex items-start gap-2">
                                      <MessageSquare className="mt-0.5 h-4 w-4 text-primary" />
                                      <div>
                                        <p className="text-sm font-medium text-foreground">Review note</p>
                                        <p className="mt-1 text-sm text-muted-foreground">{item.note}</p>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </>
                      )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reports" className="space-y-6">
            <Card className="rounded-[28px] border-border/70 shadow-sm">
              <CardHeader className="space-y-4">
                <SectionTitle
                  icon={FileText}
                  title={reportsView.title}
                />
              </CardHeader>
              <CardContent className="space-y-6">
                {canPreviewAllRoles ? (
                  <Card className="rounded-[24px] border-border/60 bg-muted/20 shadow-none">
                    <CardHeader className="space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <CardTitle className="text-base">Measurement review pack</CardTitle>
                          <CardDescription>
                            {selectedMeasurementPeriod
                              ? `${selectedMeasurementPeriod.label} - ${selectedMeasurementPeriod.status}`
                              : "No measurement period selected"}
                          </CardDescription>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            className="rounded-2xl"
                            onClick={() => handleDownloadMeasurementReviewPack("xlsx")}
                            disabled={
                              !selectedMeasurementPeriod ||
                              selectedMeasurementPeriod.snapshotCount <= 0 ||
                              measurementPackDownloading
                            }
                          >
                            {measurementPackDownloading ? "Downloading..." : "Download Excel"}
                          </Button>
                          <Button
                            variant="outline"
                            className="rounded-2xl"
                            onClick={() => handleDownloadMeasurementReviewPack("pdf")}
                            disabled={
                              !selectedMeasurementPeriod ||
                              selectedMeasurementPeriod.snapshotCount <= 0 ||
                              measurementPackDownloading
                            }
                          >
                            Download PDF
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                        <div className="rounded-2xl border border-border/60 bg-background p-4">
                          <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Snapshots</p>
                          <p className="mt-2 text-2xl font-semibold text-foreground">
                            {measurementReviewPack?.summary.snapshotCount ?? selectedMeasurementPeriod?.snapshotCount ?? 0}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-border/60 bg-background p-4">
                          <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Average score</p>
                          <p className="mt-2 text-2xl font-semibold text-foreground">
                            {measurementReviewPack?.summary.averageWeightedScore ?? 0}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-border/60 bg-background p-4">
                          <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">On track</p>
                          <p className="mt-2 text-2xl font-semibold text-foreground">
                            {measurementReviewPack?.summary.onTrackCount ?? 0}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-border/60 bg-background p-4">
                          <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">At risk</p>
                          <p className="mt-2 text-2xl font-semibold text-foreground">
                            {measurementReviewPack?.summary.atRiskCount ?? selectedMeasurementPeriod?.atRiskCount ?? 0}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-border/60 bg-background p-4">
                          <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Missing data</p>
                          <p className="mt-2 text-2xl font-semibold text-foreground">
                            {measurementReviewPack?.summary.missingDataCount ?? selectedMeasurementPeriod?.missingDataCount ?? 0}
                          </p>
                        </div>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Perspective</TableHead>
                            <TableHead>Snapshots</TableHead>
                            <TableHead>Avg score</TableHead>
                            <TableHead>Missing data</TableHead>
                            <TableHead>Off track</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(measurementReviewPack?.perspectives ?? []).map((perspective) => (
                            <TableRow key={perspective.perspectiveKey}>
                              <TableCell className="font-medium">{perspective.perspectiveName}</TableCell>
                              <TableCell>{perspective.snapshotCount}</TableCell>
                              <TableCell>{perspective.averageWeightedScore}</TableCell>
                              <TableCell>{perspective.missingDataCount}</TableCell>
                              <TableCell>{perspective.offTrackCount}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                ) : null}

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {reportsView.blocks.map((report) => (
                    <Card key={report.label} className="rounded-[24px] border-border/60 bg-muted/20 shadow-none">
                      <CardContent className="space-y-2 p-5">
                        <p className="text-sm font-medium text-foreground">{report.label}</p>
                        <p className="text-2xl font-semibold tracking-tight text-foreground">{report.value}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Chart row 1: Perspective radar + Department bar + Initiative bar */}
                <div className="grid gap-6 xl:grid-cols-3">
                  {/* Perspective performance — radar */}
                  <Card className="rounded-[24px] border-border/60 shadow-none">
                    <CardHeader>
                      <CardTitle className="text-base">Performance by perspective</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {reportsView.perspectiveRows.length >= 3 ? (
                        <ResponsiveContainer width="100%" height={220}>
                          <RadarChart data={reportsView.perspectiveRows.map((p) => ({ subject: p.name.split(" ")[0], score: p.score, fullMark: 100 }))}>
                            <PolarGrid stroke="#e2e8f0" />
                            <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: "#64748b" }} />
                            <Radar dataKey="score" fill="#6366f1" fillOpacity={0.18} stroke="#6366f1" strokeWidth={2} dot={{ r: 3, fill: "#6366f1" } as any} />
                            <Tooltip formatter={(v: number) => [`${v}%`, "Score"]} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} />
                          </RadarChart>
                        </ResponsiveContainer>
                      ) : (
                        <ResponsiveContainer width="100%" height={Math.max(120, reportsView.perspectiveRows.length * 44)}>
                          <BarChart data={reportsView.perspectiveRows.map((p) => ({ name: p.name.split(" ")[0], score: p.score }))} layout="vertical" margin={{ top: 4, right: 32, left: 4, bottom: 4 }}>
                            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                            <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                            <Tooltip formatter={(v: number) => [`${v}%`, "Score"]} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} />
                            <Bar dataKey="score" fill="#6366f1" radius={[0, 4, 4, 0]} maxBarSize={24} />
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                      <div className="mt-3 space-y-1">
                        {reportsView.perspectiveRows.map((p) => (
                          <div key={p.id} className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground truncate max-w-[140px]">{p.name}</span>
                            <span className={`font-semibold ${p.score >= 80 ? "text-emerald-600" : p.score >= 60 ? "text-amber-600" : "text-red-500"}`}>{p.score}%</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Department performance — horizontal bar */}
                  <Card className="rounded-[24px] border-border/60 shadow-none">
                    <CardHeader>
                      <CardTitle className="text-base">Performance by department</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {reportsView.departmentRows.length > 0 ? (
                        <ResponsiveContainer width="100%" height={Math.max(140, reportsView.departmentRows.length * 40)}>
                          <BarChart
                            data={[...reportsView.departmentRows].sort((a, b) => b.score - a.score).map((d) => ({
                              name: d.name.split(" ").slice(0, 2).join(" "),
                              score: d.score,
                              fill: d.status === "on_track" ? "#10b981" : d.status === "at_risk" ? "#f59e0b" : "#ef4444",
                            }))}
                            layout="vertical"
                            margin={{ top: 4, right: 32, left: 4, bottom: 4 }}
                          >
                            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                            <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                            <Tooltip formatter={(v: number) => [`${v}%`, "Score"]} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} />
                            <ReferenceLine x={80} stroke="#10b981" strokeDasharray="3 3" />
                            <Bar dataKey="score" radius={[0, 4, 4, 0]} maxBarSize={24}>
                              {[...reportsView.departmentRows].sort((a, b) => b.score - a.score).map((d, i) => (
                                <Cell key={i} fill={d.status === "on_track" ? "#10b981" : d.status === "at_risk" ? "#f59e0b" : "#ef4444"} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <p className="text-sm text-muted-foreground py-8 text-center">No department data available for this view.</p>
                      )}
                    </CardContent>
                  </Card>

                  {/* Initiative completion — bar chart */}
                  <Card className="rounded-[24px] border-border/60 shadow-none">
                    <CardHeader>
                      <CardTitle className="text-base">Initiative completion</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {cascadeView.cards.length > 0 ? (
                        <ResponsiveContainer width="100%" height={Math.max(140, Math.min(cascadeView.cards.length, 6) * 40)}>
                          <BarChart
                            data={cascadeView.cards.slice(0, 6).map((ini) => ({
                              name: ini.title.split(" ").slice(0, 3).join(" "),
                              progress: ini.progress,
                            }))}
                            layout="vertical"
                            margin={{ top: 4, right: 32, left: 4, bottom: 4 }}
                          >
                            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                            <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                            <Tooltip formatter={(v: number) => [`${v}%`, "Progress"]} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} />
                            <ReferenceLine x={80} stroke="#10b981" strokeDasharray="3 3" />
                            <Bar dataKey="progress" radius={[0, 4, 4, 0]} maxBarSize={22}>
                              {cascadeView.cards.slice(0, 6).map((ini, i) => (
                                <Cell key={i} fill={ini.status === "on_track" ? "#10b981" : ini.status === "at_risk" ? "#f59e0b" : "#ef4444"} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <p className="text-sm text-muted-foreground py-8 text-center">No initiative data in current scope.</p>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Chart row 2: Manager performance + Employee performance */}
                {(reportsView.managerRows.length > 0 || reportsView.employeeRows.length > 0) && (
                  <div className="grid gap-6 xl:grid-cols-2">
                    {/* Manager performance — bar chart */}
                    {reportsView.managerRows.length > 0 && (
                      <Card className="rounded-[24px] border-border/60 shadow-none">
                        <CardHeader>
                          <CardTitle className="text-base">Manager performance</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <ResponsiveContainer width="100%" height={Math.max(100, reportsView.managerRows.length * 44)}>
                            <BarChart
                              data={[...reportsView.managerRows].sort((a, b) => b.score - a.score).map((m) => ({
                                name: m.name.split(" ")[0],
                                score: m.score,
                                team: m.team,
                              }))}
                              layout="vertical"
                              margin={{ top: 4, right: 40, left: 4, bottom: 4 }}
                            >
                              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                              <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                              <Tooltip
                                formatter={(v: number, _name: string, props: any) => [`${v}%  ·  ${props.payload.team}`, "Score"]}
                                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                              />
                              <ReferenceLine x={80} stroke="#10b981" strokeDasharray="3 3" />
                              <Bar dataKey="score" radius={[0, 4, 4, 0]} maxBarSize={24}>
                                {[...reportsView.managerRows].sort((a, b) => b.score - a.score).map((m, i) => (
                                  <Cell key={i} fill={m.score >= 80 ? "#10b981" : m.score >= 60 ? "#f59e0b" : "#ef4444"} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                          {/* Mini table for team context */}
                          <div className="divide-y divide-border/40">
                            {reportsView.managerRows.map((m) => (
                              <div key={m.name} className="flex items-center justify-between py-2 text-sm">
                                <span className="font-medium text-foreground">{m.name}</span>
                                <span className="text-muted-foreground">{m.team}</span>
                                <span className={`font-semibold ${m.score >= 80 ? "text-emerald-600" : m.score >= 60 ? "text-amber-600" : "text-red-500"}`}>{m.score}%</span>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Employee performance — sorted bar */}
                    {reportsView.employeeRows.length > 0 && (
                      <Card className="rounded-[24px] border-border/60 shadow-none">
                        <CardHeader>
                          <CardTitle className="text-base">Employee contribution scores</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <ResponsiveContainer width="100%" height={Math.max(120, Math.min(reportsView.employeeRows.length, 8) * 36)}>
                            <BarChart
                              data={[...reportsView.employeeRows].sort((a, b) => b.score - a.score).slice(0, 8).map((e) => ({
                                name: e.name.split(" ")[0],
                                score: e.score,
                              }))}
                              layout="vertical"
                              margin={{ top: 4, right: 40, left: 4, bottom: 4 }}
                            >
                              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                              <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                              <Tooltip formatter={(v: number) => [`${v}%`, "Score"]} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} />
                              <ReferenceLine x={80} stroke="#10b981" strokeDasharray="3 3" />
                              <Bar dataKey="score" radius={[0, 4, 4, 0]} maxBarSize={20}>
                                {[...reportsView.employeeRows].sort((a, b) => b.score - a.score).slice(0, 8).map((e, i) => (
                                  <Cell key={i} fill={e.score >= 80 ? "#10b981" : e.score >= 60 ? "#f59e0b" : "#ef4444"} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                          {/* Acknowledgement column */}
                          <div className="divide-y divide-border/40">
                            {[...reportsView.employeeRows].sort((a, b) => b.score - a.score).slice(0, 8).map((e) => (
                              <div key={e.name} className="flex items-center justify-between py-2 text-sm">
                                <span className="font-medium text-foreground">{e.name}</span>
                                <span className="text-muted-foreground text-xs truncate max-w-[180px]">{e.ack}</span>
                                <span className={`font-semibold ${e.score >= 80 ? "text-emerald-600" : e.score >= 60 ? "text-amber-600" : "text-red-500"}`}>{e.score}%</span>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog
          open={contributionDialogMode === "detail" && Boolean(selectedContributionId)}
          onOpenChange={(open) => {
            if (!open) closeContributionDialogs();
          }}
        >
          <DialogContent className="sm:max-w-[760px]">
            <DialogHeader>
              <DialogTitle>{selectedContributionItem?.title || "Contribution detail"}</DialogTitle>
              <DialogDescription>
                Linked KPI context, employee update history, evidence, and review navigation for this contribution item.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {contributionDetailLoading ? (
                <p className="text-sm text-muted-foreground">Loading contribution detail...</p>
              ) : contributionDetail ? (
                <>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                      <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Progress</p>
                      <p className="mt-2 text-xl font-semibold text-foreground">{contributionDetail.progress}%</p>
                    </div>
                    <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                      <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Acknowledged</p>
                      <p className="mt-2 text-xl font-semibold text-foreground">
                        {contributionDetail.acknowledged ? "Yes" : "No"}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                      <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Evidence files</p>
                      <p className="mt-2 text-xl font-semibold text-foreground">{contributionDetail.evidence.length}</p>
                    </div>
                    <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                      <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Due date</p>
                      <p className="mt-2 text-base font-semibold text-foreground">{contributionDetail.dueDate}</p>
                    </div>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                      <p className="text-sm font-medium text-foreground">Manager note</p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {contributionDetail.managerComment || "No manager note has been recorded yet."}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                      <p className="text-sm font-medium text-foreground">My latest update</p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {contributionDetail.employeeComment || "No employee update note has been submitted yet."}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border/60 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-foreground">Update history</p>
                      <Badge variant="outline" className="rounded-full">
                        {contributionDetail.updates.length} entries
                      </Badge>
                    </div>
                    <div className="mt-3 space-y-3">
                      {contributionDetail.updates.length > 0 ? (
                        contributionDetail.updates.map((update) => (
                          <div key={update.id} className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="font-medium text-foreground">{update.progress}% progress</p>
                                <p className="mt-1 text-sm text-muted-foreground">
                                  {update.comment || "No note was added to this progress update."}
                                </p>
                              </div>
                              <div className="text-right text-xs text-muted-foreground">
                                <p>{new Date(update.createdAt).toLocaleDateString("en-GB")}</p>
                                <p>{update.createdByName || "Unknown actor"}</p>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">No progress updates have been recorded yet.</p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border/60 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-foreground">Evidence</p>
                      <Badge variant="outline" className="rounded-full">
                        {contributionDetail.evidence.length} files
                      </Badge>
                    </div>
                    <div className="mt-3 space-y-3">
                      {contributionDetail.evidence.length > 0 ? (
                        contributionDetail.evidence.map((evidence) => (
                          <div key={evidence.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-muted/20 p-4">
                            <div>
                              <p className="font-medium text-foreground">{evidence.fileName}</p>
                              <p className="mt-1 text-sm text-muted-foreground">
                                {evidence.description || "No evidence note was added."}
                              </p>
                            </div>
                            <Button
                              variant="outline"
                              className="rounded-2xl"
                              onClick={() => window.open(documentsAPI.getDownloadUrl(evidence.id), "_blank")}
                            >
                              Open file
                            </Button>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">No evidence files are linked to this contribution yet.</p>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Contribution detail is unavailable.</p>
              )}
            </div>
            <DialogFooter className="gap-2 sm:justify-between">
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => selectedContributionItem && handleOpenContributionReviewContext(selectedContributionItem)}
                  disabled={!selectedContributionItem?.reviewContextPath}
                >
                  Open review context
                </Button>
                <Button
                  variant="outline"
                  onClick={() => selectedContributionItem && openContributionEvidenceDialog(selectedContributionItem)}
                  disabled={!selectedContributionItem}
                >
                  Attach evidence
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={closeContributionDialogs}>
                  Close
                </Button>
                <Button
                  onClick={() =>
                    selectedContributionItem &&
                    (selectedContributionItem.acknowledged
                      ? openContributionProgressDialog(selectedContributionItem)
                      : handleAcknowledgeContribution(selectedContributionItem))
                  }
                  disabled={!selectedContributionItem || contributionSubmitting === `ack:${selectedContributionItem?.id}`}
                >
                  {selectedContributionItem?.acknowledged ? "Update progress" : "Acknowledge item"}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={contributionDialogMode === "progress" && Boolean(selectedContributionId)}
          onOpenChange={(open) => {
            if (!open) closeContributionDialogs();
          }}
        >
          <DialogContent className="sm:max-w-[560px]">
            <DialogHeader>
              <DialogTitle>Update contribution progress</DialogTitle>
              <DialogDescription>
                Submit your latest progress and note so the contribution history stays traceable.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Progress percent</p>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={contributionProgressForm.progress}
                  onChange={(event) =>
                    setContributionProgressForm((current) => ({
                      ...current,
                      progress: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Update note</p>
                <Textarea
                  value={contributionProgressForm.comment}
                  onChange={(event) =>
                    setContributionProgressForm((current) => ({
                      ...current,
                      comment: event.target.value,
                    }))
                  }
                  placeholder="What changed, what is blocked, and what still needs follow-through?"
                  rows={5}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={closeContributionDialogs}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmitContributionProgress}
                disabled={contributionSubmitting === `progress:${selectedContributionId}`}
              >
                {contributionSubmitting === `progress:${selectedContributionId}` ? "Saving..." : "Save update"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={contributionDialogMode === "evidence" && Boolean(selectedContributionId)}
          onOpenChange={(open) => {
            if (!open) closeContributionDialogs();
          }}
        >
          <DialogContent className="sm:max-w-[560px]">
            <DialogHeader>
              <DialogTitle>Attach contribution evidence</DialogTitle>
              <DialogDescription>
                Upload a file that supports your contribution update for manager and review visibility.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Evidence file</p>
                <Input
                  type="file"
                  onChange={(event) => setContributionEvidenceFile(event.target.files?.[0] ?? null)}
                />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Evidence note</p>
                <Textarea
                  value={contributionEvidenceNote}
                  onChange={(event) => setContributionEvidenceNote(event.target.value)}
                  placeholder="Describe what this file proves or supports."
                  rows={4}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={closeContributionDialogs}>
                Cancel
              </Button>
              <Button
                onClick={handleUploadContributionEvidence}
                disabled={contributionSubmitting === `evidence:${selectedContributionId}`}
              >
                {contributionSubmitting === `evidence:${selectedContributionId}` ? "Uploading..." : "Upload evidence"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={cycleDialogOpen} onOpenChange={setCycleDialogOpen}>
          <DialogContent className="sm:max-w-[540px]">
            <DialogHeader>
              <DialogTitle>Create scorecard cycle</DialogTitle>
              <DialogDescription>
                Define the governance window that will hold one or more draft and published scorecard versions.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Cycle name</p>
                <Input
                  value={cycleForm.name}
                  onChange={(event) =>
                    setCycleForm((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="Performance year 2026"
                />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Cadence</p>
                <Select
                  value={cycleForm.cadence}
                  onValueChange={(value: "monthly" | "quarterly" | "annual") =>
                    setCycleForm((current) => ({ ...current, cadence: value }))
                  }
                >
                  <SelectTrigger className="rounded-2xl">
                    <SelectValue placeholder="Select cadence" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="annual">Annual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Start date</p>
                  <Input
                    type="date"
                    value={cycleForm.startDate}
                    onChange={(event) =>
                      setCycleForm((current) => ({ ...current, startDate: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">End date</p>
                  <Input
                    type="date"
                    value={cycleForm.endDate}
                    onChange={(event) =>
                      setCycleForm((current) => ({ ...current, endDate: event.target.value }))
                    }
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCycleDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={
                  !cycleForm.name.trim() ||
                  !cycleForm.startDate ||
                  !cycleForm.endDate ||
                  authoringSubmitting === "createScorecardCycle"
                }
                onClick={handleCreateScorecardCycle}
              >
                {authoringSubmitting === "createScorecardCycle" ? "Saving..." : "Save cycle"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={versionDialogOpen} onOpenChange={setVersionDialogOpen}>
          <DialogContent className="sm:max-w-[540px]">
            <DialogHeader>
              <DialogTitle>Create draft scorecard</DialogTitle>
              <DialogDescription>
                Clone the current structure into a governed scorecard version so strategy changes can be prepared before publication.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Cycle</p>
                <Select
                  value={versionForm.cycleId}
                  onValueChange={(value) =>
                    setVersionForm((current) => ({ ...current, cycleId: value }))
                  }
                >
                  <SelectTrigger className="rounded-2xl">
                    <SelectValue placeholder="Select cycle" />
                  </SelectTrigger>
                  <SelectContent>
                    {governanceCycles.map((cycle) => (
                      <SelectItem key={cycle.id} value={String(cycle.id)}>
                        {cycle.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Label</p>
                <Input
                  value={versionForm.label}
                  onChange={(event) =>
                    setVersionForm((current) => ({ ...current, label: event.target.value }))
                  }
                  placeholder="Quarter close working draft"
                />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Clone from</p>
                <Select
                  value={versionForm.sourceVersionId}
                  onValueChange={(value) =>
                    setVersionForm((current) => ({ ...current, sourceVersionId: value }))
                  }
                >
                  <SelectTrigger className="rounded-2xl">
                    <SelectValue placeholder="Auto-select source" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Current live structure</SelectItem>
                    <SelectItem value="baseline">Baseline KPI library</SelectItem>
                    {allGovernanceVersions.map((version) => {
                      const cycle = governanceCycles.find((candidate) => candidate.id === version.cycleId);
                      return (
                        <SelectItem key={version.id} value={String(version.id)}>
                          {cycle?.name || "Scorecard cycle"} · Scorecard {version.versionNumber}
                          {version.label ? ` · ${version.label}` : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setVersionDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={!versionForm.cycleId || authoringSubmitting === "createScorecardVersion"}
                onClick={handleCreateScorecardVersion}
              >
                {authoringSubmitting === "createScorecardVersion" ? "Cloning..." : "Create draft"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={measurementPeriodDialogOpen} onOpenChange={setMeasurementPeriodDialogOpen}>
          <DialogContent className="sm:max-w-[540px]">
            <DialogHeader>
              <DialogTitle>Create measurement period</DialogTitle>
              <DialogDescription>
                Define the exact scorecard window that will hold a frozen KPI snapshot pack.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Label</label>
                <Input
                  value={measurementPeriodForm.label}
                  onChange={(event) =>
                    setMeasurementPeriodForm((current) => ({
                      ...current,
                      label: event.target.value,
                    }))
                  }
                  placeholder="April 2026 monthly close"
                  className="rounded-2xl"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Start date</label>
                  <Input
                    type="date"
                    value={measurementPeriodForm.periodStart}
                    onChange={(event) =>
                      setMeasurementPeriodForm((current) => ({
                        ...current,
                        periodStart: event.target.value,
                      }))
                    }
                    className="rounded-2xl"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">End date</label>
                  <Input
                    type="date"
                    value={measurementPeriodForm.periodEnd}
                    onChange={(event) =>
                      setMeasurementPeriodForm((current) => ({
                        ...current,
                        periodEnd: event.target.value,
                      }))
                    }
                    className="rounded-2xl"
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setMeasurementPeriodDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreateMeasurementPeriod}
                disabled={
                  !measurementVersionId ||
                  !measurementPeriodForm.periodStart ||
                  !measurementPeriodForm.periodEnd ||
                  measurementSubmitting === "createMeasurementPeriod"
                }
              >
                {measurementSubmitting === "createMeasurementPeriod"
                  ? "Creating..."
                  : "Create period"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={kpiActualDialogOpen} onOpenChange={(open) => (open ? setKpiActualDialogOpen(true) : closeKpiActualDialog())}>
          <DialogContent className="sm:max-w-[520px]">
            <DialogHeader>
              <DialogTitle>Update KPI tracking</DialogTitle>
              <DialogDescription>
                Submit the period inputs required by the KPI engine.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
                <p className="text-sm font-medium text-foreground">{kpiActualTarget?.name ?? "Selected KPI"}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Target: {kpiActualTarget?.firmTarget ?? "-"} | Frequency: {kpiActualTarget?.frequency ?? "-"}
                </p>
              </div>
              {kpiActualEngine?.trackingPlan?.inputs?.length ? (
                <div className="space-y-3">
                  {kpiActualEngine.trackingPlan.inputs.map((input) => (
                    <div key={input.inputKey} className="space-y-2">
                      <p className="text-sm font-medium text-foreground">
                        {input.label}
                        {input.isRequired ? <span className="text-destructive"> *</span> : null}
                      </p>
                      {input.inputType === "boolean" ? (
                        <label className="flex items-center gap-2 text-sm text-foreground">
                          <Checkbox
                            checked={kpiActualValues[input.inputKey] === "true"}
                            onCheckedChange={(checked) =>
                              setKpiActualValues((current) => ({
                                ...current,
                                [input.inputKey]: checked === true ? "true" : "false",
                              }))
                            }
                          />
                          Complete
                        </label>
                      ) : (
                        <Input
                          type={input.inputType === "text" ? "text" : "number"}
                          inputMode={input.inputType === "text" ? "text" : "decimal"}
                          placeholder={input.sourceType.replace(/_/g, " ")}
                          value={kpiActualValues[input.inputKey] ?? ""}
                          onChange={(event) =>
                            setKpiActualValues((current) => ({
                              ...current,
                              [input.inputKey]: event.target.value,
                            }))
                          }
                        />
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Actual value</p>
                  <Input
                    type="number"
                    inputMode="decimal"
                    placeholder="Enter latest actual"
                    value={kpiActualForm.actualValue}
                    onChange={(event) =>
                      setKpiActualForm((current) => ({ ...current, actualValue: event.target.value }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Unit: {kpiActualTarget?.unit ?? "-"}
                  </p>
                </div>
              )}
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Update note (optional)</p>
                <Textarea
                  rows={3}
                  placeholder="Add context for this measurement update"
                  value={kpiActualForm.note}
                  onChange={(event) =>
                    setKpiActualForm((current) => ({ ...current, note: event.target.value }))
                  }
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={closeKpiActualDialog}>
                Cancel
              </Button>
              <Button
                onClick={submitKpiActualUpdate}
                disabled={authoringSubmitting?.startsWith("updateKpiActual")}
              >
                Save tracking data
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </DashboardLayout>
  );
}

