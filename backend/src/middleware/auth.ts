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
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";

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
type AccessTokenPayload = {
  userId: number;
  email: string;
  iat: number;
  exp: number;
};

export async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized - Missing or invalid token",
      });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret") as AccessTokenPayload;

    // Verify user still exists
    const user = await prisma.profile.findUnique({
      where: { id: decoded.userId },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }

    // Verify user is active
    if (user.status === "inactive") {
      return res.status(403).json({
        success: false,
        message: "User account is inactive",
      });
    }

    req.user = {
      userId: decoded.userId,
      email: decoded.email,
    };

    next();
  } catch (error: any) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Token expired",
      });
    }

    return res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
  }
}
