import { Router } from "express";
import { authenticated, withRoles } from "../utils/middleware";
import { validateRequest, handleValidationErrors } from "../middleware/validate";
import { InductionChecklistController } from "../controllers/inductionChecklist.controller";
import {
  createInductionChecklistValidators,
  getInductionChecklistValidators,
  completeInductionItemValidators,
  attachInductionItemDocumentValidators,
  acknowledgeInductionChecklistValidators,
  hrSignoffInductionChecklistValidators,
  updateInductionItemCommentsValidators,
} from "../validators/inductionChecklist.validators";

const router = Router();

router.get(
  "/template/default",
  authenticated(),
  InductionChecklistController.getDefaultTemplate
);

/**
 * POST /induction-checklists (HR/Admin)
 */
router.post(
  "/",
  withRoles("hr", "super_admin"),
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

/**
 * PATCH /induction-checklists/:checklistId/items/:itemId/document
 */
router.patch(
  "/:checklistId/items/:itemId/document",
  authenticated(),
  validateRequest(attachInductionItemDocumentValidators),
  handleValidationErrors,
  InductionChecklistController.attachDocument
);

router.patch(
  "/:checklistId/items/:itemId/comments",
  authenticated(),
  validateRequest(updateInductionItemCommentsValidators),
  handleValidationErrors,
  InductionChecklistController.updateItemComments
);

router.post(
  "/:checklistId/acknowledge",
  authenticated(),
  validateRequest(acknowledgeInductionChecklistValidators),
  handleValidationErrors,
  InductionChecklistController.acknowledge
);

router.post(
  "/:checklistId/hr-signoff",
  withRoles("hr", "super_admin"),
  validateRequest(hrSignoffInductionChecklistValidators),
  handleValidationErrors,
  InductionChecklistController.hrSignoff
);

/**
 * POST /induction-checklists/:checklistId/remind (HR/Admin)
 */
router.post(
  "/:checklistId/remind",
  withRoles("hr", "super_admin"),
  validateRequest(getInductionChecklistValidators),
  handleValidationErrors,
  InductionChecklistController.remind
);

export default router;
