// This module defines the HTTP security configuration for the application, including CORS(Cross Origin Resourse Shairing) settings, security headers, and request body limits. It provides functions to build CORS options based on environment variables and to set appropriate security headers on responses. The configuration is designed to be flexible, allowing for different settings in development and production environments while maintaining a secure default configuration. It also includes utility functions for determining whether to trust proxy headers, which is important for applications running behind a reverse proxy or load balancer. By centralizing this configuration, we can ensure that all parts of the application adhere to consistent security practices and can easily adjust settings as needed for different deployment scenarios.

import type { NextFunction, Request, Response } from "express";
import type { CorsOptions } from "cors";

const DEFAULT_DEV_ALLOWED_ORIGINS = [
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

const normalizeOrigin = (origin: string) => origin.trim().replace(/\/+$/, "");

const isProduction = () => String(process.env.NODE_ENV || "").toLowerCase() === "production";

const parseBoolean = (value: string | undefined) => {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
};

const parseOriginList = (value: string | undefined) =>
  String(value || "")
    .split(",")
    .map((origin) => normalizeOrigin(origin))
    .filter(Boolean);

export const getAllowedOrigins = () => {
  const configuredOrigins = parseOriginList(process.env.CORS_ORIGIN);
  if (configuredOrigins.length > 0) {
    return Array.from(new Set(configuredOrigins));
  }

  if (isProduction()) {
    return [];
  }

  return DEFAULT_DEV_ALLOWED_ORIGINS;
};

export const buildFrameAncestorsDirective = (origins?: string[]) => {
  const allowedOrigins = Array.from(new Set((origins || getAllowedOrigins()).filter(Boolean)));
  if (allowedOrigins.length === 0) {
    return "frame-ancestors 'self'";
  }
  return `frame-ancestors 'self' ${allowedOrigins.join(" ")}`;
};

const isAllowedOrigin = (origin: string | undefined, allowedOrigins: Set<string>) => {
  if (!origin) return true;
  return allowedOrigins.has(normalizeOrigin(origin));
};

const corsOriginDelegate: CorsOptions["origin"] = (origin, callback) => {
  const allowedOrigins = new Set(getAllowedOrigins());
  if (isAllowedOrigin(origin, allowedOrigins)) {
    callback(null, true);
    return;
  }

  callback(new Error("CORS origin not allowed"));
};

export const buildCorsOptions = (): CorsOptions => ({
  // In development, reflect any origin (credentials still work because we echo the header, not "*")
  // In production, enforce the strict allowlist
  origin: isProduction() ? corsOriginDelegate : true,
  credentials: true,
  optionsSuccessStatus: 204,
});

// The securityHeadersMiddleware function sets various HTTP headers to enhance the security of the application. It includes headers to prevent MIME type sniffing, clickjacking, and to control referrer information. In production environments, it also sets the Strict-Transport-Security header to enforce secure connections. By applying this middleware to all responses, we can help protect the application from common web vulnerabilities and ensure that security best practices are followed consistently across all endpoints.
export const securityHeadersMiddleware = (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'"
  );

  if (isProduction()) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  next();
};

export const getJsonBodyLimit = () => String(process.env.REQUEST_BODY_LIMIT || "1mb").trim() || "1mb";

export const getUrlEncodedParameterLimit = () => {
  const parsed = Number(process.env.REQUEST_PARAMETER_LIMIT || 1000);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1000;
  return Math.trunc(parsed);
};

export const shouldTrustProxy = () => parseBoolean(process.env.TRUST_PROXY);
