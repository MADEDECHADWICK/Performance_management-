import { Router } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth";
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
        roleName: req.profile?.role?.name,
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
          link: `/evaluations/${assignment.id}`,
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
          link: `/evaluations/${assignment.id}`,
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

export default router;
