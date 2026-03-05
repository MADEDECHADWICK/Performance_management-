import { Router } from "express";
import { JobStatus } from "@prisma/client";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import prisma from "../prisma";

const router = Router();

const ACTIVE_PROJECT_STATUSES: JobStatus[] = ["planned", "in_progress", "on_hold"];
const VALID_JOB_STATUSES = new Set<JobStatus>([
  "planned",
  "in_progress",
  "on_hold",
  "completed",
  "cancelled",
]);

const parsePositiveInt = (value: unknown): number | null => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const normalizeRoles = (req: AuthRequest): Set<string> => {
  const roles = [...(req.userRoles || [])].map((role) =>
    String(role).toLowerCase().trim()
  );
  return new Set(roles);
};

const hasBroadJobAccess = (roles: Set<string>) => {
  return (
    roles.has("super_admin") ||
    roles.has("hr") ||
    roles.has("human_resources") ||
    roles.has("gmp")
  );
};

const buildScopedAccessWhere = (profileId: number, roles: Set<string>) => {
  if (hasBroadJobAccess(roles)) {
    return {};
  }

  if (roles.has("manager") || roles.has("partner")) {
    return {
      OR: [
        { managerProfileId: profileId },
        { partnerProfileId: profileId },
        {
          staffing: {
            some: {
              employeeProfileId: profileId,
            },
          },
        },
      ],
    };
  }

  return {
    staffing: {
      some: {
        employeeProfileId: profileId,
      },
    },
  };
};

const resolveStatusFilter = (rawStatus: unknown): JobStatus[] | undefined => {
  const normalized = String(rawStatus || "").toLowerCase().trim();
  if (!normalized) return undefined;

  if (normalized === "active") {
    return ACTIVE_PROJECT_STATUSES;
  }

  const parsed = normalized
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is JobStatus => VALID_JOB_STATUSES.has(value as JobStatus));

  if (parsed.length === 0) return undefined;
  return parsed;
};

const mapJobToLegacyProject = (job: any) => ({
  id: Number(job.id),
  project_name: job.jobName,
  project_code: job.jobCode || `JOB-${job.id}`,
  client_id: job.clientId ?? null,
  start_date: job.startDate ?? null,
  end_date: job.dueDate ?? job.completionDate ?? null,
  manager_profile_id: job.managerProfileId ?? null,
  partner_profile_id: job.partnerProfileId ?? null,
  budget_hours: Number(job.budgetHours || 0),
  projectName: job.jobName,
  projectCode: job.jobCode || `JOB-${job.id}`,
  clientId: job.clientId ?? null,
  description: job.description ?? null,
  startDate: job.startDate ?? null,
  endDate: job.dueDate ?? job.completionDate ?? null,
  budget: Number(job.budgetHours || 0),
  status: job.status,
  managerProfileId: job.managerProfileId ?? null,
  partnerProfileId: job.partnerProfileId ?? null,
  client: job.client
    ? {
        id: Number(job.client.id),
        clientName: job.client.clientName,
      }
    : null,
});

const unsupportedWriteMessage =
  "Legacy /projects write operations are not supported. Use /jobs workflow endpoints.";

// GET /projects?status=active
router.get("/", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const profileId = Number(req.user?.profileId || 0);
    if (!profileId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const roles = normalizeRoles(req);
    const baseWhere = buildScopedAccessWhere(profileId, roles);
    const statusFilter = resolveStatusFilter(req.query.status);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));

    const where: any = {
      ...baseWhere,
    };

    if (statusFilter && statusFilter.length > 0) {
      where.status = { in: statusFilter };
    }

    const jobs = await prisma.job.findMany({
      where,
      include: {
        client: {
          select: {
            id: true,
            clientName: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
    });

    return res.json(jobs.map(mapJobToLegacyProject));
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to fetch projects" });
  }
});

// GET /projects/:id
router.get("/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const profileId = Number(req.user?.profileId || 0);
    if (!profileId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const projectId = parsePositiveInt(req.params.id);
    if (!projectId) {
      return res.status(400).json({ error: "Valid project id is required" });
    }

    const roles = normalizeRoles(req);
    const baseWhere = buildScopedAccessWhere(profileId, roles);

    const job = await prisma.job.findFirst({
      where: {
        id: projectId,
        ...baseWhere,
      },
      include: {
        client: {
          select: {
            id: true,
            clientName: true,
          },
        },
      },
    });

    if (!job) {
      return res.status(404).json({ error: "Project not found" });
    }

    return res.json(mapJobToLegacyProject(job));
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to fetch project" });
  }
});

// POST /projects
router.post("/", authMiddleware, async (_req: AuthRequest, res) => {
  return res.status(501).json({ error: unsupportedWriteMessage });
});

// PATCH /projects/:id
router.patch("/:id", authMiddleware, async (_req: AuthRequest, res) => {
  return res.status(501).json({ error: unsupportedWriteMessage });
});

// DELETE /projects/:id
router.delete("/:id", authMiddleware, async (_req: AuthRequest, res) => {
  return res.status(501).json({ error: unsupportedWriteMessage });
});

export default router;
