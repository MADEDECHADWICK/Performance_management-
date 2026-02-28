/**
 * Notifications Routes (Modernized - Phase 4)
 */

import { Router } from 'express';
import { NotificationController } from '../controllers/notifications.controller';
import { authMiddleware } from '../middleware/auth';
import { loadProfile } from '../middleware/loadProfile';
import { requireModuleAccess } from '../middleware/requireModuleAccess';
import { handleValidationErrors } from '../middleware/validate';
import { body, param, query } from 'express-validator';

const router = Router();

// ✅ VALIDATORS
const createNotificationValidators = [
  body().custom((_, { req }) => {
    const hasRecipient = Number.isFinite(Number(req.body?.recipientProfileId));
    if (!hasRecipient) {
      throw new Error('recipientProfileId is required');
    }
    return true;
  }),
  body('recipientProfileId')
    .optional()
    .isInt()
    .withMessage('recipientProfileId must be an integer'),
  body('type')
    .isString()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('type is required'),
  body('title')
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('title must be 1-100 characters'),
  body('message')
    .isString()
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('message must be 1-500 characters'),
  body('jobId').optional().isInt(),
  body('clientId').optional().isInt(),
  body('evaluationDefinitionId').optional().isInt(),
  body('timeEntryId').optional().isInt(),
  body('workflowAssignmentId').optional().isInt(),
  body('link').optional().isString().isLength({ max: 200 }),
  body('eventType').optional().isString().trim().isLength({ min: 1, max: 120 }),
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'critical'])
    .withMessage('priority must be one of: low, medium, high, critical'),
  body('targetEntityType').optional().isString().trim().isLength({ min: 1, max: 80 }),
  body('targetEntityId').optional().isInt(),
  body('canonicalRoute').optional().isString().isLength({ min: 1, max: 200 }),
  body('actions').optional().isArray(),
  body('requiredPermission').optional().isString().trim().isLength({ min: 1, max: 120 }),
  body('eventId').optional().isString().trim().isLength({ min: 1, max: 150 }),
  body('templateLabel').optional().isString().trim().isLength({ min: 1, max: 120 }),
  body('correlationId').optional().isString().trim().isLength({ min: 1, max: 150 }),
  body('deduplicationKey').optional().isString().trim().isLength({ min: 1, max: 200 }),
];

const batchNotificationValidators = [
  body().custom((_, { req }) => {
    const ids = req.body?.recipientProfileIds;
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new Error('recipientProfileIds must be a non-empty array');
    }
    return true;
  }),
  body('recipientProfileIds')
    .optional()
    .isArray({ min: 1 })
    .withMessage('recipientProfileIds must be a non-empty array'),
  body('type')
    .isString()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('type is required'),
  body('title')
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('title must be 1-100 characters'),
  body('message')
    .isString()
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('message must be 1-500 characters'),
  body('eventType').optional().isString().trim().isLength({ min: 1, max: 120 }),
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'critical'])
    .withMessage('priority must be one of: low, medium, high, critical'),
  body('targetEntityType').optional().isString().trim().isLength({ min: 1, max: 80 }),
  body('targetEntityId').optional().isInt(),
  body('canonicalRoute').optional().isString().isLength({ min: 1, max: 200 }),
  body('actions').optional().isArray(),
  body('requiredPermission').optional().isString().trim().isLength({ min: 1, max: 120 }),
  body('eventId').optional().isString().trim().isLength({ min: 1, max: 150 }),
  body('templateLabel').optional().isString().trim().isLength({ min: 1, max: 120 }),
  body('correlationId').optional().isString().trim().isLength({ min: 1, max: 150 }),
  body('deduplicationKey').optional().isString().trim().isLength({ min: 1, max: 200 }),
];

const listNotificationValidators = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .toInt(),
  query('pageSize')
    .optional()
    .isInt({ min: 1, max: 100 })
    .toInt(),
  query('type')
    .optional()
    .isString(),
  query('status')
    .optional()
    .isIn(['read', 'unread'])
    .withMessage('status must be read or unread'),
  query('scope')
    .optional()
    .isIn(['mine', 'all'])
    .withMessage('scope must be mine or all'),
  query('days')
    .optional()
    .isInt({ min: 1, max: 90 })
    .toInt(),
];

const actionExecutionValidators = [
  param('notificationId').isInt({ min: 1 }).toInt(),
  body('actionId')
    .isString()
    .trim()
    .isLength({ min: 1, max: 80 })
    .withMessage('actionId is required'),
  body('payload').optional().isObject(),
];

const preferenceValidators = [
  body('channels').optional().isObject(),
  body('channels.inApp').optional().isBoolean(),
  body('channels.email').optional().isBoolean(),
  body('channels.sms').optional().isBoolean(),
  body('channels.push').optional().isBoolean(),
  body('quietHours').optional().isObject(),
  body('quietHours.enabled').optional().isBoolean(),
  body('quietHours.start')
    .optional()
    .isString()
    .matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .withMessage('quietHours.start must be HH:mm'),
  body('quietHours.end')
    .optional()
    .isString()
    .matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .withMessage('quietHours.end must be HH:mm'),
  body('quietHours.timezone').optional().isString().trim().isLength({ min: 3, max: 60 }),
  body('digestMode')
    .optional()
    .isIn(['off', 'daily', 'weekly'])
    .withMessage('digestMode must be one of: off, daily, weekly'),
  body('severityThreshold')
    .optional()
    .isIn(['low', 'medium', 'high', 'critical'])
    .withMessage('severityThreshold must be one of: low, medium, high, critical'),
];

// ✅ ROUTES

// GET /notifications
router.get(
  '/',
  authMiddleware,
  loadProfile,
  ...listNotificationValidators,
  handleValidationErrors,
  NotificationController.listNotifications
);

// POST /notifications
router.post(
  '/',
  authMiddleware,
  loadProfile,
  requireModuleAccess('notifications', 'approve'),
  ...createNotificationValidators,
  handleValidationErrors,
  NotificationController.createNotification
);

// GET /notifications/unread-count
router.get(
  '/unread-count',
  authMiddleware,
  loadProfile,
  NotificationController.getUnreadCount
);

// GET /notifications/ops-metrics
router.get(
  '/ops-metrics',
  authMiddleware,
  loadProfile,
  requireModuleAccess('notifications', 'approve'),
  NotificationController.getOperationalMetrics
);

// GET /notifications/preferences
router.get(
  '/preferences',
  authMiddleware,
  loadProfile,
  NotificationController.getPreferences
);

// PUT /notifications/preferences
router.put(
  '/preferences',
  authMiddleware,
  loadProfile,
  ...preferenceValidators,
  handleValidationErrors,
  NotificationController.updatePreferences
);

// GET /notifications/outbox/summary
router.get(
  '/outbox/summary',
  authMiddleware,
  loadProfile,
  requireModuleAccess('notifications', 'approve'),
  NotificationController.getOutboxSummary
);

// POST /notifications/outbox/dead-letter/:notificationId/replay
router.post(
  '/outbox/dead-letter/:notificationId/replay',
  authMiddleware,
  loadProfile,
  requireModuleAccess('notifications', 'approve'),
  param('notificationId').isInt({ min: 1 }).toInt(),
  handleValidationErrors,
  NotificationController.replayDeadLetter
);

// PATCH /notifications/:notificationId/read
router.patch(
  '/:notificationId/read',
  authMiddleware,
  loadProfile,
  param('notificationId').isInt().toInt(),
  handleValidationErrors,
  NotificationController.markAsRead
);

// POST /notifications/:notificationId/action
router.post(
  '/:notificationId/action',
  authMiddleware,
  loadProfile,
  ...actionExecutionValidators,
  handleValidationErrors,
  NotificationController.executeAction
);

// PATCH /notifications/read-all
router.patch(
  '/read-all',
  authMiddleware,
  loadProfile,
  NotificationController.markAllAsRead
);

// DELETE /notifications/all
router.delete(
  '/all',
  authMiddleware,
  loadProfile,
  requireModuleAccess('notifications', 'write'),
  NotificationController.deleteAllNotifications
);

// DELETE /notifications/:notificationId
router.delete(
  '/:notificationId',
  authMiddleware,
  loadProfile,
  requireModuleAccess('notifications', 'write'),
  param('notificationId').isInt().toInt(),
  handleValidationErrors,
  NotificationController.deleteNotification
);

// POST /notifications/batch
router.post(
  '/batch',
  authMiddleware,
  loadProfile,
  requireModuleAccess('notifications', 'approve'),
  ...batchNotificationValidators,
  handleValidationErrors,
  NotificationController.sendBatchNotifications
);

export default router;
