/**
 * Notifications Service (Modernized - Phase 4)
 */

import { NotificationType } from '@prisma/client';
import { prisma } from '../prisma';
import websocketService from './websocket.service';

interface AuthContext {
  userId: number;
  profileId: number;
  roleName?: string;
}

interface ListOptions {
  page: number;
  pageSize: number;
  type?: string;
  status?: 'read' | 'unread';
}

interface CreateNotificationInput {
  recipientProfileId: number;
  type: NotificationType;
  title: string;
  message: string;
  actionRequired?: boolean;
  dueDate?: Date;
  escalationLevel?: number;
  jobId?: number;
  clientId?: number;
  evaluationDefinitionId?: number;
  timeEntryId?: number;
  workflowAssignmentId?: number;
  link?: string;
}

interface TemplateNotificationInput {
  recipientProfileId: number;
  label: string;
  data?: Record<string, unknown>;
  type?: NotificationType;
  title?: string;
  message?: string;
  actionRequired?: boolean;
  dueDate?: Date;
  escalationLevel?: number;
  jobId?: number;
  clientId?: number;
  evaluationDefinitionId?: number;
  timeEntryId?: number;
  workflowAssignmentId?: number;
  link?: string;
}

const renderTemplateString = (template: string, data: Record<string, unknown>) =>
  template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key) => {
    const value = data[key];
    if (value === null || value === undefined) return "";
    return String(value);
  });

export class NotificationService {
  /**
   * List notifications for profile
   */
  static async listNotifications(options: ListOptions, auth: AuthContext) {
    const { page, pageSize, type, status } = options;
    const skip = (page - 1) * pageSize;

    const where: any = {
      profileId: auth.profileId,
    };

    if (type) where.type = type;
    if (status === 'read') where.isRead = true;
    if (status === 'unread') where.isRead = false;

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.notification.count({ where }),
    ]);

    return { notifications, total };
  }

  /**
   * List notifications across all profiles (HR/Admin only)
   */
  static async listAllNotifications(options: ListOptions) {
    const { page, pageSize, type, status } = options;
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (type) where.type = type;
    if (status === 'read') where.isRead = true;
    if (status === 'unread') where.isRead = false;

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
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
      recipientProfileId,
      type,
      title,
      message,
      actionRequired,
      dueDate,
      escalationLevel,
      jobId,
      clientId,
      evaluationDefinitionId,
      timeEntryId,
      workflowAssignmentId,
      link,
    } = input;

    // ✅ VERIFY RECIPIENT EXISTS
    const recipient = await prisma.profile.findUnique({
        where: { id: recipientProfileId },
    });

    if (!recipient) {
      throw {
        statusCode: 404,
        message: 'Recipient not found',
      };
    }

    const notification = await prisma.notification.create({
      data: {
        profile: { connect: { id: recipientProfileId } },
        type,
        title,
        message,
        actionRequired: actionRequired ?? false,
        dueDate: dueDate ?? null,
        escalationLevel: escalationLevel ?? 1,
        jobId: jobId ?? null,
        clientId: clientId ?? null,
        evaluationDefinitionId: evaluationDefinitionId ?? null,
        timeEntryId: timeEntryId ?? null,
        workflowAssignmentId: workflowAssignmentId ?? null,
        link: link ?? null,
      },
    });

    try {
      websocketService.notifyUser(String(recipientProfileId), {
        id: notification.id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        actionRequired: notification.actionRequired,
        link: notification.link,
        isRead: notification.isRead,
      });
    } catch {
      // Do not fail notification creation if real-time delivery is unavailable.
    }

    return notification;
  }

  /**
   * Create notification from a template label (fallbacks to provided defaults)
   */
  static async createFromTemplate(input: TemplateNotificationInput, auth: AuthContext) {
    const template = await prisma.notificationTemplate.findFirst({
      where: { label: input.label, isActive: true },
      select: { title: true, message: true, type: true, actionRequired: true },
    });

    const data = input.data || {};
    const resolvedTitle = renderTemplateString(
      template?.title ?? input.title ?? "Notification",
      data
    );
    const resolvedMessage = renderTemplateString(
      template?.message ?? input.message ?? "",
      data
    );

    return this.createNotification(
      {
        recipientProfileId: input.recipientProfileId,
        type: template?.type ?? input.type ?? "info",
        title: resolvedTitle,
        message: resolvedMessage,
        actionRequired: template?.actionRequired ?? input.actionRequired ?? false,
        dueDate: input.dueDate,
        escalationLevel: input.escalationLevel,
        jobId: input.jobId,
        clientId: input.clientId,
        evaluationDefinitionId: input.evaluationDefinitionId,
        timeEntryId: input.timeEntryId,
        workflowAssignmentId: input.workflowAssignmentId,
        link: input.link,
      },
      auth
    );
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
    if (notification.profileId !== auth.profileId && auth.roleName !== 'admin') {
      throw {
        statusCode: 403,
        message: 'You can only update your own notifications',
      };
    }

    const updated = await prisma.notification.update({
      where: { id: notificationId },
      data: {
        isRead: true,
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
        profileId: auth.profileId,
        isRead: false,
      },
      data: {
        isRead: true,
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
        if (notification.profileId !== auth.profileId && auth.roleName !== 'admin') {
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
        profileId: auth.profileId,
        isRead: false,
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
        profileId: auth.profileId,
      },
    });

    return result;
  }

  /**
   * Send batch notifications
   */
  static async sendBatchNotifications(
    recipientProfileIds: number[],
    input: Omit<CreateNotificationInput, 'recipientProfileId'>,
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
      data: recipientProfileIds.map((id) => ({
        profileId: id,
        type: input.type,
        title: input.title,
        message: input.message,
        actionRequired: input.actionRequired ?? false,
        dueDate: input.dueDate ?? null,
        escalationLevel: input.escalationLevel ?? 1,
        jobId: input.jobId ?? null,
        clientId: input.clientId ?? null,
        evaluationDefinitionId: input.evaluationDefinitionId ?? null,
        timeEntryId: input.timeEntryId ?? null,
        workflowAssignmentId: input.workflowAssignmentId ?? null,
        link: input.link ?? null,
        isRead: false,
      })),
    });

    try {
      recipientProfileIds.forEach((recipientProfileId) => {
        websocketService.notifyUser(String(recipientProfileId), {
          type: input.type,
          title: input.title,
          message: input.message,
          actionRequired: input.actionRequired ?? false,
          link: input.link ?? null,
          isRead: false,
        });
      });
    } catch {
      // Do not fail batch creation if real-time delivery is unavailable.
    }

    return notifications;
  }
}
