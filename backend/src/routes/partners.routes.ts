import { Router } from "express";
import { PartnerController } from "../controllers/partner.controller";
import { withPartnerAccess, withRoles } from "../utils/middleware";
import { validateRequest, handleValidationErrors } from "../middleware/validate";
import {
  createPartnerValidators,
  getPartnerJobsValidators,
  getPartnerRevenueValidators,
  getPartnerAllocationsValidators,
} from "../validators/partner.validators";

const router = Router();

/**
 * GET /partners
 * List all partners
 */
router.get("/", withRoles("admin", "super_admin"), PartnerController.listPartners);

/**
 * GET /partners/dashboard-summary
 * Partner dashboard summary (uses current user's profile by default)
 */
router.get(
  "/dashboard-summary",
  withRoles("partner", "manager", "admin", "super_admin", "hr", "hr_manager"),
  PartnerController.getPartnerDashboardSummary
);

/**
 * GET /partners/approval-chain
 * Partner approval chain (standard + over-budget visibility)
 */
router.get(
  "/approval-chain",
  withRoles("partner", "manager", "admin", "super_admin", "hr", "hr_manager"),
  PartnerController.getPartnerApprovalChain
);

/**
 * GET /partners/allocations
 * Partner allocations audit (collections vs allocations)
 */
router.get(
  "/allocations",
  withRoles("partner", "manager", "admin", "super_admin", "hr", "hr_manager"),
  validateRequest(getPartnerAllocationsValidators),
  handleValidationErrors,
  PartnerController.getPartnerAllocations
);

/**
 * POST /partners (Admin)
 * Body: profileId, companyId?, commissionRate, performanceThreshold?
 */
router.post(
  "/",
  withRoles("admin", "super_admin"),
  validateRequest(createPartnerValidators),
  handleValidationErrors,
  PartnerController.createPartner
);

/**
 * GET /partners/:partnerId (Partner/Admin)
 */
router.get("/:partnerId", withPartnerAccess(), PartnerController.getPartner);

/**
 * PATCH /partners/:partnerId (Partner/Admin)
 */
router.patch("/:partnerId", withPartnerAccess(), PartnerController.updatePartner);

/**
 * GET /partners/:partnerId/jobs (Partner/Admin)
 * Query: page, pageSize, status?
 */
router.get(
  "/:partnerId/jobs",
  withPartnerAccess(),
  validateRequest(getPartnerJobsValidators),
  handleValidationErrors,
  PartnerController.getPartnerJobs
);

/**
 * GET /partners/:partnerId/revenue (Partner/Admin)
 * Query: fromDate?, toDate?, period?
 */
router.get(
  "/:partnerId/revenue",
  withPartnerAccess(),
  validateRequest(getPartnerRevenueValidators),
  handleValidationErrors,
  PartnerController.getPartnerRevenue
);

export default router;
