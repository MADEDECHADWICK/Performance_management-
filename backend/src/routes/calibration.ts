import { Router } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import prisma from "../prisma";
import { errorResponse, successResponse } from "../utils/response";

const router = Router();

const hasCalibrationAccess = (req: AuthRequest) => {
  const roles = ((req as any).userRoles || req.user?.authRoles || []) as string[];
  const normalized = roles.map((role) => String(role).toLowerCase());
  return (
    normalized.includes("admin") ||
    normalized.includes("super_admin") ||
    normalized.includes("hr") ||
    normalized.includes("hr_manager")
  );
};

const computeStats = (values: number[]) => {
  if (values.length === 0) {
    return { mean: 0, stdDev: 0 };
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
  return { mean, stdDev: Math.sqrt(variance) };
};

router.get("/scores", authMiddleware, async (req: AuthRequest, res) => {
  try {
    if (!hasCalibrationAccess(req)) {
      return res.status(403).json(errorResponse("Access denied", 403));
    }

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

router.patch("/scores/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    if (!hasCalibrationAccess(req)) {
      return res.status(403).json(errorResponse("Access denied", 403));
    }

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
        calibratedByProfileId: req.user?.profileId ?? null,
        calibratedAt: new Date(),
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    res.json(successResponse(updated, "Calibration saved"));
  } catch (error: any) {
    console.error("Error saving calibration:", error);
    res.status(500).json(errorResponse("Failed to save calibration", 500));
  }
});

export default router;
