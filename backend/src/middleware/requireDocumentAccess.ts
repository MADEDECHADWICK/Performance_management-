/**
 * Document access control middleware
 * Enforces DocumentAccessLevel: employee | manager | hr | admin
 *
 * Notes:
 * - "uploader" and "verifier" always allowed
 * - Admin/Super Admin always allowed
 * - HR allowed for hr/admin levels
 * - Manager allowed for manager/employee
 * - Employee allowed for employee
 */

import { Response, NextFunction } from "express";
import prisma from "../prisma";
import { AuthRequest } from "./auth";

const isAdmin = (roles: string[]) => roles.includes("admin") || roles.includes("super_admin");
const isHR = (roles: string[]) => roles.includes("hr");
const isManager = (roles: string[]) => roles.includes("manager");
const isPartner = (roles: string[]) => roles.includes("partner");

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
      }
    });

    if (!doc) {
      res.status(404).json({ error: "Document not found" });
      return;
    }

    const roles: string[] = req.userRoles || [];

    // uploader/verifier always allowed
    if (doc.uploadedBy === profileId || doc.verifiedBy === profileId) {
      req.document = doc;
      next();
      return;
    }

    if (!allowedByAccessLevel(doc.accessLevel, roles)) {
      res.status(403).json({
        error: "Forbidden. You do not have sufficient access to this document.",
        accessLevel: doc.accessLevel,
      });
      return;
    }

    // Optional policy: block rejected docs for non-admin/hr
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
