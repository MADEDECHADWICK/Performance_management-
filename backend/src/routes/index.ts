/**
 * Main API routes index
 * Consolidates all route imports and groups them by domain
 * 
 * Usage in app.ts:
 * import routes from './routes';
 * app.use('/api', routes);
 */

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';

// Import all route modules
import authRoutes from './auth';
import departmentRoutes from './departments.routes';
import documentsRoutes from './documents.routes';
import employeeOnboardingRoutes from './employeeOnboardingCase.routes';
import evaluationRoutes from './evaluations.routes';
import inductionChecklistRoutes from './inductionChecklist.routes';
import partnerRoutes from './partners.routes';
import jobsRoutes from './jobs.routes';
import timeEntriesRoutes from './time-entries.routes';

// Legacy/Additional routes
import analyticRoutes from './analytics';
import auditLogsRoutes from './auditLogs';
import clientsRoutes from './clients';
import clientEvaluationsRoutes from './clientEvaluations';
import continuousFeedbackRoutes from './continuousFeedback';
import createCycleEvaluationsRoutes from './createCycleEvaluations';
import developmentRecommendationsRoutes from './developmentRecommendations';
import employeeEvaluationsRoutes from './employeeEvaluations';
import employeeGoalsRoutes from './employeeGoals';
import employeeKpiAssignmentsRoutes from './employeeKpiAssignments';
import employeeProjectAllocationsRoutes from './employeeProjectAllocations';
import employeeRolesRoutes from './employeeRoles';
import employeesRoutes from './employees';
import evaluationAssignmentsRoutes from './evaluationAssignments';
import evaluationCyclesRoutes from './evaluationCycles';
import evaluationResultAreasRoutes from './evaluationResultAreas';
import evaluationTemplatesRoutes from './evaluationTemplates';
import feedbackRoutes from './feedback';
import financialSummaryRoutes from './financialSummary';
import gmpAuthRoutes from './gmp-auth';
import gmpDashboardRoutes from './gmpDashboard';
import jobProfitabilityRoutes from './jobProfitability';
import jobStaffAssignmentsRoutes from './jobStaffAssignments';
import jobWorkflowRoutes from './jobWorkflow';
import kpisRoutes from './kpis';
import managerDashboardRoutes from './managerDashboard';
import nonFinancialPerformanceRoutes from './nonFinancialPerformance';
import notificationsRoutes from './notifications';
import peerEvaluationsRoutes from './peerEvaluations';
import performanceReviewsRoutes from './performanceReviews';
import positionRatesRoutes from './positionRates';
import profilesRoutes from './profiles';
import projectsRoutes from './projects';
import rolesRoutes from './roles';
import subordinatesRoutes from './subordinates';
import teamManagementRoutes from './teamManagement';
import todosRoutes from './todos';
import upwardEvaluationsRoutes from './upwardEvaluations';
import userRolesRoutes from './userRoles';
import workLogsRoutes from './workLogs';
import adminJobDashboardRoutes from './admin-job-dashboard';
import adminJobWorkflowRoutes from './admin-job-workflow';
import adHocEvaluationsRoutes from './adHocEvaluations';

export function setupRoutes(app: any) {
  const router = Router();

  // ============================================
  // 🔐 PHASE 1 & 2: CORE DOMAINS (NEW & SECURE)
  // ============================================
  
  /**
   * Auth Routes (no auth required)
   * Handles: login, signup, refresh token, logout
   */
  router.use('/api/auth', authRoutes);

  /**
   * Core CRUD Domains (all require authentication)
   */
  router.use('/api/departments', authMiddleware, departmentRoutes);
  router.use('/api/documents', authMiddleware, documentsRoutes);
  router.use('/api/onboarding', authMiddleware, employeeOnboardingRoutes);
  router.use('/api/evaluations', authMiddleware, evaluationRoutes);
  router.use('/api/induction-checklist', authMiddleware, inductionChecklistRoutes);
  router.use('/api/partners', authMiddleware, partnerRoutes);
  router.use('/api/jobs', authMiddleware, jobsRoutes);
  
  /**
   * ⏱️  TIME ENTRIES - PHASE 2 COMPLETE
   * Priority: HIGH - Core business logic for time tracking
   * Endpoints: 13 fully implemented with:
   *   - Authorization checks (employees see own, managers see team)
   *   - Budget validation (prevent exceeding job budgets)
   *   - Timer functionality (start/stop with duration calculation)
   *   - Batch operations (submit/approve multiple entries)
   *   - Job summaries (total hours, budget usage, per-employee breakdown)
   *   - Status workflow (draft → submitted → approved/rejected)
   */
  router.use('/api/time-entries', authMiddleware, timeEntriesRoutes);

  // ============================================
  // 📊 SECONDARY DOMAINS (Dashboard & Workflows)
  // ============================================
  
  /**
   * Analytics & Reporting
   */
  router.use('/api/analytics', authMiddleware, analyticRoutes);
  router.use('/api/audit-logs', authMiddleware, auditLogsRoutes);
  router.use('/api/financial-summary', authMiddleware, financialSummaryRoutes);
  router.use('/api/job-profitability', authMiddleware, jobProfitabilityRoutes);

  /**
   * Job Management
   */
  router.use('/api/job-staff-assignments', authMiddleware, jobStaffAssignmentsRoutes);
  router.use('/api/job-workflow', authMiddleware, jobWorkflowRoutes);
  router.use('/api/admin/job-dashboard', authMiddleware, adminJobDashboardRoutes);
  router.use('/api/admin/job-workflow', authMiddleware, adminJobWorkflowRoutes);

  /**
   * Evaluation Workflows
   */
  router.use('/api/evaluation-assignments', authMiddleware, evaluationAssignmentsRoutes);
  router.use('/api/evaluation-cycles', authMiddleware, evaluationCyclesRoutes);
  router.use('/api/evaluation-result-areas', authMiddleware, evaluationResultAreasRoutes);
  router.use('/api/evaluation-templates', authMiddleware, evaluationTemplatesRoutes);
  router.use('/api/employee-evaluations', authMiddleware, employeeEvaluationsRoutes);
  router.use('/api/client-evaluations', authMiddleware, clientEvaluationsRoutes);
  router.use('/api/peer-evaluations', authMiddleware, peerEvaluationsRoutes);
  router.use('/api/upward-evaluations', authMiddleware, upwardEvaluationsRoutes);
  router.use('/api/ad-hoc-evaluations', authMiddleware, adHocEvaluationsRoutes);
  router.use('/api/continuous-feedback', authMiddleware, continuousFeedbackRoutes);
  router.use('/api/create-cycle-evaluations', authMiddleware, createCycleEvaluationsRoutes);

  /**
   * Performance Management
   */
  router.use('/api/performance-reviews', authMiddleware, performanceReviewsRoutes);
  router.use('/api/non-financial-performance', authMiddleware, nonFinancialPerformanceRoutes);
  router.use('/api/development-recommendations', authMiddleware, developmentRecommendationsRoutes);

  /**
   * KPI & Goal Management
   */
  router.use('/api/kpis', authMiddleware, kpisRoutes);
  router.use('/api/employee-goals', authMiddleware, employeeGoalsRoutes);
  router.use('/api/employee-kpi-assignments', authMiddleware, employeeKpiAssignmentsRoutes);

  /**
   * Employee Management
   */
  router.use('/api/employees', authMiddleware, employeesRoutes);
  router.use('/api/profiles', authMiddleware, profilesRoutes);
  router.use('/api/employee-roles', authMiddleware, employeeRolesRoutes);
  router.use('/api/employee-project-allocations', authMiddleware, employeeProjectAllocationsRoutes);
  router.use('/api/subordinates', authMiddleware, subordinatesRoutes);
  router.use('/api/team-management', authMiddleware, teamManagementRoutes);

  /**
   * Client Management
   */
  router.use('/api/clients', authMiddleware, clientsRoutes);

  /**
   * Feedback & Communication
   */
  router.use('/api/feedback', authMiddleware, feedbackRoutes);
  router.use('/api/notifications', authMiddleware, notificationsRoutes);

  /**
   * Dashboard & User Views
   */
  router.use('/api/manager-dashboard', authMiddleware, managerDashboardRoutes);
  router.use('/api/gmp-dashboard', authMiddleware, gmpDashboardRoutes);
  router.use('/api/gmp-auth', gmpAuthRoutes); // Public endpoint for GMP

  /**
   * System Configuration
   */
  router.use('/api/roles', authMiddleware, rolesRoutes);
  router.use('/api/user-roles', authMiddleware, userRolesRoutes);
  router.use('/api/position-rates', authMiddleware, positionRatesRoutes);

  /**
   * Utilities & Other
   */
  router.use('/api/projects', authMiddleware, projectsRoutes);
  router.use('/api/todos', authMiddleware, todosRoutes);
  router.use('/api/work-logs', authMiddleware, workLogsRoutes);

  // ============================================
  // 🏥 HEALTH CHECK ENDPOINT
  // ============================================
  router.get('/api/health', (req, res) => {
    res.json({
      success: true,
      message: 'API is running',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
    });
  });

  // ============================================
  // 404 Handler
  // ============================================
  router.use('/api/*', (req, res) => {
    res.status(404).json({
      success: false,
      message: 'Endpoint not found',
      path: req.path,
    });
  });

  app.use(router);
}

/**
 * ROUTE ORGANIZATION SUMMARY
 * 
 * Total Endpoints: 50+ routes
 * 
 * PHASE 1 (Security):
 * ✅ Notifications, Profiles, Feedback secured
 * 
 * PHASE 2 (TimeEntry - COMPLETE):
 * ✅ 13 TimeEntry endpoints fully implemented
 *    - List, Create, Read, Update, Delete
 *    - Submit, Approve, Reject
 *    - Timer (start/stop)
 *    - Batch operations
 *    - Job summary
 * ✅ Authorization checks (role-based access control)
 * ✅ Budget validation (prevent overage)
 * ✅ Request validation (express-validator)
 * ✅ Error handling (consistent error responses)
 * 
 * PHASE 3 (Next - Complete remaining controllers):
 * ⏳ Job domain
 * ⏳ Evaluation domain (expand)
 * ⏳ Partner domain
 * ⏳ Department domain (polish)
 * 
 * PHASE 4 (Modernize legacy routes):
 * ⏳ profiles.ts (mix of old/new patterns)
 * ⏳ notifications.ts (needs pagination)
 * ⏳ feedback.ts (raw SQL queries)
 * ⏳ kpis.ts (basic implementation)
 * ⏳ roles.ts (minimal implementation)
 * 
 * PHASE 5 (Business logic services):
 * ⏳ Budget validation service
 * ⏳ Revenue allocation service
 * ⏳ KPI calculation service
 * ⏳ Workflow automation service
 */
