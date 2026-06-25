import { Router } from "express";
import type { AuthRequest } from "../middleware/auth";
import { errorResponse, successResponse } from "../utils/response";
import { getReportingWorkspace } from "../services/reportingWorkspace.service";

const router = Router();

const parseIntSafe = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const parseDateSafe = (value: unknown) => {
  if (!value) return undefined;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

router.get("/workspace", async (req: AuthRequest, res) => {
  try {
    const roles = (req.userRoles || []).map((role) => role.toLowerCase());
    const requestingProfileId = parseIntSafe(req.user?.profileId);
    const profileIdOverride = parseIntSafe(req.query.profileId);
    const canViewOtherProfiles =
      roles.includes("hr") ||
      roles.includes("super_admin") ||
      roles.includes("gmp");

    if (
      profileIdOverride &&
      profileIdOverride !== requestingProfileId &&
      !canViewOtherProfiles
    ) {
      return res.status(403).json(errorResponse("You cannot view another profile's reporting workspace", 403));
    }

    const profileId = profileIdOverride ?? requestingProfileId;
    const dateFrom = parseDateSafe(req.query.from);
    const dateTo = parseDateSafe(req.query.to);
    const evaluationCycleId = parseIntSafe(req.query.evaluationCycleId);

    const workspace = await getReportingWorkspace({
      roles,
      profileId,
      evaluationCycleId,
      dateFrom,
      dateTo,
    });

    return res.json(successResponse(workspace, "Reporting workspace loaded"));
  } catch (error: any) {
    console.error("Error loading reporting workspace:", error);
    return res.status(500).json(errorResponse("Failed to load reporting workspace", 500));
  }
});

export default router;
