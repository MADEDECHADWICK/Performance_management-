// This middleware is responsible for recording observability metrics for incoming HTTP requests. It captures details such as the HTTP method, request path, response status code, and the duration of the request. The metrics are recorded using the ObservabilityService, which can be configured to send this data to a monitoring system or log it for analysis. By using this middleware, we can gain insights into the performance and usage patterns of our application, identify potential bottlenecks, and monitor the health of our endpoints over time.

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
