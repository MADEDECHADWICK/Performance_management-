import { Router } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import prisma from "../prisma";
import { errorResponse, successResponse } from "../utils/response";

const router = Router();

const computeOverallScore = (scores: Record<string, number> | null | undefined) => {
  if (!scores) return null;
  const values = Object.values(scores)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  if (values.length === 0) return null;
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.round(avg * 100) / 100;
};

router.get("/", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const jobId = req.query.jobId ? Number(req.query.jobId) : undefined;
    const evaluateeProfileId = req.query.evaluateeProfileId
      ? Number(req.query.evaluateeProfileId)
      : undefined;
    const evaluatorProfileId = req.query.evaluatorProfileId
      ? Number(req.query.evaluatorProfileId)
      : undefined;
    const status = req.query.status ? String(req.query.status) : undefined;

    const where: any = {};
    if (jobId) where.jobId = jobId;
    if (evaluateeProfileId) where.evaluateeProfileId = evaluateeProfileId;
    if (evaluatorProfileId) where.evaluatorProfileId = evaluatorProfileId;
    if (status) where.status = status;

    const evaluations = await prisma.projectEvaluation.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        job: { select: { id: true, jobName: true, status: true } },
        evaluatee: { select: { id: true, firstName: true, lastName: true } },
        evaluator: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    res.json(successResponse(evaluations, "Project evaluations retrieved"));
  } catch (error: any) {
    res.status(500).json(errorResponse("Failed to load project evaluations", 500));
  }
});

router.post("/", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const {
      jobId,
      evaluateeProfileId,
      evaluatorProfileId,
      evaluatorType,
      scores,
      overallScore,
      comments,
      status,
    } = req.body;

    if (!jobId || !evaluateeProfileId) {
      return res
        .status(400)
        .json(errorResponse("jobId and evaluateeProfileId are required", 400));
    }

    const evaluatorId = evaluatorProfileId ?? req.user?.profileId;
    if (!evaluatorId) {
      return res.status(401).json(errorResponse("Evaluator profile not found", 401));
    }

    const computedScore =
      typeof overallScore === "number" ? overallScore : computeOverallScore(scores);

    const evaluation = await prisma.projectEvaluation.create({
      data: {
        jobId: Number(jobId),
        evaluateeProfileId: Number(evaluateeProfileId),
        evaluatorProfileId: Number(evaluatorId),
        evaluatorType: evaluatorType || "manager",
        status: status || "draft",
        scores: scores || {},
        overallScore: computedScore ?? undefined,
        comments: comments || null,
        submittedAt: status === "submitted" ? new Date() : null,
      },
      include: {
        job: { select: { id: true, jobName: true, status: true } },
        evaluatee: { select: { id: true, firstName: true, lastName: true } },
        evaluator: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    res.status(201).json(successResponse(evaluation, "Project evaluation created", 201));
  } catch (error: any) {
    console.error("Error creating project evaluation:", error);
    res.status(500).json(errorResponse("Failed to create project evaluation", 500));
  }
});

router.patch("/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { scores, overallScore, comments, status } = req.body;

    const computedScore =
      typeof overallScore === "number" ? overallScore : computeOverallScore(scores);

    const evaluation = await prisma.projectEvaluation.update({
      where: { id },
      data: {
        scores: scores ?? undefined,
        overallScore: computedScore ?? undefined,
        comments: comments ?? undefined,
        status: status ?? undefined,
        submittedAt: status === "submitted" ? new Date() : undefined,
      },
      include: {
        job: { select: { id: true, jobName: true, status: true } },
        evaluatee: { select: { id: true, firstName: true, lastName: true } },
        evaluator: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    res.json(successResponse(evaluation, "Project evaluation updated"));
  } catch (error: any) {
    console.error("Error updating project evaluation:", error);
    res.status(500).json(errorResponse("Failed to update project evaluation", 500));
  }
});

export default router;
