import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import AppRouteGuard from "@/components/auth/AppRouteGuard";
import PageLoader from "@/components/ui/page-loader";

// Core pages
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
const SetPassword = lazy(() => import("./pages/SetPassword"));

// Dashboards
const Dashboard = lazy(() => import("./pages/Dashboard"));
const HRDashboard = lazy(() => import("./pages/HRDashboard"));
const PartnerDashboard = lazy(() => import("./pages/PartnerDashboard"));
const ManagerDashboard = lazy(() => import("./pages/ManagerDashboard"));
const GMPDashboard = lazy(() => import("./pages/GMPDashboard"));
const DepartmentDashboard = lazy(() => import("./pages/DepartmentDashboard"));

// Client Management
const ClientsListPage = lazy(() => import("./pages/clients/ClientsListPage"));
const ClientDetailPage = lazy(() => import("./pages/clients/ClientDetailPage"));
const ClientFormPage = lazy(() => import("./pages/clients/ClientFormPage"));

// Job Management
const AdminJobCreation = lazy(() => import("./pages/AdminJobCreation"));
const JobWorkflowDashboard = lazy(() => import("./pages/JobWorkflowDashboard"));

// Time Management
const TimesheetsNew = lazy(() => import("./pages/TimesheetsNew"));

// Employee & Profile
const EmployeeProfile = lazy(() => import("./pages/EmployeeProfile"));
const EmployeeManagement = lazy(() => import("./pages/EmployeeManagement"));

// Evaluations
const Evaluations = lazy(() => import("./pages/Evaluations"));
const EvaluationManagement = lazy(() => import("./pages/EvaluationManagement"));
const CreateEvaluation = lazy(() => import("./pages/CreateEvaluation"));
const CompleteEvaluation = lazy(() => import("./pages/CompleteEvaluation"));
const ManagerEvaluationPage = lazy(() => import("./pages/ManagerEvaluation"));
const UpwardReviews = lazy(() => import("./pages/UpwardReviews"));
const ClientEvaluation = lazy(() => import("./pages/ClientEvaluation"));
const ProjectEvaluations = lazy(() => import("./pages/ProjectEvaluations"));

// KPIs & Goals
const KPIManagement = lazy(() => import("./pages/KPICascadeV2Management"));
const Goals = lazy(() => import("./pages/Goals"));
const Scorecard = lazy(() => import("./pages/Scorecard"));

// Feedback
const Feedback = lazy(() => import("./pages/Feedback"));
const ContinuousFeedback = lazy(() => import("./pages/ContinuousFeedback"));

// Analytics & Reports
const Reports = lazy(() => import("./pages/Reports"));
const NonFinancialAnalytics = lazy(() => import("./pages/NonFinancialAnalytics"));
const ModuleAnalytics = lazy(() => import("./pages/ModuleAnalytics"));
const FinancialSummary = lazy(() => import("./pages/FinancialSummary"));
const FinanceDashboard = lazy(() => import("./pages/FinanceDashboard"));
const FinanceCollections = lazy(() => import("./pages/FinanceCollections"));
const FinanceProjections = lazy(() => import("./pages/FinanceProjections"));
const FinanceBalances = lazy(() => import("./pages/FinanceBalances"));
const FinanceProfitability = lazy(() => import("./pages/FinanceProfitability"));
const FinanceAllocations = lazy(() => import("./pages/FinanceAllocations"));
const AuditLogs = lazy(() => import("./pages/AuditLogs"));
const Notifications = lazy(() => import("./pages/Notifications"));

// Team & Development
const TeamPerformance = lazy(() => import("./pages/TeamPerformance"));
const TeamOverview = lazy(() => import("./pages/TeamOverview"));
const StaffDevelopment = lazy(() => import("./pages/StaffDevelopment"));
const DevelopmentPlan = lazy(() => import("./pages/DevelopmentPlan"));

// Partner & Manager Features
const WorkloadManagement = lazy(() => import("./pages/WorkloadManagement"));
const ClientPortfolio = lazy(() => import("./pages/ClientPortfolio"));
const BusinessDevelopment = lazy(() => import("./pages/BusinessDevelopment"));
const PartnerMetrics = lazy(() => import("./pages/PartnerMetrics"));
const MarketingDashboard = lazy(() => import("./pages/MarketingDashboard"));
const EngagementLetters = lazy(() => import("./pages/EngagementLetters"));
const ClientOnboardingQueue = lazy(() => import("./pages/ClientOnboardingQueue"));
const PartnerPortfolioSummary = lazy(() => import("./pages/PartnerPortfolioSummary"));
const Calibration = lazy(() => import("./pages/Calibration"));

// Document & Surveys
const DocumentManagement = lazy(() => import("./pages/DocumentManagement"));
const KnowledgeHub = lazy(() => import("./pages/KnowledgeHub"));
const ClientSurveys = lazy(() => import("./pages/ClientSurveys"));

// Other
const Todos = lazy(() => import("./pages/Todos"));
const RoleManagement = lazy(() => import("./pages/RoleManagement"));
const PositionsRates = lazy(() => import("./pages/PositionsRates"));
const RecruitmentCandidates = lazy(() => import("./pages/RecruitmentCandidates"));

const queryClient = new QueryClient();

const RouteFallback = () => (
  <div className="p-4 sm:p-6">
    <PageLoader message="Loading page..." minHeightClassName="min-h-[50vh]" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/set-password" element={<SetPassword />} />
              
              {/* Dashboards */}
              <Route path="/dashboard" element={<AppRouteGuard><Dashboard /></AppRouteGuard>} />
              <Route
                path="/hr-dashboard"
                element={
                  <AppRouteGuard>
                    <HRDashboard />
                  </AppRouteGuard>
                }
              />
              <Route
                path="/partner-dashboard"
                element={
                  <AppRouteGuard>
                    <PartnerDashboard />
                  </AppRouteGuard>
                }
              />
              <Route
                path="/manager-dashboard"
                element={
                  <AppRouteGuard>
                    <ManagerDashboard />
                  </AppRouteGuard>
                }
              />
              <Route
                path="/gmp-dashboard"
                element={
                  <AppRouteGuard>
                    <GMPDashboard />
                  </AppRouteGuard>
                }
              />
              <Route
                path="/department-dashboard"
                element={
                  <AppRouteGuard>
                    <DepartmentDashboard />
                  </AppRouteGuard>
                }
              />
              
              {/* Client Management */}
              <Route
                path="/clients"
                element={
                  <AppRouteGuard>
                    <ClientsListPage />
                  </AppRouteGuard>
                }
              />
              <Route
                path="/clients/new"
                element={
                  <AppRouteGuard>
                    <ClientFormPage />
                  </AppRouteGuard>
                }
              />
              <Route
                path="/clients/:id"
                element={
                  <AppRouteGuard>
                    <ClientDetailPage />
                  </AppRouteGuard>
                }
              />
              <Route
                path="/clients/:id/edit"
                element={
                  <AppRouteGuard>
                    <ClientFormPage />
                  </AppRouteGuard>
                }
              />
              <Route
                path="/client-portfolio"
                element={
                  <AppRouteGuard>
                    <ClientPortfolio />
                  </AppRouteGuard>
                }
              />
              <Route
                path="/marketing-dashboard"
                element={
                  <AppRouteGuard>
                    <MarketingDashboard />
                  </AppRouteGuard>
                }
              />
              <Route
                path="/engagement-letters"
                element={
                  <AppRouteGuard>
                    <EngagementLetters />
                  </AppRouteGuard>
                }
              />
              <Route
                path="/client-onboarding-queue"
                element={
                  <AppRouteGuard>
                    <ClientOnboardingQueue />
                  </AppRouteGuard>
                }
              />
              
              {/* Job Management */}
              <Route
                path="/jobs"
                element={
                  <AppRouteGuard>
                    <JobWorkflowDashboard />
                  </AppRouteGuard>
                }
              />
              <Route
                path="/jobs/create"
                element={
                  <AppRouteGuard>
                    <AdminJobCreation />
                  </AppRouteGuard>
                }
              />
              <Route
                path="/admin-job-creation"
                element={
                  <AppRouteGuard>
                    <AdminJobCreation />
                  </AppRouteGuard>
                }
              />
              <Route
                path="/job-workflow-dashboard"
                element={
                  <AppRouteGuard>
                    <JobWorkflowDashboard />
                  </AppRouteGuard>
                }
              />
              
              {/* Time Management */}
              <Route path="/timesheets" element={<AppRouteGuard><TimesheetsNew /></AppRouteGuard>} />
              
              {/* Employee & Profile */}
              <Route path="/profile" element={<AppRouteGuard><EmployeeProfile /></AppRouteGuard>} />
              <Route
                path="/employee-management"
                element={
                  <AppRouteGuard>
                    <EmployeeManagement />
                  </AppRouteGuard>
                }
              />
              <Route
                path="/role-management"
                element={
                  <AppRouteGuard>
                    <RoleManagement />
                  </AppRouteGuard>
                }
              />
              <Route
                path="/positions-rates"
                element={
                  <AppRouteGuard>
                    <PositionsRates />
                  </AppRouteGuard>
                }
              />
              <Route
                path="/calibration"
                element={
                  <AppRouteGuard>
                    <Calibration />
                  </AppRouteGuard>
                }
              />
              <Route
                path="/recruitment-candidates"
                element={
                  <AppRouteGuard>
                    <RecruitmentCandidates />
                  </AppRouteGuard>
                }
              />
              
              {/* Evaluations */}
              <Route path="/evaluations" element={<AppRouteGuard><Evaluations /></AppRouteGuard>} />
              {/* Legacy evaluation route aliases */}
              <Route
                path="/my-evaluations"
                element={
                  <AppRouteGuard>
                    <Navigate to="/evaluations" replace />
                  </AppRouteGuard>
                }
              />
              <Route
                path="/self-evaluation"
                element={
                  <AppRouteGuard>
                    <Navigate to="/evaluations?tab=performance" replace />
                  </AppRouteGuard>
                }
              />
              <Route
                path="/peer-reviews"
                element={
                  <AppRouteGuard>
                    <Navigate to="/evaluations?tab=performance" replace />
                  </AppRouteGuard>
                }
              />
              <Route
                path="/evaluation-management"
                element={
                  <AppRouteGuard>
                    <EvaluationManagement />
                  </AppRouteGuard>
                }
              />
              <Route
                path="/create-evaluation"
                element={
                  <AppRouteGuard>
                    <CreateEvaluation />
                  </AppRouteGuard>
                }
              />
              <Route path="/evaluation/:assignmentId" element={<AppRouteGuard><CompleteEvaluation /></AppRouteGuard>} />
              <Route path="/complete-evaluation/:assignmentId" element={<AppRouteGuard><CompleteEvaluation /></AppRouteGuard>} />
              <Route
                path="/manager-evaluation"
                element={
                  <AppRouteGuard>
                    <ManagerEvaluationPage />
                  </AppRouteGuard>
                }
              />
              <Route
                path="/project-evaluations"
                element={
                  <AppRouteGuard>
                    <ProjectEvaluations />
                  </AppRouteGuard>
                }
              />
              <Route path="/upward-reviews" element={<AppRouteGuard><UpwardReviews /></AppRouteGuard>} />
              <Route path="/client-evaluation/:token" element={<ClientEvaluation />} />
              
              {/* KPIs & Goals */}
              <Route
                path="/kpi-management"
                element={
                  <AppRouteGuard>
                    <KPIManagement />
                  </AppRouteGuard>
                }
              />
              <Route path="/goals" element={<AppRouteGuard><Goals /></AppRouteGuard>} />
              <Route path="/scorecard" element={<AppRouteGuard><Scorecard /></AppRouteGuard>} />
              
              {/* Feedback */}
              <Route path="/feedback" element={<AppRouteGuard><Feedback /></AppRouteGuard>} />
              <Route path="/continuous-feedback" element={<AppRouteGuard><ContinuousFeedback /></AppRouteGuard>} />
              
              {/* Analytics & Reports */}
              <Route
                path="/analytics/employee"
                element={
                  <AppRouteGuard>
                    <ModuleAnalytics module="employee" />
                  </AppRouteGuard>
                }
              />
              <Route
                path="/analytics/finance"
                element={
                  <AppRouteGuard>
                    <ModuleAnalytics module="finance" />
                  </AppRouteGuard>
                }
              />
              <Route
                path="/analytics/marketing"
                element={
                  <AppRouteGuard>
                    <ModuleAnalytics module="marketing" />
                  </AppRouteGuard>
                }
              />
              <Route
                path="/analytics/manager"
                element={
                  <AppRouteGuard>
                    <ModuleAnalytics module="manager" />
                  </AppRouteGuard>
                }
              />
              <Route
                path="/analytics/partner"
                element={
                  <AppRouteGuard>
                    <ModuleAnalytics module="partner" />
                  </AppRouteGuard>
                }
              />
              <Route
                path="/analytics/hr"
                element={
                  <AppRouteGuard>
                    <ModuleAnalytics module="hr" />
                  </AppRouteGuard>
                }
              />
              <Route
                path="/analytics/gmp"
                element={
                  <AppRouteGuard>
                    <ModuleAnalytics module="gmp" />
                  </AppRouteGuard>
                }
              />
              <Route path="/reports" element={<AppRouteGuard><Reports /></AppRouteGuard>} />
              <Route
                path="/non-financial-analytics"
                element={
                  <AppRouteGuard>
                    <NonFinancialAnalytics />
                  </AppRouteGuard>
                }
              />
              <Route
                path="/financial-summary"
                element={
                  <AppRouteGuard>
                    <FinancialSummary />
                  </AppRouteGuard>
                }
              />
              <Route
                path="/finance-dashboard"
                element={
                  <AppRouteGuard>
                    <FinanceDashboard />
                  </AppRouteGuard>
                }
              />
              <Route
                path="/finance-collections"
                element={
                  <AppRouteGuard>
                    <FinanceCollections />
                  </AppRouteGuard>
                }
              />
              <Route
                path="/finance-projections"
                element={
                  <AppRouteGuard>
                    <FinanceProjections />
                  </AppRouteGuard>
                }
              />
              <Route
                path="/finance-balances"
                element={
                  <AppRouteGuard>
                    <FinanceBalances />
                  </AppRouteGuard>
                }
              />
              <Route
                path="/finance-profitability"
                element={
                  <AppRouteGuard>
                    <FinanceProfitability />
                  </AppRouteGuard>
                }
              />
              <Route
                path="/finance-allocations"
                element={
                  <AppRouteGuard>
                    <FinanceAllocations />
                  </AppRouteGuard>
                }
              />
              <Route
                path="/audit-logs"
                element={
                  <AppRouteGuard>
                    <AuditLogs />
                  </AppRouteGuard>
                }
              />
              <Route path="/notifications" element={<AppRouteGuard><Notifications /></AppRouteGuard>} />
              
              {/* Team & Development */}
              <Route
                path="/team-performance"
                element={
                  <AppRouteGuard>
                    <TeamPerformance />
                  </AppRouteGuard>
                }
              />
              <Route
                path="/team-overview"
                element={
                  <AppRouteGuard>
                    <TeamOverview />
                  </AppRouteGuard>
                }
              />
              <Route
                path="/staff-development"
                element={
                  <AppRouteGuard>
                    <StaffDevelopment />
                  </AppRouteGuard>
                }
              />
              <Route path="/development-plan" element={<AppRouteGuard><DevelopmentPlan /></AppRouteGuard>} />
              
              {/* Partner & Manager Features */}
              <Route
                path="/workload-management"
                element={
                  <AppRouteGuard>
                    <WorkloadManagement />
                  </AppRouteGuard>
                }
              />
              <Route
                path="/business-development"
                element={
                  <AppRouteGuard>
                    <BusinessDevelopment />
                  </AppRouteGuard>
                }
              />
              <Route
                path="/partner-metrics"
                element={
                  <AppRouteGuard>
                    <PartnerMetrics />
                  </AppRouteGuard>
                }
              />
              <Route
                path="/partner-portfolio-summary"
                element={
                  <AppRouteGuard>
                    <PartnerPortfolioSummary />
                  </AppRouteGuard>
                }
              />
              
              {/* Documents & Surveys */}
              <Route
                path="/documents"
                element={
                  <AppRouteGuard>
                    <DocumentManagement />
                  </AppRouteGuard>
                }
              />
              <Route
                path="/knowledge-hub"
                element={
                  <AppRouteGuard>
                    <KnowledgeHub />
                  </AppRouteGuard>
                }
              />
              <Route
                path="/client-surveys"
                element={
                  <AppRouteGuard>
                    <ClientSurveys />
                  </AppRouteGuard>
                }
              />
              
              {/* Other */}
              <Route path="/todos" element={<AppRouteGuard><Todos /></AppRouteGuard>} />
              
              {/* Catch-all */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;

