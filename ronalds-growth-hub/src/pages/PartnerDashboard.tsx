import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { useNavigate } from 'react-router-dom';
import { authAPI, apiFetch } from '@/lib/api';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  Users,
  Clock,
  CheckCircle2,
  AlertCircle,
  Briefcase,
} from 'lucide-react';

interface PortfolioMetrics {
  totalJobs: number;
  activeJobs: number;
  completedJobs: number;
  totalRevenueCollected: number;
  totalProfit: number;
  averageEfficiency: number;
  averageMargin: number;
  totalTeamSize: number;
}

interface JobSummary {
  jobId: number;
  jobCode: string | null;
  jobName: string;
  title: string;
  status: string;
  estimatedHours: number;
  actualHours: number;
  billableHours: number;
  amountCollected: number;
  profit: number;
  efficiencyRatio: number;
  marginPercentage: number;
}

interface DashboardSummary {
  portfolio: PortfolioMetrics;
  topJobs: JobSummary[];
  pendingTimeEntriesCount: number;
}

interface PersonalPerformance {
  overallScore: number;
  revenue: number;
  netProfit: number;
  utilizationRate: number;
}

interface NotificationItem {
  id: number;
  title: string;
  message: string;
  actionRequired?: boolean;
  isRead?: boolean;
  link?: string | null;
  createdAt?: string;
}

const PartnerDashboard = () => {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [personalPerformance, setPersonalPerformance] = useState<PersonalPerformance | null>(null);
  const [alerts, setAlerts] = useState<NotificationItem[]>([]);
  const [pendingAlertsCount, setPendingAlertsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get user from auth to get profile_id
      const user = await authAPI.me();
      if (!user) {
        navigate('/auth');
        return;
      }

      const isPartner = user.is_partner ?? user.isPartner;
      if (!isPartner) {
        navigate('/dashboard');
        return;
      }

      const data = await apiFetch('GET', '/partners/dashboard-summary');
      setSummary(data);

      await loadAlerts();
      await loadPersonalPerformance();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      console.error('Dashboard error:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadAlerts = async () => {
    try {
      const response = await apiFetch('GET', '/notifications?status=unread&type=action&pageSize=20');
      const payload = response?.data ?? response ?? {};
      const list = Array.isArray(payload.items) ? payload.items : payload.items?.items ?? [];
      setAlerts(list.slice(0, 4));
      setPendingAlertsCount(list.length);
    } catch (err) {
      console.error('Failed to load partner alerts', err);
    }
  };

  const loadPersonalPerformance = async () => {
    try {
      const performanceResponse = await apiFetch('GET', '/performance-scores/me');
      const performancePayload = (performanceResponse as any)?.data ?? performanceResponse;

      if (performancePayload?.financial && performancePayload?.overall) {
        const financial = performancePayload.financial;
        const utilizationPercent = Math.round((financial.utilizationRate || 0) * 100);

        setPersonalPerformance({
          overallScore: Math.round((performancePayload.overall.totalScore || 0) * 10) / 10,
          revenue: Number(financial.revenue || 0),
          netProfit: Number(financial.netProfit || 0),
          utilizationRate: utilizationPercent,
        });
      }
    } catch (err) {
      console.error('Error loading personal performance:', err);
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0,
    }).format(amount);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading dashboard...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <Card className="w-full max-w-md border-destructive">
            <CardContent className="pt-6">
              <div className="flex gap-4">
                <AlertCircle className="h-8 w-8 text-destructive flex-shrink-0" />
                <div>
                  <p className="font-semibold mb-2">Error Loading Dashboard</p>
                  <p className="text-sm text-muted-foreground">{error}</p>
                  <Button
                    onClick={loadDashboardData}
                    className="mt-4"
                    size="sm"
                  >
                    Retry
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const portfolio = summary?.portfolio;

  return (
    <DashboardLayout>
      <div className="space-y-8 p-8">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Partner Dashboard</h1>
          <p className="text-muted-foreground">
            Manage your portfolio of jobs and track performance metrics
          </p>
        </div>

        {/* Key Metrics Grid */}
        {personalPerformance && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">My Overall Score</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{personalPerformance.overallScore}</div>
                <p className="text-xs text-muted-foreground">Financial + non-financial</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">My Revenue</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  KES {personalPerformance.revenue.toFixed(0)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">My Net Profit</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  KES {personalPerformance.netProfit.toFixed(0)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Utilization</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {personalPerformance.utilizationRate}%
                </div>
                <p className="text-xs text-muted-foreground">Billable vs allocated</p>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Jobs</CardTitle>
              <Briefcase className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{portfolio?.totalJobs || 0}</div>
              <p className="text-xs text-muted-foreground">
                {portfolio?.activeJobs || 0} active
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(portfolio?.totalRevenueCollected || 0)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Profit</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(portfolio?.totalProfit || 0)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Efficiency</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {(portfolio?.averageEfficiency || 0).toFixed(1)}%
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Margin</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {(portfolio?.averageMargin || 0).toFixed(1)}%
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Team Size</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {portfolio?.totalTeamSize || 0}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Approvals</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {pendingAlertsCount || summary?.pendingTimeEntriesCount || 0}
              </div>
              <p className="text-xs text-muted-foreground">Awaiting action</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs for different views */}
        <Tabs defaultValue="jobs" className="space-y-4">
          <TabsList>
            <TabsTrigger value="jobs">Top Jobs</TabsTrigger>
            <TabsTrigger value="details">Portfolio Details</TabsTrigger>
          </TabsList>

          <TabsContent value="jobs" className="space-y-4">
            {alerts.length > 0 && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Pending Alerts</CardTitle>
                    <CardDescription>Role-specific actions that need attention.</CardDescription>
                  </div>
                  <Button variant="outline" onClick={() => navigate('/notifications')}>
                    View all
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  {alerts.map((alert) => (
                    <div key={alert.id} className="rounded-md border p-3">
                      <p className="font-medium">{alert.title}</p>
                      <p className="text-sm text-muted-foreground">{alert.message}</p>
                      {alert.link && (
                        <Button
                          className="mt-2"
                          size="sm"
                          variant="outline"
                          onClick={() => navigate(alert.link!)}
                        >
                          Review
                        </Button>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Top Performing Jobs</CardTitle>
                <CardDescription>
                  Financial performance and metrics for your top jobs
                </CardDescription>
              </CardHeader>
              <CardContent>
                {summary?.topJobs && summary.topJobs.length > 0 ? (
                  <div className="space-y-4">
                    {summary.topJobs.map((job) => (
                      <div
                        key={job.jobId}
                        className="flex items-center justify-between border-b pb-4 last:border-0"
                      >
                        <div className="space-y-1 flex-1">
                          <p className="font-semibold">{job.title}</p>
                          <p className="text-sm text-muted-foreground">
                            {job.jobCode || `Job #${job.jobId}`}
                          </p>
                        </div>
                        <div className="flex gap-4 text-sm">
                          <div className="text-right">
                            <p className="text-muted-foreground text-xs">Efficiency</p>
                            <p className="font-medium">
                              {job.efficiencyRatio.toFixed(1)}%
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-muted-foreground text-xs">Margin</p>
                            <p className="font-medium">
                              {job.marginPercentage.toFixed(1)}%
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-muted-foreground text-xs">Profit</p>
                            <p className="font-medium">
                              {formatCurrency(job.profit)}
                            </p>
                          </div>
                          <Badge
                            variant={
                              job.status === 'completed' ? 'default' : 'secondary'
                            }
                          >
                            {job.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Briefcase className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                    <p className="text-muted-foreground">No jobs yet</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="details">
            <Card>
              <CardHeader>
                <CardTitle>Portfolio Summary</CardTitle>
                <CardDescription>
                  Detailed breakdown of your portfolio performance
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                  <div>
                    <p className="text-sm text-muted-foreground">Completed Jobs</p>
                    <p className="text-2xl font-bold">
                      {portfolio?.completedJobs || 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Active Jobs</p>
                    <p className="text-2xl font-bold">
                      {portfolio?.activeJobs || 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Revenue</p>
                    <p className="text-2xl font-bold">
                      {formatCurrency(portfolio?.totalRevenueCollected || 0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Profit</p>
                    <p className="text-2xl font-bold">
                      {formatCurrency(portfolio?.totalProfit || 0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Avg Efficiency</p>
                    <p className="text-2xl font-bold">
                      {(portfolio?.averageEfficiency || 0).toFixed(1)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Avg Margin</p>
                    <p className="text-2xl font-bold">
                      {(portfolio?.averageMargin || 0).toFixed(1)}%
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default PartnerDashboard;
