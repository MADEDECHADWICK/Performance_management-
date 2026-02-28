import { Router } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import prisma from "../prisma";
import { TimeEntryService } from "../services/time-entry.service";
import { createAudit } from "../utils/audit";

const router = Router();

const LEGACY_ACTIVITY_TYPES = new Set([
  "job",
  "training",
  "holiday",
  "sick_leave",
  "other",
]);
const NON_BILLABLE_ACTIVITY_TYPES = new Set(["training", "holiday", "sick_leave"]);
const ACTIVITY_PREFIX = /^\[activity:([a-z_]+)\]\s*/i;

const parsePositiveInt = (value: unknown): number | null => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const parseOptionalBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return undefined;
};

const normalizeActivityType = (value: unknown): string => {
  const normalized = String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_");
  if (LEGACY_ACTIVITY_TYPES.has(normalized)) {
    return normalized;
  }
  return "job";
};

const withActivityPrefix = (description: unknown, activityType: string): string | undefined => {
  const text = String(description || "").trim();
  if (activityType === "job") {
    return text || undefined;
  }
  return `[activity:${activityType}] ${text}`.trim();
};

const extractLegacyDescription = (value: unknown) => {
  const text = String(value || "").trim();
  if (!text) {
    return { activityType: "job", taskDescription: null as string | null };
  }

  const match = text.match(ACTIVITY_PREFIX);
  if (!match) {
    return {
      activityType: "job",
      taskDescription: text || null,
    };
  }

  const activityType = normalizeActivityType(match[1]);
  const taskDescription = text.replace(ACTIVITY_PREFIX, "").trim() || null;

  return {
    activityType,
    taskDescription,
  };
};

const combineDateAndTime = (dateValue: unknown, timeValue: unknown): Date | null => {
  if (!dateValue || !timeValue) return null;

  const dateText = String(dateValue).trim();
  const timeTextRaw = String(timeValue).trim();
  if (!dateText || !timeTextRaw) return null;

  const normalizedTime =
    /^\d{2}:\d{2}$/.test(timeTextRaw) || /^\d{2}:\d{2}:\d{2}$/.test(timeTextRaw)
      ? timeTextRaw
      : timeTextRaw.slice(0, 8);

  const withSeconds = /^\d{2}:\d{2}$/.test(normalizedTime)
    ? `${normalizedTime}:00`
    : normalizedTime;

  const parsed = new Date(`${dateText}T${withSeconds}`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
};

const resolvePrimaryRole = (req: AuthRequest): string | undefined => {
  const roles = [...(req.userRoles || []), ...(req.user?.authRoles || [])].map((role) =>
    String(role).toLowerCase().trim()
  );

  if (roles.includes("super_admin")) return "super_admin";
  if (roles.includes("admin")) return "admin";
  if (roles.includes("hr_manager")) return "hr_manager";
  if (roles.includes("hr")) return "hr";
  if (roles.includes("partner")) return "partner";
  if (roles.includes("manager")) return "manager";
  return roles[0];
};

const buildAuthContext = (req: AuthRequest) => {
  const userId = Number(req.user?.userId || 0);
  const profileId = Number(req.user?.profileId || req.profile?.id || 0);

  if (!userId || !profileId) {
    throw { statusCode: 401, message: "Unauthorized" };
  }

  return {
    userId,
    profileId,
    roleName: resolvePrimaryRole(req),
  };
};

const mapTimeEntryToLegacyWorkLog = (entry: any) => {
  const extracted = extractLegacyDescription(entry?.description);

  return {
    id: Number(entry?.id || 0),
    employeeId: Number(entry?.employeeProfileId || 0),
    jobId: Number(entry?.jobId || 0),
    projectId: Number(entry?.jobId || 0),
    dateWorked: entry?.dateWorked || null,
    startTime: entry?.startedAt || null,
    endTime: entry?.endedAt || null,
    hoursWorked: Number(entry?.hours || 0),
    taskDescription: extracted.taskDescription,
    billable: Boolean(entry?.billable),
    status: String(entry?.status || "pending"),
    activityType: extracted.activityType,
    jobs: entry?.job
      ? {
          id: Number(entry.job.id),
          title: entry.job.jobName,
          jobNumber: entry.job.jobCode || null,
        }
      : undefined,
    projects: entry?.job
      ? {
          id: Number(entry.job.id),
          projectName: entry.job.jobName,
          projectCode: entry.job.jobCode || null,
        }
      : undefined,
  };
};

const handleRouteError = (res: any, err: any) => {
  const statusCode =
    Number(err?.statusCode || err?.status || 0) > 0
      ? Number(err.statusCode || err.status)
      : 500;
  const message = err?.message || "Internal server error";
  return res.status(statusCode).json({ error: message });
};

const ensureEmployeeScope = (req: AuthRequest, auth: { userId: number; profileId: number }) => {
  const requestedEmployeeId = parsePositiveInt(req.query.employeeId ?? req.body?.employeeId);

  if (!requestedEmployeeId) return null;

  if (requestedEmployeeId === auth.userId || requestedEmployeeId === auth.profileId) {
    return null;
  }

  return "You can only access your own work logs";
};

// GET /work_logs?employeeId=&limit=
router.get("/", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const auth = buildAuthContext(req);
    const scopeError = ensureEmployeeScope(req, auth);
    if (scopeError) {
      return res.status(403).json({ error: scopeError });
    }

    const limit = Math.min(
      200,
      Math.max(1, Number(req.query.limit ?? req.query.pageSize) || 50)
    );
    const status = String(req.query.status || "").trim();
    const billableOnly = parseOptionalBoolean(req.query.billableOnly);
    const jobId = parsePositiveInt(req.query.jobId ?? req.query.projectId);
    const dateFromRaw = req.query.dateFrom;
    const dateToRaw = req.query.dateTo;
    const dateFrom =
      dateFromRaw && !Number.isNaN(new Date(String(dateFromRaw)).getTime())
        ? new Date(String(dateFromRaw))
        : undefined;
    const dateTo =
      dateToRaw && !Number.isNaN(new Date(String(dateToRaw)).getTime())
        ? new Date(String(dateToRaw))
        : undefined;

    const where: any = {
      employeeProfileId: auth.profileId,
    };

    if (status) where.status = status;
    if (jobId) where.jobId = jobId;
    if (billableOnly !== undefined) where.billable = billableOnly;
    if (dateFrom) where.dateWorked = { ...(where.dateWorked || {}), gte: dateFrom };
    if (dateTo) where.dateWorked = { ...(where.dateWorked || {}), lte: dateTo };

    const logs = await prisma.timeEntry.findMany({
      where,
      include: {
        job: {
          select: {
            id: true,
            jobName: true,
            jobCode: true,
          },
        },
      },
      orderBy: { dateWorked: "desc" },
      take: limit,
    });

    return res.json(logs.map(mapTimeEntryToLegacyWorkLog));
  } catch (err: any) {
    return handleRouteError(res, err);
  }
});

// GET /work_logs/:id
router.get("/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const auth = buildAuthContext(req);
    const timeEntryId = parsePositiveInt(req.params.id);
    if (!timeEntryId) {
      return res.status(400).json({ error: "Valid work log id is required" });
    }

    const timeEntry = await TimeEntryService.getTimeEntry(timeEntryId, auth);
    const scopeError = ensureEmployeeScope(req, auth);
    if (scopeError && Number(timeEntry.employeeProfileId) !== auth.profileId) {
      return res.status(403).json({ error: scopeError });
    }

    return res.json(mapTimeEntryToLegacyWorkLog(timeEntry));
  } catch (err: any) {
    return handleRouteError(res, err);
  }
});

// POST /work_logs
router.post("/", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const auth = buildAuthContext(req);
    const scopeError = ensureEmployeeScope(req, auth);
    if (scopeError) {
      return res.status(403).json({ error: scopeError });
    }

    const activityType = normalizeActivityType(req.body?.activityType ?? req.body?.taskType);
    const jobId = parsePositiveInt(req.body?.jobId ?? req.body?.projectId);
    const dateWorked = req.body?.dateWorked ?? req.body?.workDate;
    const descriptionSource = req.body?.taskDescription ?? req.body?.description;

    if (!jobId) {
      return res.status(400).json({
        error:
          "jobId is required. This system enforces assignment-scoped time tracking against jobs.",
      });
    }
    if (!dateWorked) {
      return res.status(400).json({ error: "dateWorked is required" });
    }

    const startedAt = combineDateAndTime(
      dateWorked,
      req.body?.startTime ?? req.body?.startedAt
    );
    let endedAt = combineDateAndTime(
      dateWorked,
      req.body?.endTime ?? req.body?.endedAt
    );
    if (startedAt && endedAt && endedAt <= startedAt) {
      endedAt = new Date(endedAt.getTime() + 24 * 60 * 60 * 1000);
    }

    const explicitHours = req.body?.hoursWorked ?? req.body?.hours;
    const parsedHours =
      explicitHours === undefined || explicitHours === null || explicitHours === ""
        ? undefined
        : Number(explicitHours);
    if (
      parsedHours !== undefined &&
      (!Number.isFinite(parsedHours) || parsedHours <= 0)
    ) {
      return res.status(400).json({ error: "hoursWorked must be a positive number" });
    }

    const requestedBillable =
      parseOptionalBoolean(req.body?.billable) ??
      parseOptionalBoolean(req.body?.isBillable) ??
      true;
    const resolvedBillable = NON_BILLABLE_ACTIVITY_TYPES.has(activityType)
      ? false
      : Boolean(requestedBillable);

    const created = await TimeEntryService.createTimeEntry(
      {
        jobId,
        dateWorked,
        hours: parsedHours,
        startedAt: startedAt || undefined,
        endedAt: endedAt || undefined,
        billable: resolvedBillable,
        description: withActivityPrefix(descriptionSource, activityType),
      },
      auth
    );

    await createAudit({
      action: "work_log:create",
      entity_type: "work_log",
      entity_id: Number(created?.id || 0) || undefined,
      user_id: auth.userId,
      ip_address: req.ip,
      metadata: {
        jobId,
        employeeProfileId: auth.profileId,
        activityType,
        billable: resolvedBillable,
      },
    });

    const createdAny = created as any;
    const responsePayload: any = mapTimeEntryToLegacyWorkLog(createdAny);
    if (Array.isArray(createdAny?.splitEntries) && createdAny.splitEntries.length > 0) {
      responsePayload.splitEntries = createdAny.splitEntries.map(mapTimeEntryToLegacyWorkLog);
    }

    return res.status(201).json(responsePayload);
  } catch (err: any) {
    return handleRouteError(res, err);
  }
});

// PATCH /work_logs/:id
router.patch("/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const auth = buildAuthContext(req);
    const scopeError = ensureEmployeeScope(req, auth);
    if (scopeError) {
      return res.status(403).json({ error: scopeError });
    }

    const timeEntryId = parsePositiveInt(req.params.id);
    if (!timeEntryId) {
      return res.status(400).json({ error: "Valid work log id is required" });
    }

    const updateInput: Record<string, unknown> = {};

    const explicitHours = req.body?.hoursWorked ?? req.body?.hours;
    if (explicitHours !== undefined && explicitHours !== null && explicitHours !== "") {
      const parsedHours = Number(explicitHours);
      if (!Number.isFinite(parsedHours) || parsedHours <= 0) {
        return res.status(400).json({ error: "hoursWorked must be a positive number" });
      }
      updateInput.hours = parsedHours;
    }

    const parsedBillable = parseOptionalBoolean(req.body?.billable);
    if (parsedBillable !== undefined) {
      updateInput.billable = parsedBillable;
    }

    const activityType = normalizeActivityType(req.body?.activityType ?? req.body?.taskType);
    const descriptionSource = req.body?.taskDescription ?? req.body?.description;
    if (descriptionSource !== undefined) {
      updateInput.description = withActivityPrefix(descriptionSource, activityType);
    }

    const dateWorked = req.body?.dateWorked ?? req.body?.workDate;
    const startedAt = combineDateAndTime(
      dateWorked,
      req.body?.startTime ?? req.body?.startedAt
    );
    let endedAt = combineDateAndTime(
      dateWorked,
      req.body?.endTime ?? req.body?.endedAt
    );
    if (startedAt && endedAt && endedAt <= startedAt) {
      endedAt = new Date(endedAt.getTime() + 24 * 60 * 60 * 1000);
    }
    if (startedAt || endedAt) {
      if (!startedAt || !endedAt) {
        return res.status(400).json({
          error: "dateWorked, startTime, and endTime are required together when editing time range",
        });
      }
      updateInput.startedAt = startedAt;
      updateInput.endedAt = endedAt;
    }

    if (Object.keys(updateInput).length === 0) {
      return res.status(400).json({
        error: "No update fields provided. Use hoursWorked, billable, taskDescription, or time range.",
      });
    }

    const updated = await TimeEntryService.updateTimeEntry(timeEntryId, updateInput, auth);

    await createAudit({
      action: "work_log:update",
      entity_type: "work_log",
      entity_id: Number(updated?.id || 0) || undefined,
      user_id: auth.userId,
      ip_address: req.ip,
      metadata: {
        employeeProfileId: auth.profileId,
        updatedFields: Object.keys(updateInput),
      },
    });

    const updatedAny = updated as any;
    const responsePayload: any = mapTimeEntryToLegacyWorkLog(updatedAny);
    if (Array.isArray(updatedAny?.splitEntries) && updatedAny.splitEntries.length > 0) {
      responsePayload.splitEntries = updatedAny.splitEntries.map(mapTimeEntryToLegacyWorkLog);
    }

    return res.json(responsePayload);
  } catch (err: any) {
    return handleRouteError(res, err);
  }
});

// DELETE /work_logs/:id
router.delete("/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const auth = buildAuthContext(req);
    const scopeError = ensureEmployeeScope(req, auth);
    if (scopeError) {
      return res.status(403).json({ error: scopeError });
    }

    const timeEntryId = parsePositiveInt(req.params.id);
    if (!timeEntryId) {
      return res.status(400).json({ error: "Valid work log id is required" });
    }

    await TimeEntryService.deleteTimeEntry(timeEntryId, auth);

    await createAudit({
      action: "work_log:delete",
      entity_type: "work_log",
      entity_id: timeEntryId,
      user_id: auth.userId,
      ip_address: req.ip,
      metadata: {
        employeeProfileId: auth.profileId,
      },
    });

    return res.json({ ok: true, id: timeEntryId });
  } catch (err: any) {
    return handleRouteError(res, err);
  }
});

export default router;
