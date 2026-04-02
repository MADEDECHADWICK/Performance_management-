// This middleware implements HTTP rate limiting to protect the application from abuse and ensure fair usage. It tracks the number of requests made by each client (identified by IP address or a custom key) within a specified time window and enforces limits on the number of requests allowed. The middleware can be configured with options such as the time window, maximum requests, exempt paths, and custom key generation logic. When a client exceeds the allowed number of requests, the middleware responds with a 429 Too Many Requests status code and includes relevant headers to inform the client about their rate limit status and when they can retry. By using this middleware, we can help prevent denial-of-service attacks and ensure that our application remains responsive for all users.
//The allowed number of requests is set to 100 requests per 15 minutes (900,000 milliseconds) by default, but these values can be customized through environment variables or options passed to the middleware. The middleware also includes logic to clean up old entries from the in-memory store to prevent memory bloat, and it allows for certain paths to be exempt from rate limiting (e.g., health checks). Overall, this implementation provides a simple yet effective way to manage request rates and protect the application from excessive traffic.

import type { NextFunction, Request, Response } from "express";
import { runtimeConfig } from "../config/env";
import { logger } from "../lib/logger";
import { errorResponse } from "../utils/response";

type RateLimitState = {
  count: number;
  resetAt: number;
};

type RequestRateLimitOptions = {
  enabled?: boolean;
  windowMs?: number;
  maxRequests?: number;
  maxEntries?: number;
  exemptPaths?: string[];
  keyGenerator?: (req: Request) => string;
  now?: () => number;
};

const DEFAULT_EXEMPT_PATHS = ["/", "/health"];

const getRequestPath = (req: Request) => req.path || req.originalUrl || req.url || "/";

const getClientKey = (req: Request) => {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }
  return req.ip || req.socket.remoteAddress || "unknown";
};

export const buildHttpRateLimitMiddleware = (options: RequestRateLimitOptions = {}) => {
  const store = new Map<string, RateLimitState>();
  const enabled = options.enabled ?? runtimeConfig.httpRateLimitEnabled;
  const windowMs = options.windowMs ?? runtimeConfig.httpRateLimitWindowMs;
  const maxRequests = options.maxRequests ?? runtimeConfig.httpRateLimitMaxRequests;
  const maxEntries = options.maxEntries ?? 10_000;
  const exemptPaths = new Set(options.exemptPaths ?? DEFAULT_EXEMPT_PATHS);
  const keyGenerator = options.keyGenerator ?? getClientKey;
  const now = options.now ?? (() => Date.now());

  return (req: Request, res: Response, next: NextFunction) => {
    if (!enabled) {
      next();
      return;
    }

    const path = getRequestPath(req);
    if (exemptPaths.has(path)) {
      next();
      return;
    }

    const currentTime = now();
    if (store.size >= maxEntries) {
      for (const [key, state] of store.entries()) {
        if (state.resetAt <= currentTime) {
          store.delete(key);
        }
      }
    }

    const key = keyGenerator(req);
    const current = store.get(key);
    const state =
      current && current.resetAt > currentTime
        ? current
        : {
            count: 0,
            resetAt: currentTime + windowMs,
          };

    state.count += 1;
    store.set(key, state);

    const remaining = Math.max(0, maxRequests - state.count);
    const retryAfterSeconds = Math.max(1, Math.ceil((state.resetAt - currentTime) / 1000));

    res.setHeader("X-RateLimit-Limit", String(maxRequests));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader("X-RateLimit-Reset", new Date(state.resetAt).toISOString());

    if (state.count > maxRequests) {
      res.setHeader("Retry-After", String(retryAfterSeconds));
      logger.warn("http_rate_limit_exceeded", {
        ip: key,
        method: req.method,
        path,
        limit: maxRequests,
        windowMs,
        retryAfterSeconds,
      });
      res.status(429).json(
        errorResponse("Too many requests. Please retry later.", 429, {
          retryAfterSeconds,
        })
      );
      return;
    }

    next();
  };
};

export const httpRateLimitMiddleware = buildHttpRateLimitMiddleware();
