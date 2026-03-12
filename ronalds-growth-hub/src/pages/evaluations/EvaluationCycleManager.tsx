import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ListChecks, ShieldCheck, Sparkles, Target, Users, X } from "lucide-react";
import { Link } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import PageLoader from "@/components/ui/page-loader";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import evaluationsAPI, {
  type AssignEvaluatorsPayload,
  type EvaluationRelationship,
  type EvaluationTemplate,
  type KpiLibraryItem,
  type TeamDirectoryPerson,
} from "@/lib/api/evaluations";
import {
  buildQuestionsFromKpis,
  buildTemplateSections,
  summarizeEvaluationSections,
} from "@/lib/evaluations/workflow";
import {
  appendUniqueNumber,
  appendUniqueText,
  buildLaunchAssignments,
  cloneQuestions,
  emptyQuestion,
  formatPersonLabel,
  formatPersonName,
  normalizeText,
  relationshipCards,
  removeNumber,
  removeText,
  type DraftAssignment,
  type DraftQuestion,
  type ManualEvaluatorMap,
  type PeerAssignmentMode,
} from "./evaluation-cycle-manager.helpers";

type SelectedKpi = { kpiId: number; weight: number };

const today = new Date().toISOString().slice(0, 10);
const BUILT_IN_TEMPLATE_KEY = "builtin";

const addDaysToIso = (baseIso: string, days: number) => {
  const base = new Date(`${baseIso}T00:00:00`);
  if (Number.isNaN(base.getTime())) return baseIso;
  base.setDate(base.getDate() + Math.max(0, days));
  return base.toISOString().slice(0, 10);
};

const defaultEndDate = addDaysToIso(today, 90);
const defaultDueDate = addDaysToIso(today, 14);

const BUILT_IN_TEMPLATE: EvaluationTemplate = {
  id: 0,
  name: "Built-in Streamlined 360",
  description: "Default AssessTeam-style questionnaire used when no saved template is selected.",
  isDefault: true,
  templateType: "streamlined_360",
  questions: [
    {
      id: 1,
      text: "Demonstrates strong technical competence in current responsibilities.",
      category: "competency",
      weight: 1.2,
      order: 1,
    },
    {
      id: 2,
      text: "Collaborates effectively with colleagues and stakeholders.",
      category: "behavior",
      weight: 1.1,
      order: 2,
    },
    {
      id: 3,
      text: "Consistently delivers against agreed goals and commitments.",
      category: "goal",
      weight: 1.3,
      order: 3,
    },
    {
      id: 4,
      text: "Reflects the firm's values and professional culture.",
      category: "culture",
      weight: 1,
      order: 4,
    },
    {
      id: 5,
      text: "Shows initiative and ownership when challenges arise.",
      category: "behavior",
      weight: 1,
      order: 5,
    },
  ],
};

export default function EvaluationCycleManager() {
  const { hasModuleAccess, hasRole } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const canManageCycles = hasRole("hr") || hasRole("manager") || hasRole("super_admin");
  const canAccessKpiLibrary = hasModuleAccess("kpis");

  const [cycleForm, setCycleForm] = useState({
    title: "",
    description: "",
    cycleType: "annual",
    startDate: today,
    endDate: defaultEndDate,
    dueMode: "days",
    dueDate: defaultDueDate,
    dueInDays: "14",
    departmentId: "",
  });
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string>(BUILT_IN_TEMPLATE_KEY);
  const [customizeQuestions, setCustomizeQuestions] = useState(false);
  const [questionDrafts, setQuestionDrafts] = useState<DraftQuestion[]>(
    cloneQuestions(BUILT_IN_TEMPLATE.questions)
  );
  const [includeKpiResultAreas, setIncludeKpiResultAreas] = useState(false);
  const [selectedKpis, setSelectedKpis] = useState<SelectedKpi[]>([]);
  const [selectedEvaluateeIds, setSelectedEvaluateeIds] = useState<number[]>([]);
  const [selectedTargetDepartmentIds, setSelectedTargetDepartmentIds] = useState<number[]>([]);
  const [selectedJobTitles, setSelectedJobTitles] = useState<string[]>([]);
  const [pendingEvaluateeId, setPendingEvaluateeId] = useState("");
  const [pendingDepartmentId, setPendingDepartmentId] = useState("");
  const [pendingJobTitle, setPendingJobTitle] = useState("");
  const [pendingKpiId, setPendingKpiId] = useState("");
  const [selectedCycleId, setSelectedCycleId] = useState<string>("");
  const [stagedAssignments, setStagedAssignments] = useState<DraftAssignment[]>([]);
  const [manualEvaluators, setManualEvaluators] = useState<ManualEvaluatorMap>({
    self: [],
    manager: [],
    peer: [],
    subordinate: [],
  });
  const [pendingManualEvaluator, setPendingManualEvaluator] = useState<
    Record<EvaluationRelationship, string>
  >({
    self: "",
    manager: "",
    peer: "",
    subordinate: "",
  });
  const [specificSignatureIds, setSpecificSignatureIds] = useState<number[]>([]);
  const [pendingSignatureProfileId, setPendingSignatureProfileId] = useState("");
  const [launchOptions, setLaunchOptions] = useState({
    enableSelfEvaluation: false,
    enablePeerEvaluation: false,
    enableUpwardEvaluation: false,
    enableDownwardEvaluation: true,
    peerAssignmentMode: "department" as PeerAssignmentMode,
    peersPerPerson: "2",
    processAnonymously: false,
    hideFromDashboard: false,
    cancelIfPastDue: true,
    remindersEnabled: true,
    reminderCadence: "weekly",
    requireAllKpiAnswers: false,
    excludeFromScore: false,
    requireEvaluatorSignature: false,
    requireEvaluateeSignature: false,
    sendSignatureRequestToManagers: false,
    sendSignatureRequestToDownwardEvaluators: false,
  });

  const cyclesQuery = useQuery({
    queryKey: ["evaluation-cycles"],
    queryFn: evaluationsAPI.getMyCycles,
    enabled: canManageCycles,
  });

  const peopleQuery = useQuery({
    queryKey: ["evaluation-people"],
    queryFn: evaluationsAPI.getAssignableEmployees,
    enabled: canManageCycles,
  });

  const departmentsQuery = useQuery({
    queryKey: ["evaluation-departments"],
    queryFn: evaluationsAPI.getDepartments,
    enabled: canManageCycles,
  });

  const templatesQuery = useQuery({
    queryKey: ["evaluation-templates"],
    queryFn: evaluationsAPI.getTemplates,
    enabled: canManageCycles,
  });

  const kpiLibraryQuery = useQuery({
    queryKey: ["evaluation-kpi-library"],
    queryFn: evaluationsAPI.getKpiLibrary,
    enabled: canManageCycles && canAccessKpiLibrary,
  });

  const selectedTemplate = useMemo(() => {
    if (selectedTemplateKey === BUILT_IN_TEMPLATE_KEY) {
      return BUILT_IN_TEMPLATE;
    }

    return (
      templatesQuery.data?.find((template) => String(template.id) === selectedTemplateKey) ||
      BUILT_IN_TEMPLATE
    );
  }, [selectedTemplateKey, templatesQuery.data]);

  useEffect(() => {
    setQuestionDrafts(cloneQuestions(selectedTemplate.questions));
  }, [selectedTemplate]);

  const people = peopleQuery.data || [];
  const peopleById = useMemo(
    () => new Map(people.map((person) => [person.id, person] as const)),
    [people]
  );

  const availableJobTitles = useMemo(
    () =>
      Array.from(
        new Set(
          people
            .map((person) => String(person.positionTitle || "").trim())
            .filter(Boolean)
        )
      ).sort((left, right) => left.localeCompare(right)),
    [people]
  );

  const selectedTargetDepartmentSet = useMemo(() => {
    if (selectedTargetDepartmentIds.length > 0) {
      return new Set(selectedTargetDepartmentIds);
    }
    return cycleForm.departmentId ? new Set([Number(cycleForm.departmentId)]) : new Set<number>();
  }, [cycleForm.departmentId, selectedTargetDepartmentIds]);

  const targetEvaluatees = useMemo(() => {
    const targets = new Map<number, TeamDirectoryPerson>();

    selectedEvaluateeIds.forEach((id) => {
      const person = peopleById.get(id);
      if (person) targets.set(id, person);
    });

    people.forEach((person) => {
      const matchesDepartment =
        selectedTargetDepartmentSet.size > 0 &&
        person.department?.id &&
        selectedTargetDepartmentSet.has(person.department.id);
      const matchesJobTitle =
        selectedJobTitles.length > 0 &&
        selectedJobTitles.some(
          (jobTitle) => normalizeText(jobTitle) === normalizeText(person.positionTitle)
        );

      if (matchesDepartment || matchesJobTitle) {
        targets.set(person.id, person);
      }
    });

    return Array.from(targets.values()).sort((left, right) =>
      formatPersonName(left).localeCompare(formatPersonName(right))
    );
  }, [people, peopleById, selectedEvaluateeIds, selectedJobTitles, selectedTargetDepartmentSet]);

  const enabledRelationships = useMemo(
    () =>
      relationshipCards
        .filter((relationship) => {
          if (relationship.value === "manager") return launchOptions.enableDownwardEvaluation;
          if (relationship.value === "peer") return launchOptions.enablePeerEvaluation;
          if (relationship.value === "subordinate") return launchOptions.enableUpwardEvaluation;
          return launchOptions.enableSelfEvaluation;
        })
        .map((relationship) => relationship.value),
    [launchOptions]
  );

  const enabledWorkflowTypes = useMemo(
    () =>
      relationshipCards
        .filter((relationship) => enabledRelationships.includes(relationship.value))
        .map((relationship) => relationship.workflowType),
    [enabledRelationships]
  );

  const questionTemplateSource = useMemo(
    () =>
      customizeQuestions
        ? {
            ...selectedTemplate,
            questions: questionDrafts.map((question, index) => ({
              ...question,
              order: index + 1,
            })),
          }
        : selectedTemplate,
    [customizeQuestions, questionDrafts, selectedTemplate]
  );

  const templateSections = useMemo(
    () =>
      buildTemplateSections(
        questionTemplateSource,
        enabledWorkflowTypes.length > 0 ? enabledWorkflowTypes : ["manager"]
      ),
    [enabledWorkflowTypes, questionTemplateSource]
  );

  const kpiSections = useMemo(() => {
    if (!includeKpiResultAreas || !canAccessKpiLibrary) return [];
    return buildQuestionsFromKpis(
      selectedKpis.map((selection) => ({
        kpi_id: String(selection.kpiId),
        weight: selection.weight,
      })),
      (kpiLibraryQuery.data || []).map((kpi) => ({
        id: String(kpi.id),
        name: kpi.name,
        category: kpi.category || null,
      }))
    );
  }, [canAccessKpiLibrary, includeKpiResultAreas, kpiLibraryQuery.data, selectedKpis]);

  const generatedSections = useMemo(() => {
    const sections = [...templateSections, ...kpiSections];
    if (sections.length > 0) return sections;
    return buildTemplateSections(
      BUILT_IN_TEMPLATE,
      enabledWorkflowTypes.length > 0 ? enabledWorkflowTypes : ["manager"]
    );
  }, [enabledWorkflowTypes, kpiSections, templateSections]);

  const questionSummary = useMemo(
    () => summarizeEvaluationSections(generatedSections),
    [generatedSections]
  );

  const totalQuestionWeight = useMemo(
    () =>
      generatedSections.reduce(
        (sum, section) =>
          sum +
          section.items.reduce(
            (sectionSum, item) => sectionSum + Number(item.weight || 0),
            0
          ),
        0
      ),
    [generatedSections]
  );

  const computedDueDate = useMemo(() => {
    if (cycleForm.dueMode === "date") {
      return cycleForm.dueDate || cycleForm.endDate || today;
    }

    const dueInDays = Math.max(1, Number(cycleForm.dueInDays || 0) || 14);
    const baseDate = cycleForm.startDate || today;
    return addDaysToIso(baseDate, dueInDays);
  }, [cycleForm.dueDate, cycleForm.dueInDays, cycleForm.dueMode, cycleForm.endDate, cycleForm.startDate]);

  const suggestedAssignments = useMemo(
    () =>
      buildLaunchAssignments({
        evaluatees: targetEvaluatees,
        people,
        manualEvaluators,
        enabledRelationships,
        dueDate: computedDueDate,
        peerAssignmentMode: launchOptions.peerAssignmentMode,
        peersPerPerson: Math.max(1, Number(launchOptions.peersPerPerson || 0) || 2),
      }),
    [
      computedDueDate,
      enabledRelationships,
      launchOptions.peerAssignmentMode,
      launchOptions.peersPerPerson,
      manualEvaluators,
      people,
      targetEvaluatees,
    ]
  );

  const assignmentBreakdown = useMemo(
    () =>
      stagedAssignments.reduce<Record<string, number>>((acc, assignment) => {
        acc[assignment.relationship] = (acc[assignment.relationship] || 0) + 1;
        return acc;
      }, {}),
    [stagedAssignments]
  );

  const createCycleMutation = useMutation({
    mutationFn: evaluationsAPI.createCycle,
    onSuccess: async (cycle) => {
      await queryClient.invalidateQueries({ queryKey: ["evaluation-cycles"] });
      setSelectedCycleId(String(cycle.id));
      setStagedAssignments(suggestedAssignments);
      toast({
        title: "Cycle draft created",
        description:
          suggestedAssignments.length > 0
            ? "A launch plan has been prepared. Review it, then publish assignments."
            : "Cycle draft saved. Select people and build a launch plan before publishing.",
      });
    },
  });

  const assignMutation = useMutation({
    mutationFn: ({ cycleId, payload }: { cycleId: number; payload: AssignEvaluatorsPayload }) =>
      evaluationsAPI.assignEvaluators(cycleId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["evaluation-cycles"] });
      toast({
        title: "Assignments published",
        description: "The evaluation cycle is now live for the selected evaluators.",
      });
      setStagedAssignments([]);
    },
  });

  if (!canManageCycles) {
    return (
      <DashboardLayout>
        <div className="text-sm text-muted-foreground">
          This workspace is available to HR, managers, and administrators.
        </div>
      </DashboardLayout>
    );
  }

  if (
    cyclesQuery.isLoading ||
    peopleQuery.isLoading ||
    departmentsQuery.isLoading ||
    templatesQuery.isLoading ||
    (canAccessKpiLibrary && kpiLibraryQuery.isLoading)
  ) {
    return (
      <DashboardLayout>
        <PageLoader message="Loading launch workspace..." minHeightClassName="min-h-[50vh]" />
      </DashboardLayout>
    );
  }

  const handleQuestionChange = (
    index: number,
    field: keyof DraftQuestion,
    value: string | number
  ) => {
    setQuestionDrafts((current) =>
      current.map((question, currentIndex) =>
        currentIndex === index
          ? {
              ...question,
              [field]: field === "weight" || field === "order" ? Number(value) || 0 : value,
            }
          : question
      )
    );
  };

  const addSelectedEvaluatee = () => {
    const profileId = Number(pendingEvaluateeId);
    if (!profileId) return;
    setSelectedEvaluateeIds((current) => appendUniqueNumber(current, profileId));
    setPendingEvaluateeId("");
  };

  const addSelectedDepartment = () => {
    const departmentId = Number(pendingDepartmentId);
    if (!departmentId) return;
    setSelectedTargetDepartmentIds((current) => appendUniqueNumber(current, departmentId));
    setPendingDepartmentId("");
  };

  const addSelectedJobTitle = () => {
    if (!pendingJobTitle.trim()) return;
    setSelectedJobTitles((current) => appendUniqueText(current, pendingJobTitle));
    setPendingJobTitle("");
  };

  const addManualEvaluator = (relationship: EvaluationRelationship) => {
    const evaluatorId = Number(pendingManualEvaluator[relationship]);
    if (!evaluatorId) return;
    setManualEvaluators((current) => ({
      ...current,
      [relationship]: appendUniqueNumber(current[relationship], evaluatorId),
    }));
    setPendingManualEvaluator((current) => ({
      ...current,
      [relationship]: "",
    }));
  };

  const addSelectedKpi = () => {
    const kpiId = Number(pendingKpiId);
    if (!kpiId) return;
    setSelectedKpis((current) =>
      current.some((entry) => entry.kpiId === kpiId)
        ? current
        : [...current, { kpiId, weight: 1 }]
    );
    setPendingKpiId("");
  };

  const addSignatureRecipient = () => {
    const profileId = Number(pendingSignatureProfileId);
    if (!profileId) return;
    setSpecificSignatureIds((current) => appendUniqueNumber(current, profileId));
    setPendingSignatureProfileId("");
  };

  const handleCreateCycle = () => {
    if (!cycleForm.title.trim()) {
      toast({ title: "Cycle title is required", variant: "destructive" });
      return;
    }

    if (new Date(cycleForm.endDate) <= new Date(cycleForm.startDate)) {
      toast({ title: "End date must be after the start date", variant: "destructive" });
      return;
    }

    const customQuestionCount = questionDrafts.filter((question) => question.text.trim()).length;
    if (customizeQuestions && customQuestionCount === 0 && !includeKpiResultAreas) {
      toast({ title: "Add at least one custom result area", variant: "destructive" });
      return;
    }

    if (questionSummary.itemCount === 0) {
      toast({ title: "Add at least one result area or question", variant: "destructive" });
      return;
    }

    createCycleMutation.mutate({
      title: cycleForm.title.trim(),
      description: cycleForm.description.trim() || undefined,
      cycleType: cycleForm.cycleType as any,
      startDate: cycleForm.startDate,
      endDate: cycleForm.endDate,
      dueDate: computedDueDate,
      departmentId: cycleForm.departmentId ? Number(cycleForm.departmentId) : undefined,
      templateId:
        selectedTemplateKey !== BUILT_IN_TEMPLATE_KEY ? Number(selectedTemplateKey) : undefined,
      questions:
        customizeQuestions || includeKpiResultAreas
          ? (generatedSections as unknown as Array<Record<string, unknown>>)
          : undefined,
      enableSelfEvaluation: launchOptions.enableSelfEvaluation,
      enablePeerEvaluation: launchOptions.enablePeerEvaluation,
      enableUpwardEvaluation: launchOptions.enableUpwardEvaluation,
      enableDownwardEvaluation: launchOptions.enableDownwardEvaluation,
      processAnonymously: launchOptions.processAnonymously,
      hideFromDashboard: launchOptions.hideFromDashboard,
      excludeFromScore: launchOptions.excludeFromScore,
      requireEvaluatorSignature: launchOptions.requireEvaluatorSignature,
      requireEvaluateeSignature: launchOptions.requireEvaluateeSignature,
      scoringConfig: {
        cancelIfPastDue: launchOptions.cancelIfPastDue,
        requireAllKpis: launchOptions.requireAllKpiAnswers,
        peerAssignmentMode: launchOptions.peerAssignmentMode,
        peersPerPerson: Math.max(1, Number(launchOptions.peersPerPerson || 0) || 2),
        audience: {
          evaluateeProfileIds: selectedEvaluateeIds,
          departmentIds: Array.from(selectedTargetDepartmentSet.values()),
          jobTitles: selectedJobTitles,
        },
        resultAreas: {
          includeKpis: includeKpiResultAreas,
          selectedKpiIds: selectedKpis.map((selection) => selection.kpiId),
        },
        manualEvaluatorProfileIds: manualEvaluators,
        signatureRequests: {
          toManagers: launchOptions.sendSignatureRequestToManagers,
          toDownwardEvaluators: launchOptions.sendSignatureRequestToDownwardEvaluators,
          specificProfileIds: specificSignatureIds,
        },
        evaluationWorkflow: {
          remindersEnabled: launchOptions.remindersEnabled,
          reminderCadence: launchOptions.reminderCadence,
          launchSummary: `${targetEvaluatees.length} evaluatee(s), ${enabledRelationships.length} evaluator group(s), ${questionSummary.itemCount} result areas`,
          evaluatorMix: {
            self: launchOptions.enableSelfEvaluation,
            manager: launchOptions.enableDownwardEvaluation,
            peer: launchOptions.enablePeerEvaluation,
            direct_report: launchOptions.enableUpwardEvaluation,
          },
          schedules: enabledWorkflowTypes.map((evaluatorType) => ({
            evaluatorType,
            dueAt: computedDueDate,
          })),
        },
      },
    });
  };

  const handleBuildLaunchPlan = () => {
    if (targetEvaluatees.length === 0) {
      toast({
        title: "Select people to evaluate",
        description: "Pick individuals, departments, or job titles before building the launch plan.",
        variant: "destructive",
      });
      return;
    }

    if (enabledRelationships.length === 0) {
      toast({
        title: "Select at least one evaluator group",
        variant: "destructive",
      });
      return;
    }

    if (suggestedAssignments.length === 0) {
      toast({
        title: "No assignments could be generated",
        description:
          "Check the selected evaluator groups, peer rules, or manager relationships for the chosen people.",
        variant: "destructive",
      });
      return;
    }

    setStagedAssignments(suggestedAssignments);
    toast({
      title: "Launch plan prepared",
      description: `${suggestedAssignments.length} evaluator assignments are staged and ready to publish.`,
    });
  };

  const handlePublish = () => {
    if (!selectedCycleId) {
      toast({ title: "Create or select a cycle first", variant: "destructive" });
      return;
    }

    if (stagedAssignments.length === 0) {
      toast({
        title: "Build a launch plan first",
        description: "Use the launch preview to stage assignments before publishing.",
        variant: "destructive",
      });
      return;
    }

    assignMutation.mutate({
      cycleId: Number(selectedCycleId),
      payload: { assignments: stagedAssignments },
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">AssessTEAM-style</Badge>
            <Badge variant="secondary">Create</Badge>
            <Badge variant="secondary">Launch</Badge>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Create and Launch Evaluation</h1>
          <p className="max-w-4xl text-sm text-muted-foreground">
            Build the evaluation like a real rollout workspace: choose who is evaluated, define the
            evaluator mix, decide the result areas, configure rollout rules, then publish the full
            launch plan.
          </p>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <CardTitle>1. Evaluation Setup</CardTitle>
                </div>
                <CardDescription>
                  Configure the cycle dates and the evaluation definition that sits behind it.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="cycle-title">Title</Label>
                    <Input
                      id="cycle-title"
                      data-testid="evaluation-cycle-title"
                      value={cycleForm.title}
                      onChange={(event) =>
                        setCycleForm((current) => ({ ...current, title: event.target.value }))
                      }
                      placeholder="Q3 Audit Performance Review 2026"
                    />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="cycle-description">Description</Label>
                    <Textarea
                      id="cycle-description"
                      value={cycleForm.description}
                      onChange={(event) =>
                        setCycleForm((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                      placeholder="Explain the purpose, population, and scope of this evaluation."
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Cycle Type</Label>
                    <Select
                      value={cycleForm.cycleType}
                      onValueChange={(value) =>
                        setCycleForm((current) => ({ ...current, cycleType: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="annual">Annual</SelectItem>
                        <SelectItem value="mid_year">Mid-Year</SelectItem>
                        <SelectItem value="quarterly">Quarterly</SelectItem>
                        <SelectItem value="probation">Probation</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Department Scope</Label>
                    <Select
                      value={cycleForm.departmentId || "all"}
                      onValueChange={(value) =>
                        setCycleForm((current) => ({
                          ...current,
                          departmentId: value === "all" ? "" : value,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Departments</SelectItem>
                        {departmentsQuery.data?.map((department) => (
                          <SelectItem key={department.id} value={String(department.id)}>
                            {department.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="cycle-start">Start Date</Label>
                    <Input
                      id="cycle-start"
                      type="date"
                      value={cycleForm.startDate}
                      onChange={(event) =>
                        setCycleForm((current) => ({ ...current, startDate: event.target.value }))
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="cycle-end">End Date</Label>
                    <Input
                      id="cycle-end"
                      type="date"
                      value={cycleForm.endDate}
                      onChange={(event) =>
                        setCycleForm((current) => ({ ...current, endDate: event.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-4 rounded-2xl border border-border/70 bg-muted/30 p-4 md:grid-cols-[170px_1fr]">
                  <div className="space-y-2">
                    <Label>Due Setup</Label>
                    <Select
                      value={cycleForm.dueMode}
                      onValueChange={(value) =>
                        setCycleForm((current) => ({ ...current, dueMode: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="days">Due in days</SelectItem>
                        <SelectItem value="date">Specific due date</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {cycleForm.dueMode === "days" ? (
                    <div className="grid gap-4 md:grid-cols-[180px_1fr]">
                      <div className="space-y-2">
                        <Label htmlFor="due-in-days">Due In</Label>
                        <Input
                          id="due-in-days"
                          type="number"
                          min="1"
                          value={cycleForm.dueInDays}
                          onChange={(event) =>
                            setCycleForm((current) => ({
                              ...current,
                              dueInDays: event.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Computed Due Date</Label>
                        <div className="flex h-10 items-center rounded-md border bg-background px-3 text-sm">
                          {computedDueDate}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label htmlFor="due-date">Due Date</Label>
                      <Input
                        id="due-date"
                        type="date"
                        value={cycleForm.dueDate}
                        onChange={(event) =>
                          setCycleForm((current) => ({
                            ...current,
                            dueDate: event.target.value,
                          }))
                        }
                      />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-emerald-200/70 bg-emerald-50/30">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-emerald-600" />
                  <CardTitle>2. Persons To Be Evaluated</CardTitle>
                </div>
                <CardDescription>
                  Build the target population by person, department, or job title.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Select person(s)</Label>
                    <Select value={pendingEvaluateeId || undefined} onValueChange={setPendingEvaluateeId}>
                      <SelectTrigger data-testid="evaluation-select-person-trigger">
                        <SelectValue placeholder="Choose person" />
                      </SelectTrigger>
                      <SelectContent>
                        {people.map((person) => (
                          <SelectItem key={person.id} value={String(person.id)}>
                            {formatPersonLabel(person)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={addSelectedEvaluatee}
                      data-testid="evaluation-add-person"
                    >
                      Add Person
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <Label>Select team(s)</Label>
                    <Select value={pendingDepartmentId || undefined} onValueChange={setPendingDepartmentId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose department" />
                      </SelectTrigger>
                      <SelectContent>
                        {departmentsQuery.data?.map((department) => (
                          <SelectItem key={department.id} value={String(department.id)}>
                            {department.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button type="button" variant="outline" className="w-full" onClick={addSelectedDepartment}>
                      Add Team
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <Label>Select job title(s)</Label>
                    <Select value={pendingJobTitle || undefined} onValueChange={setPendingJobTitle}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose job title" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableJobTitles.map((title) => (
                          <SelectItem key={title} value={title}>
                            {title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button type="button" variant="outline" className="w-full" onClick={addSelectedJobTitle}>
                      Add Job Title
                    </Button>
                  </div>
                </div>

                <div className="grid gap-3 lg:grid-cols-3">
                  <div className="rounded-xl border bg-background p-4">
                    <div className="text-sm font-medium">Direct selections</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedEvaluateeIds.length > 0 ? (
                        selectedEvaluateeIds.map((profileId) => (
                          <Badge key={profileId} variant="secondary" className="gap-1">
                            {formatPersonName(peopleById.get(profileId))}
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedEvaluateeIds((current) => removeNumber(current, profileId))
                              }
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))
                      ) : (
                        <div className="text-sm text-muted-foreground">No people added yet.</div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border bg-background p-4">
                    <div className="text-sm font-medium">Team filters</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedTargetDepartmentIds.length > 0 ? (
                        selectedTargetDepartmentIds.map((departmentId) => (
                          <Badge key={departmentId} variant="secondary" className="gap-1">
                            {departmentsQuery.data?.find((department) => department.id === departmentId)?.name ||
                              `Department ${departmentId}`}
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedTargetDepartmentIds((current) =>
                                  removeNumber(current, departmentId)
                                )
                              }
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))
                      ) : cycleForm.departmentId ? (
                        <div className="text-sm text-muted-foreground">
                          Using the cycle department scope by default.
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground">No team filters added.</div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border bg-background p-4">
                    <div className="text-sm font-medium">Job title filters</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedJobTitles.length > 0 ? (
                        selectedJobTitles.map((jobTitle) => (
                          <Badge key={jobTitle} variant="secondary" className="gap-1">
                            {jobTitle}
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedJobTitles((current) => removeText(current, jobTitle))
                              }
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))
                      ) : (
                        <div className="text-sm text-muted-foreground">No job titles added.</div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border bg-background p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{targetEvaluatees.length} people in launch scope</Badge>
                    {cycleForm.departmentId && selectedTargetDepartmentIds.length === 0 && (
                      <Badge variant="outline">Uses cycle department scope</Badge>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {targetEvaluatees.length > 0 ? (
                      targetEvaluatees.map((person) => (
                        <Badge key={person.id} variant="outline">
                          {formatPersonLabel(person)}
                        </Badge>
                      ))
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        Add people, departments, or job titles to define the audience.
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-emerald-200/70 bg-emerald-50/30">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-emerald-600" />
                  <CardTitle>3. Evaluators</CardTitle>
                </div>
                <CardDescription>
                  Choose which evaluator groups are included and optionally override the auto-assigned people.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  {relationshipCards.map((relationship) => {
                    const checked =
                      relationship.value === "manager"
                        ? launchOptions.enableDownwardEvaluation
                        : relationship.value === "peer"
                          ? launchOptions.enablePeerEvaluation
                          : relationship.value === "subordinate"
                            ? launchOptions.enableUpwardEvaluation
                            : launchOptions.enableSelfEvaluation;

                    return (
                      <div
                        key={relationship.value}
                        className="rounded-xl border bg-background p-4 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-medium">{relationship.title}</div>
                            <div className="text-sm text-muted-foreground">
                              {relationship.description}
                            </div>
                          </div>
                          <Switch
                            checked={checked}
                            onCheckedChange={(value) => {
                              if (relationship.value === "manager") {
                                setLaunchOptions((current) => ({
                                  ...current,
                                  enableDownwardEvaluation: value,
                                }));
                                return;
                              }
                              if (relationship.value === "peer") {
                                setLaunchOptions((current) => ({
                                  ...current,
                                  enablePeerEvaluation: value,
                                }));
                                return;
                              }
                              if (relationship.value === "subordinate") {
                                setLaunchOptions((current) => ({
                                  ...current,
                                  enableUpwardEvaluation: value,
                                }));
                                return;
                              }
                              setLaunchOptions((current) => ({
                                ...current,
                                enableSelfEvaluation: value,
                              }));
                            }}
                          />
                        </div>

                        {relationship.value !== "self" && checked && (
                          <div className="mt-4 space-y-3">
                            <div className="space-y-2">
                              <Label>Manual evaluator override</Label>
                              <div className="flex gap-2">
                                <Select
                                  value={pendingManualEvaluator[relationship.value] || undefined}
                                  onValueChange={(value) =>
                                    setPendingManualEvaluator((current) => ({
                                      ...current,
                                      [relationship.value]: value,
                                    }))
                                  }
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Choose person" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {people.map((person) => (
                                      <SelectItem key={person.id} value={String(person.id)}>
                                        {formatPersonLabel(person)}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => addManualEvaluator(relationship.value)}
                                >
                                  Add
                                </Button>
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              {manualEvaluators[relationship.value].length > 0 ? (
                                manualEvaluators[relationship.value].map((profileId) => (
                                  <Badge key={profileId} variant="secondary" className="gap-1">
                                    {formatPersonName(peopleById.get(profileId))}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setManualEvaluators((current) => ({
                                          ...current,
                                          [relationship.value]: removeNumber(
                                            current[relationship.value],
                                            profileId
                                          ),
                                        }))
                                      }
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </Badge>
                                ))
                              ) : (
                                <div className="text-sm text-muted-foreground">
                                  If left empty, the system will auto-select this evaluator group.
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {launchOptions.enablePeerEvaluation && (
                  <div className="grid gap-4 rounded-xl border bg-background p-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Peer assignment mode</Label>
                      <Select
                        value={launchOptions.peerAssignmentMode}
                        onValueChange={(value) =>
                          setLaunchOptions((current) => ({
                            ...current,
                            peerAssignmentMode: value as PeerAssignmentMode,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="department">Same department</SelectItem>
                          <SelectItem value="manager">Same manager</SelectItem>
                          <SelectItem value="any">Any eligible peer</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="peers-per-person">Peers per person</Label>
                      <Input
                        id="peers-per-person"
                        type="number"
                        min="1"
                        max="5"
                        value={launchOptions.peersPerPerson}
                        onChange={(event) =>
                          setLaunchOptions((current) => ({
                            ...current,
                            peersPerPerson: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <ListChecks className="h-5 w-5 text-primary" />
                  <CardTitle>4. Result Areas and Questionnaire</CardTitle>
                </div>
                <CardDescription>
                  Start from a template, optionally customize the prompts, and include KPI result areas.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 md:grid-cols-[1fr_auto]">
                  <div className="space-y-2">
                    <Label>Template</Label>
                    <Select value={selectedTemplateKey} onValueChange={setSelectedTemplateKey}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={BUILT_IN_TEMPLATE_KEY}>
                          {BUILT_IN_TEMPLATE.name}
                        </SelectItem>
                        {templatesQuery.data?.map((template) => (
                          <SelectItem key={template.id} value={String(template.id)}>
                            {template.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end justify-end gap-3">
                    <Label htmlFor="customize-questions" className="text-sm">
                      Customize questions
                    </Label>
                    <Switch
                      id="customize-questions"
                      checked={customizeQuestions}
                      onCheckedChange={setCustomizeQuestions}
                    />
                  </div>
                </div>

                <div className="rounded-xl border bg-muted/40 p-4">
                  <div className="font-medium">{selectedTemplate.name}</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {selectedTemplate.description || "No description provided."}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge variant="outline">
                      {selectedTemplate.questions.length} template questions
                    </Badge>
                    <Badge variant="outline">{questionSummary.itemCount} launch items</Badge>
                    <Badge variant="outline">{totalQuestionWeight.toFixed(1)} total weight</Badge>
                  </div>
                </div>

                {customizeQuestions ? (
                  <div className="space-y-3">
                    {questionDrafts.map((question, index) => (
                      <div key={`${index}-${question.order}`} className="rounded-xl border p-4">
                        <div className="grid gap-3 md:grid-cols-[1fr_180px_120px_auto]">
                          <div className="space-y-2">
                            <Label>Result area {index + 1}</Label>
                            <Input
                              value={question.text}
                              onChange={(event) =>
                                handleQuestionChange(index, "text", event.target.value)
                              }
                              placeholder="Enter the result area or competency"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Category</Label>
                            <Select
                              value={question.category}
                              onValueChange={(value) =>
                                handleQuestionChange(index, "category", value)
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="competency">Competency</SelectItem>
                                <SelectItem value="behavior">Behavior</SelectItem>
                                <SelectItem value="goal">Goal</SelectItem>
                                <SelectItem value="culture">Culture</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>Weight</Label>
                            <Input
                              type="number"
                              min="0.1"
                              step="0.1"
                              value={question.weight}
                              onChange={(event) =>
                                handleQuestionChange(index, "weight", event.target.value)
                              }
                            />
                          </div>
                          <div className="flex items-end">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() =>
                                setQuestionDrafts((current) =>
                                  current.length === 1
                                    ? current
                                    : current
                                        .filter((_, currentIndex) => currentIndex !== index)
                                        .map((item, itemIndex) => ({
                                          ...item,
                                          order: itemIndex + 1,
                                        }))
                                )
                              }
                            >
                              Remove
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}

                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        setQuestionDrafts((current) => [...current, emptyQuestion(current.length + 1)])
                      }
                    >
                      Add Result Area
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedTemplate.questions.map((question) => (
                      <div
                        key={`${selectedTemplate.id}-${question.order}`}
                        className="flex flex-col gap-2 rounded-xl border px-4 py-3 md:flex-row md:items-center md:justify-between"
                      >
                        <div>
                          <div className="font-medium">{question.text}</div>
                          <div className="text-sm text-muted-foreground capitalize">
                            {question.category} question
                          </div>
                        </div>
                        <Badge variant="outline">Weight {question.weight}</Badge>
                      </div>
                    ))}
                  </div>
                )}

                <Separator />

                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="font-medium">Include KPI / result areas</div>
                      <div className="text-sm text-muted-foreground">
                        Pull KPI result areas into the evaluation launch plan.
                      </div>
                    </div>
                    <Switch
                      checked={includeKpiResultAreas}
                      disabled={!canAccessKpiLibrary}
                      onCheckedChange={setIncludeKpiResultAreas}
                    />
                  </div>

                  {includeKpiResultAreas ? (
                    canAccessKpiLibrary ? (
                      <div className="space-y-4 rounded-xl border bg-background p-4">
                        <div className="flex gap-2">
                          <Select value={pendingKpiId || undefined} onValueChange={setPendingKpiId}>
                            <SelectTrigger>
                              <SelectValue placeholder="Choose KPI / result area" />
                            </SelectTrigger>
                            <SelectContent>
                              {(kpiLibraryQuery.data || []).map((kpi: KpiLibraryItem) => (
                                <SelectItem key={kpi.id} value={String(kpi.id)}>
                                  {kpi.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button type="button" variant="outline" onClick={addSelectedKpi}>
                            Include
                          </Button>
                        </div>

                        {selectedKpis.length > 0 ? (
                          <div className="space-y-3">
                            {selectedKpis.map((selection) => {
                              const kpi = (kpiLibraryQuery.data || []).find(
                                (item) => item.id === selection.kpiId
                              );
                              return (
                                <div
                                  key={selection.kpiId}
                                  className="grid gap-3 rounded-lg border p-3 md:grid-cols-[1fr_120px_auto]"
                                >
                                  <div>
                                    <div className="font-medium">{kpi?.name || `KPI ${selection.kpiId}`}</div>
                                    <div className="text-sm text-muted-foreground">
                                      {kpi?.category || "Result area"}
                                    </div>
                                  </div>
                                  <div className="space-y-2">
                                    <Label>Weight</Label>
                                    <Input
                                      type="number"
                                      min="0.1"
                                      step="0.1"
                                      value={selection.weight}
                                      onChange={(event) =>
                                        setSelectedKpis((current) =>
                                          current.map((item) =>
                                            item.kpiId === selection.kpiId
                                              ? {
                                                  ...item,
                                                  weight: Number(event.target.value) || 1,
                                                }
                                              : item
                                          )
                                        )
                                      }
                                    />
                                  </div>
                                  <div className="flex items-end">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      onClick={() =>
                                        setSelectedKpis((current) =>
                                          current.filter((item) => item.kpiId !== selection.kpiId)
                                        )
                                      }
                                    >
                                      Remove
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-sm text-muted-foreground">
                            No KPI result areas selected yet.
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                        KPI result areas are unavailable for this account because the KPI module is
                        not accessible.
                      </div>
                    )
                  ) : null}
                </div>

                <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
                  <div className="font-medium">Launch questionnaire preview</div>
                  {generatedSections.map((section) => (
                    <div key={section.id} className="rounded-lg border bg-background p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="font-medium">{section.title}</div>
                          {section.description && (
                            <div className="text-sm text-muted-foreground">{section.description}</div>
                          )}
                        </div>
                        <Badge variant="outline">{section.items.length} items</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4 xl:sticky xl:top-6 xl:self-start">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-5 w-5 text-primary" />
                  <CardTitle>5. Rollout Rules</CardTitle>
                </div>
                <CardDescription>
                  Configure privacy, reminders, due-date handling, and signatures.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  {[
                    {
                      key: "processAnonymously",
                      label: "Process evaluations anonymously",
                    },
                    {
                      key: "hideFromDashboard",
                      label: "Hide this evaluation from the evaluated person's dashboard",
                    },
                    {
                      key: "cancelIfPastDue",
                      label: "Cancel evaluations if not processed by the due date",
                    },
                    {
                      key: "requireAllKpiAnswers",
                      label: "Require answers on all KPI result areas",
                    },
                    {
                      key: "excludeFromScore",
                      label: "Exclude this evaluation from score computation",
                    },
                  ].map((option) => (
                    <div key={option.key} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                      <div className="text-sm">{option.label}</div>
                      <Switch
                        checked={Boolean(launchOptions[option.key as keyof typeof launchOptions])}
                        onCheckedChange={(value) =>
                          setLaunchOptions((current) => ({
                            ...current,
                            [option.key]: value,
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>

                <Separator />

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
                  <div className="space-y-2">
                    <Label>Reminder cadence</Label>
                    <Select
                      value={launchOptions.reminderCadence}
                      onValueChange={(value) =>
                        setLaunchOptions((current) => ({
                          ...current,
                          reminderCadence: value,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <div className="text-sm font-medium">Reminder emails enabled</div>
                      <div className="text-xs text-muted-foreground">
                        Applies to the evaluation workflow schedule.
                      </div>
                    </div>
                    <Switch
                      checked={launchOptions.remindersEnabled}
                      onCheckedChange={(value) =>
                        setLaunchOptions((current) => ({
                          ...current,
                          remindersEnabled: value,
                        }))
                      }
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-amber-200/70 bg-amber-50/30">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-amber-600" />
                  <CardTitle>6. Signature Options</CardTitle>
                </div>
                <CardDescription>
                  Decide whether signatures or acknowledgements are required at completion.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  {[
                    {
                      key: "requireEvaluatorSignature",
                      label: "Make evaluator signature mandatory",
                    },
                    {
                      key: "requireEvaluateeSignature",
                      label: "Request acknowledgement from the person being evaluated",
                    },
                    {
                      key: "sendSignatureRequestToManagers",
                      label: "Send a signature request to team managers",
                    },
                    {
                      key: "sendSignatureRequestToDownwardEvaluators",
                      label: "Send a signature request to downward evaluators",
                    },
                  ].map((option) => (
                    <div key={option.key} className="flex items-center justify-between gap-3 rounded-lg border bg-background p-3">
                      <div className="text-sm">{option.label}</div>
                      <Switch
                        checked={Boolean(launchOptions[option.key as keyof typeof launchOptions])}
                        onCheckedChange={(value) =>
                          setLaunchOptions((current) => ({
                            ...current,
                            [option.key]: value,
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label>Specific signature recipients</Label>
                  <div className="flex gap-2">
                    <Select
                      value={pendingSignatureProfileId || undefined}
                      onValueChange={setPendingSignatureProfileId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose person" />
                      </SelectTrigger>
                      <SelectContent>
                        {people.map((person) => (
                          <SelectItem key={person.id} value={String(person.id)}>
                            {formatPersonLabel(person)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button type="button" variant="outline" onClick={addSignatureRecipient}>
                      Add
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {specificSignatureIds.length > 0 ? (
                      specificSignatureIds.map((profileId) => (
                        <Badge key={profileId} variant="secondary" className="gap-1">
                          {formatPersonName(peopleById.get(profileId))}
                          <button
                            type="button"
                            onClick={() =>
                              setSpecificSignatureIds((current) => removeNumber(current, profileId))
                            }
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        No specific recipients selected.
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-primary/30">
              <CardHeader>
                <CardTitle>7. Launch Preview</CardTitle>
                <CardDescription>
                  Review the rollout before you create the cycle draft and publish assignments.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
                  <div className="rounded-xl border p-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      People evaluated
                    </div>
                    <div className="mt-1 text-2xl font-semibold">{targetEvaluatees.length}</div>
                  </div>
                  <div className="rounded-xl border p-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Result areas
                    </div>
                    <div className="mt-1 text-2xl font-semibold">{questionSummary.itemCount}</div>
                  </div>
                  <div className="rounded-xl border p-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Suggested assignments
                    </div>
                    <div className="mt-1 text-2xl font-semibold">{suggestedAssignments.length}</div>
                  </div>
                  <div className="rounded-xl border p-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Due date
                    </div>
                    <div className="mt-1 text-base font-semibold">{computedDueDate}</div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {enabledRelationships.length > 0 ? (
                    enabledRelationships.map((relationship) => (
                      <Badge key={relationship} variant="outline">
                        {relationship}
                      </Badge>
                    ))
                  ) : (
                    <Badge variant="outline">No evaluator group selected</Badge>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="space-y-2">
                    <Label>Select cycle draft</Label>
                    <Select value={selectedCycleId || undefined} onValueChange={setSelectedCycleId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select cycle" />
                      </SelectTrigger>
                      <SelectContent>
                        {cyclesQuery.data?.map((cycle) => (
                          <SelectItem key={cycle.id} value={String(cycle.id)}>
                            {cycle.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleBuildLaunchPlan}
                    disabled={suggestedAssignments.length === 0}
                    className="w-full"
                    data-testid="evaluation-build-launch-plan"
                  >
                    Build Launch Plan
                  </Button>
                  <Button
                    type="button"
                    onClick={handleCreateCycle}
                    disabled={createCycleMutation.isPending}
                    className="w-full"
                    data-testid="evaluation-save-cycle-draft"
                  >
                    Save Cycle Draft
                  </Button>
                  <Button
                    type="button"
                    onClick={handlePublish}
                    disabled={assignMutation.isPending}
                    className="w-full"
                    data-testid="evaluation-publish-assignments"
                  >
                    Publish Assignments
                  </Button>
                </div>

                <div className="rounded-xl border bg-muted/20 p-4">
                  <div className="text-sm font-medium">Staged assignments</div>
                  <div className="mt-3 space-y-3">
                    {stagedAssignments.length > 0 ? (
                      stagedAssignments.map((assignment, index) => (
                        <div key={`${assignment.evaluateeId}-${assignment.evaluatorId}-${index}`} className="rounded-lg border bg-background p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-medium">
                                {formatPersonName(peopleById.get(assignment.evaluateeId))} to{" "}
                                {formatPersonName(peopleById.get(assignment.evaluatorId))}
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                                <Badge variant="outline">{assignment.relationship}</Badge>
                                <span>Due {assignment.dueDate || computedDueDate}</span>
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setStagedAssignments((current) =>
                                  current.filter((_, currentIndex) => currentIndex !== index)
                                )
                              }
                            >
                              Remove
                            </Button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        No staged assignments yet. Build the launch plan to review the rollout.
                      </div>
                    )}
                  </div>
                </div>

                {Object.keys(assignmentBreakdown).length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(assignmentBreakdown).map(([relationship, count]) => (
                      <Badge key={relationship} variant="secondary">
                        {relationship}: {count}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Cycle Progress</CardTitle>
            <CardDescription>
              Track draft and live cycles, submission progress, and department completion.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {cyclesQuery.data?.length ? (
              cyclesQuery.data.map((cycle) => (
                <div key={cycle.id} className="rounded-xl border p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="font-medium">{cycle.title}</div>
                      <div className="text-sm text-muted-foreground">
                        {cycle.submittedAssignments} of {cycle.totalAssignments} submitted
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {cycle.totalAssignments > 0 && (
                        <Button asChild size="sm" variant="outline">
                          <Link to={`/evaluations/cycles/${cycle.id}/results`}>View Results</Link>
                        </Button>
                      )}
                      <Badge variant="outline">{cycle.status}</Badge>
                      <Badge>{cycle.completionPercent}%</Badge>
                    </div>
                  </div>
                  <div className="mt-4 space-y-3">
                    <Progress value={cycle.completionPercent} className="h-2" />
                    {cycle.departmentProgress.length > 0 && (
                      <div className="grid gap-3 md:grid-cols-2">
                        {cycle.departmentProgress.map((row) => (
                          <div key={`${cycle.id}-${row.departmentId ?? "none"}`} className="rounded-lg border bg-muted/20 p-3">
                            <div className="flex items-center justify-between gap-3 text-sm">
                              <span className="font-medium">{row.departmentName}</span>
                              <span className="text-muted-foreground">
                                {row.submitted}/{row.total}
                              </span>
                            </div>
                            <Progress value={row.completionPercent} className="mt-2 h-2" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-sm text-muted-foreground">No evaluation cycles created yet.</div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
