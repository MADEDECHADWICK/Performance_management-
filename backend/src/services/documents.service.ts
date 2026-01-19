/**
 * DocumentService (Schema v2.1 aligned)
 *
 * Prisma Document model (from your schema):
 * - fileName, filePath, fileSize?, mimeType?
 * - documentType, entityType, entityId?
 * - accessLevel (DocumentAccessLevel enum)
 * - isRequired, verificationStatus (DocumentVerificationStatus enum), rejectionReason?
 * - uploadedBy, verifiedBy, verifiedAt
 * - createdAt, updatedAt
 */

import prisma from "../prisma";
import { DocumentAccessLevel, DocumentVerificationStatus } from "@prisma/client";

export interface ListDocumentsOptions {
  page: number;
  pageSize: number;
  filters?: {
    verificationStatus?: DocumentVerificationStatus;
    accessLevel?: DocumentAccessLevel;
    documentType?: string;
    entityType?: string;
    entityId?: number;
  };
}

export interface DocumentUploadInput {
  fileName: string;
  filePath: string;
  fileSize?: number;
  mimeType?: string;

  documentType: string; // e.g. "offer_letter", "policy", etc. (your schema uses String)
  entityType: string;   // e.g. "Profile", "ClientOnboarding", etc.
  entityId?: number;

  accessLevel: DocumentAccessLevel;
  description?: string;

  isRequired?: boolean;
}

export interface DocumentVerifyInput {
  verificationStatus: DocumentVerificationStatus; // "verified" | "rejected" | "pending"
  rejectionReason?: string;
}

export interface AuthContext {
  userId: number;
  profileId: number;
  roles?: string[];
}

class DocumentServiceClass {
  private requireHrOrAdmin(auth: AuthContext) {
    const roles = auth.roles ?? [];
    const isAdmin = roles.includes("admin") || roles.includes("super_admin");
    const isHr = roles.includes("hr") || roles.includes("hr_manager");
    if (!isAdmin && !isHr) {
      const err = new Error("Forbidden");
      (err as any).statusCode = 403;
      throw err;
    }
  }

  /**
   * Upload document (metadata record)
   * Access: any authenticated user can upload
   */
  async uploadDocument(input: DocumentUploadInput, auth: AuthContext) {
    return prisma.document.create({
      data: {
        fileName: input.fileName,
        filePath: input.filePath,
        fileSize: input.fileSize,
        mimeType: input.mimeType,

        documentType: input.documentType,
        entityType: input.entityType,
        entityId: input.entityId,

        accessLevel: input.accessLevel,
        description: input.description,

        isRequired: input.isRequired ?? false,
        verificationStatus: DocumentVerificationStatus.pending,

        uploadedBy: auth.profileId,
      },
      include: {
        uploader: { select: { id: true, firstName: true, lastName: true } },
        verifier: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  /**
   * Get document by ID
   */
  async getDocumentById(documentId: number) {
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      include: {
        uploader: { select: { id: true, firstName: true, lastName: true, user: { select: { email: true } } } },
        verifier: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!doc) {
      const err = new Error("Document not found");
      (err as any).statusCode = 404;
      throw err;
    }

    return doc;
  }

  /**
   * List documents
   * NOTE: Access enforcement should be handled by your withDocumentAccess middleware per-item.
   * This list function is kept simple and filterable.
   */
  async listDocuments(options: ListDocumentsOptions) {
    const { page, pageSize, filters = {} } = options;
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (filters.verificationStatus) where.verificationStatus = filters.verificationStatus;
    if (filters.accessLevel) where.accessLevel = filters.accessLevel;
    if (filters.documentType) where.documentType = filters.documentType;
    if (filters.entityType) where.entityType = filters.entityType;
    if (typeof filters.entityId === "number") where.entityId = filters.entityId;

    const [documents, total] = await Promise.all([
      prisma.document.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          uploader: { select: { id: true, firstName: true, lastName: true } },
          verifier: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      prisma.document.count({ where }),
    ]);

    return { documents, total };
  }

  /**
   * Delete document
   * Access: uploader or admin
   */
  async deleteDocument(documentId: number, auth: AuthContext) {
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      select: { id: true, uploadedBy: true },
    });

    if (!doc) {
      const err = new Error("Document not found");
      (err as any).statusCode = 404;
      throw err;
    }

    const roles = auth.roles ?? [];
    const isAdmin = roles.includes("admin") || roles.includes("super_admin");

    if (!isAdmin && doc.uploadedBy !== auth.profileId) {
      const err = new Error("Forbidden");
      (err as any).statusCode = 403;
      throw err;
    }

    await prisma.document.delete({ where: { id: documentId } });
    return { id: documentId, deleted: true };
  }

  /**
   * Verify document (HR/Admin)
   */
  async verifyDocument(documentId: number, input: DocumentVerifyInput, auth: AuthContext) {
    this.requireHrOrAdmin(auth);

    // ensure exists
    await this.getDocumentById(documentId);

    if (input.verificationStatus === DocumentVerificationStatus.rejected && !input.rejectionReason) {
      const err = new Error("rejectionReason is required when rejecting a document");
      (err as any).statusCode = 400;
      throw err;
    }

    return prisma.document.update({
      where: { id: documentId },
      data: {
        verificationStatus: input.verificationStatus,
        rejectionReason: input.verificationStatus === DocumentVerificationStatus.rejected ? input.rejectionReason : null,
        verifiedBy: auth.profileId,
        verifiedAt: new Date(),
      },
      include: {
        uploader: { select: { id: true, firstName: true, lastName: true } },
        verifier: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }
}

export const DocumentService = new DocumentServiceClass();
