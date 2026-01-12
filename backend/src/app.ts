import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import userRolesRoutes from './routes/userRoles';
import auditLogsRoutes from './routes/auditLogs';
import analyticsRoutes from './routes/analytics';
import todosRoutes from './routes/todos';

import profilesRoutes from './routes/profiles';
import upwardEvaluationsRoutes from './routes/upwardEvaluations';
import peerEvaluationsRoutes from './routes/peerEvaluations';
import projectsRoutes from './routes/projects';
import workLogsRoutes from './routes/workLogs';
import employeeGoalsRoutes from './routes/employeeGoals';
import feedbackRoutes from './routes/feedback';
import continuousFeedbackRoutes from './routes/continuousFeedback';
import adHocEvaluationsRoutes from './routes/adHocEvaluations';
import evaluationAssignmentsRoutes from './routes/evaluationAssignments';
import departmentsRoutes from './routes/departments';
import performanceReviewsRoutes from './routes/performanceReviews';
import clientEvaluationsRoutes from './routes/clientEvaluations';
import employeeProjectAllocationsRoutes from './routes/employeeProjectAllocations';
import employeeEvaluationsRoutes from './routes/employeeEvaluations';
import evaluationTeamsRoutes from './routes/evaluationTeams';
import evaluationTeamMembersRoutes from './routes/evaluationTeamMembers';
import clientsRoutes from './routes/clients';
import jobProfitabilityRoutes from './routes/jobProfitability';
import evaluationCyclesRoutes from './routes/evaluationCycles';
import developmentRecommendationsRoutes from './routes/developmentRecommendations';
import kpisRoutes from './routes/kpis';
import notificationsRoutes from './routes/notifications';
import subordinatesRoutes from './routes/subordinates';
import evaluationResultAreasRoutes from './routes/evaluationResultAreas';
import employeeKpiAssignmentsRoutes from './routes/employeeKpiAssignments';
import partnerRoutes from './routes/partner';
import timeEntriesRoutes from './routes/timeEntries';
import rolesRoutes from './routes/roles';
import employeeRolesRoutes from './routes/employeeRoles';
import jobStaffAssignmentsRoutes from './routes/jobStaffAssignments';
import managerDashboardRoutes from './routes/managerDashboard';
import gmpDashboardRoutes from './routes/gmpDashboard';
import nonFinancialPerformanceRoutes from './routes/nonFinancialPerformance';
import gmpAuthRoutes from './routes/gmp-auth';
import jobWorkflowRoutes from './routes/jobWorkflow';
import employeesRoutes from './routes/employees';
// Enhanced job tracking routes
import positionRatesRoutes from './routes/positionRates';
import financialSummaryRoutes from './routes/financialSummary';
import teamManagementRoutes from './routes/teamManagement';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (_req, res) => res.json({ ok: true, message: 'Backend running' }));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/auth', authRoutes);
app.use('/user_roles', userRolesRoutes);
app.use('/audit_logs', auditLogsRoutes);
app.use('/analytics', analyticsRoutes);
app.use('/todos', todosRoutes);

app.use('/profiles', profilesRoutes);
app.use('/upward_evaluations', upwardEvaluationsRoutes);
app.use('/peer_evaluations', peerEvaluationsRoutes);
app.use('/projects', projectsRoutes);
app.use('/work_logs', workLogsRoutes);
app.use('/employee_goals', employeeGoalsRoutes);
app.use('/feedback', feedbackRoutes);
app.use('/continuous_feedback', continuousFeedbackRoutes);
app.use('/ad_hoc_evaluations', adHocEvaluationsRoutes);
app.use('/evaluation_assignments', evaluationAssignmentsRoutes);

app.use('/departments', departmentsRoutes);
app.use('/performance_reviews', performanceReviewsRoutes);
app.use('/client_evaluations', clientEvaluationsRoutes);
app.use('/employee_project_allocations', employeeProjectAllocationsRoutes);
app.use('/employee_evaluations', employeeEvaluationsRoutes);
app.use('/evaluation_teams', evaluationTeamsRoutes);
app.use('/evaluation_team_members', evaluationTeamMembersRoutes);
app.use('/clients', clientsRoutes);
app.use('/job_profitability', jobProfitabilityRoutes);
app.use('/evaluation_result_areas', evaluationResultAreasRoutes);
app.use('/employee_kpi_assignments', employeeKpiAssignmentsRoutes);
app.use('/evaluation_cycles', evaluationCyclesRoutes);
app.use('/development_recommendations', developmentRecommendationsRoutes);
app.use('/kpis', kpisRoutes);
app.use('/notifications', notificationsRoutes);
app.use('/subordinates', subordinatesRoutes);
app.use('/time_entries', timeEntriesRoutes);
app.use('/roles', rolesRoutes);
app.use('/employee_roles', employeeRolesRoutes);
app.use('/jobs', jobStaffAssignmentsRoutes);
app.use('/partner', partnerRoutes);
app.use('/manager-dashboard', managerDashboardRoutes);
app.use('/gmp-dashboard', gmpDashboardRoutes);
app.use('/gmp-auth', gmpAuthRoutes);
app.use('/job-workflow', jobWorkflowRoutes);
app.use('/employees', employeesRoutes);
app.use('/non-financial-performance', nonFinancialPerformanceRoutes);

// Enhanced job tracking routes
app.use('/position-rates', positionRatesRoutes);
app.use('/financial-summary', financialSummaryRoutes);
app.use('/api/manager', teamManagementRoutes);

export default app;
