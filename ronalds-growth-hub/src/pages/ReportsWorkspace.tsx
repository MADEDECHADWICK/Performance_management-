import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  Briefcase,
  Building2,
  Clock3,
  FileSpreadsheet,
  Layers,
  LineChart,
} from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import PageLoader from "@/components/ui/page-loader";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { evaluationsAPI, reportingAPI } from "@/lib/api";
import type { ReportingWorkspace } from "@/lib/api/reporting";
import { StatusBadge } from "@/components/framework/BalancedScorecardPrimitives";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type TabValue = ReportingWorkspace["visibleTabs"][number];

type CycleOption = {
  value: string;
  label: string;
};

type SummarySpotlight = {
  title: string;
  value: string;
  note: string;
};

const DATE_PRESETS = [
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "ytd", label: "Year to date" },
] as const;

const TAB_LABELS: Record<TabValue, string> = {
  summary: "Summary",
  client_summary: "Client Summary",
  job_reports: "Job Reports",
  timesheets: "Timesheets",
  productivity: "Productivity",
  bsc_tracking: "BSC Tracking",
};

const toneClasses: Record<
  ReportingWorkspace["cards"][number]["tone"],
  string
> = {
  neutral: "border-slate-200 bg-slate-50 text-slate-700",
  positive: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  danger: "border-rose-200 bg-rose-50 text-rose-700",
};

const currency = new Intl.NumberFormat("en-KE", {
  style: "currency",
  currency: "KES",
  maximumFractionDigits: 0,
});

const dateLabel = new Intl.DateTimeFormat("en-KE", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function formatCurrency(value: number) {
  return currency.format(Number(value || 0));
}

function formatHours(value: number) {
  return `${Number(value || 0).toFixed(1)}h`;
}

function formatPercent(value: number) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "N/A";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : dateLabel.format(parsed);
}

function resolveDateRange(preset: (typeof DATE_PRESETS)[number]["value"]) {
  const end = new Date();
  const start = new Date(end);

  if (preset === "30d") {
    start.setDate(end.getDate() - 30);
  } else if (preset === "90d") {
    start.setDate(end.getDate() - 90);
  } else {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
  }

  return {
    from: start.toISOString(),
    to: end.toISOString(),
  };
}

function ReportsMetricCard({
  label,
  value,
  hint,
  tone,
}: ReportingWorkspace["cards"][number]) {
  return (
    <Card className="rounded-3xl border-border/70 shadow-sm">
      <CardContent className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className="text-3xl font-semibold tracking-tight text-foreground">{value}</p>
          </div>
          <Badge variant="outline" className={cn("rounded-full px-2.5 py-1", toneClasses[tone])}>
            {tone === "positive"
              ? "Healthy"
              : tone === "warning"
                ? "Watch"
                : tone === "danger"
                  ? "Action"
                  : "Snapshot"}
          </Badge>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function SectionShell({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof FileSpreadsheet;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card className="rounded-[28px] border-border/70 shadow-sm">
      <CardHeader className="space-y-4 pb-4">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-primary/10 p-3 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-2xl tracking-tight">{title}</CardTitle>
            <CardDescription className="max-w-3xl text-sm leading-6">
              {description}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function EmptyTableState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border/70 px-4 py-10 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function SummarySpotlightCard({ title, value, note }: SummarySpotlight) {
  return (
    <Card className="rounded-3xl border-border/70 shadow-none">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <p className="text-2xl font-semibold tracking-tight text-foreground">{value}</p>
        <p>{note}</p>
      </CardContent>
    </Card>
  );
}

export default function ReportsWorkspace() {
  const { toast } = useToast();
  const [workspace, setWorkspace] = useState<ReportingWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabValue>("summary");
  const [datePreset, setDatePreset] = useState<(typeof DATE_PRESETS)[number]["value"]>("30d");
  const [search, setSearch] = useState("");
  const [selectedCycle, setSelectedCycle] = useState("latest");
  const [cycleOptions, setCycleOptions] = useState<CycleOption[]>([
    { value: "latest", label: "Latest evaluation cycle" },
  ]);

  useEffect(() => {
    let active = true;

    const loadCycles = async () => {
      try {
        const cycles = await evaluationsAPI.getMyCycles();
        if (!active) return;
        setCycleOptions([
          { value: "latest", label: "Latest evaluation cycle" },
          ...cycles.map((cycle) => ({
            value: String(cycle.id),
            label: `${cycle.title} · ${cycle.status}`,
          })),
        ]);
      } catch (cycleError) {
        if (!active) return;
        console.error("Failed to load evaluation cycles for reports:", cycleError);
      }
    };

    loadCycles();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const { from, to } = resolveDateRange(datePreset);

    const loadWorkspace = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await reportingAPI.getWorkspace({
          from,
          to,
          evaluationCycleId: selectedCycle === "latest" ? undefined : Number(selectedCycle),
        });
        if (!active) return;
        setWorkspace(data);
        setActiveTab((current) =>
          data.visibleTabs.includes(current) ? current : data.visibleTabs[0] ?? "summary"
        );
      } catch (workspaceError: any) {
        if (!active) return;
        const message =
          workspaceError?.message || "Failed to load the reporting workspace.";
        setError(message);
        toast({
          title: "Reports unavailable",
          description: message,
          variant: "destructive",
        });
      } finally {
        if (active) setLoading(false);
      }
    };

    loadWorkspace();
    return () => {
      active = false;
    };
  }, [datePreset, selectedCycle, toast]);

  const searchTerm = search.trim().toLowerCase();

  const filteredClientRows = useMemo(() => {
    if (!workspace) return [];
    return workspace.clientSummary.rows.filter((row) =>
      [row.clientName].join(" ").toLowerCase().includes(searchTerm)
    );
  }, [searchTerm, workspace]);

  const filteredJobRows = useMemo(() => {
    if (!workspace) return [];
    return workspace.jobReports.rows.filter((row) =>
      [row.job, row.jobCode, row.client, row.department, row.manager, row.partner, row.collectionStage]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(searchTerm)
    );
  }, [searchTerm, workspace]);

  const filteredTimesheetRows = useMemo(() => {
    if (!workspace) return [];
    return workspace.timesheets.rows.filter((row) =>
      [row.employeeName, row.department, row.manager]
        .join(" ")
        .toLowerCase()
        .includes(searchTerm)
    );
  }, [searchTerm, workspace]);

  const filteredProductivityRows = useMemo(() => {
    if (!workspace) return [];
    return workspace.productivity.rows.filter((row) =>
      [row.job, row.client, row.employeeName, row.category, row.staff]
        .join(" ")
        .toLowerCase()
        .includes(searchTerm)
    );
  }, [searchTerm, workspace]);

  const topClient = workspace?.clientSummary.rows[0] ?? null;
  const topJob = workspace?.jobReports.rows[0] ?? null;
  const highestNonBillableEmployee =
    [...(workspace?.timesheets.rows ?? [])].sort(
      (a, b) => b.nonBillableHours - a.nonBillableHours
    )[0] ?? null;
  const lowestUtilizationEmployee =
    [...(workspace?.timesheets.rows ?? [])]
      .filter((row) => row.totalHours > 0)
      .sort((a, b) => a.utilizationPercent - b.utilizationPercent)[0] ?? null;
  const weakestKpi = workspace?.bscTracking.topKpis[0] ?? null;
  const highestInitiative = [...(workspace?.bscTracking.initiatives ?? [])].sort(
    (a, b) => b.progress - a.progress
  )[0] ?? null;

  const summarySpotlights = useMemo<SummarySpotlight[]>(() => {
    if (!workspace) return [];

    const evaluationSummary = workspace.bscTracking.evaluationSummary;
    const outstandingClient = topClient
      ? {
          title: "Client with highest balance",
          value: topClient.clientName,
          note: `${formatCurrency(topClient.remainingBalance)} still open with ${formatCurrency(topClient.nonBillableCost)} in non-billable cost drag.`,
        }
      : null;
    const pressuredJob = topJob
      ? {
          title: "Job needing review",
          value: topJob.job,
          note: `${formatCurrency(topJob.remainingBalance)} open balance, ${formatPercent(topJob.utilizationPercent)} utilization, ${formatHours(topJob.nonBillableHours)} non-billable time.`,
        }
      : null;
    const nonBillableSignal = highestNonBillableEmployee
      ? {
          title: "Largest non-billable signal",
          value: highestNonBillableEmployee.employeeName,
          note: `${formatHours(highestNonBillableEmployee.nonBillableHours)} non-billable across ${highestNonBillableEmployee.department}.`,
        }
      : null;
    const utilizationSignal = lowestUtilizationEmployee
      ? {
          title: "Lowest utilization signal",
          value: lowestUtilizationEmployee.employeeName,
          note: `${formatPercent(lowestUtilizationEmployee.utilizationPercent)} utilization with ${formatHours(lowestUtilizationEmployee.totalHours)} total approved hours.`,
        }
      : null;
    const kpiSignal = weakestKpi
      ? {
          title: "Weakest KPI signal",
          value: weakestKpi.name,
          note: `${weakestKpi.actual} against ${weakestKpi.firmTarget} with weighted score ${weakestKpi.weightedScore}.`,
        }
      : null;
    const evaluationSignal = {
      title: "Evaluation follow-through",
      value: `${evaluationSummary.pendingAssignments} pending`,
      note: `${evaluationSummary.submittedAssignments}/${evaluationSummary.totalAssignments} submitted in the linked cycle.`,
    };
    const initiativeSignal = highestInitiative
      ? {
          title: "Strongest active initiative",
          value: highestInitiative.title,
          note: `${highestInitiative.scopeRole.toUpperCase()} layer at ${highestInitiative.progress}% progress.`,
        }
      : null;

    switch (workspace.effectiveRole) {
      case "hr":
      case "gmp":
        return [outstandingClient, pressuredJob, kpiSignal ?? evaluationSignal]
          .filter(Boolean) as SummarySpotlight[];
      case "partner":
        return [outstandingClient, pressuredJob, initiativeSignal ?? evaluationSignal]
          .filter(Boolean) as SummarySpotlight[];
      case "manager":
        return [pressuredJob, utilizationSignal ?? nonBillableSignal, evaluationSignal]
          .filter(Boolean) as SummarySpotlight[];
      case "employee":
        return [initiativeSignal ?? pressuredJob, evaluationSignal, kpiSignal]
          .filter(Boolean) as SummarySpotlight[];
      case "finance":
        return [outstandingClient, pressuredJob, kpiSignal]
          .filter(Boolean) as SummarySpotlight[];
      case "marketing":
        return [initiativeSignal, kpiSignal, evaluationSignal]
          .filter(Boolean) as SummarySpotlight[];
      default:
        return [outstandingClient, pressuredJob, nonBillableSignal]
          .filter(Boolean) as SummarySpotlight[];
    }
  }, [
    highestInitiative,
    highestNonBillableEmployee,
    lowestUtilizationEmployee,
    topClient,
    topJob,
    weakestKpi,
    workspace,
  ]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="p-4 sm:p-6">
          <PageLoader message="Loading reports..." minHeightClassName="min-h-[60vh]" />
        </div>
      </DashboardLayout>
    );
  }

  if (!workspace || error) {
    return (
      <DashboardLayout>
        <div className="p-4 sm:p-6">
          <Card className="rounded-3xl border-border/70 shadow-sm">
            <CardContent className="space-y-4 p-6">
              <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
              <p className="text-sm text-muted-foreground">
                {error || "The reporting workspace could not be loaded."}
              </p>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.08),_transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.98))]">
        <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 p-4 sm:p-6">
          <div className="rounded-[30px] border border-border/70 bg-white/95 shadow-sm">
            <div className="flex flex-col gap-5 p-5 sm:p-6">
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link to="/dashboard">Dashboard</Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>Reports</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>

              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background px-3 py-1 text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    Reporting Workspace
                  </div>
                  <div className="space-y-1">
                    <h1 className="text-3xl font-semibold tracking-tight text-foreground">
                      {workspace.scope.title}
                    </h1>
                    <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                      {workspace.scope.description}
                    </p>
                  </div>
                </div>

                <div className="grid w-full gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <Select value={datePreset} onValueChange={(value) => setDatePreset(value as typeof datePreset)}>
                    <SelectTrigger className="w-full rounded-2xl">
                      <SelectValue placeholder="Select period" />
                    </SelectTrigger>
                    <SelectContent>
                      {DATE_PRESETS.map((preset) => (
                        <SelectItem key={preset.value} value={preset.value}>
                          {preset.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={selectedCycle} onValueChange={setSelectedCycle}>
                    <SelectTrigger className="w-full rounded-2xl">
                      <SelectValue placeholder="Select cycle" />
                    </SelectTrigger>
                    <SelectContent>
                      {cycleOptions.map((cycle) => (
                        <SelectItem key={cycle.value} value={cycle.value}>
                          {cycle.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search jobs, clients, employees"
                    className="w-full rounded-2xl"
                  />

                  <div className="rounded-2xl border border-border/70 bg-slate-50 px-4 py-3 text-sm text-muted-foreground">
                    Generated {formatDate(workspace.generatedAt)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {workspace.cards.map((card) => (
            <ReportsMetricCard key={card.label} {...card} />
          ))}
        </div>

          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabValue)} className="space-y-6">
            <TabsList className="h-auto w-full flex-wrap justify-start gap-2 rounded-[28px] border border-border/70 bg-white/95 p-3 shadow-sm">
              {workspace.visibleTabs.map((tab) => (
                <TabsTrigger
                  key={tab}
                  value={tab}
                  className="rounded-2xl px-4 py-2 text-sm data-[state=active]:shadow-none"
                >
                  {TAB_LABELS[tab]}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="summary" className="space-y-6">
              <SectionShell
                icon={BarChart3}
                title="At-a-glance reporting"
                description="Start with the current operational picture, then drill into the table that answers the next question."
              >
                <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
                  <div className="grid gap-4 md:grid-cols-3">
                    {summarySpotlights.map((spotlight) => (
                      <SummarySpotlightCard key={spotlight.title} {...spotlight} />
                    ))}
                  </div>

                  <Card className="rounded-3xl border-border/70 shadow-none">
                    <CardHeader>
                      <CardTitle className="text-xl">
                        {workspace.specializedSurface ? workspace.specializedSurface.title : "How to use this workspace"}
                      </CardTitle>
                      <CardDescription className="text-sm leading-6">
                        {workspace.specializedSurface
                          ? workspace.specializedSurface.description
                          : "Use client, job, timesheet, and productivity reports to move from financial exposure down to individual execution."}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {workspace.specializedSurface ? (
                        workspace.specializedSurface.cards.map((card) => (
                          <Card key={card.title} className="rounded-3xl border-border/70 shadow-none">
                            <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
                              <div className="space-y-1.5">
                                <p className="text-lg font-semibold text-foreground">{card.title}</p>
                                <p className="text-sm leading-6 text-muted-foreground">{card.description}</p>
                              </div>
                              <div className="flex items-center gap-4">
                                <div className="text-right">
                                  <p className="text-2xl font-semibold tracking-tight text-foreground">
                                    {card.metric}
                                  </p>
                                  <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                                    {card.metricHint}
                                  </p>
                                </div>
                                <Button asChild className="rounded-2xl">
                                  <Link to={card.path}>
                                    Open
                                    <ArrowRight className="ml-2 h-4 w-4" />
                                  </Link>
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        ))
                      ) : (
                        <div className="grid gap-3">
                          <div className="rounded-3xl border border-border/70 bg-slate-50 px-4 py-4 text-sm text-muted-foreground">
                            Client Summary answers where non-billable time and open balances are accumulating at client level.
                          </div>
                          <div className="rounded-3xl border border-border/70 bg-slate-50 px-4 py-4 text-sm text-muted-foreground">
                            Job Reports combine fee, billable value, collections, balance, and profit/loss per engagement.
                          </div>
                          <div className="rounded-3xl border border-border/70 bg-slate-50 px-4 py-4 text-sm text-muted-foreground">
                            Timesheets and Productivity show the staff time mix behind those numbers, while BSC Tracking shows the strategic side.
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </SectionShell>
            </TabsContent>

            <TabsContent value="client_summary" className="space-y-6">
              <SectionShell
                icon={Building2}
                title="Client summary"
                description="Client-level view of fee exposure, billable value, non-billable drag, collections, balance, and profit/loss."
              >
                {filteredClientRows.length === 0 ? (
                  <EmptyTableState message="No client summary rows match the current filters." />
                ) : (
                  <div className="overflow-x-auto rounded-3xl border border-border/70">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Client</TableHead>
                          <TableHead>Jobs</TableHead>
                          <TableHead>Budget(Fee)</TableHead>
                          <TableHead>Billable</TableHead>
                          <TableHead>Non-billable hours</TableHead>
                          <TableHead>Non-billable amount</TableHead>
                          <TableHead>Collected</TableHead>
                          <TableHead>Balance</TableHead>
                          <TableHead>Profit</TableHead>
                          <TableHead>Loss</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredClientRows.map((row) => (
                          <TableRow key={row.clientId}>
                            <TableCell className="font-medium">{row.clientName}</TableCell>
                            <TableCell>{row.jobs}</TableCell>
                            <TableCell>{formatCurrency(row.budgetFee)}</TableCell>
                            <TableCell>{formatCurrency(row.billableAmount)}</TableCell>
                            <TableCell>{formatHours(row.nonBillableHours)}</TableCell>
                            <TableCell>{formatCurrency(row.nonBillableCost)}</TableCell>
                            <TableCell>{formatCurrency(row.amountCollected)}</TableCell>
                            <TableCell>{formatCurrency(row.remainingBalance)}</TableCell>
                            <TableCell>{formatCurrency(row.profit)}</TableCell>
                            <TableCell>{formatCurrency(row.loss)}</TableCell>
                            <TableCell>
                              <StatusBadge status={row.status} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </SectionShell>
            </TabsContent>

            <TabsContent value="job_reports" className="space-y-6">
              <SectionShell
                icon={Briefcase}
                title="Job reports"
                description="Per-job reporting across fee, billable value, non-billable time, collections, balance, utilization, and profit/loss."
              >
                {filteredJobRows.length === 0 ? (
                  <EmptyTableState message="No job report rows match the current filters." />
                ) : (
                  <div className="overflow-x-auto rounded-3xl border border-border/70">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Job</TableHead>
                          <TableHead>Client</TableHead>
                          <TableHead>Department</TableHead>
                          <TableHead>Manager</TableHead>
                          <TableHead>Partner</TableHead>
                          <TableHead>Budget(Fee)</TableHead>
                          <TableHead>Billable</TableHead>
                          <TableHead>Non-billable</TableHead>
                          <TableHead>Collected</TableHead>
                          <TableHead>Balance</TableHead>
                          <TableHead>Profit</TableHead>
                          <TableHead>Loss</TableHead>
                          <TableHead>Utilization</TableHead>
                          <TableHead>Collection stage</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredJobRows.map((row) => (
                          <TableRow key={row.jobId}>
                            <TableCell>
                              <div className="space-y-1">
                                <p className="font-medium">{row.job}</p>
                                <p className="text-xs text-muted-foreground">{row.jobCode || "No code"}</p>
                              </div>
                            </TableCell>
                            <TableCell>{row.client}</TableCell>
                            <TableCell>{row.department}</TableCell>
                            <TableCell>{row.manager}</TableCell>
                            <TableCell>{row.partner}</TableCell>
                            <TableCell>{formatCurrency(row.budgetFee)}</TableCell>
                            <TableCell>{formatCurrency(row.billableAmount)}</TableCell>
                            <TableCell>{formatHours(row.nonBillableHours)}</TableCell>
                            <TableCell>{formatCurrency(row.amountCollected)}</TableCell>
                            <TableCell>{formatCurrency(row.remainingBalance)}</TableCell>
                            <TableCell>{formatCurrency(row.profit)}</TableCell>
                            <TableCell>{formatCurrency(row.loss)}</TableCell>
                            <TableCell>{formatPercent(row.utilizationPercent)}</TableCell>
                            <TableCell className="capitalize">{row.collectionStage}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </SectionShell>
            </TabsContent>

            <TabsContent value="timesheets" className="space-y-6">
              <SectionShell
                icon={Clock3}
                title="Timesheets"
                description="Billable and non-billable hour mix per employee, department, and manager in the current reporting window."
              >
                {filteredTimesheetRows.length === 0 ? (
                  <EmptyTableState message="No timesheet rows match the current filters." />
                ) : (
                  <div className="overflow-x-auto rounded-3xl border border-border/70">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Employee</TableHead>
                          <TableHead>Department</TableHead>
                          <TableHead>Manager</TableHead>
                          <TableHead>Total hours</TableHead>
                          <TableHead>Billable hours</TableHead>
                          <TableHead>Non-billable hours</TableHead>
                          <TableHead>Billable amount</TableHead>
                          <TableHead>Approved entries</TableHead>
                          <TableHead>Utilization</TableHead>
                          <TableHead>Last worked</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredTimesheetRows.map((row) => (
                          <TableRow key={row.employeeId}>
                            <TableCell className="font-medium">{row.employeeName}</TableCell>
                            <TableCell>{row.department}</TableCell>
                            <TableCell>{row.manager}</TableCell>
                            <TableCell>{formatHours(row.totalHours)}</TableCell>
                            <TableCell>{formatHours(row.billableHours)}</TableCell>
                            <TableCell>{formatHours(row.nonBillableHours)}</TableCell>
                            <TableCell>{formatCurrency(row.billableAmount)}</TableCell>
                            <TableCell>{row.approvalCount}</TableCell>
                            <TableCell>{formatPercent(row.utilizationPercent)}</TableCell>
                            <TableCell>{formatDate(row.lastWorkedAt)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </SectionShell>
            </TabsContent>

            <TabsContent value="productivity" className="space-y-6">
              <SectionShell
                icon={LineChart}
                title="Productivity"
                description="Per staff per job view of billable vs non-billable time, billed value, collections, balance, and profit/loss."
              >
                {filteredProductivityRows.length === 0 ? (
                  <EmptyTableState message="No productivity rows match the current filters." />
                ) : (
                  <div className="overflow-x-auto rounded-3xl border border-border/70">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Job</TableHead>
                          <TableHead>Client</TableHead>
                          <TableHead>Employee Name</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Staff</TableHead>
                          <TableHead>Budget(Fee)</TableHead>
                          <TableHead>Billable</TableHead>
                          <TableHead>Non-billable</TableHead>
                          <TableHead>Amount Collected</TableHead>
                          <TableHead>Remaining balance</TableHead>
                          <TableHead>Profit</TableHead>
                          <TableHead>Loss</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredProductivityRows.map((row) => (
                          <TableRow key={`${row.jobId}-${row.employeeName}`}>
                            <TableCell className="font-medium">{row.job}</TableCell>
                            <TableCell>{row.client}</TableCell>
                            <TableCell>{row.employeeName}</TableCell>
                            <TableCell>{row.category}</TableCell>
                            <TableCell>{row.staff}</TableCell>
                            <TableCell>{formatCurrency(row.budgetFee)}</TableCell>
                            <TableCell>{formatHours(row.billableHours)}</TableCell>
                            <TableCell>{formatHours(row.nonBillableHours)}</TableCell>
                            <TableCell>{formatCurrency(row.amountCollected)}</TableCell>
                            <TableCell>{formatCurrency(row.remainingBalance)}</TableCell>
                            <TableCell>{formatCurrency(row.profit)}</TableCell>
                            <TableCell>{formatCurrency(row.loss)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </SectionShell>
            </TabsContent>

            <TabsContent value="bsc_tracking" className="space-y-6">
              <SectionShell
                icon={Layers}
                title="BSC and evaluation tracking"
                description="Strategic progress tied to the current reporting scope, with evaluation-cycle completion and KPI health in one place."
              >
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <Card className="rounded-3xl border-border/70 shadow-none">
                    <CardContent className="space-y-2 p-5">
                      <p className="text-sm font-medium text-muted-foreground">Evaluation cycle</p>
                      <p className="text-2xl font-semibold tracking-tight text-foreground">
                        {workspace.bscTracking.evaluationSummary.cycleTitle || "No linked cycle"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {workspace.bscTracking.evaluationSummary.cycleStatus || "No status"}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="rounded-3xl border-border/70 shadow-none">
                    <CardContent className="space-y-2 p-5">
                      <p className="text-sm font-medium text-muted-foreground">Assignment completion</p>
                      <p className="text-2xl font-semibold tracking-tight text-foreground">
                        {workspace.bscTracking.evaluationSummary.completionPercent}%
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {workspace.bscTracking.evaluationSummary.submittedAssignments} submitted of{" "}
                        {workspace.bscTracking.evaluationSummary.totalAssignments}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="rounded-3xl border-border/70 shadow-none">
                    <CardContent className="space-y-2 p-5">
                      <p className="text-sm font-medium text-muted-foreground">Acknowledgement</p>
                      <p className="text-2xl font-semibold tracking-tight text-foreground">
                        {workspace.bscTracking.evaluationSummary.acknowledgementPercent}%
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {workspace.bscTracking.evaluationSummary.acknowledgedAssignments} acknowledged assignments
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="rounded-3xl border-border/70 shadow-none">
                    <CardContent className="space-y-2 p-5">
                      <p className="text-sm font-medium text-muted-foreground">Average score</p>
                      <p className="text-2xl font-semibold tracking-tight text-foreground">
                        {workspace.bscTracking.evaluationSummary.averageScore.toFixed(1)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {workspace.bscTracking.evaluationSummary.pendingAssignments} reviews still pending
                      </p>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
                  <Card className="rounded-3xl border-border/70 shadow-none">
                    <CardHeader>
                      <CardTitle className="text-xl">Performance by perspective</CardTitle>
                      <CardDescription>
                        The perspective cards come from the live BSC workspace for this role scope.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 md:grid-cols-2">
                      {workspace.bscTracking.perspectiveCards.map((perspective) => (
                        <Card key={perspective.id} className="rounded-3xl border-border/70 shadow-none">
                          <CardContent className="space-y-3 p-5">
                            <div className="flex items-start justify-between gap-3">
                              <div className="space-y-1">
                                <p className="text-lg font-semibold text-foreground">{perspective.name}</p>
                                <p className="text-sm text-muted-foreground">{perspective.summary}</p>
                              </div>
                              <StatusBadge status={perspective.status} />
                            </div>
                            <div className="space-y-2">
                              <div className="flex items-center justify-between text-sm text-muted-foreground">
                                <span>Perspective score</span>
                                <span className="font-medium text-foreground">{perspective.score}%</span>
                              </div>
                              <div className="h-2 rounded-full bg-slate-100">
                                <div
                                  className="h-full rounded-full bg-[linear-gradient(90deg,#1d4ed8,#06b6d4)]"
                                  style={{ width: `${Math.max(6, Math.min(100, perspective.score))}%` }}
                                />
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </CardContent>
                  </Card>

                  <Card className="rounded-3xl border-border/70 shadow-none">
                    <CardHeader>
                      <CardTitle className="text-xl">Top KPI signals</CardTitle>
                      <CardDescription>
                        Lowest-scoring tracked KPIs in the current role and evaluation scope.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {workspace.bscTracking.topKpis.length === 0 ? (
                        <EmptyTableState message="No KPI tracking rows are available for the current scope." />
                      ) : (
                        workspace.bscTracking.topKpis.slice(0, 6).map((kpi) => (
                          <div
                            key={kpi.id}
                            className="rounded-3xl border border-border/70 bg-slate-50 px-4 py-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="space-y-1">
                                <p className="font-semibold text-foreground">{kpi.name}</p>
                                <p className="text-sm text-muted-foreground">{kpi.description}</p>
                              </div>
                              <StatusBadge status={kpi.status} />
                            </div>
                            <div className="mt-3 grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
                              <div>
                                <p className="uppercase tracking-[0.18em] text-[11px]">Target vs actual</p>
                                <p className="font-medium text-foreground">
                                  {kpi.actual} / {kpi.firmTarget}
                                </p>
                              </div>
                              <div>
                                <p className="uppercase tracking-[0.18em] text-[11px]">Weighted score</p>
                                <p className="font-medium text-foreground">{kpi.weightedScore}</p>
                              </div>
                              <div>
                                <p className="uppercase tracking-[0.18em] text-[11px]">Initiative progress</p>
                                <p className="font-medium text-foreground">{kpi.initiativeProgress}%</p>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>
                </div>

                <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
                  <Card className="rounded-3xl border-border/70 shadow-none">
                    <CardHeader>
                      <CardTitle className="text-xl">Initiative completion summary</CardTitle>
                      <CardDescription>
                        Strategic execution items currently shaping the role-scoped BSC picture.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {workspace.bscTracking.initiatives.length === 0 ? (
                        <EmptyTableState message="No linked initiatives are visible in the current scope." />
                      ) : (
                        workspace.bscTracking.initiatives.slice(0, 6).map((initiative) => (
                          <div
                            key={`${initiative.id}-${initiative.scopeRole}`}
                            className="rounded-3xl border border-border/70 px-4 py-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="space-y-1">
                                <p className="font-semibold text-foreground">{initiative.title}</p>
                                <p className="text-sm text-muted-foreground">
                                  {initiative.scopeRole.toUpperCase()} · {initiative.owner}
                                </p>
                              </div>
                              <StatusBadge status={initiative.status} />
                            </div>
                            <div className="mt-3 flex items-center justify-between gap-3 text-sm text-muted-foreground">
                              <span>{initiative.progress}% complete</span>
                              <span>{initiative.dueDate || "No due date"}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>

                  <Card className="rounded-3xl border-border/70 shadow-none">
                    <CardHeader>
                      <CardTitle className="text-xl">Contribution and next action</CardTitle>
                      <CardDescription>
                        Use the BSC role view for the full strategic context, but keep reporting here for quick answers.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {workspace.bscTracking.employeeContributions.length > 0 ? (
                        workspace.bscTracking.employeeContributions.slice(0, 4).map((item) => (
                          <div
                            key={item.id}
                            className="rounded-3xl border border-border/70 bg-slate-50 px-4 py-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="space-y-1">
                                <p className="font-semibold text-foreground">{item.title}</p>
                                <p className="text-sm text-muted-foreground">{item.rollup}</p>
                              </div>
                              <StatusBadge status={item.status} />
                            </div>
                            <div className="mt-3 grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
                              <div>
                                <p className="uppercase tracking-[0.18em] text-[11px]">Due date</p>
                                <p className="font-medium text-foreground">{item.dueDate || "N/A"}</p>
                              </div>
                              <div>
                                <p className="uppercase tracking-[0.18em] text-[11px]">Progress</p>
                                <p className="font-medium text-foreground">{item.progress}%</p>
                              </div>
                              <div>
                                <p className="uppercase tracking-[0.18em] text-[11px]">Score</p>
                                <p className="font-medium text-foreground">{item.score}</p>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <EmptyTableState message="No individual contribution rows are visible in this reporting scope." />
                      )}

                      <Button asChild className="w-full rounded-2xl sm:w-auto">
                        <Link to={`/bsc-management/${workspace.effectiveRole}`}>
                          Open BSC tracking
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </SectionShell>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </DashboardLayout>
  );
}
