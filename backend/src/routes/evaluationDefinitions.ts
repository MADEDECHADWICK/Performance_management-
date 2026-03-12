import { Router } from "express";
import type { Prisma } from "@prisma/client";
import prisma from "../prisma";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { loadProfile } from "../middleware/loadProfile";
import { requireModuleAccess } from "../middleware/requireModuleAccess";
import { mergeWithDefaultScoringConfig } from "../services/performanceFramework.service";
import {
  normalizeEvaluationQuestions,
  normalizeEvaluationWorkflowConfig,
  resolveEnabledEvaluatorTypes,
  summarizeEvaluationQuestions,
} from "../services/evaluationWorkflow.service";
import { errorResponse, successResponse } from "../utils/response";

const router = Router();

const hasField = (payload: Record<string, any>, key: string) =>
  Object.prototype.hasOwnProperty.call(payload, key);

const resolveRoles = (req: AuthRequest) => {
  const roles = new Set<string>();
  (req.userRoles || []).forEach((role) => roles.add(role.toLowerCase()));
  (req.user?.authRoles || []).forEach((role) => roles.add(role.toLowerCase()));
  if (req.profile?.role?.name) roles.add(req.profile.role.name.toLowerCase());
  return Array.from(roles);
};

const isPrivileged = (roles: string[]) =>
  roles.includes("super_admin") ||
  roles.includes("hr");

const normalizeDefinitionResponse = (definition: any) => {
  const enabledEvaluatorTypes = resolveEnabledEvaluatorTypes(definition);
  const questions = normalizeEvaluationQuestions(definition.questions, {
    fallbackTitle: definition.name,
    evaluatorTypes: enabledEvaluatorTypes,
  });
  const scoringConfig = mergeWithDefaultScoringConfig(
    (definition.scoringConfig ?? {}) as Record<string, any>
  );

  return {
    ...definition,
    enabledEvaluatorTypes,
    questions,
    questionSummary: summarizeEvaluationQuestions(questions),
    scoringConfig: {
      ...scoringConfig,
      evaluationWorkflow: normalizeEvaluationWorkflowConfig(
        (scoringConfig as any)?.evaluationWorkflow,
        enabledEvaluatorTypes,
        definition.dueDate ?? null
      ),
    },
  };
};

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

    const normalizedDefinitions = definitions.map((definition) =>
      normalizeDefinitionResponse(definition)
    );

    return res.json(
      successResponse(normalizedDefinitions, "Evaluation definitions loaded")
    );
  } catch (error: any) {
    console.error("Error loading evaluation definitions:", error);
    return res.status(500).json(errorResponse("Failed to load evaluation definitions", 500));
  }
});

// GET /evaluation-definitions/:id
router.get("/:id", authMiddleware, loadProfile, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const definition = await prisma.evaluationDefinition.findUnique({
      where: { id },
      include: {
        cycle: { select: { id: true, cycleName: true, startDate: true, endDate: true } },
        department: { select: { id: true, name: true } },
      },
    });

    if (!definition) {
      return res.status(404).json(errorResponse("Evaluation definition not found", 404));
    }

    const roles = resolveRoles(req);
    const privileged = isPrivileged(roles);
    if (!privileged && (definition.status !== "published" || definition.hideFromDashboard)) {
      return res.status(404).json(errorResponse("Evaluation definition not found", 404));
    }

    return res.json(
      successResponse(
        normalizeDefinitionResponse(definition),
        "Evaluation definition loaded"
      )
    );
  } catch (error: any) {
    console.error("Error loading evaluation definition:", error);
    return res.status(500).json(errorResponse("Failed to load evaluation definition", 500));
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
          scoringConfig: mergeWithDefaultScoringConfig({
            ...(payload.scoringConfig ?? {}),
            evaluationWorkflow: normalizeEvaluationWorkflowConfig(
              payload.scoringConfig?.evaluationWorkflow,
              resolveEnabledEvaluatorTypes(payload),
              payload.dueDate ?? null
            ),
          }),
          questions: normalizeEvaluationQuestions(payload.questions, {
            fallbackTitle: payload.name,
            evaluatorTypes: resolveEnabledEvaluatorTypes(payload),
          }),
        },
      });

      return res.status(201).json(
        successResponse(
          normalizeDefinitionResponse(definition),
          "Evaluation definition created",
          201
        )
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

      const existingDefinition = await prisma.evaluationDefinition.findUnique({
        where: { id },
      });

      if (!existingDefinition) {
        return res.status(404).json(errorResponse("Evaluation definition not found", 404));
      }

      const resolvedDefinitionInput = {
        ...existingDefinition,
        ...payload,
        enableSelfEvaluation:
          payload.enableSelfEvaluation ?? existingDefinition.enableSelfEvaluation,
        enablePeerEvaluation:
          payload.enablePeerEvaluation ?? existingDefinition.enablePeerEvaluation,
        enableUpwardEvaluation:
          payload.enableUpwardEvaluation ?? existingDefinition.enableUpwardEvaluation,
        enableDownwardEvaluation:
          payload.enableDownwardEvaluation ?? existingDefinition.enableDownwardEvaluation,
        enableClientEvaluation:
          payload.enableClientEvaluation ?? existingDefinition.enableClientEvaluation,
      };

      const resolvedDueDate =
        payload.dueDate === undefined ? existingDefinition.dueDate : payload.dueDate;
      const resolvedScoringConfig =
        payload.scoringConfig === undefined
          ? existingDefinition.scoringConfig
          : {
              ...((existingDefinition.scoringConfig ?? {}) as Record<string, any>),
              ...(payload.scoringConfig ?? {}),
            };

      const updateData: any = {
        name: hasField(payload, "name") ? payload.name : undefined,
        description: hasField(payload, "description")
          ? payload.description ?? null
          : undefined,
        cycleId: hasField(payload, "cycleId") ? payload.cycleId ?? null : undefined,
        departmentId: hasField(payload, "departmentId")
          ? payload.departmentId ?? null
          : undefined,
        enableSelfEvaluation: hasField(payload, "enableSelfEvaluation")
          ? payload.enableSelfEvaluation
          : undefined,
        enablePeerEvaluation: hasField(payload, "enablePeerEvaluation")
          ? payload.enablePeerEvaluation
          : undefined,
        enableUpwardEvaluation: hasField(payload, "enableUpwardEvaluation")
          ? payload.enableUpwardEvaluation
          : undefined,
        enableDownwardEvaluation: hasField(payload, "enableDownwardEvaluation")
          ? payload.enableDownwardEvaluation
          : undefined,
        enableClientEvaluation: hasField(payload, "enableClientEvaluation")
          ? payload.enableClientEvaluation
          : undefined,
        dueDate: hasField(payload, "dueDate")
          ? payload.dueDate
            ? new Date(payload.dueDate)
            : null
          : undefined,
        processAnonymously: hasField(payload, "processAnonymously")
          ? payload.processAnonymously
          : undefined,
        hideFromDashboard: hasField(payload, "hideFromDashboard")
          ? payload.hideFromDashboard
          : undefined,
        excludeFromScore: hasField(payload, "excludeFromScore")
          ? payload.excludeFromScore
          : undefined,
        requireEvaluatorSignature: hasField(payload, "requireEvaluatorSignature")
          ? payload.requireEvaluatorSignature
          : undefined,
        requireEvaluateeSignature: hasField(payload, "requireEvaluateeSignature")
          ? payload.requireEvaluateeSignature
          : undefined,
        scoringConfig:
          resolvedScoringConfig === undefined
            ? undefined
            : mergeWithDefaultScoringConfig({
                ...(resolvedScoringConfig as Record<string, any>),
                evaluationWorkflow: normalizeEvaluationWorkflowConfig(
                  (resolvedScoringConfig as Record<string, any>)?.evaluationWorkflow,
                  resolveEnabledEvaluatorTypes(resolvedDefinitionInput),
                  resolvedDueDate
                ),
              }),
        questions:
          payload.questions === undefined
            ? undefined
            : normalizeEvaluationQuestions(payload.questions, {
                fallbackTitle: payload.name ?? existingDefinition.name,
                evaluatorTypes: resolveEnabledEvaluatorTypes(resolvedDefinitionInput),
              }),
      };

      if (payload.status) {
        updateData.status = payload.status;
        updateData.publishedAt = payload.status === "published" ? new Date() : null;
      }

      const definition = await prisma.evaluationDefinition.update({
        where: { id },
        data: updateData,
      });

      return res.json(
        successResponse(
          normalizeDefinitionResponse(definition),
          "Evaluation definition updated"
        )
      );
    } catch (error: any) {
      console.error("Error updating evaluation definition:", error);
      return res.status(400).json(errorResponse(error.message, 400));
    }
  }
);

// POST /evaluation-definitions/:id/publish
router.post(
  "/:id/publish",
  authMiddleware,
  requireModuleAccess("evaluations", "admin"),
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const definition = await prisma.evaluationDefinition.update({
        where: { id },
        data: {
          status: "published",
          publishedAt: new Date(),
        },
        include: {
          cycle: { select: { id: true, cycleName: true, startDate: true, endDate: true } },
          department: { select: { id: true, name: true } },
        },
      });

      return res.json(
        successResponse(
          normalizeDefinitionResponse(definition),
          "Evaluation definition published"
        )
      );
    } catch (error: any) {
      console.error("Error publishing evaluation definition:", error);
      return res.status(400).json(errorResponse(error.message, 400));
    }
  }
);

// POST /evaluation-definitions/:id/auto-assign
router.post(
  "/:id/auto-assign",
  authMiddleware,
  requireModuleAccess("evaluations", "admin"),
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const options = req.body ?? {};
      const definition = await prisma.evaluationDefinition.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          departmentId: true,
          scoringConfig: true,
          enableSelfEvaluation: true,
          enablePeerEvaluation: true,
          enableUpwardEvaluation: true,
          enableDownwardEvaluation: true,
        },
      });

      if (!definition) {
        return res.status(404).json(errorResponse("Evaluation definition not found", 404));
      }

      if (definition.status !== "published") {
        return res.status(409).json(
          errorResponse("Only published evaluation definitions can be auto-assigned", 409)
        );
      }

      const departmentId = Number(
        options.departmentId ?? definition.departmentId ?? 0
      ) || undefined;
      const includePeers =
        options.includePeers === undefined
          ? Boolean(definition.enablePeerEvaluation)
          : Boolean(options.includePeers);
      const includeDirectReports =
        options.includeDirectReports === undefined
          ? Boolean(definition.enableUpwardEvaluation)
          : Boolean(options.includeDirectReports);

      const profiles = await prisma.profile.findMany({
        where: {
          status: "active",
          ...(departmentId ? { departmentId } : {}),
        },
        select: {
          id: true,
          managerId: true,
          departmentId: true,
        },
      });

      const scoringConfig = (definition.scoringConfig ?? {}) as Record<string, any>;
      const peersPerPerson = Math.max(1, Number(scoringConfig.peersPerPerson ?? 2));
      const peerAssignmentMode = String(
        scoringConfig.peerAssignmentMode ?? "department"
      ).toLowerCase();

      const assignments = new Map<
        string,
        Prisma.EvaluationAssignmentCreateManyInput
      >();
      const addAssignment = (
        evaluatorProfileId: number | null | undefined,
        evaluateeProfileId: number,
        evaluatorType: "self" | "manager" | "peer" | "direct_report"
      ) => {
        if (!evaluatorProfileId) return;
        if (evaluatorProfileId === evaluateeProfileId && evaluatorType !== "self") return;
        const key = `${definition.id}:${evaluatorProfileId}:${evaluateeProfileId}:${evaluatorType}`;
        assignments.set(key, {
          evaluationDefinitionId: definition.id,
          evaluatorProfileId,
          evaluateeProfileId,
          evaluatorType,
        });
      };

      profiles.forEach((profile) => {
        if (definition.enableSelfEvaluation) {
          addAssignment(profile.id, profile.id, "self");
        }

        if (definition.enableDownwardEvaluation && profile.managerId) {
          addAssignment(profile.managerId, profile.id, "manager");
        }

        if (includePeers && definition.enablePeerEvaluation) {
          let candidates = profiles.filter((candidate) => candidate.id !== profile.id);
          if (peerAssignmentMode === "manager" && profile.managerId) {
            candidates = candidates.filter(
              (candidate) => candidate.managerId && candidate.managerId === profile.managerId
            );
          } else if (peerAssignmentMode === "department" && profile.departmentId) {
            candidates = candidates.filter(
              (candidate) =>
                candidate.departmentId && candidate.departmentId === profile.departmentId
            );
          }

          candidates.slice(0, peersPerPerson).forEach((candidate) => {
            addAssignment(candidate.id, profile.id, "peer");
          });
        }

        if (includeDirectReports && definition.enableUpwardEvaluation) {
          profiles
            .filter((candidate) => candidate.managerId === profile.id)
            .forEach((candidate) => {
              addAssignment(candidate.id, profile.id, "direct_report");
            });
        }
      });

      const created = await prisma.evaluationAssignment.createMany({
        data: Array.from(assignments.values()),
        skipDuplicates: true,
      });

      return res.json(
        successResponse(
          {
            created: created.count,
          },
          "Evaluation assignments auto-created"
        )
      );
    } catch (error: any) {
      console.error("Error auto-assigning evaluation definition:", error);
      return res.status(400).json(errorResponse(error.message, 400));
    }
  }
);

// DELETE /evaluation-definitions/:id
router.delete(
  "/:id",
  authMiddleware,
  requireModuleAccess("evaluations", "admin"),
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const definition = await prisma.evaluationDefinition.findUnique({
        where: { id },
        select: { status: true },
      });

      if (!definition) {
        return res.status(404).json(errorResponse("Evaluation definition not found", 404));
      }

      if (definition.status !== "draft") {
        return res.status(409).json(
          errorResponse("Only draft evaluation definitions can be deleted", 409)
        );
      }

      await prisma.evaluationDefinition.delete({ where: { id } });
      return res.json(successResponse(true, "Evaluation definition deleted"));
    } catch (error: any) {
      console.error("Error deleting evaluation definition:", error);
      return res.status(400).json(errorResponse(error.message, 400));
    }
  }
);

export default router;
