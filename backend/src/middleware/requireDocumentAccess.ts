/**
 * Document access control middleware
 *
 * Base policy:
 * - uploader and verifier always allowed
 * - Access-level checks (employee/manager/hr/admin)
 *
 * Workflow policy:
 * - Allows next-stage recipients to read linked workflow documents
 *   (job, onboarding, engagement, client/proposal flow) even when
 *   document accessLevel is strict (e.g. admin).
 */

import { Response, NextFunction } from "express";
import prisma from "../prisma";
import { AuthRequest } from "./auth";

type AccessDoc = {
  id: number;
  accessLevel: string;
  verificationStatus: string;
  uploadedBy: number | null;
  verifiedBy: number | null;
  entityType: string;
  entityId: number | null;
  fileName: string;
  documentType: string;
};

const normalizeRole = (value: string | null | undefined) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const normalizeEntityType = (value: string | null | undefined) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const unique = (items: string[]) => Array.from(new Set(items.filter(Boolean)));

const resolveRoles = (req: AuthRequest): string[] => {
  const roles = unique([
    ...(req.userRoles || []).map((role) => normalizeRole(role)),
    ...(req.user?.authRoles || []).map((role) => normalizeRole(role)),
    normalizeRole(req.profile?.role?.name),
  ]);

  if (roles.length > 0) {
    req.userRoles = roles;
  }
  return roles;
};

const hasAnyRole = (roles: string[], expected: string[]) => {
  const roleSet = new Set(roles.map((role) => normalizeRole(role)));
  return expected.some((role) => roleSet.has(normalizeRole(role)));
};

const isAdmin = (roles: string[]) => hasAnyRole(roles, ["admin", "super_admin"]);
const isHR = (roles: string[]) =>
  hasAnyRole(roles, ["hr", "hr_manager", "human_resources"]);
const isManager = (roles: string[]) => hasAnyRole(roles, ["manager"]);
const isPartner = (roles: string[]) =>
  hasAnyRole(roles, ["partner", "gmp", "group_managing_partner"]);
const isGmp = (roles: string[]) =>
  hasAnyRole(roles, ["gmp", "group_managing_partner"]);
const isFinance = (roles: string[]) => hasAnyRole(roles, ["finance"]);
const isMarketing = (roles: string[]) => hasAnyRole(roles, ["marketing"]);

const allowedByAccessLevel = (accessLevel: string, roles: string[]) => {
  if (isAdmin(roles)) return true;

  switch (accessLevel) {
    case "admin":
      return false;
    case "hr":
      return isHR(roles);
    case "manager":
      return isHR(roles) || isManager(roles) || isPartner(roles);
    case "employee":
      return true; // any authenticated profile
    default:
      return false;
  }
};

const hasJobWorkflowAccess = async (
  jobId: number,
  profileId: number,
  roles: string[]
) => {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      managerProfileId: true,
      partnerProfileId: true,
      receivableOwnerProfileId: true,
      staffing: {
        where: { employeeProfileId: profileId },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!job) return false;

  return (
    job.managerProfileId === profileId ||
    job.partnerProfileId === profileId ||
    job.receivableOwnerProfileId === profileId ||
    job.staffing.length > 0 ||
    isHR(roles) ||
    isFinance(roles) ||
    isGmp(roles)
  );
};

const hasClientWorkflowAccess = async (
  clientId: number,
  profileId: number,
  roles: string[]
) => {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { managerProfileId: true, partnerProfileId: true },
  });

  if (!client) return false;

  return (
    client.managerProfileId === profileId ||
    client.partnerProfileId === profileId ||
    isHR(roles) ||
    isFinance(roles) ||
    isMarketing(roles) ||
    isGmp(roles)
  );
};

const hasProposalWorkflowAccess = async (
  proposalId: number,
  profileId: number,
  roles: string[]
) => {
  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    select: {
      createdByProfileId: true,
      assignedPartnerProfileId: true,
      clientId: true,
      client: {
        select: {
          managerProfileId: true,
          partnerProfileId: true,
        },
      },
    },
  });

  if (!proposal) return false;

  return (
    proposal.createdByProfileId === profileId ||
    proposal.assignedPartnerProfileId === profileId ||
    proposal.client?.managerProfileId === profileId ||
    proposal.client?.partnerProfileId === profileId ||
    isHR(roles) ||
    isFinance(roles) ||
    isMarketing(roles) ||
    isGmp(roles)
  );
};

const hasEngagementLetterWorkflowAccess = async (
  engagementLetterId: number,
  profileId: number,
  roles: string[]
) => {
  const letter = await prisma.engagementLetter.findUnique({
    where: { id: engagementLetterId },
    select: {
      uploadedByProfileId: true,
      approvedByProfileId: true,
      client: {
        select: {
          managerProfileId: true,
          partnerProfileId: true,
        },
      },
      onboardings: {
        select: {
          uploadedByProfileId: true,
          hrReviewerProfileId: true,
        },
      },
    },
  });

  if (!letter) return false;

  const inOnboardingTrail = letter.onboardings.some(
    (item) =>
      item.uploadedByProfileId === profileId || item.hrReviewerProfileId === profileId
  );

  return (
    letter.uploadedByProfileId === profileId ||
    letter.approvedByProfileId === profileId ||
    letter.client?.managerProfileId === profileId ||
    letter.client?.partnerProfileId === profileId ||
    inOnboardingTrail ||
    isHR(roles) ||
    isFinance(roles) ||
    isMarketing(roles) ||
    isGmp(roles)
  );
};

const hasClientOnboardingWorkflowAccess = async (
  onboardingId: number,
  profileId: number,
  roles: string[]
) => {
  const onboarding = await prisma.clientOnboarding.findUnique({
    where: { id: onboardingId },
    select: {
      uploadedByProfileId: true,
      hrReviewerProfileId: true,
      engagementLetter: {
        select: {
          uploadedByProfileId: true,
          approvedByProfileId: true,
          client: {
            select: {
              managerProfileId: true,
              partnerProfileId: true,
            },
          },
        },
      },
    },
  });

  if (!onboarding) return false;

  return (
    onboarding.uploadedByProfileId === profileId ||
    onboarding.hrReviewerProfileId === profileId ||
    onboarding.engagementLetter.uploadedByProfileId === profileId ||
    onboarding.engagementLetter.approvedByProfileId === profileId ||
    onboarding.engagementLetter.client.managerProfileId === profileId ||
    onboarding.engagementLetter.client.partnerProfileId === profileId ||
    isHR(roles) ||
    isFinance(roles) ||
    isMarketing(roles) ||
    isGmp(roles)
  );
};

const hasWorkflowFallbackAccess = async (
  doc: AccessDoc,
  profileId: number,
  roles: string[]
) => {
  if (!doc.entityId) return false;

  const entityType = normalizeEntityType(doc.entityType);

  if (entityType === "job") {
    return hasJobWorkflowAccess(doc.entityId, profileId, roles);
  }

  if (entityType === "jobinvoicemilestone") {
    const task = await prisma.task.findUnique({
      where: { id: doc.entityId },
      select: { jobId: true },
    });
    if (!task) return false;
    return hasJobWorkflowAccess(task.jobId, profileId, roles);
  }

  if (entityType === "client") {
    return hasClientWorkflowAccess(doc.entityId, profileId, roles);
  }

  if (entityType === "proposal") {
    return hasProposalWorkflowAccess(doc.entityId, profileId, roles);
  }

  if (entityType === "engagementletter") {
    return hasEngagementLetterWorkflowAccess(doc.entityId, profileId, roles);
  }

  if (entityType === "onboarding" || entityType === "clientonboarding") {
    return hasClientOnboardingWorkflowAccess(doc.entityId, profileId, roles);
  }

  return false;
};

export const requireDocumentAccess = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const profileId = req.user?.profileId;
    if (!req.user?.userId || !profileId) {
      res.status(401).json({ error: "Unauthorized. Ensure authMiddleware + loadProfile ran." });
      return;
    }

    const rawId = (req.params.documentId ?? req.params.id) as string | undefined;
    const documentId = Number(rawId);

    if (!rawId || Number.isNaN(documentId)) {
      res.status(400).json({ error: "Invalid document ID" });
      return;
    }

    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        accessLevel: true,
        verificationStatus: true,
        uploadedBy: true,
        verifiedBy: true,
        entityType: true,
        entityId: true,
        fileName: true,
        documentType: true,
      },
    });

    if (!doc) {
      res.status(404).json({ error: "Document not found" });
      return;
    }

    const roles = resolveRoles(req);

    // uploader/verifier always allowed
    if (doc.uploadedBy === profileId || doc.verifiedBy === profileId) {
      req.document = doc;
      next();
      return;
    }

    const accessLevelAllowed = allowedByAccessLevel(doc.accessLevel, roles);
    if (!accessLevelAllowed) {
      const workflowFallbackAllowed = await hasWorkflowFallbackAccess(doc, profileId, roles);
      if (!workflowFallbackAllowed) {
        res.status(403).json({
          error: "Forbidden. You do not have sufficient access to this document.",
          accessLevel: doc.accessLevel,
        });
        return;
      }
    }

    // Optional policy: block rejected docs for non-admin/hr.
    if (doc.verificationStatus === "rejected" && !(isAdmin(roles) || isHR(roles))) {
      res.status(403).json({
        error: "This document was rejected and is not accessible.",
      });
      return;
    }

    req.document = doc;
    next();
  } catch (error) {
    console.error("requireDocumentAccess error:", error);
    res.status(500).json({ error: "Document access check failed" });
  }
};
