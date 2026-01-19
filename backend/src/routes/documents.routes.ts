/**
 * Document Routes (Documents ONLY - Schema v2.1 aligned)
 */

import { Router } from "express";
import { DocumentController } from "../controllers/document.controller";
import { authenticated, withRoles, withDocumentAccess } from "../utils/middleware";
import { validateRequest, handleValidationErrors } from "../middleware/validate";
import {
  uploadDocumentValidators,
  verifyDocumentValidators,
  listDocumentsValidators,
} from "../validators/document.validators";


const router = Router();

/**
 * GET /documents
 */
router.get(
  "/",
  authenticated(),
  validateRequest(listDocumentsValidators),
  handleValidationErrors,
  DocumentController.listDocuments
);

/**
 * POST /documents
 */
router.post(
  "/",
  authenticated(),
  validateRequest(uploadDocumentValidators),
  handleValidationErrors,
  DocumentController.uploadDocument
);

/**
 * GET /documents/:documentId
 */
router.get(
  "/:documentId",
  withDocumentAccess(),
  DocumentController.getDocument
);

/**
 * DELETE /documents/:documentId
 */
router.delete(
  "/:documentId",
  withDocumentAccess(),
  DocumentController.deleteDocument
);

/**
 * PATCH /documents/:documentId/verify
 * Body: verificationStatus, rejectionReason?
 */
router.patch(
  "/:documentId/verify",
  withRoles("hr", "hr_manager", "admin", "super_admin"),
  validateRequest(verifyDocumentValidators),
  handleValidationErrors,
  DocumentController.verifyDocument
);



export default router;
