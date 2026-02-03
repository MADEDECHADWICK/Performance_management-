/**
 * Notifications Controller (Modernized - Phase 4)
 */

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { NotificationService } from '../services/notifications.service';
import { successResponse, errorResponse, paginatedResponse } from '../utils/response';

export class NotificationController {
  /**
   * GET /notifications
   * List notifications with pagination
   */
  static async listNotifications(req: AuthRequest, res: Response): Promise<void> {
    try {
      const page = Number(req.query.page) || 1;
      const pageSize = Number(req.query.pageSize) || 10;
      const type = (req.query.type as string) || undefined;
      const rawStatus = req.query.status as string | undefined;
      const status =
        rawStatus === 'read' || rawStatus === 'unread' ? rawStatus : undefined;
      const scope = (req.query.scope as string) || 'mine';

      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const roleName = auth.roleName?.toLowerCase() || '';
      const canViewAll = ['admin', 'super_admin', 'hr', 'hr_manager'].includes(roleName);

      const result =
        scope === 'all' && canViewAll
          ? await NotificationService.listAllNotifications({ page, pageSize, type, status })
          : await NotificationService.listNotifications({ page, pageSize, type, status }, auth);

      res.json(paginatedResponse(result.notifications, result.total, page, pageSize));
    } catch (error: any) {
      res.status(error.statusCode || 500).json(
        errorResponse(error.message, error.statusCode || 500)
      );
    }
  }

  /**
   * POST /notifications
   * Create notification
   */
  static async createNotification(req: AuthRequest, res: Response): Promise<void> {
    try {
      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const {
        recipientProfileId,
        recipient_profile_id,
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
        relatedEntityType,
        related_entity_type,
        relatedEntityId,
        related_entity_id,
      } = req.body;

      const entityType = relatedEntityType ?? related_entity_type;
      const entityId = relatedEntityId ?? related_entity_id;

      const notification = await NotificationService.createNotification(
        {
          recipientProfileId: recipientProfileId ?? recipient_profile_id,
          type,
          title,
          message,
          actionRequired,
          dueDate,
          escalationLevel,
          jobId: jobId ?? (entityType === 'Job' ? entityId : undefined),
          clientId: clientId ?? (entityType === 'Client' ? entityId : undefined),
          evaluationDefinitionId,
          timeEntryId,
          workflowAssignmentId,
          link,
        },
        auth
      );

      res.status(201).json(
        successResponse(notification, 'Notification created', 201)
      );
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400)
      );
    }
  }

  /**
   * PATCH /notifications/:notificationId/read
   * Mark notification as read
   */
  static async markAsRead(req: AuthRequest, res: Response): Promise<void> {
    try {
      const notificationId = Number(req.params.notificationId);

      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const notification = await NotificationService.markAsRead(
        notificationId,
        auth
      );

      res.json(successResponse(notification, 'Notification marked as read'));
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400)
      );
    }
  }

  /**
   * PATCH /notifications/read-all
   * Mark all notifications as read
   */
  static async markAllAsRead(req: AuthRequest, res: Response): Promise<void> {
    try {
      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const result = await NotificationService.markAllAsRead(auth);

      res.json(successResponse(result, 'All notifications marked as read'));
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400)
      );
    }
  }

  /**
   * DELETE /notifications/:notificationId
   * Delete notification
   */
  static async deleteNotification(req: AuthRequest, res: Response): Promise<void> {
    try {
      const notificationId = Number(req.params.notificationId);

      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      await NotificationService.deleteNotification(notificationId, auth);

      res.json(successResponse(null, 'Notification deleted'));
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400)
      );
    }
  }

  /**
   * GET /notifications/unread-count
   * Get unread notification count
   */
  static async getUnreadCount(req: AuthRequest, res: Response): Promise<void> {
    try {
      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const result = await NotificationService.getUnreadCount(auth);

      res.json(successResponse(result, 'Unread count retrieved'));
    } catch (error: any) {
      res.status(error.statusCode || 500).json(
        errorResponse(error.message, error.statusCode || 500)
      );
    }
  }

  /**
   * DELETE /notifications/all
   * Delete all notifications
   */
  static async deleteAllNotifications(req: AuthRequest, res: Response): Promise<void> {
    try {
      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const result = await NotificationService.deleteAllNotifications(auth);

      res.json(successResponse(result, 'All notifications deleted'));
    } catch (error: any) {
      res.status(error.statusCode || 500).json(
        errorResponse(error.message, error.statusCode || 500)
      );
    }
  }

  /**
   * POST /notifications/batch
   * Send batch notifications
   */
  static async sendBatchNotifications(req: AuthRequest, res: Response): Promise<void> {
    try {
      const {
        recipientProfileIds,
        recipient_profile_ids,
        type,
        title,
        message,
        relatedEntityType,
        related_entity_type,
        relatedEntityId,
        related_entity_id,
        actionRequired,
        dueDate,
        escalationLevel,
        jobId,
        clientId,
        evaluationDefinitionId,
        timeEntryId,
        workflowAssignmentId,
        link,
      } = req.body;

      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const recipients = recipientProfileIds ?? recipient_profile_ids ?? [];

      const entityType = relatedEntityType ?? related_entity_type;
      const entityId = relatedEntityId ?? related_entity_id;

      const mappedJobId = jobId ?? (entityType === 'Job' ? entityId : undefined);
      const mappedClientId = clientId ?? (entityType === 'Client' ? entityId : undefined);

      const result = await NotificationService.sendBatchNotifications(
        recipients,
        {
          type,
          title,
          message,
          actionRequired,
          dueDate,
          escalationLevel,
          jobId: mappedJobId,
          clientId: mappedClientId,
          evaluationDefinitionId,
          timeEntryId,
          workflowAssignmentId,
          link,
        },
        auth
      );

      res.status(201).json(
        successResponse(result, `Notifications sent to ${recipients.length} recipients`, 201)
      );
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400)
      );
    }
  }
}
