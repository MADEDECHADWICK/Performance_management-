import { Router } from "express";
import prisma from "../prisma";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { requireModuleAccess } from "../middleware/requireModuleAccess";
import { createAudit } from "../utils/audit";
import { OkrApprovalStatus, OkrStatus } from "@prisma/client";

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

const canAccessOwner = async (req: AuthRequest, ownerProfileId: number) => {
  if (isPrivileged(req)) return true;

  const requesterId = resolveRequesterProfileId(req);
  if (!requesterId) return false;
  if (requesterId === ownerProfileId) return true;

  if (isManagerRole(req)) {
    const owner = await prisma.profile.findUnique({
      where: { id: ownerProfileId },
      select: { managerId: true },
    });
    return owner?.managerId === requesterId;
  }

  return false;
};

const canManageObjective = async (
  req: AuthRequest,
  objectiveId: number
): Promise<{ allowed: boolean; objective?: { id: number; ownerProfileId: number } }> => {
  const objective = await prisma.okrObjective.findUnique({
    where: { id: objectiveId },
    select: { id: true, ownerProfileId: true },
  });
  if (!objective) return { allowed: false };
  const allowed = await canAccessOwner(req, objective.ownerProfileId);
  return { allowed, objective };
};

// GET /okrs?ownerProfileId=1&departmentId=2&cycleId=3&status=active&approvalStatus=pending
router.get("/", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const ownerProfileId = parseOptionalInt(req.query.ownerProfileId);
    const kpiId = parseOptionalInt(req.query.kpiId);
    const departmentId = parseOptionalInt(req.query.departmentId);
    const cycleId = parseOptionalInt(req.query.cycleId);
    const status = typeof req.query.status === "string" && req.query.status in OkrStatus
      ? (req.query.status as OkrStatus)
      : undefined;
    const approvalStatus =
      typeof req.query.approvalStatus === "string" && req.query.approvalStatus in OkrApprovalStatus
        ? (req.query.approvalStatus as OkrApprovalStatus)
        : undefined;
    const requesterId = resolveRequesterProfileId(req);
    if (!requesterId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    let ownerFilter: number[] | undefined;
    if (ownerProfileId) {
      if (!(await canAccessOwner(req, ownerProfileId))) {
        return res.status(403).json({ error: "Access denied" });
      }
      ownerFilter = [ownerProfileId];
    } else if (!isPrivileged(req)) {
      if (isManagerRole(req)) {
        const directReports = await prisma.profile.findMany({
          where: { managerId: requesterId },
          select: { id: true },
        });
        ownerFilter = Array.from(
          new Set([requesterId, ...directReports.map((profile) => profile.id)])
        );
      } else {
        ownerFilter = [requesterId];
      }
    }

    const objectives = await prisma.okrObjective.findMany({
      where: {
        ...(ownerFilter ? { ownerProfileId: { in: ownerFilter } } : {}),
        ...(kpiId ? { kpiId } : {}),
        ...(departmentId ? { departmentId } : {}),
        ...(cycleId ? { cycleId } : {}),
        ...(status ? { status } : {}),
        ...(approvalStatus ? { approvalStatus } : {}),
      },
      include: {
        keyResults: true,
        kpi: {
          select: {
            id: true,
            name: true,
            category: true,
            measurementUnit: true,
            targetValue: true,
            targetFrequency: true,
            isActive: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json(objectives || []);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

const getApproverProfileId = async (req: AuthRequest) => {
  const userId = req.user?.userId;
  if (!userId) return null;
  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: { id: true },
  });
  return profile?.id ?? null;
};

const logOkrHistory = async (params: {
  objectiveId: number;
  keyResultId?: number | null;
  changeType: "progress_update" | "status_update" | "approval_update";
  field: string;
  previousValue?: string | null;
  newValue?: string | null;
  note?: string | null;
  changedByProfileId?: number | null;
}) => {
  await prisma.okrProgressHistory.create({
    data: {
      objectiveId: params.objectiveId,
      keyResultId: params.keyResultId ?? undefined,
      changeType: params.changeType,
      field: params.field,
      previousValue: params.previousValue ?? undefined,
      newValue: params.newValue ?? undefined,
      note: params.note ?? undefined,
      changedByProfileId: params.changedByProfileId ?? undefined,
    },
  });
};

// POST /okrs
router.post("/", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const {
      title,
      description,
      ownerProfileId,
      kpiId,
      departmentId,
      cycleId,
      startDate,
      endDate,
      status,
      approvalStatus,
      keyResults,
    } = req.body;

    const requesterId = resolveRequesterProfileId(req);
    if (!requesterId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!title) {
      return res.status(400).json({ error: "title required" });
    }

    const resolvedOwnerProfileId =
      parseOptionalInt(ownerProfileId) ?? requesterId;
    if (!resolvedOwnerProfileId) {
      return res.status(400).json({ error: "ownerProfileId required" });
    }

    if (resolvedOwnerProfileId !== requesterId && !isPrivileged(req)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const owner = await prisma.profile.findUnique({
      where: { id: resolvedOwnerProfileId },
      select: { id: true, departmentId: true },
    });
    if (!owner) {
      return res.status(404).json({ error: "Owner profile not found" });
    }

    const resolvedKpiId = parseOptionalInt(kpiId);
    if (resolvedKpiId) {
      const kpi = await prisma.kpi.findUnique({
        where: { id: resolvedKpiId },
        select: { id: true, isActive: true },
      });
      if (!kpi) {
        return res.status(404).json({ error: "KPI not found" });
      }
      if (!kpi.isActive) {
        return res.status(400).json({ error: "Cannot link archived KPI" });
      }
    }

    const objective = await prisma.okrObjective.create({
      data: {
        title,
        description,
        ownerProfileId: resolvedOwnerProfileId,
        kpiId: resolvedKpiId,
        departmentId: parseOptionalInt(departmentId) ?? owner.departmentId ?? undefined,
        cycleId: parseOptionalInt(cycleId),
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        status: (status as OkrStatus) || OkrStatus.active,
        approvalStatus: (approvalStatus as OkrApprovalStatus) || OkrApprovalStatus.pending,
        submittedAt: new Date(),
        keyResults: keyResults?.length
          ? {
              create: keyResults.map((kr: any) => ({
                title: kr.title,
                unit: kr.unit,
                targetValue: kr.targetValue,
                currentValue: kr.currentValue ?? 0,
                weight: kr.weight ?? undefined,
                status: (kr.status as OkrStatus) || OkrStatus.active,
              })),
            }
          : undefined,
      },
      include: {
        keyResults: true,
        kpi: {
          select: {
            id: true,
            name: true,
            category: true,
            measurementUnit: true,
            targetValue: true,
            targetFrequency: true,
          },
        },
      },
    });

    const performedBy = req.user?.userId;
    await createAudit({
      action: "okr:create",
      entity_type: "okr_objective",
      user_id: performedBy,
      ip_address: req.ip,
    });

    return res.status(201).json(objective);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// PATCH /okrs/:id
router.patch("/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      kpiId,
      departmentId,
      cycleId,
      startDate,
      endDate,
      status,
      approvalStatus,
    } = req.body;
    const objectiveId = Number(id);

    const access = await canManageObjective(req, objectiveId);
    if (!access.objective) {
      return res.status(404).json({ error: "OKR objective not found" });
    }
    if (!access.allowed) {
      return res.status(403).json({ error: "Access denied" });
    }

    const existing = await prisma.okrObjective.findUnique({
      where: { id: objectiveId },
    });
    const resolvedKpiId = parseOptionalInt(kpiId);
    if (resolvedKpiId) {
      const kpi = await prisma.kpi.findUnique({
        where: { id: resolvedKpiId },
        select: { id: true, isActive: true },
      });
      if (!kpi) {
        return res.status(404).json({ error: "KPI not found" });
      }
      if (!kpi.isActive) {
        return res.status(400).json({ error: "Cannot link archived KPI" });
      }
    }
    const shouldClearKpiLink =
      kpiId !== undefined && !resolvedKpiId;

    const objective = await prisma.okrObjective.update({
      where: { id: objectiveId },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(departmentId !== undefined && { departmentId: parseOptionalInt(departmentId) ?? null }),
        ...(cycleId !== undefined && { cycleId: parseOptionalInt(cycleId) ?? null }),
        ...(resolvedKpiId ? { kpiId: resolvedKpiId } : {}),
        ...(shouldClearKpiLink ? { kpiId: null } : {}),
        ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
        ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
        ...(status !== undefined && { status: status as OkrStatus }),
        ...(approvalStatus !== undefined && { approvalStatus: approvalStatus as OkrApprovalStatus }),
      },
      include: {
        keyResults: true,
        kpi: {
          select: {
            id: true,
            name: true,
            category: true,
            measurementUnit: true,
            targetValue: true,
            targetFrequency: true,
          },
        },
      },
    });

    const changedByProfileId = await getApproverProfileId(req);
    if (existing && status !== undefined && existing.status !== status) {
      await logOkrHistory({
        objectiveId: Number(id),
        changeType: "status_update",
        field: "status",
        previousValue: existing.status,
        newValue: status,
        changedByProfileId,
      });
    }

    const performedBy = req.user?.userId;
    await createAudit({
      action: "okr:update",
      entity_type: "okr_objective",
      user_id: performedBy,
      ip_address: req.ip,
    });

    return res.json(objective);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// POST /okrs/:id/submit
router.post("/:id/submit", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const objectiveId = Number(id);
    const access = await canManageObjective(req, objectiveId);
    if (!access.objective) {
      return res.status(404).json({ error: "OKR objective not found" });
    }
    if (!access.allowed) {
      return res.status(403).json({ error: "Access denied" });
    }

    const existing = await prisma.okrObjective.findUnique({
      where: { id: objectiveId },
    });
    const objective = await prisma.okrObjective.update({
      where: { id: objectiveId },
      data: {
        approvalStatus: OkrApprovalStatus.pending,
        submittedAt: new Date(),
      },
      include: {
        keyResults: true,
        kpi: {
          select: {
            id: true,
            name: true,
            category: true,
            measurementUnit: true,
            targetValue: true,
            targetFrequency: true,
          },
        },
      },
    });

    const changedByProfileId = await getApproverProfileId(req);
    if (existing && existing.approvalStatus !== OkrApprovalStatus.pending) {
      await logOkrHistory({
        objectiveId: Number(id),
        changeType: "approval_update",
        field: "approvalStatus",
        previousValue: existing.approvalStatus,
        newValue: OkrApprovalStatus.pending,
        changedByProfileId,
      });
    }

    const performedBy = req.user?.userId;
    await createAudit({
      action: "okr:submit",
      entity_type: "okr_objective",
      user_id: performedBy,
      ip_address: req.ip,
    });

    return res.json(objective);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// POST /okrs/:id/approve
router.post(
  "/:id/approve",
  authMiddleware,
  requireModuleAccess("kpis", "approve"),
  async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const objectiveId = Number(id);
    const { approvalNotes } = req.body || {};
    const approverProfileId = await getApproverProfileId(req);
    const existing = await prisma.okrObjective.findUnique({
      where: { id: objectiveId },
    });
    if (!existing) {
      return res.status(404).json({ error: "OKR objective not found" });
    }
    if (!(await canAccessOwner(req, existing.ownerProfileId))) {
      return res.status(403).json({ error: "Access denied" });
    }

    const objective = await prisma.okrObjective.update({
      where: { id: objectiveId },
      data: {
        approvalStatus: OkrApprovalStatus.approved,
        approvedAt: new Date(),
        approvedByProfileId: approverProfileId ?? undefined,
        approvalNotes: approvalNotes ?? undefined,
      },
      include: {
        keyResults: true,
        kpi: {
          select: {
            id: true,
            name: true,
            category: true,
            measurementUnit: true,
            targetValue: true,
            targetFrequency: true,
          },
        },
      },
    });

    await logOkrHistory({
      objectiveId: Number(id),
      changeType: "approval_update",
      field: "approvalStatus",
      previousValue: existing?.approvalStatus ?? null,
      newValue: OkrApprovalStatus.approved,
      note: approvalNotes ?? undefined,
      changedByProfileId: approverProfileId ?? undefined,
    });

    const performedBy = req.user?.userId;
    await createAudit({
      action: "okr:approve",
      entity_type: "okr_objective",
      user_id: performedBy,
      ip_address: req.ip,
    });

    return res.json(objective);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// POST /okrs/:id/reject
router.post(
  "/:id/reject",
  authMiddleware,
  requireModuleAccess("kpis", "approve"),
  async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const objectiveId = Number(id);
    const { approvalNotes } = req.body || {};
    const approverProfileId = await getApproverProfileId(req);
    const existing = await prisma.okrObjective.findUnique({
      where: { id: objectiveId },
    });
    if (!existing) {
      return res.status(404).json({ error: "OKR objective not found" });
    }
    if (!(await canAccessOwner(req, existing.ownerProfileId))) {
      return res.status(403).json({ error: "Access denied" });
    }

    const objective = await prisma.okrObjective.update({
      where: { id: objectiveId },
      data: {
        approvalStatus: OkrApprovalStatus.rejected,
        approvedAt: new Date(),
        approvedByProfileId: approverProfileId ?? undefined,
        approvalNotes: approvalNotes ?? undefined,
      },
      include: {
        keyResults: true,
        kpi: {
          select: {
            id: true,
            name: true,
            category: true,
            measurementUnit: true,
            targetValue: true,
            targetFrequency: true,
          },
        },
      },
    });

    await logOkrHistory({
      objectiveId: Number(id),
      changeType: "approval_update",
      field: "approvalStatus",
      previousValue: existing?.approvalStatus ?? null,
      newValue: OkrApprovalStatus.rejected,
      note: approvalNotes ?? undefined,
      changedByProfileId: approverProfileId ?? undefined,
    });

    const performedBy = req.user?.userId;
    await createAudit({
      action: "okr:reject",
      entity_type: "okr_objective",
      user_id: performedBy,
      ip_address: req.ip,
    });

    return res.json(objective);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// DELETE /okrs/:id
router.delete(
  "/:id",
  authMiddleware,
  async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const objectiveId = Number(id);
    const access = await canManageObjective(req, objectiveId);
    if (!access.objective) {
      return res.status(404).json({ error: "OKR objective not found" });
    }
    if (!access.allowed) {
      return res.status(403).json({ error: "Access denied" });
    }

    await prisma.okrObjective.delete({ where: { id: objectiveId } });

    const performedBy = req.user?.userId;
    await createAudit({
      action: "okr:delete",
      entity_type: "okr_objective",
      user_id: performedBy,
      ip_address: req.ip,
    });

    return res.json({ ok: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// POST /okrs/:id/key-results
router.post("/:id/key-results", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const objectiveId = Number(id);
    const access = await canManageObjective(req, objectiveId);
    if (!access.objective) {
      return res.status(404).json({ error: "OKR objective not found" });
    }
    if (!access.allowed) {
      return res.status(403).json({ error: "Access denied" });
    }

    const { title, unit, targetValue, currentValue, weight, status } = req.body;

    if (!title || targetValue === undefined) {
      return res.status(400).json({ error: "title and targetValue required" });
    }

    const keyResult = await prisma.okrKeyResult.create({
      data: {
        objectiveId,
        title,
        unit,
        targetValue,
        currentValue: currentValue ?? 0,
        weight: weight ?? undefined,
        status: (status as OkrStatus) || OkrStatus.active,
      },
    });

    return res.status(201).json(keyResult);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// PATCH /okrs/key-results/:krId
router.patch("/key-results/:krId", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { krId } = req.params;
    const { title, unit, targetValue, currentValue, weight, status } = req.body;

    const existing = await prisma.okrKeyResult.findUnique({
      where: { id: Number(krId) },
      include: { objective: true },
    });
    if (!existing) {
      return res.status(404).json({ error: "OKR key result not found" });
    }
    if (!(await canAccessOwner(req, existing.objective.ownerProfileId))) {
      return res.status(403).json({ error: "Access denied" });
    }

    const keyResult = await prisma.okrKeyResult.update({
      where: { id: Number(krId) },
      data: {
        ...(title !== undefined && { title }),
        ...(unit !== undefined && { unit }),
        ...(targetValue !== undefined && { targetValue }),
        ...(currentValue !== undefined && { currentValue }),
        ...(weight !== undefined && { weight }),
        ...(status !== undefined && { status: status as OkrStatus }),
      },
    });

    const changedByProfileId = await getApproverProfileId(req);
    if (existing && currentValue !== undefined && Number(existing.currentValue) !== Number(currentValue)) {
      await logOkrHistory({
        objectiveId: existing.objectiveId,
        keyResultId: Number(krId),
        changeType: "progress_update",
        field: "currentValue",
        previousValue: String(existing.currentValue ?? ""),
        newValue: String(currentValue ?? ""),
        changedByProfileId,
      });
    }
    if (existing && status !== undefined && existing.status !== status) {
      await logOkrHistory({
        objectiveId: existing.objectiveId,
        keyResultId: Number(krId),
        changeType: "status_update",
        field: "status",
        previousValue: existing.status,
        newValue: status,
        changedByProfileId,
      });
    }

    return res.json(keyResult);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// GET /okrs/:id/history?limit=10
router.get("/:id/history", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const limit = req.query.limit ? Number(req.query.limit) : 10;
    const objectiveId = Number(id);
    const objective = await prisma.okrObjective.findUnique({
      where: { id: objectiveId },
      select: { ownerProfileId: true },
    });
    if (!objective) {
      return res.status(404).json({ error: "OKR objective not found" });
    }
    if (!(await canAccessOwner(req, objective.ownerProfileId))) {
      return res.status(403).json({ error: "Access denied" });
    }

    const history = await prisma.okrProgressHistory.findMany({
      where: { objectiveId },
      orderBy: { changedAt: "desc" },
      take: limit,
      include: {
        changedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        keyResult: {
          select: { id: true, title: true },
        },
      },
    });

    return res.json(history || []);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// GET /okrs/history?limit=20&ownerProfileId=1
router.get(
  "/history/all",
  authMiddleware,
  requireModuleAccess("kpis", "approve"),
  async (req: AuthRequest, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const ownerProfileId = parseOptionalInt(req.query.ownerProfileId);
    const requesterId = resolveRequesterProfileId(req);
    if (!requesterId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    let ownerFilter: number[] | undefined;
    if (ownerProfileId) {
      if (!(await canAccessOwner(req, ownerProfileId))) {
        return res.status(403).json({ error: "Access denied" });
      }
      ownerFilter = [ownerProfileId];
    } else if (!isPrivileged(req)) {
      if (isManagerRole(req)) {
        const directReports = await prisma.profile.findMany({
          where: { managerId: requesterId },
          select: { id: true },
        });
        ownerFilter = Array.from(
          new Set([requesterId, ...directReports.map((profile) => profile.id)])
        );
      } else {
        ownerFilter = [requesterId];
      }
    }

    const history = await prisma.okrProgressHistory.findMany({
      where: ownerFilter
        ? { objective: { ownerProfileId: { in: ownerFilter } } }
        : undefined,
      orderBy: { changedAt: "desc" },
      take: limit,
      include: {
        objective: { select: { id: true, title: true, ownerProfileId: true } },
        keyResult: { select: { id: true, title: true } },
        changedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return res.json(history || []);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// DELETE /okrs/key-results/:krId
router.delete("/key-results/:krId", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { krId } = req.params;
    const existing = await prisma.okrKeyResult.findUnique({
      where: { id: Number(krId) },
      include: { objective: { select: { ownerProfileId: true } } },
    });
    if (!existing) {
      return res.status(404).json({ error: "OKR key result not found" });
    }
    if (!(await canAccessOwner(req, existing.objective.ownerProfileId))) {
      return res.status(403).json({ error: "Access denied" });
    }

    await prisma.okrKeyResult.delete({ where: { id: Number(krId) } });
    return res.json({ ok: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
