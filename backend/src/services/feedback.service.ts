/**
 * Feedback Service (Modernized - Phase 4)
 * Replaces raw SQL queries with Prisma ORM
 */

import { prisma } from '../prisma';

interface AuthContext {
  userId: number;
  profileId: number;
  roleName?: string;
}

interface ListOptions {
  page: number;
  pageSize: number;
  type?: string;
  status?: string;
  recipientId?: number;
}

interface CreateFeedbackInput {
  recipientProfileId?: number;
  title: string;
  content: string;
  type?: string;
  isAnonymous?: boolean;
}

export class FeedbackService {
  /**
   * List feedback with pagination
   */
  static async listFeedback(options: ListOptions, auth: AuthContext) {
    const { page, pageSize, type, status, recipientId } = options;
    const skip = (page - 1) * pageSize;

    const where: any = {};

    if (type) where.type = type;
    if (status) where.status = status;
    if (recipientId) where.recipientProfileId = recipientId;

    // ✅ ACCESS CONTROL
    if (!['admin', 'manager'].includes(auth.roleName || '')) {
      // Non-admins see only feedback for themselves or public feedback
      where.OR = [
        { recipientProfileId: auth.profileId },
        { giverProfileId: auth.profileId },
      ];
    }

    const [feedback, total] = await Promise.all([
      prisma.feedback.findMany({
        where,
        include: {
          giver: {
            select: { id: true, firstName: true, lastName: true },
          },
          recipient: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.feedback.count({ where }),
    ]);

    // ✅ HANDLE ANONYMOUS FEEDBACK
    const sanitized = feedback.map(f => ({
      ...f,
      giver: f.isAnonymous ? { id: 0, firstName: 'Anonymous', lastName: '' } : f.giver,
    }));

    return { feedback: sanitized, total };
  }

  /**
   * Create feedback
   */
  static async createFeedback(input: CreateFeedbackInput, auth: AuthContext) {
    const recipientProfileId = input.recipientProfileId;
    const { title, content, type } = input;
    const isAnonymous = input.isAnonymous;

    // ✅ VERIFY RECIPIENT EXISTS
    if (!recipientProfileId) {
      throw {
        statusCode: 400,
        message: 'Recipient is required',
      };
    }

    const recipient = await prisma.profile.findUnique({
      where: { id: recipientProfileId },
    });

    if (!recipient) {
      throw {
        statusCode: 404,
        message: 'Recipient not found',
      };
    }

    // ✅ PREVENT SELF-FEEDBACK
    if (recipientProfileId === auth.profileId && !isAnonymous) {
      throw {
        statusCode: 400,
        message: 'You cannot give feedback to yourself',
      };
    }

    const feedback = await prisma.feedback.create({
      data: {
        giverProfileId: auth.profileId,
        recipientProfileId,
        title,
        content,
        type: type || 'general',
        isAnonymous: isAnonymous || false,
        status: 'pending',
        createdAt: new Date(),
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

    return {
      ...feedback,
      giver: feedback.isAnonymous
        ? { id: 0, firstName: 'Anonymous', lastName: '' }
        : feedback.giver,
    };
  }

  /**
   * Get single feedback
   */
  static async getFeedback(feedbackId: number, auth: AuthContext) {
    const feedback = await prisma.feedback.findUnique({
      where: { id: feedbackId },
      include: {
        giver: {
          select: { id: true, firstName: true, lastName: true },
        },
        recipient: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    if (!feedback) {
      throw {
        statusCode: 404,
        message: 'Feedback not found',
      };
    }

    // ✅ VERIFY ACCESS
    const canView =
      auth.roleName === 'admin' ||
      feedback.recipientProfileId === auth.profileId ||
      feedback.giverProfileId === auth.profileId;

    if (!canView) {
      throw {
        statusCode: 403,
        message: 'You do not have permission to view this feedback',
      };
    }

    return {
      ...feedback,
      giver: feedback.isAnonymous
        ? { id: 0, firstName: 'Anonymous', lastName: '' }
        : feedback.giver,
    };
  }

  /**
   * Update feedback status (admin only)
   */
  static async updateFeedbackStatus(
    feedbackId: number,
    status: string,
    auth: AuthContext
  ) {
    // ✅ VERIFY AUTHORIZATION
    if (auth.roleName !== 'admin') {
      throw {
        statusCode: 403,
        message: 'Only admins can update feedback status',
      };
    }

    const feedback = await prisma.feedback.findUnique({
      where: { id: feedbackId },
    });

    if (!feedback) {
      throw {
        statusCode: 404,
        message: 'Feedback not found',
      };
    }

    const validStatuses = ['pending', 'reviewed', 'resolved', 'archived'];
    if (!validStatuses.includes(status)) {
      throw {
        statusCode: 400,
        message: `Status must be one of: ${validStatuses.join(', ')}`,
      };
    }

    const updated = await prisma.feedback.update({
      where: { id: feedbackId },
      data: {
        status,
        updatedAt: new Date(),
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

    return updated;
  }

  /**
   * Get feedback analytics
   */
  static async getFeedbackAnalytics(profileId: number, auth: AuthContext) {
    // ✅ VERIFY ACCESS
    if (profileId !== auth.profileId && auth.roleName !== 'admin') {
      throw {
        statusCode: 403,
        message: 'You can only view your own feedback analytics',
      };
    }

    const [totalFeedback, byType, byStatus] = await Promise.all([
      prisma.feedback.count({
        where: { recipientProfileId: profileId },
      }),
      prisma.feedback.groupBy({
        by: ['type'],
        where: { recipientProfileId: profileId },
        _count: true,
      }),
      prisma.feedback.groupBy({
        by: ['status'],
        where: { recipientProfileId: profileId },
        _count: true,
      }),
    ]);

    return {
      profileId,
      totalFeedback,
      byType: byType.map(item => ({
        type: item.type,
        count: item._count,
      })),
      byStatus: byStatus.map(item => ({
        status: item.status,
        count: item._count,
      })),
    };
  }

  /**
   * Delete feedback (admin or giver only)
   */
  static async deleteFeedback(feedbackId: number, auth: AuthContext) {
    const feedback = await prisma.feedback.findUnique({
      where: { id: feedbackId },
    });

    if (!feedback) {
      throw {
        statusCode: 404,
        message: 'Feedback not found',
      };
    }

    // ✅ VERIFY ACCESS
    const canDelete =
      auth.roleName === 'admin' ||
      feedback.giverProfileId === auth.profileId;

    if (!canDelete) {
      throw {
        statusCode: 403,
        message: 'You can only delete your own feedback',
      };
    }

    await prisma.feedback.delete({
      where: { id: feedbackId },
    });

    return true;
  }
}
