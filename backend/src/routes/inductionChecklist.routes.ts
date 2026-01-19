import { Router } from "express";
import { authenticated, withRoles } from "../utils/middleware";
import { validateRequest, handleValidationErrors } from "../middleware/validate";
import { InductionChecklistController } from "../controllers/inductionChecklist.controller";
import {
  createInductionChecklistValidators,
  getInductionChecklistValidators,
  completeInductionItemValidators,
} from "../validators/inductionChecklist.validators.js";

const router = Router();

/**
 * POST /induction-checklists (HR/Admin)
 */
router.post(
  "/",
  withRoles("hr", "hr_manager", "admin", "super_admin"),
  validateRequest(createInductionChecklistValidators),
  handleValidationErrors,
  InductionChecklistController.create
);

/**
 * GET /induction-checklists/:checklistId
 */
router.get(
  "/:checklistId",
  authenticated(),
  validateRequest(getInductionChecklistValidators),
  handleValidationErrors,
  InductionChecklistController.getById
);

/**
 * PATCH /induction-checklists/:checklistId/items/:itemId/complete
 */
router.patch(
  "/:checklistId/items/:itemId/complete",
  authenticated(),
  validateRequest(completeInductionItemValidators),
  handleValidationErrors,
  InductionChecklistController.completeItem
);

export default router;
