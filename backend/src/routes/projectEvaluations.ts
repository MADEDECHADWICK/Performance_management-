import { Router } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { loadProfile } from "../middleware/loadProfile";
import prisma from "../prisma";
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

const isManagerRole = (roles: string[]) => roles.includes("manager");

const computeOverallScore = (scores: Record<string, number> | null | undefined) => {
  if (!scores) return null;
  const values = Object.values(scores)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  if (values.length === 0) return null;
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.round(avg * 100) / 100;
};

router.get("/", authMiddleware, loadProfile, async (req: AuthRequest, res) => {
  try {
    if (!req.profile?.id) {
      return res.status(401).json(errorResponse("Profile not found", 401));
    }

    const roles = resolveRoles(req);
    const privileged = isPrivileged(roles);

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

    if (!privileged) {
      if (isManagerRole(roles)) {
        const reports = await prisma.profile.findMany({
          where: { managerId: req.profile.id, status: "active" },
          select: { id: true },
        });
        const reportIds = reports.map((report) => report.id);
        where.OR = [
          { evaluatorProfileId: req.profile.id },
          { evaluateeProfileId: req.profile.id },
          { evaluateeProfileId: { in: reportIds } },
        ];
      } else {
        where.OR = [
          { evaluatorProfileId: req.profile.id },
          { evaluateeProfileId: req.profile.id },
        ];
      }
    }

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

router.post("/", authMiddleware, loadProfile, async (req: AuthRequest, res) => {
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

    if (!req.profile?.id) {
      return res.status(401).json(errorResponse("Profile not found", 401));
    }

    const roles = resolveRoles(req);
    const privileged = isPrivileged(roles);

    const evaluatorId = evaluatorProfileId ?? req.user?.profileId;
    if (!evaluatorId) {
      return res.status(401).json(errorResponse("Evaluator profile not found", 401));
    }
    if (!privileged && evaluatorId !== req.profile.id) {
      return res.status(403).json(errorResponse("Access denied", 403));
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

router.patch("/:id", authMiddleware, loadProfile, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { scores, overallScore, comments, status } = req.body;

    if (!req.profile?.id) {
      return res.status(401).json(errorResponse("Profile not found", 401));
    }

    const roles = resolveRoles(req);
    const privileged = isPrivileged(roles);

    const existing = await prisma.projectEvaluation.findUnique({
      where: { id },
      select: { evaluatorProfileId: true },
    });

    if (!existing) {
      return res.status(404).json(errorResponse("Project evaluation not found", 404));
    }

    if (!privileged && existing.evaluatorProfileId !== req.profile.id) {
      return res.status(403).json(errorResponse("Access denied", 403));
    }

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
