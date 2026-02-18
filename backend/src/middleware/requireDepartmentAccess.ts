/**
 * Department scope middleware
 *
 * Rules:
 * - Admin/Super Admin: full access
 * - HR/HR Manager: full access
 * - Assigned Partner: access to departments they own
 * - Department Head: access to their department
 * - Managers: access to departments where they manage direct reports
 * - Others: access only to their own department
 *
 * Expects department id from:
 * - req.params.departmentId OR req.query.departmentId
 */


import { Response, NextFunction } from "express";
import prisma from "../prisma";
import { AuthRequest } from "./auth";

const normalizeRoles = (roles: string[]) =>
  Array.from(new Set(roles.map((role) => String(role).toLowerCase())));

const isAdmin = (roles: string[]) =>
  roles.includes("admin") || roles.includes("super_admin");
const isHR = (roles: string[]) =>
  roles.includes("hr") || roles.includes("hr_manager");

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

    const roles: string[] = normalizeRoles([
      ...(req.userRoles || []),
      ...((req.user?.authRoles || []) as string[]),
    ]);

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
        departmentsHeaded: { select: { id: true } },
        departmentsAsPartner: { select: { id: true } },
      }
    });

    if (!profile) {
      res.status(404).json({ error: "Profile not found" });
      return;
    }

    const headedDeptIds = profile.departmentsHeaded.map(d => d.id);
    const isDeptHead = headedDeptIds.includes(departmentId);
    const partnerDeptIds = profile.departmentsAsPartner.map((department) => department.id);
    const isAssignedPartner = partnerDeptIds.includes(departmentId);

    // Allow department head / assigned partner access to their department
    if (isDeptHead || isAssignedPartner) {
      next();
      return;
    }

    const directReportsInDepartment = await prisma.profile.count({
      where: { managerId: profileId, departmentId },
    });

    // Allow managers who have direct reports in this department
    if (directReportsInDepartment > 0) {
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
