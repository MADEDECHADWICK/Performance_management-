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
import employeeOffboardingRoutes from './employeeOffboardingCase.routes';
import evaluationRoutes from './evaluations.routes';
import inductionChecklistRoutes from './inductionChecklist.routes';
import partnerRoutes from './partners.routes';
import jobsRoutes from './jobs.routes';
import timeEntriesRoutes from './time-entries.routes';

// Legacy/Additional routes
import analyticRoutes from './analytics';
import auditLogsRoutes from './auditLogs';
import clientsRoutes from './clients';
import clientOnboardingsRoutes from './clientOnboardings';
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
import evaluationDefinitionsRoutes from './evaluationDefinitions';
import feedbackRoutes from './feedback';
import financialSummaryRoutes from './financialSummary';
import financeDashboardRoutes from './financeDashboard';
import gmpAuthRoutes from './gmp-auth';
import gmpDashboardRoutes from './gmpDashboard';
import hrDashboardRoutes from './hrDashboard';
import jobProfitabilityRoutes from './jobProfitability';
import kpisRoutes from './kpis';
import okrRoutes from './okrs';
import managerDashboardRoutes from './managerDashboard';
import nonFinancialPerformanceRoutes from './nonFinancialPerformance';
import notificationsRoutes from './notifications';
import notificationTemplatesRoutes from './notificationTemplates';
import peerEvaluationsRoutes from './peerEvaluations';
import performanceReviewsRoutes from './performanceReviews';
import positionRatesRoutes from './positionRates';
import profilesRoutes from './profiles';
import proposalsRoutes from './proposals';
import projectsRoutes from './projects';
import rolesRoutes from './roles';
import subordinatesRoutes from './subordinates';
import engagementLettersRoutes from './engagementLetters';
import performanceScoresRoutes from './performanceScores';
import projectEvaluationsRoutes from './projectEvaluations';
import calibrationRoutes from './calibration';
import surveysRoutes from './surveys';
import teamManagementRoutes from './teamManagement';
import todosRoutes from './todos';
import upwardEvaluationsRoutes from './upwardEvaluations';
import userRolesRoutes from './userRoles';
import workLogsRoutes from './workLogs';
import adHocEvaluationsRoutes from './adHocEvaluations';
import recruitmentCandidatesRoutes from './recruitmentCandidates.routes';

const router = Router();

// ============================================
// 🔐 PHASE 1 & 2: CORE DOMAINS (NEW & SECURE)
// ============================================

/**
 * Auth Routes (no auth required)
 * Handles: login, signup, refresh token, logout
 */
router.use('/auth', authRoutes);

/**
 * Core CRUD Domains (all require authentication)
 */
router.use('/departments', authMiddleware, departmentRoutes);
router.use('/documents', authMiddleware, documentsRoutes);
router.use('/onboarding', authMiddleware, employeeOnboardingRoutes);
router.use('/offboarding', authMiddleware, employeeOffboardingRoutes);
router.use('/evaluations', authMiddleware, evaluationRoutes);
router.use('/induction-checklist', authMiddleware, inductionChecklistRoutes);
router.use('/partners', authMiddleware, partnerRoutes);
router.use('/jobs', authMiddleware, jobsRoutes);

/**
 * ⏱️  TIME ENTRIES - PHASE 2 COMPLETE
 */
router.use('/time-entries', authMiddleware, timeEntriesRoutes);

// ============================================
// 📊 SECONDARY DOMAINS (Dashboard & Workflows)
// ============================================

router.use('/analytics', authMiddleware, analyticRoutes);
router.use('/audit-logs', authMiddleware, auditLogsRoutes);
router.use('/financial-summary', authMiddleware, financialSummaryRoutes);
router.use('/finance-dashboard', authMiddleware, financeDashboardRoutes);
router.use('/job-profitability', authMiddleware, jobProfitabilityRoutes);
router.use('/evaluation-assignments', authMiddleware, evaluationAssignmentsRoutes);
router.use('/evaluation-cycles', authMiddleware, evaluationCyclesRoutes);
router.use('/evaluation-result-areas', authMiddleware, evaluationResultAreasRoutes);
router.use('/evaluation-templates', authMiddleware, evaluationTemplatesRoutes);
// Backward-compat alias used by older frontend paths
router.use('/evaluation_templates', authMiddleware, evaluationTemplatesRoutes);
router.use('/evaluation-definitions', authMiddleware, evaluationDefinitionsRoutes);
router.use('/employee-evaluations', authMiddleware, employeeEvaluationsRoutes);
router.use('/client-evaluations', authMiddleware, clientEvaluationsRoutes);
router.use('/peer-evaluations', authMiddleware, peerEvaluationsRoutes);
router.use('/upward-evaluations', authMiddleware, upwardEvaluationsRoutes);
router.use('/ad-hoc-evaluations', authMiddleware, adHocEvaluationsRoutes);
router.use('/continuous-feedback', authMiddleware, continuousFeedbackRoutes);
router.use('/create-cycle-evaluations', authMiddleware, createCycleEvaluationsRoutes);
router.use('/performance-reviews', authMiddleware, performanceReviewsRoutes);
router.use('/non-financial-performance', authMiddleware, nonFinancialPerformanceRoutes);
router.use('/development-recommendations', authMiddleware, developmentRecommendationsRoutes);
router.use('/kpis', authMiddleware, kpisRoutes);
router.use('/okrs', authMiddleware, okrRoutes);
router.use('/employee-goals', authMiddleware, employeeGoalsRoutes);
router.use('/employee-kpi-assignments', authMiddleware, employeeKpiAssignmentsRoutes);
router.use('/employees', authMiddleware, employeesRoutes);
router.use('/profiles', authMiddleware, profilesRoutes);
router.use('/employee-roles', authMiddleware, employeeRolesRoutes);
router.use('/employee-project-allocations', authMiddleware, employeeProjectAllocationsRoutes);
router.use('/subordinates', authMiddleware, subordinatesRoutes);
router.use('/team-management', authMiddleware, teamManagementRoutes);
// Backward-compatible alias for manager workload endpoints
router.use('/manager', authMiddleware, teamManagementRoutes);
router.use('/clients', authMiddleware, clientsRoutes);
router.use('/engagement-letters', authMiddleware, engagementLettersRoutes);
router.use('/client-onboardings', authMiddleware, clientOnboardingsRoutes);
router.use('/performance-scores', authMiddleware, performanceScoresRoutes);
router.use('/project-evaluations', authMiddleware, projectEvaluationsRoutes);
router.use('/calibration', authMiddleware, calibrationRoutes);
router.use('/proposals', authMiddleware, proposalsRoutes);
router.use('/surveys', surveysRoutes);
router.use('/feedback', authMiddleware, feedbackRoutes);
router.use('/notifications', authMiddleware, notificationsRoutes);
router.use('/notification-templates', authMiddleware, notificationTemplatesRoutes);
router.use('/manager-dashboard', authMiddleware, managerDashboardRoutes);
router.use('/gmp-dashboard', authMiddleware, gmpDashboardRoutes);
router.use('/hr-dashboard', authMiddleware, hrDashboardRoutes);
router.use('/gmp-auth', gmpAuthRoutes);
router.use('/roles', authMiddleware, rolesRoutes);
router.use('/user-roles', authMiddleware, userRolesRoutes);
router.use('/position-rates', authMiddleware, positionRatesRoutes);
router.use('/projects', authMiddleware, projectsRoutes);
router.use('/todos', authMiddleware, todosRoutes);
router.use('/work-logs', authMiddleware, workLogsRoutes);
router.use('/recruitment-candidates', authMiddleware, recruitmentCandidatesRoutes);

// Health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

export default router;
