/**
 * Time entry-level access control
 * Only employee who owns the entry, job manager/partner, or admin
 *
 * IMPORTANT:
 * Expects loadProfile middleware to run before this, so req.user.profileId exists.
 */

import { Response, NextFunction } from "express";
import prisma from "../prisma";
import { AuthRequest } from "./auth";

export const requireTimeEntryAccess = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const profileId = req.user.profileId;
    if (!profileId) {
      res
        .status(401)
        .json({ error: "Profile not loaded. Run loadProfile middleware first." });
      return;
    }

    const rawId = (req.params.timeEntryId ?? req.params.id) as string | undefined;
    const timeEntryId = Number(rawId);

    if (!rawId || Number.isNaN(timeEntryId)) {
      res.status(400).json({ error: "Invalid time entry ID" });
      return;
    }

    const timeEntry = await prisma.timeEntry.findUnique({
      where: { id: timeEntryId },
      include: {
        job: {
          select: {
            id: true,
            partnerProfileId: true,
            managerProfileId: true,
          },
        },
      },
    });

    if (!timeEntry) {
      res.status(404).json({ error: "Time entry not found" });
      return;
    }

    const userRoles: string[] = req.userRoles || [];
    const isAdmin =
      userRoles.includes("admin") || userRoles.includes("super_admin");

    const hasAccess =
      isAdmin ||
      timeEntry.employeeProfileId === profileId ||
      timeEntry.job.partnerProfileId === profileId ||
      timeEntry.job.managerProfileId === profileId;

    if (!hasAccess) {
      res.status(403).json({ error: "No access to this time entry" });
      return;
    }

    req.timeEntry = timeEntry;
    next();
  } catch (error) {
    console.error("requireTimeEntryAccess error:", error);
    res.status(500).json({ error: "Time entry access check failed" });
  }
};
