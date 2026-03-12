import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import {
  Calendar,
  ClipboardList,
  Clock3,
  Eye,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Users,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import PageLoader from "@/components/ui/page-loader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { getEnabledEvaluatorTypes, getWorkflowConfig } from "@/lib/evaluations/workflow";
import type {
  EvaluationAssignment,
  EvaluationCycle,
  EvaluationDefinition,
  EvaluatorType,
} from "@/lib/api/types";

type CycleRecord = EvaluationCycle & {
  definitions?: Array<{ id: number }>;
  performanceScores?: Array<{ id: number }>;
};

type DefinitionRecord = EvaluationDefinition & {
  cycle?: {
    id: number;
    cycleName?: string;
    startDate?: string;
    endDate?: string;
  } | null;
  department?: {
    id: number;
    name?: string;
  } | null;
};

type CycleFormState = {
  cycleName: string;
  description: string;
  startDate: string;
  endDate: string;
  status: "draft" | "active" | "closed";
};

const emptyCycleForm: CycleFormState = {
  cycleName: "",
  description: "",
  startDate: "",
  endDate: "",
  status: "draft",
};

const extractItems = <T,>(payload: any): T[] => {
  const data = payload?.data ?? payload;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  return [];
};

const formatDate = (value?: string | null) => {
  if (!value) return "Not set";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not set";
  return format(parsed, "MMM dd, yyyy");
};

const toDateInput = (value?: string | null) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
};

const displayName = (person: any) =>
  [person?.firstName || person?.first_name, person?.lastName || person?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim() || "Unknown";

const statusVariant = (status?: string) => {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "published" || normalized === "active" || normalized === "submitted") {
    return "default" as const;
  }
  if (normalized === "in_progress") {
    return "outline" as const;
  }
  return "secondary" as const;
};

const evaluatorLabels: Record<EvaluatorType, string> = {
  self: "Self",
  manager: "Downward",
  peer: "Peer",
  direct_report: "Upward",
  client: "Client",
  custom: "Custom",
};

export default function EvaluationManagement() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("workflows");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingCycle, setSavingCycle] = useState(false);
  const [definitions, setDefinitions] = useState<DefinitionRecord[]>([]);
  const [cycles, setCycles] = useState<CycleRecord[]>([]);
  const [assignments, setAssignments] = useState<EvaluationAssignment[]>([]);
  const [workflowSearch, setWorkflowSearch] = useState("");
  const [assignmentSearchText, setAssignmentSearchText] = useState("");
  const [workflowStatus, setWorkflowStatus] = useState("all");
  const [assignmentStatus, setAssignmentStatus] = useState("all");
  const [editingCycleId, setEditingCycleId] = useState<number | null>(null);
  const [cycleForm, setCycleForm] = useState<CycleFormState>(emptyCycleForm);

  useEffect(() => {
    void loadEvaluationWorkspace();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadEvaluationWorkspace = async (quiet = false) => {
    try {
      if (quiet) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const [definitionsData, cyclesData, assignmentsData] = await Promise.all([
        apiFetch("GET", "/evaluation-definitions"),
        apiFetch("GET", "/evaluation-cycles"),
        apiFetch(
          "GET",
          "/evaluation-assignments?include=definition,evaluatee,evaluator&limit=300"
        ),
      ]);

      setDefinitions(extractItems<DefinitionRecord>(definitionsData));
      setCycles(extractItems<CycleRecord>(cyclesData));
      setAssignments(extractItems<EvaluationAssignment>(assignmentsData));
    } catch (error: any) {
      toast({
        title: "Error loading evaluation workspace",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const resetCycleEditor = () => {
    setEditingCycleId(null);
    setCycleForm(emptyCycleForm);
  };

  const startEditCycle = (cycle: CycleRecord) => {
    setEditingCycleId(cycle.id);
    setCycleForm({
      cycleName: cycle.cycleName || cycle.name || "",
      description: cycle.description || "",
      startDate: toDateInput(cycle.startDate),
      endDate: toDateInput(cycle.endDate),
      status:
        cycle.status === "active" || cycle.status === "closed" ? cycle.status : "draft",
    });
  };

  const saveCycle = async () => {
    if (!cycleForm.cycleName.trim() || !cycleForm.startDate || !cycleForm.endDate) {
      toast({ title: "Cycle name and dates are required", variant: "destructive" });
      return;
    }

    if (cycleForm.endDate < cycleForm.startDate) {
      toast({
        title: "End date must be on or after start date",
        variant: "destructive",
      });
      return;
    }

    try {
      setSavingCycle(true);
      const payload = {
        cycleName: cycleForm.cycleName.trim(),
        description: cycleForm.description.trim() || undefined,
        startDate: cycleForm.startDate,
        endDate: cycleForm.endDate,
        status: cycleForm.status,
      };

      if (editingCycleId) {
        await apiFetch("PATCH", `/evaluation-cycles/${editingCycleId}`, payload);
      } else {
        await apiFetch("POST", "/evaluation-cycles", payload);
      }

      toast({
        title: editingCycleId ? "Evaluation cycle updated" : "Evaluation cycle created",
      });
      resetCycleEditor();
      await loadEvaluationWorkspace(true);
    } catch (error: any) {
      toast({
        title: "Error saving cycle",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSavingCycle(false);
    }
  };

  const deleteCycle = async (cycleId: number) => {
    if (!window.confirm("Delete this evaluation cycle?")) return;

    try {
      await apiFetch("DELETE", `/evaluation-cycles/${cycleId}`);
      toast({ title: "Evaluation cycle deleted" });
      if (editingCycleId === cycleId) resetCycleEditor();
      await loadEvaluationWorkspace(true);
    } catch (error: any) {
      toast({
        title: "Error deleting cycle",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const publishWorkflow = async (definitionId: number) => {
    try {
      await apiFetch("POST", `/evaluation-definitions/${definitionId}/publish`);
      toast({ title: "Workflow published" });
      await loadEvaluationWorkspace(true);
    } catch (error: any) {
      toast({
        title: "Error publishing workflow",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const autoAssignWorkflow = async (definitionId: number) => {
    try {
      await apiFetch("POST", `/evaluation-definitions/${definitionId}/auto-assign`, {});
      toast({ title: "Assignments created from workflow" });
      await loadEvaluationWorkspace(true);
    } catch (error: any) {
      toast({
        title: "Error auto-assigning workflow",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const deleteWorkflow = async (definitionId: number) => {
    if (!window.confirm("Delete this draft workflow?")) return;

    try {
      await apiFetch("DELETE", `/evaluation-definitions/${definitionId}`);
      toast({ title: "Workflow deleted" });
      await loadEvaluationWorkspace(true);
    } catch (error: any) {
      toast({
        title: "Error deleting workflow",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const workflowStats = useMemo(() => {
    const published = definitions.filter((definition) => definition.status === "published").length;
    const draft = definitions.filter((definition) => definition.status === "draft").length;
    const activeCycles = cycles.filter((cycle) => cycle.status === "active").length;
    const pendingAssignments = assignments.filter(
      (assignment) => assignment.status === "pending" || assignment.status === "in_progress"
    ).length;
    return {
      published,
      draft,
      activeCycles,
      pendingAssignments,
    };
  }, [assignments, cycles, definitions]);

  const filteredDefinitions = useMemo(() => {
    const query = workflowSearch.trim().toLowerCase();
    return definitions.filter((definition) => {
      const matchesStatus =
        workflowStatus === "all" ? true : definition.status === workflowStatus;
      if (!matchesStatus) return false;
      if (!query) return true;
      return [
        definition.name,
        definition.description,
        definition.cycle?.cycleName,
        definition.department?.name,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [definitions, workflowSearch, workflowStatus]);

  const filteredAssignments = useMemo(() => {
    const query = assignmentSearchText.trim().toLowerCase();
    return assignments.filter((assignment) => {
      const matchesStatus =
        assignmentStatus === "all" ? true : assignment.status === assignmentStatus;
      if (!matchesStatus) return false;
      if (!query) return true;
      return [
        assignment.definition?.name,
        displayName(assignment.evaluatee),
        displayName(assignment.evaluator),
        assignment.evaluatorType,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [assignmentSearchText, assignments, assignmentStatus]);

  const assignmentBreakdown = useMemo(() => {
    const base = new Map<string, number>();
    assignments.forEach((assignment) => {
      const key = assignment.evaluatorType || "custom";
      base.set(key, (base.get(key) || 0) + 1);
    });
    return Array.from(base.entries());
  }, [assignments]);

  if (loading) {
    return (
      <DashboardLayout>
        <PageLoader message="Loading..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Evaluation Management</h1>
            <p className="text-muted-foreground">
              Manage canonical evaluation workflows, assignment launches, and review cycles.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => void loadEvaluationWorkspace(true)}>
              {refreshing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Refresh
            </Button>
            <Button onClick={() => navigate("/evaluations/cycles")}>
              <Plus className="mr-2 h-4 w-4" />
              New Workflow
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">Published workflows</div>
              <div className="mt-2 text-3xl font-semibold">{workflowStats.published}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">Draft workflows</div>
              <div className="mt-2 text-3xl font-semibold">{workflowStats.draft}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">Active cycles</div>
              <div className="mt-2 text-3xl font-semibold">{workflowStats.activeCycles}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">Open assignments</div>
              <div className="mt-2 text-3xl font-semibold">{workflowStats.pendingAssignments}</div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="workflows">Workflows</TabsTrigger>
            <TabsTrigger value="cycles">Cycles</TabsTrigger>
            <TabsTrigger value="assignments">Assignments</TabsTrigger>
          </TabsList>

          <TabsContent value="workflows" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Workflow Library</CardTitle>
                <CardDescription>
                  Streamlined evaluation definitions with reusable sections, evaluator mix, and
                  assignment actions.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-[1fr_220px]">
                <div className="space-y-2">
                  <Label>Search workflows</Label>
                  <Input
                    value={workflowSearch}
                    onChange={(event) => setWorkflowSearch(event.target.value)}
                    placeholder="Search by name, cycle, or department"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={workflowStatus} onValueChange={setWorkflowStatus}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="published">Published</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {filteredDefinitions.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
                  <ClipboardList className="h-10 w-10 text-muted-foreground" />
                  <div className="space-y-1">
                    <div className="font-medium">No workflows match the current filters.</div>
                    <div className="text-sm text-muted-foreground">
                      Create a canonical workflow or clear the filters.
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 xl:grid-cols-2">
                {filteredDefinitions.map((definition) => {
                  const evaluatorTypes = getEnabledEvaluatorTypes(definition);
                  const workflowConfig = getWorkflowConfig(definition);
                  return (
                    <Card key={definition.id} className="border-primary/10">
                      <CardHeader className="space-y-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <CardTitle className="text-xl">{definition.name}</CardTitle>
                            {definition.description && (
                              <CardDescription className="mt-2">
                                {definition.description}
                              </CardDescription>
                            )}
                          </div>
                          <Badge variant={statusVariant(definition.status)}>
                            {definition.status}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {evaluatorTypes.map((type) => (
                            <Badge key={type} variant="outline">
                              {evaluatorLabels[type] || type}
                            </Badge>
                          ))}
                          {definition.processAnonymously && (
                            <Badge variant="secondary">Anonymous</Badge>
                          )}
                          {!definition.excludeFromScore && (
                            <Badge variant="secondary">Feeds score</Badge>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="rounded-xl border bg-muted/30 p-4">
                            <div className="text-sm text-muted-foreground">Cycle</div>
                            <div className="mt-1 font-medium">
                              {definition.cycle?.cycleName || "No cycle"}
                            </div>
                          </div>
                          <div className="rounded-xl border bg-muted/30 p-4">
                            <div className="text-sm text-muted-foreground">Department</div>
                            <div className="mt-1 font-medium">
                              {definition.department?.name || "All departments"}
                            </div>
                          </div>
                          <div className="rounded-xl border bg-muted/30 p-4">
                            <div className="text-sm text-muted-foreground">Question blueprint</div>
                            <div className="mt-1 font-medium">
                              {definition.questionSummary?.sectionCount || 0} sections /{" "}
                              {definition.questionSummary?.itemCount || 0} items
                            </div>
                          </div>
                          <div className="rounded-xl border bg-muted/30 p-4">
                            <div className="text-sm text-muted-foreground">Metric items</div>
                            <div className="mt-1 font-medium">
                              {definition.questionSummary?.metricCount || 0}
                            </div>
                          </div>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Calendar className="h-4 w-4" />
                            Due {formatDate(definition.dueDate)}
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Clock3 className="h-4 w-4" />
                            Reminders {workflowConfig.reminderCadence}
                          </div>
                        </div>

                        {workflowConfig.launchSummary && (
                          <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                            {workflowConfig.launchSummary}
                          </div>
                        )}

                        <div className="flex flex-wrap gap-3">
                          {definition.status === "draft" && (
                            <Button onClick={() => void publishWorkflow(definition.id)}>
                              <Send className="mr-2 h-4 w-4" />
                              Publish
                            </Button>
                          )}
                          {definition.status === "published" && (
                            <Button
                              variant="outline"
                              onClick={() => void autoAssignWorkflow(definition.id)}
                            >
                              <Users className="mr-2 h-4 w-4" />
                              Auto-Assign
                            </Button>
                          )}
                          {definition.status === "draft" && (
                            <Button
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => void deleteWorkflow(definition.id)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete draft
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="cycles" className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
              <Card>
                <CardHeader>
                  <CardTitle>
                    {editingCycleId ? "Edit Evaluation Cycle" : "Create Evaluation Cycle"}
                  </CardTitle>
                  <CardDescription>
                    Keep cycle setup lightweight and aligned with the workflow library.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Cycle name</Label>
                    <Input
                      value={cycleForm.cycleName}
                      onChange={(event) =>
                        setCycleForm((current) => ({
                          ...current,
                          cycleName: event.target.value,
                        }))
                      }
                      placeholder="Q2 2026 Performance Cycle"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea
                      value={cycleForm.description}
                      onChange={(event) =>
                        setCycleForm((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                      rows={4}
                      placeholder="Target population, review purpose, and calibration notes."
                    />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Start date</Label>
                      <Input
                        type="date"
                        value={cycleForm.startDate}
                        onChange={(event) =>
                          setCycleForm((current) => ({
                            ...current,
                            startDate: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>End date</Label>
                      <Input
                        type="date"
                        value={cycleForm.endDate}
                        onChange={(event) =>
                          setCycleForm((current) => ({
                            ...current,
                            endDate: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select
                      value={cycleForm.status}
                      onValueChange={(value) =>
                        setCycleForm((current) => ({
                          ...current,
                          status: value as CycleFormState["status"],
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-3">
                    <Button onClick={() => void saveCycle()} disabled={savingCycle} className="flex-1">
                      {savingCycle && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {editingCycleId ? "Update Cycle" : "Create Cycle"}
                    </Button>
                    {editingCycleId && (
                      <Button variant="outline" onClick={resetCycleEditor}>
                        Cancel
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-4 md:grid-cols-2">
                {cycles.length === 0 ? (
                  <Card className="md:col-span-2">
                    <CardContent className="py-16 text-center text-muted-foreground">
                      No evaluation cycles created yet.
                    </CardContent>
                  </Card>
                ) : (
                  cycles.map((cycle) => (
                    <Card key={cycle.id}>
                      <CardHeader>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <CardTitle>{cycle.cycleName || cycle.name || "Evaluation Cycle"}</CardTitle>
                            {cycle.description && (
                              <CardDescription className="mt-2">
                                {cycle.description}
                              </CardDescription>
                            )}
                          </div>
                          <Badge variant={statusVariant(cycle.status)}>{cycle.status}</Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-2 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Window</span>
                            <span className="font-medium">
                              {formatDate(cycle.startDate)} to {formatDate(cycle.endDate)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Definitions</span>
                            <span className="font-medium">{cycle.definitions?.length || 0}</span>
                          </div>
                        </div>
                        <div className="flex gap-3">
                          <Button variant="outline" onClick={() => startEditCycle(cycle)}>
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => void deleteCycle(cycle.id)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="assignments" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Assignment Oversight</CardTitle>
                <CardDescription>
                  Monitor submission progress across self, peer, upward, downward, and client reviews.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-[1fr_220px]">
                <div className="space-y-2">
                  <Label>Search assignments</Label>
                  <Input
                    value={assignmentSearchText}
                    onChange={(event) => setAssignmentSearchText(event.target.value)}
                    placeholder="Search by evaluatee, evaluator, or workflow"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={assignmentStatus} onValueChange={setAssignmentStatus}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="in_progress">In progress</SelectItem>
                      <SelectItem value="submitted">Submitted</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground">Total assignments</div>
                  <div className="mt-2 text-3xl font-semibold">{assignments.length}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground">Pending</div>
                  <div className="mt-2 text-3xl font-semibold">
                    {assignments.filter((assignment) => assignment.status === "pending").length}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground">In progress</div>
                  <div className="mt-2 text-3xl font-semibold">
                    {
                      assignments.filter((assignment) => assignment.status === "in_progress")
                        .length
                    }
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground">Submitted</div>
                  <div className="mt-2 text-3xl font-semibold">
                    {assignments.filter((assignment) => assignment.status === "submitted").length}
                  </div>
                </CardContent>
              </Card>
            </div>

            {assignmentBreakdown.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {assignmentBreakdown.map(([type, count]) => (
                  <Badge key={type} variant="outline">
                    {evaluatorLabels[(type as EvaluatorType) || "custom"] || type}: {count}
                  </Badge>
                ))}
              </div>
            )}

            {filteredAssignments.length === 0 ? (
              <Card>
                <CardContent className="py-16 text-center text-muted-foreground">
                  No assignments match the current filters.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 xl:grid-cols-2">
                {filteredAssignments.map((assignment) => (
                  <Card key={assignment.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <CardTitle className="text-lg">
                            {assignment.definition?.name || "Evaluation assignment"}
                          </CardTitle>
                          <CardDescription className="mt-2">
                            {displayName(assignment.evaluatee)} reviewed by{" "}
                            {displayName(assignment.evaluator)}
                          </CardDescription>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <Badge variant={statusVariant(assignment.status)}>
                            {assignment.status}
                          </Badge>
                          <Badge variant="outline">
                            {evaluatorLabels[assignment.evaluatorType || "custom"]}
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="rounded-xl border bg-muted/30 p-4">
                          <div className="text-sm text-muted-foreground">Evaluatee</div>
                          <div className="mt-1 font-medium">{displayName(assignment.evaluatee)}</div>
                        </div>
                        <div className="rounded-xl border bg-muted/30 p-4">
                          <div className="text-sm text-muted-foreground">Evaluator</div>
                          <div className="mt-1 font-medium">{displayName(assignment.evaluator)}</div>
                        </div>
                        <div className="rounded-xl border bg-muted/30 p-4">
                          <div className="text-sm text-muted-foreground">Due date</div>
                          <div className="mt-1 font-medium">
                            {formatDate(assignment.dueDate || assignment.definition?.dueDate)}
                          </div>
                        </div>
                        <div className="rounded-xl border bg-muted/30 p-4">
                          <div className="text-sm text-muted-foreground">Score</div>
                          <div className="mt-1 font-medium">
                            {assignment.score !== undefined && assignment.score !== null
                              ? `${assignment.score}%`
                              : "Pending"}
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => navigate(`/evaluation/${assignment.id}`)}
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        View assignment
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
