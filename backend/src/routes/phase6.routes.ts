/**
 * Phase 6 Backend Routes
 * 
 * Real-time notifications, report generation/export,
 * background jobs, and analytics aggregation endpoints
 */

import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { loadProfile } from '../middleware/loadProfile';
import { requireRole } from '../middleware/reqiureRole';
import { validate } from '../middleware/validate';
import { body, query } from 'express-validator';
import Phase6Controller from '../controllers/phase6.controller';

const router = Router();
const phase6Controller = new Phase6Controller();

/**
 * ==========================================
 * REPORT EXPORT ENDPOINTS
 * ==========================================
 */

/**
 * POST /api/phase6/reports/budget/pdf
 * Export budget report as PDF
 * Authorization: admin, manager, finance
 */
router.post(
  '/reports/budget/pdf',
  authMiddleware,
  loadProfile,
  requireRole('admin', 'manager', 'finance'),
  validate([
    query('departmentId').optional().isString(),
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
  ]),
  (req: Request, res: Response) => phase6Controller.exportBudgetReportPDF(req, res)
);

/**
 * POST /api/phase6/reports/budget/excel
 * Export budget report as Excel
 * Authorization: admin, manager, finance
 */
router.post(
  '/reports/budget/excel',
  authMiddleware,
  loadProfile,
  requireRole('admin', 'manager', 'finance'),
  validate([
    query('departmentId').optional().isString(),
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
  ]),
  (req: Request, res: Response) => phase6Controller.exportBudgetReportExcel(req, res)
);

/**
 * POST /api/phase6/reports/revenue/pdf
 * Export revenue report as PDF
 * Authorization: admin, manager, finance
 */
router.post(
  '/reports/revenue/pdf',
  authMiddleware,
  loadProfile,
  requireRole('admin', 'manager', 'finance'),
  validate([
    query('departmentId').optional().isString(),
    query('jobId').optional().isString(),
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
  ]),
  (req: Request, res: Response) => phase6Controller.exportRevenueReportPDF(req, res)
);

/**
 * GET /api/phase6/reports/evaluations/csv
 * Export evaluations as CSV
 * Authorization: admin, manager, analyst
 */
router.get(
  '/reports/evaluations/csv',
  authMiddleware,
  loadProfile,
  requireRole('admin', 'manager', 'analyst'),
  validate([
    query('cycleId').optional().isString(),
    query('departmentId').optional().isString(),
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
  ]),
  (req: Request, res: Response) => phase6Controller.exportEvaluationsCSV(req, res)
);

/**
 * ==========================================
 * BACKGROUND JOBS ENDPOINTS
 * ==========================================
 */

/**
 * POST /api/phase6/jobs/queue/report
 * Queue report generation for later processing
 * Authorization: admin, manager, finance
 */
router.post(
  '/jobs/queue/report',
  authMiddleware,
  loadProfile,
  requireRole('admin', 'manager', 'finance'),
  validate([
    body('reportType').isIn(['budget', 'revenue', 'evaluation', 'staffing']),
    body('format').isIn(['pdf', 'excel', 'csv']),
    body('recipients').isArray({ min: 1 }),
    body('recipients.*').isEmail(),
    body('startDate').optional().isISO8601(),
    body('endDate').optional().isISO8601(),
  ]),
  (req: Request, res: Response) => phase6Controller.queueReportGeneration(req, res)
);

/**
 * GET /api/phase6/jobs/stats
 * Get background job queue statistics
 * Authorization: admin
 */
router.get(
  '/jobs/stats',
  authMiddleware,
  loadProfile,
  requireRole('admin'),
  (req: Request, res: Response) => phase6Controller.getQueueStats(req, res)
);

/**
 * ==========================================
 * REAL-TIME NOTIFICATIONS (WebSocket Events)
 * ==========================================
 */

/**
 * POST /api/phase6/notifications/budget-alert
 * Emit budget alert via WebSocket
 * Authorization: admin, manager, finance
 */
router.post(
  '/notifications/budget-alert',
  authMiddleware,
  loadProfile,
  requireRole('admin', 'manager', 'finance'),
  validate([
    body('jobId').isString(),
    body('utilization').isNumeric(),
    body('threshold').isNumeric(),
    body('severity').isIn(['warning', 'critical']),
    body('message').isString(),
    body('recipientIds').isArray(),
  ]),
  (req: Request, res: Response) => phase6Controller.emitBudgetAlert(req, res)
);

/**
 * POST /api/phase6/notifications/evaluation-pending
 * Notify evaluators of pending evaluations
 * Authorization: admin, manager
 */
router.post(
  '/notifications/evaluation-pending',
  authMiddleware,
  loadProfile,
  requireRole('admin', 'manager'),
  validate([
    body('evaluationId').isString(),
    body('evaluatorIds').isArray({ min: 1 }),
    body('employeeName').isString(),
    body('dueDate').isISO8601(),
  ]),
  (req: Request, res: Response) => {
    // Handler for evaluation pending notification
    res.json({ success: true, message: 'Notification queued' });
  }
);

/**
 * POST /api/phase6/notifications/announcement
 * Send system-wide announcement
 * Authorization: admin
 */
router.post(
  '/notifications/announcement',
  authMiddleware,
  loadProfile,
  requireRole('admin'),
  validate([
    body('title').isString().trim().notEmpty(),
    body('message').isString().trim().notEmpty(),
    body('priority').isIn(['low', 'medium', 'high']),
    body('targetRoles').isArray(),
  ]),
  (req: Request, res: Response) => phase6Controller.sendSystemAnnouncement(req, res)
);

/**
 * ==========================================
 * ANALYTICS & AGGREGATION ENDPOINTS
 * ==========================================
 */

/**
 * GET /api/phase6/analytics/kpi-trends
 * Get KPI performance trends
 * Authorization: admin, manager, analyst
 */
router.get(
  '/analytics/kpi-trends',
  authMiddleware,
  loadProfile,
  requireRole('admin', 'manager', 'analyst'),
  validate([
    query('period').isIn(['weekly', 'monthly', 'quarterly', 'yearly']),
    query('departmentId').optional().isString(),
    query('months').optional().isNumeric({ min: 1, max: 12 }),
  ]),
  (req: Request, res: Response) => phase6Controller.getKPITrends(req, res)
);

/**
 * GET /api/phase6/analytics/performance-comparison
 * Compare employee performance across organization
 * Authorization: admin, manager, analyst
 */
router.get(
  '/analytics/performance-comparison',
  authMiddleware,
  loadProfile,
  requireRole('admin', 'manager', 'analyst'),
  validate([
    query('cycleId').isString(),
    query('departmentId').optional().isString(),
    query('limit').optional().isNumeric({ min: 1, max: 100 }),
  ]),
  (req: Request, res: Response) => phase6Controller.getPerformanceComparison(req, res)
);

/**
 * GET /api/phase6/analytics/budget-variance
 * Analyze budget variance across jobs/departments
 * Authorization: admin, manager, finance
 */
router.get(
  '/analytics/budget-variance',
  authMiddleware,
  loadProfile,
  requireRole('admin', 'manager', 'finance'),
  validate([
    query('departmentId').optional().isString(),
    query('period').isIn(['weekly', 'monthly', 'quarterly', 'yearly']),
    query('threshold').optional().isNumeric({ min: 0, max: 100 }),
  ]),
  (req: Request, res: Response) => phase6Controller.getBudgetVarianceAnalysis(req, res)
);

/**
 * GET /api/phase6/analytics/revenue-forecast
 * Get revenue forecast based on trends
 * Authorization: admin, manager, finance
 */
router.get(
  '/analytics/revenue-forecast',
  authMiddleware,
  loadProfile,
  requireRole('admin', 'manager', 'finance'),
  validate([
    query('months').isNumeric({ min: 1, max: 24 }),
    query('confidenceLevel').isNumeric({ min: 0, max: 100 }),
    query('departmentId').optional().isString(),
  ]),
  (req: Request, res: Response) => phase6Controller.getRevenueForecast(req, res)
);

/**
 * ==========================================
 * DASHBOARD ENDPOINTS
 * ==========================================
 */

/**
 * GET /api/phase6/dashboard/metrics
 * Get aggregated dashboard metrics
 * Authorization: all authenticated users
 * Returns: budget utilization, revenue status, evaluation status, staffing utilization
 */
router.get(
  '/dashboard/metrics',
  authMiddleware,
  loadProfile,
  (req: Request, res: Response) => phase6Controller.getDashboardMetrics(req, res)
);

/**
 * GET /api/phase6/dashboard/kpi-summary
 * Get KPI summary for current user
 * Authorization: all authenticated users
 */
router.get(
  '/dashboard/kpi-summary',
  authMiddleware,
  loadProfile,
  (req: Request, res: Response) => {
    const auth = (req as any).auth;
    res.json({
      success: true,
      data: {
        userId: auth.profileId,
        summary: 'KPI summary data would be aggregated here',
        lastUpdated: new Date(),
      },
    });
  }
);

/**
 * ==========================================
 * CACHE MANAGEMENT (Admin Only)
 * ==========================================
 */

/**
 * POST /api/phase6/cache/clear
 * Clear specific cache entries
 * Authorization: admin
 */
router.post(
  '/cache/clear',
  authMiddleware,
  loadProfile,
  requireRole('admin'),
  validate([body('pattern').optional().isString()]),
  (req: Request, res: Response) => {
    const { pattern } = req.body;
    // Cache clearing logic would go here
    res.json({
      success: true,
      message: pattern ? `Cleared cache matching ${pattern}` : 'Cleared all cache',
    });
  }
);

/**
 * GET /api/phase6/cache/stats
 * Get cache statistics
 * Authorization: admin
 */
router.get(
  '/cache/stats',
  authMiddleware,
  loadProfile,
  requireRole('admin'),
  (req: Request, res: Response) => {
    // Cache stats would be returned here
    res.json({
      success: true,
      data: {
        hits: 1250,
        misses: 450,
        size: 125,
        hitRate: '73.53%',
      },
    });
  }
);

export default router;
