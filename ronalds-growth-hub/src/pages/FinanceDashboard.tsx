import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import JobOperationsOverview from "@/components/jobs/JobOperationsOverview";
import PageLoader from '@/components/ui/page-loader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AnalyticsChartShell,
  AnalyticsGradientDefs,
  AnalyticsLegendContent,
  AnalyticsTooltipContent,
  analyticsAxisProps,
  analyticsGradientFill,
  analyticsGridProps,
} from "@/components/ui/analytics-chart";
import MiniStatGraph from "@/components/ui/mini-stat-graph";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import type { RequisitionFinanceTracker } from "@/lib/api/requisitions";
import { BarChart3, DollarSign, TrendingUp, AlertCircle, ArrowUpRight } from "lucide-react";
import {
  BarChart,
  Bar,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

type FinanceOverview = {
  month: string;
  projectedMonth: number;
  collectedMonth: number;
  varianceMonth: number;
  totalCollected: number;
  totalOutstanding: number;
  totalFees: number;
  collectionRate: number;
};

type Collection = {
  id: number;
  clientId: number;
  clientName: string;
  jobId: number | null;
  jobCode: string | null;
  jobName: string | null;
  paymentAmount: number;
  currency: string;
  paymentDate: string;
  paymentMethod?: string | null;
  referenceNumber?: string | null;
  notes?: string | null;
};

type Projection = {
  id: number;
  monthYear: string;
  projectedAmount: number;
  currency?: string | null;
  actualCollected: number;
  variance: number;
  variancePercent: number;
  status: string;
  clientId: number | null;
  clientName: string | null;
  departmentId: number | null;
  departmentName: string | null;
};

type ClientBalance = {
  clientId: number;
  clientName: string;
  totalFee: number;
  totalCollected: number;
  balance: number;
  jobsCount: number;
};

type JobProfitability = {
  jobId: number;
  jobCode: string | null;
  jobName: string;
  clientName: string;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
  collected: number;
};

type RevenueAllocation = {
  id: number;
  jobId: number;
  jobCode: string | null;
  jobName: string;
  clientName: string;
  employeeName: string;
  allocatedAmount: number;
  allocationPercentage: number;
  allocationMonth: string;
  employeeProfit: number;
  employeeLoss: number;
};

export default function FinanceDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<FinanceOverview | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [projections, setProjections] = useState<Projection[]>([]);
  const [clientBalances, setClientBalances] = useState<ClientBalance[]>([]);
  const [jobProfitability, setJobProfitability] = useState<JobProfitability[]>([]);
  const [allocations, setAllocations] = useState<RevenueAllocation[]>([]);
  const [requisitionFinanceTracker, setRequisitionFinanceTracker] = useState<RequisitionFinanceTracker | null>(null);

  const loadFinanceDashboard = async () => {
    try {
      setLoading(true);
      const overviewData = await apiFetch<FinanceOverview>("GET", "/finance-dashboard/overview");
      setOverview(overviewData);
      setOverviewError(null);

      const results = await Promise.allSettled([
        apiFetch<Collection[]>("GET", "/finance-dashboard/collections?limit=8"),
        apiFetch<Projection[]>("GET", "/finance-dashboard/projections"),
        apiFetch<ClientBalance[]>("GET", "/finance-dashboard/client-balances"),
        apiFetch<JobProfitability[]>("GET", "/finance-dashboard/job-profitability"),
        apiFetch<RevenueAllocation[]>("GET", "/finance-dashboard/revenue-allocations"),
        apiFetch<RequisitionFinanceTracker>("GET", "/requisitions/finance-tracker"),
      ]);

      const [
        collectionsResult,
        projectionsResult,
        balancesResult,
        profitabilityResult,
        allocationsResult,
        requisitionTrackerResult,
      ] = results;

      if (collectionsResult.status === "fulfilled") setCollections(collectionsResult.value);
      if (projectionsResult.status === "fulfilled") setProjections(projectionsResult.value);
      if (balancesResult.status === "fulfilled") setClientBalances(balancesResult.value);
      if (profitabilityResult.status === "fulfilled") setJobProfitability(profitabilityResult.value);
      if (allocationsResult.status === "fulfilled") setAllocations(allocationsResult.value);
      if (requisitionTrackerResult.status === "fulfilled") {
        setRequisitionFinanceTracker(requisitionTrackerResult.value);
      }
    } catch (error: any) {
      console.error("Finance dashboard error:", error);
      if (error?.status === 401) {
        navigate("/auth");
        return;
      }
      if (error?.status === 404) {
        setOverviewError(null);
      } else {
        setOverviewError(error.message || "Finance data unavailable");
      }
      setOverview(null);
      setCollections([]);
      setProjections([]);
      setClientBalances([]);
      setJobProfitability([]);
      setAllocations([]);
      setRequisitionFinanceTracker(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFinanceDashboard();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const monthChart = useMemo(() => {
    const map = new Map<string, { month: string; projected: number; collected: number }>();
    projections.forEach((projection) => {
      const monthLabel = new Date(projection.monthYear).toLocaleString("en-KE", {
        month: "short",
        year: "numeric",
      });
      map.set(monthLabel, {
        month: monthLabel,
        projected: projection.projectedAmount,
        collected: projection.actualCollected,
      });
    });
    return Array.from(map.values()).slice(0, 6).reverse();
  }, [projections]);

  const totalProfit = useMemo(
    () => jobProfitability.reduce((sum, job) => sum + (job.profit || 0), 0),
    [jobProfitability]
  );

  const averageMargin = useMemo(() => {
    if (jobProfitability.length === 0) return 0;
    const total = jobProfitability.reduce((sum, job) => sum + (job.margin || 0), 0);
    return total / jobProfitability.length;
  }, [jobProfitability]);

  const totalAllocated = useMemo(
    () => allocations.reduce((sum, allocation) => sum + (allocation.allocatedAmount || 0), 0),
    [allocations]
  );

  const latestCollectionDate = collections[0]?.paymentDate
    ? new Date(collections[0].paymentDate).toLocaleDateString()
    : "No payments yet";

  const formatCurrency = (amount: number) =>
    `KES ${Number(amount || 0).toLocaleString("en-KE")}`;

  const formatCompactCurrency = (amount: number) => {
    const safe = Number(amount || 0);
    const compact = new Intl.NumberFormat("en-KE", {
      notation: "compact",
      compactDisplay: "short",
      maximumFractionDigits: 1,
    }).format(safe);
    return `KES ${compact}`;
  };

  const accountabilityRows = useMemo(() => {
    if (!requisitionFinanceTracker) return [];
    return [...requisitionFinanceTracker.pending]
      .sort((left, right) => {
        const leftTime = left.accountabilityDueAt ? new Date(left.accountabilityDueAt).getTime() : Number.MAX_SAFE_INTEGER;
        const rightTime = right.accountabilityDueAt ? new Date(right.accountabilityDueAt).getTime() : Number.MAX_SAFE_INTEGER;
        return leftTime - rightTime;
      })
      .slice(0, 6);
  }, [requisitionFinanceTracker]);

  const financeJobMetrics = [
    {
      label: "Projected month",
      value: formatCompactCurrency(overview?.projectedMonth || 0),
      hint: "Current month plan",
      icon: TrendingUp,
      tone: "primary" as const,
      graphValue: overview?.projectedMonth || 0,
    },
    {
      label: "Collected month",
      value: formatCompactCurrency(overview?.collectedMonth || 0),
      hint: `Variance ${formatCompactCurrency(overview?.varianceMonth || 0)}`,
      icon: DollarSign,
      tone: "positive" as const,
      graphValue: overview?.collectedMonth || 0,
      graphBaseline: overview?.projectedMonth || 0,
    },
    {
      label: "Outstanding book",
      value: formatCompactCurrency(overview?.totalOutstanding || 0),
      hint: `Realized ${formatCompactCurrency(overview?.totalCollected || 0)}`,
      icon: BarChart3,
      tone: "warning" as const,
      graphValue: overview?.totalOutstanding || 0,
      graphBaseline: 0,
      inverse: true,
    },
    {
      label: "Collection rate",
      value: `${(overview?.collectionRate || 0).toFixed(1)}%`,
      hint: `${jobProfitability.length} jobs in profitability scope`,
      icon: ArrowUpRight,
      tone: "danger" as const,
      graphValue: overview?.collectionRate || 0,
      graphBaseline: 70,
    },
  ];

  if (loading) {
    return (
      <DashboardLayout>
        <PageLoader message="Loading..." />
      </DashboardLayout>
    );
  }

  if (!overview) {
    return (
      <DashboardLayout>
        <div className="space-y-8">
          <div>
            <h1 className="text-3xl font-bold">Finance Overview</h1>
            <p className="text-muted-foreground">
              High-level finance performance with quick access to each module.
            </p>
          </div>

          <Card className="border-dashed bg-muted/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5" />
                Finance data not available yet
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {overviewError || "No finance overview payload was returned from the system."}
              </p>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold">Finance Overview</h1>
          <p className="text-muted-foreground">
            High-level finance performance with quick access to each module.
          </p>
        </div>

        <JobOperationsOverview
          title="Finance job operations"
          description="Trace revenue, collections, outstanding exposure, and the jobs behind the numbers from one cleaner finance view."
          metrics={financeJobMetrics}
          showLocator={false}
        />


        {overviewError && (
          <Card className="border-dashed bg-muted/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5" />
                Finance data not available yet
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {overviewError}. Record collections or projections to populate the dashboard.
              </p>
            </CardContent>
          </Card>
        )}

        {requisitionFinanceTracker ? (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Awaiting Release</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="metric-value">{requisitionFinanceTracker.counts.unreleasedCount}</div>
                  <p className="text-xs text-muted-foreground">Approved requisitions not yet disbursed.</p>
                  <MiniStatGraph value={requisitionFinanceTracker.counts.unreleasedCount} baseline={0} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Pending Accountability</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="metric-value">{requisitionFinanceTracker.counts.pendingCount}</div>
                  <p className="text-xs text-muted-foreground">Released requisitions still awaiting accountability.</p>
                  <MiniStatGraph value={requisitionFinanceTracker.counts.pendingCount} baseline={0} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Overdue Accountabilities</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="metric-value">{requisitionFinanceTracker.counts.overdueCount}</div>
                  <p className="text-xs text-muted-foreground">Past the three-week accountability deadline.</p>
                  <MiniStatGraph value={requisitionFinanceTracker.counts.overdueCount} baseline={0} inverse />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Completed Accountabilities</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="metric-value">{requisitionFinanceTracker.counts.completedCount}</div>
                  <p className="text-xs text-muted-foreground">Requisitions fully accounted for.</p>
                  <MiniStatGraph value={requisitionFinanceTracker.counts.completedCount} baseline={0} />
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Accountability Tracker</CardTitle>
                <CardDescription>Released requisitions that still need employee accountability.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Requisition</TableHead>
                      <TableHead>Requester</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Released</TableHead>
                      <TableHead>Due</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accountabilityRows.length ? (
                      accountabilityRows.map((request) => {
                        const isOverdue =
                          Boolean(request.accountabilityDueAt) &&
                          new Date(String(request.accountabilityDueAt)).getTime() < Date.now();
                        return (
                          <TableRow key={`finance-accountability-${request.id}`}>
                            <TableCell>
                              <div className="font-medium">{request.title}</div>
                              <div className="text-xs text-muted-foreground">{request.requisitionNumber}</div>
                            </TableCell>
                            <TableCell>
                              {request.requester?.firstName} {request.requester?.lastName}
                            </TableCell>
                            <TableCell>{formatCurrency(Number(request.amount || 0))}</TableCell>
                            <TableCell>{request.releasedAt ? new Date(request.releasedAt).toLocaleDateString() : "N/A"}</TableCell>
                            <TableCell className={isOverdue ? "text-destructive" : ""}>
                              {request.accountabilityDueAt ? new Date(request.accountabilityDueAt).toLocaleDateString() : "N/A"}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          No pending accountabilities right now.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Projection vs Collection</CardTitle>
              <CardDescription>Last six months overview.</CardDescription>
            </CardHeader>
            <CardContent className="h-72">
              <AnalyticsChartShell>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthChart} barCategoryGap={18}>
                    <AnalyticsGradientDefs
                      items={[
                        { id: "finance-dashboard-projected", color: "hsl(var(--chart-1))" },
                        { id: "finance-dashboard-collected", color: "hsl(var(--chart-2))" },
                      ]}
                    />
                    <CartesianGrid {...analyticsGridProps} />
                    <XAxis dataKey="month" {...analyticsAxisProps} />
                    <YAxis
                      {...analyticsAxisProps}
                      tickFormatter={(value) =>
                        new Intl.NumberFormat("en-KE", {
                          notation: "compact",
                          compactDisplay: "short",
                          maximumFractionDigits: 1,
                        }).format(Number(value || 0))
                      }
                    />
                    <Tooltip
                      content={
                        <AnalyticsTooltipContent
                          valueFormatter={(value, name) => [
                            `KES ${Number(value || 0).toLocaleString()}`,
                            name,
                          ]}
                        />
                      }
                    />
                    <Legend content={<AnalyticsLegendContent />} />
                    <Bar
                      dataKey="projected"
                      fill={analyticsGradientFill("finance-dashboard-projected")}
                      radius={[10, 10, 4, 4]}
                    />
                    <Bar
                      dataKey="collected"
                      fill={analyticsGradientFill("finance-dashboard-collected")}
                      radius={[10, 10, 4, 4]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </AnalyticsChartShell>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Collections</CardTitle>
              <CardDescription>Latest payments recorded.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {collections.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground">
                        No collections yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {collections.slice(0, 5).map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell>{new Date(payment.paymentDate).toLocaleDateString()}</TableCell>
                      <TableCell>{payment.clientName}</TableCell>
                      <TableCell className="text-right">
                        {(payment.currency || "KES")} {payment.paymentAmount.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex justify-end pt-4">
                <Button asChild variant="outline" size="sm">
                  <Link to="/finance-collections">
                    View collections
                    <ArrowUpRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Finance Modules</CardTitle>
            <CardDescription>Quick summaries and shortcuts into each finance workflow.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <Card>
                <CardHeader className="space-y-1">
                  <CardTitle className="text-base">Collections</CardTitle>
                  <CardDescription>Payments logged by finance.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="metric-value">KES {overview.totalCollected.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Total collected to date</p>
                  </div>
                  <p className="text-xs text-muted-foreground">Latest payment: {latestCollectionDate}</p>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/finance-collections">Manage collections</Link>
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="space-y-1">
                  <CardTitle className="text-base">Projections</CardTitle>
                  <CardDescription>Targets vs actuals.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="metric-value">KES {overview.projectedMonth.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Current month target</p>
                  </div>
                  <p className="text-xs text-muted-foreground">Active projections: {projections.length}</p>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/finance-projections">View projections</Link>
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="space-y-1">
                  <CardTitle className="text-base">Balances</CardTitle>
                  <CardDescription>Outstanding client and job balances.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="metric-value">KES {overview.totalOutstanding.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Outstanding balance</p>
                  </div>
                  <p className="text-xs text-muted-foreground">Clients with balance: {clientBalances.length}</p>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/finance-balances">View balances</Link>
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="space-y-1">
                  <CardTitle className="text-base">Profitability</CardTitle>
                  <CardDescription>Revenue vs cost performance.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="metric-value">KES {totalProfit.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Estimated profit</p>
                  </div>
                  <p className="text-xs text-muted-foreground">Avg margin: {averageMargin.toFixed(1)}%</p>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/finance-profitability">View profitability</Link>
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="space-y-1">
                  <CardTitle className="text-base">Allocations</CardTitle>
                  <CardDescription>Revenue shared to staff.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="metric-value">KES {totalAllocated.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Latest allocations</p>
                  </div>
                  <p className="text-xs text-muted-foreground">Allocations logged: {allocations.length}</p>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/finance-allocations">View allocations</Link>
                  </Button>
                </CardContent>
              </Card>

            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
