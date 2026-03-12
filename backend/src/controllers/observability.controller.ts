import type { Response } from "express";
import type { AuthRequest } from "../middleware/auth";
import { errorResponse, successResponse } from "../utils/response";
import { ObservabilityService } from "../services/observability.service";

const hasOpsAccess = (roles: string[] = []) => {
  const normalized = new Set(
    roles.map((role) =>
      String(role || "")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_")
    )
  );
  return normalized.has("super_admin") || normalized.has("hr");
};

const ensureAccess = (req: AuthRequest, res: Response) => {
  if (hasOpsAccess(req.userRoles || [])) {
    return true;
  }

  res.status(403).json(
    errorResponse("Only HR or super admins can access operational telemetry", 403)
  );
  return false;
};

const getLimit = (value: unknown, fallback = 50) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(250, Math.trunc(parsed));
};

export const getObservabilityOverview = async (req: AuthRequest, res: Response) => {
  try {
    if (!ensureAccess(req, res)) return;
    const overview = await ObservabilityService.getOverview();
    res.json(successResponse(overview, "Operational overview retrieved"));
  } catch (error: any) {
    res
      .status(500)
      .json(errorResponse(error?.message || "Failed to load operational overview", 500));
  }
};

export const getObservabilityMetrics = async (req: AuthRequest, res: Response) => {
  try {
    if (!ensureAccess(req, res)) return;
    const http = ObservabilityService.getHttpMetrics();
    res.json(
      successResponse(
        {
          http,
          workers: ObservabilityService.getWorkers(),
          alerts: ObservabilityService.getAlerts(),
        },
        "Operational metrics retrieved"
      )
    );
  } catch (error: any) {
    res
      .status(500)
      .json(errorResponse(error?.message || "Failed to load operational metrics", 500));
  }
};

export const getObservabilityPrometheusMetrics = async (req: AuthRequest, res: Response) => {
  try {
    if (!ensureAccess(req, res)) return;
    const payload = await ObservabilityService.getPrometheusMetrics();
    res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    res.status(200).send(payload);
  } catch (error: any) {
    res
      .status(500)
      .json(errorResponse(error?.message || "Failed to load Prometheus metrics", 500));
  }
};

export const getObservabilityWorkers = (req: AuthRequest, res: Response) => {
  if (!ensureAccess(req, res)) return;
  res.json(successResponse(ObservabilityService.getWorkers(), "Worker health retrieved"));
};

export const getObservabilityErrors = (req: AuthRequest, res: Response) => {
  if (!ensureAccess(req, res)) return;
  const limit = getLimit(req.query.limit, 50);
  res.json(
    successResponse(
      ObservabilityService.getRecentErrors(limit),
      "Recent operational errors retrieved"
    )
  );
};

export const getObservabilityAlerts = (req: AuthRequest, res: Response) => {
  if (!ensureAccess(req, res)) return;
  const includeResolved = String(req.query.includeResolved || "").toLowerCase() === "true";
  res.json(
    successResponse(
      ObservabilityService.getAlerts({ includeResolved }),
      "Operational alerts retrieved"
    )
  );
};
