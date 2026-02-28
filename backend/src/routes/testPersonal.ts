import { Router } from "express";
import prisma from "../prisma";

const router = Router();

// Diagnostic endpoint for personal dashboard data dependencies.
router.get("/test-personal", async (_req, res) => {
  try {
    const profileId = 4; // GMP debug profile

    const personalJobs = await prisma.job.findMany({
      where: {
        OR: [{ partnerProfileId: profileId }, { managerProfileId: profileId }],
      },
      include: {
        client: true,
        staffing: {
          include: {
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                positionTitle: true,
              },
            },
          },
        },
      },
    });

    const directReports = await prisma.profile.findMany({
      where: { managerId: profileId, status: "active" },
      include: {
        department: true,
      },
    });

    const personalPerformance = await prisma.performanceScore.findFirst({
      where: { employeeProfileId: profileId },
      orderBy: { calculatedAt: "desc" },
    });

    res.json({
      success: true,
      personalJobs: personalJobs.length,
      directReports: directReports.length,
      personalPerformance: !!personalPerformance,
    });
  } catch (error: any) {
    console.error("Test personal endpoint error:", error);
    res.status(500).json({
      error: error?.message || "Failed to run personal diagnostics",
    });
  }
});

export default router;
