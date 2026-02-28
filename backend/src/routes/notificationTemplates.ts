import { Router } from "express";
import { authMiddleware } from "../middleware/auth";
import { loadProfile } from "../middleware/loadProfile";
import { requireModuleAccess } from "../middleware/requireModuleAccess";
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
  body("isActive").optional().isBoolean(),
];

router.get(
  "/",
  authMiddleware,
  loadProfile,
  requireModuleAccess("notifications", "admin"),
  query("isActive").optional().isBoolean().toBoolean(),
  handleValidationErrors,
  NotificationTemplateController.listTemplates
);

router.post(
  "/",
  authMiddleware,
  loadProfile,
  requireModuleAccess("notifications", "admin"),
  ...templateValidators,
  handleValidationErrors,
  NotificationTemplateController.createTemplate
);

router.patch(
  "/:templateId",
  authMiddleware,
  loadProfile,
  requireModuleAccess("notifications", "admin"),
  param("templateId").isInt().toInt(),
  handleValidationErrors,
  NotificationTemplateController.updateTemplate
);

router.delete(
  "/:templateId",
  authMiddleware,
  loadProfile,
  requireModuleAccess("notifications", "admin"),
  param("templateId").isInt().toInt(),
  handleValidationErrors,
  NotificationTemplateController.deleteTemplate
);

router.post(
  "/seed-defaults",
  authMiddleware,
  loadProfile,
  requireModuleAccess("notifications", "admin"),
  NotificationTemplateController.seedDefaults
);

export default router;
