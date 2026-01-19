//Role-base authorization
//Checks f user has required roles

import { Response, NextFunction } from "express";
import prisma from "../prisma";
import { AuthRequest } from "./auth";

export const requireRole = (...allowedRoles: string[]) => {
  const allowed = allowedRoles.map(r => r.toLowerCase());

  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.userId) {
        res.status(401).json({ error: "User not authenticated" });
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

      const userRoles = await prisma.userAuthRole.findMany({
        where: { userId: req.user.userId },
        select: {
          role: { select: { name: true, isActive: true } }
        }
      });

      const activeRoles = userRoles
        .filter(ur => ur.role.isActive)
        .map(ur => ur.role.name);

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
