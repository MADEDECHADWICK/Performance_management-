import { Router } from "express";
import { authMiddleware } from "../middleware/auth";
import { loadProfile } from "../middleware/loadProfile";
import { requireRole } from "../middleware/reqiureRole";
import { handleValidationErrors } from "../middleware/validate";
import { body, param, query } from "express-validator";
import { NotificationTemplateController } from "../controllers/notificationTemplates.controller";

const router = Router();

const templateValidators = [
  body("label").isString().trim().isLength({ min: 2, max: 80 }),
  body("title").isString().trim().isLength({ min: 2, max: 120 }),
  body("message").isString().trim().isLength({ min: 2, max: 500 }),
  body("type").isString().trim().isLength({ min: 2, max: 40 }),
  body("actionRequired").optional().isBoolean(),
  body("action_required").optional().isBoolean(),
  body("isActive").optional().isBoolean(),
  body("is_active").optional().isBoolean(),
];

router.get(
  "/",
  authMiddleware,
  loadProfile,
  requireRole("admin", "hr", "hr_manager", "super_admin"),
  query("is_active").optional().isBoolean().toBoolean(),
  handleValidationErrors,
  NotificationTemplateController.listTemplates
);

router.post(
  "/",
  authMiddleware,
  loadProfile,
  requireRole("admin", "hr", "hr_manager", "super_admin"),
  ...templateValidators,
  handleValidationErrors,
  NotificationTemplateController.createTemplate
);

router.patch(
  "/:templateId",
  authMiddleware,
  loadProfile,
  requireRole("admin", "hr", "hr_manager", "super_admin"),
  param("templateId").isInt().toInt(),
  handleValidationErrors,
  NotificationTemplateController.updateTemplate
);

router.delete(
  "/:templateId",
  authMiddleware,
  loadProfile,
  requireRole("admin", "hr", "hr_manager", "super_admin"),
  param("templateId").isInt().toInt(),
  handleValidationErrors,
  NotificationTemplateController.deleteTemplate
);

router.post(
  "/seed-defaults",
  authMiddleware,
  loadProfile,
  requireRole("admin", "hr", "hr_manager", "super_admin"),
  NotificationTemplateController.seedDefaults
);

export default router;
