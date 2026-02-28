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
import { NotificationService } from "./notifications.service";

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

type DocumentNotificationInput = {
  recipientProfileId: number;
  type: "info" | "action" | "warning" | "escalation";
  title: string;
  message: string;
  actionRequired?: boolean;
  link?: string;
  jobId?: number;
  clientId?: number;
};

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

  private normalizeEntityType(value: string | null | undefined) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  private normalizeDocumentType(value: string | null | undefined) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  private buildNotificationAuth(auth: AuthContext) {
    return {
      userId: auth.userId,
      profileId: auth.profileId,
      roleName: auth.roles?.[0],
    };
  }

  private buildDocumentLink(entityType: string, entityId?: number | null, documentType?: string) {
    const normalizedEntityType = this.normalizeEntityType(entityType);
    const normalizedDocumentType = this.normalizeDocumentType(documentType);

    if (normalizedEntityType === "job") {
      if (normalizedDocumentType.includes("invoice")) {
        return "/finance-balances";
      }
      return entityId ? `/jobs/${entityId}` : "/jobs";
    }

    if (normalizedEntityType === "jobinvoicemilestone") {
      return "/finance-balances";
    }

    if (normalizedEntityType === "onboarding" || normalizedEntityType === "clientonboarding") {
      return "/client-onboarding-queue";
    }

    if (
      normalizedEntityType === "inductionchecklist" ||
      normalizedEntityType === "employeeonboardingcase"
    ) {
      return "/profile?tab=onboarding";
    }

    if (
      normalizedEntityType === "offboardingchecklistitem" ||
      normalizedEntityType === "employeeoffboardingcase"
    ) {
      return "/profile";
    }

    if (normalizedEntityType === "proposal") {
      return "/business-development";
    }

    if (normalizedEntityType === "engagementletter" || normalizedEntityType === "client") {
      return "/clients";
    }

    if (
      normalizedEntityType === "profile" ||
      normalizedEntityType === "employee" ||
      normalizedEntityType === "recruitmentcandidate" ||
      normalizedEntityType === "candidate"
    ) {
      return "/documents";
    }

    return "/documents";
  }

  private async findProfileIdsByAuthRoles(roleNames: string[]) {
    if (!roleNames.length) return [];
    const profiles = await prisma.profile.findMany({
      where: {
        user: {
          roles: {
            some: {
              role: {
                name: {
                  in: roleNames,
                },
              },
            },
          },
        },
      },
      select: { id: true },
    });
    return profiles.map((profile) => profile.id);
  }

  private async dispatchNotifications(
    notifications: DocumentNotificationInput[],
    auth: AuthContext
  ) {
    if (!notifications.length) return;

    const authContext = this.buildNotificationAuth(auth);
    await Promise.allSettled(
      notifications.map((notification) =>
        NotificationService.createNotification(notification, authContext)
      )
    );
  }

  private async resolveSubmissionNotifications(
    document: {
      id: number;
      fileName: string;
      documentType: string;
      entityType: string;
      entityId: number | null;
      uploadedBy: number | null;
    },
    auth: AuthContext
  ): Promise<DocumentNotificationInput[]> {
    if (!document.entityId) return [];

    const notifications: DocumentNotificationInput[] = [];
    const recipientSet = new Set<number>();
    const roleCache = new Map<string, number[]>();
    const normalizedEntityType = this.normalizeEntityType(document.entityType);
    const normalizedDocumentType = this.normalizeDocumentType(document.documentType);
    const defaultLink = this.buildDocumentLink(
      document.entityType,
      document.entityId,
      document.documentType
    );

    const queue = (
      recipientProfileId: number | null | undefined,
      payload: Omit<DocumentNotificationInput, "recipientProfileId">
    ) => {
      if (!recipientProfileId || recipientProfileId <= 0) return;
      if (recipientProfileId === auth.profileId) return;
      if (recipientSet.has(recipientProfileId)) return;
      recipientSet.add(recipientProfileId);
      notifications.push({ recipientProfileId, ...payload });
    };

    const queueRoleRecipients = async (
      roleNames: string[],
      payload: Omit<DocumentNotificationInput, "recipientProfileId">
    ) => {
      const key = roleNames.slice().sort().join("|");
      let ids = roleCache.get(key);
      if (!ids) {
        ids = await this.findProfileIdsByAuthRoles(roleNames);
        roleCache.set(key, ids);
      }
      ids.forEach((id) => queue(id, payload));
    };

    if (normalizedEntityType === "offboardingchecklistitem") {
      const item = await prisma.offboardingChecklistItem.findUnique({
        where: { id: document.entityId },
        select: {
          id: true,
          itemName: true,
          offboardingCase: {
            select: { id: true, profileId: true, hrOwnerProfileId: true },
          },
        },
      });

      if (item?.offboardingCase) {
        const target =
          auth.profileId === item.offboardingCase.profileId
            ? item.offboardingCase.hrOwnerProfileId
            : item.offboardingCase.profileId;
        queue(target, {
          type: "action",
          title: "Offboarding document submitted",
          message: `A document for "${item.itemName}" was submitted and is ready for review.`,
          actionRequired: true,
          link: "/profile",
        });
      }
      return notifications;
    }

    if (normalizedEntityType === "inductionchecklist") {
      const checklist = await prisma.inductionChecklist.findUnique({
        where: { id: document.entityId },
        select: {
          id: true,
          checklistName: true,
          employeeProfileId: true,
          assignedByProfileId: true,
          onboardingCase: { select: { hrOwnerProfileId: true } },
        },
      });

      if (checklist) {
        const reviewerProfileId =
          checklist.onboardingCase?.hrOwnerProfileId ?? checklist.assignedByProfileId;
        const target =
          auth.profileId === checklist.employeeProfileId
            ? reviewerProfileId
            : checklist.employeeProfileId;
        queue(target, {
          type: "action",
          title: "Onboarding document submitted",
          message: `A checklist document for "${checklist.checklistName}" was submitted.`,
          actionRequired: true,
          link: "/profile?tab=onboarding",
        });
      }
      return notifications;
    }

    if (normalizedEntityType === "employeeonboardingcase") {
      const onboardingCase = await prisma.employeeOnboardingCase.findUnique({
        where: { id: document.entityId },
        select: { id: true, profileId: true, hrOwnerProfileId: true },
      });

      if (onboardingCase) {
        const target =
          auth.profileId === onboardingCase.profileId
            ? onboardingCase.hrOwnerProfileId
            : onboardingCase.profileId;
        queue(target, {
          type: "action",
          title: "Onboarding document submitted",
          message: "A document was submitted and is ready for onboarding review.",
          actionRequired: true,
          link: "/profile?tab=onboarding",
        });
      }
      return notifications;
    }

    if (normalizedEntityType === "employeeoffboardingcase") {
      const offboardingCase = await prisma.employeeOffboardingCase.findUnique({
        where: { id: document.entityId },
        select: { id: true, profileId: true, hrOwnerProfileId: true },
      });

      if (offboardingCase) {
        const target =
          auth.profileId === offboardingCase.profileId
            ? offboardingCase.hrOwnerProfileId
            : offboardingCase.profileId;
        queue(target, {
          type: "action",
          title: "Offboarding document submitted",
          message: "A document was submitted and is ready for offboarding review.",
          actionRequired: true,
          link: "/profile",
        });
      }
      return notifications;
    }

    if (normalizedEntityType === "onboarding" || normalizedEntityType === "clientonboarding") {
      const onboarding = await prisma.clientOnboarding.findUnique({
        where: { id: document.entityId },
        select: {
          id: true,
          clientName: true,
          hrReviewerProfileId: true,
        },
      });

      if (onboarding) {
        const payload = {
          type: "action" as const,
          title: "Client onboarding document submitted",
          message: `A document for client onboarding "${onboarding.clientName}" is ready for review.`,
          actionRequired: true,
          link: "/client-onboarding-queue",
        };

        if (onboarding.hrReviewerProfileId) {
          queue(onboarding.hrReviewerProfileId, payload);
        } else {
          await queueRoleRecipients(["hr", "hr_manager", "admin", "super_admin"], payload);
        }
      }
      if (!onboarding && normalizedEntityType === "onboarding") {
        const employeeOnboarding = await prisma.employeeOnboardingCase.findUnique({
          where: { id: document.entityId },
          select: { id: true, profileId: true, hrOwnerProfileId: true },
        });
        if (employeeOnboarding) {
          const target =
            auth.profileId === employeeOnboarding.profileId
              ? employeeOnboarding.hrOwnerProfileId
              : employeeOnboarding.profileId;
          queue(target, {
            type: "action",
            title: "Onboarding document submitted",
            message: "A document was submitted and is ready for onboarding review.",
            actionRequired: true,
            link: "/profile?tab=onboarding",
          });
        }
      }
      return notifications;
    }

    if (normalizedEntityType === "profile" || normalizedEntityType === "employee") {
      const profile = await prisma.profile.findUnique({
        where: { id: document.entityId },
        select: { id: true, firstName: true, lastName: true },
      });

      if (profile) {
        if (auth.profileId === profile.id) {
          await queueRoleRecipients(
            ["hr", "hr_manager", "admin", "super_admin"],
            {
              type: "action",
              title: "Employee document submitted",
              message: `A document for ${profile.firstName} ${profile.lastName} was submitted for verification.`,
              actionRequired: true,
              link: "/documents",
            }
          );
        } else {
          queue(profile.id, {
            type: "info",
            title: "Employee document updated",
            message: `A document was uploaded for your profile: ${document.fileName}.`,
            actionRequired: false,
            link: "/documents",
          });
        }
      }
      return notifications;
    }

    if (normalizedEntityType === "recruitmentcandidate" || normalizedEntityType === "candidate") {
      const candidate = await prisma.recruitmentCandidate.findUnique({
        where: { id: document.entityId },
        select: {
          id: true,
          fullName: true,
          createdByProfileId: true,
          onboardingCase: { select: { hrOwnerProfileId: true } },
        },
      });

      if (candidate) {
        queue(candidate.createdByProfileId, {
          type: "action",
          title: "Candidate document submitted",
          message: `A document for candidate "${candidate.fullName}" was submitted.`,
          actionRequired: true,
          link: "/documents",
        });
        queue(candidate.onboardingCase?.hrOwnerProfileId, {
          type: "action",
          title: "Candidate onboarding document submitted",
          message: `A candidate document for "${candidate.fullName}" is ready for review.`,
          actionRequired: true,
          link: "/documents",
        });
      }
      return notifications;
    }

    if (normalizedEntityType === "job") {
      const job = await prisma.job.findUnique({
        where: { id: document.entityId },
        select: {
          id: true,
          jobName: true,
          managerProfileId: true,
          partnerProfileId: true,
          clientId: true,
        },
      });

      if (job) {
        const isInvoiceDoc = normalizedDocumentType.includes("invoice");
        const isReportDoc =
          normalizedDocumentType.includes("report") ||
          normalizedDocumentType.includes("deliverable") ||
          normalizedDocumentType.includes("managementletter");

        const payload = {
          type: "action" as const,
          title: isInvoiceDoc
            ? "Invoice document submitted"
            : isReportDoc
            ? "Report document submitted"
            : "Job document submitted",
          message: isInvoiceDoc
            ? `An invoice document for "${job.jobName}" is ready for finance action.`
            : `A document for "${job.jobName}" was submitted and is ready for review.`,
          actionRequired: true,
          link: isInvoiceDoc ? "/finance-balances" : `/jobs/${job.id}`,
          jobId: job.id,
          clientId: job.clientId ?? undefined,
        };

        queue(job.managerProfileId, payload);
        queue(job.partnerProfileId, payload);
        if (isInvoiceDoc) {
          await queueRoleRecipients(["finance", "finance_manager"], payload);
        }
      }
      return notifications;
    }

    if (normalizedEntityType === "jobinvoicemilestone") {
      const task = await prisma.task.findUnique({
        where: { id: document.entityId },
        select: {
          id: true,
          title: true,
          job: {
            select: {
              id: true,
              jobName: true,
              managerProfileId: true,
              partnerProfileId: true,
              clientId: true,
            },
          },
        },
      });

      if (task?.job) {
        const payload = {
          type: "action" as const,
          title: "Invoice milestone document submitted",
          message: `A document for milestone "${task.title}" on "${task.job.jobName}" is ready for finance review.`,
          actionRequired: true,
          link: "/finance-balances",
          jobId: task.job.id,
          clientId: task.job.clientId ?? undefined,
        };

        queue(task.job.managerProfileId, payload);
        queue(task.job.partnerProfileId, payload);
        await queueRoleRecipients(["finance", "finance_manager"], payload);
      }
      return notifications;
    }

    if (normalizedEntityType === "engagementletter") {
      const letter = await prisma.engagementLetter.findUnique({
        where: { id: document.entityId },
        select: {
          id: true,
          client: {
            select: {
              clientName: true,
              managerProfileId: true,
              partnerProfileId: true,
            },
          },
          approvedByProfileId: true,
        },
      });

      if (letter) {
        const payload = {
          type: "action" as const,
          title: "Engagement letter document submitted",
          message: `A document for client "${letter.client.clientName}" is ready for engagement review.`,
          actionRequired: true,
          link: "/client-onboarding-queue",
        };

        queue(letter.approvedByProfileId, payload);
        queue(letter.client.managerProfileId, payload);
        queue(letter.client.partnerProfileId, payload);
        await queueRoleRecipients(["hr", "hr_manager", "admin", "super_admin"], payload);
      }
      return notifications;
    }

    if (normalizedEntityType === "client") {
      const client = await prisma.client.findUnique({
        where: { id: document.entityId },
        select: {
          id: true,
          clientName: true,
          managerProfileId: true,
          partnerProfileId: true,
        },
      });

      if (client) {
        const payload = {
          type: "action" as const,
          title: "Client document submitted",
          message: `A document for client "${client.clientName}" was submitted and is ready for review.`,
          actionRequired: true,
          link: "/clients",
          clientId: client.id,
        };
        queue(client.managerProfileId, payload);
        queue(client.partnerProfileId, payload);
      }
      return notifications;
    }

    if (normalizedEntityType === "proposal") {
      const proposal = await prisma.proposal.findUnique({
        where: { id: document.entityId },
        select: {
          id: true,
          proposalTitle: true,
          assignedPartnerProfileId: true,
          createdByProfileId: true,
        },
      });

      if (proposal) {
        queue(proposal.assignedPartnerProfileId, {
          type: "action",
          title: "Proposal document submitted",
          message: `A document for proposal "${proposal.proposalTitle}" is ready for review.`,
          actionRequired: true,
          link: "/business-development",
        });
        queue(proposal.createdByProfileId, {
          type: "info",
          title: "Proposal document updated",
          message: `A document for proposal "${proposal.proposalTitle}" was uploaded.`,
          actionRequired: false,
          link: "/business-development",
        });
      }
      return notifications;
    }

    if (defaultLink && document.uploadedBy && auth.profileId !== document.uploadedBy) {
      queue(document.uploadedBy, {
        type: "info",
        title: "Document updated",
        message: `Document "${document.fileName}" was updated.`,
        actionRequired: false,
        link: defaultLink,
      });
    }

    return notifications;
  }

  private async resolveVerificationNotifications(
    document: {
      id: number;
      fileName: string;
      documentType: string;
      entityType: string;
      entityId: number | null;
      uploadedBy: number | null;
      rejectionReason: string | null;
    },
    input: DocumentVerifyInput,
    auth: AuthContext
  ): Promise<DocumentNotificationInput[]> {
    if (!document.uploadedBy || document.uploadedBy === auth.profileId) {
      return [];
    }

    const isVerified = input.verificationStatus === DocumentVerificationStatus.verified;
    const isRejected = input.verificationStatus === DocumentVerificationStatus.rejected;

    const title = isVerified
      ? "Document verified"
      : isRejected
      ? "Document rejected"
      : "Document verification updated";

    const message = isVerified
      ? `Your document "${document.fileName}" has been verified.`
      : isRejected
      ? `Your document "${document.fileName}" was rejected.${
          document.rejectionReason ? ` Reason: ${document.rejectionReason}` : ""
        }`
      : `Verification status for "${document.fileName}" was updated to pending.`;

    return [
      {
        recipientProfileId: document.uploadedBy,
        type: isRejected ? "warning" : "info",
        title,
        message,
        actionRequired: isRejected,
        link: this.buildDocumentLink(document.entityType, document.entityId, document.documentType),
      },
    ];
  }

  private expandEntityTypeFilter(entityType: string): string[] {
    const normalized = this.normalizeEntityType(entityType);
    switch (normalized) {
      case "profile":
      case "employee":
        return ["Profile", "profile", "Employee", "employee"];
      case "client":
        return ["Client", "client"];
      case "job":
        return ["Job", "job"];
      case "candidate":
      case "recruitmentcandidate":
        return ["RecruitmentCandidate", "candidate", "recruitment_candidate"];
      case "proposal":
        return ["Proposal", "proposal"];
      case "onboarding":
      case "clientonboarding":
        return [
          "Onboarding",
          "ClientOnboarding",
          "client_onboarding",
          "clientonboarding",
          "EmployeeOnboardingCase",
          "employee_onboarding_case",
        ];
      case "inductionchecklist":
        return ["InductionChecklist", "induction_checklist"];
      case "offboardingchecklistitem":
        return ["OffboardingChecklistItem", "offboarding_checklist_item"];
      case "employeeonboardingcase":
        return ["EmployeeOnboardingCase", "employee_onboarding_case"];
      case "employeeoffboardingcase":
        return ["EmployeeOffboardingCase", "employee_offboarding_case"];
      case "engagementletter":
        return ["EngagementLetter", "engagement_letter"];
      case "jobinvoicemilestone":
        return ["JobInvoiceMilestone", "job_invoice_milestone"];
      default:
        return [entityType];
    }
  }

  /**
   * Upload document (metadata record)
   * Access: any authenticated user can upload
   */
  async uploadDocument(input: DocumentUploadInput, auth: AuthContext) {
    const created = await prisma.document.create({
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

    try {
      const notifications = await this.resolveSubmissionNotifications(created, auth);
      await this.dispatchNotifications(notifications, auth);
    } catch (error) {
      console.error("DocumentService.uploadDocument notification error:", error);
    }

    return created;
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
    if (filters.entityType) {
      const entityTypes = this.expandEntityTypeFilter(filters.entityType);
      where.entityType =
        entityTypes.length === 1 ? entityTypes[0] : { in: entityTypes };
    }
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

    const updated = await prisma.document.update({
      where: { id: documentId },
      data: {
        verificationStatus: input.verificationStatus,
        rejectionReason: input.verificationStatus === DocumentVerificationStatus.rejected ? input.rejectionReason : null,
        verifiedBy:
          input.verificationStatus === DocumentVerificationStatus.pending
            ? null
            : auth.profileId,
        verifiedAt:
          input.verificationStatus === DocumentVerificationStatus.pending
            ? null
            : new Date(),
      },
      include: {
        uploader: { select: { id: true, firstName: true, lastName: true } },
        verifier: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    try {
      const notifications = await this.resolveVerificationNotifications(updated, input, auth);
      await this.dispatchNotifications(notifications, auth);
    } catch (error) {
      console.error("DocumentService.verifyDocument notification error:", error);
    }

    return updated;
  }
}

export const DocumentService = new DocumentServiceClass();
