import { Router } from "express";
import { validateRequest, handleValidationErrors } from "../middleware/validate";
import {
  listOffboardingCasesValidators,
  createOffboardingCaseValidators,
  getOffboardingCaseValidators,
  updateOffboardingCaseValidators,
  reactivateOffboardingCaseValidators,
} from "../validators/employeeOffboardingCase.validators";
import { EmployeeOffboardingCaseController } from "../controllers/employeeOffboardingCase.controller";
import { OffboardingChecklistController } from "../controllers/offboardingChecklist.controller";
import {
  listOffboardingItemsValidators,
  createOffboardingItemsValidators,
  completeOffboardingItemValidators,
  attachOffboardingItemDocumentValidators,
} from "../validators/offboardingChecklist.validators";

const router = Router();

router.get("/", validateRequest(listOffboardingCasesValidators), EmployeeOffboardingCaseController.list);
router.post("/", validateRequest(createOffboardingCaseValidators), EmployeeOffboardingCaseController.create);
router.get("/:caseId", validateRequest(getOffboardingCaseValidators), EmployeeOffboardingCaseController.getById);
router.patch("/:caseId", validateRequest(updateOffboardingCaseValidators), EmployeeOffboardingCaseController.update);
router.post(
  "/:caseId/reactivate",
  validateRequest(reactivateOffboardingCaseValidators),
  EmployeeOffboardingCaseController.reactivate
);

router.get(
  "/:caseId/items",
  validateRequest(listOffboardingItemsValidators),
  OffboardingChecklistController.list
);

router.post(
  "/:caseId/items",
  validateRequest(createOffboardingItemsValidators),
  OffboardingChecklistController.create
);

router.patch(
  "/:caseId/items/:itemId/complete",
  validateRequest(completeOffboardingItemValidators),
  OffboardingChecklistController.completeItem
);

router.post(
  "/:caseId/items/:itemId/document",
  validateRequest(attachOffboardingItemDocumentValidators),
  OffboardingChecklistController.attachDocument
);

export default router;
