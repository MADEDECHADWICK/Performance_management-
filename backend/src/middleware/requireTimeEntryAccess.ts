import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth";
import { prisma } from "../lib/prisma";

/**
 * Verify user has access to time entry
 * Employees can only access their own
 * Managers/Partners can access team/partner time entries
 * Admins can access all
 */
export const requireTimeEntryAccess = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const timeEntryId = Number(req.params.timeEntryId);
    const requesterProfileId = req.profile?.id;
    const requesterRole = req.profile?.role?.name;

    if (!requesterProfileId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const timeEntry = await prisma.timeEntry.findUnique({
      where: { id: timeEntryId },
      include: {
        job: {
          include: {
            staffing: {
              where: { status: "active" },
            },
          },
        },
      },
    });

    if (!timeEntry) {
      res.status(404).json({ error: "Time entry not found" });
      return;
    }

    // ✅ ACCESS CONTROL LOGIC
    const isAdmin = requesterRole === "admin";
    const isOwner = timeEntry.employee_profile_id === requesterProfileId;

    // Check if user is manager of the employee
    const isManager = requesterRole === "manager";

    // Check if user is partner of the job
    const isPartner =
      requesterRole === "partner" &&
      timeEntry.job.partner_id === requesterProfileId;

    const hasAccess = isAdmin || isOwner || isManager || isPartner;

    if (!hasAccess) {
      res.status(403).json({
        error: "You do not have permission to access this time entry",
      });
      return;
    }

    // ✅ ATTACH TIME ENTRY TO REQUEST FOR DOWNSTREAM USE
    req.timeEntry = timeEntry;

    next();
  } catch (error) {
    console.error("requireTimeEntryAccess error:", error);
    res.status(500).json({ error: "Time entry access check failed" });
  }
};

// Extend AuthRequest to include timeEntry
declare global {
  namespace Express {
    interface Request {
      timeEntry?: any;
    }
  }
}
