import { Router } from "express";
import { PartnerController } from "../controllers/partner.controller";
import { withPartnerAccess, withRoles } from "../utils/middleware";
import { validateRequest, handleValidationErrors } from "../middleware/validate";
import {
  createPartnerValidators,
  getPartnerJobsValidators,
  getPartnerRevenueValidators,
  upsertPartnerCompanyValidators,
} from "../validators/partner.validators";

const router = Router();

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
 * GET /partners/:partnerId/jobs (Partner/Admin)
 * Query: page, pageSize, status?
 */
router.get(
  "/:partnerId/jobs",
  withPartnerAccess(),
  validateRequest(getPartnerJobsValidators),
  handleValidationErrors,
  PartnerController.listPartnerJobs
);

/**
 * GET /partners/:partnerId/dashboard (Partner/Admin)
 */
router.get(
  "/:partnerId/dashboard",
  withPartnerAccess(),
  PartnerController.getPartnerDashboard
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

/**
 * GET /partners/:partnerId/commissions (Partner/Admin)
 * NOTE: Schema v2.1 has no Commission model; we return computed commissions.
 */
router.get(
  "/:partnerId/commissions",
  withPartnerAccess(),
  PartnerController.getPartnerCommissions
);

/**
 * POST /partners/:partnerId/company (Partner/Admin)
 * Body: companyName, registrationNumber?, taxId?, bankAccountDetails?, contractTerms?
 */
router.post(
  "/:partnerId/company",
  withPartnerAccess(),
  validateRequest(upsertPartnerCompanyValidators),
  handleValidationErrors,
  PartnerController.savePartnerCompany
);

/**
 * GET /partners/:partnerId/company (Partner/Admin)
 */
router.get(
  "/:partnerId/company",
  withPartnerAccess(),
  PartnerController.getPartnerCompany
);

export default router;
