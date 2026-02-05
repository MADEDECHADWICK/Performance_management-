import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch, authAPI } from "@/lib/api";
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

interface EmployeeJobRow {
  jobId: number;
  jobName: string;
  status: string;
  lastWorkedAt: string | null;
  totalHours: number;
  billableHours: number;
  nonBillableHours: number;
  billableAmount: number;
  nonBillableAmount: number;
  profitLoss: number;
  allocatedRevenue?: number;
  profit?: number;
  loss?: number;
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(var(--accent))', 'hsl(var(--muted))', 'hsl(var(--destructive))'];

export default function FinancialSummary() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [employeeJobs, setEmployeeJobs] = useState<EmployeeJobRow[]>([]);
  const [employeeTotals, setEmployeeTotals] = useState({
    totalHours: 0,
    billableHours: 0,
    nonBillableHours: 0,
    billableAmount: 0,
    nonBillableAmount: 0,
    profitLoss: 0,
    profitAmount: 0,
    lossAmount: 0,
    overtimeHours: 0,
    allocatedRevenue: 0,
  });
  const [employeeDateFrom, setEmployeeDateFrom] = useState("");
  const [employeeDateTo, setEmployeeDateTo] = useState("");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [employeeStatusFilter, setEmployeeStatusFilter] = useState("");

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      setErrorMessage(null);
      const user = await authAPI.me();
      if (!user) {
        navigate("/auth");
        return;
      }

      // Use the new role-aware analytics endpoint
      const data = await apiFetch("GET", "/analytics/financial");
      setAnalyticsData(data);

      if (data?.isEmployee) {
        await loadEmployeeBreakdown();
      }
    } catch (error: any) {
      if (error?.status === 401) {
        navigate("/auth");
        return;
      }
      if (error?.status === 404) {
        setErrorMessage(null);
      } else {
        console.error("Error loading analytics:", error);
        setErrorMessage(error?.error || "Failed to load financial analytics");
      }
      // Provide safe fallback so the dashboard still renders
      const fallbackUser = await authAPI.me().catch(() => null);
      setAnalyticsData({
        userRole: fallbackUser?.role ?? "employee",
        isAdmin: !!fallbackUser?.is_admin || !!fallbackUser?.isAdmin,
        isPartner: !!fallbackUser?.is_partner || !!fallbackUser?.isPartner,
        isEmployee: !(fallbackUser?.is_admin || fallbackUser?.isAdmin || fallbackUser?.is_partner || fallbackUser?.isPartner),
        financial: {},
      });
      await loadEmployeeBreakdown();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (analyticsData?.isEmployee) {
      loadEmployeeBreakdown();
    }
  }, [analyticsData?.isEmployee, employeeDateFrom, employeeDateTo]);

  const loadEmployeeBreakdown = async () => {
    try {
      const [entriesResponse, approvalsResponse] = await Promise.all([
        apiFetch("GET", "/time-entries?status=approved&page=1&pageSize=500"),
        apiFetch("GET", "/time-entries/approval-requests?status=approved"),
      ]);

      const entriesPayload = entriesResponse?.data ?? entriesResponse ?? {};
      const entries = Array.isArray(entriesPayload.items)
        ? entriesPayload.items
        : entriesPayload.items?.items ?? [];

      const approvalsPayload = approvalsResponse?.data ?? approvalsResponse ?? {};
      const approvals = Array.isArray(approvalsPayload.data)
        ? approvalsPayload.data
        : approvalsPayload.items ?? approvalsPayload ?? [];

      const totals = {
        totalHours: 0,
        billableHours: 0,
        nonBillableHours: 0,
        billableAmount: 0,
        nonBillableAmount: 0,
        profitLoss: 0,
        profitAmount: 0,
        lossAmount: 0,
        overtimeHours: 0,
        allocatedRevenue: 0,
      };

      const byJob = new Map<number, EmployeeJobRow>();
      const allocationBreakdown = Array.isArray(analyticsData?.financial?.jobBreakdown)
        ? analyticsData?.financial?.jobBreakdown
        : [];
      const allocationMap = new Map<number, any>(
        allocationBreakdown.map((row: any) => [row.jobId, row])
      );

      const filteredEntries = entries.filter((entry: any) => {
        const rawDate = entry.workDate ?? entry.date ?? entry.createdAt;
        if (!rawDate) {
          return true;
        }
        const entryDate = new Date(rawDate);
        if (employeeDateFrom) {
          const fromDate = new Date(employeeDateFrom);
          if (entryDate < fromDate) return false;
        }
        if (employeeDateTo) {
          const toDate = new Date(employeeDateTo);
          toDate.setHours(23, 59, 59, 999);
          if (entryDate > toDate) return false;
        }
        return true;
      });

      filteredEntries.forEach((entry: any) => {
        const jobId = entry.job?.id ?? entry.jobId;
        const jobName = entry.job?.jobName ?? `Job #${jobId}`;
        const status = entry.job?.status ?? entry.jobStatus ?? "in_progress";
        const workDate = entry.workDate ?? entry.date ?? entry.createdAt ?? null;
        const hours = Number(entry.hours || 0);
        const billable = Boolean(entry.billable);
        const billableAmount = Number(entry.billableAmount || 0);
        const costAmount = Number(entry.costAmount || 0);
        const profitLoss = Number(entry.profitLoss || 0);

        totals.totalHours += hours;
        totals.profitLoss += profitLoss;
        if (profitLoss >= 0) {
          totals.profitAmount += profitLoss;
        } else {
          totals.lossAmount += Math.abs(profitLoss);
        }
        if (billable) {
          totals.billableHours += hours;
          totals.billableAmount += billableAmount;
        } else {
          totals.nonBillableHours += hours;
          totals.nonBillableAmount += costAmount;
        }

        if (!byJob.has(jobId)) {
          const allocation = allocationMap.get(jobId);
          byJob.set(jobId, {
            jobId,
            jobName,
            status,
            lastWorkedAt: workDate,
            totalHours: 0,
            billableHours: 0,
            nonBillableHours: 0,
            billableAmount: 0,
            nonBillableAmount: 0,
            profitLoss: 0,
            allocatedRevenue: allocation?.allocatedRevenue || 0,
            profit: allocation?.profit || 0,
            loss: allocation?.loss || 0,
          });
        }

        const row = byJob.get(jobId)!;
        row.totalHours += hours;
        row.profitLoss += profitLoss;
        if (!row.lastWorkedAt || (workDate && new Date(workDate) > new Date(row.lastWorkedAt))) {
          row.lastWorkedAt = workDate;
        }
        if (billable) {
          row.billableHours += hours;
          row.billableAmount += billableAmount;
        } else {
          row.nonBillableHours += hours;
          row.nonBillableAmount += costAmount;
        }
      });

      approvals.forEach((request: any) => {
        totals.overtimeHours += Number(request.additionalHoursRequested || 0);
      });

      const allocationTotal = Number(analyticsData?.financial?.allocatedRevenueTotal || 0);
      totals.allocatedRevenue = allocationTotal;

      const jobRows = Array.from(byJob.values()).sort((a, b) => {
        const aTime = a.lastWorkedAt ? new Date(a.lastWorkedAt).getTime() : 0;
        const bTime = b.lastWorkedAt ? new Date(b.lastWorkedAt).getTime() : 0;
        return bTime - aTime;
      });

      const filteredRows = jobRows.filter((job) => {
        if (employeeStatusFilter && job.status !== employeeStatusFilter) return false;
        if (employeeSearch.trim()) {
          const query = employeeSearch.toLowerCase();
          const haystack = [job.jobName, job.status].filter(Boolean).join(" ").toLowerCase();
          if (!haystack.includes(query)) return false;
        }
        return true;
      });

      setEmployeeTotals(totals);
      setEmployeeJobs(filteredRows);
    } catch (error) {
      console.error("Failed to load employee financial breakdown", error);
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

  const roleLabel = analyticsData?.isAdmin 
    ? "Company-Wide" 
    : analyticsData?.isPartner 
    ? "Partner Portfolio" 
    : "Personal";

  const f = analyticsData?.financial || {};

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
            {analyticsData.isEmployee && "(Personal contribution)"}
          </p>
        </div>

        {errorMessage && !analyticsData?.isEmployee && (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                Limited financial data
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {errorMessage || "Financial data is not yet available. Showing placeholders for now."}
              </p>
            </CardContent>
          </Card>
        )}

        {analyticsData?.isEmployee && errorMessage && (
          <Card className="border-muted/40 bg-muted/30">
            <CardHeader>
              <CardTitle className="text-sm">Showing your approved job time</CardTitle>
              <CardDescription>
                System analytics are limited right now, but your job totals below are accurate based on approved time.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {/* Role-based visibility notice */}
        {analyticsData?.isEmployee && (
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader>
              <CardTitle className="text-sm">Personal Job Financials</CardTitle>
              <CardDescription>Billable vs non-billable, profit/loss, and overtime.</CardDescription>
            </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Billable Amount</CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  className="text-2xl font-bold text-primary leading-tight break-words"
                  title={`KES ${employeeTotals.billableAmount.toLocaleString()}`}
                >
                  KES {employeeTotals.billableAmount.toLocaleString()}
                  </div>
                  <p className="text-xs text-muted-foreground">{employeeTotals.billableHours.toFixed(1)} billable hours</p>
                </CardContent>
              </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Allocated Revenue</CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  className="text-2xl font-bold text-primary leading-tight break-words"
                  title={`KES ${employeeTotals.allocatedRevenue.toLocaleString()}`}
                >
                  KES {employeeTotals.allocatedRevenue.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">Cash collected and allocated</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Non-billable Amount</CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  className="text-2xl font-bold text-primary leading-tight break-words"
                  title={`KES ${employeeTotals.nonBillableAmount.toLocaleString()}`}
                >
                  KES {employeeTotals.nonBillableAmount.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">{employeeTotals.nonBillableHours.toFixed(1)} non-billable hours</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Profit</CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  className="text-2xl font-bold text-primary leading-tight break-words"
                  title={`KES ${employeeTotals.profitAmount.toLocaleString()}`}
                >
                  KES {employeeTotals.profitAmount.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">Positive variance</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Loss</CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  className="text-2xl font-bold text-primary leading-tight break-words"
                  title={`KES ${employeeTotals.lossAmount.toLocaleString()}`}
                >
                  KES {employeeTotals.lossAmount.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">Negative variance</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Approved Overtime</CardTitle>
              </CardHeader>
              <CardContent>
                  <div className="text-2xl font-bold text-primary leading-tight break-words">
                    {employeeTotals.overtimeHours.toFixed(1)} hrs
                  </div>
                  <p className="text-xs text-muted-foreground">Additional approved hours</p>
                </CardContent>
              </Card>
            </CardContent>
          </Card>
        )}

        {analyticsData && (
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
                    <div
                      className="text-2xl font-bold text-primary leading-tight break-words"
                      title={`KES ${(f.totalRevenue || 0).toLocaleString()}`}
                    >
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
                    <div
                      className="text-2xl font-bold text-primary leading-tight break-words"
                      title={`KES ${(f.portfolioRevenue || 0).toLocaleString()}`}
                    >
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
                    <div
                      className="text-2xl font-bold text-primary leading-tight break-words"
                      title={`KES ${(f.totalCost || 0).toLocaleString()}`}
                    >
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
                    <div className="text-2xl font-bold text-primary leading-tight break-words">
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
                    <div className="text-2xl font-bold text-primary leading-tight break-words">
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
                    <div className="text-2xl font-bold text-primary leading-tight break-words">
                      {(f.billableHours || 0).toFixed(1)}
                    </div>
                    <p className="text-xs text-muted-foreground">Hours on billable projects</p>
                  </CardContent>
                </Card>
              )}

              {analyticsData.isEmployee && (
                <Card className="hover:shadow-lg transition-shadow">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Jobs Completed</CardTitle>
                    <Users className="h-4 w-4 text-accent" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-primary leading-tight break-words">
                      {employeeJobs.length}
                    </div>
                    <p className="text-xs text-muted-foreground">With approved time</p>
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
                    <div className="text-2xl font-bold text-primary leading-tight break-words">
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

            {/* Employee: Job Financial Breakdown */}
            {analyticsData.isEmployee && employeeJobs.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Your Jobs & Earnings</CardTitle>
                  <CardDescription>Billable vs non-billable, profit/loss, and hours by job</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-3 pb-4 md:flex-row md:items-end md:justify-between">
                    <div className="flex flex-1 flex-wrap gap-3">
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-muted-foreground">From</span>
                        <input
                          type="date"
                          value={employeeDateFrom}
                          onChange={(event) => setEmployeeDateFrom(event.target.value)}
                          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-muted-foreground">To</span>
                        <input
                          type="date"
                          value={employeeDateTo}
                          onChange={(event) => setEmployeeDateTo(event.target.value)}
                          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-muted-foreground">Status</span>
                        <select
                          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                          value={employeeStatusFilter}
                          onChange={(event) => setEmployeeStatusFilter(event.target.value)}
                        >
                          <option value="">All statuses</option>
                          <option value="planned">Planned</option>
                          <option value="in_progress">In progress</option>
                          <option value="on_hold">On hold</option>
                          <option value="completed">Completed</option>
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-muted-foreground">Search</span>
                        <input
                          type="text"
                          placeholder="Job or status"
                          value={employeeSearch}
                          onChange={(event) => setEmployeeSearch(event.target.value)}
                          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setEmployeeDateFrom("");
                          setEmployeeDateTo("");
                          setEmployeeSearch("");
                          setEmployeeStatusFilter("");
                        }}
                        className="h-9 rounded-md border border-input px-3 text-sm text-muted-foreground hover:text-foreground"
                      >
                        Clear dates
                      </button>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Showing {employeeJobs.length} job{employeeJobs.length === 1 ? "" : "s"}
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Job</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Last Worked</TableHead>
                          <TableHead className="text-right">Total Hours</TableHead>
                        <TableHead className="text-right">Billable</TableHead>
                        <TableHead className="text-right">Non-billable</TableHead>
                        <TableHead className="text-right">Non-billable Amount</TableHead>
                        <TableHead className="text-right">Allocated Revenue</TableHead>
                        <TableHead className="text-right">Billable Amount</TableHead>
                        <TableHead className="text-right">Profit / Loss</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {employeeJobs.map((job) => (
                          <TableRow key={job.jobId}>
                            <TableCell className="font-medium">{job.jobName}</TableCell>
                            <TableCell className="capitalize">{job.status.replace(/_/g, " ")}</TableCell>
                            <TableCell>
                              {job.lastWorkedAt ? new Date(job.lastWorkedAt).toLocaleDateString() : "—"}
                            </TableCell>
                            <TableCell className="text-right">{job.totalHours.toFixed(1)}</TableCell>
                            <TableCell className="text-right">{job.billableHours.toFixed(1)}</TableCell>
                            <TableCell className="text-right">{job.nonBillableHours.toFixed(1)}</TableCell>
                            <TableCell className="text-right">KES {job.nonBillableAmount.toLocaleString()}</TableCell>
                            <TableCell className="text-right">
                              KES {(job.allocatedRevenue || 0).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right">KES {job.billableAmount.toLocaleString()}</TableCell>
                            <TableCell className="text-right">
                              KES {job.profitLoss.toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

            {analyticsData.isEmployee && employeeJobs.length === 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Your Jobs & Earnings</CardTitle>
                  <CardDescription>Once time entries are approved, your job financials will appear here.</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">No approved job time found yet.</p>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
