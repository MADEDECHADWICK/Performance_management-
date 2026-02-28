import { Router } from "express";
import prisma from "../prisma";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { loadProfile } from "../middleware/loadProfile";
import { requireModuleAccess } from "../middleware/requireModuleAccess";
import { mergeWithDefaultScoringConfig } from "../services/performanceFramework.service";
import { errorResponse, successResponse } from "../utils/response";

const router = Router();

const resolveRoles = (req: AuthRequest) => {
  const roles = new Set<string>();
  (req.userRoles || []).forEach((role) => roles.add(role.toLowerCase()));
  (req.user?.authRoles || []).forEach((role) => roles.add(role.toLowerCase()));
  if (req.profile?.role?.name) roles.add(req.profile.role.name.toLowerCase());
  return Array.from(roles);
};

const isPrivileged = (roles: string[]) =>
  roles.includes("admin") ||
  roles.includes("super_admin") ||
  roles.includes("hr") ||
  roles.includes("hr_manager");

// GET /evaluation-definitions?status=published&cycleId=1&departmentId=2
router.get("/", authMiddleware, loadProfile, async (req: AuthRequest, res) => {
  try {
    const status = req.query.status as string | undefined;
    const cycleId = req.query.cycleId ? Number(req.query.cycleId) : undefined;
    const departmentId = req.query.departmentId
      ? Number(req.query.departmentId)
      : undefined;

    const roles = resolveRoles(req);
    const privileged = isPrivileged(roles);

    const where: any = {};
    if (privileged) {
      if (status) where.status = status;
    } else {
      where.status = "published";
      where.hideFromDashboard = false;
    }
    if (cycleId !== undefined) where.cycleId = cycleId;
    if (departmentId !== undefined) where.departmentId = departmentId;

    const definitions = await prisma.evaluationDefinition.findMany({
      where,
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      include: {
        cycle: { select: { id: true, cycleName: true, startDate: true, endDate: true } },
        department: { select: { id: true, name: true } },
      },
    });

    const normalizedDefinitions = definitions.map((definition) => ({
      ...definition,
      scoringConfig: mergeWithDefaultScoringConfig(
        (definition.scoringConfig ?? {}) as Record<string, any>
      ),
    }));

    return res.json(
      successResponse(normalizedDefinitions, "Evaluation definitions loaded")
    );
  } catch (error: any) {
    console.error("Error loading evaluation definitions:", error);
    return res.status(500).json(errorResponse("Failed to load evaluation definitions", 500));
  }
});

// POST /evaluation-definitions
router.post(
  "/",
  authMiddleware,
  requireModuleAccess("evaluations", "admin"),
  async (req: AuthRequest, res) => {
    try {
      const payload = req.body ?? {};

      const definition = await prisma.evaluationDefinition.create({
        data: {
          name: payload.name,
          description: payload.description ?? null,
          cycleId: payload.cycleId ?? null,
          departmentId: payload.departmentId ?? null,
          enableSelfEvaluation: !!payload.enableSelfEvaluation,
          enablePeerEvaluation: !!payload.enablePeerEvaluation,
          enableUpwardEvaluation: !!payload.enableUpwardEvaluation,
          enableDownwardEvaluation: !!payload.enableDownwardEvaluation,
          enableClientEvaluation: !!payload.enableClientEvaluation,
          dueDate: payload.dueDate ? new Date(payload.dueDate) : null,
          processAnonymously: !!payload.processAnonymously,
          hideFromDashboard: !!payload.hideFromDashboard,
          excludeFromScore: !!payload.excludeFromScore,
          requireEvaluatorSignature: !!payload.requireEvaluatorSignature,
          requireEvaluateeSignature: !!payload.requireEvaluateeSignature,
          status: payload.status ?? "draft",
          publishedAt: payload.status === "published" ? new Date() : null,
          createdByProfileId: req.user?.profileId ?? null,
          scoringConfig: mergeWithDefaultScoringConfig(payload.scoringConfig ?? {}),
          questions: payload.questions ?? [],
        },
      });

      return res.status(201).json(
        successResponse(definition, "Evaluation definition created", 201)
      );
    } catch (error: any) {
      console.error("Error creating evaluation definition:", error);
      return res.status(400).json(errorResponse(error.message, 400));
    }
  }
);

// PATCH /evaluation-definitions/:id
router.patch(
  "/:id",
  authMiddleware,
  requireModuleAccess("evaluations", "admin"),
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const payload = req.body ?? {};

      const updateData: any = {
        name: payload.name,
        description: payload.description,
        cycleId: payload.cycleId ?? undefined,
        departmentId: payload.departmentId ?? undefined,
        enableSelfEvaluation: payload.enableSelfEvaluation,
        enablePeerEvaluation: payload.enablePeerEvaluation,
        enableUpwardEvaluation: payload.enableUpwardEvaluation,
        enableDownwardEvaluation: payload.enableDownwardEvaluation,
        enableClientEvaluation: payload.enableClientEvaluation,
        dueDate: payload.dueDate ? new Date(payload.dueDate) : payload.dueDate,
        processAnonymously: payload.processAnonymously,
        hideFromDashboard: payload.hideFromDashboard,
        excludeFromScore: payload.excludeFromScore,
        requireEvaluatorSignature: payload.requireEvaluatorSignature,
        requireEvaluateeSignature: payload.requireEvaluateeSignature,
        scoringConfig:
          payload.scoringConfig === undefined
            ? undefined
            : mergeWithDefaultScoringConfig(payload.scoringConfig),
        questions: payload.questions,
      };

      if (payload.status) {
        updateData.status = payload.status;
        updateData.publishedAt = payload.status === "published" ? new Date() : null;
      }

      const definition = await prisma.evaluationDefinition.update({
        where: { id },
        data: updateData,
      });

      return res.json(successResponse(definition, "Evaluation definition updated"));
    } catch (error: any) {
      console.error("Error updating evaluation definition:", error);
      return res.status(400).json(errorResponse(error.message, 400));
    }
  }
);

export default router;
