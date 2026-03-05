import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Target } from "lucide-react";
import { kpiCascadeV2API } from "@/lib/api";

interface KpiProgressPanelProps {
  title?: string;
  description?: string;
  className?: string;
}

type EmployeeKpiRow = {
  id: number;
  title: string;
  description?: string | null;
  target?: number;
  actual?: number;
  percent_complete?: number;
  rag?: string;
  bsc_tag?: string;
  due_date?: string | null;
  state?: string;
  ack_required?: boolean;
  acknowledged_at?: string | null;
};

const defaultTitle = "My KPI Progress";
const defaultDescription = "Track assigned KPI cards and submit evidence-backed progress updates.";

const resolveProfileId = (user: any): number | null => {
  const candidate = user?.profile_id ?? user?.profileId ?? user?.profile?.id;
  const parsed = Number(candidate);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const ragBadgeClass = (rag: string) => {
  const normalized = String(rag || "").toLowerCase();
  if (normalized === "green") return "bg-emerald-100 text-emerald-700";
  if (normalized === "amber" || normalized === "yellow") return "bg-amber-100 text-amber-700";
  if (normalized === "red") return "bg-rose-100 text-rose-700";
  return "bg-slate-100 text-slate-700";
};

export default function KpiProgressPanel({
  title = defaultTitle,
  description = defaultDescription,
  className,
}: KpiProgressPanelProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const profileId = useMemo(() => resolveProfileId(user), [user]);

  const [kpis, setKpis] = useState<EmployeeKpiRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [drafts, setDrafts] = useState<Record<number, { actual: string; comment: string }>>({});
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [acking, setAcking] = useState<Record<number, boolean>>({});

  const loadKpis = async () => {
    if (!profileId) return;
    try {
      setLoading(true);
      const response = await kpiCascadeV2API.getEmployeeKpis(profileId);
      const rows = Array.isArray(response) ? response : [];
      setKpis(rows as EmployeeKpiRow[]);
      setDrafts((prev) => {
        const next = { ...prev };
        rows.forEach((row: any) => {
          if (!next[row.id]) {
            next[row.id] = {
              actual:
                row?.actual !== undefined && row?.actual !== null
                  ? String(row.actual)
                  : "",
              comment: "",
            };
          }
        });
        return next;
      });
    } catch (error: any) {
      if (error?.status === 404) return;
      toast({
        variant: "destructive",
        title: "Error loading KPI progress",
        description: error?.message || "Failed to load KPI cards.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKpis();
  }, [profileId]); // eslint-disable-line react-hooks/exhaustive-deps

  const acknowledge = async (kpiId: number) => {
    try {
      setAcking((prev) => ({ ...prev, [kpiId]: true }));
      await kpiCascadeV2API.acknowledgeEmployeeKpi(kpiId);
      toast({ title: "KPI acknowledged" });
      await loadKpis();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Acknowledgement failed",
        description: error?.message || "Failed to acknowledge KPI.",
      });
    } finally {
      setAcking((prev) => ({ ...prev, [kpiId]: false }));
    }
  };

  const submitUpdate = async (kpiId: number) => {
    const draft = drafts[kpiId] || { actual: "", comment: "" };
    const parsed = Number(draft.actual);
    if (!Number.isFinite(parsed)) {
      toast({
        variant: "destructive",
        title: "Invalid value",
        description: "Enter a valid numeric actual value.",
      });
      return;
    }

    try {
      setSaving((prev) => ({ ...prev, [kpiId]: true }));
      await kpiCascadeV2API.submitUpdate({
        employeeKpiId: kpiId,
        actualValue: parsed,
        comment: draft.comment || undefined,
      });
      toast({ title: "Progress updated" });
      await loadKpis();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Update failed",
        description: error?.message || "Failed to submit KPI update.",
      });
    } finally {
      setSaving((prev) => ({ ...prev, [kpiId]: false }));
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
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading KPI cards...</div>
        ) : kpis.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            No KPI cards assigned yet.
          </div>
        ) : (
          kpis.map((kpi) => {
            const percent = Number(kpi.percent_complete || 0);
            const actual = Number(kpi.actual || 0);
            const target = Number(kpi.target || 0);
            const needsAck = Boolean(kpi.ack_required && !kpi.acknowledged_at);
            const dueText = kpi.due_date ? new Date(kpi.due_date).toLocaleDateString() : "-";
            const draft = drafts[kpi.id] || { actual: "", comment: "" };

            return (
              <div key={kpi.id} className="rounded-lg border p-4 space-y-3">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="font-medium">{kpi.title}</div>
                    {kpi.description ? (
                      <div className="text-xs text-muted-foreground">{kpi.description}</div>
                    ) : null}
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>BSC: {kpi.bsc_tag || "-"}</span>
                      <span>State: {kpi.state || "-"}</span>
                      <span>Due: {dueText}</span>
                    </div>
                  </div>
                  <Badge className={ragBadgeClass(String(kpi.rag || ""))}>
                    {(kpi.rag || "N/A").toUpperCase()}
                  </Badge>
                </div>

                <div className="grid gap-3 text-sm md:grid-cols-3">
                  <div>
                    <div className="text-xs text-muted-foreground">Target</div>
                    <div className="font-medium">{target}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Actual</div>
                    <div className="font-medium">{actual}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Complete</div>
                    <div className="font-medium">{percent.toFixed(1)}%</div>
                  </div>
                </div>

                <Progress value={Math.max(0, Math.min(100, percent))} className="h-2" />

                {needsAck ? (
                  <Button
                    size="sm"
                    onClick={() => acknowledge(kpi.id)}
                    disabled={Boolean(acking[kpi.id])}
                  >
                    {acking[kpi.id] ? "Acknowledging..." : "Acknowledge KPI"}
                  </Button>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      type="number"
                      value={draft.actual}
                      onChange={(event) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [kpi.id]: {
                            ...prev[kpi.id],
                            actual: event.target.value,
                          },
                        }))
                      }
                      placeholder="Actual value"
                      className="w-40"
                    />
                    <Input
                      value={draft.comment}
                      onChange={(event) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [kpi.id]: {
                            ...prev[kpi.id],
                            comment: event.target.value,
                          },
                        }))
                      }
                      placeholder="Comment (optional)"
                      className="w-64"
                    />
                    <Button
                      size="sm"
                      onClick={() => submitUpdate(kpi.id)}
                      disabled={Boolean(saving[kpi.id])}
                    >
                      {saving[kpi.id] ? "Updating..." : "Submit Update"}
                    </Button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
