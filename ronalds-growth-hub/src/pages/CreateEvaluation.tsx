import { type Dispatch, type SetStateAction, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Sparkles, X } from "lucide-react";
import type { EvaluationQuestionSection, EvaluatorType } from "@/lib/api/types";
import {
  buildDefaultEvaluationSections,
  summarizeEvaluationSections,
} from "@/lib/evaluations/workflow";

interface Template {
  id: number;
  name: string;
  description?: string;
  questions?: EvaluationQuestionSection[];
  competencies?: any[];
}

interface Profile {
  id: number;
  firstName?: string;
  first_name?: string;
  lastName?: string;
  last_name?: string;
  positionTitle?: string;
  position?: string;
  departmentId?: number | null;
  department_id?: number | null;
  managerId?: number | null;
  manager_id?: number | null;
}

interface KPI {
  id: number | string;
  name: string;
  category?: string | null;
}

type ToggleControl = {
  label: string;
  checked: boolean;
  setter: Dispatch<SetStateAction<boolean>>;
  description: string;
};

const extractItems = (payload: any) => {
  const data = payload?.data ?? payload;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  return [];
};

const appendUnique = <T,>(items: T[], value: T) =>
  items.includes(value) ? items : [...items, value];

const getFullName = (profile: Profile | undefined) =>
  [profile?.firstName || profile?.first_name, profile?.lastName || profile?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim() || "Unknown employee";

const getPosition = (profile: Profile | undefined) =>
  profile?.positionTitle || profile?.position || "No position";

export default function CreateEvaluation() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [kpis, setKpis] = useState<KPI[]>([]);

  const [evaluationName, setEvaluationName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [dueDate, setDueDate] = useState("");

  const [enableSelf, setEnableSelf] = useState(false);
  const [enablePeer, setEnablePeer] = useState(false);
  const [enableUpward, setEnableUpward] = useState(false);
  const [enableDownward, setEnableDownward] = useState(true);
  const [enableClientEvaluation, setEnableClientEvaluation] = useState(false);

  const [selectedEvaluatees, setSelectedEvaluatees] = useState<number[]>([]);
  const [selectedPeerEvaluators, setSelectedPeerEvaluators] = useState<number[]>([]);
  const [selectedUpwardEvaluators, setSelectedUpwardEvaluators] = useState<number[]>([]);
  const [selectedDownwardEvaluators, setSelectedDownwardEvaluators] = useState<number[]>([]);

  const [autoAssignManager, setAutoAssignManager] = useState(true);
  const [autoAssignPeers, setAutoAssignPeers] = useState(true);
  const [autoAssignDirectReports, setAutoAssignDirectReports] = useState(true);
  const [peerAssignmentMode, setPeerAssignmentMode] = useState<"manager" | "department" | "any">("department");
  const [peersPerPerson, setPeersPerPerson] = useState(2);

  const [selectedKpis, setSelectedKpis] = useState<Array<{ kpi_id: string; weight: number }>>([]);
  const [processAnonymously, setProcessAnonymously] = useState(false);
  const [hideFromDashboard, setHideFromDashboard] = useState(false);
  const [requireAllKPIs, setRequireAllKPIs] = useState(false);
  const [excludeFromScore, setExcludeFromScore] = useState(false);
  const [requireEvaluatorSignature, setRequireEvaluatorSignature] = useState(false);
  const [requireEvaluateeSignature, setRequireEvaluateeSignature] = useState(false);
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [reminderCadence, setReminderCadence] = useState<"daily" | "weekly" | "custom">("weekly");

  const [okrWeight, setOkrWeight] = useState(30);
  const [evaluationWeight, setEvaluationWeight] = useState(50);
  const [feedbackWeight, setFeedbackWeight] = useState(20);

  useEffect(() => {
    void loadTemplates();
    void loadEmployees();
    void loadKPIs();
  }, []);

  const loadTemplates = async () => {
    try {
      const data = await apiFetch("GET", "/evaluation-templates?isActive=true");
      setTemplates(extractItems(data));
    } catch (error) {
      console.error("Failed to load templates:", error);
      setTemplates([]);
    }
  };

  const loadEmployees = async () => {
    try {
      const pageSize = 100;
      const rowsById = new Map<number, Profile>();
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const data = await apiFetch<{
          data?: Profile[];
          hasMore?: boolean;
          totalPages?: number;
        }>("GET", `/employees?status=active&page=${page}&pageSize=${pageSize}`);
        const batch = extractItems(data) as Profile[];

        batch.forEach((employee) => {
          rowsById.set(employee.id, employee);
        });

        hasMore = Boolean(data?.hasMore);
        page += 1;

        if (page > Number(data?.totalPages || page)) {
          hasMore = false;
        }
      }

      setEmployees(Array.from(rowsById.values()));
    } catch (error) {
      console.error("Failed to load employees:", error);
      toast({ title: "Error loading employees", variant: "destructive" });
    }
  };

  const loadKPIs = async () => {
    try {
      const data = await apiFetch("GET", "/kpi/archive/kpis");
      const rows = extractItems(data);
      setKpis(
        rows
          .filter((row: any) => row?.is_active !== false)
          .map((row: any) => ({
            id: row.id,
            name: row.name,
            category: row.category || null,
          }))
      );
    } catch (error) {
      console.error("Failed to load KPIs:", error);
      toast({ title: "Error loading KPIs", variant: "destructive" });
    }
  };

  const enabledEvaluatorTypes = useMemo(() => {
    const types: EvaluatorType[] = [];
    if (enableSelf) types.push("self");
    if (enableDownward) types.push("manager");
    if (enablePeer) types.push("peer");
    if (enableUpward) types.push("direct_report");
    if (enableClientEvaluation) types.push("client");
    return types;
  }, [enableClientEvaluation, enableDownward, enablePeer, enableSelf, enableUpward]);

  const selectedTemplateRecord = useMemo(
    () => templates.find((template) => String(template.id) === selectedTemplate),
    [selectedTemplate, templates]
  );

  const generatedSections = useMemo(
    () =>
      buildDefaultEvaluationSections({
        template: selectedTemplateRecord,
        selectedKpis,
        kpis: kpis.map((kpi) => ({
          id: String(kpi.id),
          name: kpi.name,
          category: kpi.category,
        })),
        enabledEvaluatorTypes:
          enabledEvaluatorTypes.length > 0 ? enabledEvaluatorTypes : ["manager"],
      }),
    [enabledEvaluatorTypes, kpis, selectedKpis, selectedTemplateRecord]
  );

  const questionSummary = useMemo(
    () => summarizeEvaluationSections(generatedSections),
    [generatedSections]
  );

  const learningWeightTotal = evaluationWeight + okrWeight + feedbackWeight;
  const learningWeightsValid = learningWeightTotal === 100;
  const evaluatorToggles: ToggleControl[] = [
    {
      label: "Manager / Downward",
      checked: enableDownward,
      setter: setEnableDownward,
      description: "Adds this evaluator group to the workflow mix.",
    },
    {
      label: "Peer",
      checked: enablePeer,
      setter: setEnablePeer,
      description: "Adds this evaluator group to the workflow mix.",
    },
    {
      label: "Upward / Direct Report",
      checked: enableUpward,
      setter: setEnableUpward,
      description: "Adds this evaluator group to the workflow mix.",
    },
    {
      label: "Self",
      checked: enableSelf,
      setter: setEnableSelf,
      description: "Adds this evaluator group to the workflow mix.",
    },
    {
      label: "Client / Customer",
      checked: enableClientEvaluation,
      setter: setEnableClientEvaluation,
      description: "Adds this evaluator group to the workflow mix.",
    },
  ];
  const visibilityToggles: ToggleControl[] = [
    {
      label: "Process anonymously",
      checked: processAnonymously,
      setter: setProcessAnonymously,
      description: "",
    },
    {
      label: "Hide from dashboard",
      checked: hideFromDashboard,
      setter: setHideFromDashboard,
      description: "",
    },
    {
      label: "Require all KPI answers",
      checked: requireAllKPIs,
      setter: setRequireAllKPIs,
      description: "",
    },
    {
      label: "Exclude from score",
      checked: excludeFromScore,
      setter: setExcludeFromScore,
      description: "",
    },
    {
      label: "Require evaluator signature",
      checked: requireEvaluatorSignature,
      setter: setRequireEvaluatorSignature,
      description: "",
    },
    {
      label: "Require evaluatee acknowledgement",
      checked: requireEvaluateeSignature,
      setter: setRequireEvaluateeSignature,
      description: "",
    },
  ];

  const addEvaluatee = (value: string) => {
    const profileId = Number(value);
    if (!profileId) return;
    setSelectedEvaluatees((current) => appendUnique(current, profileId));
  };

  const addEvaluator = (
    value: string,
    setter: Dispatch<SetStateAction<number[]>>
  ) => {
    const profileId = Number(value);
    if (!profileId) return;
    setter((current) => appendUnique(current, profileId));
  };

  const handlePublish = async () => {
    if (!evaluationName.trim()) {
      toast({ title: "Evaluation name required", variant: "destructive" });
      return;
    }

    if (enabledEvaluatorTypes.length === 0) {
      toast({
        title: "Select at least one evaluator group",
        variant: "destructive",
      });
      return;
    }

    if (!learningWeightsValid) {
      toast({
        title: "Learning weights must total 100%",
        variant: "destructive",
      });
      return;
    }

    if (selectedEvaluatees.length === 0) {
      toast({
        title: "Select at least one evaluatee",
        variant: "destructive",
      });
      return;
    }

    if (generatedSections.length === 0 || questionSummary.itemCount === 0) {
      toast({
        title: "Add at least one metric or evaluation item",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const definition = await apiFetch("POST", "/evaluation-definitions", {
        name: evaluationName.trim(),
        description: description.trim() || undefined,
        enableSelfEvaluation: enableSelf,
        enablePeerEvaluation: enablePeer,
        enableUpwardEvaluation: enableUpward,
        enableDownwardEvaluation: enableDownward,
        enableClientEvaluation,
        dueDate: dueDate || undefined,
        processAnonymously,
        hideFromDashboard,
        excludeFromScore,
        requireEvaluatorSignature,
        requireEvaluateeSignature,
        status: "published",
        questions: generatedSections,
        scoringConfig: {
          requireAllKpis: requireAllKPIs,
          peerAssignmentMode,
          peersPerPerson,
          learningGrowthBreakdown: {
            evaluation: evaluationWeight / 100,
            okr: okrWeight / 100,
            feedback: feedbackWeight / 100,
          },
            evaluationWorkflow: {
              remindersEnabled,
              reminderCadence,
              launchSummary: `${selectedEvaluatees.length} evaluatee(s), ${enabledEvaluatorTypes.length} evaluator group(s), ${questionSummary.itemCount} items`,
              evaluatorMix: {
                self: enableSelf,
                manager: enableDownward,
              peer: enablePeer,
              direct_report: enableUpward,
              client: enableClientEvaluation,
            },
            schedules: enabledEvaluatorTypes.map((evaluatorType) => ({
              evaluatorType,
              dueAt: dueDate || undefined,
            })),
          },
        },
      });

      const definitionId = Number(definition?.id ?? definition?.data?.id ?? 0);
      const assignments: Array<{
        evaluationDefinitionId: number;
        evaluatorProfileId: number;
        evaluateeProfileId: number;
        evaluatorType: EvaluatorType;
      }> = [];

      const employeesById = new Map(employees.map((employee) => [employee.id, employee]));

      const addAssignment = (
        evaluatorProfileId: number | null | undefined,
        evaluateeProfileId: number,
        evaluatorType: EvaluatorType
      ) => {
        if (!evaluatorProfileId) return;
        if (evaluatorProfileId === evaluateeProfileId && evaluatorType !== "self") return;
        assignments.push({
          evaluationDefinitionId: definitionId,
          evaluatorProfileId,
          evaluateeProfileId,
          evaluatorType,
        });
      };

      selectedEvaluatees.forEach((evaluateeId) => {
        const evaluatee = employeesById.get(evaluateeId);
        const managerId = Number(evaluatee?.managerId ?? evaluatee?.manager_id ?? 0) || undefined;
        const departmentId =
          Number(evaluatee?.departmentId ?? evaluatee?.department_id ?? 0) || undefined;

        if (enableDownward) {
          if (autoAssignManager && managerId) {
            addAssignment(managerId, evaluateeId, "manager");
          } else {
            selectedDownwardEvaluators.forEach((profileId) =>
              addAssignment(profileId, evaluateeId, "manager")
            );
          }
        }

        if (enablePeer) {
          if (!autoAssignPeers && selectedPeerEvaluators.length > 0) {
            selectedPeerEvaluators.forEach((profileId) =>
              addAssignment(profileId, evaluateeId, "peer")
            );
          } else {
            let candidates = employees.filter((employee) => employee.id !== evaluateeId);
            if (peerAssignmentMode === "manager" && managerId) {
              candidates = candidates.filter(
                (employee) =>
                  Number(employee.managerId ?? employee.manager_id ?? 0) === managerId
              );
            } else if (peerAssignmentMode === "department" && departmentId) {
              candidates = candidates.filter(
                (employee) =>
                  Number(employee.departmentId ?? employee.department_id ?? 0) ===
                  departmentId
              );
            }
            candidates.slice(0, Math.max(1, peersPerPerson)).forEach((candidate) => {
              addAssignment(candidate.id, evaluateeId, "peer");
            });
          }
        }

        if (enableUpward) {
          if (!autoAssignDirectReports && selectedUpwardEvaluators.length > 0) {
            selectedUpwardEvaluators.forEach((profileId) =>
              addAssignment(profileId, evaluateeId, "direct_report")
            );
          } else {
            employees
              .filter(
                (employee) => Number(employee.managerId ?? employee.manager_id ?? 0) === evaluateeId
              )
              .forEach((report) => addAssignment(report.id, evaluateeId, "direct_report"));
          }
        }

        if (enableSelf) {
          addAssignment(evaluateeId, evaluateeId, "self");
        }
      });

      const uniqueAssignments = Array.from(
        new Map(
          assignments.map((assignment) => [
            `${assignment.evaluationDefinitionId}-${assignment.evaluatorProfileId}-${assignment.evaluateeProfileId}-${assignment.evaluatorType}`,
            assignment,
          ])
        ).values()
      );

      if (uniqueAssignments.length > 0) {
        await apiFetch("POST", "/evaluation-assignments", uniqueAssignments);
      }

      toast({
        title: "Evaluation workflow published",
        description:
          uniqueAssignments.length > 0
            ? `${uniqueAssignments.length} assignments created.`
            : "Definition published with no assignments yet.",
      });
      navigate("/evaluations");
    } catch (error: any) {
      toast({
        title: "Error publishing evaluation",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Evaluation Workflow Builder</h1>
          <p className="text-muted-foreground">
            Build one canonical evaluation definition with evaluator mix, metrics, scoring, and launch rules.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>1. Evaluation Basics</CardTitle>
            <CardDescription>Set the identity of the workflow and start from a reusable template when available.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label>Evaluation Name</Label>
              <Input
                value={evaluationName}
                onChange={(event) => setEvaluationName(event.target.value)}
                placeholder="Quarterly review, 360 feedback, probation assessment..."
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Description</Label>
              <Textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                placeholder="What is this workflow intended to assess?"
              />
            </div>
            <div className="space-y-2">
              <Label>Template</Label>
              <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a reusable template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={String(template.id)}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Default Due Date</Label>
              <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
            </div>
            {selectedTemplateRecord && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 md:col-span-2">
                <div className="flex items-center gap-2 font-medium">
                  <Sparkles className="h-4 w-4 text-primary" />
                  {selectedTemplateRecord.name}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {selectedTemplateRecord.description || "This template will seed the question blueprint."}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2. Audience and Scope</CardTitle>
            <CardDescription>Select the employees who should receive this workflow.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select onValueChange={addEvaluatee}>
              <SelectTrigger>
                <SelectValue placeholder="Add evaluatees" />
              </SelectTrigger>
              <SelectContent>
                {employees.map((employee) => (
                  <SelectItem key={employee.id} value={String(employee.id)}>
                    {getFullName(employee)} - {getPosition(employee)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex flex-wrap gap-2">
              {selectedEvaluatees.map((profileId) => {
                const employee = employees.find((entry) => entry.id === profileId);
                return (
                  <Badge key={profileId} variant="secondary" className="gap-2 px-3 py-1.5">
                    <span>{getFullName(employee)}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedEvaluatees((current) =>
                          current.filter((entry) => entry !== profileId)
                        )
                      }
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </Badge>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>3. Evaluator Mix</CardTitle>
            <CardDescription>Enable the rater groups that should participate in this evaluation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              {evaluatorToggles.map(({ label, checked, setter, description }) => (
                <div key={String(label)} className="flex items-center justify-between rounded-xl border p-4">
                  <div>
                    <div className="font-medium">{label}</div>
                    <div className="text-sm text-muted-foreground">{description}</div>
                  </div>
                  <Switch checked={checked} onCheckedChange={setter} />
                </div>
              ))}
            </div>

            <Separator />

            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Auto-assign managers</Label>
                  <Switch checked={autoAssignManager} onCheckedChange={setAutoAssignManager} />
                </div>
                {!autoAssignManager && (
                  <Select onValueChange={(value) => addEvaluator(value, setSelectedDownwardEvaluators)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Add manual manager evaluators" />
                    </SelectTrigger>
                    <SelectContent>
                      {employees.map((employee) => (
                        <SelectItem key={employee.id} value={String(employee.id)}>
                          {getFullName(employee)} - {getPosition(employee)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Auto-assign direct reports</Label>
                  <Switch
                    checked={autoAssignDirectReports}
                    onCheckedChange={setAutoAssignDirectReports}
                  />
                </div>
                {!autoAssignDirectReports && (
                  <Select onValueChange={(value) => addEvaluator(value, setSelectedUpwardEvaluators)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Add manual upward evaluators" />
                    </SelectTrigger>
                    <SelectContent>
                      {employees.map((employee) => (
                        <SelectItem key={employee.id} value={String(employee.id)}>
                          {getFullName(employee)} - {getPosition(employee)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-3 md:col-span-2">
                <div className="flex items-center justify-between">
                  <Label>Auto-assign peers</Label>
                  <Switch checked={autoAssignPeers} onCheckedChange={setAutoAssignPeers} />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Peer selection mode</Label>
                    <Select
                      value={peerAssignmentMode}
                      onValueChange={(value) =>
                        setPeerAssignmentMode(value as "manager" | "department" | "any")
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manager">Same manager</SelectItem>
                        <SelectItem value="department">Same department</SelectItem>
                        <SelectItem value="any">Any active peer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Peers per person</Label>
                    <Input
                      type="number"
                      min="1"
                      max="10"
                      value={peersPerPerson}
                      onChange={(event) =>
                        setPeersPerPerson(Math.max(1, Number(event.target.value) || 1))
                      }
                    />
                  </div>
                </div>
                {!autoAssignPeers && (
                  <Select onValueChange={(value) => addEvaluator(value, setSelectedPeerEvaluators)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Add manual peer evaluators" />
                    </SelectTrigger>
                    <SelectContent>
                      {employees.map((employee) => (
                        <SelectItem key={employee.id} value={String(employee.id)}>
                          {getFullName(employee)} - {getPosition(employee)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>4. Metrics / Result Areas / KPIs</CardTitle>
            <CardDescription>Choose the measurable result areas that should drive evaluation scoring.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select
              onValueChange={(value) => {
                if (selectedKpis.some((entry) => entry.kpi_id === value)) return;
                setSelectedKpis((current) => [...current, { kpi_id: value, weight: 0 }]);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Add KPI / result area" />
              </SelectTrigger>
              <SelectContent>
                {kpis.map((kpi) => (
                  <SelectItem key={String(kpi.id)} value={String(kpi.id)}>
                    {kpi.name} {kpi.category ? `(${kpi.category})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedKpis.map(({ kpi_id, weight }) => {
              const kpi = kpis.find((entry) => String(entry.id) === kpi_id);
              return (
                <div key={kpi_id} className="grid gap-3 rounded-xl border p-4 md:grid-cols-[1fr_140px_auto]">
                  <div>
                    <div className="font-medium">{kpi?.name || "Unknown KPI"}</div>
                    <div className="text-sm text-muted-foreground">{kpi?.category || "Metric"}</div>
                  </div>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={weight}
                    onChange={(event) =>
                      setSelectedKpis((current) =>
                        current.map((entry) =>
                          entry.kpi_id === kpi_id
                            ? { ...entry, weight: Math.max(0, Number(event.target.value) || 0) }
                            : entry
                        )
                      )
                    }
                    placeholder="Weight %"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() =>
                      setSelectedKpis((current) =>
                        current.filter((entry) => entry.kpi_id !== kpi_id)
                      )
                    }
                  >
                    Remove
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>5. Rating Scales and Weights</CardTitle>
            <CardDescription>Keep evaluation, OKR, and feedback mix aligned with performance scoring.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Evaluation Weight (%)</Label>
              <Input type="number" value={evaluationWeight} onChange={(event) => setEvaluationWeight(Number(event.target.value) || 0)} />
            </div>
            <div className="space-y-2">
              <Label>OKR Weight (%)</Label>
              <Input type="number" value={okrWeight} onChange={(event) => setOkrWeight(Number(event.target.value) || 0)} />
            </div>
            <div className="space-y-2">
              <Label>Feedback Weight (%)</Label>
              <Input type="number" value={feedbackWeight} onChange={(event) => setFeedbackWeight(Number(event.target.value) || 0)} />
            </div>
            <div className="rounded-xl border bg-muted/30 p-4 md:col-span-3">
              <div className="flex items-center justify-between">
                <span className="font-medium">Learning & growth total</span>
                <Badge variant={learningWeightsValid ? "default" : "destructive"}>
                  {learningWeightTotal}%
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>6. Scheduling and Reminders</CardTitle>
            <CardDescription>Define the operational defaults for the assignment launch.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="flex items-center justify-between rounded-xl border p-4">
              <div>
                <div className="font-medium">Enable reminders</div>
                <div className="text-sm text-muted-foreground">Keep evaluators moving through the cycle.</div>
              </div>
              <Switch checked={remindersEnabled} onCheckedChange={setRemindersEnabled} />
            </div>
            <div className="space-y-2">
              <Label>Reminder cadence</Label>
              <Select
                value={reminderCadence}
                onValueChange={(value) => setReminderCadence(value as "daily" | "weekly" | "custom")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="custom">Manual / custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>7. Visibility / Signatures / Anonymity</CardTitle>
            <CardDescription>Control dashboard visibility, score inclusion, and signatures.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {visibilityToggles.map(({ label, checked, setter }) => (
              <div key={String(label)} className="flex items-center justify-between rounded-xl border p-4">
                <div className="font-medium">{label}</div>
                <Switch checked={checked} onCheckedChange={setter} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>8. Review and Launch</CardTitle>
            <CardDescription>Preview the generated question blueprint before publishing.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-4">
              <div className="rounded-xl border bg-muted/30 p-4">
                <div className="text-sm text-muted-foreground">Evaluator groups</div>
                <div className="mt-1 text-2xl font-semibold">{enabledEvaluatorTypes.length}</div>
              </div>
              <div className="rounded-xl border bg-muted/30 p-4">
                <div className="text-sm text-muted-foreground">Sections</div>
                <div className="mt-1 text-2xl font-semibold">{questionSummary.sectionCount}</div>
              </div>
              <div className="rounded-xl border bg-muted/30 p-4">
                <div className="text-sm text-muted-foreground">Items</div>
                <div className="mt-1 text-2xl font-semibold">{questionSummary.itemCount}</div>
              </div>
              <div className="rounded-xl border bg-muted/30 p-4">
                <div className="text-sm text-muted-foreground">Metric items</div>
                <div className="mt-1 text-2xl font-semibold">{questionSummary.metricCount}</div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {enabledEvaluatorTypes.map((type) => (
                <Badge key={type} variant="outline" className="capitalize">
                  {type.replace("_", " ")}
                </Badge>
              ))}
            </div>

            <div className="space-y-3">
              {generatedSections.map((section) => (
                <div key={section.id} className="rounded-xl border p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-medium">{section.title}</div>
                      {section.description && (
                        <div className="text-sm text-muted-foreground">{section.description}</div>
                      )}
                    </div>
                    <Badge variant="secondary">{section.items.length} items</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {section.items.slice(0, 6).map((item) => (
                      <Badge key={item.id} variant="outline">
                        {item.label}
                      </Badge>
                    ))}
                    {section.items.length > 6 && <Badge variant="outline">+{section.items.length - 6} more</Badge>}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-4">
              <Button onClick={handlePublish} disabled={loading} className="flex-1">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Publish Evaluation Workflow
              </Button>
              <Button variant="outline" onClick={() => navigate("/evaluations")}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
