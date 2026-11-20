import { Router } from "express";
import { AuthRequest } from "../middleware/auth";
import {
  PerformanceReportService,
  type PerformancePeriod,
  type PerformanceTrendGranularity,
} from "../services/performanceReport.service";
import { errorResponse, successResponse } from "../utils/response";

const router = Router();

const resolvePeriod = (value: unknown): PerformancePeriod => {
  const normalized = String(value || "").toLowerCase();
  if (["weekly", "monthly", "quarterly", "yearly"].includes(normalized)) {
    return normalized as PerformancePeriod;
  }
  return "monthly";
};

const parseDate = (value: unknown): Date | undefined => {
  if (!value) return undefined;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const resolveGranularity = (value: unknown): PerformanceTrendGranularity => {
  const normalized = String(value || "").toLowerCase();
  if (["weekly", "monthly", "yearly"].includes(normalized)) {
    return normalized as PerformanceTrendGranularity;
  }
  return "monthly";
};

router.get("/department-trends", async (req: AuthRequest, res) => {
  try {
    const granularity = resolveGranularity(req.query.granularity);
    const anchorDate = parseDate(req.query.date) || new Date();

    const report = await PerformanceReportService.getDepartmentTrends(
      {
        userId: req.user!.userId,
        profileId: req.user!.profileId!,
        roles: req.userRoles ?? [],
        roleName: req.userRoles?.[0] ?? null,
      },
      { granularity, anchorDate }
    );

    res.json(successResponse(report, "Department performance trends retrieved"));
  } catch (error: any) {
    res.status(error.statusCode || 500).json(
      errorResponse(error.message, error.statusCode || 500, error.details)
    );
  }
});

router.get("/", async (req: AuthRequest, res) => {
  try {
    const period = resolvePeriod(req.query.period);
    const rawDate = req.query.date ? new Date(String(req.query.date)) : new Date();
    const anchorDate = Number.isNaN(rawDate.getTime()) ? new Date() : rawDate;
    const dateFrom = parseDate(req.query.dateFrom);
    const dateTo = parseDate(req.query.dateTo);

    const report = await PerformanceReportService.getReport(
      {
        userId: req.user!.userId,
        profileId: req.user!.profileId!,
        roles: req.userRoles ?? [],
        roleName: req.userRoles?.[0] ?? null,
      },
      { period, anchorDate, dateFrom, dateTo }
    );

    res.json(successResponse(report, "Performance report retrieved"));
  } catch (error: any) {
    res.status(error.statusCode || 500).json(
      errorResponse(error.message, error.statusCode || 500, error.details)
    );
  }
});

export default router;
