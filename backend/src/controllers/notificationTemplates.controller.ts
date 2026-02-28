import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { NotificationTemplateService } from "../services/notificationTemplates.service";
import { errorResponse, successResponse } from "../utils/response";

export class NotificationTemplateController {
  static async listTemplates(req: AuthRequest, res: Response) {
    try {
      const isActiveParam = req.query.isActive;
      const isActive =
        typeof isActiveParam === "string"
          ? isActiveParam === "true"
          : typeof isActiveParam === "boolean"
          ? isActiveParam
          : undefined;

      const templates = await NotificationTemplateService.listTemplates({ isActive });
      res.json(successResponse(templates, "Templates loaded"));
    } catch (error: any) {
      res
        .status(error.statusCode || 500)
        .json(errorResponse(error.message || "Failed to load templates", error.statusCode || 500));
    }
  }

  static async createTemplate(req: AuthRequest, res: Response) {
    try {
      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const template = await NotificationTemplateService.createTemplate(
        {
          label: req.body.label,
          title: req.body.title,
          message: req.body.message,
          type: req.body.type,
          actionRequired: req.body.actionRequired,
          isActive: req.body.isActive,
        },
        auth
      );

      res.status(201).json(successResponse(template, "Template created", 201));
    } catch (error: any) {
      res
        .status(error.statusCode || 400)
        .json(errorResponse(error.message || "Failed to create template", error.statusCode || 400));
    }
  }

  static async updateTemplate(req: AuthRequest, res: Response) {
    try {
      const id = Number(req.params.templateId);
      const template = await NotificationTemplateService.updateTemplate(id, {
        label: req.body.label,
        title: req.body.title,
        message: req.body.message,
        type: req.body.type,
        actionRequired: req.body.actionRequired,
        isActive: req.body.isActive,
      });
      res.json(successResponse(template, "Template updated"));
    } catch (error: any) {
      res
        .status(error.statusCode || 400)
        .json(errorResponse(error.message || "Failed to update template", error.statusCode || 400));
    }
  }

  static async deleteTemplate(req: AuthRequest, res: Response) {
    try {
      const id = Number(req.params.templateId);
      await NotificationTemplateService.deleteTemplate(id);
      res.json(successResponse(null, "Template deleted"));
    } catch (error: any) {
      res
        .status(error.statusCode || 400)
        .json(errorResponse(error.message || "Failed to delete template", error.statusCode || 400));
    }
  }

  static async seedDefaults(req: AuthRequest, res: Response) {
    try {
      const createdByProfileId = req.profile?.id ?? null;
      const templates = await NotificationTemplateService.upsertDefaults(createdByProfileId);
      res.json(
        successResponse(
          { count: templates.length, templates },
          "Default notification templates applied"
        )
      );
    } catch (error: any) {
      res
        .status(error.statusCode || 400)
        .json(errorResponse(error.message || "Failed to seed templates", error.statusCode || 400));
    }
  }
}
