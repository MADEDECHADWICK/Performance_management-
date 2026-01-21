import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";

// Core pages
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

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

// KPIs & Goals
const KPIManagement = lazy(() => import("./pages/KPIManagement"));
const Goals = lazy(() => import("./pages/Goals"));
const Scorecard = lazy(() => import("./pages/Scorecard"));

// Feedback
const Feedback = lazy(() => import("./pages/Feedback"));
const ContinuousFeedback = lazy(() => import("./pages/ContinuousFeedback"));

// Analytics & Reports
const Reports = lazy(() => import("./pages/Reports"));
const NonFinancialAnalytics = lazy(() => import("./pages/NonFinancialAnalytics"));
const FinancialSummary = lazy(() => import("./pages/FinancialSummary"));
const AuditLogs = lazy(() => import("./pages/AuditLogs"));

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

// Document & Surveys
const DocumentManagement = lazy(() => import("./pages/DocumentManagement"));
const ClientSurveys = lazy(() => import("./pages/ClientSurveys"));

// Other
const GMPLogin = lazy(() => import("./pages/GMPLogin"));
const Todos = lazy(() => import("./pages/Todos"));
const RoleManagement = lazy(() => import("./pages/RoleManagement"));

const queryClient = new QueryClient();

const RouteFallback = () => (
  <div className="p-6 text-sm text-muted-foreground">Loading...</div>
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
              <Route path="/gmp-login" element={<GMPLogin />} />
              
              {/* Dashboards */}
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/hr-dashboard" element={<HRDashboard />} />
              <Route path="/partner-dashboard" element={<PartnerDashboard />} />
              <Route path="/manager-dashboard" element={<ManagerDashboard />} />
              <Route path="/gmp-dashboard" element={<GMPDashboard />} />
              <Route path="/department-dashboard" element={<DepartmentDashboard />} />
              
              {/* Client Management */}
              <Route path="/clients" element={<ClientsListPage />} />
              <Route path="/clients/new" element={<ClientFormPage />} />
              <Route path="/clients/:id" element={<ClientDetailPage />} />
              <Route path="/clients/:id/edit" element={<ClientFormPage />} />
              <Route path="/client-portfolio" element={<ClientPortfolio />} />
              
              {/* Job Management */}
              <Route path="/jobs" element={<JobWorkflowDashboard />} />
              <Route path="/jobs/create" element={<AdminJobCreation />} />
              <Route path="/admin-job-creation" element={<AdminJobCreation />} />
              <Route path="/job-workflow-dashboard" element={<JobWorkflowDashboard />} />
              
              {/* Time Management */}
              <Route path="/timesheets" element={<TimesheetsNew />} />
              
              {/* Employee & Profile */}
              <Route path="/profile" element={<EmployeeProfile />} />
              <Route path="/employee-management" element={<EmployeeManagement />} />
              <Route path="/role-management" element={<RoleManagement />} />
              
              {/* Evaluations */}
              <Route path="/evaluations" element={<Evaluations />} />
              <Route path="/evaluation-management" element={<EvaluationManagement />} />
              <Route path="/create-evaluation" element={<CreateEvaluation />} />
              <Route path="/evaluation/:assignmentId" element={<CompleteEvaluation />} />
              <Route path="/manager-evaluation" element={<ManagerEvaluationPage />} />
              <Route path="/upward-reviews" element={<UpwardReviews />} />
              <Route path="/client-evaluation/:token" element={<ClientEvaluation />} />
              
              {/* KPIs & Goals */}
              <Route path="/kpi-management" element={<KPIManagement />} />
              <Route path="/goals" element={<Goals />} />
              <Route path="/scorecard" element={<Scorecard />} />
              
              {/* Feedback */}
              <Route path="/feedback" element={<Feedback />} />
              <Route path="/continuous-feedback" element={<ContinuousFeedback />} />
              
              {/* Analytics & Reports */}
              <Route path="/reports" element={<Reports />} />
              <Route path="/non-financial-analytics" element={<NonFinancialAnalytics />} />
              <Route path="/financial-summary" element={<FinancialSummary />} />
              <Route path="/audit-logs" element={<AuditLogs />} />
              
              {/* Team & Development */}
              <Route path="/team-performance" element={<TeamPerformance />} />
              <Route path="/team-overview" element={<TeamOverview />} />
              <Route path="/staff-development" element={<StaffDevelopment />} />
              <Route path="/development-plan" element={<DevelopmentPlan />} />
              
              {/* Partner & Manager Features */}
              <Route path="/workload-management" element={<WorkloadManagement />} />
              <Route path="/business-development" element={<BusinessDevelopment />} />
              <Route path="/partner-metrics" element={<PartnerMetrics />} />
              
              {/* Documents & Surveys */}
              <Route path="/documents" element={<DocumentManagement />} />
              <Route path="/client-surveys" element={<ClientSurveys />} />
              
              {/* Other */}
              <Route path="/todos" element={<Todos />} />
              
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
