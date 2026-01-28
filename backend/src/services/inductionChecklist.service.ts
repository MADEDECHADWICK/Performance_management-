import prisma from "../prisma";
import { NotificationService } from "./notifications.service";
import { ChecklistStatus, OnboardingStatus } from "@prisma/client";

export interface AuthContext {
  userId: number;
  profileId: number;
  roles?: string[];
}

export interface CreateChecklistInput {
  onboardingCaseId?: number;
  employeeProfileId: number;
  checklistName?: string;
  assignedByProfileId?: number;
  dueDate?: Date;
  items: Array<{
    itemName: string;
    description?: string;
    orderIndex?: number;
    requiresDocument?: boolean;
    documentId?: number;
  }>;
}

class InductionChecklistServiceClass {
  private isPrivileged(auth: AuthContext) {
    const roles = auth.roles ?? [];
    return (
      roles.includes("admin") ||
      roles.includes("super_admin") ||
      roles.includes("hr") ||
      roles.includes("hr_manager")
    );
  }

  async createChecklist(input: CreateChecklistInput, auth: AuthContext) {
    if (!this.isPrivileged(auth)) {
      const err = new Error("Forbidden");
      (err as any).statusCode = 403;
      throw err;
    }

    // If onboardingCaseId provided, confirm it exists and matches employeeProfileId if set
    if (input.onboardingCaseId) {
      const oc = await prisma.employeeOnboardingCase.findUnique({
        where: { id: input.onboardingCaseId },
        select: { id: true, profileId: true },
      });
      if (!oc) {
        const err = new Error("Onboarding case not found");
        (err as any).statusCode = 404;
        throw err;
      }
      if (oc.profileId && oc.profileId !== input.employeeProfileId) {
        const err = new Error("employeeProfileId does not match onboarding case employee");
        (err as any).statusCode = 400;
        throw err;
      }
    }

    // Create checklist
    const checklist = await prisma.inductionChecklist.create({
      data: {
        onboardingCaseId: input.onboardingCaseId,
        employeeProfileId: input.employeeProfileId,
        checklistName: input.checklistName ?? "Standard Employee Induction",
        status: ChecklistStatus.pending,
        totalItems: input.items.length,
        completedItems: 0,
        completionPercent: 0,
        assignedByProfileId: input.assignedByProfileId ?? auth.profileId,
        dueDate: input.dueDate,
      },
    });

    // Create items
    await prisma.inductionChecklistItem.createMany({
      data: input.items.map((i, idx) => ({
        checklistId: checklist.id,
        itemName: i.itemName,
        description: i.description,
        orderIndex: typeof i.orderIndex === "number" ? i.orderIndex : idx,
        requiresDocument: i.requiresDocument ?? false,
        documentId: i.documentId,
      })),
    });

    // Return full checklist with items
    const fullChecklist = await prisma.inductionChecklist.findUnique({
      where: { id: checklist.id },
      include: { items: { orderBy: { orderIndex: "asc" } } },
    });

    await NotificationService.createNotification(
      {
        recipientProfileId: checklist.employeeProfileId,
        type: "action",
        title: "Onboarding checklist assigned",
        message: `A new induction checklist "${checklist.checklistName}" has been assigned to you.`,
        actionRequired: true,
        link: `/onboarding`,
      },
      {
        userId: auth.userId,
        profileId: auth.profileId,
        roleName: auth.roles?.[0],
      }
    );

    return fullChecklist;
  }

  async getChecklistById(checklistId: number) {
    const checklist = await prisma.inductionChecklist.findUnique({
      where: { id: checklistId },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, user: { select: { email: true } } } },
        onboardingCase: true,
        items: { orderBy: { orderIndex: "asc" } },
      },
    });

    if (!checklist) {
      const err = new Error("Checklist not found");
      (err as any).statusCode = 404;
      throw err;
    }

    return checklist;
  }

  async completeItem(checklistId: number, itemId: number, auth: AuthContext) {
    // Only HR/Admin or the employee themselves
    const checklist = await prisma.inductionChecklist.findUnique({
      where: { id: checklistId },
      select: { id: true, employeeProfileId: true, onboardingCaseId: true },
    });

    if (!checklist) {
      const err = new Error("Checklist not found");
      (err as any).statusCode = 404;
      throw err;
    }

    const isEmployee = checklist.employeeProfileId === auth.profileId;
    if (!this.isPrivileged(auth) && !isEmployee) {
      const err = new Error("Forbidden");
      (err as any).statusCode = 403;
      throw err;
    }

    const item = await prisma.inductionChecklistItem.findUnique({
      where: { id: itemId },
      select: { id: true, checklistId: true, isCompleted: true },
    });

    if (!item || item.checklistId !== checklistId) {
      const err = new Error("Checklist item not found");
      (err as any).statusCode = 404;
      throw err;
    }

    if (item.isCompleted) {
      // idempotent
      return this.getChecklistById(checklistId);
    }

    // Mark item complete
    await prisma.inductionChecklistItem.update({
      where: { id: itemId },
      data: {
        isCompleted: true,
        completedByProfileId: auth.profileId,
        completedAt: new Date(),
      },
    });

    // Recompute checklist completion
    const items = await prisma.inductionChecklistItem.findMany({
      where: { checklistId },
      select: { isCompleted: true },
    });

    const total = items.length;
    const completed = items.filter(i => i.isCompleted).length;
    const percent = total > 0 ? (completed / total) * 100 : 0;

    const isAllDone = total > 0 && completed === total;

    await prisma.inductionChecklist.update({
      where: { id: checklistId },
      data: {
        completedItems: completed,
        totalItems: total,
        completionPercent: percent,
        status: isAllDone ? ChecklistStatus.completed : ChecklistStatus.in_progress,
        completedAt: isAllDone ? new Date() : null,
      },
    });

    // If checklist fully complete, update Profile + OnboardingCase
    if (isAllDone) {
      await prisma.profile.update({
        where: { id: checklist.employeeProfileId },
        data: {
          onboardingChecklistCompleted: true,
          inductionCompleted: true,
          onboardingStatus: OnboardingStatus.completed,
        },
      });

      if (checklist.onboardingCaseId) {
        await prisma.employeeOnboardingCase.update({
          where: { id: checklist.onboardingCaseId },
          data: { status: OnboardingStatus.completed },
        });
      }

      await NotificationService.createNotification(
        {
          recipientProfileId: checklist.employeeProfileId,
          type: "info",
          title: "Onboarding checklist completed",
          message: "Your induction checklist is marked as completed.",
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

    return this.getChecklistById(checklistId);
  }
}

export const InductionChecklistService = new InductionChecklistServiceClass();
