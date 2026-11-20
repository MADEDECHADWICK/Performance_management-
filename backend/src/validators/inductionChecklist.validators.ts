import { body, param } from "express-validator";

const CHECKLIST_ITEM_TYPES = [
  "task",
  "document_upload",
  "video_watch",
  "policy_link",
  "external_link",
];

const CHECKLIST_OWNER_ROLES = ["employee", "hr"];

export const createInductionChecklistValidators = [
  body("onboardingCaseId").optional().isInt({ min: 1 }),
  body("employeeProfileId").isInt({ min: 1 }),
  body("checklistName").optional().isString().trim().isLength({ min: 3, max: 255 }),
  body("dueDate").optional().isISO8601(),

  body("items").isArray({ min: 1 }).withMessage("items must be a non-empty array"),

  body("items.*.itemName")
    .isString()
    .trim()
    .isLength({ min: 2, max: 255 }),

  body("items.*.description").optional().isString(),
  body("items.*.orderIndex").optional().isInt({ min: 0 }),
  body("items.*.sectionKey").optional().isString().trim().isLength({ min: 1, max: 64 }),
  body("items.*.sectionLabel").optional().isString().trim().isLength({ min: 1, max: 120 }),
  body("items.*.ownerRole").optional().isIn(CHECKLIST_OWNER_ROLES),
  body("items.*.comments").optional().isString(),
  body("items.*.requiresDocument").optional().isBoolean(),
  body("items.*.documentId").optional().isInt({ min: 1 }),
  body("items.*.itemType").optional().isIn(CHECKLIST_ITEM_TYPES),
  body("items.*.resourceUrl")
    .optional()
    .custom((value) => {
      if (typeof value !== "string") {
        throw new Error("resourceUrl must be a string");
      }
      const trimmed = value.trim();
      if (!trimmed) return true;
      if (trimmed.startsWith("/")) return true;
      try {
        // Accept absolute links for policy/video/external resources.
        const parsed = new URL(trimmed);
        if (parsed.protocol === "http:" || parsed.protocol === "https:") return true;
      } catch {
        // noop
      }
      throw new Error("resourceUrl must be an http(s) URL or app-relative path");
    }),
];

export const getInductionChecklistValidators = [
  param("checklistId").isInt({ min: 1 }),
];

export const completeInductionItemValidators = [
  param("checklistId").isInt({ min: 1 }),
  param("itemId").isInt({ min: 1 }),
];

export const attachInductionItemDocumentValidators = [
  param("checklistId").isInt({ min: 1 }),
  param("itemId").isInt({ min: 1 }),
  body("documentId").isInt({ min: 1 }),
];

export const acknowledgeInductionChecklistValidators = [
  param("checklistId").isInt({ min: 1 }),
];

export const hrSignoffInductionChecklistValidators = [
  param("checklistId").isInt({ min: 1 }),
  body("notes").optional().isString(),
];

export const updateInductionItemCommentsValidators = [
  param("checklistId").isInt({ min: 1 }),
  param("itemId").isInt({ min: 1 }),
  body("comments").optional().isString(),
  body("note").optional().isString(),
];
