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
import { requirePartnerAccess, requirePartnerJobOwnership } from "../middleware/requirePartnerAccess";

import { requireDepartmentAccess, requireDepartmentEmployeeAccess } from "../middleware/requireDepartmentAccess";
import { validateTimeEntryBudget, requireBudgetApprovalIfNeeded } from "../middleware/validateTimeEntryBudget";

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
 */
export const withEvaluationAccess = (): RequestHandler[] => [
  ...authenticated(),
  requireEvaluationAccess,
];

/**
 * Document access (auth + profile + document access check)
 */
export const withDocumentAccess = (): RequestHandler[] => [
  ...authenticated(),
  requireDocumentAccess,
];

/**
 * Partner access (auth + profile + partner check)
 */
export const withPartnerAccess = (): RequestHandler[] => [
  ...authenticated(),
  requireRole("partner", "admin"),
  requirePartnerAccess,
];

/**
 * Partner job ownership (auth + profile + partner + job ownership)
 */
export const withPartnerJobOwnership = (): RequestHandler[] => [
  ...withPartnerAccess(),
  requirePartnerJobOwnership,
];

/**
 * Department access (auth + profile + department head check)
 */
export const withDepartmentAccess = (): RequestHandler[] => [
  ...authenticated(),
  requireRole("manager", "admin"),
  requireDepartmentAccess,
];

/**
 * Department employee access (auth + profile + dept employee check)
 */
export const withDepartmentEmployeeAccess = (): RequestHandler[] => [
  ...authenticated(),
  requireRole("manager", "admin"),
  requireDepartmentEmployeeAccess,
];

/**
 * Time entry with budget validation (auth + profile + budget check + approval if needed)
 */
export const withTimeEntryBudgetValidation = (): RequestHandler[] => [
  ...authenticated(),
  validateTimeEntryBudget,
  requireBudgetApprovalIfNeeded,
];

/**
 * Manager or admin only
 */
export const managerOrAdmin = (): RequestHandler[] => [
  ...withRoles("manager", "admin", "super_admin"),
];

/**
 * Partner, manager, or admin
 */
export const partnerManagerOrAdmin = (): RequestHandler[] => [
  ...withRoles("partner", "manager", "admin", "super_admin"),
];

/**
 * Admin only
 */
export const adminOnly = (): RequestHandler[] => [
  ...withRoles("admin", "super_admin"),
];

/**
 * HR or admin
 */
export const hrOrAdmin = (): RequestHandler[] => [
  ...withRoles("hr", "hr_manager", "admin", "super_admin"),
];

/**
 * Employee (any authenticated user with profile)
 */
export const employeeOnly = (): RequestHandler[] => [
  ...authenticated(),
];
