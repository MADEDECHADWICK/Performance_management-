import { Router } from "express";
import { AuthRequest } from "../middleware/auth";
import {
  TimesheetReportService,
  type TimesheetReportGroup,
  type TimesheetReportPeriod,
  type TimesheetReportScope,
} from "../services/timesheetReport.service";
import { errorResponse, successResponse } from "../utils/response";

const router = Router();

const buildAuth = (req: AuthRequest) => ({
  userId: req.user!.userId,
  profileId: req.user!.profileId!,
  roles: req.userRoles ?? [],
  roleName: req.userRoles?.[0] ?? null,
});

const parseNumber = (value: unknown) => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseDate = (value: unknown) => {
  if (!value) return undefined;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const buildFilters = (req: AuthRequest) => ({
  period: (String(req.query.period || "monthly").toLowerCase() as TimesheetReportPeriod),
  anchorDate: parseDate(req.query.date),
  dateFrom: parseDate(req.query.dateFrom),
  dateTo: parseDate(req.query.dateTo),
  scope: req.query.scope
    ? (String(req.query.scope).toLowerCase() as TimesheetReportScope)
    : undefined,
  status: req.query.status ? String(req.query.status) : undefined,
  employeeProfileId: parseNumber(req.query.employeeProfileId),
  departmentId: parseNumber(req.query.departmentId),
  partnerProfileId: parseNumber(req.query.partnerProfileId),
  jobId: parseNumber(req.query.jobId),
  jobKey: req.query.jobKey ? String(req.query.jobKey) : undefined,
  clientId: parseNumber(req.query.clientId),
  clientKey: req.query.clientKey ? String(req.query.clientKey) : undefined,
  taskId: parseNumber(req.query.taskId),
});

const sendReport = async (
  req: AuthRequest,
  res: any,
  group: TimesheetReportGroup,
  mode: "summary" | "detailed"
) => {
  try {
    const filters = buildFilters(req);
    const result =
      mode === "summary"
        ? await TimesheetReportService.getSummary(group, buildAuth(req), filters)
        : await TimesheetReportService.getDetailed(group, buildAuth(req), filters);
    res.json(successResponse(result, "Timesheet report retrieved"));
  } catch (error: any) {
    res.status(error.statusCode || 500).json(
      errorResponse(error.message, error.statusCode || 500, error.details)
    );
  }
};

/**
 * GET /timesheet-reports/options
 */
router.get("/options", async (req: AuthRequest, res) => {
  try {
    const options = await TimesheetReportService.getOptions(buildAuth(req));
    res.json(successResponse(options, "Timesheet report options retrieved"));
  } catch (error: any) {
    res.status(error.statusCode || 500).json(
      errorResponse(error.message, error.statusCode || 500, error.details)
    );
  }
});

router.get("/staff/summary", (req, res) => sendReport(req, res, "staff", "summary"));
router.get("/staff/detailed", (req, res) => sendReport(req, res, "staff", "detailed"));
router.get("/jobs/summary", (req, res) => sendReport(req, res, "job", "summary"));
router.get("/jobs/detailed", (req, res) => sendReport(req, res, "job", "detailed"));
router.get("/clients/summary", (req, res) => sendReport(req, res, "client", "summary"));
router.get("/clients/detailed", (req, res) => sendReport(req, res, "client", "detailed"));

router.get("/jobs/overview", async (req: AuthRequest, res) => {
  try {
    const result = await TimesheetReportService.getJobOverview(
      buildAuth(req),
      buildFilters(req)
    );
    res.json(successResponse(result, "Job overview retrieved"));
  } catch (error: any) {
    res.status(error.statusCode || 500).json(
      errorResponse(error.message, error.statusCode || 500, error.details)
    );
  }
});

router.get("/clients/overview", async (req: AuthRequest, res) => {
  try {
    const result = await TimesheetReportService.getClientOverview(
      buildAuth(req),
      buildFilters(req)
    );
    res.json(successResponse(result, "Client overview retrieved"));
  } catch (error: any) {
    res.status(error.statusCode || 500).json(
      errorResponse(error.message, error.statusCode || 500, error.details)
    );
  }
});

router.get("/jobs/:jobKey", async (req: AuthRequest, res) => {
  try {
    const result = await TimesheetReportService.getJobDrilldown(
      String(req.params.jobKey || ""),
      buildAuth(req),
      buildFilters(req)
    );
    res.json(successResponse(result, "Job timesheet report retrieved"));
  } catch (error: any) {
    res.status(error.statusCode || 500).json(
      errorResponse(error.message, error.statusCode || 500, error.details)
    );
  }
});

router.get("/clients/:clientKey", async (req: AuthRequest, res) => {
  try {
    const result = await TimesheetReportService.getClientDrilldown(
      String(req.params.clientKey || ""),
      buildAuth(req),
      buildFilters(req)
    );
    res.json(successResponse(result, "Client timesheet report retrieved"));
  } catch (error: any) {
    res.status(error.statusCode || 500).json(
      errorResponse(error.message, error.statusCode || 500, error.details)
    );
  }
});

export default router;
