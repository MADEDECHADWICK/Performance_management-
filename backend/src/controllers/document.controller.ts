/**
 * Document Controller (Schema v2.1 aligned)
 */

import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { DocumentService } from "../services/documents.service";
import { successResponse, errorResponse, paginatedResponse } from "../utils/response";
import { DocumentAccessLevel, DocumentVerificationStatus } from "@prisma/client";

const buildAuth = (req: AuthRequest) => ({
  userId: req.user!.userId,
  profileId: req.user!.profileId!,
  roles: req.userRoles ?? [],
});

export class DocumentController {
  static async listDocuments(req: AuthRequest, res: Response): Promise<void> {
    try {
      const page = Number(req.query.page) || 1;
      const pageSize = Number(req.query.pageSize) || 10;

      const verificationStatus = (req.query.verificationStatus ??
        req.query.status) as DocumentVerificationStatus | undefined;
      const accessLevel = req.query.accessLevel as DocumentAccessLevel | undefined;

      const documentType = req.query.documentType as string | undefined;
      const entityType = req.query.entityType as string | undefined;
      const entityId = req.query.entityId ? Number(req.query.entityId) : undefined;

      const result = await DocumentService.listDocuments({
        page,
        pageSize,
        filters: {
          verificationStatus,
          accessLevel,
          documentType,
          entityType,
          entityId: Number.isFinite(entityId as number) ? (entityId as number) : undefined,
        },
      });

      res.json(paginatedResponse(result.documents, result.total, page, pageSize, "Documents retrieved"));
    } catch (error: any) {
      console.error("DocumentController.listDocuments error:", error);
      res.status(500).json(errorResponse("Failed to retrieve documents", 500));
    }
  }

  static async uploadDocument(req: AuthRequest, res: Response): Promise<void> {
    try {
      const auth = buildAuth(req);

      const uploadedFile = (req as any).file as Express.Multer.File | undefined;

      const {
        fileName: bodyFileName,
        filePath: bodyFilePath,
        fileSize: bodyFileSize,
        mimeType: bodyMimeType,
        documentType,
        entityType,
        entityId,
        accessLevel,
        description,
        isRequired,
      } = req.body;

      const fileName = bodyFileName || uploadedFile?.originalname;
      const filePath = uploadedFile
        ? `/uploads/documents/${uploadedFile.filename}`
        : bodyFilePath;
      const fileSize = uploadedFile?.size || bodyFileSize;
      const mimeType = uploadedFile?.mimetype || bodyMimeType;

      if (!fileName || !filePath) {
        res
          .status(400)
          .json(errorResponse("File upload or filePath is required", 400));
        return;
      }

      const result = await DocumentService.uploadDocument(
        {
          fileName,
          filePath,
          fileSize,
          mimeType,
          documentType,
          entityType,
          entityId: entityId ? Number(entityId) : undefined,
          accessLevel,
          description,
          isRequired,
        },
        auth
      );

      res.status(201).json(successResponse(result, "Document uploaded", 201));
    } catch (error: any) {
      console.error("DocumentController.uploadDocument error:", error);
      const status = error.statusCode ?? 400;
      res.status(status).json(errorResponse(error.message || "Failed to upload document", status));
    }
  }

  static async getDocument(req: AuthRequest, res: Response): Promise<void> {
    try {
      const documentId = Number(req.params.documentId);
      const result = await DocumentService.getDocumentById(documentId);
      res.json(successResponse(result, "Document retrieved"));
    } catch (error: any) {
      console.error("DocumentController.getDocument error:", error);
      const status = error.statusCode ?? 500;
      res.status(status).json(errorResponse(error.message || "Failed to retrieve document", status));
    }
  }

  static async deleteDocument(req: AuthRequest, res: Response): Promise<void> {
    try {
      const auth = buildAuth(req);
      const documentId = Number(req.params.documentId);

      const result = await DocumentService.deleteDocument(documentId, auth);
      res.json(successResponse(result, "Document deleted"));
    } catch (error: any) {
      console.error("DocumentController.deleteDocument error:", error);
      const status = error.statusCode ?? 400;
      res.status(status).json(errorResponse(error.message || "Failed to delete document", status));
    }
  }

  static async verifyDocument(req: AuthRequest, res: Response): Promise<void> {
    try {
      const auth = buildAuth(req);
      const documentId = Number(req.params.documentId);

      const { verificationStatus, rejectionReason } = req.body as {
        verificationStatus: DocumentVerificationStatus;
        rejectionReason?: string;
      };

      const result = await DocumentService.verifyDocument(
        documentId,
        { verificationStatus, rejectionReason },
        auth
      );

      res.json(successResponse(result, "Document verification updated"));
    } catch (error: any) {
      console.error("DocumentController.verifyDocument error:", error);
      const status = error.statusCode ?? 400;
      res.status(status).json(errorResponse(error.message || "Failed to verify document", status));
    }
  }
}
