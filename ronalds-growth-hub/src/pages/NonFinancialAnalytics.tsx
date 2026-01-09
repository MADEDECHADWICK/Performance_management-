import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { apiFetch, authAPI } from "@/integrations/apiClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Loader2, TrendingUp, Users, Target, Award, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AnalyticsData {
  userRole: string;
  isAdmin: boolean;
  isPartner: boolean;
  isEmployee: boolean;
  userProfile: any;
  nonFinancial: any;
  financial: any;
}

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

const NonFinancialAnalytics = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [activeTab, setActiveTab] = useState("performance");

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const user = await authAPI.me();
      if (!user) {
        navigate("/auth");
        return;
      }

      // Use the new role-aware analytics endpoint
      const data = await apiFetch("GET", "/analytics/dashboard");
      console.log("Analytics data received:", data);  // DEBUG
      setAnalyticsData(data);
    } catch (error: unknown) {
      const err = error as Record<string, string>;
      console.error("Error loading analytics:", error);
      toast({
        title: "Error",
        description: err.error || "Failed to load analytics",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!analyticsData) {
    return (
      <DashboardLayout>
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              No Analytics Available
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Analytics data is not yet available. Please complete performance evaluations to see metrics.
            </p>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  const roleLabel = analyticsData.isAdmin 
    ? "Company-Wide" 
    : analyticsData.isPartner 
    ? "Partner Portfolio" 
    : "Personal";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold text-foreground mb-2">
            {roleLabel} Non-Financial Performance
          </h2>
          <p className="text-muted-foreground">
            Your Balanced Scorecard metrics {analyticsData.isAdmin && "(Company-wide aggregates)"}
            {analyticsData.isPartner && "(Portfolio team metrics)"}
            {analyticsData.isEmployee && "(Personal metrics)"}
          </p>
        </div>

        {/* Role-based visibility notice */}
        {analyticsData.isEmployee && (
          <Card className="border-blue-200 bg-blue-50">
            <CardHeader>
              <CardTitle className="text-sm text-blue-900">Personal Metrics Only</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-blue-800">
                As an employee, you see only your own performance metrics. Company-wide and partner portfolio data is restricted to authorized personnel.
              </p>
            </CardContent>
          </Card>
        )}

        {analyticsData.nonFinancial && (
          <>
            {/* Key Metrics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Learning & Growth</CardTitle>
                  <TrendingUp className="h-4 w-4 text-accent" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">
                    {analyticsData.nonFinancial.avgLearningGrowth?.toFixed(1) || analyticsData.nonFinancial.learningGrowth?.toFixed(1) || 0}%
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {analyticsData.isAdmin ? "Company average" : "Your score"}
                  </p>
                </CardContent>
              </Card>

              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Customer Satisfaction</CardTitle>
                  <Award className="h-4 w-4 text-accent" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">
                    {analyticsData.nonFinancial.avgCustomerSatisfaction?.toFixed(1) || analyticsData.nonFinancial.customerSatisfaction?.toFixed(1) || 0}%
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {analyticsData.isAdmin ? "Company average" : "Your score"}
                  </p>
                </CardContent>
              </Card>

              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Internal Processes</CardTitle>
                  <Target className="h-4 w-4 text-accent" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">
                    {analyticsData.nonFinancial.avgInternalProcesses?.toFixed(1) || analyticsData.nonFinancial.internalProcesses?.toFixed(1) || 0}%
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {analyticsData.isAdmin ? "Company average" : "Your score"}
                  </p>
                </CardContent>
              </Card>

              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Overall Score</CardTitle>
                  <Star className="h-4 w-4 text-accent" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">
                    {analyticsData.nonFinancial.avgOverallScore?.toFixed(1) || analyticsData.nonFinancial.overallScore?.toFixed(1) || 0}%
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {analyticsData.isAdmin ? "Company average" : "Your overall"}
                  </p>
                </CardContent>
              </Card>

              {analyticsData.isAdmin && analyticsData.nonFinancial.totalEmployees && (
                <Card className="hover:shadow-lg transition-shadow">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
                    <Users className="h-4 w-4 text-accent" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-primary">
                      {analyticsData.nonFinancial.totalEmployees}
                    </div>
                    <p className="text-xs text-muted-foreground">Active employees</p>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Admin-only section: Department breakdown */}
            {analyticsData.isAdmin && analyticsData.nonFinancial.departmentAverages && analyticsData.nonFinancial.departmentAverages.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Department Performance Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b">
                        <tr>
                          <th className="text-left py-2 px-2">Department</th>
                          <th className="text-right py-2 px-2">Avg Score</th>
                          <th className="text-right py-2 px-2">Employees</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analyticsData.nonFinancial.departmentAverages.map((dept: any) => (
                          <tr key={dept.department} className="border-b hover:bg-muted/50">
                            <td className="py-2 px-2">{dept.department}</td>
                            <td className="text-right py-2 px-2 font-medium">{dept.avgScore.toFixed(1)}%</td>
                            <td className="text-right py-2 px-2 text-muted-foreground">{dept.employeeCount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

import { Star } from "lucide-react";
export default NonFinancialAnalytics;