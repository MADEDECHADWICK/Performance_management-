import {
  ChecklistStatus,
  DocumentVerificationStatus,
  OnboardingStatus,
} from "@prisma/client";
import prisma from "../prisma";
import { NotificationService } from "./notifications.service";
import { createAudit } from "../utils/audit";
import {
  DEFAULT_INDUCTION_CHECKLIST_NAME,
  getDefaultInductionTemplate,
} from "./inductionTemplateCatalog";
import { EmployeeOnboardingCaseService } from "./employeeOnboardingCase.service";

export interface AuthContext {
  userId: number;
  profileId: number;
  roles?: string[];
}

export type ChecklistItemType =
  | "task"
  | "document_upload"
  | "video_watch"
  | "policy_link"
  | "external_link";

type OwnerRole = "employee" | "hr";

const CHECKLIST_ASSIGNMENT_NOTIFICATION_TITLE = "Onboarding checklist assigned";

type CreateChecklistItemInput = {
  itemName: string;
  description?: string;
  orderIndex?: number;
  requiresDocument?: boolean;
  documentId?: number;
  itemType?: ChecklistItemType;
  resourceUrl?: string;
  sectionKey?: string;
  sectionLabel?: string;
  ownerRole?: string;
  comments?: string;
};

export interface CreateChecklistInput {
  onboardingCaseId?: number;
  employeeProfileId: number;
  checklistName?: string;
  dueDate?: Date;
  items: CreateChecklistItemInput[];
}

class InductionChecklistServiceClass {
  private getRoles(auth: AuthContext) {
    return (auth.roles ?? []).map((role) =>
      String(role || "")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_")
    );
  }

  private isPrivileged(auth: AuthContext) {
    const roles = this.getRoles(auth);
    return roles.includes("super_admin") || roles.includes("hr");
  }

  private normalizeOwnerRole(value?: string | null): OwnerRole {
    const normalized = String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
    if (normalized === "employee") return "employee";
    return "hr";
  }

  private sanitizeChecklistItem(
    item: CreateChecklistItemInput,
    index: number
  ) {
    const itemName = String(item.itemName || "").trim();
    if (!itemName) {
      const err = new Error("Checklist item name is required");
      (err as any).statusCode = 400;
      throw err;
    }

    const itemType = (String(item.itemType || "task").trim() ||
      "task") as ChecklistItemType;
    const resourceUrl = String(item.resourceUrl || "").trim();
    const requiresDocument =
      typeof item.requiresDocument === "boolean"
        ? item.requiresDocument
        : itemType === "document_upload";

    return {
      itemName,
      description: String(item.description || "").trim() || null,
      orderIndex:
        typeof item.orderIndex === "number" && Number.isFinite(item.orderIndex)
          ? item.orderIndex
          : index + 1,
      requiresDocument,
      documentId:
        typeof item.documentId === "number" && Number.isFinite(item.documentId)
          ? item.documentId
          : null,
      itemType,
      resourceUrl: resourceUrl || null,
      sectionKey: String(item.sectionKey || "general").trim() || "general",
      sectionLabel: String(item.sectionLabel || "General").trim() || "General",
      ownerRole: this.normalizeOwnerRole(item.ownerRole),
      comments: String(item.comments || "").trim() || null,
    };
  }

  private buildChecklistInclude() {
    return {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          managerId: true,
          user: { select: { email: true } },
        },
      },
      assignedBy: {
        select: { id: true, firstName: true, lastName: true },
      },
      onboardingCase: {
        select: {
          id: true,
          status: true,
          hrOwnerProfileId: true,
          dueDate: true,
        },
      },
      items: {
        orderBy: [{ orderIndex: "asc" as const }, { id: "asc" as const }],
        include: {
          completedBy: {
            select: { id: true, firstName: true, lastName: true },
          },
          document: {
            select: {
              id: true,
              fileName: true,
              filePath: true,
              verificationStatus: true,
              rejectionReason: true,
              verifiedAt: true,
              verifiedBy: true,
            },
          },
        },
      },
    };
  }

  private async getChecklistOrThrow(checklistId: number) {
    const checklist = await prisma.inductionChecklist.findUnique({
      where: { id: checklistId },
      include: this.buildChecklistInclude(),
    });

    if (!checklist) {
      const err = new Error("Checklist not found");
      (err as any).statusCode = 404;
      throw err;
    }

    return checklist;
  }

  private async assertCanViewChecklist(
    checklistId: number,
    auth: AuthContext,
    preloaded?: Awaited<ReturnType<typeof this.getChecklistOrThrow>>
  ) {
    const checklist = preloaded ?? (await this.getChecklistOrThrow(checklistId));

    if (this.isPrivileged(auth)) return checklist;

    const isEmployee = checklist.employeeProfileId === auth.profileId;
    const isAssigner = checklist.assignedByProfileId === auth.profileId;

    if (!isEmployee && !isAssigner) {
      const err = new Error("Forbidden");
      (err as any).statusCode = 403;
      throw err;
    }

    return checklist;
  }

  private async assertCanActOnItem(
    checklistId: number,
    itemId: number,
    auth: AuthContext
  ) {
    const checklist = await this.assertCanViewChecklist(checklistId, auth);
    const item = checklist.items.find((row) => row.id === itemId);

    if (!item) {
      const err = new Error("Checklist item not found");
      (err as any).statusCode = 404;
      throw err;
    }

    const ownerRole = this.normalizeOwnerRole(item.ownerRole);
    if (this.isPrivileged(auth)) {
      return { checklist, item, ownerRole };
    }

    const isEmployee = checklist.employeeProfileId === auth.profileId;
    if (ownerRole === "employee" && isEmployee) {
      return { checklist, item, ownerRole };
    }

    const err = new Error("Forbidden");
    (err as any).statusCode = 403;
    throw err;
  }

  private async refreshChecklistProgress(checklistId: number) {
    const checklist = await prisma.inductionChecklist.findUnique({
      where: { id: checklistId },
      include: {
        items: {
          include: {
            document: {
              select: { id: true, verificationStatus: true },
            },
          },
        },
      },
    });

    if (!checklist) {
      const err = new Error("Checklist not found");
      (err as any).statusCode = 404;
      throw err;
    }

    const totalItems = checklist.items.length;
    const completedItems = checklist.items.filter((item) => item.isCompleted).length;
    const completionPercent =
      totalItems > 0 ? Number(((completedItems / totalItems) * 100).toFixed(2)) : 0;
    const hasActivity =
      completedItems > 0 ||
      checklist.items.some((item) => item.documentId || item.comments || item.completedAt) ||
      Boolean(checklist.employeeAcknowledgedAt || checklist.hrSignedOffAt);
    const allItemsComplete = totalItems > 0 && completedItems === totalItems;
    const canBeCompleted =
      allItemsComplete &&
      Boolean(checklist.employeeAcknowledgedAt) &&
      Boolean(checklist.hrSignedOffAt);

    let status: ChecklistStatus = ChecklistStatus.pending;
    if (canBeCompleted) {
      status = ChecklistStatus.completed;
    } else if (hasActivity) {
      status = ChecklistStatus.in_progress;
    }

    const signoffReset =
      allItemsComplete
        ? {}
        : {
            employeeAcknowledgedAt: null,
            employeeAcknowledgedByProfileId: null,
            hrSignedOffAt: null,
            hrSignedOffByProfileId: null,
            hrSignoffNotes: null,
          };

    const updated = await prisma.inductionChecklist.update({
      where: { id: checklistId },
      data: {
        totalItems,
        completedItems,
        completionPercent,
        status,
        completedAt: status === ChecklistStatus.completed ? new Date() : null,
        ...signoffReset,
      },
      include: this.buildChecklistInclude(),
    });

    const allRequiredDocumentsVerified = updated.items.every((item) => {
      if (!item.requiresDocument) return true;
      return item.document?.verificationStatus === DocumentVerificationStatus.verified;
    });

    await prisma.profile.update({
      where: { id: updated.employeeProfileId },
      data: {
        onboardingChecklistCompleted: allItemsComplete && allRequiredDocumentsVerified,
        inductionCompleted: status === ChecklistStatus.completed,
      },
    });

    if (updated.onboardingCaseId) {
      await EmployeeOnboardingCaseService.refreshCompletion(updated.onboardingCaseId);
    } else {
      await prisma.profile.update({
        where: { id: updated.employeeProfileId },
        data: {
          onboardingStatus:
            status === ChecklistStatus.completed
              ? OnboardingStatus.completed
              : hasActivity
              ? OnboardingStatus.in_progress
              : OnboardingStatus.pending,
        },
      });
    }

    return updated;
  }

  getDefaultTemplate() {
    return getDefaultInductionTemplate();
  }

  async createChecklist(input: CreateChecklistInput, auth: AuthContext) {
    if (!this.isPrivileged(auth)) {
      const err = new Error("Forbidden");
      (err as any).statusCode = 403;
      throw err;
    }

    const employeeProfileId = Number(input.employeeProfileId);
    if (!Number.isFinite(employeeProfileId) || employeeProfileId <= 0) {
      const err = new Error("Valid employeeProfileId is required");
      (err as any).statusCode = 400;
      throw err;
    }

    const items = Array.isArray(input.items)
      ? input.items.map((item, index) => this.sanitizeChecklistItem(item, index))
      : [];
    if (items.length === 0) {
      const err = new Error("At least one checklist item is required");
      (err as any).statusCode = 400;
      throw err;
    }

    const employee = await prisma.profile.findUnique({
      where: { id: employeeProfileId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!employee) {
      const err = new Error("Employee profile not found");
      (err as any).statusCode = 404;
      throw err;
    }

    const onboardingCaseId =
      typeof input.onboardingCaseId === "number" && Number.isFinite(input.onboardingCaseId)
        ? input.onboardingCaseId
        : undefined;

    if (onboardingCaseId) {
      const onboardingCase = await prisma.employeeOnboardingCase.findUnique({
        where: { id: onboardingCaseId },
        select: { id: true, profileId: true },
      });
      if (!onboardingCase) {
        const err = new Error("Onboarding case not found");
        (err as any).statusCode = 404;
        throw err;
      }
      if (onboardingCase.profileId && onboardingCase.profileId !== employeeProfileId) {
        const err = new Error("Checklist employee does not match onboarding case employee");
        (err as any).statusCode = 400;
        throw err;
      }
      const existing = await prisma.inductionChecklist.findUnique({
        where: { onboardingCaseId },
        select: { id: true },
      });
      if (existing) {
        const err = new Error("An induction checklist already exists for this onboarding case");
        (err as any).statusCode = 409;
        throw err;
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      const checklist = await tx.inductionChecklist.create({
        data: {
          onboardingCaseId,
          employeeProfileId,
          checklistName:
            String(input.checklistName || "").trim() || DEFAULT_INDUCTION_CHECKLIST_NAME,
          status: ChecklistStatus.pending,
          totalItems: items.length,
          completedItems: 0,
          completionPercent: 0,
          assignedByProfileId: auth.profileId,
          dueDate: input.dueDate ?? null,
        },
      });

      await tx.inductionChecklistItem.createMany({
        data: items.map((item, index) => ({
          checklistId: checklist.id,
          itemName: item.itemName,
          description: item.description,
          orderIndex: item.orderIndex ?? index + 1,
          sectionKey: item.sectionKey,
          sectionLabel: item.sectionLabel,
          ownerRole: item.ownerRole,
          itemType: item.itemType,
          resourceUrl: item.resourceUrl,
          comments: item.comments,
          requiresDocument: item.requiresDocument,
          documentId: item.documentId,
        })),
      });

      return checklist.id;
    });

    await createAudit({
      action: "create_induction_checklist",
      entity_type: "InductionChecklist",
      entity_id: created,
      user_id: auth.userId,
      metadata: {
        employeeProfileId,
        onboardingCaseId: onboardingCaseId ?? null,
        totalItems: items.length,
      },
    }).catch(() => null);

    await NotificationService.createNotification(
      {
        recipientProfileId: employeeProfileId,
        type: "action",
        title: CHECKLIST_ASSIGNMENT_NOTIFICATION_TITLE,
        message: "HR assigned your employee induction and compliance checklist.",
        actionRequired: true,
        link: "/profile?tab=onboarding",
      },
      {
        userId: auth.userId,
        profileId: auth.profileId,
        roleName: auth.roles?.[0],
      }
    ).catch(() => null);

    return this.refreshChecklistProgress(created);
  }

  async getChecklistById(checklistId: number, auth?: AuthContext) {
    const checklist = await this.getChecklistOrThrow(checklistId);
    if (auth) {
      await this.assertCanViewChecklist(checklistId, auth, checklist);
    }
    return checklist;
  }

  async completeItem(checklistId: number, itemId: number, auth: AuthContext) {
    const { item, ownerRole } = await this.assertCanActOnItem(checklistId, itemId, auth);

    if (item.requiresDocument) {
      if (!item.documentId || !item.document) {
        const err = new Error("Attach the required document before completing this item");
        (err as any).statusCode = 400;
        throw err;
      }
      if (item.document.verificationStatus !== DocumentVerificationStatus.verified) {
        const err = new Error("This document must be verified by HR before the item can be completed");
        (err as any).statusCode = 400;
        throw err;
      }
    }

    await prisma.inductionChecklistItem.update({
      where: { id: itemId },
      data: {
        isCompleted: true,
        completedByProfileId: auth.profileId,
        completedAt: new Date(),
      },
    });

    await createAudit({
      action: "complete_induction_checklist_item",
      entity_type: "InductionChecklistItem",
      entity_id: itemId,
      user_id: auth.userId,
      metadata: {
        checklistId,
        ownerRole,
        completedByProfileId: auth.profileId,
      },
    }).catch(() => null);

    return this.refreshChecklistProgress(checklistId);
  }

  async attachItemDocument(
    checklistId: number,
    itemId: number,
    documentId: number,
    auth: AuthContext
  ) {
    const { item } = await this.assertCanActOnItem(checklistId, itemId, auth);
    if (!item.requiresDocument) {
      const err = new Error("This checklist item does not require a document");
      (err as any).statusCode = 400;
      throw err;
    }

    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        entityType: true,
        entityId: true,
      },
    });
    if (!document) {
      const err = new Error("Document not found");
      (err as any).statusCode = 404;
      throw err;
    }

    await prisma.inductionChecklistItem.update({
      where: { id: itemId },
      data: {
        documentId,
        isCompleted: false,
        completedByProfileId: null,
        completedAt: null,
      },
    });

    await createAudit({
      action: "attach_induction_checklist_document",
      entity_type: "InductionChecklistItem",
      entity_id: itemId,
      user_id: auth.userId,
      metadata: {
        checklistId,
        documentId,
      },
    }).catch(() => null);

    return this.refreshChecklistProgress(checklistId);
  }

  async updateItemComments(
    checklistId: number,
    itemId: number,
    comments: string,
    auth: AuthContext
  ) {
    const { item } = await this.assertCanActOnItem(checklistId, itemId, auth);
    const ownerRole = this.normalizeOwnerRole(item.ownerRole);
    if (!this.isPrivileged(auth)) {
      const err = new Error("Forbidden");
      (err as any).statusCode = 403;
      throw err;
    }

    await prisma.inductionChecklistItem.update({
      where: { id: itemId },
      data: {
        comments: String(comments || "").trim() || null,
      },
    });

    await createAudit({
      action: "update_induction_checklist_item_comments",
      entity_type: "InductionChecklistItem",
      entity_id: itemId,
      user_id: auth.userId,
      metadata: {
        checklistId,
      },
    }).catch(() => null);

    return this.getChecklistById(checklistId, auth);
  }

  async acknowledgeChecklist(checklistId: number, auth: AuthContext) {
    const checklist = await this.getChecklistOrThrow(checklistId);
    if (checklist.employeeProfileId !== auth.profileId) {
      const err = new Error("Only the assigned employee can acknowledge this checklist");
      (err as any).statusCode = 403;
      throw err;
    }

    if (!checklist.items.length || checklist.items.some((item) => !item.isCompleted)) {
      const err = new Error("Complete all induction items before acknowledging the checklist");
      (err as any).statusCode = 400;
      throw err;
    }

    await prisma.inductionChecklist.update({
      where: { id: checklistId },
      data: {
        employeeAcknowledgedAt: new Date(),
        employeeAcknowledgedByProfileId: auth.profileId,
      },
    });

    if (checklist.assignedByProfileId) {
      await NotificationService.createNotification(
        {
          recipientProfileId: checklist.assignedByProfileId,
          type: "action",
          title: "Induction acknowledged",
          message: `${checklist.employee.firstName} ${checklist.employee.lastName} acknowledged the induction checklist. HR signoff is now required.`,
          actionRequired: true,
          link: "/employee-management",
        },
        {
          userId: auth.userId,
          profileId: auth.profileId,
          roleName: auth.roles?.[0],
        }
      ).catch(() => null);
    }

    await createAudit({
      action: "acknowledge_induction_checklist",
      entity_type: "InductionChecklist",
      entity_id: checklistId,
      user_id: auth.userId,
      metadata: {
        employeeProfileId: auth.profileId,
      },
    }).catch(() => null);

    return this.refreshChecklistProgress(checklistId);
  }

  async hrSignoffChecklist(checklistId: number, notes: string | undefined, auth: AuthContext) {
    if (!this.isPrivileged(auth)) {
      const err = new Error("Forbidden");
      (err as any).statusCode = 403;
      throw err;
    }

    const checklist = await this.getChecklistOrThrow(checklistId);
    if (!checklist.items.length || checklist.items.some((item) => !item.isCompleted)) {
      const err = new Error("All induction items must be complete before HR signoff");
      (err as any).statusCode = 400;
      throw err;
    }
    if (!checklist.employeeAcknowledgedAt) {
      const err = new Error("Employee acknowledgement is required before HR signoff");
      (err as any).statusCode = 400;
      throw err;
    }

    await prisma.inductionChecklist.update({
      where: { id: checklistId },
      data: {
        hrSignedOffAt: new Date(),
        hrSignedOffByProfileId: auth.profileId,
        hrSignoffNotes: String(notes || "").trim() || null,
      },
    });

    await NotificationService.createNotification(
      {
        recipientProfileId: checklist.employeeProfileId,
        type: "info",
        title: "Induction completed",
        message: "HR signed off your induction checklist. Your onboarding induction is complete.",
        actionRequired: false,
        link: "/profile?tab=onboarding",
      },
      {
        userId: auth.userId,
        profileId: auth.profileId,
        roleName: auth.roles?.[0],
      }
    ).catch(() => null);

    await createAudit({
      action: "hr_signoff_induction_checklist",
      entity_type: "InductionChecklist",
      entity_id: checklistId,
      user_id: auth.userId,
      metadata: {
        hrSignoffNotes: String(notes || "").trim() || null,
      },
    }).catch(() => null);

    return this.refreshChecklistProgress(checklistId);
  }

  async sendReminder(checklistId: number, auth: AuthContext) {
    if (!this.isPrivileged(auth)) {
      const err = new Error("Forbidden");
      (err as any).statusCode = 403;
      throw err;
    }

    const checklist = await this.getChecklistOrThrow(checklistId);

    await NotificationService.createNotification(
      {
        recipientProfileId: checklist.employeeProfileId,
        type: "action",
        title: "Induction checklist reminder",
        message: "Please continue your induction tasks and upload any missing onboarding documents.",
        actionRequired: true,
        link: "/profile?tab=onboarding",
      },
      {
        userId: auth.userId,
        profileId: auth.profileId,
        roleName: auth.roles?.[0],
      }
    );

    await createAudit({
      action: "send_induction_checklist_reminder",
      entity_type: "InductionChecklist",
      entity_id: checklistId,
      user_id: auth.userId,
    }).catch(() => null);

    return { reminded: true };
  }
}

export const InductionChecklistService = new InductionChecklistServiceClass();
