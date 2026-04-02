import { body, param, query } from "express-validator";

const REQUISITION_STATUSES = [
  "pending_manager_approval",
  "pending_partner_approval",
  "pending_gmp_approval",
  "pending_finance_approval",
  "approved",
  "declined",
  "cancelled",
];

export const typeIdParamValidator = [
  param("typeId").isInt({ min: 1 }).withMessage("Valid typeId is required"),
];

export const requestIdParamValidator = [
  param("requestId").isInt({ min: 1 }).withMessage("Valid requestId is required"),
];

export const paginationValidators = [
  query("page").optional().isInt({ min: 1 }).toInt(),
  query("pageSize").optional().isInt({ min: 1, max: 100 }).toInt(),
];

export const listRequisitionRequestsValidators = [
  ...paginationValidators,
  query("status").optional().isIn(REQUISITION_STATUSES),
  query("sourceModule").optional().isString().trim().isLength({ min: 2, max: 60 }),
  query("requesterProfileId").optional().isInt({ min: 1 }).toInt(),
];

export const createRequisitionTypeValidators = [
  body("code").isString().trim().isLength({ min: 2, max: 40 }),
  body("name").isString().trim().isLength({ min: 2, max: 120 }),
  body("description").optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
  body("sourceModule").isString().trim().isLength({ min: 2, max: 60 }),
  body("isActive").optional().isBoolean(),
  body("requiresJob").optional().isBoolean(),
  body("requiresClient").optional().isBoolean(),
  body("requiresVendor").optional().isBoolean(),
  body("requiresDueDate").optional().isBoolean(),
  body("requiresAttachment").optional().isBoolean(),
  body("fieldSchema").optional(),
];

export const updateRequisitionTypeValidators = [
  ...typeIdParamValidator,
  body("code").optional().isString().trim().isLength({ min: 2, max: 40 }),
  body("name").optional().isString().trim().isLength({ min: 2, max: 120 }),
  body("description").optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
  body("sourceModule").optional().isString().trim().isLength({ min: 2, max: 60 }),
  body("isActive").optional().isBoolean(),
  body("requiresJob").optional().isBoolean(),
  body("requiresClient").optional().isBoolean(),
  body("requiresVendor").optional().isBoolean(),
  body("requiresDueDate").optional().isBoolean(),
  body("requiresAttachment").optional().isBoolean(),
  body("fieldSchema").optional(),
];

export const createRequisitionRequestValidators = [
  body("requisitionTypeId").isInt({ min: 1 }).toInt(),
  body("title").isString().trim().isLength({ min: 2, max: 180 }),
  body("justification").optional({ nullable: true }).isString().trim().isLength({ max: 4000 }),
  body("amount").isFloat({ gt: 0 }),
  body("amountBreakdown").optional({ nullable: true }).isArray(),
  body("amountBreakdown.*.label").optional().isString().trim().isLength({ min: 1, max: 180 }),
  body("amountBreakdown.*.amount").optional().isFloat({ gt: 0 }),
  body("amountBreakdown.*.notes").optional({ nullable: true }).isString().trim().isLength({ max: 1000 }),
  body("currency").optional().isString().trim().isLength({ min: 3, max: 8 }),
  body("quantity").optional({ nullable: true }).isFloat({ gt: 0 }),
  body("neededByDate").optional({ nullable: true }).isISO8601(),
  body("vendorName").optional({ nullable: true }).isString().trim().isLength({ max: 180 }),
  body("clientId").optional({ nullable: true }).isInt({ min: 1 }).toInt(),
  body("jobId").optional({ nullable: true }).isInt({ min: 1 }).toInt(),
  body("isClientRecoverable").optional().isBoolean(),
  body("taxImpactNotes").optional({ nullable: true }).isString().trim().isLength({ max: 2000 }),
  body("moduleData").optional({ nullable: true }).isObject(),
  body("attachmentDocumentIds").optional().isArray(),
  body("attachmentDocumentIds.*").optional().isInt({ min: 1 }),
];

export const cancelRequisitionRequestValidators = [
  ...requestIdParamValidator,
  body("reason").optional().isString().trim().isLength({ max: 1000 }),
  body("notes").optional().isString().trim().isLength({ max: 1000 }),
];

export const listApprovalsValidators = [
  ...paginationValidators,
  query("scope").optional().isIn(["mine", "all"]),
  query("status").optional().isIn(REQUISITION_STATUSES),
];

export const reviewRequisitionValidators = [
  ...requestIdParamValidator,
  body("notes").optional().isString().trim().isLength({ max: 1000 }),
  body("reason").optional().isString().trim().isLength({ max: 1000 }),
];

export const financeEditRequisitionValidators = [
  ...requestIdParamValidator,
  body("title").optional().isString().trim().isLength({ min: 2, max: 180 }),
  body("justification").optional({ nullable: true }).isString().trim().isLength({ max: 4000 }),
  body("amount").optional().isFloat({ gt: 0 }),
  body("amountBreakdown").optional({ nullable: true }).isArray(),
  body("amountBreakdown.*.label").optional().isString().trim().isLength({ min: 1, max: 180 }),
  body("amountBreakdown.*.amount").optional().isFloat({ gt: 0 }),
  body("amountBreakdown.*.notes").optional({ nullable: true }).isString().trim().isLength({ max: 1000 }),
  body("currency").optional().isString().trim().isLength({ min: 3, max: 8 }),
  body("quantity").optional({ nullable: true }).isFloat({ gt: 0 }),
  body("neededByDate").optional({ nullable: true }).isISO8601(),
  body("vendorName").optional({ nullable: true }).isString().trim().isLength({ max: 180 }),
  body("isClientRecoverable").optional().isBoolean(),
  body("taxImpactNotes").optional({ nullable: true }).isString().trim().isLength({ max: 2000 }),
  body("moduleData").optional({ nullable: true }).isObject(),
];

export const releaseRequisitionFundsValidators = [
  ...requestIdParamValidator,
  body("notes").optional().isString().trim().isLength({ max: 1000 }),
  body("releasedAt").optional({ nullable: true }).isISO8601(),
];

export const submitRequisitionAccountabilityValidators = [
  ...requestIdParamValidator,
  body("notes").optional().isString().trim().isLength({ max: 4000 }),
  body("attachmentDocumentIds").optional().isArray(),
  body("attachmentDocumentIds.*").optional().isInt({ min: 1 }),
];
