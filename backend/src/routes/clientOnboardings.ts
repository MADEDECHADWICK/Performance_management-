import { Router } from "express";
import { ClientOnboardingStatus, EngagementLetterStatus } from "@prisma/client";
import prisma from "../prisma";
import { AuthRequest } from "../middleware/auth";
import { requireRole } from "../middleware/reqiureRole";
import { errorResponse, paginatedResponse, successResponse } from "../utils/response";
import { notifyHrGroup } from "../services/hrNotifications";
import { NotificationService } from "../services/notifications.service";

const router = Router();

const parseId = (value: string) => {
  const id = Number(value);
  return Number.isFinite(id) ? id : null;
};

const getPagination = (req: any) => {
  const page = Number(req.query.page) || 1;
  const pageSize = Number(req.query.pageSize) || 10;
  const skip = (page - 1) * pageSize;
  return { page, pageSize, skip };
};

// GET /client-onboardings/upcoming-jobs
// Lists approved onboarding records with approved engagement letters and no job yet
router.get("/upcoming-jobs", async (req, res) => {
  try {
    const { page, pageSize, skip } = getPagination(req);

    const where: any = {
      status: { in: [ClientOnboardingStatus.approved, ClientOnboardingStatus.client_created] },
      jobId: null,
      engagementLetter: { status: EngagementLetterStatus.approved },
    };

    const [items, total] = await Promise.all([
      prisma.clientOnboarding.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          engagementLetter: {
            select: {
              id: true,
              jobTitle: true,
              status: true,
              feeAmount: true,
              currency: true,
              startDate: true,
              endDate: true,
              document: { select: { id: true, fileName: true, filePath: true } },
            },
          },
          client: { select: { id: true, clientName: true } },
          department: { select: { id: true, name: true } },
          uploadedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      prisma.clientOnboarding.count({ where }),
    ]);

    res.json(paginatedResponse(items, total, page, pageSize, "Upcoming jobs retrieved"));
  } catch (error: any) {
    console.error("Error fetching upcoming jobs:", error);
    res.status(500).json(errorResponse("Failed to fetch upcoming jobs", 500));
  }
});

// GET /client-onboardings
router.get("/", async (req, res) => {
  try {
    const { page, pageSize, skip } = getPagination(req);
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const clientId = req.query.clientId ? Number(req.query.clientId) : undefined;
    const engagementLetterId = req.query.engagementLetterId ? Number(req.query.engagementLetterId) : undefined;
    const departmentId = req.query.departmentId ? Number(req.query.departmentId) : undefined;

    const where: any = {};
    if (status) where.status = status;
    if (Number.isFinite(clientId)) where.clientId = clientId;
    if (Number.isFinite(engagementLetterId)) where.engagementLetterId = engagementLetterId;
    if (Number.isFinite(departmentId)) where.departmentId = departmentId;

    const [items, total] = await Promise.all([
      prisma.clientOnboarding.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          engagementLetter: {
            select: {
              id: true,
              jobTitle: true,
              status: true,
              feeAmount: true,
              currency: true,
              document: { select: { id: true, fileName: true, filePath: true } },
            },
          },
          client: { select: { id: true, clientName: true } },
          department: { select: { id: true, name: true } },
          uploadedBy: { select: { id: true, firstName: true, lastName: true } },
          hrReviewer: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      prisma.clientOnboarding.count({ where }),
    ]);

    res.json(paginatedResponse(items, total, page, pageSize, "Client onboardings retrieved"));
  } catch (error: any) {
    console.error("Error fetching client onboardings:", error);
    res.status(500).json(errorResponse("Failed to fetch client onboardings", 500));
  }
});

// GET /client-onboardings/:id
router.get("/:id", async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json(errorResponse("Invalid client onboarding id", 400));
      return;
    }

    const onboarding = await prisma.clientOnboarding.findUnique({
      where: { id },
      include: {
        engagementLetter: {
          select: {
            id: true,
            jobTitle: true,
            status: true,
            feeAmount: true,
            currency: true,
            startDate: true,
            endDate: true,
            document: { select: { id: true, fileName: true, filePath: true } },
          },
        },
        client: { select: { id: true, clientName: true } },
        department: { select: { id: true, name: true } },
        uploadedBy: { select: { id: true, firstName: true, lastName: true } },
        hrReviewer: { select: { id: true, firstName: true, lastName: true } },
        job: { select: { id: true, jobName: true, status: true } },
      },
    });

    if (!onboarding) {
      res.status(404).json(errorResponse("Client onboarding not found", 404));
      return;
    }

    res.json(successResponse(onboarding, "Client onboarding retrieved"));
  } catch (error: any) {
    console.error("Error fetching client onboarding:", error);
    res.status(500).json(errorResponse("Failed to fetch client onboarding", 500));
  }
});

// POST /client-onboardings
// Marketing submits a client onboarding request with an engagement letter
router.post("/", async (req: AuthRequest, res) => {
  try {
    const {
      engagementLetterId,
      clientName,
      industry,
      contactPerson,
      contactEmail,
      contactPhone,
      location,
      departmentId,
      notes,
      clientId,
    } = req.body;

    const letterId = Number(engagementLetterId);
    if (!letterId) {
      res.status(400).json(errorResponse("engagementLetterId is required", 400));
      return;
    }

    const engagementLetter = await prisma.engagementLetter.findUnique({
      where: { id: letterId },
      include: { client: true },
    });

    if (!engagementLetter) {
      res.status(404).json(errorResponse("Engagement letter not found", 404));
      return;
    }

    if (clientId && engagementLetter.clientId !== Number(clientId)) {
      res.status(400).json(errorResponse("engagementLetter does not match clientId", 400));
      return;
    }

    const existing = await prisma.clientOnboarding.findFirst({
      where: { engagementLetterId: letterId },
    });

    if (existing) {
      res.status(409).json(errorResponse("Client onboarding already exists for this engagement letter", 409));
      return;
    }

  const onboarding = await prisma.clientOnboarding.create({
    data: {
        engagementLetterId: letterId,
        clientId: engagementLetter.clientId,
        clientName: engagementLetter.client?.clientName || clientName,
        industry: engagementLetter.client?.industry || industry,
        contactPerson: engagementLetter.client?.contactPerson || contactPerson,
        contactEmail: engagementLetter.client?.contactEmail || contactEmail,
        contactPhone: engagementLetter.client?.contactPhone || contactPhone,
        location: engagementLetter.client?.location || location,
        departmentId: departmentId ? Number(departmentId) : engagementLetter.client?.departmentId,
        uploadedByProfileId: req.user?.profileId!,
        status: ClientOnboardingStatus.pending_hr_review,
        notes,
    },
    include: {
      engagementLetter: { select: { id: true, jobTitle: true, status: true } },
      client: { select: { id: true, clientName: true } },
    },
  });

  await notifyHrGroup(
    {
      title: "New onboarding requires HR review",
      body: `Client onboarding for "${onboarding.clientName}" is awaiting HR review.`,
      relatedEntityId: onboarding.id,
    },
    req
  );

  res.status(201).json(successResponse(onboarding, "Client onboarding created", 201));
  } catch (error: any) {
    console.error("Error creating client onboarding:", error);
    res.status(500).json(errorResponse("Failed to create client onboarding", 500));
  }
});

// POST /client-onboardings/:id/approve
router.post("/:id/approve", requireRole("hr", "hr_manager", "admin", "super_admin"), async (req: AuthRequest, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json(errorResponse("Invalid client onboarding id", 400));
      return;
    }

    const onboarding = await prisma.clientOnboarding.findUnique({
      where: { id },
      include: { engagementLetter: true },
    });

    if (!onboarding) {
      res.status(404).json(errorResponse("Client onboarding not found", 404));
      return;
    }

    const updated = await prisma.clientOnboarding.update({
      where: { id },
      data: {
        status: ClientOnboardingStatus.approved,
        hrReviewerProfileId: req.user?.profileId,
      },
    });

    if (updated.departmentId) {
      const managerProfiles = await prisma.profile.findMany({
        where: {
          departmentId: updated.departmentId,
          user: {
            roles: {
              some: { role: { name: { in: ["manager"] } } },
            },
          },
        },
        select: { id: true },
      });

      await Promise.all(
        managerProfiles.map((profile) =>
          NotificationService.createNotification(
            {
              recipientProfileId: profile.id,
              type: "action",
              title: "Onboarding approved — manager review",
              message: `Client onboarding for "${updated.clientName}" is approved and ready for job planning.`,
              actionRequired: true,
              link: `/hr-queue?onboardingId=${updated.id}`,
              clientId: updated.clientId ?? undefined,
            },
            { userId: req.user?.userId ?? 0, profileId: req.user?.profileId ?? 0, roleName: "system" }
          )
        )
      );
    }

    res.json(successResponse(updated, "Client onboarding approved"));
  } catch (error: any) {
    console.error("Error approving client onboarding:", error);
    res.status(500).json(errorResponse("Failed to approve client onboarding", 500));
  }
});

// POST /client-onboardings/:id/reject
router.post("/:id/reject", requireRole("hr", "hr_manager", "admin", "super_admin"), async (req: AuthRequest, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json(errorResponse("Invalid client onboarding id", 400));
      return;
    }

    const reason = typeof req.body?.reason === "string" ? req.body.reason : undefined;

    const updated = await prisma.clientOnboarding.update({
      where: { id },
      data: {
        status: ClientOnboardingStatus.rejected,
        hrReviewerProfileId: req.user?.profileId,
        notes: reason,
      },
    });

    res.json(successResponse(updated, "Client onboarding rejected"));
  } catch (error: any) {
    console.error("Error rejecting client onboarding:", error);
    res.status(500).json(errorResponse("Failed to reject client onboarding", 500));
  }
});

export default router;
