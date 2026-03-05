//Role-base authorization
//Checks f user has required roles

import { Response, NextFunction } from "express";
import prisma from "../prisma";
import { AuthRequest } from "./auth";
import {
  ModuleAction,
  ModuleKey,
  hasModuleAccess,
  isModuleKey,
  methodToModuleAction,
} from "../services/moduleAccess.service";

const ADMIN_ROLES = new Set(["super_admin", "hr"]);
const SUPERVISORY_ROLES = new Set(["manager", "partner", "gmp"]);
const OPERATIONAL_ROLES = new Set(["employee", "associate", "intern", "marketing", "finance"]);

const inferModuleAction = (
  allowedRoles: string[],
  fallbackMethodAction: ModuleAction
): ModuleAction => {
  const normalizedRoles = allowedRoles.map((role) => role.toLowerCase());

  const adminOnly =
    normalizedRoles.length > 0 &&
    normalizedRoles.every((role) => ADMIN_ROLES.has(role));
  if (adminOnly) return "admin";

  const hasSupervisoryRole = normalizedRoles.some((role) => SUPERVISORY_ROLES.has(role));
  const hasOperationalRole = normalizedRoles.some((role) => OPERATIONAL_ROLES.has(role));
  if (hasSupervisoryRole && !hasOperationalRole) return "approve";

  return fallbackMethodAction;
};

const ensureRolePolicies = async (req: AuthRequest) => {
  if (req.userRolePolicies) {
    return req.userRolePolicies;
  }
  if (!req.user?.userId) return [];

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

  const rolePolicies = rows
    .filter((row) => row.role.isActive)
    .map((row) => ({
      roleName: row.role.name.toLowerCase(),
      permissionKeys: row.role.permissions.map((permissionRow) => permissionRow.permission.key),
    }));

  req.userRolePolicies = rolePolicies;
  req.userRoles = rolePolicies.map((rolePolicy) => rolePolicy.roleName);

  const permissionSet = new Set<string>();
  rolePolicies.forEach((rolePolicy) => {
    rolePolicy.permissionKeys.forEach((permissionKey) => permissionSet.add(permissionKey));
  });
  req.userPermissions = Array.from(permissionSet);

  return rolePolicies;
};

const applyUserOverridePrecedence = (
  rolePolicies: Array<{ roleName: string; permissionKeys?: string[] | null }>
) => {
  const overrides = rolePolicies.filter((policy) =>
    String(policy.roleName || "")
      .toLowerCase()
      .trim()
      .startsWith("user_override_")
  );
  return overrides.length > 0 ? overrides : rolePolicies;
};

export const requireRole = (...allowedRoles: string[]) => {
  const allowed = allowedRoles.map(r => r.toLowerCase());

  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.userId) {
        res.status(401).json({ error: "User not authenticated" });
        return;
      }

      const currentModuleKey = req.currentModuleAccess?.moduleKey;
      if (currentModuleKey && isModuleKey(currentModuleKey)) {
        const rolePolicies = applyUserOverridePrecedence(await ensureRolePolicies(req));
        const requiredAction = inferModuleAction(allowedRoles, methodToModuleAction(req.method));
        const allowedByModule = hasModuleAccess({
          moduleKey: currentModuleKey as ModuleKey,
          action: requiredAction,
          rolePolicies,
          roles: req.userRoles,
          permissionKeys: req.userPermissions,
        });

        if (!allowedByModule) {
          res.status(403).json({
            error: "Forbidden - insufficient module access",
            module: currentModuleKey,
            action: requiredAction,
          });
          return;
        }

        next();
        return;
      }

      // If already loaded earlier in the chain, reuse it
      if (req.userRoles?.length) {
        const roles = req.userRoles.map(r => r.toLowerCase());
        const ok = roles.some(r => allowed.includes(r));
        if (!ok) {
          res.status(403).json({ error: `Forbidden - Required roles: ${allowedRoles.join(", ")}` });
          return;
        }
        next();
        return;
      }

      const rolePolicies = await ensureRolePolicies(req);
      const activeRoles = rolePolicies.map((rolePolicy) => rolePolicy.roleName);

      const activeNormalized = activeRoles.map(r => r.toLowerCase());
      const hasRequiredRole = activeNormalized.some(r => allowed.includes(r));

      if (!hasRequiredRole) {
        res.status(403).json({
          error: `Forbidden - Required roles: ${allowedRoles.join(", ")}`
          // optionally add userRoles: activeRoles in dev only
        });
        return;
      }

      // Cache for downstream middleware
      req.userRoles = activeRoles;

      next();
    } catch {
      res.status(500).json({ error: "Role verification failed" });
    }
  };
};
