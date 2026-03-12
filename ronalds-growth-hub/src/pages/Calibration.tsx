import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNavigate } from "react-router-dom";

type CalibrationItem = {
  id: number;
  totalScore: number;
  calibratedScore?: number | null;
  calibrationNote?: string | null;
  zScore: number;
  isOutlier: boolean;
  employee?: { id: number; firstName: string; lastName: string; department?: { name: string } | null };
  calibratedBy?: { firstName: string; lastName: string } | null;
  calibratedAt?: string | null;
};

type AuditLogItem = {
  id: number;
  action: string;
  entity_type?: string;
  entity_id?: number | null;
  user_id?: string | null;
  ip_address?: string | null;
  metadata?: any;
  employee_name?: string | null;
  created_at?: string;
};

type AssignmentCalibrationItem = {
  id: number;
  evaluatorType: string;
  status: string;
  scoreValue: number;
  zScore: number;
  isOutlier: boolean;
  submittedAt?: string | null;
  evaluatorComments?: string | null;
  rejectionReason?: string | null;
  definition?: {
    id: number;
    name: string;
    cycle?: {
      id: number;
      cycleName?: string | null;
      status?: string;
    } | null;
  } | null;
  evaluator?: {
    id: number;
    firstName: string;
    lastName: string;
    positionTitle?: string | null;
  } | null;
  evaluatee?: {
    id: number;
    firstName: string;
    lastName: string;
    positionTitle?: string | null;
    department?: { id: number; name: string } | null;
  } | null;
};

const Calibration = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("assignments");
  const [cycleId, setCycleId] = useState<string>("");
  const [departmentId, setDepartmentId] = useState<string>("");
  const [items, setItems] = useState<CalibrationItem[]>([]);
  const [assignmentItems, setAssignmentItems] = useState<AssignmentCalibrationItem[]>([]);
  const [recentCalibrations, setRecentCalibrations] = useState<AuditLogItem[]>([]);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [reopeningId, setReopeningId] = useState<number | null>(null);
  const [reopenReasons, setReopenReasons] = useState<Record<number, string>>({});
  const [cycles, setCycles] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [stats, setStats] = useState<{ mean: number; stdDev: number; count: number }>({
    mean: 0,
    stdDev: 0,
    count: 0,
  });
  const [assignmentStats, setAssignmentStats] = useState<{
    mean: number;
    stdDev: number;
    count: number;
  }>({
    mean: 0,
    stdDev: 0,
    count: 0,
  });
  const [outliersOnly, setOutliersOnly] = useState(false);

  const loadLookups = async () => {
    try {
      const [cycleRes, deptRes]: any[] = await Promise.all([
        apiFetch("GET", "/evaluation-cycles"),
        apiFetch("GET", "/departments"),
      ]);
      const cycleItems = cycleRes?.data || cycleRes || [];
      const deptItems = deptRes?.data || deptRes || [];
      setCycles(Array.isArray(cycleItems) ? cycleItems : []);
      setDepartments(Array.isArray(deptItems) ? deptItems : []);
    } catch (error: any) {
      toast({
        title: "Failed to load filters",
        description: error?.message || "Unable to load cycles or departments",
        variant: "destructive",
      });
    }
  };

  const loadData = async () => {
    try {
      const params = new URLSearchParams();
      if (cycleId) params.append("evaluationCycleId", cycleId);
      if (departmentId) params.append("departmentId", departmentId);
      const query = params.toString();
      const response: any = await apiFetch("GET", `/calibration/scores${query ? `?${query}` : ""}`);
      const payload = response?.data || response || {};
      const data = payload?.items || payload;
      setItems(Array.isArray(data) ? data : []);
      if (payload?.stats) {
        setStats({
          mean: payload.stats.mean ?? 0,
          stdDev: payload.stats.stdDev ?? 0,
          count: payload.stats.count ?? (Array.isArray(data) ? data.length : 0),
        });
      } else {
        setStats((prev) => ({ ...prev, count: Array.isArray(data) ? data.length : 0 }));
      }
    } catch (error: any) {
      toast({
        title: "Failed to load calibration scores",
        description: error?.message || "Unable to load calibration list",
        variant: "destructive",
      });
    }
  };

  const loadAssignmentData = async () => {
    try {
      const params = new URLSearchParams();
      if (cycleId) params.append("evaluationCycleId", cycleId);
      if (departmentId) params.append("departmentId", departmentId);
      const query = params.toString();
      const response: any = await apiFetch(
        "GET",
        `/calibration/assignments${query ? `?${query}` : ""}`
      );
      const payload = response?.data || response || {};
      const rows = Array.isArray(payload?.items) ? payload.items : [];
      setAssignmentItems(rows);
      setAssignmentStats({
        mean: payload?.stats?.mean ?? 0,
        stdDev: payload?.stats?.stdDev ?? 0,
        count: payload?.stats?.count ?? rows.length,
      });
    } catch (error: any) {
      toast({
        title: "Failed to load submitted evaluations",
        description: error?.message || "Unable to load submitted evaluation assignments",
        variant: "destructive",
      });
    }
  };

  const loadRecentCalibrations = async () => {
    try {
      const response: any = await apiFetch("GET", "/audit-logs?limit=80");
      const rows = Array.isArray(response) ? response : response?.data || [];
      const filtered = rows.filter(
        (item: AuditLogItem) =>
          item?.action === "calibration:update" ||
          item?.action === "evaluation_assignment.reopened" ||
          item?.entity_type === "performance_score" ||
          item?.entity_type === "evaluation_assignment"
      );
      setRecentCalibrations(filtered.slice(0, 6));
    } catch (error: any) {
      // avoid blocking the page on audit log load
      setRecentCalibrations([]);
    }
  };

  useEffect(() => {
    loadLookups();
    loadData();
    loadAssignmentData();
    loadRecentCalibrations();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void loadData();
    void loadAssignmentData();
  }, [cycleId, departmentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async (item: CalibrationItem) => {
    try {
      setSavingId(item.id);
      const response: any = await apiFetch("PATCH", `/calibration/scores/${item.id}`, {
        calibratedScore: item.calibratedScore,
        calibrationNote: item.calibrationNote,
      });
      toast({ title: "Calibration saved" });
      const updated = response?.data || response;
      setItems((prev) =>
        prev.map((entry) => (entry.id === item.id ? { ...entry, ...updated } : entry))
      );
    } catch (error: any) {
      toast({
        title: "Failed to save calibration",
        description: error?.message || "Unable to update calibration",
        variant: "destructive",
      });
    } finally {
      setSavingId(null);
    }
  };

  const handleReopenAssignment = async (assignmentId: number) => {
    try {
      setReopeningId(assignmentId);
      await apiFetch("PATCH", `/calibration/assignments/${assignmentId}/reopen`, {
        reason: reopenReasons[assignmentId]?.trim() || undefined,
      });
      toast({ title: "Evaluation reopened" });
      setReopenReasons((current) => ({ ...current, [assignmentId]: "" }));
      await loadAssignmentData();
      await loadRecentCalibrations();
    } catch (error: any) {
      toast({
        title: "Failed to reopen evaluation",
        description: error?.message || "Unable to return evaluation for updates",
        variant: "destructive",
      });
    } finally {
      setReopeningId(null);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Calibration Review</h1>
          <p className="text-sm text-muted-foreground">
            Review score outliers and apply calibration adjustments.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>Load evaluation cycle or department-specific scores.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label>Evaluation Cycle</Label>
              <Select value={cycleId || "all"} onValueChange={(value) => setCycleId(value === "all" ? "" : value)}>
                <SelectTrigger>
                  <SelectValue placeholder="All cycles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All cycles</SelectItem>
                  {cycles.map((cycle) => (
                    <SelectItem key={cycle.id} value={String(cycle.id)}>
                      {cycle.cycleName || cycle.name || `Cycle ${cycle.id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Department</Label>
              <Select
                value={departmentId || "all"}
                onValueChange={(value) => setDepartmentId(value === "all" ? "" : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All departments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All departments</SelectItem>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={String(dept.id)}>
                      {dept.name || `Department ${dept.id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-3">
              <div className="flex items-center gap-2">
                <Switch checked={outliersOnly} onCheckedChange={setOutliersOnly} />
                <Label>Outliers only</Label>
              </div>
            </div>
            <div className="flex items-end">
              <Button
                onClick={() => {
                  void loadData();
                  void loadAssignmentData();
                  void loadRecentCalibrations();
                }}
              >
                Refresh
              </Button>
            </div>
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="assignments">Submitted Evaluations</TabsTrigger>
            <TabsTrigger value="scores">Performance Scores</TabsTrigger>
          </TabsList>

          <TabsContent value="assignments" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Submitted Evaluation Review</CardTitle>
                <CardDescription>
                  Mean score: {assignmentStats.mean} - Std dev: {assignmentStats.stdDev} - Submitted
                  evaluations: {assignmentStats.count}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {(outliersOnly
                  ? assignmentItems.filter((item) => item.isOutlier)
                  : assignmentItems
                ).length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    No submitted evaluations are available for review.
                  </div>
                ) : (
                  (outliersOnly
                    ? assignmentItems.filter((item) => item.isOutlier)
                    : assignmentItems
                  ).map((item) => (
                    <div key={item.id} className="rounded-lg border border-border p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="text-sm font-semibold">
                            {item.evaluatee?.firstName} {item.evaluatee?.lastName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Workflow: {item.definition?.name || "Evaluation"} - Evaluator:{" "}
                            {item.evaluator?.firstName} {item.evaluator?.lastName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Department: {item.evaluatee?.department?.name || "--"} - Submitted:{" "}
                            {item.submittedAt
                              ? new Date(item.submittedAt).toLocaleDateString()
                              : "--"}
                          </p>
                          {item.evaluatorComments && (
                            <p className="text-xs text-muted-foreground">
                              Comments: {item.evaluatorComments}
                            </p>
                          )}
                          {item.rejectionReason && (
                            <p className="text-xs text-destructive">
                              Last reopen reason: {item.rejectionReason}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={item.isOutlier ? "destructive" : "secondary"}>
                            z {item.zScore}
                          </Badge>
                          <Badge variant="outline">{item.scoreValue}%</Badge>
                          <Badge variant="outline">
                            {String(item.evaluatorType || "custom").replace("_", " ")}
                          </Badge>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto_auto]">
                        <Input
                          value={reopenReasons[item.id] ?? ""}
                          onChange={(event) =>
                            setReopenReasons((current) => ({
                              ...current,
                              [item.id]: event.target.value,
                            }))
                          }
                          placeholder="Review point for the evaluator"
                        />
                        <Button
                          variant="outline"
                          onClick={() => navigate(`/evaluation/${item.id}`)}
                        >
                          View
                        </Button>
                        <Button
                          onClick={() => void handleReopenAssignment(item.id)}
                          disabled={reopeningId === item.id}
                        >
                          {reopeningId === item.id ? "Reopening..." : "Return for updates"}
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="scores" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Performance Score Calibration</CardTitle>
                <CardDescription>
                  Mean score: {stats.mean} - Std dev: {stats.stdDev} - Employees: {stats.count}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {(outliersOnly ? items.filter((item) => item.isOutlier) : items).length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    No performance scores available for calibration.
                  </div>
                ) : (
                  (outliersOnly ? items.filter((item) => item.isOutlier) : items).map((item) => (
                    <div key={item.id} className="rounded-lg border border-border p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">
                            {item.employee?.firstName} {item.employee?.lastName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Dept: {item.employee?.department?.name || "--"} - Score: {item.totalScore}
                          </p>
                          {(item.calibratedBy || item.calibratedAt) && (
                            <p className="text-xs text-muted-foreground">
                              Calibrated by:{" "}
                              {item.calibratedBy
                                ? `${item.calibratedBy.firstName} ${item.calibratedBy.lastName}`
                                : "--"}{" "}
                              - {item.calibratedAt ? new Date(item.calibratedAt).toLocaleDateString() : "--"}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={item.isOutlier ? "destructive" : "secondary"}>
                            z {item.zScore}
                          </Badge>
                          {item.calibratedScore !== null && item.calibratedScore !== undefined && (
                            <Badge variant="outline">Calibrated</Badge>
                          )}
                        </div>
                      </div>
                      <div className="mt-4 grid gap-4 md:grid-cols-3">
                        <div className="space-y-2">
                          <Label>Calibrated Score</Label>
                          <Input
                            type="number"
                            value={item.calibratedScore ?? ""}
                            onChange={(event) =>
                              setItems((prev) =>
                                prev.map((entry) =>
                                  entry.id === item.id
                                    ? { ...entry, calibratedScore: Number(event.target.value) }
                                    : entry
                                )
                              )
                            }
                            placeholder="Leave blank to clear"
                          />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <Label>Calibration Note</Label>
                          <Input
                            value={item.calibrationNote ?? ""}
                            onChange={(event) =>
                              setItems((prev) =>
                                prev.map((entry) =>
                                  entry.id === item.id
                                    ? { ...entry, calibrationNote: event.target.value }
                                    : entry
                                )
                              )
                            }
                            placeholder="Reason for adjustment"
                          />
                        </div>
                      </div>
                      <div className="mt-4">
                        <Button
                          size="sm"
                          onClick={() => handleSave(item)}
                          disabled={savingId === item.id}
                        >
                          {savingId === item.id ? "Saving..." : "Save Calibration"}
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Card>
          <CardHeader>
            <CardTitle>Recent Calibrations</CardTitle>
            <CardDescription>Latest adjustments captured in the audit log.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentCalibrations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No calibration updates yet.</p>
            ) : (
              recentCalibrations.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <p className="text-sm font-medium">
                      {item.action === "evaluation_assignment.reopened"
                        ? "Evaluation reopened"
                        : "Calibration update"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.created_at ? new Date(item.created_at).toLocaleString() : "Unknown time"}
                    </p>
                    {(item.metadata?.calibratedScore !== undefined ||
                      item.metadata?.calibrationNote ||
                      item.metadata?.reason) && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {item.metadata?.calibratedScore !== undefined
                          ? `Score: ${item.metadata.calibratedScore}`
                          : "No score adjustment"}
                        {item.metadata?.calibrationNote
                          ? ` | ${item.metadata.calibrationNote}`
                          : ""}
                        {item.metadata?.reason ? ` | ${item.metadata.reason}` : ""}
                      </p>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {item.employee_name ? item.employee_name : item.user_id ? `User ${item.user_id}` : "System"}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Calibration;
