/**
 * Notifications Routes (Modernized - Phase 4)
 */

import { Router } from 'express';
import { NotificationController } from '../controllers/notifications.controller';
import { authMiddleware } from '../middleware/auth';
import { loadProfile } from '../middleware/loadProfile';
import { requireRole } from '../middleware/reqiureRole';
import { handleValidationErrors } from '../middleware/validate';
import { body, param, query } from 'express-validator';

const router = Router();

// ✅ VALIDATORS
const createNotificationValidators = [
  body('recipient_profile_id')
    .isInt()
    .withMessage('recipient_profile_id must be an integer'),
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
  body('related_entity_type')
    .optional()
    .isString()
    .isLength({ max: 50 }),
  body('related_entity_id')
    .optional()
    .isInt(),
];

const batchNotificationValidators = [
  body('recipient_profile_ids')
    .isArray({ min: 1 })
    .withMessage('recipient_profile_ids must be a non-empty array'),
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
  requireRole(['admin', 'manager']),
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
  param('notificationId').isInt().toInt(),
  handleValidationErrors,
  NotificationController.deleteNotification
);

// DELETE /notifications/all
router.delete(
  '/all',
  authMiddleware,
  loadProfile,
  NotificationController.deleteAllNotifications
);

// POST /notifications/batch
router.post(
  '/batch',
  authMiddleware,
  loadProfile,
  requireRole(['admin', 'manager']),
  ...batchNotificationValidators,
  handleValidationErrors,
  NotificationController.sendBatchNotifications
);

export default router;
