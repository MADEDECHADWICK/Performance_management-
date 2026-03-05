import prisma from "../prisma";
import { NotificationService } from "./notifications.service";
import { DocumentAccessLevel } from "@prisma/client";
import { DocumentService } from "./documents.service";

export interface AuthContext {
  userId: number;
  profileId: number;
  roles?: string[];
}

export interface CreateOffboardingChecklistItemsInput {
  items: Array<{
    itemName: string;
    description?: string;
    orderIndex?: number;
    requiresDocument?: boolean;
    documentId?: number;
  }>;
}

class OffboardingChecklistServiceClass {
  private isPrivileged(auth: AuthContext) {
    const roles = auth.roles ?? [];
    return (
      roles.includes("admin") ||
      roles.includes("super_admin") ||
      roles.includes("hr") ||
      roles.includes("hr_manager")
    );
  }

  async listItems(offboardingCaseId: number, auth: AuthContext) {
    if (!this.isPrivileged(auth)) {
      const err = new Error("Forbidden");
      (err as any).statusCode = 403;
      throw err;
    }

    return prisma.offboardingChecklistItem.findMany({
      where: { offboardingCaseId },
      orderBy: { orderIndex: "asc" },
      include: { document: true },
    });
  }

  async createItems(offboardingCaseId: number, input: CreateOffboardingChecklistItemsInput, auth: AuthContext) {
    if (!this.isPrivileged(auth)) {
      const err = new Error("Forbidden");
      (err as any).statusCode = 403;
      throw err;
    }

    const offboardingCase = await prisma.employeeOffboardingCase.findUnique({
      where: { id: offboardingCaseId },
      select: { id: true, profileId: true, status: true },
    });

    if (!offboardingCase) {
      const err = new Error("Offboarding case not found");
      (err as any).statusCode = 404;
      throw err;
    }

    if (!input.items?.length) {
      const err = new Error("Checklist items are required");
      (err as any).statusCode = 400;
      throw err;
    }

    await prisma.offboardingChecklistItem.createMany({
      data: input.items.map((i, idx) => ({
        offboardingCaseId,
        itemName: i.itemName,
        description: i.description,
        orderIndex: typeof i.orderIndex === "number" ? i.orderIndex : idx,
        requiresDocument: i.requiresDocument ?? false,
        documentId: i.documentId,
      })),
    });

    if (offboardingCase.profileId) {
      const requiredDocumentCount = input.items.filter((item) => item.requiresDocument).length;
      await NotificationService.createNotification(
        {
          recipientProfileId: offboardingCase.profileId,
          type: requiredDocumentCount > 0 ? "action" : "info",
          title: "Offboarding tasks assigned",
          message:
            requiredDocumentCount > 0
              ? `HR assigned offboarding tasks. ${requiredDocumentCount} item(s) require document submission.`
              : "HR assigned offboarding tasks for your profile.",
          actionRequired: requiredDocumentCount > 0,
          link: "/profile",
        },
        { userId: auth.userId, profileId: auth.profileId, roleName: auth.roles?.[0] }
      );
    }

    return this.listItems(offboardingCaseId, auth);
  }

  async completeItem(offboardingCaseId: number, itemId: number, auth: AuthContext) {
    if (!this.isPrivileged(auth)) {
      const err = new Error("Forbidden");
      (err as any).statusCode = 403;
      throw err;
    }

    const item = await prisma.offboardingChecklistItem.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        offboardingCaseId: true,
        isCompleted: true,
        requiresDocument: true,
        documentId: true,
      },
    });

    if (!item || item.offboardingCaseId !== offboardingCaseId) {
      const err = new Error("Checklist item not found");
      (err as any).statusCode = 404;
      throw err;
    }

    if (item.isCompleted) {
      return this.listItems(offboardingCaseId, auth);
    }

    if (item.requiresDocument && !item.documentId) {
      const err = new Error("Attach the required document before marking this task complete");
      (err as any).statusCode = 400;
      throw err;
    }

    await prisma.offboardingChecklistItem.update({
      where: { id: itemId },
      data: {
        isCompleted: true,
        completedByProfileId: auth.profileId,
        completedAt: new Date(),
      },
    });

    return this.listItems(offboardingCaseId, auth);
  }

  async attachDocument(
    offboardingCaseId: number,
    itemId: number,
    input: { documentId?: number; fileName?: string; filePath?: string; mimeType?: string; fileSize?: number },
    auth: AuthContext
  ) {
    if (!this.isPrivileged(auth)) {
      const err = new Error("Forbidden");
      (err as any).statusCode = 403;
      throw err;
    }

    const item = await prisma.offboardingChecklistItem.findUnique({
      where: { id: itemId },
      select: { id: true, offboardingCaseId: true },
    });

    if (!item || item.offboardingCaseId !== offboardingCaseId) {
      const err = new Error("Checklist item not found");
      (err as any).statusCode = 404;
      throw err;
    }

    let documentId = input.documentId;

    if (!documentId) {
      if (!input.fileName || !input.filePath) {
        const err = new Error("fileName and filePath are required");
        (err as any).statusCode = 400;
        throw err;
      }

      const document = await DocumentService.uploadDocument(
        {
          fileName: input.fileName,
          filePath: input.filePath,
          fileSize: input.fileSize,
          mimeType: input.mimeType,
          documentType: "offboarding_task",
          entityType: "OffboardingChecklistItem",
          entityId: itemId,
          accessLevel: DocumentAccessLevel.hr,
        },
        { userId: auth.userId, profileId: auth.profileId, roles: auth.roles }
      );
      documentId = document.id;
    }

    await prisma.offboardingChecklistItem.update({
      where: { id: itemId },
      data: { documentId },
    });

    return this.listItems(offboardingCaseId, auth);
  }
}

export const OffboardingChecklistService = new OffboardingChecklistServiceClass();
