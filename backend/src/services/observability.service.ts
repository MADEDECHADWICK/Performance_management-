import os from "os";
import { runtimeConfig } from "../config/env";
import { logger, toLogContext } from "../lib/logger";
import websocketService from "./websocket.service";

type AlertSeverity = "warning" | "high" | "critical";
type ErrorSeverity = "warning" | "error" | "critical";
type WorkerStatus = "starting" | "healthy" | "degraded" | "stopped";

type RequestSample = {
  at: number;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
};

type ErrorRecord = {
  id: string;
  source: string;
  severity: ErrorSeverity;
  message: string;
  code?: string | null;
  requestId?: string | null;
  occurredAt: string;
  context?: Record<string, unknown>;
  stack?: string;
};

type AlertRecord = {
  key: string;
  source: string;
  severity: AlertSeverity;
  message: string;
  status: "active" | "resolved";
  firstTriggeredAt: string;
  lastTriggeredAt: string;
  count: number;
  context?: Record<string, unknown>;
};

type WorkerState = {
  name: string;
  component: string;
  enabled: boolean;
  status: WorkerStatus;
  pollIntervalMs?: number | null;
  staleAfterMs?: number | null;
  startedAt?: string | null;
  stoppedAt?: string | null;
  lastHeartbeatAt?: string | null;
  lastSuccessAt?: string | null;
  lastFailureAt?: string | null;
  lastDurationMs?: number | null;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  consecutiveFailures: number;
  lastError?: {
    message: string;
    code?: string | null;
  } | null;
  metadata?: Record<string, unknown>;
};

type WorkerUpdate = {
  component?: string;
  enabled?: boolean;
  pollIntervalMs?: number | null;
  staleAfterMs?: number | null;
  durationMs?: number | null;
  metadata?: Record<string, unknown>;
};

type ErrorInput = {
  source: string;
  severity?: ErrorSeverity;
  error?: unknown;
  message?: string;
  code?: string | null;
  requestId?: string | null;
  context?: Record<string, unknown>;
};

const REQUEST_ALERT_WINDOW_MS = 5 * 60 * 1000;
const normalizeMetricPath = (path: string) =>
  String(path || "/")
    .split("?")[0]
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, ":uuid")
    .replace(/\/\d+(?=\/|$)/g, "/:id");

const percentile = (values: number[], p: number) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  );
  return sorted[index];
};

const average = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

const toIsoNow = () => new Date().toISOString();

const normalizeError = (error: unknown) => {
  if (error instanceof Error) {
    return {
      message: error.message,
      code: (error as any)?.code ? String((error as any).code) : null,
      stack: error.stack,
    };
  }

  if (error && typeof error === "object") {
    return {
      message: JSON.stringify(error),
      code: (error as any)?.code ? String((error as any).code) : null,
      stack: undefined,
    };
  }

  return {
    message: String(error || "Unknown error"),
    code: null,
    stack: undefined,
  };
};

class ObservabilityServiceClass {
  private startedAt = new Date();
  private requests: RequestSample[] = [];
  private errors: ErrorRecord[] = [];
  private alerts = new Map<string, AlertRecord>();
  private workers = new Map<string, WorkerState>();
  private monitorTimer: NodeJS.Timeout | null = null;

  private pruneRequests(now = Date.now()) {
    const cutoff = now - runtimeConfig.observabilityRequestWindowMs;
    this.requests = this.requests.filter((sample) => sample.at >= cutoff);
  }

  private pruneErrors() {
    if (this.errors.length <= runtimeConfig.observabilityRecentErrorsLimit) return;
    this.errors = this.errors.slice(-runtimeConfig.observabilityRecentErrorsLimit);
  }

  private emitAlert(alert: AlertRecord) {
    websocketService.emitToRole("hr", "ops:alert", alert);
    websocketService.emitToRole("super_admin", "ops:alert", alert);
  }

  private raiseAlert(
    key: string,
    input: {
      source: string;
      severity: AlertSeverity;
      message: string;
      context?: Record<string, unknown>;
    }
  ) {
    const now = Date.now();
    const existing = this.alerts.get(key);
    if (
      existing &&
      existing.status === "active" &&
      now - new Date(existing.lastTriggeredAt).getTime() <
        runtimeConfig.observabilityAlertCooldownMs
    ) {
      existing.lastTriggeredAt = toIsoNow();
      existing.count += 1;
      existing.context = input.context;
      return existing;
    }

    const next: AlertRecord = existing
      ? {
          ...existing,
          severity: input.severity,
          message: input.message,
          context: input.context,
          status: "active",
          lastTriggeredAt: toIsoNow(),
          count: existing.count + 1,
        }
      : {
          key,
          source: input.source,
          severity: input.severity,
          message: input.message,
          context: input.context,
          status: "active",
          firstTriggeredAt: toIsoNow(),
          lastTriggeredAt: toIsoNow(),
          count: 1,
        };

    this.alerts.set(key, next);
    if (input.severity === "critical") {
      logger.error("ops_alert_raised", next as unknown as Record<string, unknown>);
    } else {
      logger.warn("ops_alert_raised", next as unknown as Record<string, unknown>);
    }
    this.emitAlert(next);
    return next;
  }

  private resolveAlert(key: string, context?: Record<string, unknown>) {
    const existing = this.alerts.get(key);
    if (!existing || existing.status === "resolved") return;
    existing.status = "resolved";
    existing.lastTriggeredAt = toIsoNow();
    existing.context = context;
    logger.info("ops_alert_resolved", existing as unknown as Record<string, unknown>);
  }

  private ensureWorker(name: string, update?: WorkerUpdate): WorkerState {
    const existing = this.workers.get(name);
    if (existing) {
      if (update?.component) existing.component = update.component;
      if (update?.enabled !== undefined) existing.enabled = update.enabled;
      if (update?.pollIntervalMs !== undefined) existing.pollIntervalMs = update.pollIntervalMs;
      if (update?.staleAfterMs !== undefined) existing.staleAfterMs = update.staleAfterMs;
      if (update?.metadata) {
        existing.metadata = {
          ...(existing.metadata || {}),
          ...update.metadata,
        };
      }
      return existing;
    }

    const created: WorkerState = {
      name,
      component: update?.component || "runtime",
      enabled: update?.enabled ?? true,
      status: "stopped",
      pollIntervalMs: update?.pollIntervalMs,
      staleAfterMs: update?.staleAfterMs,
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      consecutiveFailures: 0,
      metadata: update?.metadata,
    };
    this.workers.set(name, created);
    return created;
  }

  private evaluateHttpAlerts() {
    const summary = this.getHttpMetrics(REQUEST_ALERT_WINDOW_MS);
    if (
      summary.totalRequests >= 10 &&
      summary.serverErrors >= 5 &&
      summary.serverErrorRate >= 0.2
    ) {
      this.raiseAlert("http_5xx_rate", {
        source: "http",
        severity: summary.serverErrorRate >= 0.5 ? "critical" : "high",
        message: `HTTP 5xx rate is ${Math.round(summary.serverErrorRate * 100)}% over the last 5 minutes`,
        context: {
          totalRequests: summary.totalRequests,
          serverErrors: summary.serverErrors,
          p95DurationMs: summary.latencyMs.p95,
        },
      });
      return;
    }

    this.resolveAlert("http_5xx_rate", {
      totalRequests: summary.totalRequests,
      serverErrors: summary.serverErrors,
    });
  }

  private evaluateWorkerStaleness() {
    const now = Date.now();
    this.workers.forEach((worker) => {
      const staleAfterMs = worker.staleAfterMs;
      const lastHeartbeatAt = worker.lastHeartbeatAt
        ? new Date(worker.lastHeartbeatAt).getTime()
        : null;

      if (
        worker.enabled &&
        worker.status !== "stopped" &&
        staleAfterMs &&
        lastHeartbeatAt &&
        now - lastHeartbeatAt > staleAfterMs
      ) {
        this.raiseAlert(`worker_stale:${worker.name}`, {
          source: `worker:${worker.name}`,
          severity: "high",
          message: `Worker ${worker.name} has not reported a heartbeat within ${staleAfterMs}ms`,
          context: {
            lastHeartbeatAt: worker.lastHeartbeatAt,
            staleAfterMs,
            consecutiveFailures: worker.consecutiveFailures,
          },
        });
        worker.status = "degraded";
        return;
      }

      this.resolveAlert(`worker_stale:${worker.name}`, {
        lastHeartbeatAt: worker.lastHeartbeatAt,
      });
    });
  }

  private runHealthChecks() {
    this.pruneRequests();
    this.evaluateHttpAlerts();
    this.evaluateWorkerStaleness();
  }

  startMonitoring() {
    if (!runtimeConfig.observabilityEnabled || this.monitorTimer) return;
    this.monitorTimer = setInterval(() => {
      this.runHealthChecks();
    }, runtimeConfig.observabilityMonitorIntervalMs);
    this.monitorTimer.unref();
  }

  stopMonitoring() {
    if (!this.monitorTimer) return;
    clearInterval(this.monitorTimer);
    this.monitorTimer = null;
  }

  recordRequest(input: {
    method: string;
    path: string;
    statusCode: number;
    durationMs: number;
  }) {
    if (!runtimeConfig.observabilityEnabled) return;
    this.requests.push({
      at: Date.now(),
      method: input.method,
      path: normalizeMetricPath(input.path),
      statusCode: input.statusCode,
      durationMs: input.durationMs,
    });
    this.pruneRequests();
    this.evaluateHttpAlerts();
  }

  recordError(input: ErrorInput) {
    if (!runtimeConfig.observabilityEnabled) return;
    const normalized = normalizeError(input.error);
    const record: ErrorRecord = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      source: input.source,
      severity: input.severity || "error",
      message: input.message || normalized.message,
      code: input.code ?? normalized.code,
      requestId: input.requestId || null,
      occurredAt: toIsoNow(),
      context: input.context,
      stack: normalized.stack,
    };
    this.errors.push(record);
    this.pruneErrors();

    if (record.severity === "critical" || record.source.startsWith("process:")) {
      this.raiseAlert(`error:${record.source}`, {
        source: record.source,
        severity: record.severity === "critical" ? "critical" : "high",
        message: record.message,
        context: {
          code: record.code,
          requestId: record.requestId,
        },
      });
    }
  }

  registerWorker(name: string, update?: WorkerUpdate) {
    return this.ensureWorker(name, update);
  }

  markWorkerStarted(name: string, update?: WorkerUpdate) {
    const worker = this.ensureWorker(name, update);
    worker.enabled = update?.enabled ?? worker.enabled;
    worker.status = "starting";
    worker.startedAt = toIsoNow();
    worker.stoppedAt = null;
    worker.lastHeartbeatAt = toIsoNow();
    worker.lastError = null;
    return worker;
  }

  markWorkerHeartbeat(name: string, update?: WorkerUpdate) {
    const worker = this.ensureWorker(name, update);
    worker.lastHeartbeatAt = toIsoNow();
    if (update?.metadata) {
      worker.metadata = {
        ...(worker.metadata || {}),
        ...update.metadata,
      };
    }
    return worker;
  }

  markWorkerSuccess(name: string, update?: WorkerUpdate) {
    const worker = this.ensureWorker(name, update);
    worker.status = "healthy";
    worker.lastHeartbeatAt = toIsoNow();
    worker.lastSuccessAt = toIsoNow();
    worker.lastDurationMs = update?.durationMs ?? worker.lastDurationMs ?? null;
    worker.totalRuns += 1;
    worker.successfulRuns += 1;
    worker.consecutiveFailures = 0;
    worker.lastError = null;
    this.resolveAlert(`worker_failure:${name}`, {
      lastSuccessAt: worker.lastSuccessAt,
      durationMs: worker.lastDurationMs,
    });
    this.resolveAlert(`worker_stale:${name}`, {
      lastHeartbeatAt: worker.lastHeartbeatAt,
    });
    return worker;
  }

  markWorkerFailure(name: string, error: unknown, update?: WorkerUpdate) {
    const worker = this.ensureWorker(name, update);
    const normalized = normalizeError(error);
    worker.status = "degraded";
    worker.lastHeartbeatAt = toIsoNow();
    worker.lastFailureAt = toIsoNow();
    worker.lastDurationMs = update?.durationMs ?? worker.lastDurationMs ?? null;
    worker.totalRuns += 1;
    worker.failedRuns += 1;
    worker.consecutiveFailures += 1;
    worker.lastError = {
      message: normalized.message,
      code: normalized.code,
    };

    this.recordError({
      source: `worker:${name}`,
      severity: worker.consecutiveFailures >= 3 ? "critical" : "error",
      error,
      context: {
        consecutiveFailures: worker.consecutiveFailures,
        durationMs: worker.lastDurationMs,
        ...(update?.metadata || {}),
      },
    });

    this.raiseAlert(`worker_failure:${name}`, {
      source: `worker:${name}`,
      severity: worker.consecutiveFailures >= 3 ? "critical" : "high",
      message: `Worker ${name} failed${worker.consecutiveFailures >= 3 ? " repeatedly" : ""}`,
      context: {
        consecutiveFailures: worker.consecutiveFailures,
        lastFailureAt: worker.lastFailureAt,
        lastError: worker.lastError,
      },
    });

    return worker;
  }

  markWorkerStopped(name: string, update?: WorkerUpdate) {
    const worker = this.ensureWorker(name, update);
    worker.status = "stopped";
    worker.stoppedAt = toIsoNow();
    if (update?.enabled !== undefined) {
      worker.enabled = update.enabled;
    }
    return worker;
  }

  getRecentErrors(limit = 50) {
    return this.errors.slice(-Math.max(1, Math.min(limit, this.errors.length))).reverse();
  }

  getAlerts(options?: { includeResolved?: boolean }) {
    this.runHealthChecks();
    return Array.from(this.alerts.values())
      .filter((alert) => options?.includeResolved || alert.status === "active")
      .sort(
        (left, right) =>
          new Date(right.lastTriggeredAt).getTime() - new Date(left.lastTriggeredAt).getTime()
      );
  }

  getWorkers() {
    this.runHealthChecks();
    return Array.from(this.workers.values()).sort((left, right) =>
      left.name.localeCompare(right.name)
    );
  }

  getHttpMetrics(windowMs = runtimeConfig.observabilityRequestWindowMs) {
    const now = Date.now();
    const samples = this.requests.filter((sample) => sample.at >= now - windowMs);
    const durations = samples.map((sample) => sample.durationMs);
    const totalRequests = samples.length;
    const serverErrors = samples.filter((sample) => sample.statusCode >= 500).length;
    const clientErrors = samples.filter(
      (sample) => sample.statusCode >= 400 && sample.statusCode < 500
    ).length;
    const successCount = samples.filter((sample) => sample.statusCode < 400).length;
    const byPathMap = new Map<string, { total: number; serverErrors: number; durationMs: number }>();

    samples.forEach((sample) => {
      const bucket = byPathMap.get(sample.path) || { total: 0, serverErrors: 0, durationMs: 0 };
      bucket.total += 1;
      bucket.durationMs += sample.durationMs;
      if (sample.statusCode >= 500) bucket.serverErrors += 1;
      byPathMap.set(sample.path, bucket);
    });

    return {
      windowMs,
      totalRequests,
      successCount,
      clientErrors,
      serverErrors,
      serverErrorRate: totalRequests > 0 ? serverErrors / totalRequests : 0,
      latencyMs: {
        avg: Math.round(average(durations)),
        p50: percentile(durations, 50),
        p95: percentile(durations, 95),
        max: durations.length ? Math.max(...durations) : 0,
      },
      topPaths: Array.from(byPathMap.entries())
        .map(([path, stats]) => ({
          path,
          total: stats.total,
          serverErrors: stats.serverErrors,
          avgDurationMs: Math.round(stats.durationMs / Math.max(1, stats.total)),
        }))
        .sort((left, right) => right.total - left.total)
        .slice(0, 10),
    };
  }

  private async getNotificationSnapshot() {
    try {
      const [{ NotificationService }, { NotificationOutboxService }] = await Promise.all([
        import("./notifications.service"),
        import("./notificationOutbox.service"),
      ]);

      const [deliveryMetrics, outboxSummary] = await Promise.all([
        NotificationService.getOperationalMetrics(1),
        NotificationOutboxService.getOutboxSummary(),
      ]);

      return { deliveryMetrics, outboxSummary };
    } catch (error) {
      this.recordError({
        source: "ops:notification_snapshot",
        severity: "warning",
        error,
      });
      logger.warn("ops_notification_snapshot_failed", toLogContext(error));
      return {
        deliveryMetrics: null,
        outboxSummary: null,
      };
    }
  }

  private async getBackgroundQueueSnapshot() {
    try {
      const { default: backgroundJobsService } = await import("./background-jobs.service");
      const runtime = backgroundJobsService.getRuntimeState();
      const queues = runtime.initialized ? await backgroundJobsService.getAllQueueStats() : {};
      return { ...runtime, queues };
    } catch (error) {
      this.recordError({
        source: "ops:background_queue_snapshot",
        severity: "warning",
        error,
      });
      logger.warn("ops_background_queue_snapshot_failed", toLogContext(error));
      return {
        initialized: false,
        queueNames: [],
        emailTransportConfigured: false,
        lastInitializedAt: null,
        lastInitializationError: "background_queue_snapshot_failed",
        queues: {},
      };
    }
  }

  async getOverview() {
    this.runHealthChecks();
    const [notifications, backgroundJobs] = await Promise.all([
      this.getNotificationSnapshot(),
      this.getBackgroundQueueSnapshot(),
    ]);

    const memory = process.memoryUsage();

    return {
      generatedAt: toIsoNow(),
      runtime: {
        nodeEnv: runtimeConfig.nodeEnv,
        pid: process.pid,
        hostname: os.hostname(),
        uptimeSeconds: Math.round(process.uptime()),
        startedAt: this.startedAt.toISOString(),
        memory: {
          rssBytes: memory.rss,
          heapUsedBytes: memory.heapUsed,
          heapTotalBytes: memory.heapTotal,
          externalBytes: memory.external,
        },
      },
      http: this.getHttpMetrics(),
      websockets: {
        connectedUsers: websocketService.getConnectedUsersCount(),
        metrics: websocketService.getMetrics(),
      },
      notifications,
      backgroundJobs,
      workers: this.getWorkers(),
      alerts: this.getAlerts(),
      recentErrors: this.getRecentErrors(20),
    };
  }

  async getPrometheusMetrics() {
    const overview = await this.getOverview();
    const lines = [
      "# HELP ronalds_http_requests_total Total HTTP requests observed in the configured window",
      "# TYPE ronalds_http_requests_total gauge",
      `ronalds_http_requests_total ${overview.http.totalRequests}`,
      "# HELP ronalds_http_server_errors_total Total HTTP 5xx responses observed in the configured window",
      "# TYPE ronalds_http_server_errors_total gauge",
      `ronalds_http_server_errors_total ${overview.http.serverErrors}`,
      "# HELP ronalds_http_latency_p95_ms P95 HTTP latency in milliseconds",
      "# TYPE ronalds_http_latency_p95_ms gauge",
      `ronalds_http_latency_p95_ms ${overview.http.latencyMs.p95}`,
      "# HELP ronalds_ws_connected_users Active websocket users",
      "# TYPE ronalds_ws_connected_users gauge",
      `ronalds_ws_connected_users ${overview.websockets.connectedUsers}`,
      "# HELP ronalds_ops_active_alerts Active operational alerts",
      "# TYPE ronalds_ops_active_alerts gauge",
      `ronalds_ops_active_alerts ${overview.alerts.filter((alert) => alert.status === "active").length}`,
    ];

    overview.workers.forEach((worker) => {
      const workerLabel = worker.name.replace(/[^a-zA-Z0-9_]/g, "_");
      const statusValue = worker.status === "healthy" ? 1 : worker.status === "starting" ? 0.5 : 0;
      lines.push(`# TYPE ronalds_worker_status_${workerLabel} gauge`);
      lines.push(`ronalds_worker_status_${workerLabel} ${statusValue}`);
      lines.push(`# TYPE ronalds_worker_failures_${workerLabel} gauge`);
      lines.push(`ronalds_worker_failures_${workerLabel} ${worker.failedRuns}`);
    });

    if (overview.notifications.deliveryMetrics) {
      lines.push("# TYPE ronalds_notification_created_total gauge");
      lines.push(
        `ronalds_notification_created_total ${overview.notifications.deliveryMetrics.created || 0}`
      );
      lines.push("# TYPE ronalds_notification_failed_total gauge");
      lines.push(
        `ronalds_notification_failed_total ${overview.notifications.deliveryMetrics.failed || 0}`
      );
    }

    return `${lines.join("\n")}\n`;
  }
}

export const ObservabilityService = new ObservabilityServiceClass();
