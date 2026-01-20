/**
 * Partner portfolio access middleware
 * Prevents cross-partner data access.
 *
 * Rules:
 * - Admin/Super Admin: full access
 * - Partner: can only access their own partner-scoped resources
 *
 * This middleware expects partner identity to come from:
 * - req.user.profileId (the authenticated partner profile)
 * and optionally compares it to:
 * - req.params.partnerProfileId / req.params.partnerId (depending on your routes)
 */


import { Response, NextFunction } from "express";
import prisma from "../prisma";
import { AuthRequest } from "./auth";

const isAdmin = (roles: string[]) => roles.includes("admin") || roles.includes("super_admin");

export const requirePartnerAccess = async (
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

    const roles: string[] = req.userRoles || [];

    // Admin can access any partner data
    if (isAdmin(roles)) {
      next();
      return;
    }

    // Must be partner to proceed
    const isPartner = roles.includes("partner") || req.profile?.isPartner === true;
    if (!isPartner) {
      res.status(403).json({ error: "Forbidden. Partner access only." });
      return;
    }

    // If route includes a partner param, enforce it matches authenticated partner profileId
    const rawPartnerParam = (req.params.partnerProfileId ??
      req.params.partnerId ??
      req.query.partnerProfileId ??
      req.query.partnerId) as string | undefined;

    if (rawPartnerParam) {
      const partnerProfileId = Number(rawPartnerParam);
      if (Number.isNaN(partnerProfileId)) {
        res.status(400).json({ error: "Invalid partner ID" });
        return;
      }

      if (partnerProfileId !== profileId) {
        res.status(403).json({ error: "Forbidden. Cross-partner access denied." });
        return;
      }
    }

    // Optional sanity check: ensure partner exists in Partner table
    const partnerRow = await prisma.partner.findUnique({
      where: { profileId },
      select: { id: true, profileId: true }
    });

    if (!partnerRow) {
      res.status(403).json({ error: "Partner record not found for your profile." });
      return;
    }

    req.partner = partnerRow;
    next();
  } catch (error) {
    console.error("requirePartnerAccess error:", error);
    res.status(500).json({ error: "Partner access check failed" });
  }
};
