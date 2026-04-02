import type { AuthRequest } from "../middleware/auth";
import { canonicalizeRoleName } from "./canonicalRoles";

const PRIMARY_ACCESS_ROLE_PRIORITY = [
  "super_admin",
  "hr",
  "gmp",
  "partner",
  "manager",
  "marketing",
  "finance",
  "employee",
] as const;

const normalizeRole = (value: unknown) => canonicalizeRoleName(value);

const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

export const resolveAccessRolesFromValues = (values: unknown[]) =>
  unique(values.map((value) => normalizeRole(value)));

export const resolveRequestAccessRoles = (
  req: Pick<AuthRequest, "userRoles" | "user">
) => {
  const roles =
    (Array.isArray(req.userRoles) && req.userRoles.length > 0
      ? req.userRoles
      : req.user?.authRoles) || [];
  return resolveAccessRolesFromValues(roles);
};

export const resolvePrimaryAccessRoleFromValues = (values: unknown[]) => {
  const roles = resolveAccessRolesFromValues(values);
  if (roles.length === 0) return undefined;

  const prioritized = PRIMARY_ACCESS_ROLE_PRIORITY.find((role) => roles.includes(role));
  return prioritized || roles[0];
};

export const resolveRequestPrimaryAccessRole = (
  req: Pick<AuthRequest, "userRoles" | "user">
) => resolvePrimaryAccessRoleFromValues(resolveRequestAccessRoles(req));

type PrimaryRoleAuthContext = {
  userId: number;
  profileId: number;
  roleName?: string;
};

export const buildPrimaryRoleAuthContext = (
  req: Pick<AuthRequest, "user" | "profile" | "userRoles">,
  overrides?: Partial<PrimaryRoleAuthContext>
): PrimaryRoleAuthContext => ({
  userId: overrides?.userId ?? Number(req.user?.userId || 0),
  profileId: overrides?.profileId ?? Number(req.profile?.id ?? req.user?.profileId ?? 0),
  roleName:
    overrides && Object.prototype.hasOwnProperty.call(overrides, "roleName")
      ? overrides.roleName
      : resolveRequestPrimaryAccessRole(req),
});
