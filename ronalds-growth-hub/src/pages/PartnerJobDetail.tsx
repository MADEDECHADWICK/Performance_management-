import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { authAPI } from '@/integrations/apiClient';
import DashboardLayout from '@/components/DashboardLayout';
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
  AlertCircle,
  ArrowLeft,
  DollarSign,
  Clock,
  CheckCircle2,
  Users,
  TrendingUp,
  AlertTriangle,
  CheckCheck,
} from 'lucide-react';

interface JobMetrics {
  jobId: number;
  jobCode: string | null;
  estimatedHours: number;
  actualHours: number;
  billableHours: number;
  estimatedCost: number;
  actualCost: number;
  revenueCollected: number;
  fees: number;
  profit: number;
  efficiency: number;
  marginPercentage: number;
  utilizationRate: number;
  teamSize: number;
  completionPercentage: number;
}

interface TeamMember {
  employeeId: number;
  employeeName: string;
  totalHours: number;
  billableHours: number;
  cost: number;
  billableCost: number;
  utilizationPercentage: number;
}

interface TimeEntry {
  id: number;
  date_worked: string;
  hours: number;
  billable: boolean;
  status: string;
  employee: {
    id: number;
    first_name: string;
    last_name: string;
    hourly_rate: number;
  };
  task?: {
    id: number;
    title: string;
  };
}

const PartnerJobDetail = () => {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<any>(null);
  const [clientName, setClientName] = useState<string>('');
  const [metrics, setMetrics] = useState<JobMetrics | null>(null);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [pendingEntries, setPendingEntries] = useState<TimeEntry[]>([]);
  const [progressStatus, setProgressStatus] = useState<'early' | 'ontime' | 'overdue'>('ontime');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approvingEntries, setApprovingEntries] = useState<Set<number>>(new Set());

  useEffect(() => {
    loadJobDetails();
  }, [jobId]);

  const loadJobDetails = async () => {
    try {
      setLoading(true);
      setError(null);

      const user = await authAPI.me();
      if (!user || !user.profile_id) {
        throw new Error('Missing user information');
      }

      if (!jobId) {
        throw new Error('Missing job ID');
      }

      // Load job details
      const jobResponse = await fetch(
        `/api/partner/jobs/${jobId}`
      );
      if (!jobResponse.ok) {
        throw new Error('Failed to load job details');
      }
      const jobData = await jobResponse.json();
      setJob(jobData);
      setMetrics(jobData.metrics);

      // Get client name from job if available
      if (jobData.clientName) {
        setClientName(jobData.clientName);
      } else if (jobData.client) {
        setClientName(jobData.client.client_name || '');
      }

      // Calculate progress status based on estimated vs actual hours
      if (jobData.metrics) {
        const estimatedHours = jobData.metrics.estimatedHours || 1;
        const actualHours = jobData.metrics.actualHours || 0;
        const utilizationRate = (actualHours / estimatedHours) * 100;

        if (utilizationRate < 85) {
          setProgressStatus('early');
        } else if (utilizationRate <= 105) {
          setProgressStatus('ontime');
        } else {
          setProgressStatus('overdue');
        }
      }

      // Load team utilization
      const teamResponse = await fetch(
        `/api/partner/jobs/${jobId}/team`
      );
      if (teamResponse.ok) {
        const teamData = await teamResponse.json();
        setTeam(teamData);
      }

      // Load time entries
      const entriesResponse = await fetch(
        `/api/partner/jobs/${jobId}/time-entries`
      );
      if (entriesResponse.ok) {
        const entriesData = await entriesResponse.json();
        setTimeEntries(entriesData);
      }

      // Load pending time entries
      const pendingResponse = await fetch(
        `/api/partner/jobs/${jobId}/pending-time-entries`
      );
      if (pendingResponse.ok) {
        const pendingData = await pendingResponse.json();
        setPendingEntries(pendingData);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      console.error('Job detail error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveEntry = async (entryId: number) => {
    try {
      setApprovingEntries((prev) => new Set(prev).add(entryId));

      const response = await fetch(
        `/api/partner/time-entries/${entryId}/approve`,
        { method: 'POST' }
      );

      if (!response.ok) {
        throw new Error('Failed to approve time entry');
      }

      // Reload data
      await loadJobDetails();
    } catch (err) {
      console.error('Approval error:', err);
      alert(err instanceof Error ? err.message : 'Failed to approve entry');
    } finally {
      setApprovingEntries((prev) => {
        const next = new Set(prev);
        next.delete(entryId);
        return next;
      });
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading job details...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="p-8">
          <Button
            variant="ghost"
            onClick={() => navigate(-1)}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <div className="flex gap-4">
                <AlertCircle className="h-8 w-8 text-destructive flex-shrink-0" />
                <div>
                  <p className="font-semibold mb-2">Error Loading Job</p>
                  <p className="text-sm text-muted-foreground">{error}</p>
                  <Button
                    onClick={loadJobDetails}
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

  return (
    <DashboardLayout>
      <div className="space-y-8 p-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <Button
              variant="ghost"
              onClick={() => navigate(-1)}
              className="mb-4"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <h1 className="text-3xl font-bold tracking-tight">{job?.job_name}</h1>
            <div className="flex items-center gap-4 mt-2">
              {job?.job_code && (
                <p className="text-muted-foreground">Job Code: {job.job_code}</p>
              )}
              {clientName && (
                <p className="text-muted-foreground">Client: <span className="font-semibold text-foreground">{clientName}</span></p>
              )}
            </div>
          </div>
          <Badge
            variant={job?.status === 'completed' ? 'default' : 'secondary'}
          >
            {job?.status}
          </Badge>
        </div>

        {/* Progress Tracker */}
        <Card className={`border-2 ${
          progressStatus === 'early' ? 'border-green-500 bg-green-50 dark:bg-green-950' :
          progressStatus === 'ontime' ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950' :
          'border-red-500 bg-red-50 dark:bg-red-950'
        }`}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                {progressStatus === 'early' && (
                  <>
                    <CheckCheck className="h-5 w-5 text-green-600" />
                    <span className="text-green-700 dark:text-green-300">On Track - Ahead of Schedule</span>
                  </>
                )}
                {progressStatus === 'ontime' && (
                  <>
                    <Clock className="h-5 w-5 text-yellow-600" />
                    <span className="text-yellow-700 dark:text-yellow-300">Almost Finishing Allocated Time</span>
                  </>
                )}
                {progressStatus === 'overdue' && (
                  <>
                    <AlertTriangle className="h-5 w-5 text-red-600" />
                    <span className="text-red-700 dark:text-red-300">Overdue - Running into Loss</span>
                  </>
                )}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className={
                  progressStatus === 'early' ? 'text-green-700 dark:text-green-300' :
                  progressStatus === 'ontime' ? 'text-yellow-700 dark:text-yellow-300' :
                  'text-red-700 dark:text-red-300'
                }>
                  Progress
                </span>
                <span className={
                  progressStatus === 'early' ? 'text-green-700 dark:text-green-300 font-semibold' :
                  progressStatus === 'ontime' ? 'text-yellow-700 dark:text-yellow-300 font-semibold' :
                  'text-red-700 dark:text-red-300 font-semibold'
                }>
                  {metrics && ((metrics.actualHours / metrics.estimatedHours) * 100).toFixed(1)}%
                </span>
              </div>
              <div className={`w-full bg-gray-300 dark:bg-gray-700 rounded-full h-3 overflow-hidden`}>
                <div
                  className={`h-full transition-all ${
                    progressStatus === 'early' ? 'bg-green-500' :
                    progressStatus === 'ontime' ? 'bg-yellow-500' :
                    'bg-red-500'
                  }`}
                  style={{
                    width: `${Math.min(
                      100,
                      metrics ? ((metrics.actualHours / metrics.estimatedHours) * 100) : 0
                    )}%`
                  }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-3">
                <span>Estimated: {metrics?.estimatedHours.toFixed(1)} hrs</span>
                <span>Actual: {metrics?.actualHours.toFixed(1)} hrs</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Key Metrics */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Efficiency</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {metrics?.efficiency.toFixed(1)}%
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Profit Margin</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {metrics?.marginPercentage.toFixed(1)}%
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Profit</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${metrics?.profit.toFixed(0)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Team Size</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics?.teamSize || 0}</div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="team">Team Performance</TabsTrigger>
            <TabsTrigger value="time-entries">Time Entries</TabsTrigger>
            <TabsTrigger value="pending">
              Pending Approvals
              {pendingEntries.length > 0 && (
                <Badge className="ml-2" variant="destructive">
                  {pendingEntries.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <Card>
              <CardHeader>
                <CardTitle>Job Financial Summary</CardTitle>
                <CardDescription>
                  Complete financial breakdown and metrics
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                  <div>
                    <p className="text-sm text-muted-foreground">Estimated Hours</p>
                    <p className="text-2xl font-bold">
                      {metrics?.estimatedHours.toFixed(1)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Actual Hours</p>
                    <p className="text-2xl font-bold">
                      {metrics?.actualHours.toFixed(1)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Billable Hours</p>
                    <p className="text-2xl font-bold">
                      {metrics?.billableHours.toFixed(1)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Estimated Cost</p>
                    <p className="text-2xl font-bold">
                      ${metrics?.estimatedCost.toFixed(0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Actual Cost</p>
                    <p className="text-2xl font-bold">
                      ${metrics?.actualCost.toFixed(0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Revenue Collected</p>
                    <p className="text-2xl font-bold">
                      ${metrics?.revenueCollected.toFixed(0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Fees</p>
                    <p className="text-2xl font-bold">
                      ${metrics?.fees.toFixed(0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Utilization Rate</p>
                    <p className="text-2xl font-bold">
                      {metrics?.utilizationRate.toFixed(1)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Completion</p>
                    <p className="text-2xl font-bold">
                      {metrics?.completionPercentage || 0}%
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="team">
            <Card>
              <CardHeader>
                <CardTitle>Team Utilization</CardTitle>
                <CardDescription>
                  Performance breakdown by team member
                </CardDescription>
              </CardHeader>
              <CardContent>
                {team.length > 0 ? (
                  <div className="space-y-6">
                    {team.map((member) => {
                      const memberProgress = (member.totalHours / (metrics?.estimatedHours || 1)) * 100;
                      let memberStatus: 'early' | 'ontime' | 'overdue' = 'ontime';
                      if (memberProgress < 85) memberStatus = 'early';
                      else if (memberProgress > 105) memberStatus = 'overdue';
                      
                      return (
                        <Card key={member.employeeId} className="border">
                          <CardContent className="pt-6">
                            <div className="space-y-4">
                              {/* Name and basic info */}
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="font-semibold text-lg">{member.employeeName}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {member.totalHours.toFixed(1)} hours logged
                                  </p>
                                </div>
                                <Badge variant={
                                  memberStatus === 'early' ? 'secondary' :
                                  memberStatus === 'ontime' ? 'outline' :
                                  'destructive'
                                }>
                                  {memberStatus === 'early' && 'Ahead'}
                                  {memberStatus === 'ontime' && 'On Track'}
                                  {memberStatus === 'overdue' && 'Overdue'}
                                </Badge>
                              </div>

                              {/* Progress bar */}
                              <div className="space-y-2">
                                <div className="flex justify-between text-xs">
                                  <span className="text-muted-foreground">Individual Progress</span>
                                  <span className="font-semibold">{memberProgress.toFixed(1)}%</span>
                                </div>
                                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                                  <div
                                    className={`h-full transition-all ${
                                      memberStatus === 'early' ? 'bg-green-500' :
                                      memberStatus === 'ontime' ? 'bg-yellow-500' :
                                      'bg-red-500'
                                    }`}
                                    style={{ width: `${Math.min(100, memberProgress)}%` }}
                                  />
                                </div>
                              </div>

                              {/* Stats grid */}
                              <div className="grid grid-cols-3 gap-4 pt-2">
                                <div className="bg-muted p-3 rounded-lg">
                                  <p className="text-xs text-muted-foreground mb-1">Billable Hours</p>
                                  <p className="font-semibold">{member.billableHours.toFixed(1)}h</p>
                                </div>
                                <div className="bg-muted p-3 rounded-lg">
                                  <p className="text-xs text-muted-foreground mb-1">Cost</p>
                                  <p className="font-semibold">${member.cost.toFixed(0)}</p>
                                </div>
                                <div className="bg-muted p-3 rounded-lg">
                                  <p className="text-xs text-muted-foreground mb-1">Utilization</p>
                                  <p className="font-semibold">{member.utilizationPercentage.toFixed(1)}%</p>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                    <p className="text-muted-foreground">No team members assigned</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="time-entries">
            <Card>
              <CardHeader>
                <CardTitle>Approved Time Entries</CardTitle>
                <CardDescription>
                  All approved time entries for this job
                </CardDescription>
              </CardHeader>
              <CardContent>
                {timeEntries.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-2">Employee</th>
                          <th className="text-left py-2 px-2">Date</th>
                          <th className="text-right py-2 px-2">Hours</th>
                          <th className="text-right py-2 px-2">Cost</th>
                          <th className="text-left py-2 px-2">Task</th>
                          <th className="text-left py-2 px-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {timeEntries.map((entry) => (
                          <tr key={entry.id} className="border-b">
                            <td className="py-2 px-2">
                              {entry.employee.first_name}{' '}
                              {entry.employee.last_name}
                            </td>
                            <td className="py-2 px-2">
                              {new Date(entry.date_worked).toLocaleDateString()}
                            </td>
                            <td className="py-2 px-2 text-right">
                              {Number(entry.hours).toFixed(1)}h
                            </td>
                            <td className="py-2 px-2 text-right">
                              ${(Number(entry.hours) * entry.employee.hourly_rate).toFixed(0)}
                            </td>
                            <td className="py-2 px-2">
                              {entry.task?.title || '-'}
                            </td>
                            <td className="py-2 px-2">
                              <Badge variant="outline">{entry.status}</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                    <p className="text-muted-foreground">No time entries</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pending">
            <Card>
              <CardHeader>
                <CardTitle>Pending Time Entries</CardTitle>
                <CardDescription>
                  Time entries awaiting your approval
                </CardDescription>
              </CardHeader>
              <CardContent>
                {pendingEntries.length > 0 ? (
                  <div className="space-y-4">
                    {pendingEntries.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between border-b pb-4 last:border-0"
                      >
                        <div className="flex-1">
                          <p className="font-semibold">
                            {entry.employee.first_name}{' '}
                            {entry.employee.last_name}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(entry.date_worked).toLocaleDateString()} •{' '}
                            {Number(entry.hours).toFixed(1)} hours •{' '}
                            ${(Number(entry.hours) * entry.employee.hourly_rate).toFixed(0)}
                          </p>
                        </div>
                        <Button
                          onClick={() => handleApproveEntry(entry.id)}
                          disabled={approvingEntries.has(entry.id)}
                          size="sm"
                        >
                          {approvingEntries.has(entry.id)
                            ? 'Approving...'
                            : 'Approve'}
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <CheckCircle2 className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                    <p className="text-muted-foreground">
                      All time entries approved
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default PartnerJobDetail;
