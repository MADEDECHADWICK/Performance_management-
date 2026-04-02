import { Router } from "express";
import { ChecklistStatus, ClientOnboardingStatus, EngagementLetterStatus } from "@prisma/client";
import prisma from "../prisma";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { resolveRequestAccessRoles } from "../auth/accessRoles";
import { requireModuleAccess } from "../middleware/requireModuleAccess";
import { errorResponse, paginatedResponse, successResponse } from "../utils/response";
import { notifyHrGroup } from "../services/hrNotifications";
import { NotificationService } from "../services/notifications.service";

const router = Router();
const db = prisma as any;

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

const getPagination = (req: any) => {
  const page = Number(req.query.page) || 1;
  const pageSize = Number(req.query.pageSize) || 10;
  const skip = (page - 1) * pageSize;
  return { page, pageSize, skip };
};

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

const isHrOrAdmin = (req: AuthRequest) => {
  const roles = resolveRoleSet(req);
  return (
    roles.has("hr") ||
    roles.has("super_admin")
  );
};

const isMarketingOrAdmin = (req: AuthRequest) => {
  const roles = resolveRoleSet(req);
  return roles.has("marketing") || roles.has("super_admin");
};

const canManageChecklistForOnboarding = (
  req: AuthRequest,
  onboarding: { uploadedByProfileId: number; hrReviewerProfileId: number | null }
) => {
  if (isHrOrAdmin(req)) return true;
  const profileId = req.user?.profileId;
  if (!profileId) return false;
  return (
    onboarding.uploadedByProfileId === profileId ||
    onboarding.hrReviewerProfileId === profileId
  );
};

type ChecklistItemInput = {
  itemName: string;
  description?: string;
  orderIndex: number;
  requiresDocument: boolean;
  documentId?: number;
};

const parseChecklistItems = (items: unknown): ChecklistItemInput[] => {
  if (!Array.isArray(items) || items.length === 0) {
    const err = new Error("At least one checklist item is required");
    (err as any).statusCode = 400;
    throw err;
  }

  const parsed: ChecklistItemInput[] = [];
  items.forEach((raw, index) => {
    if (!raw || typeof raw !== "object") return;
    const payload = raw as Record<string, unknown>;
    const rawName = String(payload.itemName || "").trim();
    if (!rawName) return;
    const description =
      typeof payload.description === "string" && payload.description.trim()
        ? payload.description.trim()
        : undefined;
    const orderIndex = Number.isFinite(Number(payload.orderIndex))
      ? Number(payload.orderIndex)
      : index;
    parsed.push({
      itemName: rawName,
      description,
      orderIndex,
      requiresDocument: Boolean(payload.requiresDocument),
      documentId: Number.isFinite(Number(payload.documentId))
        ? Number(payload.documentId)
        : undefined,
    });
  });

  if (parsed.length === 0) {
    const err = new Error("Checklist items must include at least one valid itemName");
    (err as any).statusCode = 400;
    throw err;
  }

  return parsed;
};

const engagementLetterFeedbackSelect = {
  id: true,
  clientId: true,
  documentId: true,
  jobTitle: true,
  engagementType: true,
  status: true,
  feeAmount: true,
  currency: true,
  startDate: true,
  endDate: true,
  scopeDescription: true,
  termsConditions: true,
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

const decorateOnboarding = (item: any) => {
  if (!item) return item;
  return {
    ...item,
    engagementLetter: decorateEngagementLetter(item.engagementLetter),
  };
};

const toChecklistResponse = (checklistId: number) =>
  db.clientOnboardingChecklist.findUnique({
    where: { id: checklistId },
    include: {
      assignedBy: {
        select: { id: true, firstName: true, lastName: true },
      },
      items: {
        orderBy: { orderIndex: "asc" },
        include: {
          document: {
            select: { id: true, fileName: true, filePath: true },
          },
          completedBy: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      },
    },
  });

const recomputeChecklistProgress = async (checklistId: number) => {
  const items = await db.clientOnboardingChecklistItem.findMany({
    where: { checklistId },
    select: { isCompleted: true },
  });

  const totalItems = items.length;
  const completedItems = items.filter((item: { isCompleted: boolean }) => item.isCompleted).length;
  const completionPercent = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;
  const isCompleted = totalItems > 0 && completedItems === totalItems;

  return db.clientOnboardingChecklist.update({
    where: { id: checklistId },
    data: {
      totalItems,
      completedItems,
      completionPercent,
      status: isCompleted ? ChecklistStatus.completed : ChecklistStatus.in_progress,
      completedAt: isCompleted ? new Date() : null,
    },
  });
};

// GET /client-onboardings/upcoming-jobs
// Lists approved onboarding records with approved engagement letters and no job yet
router.get(
  "/upcoming-jobs",
  authMiddleware,
  requireModuleAccess("clients", "read"),
  async (req, res) => {
  try {
    const { page, pageSize, skip } = getPagination(req);

    const where: any = {
      status: { in: [ClientOnboardingStatus.approved, ClientOnboardingStatus.client_created] },
      jobId: null,
      engagementLetter: { status: EngagementLetterStatus.approved },
    };

    const [items, total] = await Promise.all([
      db.clientOnboarding.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          engagementLetter: {
            select: engagementLetterFeedbackSelect,
          },
          client: { select: { id: true, clientName: true } },
          department: { select: { id: true, name: true } },
          uploadedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      prisma.clientOnboarding.count({ where }),
    ]);

    res.json(
      paginatedResponse(
        items.map((item: any) => decorateOnboarding(item)),
        total,
        page,
        pageSize,
        "Upcoming jobs retrieved"
      )
    );
  } catch (error: any) {
    console.error("Error fetching upcoming jobs:", error);
    res.status(500).json(errorResponse("Failed to fetch upcoming jobs", 500));
  }
});

// GET /client-onboardings
router.get(
  "/",
  authMiddleware,
  requireModuleAccess("clients", "read"),
  async (req, res) => {
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
      db.clientOnboarding.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          engagementLetter: {
            select: engagementLetterFeedbackSelect,
          },
          client: { select: { id: true, clientName: true } },
          department: { select: { id: true, name: true } },
          uploadedBy: { select: { id: true, firstName: true, lastName: true } },
          hrReviewer: { select: { id: true, firstName: true, lastName: true } },
          checklist: {
            select: {
              id: true,
              checklistName: true,
              status: true,
              completionPercent: true,
              totalItems: true,
              completedItems: true,
            },
          },
        },
      }),
      prisma.clientOnboarding.count({ where }),
    ]);

    res.json(
      paginatedResponse(
        items.map((item: any) => decorateOnboarding(item)),
        total,
        page,
        pageSize,
        "Client onboardings retrieved"
      )
    );
  } catch (error: any) {
    console.error("Error fetching client onboardings:", error);
    res.status(500).json(errorResponse("Failed to fetch client onboardings", 500));
  }
});

// GET /client-onboardings/:id
router.get(
  "/:id",
  authMiddleware,
  requireModuleAccess("clients", "read"),
  async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json(errorResponse("Invalid client onboarding id", 400));
      return;
    }

    const onboarding = await db.clientOnboarding.findUnique({
      where: { id },
      include: {
        engagementLetter: {
          select: engagementLetterFeedbackSelect,
        },
        client: { select: { id: true, clientName: true } },
        department: { select: { id: true, name: true } },
        uploadedBy: { select: { id: true, firstName: true, lastName: true } },
        hrReviewer: { select: { id: true, firstName: true, lastName: true } },
        job: { select: { id: true, jobName: true, status: true } },
        checklist: {
          include: {
            assignedBy: { select: { id: true, firstName: true, lastName: true } },
            items: {
              orderBy: { orderIndex: "asc" },
              include: {
                document: { select: { id: true, fileName: true, filePath: true } },
                completedBy: { select: { id: true, firstName: true, lastName: true } },
              },
            },
          },
        },
      },
    });

    if (!onboarding) {
      res.status(404).json(errorResponse("Client onboarding not found", 404));
      return;
    }

    res.json(successResponse(decorateOnboarding(onboarding), "Client onboarding retrieved"));
  } catch (error: any) {
    console.error("Error fetching client onboarding:", error);
    res.status(500).json(errorResponse("Failed to fetch client onboarding", 500));
  }
});

// GET /client-onboardings/:id/checklist
router.get(
  "/:id/checklist",
  authMiddleware,
  requireModuleAccess("clients", "read"),
  async (req: AuthRequest, res) => {
    try {
      const id = parseId(req.params.id);
      if (!id) {
        res.status(400).json(errorResponse("Invalid client onboarding id", 400));
        return;
      }

      const onboarding = await prisma.clientOnboarding.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!onboarding) {
        res.status(404).json(errorResponse("Client onboarding not found", 404));
        return;
      }

      const checklist = await db.clientOnboardingChecklist.findUnique({
        where: { clientOnboardingId: id },
        include: {
          assignedBy: { select: { id: true, firstName: true, lastName: true } },
          items: {
            orderBy: { orderIndex: "asc" },
            include: {
              document: { select: { id: true, fileName: true, filePath: true } },
              completedBy: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
      });

      res.json(successResponse(checklist, checklist ? "Checklist retrieved" : "Checklist not assigned"));
    } catch (error: any) {
      console.error("Error fetching client onboarding checklist:", error);
      res.status(500).json(errorResponse("Failed to fetch checklist", 500));
    }
  }
);

// POST /client-onboardings/:id/checklist
// HR/Admin creates or replaces checklist items for this onboarding record
router.post(
  "/:id/checklist",
  authMiddleware,
  requireModuleAccess("clients", "write"),
  async (req: AuthRequest, res) => {
    try {
      if (!isHrOrAdmin(req)) {
        res.status(403).json(errorResponse("Only HR/Admin can create client onboarding checklists", 403));
        return;
      }

      const id = parseId(req.params.id);
      if (!id) {
        res.status(400).json(errorResponse("Invalid client onboarding id", 400));
        return;
      }

      const onboarding = await prisma.clientOnboarding.findUnique({
        where: { id },
        select: {
          id: true,
          clientName: true,
          uploadedByProfileId: true,
          hrReviewerProfileId: true,
        },
      });
      if (!onboarding) {
        res.status(404).json(errorResponse("Client onboarding not found", 404));
        return;
      }

      const checklistName =
        typeof req.body?.checklistName === "string" && req.body.checklistName.trim()
          ? req.body.checklistName.trim()
          : `Client Onboarding Checklist - ${onboarding.clientName}`;

      const dueDate =
        typeof req.body?.dueDate === "string" && req.body.dueDate.trim()
          ? new Date(req.body.dueDate)
          : undefined;
      if (dueDate && Number.isNaN(dueDate.getTime())) {
        res.status(400).json(errorResponse("Invalid dueDate. Expected ISO date.", 400));
        return;
      }

      const items = parseChecklistItems(req.body?.items);
      const actorProfileId = req.user?.profileId;
      if (!actorProfileId) {
        res.status(401).json(errorResponse("Profile context is required", 401));
        return;
      }

      const { checklistId, created } = await prisma.$transaction(async (tx: any) => {
        const existing = await tx.clientOnboardingChecklist.findUnique({
          where: { clientOnboardingId: id },
          select: { id: true },
        });

        if (existing) {
          await tx.clientOnboardingChecklist.update({
            where: { id: existing.id },
            data: {
              checklistName,
              dueDate: dueDate ?? null,
              assignedByProfileId: actorProfileId,
              status: ChecklistStatus.pending,
              completedItems: 0,
              totalItems: items.length,
              completionPercent: 0,
              completedAt: null,
            },
          });
          await tx.clientOnboardingChecklistItem.deleteMany({
            where: { checklistId: existing.id },
          });
          await tx.clientOnboardingChecklistItem.createMany({
            data: items.map((item, index) => ({
              checklistId: existing.id,
              itemName: item.itemName,
              description: item.description,
              orderIndex: Number.isFinite(item.orderIndex) ? item.orderIndex : index,
              requiresDocument: item.requiresDocument,
              documentId: item.documentId ?? null,
              isCompleted: false,
            })),
          });

          return { checklistId: existing.id, created: false };
        }

        const createdChecklist = await tx.clientOnboardingChecklist.create({
          data: {
            clientOnboardingId: id,
            checklistName,
            dueDate: dueDate ?? null,
            assignedByProfileId: actorProfileId,
            totalItems: items.length,
            completedItems: 0,
            completionPercent: 0,
            status: ChecklistStatus.pending,
          },
          select: { id: true },
        });

        await tx.clientOnboardingChecklistItem.createMany({
          data: items.map((item, index) => ({
            checklistId: createdChecklist.id,
            itemName: item.itemName,
            description: item.description,
            orderIndex: Number.isFinite(item.orderIndex) ? item.orderIndex : index,
            requiresDocument: item.requiresDocument,
            documentId: item.documentId ?? null,
            isCompleted: false,
          })),
        });

        return { checklistId: createdChecklist.id, created: true };
      });

      const checklist = await toChecklistResponse(checklistId);
      if (!checklist) {
        res.status(500).json(errorResponse("Checklist was created but failed to load", 500));
        return;
      }

      const notificationRecipients = new Set<number>();
      if (onboarding.uploadedByProfileId && onboarding.uploadedByProfileId !== req.user?.profileId) {
        notificationRecipients.add(onboarding.uploadedByProfileId);
      }
      if (onboarding.hrReviewerProfileId && onboarding.hrReviewerProfileId !== req.user?.profileId) {
        notificationRecipients.add(onboarding.hrReviewerProfileId);
      }

      await Promise.allSettled(
        Array.from(notificationRecipients).map((recipientProfileId) =>
          NotificationService.createNotification(
            {
              recipientProfileId,
              type: "action",
              title: "Client onboarding checklist assigned",
              message: `A checklist has been assigned for client onboarding "${onboarding.clientName}".`,
              actionRequired: true,
              link: `/client-onboarding-queue`,
            },
            {
              userId: req.user?.userId ?? 0,
              profileId: req.user?.profileId ?? 0,
              roleName: req.userRoles?.[0] || "system",
            }
          )
        )
      );

      res
        .status(created ? 201 : 200)
        .json(successResponse(checklist, created ? "Checklist created" : "Checklist updated", created ? 201 : 200));
    } catch (error: any) {
      const statusCode = error?.statusCode ?? 400;
      console.error("Error creating client onboarding checklist:", error);
      res.status(statusCode).json(errorResponse(error?.message || "Failed to create checklist", statusCode));
    }
  }
);

// PATCH /client-onboardings/:id/checklist/items/:itemId/complete
router.patch(
  "/:id/checklist/items/:itemId/complete",
  authMiddleware,
  requireModuleAccess("clients", "write"),
  async (req: AuthRequest, res) => {
    try {
      const id = parseId(req.params.id);
      const itemId = parseId(req.params.itemId);
      if (!id || !itemId) {
        res.status(400).json(errorResponse("Invalid onboarding id or item id", 400));
        return;
      }

      const onboarding = await prisma.clientOnboarding.findUnique({
        where: { id },
        select: { id: true, uploadedByProfileId: true, hrReviewerProfileId: true },
      });
      if (!onboarding) {
        res.status(404).json(errorResponse("Client onboarding not found", 404));
        return;
      }
      if (!canManageChecklistForOnboarding(req, onboarding)) {
        res.status(403).json(errorResponse("Forbidden", 403));
        return;
      }

      const checklist = await db.clientOnboardingChecklist.findUnique({
        where: { clientOnboardingId: id },
        select: { id: true },
      });
      if (!checklist) {
        res.status(404).json(errorResponse("Checklist not found", 404));
        return;
      }

      const item = await db.clientOnboardingChecklistItem.findUnique({
        where: { id: itemId },
        select: {
          id: true,
          checklistId: true,
          isCompleted: true,
          requiresDocument: true,
          documentId: true,
        },
      });
      if (!item || item.checklistId !== checklist.id) {
        res.status(404).json(errorResponse("Checklist item not found", 404));
        return;
      }
      if (item.requiresDocument && !item.documentId) {
        res.status(400).json(errorResponse("Document required before completing this item", 400));
        return;
      }

      if (!item.isCompleted) {
        await db.clientOnboardingChecklistItem.update({
          where: { id: itemId },
          data: {
            isCompleted: true,
            completedByProfileId: req.user?.profileId,
            completedAt: new Date(),
          },
        });
      }

      await recomputeChecklistProgress(checklist.id);
      const fullChecklist = await toChecklistResponse(checklist.id);
      res.json(successResponse(fullChecklist, "Checklist item completed"));
    } catch (error: any) {
      const statusCode = error?.statusCode ?? 400;
      console.error("Error completing client onboarding checklist item:", error);
      res.status(statusCode).json(errorResponse(error?.message || "Failed to complete checklist item", statusCode));
    }
  }
);

// PATCH /client-onboardings/:id/checklist/items/:itemId/document
router.patch(
  "/:id/checklist/items/:itemId/document",
  authMiddleware,
  requireModuleAccess("clients", "write"),
  async (req: AuthRequest, res) => {
    try {
      const id = parseId(req.params.id);
      const itemId = parseId(req.params.itemId);
      const documentId = Number(req.body?.documentId);
      if (!id || !itemId || !Number.isFinite(documentId) || documentId <= 0) {
        res.status(400).json(errorResponse("Invalid onboarding id, item id, or document id", 400));
        return;
      }

      const onboarding = await prisma.clientOnboarding.findUnique({
        where: { id },
        select: { id: true, uploadedByProfileId: true, hrReviewerProfileId: true },
      });
      if (!onboarding) {
        res.status(404).json(errorResponse("Client onboarding not found", 404));
        return;
      }
      if (!canManageChecklistForOnboarding(req, onboarding)) {
        res.status(403).json(errorResponse("Forbidden", 403));
        return;
      }

      const checklist = await db.clientOnboardingChecklist.findUnique({
        where: { clientOnboardingId: id },
        select: { id: true },
      });
      if (!checklist) {
        res.status(404).json(errorResponse("Checklist not found", 404));
        return;
      }

      const item = await db.clientOnboardingChecklistItem.findUnique({
        where: { id: itemId },
        select: { id: true, checklistId: true },
      });
      if (!item || item.checklistId !== checklist.id) {
        res.status(404).json(errorResponse("Checklist item not found", 404));
        return;
      }

      const document = await prisma.document.findUnique({
        where: { id: documentId },
        select: { id: true, entityType: true, entityId: true },
      });
      if (!document) {
        res.status(404).json(errorResponse("Document not found", 404));
        return;
      }

      const entityType = String(document.entityType || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      if (entityType !== "clientonboardingchecklist" || document.entityId !== checklist.id) {
        res.status(400).json(errorResponse("Document is not linked to this checklist", 400));
        return;
      }

      await db.clientOnboardingChecklistItem.update({
        where: { id: itemId },
        data: { documentId },
      });

      const fullChecklist = await toChecklistResponse(checklist.id);
      res.json(successResponse(fullChecklist, "Checklist document attached"));
    } catch (error: any) {
      const statusCode = error?.statusCode ?? 400;
      console.error("Error attaching client onboarding checklist document:", error);
      res.status(statusCode).json(errorResponse(error?.message || "Failed to attach checklist document", statusCode));
    }
  }
);

// POST /client-onboardings
// Marketing submits a client onboarding request with an engagement letter
router.post(
  "/",
  authMiddleware,
  requireModuleAccess("clients", "write"),
  async (req: AuthRequest, res) => {
  try {
    if (!isMarketingOrAdmin(req)) {
      res.status(403).json(errorResponse("Only marketing can submit client onboarding to HR", 403));
      return;
    }

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
      eventType: "client_onboarding.submitted",
      targetEntityType: "ClientOnboarding",
      targetEntityId: onboarding.id,
      canonicalRoute: "/client-onboarding-queue",
      priority: "medium",
      requiredPermission: "module.clients.read",
      templateLabel: "client_onboarding.submitted",
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
router.post(
  "/:id/approve",
  authMiddleware,
  requireModuleAccess("clients", "admin"),
  async (req: AuthRequest, res) => {
  try {
    if (!isHrOrAdmin(req)) {
      res.status(403).json(errorResponse("Only HR/Admin can approve client onboarding", 403));
      return;
    }

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
        notes: null,
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
              eventType: "client_onboarding.approved_for_manager_review",
              priority: "medium",
              targetEntityType: "ClientOnboarding",
              targetEntityId: updated.id,
              canonicalRoute: `/hr-queue?onboardingId=${updated.id}`,
              requiredPermission: "module.clients.read",
              templateLabel: "client_onboarding.approved_for_manager_review",
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
router.post(
  "/:id/reject",
  authMiddleware,
  requireModuleAccess("clients", "admin"),
  async (req: AuthRequest, res) => {
  try {
    if (!isHrOrAdmin(req)) {
      res.status(403).json(errorResponse("Only HR/Admin can reject client onboarding", 403));
      return;
    }

    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json(errorResponse("Invalid client onboarding id", 400));
      return;
    }

    const reason =
      typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (!reason) {
      res.status(400).json(errorResponse("A review point is required before rejecting onboarding", 400));
      return;
    }

    const onboarding = await prisma.clientOnboarding.findUnique({
      where: { id },
      select: {
        id: true,
        clientId: true,
        clientName: true,
        uploadedByProfileId: true,
      },
    });
    if (!onboarding) {
      res.status(404).json(errorResponse("Client onboarding not found", 404));
      return;
    }

    const updated = await prisma.clientOnboarding.update({
      where: { id },
      data: {
        status: ClientOnboardingStatus.rejected,
        hrReviewerProfileId: req.user?.profileId,
        notes: reason,
      },
    });

    if (
      onboarding.uploadedByProfileId &&
      onboarding.uploadedByProfileId !== req.user?.profileId
    ) {
      await NotificationService.createNotification(
        {
          recipientProfileId: onboarding.uploadedByProfileId,
          type: "action",
          title: "Client details returned by HR",
          message: `HR returned "${onboarding.clientName}" with a review point: ${reason}`,
          actionRequired: true,
          link: onboarding.clientId
            ? `/clients/${onboarding.clientId}/edit?onboardingId=${onboarding.id}&resubmit=1`
            : `/client-onboarding-queue`,
          clientId: onboarding.clientId ?? undefined,
          eventType: "client_onboarding.rejected",
          priority: "high",
          targetEntityType: "ClientOnboarding",
          targetEntityId: onboarding.id,
          canonicalRoute: onboarding.clientId
            ? `/clients/${onboarding.clientId}/edit?onboardingId=${onboarding.id}&resubmit=1`
            : "/client-onboarding-queue",
          requiredPermission: "module.clients.read",
          templateLabel: "client_onboarding.rejected",
        },
        {
          userId: req.user?.userId ?? 0,
          profileId: req.user?.profileId ?? 0,
          roleName: req.userRoles?.[0] || "system",
        }
      );
    }

    res.json(successResponse(updated, "Client onboarding rejected"));
  } catch (error: any) {
    console.error("Error rejecting client onboarding:", error);
    res.status(500).json(errorResponse("Failed to reject client onboarding", 500));
  }
});

// POST /client-onboardings/:id/resubmit
router.post(
  "/:id/resubmit",
  authMiddleware,
  requireModuleAccess("clients", "write"),
  async (req: AuthRequest, res) => {
    try {
      if (!isMarketingOrAdmin(req)) {
        res.status(403).json(errorResponse("Only marketing can resubmit onboarding to HR", 403));
        return;
      }

      const id = parseId(req.params.id);
      if (!id) {
        res.status(400).json(errorResponse("Invalid client onboarding id", 400));
        return;
      }

      const onboarding = await prisma.clientOnboarding.findUnique({
        where: { id },
        include: {
          client: true,
          engagementLetter: {
            include: {
              document: { select: { id: true, fileName: true, filePath: true, mimeType: true } },
              statusTransitions: {
                where: { toStatus: EngagementLetterStatus.rejected },
                orderBy: { createdAt: "desc" },
                take: 1,
                select: {
                  reason: true,
                  createdAt: true,
                  changedBy: {
                    select: { id: true, firstName: true, lastName: true },
                  },
                },
              },
            },
          },
        },
      });

      if (!onboarding) {
        res.status(404).json(errorResponse("Client onboarding not found", 404));
        return;
      }

      if (
        onboarding.status !== ClientOnboardingStatus.rejected &&
        onboarding.engagementLetter?.status !== EngagementLetterStatus.rejected
      ) {
        res
          .status(400)
          .json(errorResponse("Only rejected onboarding items can be resubmitted", 400));
        return;
      }

      const resolvedClientId = onboarding.clientId ?? onboarding.engagementLetter?.clientId;
      if (!resolvedClientId) {
        res.status(400).json(errorResponse("Unable to resolve the client for this onboarding", 400));
        return;
      }

      const {
        clientName,
        clientCode,
        industry,
        contactPerson,
        contactEmail,
        contactPhone,
        location,
        address,
        departmentId,
        partnerProfileId,
        managerProfileId,
        status,
        documentId,
        engagementType,
        jobTitle,
        feeAmount,
        currency,
        startDate,
        endDate,
        scopeDescription,
        termsConditions,
      } = req.body || {};

      const hasDepartmentId = hasOwn(req.body, "departmentId");
      const hasPartnerProfileId = hasOwn(req.body, "partnerProfileId");
      const hasManagerProfileId = hasOwn(req.body, "managerProfileId");
      const hasDocumentId = hasOwn(req.body, "documentId");

      const parsedDepartmentId = parseOptionalPositiveInt(departmentId);
      const parsedPartnerProfileId = parseOptionalPositiveInt(partnerProfileId);
      const parsedManagerProfileId = parseOptionalPositiveInt(managerProfileId);
      const parsedDocumentId = parseOptionalPositiveInt(documentId);

      if (
        (hasDepartmentId && Number.isNaN(parsedDepartmentId)) ||
        (hasPartnerProfileId && Number.isNaN(parsedPartnerProfileId)) ||
        (hasManagerProfileId && Number.isNaN(parsedManagerProfileId)) ||
        (hasDocumentId && Number.isNaN(parsedDocumentId))
      ) {
        res.status(400).json(errorResponse("Payload contains invalid ids", 400));
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

      if (hasDocumentId && parsedDocumentId) {
        const existingDocument = await prisma.document.findUnique({
          where: { id: parsedDocumentId },
          select: { id: true },
        });
        if (!existingDocument) {
          res.status(404).json(errorResponse("Replacement engagement letter document not found", 404));
          return;
        }

        const documentAlreadyLinked = await prisma.engagementLetter.findFirst({
          where: {
            documentId: parsedDocumentId,
            NOT: { id: onboarding.engagementLetterId },
          },
          select: { id: true },
        });
        if (documentAlreadyLinked) {
          res
            .status(409)
            .json(errorResponse("This document is already linked to another engagement letter", 409));
          return;
        }
      }

      const normalizedEngagementType =
        typeof engagementType === "string" && engagementType.trim()
          ? engagementType.trim()
          : undefined;
      const normalizedJobTitle =
        typeof jobTitle === "string" ? jobTitle.trim() || null : undefined;
      const normalizedCurrency =
        typeof currency === "string" ? currency.trim() || null : undefined;
      const normalizedScopeDescription =
        typeof scopeDescription === "string"
          ? scopeDescription.trim() || null
          : undefined;
      const normalizedTermsConditions =
        typeof termsConditions === "string"
          ? termsConditions.trim() || null
          : undefined;
      const normalizedStartDate =
        typeof startDate === "string" && startDate.trim()
          ? new Date(startDate)
          : hasOwn(req.body, "startDate")
            ? null
            : undefined;
      const normalizedEndDate =
        typeof endDate === "string" && endDate.trim()
          ? new Date(endDate)
          : hasOwn(req.body, "endDate")
            ? null
            : undefined;

      const currentStartDate = onboarding.engagementLetter.startDate
        ? new Date(onboarding.engagementLetter.startDate).toISOString().slice(0, 10)
        : null;
      const currentEndDate = onboarding.engagementLetter.endDate
        ? new Date(onboarding.engagementLetter.endDate).toISOString().slice(0, 10)
        : null;
      const nextStartDate = normalizedStartDate
        ? normalizedStartDate.toISOString().slice(0, 10)
        : normalizedStartDate === null
          ? null
          : undefined;
      const nextEndDate = normalizedEndDate
        ? normalizedEndDate.toISOString().slice(0, 10)
        : normalizedEndDate === null
          ? null
          : undefined;

      const hasLetterChanges =
        (hasDocumentId &&
          parsedDocumentId !== (onboarding.engagementLetter.documentId ?? null)) ||
        (hasOwn(req.body, "engagementType") &&
          normalizedEngagementType !== onboarding.engagementLetter.engagementType) ||
        (hasOwn(req.body, "jobTitle") &&
          normalizedJobTitle !== (onboarding.engagementLetter.jobTitle ?? null)) ||
        (hasOwn(req.body, "feeAmount") &&
          parsedFeeAmount !==
            (onboarding.engagementLetter.feeAmount === null ||
            onboarding.engagementLetter.feeAmount === undefined
              ? undefined
              : Number(onboarding.engagementLetter.feeAmount))) ||
        (hasOwn(req.body, "currency") &&
          normalizedCurrency !== (onboarding.engagementLetter.currency ?? null)) ||
        (hasOwn(req.body, "startDate") && nextStartDate !== currentStartDate) ||
        (hasOwn(req.body, "endDate") && nextEndDate !== currentEndDate) ||
        (hasOwn(req.body, "scopeDescription") &&
          normalizedScopeDescription !==
            (onboarding.engagementLetter.scopeDescription ?? null)) ||
        (hasOwn(req.body, "termsConditions") &&
          normalizedTermsConditions !==
            (onboarding.engagementLetter.termsConditions ?? null));

      const shouldResetLetterForReview =
        onboarding.engagementLetter.status === EngagementLetterStatus.rejected ||
        hasLetterChanges;

      const updatedOnboarding = await prisma.$transaction(async (tx: any) => {
        const updatedClient = await tx.client.update({
          where: { id: resolvedClientId },
          data: {
            clientName:
              typeof clientName === "string" && clientName.trim()
                ? clientName.trim()
                : undefined,
            clientCode:
              typeof clientCode === "string" && clientCode.trim()
                ? clientCode.trim()
                : undefined,
            industry:
              typeof industry === "string" && industry.trim() ? industry.trim() : undefined,
            contactPerson:
              typeof contactPerson === "string" && contactPerson.trim()
                ? contactPerson.trim()
                : undefined,
            contactEmail:
              typeof contactEmail === "string" && contactEmail.trim()
                ? contactEmail.trim()
                : undefined,
            contactPhone:
              typeof contactPhone === "string" && contactPhone.trim()
                ? contactPhone.trim()
                : undefined,
            location:
              typeof location === "string" && location.trim() ? location.trim() : undefined,
            address:
              typeof address === "string" && address.trim() ? address.trim() : undefined,
            departmentId: hasDepartmentId ? parsedDepartmentId : undefined,
            partnerProfileId: hasPartnerProfileId ? parsedPartnerProfileId : undefined,
            managerProfileId: hasManagerProfileId ? parsedManagerProfileId : undefined,
            status:
              status === "active" || status === "inactive" ? status : undefined,
          },
        });

        if (shouldResetLetterForReview) {
          await tx.engagementLetter.update({
            where: { id: onboarding.engagementLetterId },
            data: {
              documentId: hasDocumentId ? parsedDocumentId : undefined,
              engagementType: normalizedEngagementType,
              jobTitle: normalizedJobTitle === null ? null : normalizedJobTitle,
              feeAmount: parsedFeeAmount,
              currency: normalizedCurrency === null ? null : normalizedCurrency,
              startDate: normalizedStartDate,
              endDate: normalizedEndDate,
              scopeDescription: normalizedScopeDescription,
              termsConditions: normalizedTermsConditions,
              status: EngagementLetterStatus.pending_review,
              approvedAt: null,
              approvedByProfileId: null,
            },
          });

          await tx.statusTransition.create({
            data: {
              entityType: "EngagementLetter",
              entityId: onboarding.engagementLetterId,
              fromStatus: onboarding.engagementLetter.status,
              toStatus: EngagementLetterStatus.pending_review,
              reason: "Resubmitted by marketing after HR feedback",
              changedByProfileId: req.user?.profileId,
              engagementLetterId: onboarding.engagementLetterId,
              clientId: resolvedClientId,
            },
          });
        }

        await tx.clientOnboarding.update({
          where: { id: onboarding.id },
          data: {
            clientName: updatedClient.clientName,
            industry: updatedClient.industry || "",
            contactPerson: updatedClient.contactPerson || "",
            contactEmail: updatedClient.contactEmail || "",
            contactPhone: updatedClient.contactPhone || "",
            location: updatedClient.location || "",
            departmentId: updatedClient.departmentId,
            status: ClientOnboardingStatus.pending_hr_review,
            hrReviewerProfileId: null,
          },
        });

        return tx.clientOnboarding.findUnique({
          where: { id: onboarding.id },
          include: {
            engagementLetter: {
              select: engagementLetterFeedbackSelect,
            },
            client: { select: { id: true, clientName: true } },
            department: { select: { id: true, name: true } },
            uploadedBy: { select: { id: true, firstName: true, lastName: true } },
            hrReviewer: { select: { id: true, firstName: true, lastName: true } },
            checklist: {
              select: {
                id: true,
                checklistName: true,
                status: true,
                completionPercent: true,
                totalItems: true,
                completedItems: true,
              },
            },
          },
        });
      });

      await notifyHrGroup(
        {
          title: "Client onboarding resubmitted",
          body: `Marketing resubmitted "${updatedOnboarding?.clientName || onboarding.clientName}" for HR review.`,
          relatedEntityId: onboarding.id,
          eventType: "client_onboarding.resubmitted",
          targetEntityType: "ClientOnboarding",
          targetEntityId: onboarding.id,
          canonicalRoute: "/client-onboarding-queue",
          priority: "medium",
          requiredPermission: "module.clients.read",
          templateLabel: "client_onboarding.resubmitted",
        },
        req
      );

      res.json(successResponse(decorateOnboarding(updatedOnboarding), "Client onboarding resubmitted"));
    } catch (error: any) {
      console.error("Error resubmitting client onboarding:", error);
      res.status(500).json(errorResponse("Failed to resubmit client onboarding", 500));
    }
  }
);

export default router;
