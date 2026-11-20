import { JobWorkingLinkStatus, JobWorkingLinkType } from "@prisma/client";
import prisma from "../prisma";
import { createAudit } from "../utils/audit";
import { NotificationService } from "./notifications.service";

interface AuthContext {
  userId: number;
  profileId: number;
  roles?: string[];
}

const LINK_TYPES: JobWorkingLinkType[] = [
  "milestone_requirement",
  "proposal",
  "cost_estimate",
  "work_plan",
  "budget",
  "other",
];

const normalizeRole = (role: string | null | undefined) =>
  String(role || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

const isGoogleDriveUrl = (value: string) => {
  try {
    const url = new URL(String(value || "").trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    const host = url.hostname.toLowerCase();
    if (host === "docs.google.com") {
      return /^\/(document|spreadsheets|presentation|forms)\//.test(url.pathname);
    }
    if (host === "drive.google.com") {
      return (
        /^\/file\/d\//.test(url.pathname) ||
        /^\/drive\/(u\/\d+\/)?folders\//.test(url.pathname) ||
        url.pathname === "/open"
      );
    }
    return false;
  } catch {
    return false;
  }
};

const buildNotificationAuth = (auth: AuthContext) => ({
  userId: auth.userId,
  profileId: auth.profileId,
  roleName: auth.roles?.[0],
});

export class JobWorkingDocumentLinksService {
  private static async getJob(jobId: number) {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        jobName: true,
        managerProfileId: true,
        partnerProfileId: true,
        staffing: { select: { employeeProfileId: true } },
      },
    });
    if (!job) {
      throw { statusCode: 404, message: "Job not found" };
    }
    return job;
  }

  private static async assertCanContribute(jobId: number, auth: AuthContext) {
    const job = await this.getJob(jobId);
    const roles = new Set((auth.roles || []).map(normalizeRole));
    const isPrivileged =
      roles.has("super_admin") ||
      roles.has("hr") ||
      roles.has("gmp") ||
      roles.has("finance");
    const isOwner =
      job.managerProfileId === auth.profileId ||
      job.partnerProfileId === auth.profileId;
    const isAssigned = job.staffing.some(
      (assignment) => assignment.employeeProfileId === auth.profileId
    );
    if (!isPrivileged && !isOwner && !isAssigned) {
      throw { statusCode: 403, message: "Not authorized to add links to this job" };
    }
    return job;
  }

  private static normalizeLinkType(value: unknown): JobWorkingLinkType {
    const normalized = String(value || "").trim().toLowerCase() as JobWorkingLinkType;
    if (!LINK_TYPES.includes(normalized)) {
      throw { statusCode: 400, message: "Invalid working document link type" };
    }
    return normalized;
  }

  private static assertDriveUrl(value: unknown) {
    const url = String(value || "").trim();
    if (!url) {
      throw { statusCode: 400, message: "A Google Drive/Docs URL is required" };
    }
    if (!isGoogleDriveUrl(url)) {
      throw {
        statusCode: 400,
        message:
          "Only Google Drive, Google Docs, Sheets, Slides, Forms, or Drive folder links are allowed",
      };
    }
    return url;
  }

  static async list(jobId: number) {
    await this.getJob(jobId);
    return prisma.jobWorkingDocumentLink.findMany({
      where: { jobId },
      orderBy: { createdAt: "desc" },
      include: {
        addedBy: { select: { id: true, firstName: true, lastName: true } },
        approvedBy: { select: { id: true, firstName: true, lastName: true } },
        milestoneTask: { select: { id: true, title: true, status: true } },
      },
    });
  }

  static async create(
    jobId: number,
    input: {
      linkType?: unknown;
      label?: unknown;
      url?: unknown;
      milestoneTaskId?: unknown;
      notes?: unknown;
    },
    auth: AuthContext
  ) {
    const job = await this.assertCanContribute(jobId, auth);
    const linkType = this.normalizeLinkType(input.linkType);
    const label = String(input.label || "").trim();
    if (!label) {
      throw { statusCode: 400, message: "Link label is required" };
    }
    const url = this.assertDriveUrl(input.url);
    const milestoneTaskId =
      input.milestoneTaskId !== undefined &&
      input.milestoneTaskId !== null &&
      String(input.milestoneTaskId).trim() !== ""
        ? Number(input.milestoneTaskId)
        : null;

    if (milestoneTaskId) {
      const task = await prisma.task.findFirst({
        where: { id: milestoneTaskId, jobId },
        select: { id: true },
      });
      if (!task) {
        throw { statusCode: 404, message: "Milestone task not found for this job" };
      }
    }

    const created = await prisma.jobWorkingDocumentLink.create({
      data: {
        jobId,
        milestoneTaskId: milestoneTaskId || null,
        linkType,
        label,
        url,
        addedByProfileId: auth.profileId,
        notes: String(input.notes || "").trim() || null,
      },
      include: {
        addedBy: { select: { id: true, firstName: true, lastName: true } },
        milestoneTask: { select: { id: true, title: true, status: true } },
      },
    });

    const approverProfileId =
      linkType === "milestone_requirement"
        ? job.managerProfileId || job.partnerProfileId
        : job.partnerProfileId || job.managerProfileId;
    if (approverProfileId) {
      await NotificationService.createNotification(
        {
          recipientProfileId: approverProfileId,
          type: "action",
          title: `Working link awaiting review: ${job.jobName}`,
          message: `${label} was added for "${job.jobName}" and needs review.`,
          actionRequired: true,
          jobId,
          link: `/jobs/${jobId}/tracking`,
        },
        buildNotificationAuth(auth)
      ).catch(() => null);
    }

    await createAudit({
      action: "job_working_link_created",
      entity_type: "JobWorkingDocumentLink",
      entity_id: created.id,
      user_id: auth.userId,
      metadata: { jobId, linkType, milestoneTaskId },
    }).catch(() => null);

    return created;
  }

  static async update(
    jobId: number,
    linkId: number,
    input: { label?: unknown; url?: unknown; linkType?: unknown; notes?: unknown },
    auth: AuthContext
  ) {
    const job = await this.assertCanContribute(jobId, auth);
    const existing = await prisma.jobWorkingDocumentLink.findFirst({
      where: { id: linkId, jobId },
    });
    if (!existing) {
      throw { statusCode: 404, message: "Working document link not found" };
    }
    const roles = new Set((auth.roles || []).map(normalizeRole));
    const isPrivileged =
      roles.has("super_admin") || roles.has("hr") || roles.has("gmp");
    const isOwner =
      job.managerProfileId === auth.profileId ||
      job.partnerProfileId === auth.profileId;
    if (!isPrivileged && !isOwner && existing.addedByProfileId !== auth.profileId) {
      throw { statusCode: 403, message: "Not authorized to edit this working link" };
    }

    const updated = await prisma.jobWorkingDocumentLink.update({
      where: { id: linkId },
      data: {
        label: String(input.label ?? existing.label).trim(),
        url: input.url !== undefined ? this.assertDriveUrl(input.url) : existing.url,
        linkType:
          input.linkType !== undefined
            ? this.normalizeLinkType(input.linkType)
            : existing.linkType,
        notes:
          input.notes !== undefined
            ? String(input.notes || "").trim() || null
            : existing.notes,
        reviewStatus: "pending",
        approvedByProfileId: null,
        approvedAt: null,
      },
      include: {
        addedBy: { select: { id: true, firstName: true, lastName: true } },
        approvedBy: { select: { id: true, firstName: true, lastName: true } },
        milestoneTask: { select: { id: true, title: true, status: true } },
      },
    });

    return updated;
  }

  static async remove(jobId: number, linkId: number, auth: AuthContext) {
    const job = await this.assertCanContribute(jobId, auth);
    const existing = await prisma.jobWorkingDocumentLink.findFirst({
      where: { id: linkId, jobId },
    });
    if (!existing) {
      throw { statusCode: 404, message: "Working document link not found" };
    }
    const roles = new Set((auth.roles || []).map(normalizeRole));
    const isPrivileged =
      roles.has("super_admin") || roles.has("hr") || roles.has("gmp");
    const isOwner =
      job.managerProfileId === auth.profileId ||
      job.partnerProfileId === auth.profileId;
    if (!isPrivileged && !isOwner && existing.addedByProfileId !== auth.profileId) {
      throw { statusCode: 403, message: "Not authorized to remove this working link" };
    }

    await prisma.jobWorkingDocumentLink.delete({ where: { id: linkId } });
    return { id: linkId, deleted: true };
  }

  static async review(
    jobId: number,
    linkId: number,
    input: { status?: unknown; notes?: unknown },
    auth: AuthContext
  ) {
    const job = await this.getJob(jobId);
    const link = await prisma.jobWorkingDocumentLink.findFirst({
      where: { id: linkId, jobId },
    });
    if (!link) {
      throw { statusCode: 404, message: "Working document link not found" };
    }

    const status = String(input.status || "").trim().toLowerCase() as JobWorkingLinkStatus;
    if (!["approved", "rejected"].includes(status)) {
      throw { statusCode: 400, message: "Review status must be approved or rejected" };
    }

    const roles = new Set((auth.roles || []).map(normalizeRole));
    const isAdmin =
      roles.has("super_admin") || roles.has("gmp") || roles.has("hr");
    const isManager = job.managerProfileId === auth.profileId;
    const isPartner = job.partnerProfileId === auth.profileId;
    const canReview =
      link.linkType === "milestone_requirement"
        ? isAdmin || isManager || isPartner
        : isAdmin || isPartner;
    if (!canReview) {
      throw {
        statusCode: 403,
        message:
          link.linkType === "milestone_requirement"
            ? "Only the job manager or partner can review this milestone link"
            : "Only the job partner can review this working document link",
      };
    }

    const updated = await prisma.jobWorkingDocumentLink.update({
      where: { id: linkId },
      data: {
        reviewStatus: status,
        approvedByProfileId: status === "approved" ? auth.profileId : null,
        approvedAt: status === "approved" ? new Date() : null,
        notes:
          input.notes !== undefined
            ? String(input.notes || "").trim() || null
            : link.notes,
      },
      include: {
        addedBy: { select: { id: true, firstName: true, lastName: true } },
        approvedBy: { select: { id: true, firstName: true, lastName: true } },
        milestoneTask: { select: { id: true, title: true, status: true } },
      },
    });

    if (link.addedByProfileId !== auth.profileId) {
      await NotificationService.createNotification(
        {
          recipientProfileId: link.addedByProfileId,
          type: status === "approved" ? "info" : "action",
          title:
            status === "approved"
              ? "Working document link approved"
              : "Working document link rejected",
          message: `${link.label} for "${job.jobName}" was ${status}.`,
          actionRequired: status === "rejected",
          jobId,
          link: `/jobs/${jobId}/tracking`,
        },
        buildNotificationAuth(auth)
      ).catch(() => null);
    }

    await createAudit({
      action: `job_working_link_${status}`,
      entity_type: "JobWorkingDocumentLink",
      entity_id: linkId,
      user_id: auth.userId,
      metadata: { jobId, linkType: link.linkType },
    }).catch(() => null);

    return updated;
  }
}

export default JobWorkingDocumentLinksService;
