import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth";
import { prisma } from "../prisma";

const normalizeRole = (value?: string) => String(value || "").toLowerCase().trim();

const getRoleSet = (req: AuthRequest): Set<string> => {
  const roles = new Set<string>();
  const profileRole = normalizeRole(req.profile?.role?.name);
  if (profileRole) {
    roles.add(profileRole);
  }
  (req.user?.authRoles || []).forEach((role) => {
    const normalized = normalizeRole(role);
    if (normalized) {
      roles.add(normalized);
    }
  });
  return roles;
};

const hasAnyRole = (roles: Set<string>, candidates: string[]) =>
  candidates.some((candidate) => roles.has(candidate));

/**
 * Verify user has access to a time entry.
 * Employees can only access their own.
 * Managers only access entries they directly supervise.
 * Partners only access entries on their portfolio jobs.
 * Admins can access all.
 */
export const requireTimeEntryAccess = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const timeEntryId = Number(req.params.timeEntryId);
    const requesterProfileId = req.profile?.id;
    const requesterRoles = getRoleSet(req);

    if (!requesterProfileId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (!Number.isFinite(timeEntryId) || timeEntryId <= 0) {
      res.status(400).json({ error: "Invalid time entry id" });
      return;
    }

    const timeEntry = await prisma.timeEntry.findUnique({
      where: { id: timeEntryId },
      include: {
        job: true,
        employee: {
          select: {
            id: true,
            managerId: true,
          },
        },
      },
    });

    if (!timeEntry) {
      res.status(404).json({ error: "Time entry not found" });
      return;
    }

    const isAdmin = hasAnyRole(requesterRoles, ["admin", "super_admin"]);
    const isOwner = timeEntry.employeeProfileId === requesterProfileId;

    const isManagerRole = hasAnyRole(requesterRoles, ["manager"]);
    const managesJob = timeEntry.job.managerProfileId === requesterProfileId;
    const managesEmployee = timeEntry.employee?.managerId === requesterProfileId;
    const isScopedManager = isManagerRole && (managesJob || managesEmployee);

    const isPartner =
      hasAnyRole(requesterRoles, ["partner"]) &&
      timeEntry.job.partnerProfileId === requesterProfileId;

    const hasAccess = isAdmin || isOwner || isScopedManager || isPartner;

    if (!hasAccess) {
      res.status(403).json({
        error: "You do not have permission to access this time entry",
      });
      return;
    }

    req.timeEntry = timeEntry;
    next();
  } catch (error) {
    console.error("requireTimeEntryAccess error:", error);
    res.status(500).json({ error: "Time entry access check failed" });
  }
};

declare global {
  namespace Express {
    interface Request {
      timeEntry?: any;
    }
  }
}
