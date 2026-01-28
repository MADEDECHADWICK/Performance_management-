import { Router } from "express";
import { prisma } from "../prisma";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { errorResponse, paginatedResponse, successResponse } from "../utils/response";

const router = Router();

const parseNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

// GET /proposals/metrics - pipeline summary
router.get("/metrics", authMiddleware, async (_req: AuthRequest, res) => {
  try {
    const [totalCount, wonCount, lostCount] = await Promise.all([
      prisma.proposal.count(),
      prisma.proposal.count({ where: { status: "won" } }),
      prisma.proposal.count({ where: { status: "lost" } }),
    ]);

    const openStatuses = ["draft", "sent"] as const;
    const openProposals = await prisma.proposal.findMany({
      where: { status: { in: openStatuses } },
      select: { proposedFee: true, probability: true },
    });

    const pipelineValue = openProposals.reduce(
      (sum, proposal) => sum + Number(proposal.proposedFee || 0),
      0
    );
    const weightedPipeline = openProposals.reduce(
      (sum, proposal) =>
        sum + Number(proposal.proposedFee || 0) * (proposal.probability / 100),
      0
    );

    const avgDealSize = totalCount
      ? await prisma.proposal.aggregate({ _avg: { proposedFee: true } })
      : null;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const [wonThisMonth, lostThisMonth] = await Promise.all([
      prisma.proposal.count({
        where: {
          status: "won",
          wonAt: { gte: monthStart },
        },
      }),
      prisma.proposal.count({
        where: {
          status: "lost",
          updatedAt: { gte: monthStart },
        },
      }),
    ]);

    const hotLeads = await prisma.proposal.count({
      where: {
        status: { in: openStatuses },
        probability: { gte: 70 },
      },
    });

    const conversionRate =
      wonCount + lostCount > 0 ? (wonCount / (wonCount + lostCount)) * 100 : 0;

    const monthsBack = 6;
    const trendStart = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1), 1);
    const proposalsForTrend = await prisma.proposal.findMany({
      where: {
        OR: [
          { createdAt: { gte: trendStart } },
          { wonAt: { gte: trendStart } },
          { updatedAt: { gte: trendStart } },
        ],
      },
      select: {
        status: true,
        createdAt: true,
        wonAt: true,
        updatedAt: true,
      },
    });

    const formatMonth = (date: Date) =>
      date.toLocaleString("en-US", { month: "short", year: "2-digit" });

    const monthKeys = Array.from({ length: monthsBack }).map((_, index) => {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1 - index), 1);
      return {
        key: `${monthDate.getFullYear()}-${monthDate.getMonth()}`,
        label: formatMonth(monthDate),
        start: monthDate,
      };
    });

    const trendMap = new Map(
      monthKeys.map((item) => [item.key, { month: item.label, won: 0, lost: 0, created: 0 }])
    );

    const getKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}`;

    proposalsForTrend.forEach((proposal) => {
      const createdKey = getKey(proposal.createdAt);
      const createdEntry = trendMap.get(createdKey);
      if (createdEntry) createdEntry.created += 1;

      if (proposal.status === "won" && proposal.wonAt) {
        const wonKey = getKey(proposal.wonAt);
        const wonEntry = trendMap.get(wonKey);
        if (wonEntry) wonEntry.won += 1;
      }

      if (proposal.status === "lost") {
        const lostKey = getKey(proposal.updatedAt);
        const lostEntry = trendMap.get(lostKey);
        if (lostEntry) lostEntry.lost += 1;
      }
    });

    const pipelineTrend = monthKeys.map((item) => trendMap.get(item.key) || {
      month: item.label,
      won: 0,
      lost: 0,
      created: 0,
    });

    res.json(
      successResponse(
        {
          totalOpportunities: totalCount,
          pipelineValue,
          weightedPipelineValue: weightedPipeline,
          avgDealSize: Number(avgDealSize?._avg?.proposedFee || 0),
          conversionRate,
          wonThisMonth,
          lostThisMonth,
          hotLeads,
          pipelineTrend,
        },
        "Proposal metrics retrieved"
      )
    );
  } catch (error) {
    console.error("Error fetching proposal metrics:", error);
    res.status(500).json(errorResponse("Failed to fetch proposal metrics", 500));
  }
});

// GET /proposals - list proposals
router.get("/", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const page = parseNumber(req.query.page) || 1;
    const pageSize = parseNumber(req.query.pageSize) || 20;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const clientId = parseNumber(req.query.clientId);
    const search = typeof req.query.search === "string" ? req.query.search : undefined;

    const where: any = {};
    if (status) where.status = status;
    if (clientId) where.clientId = clientId;
    if (search) {
      where.OR = [
        { proposalTitle: { contains: search, mode: "insensitive" } },
        { serviceType: { contains: search, mode: "insensitive" } },
        { client: { clientName: { contains: search, mode: "insensitive" } } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.proposal.findMany({
        where,
        orderBy: { proposalDate: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          client: { select: { id: true, clientName: true, industry: true } },
          assignedPartner: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      prisma.proposal.count({ where }),
    ]);

    res.json(paginatedResponse(items, total, page, pageSize, "Proposals retrieved"));
  } catch (error) {
    console.error("Error fetching proposals:", error);
    res.status(500).json(errorResponse("Failed to fetch proposals", 500));
  }
});

// GET /proposals/:id
router.get("/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const proposalId = parseNumber(req.params.id);
    if (!proposalId) {
      return res.status(400).json(errorResponse("Invalid proposal id", 400));
    }

    const proposal = await prisma.proposal.findUnique({
      where: { id: proposalId },
      include: {
        client: { select: { id: true, clientName: true } },
        assignedPartner: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!proposal) {
      return res.status(404).json(errorResponse("Proposal not found", 404));
    }

    res.json(successResponse(proposal, "Proposal retrieved"));
  } catch (error) {
    console.error("Error fetching proposal:", error);
    res.status(500).json(errorResponse("Failed to fetch proposal", 500));
  }
});

// POST /proposals - create proposal
router.post("/", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const {
      clientId,
      proposalTitle,
      serviceType,
      proposedFee,
      currency = "KES",
      proposalDate,
      expectedStart,
      expectedDurationDays,
      status = "draft",
      probability = 50,
      assignedPartnerProfileId,
      notes,
    } = req.body;

    if (!clientId || !proposalTitle || !serviceType || !proposedFee || !proposalDate) {
      return res
        .status(400)
        .json(errorResponse("clientId, proposalTitle, serviceType, proposedFee, and proposalDate are required", 400));
    }

    const created = await prisma.$transaction(async (tx) => {
      const proposal = await tx.proposal.create({
        data: {
          clientId: Number(clientId),
          proposalTitle,
          serviceType,
          proposedFee: Number(proposedFee),
          currency,
          proposalDate: new Date(proposalDate),
          expectedStart: expectedStart ? new Date(expectedStart) : undefined,
          expectedDurationDays: expectedDurationDays ? Number(expectedDurationDays) : undefined,
          status,
          probability: Number(probability),
          createdByProfileId: req.user?.profileId,
          assignedPartnerProfileId: assignedPartnerProfileId ? Number(assignedPartnerProfileId) : undefined,
          notes,
          wonAt: status === "won" ? new Date() : undefined,
        },
        include: {
          client: {
            select: {
              id: true,
              clientName: true,
              industry: true,
              contactPerson: true,
              contactEmail: true,
              contactPhone: true,
              location: true,
              departmentId: true,
            },
          },
          assignedPartner: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      if (status === "won") {
        const uploaderProfileId = req.user?.profileId;
        if (!uploaderProfileId) {
          throw new Error("Missing uploader profile id for onboarding creation");
        }

        const engagementLetter = await tx.engagementLetter.create({
          data: {
            clientId: proposal.clientId,
            jobTitle: proposal.proposalTitle,
            engagementType: proposal.serviceType,
            feeAmount: proposal.proposedFee,
            currency: proposal.currency || "KES",
            startDate: proposal.expectedStart ?? undefined,
            endDate: proposal.expectedDurationDays
              ? new Date(
                  proposal.expectedStart
                    ? new Date(proposal.expectedStart).getTime() +
                        proposal.expectedDurationDays * 24 * 60 * 60 * 1000
                    : Date.now() + proposal.expectedDurationDays * 24 * 60 * 60 * 1000
                )
              : undefined,
            status: "pending_review",
            uploadedByProfileId: uploaderProfileId,
          },
        });

        const existingOnboardingForClient = await tx.clientOnboarding.findFirst({
          where: { clientId: proposal.clientId },
        });

        if (!existingOnboardingForClient) {
          await tx.clientOnboarding.create({
            data: {
              engagementLetterId: engagementLetter.id,
              clientId: proposal.clientId,
              clientName: proposal.client?.clientName || "Client",
              industry: proposal.client?.industry || "Unspecified",
              contactPerson: proposal.client?.contactPerson || "Pending",
              contactEmail: proposal.client?.contactEmail || "pending@ronalds.local",
              contactPhone: proposal.client?.contactPhone || "N/A",
              location: proposal.client?.location || "Unknown",
              departmentId: proposal.client?.departmentId ?? undefined,
              uploadedByProfileId: uploaderProfileId,
              notes: "Auto-created from won proposal.",
            },
          });
        }
      }

      return proposal;
    });

    res.status(201).json(successResponse(created, "Proposal created", 201));
  } catch (error) {
    console.error("Error creating proposal:", error);
    res.status(500).json(errorResponse("Failed to create proposal", 500));
  }
});

// PATCH /proposals/:id - update proposal
router.patch("/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const proposalId = parseNumber(req.params.id);
    if (!proposalId) {
      return res.status(400).json(errorResponse("Invalid proposal id", 400));
    }

    const existingProposal = await prisma.proposal.findUnique({
      where: { id: proposalId },
      include: { client: true },
    });

    if (!existingProposal) {
      return res.status(404).json(errorResponse("Proposal not found", 404));
    }

    const data = {
      proposalTitle: req.body.proposalTitle,
      serviceType: req.body.serviceType,
      proposedFee: req.body.proposedFee ? Number(req.body.proposedFee) : undefined,
      currency: req.body.currency,
      proposalDate: req.body.proposalDate ? new Date(req.body.proposalDate) : undefined,
      expectedStart: req.body.expectedStart ? new Date(req.body.expectedStart) : undefined,
      expectedDurationDays: req.body.expectedDurationDays
        ? Number(req.body.expectedDurationDays)
        : undefined,
      status: req.body.status,
      probability: req.body.probability ? Number(req.body.probability) : undefined,
      assignedPartnerProfileId: req.body.assignedPartnerProfileId
        ? Number(req.body.assignedPartnerProfileId)
        : undefined,
      notes: req.body.notes,
      wonAt: req.body.status === "won" ? new Date() : undefined,
      lostReason: req.body.status === "lost" ? req.body.lostReason : undefined,
    };

    const shouldCreateOnboarding =
      req.body.status === "won" && existingProposal.status !== "won";

    const updated = await prisma.$transaction(async (tx) => {
      const proposal = await tx.proposal.update({
        where: { id: proposalId },
        data,
        include: {
          client: { select: { id: true, clientName: true, industry: true, contactPerson: true, contactEmail: true, contactPhone: true, location: true, departmentId: true } },
          assignedPartner: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      if (shouldCreateOnboarding) {
        const uploaderProfileId = req.user?.profileId || existingProposal.createdByProfileId;
        if (!uploaderProfileId) {
          throw new Error("Missing uploader profile id for onboarding creation");
        }

        const existingLetter = await tx.engagementLetter.findFirst({
          where: {
            clientId: proposal.clientId,
            jobTitle: proposal.proposalTitle,
          },
          orderBy: { createdAt: "desc" },
        });

        const engagementLetter =
          existingLetter ??
          (await tx.engagementLetter.create({
            data: {
              clientId: proposal.clientId,
              jobTitle: proposal.proposalTitle,
              engagementType: proposal.serviceType,
              feeAmount: proposal.proposedFee,
              currency: proposal.currency || "KES",
              startDate: proposal.expectedStart ?? undefined,
              endDate: proposal.expectedDurationDays
                ? new Date(
                    proposal.expectedStart
                      ? new Date(proposal.expectedStart).getTime() +
                          proposal.expectedDurationDays * 24 * 60 * 60 * 1000
                      : Date.now() + proposal.expectedDurationDays * 24 * 60 * 60 * 1000
                  )
                : undefined,
              status: "pending_review",
              uploadedByProfileId: uploaderProfileId,
            },
          }));

        const existingOnboardingForClient = await tx.clientOnboarding.findFirst({
          where: { clientId: proposal.clientId },
        });

        if (!existingOnboardingForClient) {
          await tx.clientOnboarding.create({
            data: {
              engagementLetterId: engagementLetter.id,
              clientId: proposal.clientId,
              clientName: proposal.client?.clientName || "Client",
              industry: proposal.client?.industry || "Unspecified",
              contactPerson: proposal.client?.contactPerson || "Pending",
              contactEmail: proposal.client?.contactEmail || "pending@ronalds.local",
              contactPhone: proposal.client?.contactPhone || "N/A",
              location: proposal.client?.location || "Unknown",
              departmentId: proposal.client?.departmentId ?? undefined,
              uploadedByProfileId: uploaderProfileId,
              notes: "Auto-created from won proposal.",
            },
          });
        }
      }

      return proposal;
    });

    res.json(successResponse(updated, "Proposal updated"));
  } catch (error) {
    console.error("Error updating proposal:", error);
    res.status(500).json(errorResponse("Failed to update proposal", 500));
  }
});

export default router;
