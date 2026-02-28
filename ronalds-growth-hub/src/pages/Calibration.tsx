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

const Calibration = () => {
  const { toast } = useToast();
  const [cycleId, setCycleId] = useState<string>("");
  const [departmentId, setDepartmentId] = useState<string>("");
  const [items, setItems] = useState<CalibrationItem[]>([]);
  const [recentCalibrations, setRecentCalibrations] = useState<AuditLogItem[]>([]);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [cycles, setCycles] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [stats, setStats] = useState<{ mean: number; stdDev: number; count: number }>({
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

  const loadRecentCalibrations = async () => {
    try {
      const response: any = await apiFetch("GET", "/audit-logs?limit=80");
      const rows = Array.isArray(response) ? response : response?.data || [];
      const filtered = rows.filter(
        (item: AuditLogItem) =>
          item?.action === "calibration:update" || item?.entity_type === "performance_score"
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
    loadRecentCalibrations();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
                      {cycle.name || `Cycle ${cycle.id}`}
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
              <Button onClick={loadData}>Refresh</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Calibration Summary</CardTitle>
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
                    <p className="text-sm font-medium">Calibration update</p>
                    <p className="text-xs text-muted-foreground">
                      {item.created_at ? new Date(item.created_at).toLocaleString() : "Unknown time"}
                    </p>
                    {(item.metadata?.calibratedScore !== undefined ||
                      item.metadata?.calibrationNote) && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Score:{" "}
                        {item.metadata?.calibratedScore !== undefined
                          ? item.metadata.calibratedScore
                          : "--"}
                        {item.metadata?.calibrationNote
                          ? ` â€¢ ${item.metadata.calibrationNote}`
                          : ""}
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
