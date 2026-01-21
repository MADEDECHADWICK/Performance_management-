import { Router } from "express";
import { EngagementLetterStatus } from "@prisma/client";
import prisma from "../prisma";
import { AuthRequest } from "../middleware/auth";
import { errorResponse, paginatedResponse, successResponse } from "../utils/response";

const router = Router();

const parseId = (value: string) => {
  const id = Number(value);
  return Number.isFinite(id) ? id : null;
};

// Engagement letter approvals (must come before /:clientId routes)
router.post(
  "/engagement-letters/:letterId/approve",
  async (req: AuthRequest, res) => {
    try {
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
        include: {
          document: { select: { id: true, fileName: true, filePath: true } },
        },
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

      res.json(successResponse(updated, "Engagement letter approved"));
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
      const letterId = parseId(req.params.letterId);
      if (!letterId) {
        res.status(400).json(errorResponse("Invalid engagement letter id", 400));
        return;
      }

      const reason = typeof req.body?.reason === "string" ? req.body.reason : undefined;

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
          status: EngagementLetterStatus.rejected,
          approvedByProfileId: req.user?.profileId,
          approvedAt: new Date(),
        },
        include: {
          document: { select: { id: true, fileName: true, filePath: true } },
        },
      });

      await prisma.statusTransition.create({
        data: {
          entityType: "EngagementLetter",
          entityId: letterId,
          fromStatus: letter.status,
          toStatus: EngagementLetterStatus.rejected,
          reason,
          changedByProfileId: req.user?.profileId,
          engagementLetterId: letterId,
        },
      });

      res.json(successResponse(updated, "Engagement letter rejected"));
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
    } = req.body;

    if (!clientName || typeof clientName !== "string") {
      res.status(400).json(errorResponse("clientName is required", 400));
      return;
    }

    const client = await prisma.client.create({
      data: {
        clientName,
        clientCode,
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

    res.status(201).json(successResponse(client, "Client created", 201));
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
      include: {
        document: { select: { id: true, fileName: true, filePath: true, mimeType: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(successResponse(letters, "Engagement letters retrieved"));
  } catch (error: any) {
    console.error("Error fetching engagement letters:", error);
    res.status(500).json(errorResponse("Failed to fetch engagement letters", 500));
  }
});

// POST /clients/:clientId/engagement-letters - Upload engagement letter metadata
router.post("/:clientId/engagement-letters", async (req: AuthRequest, res) => {
  try {
    const clientId = parseId(req.params.clientId);
    if (!clientId) {
      res.status(400).json(errorResponse("Invalid client id", 400));
      return;
    }

    const {
      documentId,
      jobTitle,
      engagementType,
      feeAmount,
      currency,
      startDate,
      endDate,
      scopeDescription,
      termsConditions,
    } = req.body;

    if (!engagementType) {
      res.status(400).json(errorResponse("engagementType is required", 400));
      return;
    }

    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) {
      res.status(404).json(errorResponse("Client not found", 404));
      return;
    }

    const letter = await prisma.engagementLetter.create({
      data: {
        clientId,
        documentId: documentId ? Number(documentId) : undefined,
        jobTitle,
        engagementType,
        feeAmount,
        currency,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        scopeDescription,
        termsConditions,
        uploadedByProfileId: req.user?.profileId,
        status: EngagementLetterStatus.pending_review,
      },
      include: {
        document: { select: { id: true, fileName: true, filePath: true } },
      },
    });

    res.status(201).json(successResponse(letter, "Engagement letter created", 201));
  } catch (error: any) {
    console.error("Error creating engagement letter:", error);
    res.status(500).json(errorResponse("Failed to create engagement letter", 500));
  }
});

export default router;
