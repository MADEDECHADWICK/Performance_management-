import { Router } from "express";
import {
  getObservabilityAlerts,
  getObservabilityErrors,
  getObservabilityMetrics,
  getObservabilityOverview,
  getObservabilityPrometheusMetrics,
  getObservabilityWorkers,
} from "../controllers/observability.controller";

const router = Router();

router.get("/overview", getObservabilityOverview);
router.get("/metrics", getObservabilityMetrics);
router.get("/metrics/prometheus", getObservabilityPrometheusMetrics);
router.get("/workers", getObservabilityWorkers);
router.get("/errors", getObservabilityErrors);
router.get("/alerts", getObservabilityAlerts);

export default router;
