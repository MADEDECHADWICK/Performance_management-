import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { BarChart3, DollarSign, TrendingUp, AlertCircle } from "lucide-react";
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

type ClientOption = { id: number; clientName: string };
type JobOption = { id: number; jobCode: string | null; jobName: string };

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
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [jobs, setJobs] = useState<JobOption[]>([]);

  const [paymentForm, setPaymentForm] = useState({
    clientId: "",
    jobId: "",
    paymentAmount: "",
    paymentDate: "",
    paymentMethod: "",
    referenceNumber: "",
  });

  const [projectionForm, setProjectionForm] = useState({
    clientId: "",
    departmentId: "",
    monthYear: "",
    projectedAmount: "",
  });

  const loadFinanceDashboard = async () => {
    try {
      setLoading(true);
      const overviewData = await apiFetch<FinanceOverview>("GET", "/finance-dashboard/overview");
      setOverview(overviewData);
      setOverviewError(null);

      const results = await Promise.allSettled([
        apiFetch<Collection[]>("GET", "/finance-dashboard/collections?limit=15"),
        apiFetch<Projection[]>("GET", "/finance-dashboard/projections"),
        apiFetch<ClientBalance[]>("GET", "/finance-dashboard/client-balances"),
        apiFetch<JobProfitability[]>("GET", "/finance-dashboard/job-profitability"),
        apiFetch<RevenueAllocation[]>("GET", "/finance-dashboard/revenue-allocations"),
        apiFetch<{ data: ClientOption[] } | ClientOption[]>("GET", "/clients?page=1&pageSize=100"),
        apiFetch<{ data: JobOption[] } | JobOption[]>("GET", "/jobs?page=1&pageSize=100"),
      ]);

      const [
        collectionsResult,
        projectionsResult,
        balancesResult,
        profitabilityResult,
        allocationsResult,
        clientsResult,
        jobsResult,
      ] = results;

      if (collectionsResult.status === "fulfilled") setCollections(collectionsResult.value);
      if (projectionsResult.status === "fulfilled") setProjections(projectionsResult.value);
      if (balancesResult.status === "fulfilled") setClientBalances(balancesResult.value);
      if (profitabilityResult.status === "fulfilled") setJobProfitability(profitabilityResult.value);
      if (allocationsResult.status === "fulfilled") setAllocations(allocationsResult.value);

      if (clientsResult.status === "fulfilled") {
        const resolvedClients = Array.isArray(clientsResult.value)
          ? clientsResult.value
          : (clientsResult.value as any).data || [];
        setClients(resolvedClients);
      }

      if (jobsResult.status === "fulfilled") {
        const resolvedJobs = Array.isArray(jobsResult.value)
          ? jobsResult.value
          : (jobsResult.value as any).data || [];
        setJobs(resolvedJobs);
      }
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

  const handlePaymentSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await apiFetch("POST", "/finance-dashboard/collections", {
        clientId: paymentForm.clientId,
        jobId: paymentForm.jobId || null,
        paymentAmount: Number(paymentForm.paymentAmount),
        paymentDate: paymentForm.paymentDate,
        paymentMethod: paymentForm.paymentMethod || null,
        referenceNumber: paymentForm.referenceNumber || null,
      });

      toast({ title: "Payment recorded", description: "Collection saved successfully." });
      setPaymentForm({
        clientId: "",
        jobId: "",
        paymentAmount: "",
        paymentDate: "",
        paymentMethod: "",
        referenceNumber: "",
      });
      await loadFinanceDashboard();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to record payment",
        variant: "destructive",
      });
    }
  };

  const handleProjectionSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await apiFetch("POST", "/finance-dashboard/projections", {
        clientId: projectionForm.clientId || null,
        departmentId: projectionForm.departmentId || null,
        monthYear: projectionForm.monthYear,
        projectedAmount: Number(projectionForm.projectedAmount),
      });

      toast({ title: "Projection saved", description: "Revenue projection updated." });
      setProjectionForm({
        clientId: "",
        departmentId: "",
        monthYear: "",
        projectedAmount: "",
      });
      await loadFinanceDashboard();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save projection",
        variant: "destructive",
      });
    }
  };

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
          <h1 className="text-3xl font-bold">Finance Dashboard</h1>
          <p className="text-muted-foreground">
            Collections, projections, allocations, and profitability insights.
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
              <CardTitle>Record Collection</CardTitle>
              <CardDescription>Log incoming payments by client and job.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handlePaymentSubmit}>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="clientId">Client</Label>
                    <select
                      id="clientId"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={paymentForm.clientId}
                      onChange={(event) =>
                        setPaymentForm((prev) => ({ ...prev, clientId: event.target.value }))
                      }
                      required
                    >
                      <option value="">Select client</option>
                      {clients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.clientName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="jobId">Job (optional)</Label>
                    <select
                      id="jobId"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={paymentForm.jobId}
                      onChange={(event) =>
                        setPaymentForm((prev) => ({ ...prev, jobId: event.target.value }))
                      }
                    >
                      <option value="">Select job</option>
                      {jobs.map((job) => (
                        <option key={job.id} value={job.id}>
                          {job.jobCode ? `${job.jobCode} - ${job.jobName}` : job.jobName}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="paymentAmount">Amount (KES)</Label>
                    <Input
                      id="paymentAmount"
                      type="number"
                      value={paymentForm.paymentAmount}
                      onChange={(event) =>
                        setPaymentForm((prev) => ({ ...prev, paymentAmount: event.target.value }))
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="paymentDate">Payment Date</Label>
                    <Input
                      id="paymentDate"
                      type="date"
                      value={paymentForm.paymentDate}
                      onChange={(event) =>
                        setPaymentForm((prev) => ({ ...prev, paymentDate: event.target.value }))
                      }
                      required
                    />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="paymentMethod">Payment Method</Label>
                    <Input
                      id="paymentMethod"
                      value={paymentForm.paymentMethod}
                      onChange={(event) =>
                        setPaymentForm((prev) => ({ ...prev, paymentMethod: event.target.value }))
                      }
                      placeholder="Bank, M-Pesa, EFT"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="referenceNumber">Reference</Label>
                    <Input
                      id="referenceNumber"
                      value={paymentForm.referenceNumber}
                      onChange={(event) =>
                        setPaymentForm((prev) => ({ ...prev, referenceNumber: event.target.value }))
                      }
                      placeholder="Receipt / Ref No"
                    />
                  </div>
                </div>
                <Button type="submit">Save Payment</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Add Projection</CardTitle>
              <CardDescription>Set monthly collection targets.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleProjectionSubmit}>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="projectionClientId">Client (optional)</Label>
                    <select
                      id="projectionClientId"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={projectionForm.clientId}
                      onChange={(event) =>
                        setProjectionForm((prev) => ({ ...prev, clientId: event.target.value }))
                      }
                    >
                      <option value="">All clients</option>
                      {clients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.clientName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="monthYear">Month</Label>
                    <Input
                      id="monthYear"
                      type="month"
                      value={projectionForm.monthYear}
                      onChange={(event) =>
                        setProjectionForm((prev) => ({ ...prev, monthYear: event.target.value }))
                      }
                      required
                    />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="projectedAmount">Projected Amount</Label>
                    <Input
                      id="projectedAmount"
                      type="number"
                      value={projectionForm.projectedAmount}
                      onChange={(event) =>
                        setProjectionForm((prev) => ({ ...prev, projectedAmount: event.target.value }))
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="departmentId">Department ID (optional)</Label>
                    <Input
                      id="departmentId"
                      value={projectionForm.departmentId}
                      onChange={(event) =>
                        setProjectionForm((prev) => ({ ...prev, departmentId: event.target.value }))
                      }
                      placeholder="Leave blank for firm-wide"
                    />
                  </div>
                </div>
                <Button type="submit" variant="outline">
                  Save Projection
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

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
                  <TableHead>Job</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Reference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {collections.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>{new Date(payment.paymentDate).toLocaleDateString()}</TableCell>
                    <TableCell>{payment.clientName}</TableCell>
                    <TableCell>{payment.jobCode || payment.jobName || "N/A"}</TableCell>
                    <TableCell className="text-right">KES {payment.paymentAmount.toLocaleString()}</TableCell>
                    <TableCell>{payment.referenceNumber || "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Client Balances</CardTitle>
              <CardDescription>Outstanding balances by client.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead className="text-right">Fees</TableHead>
                    <TableHead className="text-right">Collected</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientBalances.map((client) => (
                    <TableRow key={client.clientId}>
                      <TableCell>{client.clientName}</TableCell>
                      <TableCell className="text-right">KES {client.totalFee.toLocaleString()}</TableCell>
                      <TableCell className="text-right">KES {client.totalCollected.toLocaleString()}</TableCell>
                      <TableCell className="text-right">KES {client.balance.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Job Profitability</CardTitle>
              <CardDescription>Revenue vs cost per job.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobProfitability.slice(0, 8).map((job) => (
                    <TableRow key={job.jobId}>
                      <TableCell>{job.jobCode || job.jobName}</TableCell>
                      <TableCell className="text-right">KES {job.revenue.toLocaleString()}</TableCell>
                      <TableCell className="text-right">KES {job.cost.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{job.margin.toFixed(1)}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Revenue Allocations</CardTitle>
            <CardDescription>Latest allocations by employee.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Job</TableHead>
                  <TableHead className="text-right">Allocated</TableHead>
                  <TableHead className="text-right">Profit</TableHead>
                  <TableHead className="text-right">Loss</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allocations.slice(0, 10).map((allocation) => (
                  <TableRow key={allocation.id}>
                    <TableCell>{allocation.employeeName}</TableCell>
                    <TableCell>{allocation.jobCode || allocation.jobName}</TableCell>
                    <TableCell className="text-right">KES {allocation.allocatedAmount.toLocaleString()}</TableCell>
                    <TableCell className="text-right">KES {allocation.employeeProfit.toLocaleString()}</TableCell>
                    <TableCell className="text-right">KES {allocation.employeeLoss.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
