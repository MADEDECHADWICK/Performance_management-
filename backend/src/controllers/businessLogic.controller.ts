/**
 * Business Logic Controller (Phase 5)
 * Orchestrates complex operations
 */

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { BudgetService } from '../services/budget.service';
import { RevenueService } from '../services/revenue.service';
import { EvaluationService } from '../services/evaluation.service';
import { JobStaffingService } from '../services/jobStaffing.service';
import { successResponse, errorResponse } from '../utils/response';

export class BusinessLogicController {
  // ========== BUDGET ENDPOINTS ==========

  static async createBudgetAllocation(req: AuthRequest, res: Response): Promise<void> {
    try {
      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const result = await BudgetService.createBudgetAllocation(
        req.body,
        auth
      );

      res.status(201).json(
        successResponse(result, 'Budget allocation created', 201)
      );
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400)
      );
    }
  }

  static async recordExpenditure(req: AuthRequest, res: Response): Promise<void> {
    try {
      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const result = await BudgetService.recordExpenditure(req.body, auth);

      res.json(successResponse(result, 'Expenditure recorded'));
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400)
      );
    }
  }

  static async getBudgetUtilization(req: AuthRequest, res: Response): Promise<void> {
    try {
      const budgetId = Number(req.params.budgetId);

      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const result = await BudgetService.getBudgetUtilizationReport(
        budgetId,
        auth
      );

      res.json(successResponse(result, 'Budget utilization report'));
    } catch (error: any) {
      res.status(error.statusCode || 500).json(
        errorResponse(error.message, error.statusCode || 500)
      );
    }
  }

  static async createBudgetForecast(req: AuthRequest, res: Response): Promise<void> {
    try {
      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const result = await BudgetService.createBudgetForecast(req.body, auth);

      res.status(201).json(
        successResponse(result, 'Budget forecast created', 201)
      );
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400)
      );
    }
  }

  static async getBudgetForecastVsActual(
    req: AuthRequest,
    res: Response
  ): Promise<void> {
    try {
      const jobId = Number(req.params.jobId);

      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const result = await BudgetService.getBudgetForecastVsActual(jobId, auth);

      res.json(successResponse(result, 'Forecast vs Actual data'));
    } catch (error: any) {
      res.status(error.statusCode || 500).json(
        errorResponse(error.message, error.statusCode || 500)
      );
    }
  }

  static async getDepartmentBudgetSummary(
    req: AuthRequest,
    res: Response
  ): Promise<void> {
    try {
      const departmentId = Number(req.params.departmentId);
      const fiscalYear = Number(req.query.fiscalYear) || new Date().getFullYear();

      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const result = await BudgetService.getDepartmentBudgetSummary(
        departmentId,
        fiscalYear,
        auth
      );

      res.json(successResponse(result, 'Department budget summary'));
    } catch (error: any) {
      res.status(error.statusCode || 500).json(
        errorResponse(error.message, error.statusCode || 500)
      );
    }
  }

  static async analyzeBudgetEfficiency(
    req: AuthRequest,
    res: Response
  ): Promise<void> {
    try {
      const jobId = Number(req.params.jobId);

      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const result = await BudgetService.analyzeBudgetEfficiency(jobId, auth);

      res.json(successResponse(result, 'Budget efficiency analysis'));
    } catch (error: any) {
      res.status(error.statusCode || 500).json(
        errorResponse(error.message, error.statusCode || 500)
      );
    }
  }

  // ========== REVENUE ENDPOINTS ==========

  static async recordRevenue(req: AuthRequest, res: Response): Promise<void> {
    try {
      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const result = await RevenueService.recordRevenue(req.body, auth);

      res.status(201).json(
        successResponse(result, 'Revenue recorded', 201)
      );
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400)
      );
    }
  }

  static async getRevenueSummary(req: AuthRequest, res: Response): Promise<void> {
    try {
      const jobId = Number(req.params.jobId);

      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const result = await RevenueService.getRevenueSummary(jobId, auth);

      res.json(successResponse(result, 'Revenue summary'));
    } catch (error: any) {
      res.status(error.statusCode || 500).json(
        errorResponse(error.message, error.statusCode || 500)
      );
    }
  }

  static async getDepartmentRevenueReport(
    req: AuthRequest,
    res: Response
  ): Promise<void> {
    try {
      const departmentId = Number(req.params.departmentId);
      const startDate = new Date(req.query.startDate as string);
      const endDate = new Date(req.query.endDate as string);

      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const result = await RevenueService.getDepartmentRevenueReport(
        departmentId,
        startDate,
        endDate,
        auth
      );

      res.json(successResponse(result, 'Department revenue report'));
    } catch (error: any) {
      res.status(error.statusCode || 500).json(
        errorResponse(error.message, error.statusCode || 500)
      );
    }
  }

  static async createRevenueProjection(
    req: AuthRequest,
    res: Response
  ): Promise<void> {
    try {
      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const result = await RevenueService.createRevenueProjection(
        req.body,
        auth
      );

      res.status(201).json(
        successResponse(result, 'Revenue projection created', 201)
      );
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400)
      );
    }
  }

  static async getRevenueVsProjection(
    req: AuthRequest,
    res: Response
  ): Promise<void> {
    try {
      const jobId = Number(req.params.jobId);

      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const result = await RevenueService.getRevenueVsProjection(jobId, auth);

      res.json(successResponse(result, 'Revenue vs projection'));
    } catch (error: any) {
      res.status(error.statusCode || 500).json(
        errorResponse(error.message, error.statusCode || 500)
      );
    }
  }

  static async getMonthlyRevenueTrend(
    req: AuthRequest,
    res: Response
  ): Promise<void> {
    try {
      const departmentId = Number(req.params.departmentId);
      const months = Number(req.query.months) || 12;

      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const result = await RevenueService.getMonthlyRevenueTrend(
        departmentId,
        months,
        auth
      );

      res.json(successResponse(result, 'Monthly revenue trend'));
    } catch (error: any) {
      res.status(error.statusCode || 500).json(
        errorResponse(error.message, error.statusCode || 500)
      );
    }
  }

  // ========== EVALUATION ENDPOINTS ==========

  static async submitEvaluation(req: AuthRequest, res: Response): Promise<void> {
    try {
      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const result = await EvaluationService.submitEvaluation(
        req.body,
        auth
      );

      res.status(201).json(
        successResponse(result, 'Evaluation submitted', 201)
      );
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400)
      );
    }
  }

  static async getAggregatedEvaluationScores(
    req: AuthRequest,
    res: Response
  ): Promise<void> {
    try {
      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const result = await EvaluationService.getAggregatedEvaluationScores(
        {
          evaluatee_profile_id: Number(req.params.profileId),
          evaluation_cycle_id: Number(req.params.cycleId),
        },
        auth
      );

      res.json(successResponse(result, 'Aggregated evaluation scores'));
    } catch (error: any) {
      res.status(error.statusCode || 500).json(
        errorResponse(error.message, error.statusCode || 500)
      );
    }
  }

  static async getEvaluationComparison(
    req: AuthRequest,
    res: Response
  ): Promise<void> {
    try {
      const cycleId = Number(req.params.cycleId);
      const departmentId = req.query.departmentId
        ? Number(req.query.departmentId)
        : undefined;

      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const result = await EvaluationService.getEvaluationComparison(
        cycleId,
        departmentId,
        auth
      );

      res.json(successResponse(result, 'Evaluation comparison'));
    } catch (error: any) {
      res.status(error.statusCode || 500).json(
        errorResponse(error.message, error.statusCode || 500)
      );
    }
  }

  static async getKPIVsEvaluationAnalysis(
    req: AuthRequest,
    res: Response
  ): Promise<void> {
    try {
      const profileId = Number(req.params.profileId);
      const cycleId = Number(req.params.cycleId);

      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const result = await EvaluationService.getKPIVsEvaluationAnalysis(
        profileId,
        cycleId,
        auth
      );

      res.json(successResponse(result, 'KPI vs Evaluation analysis'));
    } catch (error: any) {
      res.status(error.statusCode || 500).json(
        errorResponse(error.message, error.statusCode || 500)
      );
    }
  }

  static async generatePerformanceImprovementPlan(
    req: AuthRequest,
    res: Response
  ): Promise<void> {
    try {
      const profileId = Number(req.params.profileId);
      const cycleId = Number(req.params.cycleId);

      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const result = await EvaluationService.generatePerformanceImprovementPlan(
        profileId,
        cycleId,
        auth
      );

      res.status(201).json(
        successResponse(result, 'Performance improvement plan generated', 201)
      );
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400)
      );
    }
  }

  // ========== JOB STAFFING ENDPOINTS ==========

  static async allocateEmployeeToJob(
    req: AuthRequest,
    res: Response
  ): Promise<void> {
    try {
      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const result = await JobStaffingService.allocateEmployeeToJob(
        req.body,
        auth
      );

      res.status(201).json(
        successResponse(result, 'Employee allocated to job', 201)
      );
    } catch (error: any) {
      res.status(error.statusCode || 400).json(
        errorResponse(error.message, error.statusCode || 400)
      );
    }
  }

  static async getEmployeeUtilization(
    req: AuthRequest,
    res: Response
  ): Promise<void> {
    try {
      const employeeId = Number(req.params.employeeId);

      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const result = await JobStaffingService.getEmployeeUtilization(
        employeeId,
        auth
      );

      res.json(successResponse(result, 'Employee utilization'));
    } catch (error: any) {
      res.status(error.statusCode || 500).json(
        errorResponse(error.message, error.statusCode || 500)
      );
    }
  }

  static async getJobStaffingRequirements(
    req: AuthRequest,
    res: Response
  ): Promise<void> {
    try {
      const jobId = Number(req.params.jobId);

      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const result = await JobStaffingService.getJobStaffingRequirements(
        jobId,
        auth
      );

      res.json(successResponse(result, 'Job staffing requirements'));
    } catch (error: any) {
      res.status(error.statusCode || 500).json(
        errorResponse(error.message, error.statusCode || 500)
      );
    }
  }

  static async getTeamUtilizationReport(
    req: AuthRequest,
    res: Response
  ): Promise<void> {
    try {
      const departmentId = Number(req.params.departmentId);

      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const result = await JobStaffingService.getTeamUtilizationReport(
        departmentId,
        auth
      );

      res.json(successResponse(result, 'Team utilization report'));
    } catch (error: any) {
      res.status(error.statusCode || 500).json(
        errorResponse(error.message, error.statusCode || 500)
      );
    }
  }

  static async analyzeResourceGaps(req: AuthRequest, res: Response): Promise<void> {
    try {
      const jobId = Number(req.params.jobId);

      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const result = await JobStaffingService.analyzeResourceGaps(jobId, auth);

      res.json(successResponse(result, 'Resource gap analysis'));
    } catch (error: any) {
      res.status(error.statusCode || 500).json(
        errorResponse(error.message, error.statusCode || 500)
      );
    }
  }

  static async getEmployeeProductivity(
    req: AuthRequest,
    res: Response
  ): Promise<void> {
    try {
      const employeeId = Number(req.params.employeeId);
      const startDate = new Date(req.query.startDate as string);
      const endDate = new Date(req.query.endDate as string);

      const auth = {
        userId: req.user!.userId,
        profileId: req.profile!.id,
        roleName: req.profile!.role?.name,
      };

      const result = await JobStaffingService.getEmployeeProductivity(
        employeeId,
        startDate,
        endDate,
        auth
      );

      res.json(successResponse(result, 'Employee productivity'));
    } catch (error: any) {
      res.status(error.statusCode || 500).json(
        errorResponse(error.message, error.statusCode || 500)
      );
    }
  }
}