/**
 * Document Routes (Documents ONLY - Schema v2.1 aligned)
 */

import { Router } from "express";
import { DocumentController } from "../controllers/document.controller";
import { authenticated, withRoles, withDocumentAccess } from "../utils/middleware";
import { validateRequest, handleValidationErrors } from "../middleware/validate";
import {
  uploadDocumentValidators,
  uploadDocumentFileValidators,
  requestDocumentValidators,
  verifyDocumentValidators,
  listDocumentsValidators,
} from "../validators/document.validators";
import { buildDiskUpload } from "../config/uploads";


const router = Router();
const upload = buildDiskUpload("documents");

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
 * POST /documents/upload
 * multipart/form-data with file
 */
router.post(
  "/upload",
  authenticated(),
  upload.single("file"),
  validateRequest(uploadDocumentFileValidators),
  handleValidationErrors,
  DocumentController.uploadDocument
);

/**
 * POST /documents/request
 * Request a targeted user to submit a required document.
 */
router.post(
  "/request",
  authenticated(),
  validateRequest(requestDocumentValidators),
  handleValidationErrors,
  DocumentController.requestDocument
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
  withRoles("hr", "super_admin"),
  validateRequest(verifyDocumentValidators),
  handleValidationErrors,
  DocumentController.verifyDocument
);



export default router;
