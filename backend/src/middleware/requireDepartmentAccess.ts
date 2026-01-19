/**
 * Department scope middleware
 *
 * Rules:
 * - Admin/Super Admin: full access
 * - HR: full access (optional, common in HR systems)
 * - Department Head: access only to their department
 * - Others: access only to their own department (optional; you can tighten/relax)
 *
 * Expects department id from:
 * - req.params.departmentId OR req.query.departmentId
 */

import { Response, NextFunction } from "express";
import prisma from "../prisma";
import { AuthRequest } from "./auth";

const isAdmin = (roles: string[]) => roles.includes("admin") || roles.includes("super_admin");
const isHR = (roles: string[]) => roles.includes("hr");

export const requireDepartmentAccess = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const profileId = req.user?.profileId;
    if (!req.user?.userId || !profileId) {
      res.status(401).json({ error: "Unauthorized. Ensure authMiddleware + loadProfile ran." });
      return;
    }

    const roles: string[] = req.userRoles || [];

    // Admin/HR can access any department
    if (isAdmin(roles) || isHR(roles)) {
      next();
      return;
    }

    const rawDeptId = (req.params.departmentId ?? req.query.departmentId) as string | undefined;
    const departmentId = rawDeptId ? Number(rawDeptId) : undefined;

    if (!departmentId || Number.isNaN(departmentId)) {
      res.status(400).json({ error: "Invalid department ID" });
      return;
    }

    // Load user's department + headed departments
    const profile = await prisma.profile.findUnique({
      where: { id: profileId },
      select: {
        id: true,
        departmentId: true,
        departmentsHeaded: { select: { id: true } }
      }
    });

    if (!profile) {
      res.status(404).json({ error: "Profile not found" });
      return;
    }

    const headedDeptIds = profile.departmentsHeaded.map(d => d.id);
    const isDeptHead = headedDeptIds.includes(departmentId);

    // Allow department head access to their department
    if (isDeptHead) {
      next();
      return;
    }

    // Optional: allow ordinary users only for their own department
    if (profile.departmentId === departmentId) {
      next();
      return;
    }

    res.status(403).json({ error: "Forbidden. Department scope violation." });
  } catch (error) {
    console.error("requireDepartmentAccess error:", error);
    res.status(500).json({ error: "Department access check failed" });
  }
};
