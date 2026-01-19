/**
 * Partner Routes
 * Endpoints for partner portfolio, commissions, and revenue tracking
 */

import { Router } from "express";
import { PartnerController } from "../controllers/partner.controller";
import { withPartnerAccess, authenticated, withRoles } from "../utils/middleware";
import { validateRequest, handleValidationErrors } from "../middleware/validate";
import {
  createPartnerValidators,
  savePartnerCompanyValidators,
} from "../validators/partner.validators";

const router = Router();

/**
 * POST /partners
 * Create new partner record
 * Requires: admin role
 * Body: profileId, companyId, commissionPercentage, commissionType
 */
router.post(
  "/",
  withRoles("admin"),
  validateRequest(createPartnerValidators),
  handleValidationErrors,
  PartnerController.createPartner
);

/**
 * GET /partners/:partnerId
 * Get partner profile details
 * Access: partner or admin only
 */
router.get(
  "/:partnerId",
  withPartnerAccess(),
  PartnerController.getPartner
);

/**
 * GET /partners/:partnerId/jobs
 * List partner's job portfolio (isolated view)
 * Access: partner or admin only
 * Query: page, pageSize, status
 */
router.get(
  "/:partnerId/jobs",
  withPartnerAccess(),
  PartnerController.listPartnerJobs
);

/**
 * GET /partners/:partnerId/portfolio
 * Get partner portfolio summary
 */
router.get(
  "/:partnerId/portfolio",
  withPartnerAccess(),
  PartnerController.getPartnerPortfolio
);

/**
 * GET /partners/:partnerId/dashboard
 * Get partner KPI dashboard
 * Access: partner or admin only
 */
router.get(
  "/:partnerId/dashboard",
  withPartnerAccess(),
  PartnerController.getPartnerDashboard
);

/**
 * GET /partners/:partnerId/revenue
 * Get revenue report by period
 * Query: startDate, endDate, period
 */
router.get(
  "/:partnerId/revenue",
  withPartnerAccess(),
  PartnerController.getPartnerRevenue
);

/**
 * GET /partners/:partnerId/commissions
 * Get commission history and tracking
 * Query: page, pageSize, status
 */
router.get(
  "/:partnerId/commissions",
  withPartnerAccess(),
  PartnerController.getPartnerCommissions
);

/**
 * POST /partners/:partnerId/company
 * Save partner company details
 * Body: companyName, registrationNumber, taxId, bankDetails
 */
router.post(
  "/:partnerId/company",
  withPartnerAccess(),
  validateRequest(savePartnerCompanyValidators),
  handleValidationErrors,
  PartnerController.savePartnerCompany
);

/**
 * GET /partners/:partnerId/company
 * Get partner company details
 */
router.get(
  "/:partnerId/company",
  withPartnerAccess(),
  PartnerController.getPartnerCompany
);

/**
 * GET /partners/:partnerId/performance
 * Get partner performance metrics
 */
router.get(
  "/:partnerId/performance",
  withPartnerAccess(),
  PartnerController.getPartnerPerformance
);

/**
 * GET /partners/:partnerId/utilization
 * Get resource utilization metrics
 */
router.get(
  "/:partnerId/utilization",
  withPartnerAccess(),
  PartnerController.getPartnerUtilization
);

export default router;
