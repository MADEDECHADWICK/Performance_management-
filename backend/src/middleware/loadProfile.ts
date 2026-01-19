/**
 * Load authenticated user's profile
 * Enriches request with full organizational context
 * Must run AFTER authMiddleware
 */

import { Response, NextFunction } from "express";
import prisma from "../prisma";
import { AuthRequest } from "./auth";

export const loadProfile = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.userId) {
      res.status(401).json({ error: "User not authenticated" });
      return;
    }

    const profile = await prisma.profile.findUnique({
      where: { userId: req.user.userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        status: true,
        isPartner: true,

        department: {
          select: {
            id: true,
            name: true
          }
        },

        role: {
          select: {
            id: true,
            name: true
          }
        },

        manager: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });

    if (!profile) {
      res.status(404).json({ error: "Profile not found for user" });
      return;
    }

    /**
     * Attach profile to request
     * This becomes your single source of truth for authorization & business rules
     */
    req.profile = profile;
    req.user.profileId = profile.id;

    next();
  } catch (error) {
    console.error("loadProfile error:", error);
    res.status(500).json({ error: "Failed to load user profile" });
  }
};
