/**
 * Reusable middleware composition helpers
 * Combine common middleware chains to avoid repetition
 */

import { RequestHandler } from "express";

import { authMiddleware } from "../middleware/auth";
import { loadProfile } from "../middleware/loadProfile";

import { requireRole } from "../middleware/reqiureRole";
import { requirePermission } from "../middleware/requirePermission";

import { requireJobAccess } from "../middleware/requireJobAccess";
import { requireTimeEntryAccess } from "../middleware/requireTimeEntryAccess";
import { requireEvaluationAccess } from "../middleware/requireEvaluationAccess";
import { requireDocumentAccess } from "../middleware/requireDocumentAccess";

import { requirePartnerAccess } from "../middleware/requirePartnerAccess";
import { requireDepartmentAccess } from "../middleware/requireDepartmentAccess";

import { validateTimeEntryBudget } from "../middleware/validateTimeEntryBudget";

/**
 * Authenticated user (auth + profile loaded)
 */
export const authenticated = (): RequestHandler[] => [
  authMiddleware,
  loadProfile,
];

/**
 * Role-based access (auth + profile + roles)
 */
export const withRoles = (...roles: string[]): RequestHandler[] => [
  ...authenticated(),
  requireRole(...roles),
];

/**
 * Permission-based access (auth + profile + permissions)
 */
export const withPermissions = (...permissions: string[]): RequestHandler[] => [
  ...authenticated(),
  requirePermission(...permissions),
];

/**
 * Job access (auth + profile + job access check)
 */
export const withJobAccess = (): RequestHandler[] => [
  ...authenticated(),
  requireJobAccess,
];

/**
 * Time entry access (auth + profile + time entry access check)
 */
export const withTimeEntryAccess = (): RequestHandler[] => [
  ...authenticated(),
  requireTimeEntryAccess,
];

/**
 * Evaluation access (auth + profile + evaluation access check)
 *
 * NOTE:
 * Your requireEvaluationAccess supports a mode ("view" | "submit") but
 * this helper defaults to "view". If you need submit mode, make a new helper.
 */
export const withEvaluationAccess = (): RequestHandler[] => [
  ...authenticated(),
  requireEvaluationAccess(),
];

/**
 * Document access (auth + profile + document access check)
 */
export const withDocumentAccess = (): RequestHandler[] => [
  ...authenticated(),
  requireDocumentAccess,
];

/**
 * Partner access (auth + profile + partner/admin check)
 *
 * NOTE:
 * requirePartnerAccess already enforces partner/admin access.
 * If you want strict role-gating before DB checks, wrap it with withRoles("partner","admin","super_admin").
 */
export const withPartnerAccess = (): RequestHandler[] => [
  ...authenticated(),
  requirePartnerAccess,
];

/**
 * Department access (auth + profile + department scope check)
 *
 * NOTE:
 * requireDepartmentAccess already handles Admin/SuperAdmin/HR internally.
 * If you want extra strictness (e.g., only manager/admin), add requireRole(...) here.
 */
export const withDepartmentAccess = (): RequestHandler[] => [
  ...authenticated(),
  requireDepartmentAccess,
];

/**
 * Time entry with budget validation
 * Use this when creating/updating entries where hours changes.
 */
export const withTimeEntryBudgetValidation = (): RequestHandler[] => [
  ...authenticated(),
  validateTimeEntryBudget,
];

/**
 * Convenience bundles
 */
export const managerOrAdmin = (): RequestHandler[] => [
  ...withRoles("manager", "admin", "super_admin"),
];

export const partnerManagerOrAdmin = (): RequestHandler[] => [
  ...withRoles("partner", "manager", "admin", "super_admin"),
];

export const adminOnly = (): RequestHandler[] => [
  ...withRoles("admin", "super_admin"),
];

export const hrOrAdmin = (): RequestHandler[] => [
  ...withRoles("hr", "hr_manager", "admin", "super_admin"),
];

export const employeeOnly = (): RequestHandler[] => [
  ...authenticated(),
];

/**
 * Pagination helper
 */
export function getPaginationParams(req: any) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 10));
  const skip = (page - 1) * pageSize;

  return { page, pageSize, skip };
}
