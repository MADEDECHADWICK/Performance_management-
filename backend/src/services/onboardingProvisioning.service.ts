import { OnboardingStatus, Prisma, PrismaClient } from "@prisma/client";
import prisma from "../prisma";
import {
  DEFAULT_INDUCTION_CHECKLIST_NAME,
  getDefaultInductionTemplate,
} from "./inductionTemplateCatalog";

type DbClient = PrismaClient | Prisma.TransactionClient;

type EnsureOnboardingProvisioningInput = {
  profileId: number;
  hrOwnerProfileId?: number | null;
  assignedByProfileId?: number | null;
  onboardingCaseId?: number | null;
  startDate?: Date | null;
  dueDate?: Date | null;
  notes?: string | null;
};

const DEFAULT_CHECKLIST_NAME = DEFAULT_INDUCTION_CHECKLIST_NAME;
const DEFAULT_ONBOARDING_DUE_DAYS = 14;
const CHECKLIST_ASSIGNMENT_NOTIFICATION_TITLE = "Onboarding checklist assigned";
const DEFAULT_CHECKLIST_ITEMS = getDefaultInductionTemplate().items;

const onboardingDueDate = (baseDate?: Date | null) => {
  if (baseDate) return baseDate;
  const now = new Date();
  return new Date(now.getTime() + DEFAULT_ONBOARDING_DUE_DAYS * 24 * 60 * 60 * 1000);
};

const isProfileOnboardingComplete = (profile: {
  onboardingStatus: OnboardingStatus;
  onboardingChecklistCompleted: boolean;
  inductionCompleted: boolean;
}) =>
  profile.onboardingStatus === OnboardingStatus.completed &&
  profile.onboardingChecklistCompleted &&
  profile.inductionCompleted;

const createDefaultChecklistItems = async (db: DbClient, checklistId: number) => {
  await db.inductionChecklistItem.createMany({
    data: DEFAULT_CHECKLIST_ITEMS.map((item, index) => ({
      checklistId,
      itemName: item.itemName,
      description: item.description,
      orderIndex: index + 1,
      sectionKey: item.sectionKey,
      sectionLabel: item.sectionLabel,
      ownerRole: item.ownerRole ?? null,
      requiresDocument: item.requiresDocument ?? false,
      itemType: item.itemType ?? "task",
      resourceUrl: item.resourceUrl ?? null,
      comments: item.comments ?? null,
      isCompleted: false,
      completedByProfileId: null,
      completedAt: null,
    })),
  });
};

const ensureChecklistAssignmentNotification = async (
  db: DbClient,
  recipientProfileId: number
) => {
  const existing = await db.notification.findFirst({
    where: {
      profileId: recipientProfileId,
      title: CHECKLIST_ASSIGNMENT_NOTIFICATION_TITLE,
      isRead: false,
    },
    select: { id: true },
    orderBy: { createdAt: "desc" },
  });

  if (existing) return;

  await db.notification.create({
    data: {
      profileId: recipientProfileId,
      type: "action",
      title: CHECKLIST_ASSIGNMENT_NOTIFICATION_TITLE,
      message: "A new induction checklist has been assigned to you.",
      actionRequired: true,
      link: "/profile?tab=onboarding",
    },
  });
};

const ensureChecklistForOnboardingCase = async (params: {
  db: DbClient;
  onboardingCaseId: number;
  profileId: number;
  assignedByProfileId?: number | null;
  dueDate?: Date | null;
}) => {
  const { db, onboardingCaseId, profileId, assignedByProfileId, dueDate } = params;

  let checklist = await db.inductionChecklist.findUnique({
    where: { onboardingCaseId },
    select: {
      id: true,
      onboardingCaseId: true,
      employeeProfileId: true,
      checklistName: true,
      status: true,
      dueDate: true,
      assignedByProfileId: true,
      completedAt: true,
    },
  });

  if (!checklist) {
    const unlinkedChecklist = await db.inductionChecklist.findFirst({
      where: {
        employeeProfileId: profileId,
        onboardingCaseId: null,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
      },
    });

    if (unlinkedChecklist) {
      checklist = await db.inductionChecklist.update({
        where: { id: unlinkedChecklist.id },
        data: {
          onboardingCaseId,
          assignedByProfileId: assignedByProfileId ?? undefined,
          dueDate: dueDate ?? undefined,
        },
        select: {
          id: true,
          onboardingCaseId: true,
          employeeProfileId: true,
          checklistName: true,
          status: true,
          dueDate: true,
          assignedByProfileId: true,
          completedAt: true,
        },
      });
    }
  }

  if (!checklist) {
    checklist = await db.inductionChecklist.create({
      data: {
        onboardingCaseId,
        employeeProfileId: profileId,
        checklistName: DEFAULT_CHECKLIST_NAME,
        status: "pending",
        totalItems: DEFAULT_CHECKLIST_ITEMS.length,
        completedItems: 0,
        completionPercent: 0,
        assignedByProfileId: assignedByProfileId ?? null,
        dueDate: dueDate ?? null,
      },
      select: {
        id: true,
        onboardingCaseId: true,
        employeeProfileId: true,
        checklistName: true,
        status: true,
        dueDate: true,
        assignedByProfileId: true,
        completedAt: true,
      },
    });
  } else {
    const needsUpdate =
      checklist.employeeProfileId !== profileId ||
      (!checklist.assignedByProfileId && assignedByProfileId) ||
      (!checklist.dueDate && dueDate);

    if (needsUpdate) {
      checklist = await db.inductionChecklist.update({
        where: { id: checklist.id },
        data: {
          employeeProfileId: profileId,
          assignedByProfileId: checklist.assignedByProfileId ?? assignedByProfileId ?? null,
          dueDate: checklist.dueDate ?? dueDate ?? null,
        },
        select: {
          id: true,
          onboardingCaseId: true,
          employeeProfileId: true,
          checklistName: true,
          status: true,
          dueDate: true,
          assignedByProfileId: true,
          completedAt: true,
        },
      });
    }
  }

  const itemCount = await db.inductionChecklistItem.count({
    where: { checklistId: checklist.id },
  });

  if (itemCount === 0) {
    await createDefaultChecklistItems(db, checklist.id);
    await db.inductionChecklist.update({
      where: { id: checklist.id },
      data: {
        status: "pending",
        totalItems: DEFAULT_CHECKLIST_ITEMS.length,
        completedItems: 0,
        completionPercent: 0,
        completedAt: null,
      },
    });
  }

  await ensureChecklistAssignmentNotification(db, profileId);

  return checklist.id;
};

export const ensureOnboardingProvisioning = async (
  input: EnsureOnboardingProvisioningInput,
  options?: { tx?: DbClient }
) => {
  const db = options?.tx ?? prisma;
  const profile = await db.profile.findUnique({
    where: { id: input.profileId },
    select: {
      id: true,
      onboardingStatus: true,
      onboardingChecklistCompleted: true,
      inductionCompleted: true,
    },
  });

  if (!profile) {
    const err = new Error("Profile not found for onboarding provisioning");
    (err as any).statusCode = 404;
    throw err;
  }

  if (isProfileOnboardingComplete(profile)) {
    return {
      profileId: profile.id,
      onboardingCaseId: input.onboardingCaseId ?? null,
      checklistId: null,
      provisioned: false,
      reason: "already_completed",
    };
  }

  let onboardingCase =
    input.onboardingCaseId && input.onboardingCaseId > 0
      ? await db.employeeOnboardingCase.findUnique({
          where: { id: input.onboardingCaseId },
          select: { id: true, profileId: true, dueDate: true },
        })
      : null;

  if (!onboardingCase) {
    onboardingCase = await db.employeeOnboardingCase.findUnique({
      where: { profileId: input.profileId },
      select: { id: true, profileId: true, dueDate: true },
    });
  }

  if (!onboardingCase) {
    onboardingCase = await db.employeeOnboardingCase.create({
      data: {
        profileId: input.profileId,
        status: OnboardingStatus.pending,
        startDate: input.startDate ?? new Date(),
        dueDate: onboardingDueDate(input.dueDate),
        hrOwnerProfileId: input.hrOwnerProfileId ?? null,
        notes: input.notes ?? "Auto-created during onboarding provisioning.",
      },
      select: { id: true, profileId: true, dueDate: true },
    });
  } else if (!onboardingCase.profileId || onboardingCase.profileId !== input.profileId) {
    onboardingCase = await db.employeeOnboardingCase.update({
      where: { id: onboardingCase.id },
      data: {
        profileId: input.profileId,
        hrOwnerProfileId: input.hrOwnerProfileId ?? undefined,
      },
      select: { id: true, profileId: true, dueDate: true },
    });
  }

  const checklistId = await ensureChecklistForOnboardingCase({
    db,
    onboardingCaseId: onboardingCase.id,
    profileId: input.profileId,
    assignedByProfileId: input.assignedByProfileId ?? input.hrOwnerProfileId ?? null,
    dueDate: onboardingCase.dueDate ?? onboardingDueDate(input.dueDate),
  });

  await db.profile.update({
    where: { id: input.profileId },
    data: {
      onboardingStatus: OnboardingStatus.pending,
      onboardingChecklistCompleted: false,
      inductionCompleted: false,
    },
  });

  return {
    profileId: profile.id,
    onboardingCaseId: onboardingCase.id,
    checklistId,
    provisioned: true,
    reason: "created_or_verified",
  };
};
