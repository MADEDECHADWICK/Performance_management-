/**
 * Feedback Service (Modernized - Phase 4)
 * Replaces raw SQL queries with Prisma ORM
 */

import { prisma } from '../lib/prisma';

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
  recipient_profile_id: number;
  title: string;
  content: string;
  type?: string;
  is_anonymous?: boolean;
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
    if (recipientId) where.recipient_profile_id = recipientId;

    // ✅ ACCESS CONTROL
    if (!['admin', 'manager'].includes(auth.roleName || '')) {
      // Non-admins see only feedback for themselves or public feedback
      where.OR = [
        { recipient_profile_id: auth.profileId },
        { giver_profile_id: auth.profileId },
      ];
    }

    const [feedback, total] = await Promise.all([
      prisma.feedback.findMany({
        where,
        include: {
          giver: {
            select: { id: true, first_name: true, last_name: true },
          },
          recipient: {
            select: { id: true, first_name: true, last_name: true },
          },
        },
        skip,
        take: pageSize,
        orderBy: { created_at: 'desc' },
      }),
      prisma.feedback.count({ where }),
    ]);

    // ✅ HANDLE ANONYMOUS FEEDBACK
    const sanitized = feedback.map(f => ({
      ...f,
      giver: f.is_anonymous ? { id: 0, first_name: 'Anonymous', last_name: '' } : f.giver,
    }));

    return { feedback: sanitized, total };
  }

  /**
   * Create feedback
   */
  static async createFeedback(input: CreateFeedbackInput, auth: AuthContext) {
    const { recipient_profile_id, title, content, type, is_anonymous } = input;

    // ✅ VERIFY RECIPIENT EXISTS
    const recipient = await prisma.profile.findUnique({
      where: { id: recipient_profile_id },
    });

    if (!recipient) {
      throw {
        statusCode: 404,
        message: 'Recipient not found',
      };
    }

    // ✅ PREVENT SELF-FEEDBACK
    if (recipient_profile_id === auth.profileId && !is_anonymous) {
      throw {
        statusCode: 400,
        message: 'You cannot give feedback to yourself',
      };
    }

    const feedback = await prisma.feedback.create({
      data: {
        giver_profile_id: auth.profileId,
        recipient_profile_id,
        title,
        content,
        type: type || 'general',
        is_anonymous: is_anonymous || false,
        status: 'pending',
        created_at: new Date(),
      },
      include: {
        giver: {
          select: { id: true, first_name: true, last_name: true },
        },
        recipient: {
          select: { id: true, first_name: true, last_name: true },
        },
      },
    });

    return {
      ...feedback,
      giver: feedback.is_anonymous
        ? { id: 0, first_name: 'Anonymous', last_name: '' }
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
          select: { id: true, first_name: true, last_name: true },
        },
        recipient: {
          select: { id: true, first_name: true, last_name: true },
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
      feedback.recipient_profile_id === auth.profileId ||
      feedback.giver_profile_id === auth.profileId;

    if (!canView) {
      throw {
        statusCode: 403,
        message: 'You do not have permission to view this feedback',
      };
    }

    return {
      ...feedback,
      giver: feedback.is_anonymous
        ? { id: 0, first_name: 'Anonymous', last_name: '' }
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
        updated_at: new Date(),
      },
      include: {
        giver: {
          select: { id: true, first_name: true, last_name: true },
        },
        recipient: {
          select: { id: true, first_name: true, last_name: true },
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
        where: { recipient_profile_id: profileId },
      }),
      prisma.feedback.groupBy({
        by: ['type'],
        where: { recipient_profile_id: profileId },
        _count: true,
      }),
      prisma.feedback.groupBy({
        by: ['status'],
        where: { recipient_profile_id: profileId },
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
      feedback.giver_profile_id === auth.profileId;

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