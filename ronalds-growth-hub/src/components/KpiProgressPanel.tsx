import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Target } from "lucide-react";

interface KpiProgressPanelProps {
  title?: string;
  description?: string;
  className?: string;
}

const defaultTitle = "My KPI Progress";
const defaultDescription =
  "Track assigned KPIs and whether you are meeting targets.";

export default function KpiProgressPanel({
  title = defaultTitle,
  description = defaultDescription,
  className,
}: KpiProgressPanelProps) {
  const { toast } = useToast();
  const [kpiAssignments, setKpiAssignments] = useState<any[]>([]);
  const [kpiLoading, setKpiLoading] = useState(false);
  const [kpiProgress, setKpiProgress] = useState<Record<number, string>>({});
  const [kpiUpdating, setKpiUpdating] = useState<Record<number, boolean>>({});

  useEffect(() => {
    loadKpiAssignments();
  }, []);

  const loadKpiAssignments = async () => {
    try {
      setKpiLoading(true);
      const response = await apiFetch("GET", "/employee-kpi-assignments/my?includeTracking=true");
      const assignments = Array.isArray(response) ? response : response?.data ?? [];
      setKpiAssignments(assignments || []);

      const defaults: Record<number, string> = {};
      (assignments || []).forEach((assignment: any) => {
        const achieved = assignment?.achievedValue ?? assignment?.achieved_value;
        if (achieved !== undefined && achieved !== null) {
          defaults[assignment.id] = String(achieved);
        }
      });
      setKpiProgress((prev) => ({ ...defaults, ...prev }));
    } catch (error: any) {
      if (error?.status === 404) return;
      toast({
        variant: "destructive",
        title: "Error loading KPI progress",
        description: error.message,
      });
    } finally {
      setKpiLoading(false);
    }
  };

  const handleProgressUpdate = async (assignmentId: number) => {
    const rawValue = kpiProgress[assignmentId];
    if (rawValue === undefined || rawValue === null || rawValue === "") {
      toast({
        variant: "destructive",
        title: "Missing actual value",
        description: "Enter an actual value before updating progress.",
      });
      return;
    }

    const parsedValue = Number(rawValue);
    if (!Number.isFinite(parsedValue)) {
      toast({
        variant: "destructive",
        title: "Invalid value",
        description: "Actual value must be a valid number.",
      });
      return;
    }

    setKpiUpdating((prev) => ({ ...prev, [assignmentId]: true }));
    try {
      await apiFetch("POST", `/employee-kpi-assignments/${assignmentId}/progress`, {
        value: parsedValue,
      });
      toast({
        title: "Progress updated",
        description: "Your KPI actuals have been recorded.",
      });
      await loadKpiAssignments();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Update failed",
        description: error.message,
      });
    } finally {
      setKpiUpdating((prev) => ({ ...prev, [assignmentId]: false }));
    }
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {kpiLoading ? (
          <div className="text-sm text-muted-foreground">Loading KPI progress...</div>
        ) : kpiAssignments.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            No KPI assignments yet. Once KPIs are assigned, progress will show here.
          </div>
        ) : (
          kpiAssignments.map((assignment) => {
            const kpi = assignment?.kpi || {};
            const tracking = assignment?.tracking || {};
            const rawTarget =
              tracking?.targetValue ??
              assignment?.targetValue ??
              assignment?.target_value ??
              kpi?.targetValue ??
              null;
            const rawAchieved =
              tracking?.achievedValue ??
              assignment?.achievedValue ??
              assignment?.achieved_value ??
              null;
            const rawDerivedAchieved = tracking?.derivedAchievedValueFromOkrs ?? null;
            const targetValue = Number(rawTarget ?? 0);
            const achievedValue = Number(rawAchieved ?? 0);
            const hasTarget = rawTarget !== null && rawTarget !== undefined && Number.isFinite(targetValue);
            const hasActual = rawAchieved !== null && rawAchieved !== undefined && Number.isFinite(achievedValue);
            const hasDerivedActual =
              rawDerivedAchieved !== null &&
              rawDerivedAchieved !== undefined &&
              Number.isFinite(Number(rawDerivedAchieved));
            const resolvedAchievedValue = hasActual
              ? achievedValue
              : hasDerivedActual
              ? Number(rawDerivedAchieved)
              : 0;
            const percent =
              typeof tracking?.progressPercent === "number"
                ? tracking.progressPercent
                : hasTarget && targetValue > 0
                ? Math.min(100, (resolvedAchievedValue / targetValue) * 100)
                : 0;
            const isMet = hasTarget && targetValue > 0 && resolvedAchievedValue >= targetValue;
            const unit = kpi?.measurementUnit || "";
            const okrCompletionPercent = Number(tracking?.okr?.overallCompletionPercent ?? 0);
            const okrObjectiveCount = Number(tracking?.okr?.objectiveCount ?? 0);

            return (
              <div key={assignment.id} className="rounded-lg border p-4 space-y-3">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="font-medium">{kpi?.name || "KPI"}</div>
                    <div className="text-xs text-muted-foreground">
                      {kpi?.description || "No description provided"}
                    </div>
                  </div>
                  <Badge className={isMet ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}>
                    {isMet ? "Met" : "Not Met"}
                  </Badge>
                </div>

                <div className="grid gap-3 text-sm md:grid-cols-3">
                  <div>
                    <div className="text-xs text-muted-foreground">Target</div>
                    <div className="font-medium">
                      {hasTarget ? `${targetValue} ${unit}` : "No target"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Actual</div>
                    <div className="font-medium">
                      {hasActual
                        ? `${achievedValue} ${unit}`
                        : hasDerivedActual
                        ? `${Number(rawDerivedAchieved).toFixed(2)} ${unit} (from OKRs)`
                        : "Not set"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Cadence</div>
                    <div className="font-medium">
                      {assignment?.targetFrequency || kpi?.targetFrequency || "Not set"}
                    </div>
                  </div>
                </div>

                <Progress value={percent} className="h-2" />
                {okrObjectiveCount > 0 && (
                  <div className="text-xs text-muted-foreground">
                    Linked OKRs: {okrObjectiveCount} objective(s), {okrCompletionPercent.toFixed(1)}% completion
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="number"
                    value={kpiProgress[assignment.id] ?? ""}
                    onChange={(event) =>
                      setKpiProgress((prev) => ({
                        ...prev,
                        [assignment.id]: event.target.value,
                      }))
                    }
                    placeholder="Update actual"
                    className="w-40"
                  />
                  <Button
                    size="sm"
                    onClick={() => handleProgressUpdate(assignment.id)}
                    disabled={Boolean(kpiUpdating[assignment.id])}
                  >
                    {kpiUpdating[assignment.id] ? "Updating..." : "Update"}
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
