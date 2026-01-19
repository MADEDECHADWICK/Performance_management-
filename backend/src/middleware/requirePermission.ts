//Permission-based authorization
//Checks if user has required permissions - specific action

import { Response, NextFunction } from "express";
import prisma from "../prisma";
import { AuthRequest } from "./auth";

export const requirePermission = (...requiredPermissions: string[]) => {
  const required = requiredPermissions.map(p => p.toLowerCase());

  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.userId) {
        res.status(401).json({ error: "User not authenticated" });
        return;
      }

      // reuse cached perms if present
      const cached = req.userPermissions;
      if (cached?.length) {
        const normalized = cached.map(p => p.toLowerCase());
        const missing = required.filter(p => !normalized.includes(p));
        if (missing.length) {
          res.status(403).json({ error: "Insufficient permissions", missing });
          return;
        }
        next();
        return;
      }

      const rows = await prisma.userAuthRole.findMany({
        where: { userId: req.user.userId },
        select: {
          role: {
            select: {
              isActive: true,
              permissions: {
                select: {
                  permission: { select: { key: true } }
                }
              }
            }
          }
        }
      });

      const permsSet = new Set<string>();

      for (const ur of rows) {
        if (!ur.role.isActive) continue;
        for (const rp of ur.role.permissions) {
          permsSet.add(rp.permission.key);
        }
      }

      const permissions = Array.from(permsSet);
      req.userPermissions = permissions;

      const normalized = permissions.map(p => p.toLowerCase());
      const missing = required.filter(p => !normalized.includes(p));

      if (missing.length) {
        res.status(403).json({
          error: "Insufficient permissions",
          required: requiredPermissions,
          missing
        });
        return;
      }

      next();
    } catch {
      res.status(500).json({ error: "Permission verification failed" });
    }
  };
};
