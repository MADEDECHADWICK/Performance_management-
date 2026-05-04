import { Router } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { loadProfile } from "../middleware/loadProfile";
import { requireModuleAccess } from "../middleware/requireModuleAccess";
import { resolveRequestAccessRoles } from "../auth/accessRoles";
import { PerformanceReviewStatus, PerformanceReviewType } from "@prisma/client";
import prisma from "../prisma";

const router = Router();

const isPrivileged = (roles: string[]) =>
  roles.some((r) => ["super_admin", "hr"].includes(r));

const parseType = (v: unknown): PerformanceReviewType => {
  if (v === "quarterly") return PerformanceReviewType.quarterly;
  if (v === "annual")    return PerformanceReviewType.annual;
  return PerformanceReviewType.check_in;
};

const parseStatus = (v: unknown): PerformanceReviewStatus | null => {
  if (v === "scheduled")   return PerformanceReviewStatus.scheduled;
  if (v === "in_progress") return PerformanceReviewStatus.in_progress;
  if (v === "completed")   return PerformanceReviewStatus.completed;
  if (v === "cancelled")   return PerformanceReviewStatus.cancelled;
  return null;
};

// GET /performance-reviews?revieweeId=&reviewerId=&cycleId=&status=&type=
router.get("/", authMiddleware, loadProfile, async (req: AuthRequest, res) => {
  try {
    const roles = resolveRequestAccessRoles(req).map((r) => r.toLowerCase());
    const myProfileId = req.profile?.id;

    const revieweeId  = req.query.revieweeId  ? Number(req.query.revieweeId)  : undefined;
    const reviewerId  = req.query.reviewerId  ? Number(req.query.reviewerId)  : undefined;
    const cycleId     = req.query.cycleId     ? Number(req.query.cycleId)     : undefined;
    const status      = parseStatus(req.query.status) ?? undefined;
    const type        = req.query.type as PerformanceReviewType | undefined;

    // Non-privileged: can only see reviews where they are reviewer or reviewee
    const canSeeAll = isPrivileged(roles);
    const profileFilter = !canSeeAll ? {
      OR: [
        { reviewerProfileId: myProfileId },
        { revieweeProfileId: myProfileId },
      ],
    } : {};

    const reviews = await prisma.performanceReview.findMany({
      where: {
        ...profileFilter,
        ...(revieweeId ? { revieweeProfileId: revieweeId } : {}),
        ...(reviewerId ? { reviewerProfileId: reviewerId } : {}),
        ...(cycleId ? { evaluationCycleId: cycleId } : {}),
        ...(status ? { status } : {}),
        ...(type ? { type } : {}),
      },
      include: {
        reviewer: { select: { id: true, firstName: true, lastName: true } },
        reviewee: { select: { id: true, firstName: true, lastName: true, department: { select: { name: true } } } },
        evaluationCycle: { select: { id: true, cycleName: true } },
      },
      orderBy: [{ scheduledAt: "desc" }, { createdAt: "desc" }],
    });

    return res.json(reviews);
  } catch (err: any) {
    console.error("Error fetching performance reviews:", err);
    return res.status(500).json({ error: "Failed to fetch performance reviews" });
  }
});

// GET /performance-reviews/:id
router.get("/:id", authMiddleware, loadProfile, async (req: AuthRequest, res) => {
  try {
    const roles = resolveRequestAccessRoles(req).map((r) => r.toLowerCase());
    const myProfileId = req.profile?.id;
    const review = await prisma.performanceReview.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        reviewer: { select: { id: true, firstName: true, lastName: true } },
        reviewee: { select: { id: true, firstName: true, lastName: true } },
        evaluationCycle: { select: { id: true, cycleName: true } },
      },
    });
    if (!review) return res.status(404).json({ error: "Review not found" });

    const canView = isPrivileged(roles)
      || review.reviewerProfileId === myProfileId
      || review.revieweeProfileId === myProfileId;
    if (!canView) return res.status(403).json({ error: "Access denied" });

    return res.json(review);
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to fetch review" });
  }
});

// POST /performance-reviews
router.post(
  "/",
  authMiddleware,
  loadProfile,
  requireModuleAccess("evaluations", "write"),
  async (req: AuthRequest, res) => {
    try {
      const myProfileId = req.profile?.id;
      if (!myProfileId) return res.status(401).json({ error: "Not authenticated" });

      const {
        revieweeProfileId,
        reviewerProfileId,
        evaluationCycleId,
        type,
        scheduledAt,
        notes,
        agendaItems,
      } = req.body;

      if (!revieweeProfileId) return res.status(400).json({ error: "revieweeProfileId is required" });

      const review = await prisma.performanceReview.create({
        data: {
          reviewerProfileId: reviewerProfileId ? Number(reviewerProfileId) : myProfileId,
          revieweeProfileId: Number(revieweeProfileId),
          evaluationCycleId: evaluationCycleId ? Number(evaluationCycleId) : undefined,
          type: parseType(type),
          scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
          notes: notes || undefined,
          agendaItems: agendaItems ?? undefined,
        },
        include: {
          reviewer: { select: { id: true, firstName: true, lastName: true } },
          reviewee: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      return res.status(201).json(review);
    } catch (err: any) {
      console.error("Error creating performance review:", err);
      return res.status(500).json({ error: err?.message || "Failed to create review" });
    }
  }
);

// PATCH /performance-reviews/:id
router.patch(
  "/:id",
  authMiddleware,
  loadProfile,
  requireModuleAccess("evaluations", "write"),
  async (req: AuthRequest, res) => {
    try {
      const roles = resolveRequestAccessRoles(req).map((r) => r.toLowerCase());
      const myProfileId = req.profile?.id;
      const id = Number(req.params.id);

      const existing = await prisma.performanceReview.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: "Review not found" });

      const canEdit = isPrivileged(roles) || existing.reviewerProfileId === myProfileId;
      if (!canEdit) return res.status(403).json({ error: "Access denied" });

      const {
        status,
        notes,
        competencyRatings,
        overallRating,
        agendaItems,
        actionItems,
        scheduledAt,
      } = req.body;

      const parsedStatus = parseStatus(status);
      const completedAt =
        parsedStatus === PerformanceReviewStatus.completed && existing.status !== "completed"
          ? new Date()
          : undefined;

      const review = await prisma.performanceReview.update({
        where: { id },
        data: {
          ...(parsedStatus ? { status: parsedStatus } : {}),
          ...(completedAt ? { completedAt } : {}),
          ...(notes !== undefined ? { notes } : {}),
          ...(competencyRatings !== undefined ? { competencyRatings } : {}),
          ...(overallRating !== undefined ? { overallRating: overallRating !== null ? Number(overallRating) : null } : {}),
          ...(agendaItems !== undefined ? { agendaItems } : {}),
          ...(actionItems !== undefined ? { actionItems } : {}),
          ...(scheduledAt !== undefined ? { scheduledAt: scheduledAt ? new Date(scheduledAt) : null } : {}),
        },
        include: {
          reviewer: { select: { id: true, firstName: true, lastName: true } },
          reviewee: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      return res.json(review);
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "Failed to update review" });
    }
  }
);

// DELETE /performance-reviews/:id
router.delete(
  "/:id",
  authMiddleware,
  loadProfile,
  requireModuleAccess("evaluations", "write"),
  async (req: AuthRequest, res) => {
    try {
      const roles = resolveRequestAccessRoles(req).map((r) => r.toLowerCase());
      const myProfileId = req.profile?.id;
      const existing = await prisma.performanceReview.findUnique({ where: { id: Number(req.params.id) } });
      if (!existing) return res.status(404).json({ error: "Review not found" });
      const canDelete = isPrivileged(roles) || existing.reviewerProfileId === myProfileId;
      if (!canDelete) return res.status(403).json({ error: "Access denied" });
      await prisma.performanceReview.delete({ where: { id: Number(req.params.id) } });
      return res.status(204).send();
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to delete review" });
    }
  }
);

export default router;
