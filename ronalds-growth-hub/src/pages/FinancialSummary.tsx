import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiFetch, authAPI } from "@/integrations/apiClient";
import { DollarSign, TrendingUp, Users, Loader2, AlertCircle, Building2 } from "lucide-react";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface AnalyticsData {
  userRole: string;
  isAdmin: boolean;
  isPartner: boolean;
  isEmployee: boolean;
  financial: any;
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(var(--accent))', 'hsl(var(--muted))', 'hsl(var(--destructive))'];

export default function FinancialSummary() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);

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
      const data = await apiFetch("GET", "/analytics/financial");
      setAnalyticsData(data);
    } catch (error: unknown) {
      const err = error as Record<string, string>;
      console.error("Error loading analytics:", error);
      toast({
        title: "Error",
        description: err.error || "Failed to load financial analytics",
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
              No Financial Data Available
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Financial data is not yet available. Please complete work logs and evaluations to see metrics.
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

  const f = analyticsData.financial;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold text-foreground mb-2">
            {roleLabel} Financial Performance
          </h2>
          <p className="text-muted-foreground">
            Your financial metrics {analyticsData.isAdmin && "(Company-wide aggregates)"}
            {analyticsData.isPartner && "(Portfolio metrics)"}
            {analyticsData.isEmployee && "(Personal contribution - monetary values restricted)"}
          </p>
        </div>

        {/* Role-based visibility notice */}
        {analyticsData.isEmployee && (
          <Card className="border-blue-200 bg-blue-50">
            <CardHeader>
              <CardTitle className="text-sm text-blue-900">Personal Hours Only</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-blue-800">
                As an employee, you see only your hours worked. Financial data (revenue, profit, company-wide metrics) is restricted to authorized personnel.
              </p>
            </CardContent>
          </Card>
        )}

        {analyticsData.financial && (
          <>
            {/* Key Metrics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Total Revenue - Admin only */}
              {analyticsData.isAdmin && (
                <Card className="hover:shadow-lg transition-shadow">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                    <DollarSign className="h-4 w-4 text-accent" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-primary">
                      KES {(f.totalRevenue || 0).toLocaleString()}
                    </div>
                    <p className="text-xs text-muted-foreground">Company-wide revenue</p>
                  </CardContent>
                </Card>
              )}

              {/* Portfolio Revenue - Partner */}
              {analyticsData.isPartner && (
                <Card className="hover:shadow-lg transition-shadow">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Portfolio Revenue</CardTitle>
                    <DollarSign className="h-4 w-4 text-accent" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-primary">
                      KES {(f.portfolioRevenue || 0).toLocaleString()}
                    </div>
                    <p className="text-xs text-muted-foreground">Your team's revenue</p>
                  </CardContent>
                </Card>
              )}

              {/* Total Cost - Admin only */}
              {analyticsData.isAdmin && (
                <Card className="hover:shadow-lg transition-shadow">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
                    <TrendingUp className="h-4 w-4 text-accent" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-primary">
                      KES {(f.totalCost || 0).toLocaleString()}
                    </div>
                    <p className="text-xs text-muted-foreground">Total operating cost</p>
                  </CardContent>
                </Card>
              )}

              {/* Profit Margin - Admin only */}
              {analyticsData.isAdmin && (
                <Card className="hover:shadow-lg transition-shadow">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Profit Margin</CardTitle>
                    <TrendingUp className="h-4 w-4 text-accent" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-primary">
                      {f.totalRevenue > 0 ? (((f.totalRevenue - f.totalCost) / f.totalRevenue) * 100).toFixed(1) : 0}%
                    </div>
                    <p className="text-xs text-muted-foreground">
                      KES {((f.totalRevenue || 0) - (f.totalCost || 0)).toLocaleString()} profit
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Total Hours - Employee/Partner */}
              {!analyticsData.isAdmin && (
                <Card className="hover:shadow-lg transition-shadow">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      {analyticsData.isPartner ? "Team Hours" : "Total Hours"}
                    </CardTitle>
                    <TrendingUp className="h-4 w-4 text-accent" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-primary">
                      {(f.totalHours || 0).toFixed(1)}
                    </div>
                    <p className="text-xs text-muted-foreground">Hours worked</p>
                  </CardContent>
                </Card>
              )}

              {/* Billable Hours - Employee/Partner */}
              {!analyticsData.isAdmin && (
                <Card className="hover:shadow-lg transition-shadow">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Billable Hours</CardTitle>
                    <Users className="h-4 w-4 text-accent" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-primary">
                      {(f.billableHours || 0).toFixed(1)}
                    </div>
                    <p className="text-xs text-muted-foreground">Hours on billable projects</p>
                  </CardContent>
                </Card>
              )}

              {/* Active Jobs/Departments */}
              {analyticsData.isAdmin && f.activeDepartments && (
                <Card className="hover:shadow-lg transition-shadow">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Departments</CardTitle>
                    <Building2 className="h-4 w-4 text-accent" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-primary">
                      {f.activeDepartments}
                    </div>
                    <p className="text-xs text-muted-foreground">Active departments</p>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Admin-only: Job Profitability Breakdown */}
            {analyticsData.isAdmin && f.jobProfitability && f.jobProfitability.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Job Profitability Analysis</CardTitle>
                  <CardDescription>Revenue and profit by job</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Job Code</TableHead>
                          <TableHead>Client</TableHead>
                          <TableHead className="text-right">Revenue</TableHead>
                          <TableHead className="text-right">Cost</TableHead>
                          <TableHead className="text-right">Profit</TableHead>
                          <TableHead className="text-right">Margin %</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {f.jobProfitability.map((job: any) => (
                          <TableRow key={job.jobId}>
                            <TableCell className="font-medium">{job.jobCode}</TableCell>
                            <TableCell>{job.clientName}</TableCell>
                            <TableCell className="text-right">KES {(job.revenue || 0).toLocaleString()}</TableCell>
                            <TableCell className="text-right">KES {(job.cost || 0).toLocaleString()}</TableCell>
                            <TableCell className="text-right font-medium">KES {((job.revenue || 0) - (job.cost || 0)).toLocaleString()}</TableCell>
                            <TableCell className="text-right">
                              {job.revenue > 0 ? (((job.revenue - (job.cost || 0)) / job.revenue) * 100).toFixed(1) : 0}%
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Admin-only: Department Revenue Distribution */}
            {analyticsData.isAdmin && f.departmentRevenue && f.departmentRevenue.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Revenue by Department</CardTitle>
                  <CardDescription>Distribution across departments</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={f.departmentRevenue}
                        dataKey="revenue"
                        nameKey="department"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        label={(entry) => `${entry.department}: KES ${(entry.revenue).toLocaleString()}`}
                      >
                        {f.departmentRevenue.map((_: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => `KES ${Number(value).toLocaleString()}`} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Partner: Portfolio Breakdown */}
            {analyticsData.isPartner && f.portfolioJobs && f.portfolioJobs.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Portfolio Jobs</CardTitle>
                  <CardDescription>Your team's active engagements</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Job</TableHead>
                          <TableHead>Client</TableHead>
                          <TableHead className="text-right">Team Hours</TableHead>
                          <TableHead className="text-right">Revenue</TableHead>
                          <TableHead className="text-right">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {f.portfolioJobs.map((job: any) => (
                          <TableRow key={job.jobId}>
                            <TableCell className="font-medium">{job.jobCode}</TableCell>
                            <TableCell>{job.clientName}</TableCell>
                            <TableCell className="text-right">{(job.hours || 0).toFixed(1)}</TableCell>
                            <TableCell className="text-right">KES {(job.revenue || 0).toLocaleString()}</TableCell>
                            <TableCell>{job.status || 'Active'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Employee: Job Hours Breakdown */}
            {analyticsData.isEmployee && f.jobHours && f.jobHours.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Your Hours by Job</CardTitle>
                  <CardDescription>Breakdown of hours worked on each project</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Job</TableHead>
                          <TableHead>Client</TableHead>
                          <TableHead className="text-right">Total Hours</TableHead>
                          <TableHead className="text-right">Billable Hours</TableHead>
                          <TableHead className="text-right">Billable %</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {f.jobHours.map((job: any) => (
                          <TableRow key={job.jobId}>
                            <TableCell className="font-medium">{job.jobCode}</TableCell>
                            <TableCell>{job.clientName}</TableCell>
                            <TableCell className="text-right">{(job.totalHours || 0).toFixed(1)}</TableCell>
                            <TableCell className="text-right">{(job.billableHours || 0).toFixed(1)}</TableCell>
                            <TableCell className="text-right">
                              {job.totalHours > 0 ? ((job.billableHours / job.totalHours) * 100).toFixed(1) : 0}%
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
