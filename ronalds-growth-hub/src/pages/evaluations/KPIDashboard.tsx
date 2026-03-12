import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import PageLoader from "@/components/ui/page-loader";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import evaluationsAPI, { type KpiItem } from "@/lib/api/evaluations";
import {
  FREQUENCY_OPTIONS,
  TARGET_TYPE_OPTIONS,
  formatDate,
  formatDateTime,
  getDraft,
  titleCase,
  toProgressValue,
  type ProgressDraft,
} from "./kpi-dashboard.helpers";

export default function KPIDashboard() {
  const { profile, hasRole } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const profileId = profile?.id;
  const canManageTeam = hasRole("manager") || hasRole("hr") || hasRole("super_admin");

  const [teamFilters, setTeamFilters] = useState({
    departmentId: "all",
    status: "all",
    isActive: "true",
  });
  const [selectedKpiId, setSelectedKpiId] = useState<number | null>(null);
  const [progressDrafts, setProgressDrafts] = useState<Record<number, ProgressDraft>>({});
  const [createDraft, setCreateDraft] = useState({
    ownerProfileId: "",
    title: "",
    description: "",
    baseline: "0",
    target: "",
    actual: "0",
    unit: "%",
    weight: "1",
    dueDate: "",
    targetFrequency: "monthly",
    targetType: "higher_better",
    reviewFrequency: "monthly",
    redThreshold: "",
    amberThreshold: "",
    greenThreshold: "",
    evidenceRequired: false,
    commentaryRequired: false,
  });

  const ownDashboardQuery = useQuery({
    queryKey: ["kpi-dashboard", "self", profileId],
    queryFn: () => evaluationsAPI.getEmployeeKpiDashboard(profileId!),
    enabled: !!profileId,
  });

  const departmentsQuery = useQuery({
    queryKey: ["kpi-dashboard", "departments"],
    queryFn: evaluationsAPI.getDepartments,
    enabled: canManageTeam,
  });

  const peopleQuery = useQuery({
    queryKey: ["kpi-dashboard", "people"],
    queryFn: evaluationsAPI.getAssignableEmployees,
    enabled: canManageTeam,
  });

  const teamKpisQuery = useQuery({
    queryKey: [
      "kpi-dashboard",
      "team",
      teamFilters.departmentId,
      teamFilters.status,
      teamFilters.isActive,
    ],
    queryFn: () =>
      evaluationsAPI.listKPIs({
        departmentId:
          teamFilters.departmentId !== "all" ? Number(teamFilters.departmentId) : undefined,
        status: teamFilters.status !== "all" ? (teamFilters.status as any) : undefined,
        isActive: teamFilters.isActive === "all" ? undefined : teamFilters.isActive === "true",
      } as any),
    enabled: canManageTeam,
  });

  const detailQuery = useQuery({
    queryKey: ["kpi-detail", selectedKpiId],
    queryFn: () => evaluationsAPI.getKPIDetail(selectedKpiId!),
    enabled: !!selectedKpiId,
  });

  const ownKpis = useMemo(
    () => Object.values(ownDashboardQuery.data?.kpis || {}).flat(),
    [ownDashboardQuery.data]
  );
  const ownOkrs = useMemo(
    () => Object.values(ownDashboardQuery.data?.okrs || {}).flat(),
    [ownDashboardQuery.data]
  );
  const ownGoals = useMemo(
    () => Object.values(ownDashboardQuery.data?.developmentGoals || {}).flat(),
    [ownDashboardQuery.data]
  );
  const teamKpis = teamKpisQuery.data || [];

  useEffect(() => {
    if (selectedKpiId) return;
    if (ownKpis.length > 0) {
      setSelectedKpiId(ownKpis[0].id);
      return;
    }
    if (teamKpis.length > 0) {
      setSelectedKpiId(teamKpis[0].id);
    }
  }, [ownKpis, selectedKpiId, teamKpis]);

  const progressMutation = useMutation({
    mutationFn: ({ kpiId, actual, note }: { kpiId: number; actual: number; note?: string }) =>
      evaluationsAPI.updateKPIProgress(kpiId, actual, {
        note: note?.trim() || undefined,
        measuredAt: new Date().toISOString(),
      }),
    onSuccess: async (updated) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["kpi-dashboard", "self", profileId] }),
        queryClient.invalidateQueries({ queryKey: ["kpi-dashboard", "team"] }),
        queryClient.invalidateQueries({ queryKey: ["evaluation-dashboard", "kpis", profileId] }),
      ]);
      queryClient.setQueryData(["kpi-detail", updated.id], updated);
      setProgressDrafts((current) => ({
        ...current,
        [updated.id]: { actual: String(updated.actual), note: "" },
      }));
      setSelectedKpiId(updated.id);
      toast({ title: "KPI progress updated" });
    },
  });

  const createMutation = useMutation({
    mutationFn: evaluationsAPI.createKPI,
    onSuccess: async (created) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["kpi-dashboard", "self", profileId] }),
        queryClient.invalidateQueries({ queryKey: ["kpi-dashboard", "team"] }),
        queryClient.invalidateQueries({ queryKey: ["evaluation-dashboard", "kpis", profileId] }),
      ]);
      setSelectedKpiId(created.id);
      setCreateDraft({
        ownerProfileId: "",
        title: "",
        description: "",
        baseline: "0",
        target: "",
        actual: "0",
        unit: "%",
        weight: "1",
        dueDate: "",
        targetFrequency: "monthly",
        targetType: "higher_better",
        reviewFrequency: "monthly",
        redThreshold: "",
        amberThreshold: "",
        greenThreshold: "",
        evidenceRequired: false,
        commentaryRequired: false,
      });
      toast({ title: "KPI created" });
    },
  });

  if (!profileId) {
    return (
      <DashboardLayout>
        <div className="text-sm text-muted-foreground">Profile not available.</div>
      </DashboardLayout>
    );
  }

  if (
    ownDashboardQuery.isLoading ||
    (canManageTeam && (teamKpisQuery.isLoading || peopleQuery.isLoading || departmentsQuery.isLoading))
  ) {
    return (
      <DashboardLayout>
        <PageLoader message="Loading KPI workspace..." minHeightClassName="min-h-[50vh]" />
      </DashboardLayout>
    );
  }

  const selectedKpi = detailQuery.data;

  const saveProgress = (kpi: KpiItem) => {
    const draft = getDraft(progressDrafts, kpi);
    progressMutation.mutate({
      kpiId: kpi.id,
      actual: Number(draft.actual || 0),
      note: draft.note,
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">KPI Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Create measurable KPIs, update progress, and track the history behind each score.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Weighted KPI Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">
                {Math.round(ownDashboardQuery.data?.summary?.weightedProgress || 0)}%
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Average Achievement</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">
                {Math.round(ownDashboardQuery.data?.summary?.averageAchievementPercent || 0)}%
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Overdue KPIs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{ownDashboardQuery.data?.summary?.overdue || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Due Soon</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{ownDashboardQuery.data?.summary?.dueSoon || 0}</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <Card>
            <CardHeader>
              <CardTitle>My KPI Tracker</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {ownKpis.length ? (
                ownKpis.map((kpi) => {
                  const draft = getDraft(progressDrafts, kpi);
                  return (
                    <div
                      key={kpi.id}
                      className={`rounded-xl border p-4 ${selectedKpiId === kpi.id ? "border-primary" : "border-border/70"}`}
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-1">
                          <button
                            type="button"
                            className="text-left font-medium hover:text-primary"
                            onClick={() => setSelectedKpiId(kpi.id)}
                          >
                            {kpi.title}
                          </button>
                          <div className="text-sm text-muted-foreground">
                            {kpi.actual} / {kpi.target} {kpi.unit}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Badge>{titleCase(kpi.status)}</Badge>
                            {kpi.metrics?.isOverdue && <Badge variant="destructive">Overdue</Badge>}
                            {kpi.metrics?.isDueSoon && !kpi.metrics?.isOverdue && (
                              <Badge variant="outline">Due soon</Badge>
                            )}
                          </div>
                        </div>
                        <div className="text-sm text-muted-foreground">Due {formatDate(kpi.dueDate)}</div>
                      </div>
                      <Progress className="mt-4 h-2" value={toProgressValue(kpi)} />
                      <div className="mt-3 grid gap-3 md:grid-cols-3">
                        <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                          Achievement {Math.round(kpi.metrics?.achievementPercent || 0)}%
                        </div>
                        <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                          Remaining {kpi.metrics?.remainingToTarget ?? 0} {kpi.unit}
                        </div>
                        <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                          Weighted score {(kpi.metrics?.weightedScore || 0).toFixed(1)}
                        </div>
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-[140px_1fr_auto]">
                        <Input
                          type="number"
                          value={draft.actual}
                          onChange={(event) =>
                            setProgressDrafts((current) => ({
                              ...current,
                              [kpi.id]: { ...draft, actual: event.target.value },
                            }))
                          }
                        />
                        <Textarea
                          value={draft.note}
                          onChange={(event) =>
                            setProgressDrafts((current) => ({
                              ...current,
                              [kpi.id]: { ...draft, note: event.target.value },
                            }))
                          }
                          placeholder="Add implementation notes or evidence context"
                        />
                        <Button
                          variant="outline"
                          onClick={() => saveProgress(kpi)}
                          disabled={progressMutation.isPending}
                        >
                          Save
                        </Button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-sm text-muted-foreground">No active KPIs assigned.</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>KPI Detail</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {detailQuery.isLoading ? (
                <PageLoader message="Loading KPI detail..." minHeightClassName="min-h-[20rem]" />
              ) : selectedKpi ? (
                <>
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <Badge>{titleCase(selectedKpi.status)}</Badge>
                      <Badge variant="outline">{titleCase(selectedKpi.metrics?.direction)}</Badge>
                      <Badge variant="outline">{titleCase(selectedKpi.targetFrequency)}</Badge>
                    </div>
                    <div className="text-2xl font-semibold">{selectedKpi.title}</div>
                    <p className="text-sm text-muted-foreground">
                      {selectedKpi.description || "No description provided."}
                    </p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border bg-muted/20 p-4">
                      <div className="text-sm text-muted-foreground">Target</div>
                      <div className="mt-2 text-2xl font-semibold">
                        {selectedKpi.target} {selectedKpi.unit}
                      </div>
                    </div>
                    <div className="rounded-xl border bg-muted/20 p-4">
                      <div className="text-sm text-muted-foreground">Current actual</div>
                      <div className="mt-2 text-2xl font-semibold">
                        {selectedKpi.actual} {selectedKpi.unit}
                      </div>
                    </div>
                    <div className="rounded-xl border bg-muted/20 p-4">
                      <div className="text-sm text-muted-foreground">Variance to target</div>
                      <div className="mt-2 text-2xl font-semibold">
                        {(selectedKpi.metrics?.varianceToTarget || 0).toFixed(2)}
                      </div>
                    </div>
                    <div className="rounded-xl border bg-muted/20 p-4">
                      <div className="text-sm text-muted-foreground">Due date</div>
                      <div className="mt-2 text-2xl font-semibold">{formatDate(selectedKpi.dueDate)}</div>
                    </div>
                  </div>

                  <div className="rounded-xl border p-4">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium">Measured progress</span>
                      <span className="text-muted-foreground">
                        {Math.round(selectedKpi.metrics?.achievementPercent || 0)}%
                      </span>
                    </div>
                    <Progress className="mt-3 h-2" value={toProgressValue(selectedKpi)} />
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border p-4 text-sm">
                      <div className="font-medium">Measurement setup</div>
                      <div className="mt-2 space-y-1 text-muted-foreground">
                        <div>Baseline: {selectedKpi.baselineText || "Not set"}</div>
                        <div>Weight: {selectedKpi.weight}</div>
                        <div>Review cadence: {titleCase(selectedKpi.reviewFrequency)}</div>
                        <div>Data source: {titleCase(selectedKpi.dataSourceType)}</div>
                      </div>
                    </div>
                    <div className="rounded-xl border p-4 text-sm">
                      <div className="font-medium">Thresholds</div>
                      <div className="mt-2 space-y-1 text-muted-foreground">
                        <div>Red: {selectedKpi.redThreshold ?? "Not set"}</div>
                        <div>Amber: {selectedKpi.amberThreshold ?? "Not set"}</div>
                        <div>Green: {selectedKpi.greenThreshold ?? "Not set"}</div>
                        <div>Band: {titleCase(selectedKpi.metrics?.thresholdBand)}</div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="font-medium">Measurement history</div>
                    {selectedKpi.history?.length ? (
                      selectedKpi.history.map((entry) => (
                        <div key={entry.id} className="rounded-xl border p-4">
                          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <div className="text-sm font-medium">{formatDateTime(entry.recordedAt)}</div>
                            <Badge variant="outline">{Math.round(entry.achievementPercent)}%</Badge>
                          </div>
                          <div className="mt-2 text-sm text-muted-foreground">
                            {entry.actual} / {entry.target} {selectedKpi.unit}
                          </div>
                          <div className="mt-1 text-sm text-muted-foreground">
                            {entry.note || "No note recorded."}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-muted-foreground">No KPI measurement history yet.</div>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-sm text-muted-foreground">Select a KPI to inspect its measurement model.</div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>My OKRs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {ownOkrs.length ? (
                ownOkrs.map((okr) => (
                  <div key={okr.id} className="rounded-lg border border-border/70 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium">{okr.objective}</div>
                      <Badge variant="outline">{titleCase(okr.status)}</Badge>
                    </div>
                    <Progress className="mt-4" value={Math.min(okr.progress, 100)} />
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">No OKRs configured.</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Development Goals</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {ownGoals.length ? (
                ownGoals.map((goal) => (
                  <div key={goal.id} className="rounded-lg border border-border/70 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium">{goal.title}</div>
                      <Badge variant="secondary">{titleCase(goal.status)}</Badge>
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">{goal.description}</div>
                    <Progress className="mt-4" value={Math.min(goal.progress, 100)} />
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">No development goals tracked.</div>
              )}
            </CardContent>
          </Card>
        </div>

        {canManageTeam ? (
          <Card>
            <CardHeader>
              <CardTitle>Manager Workspace</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
                <div className="space-y-4 rounded-xl border p-4">
                  <div className="text-lg font-medium">Create Measurable KPI</div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2 md:col-span-2">
                      <Label>Employee</Label>
                      <Select
                        value={createDraft.ownerProfileId || undefined}
                        onValueChange={(value) =>
                          setCreateDraft((current) => ({ ...current, ownerProfileId: value }))
                        }
                      >
                        <SelectTrigger data-testid="kpi-create-owner-trigger">
                          <SelectValue placeholder="Select employee" />
                        </SelectTrigger>
                        <SelectContent>
                          {peopleQuery.data?.map((person) => (
                            <SelectItem key={person.id} value={String(person.id)}>
                              {person.firstName} {person.lastName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Title</Label>
                      <Input
                        data-testid="kpi-create-title"
                        value={createDraft.title}
                        onChange={(event) =>
                          setCreateDraft((current) => ({ ...current, title: event.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Description</Label>
                      <Textarea
                        value={createDraft.description}
                        onChange={(event) =>
                          setCreateDraft((current) => ({ ...current, description: event.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Baseline</Label>
                      <Input
                        type="number"
                        value={createDraft.baseline}
                        onChange={(event) =>
                          setCreateDraft((current) => ({ ...current, baseline: event.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Target</Label>
                      <Input
                        type="number"
                        value={createDraft.target}
                        onChange={(event) =>
                          setCreateDraft((current) => ({ ...current, target: event.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Actual</Label>
                      <Input
                        type="number"
                        value={createDraft.actual}
                        onChange={(event) =>
                          setCreateDraft((current) => ({ ...current, actual: event.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Unit</Label>
                      <Input
                        value={createDraft.unit}
                        onChange={(event) =>
                          setCreateDraft((current) => ({ ...current, unit: event.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Weight</Label>
                      <Input
                        type="number"
                        value={createDraft.weight}
                        onChange={(event) =>
                          setCreateDraft((current) => ({ ...current, weight: event.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Due Date</Label>
                      <Input
                        type="date"
                        value={createDraft.dueDate}
                        onChange={(event) =>
                          setCreateDraft((current) => ({ ...current, dueDate: event.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Target Frequency</Label>
                      <Select
                        value={createDraft.targetFrequency}
                        onValueChange={(value) =>
                          setCreateDraft((current) => ({ ...current, targetFrequency: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FREQUENCY_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Target Type</Label>
                      <Select
                        value={createDraft.targetType}
                        onValueChange={(value) =>
                          setCreateDraft((current) => ({ ...current, targetType: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TARGET_TYPE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Red Threshold</Label>
                      <Input
                        type="number"
                        value={createDraft.redThreshold}
                        onChange={(event) =>
                          setCreateDraft((current) => ({ ...current, redThreshold: event.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Amber Threshold</Label>
                      <Input
                        type="number"
                        value={createDraft.amberThreshold}
                        onChange={(event) =>
                          setCreateDraft((current) => ({ ...current, amberThreshold: event.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Green Threshold</Label>
                      <Input
                        type="number"
                        value={createDraft.greenThreshold}
                        onChange={(event) =>
                          setCreateDraft((current) => ({ ...current, greenThreshold: event.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Review Frequency</Label>
                      <Select
                        value={createDraft.reviewFrequency}
                        onValueChange={(value) =>
                          setCreateDraft((current) => ({ ...current, reviewFrequency: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FREQUENCY_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="flex items-center justify-between rounded-lg border p-3 text-sm">
                      <span>Evidence required</span>
                      <Switch
                        checked={createDraft.evidenceRequired}
                        onCheckedChange={(checked) =>
                          setCreateDraft((current) => ({ ...current, evidenceRequired: checked }))
                        }
                      />
                    </label>
                    <label className="flex items-center justify-between rounded-lg border p-3 text-sm">
                      <span>Commentary required</span>
                      <Switch
                        checked={createDraft.commentaryRequired}
                        onCheckedChange={(checked) =>
                          setCreateDraft((current) => ({ ...current, commentaryRequired: checked }))
                        }
                      />
                    </label>
                  </div>

                  <Button
                    className="w-full"
                    onClick={() =>
                      createMutation.mutate({
                        ownerProfileId: createDraft.ownerProfileId ? Number(createDraft.ownerProfileId) : undefined,
                        title: createDraft.title,
                        description: createDraft.description,
                        baseline: Number(createDraft.baseline || 0),
                        target: Number(createDraft.target || 0),
                        actual: Number(createDraft.actual || 0),
                        unit: createDraft.unit,
                        weight: Number(createDraft.weight || 1),
                        dueDate: createDraft.dueDate || undefined,
                        targetFrequency: createDraft.targetFrequency,
                        targetType: createDraft.targetType,
                        reviewFrequency: createDraft.reviewFrequency,
                        redThreshold: createDraft.redThreshold ? Number(createDraft.redThreshold) : undefined,
                        amberThreshold: createDraft.amberThreshold ? Number(createDraft.amberThreshold) : undefined,
                        greenThreshold: createDraft.greenThreshold ? Number(createDraft.greenThreshold) : undefined,
                        evidenceRequired: createDraft.evidenceRequired,
                        commentaryRequired: createDraft.commentaryRequired,
                        dataSourceType: "manual",
                      })
                    }
                    disabled={createMutation.isPending}
                    data-testid="kpi-create-submit"
                  >
                    Create KPI
                  </Button>
                </div>

                <div className="space-y-4 rounded-xl border p-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Department Filter</Label>
                      <Select
                        value={teamFilters.departmentId}
                        onValueChange={(value) =>
                          setTeamFilters((current) => ({ ...current, departmentId: value }))
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
                      <Label>Status Filter</Label>
                      <Select
                        value={teamFilters.status}
                        onValueChange={(value) =>
                          setTeamFilters((current) => ({ ...current, status: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Statuses</SelectItem>
                          <SelectItem value="on_track">On Track</SelectItem>
                          <SelectItem value="at_risk">At Risk</SelectItem>
                          <SelectItem value="achieved">Achieved</SelectItem>
                          <SelectItem value="missed">Missed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Active Filter</Label>
                      <Select
                        value={teamFilters.isActive}
                        onValueChange={(value) =>
                          setTeamFilters((current) => ({ ...current, isActive: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="true">Active</SelectItem>
                          <SelectItem value="false">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] text-sm">
                      <thead className="text-left text-muted-foreground">
                        <tr>
                          <th className="pb-3 font-medium">Employee</th>
                          <th className="pb-3 font-medium">KPI</th>
                          <th className="pb-3 font-medium">Measured</th>
                          <th className="pb-3 font-medium">Progress</th>
                          <th className="pb-3 font-medium">Due</th>
                          <th className="pb-3 font-medium">Update</th>
                        </tr>
                      </thead>
                      <tbody>
                        {teamKpis.map((kpi) => {
                          const draft = getDraft(progressDrafts, kpi);
                          return (
                            <tr key={kpi.id} className="border-t border-border/60">
                              <td className="py-3">
                                <button
                                  type="button"
                                  className="text-left hover:text-primary"
                                  onClick={() => setSelectedKpiId(kpi.id)}
                                >
                                  {kpi.owner?.firstName} {kpi.owner?.lastName}
                                </button>
                              </td>
                              <td className="py-3">
                                <div className="font-medium">{kpi.title}</div>
                                <div className="text-xs text-muted-foreground">{titleCase(kpi.targetType)}</div>
                              </td>
                              <td className="py-3">
                                {kpi.actual} / {kpi.target} {kpi.unit}
                              </td>
                              <td className="py-3">
                                <div className="min-w-[140px]">
                                  <Badge variant="outline">{titleCase(kpi.status)}</Badge>
                                  <Progress className="mt-2 h-2" value={toProgressValue(kpi)} />
                                </div>
                              </td>
                              <td className="py-3">{formatDate(kpi.dueDate)}</td>
                              <td className="py-3">
                                <div className="grid gap-2 md:grid-cols-[110px_1fr_auto]">
                                  <Input
                                    data-testid={`kpi-progress-actual-${kpi.id}`}
                                    type="number"
                                    value={draft.actual}
                                    onChange={(event) =>
                                      setProgressDrafts((current) => ({
                                        ...current,
                                        [kpi.id]: { ...draft, actual: event.target.value },
                                      }))
                                    }
                                  />
                                  <Input
                                    data-testid={`kpi-progress-note-${kpi.id}`}
                                    value={draft.note}
                                    placeholder="Implementation note"
                                    onChange={(event) =>
                                      setProgressDrafts((current) => ({
                                        ...current,
                                        [kpi.id]: { ...draft, note: event.target.value },
                                      }))
                                    }
                                  />
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => saveProgress(kpi)}
                                    disabled={progressMutation.isPending}
                                    data-testid={`kpi-progress-save-${kpi.id}`}
                                  >
                                    Save
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {(ownDashboardQuery.data?.summary?.overdue || 0) > 0 && (
          <Card className="border-amber-200 bg-amber-50/40">
            <CardContent className="flex items-start gap-3 py-4">
              <AlertCircle className="mt-0.5 h-5 w-5 text-amber-700" />
              <div className="text-sm text-amber-900">
                Some KPIs are overdue. Review the KPI detail panel and add an update with context so the measurement
                history stays defensible.
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
