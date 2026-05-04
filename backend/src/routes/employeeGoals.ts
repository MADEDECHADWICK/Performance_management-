import { Router } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { loadProfile } from "../middleware/loadProfile";
import { requireModuleAccess } from "../middleware/requireModuleAccess";
import { resolveRequestAccessRoles } from "../auth/accessRoles";
import { EmployeeGoalStatus } from "@prisma/client";
import prisma from "../prisma";

const router = Router();

const isPrivileged = (roles: string[]) =>
  roles.some((r) => ["super_admin", "hr", "manager"].includes(r));

const parseStatus = (value: unknown): EmployeeGoalStatus | null => {
  const v = String(value || "").trim().toLowerCase();
  if (v === "draft") return EmployeeGoalStatus.draft;
  if (v === "active") return EmployeeGoalStatus.active;
  if (v === "achieved") return EmployeeGoalStatus.achieved;
  if (v === "missed") return EmployeeGoalStatus.missed;
  return null;
};

// GET /employee_goals?profileId=&cycleId=&status=
router.get("/", authMiddleware, loadProfile, async (req: AuthRequest, res) => {
  try {
    const roles = resolveRequestAccessRoles(req).map((r) => r.toLowerCase());
    const myProfileId = req.profile?.id;

    const requestedProfileId = req.query.profileId ? parseInt(String(req.query.profileId)) : undefined;
    const cycleId = req.query.cycleId ? parseInt(String(req.query.cycleId)) : undefined;
    const status = parseStatus(req.query.status) ?? undefined;

    const resolvedProfileId =
      isPrivileged(roles) && requestedProfileId ? requestedProfileId : myProfileId;

    if (!resolvedProfileId) return res.status(400).json({ error: "Profile not resolved" });

    const goals = await prisma.employeeGoal.findMany({
      where: {
        profileId: resolvedProfileId,
        ...(cycleId ? { evaluationCycleId: cycleId } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
    });

    return res.json(goals);
  } catch (err: any) {
    console.error("Error fetching employee goals:", err);
    return res.status(500).json({ error: "Failed to fetch employee goals" });
  }
});

// GET /employee_goals/:id
router.get("/:id", authMiddleware, loadProfile, async (req: AuthRequest, res) => {
  try {
    const roles = resolveRequestAccessRoles(req).map((r) => r.toLowerCase());
    const myProfileId = req.profile?.id;
    const goal = await prisma.employeeGoal.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!goal) return res.status(404).json({ error: "Goal not found" });
    if (!isPrivileged(roles) && goal.profileId !== myProfileId) {
      return res.status(403).json({ error: "Access denied" });
    }
    return res.json(goal);
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to fetch goal" });
  }
});

// POST /employee_goals
router.post(
  "/",
  authMiddleware,
  loadProfile,
  requireModuleAccess("evaluations", "write"),
  async (req: AuthRequest, res) => {
    try {
      const roles = resolveRequestAccessRoles(req).map((r) => r.toLowerCase());
      const myProfileId = req.profile?.id;
      const {
        profileId,
        evaluationCycleId,
        bscKpiKey,
        title,
        description,
        targetValue,
        weight,
        status,
        dueDate,
      } = req.body;

      if (!title) return res.status(400).json({ error: "title is required" });

      const resolvedProfileId = isPrivileged(roles) && profileId ? Number(profileId) : myProfileId;
      if (!resolvedProfileId) return res.status(400).json({ error: "Profile not resolved" });

      const goal = await prisma.employeeGoal.create({
        data: {
          profileId: resolvedProfileId,
          evaluationCycleId: evaluationCycleId ? Number(evaluationCycleId) : undefined,
          bscKpiKey: bscKpiKey || undefined,
          title,
          description: description || undefined,
          targetValue: targetValue != null ? targetValue : undefined,
          weight: weight != null ? weight : 1,
          status: parseStatus(status) ?? EmployeeGoalStatus.draft,
          dueDate: dueDate ? new Date(dueDate) : undefined,
        },
      });

      return res.status(201).json(goal);
    } catch (err: any) {
      console.error("Error creating employee goal:", err);
      return res.status(500).json({ error: err?.message || "Failed to create goal" });
    }
  }
);

// PATCH /employee_goals/:id
router.patch(
  "/:id",
  authMiddleware,
  loadProfile,
  requireModuleAccess("evaluations", "write"),
  async (req: AuthRequest, res) => {
    try {
      const roles = resolveRequestAccessRoles(req).map((r) => r.toLowerCase());
      const myProfileId = req.profile?.id;
      const id = parseInt(req.params.id);

      const existing = await prisma.employeeGoal.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: "Goal not found" });
      if (!isPrivileged(roles) && existing.profileId !== myProfileId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const {
        title,
        description,
        targetValue,
        actualValue,
        weight,
        status,
        dueDate,
        managerComment,
        bscKpiKey,
        evaluationCycleId,
      } = req.body;

      const parsedStatus = parseStatus(status);

      const goal = await prisma.employeeGoal.update({
        where: { id },
        data: {
          ...(title ? { title } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(targetValue !== undefined ? { targetValue } : {}),
          ...(actualValue !== undefined ? { actualValue } : {}),
          ...(weight !== undefined ? { weight } : {}),
          ...(parsedStatus ? { status: parsedStatus } : {}),
          ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
          ...(managerComment !== undefined && isPrivileged(roles) ? { managerComment } : {}),
          ...(bscKpiKey !== undefined ? { bscKpiKey } : {}),
          ...(evaluationCycleId !== undefined
            ? { evaluationCycleId: evaluationCycleId ? Number(evaluationCycleId) : null }
            : {}),
        },
      });

      return res.json(goal);
    } catch (err: any) {
      console.error("Error updating employee goal:", err);
      return res.status(500).json({ error: err?.message || "Failed to update goal" });
    }
  }
);

// DELETE /employee_goals/:id
router.delete(
  "/:id",
  authMiddleware,
  loadProfile,
  requireModuleAccess("evaluations", "write"),
  async (req: AuthRequest, res) => {
    try {
      const roles = resolveRequestAccessRoles(req).map((r) => r.toLowerCase());
      const myProfileId = req.profile?.id;
      const id = parseInt(req.params.id);

      const existing = await prisma.employeeGoal.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: "Goal not found" });
      if (!isPrivileged(roles) && existing.profileId !== myProfileId) {
        return res.status(403).json({ error: "Access denied" });
      }

      await prisma.employeeGoal.delete({ where: { id } });
      return res.status(204).send();
    } catch (err: any) {
      console.error("Error deleting employee goal:", err);
      return res.status(500).json({ error: "Failed to delete goal" });
    }
  }
);

export default router;
