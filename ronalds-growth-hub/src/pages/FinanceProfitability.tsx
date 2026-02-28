import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import PageLoader from '@/components/ui/page-loader';
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";


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

export default function FinanceProfitability() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [jobProfitability, setJobProfitability] = useState<JobProfitability[]>([]);
  const [search, setSearch] = useState("");
  const [marginFilter, setMarginFilter] = useState("");

  const loadProfitability = async () => {
    try {
      setLoading(true);
      const data = await apiFetch<JobProfitability[]>("GET", "/finance-dashboard/job-profitability");
      setJobProfitability(data);
    } catch (error: any) {
      console.error("Profitability error:", error);
      if (error?.status === 401) {
        navigate("/auth");
        return;
      }
      if (error?.status === 403) {
        setJobProfitability([]);
        return;
      }
      if (error?.status === 404) {
        setJobProfitability([]);
        return;
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfitability();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredJobs = useMemo(() => {
    return jobProfitability.filter((job) => {
      if (marginFilter === "positive" && job.margin <= 0) return false;
      if (marginFilter === "negative" && job.margin >= 0) return false;
      if (search.trim()) {
        const query = search.toLowerCase();
        const haystack = [job.jobCode, job.jobName, job.clientName]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [jobProfitability, marginFilter, search]);

  const totalRevenue = useMemo(
    () => filteredJobs.reduce((sum, job) => sum + (job.revenue || 0), 0),
    [filteredJobs]
  );

  const totalCost = useMemo(
    () => filteredJobs.reduce((sum, job) => sum + (job.cost || 0), 0),
    [filteredJobs]
  );

  const totalProfit = useMemo(
    () => filteredJobs.reduce((sum, job) => sum + (job.profit || 0), 0),
    [filteredJobs]
  );

  const averageMargin = useMemo(() => {
    if (filteredJobs.length === 0) return 0;
    const total = filteredJobs.reduce((sum, job) => sum + (job.margin || 0), 0);
    return total / filteredJobs.length;
  }, [filteredJobs]);

  const profitOutcomeMix = useMemo(() => {
    const profitableJobs = filteredJobs.filter((job) => Number(job.margin || 0) >= 0).length;
    const lossJobs = Math.max(0, filteredJobs.length - profitableJobs);
    return [
      { name: "Profitable", value: profitableJobs },
      { name: "Loss-making", value: lossJobs },
    ];
  }, [filteredJobs]);

  const revenueCostMix = useMemo(
    () => [
      { name: "Revenue", value: Math.max(0, totalRevenue) },
      { name: "Cost", value: Math.max(0, totalCost) },
    ],
    [totalRevenue, totalCost]
  );

  const chartPalette = ["#0ea5e9", "#22c55e", "#f97316", "#ef4444", "#6366f1", "#14b8a6"];

  const marginDistribution = useMemo(() => {
    const buckets = [
      { label: "< -20%", min: -Infinity, max: -20 },
      { label: "-20% to 0%", min: -20, max: 0 },
      { label: "0% to 20%", min: 0, max: 20 },
      { label: "20% to 40%", min: 20, max: 40 },
      { label: "40%+", min: 40, max: Infinity },
    ];
    return buckets.map((bucket) => ({
      label: bucket.label,
      count: filteredJobs.filter((job) => job.margin >= bucket.min && job.margin < bucket.max).length,
    }));
  }, [filteredJobs]);

  const profitTrend = useMemo(() => {
    const map = new Map<string, { month: string; profit: number }>();
    filteredJobs.forEach((job) => {
      const monthKey = job.jobName ? job.jobName : job.jobId.toString();
      const monthLabel = job.jobName ? job.jobName : `Job ${job.jobId}`;
      if (!map.has(monthKey)) {
        map.set(monthKey, { month: monthLabel, profit: 0 });
      }
      const entry = map.get(monthKey)!;
      entry.profit += job.profit || 0;
    });
    return Array.from(map.values()).slice(0, 6);
  }, [filteredJobs]);

  if (loading) {
    return (
      <DashboardLayout>
        <PageLoader message="Loading..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold">Profitability</h1>
          <p className="text-muted-foreground">Review profitability by job and overall margin performance.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="metric-value">KES {totalRevenue.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Total revenue tracked</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Cost</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="metric-value">KES {totalCost.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Total delivery cost</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Profit</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="metric-value">KES {totalProfit.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Estimated profit</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Avg Margin</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="metric-value">{averageMargin.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground">Average job margin</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Profitability Outcome Mix</CardTitle>
              <CardDescription>Jobs split by positive vs negative margins.</CardDescription>
            </CardHeader>
            <CardContent className="h-64">
              {filteredJobs.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  No jobs to evaluate yet.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={profitOutcomeMix}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={55}
                      outerRadius={88}
                      paddingAngle={2}
                    >
                      <Cell fill="#22c55e" />
                      <Cell fill="#ef4444" />
                    </Pie>
                    <Legend verticalAlign="bottom" height={18} />
                    <Tooltip formatter={(value: number) => Number(value || 0).toFixed(0)} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Revenue vs Cost Mix</CardTitle>
              <CardDescription>Current financial composition.</CardDescription>
            </CardHeader>
            <CardContent className="h-64">
              {(totalRevenue <= 0 && totalCost <= 0) ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  No revenue/cost data yet.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={revenueCostMix}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={55}
                      outerRadius={88}
                      paddingAngle={2}
                    >
                      {revenueCostMix.map((entry, index) => (
                        <Cell key={`rev-cost-${entry.name}`} fill={chartPalette[index % chartPalette.length]} />
                      ))}
                    </Pie>
                    <Legend verticalAlign="bottom" height={18} />
                    <Tooltip formatter={(value: number) => `KES ${Number(value || 0).toLocaleString()}`} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>Find specific jobs or margin profiles.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-[200px_1fr]">
            <div className="space-y-2">
              <Label htmlFor="marginFilter">Margin</Label>
              <select
                id="marginFilter"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={marginFilter}
                onChange={(event) => setMarginFilter(event.target.value)}
              >
                <option value="">All margins</option>
                <option value="positive">Profit only</option>
                <option value="negative">Loss only</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="profitabilitySearch">Search</Label>
              <Input
                id="profitabilitySearch"
                placeholder="Job, client, or code"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Job Profitability</CardTitle>
            <CardDescription>Revenue, cost, and margin by job.</CardDescription>
          </CardHeader>
          <CardContent className="max-h-[640px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Profit</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredJobs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No profitability records match the current filters.
                    </TableCell>
                  </TableRow>
                )}
                {filteredJobs.map((job) => (
                  <TableRow key={job.jobId}>
                    <TableCell>{job.jobCode || job.jobName}</TableCell>
                    <TableCell>{job.clientName}</TableCell>
                    <TableCell className="text-right">KES {job.revenue.toLocaleString()}</TableCell>
                    <TableCell className="text-right">KES {job.cost.toLocaleString()}</TableCell>
                    <TableCell className="text-right">KES {job.profit.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{job.margin.toFixed(1)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Margin Distribution</CardTitle>
            <CardDescription>How jobs are spread across margin bands.</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            {filteredJobs.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No profitability data to chart yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={marginDistribution}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" fontSize={12} />
                  <YAxis allowDecimals={false} />
                  <Tooltip formatter={(value: number) => [value, "Jobs"]} />
                  <Bar dataKey="count" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              )}
            </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Profitability Highlights</CardTitle>
            <CardDescription>Top profit and loss drivers.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {filteredJobs.length === 0 ? (
              <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                No profitability highlights yet.
              </div>
            ) : (
              filteredJobs
                .slice()
                .sort((a, b) => (b.profit || 0) - (a.profit || 0))
                .slice(0, 5)
                .map((job) => (
                  <div key={job.jobId} className="flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium">{job.jobCode || job.jobName}</p>
                      <p className="text-xs text-muted-foreground">{job.clientName}</p>
                    </div>
                    <div className="text-right">
                      <p className={job.profit < 0 ? "text-rose-600 font-semibold" : "font-semibold"}>
                        KES {job.profit.toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground">{job.margin.toFixed(1)}% margin</p>
                    </div>
                  </div>
                ))
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
