import { Router } from "express";
import { authMiddleware } from "../middleware/auth";
import { loadProfile } from "../middleware/loadProfile";
import { requireAnyModuleAccess, requireModuleAccess } from "../middleware/requireModuleAccess";
import { handleValidationErrors } from "../middleware/validate";
import LeaveController from "../controllers/leave.controller";
import {
  adjustBalanceValidators,
  assignmentIdParamValidator,
  cancelLeaveRequestValidators,
  createLeaveRequestValidators,
  createLeaveTypeValidators,
  createPolicyAssignmentValidators,
  createPolicyValidators,
  createPublicHolidayValidators,
  holidayIdParamValidator,
  leaveTypeIdParamValidator,
  listApprovalsValidators,
  listCalendarValidators,
  listLeaveRequestsValidators,
  paginationValidators,
  policyIdParamValidator,
  requestIdParamValidator,
  reviewLeaveRequestValidators,
  updateLeaveTypeValidators,
  updatePolicyValidators,
  updatePublicHolidayValidators,
} from "../validators/leave.validators";

const router = Router();

router.get(
  "/balances/my",
  authMiddleware,
  loadProfile,
  LeaveController.listMyBalances
);

router.get(
  "/requests",
  authMiddleware,
  loadProfile,
  ...listLeaveRequestsValidators,
  handleValidationErrors,
  LeaveController.listLeaveRequests
);

router.get(
  "/requests/:requestId",
  authMiddleware,
  loadProfile,
  ...requestIdParamValidator,
  handleValidationErrors,
  LeaveController.getLeaveRequest
);

router.post(
  "/requests",
  authMiddleware,
  loadProfile,
  ...createLeaveRequestValidators,
  handleValidationErrors,
  LeaveController.createLeaveRequest
);

router.patch(
  "/requests/:requestId/cancel",
  authMiddleware,
  loadProfile,
  ...cancelLeaveRequestValidators,
  handleValidationErrors,
  LeaveController.cancelLeaveRequest
);

router.get(
  "/calendar",
  authMiddleware,
  loadProfile,
  ...listCalendarValidators,
  handleValidationErrors,
  LeaveController.listCalendar
);

router.get(
  "/approvals",
  authMiddleware,
  loadProfile,
  requireModuleAccess("leave", "approve"),
  ...listApprovalsValidators,
  handleValidationErrors,
  LeaveController.listApprovals
);

router.patch(
  "/requests/:requestId/approve",
  authMiddleware,
  loadProfile,
  requireModuleAccess("leave", "approve"),
  ...reviewLeaveRequestValidators,
  handleValidationErrors,
  LeaveController.approveLeaveRequest
);

router.patch(
  "/requests/:requestId/decline",
  authMiddleware,
  loadProfile,
  requireModuleAccess("leave", "approve"),
  ...reviewLeaveRequestValidators,
  handleValidationErrors,
  LeaveController.declineLeaveRequest
);

router.get(
  "/types",
  authMiddleware,
  loadProfile,
  LeaveController.listLeaveTypes
);

router.post(
  "/types",
  authMiddleware,
  loadProfile,
  requireModuleAccess("leave", "admin"),
  ...createLeaveTypeValidators,
  handleValidationErrors,
  LeaveController.createLeaveType
);

router.patch(
  "/types/:leaveTypeId",
  authMiddleware,
  loadProfile,
  requireModuleAccess("leave", "admin"),
  ...updateLeaveTypeValidators,
  handleValidationErrors,
  LeaveController.updateLeaveType
);

router.delete(
  "/types/:leaveTypeId",
  authMiddleware,
  loadProfile,
  requireModuleAccess("leave", "admin"),
  ...leaveTypeIdParamValidator,
  handleValidationErrors,
  LeaveController.deleteLeaveType
);

router.get(
  "/policies",
  authMiddleware,
  loadProfile,
  requireModuleAccess("leave", "admin"),
  LeaveController.listPolicies
);

router.post(
  "/policies",
  authMiddleware,
  loadProfile,
  requireModuleAccess("leave", "admin"),
  ...createPolicyValidators,
  handleValidationErrors,
  LeaveController.createPolicy
);

router.patch(
  "/policies/:policyId",
  authMiddleware,
  loadProfile,
  requireModuleAccess("leave", "admin"),
  ...updatePolicyValidators,
  handleValidationErrors,
  LeaveController.updatePolicy
);

router.delete(
  "/policies/:policyId",
  authMiddleware,
  loadProfile,
  requireModuleAccess("leave", "admin"),
  ...policyIdParamValidator,
  handleValidationErrors,
  LeaveController.deletePolicy
);

router.get(
  "/policy-assignments",
  authMiddleware,
  loadProfile,
  requireModuleAccess("leave", "admin"),
  LeaveController.listPolicyAssignments
);

router.post(
  "/policy-assignments",
  authMiddleware,
  loadProfile,
  requireModuleAccess("leave", "admin"),
  ...createPolicyAssignmentValidators,
  handleValidationErrors,
  LeaveController.createPolicyAssignment
);

router.delete(
  "/policy-assignments/:assignmentId",
  authMiddleware,
  loadProfile,
  requireModuleAccess("leave", "admin"),
  ...assignmentIdParamValidator,
  handleValidationErrors,
  LeaveController.deletePolicyAssignment
);

router.get(
  "/public-holidays",
  authMiddleware,
  loadProfile,
  requireModuleAccess("leave", "admin"),
  ...paginationValidators,
  handleValidationErrors,
  LeaveController.listPublicHolidays
);

router.post(
  "/public-holidays",
  authMiddleware,
  loadProfile,
  requireModuleAccess("leave", "admin"),
  ...createPublicHolidayValidators,
  handleValidationErrors,
  LeaveController.createPublicHoliday
);

router.patch(
  "/public-holidays/:holidayId",
  authMiddleware,
  loadProfile,
  requireModuleAccess("leave", "admin"),
  ...updatePublicHolidayValidators,
  handleValidationErrors,
  LeaveController.updatePublicHoliday
);

router.delete(
  "/public-holidays/:holidayId",
  authMiddleware,
  loadProfile,
  requireModuleAccess("leave", "admin"),
  ...holidayIdParamValidator,
  handleValidationErrors,
  LeaveController.deletePublicHoliday
);

router.post(
  "/balances/adjust",
  authMiddleware,
  loadProfile,
  requireModuleAccess("leave", "admin"),
  ...adjustBalanceValidators,
  handleValidationErrors,
  LeaveController.adjustBalance
);

router.get(
  "/reports/summary",
  authMiddleware,
  loadProfile,
  requireAnyModuleAccess([
    { moduleKey: "leave", action: "admin" },
    { moduleKey: "leave", action: "read" },
  ]),
  LeaveController.getReportSummary
);

export default router;
