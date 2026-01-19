/**
 * Main API routes index
 * Consolidates all route imports and groups them by domain
 * 
 * Usage in app.ts:
 * import routes from './routes';
 * app.use('/api', routes);
 */

import { Router } from "express";

// Auth routes
import authRoutes from "./auth";

// Core domain routes (v2.1)
import jobsRoutes from "./jobs.routes";
import timeEntriesRoutes from "./time-entries.routes";
import evaluationsRoutes from "./evaluations.routes";
import documentsRoutes from "./documents.routes";
import partnersRoutes from "./partners.routes";
import departmentsRoutes from "./departments.routes";
import clientsRoutes from "./clients";
import kpisRoutes from "./kpis";

// Legacy routes (to be deprecated/refactored)
import userRolesRoutes from "./userRoles";
import auditLogsRoutes from "./auditLogs";
import analyticsRoutes from "./analytics";
import todosRoutes from "./todos";
import profilesRoutes from "./profiles";
import upwardEvaluationsRoutes from "./upwardEvaluations";
import peerEvaluationsRoutes from "./peerEvaluations";
import projectsRoutes from "./projects";
import workLogsRoutes from "./workLogs";
import employeeGoalsRoutes from "./employeeGoals";
import feedbackRoutes from "./feedback";
import continuousFeedbackRoutes from "./continuousFeedback";
import adHocEvaluationsRoutes from "./adHocEvaluations";
import performanceReviewsRoutes from "./performanceReviews";
import clientEvaluationsRoutes from "./clientEvaluations";
import employeeProjectAllocationsRoutes from "./employeeProjectAllocations";
import employeeEvaluationsRoutes from "./employeeEvaluations";
import evaluationTeamsRoutes from "./evaluationTeams";
import evaluationTeamMembersRoutes from "./evaluationTeamMembers";
import jobProfitabilityRoutes from "./jobProfitability";
import evaluationCyclesRoutes from "./evaluationCycles";
import evaluationTemplatesRoutes from "./evaluationTemplates";
import createCycleEvaluationsRoutes from "./createCycleEvaluations";
import developmentRecommendationsRoutes from "./developmentRecommendations";
import notificationsRoutes from "./notifications";
import subordinatesRoutes from "./subordinates";
import evaluationResultAreasRoutes from "./evaluationResultAreas";
import employeeKpiAssignmentsRoutes from "./employeeKpiAssignments";
import rolesRoutes from "./roles";
import employeeRolesRoutes from "./employeeRoles";
import jobStaffAssignmentsRoutes from "./jobStaffAssignments";
import managerDashboardRoutes from "./managerDashboard";
import gmpDashboardRoutes from "./gmpDashboard";
import nonFinancialPerformanceRoutes from "./nonFinancialPerformance";
import gmpAuthRoutes from "./gmp-auth";
import jobWorkflowRoutes from "./jobWorkflow";
import employeesRoutes from "./employees";
import positionRatesRoutes from "./positionRates";
import financialSummaryRoutes from "./financialSummary";
import teamManagementRoutes from "./teamManagement";

const router = Router();

/**
 * ==========================================
 * CORE DOMAIN ROUTES (v2.1 - Primary API)
 * ==========================================
 */

// Authentication (no middleware needed - handled internally)
router.use("/auth", authRoutes);

// Jobs - core business domain
router.use("/jobs", jobsRoutes);

// Time entries - core business domain
router.use("/time-entries", timeEntriesRoutes);

// Evaluations - performance domain
router.use("/evaluations", evaluationsRoutes);
router.use("/evaluation-cycles", evaluationCyclesRoutes);

// Documents & Onboarding - HR domain
router.use("/documents", documentsRoutes);

// Partners - business domain
router.use("/partners", partnersRoutes);

// Departments - org structure
router.use("/departments", departmentsRoutes);

// Clients - business domain
router.use("/clients", clientsRoutes);

// KPIs - performance domain
router.use("/kpis", kpisRoutes);

/**
 * ==========================================
 * LEGACY ROUTES (to be refactored/removed)
 * ==========================================
 */

router.use("/user_roles", userRolesRoutes);
router.use("/audit_logs", auditLogsRoutes);
router.use("/analytics", analyticsRoutes);
router.use("/todos", todosRoutes);
router.use("/profiles", profilesRoutes);
router.use("/upward_evaluations", upwardEvaluationsRoutes);
router.use("/peer_evaluations", peerEvaluationsRoutes);
router.use("/projects", projectsRoutes);
router.use("/work_logs", workLogsRoutes);
router.use("/employee_goals", employeeGoalsRoutes);
router.use("/feedback", feedbackRoutes);
router.use("/continuous_feedback", continuousFeedbackRoutes);
router.use("/ad_hoc_evaluations", adHocEvaluationsRoutes);
router.use("/performance_reviews", performanceReviewsRoutes);
router.use("/client_evaluations", clientEvaluationsRoutes);
router.use("/employee_project_allocations", employeeProjectAllocationsRoutes);
router.use("/employee_evaluations", employeeEvaluationsRoutes);
router.use("/evaluation_teams", evaluationTeamsRoutes);
router.use("/evaluation_team_members", evaluationTeamMembersRoutes);
router.use("/job_profitability", jobProfitabilityRoutes);
router.use("/evaluation_result_areas", evaluationResultAreasRoutes);
router.use("/employee_kpi_assignments", employeeKpiAssignmentsRoutes);
router.use("/evaluation_templates", evaluationTemplatesRoutes);
router.use("/create-cycle-evaluations", createCycleEvaluationsRoutes);
router.use("/development_recommendations", developmentRecommendationsRoutes);
router.use("/notifications", notificationsRoutes);
router.use("/subordinates", subordinatesRoutes);
router.use("/roles", rolesRoutes);
router.use("/employee_roles", employeeRolesRoutes);
router.use("/jobs-staff", jobStaffAssignmentsRoutes);
router.use("/manager-dashboard", managerDashboardRoutes);
router.use("/gmp-dashboard", gmpDashboardRoutes);
router.use("/gmp-auth", gmpAuthRoutes);
router.use("/job-workflow", jobWorkflowRoutes);
router.use("/employees", employeesRoutes);
router.use("/non-financial-performance", nonFinancialPerformanceRoutes);
router.use("/position-rates", positionRatesRoutes);
router.use("/financial-summary", financialSummaryRoutes);
router.use("/manager", teamManagementRoutes);

export default router;
