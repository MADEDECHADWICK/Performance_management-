/**
 * Profiles Routes (Modernized - Phase 4)
 */

import { Router } from 'express';
import { ProfileController } from '../controllers/profile.controller';
import { authMiddleware } from '../middleware/auth';
import { loadProfile } from '../middleware/loadProfile';
import { requireRole } from '../middleware/reqiureRole';
import { handleValidationErrors } from '../middleware/validate';
import { body, param, query } from 'express-validator';

const router = Router();

// ✅ VALIDATORS
const updateProfileValidators = [
  body('first_name')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('first_name must be 1-50 characters'),
  body('last_name')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('last_name must be 1-50 characters'),
  body('phone_number')
    .optional()
    .isString()
    .isLength({ min: 10, max: 20 })
    .withMessage('phone_number must be 10-20 characters'),
  body('bio')
    .optional()
    .isString()
    .isLength({ max: 500 })
    .withMessage('bio must not exceed 500 characters'),
  body('avatar_url')
    .optional()
    .isURL()
    .withMessage('avatar_url must be valid URL'),
];

const listProfileValidators = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .toInt(),
  query('pageSize')
    .optional()
    .isInt({ min: 1, max: 100 })
    .toInt(),
  query('roleId')
    .optional()
    .isInt()
    .toInt(),
  query('status')
    .optional()
    .isIn(['active', 'inactive', 'suspended'])
    .withMessage('Invalid status'),
  query('search')
    .optional()
    .isString()
    .isLength({ min: 1, max: 100 }),
];

// ✅ ROUTES

// GET /profiles
router.get(
  '/',
  authMiddleware,
  loadProfile,
  requireRole('admin', 'manager'),
  ...listProfileValidators,
  handleValidationErrors,
  ProfileController.listProfiles
);

// GET /profiles/search
router.get(
  '/search',
  authMiddleware,
  loadProfile,
  ProfileController.searchProfiles
);

// GET /profiles/:profileId/stats
router.get(
  '/:profileId/stats',
  authMiddleware,
  loadProfile,
  param('profileId').isInt().toInt(),
  handleValidationErrors,
  ProfileController.getProfileStats
);

// GET /profiles/:profileId/team
router.get(
  '/:profileId/team',
  authMiddleware,
  loadProfile,
  param('profileId').isInt().toInt(),
  handleValidationErrors,
  ProfileController.getTeamMembers
);

// GET /profiles/:profileId
router.get(
  '/:profileId',
  authMiddleware,
  loadProfile,
  param('profileId').isInt().toInt(),
  handleValidationErrors,
  ProfileController.getProfile
);

// PATCH /profiles/:profileId
router.patch(
  '/:profileId',
  authMiddleware,
  loadProfile,
  param('profileId').isInt().toInt(),
  ...updateProfileValidators,
  handleValidationErrors,
  ProfileController.updateProfile
);

// GET /profiles/email/:email
router.get(
  '/email/:email',
  authMiddleware,
  loadProfile,
  param('email').isEmail(),
  handleValidationErrors,
  ProfileController.getProfileByEmail
);

export default router;

