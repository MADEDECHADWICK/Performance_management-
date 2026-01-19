/**
 * validateTimeEntryBudget middleware
 *
 * Enforces:
 * 1) Only assigned employees can log time for a job (JobStaffAssignment must exist)
 * 2) BudgetCap enforcement (capEnforced, allowOverage, maxOveragePercent)
 *
 * Attaches:
 * (req as any).budgetCheck = {
 *   capEnforced,
 *   allowOverage,
 *   maxOveragePercent,
 *   totalAllocatedHours,
 *   loggedHoursBefore,
 *   incomingHours,
 *   totalAfter,
 *   remainingBefore,
 *   wouldExceed,
 *   overageHours,
 *   overagePercent
 * }
 */

import { Response, NextFunction } from "express";
import prisma from "../prisma";
import { AuthRequest } from "./auth";

const STATUSES_TO_COUNT = ["submitted", "approved", "pending"]; // adjust if needed
const STATUSES_TO_EXCLUDE = ["cancelled", "rejected"]; // safe baseline

export const validateTimeEntryBudget = async (
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

    // Accept jobId from body or params/query patterns
    const jobIdRaw = (req.body?.jobId ?? req.params.jobId ?? req.query.jobId) as string | number | undefined;
    const jobId = Number(jobIdRaw);

    if (!jobIdRaw || Number.isNaN(jobId)) {
      res.status(400).json({ error: "Missing/invalid jobId" });
      return;
    }

    // hours required
    const hoursRaw = req.body?.hours;
    const incomingHours = Number(hoursRaw);

    if (hoursRaw === undefined || Number.isNaN(incomingHours) || incomingHours <= 0) {
      res.status(400).json({ error: "Missing/invalid hours (must be > 0)" });
      return;
    }

    // 1) Assignment enforcement (core business rule)
    const assignment = await prisma.jobStaffAssignment.findUnique({
      where: { jobId_employeeProfileId: { jobId, employeeProfileId: profileId } },
      select: { id: true }
    });

    if (!assignment) {
      res.status(403).json({
        error: "Forbidden. You can only log time for jobs assigned to you.",
      });
      return;
    }

    // 2) Load BudgetCap (through JobCosting)
    const jobCosting = await prisma.jobCosting.findUnique({
      where: { jobId },
      select: {
        id: true,
        budgetCap: {
          select: {
            id: true,
            totalAllocatedHours: true,
            capEnforced: true,
            allowOverage: true,
            maxOveragePercent: true
          }
        }
      }
    });

    // If no costing or no budget cap, allow (you can tighten this if you require costing first)
    if (!jobCosting?.budgetCap) {
      req.budgetCheck = {
        jobId,
        employeeProfileId: profileId,
        //capEnforced: false,
        //reason: "No job costing/budget cap found",
        hoursUsed: 0,
        hoursRemaining: 0,
        hoursAssigned: 0
      };
      next();
      return;
    }

    const cap = jobCosting.budgetCap;

    // If cap not enforced, allow
    if (!cap.capEnforced) {
      req.budgetCheck = {
        jobId,
        employeeProfileId
        : profileId,
        //capEnforced: false,
        //allowOverage: cap.allowOverage,
        hoursAssigned: Number(cap.totalAllocatedHours),
        hoursRemaining: Number(cap.totalAllocatedHours),
        hoursUsed: 0
      };
      next();
      return;
    }

    const totalAllocatedHours = Number(cap.totalAllocatedHours);
    const maxOveragePercent = Number(cap.maxOveragePercent);

    // Sum logged hours for this job (exclude cancelled/rejected)
    const sum = await prisma.timeEntry.aggregate({
      where: {
        jobId,
        NOT: [{ status: { in: STATUSES_TO_EXCLUDE as any } }]
      },
      _sum: { hours: true }
    });

    const loggedHoursBefore = Number(sum._sum.hours ?? 0);
    const totalAfter = loggedHoursBefore + incomingHours;

    const remainingBefore = totalAllocatedHours - loggedHoursBefore;
    const wouldExceed = totalAfter > totalAllocatedHours;

    const overageHours = wouldExceed ? totalAfter - totalAllocatedHours : 0;
    const overagePercent = totalAllocatedHours > 0 ? (overageHours / totalAllocatedHours) : 0;

    // Attach info for controller layer
    req.budgetCheck = {
      jobId,
      employeeProfileId : profileId,
      //capEnforced: true,
      //allowOverage: cap.allowOverage,
      //maxOveragePercent: maxOveragePercent,
      hoursAssigned: totalAllocatedHours,
      hoursUsed: totalAfter,
      hoursRemaining: Math.max(0, totalAllocatedHours - totalAfter),
      budget: {
        allowOverage: cap.allowOverage,
        totalAllocatedHours,
        loggedHoursBefore,
        incomingHours,
        totalAfter,
        remainingBefore,
        wouldExceed,
        overageHours,
        overagePercent
      }
    };

    // Enforce the rule
    if (!wouldExceed) {
      next();
      return;
    }

    // If would exceed:
    if (!cap.allowOverage) {
      res.status(409).json({
        error: "Time entry exceeds allocated budget hours. Request additional time approval.",
        budget: req.budgetCheck
      });
      return;
    }

    // allowOverage = true, but enforce maxOveragePercent
    if (overagePercent > maxOveragePercent) {
      res.status(409).json({
        error: "Time entry exceeds maximum allowed overage. Approval required or reduce hours.",
        budget: req.budgetCheck
      });
      return;
    }

    // Allowed to proceed, but controller should create an approval workflow request
    req.budgetCheck.requiresApproval = true;
    next();
  } catch (error) {
    console.error("validateTimeEntryBudget error:", error);
    res.status(500).json({ error: "Budget validation failed" });
  }
};
