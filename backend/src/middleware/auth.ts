/**
 * Base authentication middleware
 * - Validates JWT token
 * - Verifies user is active
 * - Attaches minimal user context to request
 *
 * 
 * IMPORTANT:
 * - Does NOT load Profile (handled by loadProfile middleware)
 */

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../prisma";
import { getJwtSecret } from "../config/jwt";
import type { AuthorizationContext } from "../services/authorizationContext.service";
import { canonicalizeRoles } from "../auth/canonicalRoles";
import { shouldEnforceOnboardingGate } from "./onboardingGate";

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
    authRoles?: string[];
    sessionToken?: string;
  };
  profile?: RequestProfile; // populated by loadProfile (user profile data)
  token?: string;       // JWT token (set by authMiddleware)
  
  // Typed properties for downstream middleware/controllers
  // Use these directly instead of casting to 'any'
  userRoles?: string[]; // Canonical role names (initialized by authMiddleware, enriched by authz middleware)
  userPermissions?: string[]; // Set by requirePermission - array of permission strings
  userRolePolicies?: Array<{ roleName: string; permissionKeys?: string[] | null }>; // Set by module access middleware
  authorizationContext?: AuthorizationContext; // Shared authz context cache for middleware chain
  currentModuleAccess?: { moduleKey: string; action: string }; // Set by requireModuleAccess for downstream action checks
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
 * Build a lightweight auth context from a request.
 * Useful for service calls expecting { userId, profileId, roles }.
 */
export const authFromReq = (req: AuthRequest) => ({
  userId: req.user?.userId ?? 0,
  profileId: req.profile?.id ?? req.user?.profileId ?? 0,
  roles: req.userRoles ?? [],
});

/**
 * Expected JWT payload
 */
type AccessTokenPayload = {
  userId?: number;
  sub?: number;
  email: string;
  authRoles?: string[];
  sessionToken?: string;
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
    const decoded = jwt.verify(token, getJwtSecret()) as AccessTokenPayload;
    const resolvedUserId = decoded.userId ?? decoded.sub;

    if (!resolvedUserId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized - Invalid token payload",
      });
    }

    const sessionToken = String(decoded.sessionToken || "").trim();
    if (!sessionToken) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized - Invalid token payload",
      });
    }

    const activeSession = await prisma.session.findFirst({
      where: {
        token: sessionToken,
        userId: resolvedUserId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });

    if (!activeSession) {
      return res.status(401).json({
        success: false,
        message: "Session expired. Please sign in again.",
      });
    }

    // Verify user still exists
    const user = await prisma.user.findUnique({
      where: { id: resolvedUserId },
      include: { profile: true },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }

    // Verify user account and employment status allow access
    const profileStatus = String(user.profile?.status || "").toLowerCase();
    const profileBlocked = profileStatus === "inactive" || profileStatus === "separated";
    if (!user.isActive || profileBlocked) {
      return res.status(403).json({
        success: false,
        message: "User account is inactive",
      });
    }

    const authRoles = canonicalizeRoles(decoded.authRoles || []);
    const requestPath = req.originalUrl || req.url || "";

    if (
      shouldEnforceOnboardingGate({
        requestPath,
        roles: authRoles,
        profile: {
          onboardingStatus: user.profile?.onboardingStatus,
          onboardingChecklistCompleted: user.profile?.onboardingChecklistCompleted,
          inductionCompleted: user.profile?.inductionCompleted,
        },
      })
    ) {
      return res.status(403).json({
        success: false,
        code: "ONBOARDING_INCOMPLETE",
        message:
          "Onboarding checklist incomplete. Complete onboarding before accessing this module.",
        onboarding: {
          status: user.profile?.onboardingStatus || "pending",
          onboardingChecklistCompleted: !!user.profile?.onboardingChecklistCompleted,
          inductionCompleted: !!user.profile?.inductionCompleted,
        },
      });
    }

    req.user = {
      userId: resolvedUserId,
      email: decoded.email,
      profileId: user.profile?.id,
      authRoles,
      sessionToken,
    };
    req.userRoles = authRoles;

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
