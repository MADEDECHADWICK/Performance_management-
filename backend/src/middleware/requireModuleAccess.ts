import { NextFunction, Response } from "express";
import prisma from "../prisma";
import { AuthRequest } from "./auth";
import {
  ModuleAction,
  ModuleKey,
  RoleModulePolicyInput,
  hasModuleAccess,
  methodToModuleAction,
} from "../services/moduleAccess.service";

const ensureRolePolicies = async (req: AuthRequest): Promise<RoleModulePolicyInput[]> => {
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

export const requireModuleAccess =
  (moduleKey: ModuleKey, actionOverride?: ModuleAction) =>
  async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.userId) {
        res.status(401).json({ error: "User not authenticated" });
        return;
      }

      const action = actionOverride ?? methodToModuleAction(req.method);
      const rolePolicies = await ensureRolePolicies(req);

      const allowed = hasModuleAccess({
        moduleKey,
        action,
        rolePolicies,
      });

      if (!allowed) {
        res.status(403).json({
          error: "Forbidden - insufficient module access",
          module: moduleKey,
          action,
        });
        return;
      }

      req.currentModuleAccess = {
        moduleKey,
        action,
      };

      next();
    } catch (error) {
      console.error("requireModuleAccess failed:", error);
      res.status(500).json({ error: "Module access check failed" });
    }
  };
