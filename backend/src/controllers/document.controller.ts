/**
 * Document Controller (Schema v2.1 aligned)
 */

import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { DocumentService } from "../services/documents.service";
import { successResponse, errorResponse, paginatedResponse } from "../utils/response";
import { DocumentAccessLevel, DocumentVerificationStatus } from "@prisma/client";
import { deleteStoredUpload, storeUploadedFile } from "../config/uploads";
import { logger, toLogContext } from "../lib/logger";

const buildAuth = (req: AuthRequest) => ({
  userId: req.user!.userId,
  profileId: req.user!.profileId!,
  roles: Array.from(new Set([...(req.userRoles || [])])),
});

const normalizeOptionalBoolean = (value: unknown): boolean | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.toLowerCase().trim();
    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0") return false;
  }
  return undefined;
};

export class DocumentController {
  static async listDocuments(req: AuthRequest, res: Response): Promise<void> {
    try {
      const auth = buildAuth(req);
      const page = Number(req.query.page) || 1;
      const pageSize = Number(req.query.pageSize) || 10;

      const verificationStatus = (req.query.verificationStatus ??
        req.query.status) as DocumentVerificationStatus | undefined;
      const accessLevel = req.query.accessLevel as DocumentAccessLevel | undefined;

      const documentType = req.query.documentType as string | undefined;
      const entityType = req.query.entityType as string | undefined;
      const entityId = req.query.entityId ? Number(req.query.entityId) : undefined;

      const result = await DocumentService.listDocuments(
        {
          page,
          pageSize,
          filters: {
            verificationStatus,
            accessLevel,
            documentType,
            entityType,
            entityId: Number.isFinite(entityId as number) ? (entityId as number) : undefined,
          },
        },
        auth
      );

      res.json(paginatedResponse(result.documents, result.total, page, pageSize, "Documents retrieved"));
    } catch (error: any) {
      logger.error("document_list_failed", toLogContext(error));
      res.status(500).json(errorResponse("Failed to retrieve documents", 500));
    }
  }

  static async uploadDocument(req: AuthRequest, res: Response): Promise<void> {
    let storedUpload: Awaited<ReturnType<typeof storeUploadedFile>> | null = null;
    try {
      const auth = buildAuth(req);

      const uploadedFile = (req as any).file as Express.Multer.File | undefined;
      if (uploadedFile) {
        storedUpload = await storeUploadedFile("documents", uploadedFile);
      }

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
      const normalizedIsRequired = normalizeOptionalBoolean(isRequired);

      const fileName = bodyFileName || storedUpload?.originalName || uploadedFile?.originalname;
      const filePath = storedUpload?.publicPath || bodyFilePath;
      const fileSize = storedUpload?.fileSize || bodyFileSize;
      const mimeType = storedUpload?.mimeType || bodyMimeType;

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
          isRequired: normalizedIsRequired,
        },
        auth
      );

      res.status(201).json(successResponse(result, "Document uploaded", 201));
    } catch (error: any) {
      if (storedUpload?.publicPath) {
        await deleteStoredUpload("documents", storedUpload.publicPath);
      }
      logger.error("document_upload_failed", toLogContext(error));
      const status = error.statusCode ?? 400;
      res.status(status).json(errorResponse(error.message || "Failed to upload document", status));
    }
  }

  static async requestDocument(req: AuthRequest, res: Response): Promise<void> {
    try {
      const auth = buildAuth(req);
      const {
        requestedProfileId,
        documentType,
        entityType,
        entityId,
        dueDate,
        message,
        priority,
      } = req.body;

      const result = await DocumentService.requestDocument(
        {
          requestedProfileId: Number(requestedProfileId),
          documentType: String(documentType || ""),
          entityType: String(entityType || ""),
          entityId:
            entityId === undefined || entityId === null || entityId === ""
              ? undefined
              : Number(entityId),
          dueDate: dueDate ? new Date(dueDate) : undefined,
          message,
          priority,
        },
        auth
      );

      res.status(201).json(successResponse(result, "Document request sent", 201));
    } catch (error: any) {
      logger.error("document_request_failed", toLogContext(error));
      const status = error.statusCode ?? 400;
      res
        .status(status)
        .json(errorResponse(error.message || "Failed to request document", status));
    }
  }

  static async getDocument(req: AuthRequest, res: Response): Promise<void> {
    try {
      const documentId = Number(req.params.documentId);
      const result = await DocumentService.getDocumentById(documentId);
      res.json(successResponse(result, "Document retrieved"));
    } catch (error: any) {
      logger.error("document_load_failed", toLogContext(error));
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
      logger.error("document_delete_failed", toLogContext(error));
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
      logger.error("document_verify_failed", toLogContext(error));
      const status = error.statusCode ?? 400;
      res.status(status).json(errorResponse(error.message || "Failed to verify document", status));
    }
  }
}
