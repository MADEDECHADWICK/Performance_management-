import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowUpRight,
  Briefcase,
  CheckCircle2,
  Clock3,
  Layers3,
  Search,
  ShieldCheck,
  Users2,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import MiniStatGraph from "@/components/ui/mini-stat-graph";
import { jobsAPI } from "@/lib/api";
import type { Job } from "@/lib/api/types";
import { scopeJobsForViewer } from "@/lib/jobs/scope";
import { useAuth } from "@/contexts/AuthContext";

export interface JobOperationsMetric {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  tone?: "primary" | "positive" | "warning" | "danger";
  graphValue?: number;
  graphBaseline?: number;
  inverse?: boolean;
}

interface JobOperationsOverviewProps {
  title: string;
  description: string;
  metrics?: JobOperationsMetric[];
  jobs?: Job[];
  className?: string;
  compact?: boolean;
  showBoardLink?: boolean;
  showLocator?: boolean;
  pulseTitle?: string;
  pulseDescription?: string;
}

type DecoratedJob = Job & {
  resolvedStatus: string;
  isOverdue: boolean;
  daysToDue: number | null;
};

const STATUS_LABELS: Record<string, string> = {
  planned: "Planned",
  in_progress: "In progress",
  on_hold: "On hold",
  completed: "Completed",
  cancelled: "Cancelled",
  overdue: "Overdue",
};

const STATUS_BADGES: Record<string, string> = {
  planned: "border-primary/20 bg-primary/10 text-primary",
  in_progress: "border-secondary/20 bg-secondary/10 text-secondary",
  on_hold: "border-brand-orange/20 bg-brand-orange/10 text-brand-orange",
  completed: "bg-emerald-100 text-emerald-700 border-emerald-200",
  cancelled: "bg-rose-100 text-rose-700 border-rose-200",
  overdue: "bg-rose-100 text-rose-700 border-rose-200",
};

const TONE_STYLES: Record<NonNullable<JobOperationsMetric["tone"]>, string> = {
  primary: "from-primary/20 via-secondary/10 to-brand-orange/10 text-primary",
  positive: "from-secondary/18 via-primary/8 to-transparent text-secondary",
  warning: "from-brand-orange/20 via-accent/10 to-transparent text-brand-orange",
  danger: "from-destructive/14 via-brand-orange/8 to-transparent text-destructive",
};

const formatJobStatus = (status: string) =>
  STATUS_LABELS[status] || status.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());

const formatCompactCurrency = (value: number) =>
  `KES ${Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  })}`;

const getResolvedStatus = (job: Job) => {
  const status = String((job as any).effectiveStatus || job.status || "planned").toLowerCase();
  const dueAt = job.dueDate ? new Date(job.dueDate) : null;
  const isClosed = status === "completed" || status === "cancelled";
  const isOverdue =
    Boolean(dueAt) && !Number.isNaN(dueAt!.getTime()) && dueAt!.getTime() < Date.now() && !isClosed;
  return isOverdue ? "overdue" : status;
};

const getDaysToDue = (job: Job) => {
  if (!job.dueDate) return null;
  const dueAt = new Date(job.dueDate);
  if (Number.isNaN(dueAt.getTime())) return null;
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.ceil((dueAt.getTime() - Date.now()) / msPerDay);
};

const getOwnerLabel = (job: Job) => {
  const managerName = job.manager
    ? `${job.manager.firstName || ""} ${job.manager.lastName || ""}`.trim()
    : "";
  const partnerName = job.partner
    ? `${job.partner.firstName || ""} ${job.partner.lastName || ""}`.trim()
    : "";
  if (managerName && partnerName) return `${managerName} / ${partnerName}`;
  return managerName || partnerName || "Unassigned";
};

const deriveFallbackMetrics = (jobs: DecoratedJob[]): JobOperationsMetric[] => {
  const activeJobs = jobs.filter((job) => ["planned", "in_progress", "on_hold", "overdue"].includes(job.resolvedStatus));
  const overdueJobs = jobs.filter((job) => job.resolvedStatus === "overdue");
  const liveJobs = jobs.filter((job) => job.resolvedStatus === "in_progress");
  const completedJobs = jobs.filter((job) => job.resolvedStatus === "completed");

  return [
    {
      label: "Tracked jobs",
      value: String(jobs.length),
      hint: `${activeJobs.length} active right now`,
      icon: Briefcase,
      tone: "primary",
      graphValue: jobs.length,
      graphBaseline: activeJobs.length,
    },
    {
      label: "Execution live",
      value: String(liveJobs.length),
      hint: "Jobs already in motion",
      icon: ShieldCheck,
      tone: "positive",
      graphValue: liveJobs.length,
      graphBaseline: 0,
    },
    {
      label: "Overdue jobs",
      value: String(overdueJobs.length),
      hint: "Need manager or partner intervention",
      icon: AlertTriangle,
      tone: "danger",
      graphValue: overdueJobs.length,
      graphBaseline: 0,
      inverse: true,
    },
    {
      label: "Closed out",
      value: String(completedJobs.length),
      hint: "Completed and ready for reporting",
      icon: CheckCircle2,
      tone: "warning",
      graphValue: completedJobs.length,
      graphBaseline: jobs.length,
    },
  ];
};

export default function JobOperationsOverview({
  title,
  description,
  metrics,
  jobs,
  className,
  compact = false,
  showBoardLink = true,
  showLocator = true,
  pulseTitle,
  pulseDescription,
}: JobOperationsOverviewProps) {
  const {
    user,
    profile,
    isLoading: authLoading,
    isAdmin,
    isHR,
    isGMP,
    isFinance,
    isManager,
    isPartner,
    isEmployee,
  } = useAuth();
  const [search, setSearch] = useState("");
  const [fetchedJobs, setFetchedJobs] = useState<Job[]>([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);

  useEffect(() => {
    if (jobs || authLoading || !user) return;

    let cancelled = false;
    const loadJobs = async () => {
      try {
        setIsLoadingJobs(true);
        const response = await jobsAPI.list({ page: 1, pageSize: 120 });
        if (cancelled) return;
        const items = (response as any)?.data ?? (response as any)?.jobs ?? [];
        setFetchedJobs(Array.isArray(items) ? items : []);
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load job operations summary:", error);
          setFetchedJobs([]);
        }
      } finally {
        if (!cancelled) setIsLoadingJobs(false);
      }
    };

    void loadJobs();
    return () => {
      cancelled = true;
    };
  }, [authLoading, jobs, user]);

  const scopedJobs = useMemo(() => {
    const source = jobs ?? fetchedJobs;
    const visibleJobs = scopeJobsForViewer(source, {
      profileId: profile?.id ?? user?.profileId ?? user?.profile?.id,
      isAdmin,
      isHR,
      isGMP,
      isFinance,
      isManager,
      isPartner,
      isEmployee,
    });

    return visibleJobs.map((job) => ({
      ...job,
      resolvedStatus: getResolvedStatus(job),
      isOverdue: getResolvedStatus(job) === "overdue",
      daysToDue: getDaysToDue(job),
    })) as DecoratedJob[];
  }, [
    fetchedJobs,
    jobs,
    profile?.id,
    user?.profileId,
    user?.profile?.id,
    isAdmin,
    isHR,
    isGMP,
    isFinance,
    isManager,
    isPartner,
    isEmployee,
  ]);

  const digest = useMemo(() => {
    const jobsInFlow = scopedJobs.filter((job) =>
      ["planned", "in_progress", "on_hold", "overdue"].includes(job.resolvedStatus)
    );
    const stages = [
      {
        key: "client",
        label: "Client & scope",
        value: scopedJobs.filter((job) => Boolean(job.clientId)).length,
        icon: Layers3,
      },
      {
        key: "staffing",
        label: "Staffed",
        value: scopedJobs.filter((job) => Boolean(job.teamAssigned)).length,
        icon: Users2,
      },
      {
        key: "costing",
        label: "Costed",
        value: scopedJobs.filter((job) => Boolean(job.costingCompleted)).length,
        icon: ShieldCheck,
      },
      {
        key: "execution",
        label: "Executing",
        value: scopedJobs.filter((job) => job.resolvedStatus === "in_progress").length,
        icon: Clock3,
      },
      {
        key: "closure",
        label: "Closed",
        value: scopedJobs.filter((job) => job.resolvedStatus === "completed").length,
        icon: CheckCircle2,
      },
    ];

    return {
      total: scopedJobs.length,
      inFlow: jobsInFlow.length,
      planned: scopedJobs.filter((job) => job.resolvedStatus === "planned").length,
      live: scopedJobs.filter((job) => job.resolvedStatus === "in_progress").length,
      overdue: scopedJobs.filter((job) => job.resolvedStatus === "overdue").length,
      onHold: scopedJobs.filter((job) => job.resolvedStatus === "on_hold").length,
      stages,
    };
  }, [scopedJobs]);

  const displayedMetrics = useMemo(
    () => (metrics && metrics.length ? metrics : deriveFallbackMetrics(scopedJobs)),
    [metrics, scopedJobs]
  );
  const pulseHeading = pulseTitle || (showLocator ? "Clean workflow visibility" : "Workflow at a glance");
  const pulseBlurb =
    pulseDescription ||
    (showLocator
      ? "Trace each job from setup through execution without flooding the page."
      : "Keep a compact read on scoped jobs, staffing progress, and execution pressure.");

  const spotlightJobs = useMemo(() => {
    const filtered = scopedJobs.filter((job) => {
      if (!search.trim()) return true;
      const haystack = [
        job.jobName,
        job.jobCode,
        job.client?.clientName,
        job.department?.name,
        getOwnerLabel(job),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(search.trim().toLowerCase());
    });

    const prioritized = [...filtered].sort((left, right) => {
      const leftPriority =
        (left.isOverdue ? 0 : 1) +
        (left.resolvedStatus === "in_progress" ? 0 : 2) +
        (String(left.priority || "") === "urgent" ? 0 : 1);
      const rightPriority =
        (right.isOverdue ? 0 : 1) +
        (right.resolvedStatus === "in_progress" ? 0 : 2) +
        (String(right.priority || "") === "urgent" ? 0 : 1);
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      const leftDue = left.dueDate ? new Date(left.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      const rightDue = right.dueDate ? new Date(right.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      return leftDue - rightDue;
    });

    return compact ? prioritized.slice(0, 8) : prioritized;
  }, [compact, scopedJobs, search]);

  return (
    <section className={className}>
      <div
        className={`grid min-w-0 gap-6 xl:grid-cols-2 ${
          showLocator ? "xl:items-start" : "xl:items-stretch"
        }`}
      >
        <Card className="min-w-0 overflow-hidden border-primary/15 bg-white/90 shadow-[0_24px_70px_-36px_rgba(15,23,42,0.45)]">
          <CardContent className="p-0">
            <div className="min-w-0 space-y-6 p-6 sm:p-8">
              <div className="space-y-3">
                <Badge className="border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-primary">
                  Job operations
                </Badge>
                <div className="space-y-2">
                  <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                    {title}
                  </h2>
                  <p className="max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">{description}</p>
                </div>
              </div>

              <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr))]">
                {displayedMetrics.map((metric) => {
                  const Icon = metric.icon;
                  const tone = TONE_STYLES[metric.tone || "primary"];
                  return (
                    <div
                      key={metric.label}
                      className={`min-w-0 rounded-3xl border border-slate-200 bg-gradient-to-br ${tone} p-4 shadow-sm`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                            {metric.label}
                          </p>
                          <p className="break-words text-xl font-semibold text-slate-950 sm:text-2xl">
                            {metric.value}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-white/80 p-2 shadow-sm">
                          <Icon className="h-4 w-4" />
                        </div>
                      </div>
                      {metric.hint ? (
                        <p className="mt-3 line-clamp-2 text-sm text-slate-600">{metric.hint}</p>
                      ) : (
                        <div className="mt-3 h-5" />
                      )}
                      <div className="mt-3">
                        <MiniStatGraph
                          value={metric.graphValue ?? Number(metric.value.replace(/[^0-9.-]/g, "") || 0)}
                          baseline={metric.graphBaseline}
                          inverse={metric.inverse}
                          hideLabel
                          className="mt-0"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="rounded-full bg-slate-100 px-3 py-1 font-medium">
                  {digest.total} {showLocator ? "jobs in scope" : "jobs scoped"}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 font-medium">
                  {digest.live} {showLocator ? "executing now" : "active now"}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 font-medium">
                  {digest.overdue} overdue
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 font-medium">
                  {digest.onHold} on hold
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className={`grid min-w-0 gap-6 ${showLocator ? "self-start" : "h-full"}`}>
          {showLocator ? (
            <Card className="min-w-0 border-primary/10 bg-white/85 shadow-[0_24px_70px_-36px_rgba(15,23,42,0.35)]">
              <CardHeader className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-xl">Job locator</CardTitle>
                    <CardDescription>Quickly trace the work that needs attention.</CardDescription>
                  </div>
                  {showBoardLink ? (
                    <Button asChild variant="outline" size="sm">
                      <Link to="/job-workflow-dashboard">
                        Open board
                        <ArrowUpRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  ) : null}
                </div>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary/55" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Find by job, client, manager, or partner"
                    className="h-11 rounded-2xl border-slate-200 pl-9"
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-3 max-h-[32rem] overflow-y-auto pr-2">
                {spotlightJobs.length ? (
                  spotlightJobs.map((job) => {
                    const dueLabel =
                      job.daysToDue === null
                        ? "No due date"
                        : job.daysToDue < 0
                          ? `${Math.abs(job.daysToDue)}d overdue`
                          : job.daysToDue === 0
                            ? "Due today"
                            : `${job.daysToDue}d left`;
                    const badgeClass = STATUS_BADGES[job.resolvedStatus] || STATUS_BADGES.planned;
                    const trackingPath = (job as any).trackingPath || `/jobs/${job.id}/tracking`;

                    return (
                      <Link
                        key={job.id}
                        to={trackingPath}
                        className="block rounded-3xl border border-slate-200 bg-slate-50/80 p-4 transition hover:-translate-y-0.5 hover:border-primary/25 hover:bg-white hover:shadow-md"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-semibold text-slate-900">{job.jobName}</p>
                              {job.jobCode ? (
                                <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-500">
                                  {job.jobCode}
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-1 truncate text-xs text-slate-500">
                              {job.client?.clientName || "Unlinked client"} / {getOwnerLabel(job)}
                            </p>
                          </div>
                          <Badge variant="outline" className={badgeClass}>
                            {formatJobStatus(job.resolvedStatus)}
                          </Badge>
                        </div>

                        <div className="mt-4 grid grid-cols-3 gap-3 text-xs text-slate-500">
                          <div>
                            <p className="uppercase tracking-[0.16em] text-slate-400">Due</p>
                            <p className={`mt-1 font-medium ${job.isOverdue ? "text-rose-600" : "text-slate-700"}`}>
                              {dueLabel}
                            </p>
                          </div>
                          <div>
                            <p className="uppercase tracking-[0.16em] text-slate-400">Priority</p>
                            <p className="mt-1 font-medium text-slate-700">
                              {String(job.priority || "medium").replace(/_/g, " ")}
                            </p>
                          </div>
                          <div>
                            <p className="uppercase tracking-[0.16em] text-slate-400">Workflow</p>
                            <p className="mt-1 font-medium text-slate-700">
                              {job.teamAssigned ? "Team staged" : "Needs staffing"}
                            </p>
                          </div>
                        </div>

                        {(job as any).operationsMetrics ? (
                          <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl border border-primary/10 bg-white/75 p-3 text-xs text-slate-500">
                            <div>
                              <p className="uppercase tracking-[0.16em] text-slate-400">Billable</p>
                              <p className="mt-1 font-medium text-slate-700">
                                {Number((job as any).operationsMetrics.billableHours || 0).toFixed(1)}h
                              </p>
                            </div>
                            <div>
                              <p className="uppercase tracking-[0.16em] text-slate-400">Collected</p>
                              <p className="mt-1 font-medium text-slate-700">
                                {formatCompactCurrency((job as any).operationsMetrics.collectedAmount || 0)}
                              </p>
                            </div>
                            <div>
                              <p className="uppercase tracking-[0.16em] text-slate-400">Outstanding</p>
                              <p className="mt-1 font-medium text-slate-700">
                                {formatCompactCurrency((job as any).operationsMetrics.outstandingAmount || 0)}
                              </p>
                            </div>
                            <div>
                              <p className="uppercase tracking-[0.16em] text-slate-400">Profit/Loss</p>
                              <p
                                className={`mt-1 font-medium ${
                                  Number((job as any).operationsMetrics.profitToDate || 0) >= 0
                                    ? "text-emerald-700"
                                    : "text-rose-600"
                                }`}
                              >
                                {formatCompactCurrency((job as any).operationsMetrics.profitToDate || 0)}
                              </p>
                            </div>
                          </div>
                        ) : null}
                      </Link>
                    );
                  })
                ) : (
                  <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center text-sm text-slate-500">
                    {search.trim() ? "No jobs match that search yet." : "No jobs are available in this scope yet."}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}

          <Card
            className={`min-w-0 overflow-hidden border-primary/15 bg-[radial-gradient(circle_at_top,_hsl(var(--brand-orange)/0.24),_transparent_34%),linear-gradient(140deg,hsl(var(--sidebar-background))_0%,hsl(var(--brand-dark-blue))_58%,hsl(var(--primary))_100%)] text-white shadow-[0_24px_70px_-36px_rgba(15,23,42,0.45)] ${
              showLocator ? "self-start" : "h-full"
            }`}
          >
            <CardContent
              className={
                showLocator
                  ? "px-6 pb-6 pt-8"
                  : "flex h-full flex-col px-5 pb-6 pt-8"
              }
            >
              <div className={showLocator ? "space-y-6" : "flex h-full flex-col gap-6"}>
                <div className={showLocator ? "" : "shrink-0"}>
                  <p className="py-4 text-xs font-semibold uppercase tracking-[0.22em] text-brand-orange text-center">
                    Operations pulse
                  </p>
                  <h3 className="mt-2 text-xl font-semibold">{pulseHeading}</h3>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">{pulseBlurb}</p>
                </div>

                <div
                  className={`rounded-[28px] border border-white/10 bg-white/5 backdrop-blur ${
                    showLocator ? "p-5" : "flex flex-1 flex-col p-4"
                  }`}
                >
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                        {showLocator ? "Jobs in flow" : "Jobs in scope"}
                      </p>
                      <p className="mt-2 text-4xl font-semibold text-white">{digest.inFlow}</p>
                    </div>
                    <div className="rounded-full border border-brand-orange/25 bg-white/5 px-3 py-1 text-xs font-medium text-orange-50">
                      {isLoadingJobs ? "Refreshing..." : showLocator ? "Live snapshot" : "Current view"}
                    </div>
                  </div>

                  <div
                    className={
                      showLocator
                        ? "mt-6 space-y-4"
                        : "mt-5 flex flex-1 flex-col justify-evenly gap-3"
                    }
                  >
                    {digest.stages.map((stage) => {
                      const StageIcon = stage.icon;
                      const width = digest.total > 0 ? Math.max(10, (stage.value / digest.total) * 100) : 10;
                      const stageLabel = !showLocator
                        ? ({
                            client: "In scope",
                            staffing: "Staffed",
                            costing: "Costed",
                            execution: "Active",
                            closure: "Closed",
                          } as Record<string, string>)[stage.key] || stage.label
                        : stage.label;
                      return (
                        <div key={stage.key} className="space-y-2">
                          <div className="flex items-center justify-between gap-3 text-sm">
                            <div className="flex items-center gap-2 text-slate-200">
                              <StageIcon className="h-4 w-4 text-brand-orange" />
                              <span>{stageLabel}</span>
                            </div>
                            <span className="font-semibold text-white">{stage.value}</span>
                          </div>
                          <div className="h-2 rounded-full bg-white/10">
                            <div
                              className="h-2 rounded-full bg-[image:var(--gradient-primary)]"
                              style={{ width: `${width}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className={`grid grid-cols-2 gap-3 ${showLocator ? "" : "shrink-0"}`}>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Overdue</p>
                    <p className="mt-2 text-2xl font-semibold">{digest.overdue}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                      {showLocator ? "Executing" : "Active"}
                    </p>
                    <p className="mt-2 text-2xl font-semibold">{digest.live}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
