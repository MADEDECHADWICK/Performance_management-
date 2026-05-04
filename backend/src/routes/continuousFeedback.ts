import { Router } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { loadProfile } from "../middleware/loadProfile";
import { resolveRequestAccessRoles } from "../auth/accessRoles";
import { ContinuousFeedbackType, FeedbackVisibility } from "@prisma/client";
import prisma from "../prisma";

const router = Router();

const isPrivileged = (roles: string[]) =>
  roles.some((r) => ["super_admin", "hr", "manager"].includes(r));

const parseFeedbackType = (v: unknown): ContinuousFeedbackType => {
  if (v === "coaching") return ContinuousFeedbackType.coaching;
  if (v === "concern")  return ContinuousFeedbackType.concern;
  return ContinuousFeedbackType.praise;
};

const parseVisibility = (v: unknown): FeedbackVisibility => {
  if (v === "self")    return FeedbackVisibility.self;
  if (v === "manager") return FeedbackVisibility.manager;
  if (v === "hr")      return FeedbackVisibility.hr;
  return FeedbackVisibility.all;
};

// GET /continuous-feedback?recipientId=&giverId=&type=&limit=
router.get("/", authMiddleware, loadProfile, async (req: AuthRequest, res) => {
  try {
    const roles = resolveRequestAccessRoles(req).map((r) => r.toLowerCase());
    const myProfileId = req.profile?.id;

    const recipientId = req.query.recipientId ? Number(req.query.recipientId) : undefined;
    const giverId     = req.query.giverId     ? Number(req.query.giverId)     : undefined;
    const type        = req.query.type as ContinuousFeedbackType | undefined;
    const limit       = req.query.limit       ? Number(req.query.limit)       : 50;

    // Non-privileged employees can only see their own received (non-private) feedback
    const canSeeAll = isPrivileged(roles);
    const resolvedRecipientId = canSeeAll ? recipientId : myProfileId;

    const feedback = await prisma.feedback.findMany({
      where: {
        ...(resolvedRecipientId ? { recipientProfileId: resolvedRecipientId } : {}),
        ...(giverId && canSeeAll ? { giverProfileId: giverId } : {}),
        ...(type ? { feedbackType: type } : {}),
        // Employees only see non-private feedback addressed to them
        ...(!canSeeAll ? { isPrivate: false } : {}),
      },
      include: {
        giver: { select: { id: true, firstName: true, lastName: true } },
        recipient: { select: { id: true, firstName: true, lastName: true } },
        job: { select: { id: true, jobName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    // Anonymize giver when isAnonymous = true and viewer is not HR/admin
    const sanitized = feedback.map((item: any) => ({
      ...item,
      giver: !canSeeAll && item.isAnonymous ? null : item.giver,
      giverProfileId: !canSeeAll && item.isAnonymous ? null : item.giverProfileId,
    }));

    return res.json(sanitized);
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to fetch feedback" });
  }
});

// GET /continuous-feedback/:id
router.get("/:id", authMiddleware, loadProfile, async (req: AuthRequest, res) => {
  try {
    const roles = resolveRequestAccessRoles(req).map((r) => r.toLowerCase());
    const myProfileId = req.profile?.id;
    const item = await prisma.feedback.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        giver:     { select: { id: true, firstName: true, lastName: true } },
        recipient: { select: { id: true, firstName: true, lastName: true } },
        job:       { select: { id: true, jobName: true } },
      },
    });
    if (!item) return res.status(404).json({ error: "Feedback not found" });

    const canSeeAll = isPrivileged(roles);
    const isInvolved = item.giverProfileId === myProfileId || item.recipientProfileId === myProfileId;
    if (!canSeeAll && !isInvolved) return res.status(403).json({ error: "Access denied" });
    if (!canSeeAll && item.isPrivate && item.recipientProfileId !== myProfileId) {
      return res.status(403).json({ error: "Access denied" });
    }

    const full = item as any;
    return res.json({
      ...full,
      giver: !canSeeAll && full.isAnonymous ? null : full.giver,
      giverProfileId: !canSeeAll && full.isAnonymous ? null : full.giverProfileId,
    });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to fetch feedback" });
  }
});

// POST /continuous-feedback
router.post("/", authMiddleware, loadProfile, async (req: AuthRequest, res) => {
  try {
    const myProfileId = req.profile?.id;
    if (!myProfileId) return res.status(401).json({ error: "Not authenticated" });

    const {
      recipientId,
      jobId,
      feedbackType,
      message,
      title,
      isPrivate,
      isAnonymous,
      visibility,
    } = req.body;

    if (!recipientId || !message) {
      return res.status(400).json({ error: "recipientId and message are required" });
    }
    if (Number(recipientId) === myProfileId) {
      return res.status(400).json({ error: "Cannot give feedback to yourself" });
    }

    const item = await prisma.feedback.create({
      data: {
        giverProfileId:     myProfileId,
        recipientProfileId: Number(recipientId),
        jobId:              jobId ? Number(jobId) : undefined,
        feedbackType:       parseFeedbackType(feedbackType),
        message:            message,
        title:              title || message.substring(0, 60),
        content:            message,
        isPrivate:          Boolean(isPrivate),
        isAnonymous:        Boolean(isAnonymous),
        visibility:         parseVisibility(visibility),
        status:             "submitted",
      },
      include: {
        giver:     { select: { id: true, firstName: true, lastName: true } },
        recipient: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return res.status(201).json(item);
  } catch (err: any) {
    console.error("Error creating feedback:", err);
    return res.status(500).json({ error: err?.message || "Failed to create feedback" });
  }
});

// DELETE /continuous-feedback/:id  (giver or HR only)
router.delete("/:id", authMiddleware, loadProfile, async (req: AuthRequest, res) => {
  try {
    const roles = resolveRequestAccessRoles(req).map((r) => r.toLowerCase());
    const myProfileId = req.profile?.id;
    const item = await prisma.feedback.findUnique({ where: { id: Number(req.params.id) } });
    if (!item) return res.status(404).json({ error: "Feedback not found" });

    const canDelete = isPrivileged(roles) || item.giverProfileId === myProfileId;
    if (!canDelete) return res.status(403).json({ error: "Access denied" });

    await prisma.feedback.delete({ where: { id: Number(req.params.id) } });
    return res.status(204).send();
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to delete feedback" });
  }
});

export default router;
