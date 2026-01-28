import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/integrations/apiClient";
import { Badge } from "@/components/ui/badge";

type CalibrationItem = {
  id: number;
  totalScore: number;
  calibratedScore?: number | null;
  calibrationNote?: string | null;
  zScore: number;
  isOutlier: boolean;
  employee?: { id: number; firstName: string; lastName: string; department?: { name: string } | null };
};

const Calibration = () => {
  const { toast } = useToast();
  const [cycleId, setCycleId] = useState<string>("");
  const [departmentId, setDepartmentId] = useState<string>("");
  const [items, setItems] = useState<CalibrationItem[]>([]);
  const [savingId, setSavingId] = useState<number | null>(null);

  const stats = useMemo(() => {
    const scores = items.map((item) => item.totalScore || 0);
    if (scores.length === 0) return { mean: 0, count: 0 };
    const mean = scores.reduce((sum, value) => sum + value, 0) / scores.length;
    return { mean: Math.round(mean * 100) / 100, count: scores.length };
  }, [items]);

  const loadData = async () => {
    try {
      const params = new URLSearchParams();
      if (cycleId) params.append("evaluationCycleId", cycleId);
      if (departmentId) params.append("departmentId", departmentId);
      const query = params.toString();
      const response: any = await apiFetch("GET", `/calibration/scores${query ? `?${query}` : ""}`);
      const data = response?.data?.items || response?.data || response || [];
      setItems(Array.isArray(data) ? data : []);
    } catch (error: any) {
      toast({
        title: "Failed to load calibration scores",
        description: error?.message || "Unable to load calibration list",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    loadData();
  }, []);

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
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Evaluation Cycle ID</Label>
              <Input
                value={cycleId}
                onChange={(event) => setCycleId(event.target.value)}
                placeholder="Optional cycle id"
              />
            </div>
            <div className="space-y-2">
              <Label>Department ID</Label>
              <Input
                value={departmentId}
                onChange={(event) => setDepartmentId(event.target.value)}
                placeholder="Optional department id"
              />
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
              Mean score: {stats.mean} • Employees: {stats.count}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {items.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No performance scores available for calibration.
              </div>
            ) : (
              items.map((item) => (
                <div key={item.id} className="rounded-lg border border-border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">
                        {item.employee?.firstName} {item.employee?.lastName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Dept: {item.employee?.department?.name || "—"} • Score: {item.totalScore}
                      </p>
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
      </div>
    </DashboardLayout>
  );
};

export default Calibration;
