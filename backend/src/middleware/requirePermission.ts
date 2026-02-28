//Permission-based authorization
//Checks if user has required permissions - specific action

import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth";
import { ensureAuthorizationContext } from "../services/authorizationContext.service";

export const requirePermission = (...requiredPermissions: string[]) => {
  const required = requiredPermissions.map((p) => p.toLowerCase());

  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.userId) {
        res.status(401).json({ error: "User not authenticated" });
        return;
      }

      const authz = await ensureAuthorizationContext(req);
      const normalized = authz.permissionKeys.map((permission) => permission.toLowerCase());
      const missing = required.filter((permission) => !normalized.includes(permission));

      if (missing.length) {
        res.status(403).json({
          error: "Insufficient permissions",
          required: requiredPermissions,
          missing,
        });
        return;
      }

      next();
    } catch {
      res.status(500).json({ error: "Permission verification failed" });
    }
  };
};
