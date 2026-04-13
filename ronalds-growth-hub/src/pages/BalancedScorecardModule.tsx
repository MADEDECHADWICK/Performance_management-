import { Link, useNavigate, useParams } from "react-router-dom";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import {
  performanceFrameworkAPI,
  type BalancedScorecardPerspectiveRecord,
  type WorkspaceEvaluationSummary,
  type BalancedScorecardWorkspace,
  type BalancedScorecardMetricTemplate,
  type BalancedScorecardStructure,
  type WorkspaceCascadeInitiative,
  type WorkspaceCascadeLevel as CascadeLevel,
  type WorkspaceDepartmentRow,
  type WorkspaceEmployeeContribution as EmployeeContribution,
  type WorkspaceEmployeeRow,
  type WorkspaceInitiative as InitiativeDefinition,
  type WorkspaceKpi as KpiDefinition,
  type WorkspaceManagerRow,
  type WorkspaceGoal as GoalDefinition,
  type WorkspacePerspectiveCard as PerspectiveCard,
  type WorkspaceReportBlock,
} from "@/lib/api/performanceFramework";
import evaluationsAPI, {
  type EvaluationCycleSummary,
} from "@/lib/api/evaluations";
import {
  getPreferredRoleView,
  getRoleTabLabel,
  isRoleKey,
  kpiContractSteps,
  kpiGovernanceRules,
  moduleTabs,
  roleHomeConfigs,
  rolePerspectiveScope,
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
  averageScore,
  MetricCard,
  parseAcknowledgementState,
  scoreToStatus,
  SectionTitle,
  StatusBadge,
  TrendBars,
} from "@/components/framework/BalancedScorecardPrimitives";
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
  const { roles, hasAnyRole } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<ModuleTabValue>("dashboard");
  const [selectedCycle, setSelectedCycle] = useState<string>("latest");
  const [availableCycles, setAvailableCycles] = useState<EvaluationCycleSummary[]>([]);
  const [search, setSearch] = useState("");
  const [trackingScope, setTrackingScope] = useState("all");
  const [setupSheetMode, setSetupSheetMode] = useState<SetupSheetMode>(null);
  const [kpiSheetMode, setKpiSheetMode] = useState<KpiSheetMode>(null);
  const [workspaceData, setWorkspaceData] = useState<BalancedScorecardWorkspace | null>(null);
  const [structureData, setStructureData] = useState<BalancedScorecardStructure | null>(null);
  const [metricTemplates, setMetricTemplates] = useState<BalancedScorecardMetricTemplate[]>([]);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [authoringSubmitting, setAuthoringSubmitting] = useState<string | null>(null);
  const [perspectiveForm, setPerspectiveForm] = useState({
    name: "",
    ownerName: "",
    summary: "",
  });
  const [editingPerspectiveId, setEditingPerspectiveId] = useState<number | null>(null);
  const [goalForm, setGoalForm] = useState({
    perspectiveId: "",
    title: "",
    ownerName: "",
    description: "",
  });
  const [kpiForm, setKpiForm] = useState({
    goalId: "",
    trackingMode: "template",
    metricKey: "",
    name: "",
    description: "",
    formula: "",
    frequency: "",
    unit: "",
    weight: "",
    firmTarget: "",
    ownerName: "",
    statusLogic: "",
    updateFrequency: "",
    measurementType: "",
    targetDirection: "",
    targetValue: "",
    currentActualValue: "",
    lastMeasurementNote: "",
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

  const canPreviewAllRoles = roles.includes("hr") || roles.includes("super_admin");
  const preferredRole = useMemo(() => getPreferredRoleView(roles), [roles]);
  const routeRole = isRoleKey(workspaceRole) ? workspaceRole : null;
  const selectedRole = canPreviewAllRoles ? routeRole ?? preferredRole : preferredRole;

  const deferredSearch = useDeferredValue(search);
  const searchTerm = deferredSearch.trim().toLowerCase();
  const perspectiveData: PerspectiveCard[] = workspaceData?.perspectiveCards ?? [];
  const goalData: GoalDefinition[] = workspaceData?.goals ?? [];
  const kpiData: KpiDefinition[] = workspaceData?.kpis ?? [];
  const initiativeData: InitiativeDefinition[] = workspaceData?.initiatives ?? [];
  const cascadeInitiativeData: WorkspaceCascadeInitiative[] =
    workspaceData?.cascadeInitiatives ?? [];
  const featuredCascadeData: CascadeLevel[] = workspaceData?.featuredCascade ?? [];
  const employeeContributionData: EmployeeContribution[] =
    workspaceData?.employeeContributions ?? [];
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
  const perspectiveRecords = structureSnapshot.perspectives;
  const goalRecords = structureSnapshot.goals;
  const kpiRecords = structureSnapshot.kpis;
  const initiativeRecords = structureSnapshot.initiatives;
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
  const selectedMetricTemplate =
    metricTemplates.find((template) => template.metricKey === kpiForm.metricKey) ?? null;
  const isTemplateMode = kpiForm.trackingMode === "template";
  const hasManualRequirements =
    Boolean(kpiForm.measurementType) &&
    Boolean(kpiForm.targetDirection) &&
    Boolean(kpiForm.targetValue);
  const canSaveKpi =
    Boolean(kpiForm.goalId) &&
    Boolean(kpiForm.name.trim()) &&
    Boolean(kpiForm.frequency.trim()) &&
    Boolean(kpiForm.unit.trim()) &&
    Boolean(kpiForm.firmTarget.trim()) &&
    (isTemplateMode ? Boolean(kpiForm.metricKey) : hasManualRequirements) &&
    authoringSubmitting === null;
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

  const closeSetupSheet = () => {
    setSetupSheetMode(null);
    setEditingPerspectiveId(null);
    setPerspectiveForm({
      name: "",
      ownerName: "",
      summary: "",
    });
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
  const scopedPerspectives = perspectiveData.filter((perspective) =>
    rolePerspectiveScope[selectedRole].includes(perspective.id)
  );
  const selectedCycleId =
    selectedCycle !== "latest" && Number.isFinite(Number(selectedCycle))
      ? Number(selectedCycle)
      : undefined;
  const visibleTabs = roleTabVisibility[selectedRole]
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
        value: evaluationSummary.cycleTitle || "No active cycle",
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
        label: "Weighted coverage",
        value: kpiData.length > 0 ? `${Math.round(kpiData.reduce((sum, kpi) => sum + kpi.weight, 0))}%` : "0%",
        hint: "Total weighting currently assigned across the governed KPI mix.",
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
  const managerEmployeeItems = employeePerformanceData.map((employee, index) => {
    const ackState = parseAcknowledgementState(employee.ack);
    return {
      id: `team-${employee.name.replace(/\s+/g, "-").toLowerCase()}`,
      employee: employee.name,
      title:
        index === 0
          ? "Priority contribution follow-through"
          : index === 1
            ? "Client and delivery action mix"
            : index === 2
              ? "Coaching and readiness action"
              : "Acknowledgement and update follow-up",
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
              value: evaluationSummary.cycleTitle || "No active cycle",
              note: evaluationSummary.cycleId
                ? `${evaluationSummary.pendingAssignments} assignments are pending and ${evaluationSummary.overdueAssignments} are overdue.`
                : "Create or select an evaluation cycle to connect scorecard progress to reviews.",
            },
            {
              label: "KPI contracts",
              value: `${kpiData.length} configured`,
              note:
                atRiskKpiCount > 0
                  ? `${atRiskKpiCount} KPI contracts are currently amber or red.`
                  : "All live KPI contracts are currently on track.",
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
              value: evaluationSummary.cycleId ? `${evaluationSummary.completionPercent}%` : "No active cycle",
              note: evaluationSummary.cycleId
                ? `${evaluationSummary.submittedAssignments} of ${evaluationSummary.totalAssignments} assignments are submitted.`
                : "Start an evaluation cycle to join scorecard and review signals.",
            },
            {
              label: "Strategic KPI risks",
              value: String(atRiskKpiCount),
              note: atRiskKpiCount > 0
                ? `${atRiskKpiCount} KPI contracts need executive attention.`
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
                ? `${customerKpis.length} customer KPI contracts are feeding this portfolio slice.`
                : "No customer KPI contracts are mapped into this portfolio slice yet.",
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
                ? `${customerKpis.length} customer-facing KPI contracts are in scope for this portfolio view.`
                : "No customer KPI contracts are mapped into this view yet.",
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
                `${peopleKpis.filter((kpi) => kpi.status !== "on_track").length} people KPI contracts need coaching follow-through.`,
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
              value: String(employeeContributionData.length),
              hint: "Current contribution items owned by the signed-in employee slice.",
              icon: ClipboardCheck,
            },
            {
              label: "Progress",
              value: `${averageContributionProgress}%`,
              hint: "Average progress across the live employee work items.",
              icon: Activity,
            },
            {
              label: "My score",
              value: String(averageContributionScore),
              hint: "Current weighted contribution score pulled from live actions.",
              icon: BarChart3,
            },
            {
              label: "Pending ack",
              value: String(employeeContributionData.filter((item) => !item.acknowledged).length),
              hint: "Employee contribution items still waiting for acknowledgement.",
              icon: CheckCircle2,
            },
          ],
          primaryBoardItems: [
            {
              label: "Assigned actions",
              value: `${employeeContributionData.length} active`,
              note: evaluationSummary.cycleId
                ? `${evaluationSummary.cycleTitle} is the active cycle for these contribution items.`
                : `${employeeContributionData.filter((item) => item.status !== "on_track").length} assigned items are currently amber or red.`,
              status: scoreToStatus(averageContributionProgress),
              progress: averageContributionProgress,
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
              value: `${averageContributionProgress}%`,
              note: employeeContributionData.length > 0
                ? `${averageContributionScore} is the current weighted contribution score across assigned work.`
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
          boardDescription: "The GMP surface should begin with decision-ready work, not the whole execution tree.",
          asideTitle: "What GMP is checking",
          asideDescription: "Executive review is about strategic integrity, not task administration.",
          asideLines: [
            "Is the parent initiative aligned to the strategic KPI and goal?",
            "Will approving this create clear downstream work for partner and manager owners?",
            "Do risk notes explain what needs executive intervention versus local execution?",
          ],
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
          boardTitle: "Portfolio initiative chain",
          boardDescription: "Partner work narrows the firm initiative into account plans and manager delivery expectations.",
          asideTitle: "What changes at partner level",
          asideDescription: "The KPI stays aligned. The initiative becomes more specific around client portfolios and manager handoffs.",
          asideLines: [
            "The same KPI remains the shared measurement layer.",
            "Partner initiatives become portfolio and account specific.",
            "Managers should receive explicit deliverables, timelines, and commentary from the partner layer.",
          ],
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
          boardTitle: "Manager-owned execution layer",
          boardDescription: "This is where the cascade becomes operational, visible, and coachable.",
          asideTitle: "What the manager owns here",
          asideDescription: "Managers should see work assignment and follow-through, not the full strategy authoring surface.",
          asideLines: [
            "Translate partner direction into team deliverables.",
            "Turn deliverables into named employee actions with due dates.",
            "Use coaching notes to explain movement before a KPI drifts too far off track.",
          ],
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
          boardTitle: "Growth initiative alignment",
          boardDescription: "Marketing should see where it supports the cascade, not inherit the entire operations view.",
          asideTitle: "What Marketing is reinforcing",
          asideDescription: "Marketing contributes signals, customer insight, and campaign action to the same KPI outcome.",
          asideLines: [
            "Client feedback should visibly feed the customer KPI.",
            "Campaign or proposal work should map to a parent initiative, not float independently.",
            "Handoffs into partner and manager action need to be clear and documented.",
          ],
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
          boardTitle: "Firm initiative register",
          boardDescription: "HR defines the parent initiatives that the rest of the organization will inherit and refine.",
          asideTitle: "What changes as work cascades",
          asideDescription: "The KPI stays aligned. The initiative becomes more specific at lower levels.",
          asideLines: [
            "The same strategic KPI can stay intact across levels.",
            "Target interpretation becomes more operational as the work nears the team.",
            "Initiatives and tasks are what meaningfully change from HR to employee.",
          ],
        };
    }
  })();

  const trackingView = (() => {
    const employeeScopedKpiIds = new Set(employeeContributionData.map((item) => item.kpiId));
    const baseKpis = filteredKpis.filter((kpi) =>
      selectedRole === "employee"
        ? employeeScopedKpiIds.has(kpi.id)
        : rolePerspectiveScope[selectedRole].includes(kpi.perspectiveId)
    );
    const scopedKpisByOwnership = baseKpis.filter((kpi) => {
      if (trackingScope === "firm") {
        return ["GMP Office", "Finance", "HR / Strategy Office", "Operations Council"].some((owner) => kpi.owner.includes(owner));
      }
      if (trackingScope === "team") {
        return ["Partner", "Manager", "Operations", "HR", "Marketing"].some((owner) => kpi.owner.includes(owner));
      }
      if (trackingScope === "employee") {
        return ["kpi-7", "kpi-8", "kpi-9", "kpi-10"].includes(kpi.id);
      }
      return true;
    });
    const kpis = scopedKpisByOwnership.length > 0 ? scopedKpisByOwnership : baseKpis;
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
      legendTitle: "Status legend",
      legendDescription: "Use subtle signal colors only where decision-makers need them.",
    };

    switch (selectedRole) {
      case "gmp":
        return {
          ...shared,
          title: "Executive tracking",
          description: "GMP should see a compact KPI watchlist that combines strategic movement, execution health, and owner commentary.",
          boardTitle: "Executive KPI watchlist",
          boardDescription: "Small, decision-ready list of KPIs requiring executive review.",
          insightTitle: "What GMP should read here",
          insightDescription: "Executive tracking is about risk, ownership, and escalation quality.",
          insightLines: [
            "Focus on KPIs that can change strategic outcomes, not every operational update.",
            "Owner commentary should explain what decision is needed from GMP.",
            "Linked initiative progress matters because it shows whether execution is catching up to the KPI signal.",
          ],
        };
      case "partner":
        return {
          ...shared,
          title: "Portfolio KPI tracking",
          description: "Partners need KPI tracking that stays close to client portfolios, account risk, and manager execution quality.",
          boardTitle: "Portfolio KPI board",
          boardDescription: "Partner-owned or partner-relevant KPIs with clear account and manager commentary.",
          insightTitle: "What Partner should read here",
          insightDescription: "This board is about portfolio movement, account risk, and whether manager action is strong enough.",
          insightLines: [
            "A KPI can be at risk even when the portfolio feels active.",
            "Conversion and retention movement must stay tied to named manager actions.",
            "Commentary should explain which accounts need partner attention now.",
          ],
        };
      case "manager":
        return {
          ...shared,
          title: "Team tracking",
          description: "Managers should see delivery KPIs, coaching-linked people signals, and execution commentary in one operational board.",
          boardTitle: "Team contribution board",
          boardDescription: "Target vs actual, progress, and commentary for the KPIs managers influence most directly.",
          insightTitle: "What Manager should read here",
          insightDescription: "Tracking is only useful if it drives the next coaching or delivery action.",
          insightLines: [
            "Use the board to see which employee actions are not turning into KPI movement.",
            "Commentary should identify blockers early, before the next review cycle.",
            "Team and people KPIs belong together because coaching discipline affects delivery performance.",
          ],
        };
      case "finance":
        return {
          ...shared,
          title: "Financial KPI tracking",
          description: "Finance needs a financial-only lens with actuals, close commentary, and linked recovery initiatives.",
          boardTitle: "Financial watchlist",
          boardDescription: "Collections, realization, and recovery KPIs with finance-owned commentary.",
          insightTitle: "What Finance should read here",
          insightDescription: "Finance owns inputs, accuracy, and period-close explanation for the financial perspective.",
          insightLines: [
            "Watch target vs actual and aging pressure together.",
            "Initiative progress matters only if it changes recovery and collection behavior.",
            "Close notes should explain what moved and what still depends on partner follow-through.",
          ],
        };
      case "marketing":
        return {
          ...shared,
          title: "Growth KPI tracking",
          description: "Marketing should see the customer-growth KPIs, insight commentary, and initiative support signals in one lightweight board.",
          boardTitle: "Customer-growth watchlist",
          boardDescription: "Retention, conversion, and sponsor-review support tracked with clear commentary.",
          insightTitle: "What Marketing should read here",
          insightDescription: "Marketing tracking is about how insight and growth actions affect shared customer KPIs.",
          insightLines: [
            "Watch retention and cross-sell movement together because both depend on handoff quality.",
            "Client commentary should explain the next action, not just repeat the metric.",
            "Marketing-owned initiatives should map directly to the shared growth KPI chain.",
          ],
        };
      default:
        return {
          ...shared,
          title: "KPI tracking",
          description: "Tracking shows target versus actual, weighted score, trend, linked initiative progress, and owner commentary in one clean operational view.",
          boardTitle: "Tracking board",
          boardDescription: "Target vs actual, trend, initiative progress, and comments all in one board.",
          insightTitle: "How tracking and initiatives work together",
          insightDescription: "Execution progress should never be separated from the KPI it is intended to move.",
          insightLines: [
            "A KPI can look at risk even when activity volume looks busy. That is why target vs actual and initiative completion must sit together.",
            "Owner commentary is part of the tracking contract. Managers and partners need a place to explain why a KPI is moving.",
            "The best tracking screens are action-oriented, not just numeric.",
          ],
        };
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
        sideTitle: "Manager design rules",
        sideDescription: "Managers need a clean action board, not a full executive tree.",
        sideLines: [
          "Show employee acknowledgement and overdue updates prominently.",
          "Keep coaching comments close to the action, not in a separate workflow.",
          "Make upward contribution clear so managers understand why each action matters.",
        ],
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
        items: employeePerformanceData.map((employee, index) => ({
          id: `hr-workforce-${employee.name}`,
          employee: employee.name,
          title: index === 0 ? "Client growth contribution mix" : index === 1 ? "Delivery quality contribution mix" : index === 2 ? "Coaching and readiness mix" : "Follow-up and acknowledgement mix",
          dueDate: index === 3 ? "Immediate follow-up" : "Monthly review pack",
          progress: employee.score,
          acknowledged: employee.ack.toLowerCase().includes("all") || employee.ack.startsWith("2/3"),
          status: employee.score >= 75 ? "on_track" : employee.score >= 60 ? "at_risk" : "off_track",
          note: employee.ack,
        })),
        sideTitle: "HR focus",
        sideDescription: "This view helps HR spot workforce friction in the cascade before it becomes a strategic problem.",
        sideLines: [
          "Use acknowledgement and contribution health as leading indicators.",
          "Escalate teams where employee actions are piling up without progress.",
          "Do not turn HR into the owner of every employee task; use this as a governance lens.",
        ],
      };
    }

    return {
      title: "Employee view",
      // description: "A lightweight employee dashboard focused on what the employee owns, how they are progressing, and how their work contributes upward.",
      metrics: [
        {
          label: "My assigned items",
          value: String(employeeContributionData.length),
          hint: "Active work items linked to live initiatives.",
          icon: ClipboardCheck,
        },
        {
          label: "My average progress",
          value: `${averageContributionProgress}%`,
          hint: "Across my active contribution items.",
          icon: Activity,
        },
        {
          label: "My score",
          value: String(averageContributionScore),
          hint: "Weighted contribution score for the current cycle.",
          icon: BarChart3,
        },
        {
          label: "Acknowledged",
          value: `${employeeContributionData.filter((item) => item.acknowledged).length}/${employeeContributionData.length || 0}`,
          hint: "Contribution items already acknowledged by the employee.",
          icon: CheckCircle2,
        },
      ],
      items: employeeContributionData.map((item) => ({
        id: item.id,
        employee: "Me",
        title: item.title,
        dueDate: item.dueDate,
        progress: item.progress,
        acknowledged: item.acknowledged,
        status: item.status,
        note: item.managerComment,
      })),
      sideTitle: "Employee design rules",
      sideDescription: "Keep the experience light, clear, and role-relevant.",
      sideLines: [
        "Show only my assigned items, due dates, progress, score, and the most recent manager note.",
        "Keep the upward roll-up explanation compact and easy to scan.",
        "Avoid exposing the full strategy tree unless the employee intentionally drills deeper.",
      ],
    };
  })();

  const reportsView = (() => {
    // Keep the reporting tab BSC-native. Manager/employee rows previously leaked
    // evaluation and learning rollups into the scorecard surface.
    const perspectiveRows =
      selectedRole === "finance"
        ? perspectiveData.filter((perspective) => perspective.id === "financial")
        : selectedRole === "marketing"
          ? perspectiveData.filter((perspective) => perspective.id === "customer")
          : selectedRole === "partner"
            ? perspectiveData.filter((perspective) => ["financial", "customer", "internal"].includes(perspective.id))
            : perspectiveData;
    const departmentRows =
      selectedRole === "finance"
        ? departmentPerformanceData.slice(0, 3)
        : selectedRole === "marketing"
          ? departmentPerformanceData.filter((department) => department.status !== "off_track").slice(0, 3)
          : selectedRole === "partner"
            ? departmentPerformanceData.filter((department) => department.status !== "off_track").slice(0, 4)
            : departmentPerformanceData;
    const managerRows: WorkspaceManagerRow[] = [];
    const employeeRows: WorkspaceEmployeeRow[] = [];
    const reportBlocks = reportBlockData.map((block) =>
      block.label === "Performance by manager"
        ? {
            ...block,
            value: `${managerRows.length} managers`,
            hint:
              "Manager roll-up is hidden until live BSC-owned manager data is explicitly modeled.",
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

  const refreshBalancedScorecardData = async (role: RoleKey = selectedRole) => {
    const [workspace, structure, templates] = await Promise.all([
      performanceFrameworkAPI.getWorkspace({
        role,
        evaluationCycleId: selectedCycleId,
      }),
      performanceFrameworkAPI.getScorecardStructure(),
      performanceFrameworkAPI.getKpiTemplates(),
    ]);
    setWorkspaceData(workspace);
    setStructureData(structure);
    setMetricTemplates(templates);
  };

  const applyMetricTemplate = (metricKey: string) => {
    const template = metricTemplates.find((candidate) => candidate.metricKey === metricKey);
    setKpiForm((current) => ({
      ...current,
      trackingMode: "template",
      metricKey,
      name: template?.name ?? current.name,
      formula: template?.defaultFormula ?? current.formula,
      frequency: template?.defaultFrequency ?? current.frequency,
      unit: template?.defaultUnit ?? current.unit,
      weight: template ? String(template.defaultWeight) : current.weight,
      firmTarget: template?.defaultTarget ?? current.firmTarget,
      ownerName: template?.defaultOwnerName ?? current.ownerName,
      statusLogic: template?.defaultStatusLogic ?? current.statusLogic,
      updateFrequency: template?.defaultUpdateFrequency ?? current.updateFrequency,
      measurementType: template?.defaultMeasurementType ?? current.measurementType,
      targetDirection: template?.defaultTargetDirection ?? current.targetDirection,
      targetValue:
        template?.defaultTargetValue !== undefined
          ? String(template.defaultTargetValue)
          : current.targetValue,
    }));
  };

  const updateTrackingMode = (mode: "template" | "manual") => {
    setKpiForm((current) => ({
      ...current,
      trackingMode: mode,
      metricKey: mode === "manual" ? "" : current.metricKey,
    }));
  };

  const handleCreatePerspective = async () => {
    try {
      setAuthoringSubmitting("createPerspective");
      await performanceFrameworkAPI.createPerspective({
        name: perspectiveForm.name,
        ownerName: perspectiveForm.ownerName || undefined,
        summary: perspectiveForm.summary || undefined,
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

  const handleCreateKpi = async () => {
    try {
      setAuthoringSubmitting("createKpi");
      await performanceFrameworkAPI.createKpi({
        goalId: Number(kpiForm.goalId),
        trackingMode: kpiForm.trackingMode,
        metricKey: kpiForm.metricKey || undefined,
        measurementType: kpiForm.measurementType || undefined,
        targetDirection: kpiForm.targetDirection || undefined,
        targetValue: kpiForm.targetValue ? Number(kpiForm.targetValue) : undefined,
        currentActualValue: kpiForm.currentActualValue
          ? Number(kpiForm.currentActualValue)
          : undefined,
        lastMeasurementNote: kpiForm.lastMeasurementNote || undefined,
        name: kpiForm.name,
        description: kpiForm.description || undefined,
        formula: kpiForm.formula || undefined,
        frequency: kpiForm.frequency,
        unit: kpiForm.unit,
        weight: Number(kpiForm.weight),
        firmTarget: kpiForm.firmTarget,
        ownerName: kpiForm.ownerName || undefined,
        statusLogic: kpiForm.statusLogic || undefined,
        updateFrequency: kpiForm.updateFrequency || undefined,
      });
      await refreshBalancedScorecardData(selectedRole);
      setKpiForm((current) => ({
        goalId: current.goalId,
        trackingMode: current.trackingMode,
        metricKey: current.metricKey,
        name: "",
        description: "",
        formula: current.formula,
        frequency: current.frequency,
        unit: current.unit,
        weight: current.weight,
        firmTarget: current.firmTarget,
        ownerName: current.ownerName,
        statusLogic: current.statusLogic,
        updateFrequency: current.updateFrequency,
        measurementType: current.measurementType,
        targetDirection: current.targetDirection,
        targetValue: current.targetValue,
        currentActualValue: current.currentActualValue,
        lastMeasurementNote: "",
      }));
      setKpiSheetMode(null);
      toast({
        title: "KPI contract created",
        description: "The KPI is now persisted and linked to the selected strategic goal.",
      });
    } catch (error) {
      toast({
        title: "KPI creation failed",
        description: error instanceof Error ? error.message : "The KPI contract could not be saved.",
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
    let cancelled = false;
    const loadCycles = async () => {
      try {
        const cycles = await evaluationsAPI.getMyCycles();
        if (cancelled) return;
        setAvailableCycles(cycles);
        setSelectedCycle((current) => {
          if (current !== "latest" && cycles.some((cycle) => String(cycle.id) === current)) {
            return current;
          }
          const activeCycle = cycles.find((cycle) => cycle.status === "active");
          return activeCycle ? String(activeCycle.id) : "latest";
        });
      } catch {
        if (!cancelled) {
          setAvailableCycles([]);
          setSelectedCycle("latest");
        }
      }
    };
    loadCycles();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadWorkspace = async () => {
      setWorkspaceLoading(true);
      try {
        const [workspace, structure, templates] = await Promise.all([
          performanceFrameworkAPI.getWorkspace({
            role: selectedRole,
            evaluationCycleId: selectedCycleId,
          }),
          performanceFrameworkAPI.getScorecardStructure(),
          performanceFrameworkAPI.getKpiTemplates(),
        ]);
        if (!cancelled) {
          setWorkspaceData(workspace);
          setStructureData(structure);
          setMetricTemplates(templates);
          setWorkspaceError(null);
        }
      } catch (error) {
        if (!cancelled) {
          const message =
            error instanceof Error ? error.message : "Failed to load the live balanced scorecard workspace.";
          setWorkspaceError(message);
        }
      } finally {
        if (!cancelled) {
          setWorkspaceLoading(false);
        }
      }
    };
    loadWorkspace();
    return () => {
      cancelled = true;
    };
  }, [selectedCycleId, selectedRole]);

  useEffect(() => {
    if (!goalForm.perspectiveId && perspectiveRecords[0]) {
      setGoalForm((current) => ({
        ...current,
        perspectiveId: String(perspectiveRecords[0].id),
      }));
    }
  }, [goalForm.perspectiveId, perspectiveRecords]);

  useEffect(() => {
    if (!kpiForm.goalId && goalRecords[0]) {
      setKpiForm((current) => ({
        ...current,
        goalId: String(goalRecords[0].id),
      }));
    }
  }, [goalRecords, kpiForm.goalId]);

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
    if (kpiForm.trackingMode === "template" && !kpiForm.metricKey && metricTemplates[0]) {
      applyMetricTemplate(metricTemplates[0].metricKey);
    }
  }, [kpiForm.metricKey, kpiForm.trackingMode, metricTemplates]);

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
                    hint="Financial, customer, internal process, and people."
                    icon={Layers}
                  />
                  <MetricCard
                    label="Active strategic goals"
                    value={String(overviewMetrics.goals)}
                    hint="Firm-owned goals linked to measurable KPIs."
                    icon={Flag}
                  />
                  <MetricCard
                    label="Tracked KPIs"
                    value={String(overviewMetrics.kpis)}
                    hint="Every KPI is linked back to a BSC goal and owner."
                    icon={Target}
                  />
                  <MetricCard
                    label="Cascade readiness"
                    value={overviewMetrics.cascadeReadiness}
                    hint="Average roll-down coverage from firm initiative to employee action."
                    icon={Workflow}
                  />
                </div>
            </div>

            <Card className="relative rounded-[24px] border-border/70 bg-background/80 shadow-none">
              <CardHeader className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg">{selectedRoleProfile.label} view</CardTitle>
                    <CardDescription>{selectedRoleProfile.scope}</CardDescription>
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
                <div className="grid gap-3 sm:grid-cols-2">
                  <Button className="h-11 rounded-2xl">{selectedRoleProfile.primaryAction}</Button>
                  <Button
                    variant="outline"
                    className="h-11 rounded-2xl"
                    onClick={() => {
                      if (evaluationSummary.cycleId && hasAnyRole(["hr", "manager", "super_admin"])) {
                        navigate(`/evaluations/cycles/${evaluationSummary.cycleId}/results`);
                        return;
                      }
                      navigate("/evaluations");
                    }}
                  >
                    {evaluationSummary.cycleId ? "Open evaluation cycle" : "Open evaluations"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ModuleTabValue)}>
          <ScrollArea className="w-full whitespace-nowrap rounded-[24px] border border-border/70 bg-card px-2 py-2 shadow-sm">
            <TabsList className="h-auto bg-transparent p-0">
              {visibleTabs.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="rounded-2xl px-4 py-2.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </ScrollArea>

          <TabsContent value="dashboard" className="space-y-6">
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
              {selectedRoleHome.metrics.map((metric) => (
                <MetricCard
                  key={metric.label}
                  label={metric.label}
                  value={metric.value}
                  hint={metric.hint}
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
                    description={selectedRoleHome.description}
                  />
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    {selectedRoleHome.primaryBoardItems.map((item) => (
                      <div key={item.label} className="rounded-[24px] border border-border/60 bg-muted/20 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <p className="text-sm font-medium text-foreground">{item.label}</p>
                            <p className="text-2xl font-semibold tracking-tight text-foreground">{item.value}</p>
                          </div>
                          {item.status ? <StatusBadge status={item.status} /> : null}
                        </div>
                        <p className="mt-3 text-sm text-muted-foreground">{item.note}</p>
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

                  <Card className="rounded-[24px] border-border/60 bg-muted/20 shadow-none">
                    <CardHeader>
                      <CardTitle className="text-base">{selectedRoleHome.primaryBoardTitle}</CardTitle>
                      <CardDescription>{selectedRoleHome.primaryBoardDescription}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {selectedRoleHome.primaryBoardItems.map((item) => (
                        <div key={`${item.label}-detail`} className="rounded-2xl border border-border/60 bg-background p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 space-y-1">
                              <p className="font-medium text-foreground">{item.label}</p>
                              <p className="text-sm text-muted-foreground">{item.note}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold text-foreground">{item.value}</p>
                              {item.status ? <div className="mt-2"><StatusBadge status={item.status} /></div> : null}
                            </div>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </CardContent>
              </Card>

              <div className="space-y-6">
                {selectedRoleHome.secondaryBoardItems.length > 0 ? (
                  <Card className="rounded-[28px] border-border/70 shadow-sm">
                    <CardHeader>
                      <CardTitle className="text-lg">{selectedRoleHome.secondaryBoardTitle}</CardTitle>
                      <CardDescription>{selectedRoleHome.secondaryBoardDescription}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {selectedRoleHome.secondaryBoardItems.map((item) => (
                        <div key={item.label} className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-medium text-foreground">{item.label}</p>
                              <p className="mt-2 text-sm text-muted-foreground">{item.note}</p>
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

                <Card className="rounded-[28px] border-border/70 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-lg">Enabled sections</CardTitle>
                    <CardDescription>Tabs currently available in this live workspace.</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    {visibleTabs.map((tab) => (
                      <Badge key={tab.value} variant="outline" className="rounded-full bg-muted/20">
                        {tab.label}
                      </Badge>
                    ))}
                  </CardContent>
                </Card>

              </div>
            </div>

            <Card className="rounded-[28px] border-border/70 shadow-sm">
              <CardHeader>
                <SectionTitle
                  icon={BarChart3}
                  title="Perspective lens for this role"
                  description="Each role should see only the strategic perspectives that matter most to its decisions."
                />
              </CardHeader>
              <CardContent>
                <div className={cn("grid gap-4", scopedPerspectives.length === 1 ? "md:grid-cols-1" : scopedPerspectives.length === 2 ? "xl:grid-cols-2" : "xl:grid-cols-3")}>
                  {scopedPerspectives.map((perspective) => (
                    <Card key={perspective.id} className="rounded-[24px] border-border/60 bg-muted/20 shadow-none">
                      <CardHeader className="space-y-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <CardTitle className="text-base">{perspective.name}</CardTitle>
                            <CardDescription>{perspective.summary}</CardDescription>
                          </div>
                          <StatusBadge status={perspective.status} />
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Perspective score</span>
                            <span className="font-medium text-foreground">{perspective.score}%</span>
                          </div>
                          <Progress value={perspective.score} className="h-2.5 rounded-full" />
                        </div>
                        <div className="space-y-2">
                          {goalData
                            .filter((goal) => goal.perspectiveId === perspective.id)
                            .slice(0, 2)
                            .map((goal) => (
                              <div key={goal.id} className="rounded-2xl border border-border/60 bg-background p-3">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="font-medium text-foreground">{goal.title}</p>
                                    <p className="text-xs text-muted-foreground">{goal.owner}</p>
                                  </div>
                                  <StatusBadge status={goal.status} />
                                </div>
                              </div>
                            ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="setup" className="space-y-6">
            <Card className="rounded-[28px] border-border/70 shadow-sm">
              <CardHeader className="space-y-4">
                <SectionTitle
                  icon={Settings2}
                  title="Strategy setup"
                  description="HR defines the scorecard structure here. This is the BSC authoring surface, not an operational workspace."
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
                    Create perspective
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-2xl"
                    onClick={() => setSetupSheetMode("createGoal")}
                  >
                    Create strategic goal
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-2xl"
                    onClick={() => setSetupSheetMode("governance")}
                  >
                    Review governance checks
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
                        hint={metric.hint}
                        icon={metric.icon}
                      />
                    ))}
                  </div>
                  <Card className="rounded-[24px] border-border/60 shadow-none">
                    <CardHeader>
                      <CardTitle className="text-base">Goal registry</CardTitle>
                      <CardDescription>Perspective-owned goals with owners, descriptions, and linked KPI counts.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Perspective</TableHead>
                            <TableHead>Goal</TableHead>
                            <TableHead>Owner</TableHead>
                            <TableHead>Linked KPIs</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {goalData.map((goal) => {
                            const perspective = perspectiveData.find((candidate) => candidate.id === goal.perspectiveId);
                            return (
                              <TableRow key={goal.id}>
                                <TableCell className="font-medium">{perspective?.name}</TableCell>
                                <TableCell>
                                  <div>
                                    <p className="font-medium text-foreground">{goal.title}</p>
                                    <p className="text-xs text-muted-foreground">{goal.description}</p>
                                  </div>
                                </TableCell>
                                <TableCell>{goal.owner}</TableCell>
                                <TableCell>{goal.linkedKpis.length}</TableCell>
                                <TableCell>
                                  <StatusBadge status={goal.status} />
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </div>

                <div className="space-y-4">
                  <Card className="rounded-[24px] border-border/60 bg-muted/20 shadow-none">
                    <CardHeader>
                      <CardTitle className="text-base">Scorecard structure</CardTitle>
                      <CardDescription>Current perspectives and linked goals in the live scorecard structure.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {perspectiveRecords.map((perspective) => {
                        const perspectiveGoals = goalRecords.filter(
                          (goal) => goal.perspectiveId === perspective.id
                        );

                        return (
                        <div key={perspective.id} className="rounded-2xl border border-border/60 bg-background p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 space-y-1">
                              <p className="font-medium text-foreground">{perspective.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {perspective.ownerName || "Unassigned"}
                              </p>
                              {perspective.summary ? (
                                <p className="text-sm text-muted-foreground">{perspective.summary}</p>
                              ) : null}
                            </div>
                            <Badge variant="outline" className="rounded-full">
                              {perspectiveGoals.length} goals
                            </Badge>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {perspectiveGoals.map((goal) => (
                              <Badge key={goal.id} variant="secondary" className="rounded-full">
                                {goal.title}
                              </Badge>
                            ))}
                          </div>
                          {perspectiveGoals.length === 0 ? (
                            <p className="mt-3 text-sm text-muted-foreground">No active goals linked yet.</p>
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
                          {perspectiveGoals.length > 0 ? (
                            <p className="mt-2 text-xs text-muted-foreground">
                              Archive becomes available after all active goals under this perspective are removed.
                            </p>
                          ) : null}
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
                            : "Strategy governance checks"}
                    </SheetTitle>
                    <SheetDescription>
                      {setupSheetMode === "flow"
                        ? "A guided authoring flow for the BSC structure before the cascade begins."
                        : setupSheetMode === "createPerspective"
                          ? "Add a firm-level BSC perspective to the persisted scorecard structure."
                          : setupSheetMode === "editPerspective"
                            ? "Update the selected perspective in the persisted scorecard structure."
                          : setupSheetMode === "createGoal"
                            ? "Create a strategic goal under one persisted BSC perspective."
                            : "Use these checks to keep the strategy layer clean before execution begins."}
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
                        <div className="flex items-center justify-end gap-3">
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
                  description="This is the HR-owned KPI contract layer: definition, measurement logic, ownership, weighting, and review readiness."
                />
                <div className="flex flex-wrap gap-3">
                  <Button className="rounded-2xl" onClick={() => setKpiSheetMode("contract")}>
                    Open KPI contract flow
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
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_220px]">
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
                        hint={metric.hint}
                        icon={metric.icon}
                      />
                    ))}
                  </div>

                  <Card className="rounded-[24px] border-border/60 shadow-none">
                    <CardHeader>
                      <CardTitle className="text-base">KPI definitions</CardTitle>
                      <CardDescription>Scan the governed KPI list, then inspect the full measurement contract in the side sheet.</CardDescription>
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
                                            <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Formula / definition</p>
                                            <p className="mt-2 text-sm text-foreground">{kpi.formula}</p>
                                          </div>
                                          <div className="rounded-2xl border border-border/60 p-4">
                                            <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Status logic</p>
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
            <Sheet open={kpiSheetMode !== null} onOpenChange={(open) => !open && setKpiSheetMode(null)}>
              <SheetContent className="w-full sm:max-w-2xl">
                <ScrollArea className="h-full pr-4">
                  <SheetHeader className="space-y-2">
                    <SheetTitle>
                      {kpiSheetMode === "contract"
                        ? "KPI contract flow"
                        : kpiSheetMode === "createKpi"
                          ? "Create KPI contract"
                          : kpiSheetMode === "createInitiative"
                            ? "Create initiative"
                            : "KPI governance rules"}
                    </SheetTitle>
                    <SheetDescription>
                      {kpiSheetMode === "contract"
                        ? "Move through the KPI contract in a guided sequence instead of a long governance page."
                        : kpiSheetMode === "createKpi"
                          ? "Persist a KPI contract against one strategic goal using a template or a custom tracking setup."
                          : kpiSheetMode === "createInitiative"
                            ? "Create the execution layer that will carry the KPI downward through the cascade."
                            : "Keep the KPI layer controlled before any initiative or employee contribution begins to move."}
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
                      <div className="space-y-5 rounded-2xl border border-border/60 bg-muted/15 p-5">
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-foreground">Strategic goal</label>
                          <Select
                            value={kpiForm.goalId}
                            onValueChange={(value) =>
                              setKpiForm((current) => ({ ...current, goalId: value }))
                            }
                          >
                            <SelectTrigger className="rounded-2xl">
                              <SelectValue placeholder="Select strategic goal" />
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
                          <label className="text-sm font-medium text-foreground">Tracking setup</label>
                          <ToggleGroup
                            type="single"
                            value={kpiForm.trackingMode}
                            onValueChange={(value) => {
                              if (value === "template" || value === "manual") {
                                updateTrackingMode(value);
                              }
                            }}
                            className="justify-start"
                          >
                            <ToggleGroupItem value="template">Template</ToggleGroupItem>
                            <ToggleGroupItem value="manual">Custom</ToggleGroupItem>
                          </ToggleGroup>
                        </div>
                        {isTemplateMode ? (
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Metric template</label>
                            <Select value={kpiForm.metricKey} onValueChange={applyMetricTemplate}>
                              <SelectTrigger className="rounded-2xl">
                                <SelectValue placeholder="Select template" />
                              </SelectTrigger>
                              <SelectContent>
                                {metricTemplates.map((template) => (
                                  <SelectItem key={template.metricKey} value={template.metricKey}>
                                    {template.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ) : null}
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">KPI name</label>
                            <Input
                              value={kpiForm.name}
                              onChange={(event) =>
                                setKpiForm((current) => ({ ...current, name: event.target.value }))
                              }
                              placeholder="KPI name"
                              className="rounded-2xl"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Owner</label>
                            <Input
                              value={kpiForm.ownerName}
                              onChange={(event) =>
                                setKpiForm((current) => ({ ...current, ownerName: event.target.value }))
                              }
                              placeholder="KPI owner"
                              className="rounded-2xl"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Frequency</label>
                            <Input
                              value={kpiForm.frequency}
                              onChange={(event) =>
                                setKpiForm((current) => ({ ...current, frequency: event.target.value }))
                              }
                              placeholder="Monthly"
                              className="rounded-2xl"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Unit</label>
                            <Input
                              value={kpiForm.unit}
                              onChange={(event) =>
                                setKpiForm((current) => ({ ...current, unit: event.target.value }))
                              }
                              placeholder="%"
                              className="rounded-2xl"
                            />
                          </div>
                          {!isTemplateMode ? (
                            <>
                              <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground">Measurement type</label>
                                <Select
                                  value={kpiForm.measurementType}
                                  onValueChange={(value) =>
                                    setKpiForm((current) => ({ ...current, measurementType: value }))
                                  }
                                >
                                  <SelectTrigger className="rounded-2xl">
                                    <SelectValue placeholder="Select measurement type" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="percentage">Percentage</SelectItem>
                                    <SelectItem value="currency">Currency</SelectItem>
                                    <SelectItem value="number">Number</SelectItem>
                                    <SelectItem value="count">Count</SelectItem>
                                    <SelectItem value="days">Days</SelectItem>
                                    <SelectItem value="boolean">Yes / No</SelectItem>
                                    <SelectItem value="milestone">Milestone</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground">Target direction</label>
                                <Select
                                  value={kpiForm.targetDirection}
                                  onValueChange={(value) =>
                                    setKpiForm((current) => ({ ...current, targetDirection: value }))
                                  }
                                >
                                  <SelectTrigger className="rounded-2xl">
                                    <SelectValue placeholder="Select direction" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="higher_better">Higher is better</SelectItem>
                                    <SelectItem value="lower_better">Lower is better</SelectItem>
                                    <SelectItem value="exact_match">Exact match</SelectItem>
                                    <SelectItem value="milestone_complete">Milestone complete</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground">Target value</label>
                                <Input
                                  type="number"
                                  value={kpiForm.targetValue}
                                  onChange={(event) =>
                                    setKpiForm((current) => ({ ...current, targetValue: event.target.value }))
                                  }
                                  placeholder="Target value"
                                  className="rounded-2xl"
                                />
                              </div>
                              <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground">Current actual (optional)</label>
                                <Input
                                  type="number"
                                  value={kpiForm.currentActualValue}
                                  onChange={(event) =>
                                    setKpiForm((current) => ({
                                      ...current,
                                      currentActualValue: event.target.value,
                                    }))
                                  }
                                  placeholder="Actual value"
                                  className="rounded-2xl"
                                />
                              </div>
                            </>
                          ) : null}
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Weight</label>
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              value={kpiForm.weight}
                              onChange={(event) =>
                                setKpiForm((current) => ({ ...current, weight: event.target.value }))
                              }
                              placeholder="10"
                              className="rounded-2xl"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Firm target</label>
                            <Input
                              value={kpiForm.firmTarget}
                              onChange={(event) =>
                                setKpiForm((current) => ({ ...current, firmTarget: event.target.value }))
                              }
                              placeholder="92%"
                              className="rounded-2xl"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-foreground">Description</label>
                          <Textarea
                            value={kpiForm.description}
                            onChange={(event) =>
                              setKpiForm((current) => ({ ...current, description: event.target.value }))
                            }
                            placeholder="What does this KPI measure?"
                            className="min-h-[96px] rounded-2xl"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-foreground">Formula / definition</label>
                          <Textarea
                            value={kpiForm.formula}
                            onChange={(event) =>
                              setKpiForm((current) => ({ ...current, formula: event.target.value }))
                            }
                            placeholder="How should this KPI be measured?"
                            className="min-h-[96px] rounded-2xl"
                          />
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Status logic</label>
                            <Textarea
                              value={kpiForm.statusLogic}
                              onChange={(event) =>
                                setKpiForm((current) => ({ ...current, statusLogic: event.target.value }))
                              }
                              placeholder="How is green / amber / red determined?"
                              className="min-h-[96px] rounded-2xl"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Update cadence</label>
                            <Textarea
                              value={kpiForm.updateFrequency}
                              onChange={(event) =>
                                setKpiForm((current) => ({ ...current, updateFrequency: event.target.value }))
                              }
                              placeholder="Monthly pack + quarter review"
                              className="min-h-[96px] rounded-2xl"
                            />
                          </div>
                        </div>
                        {!isTemplateMode ? (
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Last measurement note</label>
                            <Textarea
                              value={kpiForm.lastMeasurementNote}
                              onChange={(event) =>
                                setKpiForm((current) => ({
                                  ...current,
                                  lastMeasurementNote: event.target.value,
                                }))
                              }
                              placeholder="Optional context for the latest measurement update."
                              className="min-h-[90px] rounded-2xl"
                            />
                          </div>
                        ) : null}
                        {isTemplateMode && selectedMetricTemplate ? (
                          <div className="rounded-2xl border border-border/60 bg-background p-4 text-sm text-muted-foreground">
                            Template defaults come from the live metric catalog: <span className="font-medium text-foreground">{selectedMetricTemplate.name}</span>.
                          </div>
                        ) : null}
                        <div className="flex items-center justify-end gap-3">
                          <Button variant="outline" className="rounded-2xl" onClick={() => setKpiSheetMode(null)}>
                            Cancel
                          </Button>
                          <Button
                            className="rounded-2xl"
                            disabled={!canSaveKpi}
                            onClick={handleCreateKpi}
                          >
                            {authoringSubmitting === "createKpi" ? "Saving..." : "Save KPI"}
                          </Button>
                        </div>
                      </div>
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

          <TabsContent value="cascade" className="space-y-6">
            <Card className="rounded-[28px] border-border/70 shadow-sm">
              <CardHeader className="space-y-4">
                <SectionTitle
                  icon={Workflow}
                  title={cascadeView.title}
                  description={cascadeView.description}
                />
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-3">
                  {cascadeView.metrics.map((metric) => (
                    <MetricCard
                      key={metric.label}
                      label={metric.label}
                      value={metric.value}
                      hint={metric.hint}
                      icon={metric.icon}
                    />
                  ))}
                </div>
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_360px]">
                  <Card className="rounded-[28px] border-border/60 shadow-none">
                    <CardHeader>
                      <CardTitle className="text-xl">{cascadeView.boardTitle}</CardTitle>
                      <CardDescription>{cascadeView.boardDescription}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="rounded-[24px] border border-primary/20 bg-primary/5 p-5">
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">BSC Goal</p>
                            <p className="text-lg font-semibold text-foreground">
                              {featuredGoalRecord?.title || linkedGoal?.title || "No strategic goal linked yet"}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {featuredGoalRecord?.description ||
                                linkedGoal?.description ||
                                "No goal description is available yet."}
                            </p>
                          </div>
                          <div className="space-y-2">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">KPI</p>
                            <p className="text-lg font-semibold text-foreground">
                              {featuredLiveKpi?.name || highlightedKpi?.name || "No KPI linked yet"}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {featuredLiveKpi || highlightedKpi
                                ? `Target ${featuredLiveKpi?.firmTarget || highlightedKpi?.firmTarget} · Actual ${featuredLiveKpi?.actual || highlightedKpi?.actual} · Shared measurement layer across every role.`
                                : "Add a KPI contract to connect this cascade to a measurable scorecard outcome."}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        {cascadeView.cards.map((card, index) => (
                          <div key={card.id} className="relative pl-12">
                            {index < cascadeView.cards.length - 1 ? (
                              <div className="absolute left-[18px] top-14 h-[calc(100%+0.75rem)] w-px bg-border" />
                            ) : null}
                            <div className="absolute left-0 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                              {index + 1}
                            </div>
                            <Card className="rounded-[24px] border-border/60 shadow-none">
                              <CardContent className="space-y-4 p-5">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                      <Badge variant="outline" className="rounded-full bg-muted/30">
                                        {card.badge}
                                      </Badge>
                                      <p className="font-semibold text-foreground">{card.title}</p>
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                      {card.owner} · Due {card.dueDate}
                                    </p>
                                  </div>
                                  <StatusBadge status={card.status} />
                                </div>
                                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
                                  <div className="space-y-2">
                                    <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Execution summary</p>
                                    <p className="text-sm text-foreground">{card.summary}</p>
                                    <p className="text-sm text-muted-foreground">{card.timeline}</p>
                                  </div>
                                  <div className="space-y-2 rounded-2xl border border-border/60 bg-muted/20 p-4">
                                    <div className="flex items-center justify-between text-sm">
                                      <span className="text-muted-foreground">Progress</span>
                                      <span className="font-medium text-foreground">{card.progress}%</span>
                                    </div>
                                    <Progress value={card.progress} className="h-2.5 rounded-full" />
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <div className="space-y-4">
                    <Card className="rounded-[28px] border-border/60 bg-muted/20 shadow-none">
                      <CardHeader>
                        <CardTitle className="text-base">Active cascade chain</CardTitle>
                        <CardDescription>One live goal-to-KPI-to-initiative chain drawn from the current workspace.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="rounded-[24px] border border-primary/20 bg-primary/5 p-5">
                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">BSC Goal</p>
                              <p className="text-lg font-semibold text-foreground">
                                {featuredGoalRecord?.title || linkedGoal?.title || "No strategic goal linked yet"}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {featuredGoalRecord?.description ||
                                  linkedGoal?.description ||
                                  "No goal description is available yet."}
                              </p>
                            </div>
                            <div className="space-y-2">
                              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">KPI</p>
                              <p className="text-lg font-semibold text-foreground">
                                {featuredLiveKpi?.name || highlightedKpi?.name || "No KPI linked yet"}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {featuredLiveKpi || highlightedKpi
                                  ? `Target ${featuredLiveKpi?.firmTarget || highlightedKpi?.firmTarget} - Actual ${featuredLiveKpi?.actual || highlightedKpi?.actual} - Shared measurement layer across every role.`
                                  : "Add a KPI contract to connect this cascade to a measurable scorecard outcome."}
                              </p>
                            </div>
                          </div>
                        </div>
                        {featuredCascadeData.map((node) => (
                          <div key={node.level} className="flex items-start gap-3 rounded-2xl border border-border/60 bg-background p-4">
                            <ArrowRight className="mt-0.5 h-4 w-4 text-primary" />
                            <div className="space-y-1">
                              <p className="text-sm font-medium text-foreground">
                                {node.level}: {node.initiative}
                              </p>
                              <p className="text-sm text-muted-foreground">{node.note}</p>
                            </div>
                          </div>
                        ))}
                      </CardContent>
                    </Card>

                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tracking" className="space-y-6">
            <Card className="rounded-[28px] border-border/70 shadow-sm">
              <CardHeader className="space-y-4">
                <SectionTitle
                  icon={LineChart}
                  title={trackingView.title}
                  description={trackingView.description}
                />
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_220px]">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search tracked KPIs"
                      className="h-11 rounded-2xl pl-9"
                    />
                  </div>
                  <Select value={trackingScope} onValueChange={setTrackingScope}>
                    <SelectTrigger className="h-11 rounded-2xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All ownership levels</SelectItem>
                      <SelectItem value="firm">Firm-owned KPIs</SelectItem>
                      <SelectItem value="team">Department and manager view</SelectItem>
                      <SelectItem value="employee">Employee contribution view</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" className="h-11 rounded-2xl justify-start gap-2">
                    <Filter className="h-4 w-4" />
                    Advanced filters
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-2 xl:grid-cols-4">
                  {trackingView.metrics.map((metric) => (
                    <MetricCard
                      key={metric.label}
                      label={metric.label}
                      value={metric.value}
                      hint={metric.hint}
                      icon={metric.icon}
                    />
                  ))}
                </div>
                <Card className="rounded-[24px] border-border/60 shadow-none">
                  <CardHeader>
                    <CardTitle className="text-base">{trackingView.boardTitle}</CardTitle>
                    <CardDescription>{trackingView.boardDescription}</CardDescription>
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
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {trackingView.kpis.map((kpi) => (
                          <TableRow key={kpi.id}>
                            <TableCell className="min-w-[240px]">
                              <div className="space-y-1">
                                <p className="font-medium text-foreground">{kpi.name}</p>
                                <p className="text-xs text-muted-foreground">{kpi.ownerUpdate}</p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <p className="font-medium text-foreground">
                                  {kpi.actual} / {kpi.firmTarget}
                                </p>
                                <p className="text-xs text-muted-foreground">{kpi.statusLogic}</p>
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
                            <TableCell>
                              <StatusBadge status={kpi.status} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <div className="grid gap-4 lg:grid-cols-2">
                  <Card className="rounded-[24px] border-border/60 bg-muted/20 shadow-none">
                    <CardHeader>
                      <CardTitle className="text-base">{trackingView.insightTitle}</CardTitle>
                      <CardDescription>{trackingView.insightDescription}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm text-muted-foreground">
                      {trackingView.insightLines.map((line) => (
                        <div key={line} className="rounded-2xl border border-border/60 bg-background p-4">
                          {line}
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  <Card className="rounded-[24px] border-border/60 bg-muted/20 shadow-none">
                    <CardHeader>
                      <CardTitle className="text-base">{trackingView.legendTitle}</CardTitle>
                      <CardDescription>{trackingView.legendDescription}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {(["on_track", "at_risk", "off_track"] as StatusTone[]).map((status) => (
                        <div key={status} className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-border/60 bg-background p-4">
                          <div>
                            <StatusBadge status={status} />
                            <p className="mt-3 text-sm text-muted-foreground">
                              {status === "on_track"
                                ? "Progress is aligned to target and the linked initiative is moving as intended."
                                : status === "at_risk"
                                  ? "The KPI needs intervention, tighter ownership, or stronger initiative completion."
                                  : "The KPI is materially off target and needs a decision, not just another update."}
                            </p>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="employee" className="space-y-6">
            <Card className="rounded-[28px] border-border/70 shadow-sm">
              <CardHeader className="space-y-4">
                <SectionTitle
                  icon={User}
                  title={employeeView.title}
                  description={employeeView.description}
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
              <CardContent
                className={cn(
                  "grid gap-6",
                  selectedRole === "employee" && "xl:grid-cols-[minmax(0,1.3fr)_360px]"
                )}
              >
                <div className="space-y-4">
                  <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 2xl:grid-cols-4">
                    {employeeView.metrics.map((metric) => (
                      <MetricCard
                        key={metric.label}
                        label={metric.label}
                        value={metric.value}
                        hint={metric.hint}
                        icon={metric.icon}
                      />
                    ))}
                  </div>

                  <div className="space-y-4">
                    {selectedRole === "employee"
                      ? employeeContributionData.map((item) => {
                          const kpi = kpiData.find((candidate) => candidate.id === item.kpiId);
                          return (
                            <Card key={item.id} className="rounded-[24px] border-border/60 shadow-none">
                              <CardContent className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1.4fr)_220px]">
                                <div className="space-y-3">
                                  <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="text-lg font-semibold text-foreground break-words">{item.title}</p>
                                      <p className="text-sm text-muted-foreground break-words">
                                        KPI contribution: {kpi?.name} · Initiative: {item.initiative}
                                      </p>
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
                                  <p className="text-sm font-medium text-foreground">What I own</p>
                                  <p className="text-sm text-muted-foreground">
                                    Employees do not need the whole firm structure by default. They need clarity, due dates, and a visible link upward.
                                  </p>
                                  <Button className="h-10 rounded-2xl w-full">{item.acknowledged ? "Update progress" : "Acknowledge item"}</Button>
                                  <Button variant="outline" className="h-10 rounded-2xl w-full">
                                    View contribution detail
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })
                      : employeeView.items.map((item) => (
                          <Card key={item.id} className="rounded-[24px] border-border/60 shadow-none">
                            <CardContent className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1.35fr)_240px]">
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

                              <div className="space-y-3 rounded-[24px] border border-border/60 bg-muted/20 p-4">
                                <p className="text-sm font-medium text-foreground">
                                  {selectedRole === "manager" ? "Manager action" : "HR governance"}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {selectedRole === "manager"
                                    ? "Managers need clarity on acknowledgements, overdue updates, and who needs coaching next."
                                    : "HR should watch acknowledgement and contribution health without inheriting every team task."}
                                </p>
                                <Button className="h-10 rounded-2xl w-full">
                                  {selectedRole === "manager" ? "Open team action" : "Open workforce detail"}
                                </Button>
                                <Button variant="outline" className="h-10 rounded-2xl w-full">
                                  View contribution context
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                  </div>
                </div>

                {selectedRole === "employee" ? (
                  <div className="space-y-4">
                    <Card className="rounded-[24px] border-border/60 bg-muted/20 shadow-none">
                      <CardHeader>
                        <CardTitle className="text-base">How this connects upward</CardTitle>
                        <CardDescription>
                          A small section is enough to make upward contribution clear.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {employeeContributionData.map((item) => (
                          <div key={item.id} className="rounded-2xl border border-border/60 bg-background p-4">
                            <p className="font-medium text-foreground">{item.title}</p>
                            <p className="mt-2 text-sm text-muted-foreground">{item.rollup}</p>
                          </div>
                        ))}
                      </CardContent>
                    </Card>

                    <Card className="rounded-[24px] border-border/60 bg-muted/20 shadow-none">
                      <CardHeader>
                        <CardTitle className="text-base">Employee design rules</CardTitle>
                        <CardDescription>
                          Keep the experience light, clear, and role-relevant.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3 text-sm text-muted-foreground">
                        {employeeView.sideLines.map((line) => (
                          <div key={line} className="rounded-2xl border border-border/60 bg-background p-4">
                            {line}
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reports" className="space-y-6">
            <Card className="rounded-[28px] border-border/70 shadow-sm">
              <CardHeader className="space-y-4">
                <SectionTitle
                  icon={FileText}
                  title={reportsView.title}
                  description={reportsView.description}
                />
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {reportsView.blocks.map((report) => (
                    <Card key={report.label} className="rounded-[24px] border-border/60 bg-muted/20 shadow-none">
                      <CardContent className="space-y-2 p-5">
                        <p className="text-sm font-medium text-foreground">{report.label}</p>
                        <p className="text-2xl font-semibold tracking-tight text-foreground">{report.value}</p>
                        <p className="text-sm text-muted-foreground">{report.hint}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <div className="grid gap-6 xl:grid-cols-3">
                  <Card className="rounded-[24px] border-border/60 shadow-none">
                    <CardHeader>
                      <CardTitle className="text-base">Performance by perspective</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {reportsView.perspectiveRows.map((perspective) => (
                        <div key={perspective.id} className="space-y-2">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-medium text-foreground">{perspective.name}</span>
                            <span className="text-sm text-muted-foreground">{perspective.score}%</span>
                          </div>
                          <Progress value={perspective.score} className="h-2.5 rounded-full" />
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  <Card className="rounded-[24px] border-border/60 shadow-none">
                    <CardHeader>
                      <CardTitle className="text-base">Performance by department</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {reportsView.departmentRows.map((department) => (
                        <div key={department.name} className="space-y-2">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-medium text-foreground">{department.name}</span>
                            <StatusBadge status={department.status} />
                          </div>
                          <Progress value={department.score} className="h-2.5 rounded-full" />
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  <Card className="rounded-[24px] border-border/60 shadow-none">
                    <CardHeader>
                      <CardTitle className="text-base">Initiative completion summary</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {cascadeView.cards.slice(0, 4).map((initiative) => (
                        <div key={initiative.id} className="space-y-2">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-medium text-foreground">{initiative.title}</span>
                            <span className="text-sm text-muted-foreground">{initiative.progress}%</span>
                          </div>
                          <Progress value={initiative.progress} className="h-2.5 rounded-full" />
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>

                <div className="grid gap-6 xl:grid-cols-2">
                  <Card className="rounded-[24px] border-border/60 shadow-none">
                    <CardHeader>
                      <CardTitle className="text-base">Performance by manager</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Manager</TableHead>
                            <TableHead>Team</TableHead>
                            <TableHead>Score</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {reportsView.managerRows.length > 0 ? (
                            reportsView.managerRows.map((manager) => (
                              <TableRow key={manager.name}>
                                <TableCell className="font-medium">{manager.name}</TableCell>
                                <TableCell>{manager.team}</TableCell>
                                <TableCell>{manager.score}</TableCell>
                              </TableRow>
                            ))
                          ) : (
                            <TableRow>
                              <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
                                No live manager score data is available yet.
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>

                  <Card className="rounded-[24px] border-border/60 shadow-none">
                    <CardHeader>
                      <CardTitle className="text-base">Performance by employee</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Employee</TableHead>
                            <TableHead>Contribution score</TableHead>
                            <TableHead>Acknowledgement</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {reportsView.employeeRows.length > 0 ? (
                            reportsView.employeeRows.map((employee) => (
                              <TableRow key={employee.name}>
                                <TableCell className="font-medium">{employee.name}</TableCell>
                                <TableCell>{employee.score}</TableCell>
                                <TableCell>{employee.ack}</TableCell>
                              </TableRow>
                            ))
                          ) : (
                            <TableRow>
                              <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
                                No live employee contribution data is available yet.
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

      </div>
    </DashboardLayout>
  );
}
