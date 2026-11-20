/**
 * Notifications Controller (Modernized - Phase 4)
 */

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { buildPrimaryRoleAuthContext } from '../auth/accessRoles';
import { NotificationService } from '../services/notifications.service';
import { successResponse, errorResponse, paginatedResponse } from '../utils/response';

const canonicalizeNotificationLink = (link?: string | null) => {
  const normalized = String(link || '').trim();
  if (!normalized) return null;

  if (/^\/(?:evaluation|complete-evaluation|evaluations)(?:\/|$)/.test(normalized)) {
    return null;
  }

  return normalized;
};

const canonicalizeNotification = <T extends { link?: string | null }>(notification: T): T => ({
  ...notification,
  link: canonicalizeNotificationLink(notification.link),
});

const buildAuthContext = (req: AuthRequest) => buildPrimaryRoleAuthContext(req);

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

      const auth = buildAuthContext(req);

      const roleName = auth.roleName?.toLowerCase() || '';
      const canViewAll = ['super_admin', 'hr'].includes(roleName);

      const result =
        scope === 'all' && canViewAll
          ? await NotificationService.listAllNotifications({ page, pageSize, type, status })
          : await NotificationService.listNotifications({ page, pageSize, type, status }, auth);

      res.json(
        paginatedResponse(
          result.notifications.map((notification) => canonicalizeNotification(notification)),
          result.total,
          page,
          pageSize
        )
      );
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
      const auth = buildAuthContext(req);

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
        eventType,
        priority,
        targetEntityType,
        targetEntityId,
        canonicalRoute,
        actions,
        requiredPermission,
        eventId,
        templateLabel,
        correlationId,
        deduplicationKey,
        relatedEntityType,
        relatedEntityId,
      } = req.body;

      const entityType = relatedEntityType;
      const entityId = relatedEntityId;

      const notification = await NotificationService.createNotification(
        {
          recipientProfileId,
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
          link: canonicalRoute ?? link,
          eventType,
          priority,
          targetEntityType: targetEntityType ?? entityType,
          targetEntityId: targetEntityId ?? entityId,
          canonicalRoute: canonicalRoute ?? link,
          actions,
          requiredPermission,
          eventId,
          templateLabel,
          correlationId,
          deduplicationKey,
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

      const auth = buildAuthContext(req);

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
      const auth = buildAuthContext(req);

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

      const auth = buildAuthContext(req);

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
      const auth = buildAuthContext(req);

      const result = await NotificationService.getUnreadCount(auth);

      res.json(successResponse(result, 'Unread count retrieved'));
    } catch (error: any) {
      res.status(error.statusCode || 500).json(
        errorResponse(error.message, error.statusCode || 500)
      );
    }
  }

  /**
   * POST /notifications/:notificationId/action
   * Execute notification action and auto-mark as read on success
   */
  static async executeAction(req: AuthRequest, res: Response): Promise<void> {
    try {
      const notificationId = Number(req.params.notificationId);
      const actionId = String(req.body?.actionId || "").trim();
      const payload =
        req.body && typeof req.body.payload === "object" && req.body.payload !== null
          ? req.body.payload
          : undefined;

      const auth = buildAuthContext(req);

      const result = await NotificationService.executeAction(
        notificationId,
        actionId,
        auth,
        payload
      );

      res.json(successResponse(result, "Notification action executed"));
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400)
      );
    }
  }

  /**
   * GET /notifications/ops-metrics
   * Operational delivery metrics (admin/HR)
   */
  static async getOperationalMetrics(req: AuthRequest, res: Response): Promise<void> {
    try {
      const days = req.query.days ? Number(req.query.days) : 7;
      const metrics = await NotificationService.getOperationalMetrics(days);
      res.json(successResponse(metrics, "Notification metrics retrieved"));
    } catch (error: any) {
      res.status(error.statusCode || 500).json(
        errorResponse(error.message, error.statusCode || 500)
      );
    }
  }

  /**
   * GET /notifications/preferences
   * Get caller notification preferences
   */
  static async getPreferences(req: AuthRequest, res: Response): Promise<void> {
    try {
      const auth = buildAuthContext(req);
      const result = await NotificationService.getPreferences(auth);
      res.json(successResponse(result, "Notification preferences retrieved"));
    } catch (error: any) {
      res.status(error.statusCode || 500).json(
        errorResponse(error.message, error.statusCode || 500)
      );
    }
  }

  /**
   * PUT /notifications/preferences
   * Update caller notification preferences
   */
  static async updatePreferences(req: AuthRequest, res: Response): Promise<void> {
    try {
      const auth = buildAuthContext(req);
      const result = await NotificationService.updatePreferences(req.body || {}, auth);
      res.json(successResponse(result, "Notification preferences updated"));
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400)
      );
    }
  }

  /**
   * GET /notifications/outbox/summary
   * Outbox processing summary
   */
  static async getOutboxSummary(_req: AuthRequest, res: Response): Promise<void> {
    try {
      const result = await NotificationService.getOutboxSummary();
      res.json(successResponse(result, "Notification outbox summary retrieved"));
    } catch (error: any) {
      res.status(error.statusCode || 500).json(
        errorResponse(error.message, error.statusCode || 500)
      );
    }
  }

  /**
   * POST /notifications/outbox/dead-letter/:notificationId/replay
   * Replay dead-letter notification delivery
   */
  static async replayDeadLetter(req: AuthRequest, res: Response): Promise<void> {
    try {
      const notificationId = Number(req.params.notificationId);
      const auth = buildAuthContext(req);
      const result = await NotificationService.replayDeadLetter(notificationId, auth);
      res.json(successResponse(result, "Dead-letter notification replay queued"));
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400)
      );
    }
  }

  /**
   * DELETE /notifications/all
   * Delete all notifications
   */
  static async deleteAllNotifications(req: AuthRequest, res: Response): Promise<void> {
    try {
      const auth = buildAuthContext(req);

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
        type,
        title,
        message,
        relatedEntityType,
        relatedEntityId,
        actionRequired,
        dueDate,
        escalationLevel,
        jobId,
        clientId,
        evaluationDefinitionId,
        timeEntryId,
        workflowAssignmentId,
        link,
        eventType,
        priority,
        targetEntityType,
        targetEntityId,
        canonicalRoute,
        actions,
        requiredPermission,
        eventId,
        templateLabel,
        correlationId,
        deduplicationKey,
      } = req.body;

      const auth = buildAuthContext(req);

      const recipients = recipientProfileIds ?? [];

      const entityType = relatedEntityType;
      const entityId = relatedEntityId;

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
          link: canonicalRoute ?? link,
          eventType,
          priority,
          targetEntityType: targetEntityType ?? entityType,
          targetEntityId: targetEntityId ?? entityId,
          canonicalRoute: canonicalRoute ?? link,
          actions,
          requiredPermission,
          eventId,
          templateLabel,
          correlationId,
          deduplicationKey,
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
