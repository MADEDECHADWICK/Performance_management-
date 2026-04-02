import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import {
  resolveRequestAccessRoles,
  resolveRequestPrimaryAccessRole,
} from "../auth/accessRoles";
import LeaveService from "../services/leave.service";
import { errorResponse, paginatedResponse, successResponse } from "../utils/response";

const buildAuthContext = (req: AuthRequest) => ({
  userId: req.user!.userId,
  profileId: req.profile!.id,
  roleName: resolveRequestPrimaryAccessRole(req),
  roles: resolveRequestAccessRoles(req),
});

export class LeaveController {
  static async listMyBalances(req: AuthRequest, res: Response): Promise<void> {
    try {
      const year = req.query.year ? Number(req.query.year) : undefined;
      const balances = await LeaveService.listMyBalances({ year }, buildAuthContext(req));
      res.json(successResponse(balances, "Leave balances retrieved"));
    } catch (error: any) {
      res.status(error.statusCode || 500).json(
        errorResponse(error.message, error.statusCode || 500, error.details)
      );
    }
  }

  static async listLeaveRequests(req: AuthRequest, res: Response): Promise<void> {
    try {
      const page = Number(req.query.page) || 1;
      const pageSize = Number(req.query.pageSize) || 10;
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const employeeProfileId = req.query.employeeProfileId
        ? Number(req.query.employeeProfileId)
        : undefined;

      const result = await LeaveService.listLeaveRequests(
        { page, pageSize, status, employeeProfileId },
        buildAuthContext(req)
      );

      res.json(
        paginatedResponse(result.requests, result.total, page, pageSize, "Leave requests retrieved")
      );
    } catch (error: any) {
      res.status(error.statusCode || 500).json(
        errorResponse(error.message, error.statusCode || 500, error.details)
      );
    }
  }

  static async getLeaveRequest(req: AuthRequest, res: Response): Promise<void> {
    try {
      const requestId = Number(req.params.requestId);
      const request = await LeaveService.getLeaveRequest(requestId, buildAuthContext(req));
      res.json(successResponse(request, "Leave request retrieved"));
    } catch (error: any) {
      res.status(error.statusCode || 500).json(
        errorResponse(error.message, error.statusCode || 500, error.details)
      );
    }
  }

  static async createLeaveRequest(req: AuthRequest, res: Response): Promise<void> {
    try {
      const created = await LeaveService.createLeaveRequest(req.body, buildAuthContext(req));
      res.status(201).json(successResponse(created, "Leave request created", 201));
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400, error.details)
      );
    }
  }

  static async cancelLeaveRequest(req: AuthRequest, res: Response): Promise<void> {
    try {
      const requestId = Number(req.params.requestId);
      const updated = await LeaveService.cancelLeaveRequest(requestId, req.body, buildAuthContext(req));
      res.json(successResponse(updated, "Leave request cancelled"));
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400, error.details)
      );
    }
  }

  static async listCalendar(req: AuthRequest, res: Response): Promise<void> {
    try {
      const scope =
        typeof req.query.scope === "string" ? (req.query.scope as "mine" | "team" | "org") : "mine";
      const dateFrom = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : new Date();
      const dateTo = req.query.dateTo
        ? new Date(String(req.query.dateTo))
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const statuses = Array.isArray(req.query.status)
        ? req.query.status.map((status) => String(status))
        : typeof req.query.status === "string"
          ? [String(req.query.status)]
          : undefined;

      const calendar = await LeaveService.listCalendar(
        { scope, dateFrom, dateTo, statuses },
        buildAuthContext(req)
      );
      res.json(successResponse(calendar, "Leave calendar retrieved"));
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400, error.details)
      );
    }
  }

  static async listApprovals(req: AuthRequest, res: Response): Promise<void> {
    try {
      const page = Number(req.query.page) || 1;
      const pageSize = Number(req.query.pageSize) || 10;
      const scope =
        typeof req.query.scope === "string" ? (req.query.scope as "mine" | "all") : "mine";
      const status = typeof req.query.status === "string" ? req.query.status : undefined;

      const result = await LeaveService.listApprovals(
        { page, pageSize, scope, status },
        buildAuthContext(req)
      );

      res.json(
        paginatedResponse(result.approvals, result.total, page, pageSize, "Leave approvals retrieved")
      );
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400, error.details)
      );
    }
  }

  static async approveLeaveRequest(req: AuthRequest, res: Response): Promise<void> {
    try {
      const requestId = Number(req.params.requestId);
      const updated = await LeaveService.approveLeaveRequest(requestId, req.body, buildAuthContext(req));
      res.json(successResponse(updated, "Leave request approved"));
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400, error.details)
      );
    }
  }

  static async declineLeaveRequest(req: AuthRequest, res: Response): Promise<void> {
    try {
      const requestId = Number(req.params.requestId);
      const updated = await LeaveService.declineLeaveRequest(requestId, req.body, buildAuthContext(req));
      res.json(successResponse(updated, "Leave request declined"));
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400, error.details)
      );
    }
  }

  static async listLeaveTypes(req: AuthRequest, res: Response): Promise<void> {
    try {
      const items = await LeaveService.listLeaveTypes(buildAuthContext(req));
      res.json(successResponse(items, "Leave types retrieved"));
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400, error.details)
      );
    }
  }

  static async createLeaveType(req: AuthRequest, res: Response): Promise<void> {
    try {
      const created = await LeaveService.createLeaveType(req.body, buildAuthContext(req));
      res.status(201).json(successResponse(created, "Leave type created", 201));
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400, error.details)
      );
    }
  }

  static async updateLeaveType(req: AuthRequest, res: Response): Promise<void> {
    try {
      const leaveTypeId = Number(req.params.leaveTypeId);
      const updated = await LeaveService.updateLeaveType(leaveTypeId, req.body, buildAuthContext(req));
      res.json(successResponse(updated, "Leave type updated"));
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400, error.details)
      );
    }
  }

  static async deleteLeaveType(req: AuthRequest, res: Response): Promise<void> {
    try {
      const leaveTypeId = Number(req.params.leaveTypeId);
      const deleted = await LeaveService.deleteLeaveType(leaveTypeId, buildAuthContext(req));
      res.json(successResponse(deleted, "Leave type deactivated"));
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400, error.details)
      );
    }
  }

  static async listPolicies(req: AuthRequest, res: Response): Promise<void> {
    try {
      const items = await LeaveService.listPolicies(buildAuthContext(req));
      res.json(successResponse(items, "Leave policies retrieved"));
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400, error.details)
      );
    }
  }

  static async createPolicy(req: AuthRequest, res: Response): Promise<void> {
    try {
      const created = await LeaveService.createPolicy(req.body, buildAuthContext(req));
      res.status(201).json(successResponse(created, "Leave policy created", 201));
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400, error.details)
      );
    }
  }

  static async updatePolicy(req: AuthRequest, res: Response): Promise<void> {
    try {
      const policyId = Number(req.params.policyId);
      const updated = await LeaveService.updatePolicy(policyId, req.body, buildAuthContext(req));
      res.json(successResponse(updated, "Leave policy updated"));
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400, error.details)
      );
    }
  }

  static async deletePolicy(req: AuthRequest, res: Response): Promise<void> {
    try {
      const policyId = Number(req.params.policyId);
      const deleted = await LeaveService.deletePolicy(policyId, buildAuthContext(req));
      res.json(successResponse(deleted, "Leave policy deactivated"));
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400, error.details)
      );
    }
  }

  static async listPolicyAssignments(req: AuthRequest, res: Response): Promise<void> {
    try {
      const items = await LeaveService.listPolicyAssignments(buildAuthContext(req));
      res.json(successResponse(items, "Leave policy assignments retrieved"));
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400, error.details)
      );
    }
  }

  static async createPolicyAssignment(req: AuthRequest, res: Response): Promise<void> {
    try {
      const created = await LeaveService.createPolicyAssignment(req.body, buildAuthContext(req));
      res.status(201).json(successResponse(created, "Leave policy assignment created", 201));
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400, error.details)
      );
    }
  }

  static async deletePolicyAssignment(req: AuthRequest, res: Response): Promise<void> {
    try {
      const assignmentId = Number(req.params.assignmentId);
      const deleted = await LeaveService.deletePolicyAssignment(assignmentId, buildAuthContext(req));
      res.json(successResponse(deleted, "Leave policy assignment deleted"));
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400, error.details)
      );
    }
  }

  static async listPublicHolidays(req: AuthRequest, res: Response): Promise<void> {
    try {
      const dateFrom = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : undefined;
      const dateTo = req.query.dateTo ? new Date(String(req.query.dateTo)) : undefined;
      const items = await LeaveService.listPublicHolidays(buildAuthContext(req), { dateFrom, dateTo });
      res.json(successResponse(items, "Public holidays retrieved"));
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400, error.details)
      );
    }
  }

  static async createPublicHoliday(req: AuthRequest, res: Response): Promise<void> {
    try {
      const created = await LeaveService.createPublicHoliday(req.body, buildAuthContext(req));
      res.status(201).json(successResponse(created, "Public holiday created", 201));
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400, error.details)
      );
    }
  }

  static async updatePublicHoliday(req: AuthRequest, res: Response): Promise<void> {
    try {
      const holidayId = Number(req.params.holidayId);
      const updated = await LeaveService.updatePublicHoliday(holidayId, req.body, buildAuthContext(req));
      res.json(successResponse(updated, "Public holiday updated"));
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400, error.details)
      );
    }
  }

  static async deletePublicHoliday(req: AuthRequest, res: Response): Promise<void> {
    try {
      const holidayId = Number(req.params.holidayId);
      const deleted = await LeaveService.deletePublicHoliday(holidayId, buildAuthContext(req));
      res.json(successResponse(deleted, "Public holiday deleted"));
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400, error.details)
      );
    }
  }

  static async adjustBalance(req: AuthRequest, res: Response): Promise<void> {
    try {
      const adjusted = await LeaveService.adjustBalance(req.body, buildAuthContext(req));
      res.status(201).json(successResponse(adjusted, "Leave balance adjusted", 201));
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400, error.details)
      );
    }
  }

  static async getReportSummary(req: AuthRequest, res: Response): Promise<void> {
    try {
      const dateFrom = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : undefined;
      const dateTo = req.query.dateTo ? new Date(String(req.query.dateTo)) : undefined;
      const summary = await LeaveService.getReportSummary(buildAuthContext(req), { dateFrom, dateTo });
      res.json(successResponse(summary, "Leave report summary retrieved"));
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400, error.details)
      );
    }
  }
}

export default LeaveController;
