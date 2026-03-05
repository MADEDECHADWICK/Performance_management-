import { Router } from "express";
import { ChecklistStatus, ClientOnboardingStatus, EngagementLetterStatus } from "@prisma/client";
import prisma from "../prisma";
import { authMiddleware, AuthRequest } from "../middleware/auth";
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
    [
      ...(req.userRoles || []),
      ...(req.user?.authRoles || []),
      req.profile?.role?.name || "",
    ]
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

    res.json(paginatedResponse(items, total, page, pageSize, "Client onboardings retrieved"));
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

    res.json(successResponse(onboarding, "Client onboarding retrieved"));
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
router.post(
  "/:id/approve",
  authMiddleware,
  requireModuleAccess("clients", "admin"),
  async (req: AuthRequest, res) => {
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
router.post(
  "/:id/reject",
  authMiddleware,
  requireModuleAccess("clients", "admin"),
  async (req: AuthRequest, res) => {
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
