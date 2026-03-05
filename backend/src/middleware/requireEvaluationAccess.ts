/**
 * Evaluation access control middleware (Option A)
 * - Loads roles if req.userRoles not already populated
 * - Enforces evaluator/evaluatee/HR/admin access rules
 *
 * Depends on: authMiddleware + loadProfile (so req.user.userId + req.user.profileId exist)
 */

import { Response, NextFunction } from "express";
import prisma from "../prisma";
import { AuthRequest } from "./auth";

type EvalAccessMode = "view" | "submit";

const normalize = (s: string) => s.toLowerCase().trim();

const isPrivileged = (roles: string[]) => {
  const r = roles.map(normalize);
  return r.includes("super_admin");
};

const isHR = (roles: string[]) => {
  const r = roles.map(normalize);
  return r.includes("hr");
};

const isManager = (roles: string[]) => {
  const r = roles.map(normalize);
  return r.includes("manager");
};

async function loadRolesIfMissing(req: AuthRequest): Promise<string[]> {
  if (req.userRoles?.length) return req.userRoles;

  const userId = req.user?.userId;
  if (!userId) return [];

  const rows = await prisma.userAuthRole.findMany({
    where: { userId },
    select: {
      role: { select: { name: true, isActive: true } },
    },
  });

  const activeRoles = rows
    .filter((r) => r.role.isActive)
    .map((r) => r.role.name);

  req.userRoles = activeRoles;
  return activeRoles;
}

export const requireEvaluationAccess = (mode: EvalAccessMode = "view") => {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.userId;
      const profileId = req.user?.profileId;

      if (!userId || !profileId) {
        res.status(401).json({
          error: "Unauthorized. Ensure authMiddleware + loadProfile ran.",
        });
        return;
      }

      // Accept either :assignmentId or :id (for flexibility)
      const rawId = (req.params.assignmentId ?? req.params.id) as string | undefined;
      const assignmentId = Number(rawId);

      if (!rawId || Number.isNaN(assignmentId) || assignmentId < 1) {
        res.status(400).json({ error: "Invalid evaluation assignment ID" });
        return;
      }

      // Fetch assignment + definition (schema v2.1 aligned)
      const assignment = await prisma.evaluationAssignment.findUnique({
        where: { id: assignmentId },
        select: {
          id: true,
          status: true,
          evaluatorProfileId: true,
          evaluateeProfileId: true,
          evaluatorType: true,
          evaluationDefinitionId: true,

          evaluatorSigned: true,
          evaluatorSignedAt: true,
          evaluateeAcknowledged: true,
          evaluateeAcknowledgedAt: true,

          definition: {
            select: {
              id: true,
              status: true,
              cycleId: true,
              departmentId: true,
              dueDate: true,
              enableSelfEvaluation: true,
              enablePeerEvaluation: true,
              enableUpwardEvaluation: true,
              enableDownwardEvaluation: true,
              enableClientEvaluation: true,
              processAnonymously: true,
              hideFromDashboard: true,
              excludeFromScore: true,
              requireEvaluatorSignature: true,
              requireEvaluateeSignature: true,
            },
          },
        },
      });

      if (!assignment) {
        res.status(404).json({ error: "Evaluation assignment not found" });
        return;
      }

      // Ensure roles exist (Option A: middleware loads roles if missing)
      const roles = await loadRolesIfMissing(req);

      // Admin/Super Admin: full access
      if (isPrivileged(roles)) {
        req.evaluationAssignment = assignment;
        next();
        return;
      }

      // HR/HR Manager: view-only by default (change if you want HR to submit too)
      if (isHR(roles) && mode === "view") {
        req.evaluationAssignment = assignment;
        next();
        return;
      }

      const isEvaluator = assignment.evaluatorProfileId === profileId;
      const isEvaluatee = assignment.evaluateeProfileId === profileId;

      if (mode === "view" && isManager(roles) && !isEvaluator && !isEvaluatee) {
        const evaluatee = await prisma.profile.findUnique({
          where: { id: assignment.evaluateeProfileId },
          select: { managerId: true },
        });

        if (evaluatee?.managerId === profileId) {
          req.evaluationAssignment = assignment;
          next();
          return;
        }
      }

      // SUBMIT MODE: only evaluator (admins already handled)
      if (mode === "submit") {
        if (!isEvaluator) {
          res.status(403).json({
            error: "Forbidden. Only the assigned evaluator can submit this evaluation.",
          });
          return;
        }

        // Allow submit only if assignment is still open
        if (!["pending", "in_progress"].includes(String(assignment.status))) {
          res.status(409).json({
            error: `Cannot submit evaluation in status '${assignment.status}'.`,
          });
          return;
        }

        // Optional: if evaluator signature is required, you may enforce signing first
        // if (assignment.definition?.requireEvaluatorSignature && !assignment.evaluatorSigned) {
        //   res.status(409).json({ error: "Evaluator signature required before submission." });
        //   return;
        // }

        req.evaluationAssignment = assignment;
        next();
        return;
      }

      // VIEW MODE: evaluator OR evaluatee can view
      if (isEvaluator || isEvaluatee) {
        req.evaluationAssignment = assignment;
        next();
        return;
      }

      res.status(403).json({ error: "No access to this evaluation assignment" });
    } catch (error) {
      console.error("requireEvaluationAccess error:", error);
      res.status(500).json({ error: "Evaluation access check failed" });
    }
  };
};
