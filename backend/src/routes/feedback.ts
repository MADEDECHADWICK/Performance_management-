/**
 * Feedback Routes (Modernized - Phase 4)
 */

import { Router } from 'express';
import { FeedbackController } from '../controllers/feedback.controller';
import { authMiddleware } from '../middleware/auth';
import { loadProfile } from '../middleware/loadProfile';
import { requireRole } from '../middleware/reqiureRole';
import { handleValidationErrors } from '../middleware/validate';
import { body, param, query } from 'express-validator';

const router = Router();

// ✅ VALIDATORS
const createFeedbackValidators = [
  body('recipient_profile_id')
    .isInt()
    .withMessage('recipient_profile_id must be an integer'),
  body('title')
    .isString()
    .trim()
    .isLength({ min: 5, max: 100 })
    .withMessage('title must be 5-100 characters'),
  body('content')
    .isString()
    .trim()
    .isLength({ min: 10, max: 2000 })
    .withMessage('content must be 10-2000 characters'),
  body('type')
    .optional()
    .isString()
    .isIn(['general', 'praise', 'improvement', 'suggestion'])
    .withMessage('Invalid feedback type'),
  body('is_anonymous')
    .optional()
    .isBoolean()
    .withMessage('is_anonymous must be boolean'),
];

const updateStatusValidators = [
  param('feedbackId').isInt().toInt(),
  body('status')
    .isString()
    .isIn(['pending', 'reviewed', 'resolved', 'archived'])
    .withMessage('Invalid status'),
];

const listFeedbackValidators = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('pageSize').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('type').optional().isString(),
  query('status')
    .optional()
    .isIn(['pending', 'reviewed', 'resolved', 'archived']),
  query('recipientId').optional().isInt().toInt(),
];

// ✅ ROUTES

// GET /feedback
router.get(
  '/',
  authMiddleware,
  loadProfile,
  ...listFeedbackValidators,
  handleValidationErrors,
  FeedbackController.listFeedback
);

// POST /feedback
router.post(
  '/',
  authMiddleware,
  loadProfile,
  ...createFeedbackValidators,
  handleValidationErrors,
  FeedbackController.createFeedback
);

// GET /feedback/:feedbackId
router.get(
  '/:feedbackId',
  authMiddleware,
  loadProfile,
  param('feedbackId').isInt().toInt(),
  handleValidationErrors,
  FeedbackController.getFeedback
);

// PATCH /feedback/:feedbackId/status
router.patch(
  '/:feedbackId/status',
  authMiddleware,
  loadProfile,
  requireRole('admin'),
  ...updateStatusValidators,
  handleValidationErrors,
  FeedbackController.updateFeedbackStatus
);

// GET /feedback/:profileId/analytics
router.get(
  '/:profileId/analytics',
  authMiddleware,
  loadProfile,
  param('profileId').isInt().toInt(),
  handleValidationErrors,
  FeedbackController.getFeedbackAnalytics
);

// DELETE /feedback/:feedbackId
router.delete(
  '/:feedbackId',
  authMiddleware,
  loadProfile,
  param('feedbackId').isInt().toInt(),
  handleValidationErrors,
  FeedbackController.deleteFeedback
);

export default router;
