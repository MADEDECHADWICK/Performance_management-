import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Target, Users, X } from "lucide-react";
import { Link } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import PageLoader from "@/components/ui/page-loader";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import evaluationsAPI, {
  type AssignEvaluatorsPayload,
  type EvaluationRelationship,
  type TeamDirectoryPerson,
} from "@/lib/api/evaluations";
import {
  buildTemplateSections,
  summarizeEvaluationSections,
} from "@/lib/evaluations/workflow";
import {
  appendUniqueNumber,
  appendUniqueText,
  buildLaunchAssignments,
  cloneQuestions,
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
import EvaluationCycleLaunchSidebar from "./EvaluationCycleLaunchSidebar";
import EvaluationCycleQuestionnaireCard from "./EvaluationCycleQuestionnaireCard";
import {
  addDaysToIso,
  BUILT_IN_TEMPLATE,
  BUILT_IN_TEMPLATE_KEY,
  defaultCycleFormState,
  defaultLaunchOptionsState,
  today,
  type EvaluationCycleFormState,
} from "./evaluation-cycle-manager.config";

export default function EvaluationCycleManager() {
  const { hasRole } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const canManageCycles = hasRole("hr") || hasRole("manager") || hasRole("super_admin");

  const [cycleForm, setCycleForm] = useState(defaultCycleFormState);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string>(BUILT_IN_TEMPLATE_KEY);
  const [customizeQuestions, setCustomizeQuestions] = useState(false);
  const [questionDrafts, setQuestionDrafts] = useState<DraftQuestion[]>(
    cloneQuestions(BUILT_IN_TEMPLATE.questions)
  );
  const [selectedEvaluateeIds, setSelectedEvaluateeIds] = useState<number[]>([]);
  const [selectedTargetDepartmentIds, setSelectedTargetDepartmentIds] = useState<number[]>([]);
  const [selectedJobTitles, setSelectedJobTitles] = useState<string[]>([]);
  const [pendingEvaluateeId, setPendingEvaluateeId] = useState("");
  const [pendingDepartmentId, setPendingDepartmentId] = useState("");
  const [pendingJobTitle, setPendingJobTitle] = useState("");
  const [selectedCycleId, setSelectedCycleId] = useState<string>("");
  const [stagedAssignments, setStagedAssignments] = useState<DraftAssignment[]>([]);
  const [manualEvaluators, setManualEvaluators] = useState<ManualEvaluatorMap>({
    self: [],
    manager: [],
    peer: [],
    subordinate: [],
    client: [],
  });
  const [pendingManualEvaluator, setPendingManualEvaluator] = useState<
    Record<EvaluationRelationship, string>
  >({
    self: "",
    manager: "",
    peer: "",
    subordinate: "",
    client: "",
  });
  const [specificSignatureIds, setSpecificSignatureIds] = useState<number[]>([]);
  const [pendingSignatureProfileId, setPendingSignatureProfileId] = useState("");
  const [launchOptions, setLaunchOptions] = useState(defaultLaunchOptionsState);

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
	          if (relationship.value === "client") return launchOptions.enableClientEvaluation;
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

  const generatedSections = useMemo(() => {
    if (templateSections.length > 0) return templateSections;
    return buildTemplateSections(
      BUILT_IN_TEMPLATE,
      enabledWorkflowTypes.length > 0 ? enabledWorkflowTypes : ["manager"]
    );
  }, [enabledWorkflowTypes, templateSections]);

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
        duration: 8000,
      });
      setStagedAssignments([]);
    },
  });

  const closeCycleMutation = useMutation({
    mutationFn: evaluationsAPI.closeCycle,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["evaluation-cycles"] });
      toast({
        title: "Cycle finalized",
        description: "The cycle is closed and final score outputs are being refreshed.",
      });
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
	    templatesQuery.isLoading
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
    if (customizeQuestions && customQuestionCount === 0) {
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
      questions: customizeQuestions
        ? (generatedSections as unknown as Array<Record<string, unknown>>)
        : undefined,
      enableSelfEvaluation: launchOptions.enableSelfEvaluation,
	      enablePeerEvaluation: launchOptions.enablePeerEvaluation,
	      enableUpwardEvaluation: launchOptions.enableUpwardEvaluation,
	      enableDownwardEvaluation: launchOptions.enableDownwardEvaluation,
	      enableClientEvaluation: launchOptions.enableClientEvaluation,
	      processAnonymously: launchOptions.processAnonymously,
      hideFromDashboard: launchOptions.hideFromDashboard,
      excludeFromScore: launchOptions.excludeFromScore,
      requireEvaluatorSignature: launchOptions.requireEvaluatorSignature,
      requireEvaluateeSignature: launchOptions.requireEvaluateeSignature,
      scoringConfig: {
        cancelIfPastDue: launchOptions.cancelIfPastDue,
        peerAssignmentMode: launchOptions.peerAssignmentMode,
        peersPerPerson: Math.max(1, Number(launchOptions.peersPerPerson || 0) || 2),
        audience: {
          evaluateeProfileIds: selectedEvaluateeIds,
          departmentIds: Array.from(selectedTargetDepartmentSet.values()),
          jobTitles: selectedJobTitles,
        },
        resultAreas: {
          sectionCount: questionSummary.sectionCount,
          itemCount: questionSummary.itemCount,
          metricCount: questionSummary.metricCount,
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
	            client: launchOptions.enableClientEvaluation,
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

  const handleCloseCycle = (cycle: { id: number; title: string; status: string }) => {
    if (cycle.status === "closed") return;
    const confirmed = window.confirm(
      `Finalize "${cycle.title}"? This closes the cycle and refreshes final score outputs.`
    );
    if (!confirmed) return;
    closeCycleMutation.mutate(cycle.id);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Create and Launch Evaluation</h1>
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
                        setCycleForm((current) => ({
                          ...current,
                          dueMode: value as EvaluationCycleFormState["dueMode"],
                        }))
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
	                            : relationship.value === "client"
	                              ? launchOptions.enableClientEvaluation
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
	                              if (relationship.value === "client") {
	                                setLaunchOptions((current) => ({
	                                  ...current,
	                                  enableClientEvaluation: value,
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
	                                  {relationship.value === "client"
	                                    ? "Add at least one client or customer stakeholder for this group."
	                                    : "If left empty, the system will auto-select this evaluator group."}
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

            <EvaluationCycleQuestionnaireCard
              selectedTemplateKey={selectedTemplateKey}
              setSelectedTemplateKey={setSelectedTemplateKey}
              templates={templatesQuery.data || []}
              selectedTemplate={selectedTemplate}
              questionSummary={questionSummary}
              totalQuestionWeight={totalQuestionWeight}
              customizeQuestions={customizeQuestions}
              setCustomizeQuestions={setCustomizeQuestions}
              questionDrafts={questionDrafts}
              handleQuestionChange={handleQuestionChange}
              setQuestionDrafts={setQuestionDrafts}
              generatedSections={generatedSections}
            />
          </div>

          <EvaluationCycleLaunchSidebar
            launchOptions={launchOptions}
            setLaunchOptions={setLaunchOptions}
            people={people}
            peopleById={peopleById}
            specificSignatureIds={specificSignatureIds}
            pendingSignatureProfileId={pendingSignatureProfileId}
            setPendingSignatureProfileId={setPendingSignatureProfileId}
            addSignatureRecipient={addSignatureRecipient}
            setSpecificSignatureIds={setSpecificSignatureIds}
            targetEvaluateeCount={targetEvaluatees.length}
            questionSummary={questionSummary}
            suggestedAssignments={suggestedAssignments}
            computedDueDate={computedDueDate}
            enabledRelationships={enabledRelationships}
            selectedCycleId={selectedCycleId}
            setSelectedCycleId={setSelectedCycleId}
            cycles={cyclesQuery.data || []}
            handleBuildLaunchPlan={handleBuildLaunchPlan}
            handleCreateCycle={handleCreateCycle}
            handlePublish={handlePublish}
            isCreatingCycle={createCycleMutation.isPending}
            isPublishing={assignMutation.isPending}
            stagedAssignments={stagedAssignments}
            setStagedAssignments={setStagedAssignments}
            assignmentBreakdown={assignmentBreakdown}
          />
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
	                      {cycle.status !== "closed" && (
	                        <Button
	                          size="sm"
	                          variant="outline"
	                          disabled={closeCycleMutation.isPending}
	                          onClick={() => handleCloseCycle(cycle)}
	                        >
	                          Finalize
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
