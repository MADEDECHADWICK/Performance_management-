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

const getAllowedOrigins = () => {
  const configuredOrigins = parseOriginList(process.env.CORS_ORIGIN);
  if (configuredOrigins.length > 0) {
    return Array.from(new Set(configuredOrigins));
  }

  if (isProduction()) {
    return [];
  }

  return DEFAULT_DEV_ALLOWED_ORIGINS;
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
  origin: corsOriginDelegate,
  credentials: true,
  optionsSuccessStatus: 204,
});

export const securityHeadersMiddleware = (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

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
