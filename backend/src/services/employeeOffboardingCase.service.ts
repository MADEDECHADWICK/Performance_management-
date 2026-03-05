import prisma from "../prisma";
import { createAudit } from "../utils/audit";
import { NotificationService } from "./notifications.service";
import { OffboardingStatus, EmployeeStatus } from "@prisma/client";

export interface AuthContext {
  userId: number;
  profileId: number;
  roles?: string[];
}

export interface CreateOffboardingCaseInput {
  profileId: number;
  hrOwnerProfileId?: number;
  reason?: string;
}

export interface UpdateOffboardingCaseInput {
  status?: OffboardingStatus;
  reason?: string;
  separationDate?: Date;
  notes?: string | null;
}

export interface ListOffboardingCasesOptions {
  status?: OffboardingStatus;
  page?: number;
  pageSize?: number;
}

type DefaultOffboardingItem = {
  itemName: string;
  description: string;
  requiresDocument?: boolean;
};

const DEFAULT_OFFBOARDING_ITEMS: DefaultOffboardingItem[] = [
  {
    itemName: "Return company assets",
    description: "Return laptop, access card, and any assigned equipment.",
    requiresDocument: false,
  },
  {
    itemName: "Submit clearance form",
    description: "Upload signed departmental and finance clearance form.",
    requiresDocument: true,
  },
  {
    itemName: "Knowledge transfer handover",
    description: "Complete and submit handover notes for active assignments.",
    requiresDocument: true,
  },
  {
    itemName: "Revoke system access confirmation",
    description: "HR/IT confirms account and access revocation.",
    requiresDocument: false,
  },
];

class EmployeeOffboardingCaseServiceImpl {
  private isPrivileged(auth: AuthContext) {
    const roles = auth.roles ?? [];
    return (
      roles.includes("admin") ||
      roles.includes("super_admin") ||
      roles.includes("hr") ||
      roles.includes("hr_manager")
    );
  }

  async getById(caseId: number, auth: AuthContext) {
    const found = await prisma.employeeOffboardingCase.findUnique({
      where: { id: caseId },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, user: { select: { email: true } } } },
        hrOwner: { select: { id: true, firstName: true, lastName: true, user: { select: { email: true } } } },
      },
    });

    if (!found) {
      const err = new Error("Offboarding case not found");
      (err as any).statusCode = 404;
      throw err;
    }

    const isEmployee = found.profileId === auth.profileId;
    if (!this.isPrivileged(auth) && !isEmployee) {
      const err = new Error("Forbidden");
      (err as any).statusCode = 403;
      throw err;
    }

    return found;
  }

  async list(options: ListOffboardingCasesOptions, auth: AuthContext) {
    if (!this.isPrivileged(auth)) {
      const err = new Error("Forbidden");
      (err as any).statusCode = 403;
      throw err;
    }

    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (options.status) where.status = options.status;

    const [records, total] = await Promise.all([
      prisma.employeeOffboardingCase.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, user: { select: { email: true } } } },
          hrOwner: { select: { id: true, firstName: true, lastName: true } },
          _count: { select: { items: true } },
        },
      }),
      prisma.employeeOffboardingCase.count({ where }),
    ]);

    return { records, total };
  }

  async create(input: CreateOffboardingCaseInput, auth: AuthContext) {
    if (!this.isPrivileged(auth)) {
      const err = new Error("Forbidden");
      (err as any).statusCode = 403;
      throw err;
    }

    const existing = await prisma.employeeOffboardingCase.findUnique({
      where: { profileId: input.profileId },
      select: { id: true, status: true },
    });
    if (existing) {
      const err = new Error("Offboarding case already exists for this employee");
      (err as any).statusCode = 409;
      throw err;
    }

    const created = await prisma.$transaction(async (tx) => {
      const offboardingCase = await tx.employeeOffboardingCase.create({
        data: {
          profileId: input.profileId,
          hrOwnerProfileId: input.hrOwnerProfileId ?? auth.profileId,
          status: OffboardingStatus.initiated,
          reason: input.reason,
        },
        include: {
          employee: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      await tx.offboardingChecklistItem.createMany({
        data: DEFAULT_OFFBOARDING_ITEMS.map((item, index) => ({
          offboardingCaseId: offboardingCase.id,
          itemName: item.itemName,
          description: item.description,
          orderIndex: index + 1,
          requiresDocument: item.requiresDocument ?? false,
          isCompleted: false,
          completedByProfileId: null,
          completedAt: null,
        })),
      });

      return offboardingCase;
    });

    await createAudit({
      action: "create_offboarding_case",
      entity_type: "EmployeeOffboardingCase",
      user_id: auth.userId,
    }).catch(() => null);

    await NotificationService.createNotification(
      {
        recipientProfileId: input.profileId,
        type: "action",
        title: "Offboarding initiated",
        message: "Your offboarding process has been initiated by HR. Your checklist is ready.",
        actionRequired: true,
        link: "/profile",
      },
      {
        userId: auth.userId,
        profileId: auth.profileId,
        roleName: auth.roles?.[0],
      }
    );

    return created;
  }

  async update(caseId: number, input: UpdateOffboardingCaseInput, auth: AuthContext) {
    if (!this.isPrivileged(auth)) {
      const err = new Error("Forbidden");
      (err as any).statusCode = 403;
      throw err;
    }

    const existing = await prisma.employeeOffboardingCase.findUnique({
      where: { id: caseId },
      select: { id: true, profileId: true, status: true },
    });
    if (!existing) {
      const err = new Error("Offboarding case not found");
      (err as any).statusCode = 404;
      throw err;
    }

    if (input.status === OffboardingStatus.completed) {
      const checklistItems = await prisma.offboardingChecklistItem.findMany({
        where: { offboardingCaseId: caseId },
        select: {
          id: true,
          itemName: true,
          isCompleted: true,
          requiresDocument: true,
          documentId: true,
        },
      });

      if (checklistItems.length === 0) {
        const err = new Error(
          "Offboarding checklist is missing. Add checklist items before completing offboarding."
        );
        (err as any).statusCode = 400;
        throw err;
      }

      const incompleteItems = checklistItems.filter((item) => !item.isCompleted);
      if (incompleteItems.length > 0) {
        const err = new Error(
          `Cannot complete offboarding. ${incompleteItems.length} checklist item(s) are still pending.`
        );
        (err as any).statusCode = 400;
        throw err;
      }

      const missingRequiredDocs = checklistItems.filter(
        (item) => item.requiresDocument && !item.documentId
      );
      if (missingRequiredDocs.length > 0) {
        const err = new Error(
          `Cannot complete offboarding. ${missingRequiredDocs.length} required document(s) are missing.`
        );
        (err as any).statusCode = 400;
        throw err;
      }
    }

    const updated = await prisma.employeeOffboardingCase.update({
      where: { id: caseId },
      data: {
        status: input.status,
        reason: input.reason,
        notes: input.notes ?? undefined,
        completedAt: input.status === OffboardingStatus.completed ? new Date() : null,
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    await createAudit({
      action: `update_offboarding_case_${updated.status || "updated"}`,
      entity_type: "EmployeeOffboardingCase",
      user_id: auth.userId,
    }).catch(() => null);

    if (input.status === OffboardingStatus.completed && existing.profileId) {
      await prisma.profile.update({
        where: { id: existing.profileId },
        data: {
          status: EmployeeStatus.separated,
          separationDate: input.separationDate ?? new Date(),
        },
      });

      // IMPLEMENTED: Offboarding account deactivation - completed offboarding now disables user login while retaining all historical records.
      await prisma.user.updateMany({
        where: {
          profile: {
            is: {
              id: existing.profileId,
            },
          },
        },
        data: {
          isActive: false,
        },
      });

      await NotificationService.createNotification(
        {
          recipientProfileId: existing.profileId,
          type: "info",
          title: "Offboarding completed",
          message: "Your offboarding process has been completed.",
          actionRequired: false,
          link: "/profile",
        },
        {
          userId: auth.userId,
          profileId: auth.profileId,
          roleName: auth.roles?.[0],
        }
      );
    }

    return updated;
  }

  async reactivate(caseId: number, auth: AuthContext) {
    if (!this.isPrivileged(auth)) {
      const err = new Error("Forbidden");
      (err as any).statusCode = 403;
      throw err;
    }

    const existing = await prisma.employeeOffboardingCase.findUnique({
      where: { id: caseId },
      select: { id: true, profileId: true, status: true },
    });
    if (!existing || !existing.profileId) {
      const err = new Error("Offboarding case not found");
      (err as any).statusCode = 404;
      throw err;
    }

    const [profile] = await prisma.$transaction([
      prisma.profile.update({
        where: { id: existing.profileId },
        data: {
          status: EmployeeStatus.active,
          separationDate: null,
        },
        select: { id: true, firstName: true, lastName: true, userId: true },
      }),
      prisma.employeeOffboardingCase.update({
        where: { id: caseId },
        data: {
          notes: "Account reactivated by HR/admin",
        },
      }),
    ]);

    if (profile.userId) {
      await prisma.user.update({
        where: { id: profile.userId },
        data: { isActive: true },
      });
    }

    await createAudit({
      action: "offboarding_account_reactivated",
      entity_type: "EmployeeOffboardingCase",
      entity_id: caseId,
      user_id: auth.userId,
      metadata: { profileId: existing.profileId },
    }).catch(() => null);

    await NotificationService.createNotification(
      {
        recipientProfileId: existing.profileId,
        type: "info",
        title: "Account reactivated",
        message: "Your account has been reactivated by HR.",
        actionRequired: false,
        link: "/profile",
      },
      {
        userId: auth.userId,
        profileId: auth.profileId,
        roleName: auth.roles?.[0],
      }
    );

    return {
      caseId,
      profileId: existing.profileId,
      reactivated: true,
    };
  }
}

export const EmployeeOffboardingCaseService = new EmployeeOffboardingCaseServiceImpl();
