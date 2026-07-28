import { Router } from "express";
import { NotificationType, Prisma, ProposalStatus, ProposalTeamMemberStatus } from "@prisma/client";
import { prisma } from "../prisma";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { resolveRequestAccessRoles } from "../auth/accessRoles";
import { errorResponse, paginatedResponse, successResponse } from "../utils/response";
import { notifyHrGroup } from "../services/hrNotifications";
import { NotificationService } from "../services/notifications.service";

const router = Router();

const WORKFLOW_OPEN_STATUSES: ProposalStatus[] = [
  "draft",
  "sent",
  "submitted_to_manager",
  "manager_changes_requested",
  "manager_approved",
  "assigned_to_bd",
  "bd_in_progress",
  "bd_changes_requested",
  "ready_for_client_submission",
  "submitted_to_client",
];

const MANAGER_APPROVED_STATUSES: ProposalStatus[] = [
  "manager_approved",
  "assigned_to_bd",
  "bd_in_progress",
  "bd_changes_requested",
  "ready_for_client_submission",
  "submitted_to_client",
  "won",
  "lost",
];

const proposalInclude = {
  client: { select: { id: true, clientName: true, industry: true } },
  department: { select: { id: true, name: true, departmentCode: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  assignedPartner: { select: { id: true, firstName: true, lastName: true } },
  manager: { select: { id: true, firstName: true, lastName: true } },
  sourceProfile: { select: { id: true, firstName: true, lastName: true } },
  reviewerProfile: { select: { id: true, firstName: true, lastName: true } },
  bdOwner: { select: { id: true, firstName: true, lastName: true } },
  teamMembers: {
    include: {
      profile: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          positionTitle: true,
          departmentId: true,
        },
      },
      approvedBy: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { createdAt: "asc" as const },
  },
};

const taskTemplates = [
  {
    type: "tender",
    label: "Tender",
    tasks: [
      "Obtain and study the tender requirements",
      "Confirm eligibility and mandatory documents",
      "Coordinate technical and financial inputs",
      "Prepare compliance matrix",
      "Review pricing, staffing, and assumptions",
      "Submit final tender package and track outcome",
    ],
  },
  {
    type: "proposal",
    label: "Proposal",
    tasks: [
      "Confirm client need and requested service",
      "Prepare scope, methodology, team, and fee sections",
      "Route employee draft for manager approval",
      "Route approved draft to BD for final editing",
      "Store final Google Workspace proposal link",
      "Submit to client and capture feedback",
    ],
  },
  {
    type: "eoi",
    label: "Expression of Interest",
    tasks: [
      "Review EOI requirements",
      "Prepare firm profile and relevant credentials",
      "Collect team CVs and evidence of experience",
      "BD final review and formatting",
      "Submit before deadline",
    ],
  },
  {
    type: "quotation",
    label: "Quotation",
    tasks: [
      "Confirm requested service and assumptions",
      "Prepare fee quotation",
      "Review pricing with manager or partner",
      "Send final quotation and track response",
    ],
  },
  {
    type: "prequalification",
    label: "Prequalification",
    tasks: [
      "Review prequalification requirements",
      "Collect statutory and firm profile documents",
      "Complete forms and declarations",
      "Submit final package",
      "Track approval status",
    ],
  },
];

const parseNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseDate = (value: unknown) => {
  if (!value) return undefined;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const normalizeRole = (value: string | null | undefined) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const resolveRoleSet = (req: AuthRequest) =>
  new Set(resolveRequestAccessRoles(req).map((role) => normalizeRole(role)).filter(Boolean));

const hasAnyRole = (req: AuthRequest, roles: string[]) => {
  const roleSet = resolveRoleSet(req);
  return roles.some((role) => roleSet.has(role));
};

const isElevated = (req: AuthRequest) => hasAnyRole(req, ["super_admin", "hr", "gmp"]);
const isBdRole = (req: AuthRequest) => hasAnyRole(req, ["marketing"]);
const isManagerLike = (req: AuthRequest) =>
  hasAnyRole(req, ["manager", "partner", "super_admin", "hr", "gmp"]);

const profileIdOf = (req: AuthRequest) => req.profile?.id ?? req.user?.profileId;

const canExecuteEmployeeProposalWork = (
  proposal: { status: ProposalStatus; teamMembers: { profileId: number; status: ProposalTeamMemberStatus }[] },
  profileId?: number | null
) => {
  if (!profileId) return false;
  if (!MANAGER_APPROVED_STATUSES.includes(proposal.status)) return false;
  return proposal.teamMembers.some(
    (member) => member.profileId === profileId && member.status === "approved"
  );
};

const canSubmitEmployeeDraftLink = (
  proposal: {
    status: ProposalStatus;
    createdByProfileId: number | null;
    teamMembers: { profileId: number; status: ProposalTeamMemberStatus }[];
  },
  profileId?: number | null
) => {
  if (!profileId) return false;
  if (!MANAGER_APPROVED_STATUSES.includes(proposal.status)) return false;
  if (proposal.createdByProfileId === profileId) return true;
  return proposal.teamMembers.some(
    (member) => member.profileId === profileId && member.status === "approved"
  );
};

const isReviewStatus = (status: unknown): status is ProposalStatus =>
  status === "draft" || status === "submitted_to_manager";

const buildScopedWhere = async (req: AuthRequest): Promise<Prisma.ProposalWhereInput> => {
  const profileId = profileIdOf(req);
  if (!profileId) return { id: -1 };
  if (isElevated(req) || isBdRole(req)) return {};

  const roleSet = resolveRoleSet(req);

  if (roleSet.has("partner")) {
    const departments = await prisma.department.findMany({
      where: { partnerProfileId: profileId },
      select: { id: true },
    });
    return {
      OR: [
        { assignedPartnerProfileId: profileId },
        { departmentId: { in: departments.map((department) => department.id) } },
        { teamMembers: { some: { profileId } } },
        { createdByProfileId: profileId },
      ],
    };
  }

  if (roleSet.has("manager")) {
    const directReports = await prisma.profile.findMany({
      where: { managerId: profileId },
      select: { id: true },
    });
    const reportIds = directReports.map((profile) => profile.id);
    return {
      OR: [
        { managerProfileId: profileId },
        { createdByProfileId: profileId },
        { createdByProfileId: { in: reportIds } },
        { teamMembers: { some: { profileId: { in: [profileId, ...reportIds] } } } },
      ],
    };
  }

  return {
    OR: [{ createdByProfileId: profileId }, { teamMembers: { some: { profileId } } }],
  };
};

const assertCanSeeProposal = async (req: AuthRequest, proposalId: number) => {
  const where = await buildScopedWhere(req);
  const proposal = await prisma.proposal.findFirst({
    where: { AND: [{ id: proposalId }, where] },
    include: proposalInclude,
  });
  if (!proposal) {
    throw { statusCode: 404, message: "Proposal not found" };
  }
  return proposal;
};

const buildMutationData = (body: Record<string, unknown>): Prisma.ProposalUncheckedUpdateInput => {
  const data: Record<string, unknown> = {};
  const textFields = [
    "proposalTitle",
    "serviceType",
    "currency",
    "notes",
    "lostReason",
    "proposalType",
    "requestedService",
    "sourceName",
    "reviewerName",
    "employeeDraftLink",
    "bdFinalProposalLink",
    "finalSubmissionStatus",
    "awardStatus",
    "clientFeedback",
    "managerDecisionNote",
  ] as const;

  for (const field of textFields) {
    if (body[field] !== undefined) {
      data[field] = body[field] === null ? null : String(body[field]);
    }
  }

  const numberFields = [
    "proposedFee",
    "probability",
    "expectedDurationDays",
    "assignedPartnerProfileId",
    "managerProfileId",
    "sourceProfileId",
    "reviewerProfileId",
    "bdOwnerProfileId",
    "departmentId",
    "timeTakenHours",
  ] as const;
  for (const field of numberFields) {
    if (body[field] !== undefined) {
      data[field] = body[field] === null || body[field] === "" ? null : Number(body[field]);
    }
  }

  const dateFields = [
    "proposalDate",
    "expectedStart",
    "deadlineDate",
    "dateAssigned",
    "employeeSubmissionDate",
    "finalSubmittedAt",
  ] as const;
  for (const field of dateFields) {
    if (body[field] !== undefined) {
      data[field] = body[field] ? new Date(String(body[field])) : null;
    }
  }

  if (body.status !== undefined) {
    data.status = String(body.status) as ProposalStatus;
    if (body.status === "won") data.wonAt = new Date();
  }

  if (body.clientId !== undefined) {
    data.clientId = body.clientId ? Number(body.clientId) : null;
  }
  if (body.clientName !== undefined) {
    data.clientName = body.clientName ? String(body.clientName).trim() : null;
  }

  return data as Prisma.ProposalUncheckedUpdateInput;
};

const syncTeamMembers = async (
  tx: Prisma.TransactionClient,
  proposalId: number,
  memberIds: unknown,
  status: ProposalTeamMemberStatus
) => {
  if (!Array.isArray(memberIds)) return;
  const uniqueIds = Array.from(new Set(memberIds.map(Number).filter((id) => Number.isInteger(id))));
  for (const profileId of uniqueIds) {
    await tx.proposalTeamMember.upsert({
      where: { proposalId_profileId: { proposalId, profileId } },
      update: { status },
      create: { proposalId, profileId, status },
    });
  }
};

const maybeCreateOnboardingForWon = async (
  tx: Prisma.TransactionClient,
  proposal: Awaited<ReturnType<typeof prisma.proposal.findUnique>>,
  uploaderProfileId: number | null | undefined
) => {
  if (!proposal || proposal.status !== "won" || !proposal.clientId || !uploaderProfileId) {
    return null;
  }

  const existingOnboardingForClient = await tx.clientOnboarding.findFirst({
    where: { clientId: proposal.clientId },
  });
  if (existingOnboardingForClient) return null;

  const client = await tx.client.findUnique({ where: { id: proposal.clientId } });
  if (!client) return null;

  const engagementLetter = await tx.engagementLetter.create({
    data: {
      clientId: proposal.clientId,
      jobTitle: proposal.proposalTitle,
      engagementType: proposal.serviceType,
      feeAmount: proposal.proposedFee,
      currency: proposal.currency || "KES",
      startDate: proposal.expectedStart ?? undefined,
      status: "pending_review",
      uploadedByProfileId: uploaderProfileId,
    },
  });

  return tx.clientOnboarding.create({
    data: {
      engagementLetterId: engagementLetter.id,
      clientId: proposal.clientId,
      clientName: client.clientName || "Client",
      industry: client.industry || "Unspecified",
      contactPerson: client.contactPerson || "Pending",
      contactEmail: client.contactEmail || "pending@ronalds.local",
      contactPhone: client.contactPhone || "N/A",
      location: client.location || "Unknown",
      departmentId: client.departmentId ?? undefined,
      uploadedByProfileId: uploaderProfileId,
      notes: "Auto-created from won proposal.",
    },
  });
};

router.get(
  "/metrics",
  authMiddleware,
  async (req: AuthRequest, res) => {
    try {
      const scopedWhere = await buildScopedWhere(req);
      const [totalCount, wonCount, lostCount] = await Promise.all([
        prisma.proposal.count({ where: scopedWhere }),
        prisma.proposal.count({ where: { AND: [scopedWhere, { status: "won" }] } }),
        prisma.proposal.count({ where: { AND: [scopedWhere, { status: "lost" }] } }),
      ]);

      const openProposals = await prisma.proposal.findMany({
        where: { AND: [scopedWhere, { status: { in: WORKFLOW_OPEN_STATUSES } }] },
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
        ? await prisma.proposal.aggregate({ _avg: { proposedFee: true }, where: scopedWhere })
        : null;
      const conversionRate =
        wonCount + lostCount > 0 ? (wonCount / (wonCount + lostCount)) * 100 : 0;
      const hotLeads = await prisma.proposal.count({
        where: { AND: [scopedWhere, { status: { in: WORKFLOW_OPEN_STATUSES }, probability: { gte: 70 } }] },
      });

      res.json(
        successResponse(
          {
            totalOpportunities: totalCount,
            pipelineValue,
            weightedPipelineValue: weightedPipeline,
            avgDealSize: Number(avgDealSize?._avg?.proposedFee || 0),
            conversionRate,
            hotLeads,
            wonThisMonth: 0,
            lostThisMonth: 0,
          },
          "Proposal metrics retrieved"
        )
      );
    } catch (error) {
      console.error("Error fetching proposal metrics:", error);
      res.status(500).json(errorResponse("Failed to fetch proposal metrics", 500));
    }
  }
);

router.get(
  "/context",
  authMiddleware,
  async (_req: AuthRequest, res) => {
    try {
      const [clients, departments, profiles] = await Promise.all([
        prisma.client.findMany({
          orderBy: { clientName: "asc" },
          take: 500,
          select: { id: true, clientName: true, industry: true },
        }),
        prisma.department.findMany({
          orderBy: { name: "asc" },
          take: 500,
          select: { id: true, name: true, departmentCode: true, departmentHeadId: true, partnerProfileId: true },
        }),
        prisma.profile.findMany({
          where: { status: "active" },
          orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
          take: 1000,
          select: {
            id: true,
            firstName: true,
            lastName: true,
            positionTitle: true,
            departmentId: true,
            managerId: true,
            isPartner: true,
            user: {
              select: {
                email: true,
                roles: { select: { role: { select: { name: true } } } },
              },
            },
          },
        }),
      ]);
      res.json(successResponse({ clients, departments, profiles }, "Proposal context retrieved"));
    } catch (error) {
      console.error("Error fetching proposal context:", error);
      res.status(500).json(errorResponse("Failed to fetch proposal context", 500));
    }
  }
);

router.get("/task-templates", authMiddleware, async (_req, res) => {
  res.json(successResponse(taskTemplates, "Proposal task templates retrieved"));
});

router.get("/my", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const profileId = profileIdOf(req);
    if (!profileId) return res.status(401).json(errorResponse("Profile not resolved", 401));

    const page = parseNumber(req.query.page) || 1;
    const pageSize = parseNumber(req.query.pageSize) || 20;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const search = typeof req.query.search === "string" ? req.query.search : undefined;

    const where: Prisma.ProposalWhereInput = {
      OR: [{ createdByProfileId: profileId }, { teamMembers: { some: { profileId } } }],
    };
    if (status) where.status = status as ProposalStatus;
    if (search) {
      where.AND = [
        {
          OR: [
            { proposalTitle: { contains: search, mode: "insensitive" } },
            { serviceType: { contains: search, mode: "insensitive" } },
            { clientName: { contains: search, mode: "insensitive" } },
            { client: { clientName: { contains: search, mode: "insensitive" } } },
          ],
        },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.proposal.findMany({
        where,
        orderBy: { proposalDate: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: proposalInclude,
      }),
      prisma.proposal.count({ where }),
    ]);

    res.json(paginatedResponse(items, total, page, pageSize, "My proposals retrieved"));
  } catch (error) {
    console.error("Error fetching my proposals:", error);
    res.status(500).json(errorResponse("Failed to fetch proposals", 500));
  }
});

router.get(
  "/time-loggable",
  authMiddleware,
  async (req: AuthRequest, res) => {
    try {
      const profileId = profileIdOf(req);
      if (!profileId) return res.status(401).json(errorResponse("Profile not resolved", 401));
      const assignments = await prisma.proposalTeamMember.findMany({
        where: {
          profileId,
          status: "approved",
          proposal: { status: { in: MANAGER_APPROVED_STATUSES } },
        },
        include: {
          proposal: {
            select: {
              id: true,
              proposalTitle: true,
              clientName: true,
              client: { select: { id: true, clientName: true } },
            },
          },
        },
        orderBy: { updatedAt: "desc" },
      });
      res.json(successResponse(assignments, "Time-loggable proposals retrieved"));
    } catch (error) {
      console.error("Error fetching time-loggable proposals:", error);
      res.status(500).json(errorResponse("Failed to fetch time-loggable proposals", 500));
    }
  }
);

router.get(
  "/",
  authMiddleware,
  async (req: AuthRequest, res) => {
    try {
      const page = parseNumber(req.query.page) || 1;
      const pageSize = parseNumber(req.query.pageSize) || 20;
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const clientId = parseNumber(req.query.clientId);
      const search = typeof req.query.search === "string" ? req.query.search : undefined;

      const where: Prisma.ProposalWhereInput = await buildScopedWhere(req);
      if (status) where.status = status as ProposalStatus;
      if (clientId) where.clientId = clientId;
      if (search) {
        where.AND = [
          ...(Array.isArray(where.AND) ? where.AND : []),
          {
            OR: [
              { proposalTitle: { contains: search, mode: "insensitive" } },
              { serviceType: { contains: search, mode: "insensitive" } },
              { clientName: { contains: search, mode: "insensitive" } },
              { client: { clientName: { contains: search, mode: "insensitive" } } },
            ],
          },
        ];
      }

      const [items, total] = await Promise.all([
        prisma.proposal.findMany({
          where,
          orderBy: { proposalDate: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: proposalInclude,
        }),
        prisma.proposal.count({ where }),
      ]);

      res.json(paginatedResponse(items, total, page, pageSize, "Proposals retrieved"));
    } catch (error) {
      console.error("Error fetching proposals:", error);
      res.status(500).json(errorResponse("Failed to fetch proposals", 500));
    }
  }
);

router.get(
  "/:id",
  authMiddleware,
  async (req: AuthRequest, res) => {
    try {
      const proposalId = parseNumber(req.params.id);
      if (!proposalId) return res.status(400).json(errorResponse("Invalid proposal id", 400));
      const proposal = await assertCanSeeProposal(req, proposalId);
      res.json(successResponse(proposal, "Proposal retrieved"));
    } catch (error: any) {
      res.status(error.statusCode || 500).json(errorResponse(error.message || "Failed to fetch proposal", error.statusCode || 500));
    }
  }
);

router.post(
  "/",
  authMiddleware,
  async (req: AuthRequest, res) => {
    try {
      const body = req.body || {};
      const clientId = parseNumber(body.clientId);
      const clientName = typeof body.clientName === "string" ? body.clientName.trim() : "";
      const requestedService = String(body.requestedService || body.serviceType || "").trim();
      const proposalTitle = String(body.proposalTitle || `${clientName || "Client"} - ${requestedService}`).trim();

      if (!proposalTitle || !requestedService) {
        return res.status(400).json(errorResponse("proposalTitle and requestedService/serviceType are required", 400));
      }
      if (!clientId && !clientName) {
        return res.status(400).json(errorResponse("Either clientId or clientName is required", 400));
      }

      const creatorProfileId = profileIdOf(req);
      const bdOwned = isBdRole(req) || isElevated(req);
      if (!bdOwned && body.employeeDraftLink) {
        return res
          .status(403)
          .json(errorResponse("Create the proposal request first. Employee draft work requires manager approval.", 403));
      }
      if (!bdOwned && body.status !== undefined && !isReviewStatus(body.status)) {
        return res
          .status(403)
          .json(errorResponse("Only BD, HR, GMP, or super admin can create proposals beyond manager-review status", 403));
      }

      const managerProfileId = parseNumber(body.managerProfileId);
      const assignedPartnerProfileId = parseNumber(body.assignedPartnerProfileId);
      const departmentId = parseNumber(body.departmentId);
      const initialStatus = bdOwned
        ? ((body.status as ProposalStatus | undefined) ?? "bd_in_progress")
        : body.submitToManager === false
          ? "draft"
          : "submitted_to_manager";
      if (!bdOwned && initialStatus === "submitted_to_manager" && (!managerProfileId || !assignedPartnerProfileId || !departmentId)) {
        return res
          .status(400)
          .json(errorResponse("Department, partner in charge, and manager in charge are required before submitting to manager review", 400));
      }
      const teamStatus: ProposalTeamMemberStatus = bdOwned ? "approved" : "pending_manager_approval";

      const created = await prisma.$transaction(async (tx) => {
        const proposal = await tx.proposal.create({
          data: {
            clientId,
            clientName: clientId ? undefined : clientName,
            proposalTitle,
            serviceType: requestedService,
            requestedService,
            proposedFee: Number(body.proposedFee || body.value || 0),
            currency: String(body.currency || "KES"),
            proposalDate: parseDate(body.proposalDate) || new Date(),
            expectedStart: parseDate(body.expectedStart),
            expectedDurationDays: parseNumber(body.expectedDurationDays),
            deadlineDate: parseDate(body.deadlineDate),
            dateAssigned: parseDate(body.dateAssigned),
            employeeSubmissionDate: parseDate(body.employeeSubmissionDate),
            status: initialStatus,
            probability: Number(body.probability || 50),
            createdByProfileId: creatorProfileId,
            assignedPartnerProfileId,
            managerProfileId,
            sourceProfileId: parseNumber(body.sourceProfileId),
            reviewerProfileId: parseNumber(body.reviewerProfileId),
            bdOwnerProfileId: parseNumber(body.bdOwnerProfileId),
            departmentId,
            proposalType: body.proposalType ? String(body.proposalType) : undefined,
            sourceName: body.sourceName ? String(body.sourceName) : undefined,
            reviewerName: body.reviewerName ? String(body.reviewerName) : undefined,
            employeeDraftLink: bdOwned && body.employeeDraftLink ? String(body.employeeDraftLink) : undefined,
            notes: body.notes ? String(body.notes) : undefined,
            wonAt: initialStatus === "won" ? new Date() : undefined,
          },
        });
        const requestedTeamIds = [
          ...(Array.isArray(body.teamMemberProfileIds) ? body.teamMemberProfileIds : []),
          ...(creatorProfileId ? [creatorProfileId] : []),
        ];
        await syncTeamMembers(tx, proposal.id, requestedTeamIds, teamStatus);
        return tx.proposal.findUnique({ where: { id: proposal.id }, include: proposalInclude });
      });

      if (created && managerProfileId && created.status === "submitted_to_manager") {
        try {
          await NotificationService.createNotification(
            {
              recipientProfileId: managerProfileId,
              type: NotificationType.action,
              title: "Proposal awaiting review",
              message: `${created.createdBy?.firstName || "A team member"} submitted "${created.proposalTitle}" for manager approval.`,
              actionRequired: true,
              link: "/business-development",
            },
            {
              userId: req.user?.userId || 0,
              profileId: creatorProfileId || 0,
            }
          );
        } catch (notificationError) {
          console.warn("proposal_manager_notification_failed", notificationError);
        }
      }

      res.status(201).json(successResponse(created, "Proposal created", 201));
    } catch (error) {
      console.error("Error creating proposal:", error);
      res.status(500).json(errorResponse("Failed to create proposal", 500));
    }
  }
);

router.post(
  "/:id/manager-decision",
  authMiddleware,
  async (req: AuthRequest, res) => {
    try {
      const proposalId = parseNumber(req.params.id);
      if (!proposalId) return res.status(400).json(errorResponse("Invalid proposal id", 400));
      if (!isManagerLike(req)) {
        return res.status(403).json(errorResponse("Manager, partner, HR, GMP, or super admin access required", 403));
      }

      const existing = await assertCanSeeProposal(req, proposalId);
      const actorProfileId = profileIdOf(req);
      const decision = String(req.body?.decision || "").toLowerCase();
      const nextStatus: ProposalStatus =
        decision === "approve"
          ? "assigned_to_bd"
          : decision === "changes_requested"
            ? "manager_changes_requested"
            : "manager_rejected";

      const updated = await prisma.$transaction(async (tx) => {
        const approvedIds = Array.isArray(req.body?.approvedTeamMemberIds)
          ? req.body.approvedTeamMemberIds.map(Number).filter(Number.isInteger)
          : existing.teamMembers
              .filter((member) => !["rejected", "removed"].includes(member.status))
              .map((member) => member.profileId);
        const rejectedIds = Array.isArray(req.body?.rejectedTeamMemberIds)
          ? req.body.rejectedTeamMemberIds.map(Number).filter(Number.isInteger)
          : [];

        if (decision === "approve" && approvedIds.length > 0) {
          await tx.proposalTeamMember.updateMany({
            where: { proposalId, profileId: { in: approvedIds } },
            data: { status: "approved", approvedByProfileId: actorProfileId, approvedAt: new Date() },
          });
        }
        if (rejectedIds.length > 0) {
          await tx.proposalTeamMember.updateMany({
            where: { proposalId, profileId: { in: rejectedIds } },
            data: {
              status: "rejected",
              approvedByProfileId: actorProfileId,
              approvedAt: new Date(),
              rejectionReason: req.body?.note ? String(req.body.note) : null,
            },
          });
        }

        await tx.proposal.update({
          where: { id: proposalId },
          data: {
            status: nextStatus,
            managerDecisionNote: req.body?.note ? String(req.body.note) : null,
          },
        });
        return tx.proposal.findUnique({ where: { id: proposalId }, include: proposalInclude });
      });

      res.json(successResponse(updated, "Manager decision saved"));
    } catch (error: any) {
      console.error("Error saving manager decision:", error);
      res.status(error.statusCode || 500).json(errorResponse(error.message || "Failed to save manager decision", error.statusCode || 500));
    }
  }
);

router.patch(
  "/:id/team-members/:teamMemberId",
  authMiddleware,
  async (req: AuthRequest, res) => {
    try {
      const proposalId = parseNumber(req.params.id);
      const teamMemberId = parseNumber(req.params.teamMemberId);
      if (!proposalId || !teamMemberId) {
        return res.status(400).json(errorResponse("Invalid proposal or team member id", 400));
      }
      if (!isManagerLike(req)) {
        return res.status(403).json(errorResponse("Manager, partner, HR, GMP, or super admin access required", 403));
      }
      await assertCanSeeProposal(req, proposalId);
      const existingTeamMember = await prisma.proposalTeamMember.findFirst({
        where: { id: teamMemberId, proposalId },
        select: { id: true },
      });
      if (!existingTeamMember) {
        return res.status(404).json(errorResponse("Proposal team member not found", 404));
      }
      const status = String(req.body?.status || "approved") as ProposalTeamMemberStatus;
      if (!["approved", "rejected", "removed", "pending_manager_approval"].includes(status)) {
        return res.status(400).json(errorResponse("Invalid team member status", 400));
      }
      const updated = await prisma.proposalTeamMember.update({
        where: { id: teamMemberId },
        data: {
          status,
          approvedByProfileId: profileIdOf(req),
          approvedAt: ["approved", "rejected"].includes(status) ? new Date() : null,
          rejectionReason: req.body?.rejectionReason ? String(req.body.rejectionReason) : null,
        },
        include: { profile: true, approvedBy: true },
      });
      res.json(successResponse(updated, "Proposal team member updated"));
    } catch (error: any) {
      console.error("Error updating proposal team member:", error);
      res.status(error.statusCode || 500).json(errorResponse(error.message || "Failed to update proposal team member", error.statusCode || 500));
    }
  }
);

router.patch(
  "/:id/bd",
  authMiddleware,
  async (req: AuthRequest, res) => {
    try {
      const proposalId = parseNumber(req.params.id);
      if (!proposalId) return res.status(400).json(errorResponse("Invalid proposal id", 400));
      if (!isBdRole(req) && !isElevated(req)) {
        return res.status(403).json(errorResponse("BD/marketing, HR, GMP, or super admin access required", 403));
      }
      await assertCanSeeProposal(req, proposalId);
      const data = buildMutationData(req.body || {});
      if (!data.status) data.status = "bd_in_progress";
      if (data.status === "submitted_to_client" && !data.finalSubmittedAt) {
        data.finalSubmittedAt = new Date();
      }
      const updated = await prisma.proposal.update({
        where: { id: proposalId },
        data,
        include: proposalInclude,
      });
      res.json(successResponse(updated, "BD proposal details updated"));
    } catch (error: any) {
      console.error("Error updating BD proposal:", error);
      res.status(error.statusCode || 500).json(errorResponse(error.message || "Failed to update BD proposal", error.statusCode || 500));
    }
  }
);

router.patch(
  "/:id",
  authMiddleware,
  async (req: AuthRequest, res) => {
    try {
      const proposalId = parseNumber(req.params.id);
      if (!proposalId) return res.status(400).json(errorResponse("Invalid proposal id", 400));
      const existing = await assertCanSeeProposal(req, proposalId);

      const requesterProfileId = profileIdOf(req);
      const requesterCanFinalize = isBdRole(req) || isElevated(req);
      const requesterCanManageReview = isManagerLike(req);
      if (!requesterCanFinalize) {
        const allowedFields = requesterCanManageReview
          ? new Set(["notes", "managerDecisionNote"])
          : new Set(["employeeDraftLink", "notes"]);
        const blockedFields = Object.keys(req.body || {}).filter((key) => !allowedFields.has(key));
        if (blockedFields.length > 0) {
          return res
            .status(403)
            .json(errorResponse("This role cannot update proposal finalization or workflow fields from this endpoint", 403));
        }
      }
      if (!requesterCanFinalize && req.body?.status !== undefined) {
        return res.status(403).json(errorResponse("Employees cannot change proposal workflow status", 403));
      }
      if (
        !requesterCanFinalize &&
        !requesterCanManageReview &&
        req.body?.employeeDraftLink &&
        !canSubmitEmployeeDraftLink(existing, requesterProfileId)
      ) {
        return res
          .status(403)
          .json(errorResponse("Manager approval is required before submitting employee draft work", 403));
      }

      const data = buildMutationData(req.body || {});
      const teamMemberIds = req.body?.teamMemberProfileIds;
      const updatedResult = await prisma.$transaction(async (tx) => {
        await tx.proposal.update({ where: { id: proposalId }, data });
        if (Array.isArray(teamMemberIds)) {
          await syncTeamMembers(tx, proposalId, teamMemberIds, "pending_manager_approval");
        }
        const updated = await tx.proposal.findUnique({ where: { id: proposalId }, include: proposalInclude });
        const onboarding =
          data.status === "won" && existing.status !== "won"
            ? await maybeCreateOnboardingForWon(tx, updated, profileIdOf(req) || existing.createdByProfileId)
            : null;
        return { updated, onboarding };
      });

      if (updatedResult.onboarding) {
        await notifyHrGroup(
          {
            title: "New onboarding from won proposal",
            body: `Client onboarding for "${updatedResult.onboarding.clientName}" is awaiting HR review.`,
            relatedEntityId: updatedResult.onboarding.id,
            link: "/client-onboarding-queue",
            canonicalRoute: "/client-onboarding-queue",
            eventType: "client_onboarding.submitted",
            targetEntityType: "ClientOnboarding",
            targetEntityId: updatedResult.onboarding.id,
            priority: "medium",
            templateLabel: "client_onboarding.submitted",
          },
          req
        );
      }

      res.json(successResponse(updatedResult.updated, "Proposal updated"));
    } catch (error: any) {
      console.error("Error updating proposal:", error);
      res.status(error.statusCode || 500).json(errorResponse(error.message || "Failed to update proposal", error.statusCode || 500));
    }
  }
);

export default router;
