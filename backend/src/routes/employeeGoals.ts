import { OkrApprovalStatus, OkrStatus } from "@prisma/client";
import { Router } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { loadProfile } from "../middleware/loadProfile";
import prisma from "../prisma";
import { createAudit } from "../utils/audit";

const router = Router();
const privilegedRoles = new Set([
  "admin",
  "super_admin",
  "hr",
  "hr_manager",
  "gmp",
  "group_managing_partner",
  "partner",
]);

const getRoleNames = (req: AuthRequest) => {
  const roles = [
    ...(req.userRoles || []),
    ...(req.user?.authRoles || []),
    req.profile?.role?.name,
  ]
    .filter(Boolean)
    .map((role) => String(role).toLowerCase());
  return Array.from(new Set(roles));
};

const isPrivileged = (req: AuthRequest) =>
  getRoleNames(req).some((role) => privilegedRoles.has(role));

const isManagerRole = (req: AuthRequest) =>
  getRoleNames(req).some((role) => role.includes("manager") || role.includes("team lead"));

const resolveRequesterProfileId = (req: AuthRequest) =>
  req.profile?.id ?? (req.user?.profileId ? Number(req.user.profileId) : undefined);

const parseOptionalInt = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
};

const parseOptionalNumber = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const resolveProfileIdFromEmployeeId = async (employeeId: unknown) => {
  const parsedId = parseOptionalInt(employeeId);
  if (!parsedId) return undefined;

  const byProfileId = await prisma.profile.findUnique({
    where: { id: parsedId },
    select: { id: true },
  });
  if (byProfileId) return byProfileId.id;

  const byUserId = await prisma.profile.findUnique({
    where: { userId: parsedId },
    select: { id: true },
  });
  return byUserId?.id;
};

const canAccessEmployee = async (req: AuthRequest, employeeProfileId: number) => {
  if (isPrivileged(req)) return true;

  const requesterId = resolveRequesterProfileId(req);
  if (!requesterId) return false;
  if (requesterId === employeeProfileId) return true;

  if (isManagerRole(req)) {
    const employee = await prisma.profile.findUnique({
      where: { id: employeeProfileId },
      select: { managerId: true },
    });
    return employee?.managerId === requesterId;
  }

  return false;
};

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeStatusForObjective = (status?: string): OkrStatus | undefined => {
  const normalized = String(status || "").toLowerCase().trim();
  if (!normalized) return undefined;
  if (["completed", "done"].includes(normalized)) return OkrStatus.completed;
  if (["archived", "inactive", "cancelled", "canceled"].includes(normalized)) return OkrStatus.archived;
  if (["draft"].includes(normalized)) return OkrStatus.draft;
  if (["active", "in_progress", "in progress", "approved", "pending"].includes(normalized)) {
    return OkrStatus.active;
  }
  return undefined;
};

const normalizeStatusForApproval = (status?: string): OkrApprovalStatus | undefined => {
  const normalized = String(status || "").toLowerCase().trim();
  if (!normalized) return undefined;
  if (normalized === "approved") return OkrApprovalStatus.approved;
  if (normalized === "rejected") return OkrApprovalStatus.rejected;
  if (normalized === "pending") return OkrApprovalStatus.pending;
  if (normalized === "draft") return OkrApprovalStatus.draft;
  return undefined;
};

const mapObjectiveStatusToLegacy = (objective: any) => {
  if (objective?.approvalStatus === OkrApprovalStatus.rejected) return "rejected";
  if (objective?.status === OkrStatus.completed) return "completed";
  if (objective?.approvalStatus === OkrApprovalStatus.approved) return "approved";
  if (
    objective?.approvalStatus === OkrApprovalStatus.pending ||
    objective?.approvalStatus === OkrApprovalStatus.draft
  ) {
    return "pending";
  }
  if (objective?.status === OkrStatus.archived) return "archived";
  return "in_progress";
};

const summarizeProgress = (keyResults: any[] = []) => {
  if (!Array.isArray(keyResults) || keyResults.length === 0) {
    return {
      targetValue: null as number | null,
      achievedValue: null as number | null,
      progressPercent: 0,
    };
  }

  const totals = keyResults.reduce(
    (acc, kr) => {
      acc.target += toNumber(kr?.targetValue);
      acc.current += toNumber(kr?.currentValue);
      return acc;
    },
    { target: 0, current: 0 }
  );

  const progressPercent =
    totals.target > 0 ? Math.max(0, Math.min(100, (totals.current / totals.target) * 100)) : 0;

  return {
    targetValue: Number(totals.target.toFixed(2)),
    achievedValue: Number(totals.current.toFixed(2)),
    progressPercent: Number(progressPercent.toFixed(2)),
  };
};

const toLegacyGoal = (objective: any) => {
  const progress = summarizeProgress(objective?.keyResults || []);
  return {
    id: objective.id,
    employeeId: objective.ownerProfileId,
    ownerProfileId: objective.ownerProfileId,
    cycleId: objective.cycleId ?? null,
    kpiId: objective.kpiId ?? null,
    goalTitle: objective.title,
    goalDescription: objective.description ?? null,
    status: mapObjectiveStatusToLegacy(objective),
    approvalStatus: objective.approvalStatus,
    progressPercentage: progress.progressPercent,
    targetValue: progress.targetValue,
    achievedValue: progress.achievedValue,
    cycle: objective.cycle
      ? {
          id: objective.cycle.id,
          name: objective.cycle.name,
        }
      : null,
    kpi: objective.kpi
      ? {
          id: objective.kpi.id,
          name: objective.kpi.name,
          category: objective.kpi.category,
        }
      : null,
    keyResultsCount: Array.isArray(objective.keyResults) ? objective.keyResults.length : 0,
    createdAt: objective.createdAt,
    updatedAt: objective.updatedAt,
    source: "okr_objective",
  };
};

const objectiveInclude = {
  keyResults: true,
  cycle: {
    select: {
      id: true,
      name: true,
    },
  },
  kpi: {
    select: {
      id: true,
      name: true,
      category: true,
    },
  },
};

// GET /employee-goals?employeeId=...
router.get("/", authMiddleware, loadProfile, async (req: AuthRequest, res) => {
  try {
    const employeeId = req.query.employeeId as string | undefined;
    if (!employeeId) {
      return res.status(400).json({ error: "employeeId query parameter required" });
    }

    const employeeProfileId = await resolveProfileIdFromEmployeeId(employeeId);
    if (!employeeProfileId) {
      return res.status(404).json({ error: "Employee profile not found" });
    }
    if (!(await canAccessEmployee(req, employeeProfileId))) {
      return res.status(403).json({ error: "Access denied" });
    }

    const objectives = await prisma.okrObjective.findMany({
      where: { ownerProfileId: employeeProfileId },
      include: objectiveInclude,
      orderBy: { createdAt: "desc" },
    });

    return res.json((objectives || []).map(toLegacyGoal));
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// GET /employee-goals/:id
router.get("/:id", authMiddleware, loadProfile, async (req: AuthRequest, res) => {
  try {
    const goalId = Number(req.params.id);
    if (!Number.isInteger(goalId)) {
      return res.status(400).json({ error: "Invalid goal id" });
    }

    const objective = await prisma.okrObjective.findUnique({
      where: { id: goalId },
      include: objectiveInclude,
    });
    if (!objective) {
      return res.status(404).json({ error: "Goal not found" });
    }
    if (!(await canAccessEmployee(req, objective.ownerProfileId))) {
      return res.status(403).json({ error: "Access denied" });
    }

    return res.json(toLegacyGoal(objective));
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// POST /employee-goals
router.post("/", authMiddleware, loadProfile, async (req: AuthRequest, res) => {
  try {
    const { employeeId, cycleId, kpiId, goalTitle, goalDescription, targetValue } = req.body;

    if (!employeeId || !goalTitle) {
      return res.status(400).json({ error: "employeeId and goalTitle required" });
    }

    const ownerProfileId = await resolveProfileIdFromEmployeeId(employeeId);
    if (!ownerProfileId) {
      return res.status(404).json({ error: "Employee profile not found" });
    }
    if (!(await canAccessEmployee(req, ownerProfileId))) {
      return res.status(403).json({ error: "Access denied" });
    }

    const resolvedTargetValue = parseOptionalNumber(targetValue);
    const created = await prisma.okrObjective.create({
      data: {
        ownerProfileId,
        cycleId: parseOptionalInt(cycleId),
        kpiId: parseOptionalInt(kpiId),
        title: String(goalTitle).trim(),
        description: goalDescription ? String(goalDescription) : undefined,
        status: OkrStatus.active,
        approvalStatus: OkrApprovalStatus.pending,
        submittedAt: new Date(),
        ...(resolvedTargetValue !== undefined
          ? {
              keyResults: {
                create: [
                  {
                    title: "Goal progress",
                    targetValue: resolvedTargetValue,
                    currentValue: 0,
                    status: OkrStatus.active,
                  },
                ],
              },
            }
          : {}),
      },
      include: objectiveInclude,
    });

    const performedBy = req.user?.userId ? Number(req.user.userId) : undefined;
    await createAudit({
      action: "employee_goal:create",
      entity_type: "employee_goal",
      user_id: performedBy,
      entity_id: created.id,
      ip_address: req.ip,
    });

    return res.status(201).json(toLegacyGoal(created));
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// PATCH /employee-goals/:id
router.patch("/:id", authMiddleware, loadProfile, async (req: AuthRequest, res) => {
  try {
    const goalId = Number(req.params.id);
    if (!Number.isInteger(goalId)) {
      return res.status(400).json({ error: "Invalid goal id" });
    }

    const { status, progressPercentage, description } = req.body || {};
    const existing = await prisma.okrObjective.findUnique({
      where: { id: goalId },
      include: { keyResults: true },
    });
    if (!existing) {
      return res.status(404).json({ error: "Goal not found" });
    }
    if (!(await canAccessEmployee(req, existing.ownerProfileId))) {
      return res.status(403).json({ error: "Access denied" });
    }

    const objectiveStatus = normalizeStatusForObjective(status);
    const approvalStatus = normalizeStatusForApproval(status);
    const parsedProgressPercentage = parseOptionalNumber(progressPercentage);
    const clampedProgress =
      parsedProgressPercentage === undefined
        ? undefined
        : Math.max(0, Math.min(100, parsedProgressPercentage));

    const updated = await prisma.$transaction(async (tx) => {
      await tx.okrObjective.update({
        where: { id: goalId },
        data: {
          ...(description !== undefined && { description: String(description) }),
          ...(objectiveStatus !== undefined && { status: objectiveStatus }),
          ...(approvalStatus !== undefined && { approvalStatus }),
          ...(approvalStatus === OkrApprovalStatus.approved ||
          approvalStatus === OkrApprovalStatus.rejected
            ? { approvedAt: new Date() }
            : {}),
        },
      });

      if (clampedProgress !== undefined) {
        const keyResults = await tx.okrKeyResult.findMany({
          where: { objectiveId: goalId },
        });

        if (keyResults.length > 0) {
          await Promise.all(
            keyResults.map((keyResult) =>
              tx.okrKeyResult.update({
                where: { id: keyResult.id },
                data: {
                  currentValue: Number((toNumber(keyResult.targetValue) * clampedProgress) / 100),
                },
              })
            )
          );
        } else {
          await tx.okrKeyResult.create({
            data: {
              objectiveId: goalId,
              title: "Goal progress",
              targetValue: 100,
              currentValue: clampedProgress,
              status: OkrStatus.active,
            },
          });
        }
      }

      return tx.okrObjective.findUnique({
        where: { id: goalId },
        include: objectiveInclude,
      });
    });

    if (!updated) {
      return res.status(404).json({ error: "Goal not found" });
    }

    const performedBy = req.user?.userId ? Number(req.user.userId) : undefined;
    await createAudit({
      action: "employee_goal:update",
      entity_type: "employee_goal",
      user_id: performedBy,
      entity_id: goalId,
      ip_address: req.ip,
    });

    return res.json(toLegacyGoal(updated));
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// DELETE /employee-goals/:id
router.delete("/:id", authMiddleware, loadProfile, async (req: AuthRequest, res) => {
  try {
    const goalId = Number(req.params.id);
    if (!Number.isInteger(goalId)) {
      return res.status(400).json({ error: "Invalid goal id" });
    }

    const existing = await prisma.okrObjective.findUnique({
      where: { id: goalId },
      select: { id: true, ownerProfileId: true },
    });
    if (!existing) {
      return res.status(404).json({ error: "Goal not found" });
    }
    if (!(await canAccessEmployee(req, existing.ownerProfileId))) {
      return res.status(403).json({ error: "Access denied" });
    }

    await prisma.okrObjective.delete({ where: { id: goalId } });

    const performedBy = req.user?.userId ? Number(req.user.userId) : undefined;
    await createAudit({
      action: "employee_goal:delete",
      entity_type: "employee_goal",
      user_id: performedBy,
      entity_id: goalId,
      ip_address: req.ip,
    });

    return res.json({ ok: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
