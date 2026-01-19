/**
 * Job-level access control
 * Verify user can access specific job
 *
 * IMPORTANT:
 * This expects loadProfile middleware to have run already,
 * so req.user.profileId is available.
 */

import { Response, NextFunction } from "express";
import prisma from "../prisma";
import { AuthRequest } from "./auth";

export const requireJobAccess = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // Must have a profileId because Job relations use Profile IDs
    const profileId = req.user.profileId;
    if (!profileId) {
      res.status(401).json({ error: "Profile not loaded. Run loadProfile middleware first." });
      return;
    }

    const rawJobId = (req.params.jobId ?? req.query.jobId) as string | undefined;
    const jobId = Number(rawJobId);

    if (!rawJobId || Number.isNaN(jobId)) {
      res.status(400).json({ error: "Invalid job ID" });
      return;
    }

    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        partnerProfileId: true,
        managerProfileId: true,
        staffing: {
          where: { employeeProfileId: profileId },
          select: { id: true }
        }
      }
    });

    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    const userRoles: string[] = req.userRoles || [];
    const isAdmin =
      userRoles.includes("admin") || userRoles.includes("super_admin");

    const hasAccess =
      isAdmin ||
      job.partnerProfileId === profileId ||
      job.managerProfileId === profileId ||
      job.staffing.length > 0;

    if (!hasAccess) {
      res.status(403).json({ error: "No access to this job" });
      return;
    }

    // Cache job data for downstream handlers
    req.job = job;

    next();
  } catch (error) {
    console.error("requireJobAccess error:", error);
    res.status(500).json({ error: "Job access check failed" });
  }
};
