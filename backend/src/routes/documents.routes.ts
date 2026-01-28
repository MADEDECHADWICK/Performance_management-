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
  verifyDocumentValidators,
  listDocumentsValidators,
} from "../validators/document.validators";
import multer from "multer";
import path from "path";
import fs from "fs";


const router = Router();
const uploadRoot = path.join(process.cwd(), "uploads", "documents");
if (!fs.existsSync(uploadRoot)) {
  fs.mkdirSync(uploadRoot, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadRoot);
  },
  filename: (_req, file, cb) => {
    const timestamp = Date.now();
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${timestamp}-${safeName}`);
  },
});

const upload = multer({ storage });

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
