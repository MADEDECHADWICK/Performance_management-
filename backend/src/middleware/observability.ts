import type { NextFunction, Request, Response } from "express";
import { ObservabilityService } from "../services/observability.service";

export const requestMetricsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const startedAt = Date.now();

  res.on("finish", () => {
    ObservabilityService.recordRequest({
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
    });
  });

  next();
};
