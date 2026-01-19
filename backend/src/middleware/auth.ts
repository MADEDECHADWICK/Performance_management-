/**
 * Base authentication middleware
 * - Validates JWT token
 * - Verifies user is active
 * - Attaches minimal user context to request
 *
 * IMPORTANT:
 * - Does NOT load Profile (handled by loadProfile middleware)
 */

import { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import prisma from "../prisma";

/**
 * Minimal profile shape injected later by loadProfile
 * Keep this lightweight to avoid over-fetching
 */
export type RequestProfile = {
  id: number;
  firstName: string;
  lastName: string;
  status: string;
  isPartner: boolean;
  department: { id: number; name: string } | null;
  role: { id: number; name: string } | null;
  manager: { id: number; firstName: string; lastName: string } | null;
};

/**
 * Extended Express request used across the app
 * This is the SINGLE SOURCE OF TRUTH for request type safety
 */
export interface AuthRequest extends Request {
  user?: {
    userId: number;      // User.id (set by authMiddleware)
    email: string;       // User.email (set by authMiddleware)
    profileId?: number;  // Profile.id (ALWAYS set by loadProfile before using resource access)
  };
  profile?: RequestProfile; // populated by loadProfile (user profile data)
  token?: string;       // JWT token (set by authMiddleware)
  
  // Typed properties for downstream middleware/controllers
  // Use these directly instead of casting to 'any'
  userRoles?: string[]; // Set by requireRole - array of role names
  userPermissions?: string[]; // Set by requirePermission - array of permission strings
  job?: any; // Set by requireJobAccess - Job entity with access checks done
  timeEntry?: any; // Set by requireTimeEntryAccess - TimeEntry entity with access checks done
  evaluation?: any; // Set by requireEvaluationAccess - EvaluationAssignment with access checks done
  evaluationAssignment?: any; // Set by requireEvaluationAccess (alternative prop name)
  document?: any; // Set by requireDocumentAccess - Document with access checks done
  partner?: any; // Set by requirePartnerAccess - Partner entity with access checks done
  budgetCheck?: { // Set by validateTimeEntryBudget - Budget validation result
    jobId: number;
    employeeProfileId: number;
    hoursUsed: number;
    hoursRemaining: number;
    hoursAssigned: number;
    requiresApproval?: boolean;
    budget?: any;
  };
}

/**
 * Expected JWT payload
 */
type AccessTokenPayload = JwtPayload & {
  userId: number;
  email: string;
};

export const authMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({
        error: "Missing or invalid Authorization header",
      });
      return;
    }

    const token = authHeader.replace("Bearer ", "").trim();

    if (!token) {
      res.status(401).json({ error: "No token provided" });
      return;
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      res.status(500).json({
        error: "Server misconfigured (JWT_SECRET missing)",
      });
      return;
    }

    const decoded = jwt.verify(token, secret) as AccessTokenPayload;

    // Verify user still exists & is active
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      res.status(401).json({
        error: "User inactive or not found",
      });
      return;
    }

    // Attach minimal auth context
    req.user = {
      userId: user.id,
      email: user.email,
    };

    req.token = token;

    next();
  } catch (error) {
    console.error("authMiddleware error:", error);
    res.status(401).json({ error: "Invalid or expired token" });
  }
};
