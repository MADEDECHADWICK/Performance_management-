import { Router } from "express";
import { ClientOnboardingStatus, EngagementLetterStatus } from "@prisma/client";
import prisma from "../prisma";
import { AuthRequest } from "../middleware/auth";
import { resolveRequestAccessRoles } from "../auth/accessRoles";
import { errorResponse, paginatedResponse, successResponse } from "../utils/response";
import { notifyProfilesByRoles } from "../services/notificationRecipients";
import { NotificationService } from "../services/notifications.service";

const router = Router();

const parseId = (value: string) => {
  const id = Number(value);
  return Number.isFinite(id) ? id : null;
};

const hasOwn = (value: unknown, key: string) =>
  Boolean(value) && Object.prototype.hasOwnProperty.call(value, key);

const parseOptionalPositiveInt = (value: unknown) => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : NaN;
};

const buildGeneratedClientCode = (clientId: number) =>
  `CL-${String(clientId).padStart(4, "0")}`;

const normalizeRole = (value: string | null | undefined) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const resolveRoleSet = (req: AuthRequest) =>
  new Set(
    resolveRequestAccessRoles(req)
      .map((role) => normalizeRole(role))
      .filter(Boolean)
  );

const isMarketingOrAdmin = (req: AuthRequest) => {
  const roles = resolveRoleSet(req);
  return roles.has("marketing") || roles.has("super_admin");
};

const isHrOrAdmin = (req: AuthRequest) => {
  const roles = resolveRoleSet(req);
  return roles.has("hr") || roles.has("super_admin");
};

const engagementLetterIncludeWithFeedback = {
  document: { select: { id: true, fileName: true, filePath: true, mimeType: true } },
  statusTransitions: {
    where: { toStatus: EngagementLetterStatus.rejected },
    orderBy: { createdAt: "desc" as const },
    take: 1,
    select: {
      reason: true,
      createdAt: true,
      changedBy: {
        select: { id: true, firstName: true, lastName: true },
      },
    },
  },
};

const decorateEngagementLetter = (letter: any) => {
  if (!letter) return letter;
  const latestRejection = Array.isArray(letter.statusTransitions)
    ? letter.statusTransitions[0]
    : undefined;
  const { statusTransitions, ...rest } = letter;
  return {
    ...rest,
    latestRejectionReason: latestRejection?.reason ?? null,
    latestRejectionAt: latestRejection?.createdAt ?? null,
    latestRejectedBy: latestRejection?.changedBy ?? null,
  };
};

// Engagement letter approvals (must come before /:clientId routes)
router.post(
  "/engagement-letters/:letterId/approve",
  async (req: AuthRequest, res) => {
    try {
      if (!isHrOrAdmin(req)) {
        res.status(403).json(errorResponse("Only HR/Admin can approve engagement letters", 403));
        return;
      }

      const letterId = parseId(req.params.letterId);
      if (!letterId) {
        res.status(400).json(errorResponse("Invalid engagement letter id", 400));
        return;
      }

      const letter = await prisma.engagementLetter.findUnique({
        where: { id: letterId },
      });

      if (!letter) {
        res.status(404).json(errorResponse("Engagement letter not found", 404));
        return;
      }

      const updated = await prisma.engagementLetter.update({
        where: { id: letterId },
        data: {
          status: EngagementLetterStatus.approved,
          approvedByProfileId: req.user?.profileId,
          approvedAt: new Date(),
        },
        include: engagementLetterIncludeWithFeedback,
      });

      await prisma.statusTransition.create({
        data: {
          entityType: "EngagementLetter",
          entityId: letterId,
          fromStatus: letter.status,
          toStatus: EngagementLetterStatus.approved,
          changedByProfileId: req.user?.profileId,
          engagementLetterId: letterId,
        },
      });

      await notifyProfilesByRoles(
        ["hr"],
        {
          title: "Engagement letter approved",
          message: `Engagement letter for client #${letter.clientId} has been approved and is ready for HR job creation.`,
          link: "/client-onboarding-queue",
          targetEntityType: "EngagementLetter",
          targetEntityId: letterId,
        },
        req
      );

      res.json(successResponse(decorateEngagementLetter(updated), "Engagement letter approved"));
    } catch (error: any) {
      console.error("Error approving engagement letter:", error);
      res.status(500).json(errorResponse("Failed to approve engagement letter", 500));
    }
  }
);

router.post(
  "/engagement-letters/:letterId/reject",
  async (req: AuthRequest, res) => {
    try {
      if (!isHrOrAdmin(req)) {
        res.status(403).json(errorResponse("Only HR/Admin can reject engagement letters", 403));
        return;
      }

      const letterId = parseId(req.params.letterId);
      if (!letterId) {
        res.status(400).json(errorResponse("Invalid engagement letter id", 400));
        return;
      }

      const reason =
        typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
      if (!reason) {
        res.status(400).json(errorResponse("A review point is required before rejecting an engagement letter", 400));
        return;
      }

      const letter = await prisma.engagementLetter.findUnique({
        where: { id: letterId },
        select: {
          id: true,
          clientId: true,
          uploadedByProfileId: true,
          status: true,
        },
      });

      if (!letter) {
        res.status(404).json(errorResponse("Engagement letter not found", 404));
        return;
      }

      const { updated, onboardings } = await prisma.$transaction(async (tx: any) => {
        const updatedLetter = await tx.engagementLetter.update({
          where: { id: letterId },
          data: {
            status: EngagementLetterStatus.rejected,
            approvedByProfileId: req.user?.profileId,
            approvedAt: new Date(),
          },
          include: engagementLetterIncludeWithFeedback,
        });

        await tx.statusTransition.create({
          data: {
            entityType: "EngagementLetter",
            entityId: letterId,
            fromStatus: letter.status,
            toStatus: EngagementLetterStatus.rejected,
            reason,
            changedByProfileId: req.user?.profileId,
            engagementLetterId: letterId,
            clientId: letter.clientId,
          },
        });

        await tx.clientOnboarding.updateMany({
          where: { engagementLetterId: letterId },
          data: {
            status: ClientOnboardingStatus.rejected,
            hrReviewerProfileId: req.user?.profileId,
            notes: reason,
          },
        });

        const linkedOnboardings = await tx.clientOnboarding.findMany({
          where: { engagementLetterId: letterId },
          select: {
            id: true,
            clientId: true,
            clientName: true,
            uploadedByProfileId: true,
          },
        });

        return { updated: updatedLetter, onboardings: linkedOnboardings };
      });

      const recipients = new Set<number>();
      if (letter.uploadedByProfileId && letter.uploadedByProfileId !== req.user?.profileId) {
        recipients.add(letter.uploadedByProfileId);
      }
      onboardings.forEach((item: any) => {
        if (item.uploadedByProfileId && item.uploadedByProfileId !== req.user?.profileId) {
          recipients.add(item.uploadedByProfileId);
        }
      });

      await Promise.allSettled(
        Array.from(recipients).map((recipientProfileId) =>
          NotificationService.createNotification(
            {
              recipientProfileId,
              type: "action",
              title: "Engagement letter returned by HR",
              message: `HR returned the engagement letter for client #${letter.clientId}: ${reason}`,
              actionRequired: true,
              link:
                onboardings[0]?.clientId
                  ? `/clients/${onboardings[0].clientId}/edit?onboardingId=${onboardings[0].id}&resubmit=1`
                  : `/client-onboarding-queue`,
              clientId: onboardings[0]?.clientId ?? letter.clientId,
            },
            {
              userId: req.user?.userId ?? 0,
              profileId: req.user?.profileId ?? 0,
              roleName: req.userRoles?.[0] || "system",
            }
          )
        )
      );

      res.json(successResponse(decorateEngagementLetter(updated), "Engagement letter rejected"));
    } catch (error: any) {
      console.error("Error rejecting engagement letter:", error);
      res.status(500).json(errorResponse("Failed to reject engagement letter", 500));
    }
  }
);

// GET /clients - List clients (paginated)
router.get("/", async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const pageSize = Number(req.query.pageSize) || 10;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const search = typeof req.query.search === "string" ? req.query.search : undefined;

    const partnerProfileId = req.query.partnerProfileId ? Number(req.query.partnerProfileId) : undefined;
    const managerProfileId = req.query.managerProfileId ? Number(req.query.managerProfileId) : undefined;
    const departmentId = req.query.departmentId ? Number(req.query.departmentId) : undefined;

    const where: any = {};
    if (status) where.status = status;
    if (Number.isFinite(partnerProfileId)) where.partnerProfileId = partnerProfileId;
    if (Number.isFinite(managerProfileId)) where.managerProfileId = managerProfileId;
    if (Number.isFinite(departmentId)) where.departmentId = departmentId;
    if (search) {
      where.OR = [
        { clientName: { contains: search, mode: "insensitive" } },
        { contactPerson: { contains: search, mode: "insensitive" } },
        { contactEmail: { contains: search, mode: "insensitive" } },
      ];
    }

    const skip = (page - 1) * pageSize;

    const [clients, total] = await Promise.all([
      prisma.client.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { clientName: "asc" },
        include: {
          partner: { select: { id: true, firstName: true, lastName: true } },
          manager: { select: { id: true, firstName: true, lastName: true } },
          department: { select: { id: true, name: true } },
        },
      }),
      prisma.client.count({ where }),
    ]);

    res.json(paginatedResponse(clients, total, page, pageSize, "Clients retrieved"));
  } catch (error: any) {
    console.error("Error fetching clients:", error);
    res.status(500).json(errorResponse("Failed to fetch clients", 500));
  }
});

// GET /clients/:clientId - Get client by ID
router.get("/:clientId", async (req, res) => {
  try {
    const clientId = parseId(req.params.clientId);
    if (!clientId) {
      res.status(400).json(errorResponse("Invalid client id", 400));
      return;
    }

    const client = await prisma.client.findUnique({
      where: { id: clientId },
      include: {
        partner: { select: { id: true, firstName: true, lastName: true } },
        manager: { select: { id: true, firstName: true, lastName: true } },
        department: { select: { id: true, name: true } },
      },
    });

    if (!client) {
      res.status(404).json(errorResponse("Client not found", 404));
      return;
    }

    res.json(successResponse(client, "Client retrieved"));
  } catch (error: any) {
    console.error("Error fetching client:", error);
    res.status(500).json(errorResponse("Failed to fetch client", 500));
  }
});

// POST /clients - Create client
router.post("/", async (req: AuthRequest, res) => {
  try {
    if (!isMarketingOrAdmin(req)) {
      res.status(403).json(
        errorResponse("Only marketing can submit new client intakes with engagement letters", 403)
      );
      return;
    }

    const {
      clientName,
      clientCode,
      industry,
      contactPerson,
      contactEmail,
      contactPhone,
      address,
      location,
      partnerProfileId,
      managerProfileId,
      departmentId,
      status,
      engagementLetter,
    } = req.body;

    if (!clientName || typeof clientName !== "string") {
      res.status(400).json(errorResponse("clientName is required", 400));
      return;
    }

    const letterPayload = engagementLetter && typeof engagementLetter === "object" ? engagementLetter : null;
    const documentId = letterPayload?.documentId ? Number(letterPayload.documentId) : NaN;
    const engagementType =
      typeof letterPayload?.engagementType === "string" ? letterPayload.engagementType.trim() : "";
    const feeAmountRaw = letterPayload?.feeAmount;
    const feeAmount = feeAmountRaw === undefined || feeAmountRaw === null || feeAmountRaw === ""
      ? NaN
      : Number(feeAmountRaw);

    // IMPLEMENTED: Engagement letter enforcement gate — client creation now requires a signed letter payload + uploaded document.
    if (!letterPayload) {
      res.status(400).json(
        errorResponse("engagementLetter payload is required when creating a client", 400)
      );
      return;
    }
    if (!Number.isFinite(documentId) || documentId <= 0) {
      res.status(400).json(errorResponse("engagementLetter.documentId is required", 400));
      return;
    }
    if (!engagementType) {
      res.status(400).json(errorResponse("engagementLetter.engagementType is required", 400));
      return;
    }
    if (!Number.isFinite(feeAmount) || feeAmount <= 0) {
      res.status(400).json(errorResponse("engagementLetter.feeAmount must be greater than 0", 400));
      return;
    }

    const existingDocument = await prisma.document.findUnique({
      where: { id: documentId },
      select: { id: true },
    });
    if (!existingDocument) {
      res.status(404).json(errorResponse("Engagement letter document not found", 404));
      return;
    }

    const existingLetterWithDocument = await prisma.engagementLetter.findFirst({
      where: { documentId },
      select: { id: true },
    });
    if (existingLetterWithDocument) {
      res.status(409).json(errorResponse("This document is already linked to an engagement letter", 409));
      return;
    }

    const created = await prisma.$transaction(async (tx) => {
      const normalizedClientCode =
        typeof clientCode === "string" && clientCode.trim()
          ? clientCode.trim().toUpperCase()
          : undefined;

      const createdClient = await tx.client.create({
        data: {
          clientName,
          clientCode: normalizedClientCode,
          industry,
          contactPerson,
          contactEmail,
          contactPhone,
          address,
          location,
          partnerProfileId: partnerProfileId ? Number(partnerProfileId) : undefined,
          managerProfileId: managerProfileId ? Number(managerProfileId) : undefined,
          departmentId: departmentId ? Number(departmentId) : undefined,
          status,
        },
        include: {
          partner: { select: { id: true, firstName: true, lastName: true } },
          manager: { select: { id: true, firstName: true, lastName: true } },
          department: { select: { id: true, name: true } },
        },
      });

      const clientCodeToUse = createdClient.clientCode || buildGeneratedClientCode(createdClient.id);
      const client =
        createdClient.clientCode
          ? createdClient
          : await tx.client.update({
              where: { id: createdClient.id },
              data: { clientCode: clientCodeToUse },
              include: {
                partner: { select: { id: true, firstName: true, lastName: true } },
                manager: { select: { id: true, firstName: true, lastName: true } },
                department: { select: { id: true, name: true } },
              },
            });

      const letter = await tx.engagementLetter.create({
        data: {
          clientId: client.id,
          documentId,
          jobTitle: typeof letterPayload?.jobTitle === "string" ? letterPayload.jobTitle : undefined,
          engagementType,
          feeAmount,
          currency:
            typeof letterPayload?.currency === "string" && letterPayload.currency.trim()
              ? letterPayload.currency.trim().toUpperCase()
              : "KES",
          startDate: letterPayload?.startDate ? new Date(letterPayload.startDate) : undefined,
          endDate: letterPayload?.endDate ? new Date(letterPayload.endDate) : undefined,
          scopeDescription:
            typeof letterPayload?.scopeDescription === "string"
              ? letterPayload.scopeDescription
              : undefined,
          termsConditions:
            typeof letterPayload?.termsConditions === "string"
              ? letterPayload.termsConditions
              : undefined,
          uploadedByProfileId: req.user?.profileId,
          status: EngagementLetterStatus.pending_review,
        },
        include: {
          document: { select: { id: true, fileName: true, filePath: true } },
        },
      });

      const existingClientOnboarding = await tx.clientOnboarding.findFirst({
        where: { clientId: client.id },
        select: { id: true },
      });

      // IMPLEMENTED: Multi-job onboarding support — additional letters for same client keep queue entries without violating unique clientId.
      const onboarding = await tx.clientOnboarding.create({
        data: {
          engagementLetterId: letter.id,
          clientId: existingClientOnboarding ? null : client.id,
          clientName: client.clientName,
          industry: client.industry || "",
          contactPerson: client.contactPerson || "",
          contactEmail: client.contactEmail || "",
          contactPhone: client.contactPhone || "",
          location: client.location || "",
          departmentId: client.departmentId,
          uploadedByProfileId: req.user?.profileId!,
          status: ClientOnboardingStatus.pending_hr_review,
        },
      });

      return { client, letter, onboarding };
    });

    await notifyProfilesByRoles(
      ["hr"],
      {
        title: "New client onboarding submitted",
        message: `Client "${created.client.clientName}" and engagement letter are awaiting HR review for job setup.`,
        link: `/client-onboarding-queue`,
        targetEntityType: "ClientOnboarding",
        targetEntityId: created.onboarding.id,
      },
      req
    );

    res.status(201).json(
      successResponse(
        {
          ...created.client,
          initialEngagementLetter: created.letter,
          onboardingId: created.onboarding.id,
        },
        "Client created",
        201
      )
    );
  } catch (error: any) {
    console.error("Error creating client:", error);
    res.status(500).json(errorResponse("Failed to create client", 500));
  }
});

// PATCH /clients/:clientId - Update client
router.patch("/:clientId", async (req, res) => {
  try {
    const clientId = parseId(req.params.clientId);
    if (!clientId) {
      res.status(400).json(errorResponse("Invalid client id", 400));
      return;
    }

    const updated = await prisma.client.update({
      where: { id: clientId },
      data: {
        clientName: req.body.clientName,
        clientCode: req.body.clientCode,
        industry: req.body.industry,
        contactPerson: req.body.contactPerson,
        contactEmail: req.body.contactEmail,
        contactPhone: req.body.contactPhone,
        address: req.body.address,
        location: req.body.location,
        partnerProfileId: req.body.partnerProfileId ? Number(req.body.partnerProfileId) : undefined,
        managerProfileId: req.body.managerProfileId ? Number(req.body.managerProfileId) : undefined,
        departmentId: req.body.departmentId ? Number(req.body.departmentId) : undefined,
        status: req.body.status,
      },
      include: {
        partner: { select: { id: true, firstName: true, lastName: true } },
        manager: { select: { id: true, firstName: true, lastName: true } },
        department: { select: { id: true, name: true } },
      },
    });

    res.json(successResponse(updated, "Client updated"));
  } catch (error: any) {
    console.error("Error updating client:", error);
    res.status(500).json(errorResponse("Failed to update client", 500));
  }
});

// DELETE /clients/:clientId - Delete client
router.delete("/:clientId", async (req, res) => {
  try {
    const clientId = parseId(req.params.clientId);
    if (!clientId) {
      res.status(400).json(errorResponse("Invalid client id", 400));
      return;
    }

    await prisma.client.delete({ where: { id: clientId } });
    res.json(successResponse({ id: clientId, deleted: true }, "Client deleted"));
  } catch (error: any) {
    console.error("Error deleting client:", error);
    res.status(500).json(errorResponse("Failed to delete client", 500));
  }
});

// GET /clients/:clientId/jobs - List jobs for a client
router.get("/:clientId/jobs", async (req, res) => {
  try {
    const clientId = parseId(req.params.clientId);
    if (!clientId) {
      res.status(400).json(errorResponse("Invalid client id", 400));
      return;
    }

    const jobs = await prisma.job.findMany({
      where: { clientId },
      include: {
        partner: { select: { id: true, firstName: true, lastName: true } },
        manager: { select: { id: true, firstName: true, lastName: true } },
        engagementLetter: { select: { id: true, jobTitle: true, status: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(successResponse(jobs, "Client jobs retrieved"));
  } catch (error: any) {
    console.error("Error fetching client jobs:", error);
    res.status(500).json(errorResponse("Failed to fetch client jobs", 500));
  }
});

// GET /clients/:clientId/engagement-letters - List engagement letters
router.get("/:clientId/engagement-letters", async (req, res) => {
  try {
    const clientId = parseId(req.params.clientId);
    if (!clientId) {
      res.status(400).json(errorResponse("Invalid client id", 400));
      return;
    }

    const letters = await prisma.engagementLetter.findMany({
      where: { clientId },
      include: engagementLetterIncludeWithFeedback,
      orderBy: { createdAt: "desc" },
    });

    res.json(successResponse(letters.map((letter: any) => decorateEngagementLetter(letter)), "Engagement letters retrieved"));
  } catch (error: any) {
    console.error("Error fetching engagement letters:", error);
    res.status(500).json(errorResponse("Failed to fetch engagement letters", 500));
  }
});

// POST /clients/:clientId/engagement-letters - Upload engagement letter metadata
router.post("/:clientId/engagement-letters", async (req: AuthRequest, res) => {
  try {
    if (!isMarketingOrAdmin(req)) {
      res.status(403).json(
        errorResponse("Only marketing can upload engagement letters for HR review", 403)
      );
      return;
    }

    const clientId = parseId(req.params.clientId);
    if (!clientId) {
      res.status(400).json(errorResponse("Invalid client id", 400));
      return;
    }

    const {
      documentId,
      departmentId,
      partnerProfileId,
      managerProfileId,
      jobTitle,
      engagementType,
      feeAmount,
      currency,
      startDate,
      endDate,
      scopeDescription,
      termsConditions,
    } = req.body;

    // IMPLEMENTED: Engagement letter enforcement gate — each letter requires an uploaded signed document reference.
    const parsedDocumentId = Number(documentId);
    if (!Number.isFinite(parsedDocumentId) || parsedDocumentId <= 0) {
      res.status(400).json(errorResponse("documentId is required", 400));
      return;
    }

    if (!engagementType) {
      res.status(400).json(errorResponse("engagementType is required", 400));
      return;
    }

    const parsedFeeAmount =
      feeAmount === undefined || feeAmount === null || feeAmount === ""
        ? undefined
        : Number(feeAmount);
    if (
      parsedFeeAmount !== undefined &&
      (!Number.isFinite(parsedFeeAmount) || parsedFeeAmount <= 0)
    ) {
      res.status(400).json(errorResponse("feeAmount must be greater than 0", 400));
      return;
    }

    const hasDepartmentId = hasOwn(req.body, "departmentId");
    const hasPartnerProfileId = hasOwn(req.body, "partnerProfileId");
    const hasManagerProfileId = hasOwn(req.body, "managerProfileId");

    const parsedDepartmentId = parseOptionalPositiveInt(departmentId);
    const parsedPartnerProfileId = parseOptionalPositiveInt(partnerProfileId);
    const parsedManagerProfileId = parseOptionalPositiveInt(managerProfileId);

    if (
      (hasDepartmentId && Number.isNaN(parsedDepartmentId)) ||
      (hasPartnerProfileId && Number.isNaN(parsedPartnerProfileId)) ||
      (hasManagerProfileId && Number.isNaN(parsedManagerProfileId))
    ) {
      res.status(400).json(errorResponse("Ownership fields must be valid positive ids", 400));
      return;
    }

    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) {
      res.status(404).json(errorResponse("Client not found", 404));
      return;
    }

    const existingDocument = await prisma.document.findUnique({
      where: { id: parsedDocumentId },
      select: { id: true },
    });
    if (!existingDocument) {
      res.status(404).json(errorResponse("Engagement letter document not found", 404));
      return;
    }

    const existingLetterWithDocument = await prisma.engagementLetter.findFirst({
      where: { documentId: parsedDocumentId },
      select: { id: true },
    });
    if (existingLetterWithDocument) {
      res.status(409).json(errorResponse("This document is already linked to an engagement letter", 409));
      return;
    }

    const created = await prisma.$transaction(async (tx) => {
      const routingClient =
        hasDepartmentId || hasPartnerProfileId || hasManagerProfileId
          ? await tx.client.update({
              where: { id: client.id },
              data: {
                departmentId: hasDepartmentId ? parsedDepartmentId : undefined,
                partnerProfileId: hasPartnerProfileId ? parsedPartnerProfileId : undefined,
                managerProfileId: hasManagerProfileId ? parsedManagerProfileId : undefined,
              },
            })
          : client;

      const createdLetter = await tx.engagementLetter.create({
        data: {
          clientId,
          documentId: parsedDocumentId,
          jobTitle,
          engagementType,
          feeAmount: parsedFeeAmount,
          currency,
          startDate: startDate ? new Date(startDate) : undefined,
          endDate: endDate ? new Date(endDate) : undefined,
          scopeDescription,
          termsConditions,
          uploadedByProfileId: req.user?.profileId,
          status: EngagementLetterStatus.pending_review,
        },
        include: {
          document: { select: { id: true, fileName: true, filePath: true, mimeType: true } },
        },
      });

      const existingClientOnboarding = await tx.clientOnboarding.findFirst({
        where: { clientId: routingClient.id },
        select: { id: true },
      });

      const onboarding = await tx.clientOnboarding.create({
        data: {
          engagementLetterId: createdLetter.id,
          // IMPLEMENTED: Multi-job onboarding support — keep client linkage on first onboarding, allow additional pending jobs for same client.
          clientId: existingClientOnboarding ? null : routingClient.id,
          clientName: routingClient.clientName,
          industry: routingClient.industry || "",
          contactPerson: routingClient.contactPerson || "",
          contactEmail: routingClient.contactEmail || "",
          contactPhone: routingClient.contactPhone || "",
          location: routingClient.location || "",
          departmentId: routingClient.departmentId,
          uploadedByProfileId: req.user?.profileId!,
          status: ClientOnboardingStatus.pending_hr_review,
        },
      });
      return {
        letter: createdLetter,
        onboarding,
        clientName: routingClient.clientName,
      };
    });

    await notifyProfilesByRoles(
      ["hr"],
      {
        title: "Engagement letter submitted for HR review",
        message: `Client "${created.clientName}" engagement letter is awaiting HR review for job setup.`,
        link: "/client-onboarding-queue",
        targetEntityType: "ClientOnboarding",
        targetEntityId: created.onboarding.id,
      },
      req
    );

    res.status(201).json(successResponse(created.letter, "Engagement letter created", 201));
  } catch (error: any) {
    console.error("Error creating engagement letter:", error);
    res.status(500).json(errorResponse("Failed to create engagement letter", 500));
  }
});

export default router;

