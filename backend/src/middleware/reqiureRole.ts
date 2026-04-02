// This middleware provides a function `requireRole` that can be used to enforce role-based access control on API routes. It checks the authenticated user's roles and permissions against the allowed roles specified for a route, and also integrates with module-based access control if applicable. The middleware retrieves the user's role policies from the database, applies any user-specific overrides, and determines whether the user has sufficient access to proceed with the request. If the user is not authenticated or does not have the required roles or permissions, it responds with appropriate HTTP status codes (401 for unauthenticated, 403 for forbidden). By using this middleware, we can ensure that only users with the necessary roles and permissions can access certain endpoints in the application.

import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth";
import { ensureAuthorizationContext } from "../services/authorizationContext.service";

export const requireRole = (...allowedRoles: string[]) => {
  const allowed = allowedRoles.map(r => r.toLowerCase());

  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.userId) {
        res.status(401).json({ error: "User not authenticated" });
        return;
      }

      const authz = await ensureAuthorizationContext(req);
      const activeNormalized = authz.activeRoles.map(r => r.toLowerCase());
      const hasRequiredRole = activeNormalized.some(r => allowed.includes(r));

      if (!hasRequiredRole) {
        res.status(403).json({
          error: `Forbidden - Required roles: ${allowedRoles.join(", ")}`
          // optionally add userRoles: activeRoles in dev only
        });
        return;
      }

      next();
    } catch {
      res.status(500).json({ error: "Role verification failed" });
    }
  };
};
