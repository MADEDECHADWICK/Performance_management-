import { Router } from "express";
import { PartnerController } from "../controllers/partner.controller";
import { withPartnerAccess, withRoles } from "../utils/middleware";
import { validateRequest, handleValidationErrors } from "../middleware/validate";
import {
  createPartnerValidators,
  getPartnerJobsValidators,
  getPartnerRevenueValidators,
} from "../validators/partner.validators";

const router = Router();

/**
 * GET /partners
 * List all partners
 */
router.get("/", withRoles("admin", "super_admin"), PartnerController.listPartners);

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
