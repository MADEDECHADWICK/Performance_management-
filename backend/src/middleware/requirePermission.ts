// This middleware provides a function `requirePermission` that can be used to enforce permission-based access control on API routes. It checks the authenticated user's permissions against the required permissions specified for a route. The middleware retrieves the user's permissions from the authorization context, normalizes them for case-insensitive comparison, and determines if the user has all the required permissions to proceed with the request. If the user is not authenticated or does not have the necessary permissions, it responds with appropriate HTTP status codes (401 for unauthenticated, 403 for insufficient permissions). By using this middleware, we can ensure that only users with the necessary permissions can access certain endpoints in the application.

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
