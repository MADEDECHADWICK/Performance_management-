import { FeedbackVisibility, Prisma } from "@prisma/client";
import prisma from "../prisma";
import { NotificationService } from "./notifications.service";
import { createAudit } from "../utils/audit";

type ServiceAuthContext = {
  userId: number;
  profileId: number;
  roles: string[];
};

type FeedbackInput = {
  receiverId: number;
  jobId?: number | null;
  feedbackType: "praise" | "coaching" | "concern";
  message: string;
  isPrivate?: boolean;
  visibility?: "self" | "manager" | "hr" | "all";
};

const normalizeRole = (role: string) =>
  String(role || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

const canViewFeedbackForProfile = async (targetProfileId: number, auth: ServiceAuthContext) => {
  if (targetProfileId === auth.profileId) return "self" as const;

  const roles = new Set((auth.roles || []).map(normalizeRole));
  if (roles.has("super_admin") || roles.has("hr")) return "hr" as const;
  if (!roles.has("manager")) return null;

  const target = await prisma.profile.findUnique({
    where: { id: targetProfileId },
    select: { managerId: true },
  });

  return target?.managerId === auth.profileId ? ("manager" as const) : null;
};

export class FeedbackService {
  static async submitFeedback(input: FeedbackInput, auth: ServiceAuthContext) {
    const receiverId = Number(input.receiverId);
    if (!receiverId) {
      throw { statusCode: 400, message: "receiverId is required" };
    }

    if (!String(input.message || "").trim()) {
      throw { statusCode: 400, message: "message is required" };
    }

    if (receiverId === auth.profileId) {
      throw { statusCode: 400, message: "You cannot submit feedback to yourself" };
    }

    const receiver = await prisma.profile.findUnique({
      where: { id: receiverId },
      select: { id: true, firstName: true, lastName: true },
    });

    if (!receiver) {
      throw { statusCode: 404, message: "Receiver not found" };
    }

    const feedbackType = String(input.feedbackType || "praise").toLowerCase() as
      | "praise"
      | "coaching"
      | "concern";
    const visibility = String(input.visibility || "all").toLowerCase() as FeedbackVisibility;
    const title = `${feedbackType[0].toUpperCase()}${feedbackType.slice(1)} feedback`;

    const feedback = await prisma.feedback.create({
      data: {
        giverProfileId: auth.profileId,
        recipientProfileId: receiverId,
        jobId: input.jobId || null,
        title,
        content: input.message.trim(),
        message: input.message.trim(),
        type: feedbackType,
        feedbackType,
        isPrivate: !!input.isPrivate,
        visibility,
        status: "received",
      },
      include: {
        giver: {
          select: { id: true, firstName: true, lastName: true },
        },
        recipient: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    if (!feedback.isPrivate) {
      await NotificationService.dispatchEvent(
        {
          eventType: "feedback.received",
          title: "New feedback received",
          message: `You received ${feedbackType} feedback from ${feedback.giver.firstName} ${feedback.giver.lastName}.`,
          canonicalRoute: "/evaluations/feedback",
          targetEntityType: "Feedback",
          targetEntityId: feedback.id,
          requiredPermission: "module.evaluations.read",
          recipientProfileIds: [receiverId],
        },
        auth
      );
    }

    await createAudit({
      action: "feedback_submitted",
      entity_type: "Feedback",
      entity_id: feedback.id,
      user_id: auth.userId,
      metadata: {
        actorProfileId: auth.profileId,
        receiverId,
        visibility,
      } as Prisma.InputJsonValue,
    });

    return {
      id: feedback.id,
      giverId: feedback.giverProfileId,
      receiverId: feedback.recipientProfileId,
      jobId: feedback.jobId,
      feedbackType: feedback.feedbackType,
      message: feedback.message || feedback.content,
      isPrivate: feedback.isPrivate,
      visibility: feedback.visibility,
      createdAt: feedback.createdAt,
      giver: feedback.giver,
      receiver: feedback.recipient,
    };
  }

  static async getFeedbackForUser(userId: number, auth: ServiceAuthContext) {
    const scope = await canViewFeedbackForProfile(userId, auth);
    if (!scope) {
      throw { statusCode: 403, message: "You do not have access to this feedback feed" };
    }

    const where: Prisma.FeedbackWhereInput = {
      recipientProfileId: userId,
    };

    if (scope === "manager") {
      where.isPrivate = false;
      where.visibility = {
        in: ["manager", "all"],
      };
    }

    if (scope === "hr") {
      where.OR = [
        { visibility: "hr" },
        { visibility: "all" },
        { recipientProfileId: auth.profileId },
      ];
    }

    const feedback = await prisma.feedback.findMany({
      where,
      include: {
        giver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return feedback.map((item) => ({
      id: item.id,
      giverId: item.giverProfileId,
      receiverId: item.recipientProfileId,
      jobId: item.jobId,
      feedbackType: item.feedbackType,
      message: item.message || item.content,
      isPrivate: item.isPrivate,
      visibility: item.visibility,
      createdAt: item.createdAt,
      giver: item.isAnonymous
        ? { id: 0, firstName: "Anonymous", lastName: "" }
        : item.giver,
    }));
  }
}

export default FeedbackService;
