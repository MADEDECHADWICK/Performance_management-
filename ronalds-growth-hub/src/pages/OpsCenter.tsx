import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  Bug,
  Copy,
  RefreshCw,
  ServerCog,
  Signal,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import PageLoader from "@/components/ui/page-loader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import opsAPI from "@/lib/api/ops";

const REFRESH_INTERVAL_MS = 30_000;

const formatDateTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString() : "Not available";

const formatRelativeDuration = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0m";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
};

const formatBytes = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const scaled = value / Math.pow(1024, index);
  return `${scaled.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

const getSeverityBadgeClass = (severity: string) => {
  switch (severity) {
    case "critical":
      return "border-rose-200 bg-rose-100 text-rose-700";
    case "high":
    case "error":
      return "border-amber-200 bg-amber-100 text-amber-700";
    default:
      return "border-sky-200 bg-sky-100 text-sky-700";
  }
};

const getWorkerStatusBadgeClass = (status: string) => {
  switch (status) {
    case "healthy":
      return "border-emerald-200 bg-emerald-100 text-emerald-700";
    case "degraded":
      return "border-amber-200 bg-amber-100 text-amber-700";
    case "starting":
      return "border-sky-200 bg-sky-100 text-sky-700";
    default:
      return "border-slate-200 bg-slate-100 text-slate-700";
  }
};

const getStatusBadgeClass = (status: string) =>
  status === "active"
    ? "border-rose-200 bg-rose-100 text-rose-700"
    : "border-slate-200 bg-slate-100 text-slate-700";

export default function OpsCenter() {
  const { toast } = useToast();
  const [prometheusVisible, setPrometheusVisible] = useState(false);

  const overviewQuery = useQuery({
    queryKey: ["ops-center", "overview"],
    queryFn: () => opsAPI.getOverview(),
    refetchInterval: REFRESH_INTERVAL_MS,
  });

  const workersQuery = useQuery({
    queryKey: ["ops-center", "workers"],
    queryFn: () => opsAPI.getWorkers(),
    refetchInterval: REFRESH_INTERVAL_MS,
  });

  const alertsQuery = useQuery({
    queryKey: ["ops-center", "alerts"],
    queryFn: () => opsAPI.getAlerts(true),
    refetchInterval: REFRESH_INTERVAL_MS,
  });

  const errorsQuery = useQuery({
    queryKey: ["ops-center", "errors"],
    queryFn: () => opsAPI.getErrors(25),
    refetchInterval: REFRESH_INTERVAL_MS,
  });

  const prometheusQuery = useQuery({
    queryKey: ["ops-center", "prometheus"],
    queryFn: () => opsAPI.getPrometheusMetrics(),
    enabled: prometheusVisible,
    refetchInterval: prometheusVisible ? 60_000 : false,
  });

  const overview = overviewQuery.data;
  const workers = workersQuery.data ?? overview?.workers ?? [];
  const alerts = alertsQuery.data ?? overview?.alerts ?? [];
  const recentErrors = errorsQuery.data ?? overview?.recentErrors ?? [];
  const activeAlerts = useMemo(
    () => alerts.filter((alert) => alert.status === "active"),
    [alerts]
  );
  const healthyWorkerCount = workers.filter((worker) => worker.status === "healthy").length;
  const deliveryMetrics = overview?.notifications.deliveryMetrics;
  const outboxSummary = overview?.notifications.outboxSummary;
  const topPaths = overview?.http.topPaths ?? [];
  const backgroundJobNames = overview?.backgroundJobs.queueNames ?? [];

  const handleRefresh = async () => {
    await Promise.all([
      overviewQuery.refetch(),
      workersQuery.refetch(),
      alertsQuery.refetch(),
      errorsQuery.refetch(),
      prometheusVisible ? prometheusQuery.refetch() : Promise.resolve(undefined),
    ]);
  };

  const handleCopyPrometheus = async () => {
    if (!prometheusQuery.data) return;

    try {
      await navigator.clipboard.writeText(prometheusQuery.data);
      toast({
        title: "Copied",
        description: "Prometheus export copied to clipboard.",
      });
    } catch {
      toast({
        title: "Copy failed",
        description: "Unable to copy the Prometheus export.",
        variant: "destructive",
      });
    }
  };

  const isInitialLoading =
    overviewQuery.isLoading &&
    workersQuery.isLoading &&
    alertsQuery.isLoading &&
    errorsQuery.isLoading;

  if (isInitialLoading) {
    return (
      <DashboardLayout>
        <PageLoader message="Loading operational telemetry..." minHeightClassName="min-h-[50vh]" />
      </DashboardLayout>
    );
  }

  if (!overview) {
    return (
      <DashboardLayout>
        <div className="space-y-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Ops Center</h1>
            <p className="text-sm text-muted-foreground">
              Runtime health, worker status, alerts, and delivery visibility.
            </p>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Operational telemetry unavailable</CardTitle>
              <CardDescription>
                The backend did not return the ops overview payload.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => overviewQuery.refetch()}>Retry</Button>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-1">
            <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
              <Activity className="h-8 w-8 text-primary" />
              Ops Center
            </h1>
            <p className="text-sm text-muted-foreground">
              Monitor runtime health, background workers, alert pressure, and delivery reliability.
            </p>
            <p className="text-xs text-muted-foreground">
              Last generated {formatDateTime(overview.generatedAt)} on {overview.runtime.hostname} ·{" "}
              uptime {formatRelativeDuration(overview.runtime.uptimeSeconds)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{overview.runtime.nodeEnv}</Badge>
            <Badge variant="outline">PID {overview.runtime.pid}</Badge>
            <Button
              variant="outline"
              onClick={handleRefresh}
              disabled={overviewQuery.isFetching || workersQuery.isFetching}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Active Alerts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{activeAlerts.length}</div>
              <p className="text-xs text-muted-foreground">
                {alerts.length - activeAlerts.length} resolved in memory window
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Healthy Workers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">
                {healthyWorkerCount}/{workers.length}
              </div>
              <p className="text-xs text-muted-foreground">Tracked worker runtimes</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">HTTP P95</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{overview.http.latencyMs.p95}ms</div>
              <p className="text-xs text-muted-foreground">
                {overview.http.totalRequests.toLocaleString()} requests in active window
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">HTTP 5xx Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">
                {Math.round(overview.http.serverErrorRate * 100)}%
              </div>
              <p className="text-xs text-muted-foreground">
                {overview.http.serverErrors} server errors, {overview.http.clientErrors} client errors
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Socket Sessions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{overview.websockets.connectedUsers}</div>
              <p className="text-xs text-muted-foreground">
                Delivered {overview.websockets.metrics.delivered ?? 0}, acked{" "}
                {overview.websockets.metrics.acked ?? 0}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Outbox Dead Letters</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">
                {outboxSummary?.deadLetters.length ?? 0}
              </div>
              <p className="text-xs text-muted-foreground">
                {outboxSummary?.totalTracked ?? 0} tracked dispatch states
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ServerCog className="h-5 w-5 text-primary" />
                Worker Health
              </CardTitle>
              <CardDescription>
                Background jobs and notification workers with heartbeat, run totals, and failure state.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {workers.length ? (
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Worker</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Heartbeat</TableHead>
                        <TableHead>Runs</TableHead>
                        <TableHead>Failures</TableHead>
                        <TableHead>Last Duration</TableHead>
                        <TableHead>Last Error</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {workers.map((worker) => (
                        <TableRow key={worker.name}>
                          <TableCell>
                            <div className="font-medium">{worker.name}</div>
                            <div className="text-xs text-muted-foreground">{worker.component}</div>
                          </TableCell>
                          <TableCell>
                            <Badge className={getWorkerStatusBadgeClass(worker.status)}>
                              {worker.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDateTime(worker.lastHeartbeatAt)}
                          </TableCell>
                          <TableCell className="text-sm">
                            {worker.successfulRuns}/{worker.totalRuns}
                          </TableCell>
                          <TableCell className="text-sm">
                            {worker.failedRuns}
                            {worker.consecutiveFailures > 0 ? (
                              <span className="text-muted-foreground">
                                {" "}
                                ({worker.consecutiveFailures} consecutive)
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {worker.lastDurationMs ? `${worker.lastDurationMs}ms` : "Not recorded"}
                          </TableCell>
                          <TableCell className="max-w-[280px] text-sm text-muted-foreground">
                            {worker.lastError?.message || "None"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No worker telemetry reported yet.</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Signal className="h-5 w-5 text-primary" />
                Runtime Snapshot
              </CardTitle>
              <CardDescription>
                Memory footprint, notification delivery health, and background queue readiness.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border p-4">
                <div className="text-sm font-medium">Memory</div>
                <div className="mt-2 grid gap-2 text-sm text-muted-foreground">
                  <div className="flex items-center justify-between">
                    <span>RSS</span>
                    <span>{formatBytes(overview.runtime.memory.rssBytes)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Heap used</span>
                    <span>{formatBytes(overview.runtime.memory.heapUsedBytes)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Heap total</span>
                    <span>{formatBytes(overview.runtime.memory.heapTotalBytes)}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border p-4">
                <div className="text-sm font-medium">Notifications</div>
                <div className="mt-2 grid gap-2 text-sm text-muted-foreground">
                  <div className="flex items-center justify-between">
                    <span>Delivered</span>
                    <span>{deliveryMetrics?.delivered ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Failed</span>
                    <span>{deliveryMetrics?.failed ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Outbox pending</span>
                    <span>{outboxSummary?.counts.pending ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Dead letters</span>
                    <span>{outboxSummary?.deadLetters.length ?? 0}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border p-4">
                <div className="text-sm font-medium">Background queues</div>
                <div className="mt-2 text-sm text-muted-foreground">
                  {overview.backgroundJobs.initialized
                    ? `${backgroundJobNames.length} queue(s) ready`
                    : "Background queue runtime not initialized"}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {backgroundJobNames.length ? (
                    backgroundJobNames.map((queueName) => (
                      <Badge key={queueName} variant="outline">
                        {queueName}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">No queues reported.</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-primary" />
                Alerts
              </CardTitle>
              <CardDescription>
                Active and recently resolved alerts raised by request or worker health checks.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {alerts.length ? (
                alerts.map((alert) => (
                  <div key={alert.key} className="rounded-lg border border-border/70 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className={getSeverityBadgeClass(alert.severity)}>
                            {alert.severity}
                          </Badge>
                          <Badge className={getStatusBadgeClass(alert.status)}>{alert.status}</Badge>
                          <span className="text-xs text-muted-foreground">{alert.source}</span>
                        </div>
                        <div className="font-medium">{alert.message}</div>
                        <div className="text-xs text-muted-foreground">
                          First seen {formatDateTime(alert.firstTriggeredAt)} · last triggered{" "}
                          {formatDateTime(alert.lastTriggeredAt)} · count {alert.count}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">No operational alerts at the moment.</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bug className="h-5 w-5 text-primary" />
                Recent Errors
              </CardTitle>
              <CardDescription>
                Most recent runtime and worker errors captured by the backend telemetry layer.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentErrors.length ? (
                recentErrors.map((error) => (
                  <div key={error.id} className="rounded-lg border border-border/70 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={getSeverityBadgeClass(error.severity)}>
                        {error.severity}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{error.source}</span>
                      {error.code ? <Badge variant="outline">{error.code}</Badge> : null}
                    </div>
                    <div className="mt-2 font-medium">{error.message}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {formatDateTime(error.occurredAt)}
                      {error.requestId ? ` · request ${error.requestId}` : ""}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">No recent errors captured.</div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <Card>
            <CardHeader>
              <CardTitle>HTTP Hot Paths</CardTitle>
              <CardDescription>
                Most active request paths in the rolling observability window.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {topPaths.length ? (
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Path</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>5xx</TableHead>
                        <TableHead>Avg Duration</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topPaths.map((pathMetric) => (
                        <TableRow key={pathMetric.path}>
                          <TableCell className="font-mono text-xs">{pathMetric.path}</TableCell>
                          <TableCell>{pathMetric.total}</TableCell>
                          <TableCell>{pathMetric.serverErrors}</TableCell>
                          <TableCell>{pathMetric.avgDurationMs}ms</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  No HTTP activity has been observed in the current window yet.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Prometheus Export</CardTitle>
              <CardDescription>
                Plain-text metrics snapshot for external scraping or quick internal inspection.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => setPrometheusVisible((current) => !current)}
                >
                  {prometheusVisible ? "Hide export" : "Load export"}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleCopyPrometheus}
                  disabled={!prometheusQuery.data}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copy
                </Button>
              </div>
              {prometheusVisible ? (
                prometheusQuery.isLoading ? (
                  <div className="text-sm text-muted-foreground">Loading Prometheus export...</div>
                ) : prometheusQuery.isError ? (
                  <div className="text-sm text-destructive">
                    Unable to load the Prometheus metrics export.
                  </div>
                ) : (
                  <Textarea
                    readOnly
                    value={prometheusQuery.data || ""}
                    className="min-h-[280px] font-mono text-xs"
                  />
                )
              ) : (
                <div className="text-sm text-muted-foreground">
                  Export stays collapsed until you explicitly request it.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
