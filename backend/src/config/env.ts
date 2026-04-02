// This module is responsible for loading and validating runtime configuration from environment variables. It provides a structured way to access configuration values throughout the application, ensuring that they are properly typed and have sensible defaults. The configuration includes settings for server behavior, logging, rate limiting, observability, file uploads, and more. By centralizing configuration management in this module, we can maintain consistency and make it easier to manage different environments (development, testing, production) with appropriate settings for each.

import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { getJwtSecret } from "./jwt";

dotenv.config();

type RuntimeEnv = "development" | "test" | "production";
type LogLevel = "debug" | "info" | "warn" | "error";

const VALID_ENVS = new Set<RuntimeEnv>(["development", "test", "production"]);
const VALID_LOG_LEVELS = new Set<LogLevel>(["debug", "info", "warn", "error"]);

const toTrimmedString = (value: unknown) => String(value || "").trim();

const parseBoolean = (value: unknown, fallback = false) => {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
};

const parsePositiveInteger = (value: unknown, fallback: number, label: string) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    if (value === undefined || value === null || String(value).trim() === "") {
      return fallback;
    }
    throw new Error(`${label} must be a positive integer`);
  }
  return Math.trunc(parsed);
};

const resolvePathFromCwd = (value: string | undefined, fallbackRelativePath: string) => {
  const configured = toTrimmedString(value);
  const candidate = configured || fallbackRelativePath;
  return path.isAbsolute(candidate) ? candidate : path.resolve(process.cwd(), candidate);
};

const normalizePublicBasePath = (value: string | undefined) => {
  const trimmed = toTrimmedString(value) || "/uploads";
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/, "") || "/uploads";
};

const nodeEnv = (() => {
  const raw = toTrimmedString(process.env.NODE_ENV).toLowerCase() as RuntimeEnv;
  if (!raw) return "development";
  if (!VALID_ENVS.has(raw)) {
    throw new Error(`NODE_ENV must be one of: development, test, production`);
  }
  return raw;
})();

const logLevel = (() => {
  const raw = toTrimmedString(process.env.LOG_LEVEL).toLowerCase() as LogLevel;
  if (!raw) return nodeEnv === "development" ? "debug" : "info";
  if (!VALID_LOG_LEVELS.has(raw)) {
    throw new Error(`LOG_LEVEL must be one of: debug, info, warn, error`);
  }
  return raw;
})();

export const runtimeConfig = Object.freeze({
  nodeEnv,
  port: parsePositiveInteger(process.env.PORT, 4000, "PORT"),
  logLevel,
  requestLoggingEnabled: parseBoolean(process.env.REQUEST_LOGGING_ENABLED, true),
  httpRateLimitEnabled: parseBoolean(process.env.HTTP_RATE_LIMIT_ENABLED, true),
  httpRateLimitWindowMs: parsePositiveInteger(
    process.env.HTTP_RATE_LIMIT_WINDOW_MS,
    60_000,
    "HTTP_RATE_LIMIT_WINDOW_MS"
  ),
  httpRateLimitMaxRequests: parsePositiveInteger(
    process.env.HTTP_RATE_LIMIT_MAX_REQUESTS,
    nodeEnv === "production" ? 300 : 1_000,
    "HTTP_RATE_LIMIT_MAX_REQUESTS"
  ),
  observabilityEnabled: parseBoolean(process.env.OBSERVABILITY_ENABLED, true),
  observabilityMonitorIntervalMs: parsePositiveInteger(
    process.env.OBSERVABILITY_MONITOR_INTERVAL_MS,
    30_000,
    "OBSERVABILITY_MONITOR_INTERVAL_MS"
  ),
  observabilityRecentErrorsLimit: parsePositiveInteger(
    process.env.OBSERVABILITY_RECENT_ERRORS_LIMIT,
    200,
    "OBSERVABILITY_RECENT_ERRORS_LIMIT"
  ),
  observabilityAlertCooldownMs: parsePositiveInteger(
    process.env.OBSERVABILITY_ALERT_COOLDOWN_MS,
    5 * 60 * 1000,
    "OBSERVABILITY_ALERT_COOLDOWN_MS"
  ),
  observabilityRequestWindowMs: parsePositiveInteger(
    process.env.OBSERVABILITY_REQUEST_WINDOW_MS,
    15 * 60 * 1000,
    "OBSERVABILITY_REQUEST_WINDOW_MS"
  ),
  uploadRoot: resolvePathFromCwd(process.env.UPLOAD_ROOT, "uploads"),
  uploadPublicBasePath: normalizePublicBasePath(process.env.UPLOAD_PUBLIC_BASE_PATH),
  diskUploadsEnabled: parseBoolean(
    process.env.ENABLE_LOCAL_DISK_UPLOADS,
    nodeEnv !== "production"
  ),
  serveLocalUploads: parseBoolean(process.env.SERVE_LOCAL_UPLOADS, nodeEnv !== "production"),
  documentUploadMaxBytes: parsePositiveInteger(
    process.env.DOCUMENT_UPLOAD_MAX_BYTES,
    10 * 1024 * 1024,
    "DOCUMENT_UPLOAD_MAX_BYTES"
  ),
  knowledgeHubUploadMaxBytes: parsePositiveInteger(
    process.env.KNOWLEDGE_HUB_UPLOAD_MAX_BYTES,
    25 * 1024 * 1024,
    "KNOWLEDGE_HUB_UPLOAD_MAX_BYTES"
  ),
});

export const isProductionEnv = () => runtimeConfig.nodeEnv === "production";

export const ensureUploadRootExists = () => {
  if (!runtimeConfig.diskUploadsEnabled && !runtimeConfig.serveLocalUploads) {
    return;
  }
  fs.mkdirSync(runtimeConfig.uploadRoot, { recursive: true });
};

export const assertRuntimeConfig = () => {
  getJwtSecret();

  if (isProductionEnv() && !toTrimmedString(process.env.CORS_ORIGIN)) {
    throw new Error("CORS_ORIGIN is required in production");
  }

  ensureUploadRootExists();
};
