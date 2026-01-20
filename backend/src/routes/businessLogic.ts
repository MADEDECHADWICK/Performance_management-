/**
 * Business Logic Routes (Phase 5)
 * Complex operations and calculations
 */

import { Router } from 'express';
import { BusinessLogicController } from '../controllers/businessLogic.controller';
import { authMiddleware } from '../middleware/auth';
import { loadProfile } from '../middleware/loadProfile';
import { requireRole } from '../middleware/reqiureRole';
import { handleValidationErrors } from '../middleware/validate';
import { body, param, query } from 'express-validator';

const router = Router();

// ✅ VALIDATORS FOR BUDGET
const budgetAllocationValidators = [
  body('job_id').isInt().withMessage('job_id must be an integer'),
  body('department_id').isInt().withMessage('department_id must be an integer'),
  body('total_budget').isFloat({ min: 0 }).withMessage('total_budget must be positive'),
  body('personnel_budget').isFloat({ min: 0 }).withMessage('personnel_budget must be positive'),
  body('operational_budget').isFloat({ min: 0 }).withMessage('operational_budget must be positive'),
  body('contingency_percentage').isFloat({ min: 0, max: 100 }).withMessage('contingency_percentage must be 0-100'),
  body('fiscal_year').isInt().withMessage('fiscal_year must be an integer'),
];

const expenditureValidators = [
  body('budget_allocation_id').isInt().withMessage('budget_allocation_id must be an integer'),
  body('amount_spent').isFloat({ min: 0 }).withMessage('amount_spent must be positive'),
  body('category').isString().withMessage('category is required'),
  body('description').isString().isLength({ min: 5 }).withMessage('description required'),
];

const budgetForecastValidators = [
  body('job_id').isInt().withMessage('job_id must be an integer'),
  body('estimated_personnel_cost').isFloat({ min: 0 }).withMessage('estimated_personnel_cost must be positive'),
  body('estimated_operational_cost').isFloat({ min: 0 }).withMessage('estimated_operational_cost must be positive'),
  body('confidence_level').isFloat({ min: 0, max: 100 }).withMessage('confidence_level must be 0-100'),
];

// ✅ VALIDATORS FOR REVENUE
const revenueValidators = [
  body('job_id').isInt().withMessage('job_id must be an integer'),
  body('amount').isFloat({ min: 0 }).withMessage('amount must be positive'),
  body('revenue_type').isIn(['billable', 'non-billable', 'partial']).withMessage('Invalid revenue_type'),
  body('date').isISO8601().withMessage('date must be ISO8601'),
  body('description').isString().isLength({ min: 5 }).withMessage('description required'),
];

const revenueProjectionValidators = [
  body('job_id').isInt().withMessage('job_id must be an integer'),
  body('projected_revenue').isFloat({ min: 0 }).withMessage('projected_revenue must be positive'),
  body('confidence_level').isFloat({ min: 0, max: 100 }).withMessage('confidence_level must be 0-100'),
];

// ✅ VALIDATORS FOR EVALUATION
const evaluationValidators = [
  body('evaluatee_profile_id').isInt().withMessage('evaluatee_profile_id must be an integer'),
  body('evaluator_profile_id').isInt().withMessage('evaluator_profile_id must be an integer'),
  body('evaluation_cycle_id').isInt().withMessage('evaluation_cycle_id must be an integer'),
  body('scores').isObject().withMessage('scores must be an object'),
  body('evaluation_type').isString().withMessage('evaluation_type is required'),
];

// ✅ VALIDATORS FOR STAFFING
const staffAllocationValidators = [
  body('job_id').isInt().withMessage('job_id must be an integer'),
  body('employee_profile_id').isInt().withMessage('employee_profile_id must be an integer'),
  body('role').isString().isLength({ min: 2 }).withMessage('role required'),
  body('allocation_percentage').isFloat({ min: 0, max: 100 }).withMessage('allocation_percentage must be 0-100'),
  body('start_date').isISO8601().withMessage('start_date must be ISO8601'),
  body('hourly_rate').isFloat({ min: 0 }).withMessage('hourly_rate must be positive'),
];

// ✅ BUDGET ROUTES
router.post(
  '/budget/allocations',
  authMiddleware,
  loadProfile,
  requireRole(['admin', 'manager']),
  ...budgetAllocationValidators,
  handleValidationErrors,
  BusinessLogicController.createBudgetAllocation
);

router.post(
  '/budget/expenditures',
  authMiddleware,
  loadProfile,
  requireRole(['admin', 'manager']),
  ...expenditureValidators,
  handleValidationErrors,
  BusinessLogicController.recordExpenditure
);

router.get(
  '/budget/:budgetId/utilization',
  authMiddleware,
  loadProfile,
  param('budgetId').isInt().toInt(),
  handleValidationErrors,
  BusinessLogicController.getBudgetUtilization
);

router.post(
  '/budget/forecasts',
  authMiddleware,
  loadProfile,
  requireRole(['admin', 'manager', 'analyst']),
  ...budgetForecastValidators,
  handleValidationErrors,
  BusinessLogicController.createBudgetForecast
);

router.get(
  '/budget/jobs/:jobId/forecast-vs-actual',
  authMiddleware,
  loadProfile,
  param('jobId').isInt().toInt(),
  handleValidationErrors,
  BusinessLogicController.getBudgetForecastVsActual
);

router.get(
  '/budget/departments/:departmentId/summary',
  authMiddleware,
  loadProfile,
  requireRole(['admin', 'manager']),
  param('departmentId').isInt().toInt(),
  query('fiscalYear').optional().isInt().toInt(),
  handleValidationErrors,
  BusinessLogicController.getDepartmentBudgetSummary
);

router.get(
  '/budget/jobs/:jobId/efficiency',
  authMiddleware,
  loadProfile,
  param('jobId').isInt().toInt(),
  handleValidationErrors,
  BusinessLogicController.analyzeBudgetEfficiency
);

// ✅ REVENUE ROUTES
router.post(
  '/revenue/records',
  authMiddleware,
  loadProfile,
  requireRole(['admin', 'manager', 'finance']),
  ...revenueValidators,
  handleValidationErrors,
  BusinessLogicController.recordRevenue
);

router.get(
  '/revenue/jobs/:jobId/summary',
  authMiddleware,
  loadProfile,
  param('jobId').isInt().toInt(),
  handleValidationErrors,
  BusinessLogicController.getRevenueSummary
);

router.get(
  '/revenue/departments/:departmentId/report',
  authMiddleware,
  loadProfile,
  requireRole(['admin', 'manager']),
  param('departmentId').isInt().toInt(),
  query('startDate').isISO8601().withMessage('startDate required'),
  query('endDate').isISO8601().withMessage('endDate required'),
  handleValidationErrors,
  BusinessLogicController.getDepartmentRevenueReport
);

router.post(
  '/revenue/projections',
  authMiddleware,
  loadProfile,
  requireRole(['admin', 'manager', 'analyst']),
  ...revenueProjectionValidators,
  handleValidationErrors,
  BusinessLogicController.createRevenueProjection
);

router.get(
  '/revenue/jobs/:jobId/vs-projection',
  authMiddleware,
  loadProfile,
  param('jobId').isInt().toInt(),
  handleValidationErrors,
  BusinessLogicController.getRevenueVsProjection
);

router.get(
  '/revenue/departments/:departmentId/monthly-trend',
  authMiddleware,
  loadProfile,
  param('departmentId').isInt().toInt(),
  query('months').optional().isInt({ min: 1, max: 60 }).toInt(),
  handleValidationErrors,
  BusinessLogicController.getMonthlyRevenueTrend
);

// ✅ EVALUATION ROUTES
router.post(
  '/evaluations/submit',
  authMiddleware,
  loadProfile,
  ...evaluationValidators,
  handleValidationErrors,
  BusinessLogicController.submitEvaluation
);

router.get(
  '/evaluations/:profileId/cycles/:cycleId/aggregated',
  authMiddleware,
  loadProfile,
  param('profileId').isInt().toInt(),
  param('cycleId').isInt().toInt(),
  handleValidationErrors,
  BusinessLogicController.getAggregatedEvaluationScores
);

router.get(
  '/evaluations/cycles/:cycleId/comparison',
  authMiddleware,
  loadProfile,
  requireRole(['admin', 'manager']),
  param('cycleId').isInt().toInt(),
  query('departmentId').optional().isInt().toInt(),
  handleValidationErrors,
  BusinessLogicController.getEvaluationComparison
);

router.get(
  '/evaluations/:profileId/cycles/:cycleId/kpi-analysis',
  authMiddleware,
  loadProfile,
  param('profileId').isInt().toInt(),
  param('cycleId').isInt().toInt(),
  handleValidationErrors,
  BusinessLogicController.getKPIVsEvaluationAnalysis
);

router.post(
  '/evaluations/:profileId/cycles/:cycleId/improvement-plan',
  authMiddleware,
  loadProfile,
  requireRole(['admin', 'manager']),
  param('profileId').isInt().toInt(),
  param('cycleId').isInt().toInt(),
  handleValidationErrors,
  BusinessLogicController.generatePerformanceImprovementPlan
);

// ✅ STAFFING ROUTES
router.post(
  '/staffing/allocations',
  authMiddleware,
  loadProfile,
  requireRole(['admin', 'manager']),
  ...staffAllocationValidators,
  handleValidationErrors,
  BusinessLogicController.allocateEmployeeToJob
);

router.get(
  '/staffing/employees/:employeeId/utilization',
  authMiddleware,
  loadProfile,
  param('employeeId').isInt().toInt(),
  handleValidationErrors,
  BusinessLogicController.getEmployeeUtilization
);

router.get(
  '/staffing/jobs/:jobId/requirements',
  authMiddleware,
  loadProfile,
  param('jobId').isInt().toInt(),
  handleValidationErrors,
  BusinessLogicController.getJobStaffingRequirements
);

router.get(
  '/staffing/departments/:departmentId/team-utilization',
  authMiddleware,
  loadProfile,
  requireRole(['admin', 'manager']),
  param('departmentId').isInt().toInt(),
  handleValidationErrors,
  BusinessLogicController.getTeamUtilizationReport
);

router.get(
  '/staffing/jobs/:jobId/resource-gaps',
  authMiddleware,
  loadProfile,
  param('jobId').isInt().toInt(),
  handleValidationErrors,
  BusinessLogicController.analyzeResourceGaps
);

router.get(
  '/staffing/employees/:employeeId/productivity',
  authMiddleware,
  loadProfile,
  param('employeeId').isInt().toInt(),
  query('startDate').isISO8601().withMessage('startDate required'),
  query('endDate').isISO8601().withMessage('endDate required'),
  handleValidationErrors,
  BusinessLogicController.getEmployeeProductivity
);

export default router;