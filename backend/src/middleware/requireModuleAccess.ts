import { NextFunction, Response } from "express";
import { AuthRequest } from "./auth";
import {
  ModuleAction,
  ModuleKey,
  hasModuleAccess,
  methodToModuleAction,
} from "../services/moduleAccess.service";
import { ensureAuthorizationContext } from "../services/authorizationContext.service";

export const requireModuleAccess =
  (moduleKey: ModuleKey, actionOverride?: ModuleAction) =>
  async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.userId) {
        res.status(401).json({ error: "User not authenticated" });
        return;
      }

      const action = actionOverride ?? methodToModuleAction(req.method);
      const authz = await ensureAuthorizationContext(req);

      const allowed = hasModuleAccess({
        moduleKey,
        action,
        rolePolicies: authz.moduleRolePolicies,
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

export const requireAnyModuleAccess =
  (options: Array<{ moduleKey: ModuleKey; action?: ModuleAction }>) =>
  async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.userId) {
        res.status(401).json({ error: "User not authenticated" });
        return;
      }

      if (!Array.isArray(options) || options.length === 0) {
        res.status(500).json({ error: "Module access check failed - no module options provided" });
        return;
      }

      const authz = await ensureAuthorizationContext(req);
      const resolvedOptions = options.map((option) => ({
        moduleKey: option.moduleKey,
        action: option.action ?? methodToModuleAction(req.method),
      }));

      const allowedOption = resolvedOptions.find((option) =>
        hasModuleAccess({
          moduleKey: option.moduleKey,
          action: option.action,
          rolePolicies: authz.moduleRolePolicies,
        })
      );

      if (!allowedOption) {
        res.status(403).json({
          error: "Forbidden - insufficient module access",
          module: resolvedOptions[0]?.moduleKey,
          action: resolvedOptions[0]?.action,
          requiredAnyOf: resolvedOptions,
        });
        return;
      }

      req.currentModuleAccess = {
        moduleKey: allowedOption.moduleKey,
        action: allowedOption.action,
      };

      next();
    } catch (error) {
      console.error("requireAnyModuleAccess failed:", error);
      res.status(500).json({ error: "Module access check failed" });
    }
  };
