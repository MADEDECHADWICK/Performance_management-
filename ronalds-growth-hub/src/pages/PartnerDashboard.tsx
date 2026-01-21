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
  job_id: number;
  job_code: string | null;
  job_name: string;
  title: string;
  status: string;
  estimated_hours: number;
  actual_hours: number;
  billable_hours: number;
  amount_collected: number;
  profit: number;
  efficiency_ratio: number;
  margin_percentage: number;
}

interface DashboardSummary {
  portfolio: PortfolioMetrics;
  topJobs: JobSummary[];
  pendingTimeEntriesCount: number;
}

const PartnerDashboard = () => {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
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

      const data = await apiFetch('GET', `/partner/dashboard-summary?user_id=${user.id}`);
      setSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      console.error('Dashboard error:', err);
    } finally {
      setLoading(false);
    }
  };

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
                ${(portfolio?.totalRevenueCollected || 0).toFixed(0)}
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
                ${(portfolio?.totalProfit || 0).toFixed(0)}
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
                {summary?.pendingTimeEntriesCount || 0}
              </div>
              <p className="text-xs text-muted-foreground">Time entries</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs for different views */}
        <Tabs defaultValue="jobs" className="space-y-4">
          <TabsList>
            <TabsTrigger value="jobs">Top Jobs</TabsTrigger>
            <TabsTrigger value="details">Portfolio Details</TabsTrigger>
          </TabsList>

          <TabsContent value="jobs">
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
                        key={job.job_id}
                        className="flex items-center justify-between border-b pb-4 last:border-0"
                      >
                        <div className="space-y-1 flex-1">
                          <p className="font-semibold">{job.title}</p>
                          <p className="text-sm text-muted-foreground">
                            {job.job_code || `Job #${job.job_id}`}
                          </p>
                        </div>
                        <div className="flex gap-4 text-sm">
                          <div className="text-right">
                            <p className="text-muted-foreground text-xs">Efficiency</p>
                            <p className="font-medium">
                              {job.efficiency_ratio.toFixed(1)}%
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-muted-foreground text-xs">Margin</p>
                            <p className="font-medium">
                              {job.margin_percentage.toFixed(1)}%
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-muted-foreground text-xs">Profit</p>
                            <p className="font-medium">
                              ${job.profit.toFixed(0)}
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
                      ${(portfolio?.totalRevenueCollected || 0).toFixed(0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Profit</p>
                    <p className="text-2xl font-bold">
                      ${(portfolio?.totalProfit || 0).toFixed(0)}
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
