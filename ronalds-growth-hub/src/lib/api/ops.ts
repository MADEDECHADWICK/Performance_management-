import { ApiError, apiFetch, getToken } from "./client";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";
const API_URL = `${BASE_URL}/api`;

export type OpsAlertSeverity = "warning" | "high" | "critical";
export type OpsErrorSeverity = "warning" | "error" | "critical";
export type OpsWorkerStatus = "starting" | "healthy" | "degraded" | "stopped";

export interface OpsHttpPathMetric {
  path: string;
  total: number;
  serverErrors: number;
  avgDurationMs: number;
}

export interface OpsHttpMetrics {
  windowMs: number;
  totalRequests: number;
  successCount: number;
  clientErrors: number;
  serverErrors: number;
  serverErrorRate: number;
  latencyMs: {
    avg: number;
    p50: number;
    p95: number;
    max: number;
  };
  topPaths: OpsHttpPathMetric[];
}

export interface OpsWorker {
  name: string;
  component: string;
  enabled: boolean;
  status: OpsWorkerStatus;
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
}

export interface OpsAlert {
  key: string;
  source: string;
  severity: OpsAlertSeverity;
  message: string;
  status: "active" | "resolved";
  firstTriggeredAt: string;
  lastTriggeredAt: string;
  count: number;
  context?: Record<string, unknown>;
}

export interface OpsError {
  id: string;
  source: string;
  severity: OpsErrorSeverity;
  message: string;
  code?: string | null;
  requestId?: string | null;
  occurredAt: string;
  context?: Record<string, unknown>;
  stack?: string;
}

export interface OpsNotificationDeliveryMetrics {
  windowDays: number;
  created: number;
  delivered: number;
  acked: number;
  opened: number;
  acted: number;
  failed: number;
  retryCount: number;
  latencyPercentilesMs: {
    p50: number | null;
    p95: number | null;
    p99: number | null;
  };
}

export interface OpsNotificationOutboxSummary {
  totalTracked: number;
  counts: Record<string, number>;
  deadLetters: Array<{
    notificationId: number;
    attempt: number;
    maxAttempts: number;
    lastError?: string | null;
  }>;
}

export interface OpsBackgroundJobs {
  initialized: boolean;
  queueNames: string[];
  emailTransportConfigured: boolean;
  lastInitializedAt: string | null;
  lastInitializationError: string | null;
  queues: Record<string, Record<string, number | string | boolean | null>>;
}

export interface OpsOverview {
  generatedAt: string;
  runtime: {
    nodeEnv: string;
    pid: number;
    hostname: string;
    uptimeSeconds: number;
    startedAt: string;
    memory: {
      rssBytes: number;
      heapUsedBytes: number;
      heapTotalBytes: number;
      externalBytes: number;
    };
  };
  http: OpsHttpMetrics;
  websockets: {
    connectedUsers: number;
    metrics: Record<string, number>;
  };
  notifications: {
    deliveryMetrics: OpsNotificationDeliveryMetrics | null;
    outboxSummary: OpsNotificationOutboxSummary | null;
  };
  backgroundJobs: OpsBackgroundJobs;
  workers: OpsWorker[];
  alerts: OpsAlert[];
  recentErrors: OpsError[];
}

export interface OpsMetricsSnapshot {
  http: OpsHttpMetrics;
  workers: OpsWorker[];
  alerts: OpsAlert[];
}

const parseErrorResponse = (payload: string, status: number) => {
  try {
    const parsed = JSON.parse(payload);
    return new ApiError(parsed.error || parsed.message || `HTTP ${status}`, status, parsed.code);
  } catch {
    return new ApiError(payload || `HTTP ${status}`, status);
  }
};

const getPrometheusMetrics = async () => {
  const token = getToken();
  const response = await fetch(`${API_URL}/ops/metrics/prometheus`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const payload = await response.text();

  if (!response.ok) {
    if (response.status === 401) {
      window.location.href = "/auth";
    }
    throw parseErrorResponse(payload, response.status);
  }

  return payload;
};

const opsAPI = {
  getOverview: () => apiFetch<OpsOverview>("GET", "/ops/overview"),
  getMetrics: () => apiFetch<OpsMetricsSnapshot>("GET", "/ops/metrics"),
  getWorkers: () => apiFetch<OpsWorker[]>("GET", "/ops/workers"),
  getErrors: (limit = 25) => apiFetch<OpsError[]>("GET", `/ops/errors?limit=${limit}`),
  getAlerts: (includeResolved = false) =>
    apiFetch<OpsAlert[]>("GET", `/ops/alerts?includeResolved=${includeResolved}`),
  getPrometheusMetrics,
};

export default opsAPI;
