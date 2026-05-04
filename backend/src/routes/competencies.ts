import { Router } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { loadProfile } from "../middleware/loadProfile";
import { requireModuleAccess } from "../middleware/requireModuleAccess";
import { resolveRequestAccessRoles } from "../auth/accessRoles";
import prisma from "../prisma";

const router = Router();

const isPrivileged = (roles: string[]) =>
  roles.some((r) => ["super_admin", "hr"].includes(r));

// GET /competencies?category=&activeOnly=true
router.get("/", authMiddleware, loadProfile, async (req: AuthRequest, res) => {
  try {
    const category = req.query.category ? String(req.query.category) : undefined;
    const activeOnly = req.query.activeOnly !== "false";

    const competencies = await prisma.competency.findMany({
      where: {
        ...(category ? { category } : {}),
        ...(activeOnly ? { isActive: true } : {}),
      },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });

    return res.json(competencies);
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to fetch competencies" });
  }
});

// GET /competencies/:id
router.get("/:id", authMiddleware, loadProfile, async (req: AuthRequest, res) => {
  try {
    const competency = await prisma.competency.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { questions: { select: { id: true, text: true, templateId: true } } },
    });
    if (!competency) return res.status(404).json({ error: "Competency not found" });
    return res.json(competency);
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to fetch competency" });
  }
});

// POST /competencies
router.post(
  "/",
  authMiddleware,
  loadProfile,
  requireModuleAccess("evaluations", "write"),
  async (req: AuthRequest, res) => {
    try {
      const roles = resolveRequestAccessRoles(req).map((r) => r.toLowerCase());
      if (!isPrivileged(roles)) return res.status(403).json({ error: "HR access required" });

      const { name, category, description, levels, isActive } = req.body;
      if (!name || !category) return res.status(400).json({ error: "name and category are required" });

      const competency = await prisma.competency.create({
        data: {
          name,
          category,
          description: description || undefined,
          levels: levels ?? [],
          isActive: isActive !== false,
        },
      });

      return res.status(201).json(competency);
    } catch (err: any) {
      if (err?.code === "P2002") return res.status(409).json({ error: "Competency name already exists" });
      return res.status(500).json({ error: err?.message || "Failed to create competency" });
    }
  }
);

// PATCH /competencies/:id
router.patch(
  "/:id",
  authMiddleware,
  loadProfile,
  requireModuleAccess("evaluations", "write"),
  async (req: AuthRequest, res) => {
    try {
      const roles = resolveRequestAccessRoles(req).map((r) => r.toLowerCase());
      if (!isPrivileged(roles)) return res.status(403).json({ error: "HR access required" });

      const id = parseInt(req.params.id);
      const { name, category, description, levels, isActive } = req.body;

      const competency = await prisma.competency.update({
        where: { id },
        data: {
          ...(name ? { name } : {}),
          ...(category ? { category } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(levels !== undefined ? { levels } : {}),
          ...(isActive !== undefined ? { isActive } : {}),
        },
      });

      return res.json(competency);
    } catch (err: any) {
      if (err?.code === "P2025") return res.status(404).json({ error: "Competency not found" });
      return res.status(500).json({ error: err?.message || "Failed to update competency" });
    }
  }
);

// DELETE /competencies/:id
router.delete(
  "/:id",
  authMiddleware,
  loadProfile,
  requireModuleAccess("evaluations", "write"),
  async (req: AuthRequest, res) => {
    try {
      const roles = resolveRequestAccessRoles(req).map((r) => r.toLowerCase());
      if (!isPrivileged(roles)) return res.status(403).json({ error: "HR access required" });

      await prisma.competency.delete({ where: { id: parseInt(req.params.id) } });
      return res.status(204).send();
    } catch (err: any) {
      if (err?.code === "P2025") return res.status(404).json({ error: "Competency not found" });
      return res.status(500).json({ error: "Failed to delete competency" });
    }
  }
);

export default router;
