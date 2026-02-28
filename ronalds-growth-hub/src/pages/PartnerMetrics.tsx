import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import PageLoader from '@/components/ui/page-loader';
import { apiFetch, proposalsAPI, surveysAPI } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DollarSign,
  TrendingUp,
  Users,
  Clock,
  Download,
  AlertTriangle,
} from "lucide-react";
import * as XLSX from "xlsx";

type PartnerSummary = {
  portfolio: {
    totalJobs: number;
    activeJobs: number;
    completedJobs: number;
    totalRevenueCollected: number;
    totalProfit: number;
    totalCost: number;
    totalFee: number;
    averageEfficiency: number;
    averageMargin: number;
    totalTeamSize: number;
  };
  clientFeedback?: {
    totalSurveys: number;
    completedSurveys: number;
    responseRate: number;
    avgOverallSatisfaction: number;
  };
  topJobs: Array<{
    jobId: number;
    jobCode: string | null;
    title: string;
    status: string;
    estimatedHours: number;
    actualHours: number;
    billableHours: number;
    feeAmount: number;
    amountCollected: number;
    costAmount: number;
    profit: number;
    efficiencyRatio: number;
    marginPercentage: number;
  }>;
  pendingTimeEntriesCount: number;
};

type AllocationPayload = {
  totals: {
    collectedAmount: number;
    allocatedAmount: number;
    totalProfit: number;
    totalLoss: number;
  };
  allocations: Array<{
    id: number;
    jobId: number;
    jobName: string;
    jobCode: string | null;
    clientName: string;
    employeeName: string;
    allocatedAmount: number;
    allocationPercentage: number;
    allocationMonth: string;
    employeeProfit: number;
    employeeLoss: number;
  }>;
};

type MonthlyPoint = {
  month: string;
  revenue: number;
  satisfaction: number;
};

type TeamAllocationRow = {
  employeeName: string;
  allocatedAmount: number;
  allocationPercentage: number;
  employeeProfit: number;
  employeeLoss: number;
};

const EMPTY_PARTNER_SUMMARY: PartnerSummary = {
  portfolio: {
    totalJobs: 0,
    activeJobs: 0,
    completedJobs: 0,
    totalRevenueCollected: 0,
    totalProfit: 0,
    totalCost: 0,
    totalFee: 0,
    averageEfficiency: 0,
    averageMargin: 0,
    totalTeamSize: 0,
  },
  clientFeedback: {
    totalSurveys: 0,
    completedSurveys: 0,
    responseRate: 0,
    avgOverallSatisfaction: 0,
  },
  topJobs: [],
  pendingTimeEntriesCount: 0,
};

const EMPTY_ALLOCATION_PAYLOAD: AllocationPayload = {
  totals: {
    collectedAmount: 0,
    allocatedAmount: 0,
    totalProfit: 0,
    totalLoss: 0,
  },
  allocations: [],
};

const PartnerMetrics = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState("current-year");
  const [summary, setSummary] = useState<PartnerSummary | null>(null);
  const [allocationAudit, setAllocationAudit] = useState<AllocationPayload | null>(null);
  const [proposalMetrics, setProposalMetrics] = useState<any>(null);
  const [surveyAnalytics, setSurveyAnalytics] = useState<any>(null);
  const [lossAlertCount, setLossAlertCount] = useState(0);

  const loadPartnerMetrics = async () => {
    try {
      setLoading(true);

      const [summaryResult, allocationResult, proposalResult, surveyResult, notificationsResult] = await Promise.allSettled([
        apiFetch<PartnerSummary>("GET", "/partners/dashboard-summary"),
        apiFetch<AllocationPayload>("GET", "/partners/allocations"),
        proposalsAPI.metrics(),
        surveysAPI.getAnalytics(),
        apiFetch<any>("GET", "/notifications?type=warning&status=unread&page=1&pageSize=50"),
      ]);

      if (summaryResult.status === "fulfilled") setSummary(summaryResult.value);
      if (allocationResult.status === "fulfilled") setAllocationAudit(allocationResult.value);
      if (proposalResult.status === "fulfilled") setProposalMetrics(proposalResult.value);
      if (surveyResult.status === "fulfilled") setSurveyAnalytics(surveyResult.value);

      if (notificationsResult.status === "fulfilled") {
        const payload: any = notificationsResult.value ?? {};
        const items = Array.isArray(payload)
          ? payload
          : Array.isArray(payload.data)
            ? payload.data
            : Array.isArray(payload.items)
              ? payload.items
              : Array.isArray(payload.notifications)
                ? payload.notifications
                : [];

        const lossAlerts = (Array.isArray(items) ? items : []).filter((item: any) => {
          const title = String(item?.title || "").toLowerCase();
          const message = String(item?.message || "").toLowerCase();
          return title.includes("loss") || message.includes("loss");
        });
        setLossAlertCount(lossAlerts.length);
      } else {
        setLossAlertCount(0);
      }
    } catch (error) {
      console.error("Error loading partner metrics", error);
      setSummary(null);
      setAllocationAudit(null);
      setProposalMetrics(null);
      setSurveyAnalytics(null);
      setLossAlertCount(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPartnerMetrics();
  }, []);

  const kpis = useMemo(() => {
    const baseSummary = summary ?? EMPTY_PARTNER_SUMMARY;

    const revenueCurrent = Number(baseSummary.portfolio.totalRevenueCollected || 0);
    const revenueTarget = Number(baseSummary.portfolio.totalFee || 0);
    const previousYear = Number(baseSummary.portfolio.totalRevenueCollected || 0);
    const growth = previousYear > 0 ? ((revenueCurrent - previousYear) / previousYear) * 100 : 0;

    const billableCurrent = baseSummary.topJobs.reduce((sum, job) => sum + Number(job.billableHours || 0), 0);
    const billableTarget = baseSummary.topJobs.reduce((sum, job) => sum + Number(job.estimatedHours || 0), 0);
    const billableUtilization = billableTarget > 0 ? (billableCurrent / billableTarget) * 100 : 0;

    return {
      revenue: {
        current: revenueCurrent,
        target: revenueTarget,
        previousYear,
        growth,
      },
      billableHours: {
        current: billableCurrent,
        target: billableTarget,
        utilization: billableUtilization,
      },
      clientMetrics: {
        totalClients: new Set((baseSummary.topJobs || []).map((job) => job.jobCode || `${job.jobId}`)).size,
        newClients: Number(proposalMetrics?.wonThisMonth || 0),
        retention: Number(baseSummary.clientFeedback?.responseRate || 0) * 100,
        satisfaction: Number(baseSummary.clientFeedback?.avgOverallSatisfaction || 0),
      },
      teamMetrics: {
        teamSize: Number(baseSummary.portfolio.totalTeamSize || 0),
        averageUtilization: Number(baseSummary.portfolio.averageEfficiency || 0),
        developmentScore: Number(surveyAnalytics?.averageRatings?.overall || 0),
      },
      businessDevelopment: {
        pipelineValue: Number(proposalMetrics?.pipelineValue || 0),
        conversionRate: Number(proposalMetrics?.conversionRate || 0),
        newOpportunities: Number(proposalMetrics?.hotLeads || 0),
      },
    };
  }, [summary, proposalMetrics, surveyAnalytics]);

  const monthlyPoints = useMemo<MonthlyPoint[]>(() => {
    const allocations = (allocationAudit ?? EMPTY_ALLOCATION_PAYLOAD).allocations || [];
    const now = new Date();

    const monthsToInclude =
      selectedPeriod === "quarter" ? 3 :
      selectedPeriod === "ytd" ? now.getMonth() + 1 :
      12;

    const startYear = selectedPeriod === "last-year" ? now.getFullYear() - 1 : now.getFullYear();
    const endMonth = selectedPeriod === "last-year" ? 11 : now.getMonth();

    const monthKeys: Array<{ key: string; label: string }> = [];
    for (let i = monthsToInclude - 1; i >= 0; i -= 1) {
      const month = endMonth - i;
      const date = new Date(startYear, month, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      monthKeys.push({
        key,
        label: date.toLocaleString("en-US", { month: "short" }),
      });
    }

    const revenueByMonth = new Map<string, number>();
    allocations.forEach((row) => {
      const allocationDate = new Date(row.allocationMonth);
      if (Number.isNaN(allocationDate.getTime())) return;
      const key = `${allocationDate.getFullYear()}-${String(allocationDate.getMonth() + 1).padStart(2, "0")}`;
      const current = revenueByMonth.get(key) || 0;
      revenueByMonth.set(key, current + Number(row.allocatedAmount || 0));
    });

    const surveyTrendMap = new Map<string, number>();
    (surveyAnalytics?.trends || []).forEach((trend: any) => {
      const monthLabel = String(trend?.month || "").slice(0, 3);
      if (!monthLabel) return;
      surveyTrendMap.set(monthLabel, Number(trend?.avgSatisfaction || 0));
    });

    return monthKeys.map((item) => ({
      month: item.label,
      revenue: revenueByMonth.get(item.key) || 0,
      satisfaction: surveyTrendMap.get(item.label) || Number(summary?.clientFeedback?.avgOverallSatisfaction || 0),
    }));
  }, [allocationAudit?.allocations, selectedPeriod, surveyAnalytics?.trends, summary?.clientFeedback?.avgOverallSatisfaction]); // eslint-disable-line react-hooks/exhaustive-deps

  const teamRows = useMemo(() => {
    const rows = allocationAudit?.allocations || [];
    const map = new Map<string, TeamAllocationRow>();

    rows.forEach((row) => {
      const key = row.employeeName || "Unknown";
      const current = map.get(key) || {
        employeeName: key,
        allocatedAmount: 0,
        allocationPercentage: 0,
        employeeProfit: 0,
        employeeLoss: 0,
      };

      current.allocatedAmount += Number(row.allocatedAmount || 0);
      current.allocationPercentage += Number(row.allocationPercentage || 0);
      current.employeeProfit += Number(row.employeeProfit || 0);
      current.employeeLoss += Number(row.employeeLoss || 0);
      map.set(key, current);
    });

    return Array.from(map.values())
      .map((row) => ({
        ...row,
        allocationPercentage: rows.length > 0 ? row.allocationPercentage / rows.filter((r) => r.employeeName === row.employeeName).length : 0,
      }))
      .sort((a, b) => b.allocatedAmount - a.allocatedAmount);
  }, [allocationAudit?.allocations]);

  const exportToExcel = () => {
    const performanceExportData = monthlyPoints.map((data) => ({
      Month: data.month,
      "Allocated Revenue (KES)": data.revenue,
      "Avg Satisfaction": Number(data.satisfaction || 0).toFixed(2),
    }));

    const jobExportData = (summary?.topJobs || []).map((job) => ({
      "Job Code": job.jobCode || "--",
      Job: job.title,
      Status: job.status,
      "Estimated Hours": job.estimatedHours,
      "Actual Hours": job.actualHours,
      "Billable Hours": job.billableHours,
      "Fee (KES)": job.feeAmount,
      "Collected (KES)": job.amountCollected,
      "Cost (KES)": job.costAmount,
      "Profit (KES)": job.profit,
      "Margin (%)": Number(job.marginPercentage || 0).toFixed(2),
      "Efficiency (%)": Number(job.efficiencyRatio || 0).toFixed(2),
    }));

    const teamExportData = teamRows.map((row) => ({
      Employee: row.employeeName,
      "Allocated Revenue (KES)": row.allocatedAmount,
      "Allocation (%)": Number(row.allocationPercentage || 0).toFixed(2),
      "Profit (KES)": row.employeeProfit,
      "Loss (KES)": row.employeeLoss,
      "Net (KES)": row.employeeProfit - row.employeeLoss,
    }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(performanceExportData), "Monthly Trend");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(jobExportData), "Top Jobs");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(teamExportData), "Team Allocation");
    XLSX.writeFile(workbook, "partner-metrics.xlsx");

    toast({
      title: "Export successful",
      description: "Partner metrics were exported to Excel.",
    });
  };

  if (loading) {
    return (
      <DashboardLayout>
        <PageLoader message="Loading..." />
      </DashboardLayout>
    );
  }

  const summaryData = summary ?? EMPTY_PARTNER_SUMMARY;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-3xl font-bold text-foreground">Partner Metrics</h2>
            <p className="text-muted-foreground">Live portfolio, allocation, and client performance metrics</p>
          </div>
          {lossAlertCount > 0 && (
            <Badge variant="destructive" className="flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Loss alerts {lossAlertCount}
            </Badge>
          )}
          <div className="flex items-center gap-3">
            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current-year">Current Year</SelectItem>
                <SelectItem value="last-year">Last Year</SelectItem>
                <SelectItem value="ytd">Year to Date</SelectItem>
                <SelectItem value="quarter">This Quarter</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={exportToExcel} title="Export to Excel">
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Revenue Collected</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">KES {(kpis.revenue.current / 1000000).toFixed(2)}M</div>
              <Progress value={kpis.revenue.target > 0 ? (kpis.revenue.current / kpis.revenue.target) * 100 : 0} className="h-2 mt-2" />
              <p className="text-xs text-muted-foreground mt-1">
                {kpis.revenue.target > 0 ? ((kpis.revenue.current / kpis.revenue.target) * 100).toFixed(1) : "0.0"}% of portfolio fee
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Utilization</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{kpis.billableHours.utilization.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground mt-1">
                {kpis.billableHours.current.toFixed(1)} billable hrs / {kpis.billableHours.target.toFixed(1)} estimated hrs
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Client Satisfaction</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{kpis.clientMetrics.satisfaction.toFixed(2)} / 5</div>
              <p className="text-xs text-muted-foreground mt-1">
                {summaryData.clientFeedback?.completedSurveys || 0} completed surveys
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pipeline</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">KES {(kpis.businessDevelopment.pipelineValue / 1000000).toFixed(2)}M</div>
              <p className="text-xs text-muted-foreground mt-1">
                Conversion {kpis.businessDevelopment.conversionRate.toFixed(1)}% - Hot leads {kpis.businessDevelopment.newOpportunities}
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="jobs">Job Performance</TabsTrigger>
            <TabsTrigger value="team">Team Allocation</TabsTrigger>
            <TabsTrigger value="trends">Trends</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Financial Summary</CardTitle>
                  <CardDescription>Portfolio-level collections, cost and margin.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between"><span>Collected Revenue</span><span className="font-semibold">KES {summaryData.portfolio.totalRevenueCollected.toLocaleString()}</span></div>
                  <div className="flex justify-between"><span>Total Cost</span><span className="font-semibold">KES {summaryData.portfolio.totalCost.toLocaleString()}</span></div>
                  <div className="flex justify-between"><span>Total Profit</span><span className="font-semibold">KES {summaryData.portfolio.totalProfit.toLocaleString()}</span></div>
                  <div className="flex justify-between"><span>Average Margin</span><span className="font-semibold">{summaryData.portfolio.averageMargin.toFixed(2)}%</span></div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Portfolio Health</CardTitle>
                  <CardDescription>Open jobs, completion and pending approvals.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between"><span>Total Jobs</span><span className="font-semibold">{summaryData.portfolio.totalJobs}</span></div>
                  <div className="flex justify-between"><span>Active Jobs</span><span className="font-semibold">{summaryData.portfolio.activeJobs}</span></div>
                  <div className="flex justify-between"><span>Completed Jobs</span><span className="font-semibold">{summaryData.portfolio.completedJobs}</span></div>
                  <div className="flex justify-between"><span>Pending Time Approvals</span><span className="font-semibold">{summaryData.pendingTimeEntriesCount}</span></div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="jobs" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Top Jobs</CardTitle>
                <CardDescription>Highest-impact jobs by recent portfolio ranking.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Job</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Hours</TableHead>
                      <TableHead>Collected</TableHead>
                      <TableHead>Profit</TableHead>
                      <TableHead>Margin</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summaryData.topJobs.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">
                          No job data yet.
                        </TableCell>
                      </TableRow>
                    )}
                    {summaryData.topJobs.map((job) => (
                      <TableRow key={job.jobId}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{job.title}</p>
                            <p className="text-xs text-muted-foreground">{job.jobCode || `JOB-${job.jobId}`}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={job.status === "completed" ? "default" : "outline"}>{job.status}</Badge>
                        </TableCell>
                        <TableCell>{job.actualHours.toFixed(1)} / {job.estimatedHours.toFixed(1)}</TableCell>
                        <TableCell>KES {job.amountCollected.toLocaleString()}</TableCell>
                        <TableCell>KES {job.profit.toLocaleString()}</TableCell>
                        <TableCell>{job.marginPercentage.toFixed(2)}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="team" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Team Allocation</CardTitle>
                <CardDescription>Collections allocated to team members with profit/loss impact.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Allocated Revenue</TableHead>
                      <TableHead>Allocation %</TableHead>
                      <TableHead>Profit</TableHead>
                      <TableHead>Loss</TableHead>
                      <TableHead>Net</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teamRows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">No allocation data yet.</TableCell>
                      </TableRow>
                    )}
                    {teamRows.map((row) => (
                      <TableRow key={row.employeeName}>
                        <TableCell className="font-medium">{row.employeeName}</TableCell>
                        <TableCell>KES {row.allocatedAmount.toLocaleString()}</TableCell>
                        <TableCell>{row.allocationPercentage.toFixed(2)}%</TableCell>
                        <TableCell className="text-emerald-600">KES {row.employeeProfit.toLocaleString()}</TableCell>
                        <TableCell className="text-rose-600">KES {row.employeeLoss.toLocaleString()}</TableCell>
                        <TableCell>KES {(row.employeeProfit - row.employeeLoss).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="trends" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Monthly Revenue Trend</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {monthlyPoints.map((point) => (
                    <div key={point.month}>
                      <div className="flex justify-between text-sm mb-1">
                        <span>{point.month}</span>
                        <span className="font-medium">KES {point.revenue.toLocaleString()}</span>
                      </div>
                      <Progress value={Math.min(100, point.revenue / Math.max(1, kpis.revenue.target / 12) * 100)} className="h-2" />
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Client Trend</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {monthlyPoints.map((point) => (
                    <div key={`${point.month}-sat`} className="flex justify-between text-sm">
                      <span>{point.month}</span>
                      <span className="font-medium">{point.satisfaction.toFixed(2)} / 5</span>
                    </div>
                  ))}
                  <div className="pt-2 border-t text-sm text-muted-foreground">
                    Recommendation Rate: {Number(surveyAnalytics?.recommendationRate || 0).toFixed(2)}%
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default PartnerMetrics;

