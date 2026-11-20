import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import PageLoader from '@/components/ui/page-loader';
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AnalyticsChartShell,
  AnalyticsGradientDefs,
  AnalyticsLegendContent,
  AnalyticsTooltipContent,
  analyticsAxisProps,
  analyticsColorAt,
  analyticsDonutProps,
  analyticsGradientFill,
  analyticsGridProps,
} from "@/components/ui/analytics-chart";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetch } from "@/lib/api";
import {
  writeOffsAPI,
  type JobWriteOffResult,
  type TimeWriteOffResult,
} from "@/lib/api/writeOffs";


type JobProfitability = {
  jobId: number;
  jobCode: string | null;
  jobName: string;
  clientName: string;
  revenue: number;
  laborCost: number;
  approvedRequisitionCost: number;
  recoverableRequisitionCost?: number;
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

  const [writeOffPeriod, setWriteOffPeriod] = useState("monthly");
  const [writeOffTime, setWriteOffTime] = useState<TimeWriteOffResult | null>(null);
  const [writeOffJobs, setWriteOffJobs] = useState<JobWriteOffResult | null>(null);
  const [writeOffLoading, setWriteOffLoading] = useState(false);

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

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setWriteOffLoading(true);
        const data = await writeOffsAPI.getSummary({
          period: writeOffPeriod as any,
          date: new Date().toISOString().slice(0, 10),
        });
        if (cancelled) return;
        setWriteOffTime(data.time);
        setWriteOffJobs(data.jobs);
      } catch (error: any) {
        if (cancelled) return;
        if (error?.status !== 403) {
          console.error("Write-off load error:", error);
        }
        setWriteOffTime(null);
        setWriteOffJobs(null);
      } finally {
        if (!cancelled) setWriteOffLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [writeOffPeriod]);

  const formatMoney = (value?: number) =>
    `KES ${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  const formatHours = (value?: number) => `${Number(value || 0).toFixed(1)}h`;

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

  const totalRequisitionSpend = useMemo(
    () => filteredJobs.reduce((sum, job) => sum + (job.approvedRequisitionCost || 0), 0),
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

        <div className="grid gap-4 md:grid-cols-5">
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
              <CardTitle className="text-sm font-medium">Req Spend</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="metric-value">KES {totalRequisitionSpend.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Approved requisitions charged to jobs</p>
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
                <AnalyticsChartShell>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={profitOutcomeMix}
                        dataKey="value"
                        nameKey="name"
                        {...analyticsDonutProps}
                      >
                        <Cell fill="#22c55e" />
                        <Cell fill="#ef4444" />
                      </Pie>
                      <Legend content={<AnalyticsLegendContent />} />
                      <Tooltip
                        content={
                          <AnalyticsTooltipContent
                            valueFormatter={(value) => Number(value || 0).toFixed(0)}
                          />
                        }
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </AnalyticsChartShell>
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
                <AnalyticsChartShell>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={revenueCostMix}
                        dataKey="value"
                        nameKey="name"
                        {...analyticsDonutProps}
                      >
                        {revenueCostMix.map((entry, index) => (
                          <Cell key={`rev-cost-${entry.name}`} fill={analyticsColorAt(index)} />
                        ))}
                      </Pie>
                      <Legend content={<AnalyticsLegendContent />} />
                      <Tooltip
                        content={
                          <AnalyticsTooltipContent
                            valueFormatter={(value) => `KES ${Number(value || 0).toLocaleString()}`}
                          />
                        }
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </AnalyticsChartShell>
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
                  <TableHead className="text-right">Labor Cost</TableHead>
                  <TableHead className="text-right">Req Spend</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Profit</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredJobs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      No profitability records match the current filters.
                    </TableCell>
                  </TableRow>
                )}
                {filteredJobs.map((job) => (
                  <TableRow key={job.jobId}>
                    <TableCell>{job.jobCode || job.jobName}</TableCell>
                    <TableCell>{job.clientName}</TableCell>
                    <TableCell className="text-right">KES {job.revenue.toLocaleString()}</TableCell>
                    <TableCell className="text-right">KES {job.laborCost.toLocaleString()}</TableCell>
                    <TableCell className="text-right">KES {job.approvedRequisitionCost.toLocaleString()}</TableCell>
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
              <AnalyticsChartShell>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={marginDistribution}>
                    <AnalyticsGradientDefs items={[{ id: "marginDistributionCount", color: analyticsColorAt(1) }]} />
                    <CartesianGrid {...analyticsGridProps} />
                    <XAxis dataKey="label" {...analyticsAxisProps} />
                    <YAxis allowDecimals={false} />
                    <Tooltip
                      content={
                        <AnalyticsTooltipContent
                          valueFormatter={(value) => [Number(value || 0).toFixed(0), "Jobs"]}
                        />
                      }
                    />
                    <Bar
                      dataKey="count"
                      fill={analyticsGradientFill("marginDistributionCount")}
                      radius={[10, 10, 4, 4]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </AnalyticsChartShell>
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

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>Write-offs</CardTitle>
                <CardDescription>
                  Non-billable time write-offs and job over-servicing write-offs across the firm.
                </CardDescription>
              </div>
              <div className="w-full md:w-44">
                <Label htmlFor="writeOffPeriod">Period</Label>
                <select
                  id="writeOffPeriod"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={writeOffPeriod}
                  onChange={(event) => setWriteOffPeriod(event.target.value)}
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {writeOffLoading ? (
              <PageLoader message="Loading write-offs..." minHeightClassName="min-h-[160px]" />
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-4">
                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-muted-foreground">Time write-off value</p>
                    <p className="text-2xl font-bold text-rose-600">
                      {formatMoney(writeOffTime?.firm.writeOffValue)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {writeOffTime?.label || "-"}
                    </p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-muted-foreground">Time write-off hours</p>
                    <p className="text-2xl font-bold">
                      {formatHours(writeOffTime?.firm.writeOffHours)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {Number(writeOffTime?.firm.writeOffRatePercent || 0).toFixed(1)}% of logged hours
                    </p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-muted-foreground">Job write-off value</p>
                    <p className="text-2xl font-bold text-rose-600">
                      {formatMoney(writeOffJobs?.firm.writeOffValue)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {writeOffJobs?.firm.jobsWithWriteOff || 0} jobs written off
                    </p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-muted-foreground">Job write-off rate</p>
                    <p className="text-2xl font-bold">
                      {Number(writeOffJobs?.firm.writeOffRatePercent || 0).toFixed(1)}%
                    </p>
                    <p className="text-xs text-muted-foreground">
                      of delivered value
                    </p>
                  </div>
                </div>

                <Tabs defaultValue="jobs">
                  <TabsList>
                    <TabsTrigger value="jobs">Job write-offs</TabsTrigger>
                    <TabsTrigger value="time">Time write-offs</TabsTrigger>
                  </TabsList>

                  <TabsContent value="jobs" className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-4">
                      <div className="rounded-md border p-3">
                        <p className="text-xs text-muted-foreground">Delivered value</p>
                        <p className="text-lg font-semibold">
                          {formatMoney(writeOffJobs?.firm.deliveredValue)}
                        </p>
                      </div>
                      <div className="rounded-md border p-3">
                        <p className="text-xs text-muted-foreground">Fee basis</p>
                        <p className="text-lg font-semibold">
                          {formatMoney(writeOffJobs?.firm.feeBasis)}
                        </p>
                      </div>
                      <div className="rounded-md border p-3">
                        <p className="text-xs text-muted-foreground">Write-off</p>
                        <p className="text-lg font-semibold text-rose-600">
                          {formatMoney(writeOffJobs?.firm.writeOffValue)}
                        </p>
                      </div>
                      <div className="rounded-md border p-3">
                        <p className="text-xs text-muted-foreground">Jobs affected</p>
                        <p className="text-lg font-semibold">
                          {writeOffJobs?.firm.jobsWithWriteOff || 0} / {writeOffJobs?.firm.jobCount || 0}
                        </p>
                      </div>
                    </div>

                    <div className="max-h-[420px] overflow-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Job</TableHead>
                            <TableHead>Client</TableHead>
                            <TableHead>Partner</TableHead>
                            <TableHead className="text-right">Delivered</TableHead>
                            <TableHead className="text-right">Non-billable</TableHead>
                            <TableHead className="text-right">Fee basis</TableHead>
                            <TableHead className="text-right">Write-off</TableHead>
                            <TableHead className="text-right">Write-off %</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(writeOffJobs?.topWriteOffs || []).length === 0 && (
                            <TableRow>
                              <TableCell colSpan={8} className="text-center text-muted-foreground">
                                No job write-offs for this period.
                              </TableCell>
                            </TableRow>
                          )}
                          {(writeOffJobs?.topWriteOffs || []).map((job) => (
                            <TableRow key={job.jobId}>
                              <TableCell>{job.jobCode || job.jobName}</TableCell>
                              <TableCell>{job.clientName}</TableCell>
                              <TableCell>{job.partnerName || "Unassigned"}</TableCell>
                              <TableCell className="text-right">{formatMoney(job.deliveredValue)}</TableCell>
                              <TableCell className="text-right">{formatMoney(job.nonBillableValue)}</TableCell>
                              <TableCell className="text-right">{formatMoney(job.feeBasis)}</TableCell>
                              <TableCell className="text-right font-semibold text-rose-600">
                                {formatMoney(job.writeOffValue)}
                              </TableCell>
                              <TableCell className="text-right">{job.writeOffPercent.toFixed(1)}%</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="rounded-md border">
                        <div className="border-b p-3 text-sm font-medium">By partner</div>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Partner</TableHead>
                              <TableHead className="text-right">Delivered</TableHead>
                              <TableHead className="text-right">Write-off</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(writeOffJobs?.byPartner || []).map((group) => (
                              <TableRow key={group.key}>
                                <TableCell>{group.name}</TableCell>
                                <TableCell className="text-right">{formatMoney(group.deliveredValue)}</TableCell>
                                <TableCell className="text-right text-rose-600">{formatMoney(group.writeOffValue)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      <div className="rounded-md border">
                        <div className="border-b p-3 text-sm font-medium">By department</div>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Department</TableHead>
                              <TableHead className="text-right">Delivered</TableHead>
                              <TableHead className="text-right">Write-off</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(writeOffJobs?.byDepartment || []).map((group) => (
                              <TableRow key={group.key}>
                                <TableCell>{group.name}</TableCell>
                                <TableCell className="text-right">{formatMoney(group.deliveredValue)}</TableCell>
                                <TableCell className="text-right text-rose-600">{formatMoney(group.writeOffValue)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="time" className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-4">
                      <div className="rounded-md border p-3">
                        <p className="text-xs text-muted-foreground">Write-off value</p>
                        <p className="text-lg font-semibold text-rose-600">
                          {formatMoney(writeOffTime?.firm.writeOffValue)}
                        </p>
                      </div>
                      <div className="rounded-md border p-3">
                        <p className="text-xs text-muted-foreground">Write-off hours</p>
                        <p className="text-lg font-semibold">
                          {formatHours(writeOffTime?.firm.writeOffHours)}
                        </p>
                      </div>
                      <div className="rounded-md border p-3">
                        <p className="text-xs text-muted-foreground">Non-billable hours</p>
                        <p className="text-lg font-semibold">
                          {formatHours(writeOffTime?.firm.nonBillableHours)}
                        </p>
                      </div>
                      <div className="rounded-md border p-3">
                        <p className="text-xs text-muted-foreground">Write-off rate</p>
                        <p className="text-lg font-semibold">
                          {Number(writeOffTime?.firm.writeOffRatePercent || 0).toFixed(1)}%
                        </p>
                      </div>
                    </div>

                    <div className="max-h-[380px] overflow-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Employee</TableHead>
                            <TableHead>Department</TableHead>
                            <TableHead>Partner</TableHead>
                            <TableHead className="text-right">Non-billable</TableHead>
                            <TableHead className="text-right">Write-off hrs</TableHead>
                            <TableHead className="text-right">Write-off value</TableHead>
                            <TableHead className="text-right">Rate</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(writeOffTime?.byEmployee || []).length === 0 && (
                            <TableRow>
                              <TableCell colSpan={7} className="text-center text-muted-foreground">
                                No time write-offs for this period.
                              </TableCell>
                            </TableRow>
                          )}
                          {(writeOffTime?.byEmployee || []).map((employee) => (
                            <TableRow key={employee.key}>
                              <TableCell>{employee.name}</TableCell>
                              <TableCell>{employee.departmentName || "Unassigned"}</TableCell>
                              <TableCell>
                                {employee.partnerName ||
                                  (employee.partnerProfileId
                                    ? `Partner ${employee.partnerProfileId}`
                                    : "Unassigned")}
                              </TableCell>
                              <TableCell className="text-right">{formatHours(employee.nonBillableHours)}</TableCell>
                              <TableCell className="text-right">{formatHours(employee.writeOffHours)}</TableCell>
                              <TableCell className="text-right font-semibold text-rose-600">
                                {formatMoney(employee.writeOffValue)}
                              </TableCell>
                              <TableCell className="text-right">
                                {employee.writeOffRatePercent.toFixed(1)}%
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="rounded-md border">
                        <div className="border-b p-3 text-sm font-medium">By department</div>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Department</TableHead>
                              <TableHead className="text-right">Write-off hrs</TableHead>
                              <TableHead className="text-right">Write-off value</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(writeOffTime?.byDepartment || []).map((group) => (
                              <TableRow key={group.key}>
                                <TableCell>{group.name}</TableCell>
                                <TableCell className="text-right">{formatHours(group.writeOffHours)}</TableCell>
                                <TableCell className="text-right text-rose-600">{formatMoney(group.writeOffValue)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      <div className="rounded-md border">
                        <div className="border-b p-3 text-sm font-medium">By partner</div>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Partner</TableHead>
                              <TableHead className="text-right">Write-off hrs</TableHead>
                              <TableHead className="text-right">Write-off value</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(writeOffTime?.byPartner || []).map((group) => (
                              <TableRow key={group.key}>
                                <TableCell>{group.name}</TableCell>
                                <TableCell className="text-right">{formatHours(group.writeOffHours)}</TableCell>
                                <TableCell className="text-right text-rose-600">{formatMoney(group.writeOffValue)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>

                    <div className="rounded-md border">
                      <div className="border-b p-3 text-sm font-medium">By activity</div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Activity</TableHead>
                            <TableHead>Valuation</TableHead>
                            <TableHead className="text-right">Hours</TableHead>
                            <TableHead className="text-right">Write-off value</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(writeOffTime?.byActivity || []).map((activity) => (
                            <TableRow key={activity.key}>
                              <TableCell>{activity.name}</TableCell>
                              <TableCell>
                                {activity.valuation === "billing_rate" ? "Billing rate" : "Cost rate"}
                              </TableCell>
                              <TableCell className="text-right">{formatHours(activity.hours)}</TableCell>
                              <TableCell className="text-right text-rose-600">{formatMoney(activity.value)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>
                </Tabs>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
