import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { BarChart3, DollarSign, TrendingUp, AlertCircle, FileSpreadsheet, ArrowUpRight } from "lucide-react";
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
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<FinanceOverview | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [projections, setProjections] = useState<Projection[]>([]);
  const [clientBalances, setClientBalances] = useState<ClientBalance[]>([]);
  const [jobProfitability, setJobProfitability] = useState<JobProfitability[]>([]);
  const [allocations, setAllocations] = useState<RevenueAllocation[]>([]);

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
      ]);

      const [collectionsResult, projectionsResult, balancesResult, profitabilityResult, allocationsResult] = results;

      if (collectionsResult.status === "fulfilled") setCollections(collectionsResult.value);
      if (projectionsResult.status === "fulfilled") setProjections(projectionsResult.value);
      if (balancesResult.status === "fulfilled") setClientBalances(balancesResult.value);
      if (profitabilityResult.status === "fulfilled") setJobProfitability(profitabilityResult.value);
      if (allocationsResult.status === "fulfilled") setAllocations(allocationsResult.value);
    } catch (error: any) {
      console.error("Finance dashboard error:", error);
      setOverviewError(error.message || "Finance data unavailable");
      setOverview((prev) =>
        prev ?? {
          month: new Date().toISOString(),
          projectedMonth: 0,
          collectedMonth: 0,
          varianceMonth: 0,
          totalCollected: 0,
          totalOutstanding: 0,
          totalFees: 0,
          collectionRate: 0,
        }
      );
      toast({
        title: "Error",
        description: error.message || "Failed to load finance dashboard",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFinanceDashboard();
  }, []);

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

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!overview) {
    return null;
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

        {overviewError && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                Finance data unavailable
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {overviewError}. Record collections or projections to populate the dashboard.
              </p>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Projected (Month)</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">KES {overview.projectedMonth.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Current month plan</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Collected (Month)</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">KES {overview.collectedMonth.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Current month actual</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Variance</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">KES {overview.varianceMonth.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Projected vs collected</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Outstanding</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">KES {overview.totalOutstanding.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Across all jobs</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Collection Rate</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{overview.collectionRate.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground">Collected vs fees</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Projection vs Collection</CardTitle>
              <CardDescription>Last six months overview.</CardDescription>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthChart}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip formatter={(value) => `KES ${Number(value).toLocaleString()}`} />
                  <Legend />
                  <Bar dataKey="projected" fill="hsl(var(--primary))" />
                  <Bar dataKey="collected" fill="hsl(var(--secondary))" />
                </BarChart>
              </ResponsiveContainer>
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
                    <p className="text-2xl font-bold">KES {overview.totalCollected.toLocaleString()}</p>
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
                    <p className="text-2xl font-bold">KES {overview.projectedMonth.toLocaleString()}</p>
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
                    <p className="text-2xl font-bold">KES {overview.totalOutstanding.toLocaleString()}</p>
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
                    <p className="text-2xl font-bold">KES {totalProfit.toLocaleString()}</p>
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
                    <p className="text-2xl font-bold">KES {totalAllocated.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Latest allocations</p>
                  </div>
                  <p className="text-xs text-muted-foreground">Allocations logged: {allocations.length}</p>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/finance-allocations">View allocations</Link>
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="space-y-1">
                  <CardTitle className="text-base">Reports</CardTitle>
                  <CardDescription>Exportable finance insights.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FileSpreadsheet className="h-4 w-4" />
                    Summaries, trends, and exports
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/reports">Open reports</Link>
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
