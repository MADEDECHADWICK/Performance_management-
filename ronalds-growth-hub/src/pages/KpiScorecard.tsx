import { useEffect, useState, useMemo } from "react";
import { Building2, Users, TrendingUp, RefreshCw, ChevronRight, AlertCircle, Handshake } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { BarChart, Bar, XAxis, YAxis, Cell, Tooltip, ResponsiveContainer } from "recharts";
import {
  kpiCascadeApi,
  type KpiPeriod,
  type OrgScorecard,
  type DepartmentScorecard,
  type PartnerScorecard,
  type Department,
  type Partner,
  type KpiStatus,
} from "@/lib/api/kpiCascade";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const statusColor: Record<KpiStatus, string> = {
  on_track: "bg-emerald-100 text-emerald-800 border-emerald-200",
  at_risk: "bg-amber-100 text-amber-800 border-amber-200",
  off_track: "bg-red-100 text-red-800 border-red-200",
  no_data: "bg-muted text-muted-foreground border-border",
};

const statusLabel: Record<KpiStatus, string> = {
  on_track: "On Track",
  at_risk: "At Risk",
  off_track: "Off Track",
  no_data: "No Data",
};

const scoreBarColor = (score: number | null) => {
  if (score === null) return "bg-muted";
  if (score >= 80) return "bg-emerald-500";
  if (score >= 60) return "bg-amber-500";
  return "bg-red-500";
};

const scoreToStatus = (score: number | null): KpiStatus => {
  if (score === null) return "no_data";
  if (score >= 80) return "on_track";
  if (score >= 60) return "at_risk";
  return "off_track";
};

function ScoreBar({ score }: { score: number | null }) {
  const pct = score ?? 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${scoreBarColor(score)}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <span className="text-xs font-medium tabular-nums w-8 text-right text-foreground">
        {score !== null ? `${score}%` : "—"}
      </span>
    </div>
  );
}

function StatusBadge({ status }: { status: KpiStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${statusColor[status]}`}
    >
      {statusLabel[status]}
    </span>
  );
}

function RadialGauge({ score, size = 72 }: { score: number | null; size?: number }) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, score ?? 0));
  const offset = circ - (pct / 100) * circ;
  const color = score === null ? "#cbd5e1" : score >= 80 ? "#10b981" : score >= 60 ? "#f59e0b" : "#ef4444";
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth="7" />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={color} strokeWidth="7"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs font-bold tabular-nums" style={{ color }}>
          {score !== null ? `${score}%` : "—"}
        </span>
      </div>
    </div>
  );
}

const cellBg = (status: KpiStatus) => {
  switch (status) {
    case "on_track": return "bg-emerald-50/70";
    case "at_risk": return "bg-amber-50/70";
    case "off_track": return "bg-red-50/70";
    default: return "";
  }
};

function DeptRankingChart({ departments }: { departments: OrgScorecard["departments"] }) {
  const data = [...departments]
    .sort((a, b) => (b.overallScore ?? 0) - (a.overallScore ?? 0))
    .map((d) => ({
      name: d.departmentName.length > 18 ? d.departmentName.slice(0, 16) + "…" : d.departmentName,
      score: d.overallScore ?? 0,
      status: scoreToStatus(d.overallScore),
    }));

  const barFill = (status: KpiStatus) => {
    if (status === "on_track") return "#10b981";
    if (status === "at_risk") return "#f59e0b";
    if (status === "off_track") return "#ef4444";
    return "#94a3b8";
  };

  if (data.length === 0) return null;

  return (
    <div className="rounded-xl border border-border/70 bg-card p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4">Department Rankings</h3>
      <ResponsiveContainer width="100%" height={Math.max(100, data.length * 38)}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 48, left: 0, bottom: 0 }}>
          <XAxis
            type="number"
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={120}
            tick={{ fontSize: 12, fill: "#64748b" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            formatter={(v: number) => [`${v}%`, "Score"]}
            contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }}
          />
          <Bar dataKey="score" radius={[0, 6, 6, 0]} maxBarSize={22}>
            {data.map((entry, i) => (
              <Cell key={i} fill={barFill(entry.status)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ScoreCard({
  label,
  score,
  sub,
}: {
  label: string;
  score: number | null;
  sub?: string;
}) {
  const status = scoreToStatus(score);
  return (
    <div className="rounded-xl border border-border/70 bg-card p-4 space-y-3">
      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
      <div className="flex items-center gap-3">
        <RadialGauge score={score} size={64} />
        <div className="flex-1 space-y-1.5">
          <StatusBadge status={status} />
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

// ─── Org Scorecard tab ────────────────────────────────────────────────────────

function OrgScorecardView({
  scorecard,
  onSelectDept,
}: {
  scorecard: OrgScorecard;
  onSelectDept: (id: number) => void;
}) {
  return (
    <div className="space-y-6">
      {/* Org summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ScoreCard
          label="Organization Score"
          score={scorecard.orgOverallScore}
          sub={`${scorecard.departments.length} departments`}
        />
        {scorecard.kpiTypes.slice(0, 3).map((kt) => (
          <ScoreCard
            key={kt.metricKey}
            label={kt.kpiName}
            score={kt.orgScore}
            sub={`${kt.deptCount} dept${kt.deptCount !== 1 ? "s" : ""} · weight ${kt.orgWeight}%`}
          />
        ))}
      </div>

      {/* Department ranking chart */}
      <DeptRankingChart departments={scorecard.departments} />

      {/* Department heatmap table */}
      <div className="rounded-xl border border-border/70 bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border/60">
          <h3 className="font-semibold text-foreground">Department KPI Breakdown</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-muted/30">
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">Department</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Partner</th>
                {scorecard.kpiTypes.map((kt) => (
                  <th
                    key={kt.metricKey}
                    className="px-4 py-3 text-center font-medium text-muted-foreground whitespace-nowrap"
                  >
                    {kt.kpiName}
                  </th>
                ))}
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Overall</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {scorecard.departments.map((dept) => (
                <tr
                  key={dept.departmentId}
                  className="border-b border-border/40 hover:bg-muted/20 transition-colors"
                >
                  <td className="px-5 py-3 font-medium text-foreground">{dept.departmentName}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {dept.partnerName ?? "—"}
                  </td>
                  {scorecard.kpiTypes.map((kt) => {
                    const kpiScore = dept.kpiScores.find((k) => k.metricKey === kt.metricKey);
                    return (
                      <td key={kt.metricKey} className={`px-4 py-3 ${kpiScore ? cellBg(kpiScore.status) : ""}`}>
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-sm font-semibold tabular-nums">
                            {kpiScore?.score != null ? `${kpiScore.score}%` : "—"}
                          </span>
                          {kpiScore && (
                            <StatusBadge status={kpiScore.status} />
                          )}
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-4 py-3">
                    <div className="w-28">
                      <ScoreBar score={dept.overallScore} />
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => onSelectDept(dept.departmentId)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted/40 border-t-2 border-border">
                <td className="px-5 py-3 font-semibold text-foreground" colSpan={2}>
                  Organization Total
                </td>
                {scorecard.kpiTypes.map((kt) => (
                  <td key={kt.metricKey} className="px-4 py-3 text-center">
                    <span className="font-bold tabular-nums">
                      {kt.orgScore != null ? `${kt.orgScore}%` : "—"}
                    </span>
                  </td>
                ))}
                <td className="px-4 py-3">
                  <div className="w-28">
                    <ScoreBar score={scorecard.orgOverallScore} />
                  </div>
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Partner Scorecard view ───────────────────────────────────────────────────

function PartnerScorecardView({
  partners,
  selectedPartnerId,
  partnerScorecard,
  loading,
  onSelectPartner,
  onDrillToDept,
}: {
  partners: Partner[];
  selectedPartnerId: number | null;
  partnerScorecard: PartnerScorecard | null;
  loading: boolean;
  onSelectPartner: (id: number) => void;
  onDrillToDept: (id: number) => void;
}) {
  return (
    <div className="space-y-5">
      {partners.length > 1 && (
        <div className="flex items-center gap-3">
          <Select
            value={selectedPartnerId ? String(selectedPartnerId) : ""}
            onValueChange={(v) => onSelectPartner(Number(v))}
          >
            <SelectTrigger className="w-64 rounded-lg">
              <SelectValue placeholder="Select partner…" />
            </SelectTrigger>
            <SelectContent>
              {partners.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          Loading partner scorecard…
        </div>
      )}

      {!loading && !partnerScorecard && (
        <div className="flex items-center gap-2 justify-center py-12 text-muted-foreground">
          <Handshake className="h-5 w-5" />
          <span>Select a partner to view their consolidated scorecard.</span>
        </div>
      )}

      {!loading && partnerScorecard && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <ScoreCard
              label={partnerScorecard.partnerName}
              score={partnerScorecard.overallScore}
              sub={`${partnerScorecard.departments.length} department${partnerScorecard.departments.length !== 1 ? "s" : ""}`}
            />
            {partnerScorecard.departments.slice(0, 2).map((dept) => (
              <ScoreCard
                key={dept.departmentId}
                label={dept.departmentName}
                score={dept.overallScore}
                sub={`${dept.employees.length} employees`}
              />
            ))}
          </div>

          <div className="rounded-xl border border-border/70 bg-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border/60">
              <h3 className="font-semibold text-foreground">{partnerScorecard.partnerName} — Department Breakdown</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/30">
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Department</th>
                    <th className="px-4 py-3 text-center font-medium text-muted-foreground">Employees</th>
                    <th className="px-4 py-3 text-center font-medium text-muted-foreground">KPIs</th>
                    <th className="px-4 py-3 text-center font-medium text-muted-foreground">Overall</th>
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {partnerScorecard.departments.map((dept) => (
                    <tr key={dept.departmentId} className="border-b border-border/40 hover:bg-muted/20">
                      <td className="px-5 py-3 font-medium">{dept.departmentName}</td>
                      <td className="px-4 py-3 text-center text-muted-foreground">{dept.employees.length}</td>
                      <td className="px-4 py-3 text-center text-muted-foreground">{dept.kpiTypes.length}</td>
                      <td className="px-4 py-3">
                        <div className="w-28 mx-auto"><ScoreBar score={dept.overallScore} /></div>
                      </td>
                      <td className="px-3 py-3">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onDrillToDept(dept.departmentId)}>
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/40 border-t-2 border-border">
                    <td className="px-5 py-3 font-semibold" colSpan={3}>Partner Total</td>
                    <td className="px-4 py-3">
                      <div className="w-28 mx-auto"><ScoreBar score={partnerScorecard.overallScore} /></div>
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Department Scorecard tab ─────────────────────────────────────────────────

function DepartmentScorecardView({
  scorecard,
  departments,
  selectedDeptId,
  onChangeDept,
}: {
  scorecard: DepartmentScorecard | null;
  departments: Department[];
  selectedDeptId: number | null;
  onChangeDept: (id: number) => void;
}) {
  return (
    <div className="space-y-5">
      {/* Department selector */}
      <div className="flex items-center gap-3">
        <Select
          value={selectedDeptId ? String(selectedDeptId) : ""}
          onValueChange={(v) => onChangeDept(Number(v))}
        >
          <SelectTrigger className="w-64 rounded-lg">
            <SelectValue placeholder="Select department…" />
          </SelectTrigger>
          <SelectContent>
            {departments.map((d) => (
              <SelectItem key={d.id} value={String(d.id)}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!scorecard && (
        <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
          <Building2 className="h-5 w-5" />
          <span>Select a department to view its KPI scorecard.</span>
        </div>
      )}

      {scorecard && (
        <>
          {/* Department summary */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <ScoreCard
              label="Department Score"
              score={scorecard.overallScore}
              sub={`${scorecard.employees.length} employees`}
            />
            {scorecard.kpiTypes.map((kt) => (
              <ScoreCard
                key={kt.metricKey}
                label={kt.kpiName}
                score={kt.avgScore}
                sub={`${kt.employeeCount} scored · weight ${kt.kpiWeight}%`}
              />
            ))}
          </div>

          {/* Employee table */}
          <div className="rounded-xl border border-border/70 bg-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border/60">
              <h3 className="font-semibold text-foreground">{scorecard.departmentName} — Employee KPI Scores</h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/30">
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Employee</th>
                    {scorecard.kpiTypes.map((kt) => (
                      <th
                        key={kt.metricKey}
                        className="px-4 py-3 text-center font-medium text-muted-foreground whitespace-nowrap"
                      >
                        {kt.kpiName}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-center font-medium text-muted-foreground">
                      Overall
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {scorecard.employees.map((emp) => (
                    <tr
                      key={emp.profileId}
                      className="border-b border-border/40 hover:bg-muted/20 transition-colors"
                    >
                      <td className="px-5 py-3">
                        <p className="font-medium text-foreground">
                          {emp.firstName} {emp.lastName}
                        </p>
                        {emp.employeeId && (
                          <p className="text-xs text-muted-foreground">{emp.employeeId}</p>
                        )}
                      </td>
                      {scorecard.kpiTypes.map((kt) => {
                        const ks = emp.kpiScores.find((k) => k.metricKey === kt.metricKey);
                        return (
                          <td key={kt.metricKey} className="px-4 py-3 text-center">
                            {ks ? (
                              <div className="flex flex-col items-center gap-1">
                                <span className="font-semibold tabular-nums">
                                  {ks.score !== null ? `${ks.score}%` : "—"}
                                </span>
                                {ks.actualValue !== null && (
                                  <span className="text-xs text-muted-foreground">
                                    actual: {ks.actualValue}
                                  </span>
                                )}
                                <StatusBadge status={ks.status} />
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-4 py-3">
                        <div className="w-28 mx-auto">
                          <ScoreBar score={emp.overallScore} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/40 border-t-2 border-border">
                    <td className="px-5 py-3 font-semibold text-foreground">Department Avg</td>
                    {scorecard.kpiTypes.map((kt) => (
                      <td key={kt.metricKey} className="px-4 py-3 text-center font-bold tabular-nums">
                        {kt.avgScore !== null ? `${kt.avgScore}%` : "—"}
                      </td>
                    ))}
                    <td className="px-4 py-3">
                      <div className="w-28 mx-auto">
                        <ScoreBar score={scorecard.overallScore} />
                      </div>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function KpiScorecard() {
  const { roles, hasViewAccess } = useAuth();
  const { toast } = useToast();

  const canViewOrg = hasViewAccess("kpi.scorecard") &&
    (roles.includes("gmp") || roles.includes("super_admin") || roles.includes("hr") || roles.includes("partner"));
  const canSync = roles.includes("gmp") || roles.includes("super_admin") || roles.includes("hr");

  const [periods, setPeriods] = useState<KpiPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<number | null>(null);

  const [orgScorecard, setOrgScorecard] = useState<OrgScorecard | null>(null);
  const [deptScorecard, setDeptScorecard] = useState<DepartmentScorecard | null>(null);

  const [loadingPeriods, setLoadingPeriods] = useState(true);
  const [loadingOrg, setLoadingOrg] = useState(false);
  const [loadingDept, setLoadingDept] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [partners, setPartners] = useState<Partner[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState<number | null>(null);
  const [partnerScorecard, setPartnerScorecard] = useState<PartnerScorecard | null>(null);
  const [loadingPartner, setLoadingPartner] = useState(false);

  const [activeTab, setActiveTab] = useState<"org" | "partner" | "department">(
    canViewOrg ? "org" : "department"
  );

  // Load periods, departments, and partners on mount
  useEffect(() => {
    setLoadingPeriods(true);
    const calls: Promise<any>[] = [
      kpiCascadeApi.listPeriods(),
      kpiCascadeApi.listMyDepartments(),
    ];
    if (canSync) calls.push(kpiCascadeApi.listPartners());
    Promise.all(calls)
      .then(([periodsRes, deptsRes, partnersRes]) => {
        setPeriods(periodsRes.periods);
        setDepartments(deptsRes.departments);
        if (partnersRes?.partners) {
          setPartners(partnersRes.partners);
          if (partnersRes.partners.length > 0) setSelectedPartnerId(partnersRes.partners[0].id);
        }
        if (periodsRes.periods.length > 0) {
          setSelectedPeriodId(periodsRes.periods[0].id);
        }
      })
      .catch(() => {
        toast({ title: "Failed to load periods", variant: "destructive" });
      })
      .finally(() => setLoadingPeriods(false));
  }, []);

  // Load org scorecard when period changes
  useEffect(() => {
    if (!selectedPeriodId || !canViewOrg) return;
    setLoadingOrg(true);
    kpiCascadeApi
      .getOrgScorecard(selectedPeriodId)
      .then(setOrgScorecard)
      .catch(() => {
        toast({ title: "Failed to load organisation scorecard", variant: "destructive" });
      })
      .finally(() => setLoadingOrg(false));
  }, [selectedPeriodId, canViewOrg]);

  // Load dept scorecard when dept or period changes
  useEffect(() => {
    if (!selectedDeptId || !selectedPeriodId) {
      setDeptScorecard(null);
      return;
    }
    setLoadingDept(true);
    kpiCascadeApi
      .getDepartmentScorecard(selectedDeptId, selectedPeriodId)
      .then(setDeptScorecard)
      .catch(() => {
        toast({ title: "Failed to load department scorecard", variant: "destructive" });
        setDeptScorecard(null);
      })
      .finally(() => setLoadingDept(false));
  }, [selectedDeptId, selectedPeriodId]);

  // Load partner scorecard when partner or period changes
  useEffect(() => {
    if (!selectedPartnerId || !selectedPeriodId) { setPartnerScorecard(null); return; }
    setLoadingPartner(true);
    kpiCascadeApi
      .getPartnerScorecard(selectedPartnerId, selectedPeriodId)
      .then(setPartnerScorecard)
      .catch(() => { toast({ title: "Failed to load partner scorecard", variant: "destructive" }); setPartnerScorecard(null); })
      .finally(() => setLoadingPartner(false));
  }, [selectedPartnerId, selectedPeriodId]);

  const handleDrillToDept = (deptId: number) => {
    setSelectedDeptId(deptId);
    setActiveTab("department");
  };

  const handleSync = async () => {
    if (!selectedPeriodId) return;
    setSyncing(true);
    try {
      const result = await kpiCascadeApi.syncPeriod(selectedPeriodId);
      toast({
        title: "Sync complete",
        description: `${result.synced} KPIs updated from source modules. ${result.errors} errors.`,
      });
      // Reload org scorecard after sync
      if (canViewOrg) {
        const fresh = await kpiCascadeApi.getOrgScorecard(selectedPeriodId);
        setOrgScorecard(fresh);
      }
      if (selectedDeptId) {
        const fresh = await kpiCascadeApi.getDepartmentScorecard(selectedDeptId, selectedPeriodId);
        setDeptScorecard(fresh);
      }
    } catch {
      toast({ title: "Sync failed", variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const selectedPeriod = useMemo(
    () => periods.find((p) => p.id === selectedPeriodId) ?? null,
    [periods, selectedPeriodId]
  );

  if (loadingPeriods) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        Loading KPI scorecard…
      </div>
    );
  }

  if (periods.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-muted-foreground">
        <AlertCircle className="h-8 w-8" />
        <p className="text-sm">No measurement periods found. Create a BSC period first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">KPI Scorecard</h1>
        </div>

        <div className="flex items-center gap-3">
          {/* Period selector */}
          <Select
            value={selectedPeriodId ? String(selectedPeriodId) : ""}
            onValueChange={(v) => setSelectedPeriodId(Number(v))}
          >
            <SelectTrigger className="w-52 rounded-lg">
              <SelectValue placeholder="Select period…" />
            </SelectTrigger>
            <SelectContent>
              {periods.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Sync button — GMP/HR only */}
          {canSync && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-lg gap-2"
              disabled={syncing || !selectedPeriodId}
              onClick={handleSync}
            >
              <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing…" : "Sync Data"}
            </Button>
          )}
        </div>
      </div>

      {/* Period info strip */}
      {selectedPeriod && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <TrendingUp className="h-3.5 w-3.5" />
          <span>
            {selectedPeriod.label} · {selectedPeriod.cadence} ·{" "}
            {new Date(selectedPeriod.periodStart).toLocaleDateString()} –{" "}
            {new Date(selectedPeriod.periodEnd).toLocaleDateString()}
          </span>
          <Badge variant="outline" className="text-[10px] rounded-md capitalize">
            {selectedPeriod.status}
          </Badge>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "org" | "partner" | "department")}>
        <TabsList className="rounded-xl">
          {canViewOrg && (
            <TabsTrigger value="org" className="gap-2 rounded-lg">
              <Building2 className="h-4 w-4" />
              Organisation
            </TabsTrigger>
          )}
          {canSync && partners.length > 0 && (
            <TabsTrigger value="partner" className="gap-2 rounded-lg">
              <Handshake className="h-4 w-4" />
              Partner
            </TabsTrigger>
          )}
          <TabsTrigger value="department" className="gap-2 rounded-lg">
            <Users className="h-4 w-4" />
            Department
          </TabsTrigger>
        </TabsList>

        {canViewOrg && (
          <TabsContent value="org" className="mt-5">
            {loadingOrg ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                Loading organisation scorecard…
              </div>
            ) : orgScorecard ? (
              <OrgScorecardView
                scorecard={orgScorecard}
                onSelectDept={handleDrillToDept}
              />
            ) : null}
          </TabsContent>
        )}

        {canSync && (
          <TabsContent value="partner" className="mt-5">
            <PartnerScorecardView
              partners={partners}
              selectedPartnerId={selectedPartnerId}
              partnerScorecard={partnerScorecard}
              loading={loadingPartner}
              onSelectPartner={setSelectedPartnerId}
              onDrillToDept={handleDrillToDept}
            />
          </TabsContent>
        )}

        <TabsContent value="department" className="mt-5">
          {loadingDept ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              Loading department scorecard…
            </div>
          ) : (
            <DepartmentScorecardView
              scorecard={deptScorecard}
              departments={departments}
              selectedDeptId={selectedDeptId}
              onChangeDept={setSelectedDeptId}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
