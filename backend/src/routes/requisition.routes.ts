import { Router } from "express";
import { authMiddleware } from "../middleware/auth";
import { loadProfile } from "../middleware/loadProfile";
import { requireModuleAccess } from "../middleware/requireModuleAccess";
import { handleValidationErrors } from "../middleware/validate";
import RequisitionController from "../controllers/requisition.controller";
import {
  cancelRequisitionRequestValidators,
  createRequisitionRequestValidators,
  createRequisitionTypeValidators,
  financeEditRequisitionValidators,
  listApprovalsValidators,
  listRequisitionRequestsValidators,
  paginationValidators,
  releaseRequisitionFundsValidators,
  requestIdParamValidator,
  reviewRequisitionValidators,
  submitRequisitionAccountabilityValidators,
  typeIdParamValidator,
  updateRequisitionTypeValidators,
} from "../validators/requisition.validators";

const router = Router();

router.get(
  "/jobs",
  authMiddleware,
  loadProfile,
  RequisitionController.listAvailableJobs
);

router.get(
  "/types",
  authMiddleware,
  loadProfile,
  RequisitionController.listRequisitionTypes
);

router.post(
  "/types",
  authMiddleware,
  loadProfile,
  requireModuleAccess("requisitions", "admin"),
  ...createRequisitionTypeValidators,
  handleValidationErrors,
  RequisitionController.createRequisitionType
);

router.patch(
  "/types/:typeId",
  authMiddleware,
  loadProfile,
  requireModuleAccess("requisitions", "admin"),
  ...updateRequisitionTypeValidators,
  handleValidationErrors,
  RequisitionController.updateRequisitionType
);

router.delete(
  "/types/:typeId",
  authMiddleware,
  loadProfile,
  requireModuleAccess("requisitions", "admin"),
  ...typeIdParamValidator,
  handleValidationErrors,
  RequisitionController.deleteRequisitionType
);

router.get(
  "/requests",
  authMiddleware,
  loadProfile,
  ...listRequisitionRequestsValidators,
  handleValidationErrors,
  RequisitionController.listRequisitionRequests
);

router.get(
  "/requests/:requestId",
  authMiddleware,
  loadProfile,
  ...requestIdParamValidator,
  handleValidationErrors,
  RequisitionController.getRequisitionRequest
);

router.post(
  "/requests",
  authMiddleware,
  loadProfile,
  ...createRequisitionRequestValidators,
  handleValidationErrors,
  RequisitionController.createRequisitionRequest
);

router.patch(
  "/requests/:requestId/cancel",
  authMiddleware,
  loadProfile,
  ...cancelRequisitionRequestValidators,
  handleValidationErrors,
  RequisitionController.cancelRequisitionRequest
);

router.patch(
  "/requests/:requestId/finance-edit",
  authMiddleware,
  loadProfile,
  requireModuleAccess("requisitions", "approve"),
  ...financeEditRequisitionValidators,
  handleValidationErrors,
  RequisitionController.updateFinanceStageRequisition
);

router.patch(
  "/requests/:requestId/release",
  authMiddleware,
  loadProfile,
  requireModuleAccess("requisitions", "approve"),
  ...releaseRequisitionFundsValidators,
  handleValidationErrors,
  RequisitionController.releaseRequisitionFunds
);

router.patch(
  "/requests/:requestId/accountability",
  authMiddleware,
  loadProfile,
  ...submitRequisitionAccountabilityValidators,
  handleValidationErrors,
  RequisitionController.submitRequisitionAccountability
);

router.get(
  "/approvals",
  authMiddleware,
  loadProfile,
  requireModuleAccess("requisitions", "approve"),
  ...listApprovalsValidators,
  handleValidationErrors,
  RequisitionController.listApprovals
);

router.patch(
  "/requests/:requestId/approve",
  authMiddleware,
  loadProfile,
  requireModuleAccess("requisitions", "approve"),
  ...reviewRequisitionValidators,
  handleValidationErrors,
  RequisitionController.approveRequisitionRequest
);

router.patch(
  "/requests/:requestId/decline",
  authMiddleware,
  loadProfile,
  requireModuleAccess("requisitions", "approve"),
  ...reviewRequisitionValidators,
  handleValidationErrors,
  RequisitionController.declineRequisitionRequest
);

router.get(
  "/finance-tracker",
  authMiddleware,
  loadProfile,
  requireModuleAccess("requisitions", "approve"),
  RequisitionController.getFinanceTracker
);

router.get(
  "/reports/summary",
  authMiddleware,
  loadProfile,
  requireModuleAccess("requisitions", "admin"),
  ...paginationValidators,
  handleValidationErrors,
  RequisitionController.getReportSummary
);

export default router;
