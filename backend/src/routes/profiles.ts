/**
 * Profiles Routes (Modernized - Phase 4)
 */

import { Router } from 'express';
import { ProfileController } from '../controllers/profile.controller';
import { authMiddleware } from '../middleware/auth';
import { loadProfile } from '../middleware/loadProfile';
import { requireModuleAccess } from '../middleware/requireModuleAccess';
import { handleValidationErrors } from '../middleware/validate';
import { body, param, query } from 'express-validator';

const router = Router();

// ✅ VALIDATORS
const updateProfileValidators = [
  body('firstName')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('firstName must be 1-50 characters'),
  body('lastName')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('lastName must be 1-50 characters'),
  body('phoneNumber')
    .optional()
    .isString()
    .isLength({ min: 10, max: 20 })
    .withMessage('phoneNumber must be 10-20 characters'),
  body('bio')
    .optional()
    .isString()
    .isLength({ max: 500 })
    .withMessage('bio must not exceed 500 characters'),
  body('profilePicture')
    .optional()
    .isURL()
    .withMessage('profilePicture must be valid URL'),
  body('positionTitle')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 100 })
    .withMessage('positionTitle must not exceed 100 characters'),
  body('hireDate')
    .optional({ nullable: true })
    .isISO8601()
    .withMessage('hireDate must be a valid ISO date'),
  body('departmentId')
    .optional({ nullable: true })
    .isInt({ min: 1 })
    .toInt()
    .withMessage('departmentId must be a positive integer'),
  body('managerId')
    .optional({ nullable: true })
    .isInt({ min: 1 })
    .toInt()
    .withMessage('managerId must be a positive integer'),
  body('status')
    .optional()
    .isIn(['active', 'inactive', 'separated'])
    .withMessage('status must be one of: active, inactive, separated'),
  body('separationDate')
    .optional({ nullable: true })
    .isISO8601()
    .withMessage('separationDate must be a valid ISO date'),
  body('standardDailyHours')
    .optional()
    .isFloat({ min: 0.25, max: 24 })
    .withMessage('standardDailyHours must be between 0.25 and 24'),
  body('billableTargetPercent')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('billableTargetPercent must be between 0 and 100'),
  body('nonBillableTargetPercent')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('nonBillableTargetPercent must be between 0 and 100'),
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
    .isIn(['active', 'inactive', 'separated'])
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
  requireModuleAccess('users', 'approve'),
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

// DELETE /profiles/:profileId
router.delete(
  '/:profileId',
  authMiddleware,
  loadProfile,
  param('profileId').isInt().toInt(),
  handleValidationErrors,
  ProfileController.deleteProfile
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

