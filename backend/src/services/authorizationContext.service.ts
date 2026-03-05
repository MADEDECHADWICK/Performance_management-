import prisma from "../prisma";
import { AuthRequest } from "../middleware/auth";
import { RoleModulePolicyInput } from "./moduleAccess.service";
import { canonicalizeRoleName } from "../auth/canonicalRoles";

type AuthorizationContext = {
  activeRolePolicies: RoleModulePolicyInput[];
  moduleRolePolicies: RoleModulePolicyInput[];
  activeRoles: string[];
  permissionKeys: string[];
  hasOverrideRole: boolean;
  overrideRoleName: string;
};

const normalize = (value: string) => canonicalizeRoleName(value);

const getOverrideRoleName = (userId: number) => `user_override_${userId}`.toLowerCase();

const toRolePolicy = (row: {
  role: {
    name: string;
    permissions: Array<{ permission: { key: string } }>;
  };
}): RoleModulePolicyInput => ({
  roleName: normalize(row.role.name),
  permissionKeys: row.role.permissions.map((permissionRow) => permissionRow.permission.key),
});

const toUniqueList = (items: string[]) => Array.from(new Set(items));

const withoutOverrideRole = (roles: string[], overrideRoleName: string) =>
  roles.filter((role) => role !== overrideRoleName);

export const ensureAuthorizationContext = async (
  req: AuthRequest
): Promise<AuthorizationContext> => {
  if (req.authorizationContext) {
    return req.authorizationContext;
  }

  if (!req.user?.userId) {
    const empty: AuthorizationContext = {
      activeRolePolicies: [],
      moduleRolePolicies: [],
      activeRoles: [],
      permissionKeys: [],
      hasOverrideRole: false,
      overrideRoleName: "",
    };
    req.authorizationContext = empty;
    req.userRoles = [];
    req.userPermissions = [];
    req.userRolePolicies = [];
    return empty;
  }

  const rows = await prisma.userAuthRole.findMany({
    where: { userId: req.user.userId },
    include: {
      role: {
        select: {
          name: true,
          isActive: true,
          permissions: {
            select: {
              permission: { select: { key: true } },
            },
          },
        },
      },
    },
  });

  const activeRows = rows.filter((row) => row.role.isActive);
  const overrideRoleName = getOverrideRoleName(req.user.userId);
  const overrideRow = activeRows.find((row) => normalize(row.role.name) === overrideRoleName);

  const activeRolePolicies = activeRows.map(toRolePolicy);
  const moduleRolePolicies = overrideRow ? [toRolePolicy(overrideRow)] : activeRolePolicies;

  const activeRoles = withoutOverrideRole(
    toUniqueList(activeRolePolicies.map((rolePolicy) => rolePolicy.roleName)),
    overrideRoleName
  );

  const permissionKeys = toUniqueList(
    activeRolePolicies.flatMap((rolePolicy) => rolePolicy.permissionKeys || [])
  );

  const context: AuthorizationContext = {
    activeRolePolicies,
    moduleRolePolicies,
    activeRoles,
    permissionKeys,
    hasOverrideRole: Boolean(overrideRow),
    overrideRoleName,
  };

  req.authorizationContext = context;
  req.userRoles = activeRoles;
  req.userPermissions = permissionKeys;
  req.userRolePolicies = moduleRolePolicies;

  return context;
};

export type { AuthorizationContext };
