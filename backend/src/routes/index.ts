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
import { requireAnyModuleAccess, requireModuleAccess } from '../middleware/requireModuleAccess';

// Import all route modules
import authRoutes from './auth';
import departmentRoutes from './departments.routes';
import documentsRoutes from './documents.routes';
import employeeOnboardingRoutes from './employeeOnboardingCase.routes';
import employeeOffboardingRoutes from './employeeOffboardingCase.routes';
import onboardingPoliciesRoutes from './onboardingPolicies.routes';
import evaluationRoutes from './evaluations.routes';
import inductionChecklistRoutes from './inductionChecklist.routes';
import partnerRoutes from './partners.routes';
import jobsRoutes from './jobs.routes';
import leaveRoutes from './leave.routes';
import requisitionRoutes from './requisition.routes';
import timeEntriesRoutes from './time-entries.routes';

// Additional routes
import analyticRoutes from './analytics';
import auditLogsRoutes from './auditLogs';
import clientsRoutes from './clients';
import clientOnboardingsRoutes from './clientOnboardings';
import certificatesRoutes from './certificates';
import clientEvaluationsRoutes from './clientEvaluations';
import continuousFeedbackRoutes from './continuousFeedback';
import developmentRecommendationsRoutes from './developmentRecommendations';
import employeeProjectAllocationsRoutes from './employeeProjectAllocations';
import employeeRolesRoutes from './employeeRoles';
import employeesRoutes from './employees';
import evaluationAssignmentsRoutes from './evaluationAssignments';
import evaluationCyclesRoutes from './evaluationCycles';
import evaluationTemplatesRoutes from './evaluationTemplates';
import feedbackRoutes from './feedback';
import checkInRoutes from './checkins';
import financialSummaryRoutes from './financialSummary';
import financeDashboardRoutes from './financeDashboard';
import gmpDashboardRoutes from './gmpDashboard';
import hrDashboardRoutes from './hrDashboard';
import jobProfitabilityRoutes from './jobProfitability';
import managerDashboardRoutes from './managerDashboard';
import nonFinancialPerformanceRoutes from './nonFinancialPerformance';
import notificationsRoutes from './notifications';
import notificationTemplatesRoutes from './notificationTemplates';
import observabilityRoutes from './observability.routes';
import performanceReviewsRoutes from './performanceReviews';
import positionRatesRoutes from './positionRates';
import profilesRoutes from './profiles';
import proposalsRoutes from './proposals';
import projectsRoutes from './projects';
import rolesRoutes from './roles';
import subordinatesRoutes from './subordinates';
import engagementLettersRoutes from './engagementLetters';
import performanceScoresRoutes from './performanceScores';
import performanceFrameworkRoutes from './performanceFramework';
import projectEvaluationsRoutes from './projectEvaluations';
import calibrationRoutes from './calibration';
import surveysRoutes from './surveys';
import teamManagementRoutes from './teamManagement';
import todosRoutes from './todos';
import userRolesRoutes from './userRoles';
import recruitmentCandidatesRoutes from './recruitmentCandidates.routes';
import moduleAccessRoutes from './moduleAccess';
import knowledgeHubRoutes from './knowledgeHub';
import reportingRoutes from './reporting';

const router = Router();

// ============================================
// 🔐 PHASE 1 & 2: CORE DOMAINS (NEW & SECURE)
// ============================================

/**
 * Auth Routes (no auth required)
 * Handles: login, signup, refresh token, logout
 */
router.use('/auth', authRoutes);
router.use('/certificates', certificatesRoutes);

/**
 * Core CRUD Domains (all require authentication)
 */
router.use(
  '/departments',
  authMiddleware,
  requireAnyModuleAccess([
    { moduleKey: 'users', action: 'read' },
    { moduleKey: 'dashboard', action: 'read' },
  ]),
  departmentRoutes
);
router.use('/documents', authMiddleware, requireModuleAccess('documents'), documentsRoutes);
router.use(
  '/knowledge-hub',
  authMiddleware,
  requireModuleAccess('knowledge_hub', 'read'),
  knowledgeHubRoutes
);
router.use('/onboarding', authMiddleware, requireModuleAccess('users', 'read'), employeeOnboardingRoutes);
router.use('/onboarding-policies', authMiddleware, onboardingPoliciesRoutes);
router.use('/offboarding', authMiddleware, requireModuleAccess('users'), employeeOffboardingRoutes);
router.use('/evaluations', authMiddleware, requireModuleAccess('evaluations'), evaluationRoutes);
router.use('/induction-checklist', authMiddleware, requireModuleAccess('users', 'read'), inductionChecklistRoutes);
router.use(
  '/partners',
  authMiddleware,
  requireAnyModuleAccess([
    { moduleKey: 'users', action: 'read' },
    { moduleKey: 'dashboard', action: 'read' },
  ]),
  partnerRoutes
);
router.use('/jobs', authMiddleware, requireModuleAccess('jobs'), jobsRoutes);
router.use('/leave', authMiddleware, requireModuleAccess('leave'), leaveRoutes);
router.use('/requisitions', authMiddleware, requireModuleAccess('requisitions'), requisitionRoutes);

/**
 * ⏱️  TIME ENTRIES - PHASE 2 COMPLETE
 */
router.use('/time-entries', authMiddleware, requireModuleAccess('time_entries'), timeEntriesRoutes);

// ============================================
// 📊 SECONDARY DOMAINS (Dashboard & Workflows)
// ============================================

router.use('/analytics', authMiddleware, requireModuleAccess('reports'), analyticRoutes);
router.use('/reporting', authMiddleware, requireModuleAccess('reports', 'read'), reportingRoutes);
router.use('/audit-logs', authMiddleware, requireModuleAccess('reports'), auditLogsRoutes);
router.use('/financial-summary', financialSummaryRoutes);
router.use('/finance-dashboard', authMiddleware, financeDashboardRoutes);
router.use('/job-profitability', authMiddleware, requireModuleAccess('finance'), jobProfitabilityRoutes);
router.use('/evaluation-assignments', authMiddleware, requireModuleAccess('evaluations'), evaluationAssignmentsRoutes);
router.use('/evaluation-cycles', authMiddleware, requireModuleAccess('evaluations'), evaluationCyclesRoutes);
router.use('/evaluation-templates', authMiddleware, requireModuleAccess('evaluations'), evaluationTemplatesRoutes);
router.use('/client-evaluations', authMiddleware, requireModuleAccess('evaluations'), clientEvaluationsRoutes);
router.use('/continuous-feedback', authMiddleware, requireModuleAccess('evaluations'), continuousFeedbackRoutes);
router.use('/performance-reviews', authMiddleware, requireModuleAccess('evaluations'), performanceReviewsRoutes);
router.use('/non-financial-performance', authMiddleware, requireModuleAccess('evaluations'), nonFinancialPerformanceRoutes);
router.use('/development-recommendations', authMiddleware, requireModuleAccess('evaluations'), developmentRecommendationsRoutes);
router.use('/employees', authMiddleware, requireModuleAccess('users'), employeesRoutes);
router.use('/profiles', authMiddleware, requireModuleAccess('users', 'read'), profilesRoutes);
router.use('/employee-roles', authMiddleware, requireModuleAccess('users'), employeeRolesRoutes);
router.use('/employee-project-allocations', authMiddleware, requireModuleAccess('users'), employeeProjectAllocationsRoutes);
router.use('/subordinates', authMiddleware, requireModuleAccess('users'), subordinatesRoutes);
router.use(
  '/team-management',
  authMiddleware,
  requireModuleAccess('jobs', 'read'),
  teamManagementRoutes
);
router.use('/clients', authMiddleware, requireModuleAccess('clients'), clientsRoutes);
router.use('/engagement-letters', authMiddleware, requireModuleAccess('clients'), engagementLettersRoutes);
router.use('/client-onboardings', authMiddleware, requireModuleAccess('clients'), clientOnboardingsRoutes);
router.use('/performance-scores', authMiddleware, requireModuleAccess('reports'), performanceScoresRoutes);
router.use('/performance-framework', authMiddleware, requireModuleAccess('dashboard'), performanceFrameworkRoutes);
router.use('/project-evaluations', authMiddleware, requireModuleAccess('evaluations'), projectEvaluationsRoutes);
router.use('/calibration', authMiddleware, requireModuleAccess('evaluations'), calibrationRoutes);
router.use('/proposals', authMiddleware, requireModuleAccess('proposals'), proposalsRoutes);
router.use('/surveys', surveysRoutes);
router.use('/feedback', authMiddleware, requireModuleAccess('evaluations'), feedbackRoutes);
router.use('/checkins', authMiddleware, requireModuleAccess('evaluations'), checkInRoutes);
router.use('/notifications', authMiddleware, requireModuleAccess('notifications', 'read'), notificationsRoutes);
router.use(
  '/ops',
  authMiddleware,
  requireAnyModuleAccess([
    { moduleKey: 'dashboard', action: 'read' },
    { moduleKey: 'reports', action: 'read' },
    { moduleKey: 'notifications', action: 'read' },
  ]),
  observabilityRoutes
);
router.use('/notification-templates', authMiddleware, requireModuleAccess('notifications'), notificationTemplatesRoutes);
router.use('/manager-dashboard', authMiddleware, requireModuleAccess('dashboard'), managerDashboardRoutes);
router.use('/gmp-dashboard', authMiddleware, requireModuleAccess('dashboard'), gmpDashboardRoutes);
router.use('/hr-dashboard', authMiddleware, requireModuleAccess('dashboard'), hrDashboardRoutes);
router.use('/roles', authMiddleware, requireModuleAccess('users'), rolesRoutes);
router.use('/user-roles', authMiddleware, requireModuleAccess('users'), userRolesRoutes);
router.use('/position-rates', authMiddleware, requireModuleAccess('users'), positionRatesRoutes);
router.use('/projects', authMiddleware, requireModuleAccess('jobs'), projectsRoutes);
router.use('/todos', authMiddleware, requireModuleAccess('dashboard', 'read'), todosRoutes);
router.use('/recruitment-candidates', authMiddleware, requireModuleAccess('users'), recruitmentCandidatesRoutes);
router.use('/module-access', authMiddleware, requireModuleAccess('access_control'), moduleAccessRoutes);

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
