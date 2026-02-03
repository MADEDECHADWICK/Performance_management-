import { Router } from "express";
import prisma from "../prisma";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { createAudit } from "../utils/audit";
import { OkrApprovalStatus, OkrStatus } from "@prisma/client";

const router = Router();

// GET /okrs?ownerProfileId=1&departmentId=2&cycleId=3&status=active&approvalStatus=pending
router.get("/", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const ownerProfileId = req.query.ownerProfileId
      ? Number(req.query.ownerProfileId)
      : undefined;
    const departmentId = req.query.departmentId
      ? Number(req.query.departmentId)
      : undefined;
    const cycleId = req.query.cycleId ? Number(req.query.cycleId) : undefined;
    const status = typeof req.query.status === "string" && req.query.status in OkrStatus
      ? (req.query.status as OkrStatus)
      : undefined;
    const approvalStatus =
      typeof req.query.approvalStatus === "string" && req.query.approvalStatus in OkrApprovalStatus
        ? (req.query.approvalStatus as OkrApprovalStatus)
        : undefined;

    const objectives = await prisma.okrObjective.findMany({
      where: {
        ...(ownerProfileId ? { ownerProfileId } : {}),
        ...(departmentId ? { departmentId } : {}),
        ...(cycleId ? { cycleId } : {}),
        ...(status ? { status } : {}),
        ...(approvalStatus ? { approvalStatus } : {}),
      },
      include: { keyResults: true },
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
      departmentId,
      cycleId,
      startDate,
      endDate,
      status,
      approvalStatus,
      keyResults,
    } = req.body;

    if (!title || !ownerProfileId) {
      return res.status(400).json({ error: "title and ownerProfileId required" });
    }

    const objective = await prisma.okrObjective.create({
      data: {
        title,
        description,
        ownerProfileId: Number(ownerProfileId),
        departmentId: departmentId ? Number(departmentId) : undefined,
        cycleId: cycleId ? Number(cycleId) : undefined,
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
      include: { keyResults: true },
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
      departmentId,
      cycleId,
      startDate,
      endDate,
      status,
      approvalStatus,
    } = req.body;

    const existing = await prisma.okrObjective.findUnique({
      where: { id: Number(id) },
    });

    const objective = await prisma.okrObjective.update({
      where: { id: Number(id) },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(departmentId !== undefined && { departmentId: Number(departmentId) }),
        ...(cycleId !== undefined && { cycleId: Number(cycleId) }),
        ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
        ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
        ...(status !== undefined && { status: status as OkrStatus }),
        ...(approvalStatus !== undefined && { approvalStatus: approvalStatus as OkrApprovalStatus }),
      },
      include: { keyResults: true },
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
    const existing = await prisma.okrObjective.findUnique({
      where: { id: Number(id) },
    });
    const objective = await prisma.okrObjective.update({
      where: { id: Number(id) },
      data: {
        approvalStatus: OkrApprovalStatus.pending,
        submittedAt: new Date(),
      },
      include: { keyResults: true },
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
router.post("/:id/approve", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { approvalNotes } = req.body || {};
    const approverProfileId = await getApproverProfileId(req);
    const existing = await prisma.okrObjective.findUnique({
      where: { id: Number(id) },
    });

    const objective = await prisma.okrObjective.update({
      where: { id: Number(id) },
      data: {
        approvalStatus: OkrApprovalStatus.approved,
        approvedAt: new Date(),
        approvedByProfileId: approverProfileId ?? undefined,
        approvalNotes: approvalNotes ?? undefined,
      },
      include: { keyResults: true },
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
router.post("/:id/reject", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { approvalNotes } = req.body || {};
    const approverProfileId = await getApproverProfileId(req);
    const existing = await prisma.okrObjective.findUnique({
      where: { id: Number(id) },
    });

    const objective = await prisma.okrObjective.update({
      where: { id: Number(id) },
      data: {
        approvalStatus: OkrApprovalStatus.rejected,
        approvedAt: new Date(),
        approvedByProfileId: approverProfileId ?? undefined,
        approvalNotes: approvalNotes ?? undefined,
      },
      include: { keyResults: true },
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
router.delete("/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    await prisma.okrObjective.delete({ where: { id: Number(id) } });

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
    const { title, unit, targetValue, currentValue, weight, status } = req.body;

    if (!title || targetValue === undefined) {
      return res.status(400).json({ error: "title and targetValue required" });
    }

    const keyResult = await prisma.okrKeyResult.create({
      data: {
        objectiveId: Number(id),
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

    const history = await prisma.okrProgressHistory.findMany({
      where: { objectiveId: Number(id) },
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
router.get("/history/all", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const ownerProfileId = req.query.ownerProfileId
      ? Number(req.query.ownerProfileId)
      : undefined;

    const history = await prisma.okrProgressHistory.findMany({
      where: ownerProfileId
        ? { objective: { ownerProfileId } }
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
    await prisma.okrKeyResult.delete({ where: { id: Number(krId) } });
    return res.json({ ok: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
