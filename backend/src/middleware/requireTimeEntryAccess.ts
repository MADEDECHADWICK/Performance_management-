// This middleware verifies that the authenticated user has access to a specific time entry based on their role and relationship to the time entry. It checks if the user is an admin (super_admin or hr), the owner of the time entry (employee), a manager who supervises the employee or manages the job, or a partner associated with the job. If the user does not have access, it responds with a 403 Forbidden status code. If the time entry is not found, it responds with a 404 Not Found status code. If the user is not authenticated, it responds with a 401 Unauthorized status code. If access is granted, it attaches the time entry to the request object for downstream handlers to use. The middleware also includes error handling to catch any unexpected issues during the access check process and respond with a 500 Internal Server Error status code if necessary. By using this middleware, we can ensure that users can only access time entries that they are authorized to view or manage, enhancing the security and integrity of the application.

import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth";
import { prisma } from "../prisma";
import { resolveRequestAccessRoles } from "../auth/accessRoles";

const normalizeRole = (value?: string) => String(value || "").toLowerCase().trim();

const getRoleSet = (req: AuthRequest): Set<string> => {
  const roles = new Set<string>();
  resolveRequestAccessRoles(req).forEach((role) => {
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
        proposal: true,
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

    const isAdmin = hasAnyRole(requesterRoles, ["super_admin", "hr"]);
    const isOwner = timeEntry.employeeProfileId === requesterProfileId;

    const isManagerRole = hasAnyRole(requesterRoles, ["manager"]);
    const managesJob = timeEntry.job?.managerProfileId === requesterProfileId;
    const managesProposal = timeEntry.proposal?.managerProfileId === requesterProfileId;
    const managesEmployee = timeEntry.employee?.managerId === requesterProfileId;
    const isScopedManager = isManagerRole && (managesJob || managesProposal || managesEmployee);

    const isPartner =
      hasAnyRole(requesterRoles, ["partner"]) &&
      (timeEntry.job?.partnerProfileId === requesterProfileId ||
        timeEntry.proposal?.assignedPartnerProfileId === requesterProfileId);

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
