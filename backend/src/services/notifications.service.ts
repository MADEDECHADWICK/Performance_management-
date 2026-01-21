/**
 * Notifications Service (Modernized - Phase 4)
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
}

interface CreateNotificationInput {
  recipient_profile_id: number;
  type: string;
  title: string;
  message: string;
  related_entity_type?: string;
  related_entity_id?: number;
}

export class NotificationService {
  /**
   * List notifications for profile
   */
  static async listNotifications(options: ListOptions, auth: AuthContext) {
    const { page, pageSize, type, status } = options;
    const skip = (page - 1) * pageSize;

    const where: any = {
      recipient_profile_id: auth.profileId,
    };

    if (type) where.type = type;
    if (status) where.status = status;

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { created_at: 'desc' },
      }),
      prisma.notification.count({ where }),
    ]);

    return { notifications, total };
  }

  /**
   * Create notification
   */
  static async createNotification(input: CreateNotificationInput, auth: AuthContext) {
    const {
      recipient_profile_id,
      type,
      title,
      message,
      related_entity_type,
      related_entity_id,
    } = input;

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

    const notification = await prisma.notification.create({
      data: {
        recipient_profile_id,
        type,
        title,
        message,
        related_entity_type: related_entity_type || null,
        related_entity_id: related_entity_id || null,
        status: 'unread',
        created_at: new Date(),
      },
    });

    return notification;
  }

  /**
   * Mark notification as read
   */
  static async markAsRead(notificationId: number, auth: AuthContext) {
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw {
        statusCode: 404,
        message: 'Notification not found',
      };
    }

    // ✅ VERIFY ACCESS
    if (notification.recipient_profile_id !== auth.profileId && auth.roleName !== 'admin') {
      throw {
        statusCode: 403,
        message: 'You can only update your own notifications',
      };
    }

    const updated = await prisma.notification.update({
      where: { id: notificationId },
      data: {
        status: 'read',
        read_at: new Date(),
      },
    });

    return updated;
  }

  /**
   * Mark all notifications as read
   */
  static async markAllAsRead(auth: AuthContext) {
    const result = await prisma.notification.updateMany({
      where: {
        recipient_profile_id: auth.profileId,
        status: 'unread',
      },
      data: {
        status: 'read',
        read_at: new Date(),
      },
    });

    return result;
  }

  /**
   * Delete notification
   */
  static async deleteNotification(notificationId: number, auth: AuthContext) {
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw {
        statusCode: 404,
        message: 'Notification not found',
      };
    }

    // ✅ VERIFY ACCESS
    if (notification.recipient_profile_id !== auth.profileId && auth.roleName !== 'admin') {
      throw {
        statusCode: 403,
        message: 'You can only delete your own notifications',
      };
    }

    await prisma.notification.delete({
      where: { id: notificationId },
    });

    return true;
  }

  /**
   * Get unread count
   */
  static async getUnreadCount(auth: AuthContext) {
    const count = await prisma.notification.count({
      where: {
        recipient_profile_id: auth.profileId,
        status: 'unread',
      },
    });

    return { unreadCount: count };
  }

  /**
   * Delete all notifications
   */
  static async deleteAllNotifications(auth: AuthContext) {
    const result = await prisma.notification.deleteMany({
      where: {
        recipient_profile_id: auth.profileId,
      },
    });

    return result;
  }

  /**
   * Send batch notifications
   */
  static async sendBatchNotifications(
    recipientProfileIds: number[],
    input: Omit<CreateNotificationInput, 'recipient_profile_id'>,
    auth: AuthContext
  ) {
    // ✅ VERIFY AUTHORIZATION (admin/manager only)
    if (!['admin', 'manager'].includes(auth.roleName || '')) {
      throw {
        statusCode: 403,
        message: 'Only admins/managers can send batch notifications',
      };
    }

    const notifications = await prisma.notification.createMany({
      data: recipientProfileIds.map(id => ({
        recipient_profile_id: id,
        type: input.type,
        title: input.title,
        message: input.message,
        related_entity_type: input.related_entity_type || null,
        related_entity_id: input.related_entity_id || null,
        status: 'unread',
        created_at: new Date(),
      })),
    });

    return notifications;
  }
}