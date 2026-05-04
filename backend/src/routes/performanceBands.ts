import { Router } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { loadProfile } from "../middleware/loadProfile";
import { requireModuleAccess } from "../middleware/requireModuleAccess";
import { resolveRequestAccessRoles } from "../auth/accessRoles";
import { PerformanceBandOutcome } from "@prisma/client";
import prisma from "../prisma";

const router = Router();

const isPrivileged = (roles: string[]) =>
  roles.some((r) => ["super_admin", "hr"].includes(r));

const parseOutcome = (v: unknown): PerformanceBandOutcome | null => {
  if (v === "promote") return PerformanceBandOutcome.promote;
  if (v === "retain")  return PerformanceBandOutcome.retain;
  if (v === "pip")     return PerformanceBandOutcome.pip;
  if (v === "exit")    return PerformanceBandOutcome.exit;
  return null;
};

// GET /performance-bands?roleId=
router.get("/", authMiddleware, loadProfile, async (req: AuthRequest, res) => {
  try {
    const roleId = req.query.roleId ? Number(req.query.roleId) : undefined;
    const bands = await prisma.performanceBand.findMany({
      where: roleId ? { roleId } : {},
      include: { role: { select: { id: true, name: true } } },
      orderBy: [{ roleId: "asc" }, { onTrackMin: "desc" }],
    });
    return res.json(bands);
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to fetch performance bands" });
  }
});

// GET /performance-bands/resolve?score=72&roleId=3
// Returns the matching band + recommended outcome for a given score
router.get("/resolve", authMiddleware, loadProfile, async (req: AuthRequest, res) => {
  try {
    const score = req.query.score ? Number(req.query.score) : undefined;
    const roleId = req.query.roleId ? Number(req.query.roleId) : undefined;
    if (score === undefined) return res.status(400).json({ error: "score is required" });

    const bands = await prisma.performanceBand.findMany({
      where: roleId ? { OR: [{ roleId }, { roleId: null }] } : { roleId: null },
      orderBy: { onTrackMin: "desc" },
    });

    const band = bands.find((b) => score >= Number(b.atRiskMin))
      ?? bands[bands.length - 1];

    const status =
      score >= Number(band?.onTrackMin ?? 85) ? "on_track"
      : score >= Number(band?.atRiskMin ?? 65) ? "at_risk"
      : "off_track";

    return res.json({ score, band, status });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to resolve band" });
  }
});

// POST /performance-bands
router.post(
  "/",
  authMiddleware,
  loadProfile,
  requireModuleAccess("evaluations", "write"),
  async (req: AuthRequest, res) => {
    try {
      const roles = resolveRequestAccessRoles(req).map((r) => r.toLowerCase());
      if (!isPrivileged(roles)) return res.status(403).json({ error: "HR access required" });

      const { roleId, onTrackMin, atRiskMin, label, grade, outcome } = req.body;
      const parsedOutcome = parseOutcome(outcome);

      const band = await prisma.performanceBand.create({
        data: {
          roleId: roleId ? Number(roleId) : undefined,
          onTrackMin: onTrackMin ?? 85,
          atRiskMin: atRiskMin ?? 65,
          label: label || undefined,
          grade: grade || undefined,
          outcome: parsedOutcome ?? undefined,
        },
      });
      return res.status(201).json(band);
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "Failed to create band" });
    }
  }
);

// PATCH /performance-bands/:id
router.patch(
  "/:id",
  authMiddleware,
  loadProfile,
  requireModuleAccess("evaluations", "write"),
  async (req: AuthRequest, res) => {
    try {
      const roles = resolveRequestAccessRoles(req).map((r) => r.toLowerCase());
      if (!isPrivileged(roles)) return res.status(403).json({ error: "HR access required" });

      const id = Number(req.params.id);
      const { onTrackMin, atRiskMin, label, grade, outcome, roleId } = req.body;
      const parsedOutcome = parseOutcome(outcome);

      const band = await prisma.performanceBand.update({
        where: { id },
        data: {
          ...(onTrackMin !== undefined ? { onTrackMin } : {}),
          ...(atRiskMin !== undefined ? { atRiskMin } : {}),
          ...(label !== undefined ? { label } : {}),
          ...(grade !== undefined ? { grade } : {}),
          ...(parsedOutcome !== null ? { outcome: parsedOutcome } : outcome === null ? { outcome: null } : {}),
          ...(roleId !== undefined ? { roleId: roleId ? Number(roleId) : null } : {}),
        },
      });
      return res.json(band);
    } catch (err: any) {
      if (err?.code === "P2025") return res.status(404).json({ error: "Band not found" });
      return res.status(500).json({ error: err?.message || "Failed to update band" });
    }
  }
);

// DELETE /performance-bands/:id
router.delete(
  "/:id",
  authMiddleware,
  loadProfile,
  requireModuleAccess("evaluations", "write"),
  async (req: AuthRequest, res) => {
    try {
      const roles = resolveRequestAccessRoles(req).map((r) => r.toLowerCase());
      if (!isPrivileged(roles)) return res.status(403).json({ error: "HR access required" });
      await prisma.performanceBand.delete({ where: { id: Number(req.params.id) } });
      return res.status(204).send();
    } catch (err: any) {
      if (err?.code === "P2025") return res.status(404).json({ error: "Band not found" });
      return res.status(500).json({ error: "Failed to delete band" });
    }
  }
);

export default router;
