import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import HRDashboard from "./pages/HRDashboard";
import PartnerDashboard from "./pages/PartnerDashboard";
import ManagerDashboard from "./pages/ManagerDashboard";
import GMPDashboard from "./pages/GMPDashboard";
import KPIManagement from "./pages/KPIManagement";
import Scorecard from "./pages/Scorecard";
import Feedback from "./pages/Feedback";
import Timesheets from "./pages/Timesheets";
import Reports from "./pages/Reports";
import Evaluations from "./pages/Evaluations";
import EmployeeProfile from "./pages/EmployeeProfile";
import Goals from "./pages/Goals";
import NonFinancialAnalytics from "./pages/NonFinancialAnalytics";
import ContinuousFeedback from "./pages/ContinuousFeedback";
import EvaluationManagement from "./pages/EvaluationManagement";
import DevelopmentPlan from "./pages/DevelopmentPlan";
import CreateEvaluation from "./pages/CreateEvaluation";
import CompleteEvaluation from "./pages/CompleteEvaluation";
import DepartmentDashboard from "./pages/DepartmentDashboard";
import AuditLogs from "./pages/AuditLogs";
import ClientEvaluation from "./pages/ClientEvaluation";
import FinancialSummary from "./pages/FinancialSummary";
import NotFound from "./pages/NotFound";
import ManagerEvaluationPage from "./pages/ManagerEvaluation";
import EmployeeManagement from "./pages/EmployeeManagement";
import Todos from "./pages/Todos";

import UpwardReviews from "./pages/UpwardReviews";


import TeamPerformance from "./pages/TeamPerformance";
import StaffDevelopment from "./pages/StaffDevelopment";
import WorkloadManagement from "./pages/WorkloadManagement";
import ClientPortfolio from "./pages/ClientPortfolio";
import BusinessDevelopment from "./pages/BusinessDevelopment";
import PartnerMetrics from "./pages/PartnerMetrics";
import TeamOverview from "./pages/TeamOverview";
import GMPLogin from "./pages/GMPLogin";
import AdminJobCreation from "./pages/AdminJobCreation";
import JobWorkflowDashboard from "./pages/JobWorkflowDashboard";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/gmp-login" element={<GMPLogin />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/hr-dashboard" element={<HRDashboard />} />
        <Route path="/partner-dashboard" element={<PartnerDashboard />} />
        <Route path="/manager-dashboard" element={<ManagerDashboard />} />
        <Route path="/gmp-dashboard" element={<GMPDashboard />} />
          <Route path="/kpi-management" element={<KPIManagement />} />
          <Route path="/scorecard" element={<Scorecard />} />
          <Route path="/feedback" element={<Feedback />} />
          <Route path="/timesheets" element={<Timesheets />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/evaluations" element={<Evaluations />} />
          <Route path="/goals" element={<Goals />} />
          <Route path="/non-financial-analytics" element={<NonFinancialAnalytics />} />
          <Route path="/continuous-feedback" element={<ContinuousFeedback />} />
          <Route path="/evaluation-management" element={<EvaluationManagement />} />
          <Route path="/development-plan" element={<DevelopmentPlan />} />
          <Route path="/profile" element={<EmployeeProfile />} />
          <Route path="/department-dashboard" element={<DepartmentDashboard />} />
          <Route path="/audit-logs" element={<AuditLogs />} />
          <Route path="/client-evaluation/:token" element={<ClientEvaluation />} />
          <Route path="/financial-summary" element={<FinancialSummary />} />
          <Route path="/create-evaluation" element={<CreateEvaluation />} />
          <Route path="/evaluation/:assignmentId" element={<CompleteEvaluation />} />
          <Route path="/manager-evaluation" element={<ManagerEvaluationPage />} />
          <Route path="/employee-management" element={<EmployeeManagement />} />
          <Route path="/todos" element={<Todos />} />

          <Route path="/upward-reviews" element={<UpwardReviews />} />


          <Route path="/team-performance" element={<TeamPerformance />} />
          <Route path="/staff-development" element={<StaffDevelopment />} />
          <Route path="/workload-management" element={<WorkloadManagement />} />
          <Route path="/client-portfolio" element={<ClientPortfolio />} />
          <Route path="/business-development" element={<BusinessDevelopment />} />
          <Route path="/partner-metrics" element={<PartnerMetrics />} />
          <Route path="/team-overview" element={<TeamOverview />} />
          <Route path="/admin-job-creation" element={<AdminJobCreation />} />
          <Route path="/job-workflow-dashboard" element={<JobWorkflowDashboard />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
