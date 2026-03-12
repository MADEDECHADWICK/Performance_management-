import { randomUUID } from "crypto";
import type { NextFunction, Request, Response } from "express";
import { runtimeConfig } from "../config/env";

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const shouldLog = (level: LogLevel) =>
  LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[runtimeConfig.logLevel];

const serializeError = (error: unknown) => {
  if (!(error instanceof Error)) return error;
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
};

const write = (level: LogLevel, message: string, context?: Record<string, unknown>) => {
  if (!shouldLog(level)) return;

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(context || {}),
  };

  const line = JSON.stringify(entry);
  if (level === "error") {
    process.stderr.write(`${line}\n`);
    return;
  }
  process.stdout.write(`${line}\n`);
};

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => write("debug", message, context),
  info: (message: string, context?: Record<string, unknown>) => write("info", message, context),
  warn: (message: string, context?: Record<string, unknown>) => write("warn", message, context),
  error: (message: string, context?: Record<string, unknown>) => write("error", message, context),
};

export const requestLoggingMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (!runtimeConfig.requestLoggingEnabled) {
    next();
    return;
  }

  const headerRequestId = String(req.headers["x-request-id"] || req.headers["x-correlation-id"] || "").trim();
  const requestId = headerRequestId || randomUUID();
  const startedAt = Date.now();

  res.locals.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  res.on("finish", () => {
    logger.info("http_request", {
      requestId,
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
      ip: req.ip,
      userId: (req as any)?.user?.userId || null,
      profileId: (req as any)?.user?.profileId || null,
    });
  });

  next();
};

export const toLogContext = (error: unknown) => ({
  error: serializeError(error),
});
