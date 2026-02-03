import { NotificationType } from "@prisma/client";
import { prisma } from "../prisma";

interface AuthContext {
  userId: number;
  profileId: number;
  roleName?: string;
}

interface ListOptions {
  isActive?: boolean;
}

interface CreateTemplateInput {
  label: string;
  title: string;
  message: string;
  type: NotificationType;
  actionRequired?: boolean;
  isActive?: boolean;
}

interface UpdateTemplateInput {
  label?: string;
  title?: string;
  message?: string;
  type?: NotificationType;
  actionRequired?: boolean;
  isActive?: boolean;
}

export class NotificationTemplateService {
  static async listTemplates(options: ListOptions) {
    const where: any = {};
    if (typeof options.isActive === "boolean") {
      where.isActive = options.isActive;
    }
    const templates = await prisma.notificationTemplate.findMany({
      where,
      orderBy: { updatedAt: "desc" },
    });
    return templates;
  }

  static async createTemplate(input: CreateTemplateInput, auth: AuthContext) {
    const template = await prisma.notificationTemplate.create({
      data: {
        label: input.label,
        title: input.title,
        message: input.message,
        type: input.type,
        actionRequired: input.actionRequired ?? false,
        isActive: input.isActive ?? true,
        createdByProfileId: auth.profileId,
      },
    });
    return template;
  }

  static async updateTemplate(id: number, input: UpdateTemplateInput) {
    const template = await prisma.notificationTemplate.update({
      where: { id },
      data: {
        ...(input.label !== undefined && { label: input.label }),
        ...(input.title !== undefined && { title: input.title }),
        ...(input.message !== undefined && { message: input.message }),
        ...(input.type !== undefined && { type: input.type }),
        ...(input.actionRequired !== undefined && { actionRequired: input.actionRequired }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
    });
    return template;
  }

  static async deleteTemplate(id: number) {
    await prisma.notificationTemplate.delete({ where: { id } });
    return true;
  }
}
