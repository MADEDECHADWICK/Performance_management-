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

// PATCH /notifications/:notificationId/read
router.patch(
  '/:notificationId/read',
  authMiddleware,
  loadProfile,
  param('notificationId').isInt().toInt(),
  handleValidationErrors,
  NotificationController.markAsRead
);

// PATCH /notifications/read-all
router.patch(
  '/read-all',
  authMiddleware,
  loadProfile,
  NotificationController.markAllAsRead
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

// DELETE /notifications/all
router.delete(
  '/all',
  authMiddleware,
  loadProfile,
  requireModuleAccess('notifications', 'write'),
  NotificationController.deleteAllNotifications
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
