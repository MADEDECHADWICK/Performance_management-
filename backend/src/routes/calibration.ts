import { Router } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { resolveRequestPrimaryAccessRole } from "../auth/accessRoles";
import { loadProfile } from "../middleware/loadProfile";
import { requireModuleAccess } from "../middleware/requireModuleAccess";
import prisma from "../prisma";
import { errorResponse, successResponse } from "../utils/response";
import { createAudit } from "../utils/audit";
import { NotificationService } from "../services/notifications.service";
import { emitWebhook } from "../services/webhook.service";

const router = Router();

const computeStats = (values: number[]) => {
  if (values.length === 0) {
    return { mean: 0, stdDev: 0 };
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
  return { mean, stdDev: Math.sqrt(variance) };
};

router.get(
  "/assignments",
  authMiddleware,
  loadProfile,
  requireModuleAccess("evaluations", "admin"),
  async (req: AuthRequest, res) => {
    try {
      const cycleId = req.query.evaluationCycleId
        ? Number(req.query.evaluationCycleId)
        : undefined;
      const departmentId = req.query.departmentId ? Number(req.query.departmentId) : undefined;

      const assignments = await prisma.evaluationAssignment.findMany({
        where: {
          status: "submitted",
          score: { not: null },
          ...(cycleId !== undefined
            ? {
                definition: {
                  cycleId,
                },
              }
            : {}),
          ...(departmentId !== undefined
            ? {
                evaluatee: {
                  departmentId,
                },
              }
            : {}),
        },
        include: {
          definition: {
            select: {
              id: true,
              name: true,
              cycleId: true,
              dueDate: true,
              cycle: {
                select: {
                  id: true,
                  cycleName: true,
                  status: true,
                },
              },
            },
          },
          evaluator: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              positionTitle: true,
            },
          },
          evaluatee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              positionTitle: true,
              department: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
        orderBy: [{ submittedAt: "desc" }, { updatedAt: "desc" }],
      });

      const scoreValues = assignments.map((item) => Number(item.score || 0));
      const { mean, stdDev } = computeStats(scoreValues);

      const items = assignments.map((item) => {
        const scoreValue = Number(item.score || 0);
        const zScore = stdDev > 0 ? (scoreValue - mean) / stdDev : 0;
        return {
          ...item,
          scoreValue,
          zScore: Math.round(zScore * 100) / 100,
          isOutlier: Math.abs(zScore) >= 1.5,
        };
      });

      return res.json(
        successResponse(
          {
            stats: { mean, stdDev, count: items.length },
            items,
          },
          "Submitted evaluation assignments loaded"
        )
      );
    } catch (error: any) {
      console.error("Error loading submitted evaluation assignments:", error);
      return res
        .status(500)
        .json(errorResponse("Failed to load submitted evaluation assignments", 500));
    }
  }
);

router.get(
  "/scores",
  authMiddleware,
  loadProfile,
  requireModuleAccess("evaluations", "admin"),
  async (req: AuthRequest, res) => {
  try {
    const evaluationCycleId = req.query.evaluationCycleId
      ? Number(req.query.evaluationCycleId)
      : undefined;
    const departmentId = req.query.departmentId ? Number(req.query.departmentId) : undefined;

    const where: any = {};
    if (evaluationCycleId !== undefined) {
      where.evaluationCycleId = evaluationCycleId;
    }
    if (departmentId !== undefined) {
      where.employee = { departmentId };
    }

    const scores = await prisma.performanceScore.findMany({
      where,
      orderBy: { calculatedAt: "desc" },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            department: { select: { id: true, name: true } },
          },
        },
        calibratedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    const totalScores = scores.map((item) => Number(item.totalScore || 0));
    const { mean, stdDev } = computeStats(totalScores);

    const enriched = scores.map((item) => {
      const scoreValue = Number(item.totalScore || 0);
      const zScore = stdDev > 0 ? (scoreValue - mean) / stdDev : 0;
      return {
        ...item,
        zScore: Math.round(zScore * 100) / 100,
        isOutlier: Math.abs(zScore) >= 1.5,
      };
    });

    res.json(
      successResponse(
        {
          stats: { mean, stdDev, count: scores.length },
          items: enriched,
        },
        "Calibration scores loaded"
      )
    );
  } catch (error: any) {
    console.error("Error loading calibration scores:", error);
    res.status(500).json(errorResponse("Failed to load calibration scores", 500));
  }
});

router.patch(
  "/scores/:id",
  authMiddleware,
  loadProfile,
  requireModuleAccess("evaluations", "admin"),
  async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { calibratedScore, calibrationNote } = req.body;

    const updated = await prisma.performanceScore.update({
      where: { id },
      data: {
        calibratedScore:
          calibratedScore !== undefined && calibratedScore !== null
            ? Number(calibratedScore)
            : null,
        calibrationNote: calibrationNote ?? null,
        calibratedByProfileId: req.profile?.id ?? null,
        calibratedAt: new Date(),
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    await createAudit({
      action: "calibration:update",
      entity_type: "performance_score",
      entity_id: updated.id,
      user_id: req.user?.userId ?? undefined,
      metadata: {
        calibratedScore: updated.calibratedScore,
        calibrationNote: updated.calibrationNote,
      },
      ip_address: req.ip,
    });

    res.json(successResponse(updated, "Calibration saved"));
  } catch (error: any) {
    console.error("Error saving calibration:", error);
    res.status(500).json(errorResponse("Failed to save calibration", 500));
  }
});

router.patch(
  "/assignments/:assignmentId/reopen",
  authMiddleware,
  loadProfile,
  requireModuleAccess("evaluations", "admin"),
  async (req: AuthRequest, res) => {
    try {
      const assignmentId = Number(req.params.assignmentId);
      const { reason } = req.body ?? {};

      const assignment = await prisma.evaluationAssignment.findUnique({
        where: { id: assignmentId },
      });

      if (!assignment) {
        return res.status(404).json(errorResponse("Evaluation assignment not found", 404));
      }

      if (assignment.status !== "submitted") {
        return res
          .status(409)
          .json(errorResponse("Only submitted evaluations can be reopened", 409));
      }

      const updated = await prisma.evaluationAssignment.update({
        where: { id: assignmentId },
        data: {
          status: "in_progress",
          submittedAt: null,
          evaluatorSigned: false,
          evaluatorSignedAt: null,
          evaluateeAcknowledged: false,
          evaluateeAcknowledgedAt: null,
          rejectionReason: reason ?? null,
        },
      });

      await createAudit({
        action: "evaluation_assignment.reopened",
        entity_type: "evaluation_assignment",
        entity_id: assignmentId,
        user_id: req.user?.userId ?? undefined,
        metadata: {
          previousStatus: assignment.status,
          newStatus: updated.status,
          reason: reason ?? null,
          evaluatorProfileId: assignment.evaluatorProfileId,
          evaluateeProfileId: assignment.evaluateeProfileId,
        },
        ip_address: req.ip,
      });

      const auth = {
        userId: req.user?.userId ?? 0,
        profileId: req.profile?.id ?? 0,
        roleName: resolveRequestPrimaryAccessRole(req),
      };

      const profiles = await prisma.profile.findMany({
        where: { id: { in: [assignment.evaluatorProfileId, assignment.evaluateeProfileId] } },
        select: { id: true, firstName: true, lastName: true },
      });
      const byId = new Map(profiles.map((profile) => [profile.id, profile]));
      const evaluator = byId.get(assignment.evaluatorProfileId);
      const evaluatee = byId.get(assignment.evaluateeProfileId);

      const templateData = {
        assignmentId: assignment.id,
        evaluationDefinitionId: assignment.evaluationDefinitionId,
        evaluatorProfileId: assignment.evaluatorProfileId,
        evaluateeProfileId: assignment.evaluateeProfileId,
        evaluatorName: evaluator
          ? `${evaluator.firstName} ${evaluator.lastName}`
          : "Evaluator",
        evaluateeName: evaluatee
          ? `${evaluatee.firstName} ${evaluatee.lastName}`
          : "Evaluatee",
        reason: reason ?? "",
      };

      await NotificationService.createFromTemplate(
        {
          recipientProfileId: assignment.evaluatorProfileId,
          label: "evaluation.reopened.evaluator",
          data: templateData,
          type: "action",
          title: "Evaluation returned for updates",
          message: "An evaluation was returned to in-progress for updates.",
          evaluationDefinitionId: assignment.evaluationDefinitionId,
          actionRequired: true,
          link: `/evaluations/assignments/${assignment.id}`,
        },
        auth
      );

      await NotificationService.createFromTemplate(
        {
          recipientProfileId: assignment.evaluateeProfileId,
          label: "evaluation.reopened.evaluatee",
          data: templateData,
          type: "info",
          title: "Evaluation reopened",
          message: "HR has reopened an evaluation for further updates.",
          evaluationDefinitionId: assignment.evaluationDefinitionId,
          actionRequired: false,
          link: `/evaluations/assignments/${assignment.id}`,
        },
        auth
      );

      await emitWebhook("evaluation.reopened", {
        assignmentId: assignment.id,
        evaluateeProfileId: assignment.evaluateeProfileId,
        evaluatorProfileId: assignment.evaluatorProfileId,
        evaluationDefinitionId: assignment.evaluationDefinitionId,
        reason: reason ?? null,
      });

      return res.json(successResponse(updated, "Evaluation reopened"));
    } catch (error: any) {
      console.error("Error reopening evaluation:", error);
      return res.status(500).json(errorResponse("Failed to reopen evaluation", 500));
    }
  }
);

// ================================================================
// CALIBRATION SESSIONS
// ================================================================

// GET /calibration/sessions?cycleId=&departmentId=
router.get(
  "/sessions",
  authMiddleware,
  loadProfile,
  requireModuleAccess("evaluations", "admin"),
  async (req: AuthRequest, res) => {
    try {
      const cycleId = req.query.cycleId ? Number(req.query.cycleId) : undefined;
      const departmentId = req.query.departmentId ? Number(req.query.departmentId) : undefined;

      const sessions = await prisma.calibrationSession.findMany({
        where: {
          ...(cycleId ? { evaluationCycleId: cycleId } : {}),
          ...(departmentId ? { departmentId } : {}),
        },
        include: {
          facilitator: { select: { id: true, firstName: true, lastName: true } },
          department:  { select: { id: true, name: true } },
          participants: {
            include: { profile: { select: { id: true, firstName: true, lastName: true } } },
          },
          _count: { select: { scores: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      return res.json(successResponse(sessions, "Calibration sessions loaded"));
    } catch (error: any) {
      return res.status(500).json(errorResponse("Failed to load calibration sessions", 500));
    }
  }
);

// GET /calibration/sessions/:id
router.get(
  "/sessions/:id",
  authMiddleware,
  loadProfile,
  requireModuleAccess("evaluations", "admin"),
  async (req: AuthRequest, res) => {
    try {
      const session = await prisma.calibrationSession.findUnique({
        where: { id: Number(req.params.id) },
        include: {
          facilitator: { select: { id: true, firstName: true, lastName: true } },
          department:  { select: { id: true, name: true } },
          participants: {
            include: { profile: { select: { id: true, firstName: true, lastName: true } } },
          },
          scores: {
            include: {
              employee: { select: { id: true, firstName: true, lastName: true, department: { select: { name: true } } } },
              calibratedBy: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
      });

      if (!session) return res.status(404).json(errorResponse("Session not found", 404));
      return res.json(successResponse(session, "Calibration session loaded"));
    } catch (error: any) {
      return res.status(500).json(errorResponse("Failed to load calibration session", 500));
    }
  }
);

// POST /calibration/sessions
router.post(
  "/sessions",
  authMiddleware,
  loadProfile,
  requireModuleAccess("evaluations", "admin"),
  async (req: AuthRequest, res) => {
    try {
      const { evaluationCycleId, name, facilitatorProfileId, departmentId, notes, scheduledAt } = req.body;
      if (!evaluationCycleId || !name) {
        return res.status(400).json(errorResponse("evaluationCycleId and name are required", 400));
      }

      const session = await prisma.calibrationSession.create({
        data: {
          evaluationCycleId: Number(evaluationCycleId),
          name,
          facilitatorProfileId: facilitatorProfileId ? Number(facilitatorProfileId) : undefined,
          departmentId: departmentId ? Number(departmentId) : undefined,
          notes: notes || undefined,
          scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
        },
      });

      return res.status(201).json(successResponse(session, "Calibration session created"));
    } catch (error: any) {
      return res.status(500).json(errorResponse("Failed to create calibration session", 500));
    }
  }
);

// PATCH /calibration/sessions/:id — update fields or advance status
router.patch(
  "/sessions/:id",
  authMiddleware,
  loadProfile,
  requireModuleAccess("evaluations", "admin"),
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const { name, notes, scheduledAt, facilitatorProfileId, departmentId, status } = req.body;

      const existing = await prisma.calibrationSession.findUnique({ where: { id } });
      if (!existing) return res.status(404).json(errorResponse("Session not found", 404));
      if (existing.status === "finalized") {
        return res.status(409).json(errorResponse("Finalized sessions cannot be modified", 409));
      }

      const finalizedAt = status === "finalized" ? new Date() : undefined;

      const session = await prisma.calibrationSession.update({
        where: { id },
        data: {
          ...(name ? { name } : {}),
          ...(notes !== undefined ? { notes } : {}),
          ...(scheduledAt !== undefined ? { scheduledAt: scheduledAt ? new Date(scheduledAt) : null } : {}),
          ...(facilitatorProfileId !== undefined ? { facilitatorProfileId: facilitatorProfileId ? Number(facilitatorProfileId) : null } : {}),
          ...(departmentId !== undefined ? { departmentId: departmentId ? Number(departmentId) : null } : {}),
          ...(status ? { status } : {}),
          ...(finalizedAt ? { finalizedAt } : {}),
        },
      });

      return res.json(successResponse(session, "Calibration session updated"));
    } catch (error: any) {
      return res.status(500).json(errorResponse("Failed to update calibration session", 500));
    }
  }
);

// POST /calibration/sessions/:id/participants — add a participant
router.post(
  "/sessions/:id/participants",
  authMiddleware,
  loadProfile,
  requireModuleAccess("evaluations", "admin"),
  async (req: AuthRequest, res) => {
    try {
      const sessionId = Number(req.params.id);
      const { profileId, role } = req.body;
      if (!profileId) return res.status(400).json(errorResponse("profileId is required", 400));

      const participant = await prisma.calibrationSessionParticipant.upsert({
        where: { sessionId_profileId: { sessionId, profileId: Number(profileId) } },
        update: { role: role || "reviewer" },
        create: { sessionId, profileId: Number(profileId), role: role || "reviewer" },
        include: { profile: { select: { id: true, firstName: true, lastName: true } } },
      });

      return res.status(201).json(successResponse(participant, "Participant added"));
    } catch (error: any) {
      return res.status(500).json(errorResponse("Failed to add participant", 500));
    }
  }
);

// DELETE /calibration/sessions/:id/participants/:profileId
router.delete(
  "/sessions/:id/participants/:profileId",
  authMiddleware,
  loadProfile,
  requireModuleAccess("evaluations", "admin"),
  async (req: AuthRequest, res) => {
    try {
      const sessionId = Number(req.params.id);
      const profileId = Number(req.params.profileId);

      await prisma.calibrationSessionParticipant.delete({
        where: { sessionId_profileId: { sessionId, profileId } },
      });

      return res.status(204).send();
    } catch (error: any) {
      if (error?.code === "P2025") return res.status(404).json(errorResponse("Participant not found", 404));
      return res.status(500).json(errorResponse("Failed to remove participant", 500));
    }
  }
);

// POST /calibration/sessions/:id/scores/:scoreId — link a PerformanceScore to this session
router.post(
  "/sessions/:id/scores/:scoreId",
  authMiddleware,
  loadProfile,
  requireModuleAccess("evaluations", "admin"),
  async (req: AuthRequest, res) => {
    try {
      const sessionId = Number(req.params.id);
      const scoreId = Number(req.params.scoreId);

      const updated = await prisma.performanceScore.update({
        where: { id: scoreId },
        data: { calibrationSessionId: sessionId },
        include: { employee: { select: { id: true, firstName: true, lastName: true } } },
      });

      return res.json(successResponse(updated, "Score linked to session"));
    } catch (error: any) {
      if (error?.code === "P2025") return res.status(404).json(errorResponse("Score not found", 404));
      return res.status(500).json(errorResponse("Failed to link score", 500));
    }
  }
);

// PATCH /calibration/sessions/:id/scores/:scoreId — update potential rating within a session
router.patch(
  "/sessions/:id/scores/:scoreId",
  authMiddleware,
  loadProfile,
  requireModuleAccess("evaluations", "admin"),
  async (req: AuthRequest, res) => {
    try {
      const scoreId = Number(req.params.scoreId);
      const { calibratedScore, calibrationNote, potentialRating } = req.body;

      const updated = await prisma.performanceScore.update({
        where: { id: scoreId },
        data: {
          ...(calibratedScore !== undefined ? { calibratedScore: calibratedScore !== null ? Number(calibratedScore) : null } : {}),
          ...(calibrationNote !== undefined ? { calibrationNote } : {}),
          ...(potentialRating !== undefined ? { potentialRating: potentialRating !== null ? Number(potentialRating) : null } : {}),
          calibratedByProfileId: req.profile?.id ?? null,
          calibratedAt: new Date(),
        },
        include: { employee: { select: { id: true, firstName: true, lastName: true } } },
      });

      return res.json(successResponse(updated, "Score updated"));
    } catch (error: any) {
      return res.status(500).json(errorResponse("Failed to update score", 500));
    }
  }
);

export default router;
