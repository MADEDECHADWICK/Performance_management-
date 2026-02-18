import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { clientsAPI, clientOnboardingsAPI, proposalsAPI, surveysAPI } from "@/lib/api";
import { Building2, FileText, Briefcase, TrendingUp, Star, ArrowUpRight, MailCheck, MailWarning } from "lucide-react";

export default function MarketingDashboard() {
  const { data: clientsData } = useQuery({
    queryKey: ["marketing-clients"],
    queryFn: () => clientsAPI.list({ page: 1, pageSize: 200 }),
  });

  const { data: onboardingData } = useQuery({
    queryKey: ["marketing-onboarding"],
    queryFn: () => clientOnboardingsAPI.list({ page: 1, pageSize: 50 }),
  });

  const { data: upcomingData } = useQuery({
    queryKey: ["marketing-upcoming"],
    queryFn: () => clientOnboardingsAPI.getUpcomingJobs({ page: 1, pageSize: 20 }),
  });

  const { data: proposalMetrics } = useQuery({
    queryKey: ["proposal-metrics"],
    queryFn: () => proposalsAPI.metrics(),
  });

  const { data: surveyAnalytics } = useQuery({
    queryKey: ["survey-analytics"],
    queryFn: () => surveysAPI.getAnalytics(),
  });

  const { data: pendingSurveys } = useQuery({
    queryKey: ["survey-pending"],
    queryFn: () => surveysAPI.getPending(),
  });

  const { data: completedSurveys } = useQuery({
    queryKey: ["survey-completed"],
    queryFn: () => surveysAPI.getCompleted(),
  });

  const { data: recentSurveys } = useQuery({
    queryKey: ["survey-recent"],
    queryFn: () => surveysAPI.list({ page: 1, pageSize: 5 }),
  });

  const clients = clientsData?.data || [];
  const onboardings = onboardingData?.data || [];
  const upcomingJobs = upcomingData?.data || [];
  const pipelineTrend = proposalMetrics?.pipelineTrend || [];
  const surveyTrends = surveyAnalytics?.trends || [];
  const surveyList = recentSurveys?.surveys || [];
  const leadToCash = proposalMetrics?.leadToCash;
  const pipelineMax = Math.max(
    1,
    ...pipelineTrend.flatMap((item: any) => [item.created || 0, item.won || 0, item.lost || 0])
  );
  const hasSurveyAnalytics =
    (surveyAnalytics?.averageRatings?.overall ?? null) !== null &&
    (surveyAnalytics?.totalSurveys ?? 0) > 0;
  const pendingSurveyCount = pendingSurveys?.total ?? 0;
  const completedSurveyCount = completedSurveys?.total ?? 0;
  const routedSurveyCount = pendingSurveyCount + completedSurveyCount;

  const pendingHR = useMemo(
    () => onboardings.filter((o: any) => o.status === "pending_hr_review"),
    [onboardings]
  );

  const approvedOnboardings = useMemo(
    () => onboardings.filter((o: any) => o.status === "approved"),
    [onboardings]
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Building2 className="h-7 w-7 text-primary" />
              Marketing Overview
            </h1>
            <p className="text-muted-foreground">Manage client intake, engagement letters, and pipeline status.</p>
          </div>
          <div className="flex gap-2">
            <Button asChild>
              <Link to="/clients/new">New Client Intake</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/business-development">Pipeline</Link>
            </Button>
          </div>
        </div>


        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Total Clients</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{clients.length}</div>
              <p className="text-xs text-muted-foreground">Active records</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Pending HR Review</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">{pendingHR.length}</div>
              <p className="text-xs text-muted-foreground">Engagements awaiting HR</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Upcoming Jobs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{upcomingJobs.length}</div>
              <p className="text-xs text-muted-foreground">Approved & ready for HR</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Pipeline Value</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">KES {(proposalMetrics?.pipelineValue || 0).toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Open proposals</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Client Satisfaction</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {surveyAnalytics?.averageRatings?.overall?.toFixed(1) || "--"}
              </div>
              <p className="text-xs text-muted-foreground">
                {hasSurveyAnalytics ? "Avg rating" : "No survey data yet"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Lead-to-Cash</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Conversion</span>
                <span className="font-medium">{Number(leadToCash?.conversionRate || 0).toFixed(1)}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Won Value</span>
                <span className="font-medium">KES {Number(leadToCash?.wonProposalValue || 0).toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Collected</span>
                <span className="font-medium">KES {Number(leadToCash?.collectedFromWonClients || 0).toLocaleString()}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                HR Intake Queue
              </CardTitle>
              <CardDescription>Engagement letters submitted by marketing awaiting HR action.</CardDescription>
            </CardHeader>
            <CardContent className="max-h-[420px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Engagement</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingHR.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground">
                        No pending submissions.
                      </TableCell>
                    </TableRow>
                  )}
                  {pendingHR.map((item: any) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.client?.clientName || item.clientName}</TableCell>
                      <TableCell>{item.engagementLetter?.jobTitle || item.engagementLetter?.engagementType || "Engagement"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">Pending HR</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex justify-end pt-4">
                <Button asChild variant="outline" size="sm">
                  <Link to="/client-onboarding-queue">
                    View onboarding queue
                    <ArrowUpRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="h-5 w-5" />
                Upcoming Jobs
              </CardTitle>
              <CardDescription>Approved onboarding ready for HR job creation.</CardDescription>
            </CardHeader>
            <CardContent className="max-h-[420px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Engagement</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {upcomingJobs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground">
                        No upcoming jobs yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {upcomingJobs.map((item: any) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.client?.clientName || item.clientName}</TableCell>
                      <TableCell>{item.engagementLetter?.jobTitle || item.engagementLetter?.engagementType || "Engagement"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">Approved</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex justify-end pt-4">
                <Button asChild variant="outline" size="sm">
                  <Link to="/client-onboarding-queue">
                    Open upcoming jobs
                    <ArrowUpRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Pipeline Snapshot
              </CardTitle>
              <CardDescription>Track conversion and next steps.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Conversion rate</span>
                <span className="font-medium">{proposalMetrics?.conversionRate?.toFixed(1) || "0"}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Hot leads</span>
                <span className="font-medium">{proposalMetrics?.hotLeads || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Won this month</span>
                <span className="font-medium">{proposalMetrics?.wonThisMonth || 0}</span>
              </div>
              {pipelineTrend.length > 0 && (
                <div className="pt-2 border-t space-y-2">
                  <p className="text-xs uppercase text-muted-foreground">Last 6 months</p>
                  {pipelineTrend.map((item) => (
                    <div key={item.month} className="space-y-1">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{item.month}</span>
                        <span>
                          {item.created || 0} created - {item.won || 0} won - {item.lost || 0} lost
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <div className="h-2 flex-1 bg-muted rounded">
                          <div
                            className="h-2 bg-slate-400 rounded"
                            style={{ width: `${((item.created || 0) / pipelineMax) * 100}%` }}
                          />
                        </div>
                        <div className="h-2 flex-1 bg-muted rounded">
                          <div
                            className="h-2 bg-emerald-500 rounded"
                            style={{ width: `${((item.won || 0) / pipelineMax) * 100}%` }}
                          />
                        </div>
                        <div className="h-2 flex-1 bg-muted rounded">
                          <div
                            className="h-2 bg-rose-500 rounded"
                            style={{ width: `${((item.lost || 0) / pipelineMax) * 100}%` }}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 text-[10px] text-muted-foreground">
                        <span>Created</span>
                        <span className="text-center">Won</span>
                        <span className="text-right">Lost</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <Button asChild variant="outline" size="sm">
                <Link to="/business-development">
                  Open pipeline
                  <ArrowUpRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Star className="h-5 w-5" />
                Client Feedback
              </CardTitle>
              <CardDescription>Latest survey performance.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border p-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MailWarning className="h-4 w-4 text-amber-500" />
                    Pending surveys
                  </div>
                  <div className="text-xl font-semibold">{pendingSurveyCount}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MailCheck className="h-4 w-4 text-emerald-500" />
                    Completed surveys
                  </div>
                  <div className="text-xl font-semibold">{completedSurveyCount}</div>
                </div>
                <div className="rounded-lg border p-3 sm:col-span-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MailCheck className="h-4 w-4 text-primary" />
                    Surveys routed
                  </div>
                  <div className="text-xl font-semibold">{routedSurveyCount}</div>
                  <p className="text-xs text-muted-foreground">Pending + completed</p>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Response rate</span>
                <span className="font-medium">{surveyAnalytics?.responseRate ? `${(surveyAnalytics.responseRate * 100).toFixed(0)}%` : "0%"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total surveys</span>
                <span className="font-medium">{surveyAnalytics?.totalSurveys || 0}</span>
              </div>
              {surveyList.length === 0 && (
                <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                  No survey responses yet. Send surveys after job completion to populate insights.
                </div>
              )}
              {surveyList.length > 0 && (
                <div className="pt-2 border-t space-y-2">
                  <p className="text-xs uppercase text-muted-foreground">Recent surveys</p>
                  <div className="space-y-2">
                    {surveyList.map((survey) => (
                      <div key={survey.id} className="flex items-center justify-between text-xs">
                        <div>
                          <p className="font-medium">
                            {survey.client?.clientName || "Client"}
                          </p>
                          <p className="text-muted-foreground">
                            {survey.job?.jobName || "Engagement"}{" "}
                            {survey.completedAt ? " - completed" : " - pending"}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">
                            {survey.overallSatisfaction ? survey.overallSatisfaction.toFixed(1) : "--"}
                          </p>
                          <p className="text-muted-foreground">overall</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {surveyTrends.length > 0 && (
                <div className="pt-2 border-t space-y-2">
                  <p className="text-xs uppercase text-muted-foreground">Survey trends</p>
                  {surveyTrends.map((item) => (
                    <div key={item.month} className="space-y-1">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{item.month}</span>
                        <span>
                          {item.avgSatisfaction ? item.avgSatisfaction.toFixed(1) : "0.0"}/5
                        </span>
                      </div>
                      <div className="h-2 w-full bg-muted rounded">
                        <div
                          className="h-2 bg-amber-500 rounded"
                          style={{
                            width: `${((item.avgSatisfaction || 0) / 5) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <Button asChild variant="outline" size="sm">
                <Link to="/client-surveys">
                  View surveys
                  <ArrowUpRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
