/**
 * Document endpoint validators
 * Reusable validation chains for document operations
 */

import { body, param, query } from "express-validator";

/**
 * Validators for POST /documents - Upload document
 */
export const uploadDocumentValidators = [
  body("fileName")
    .isString()
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage("File name required (1-255 characters)"),

  body("filePath")
    .isString()
    .trim()
    .isLength({ min: 1 })
    .withMessage("File path required"),

  body("mimeType")
    .optional()
    .isString()
    .trim(),

  body("documentType")
    .isString()
    .trim()
    .isLength({ min: 1 })
    .withMessage("Document type required"),

  body("entityType")
    .isString()
    .trim()
    .matches(/^[A-Za-z][A-Za-z0-9_-]{1,80}$/)
    .withMessage("EntityType must be an identifier (letters, numbers, _ or -)"),

  body("entityId")
    .isInt({ min: 1 })
    .withMessage("Valid entityId (integer) required"),

  body("accessLevel")
    .optional()
    .isIn(["employee", "manager", "hr", "admin"])
    .withMessage("AccessLevel must be one of: employee, manager, hr, admin"),

  body("isRequired")
    .optional()
    .isBoolean()
    .withMessage("IsRequired must be a boolean"),

  body("description")
    .optional()
    .isString()
    .trim(),
];

/**
 * Validators for POST /documents/upload - Upload document with file
 */
export const uploadDocumentFileValidators = [
  body("documentType")
    .isString()
    .trim()
    .isLength({ min: 1 })
    .withMessage("Document type required"),

  body("entityType")
    .isString()
    .trim()
    .matches(/^[A-Za-z][A-Za-z0-9_-]{1,80}$/)
    .withMessage("EntityType must be an identifier (letters, numbers, _ or -)"),

  body("entityId")
    .isInt({ min: 1 })
    .withMessage("Valid entityId (integer) required"),

  body("accessLevel")
    .optional()
    .isIn(["employee", "manager", "hr", "admin"])
    .withMessage("AccessLevel must be one of: employee, manager, hr, admin"),

  body("isRequired")
    .optional()
    .isBoolean()
    .withMessage("IsRequired must be a boolean"),

  body("description")
    .optional()
    .isString()
    .trim(),
];

/**
 * Validators for GET /documents/:documentId - Get document
 */
export const getDocumentValidator = [
  param("documentId")
    .isInt({ min: 1 })
    .withMessage("Valid documentId (integer) required"),
];

/**
 * Validators for GET /documents - List documents
 */
export const listDocumentsValidators = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be >= 1"),

  query("pageSize")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Page size must be between 1-100"),

  query("entityType")
    .optional()
    .isString(),

  query("documentType")
    .optional()
    .isString(),

  query("verificationStatus")
    .optional()
    .isIn(["pending", "verified", "rejected"])
    .withMessage("VerificationStatus must be one of: pending, verified, rejected"),

  query("accessLevel")
    .optional()
    .isIn(["employee", "manager", "hr", "admin"])
    .withMessage("AccessLevel must be one of: employee, manager, hr, admin"),

  query("sortBy")
    .optional()
    .isIn(["createdAt", "fileName"])
    .withMessage("SortBy must be one of: createdAt, fileName"),

  query("sortOrder")
    .optional()
    .isIn(["asc", "desc"])
    .withMessage("SortOrder must be: asc or desc"),
];

/**
 * Validators for PATCH /documents/:documentId/verify - Verify document
 */
export const verifyDocumentValidators = [
  param("documentId")
    .isInt({ min: 1 })
    .withMessage("Valid documentId (integer) required"),

  body("verificationStatus")
    .isIn(["pending", "verified", "rejected"])
    .withMessage("verificationStatus must be one of: pending, verified, rejected"),

  body("rejectionReason")
    .if(body("verificationStatus").equals("rejected"))
    .isString()
    .trim()
    .isLength({ min: 5 })
    .withMessage("Rejection reason required if rejecting (minimum 5 characters)"),
];

/**
 * Validators for DELETE /documents/:documentId - Delete document
 */
export const deleteDocumentValidator = [
  param("documentId")
    .isInt({ min: 1 })
    .withMessage("Valid documentId (integer) required"),
];

/**
 * Validators for POST /onboarding - Submit onboarding
 */
export const submitOnboardingValidators = [
  body("clientName")
    .isString()
    .trim()
    .isLength({ min: 3, max: 255 })
    .withMessage("Client name required (3-255 characters)"),

  body("industry")
    .isString()
    .trim()
    .isLength({ min: 1 })
    .withMessage("Industry required"),

  body("contactPerson")
    .isString()
    .trim()
    .isLength({ min: 1 })
    .withMessage("Contact person required"),

  body("contactEmail")
    .isEmail()
    .withMessage("Valid email required"),

  body("contactPhone")
    .isString()
    .trim()
    .isLength({ min: 1 })
    .withMessage("Contact phone required"),

  body("location")
    .isString()
    .trim()
    .isLength({ min: 1 })
    .withMessage("Location required"),

  body("engagementLetterId")
    .isInt({ min: 1 })
    .withMessage("Valid engagementLetterId required"),

  body("departmentId")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Valid departmentId required if provided"),

  body("notes")
    .optional()
    .isString()
    .trim(),
];

/**
 * Validators for PATCH /onboarding/:onboardingId - Update onboarding status
 */
export const updateOnboardingStatusValidators = [
  param("onboardingId")
    .isInt({ min: 1 })
    .withMessage("Valid onboardingId (integer) required"),

  body("status")
    .isIn(["pending_hr_review", "approved", "rejected", "client_created", "job_created"])
    .withMessage("Status must be one of: pending_hr_review, approved, rejected, client_created, job_created"),

  body("notes")
    .optional()
    .isString()
    .trim(),
];

/**
 * Validators for GET /onboarding/:onboardingId
 */
export const getOnboardingValidator = [
  param("onboardingId")
    .isInt({ min: 1 })
    .withMessage("Valid onboardingId (integer) required"),
];

/**
 * Validators for POST /induction-checklist - Create induction checklist
 */
export const createInductionChecklistValidators = [
  body("employeeProfileId")
    .isInt({ min: 1 })
    .withMessage("Valid employeeProfileId required"),

  body("onboardingCaseId")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Valid onboardingCaseId required if provided"),

  body("checklistName")
    .optional()
    .isString()
    .trim(),

  body("dueDate")
    .optional()
    .isISO8601()
    .withMessage("Valid dueDate (ISO8601) required if provided"),

  body("items")
    .optional()
    .isArray()
    .withMessage("Items must be an array"),
];

/**
 * Validators for PATCH /induction-checklist/:checklistId/items/:itemId - Complete checklist item
 */
export const completeChecklistItemValidators = [
  param("checklistId")
    .isInt({ min: 1 })
    .withMessage("Valid checklistId (integer) required"),

  param("itemId")
    .isInt({ min: 1 })
    .withMessage("Valid itemId (integer) required"),

  body("isCompleted")
    .isBoolean()
    .withMessage("IsCompleted must be a boolean"),

  body("documentId")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Valid documentId required if provided"),
];

/**
 * Validators for GET /induction-checklist/:checklistId
 */
export const getInductionChecklistValidator = [
  param("checklistId")
    .isInt({ min: 1 })
    .withMessage("Valid checklistId (integer) required"),
];
