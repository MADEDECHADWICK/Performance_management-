import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import JobOperationsOverview from "@/components/jobs/JobOperationsOverview";
import PageLoader from "@/components/ui/page-loader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { clientsAPI, clientOnboardingsAPI, proposalsAPI, surveysAPI } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import type { Proposal } from "@/lib/api/proposals";
import type { ClientSatisfactionSurvey } from "@/lib/api/surveys";
import { AlertCircle, Building2, FileText, Briefcase, TrendingUp, Star, ArrowUpRight, MailCheck, MailWarning } from "lucide-react";

type MarketingProposal = Proposal & {
  createdByProfileId?: number | null;
  wonAt?: string | null;
  updatedAt?: string;
};

const OPEN_PROPOSAL_STATUSES = new Set(["draft", "sent"]);
const APPROVED_ONBOARDING_STATUSES = new Set(["approved", "client_created"]);

const monthLabel = (date: Date) =>
  date.toLocaleString("en-US", { month: "short", year: "2-digit" });

const monthKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}`;

const toNumber = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export default function MarketingDashboard() {
  const { profile, isLoading: authLoading } = useAuth();
  const currentProfileId = profile?.id ?? null;

  const { data: clientsData, error: clientsError, isLoading: clientsLoading } = useQuery({
    queryKey: ["marketing-clients", currentProfileId],
    queryFn: () => clientsAPI.list({ page: 1, pageSize: 200 }),
    enabled: !authLoading && !!currentProfileId,
  });

  const {
    data: onboardingData,
    error: onboardingError,
    isLoading: onboardingLoading,
  } = useQuery({
    queryKey: ["marketing-onboarding", currentProfileId],
    queryFn: () => clientOnboardingsAPI.list({ page: 1, pageSize: 200 }),
    enabled: !authLoading && !!currentProfileId,
  });

  const {
    data: proposalsData,
    error: proposalsError,
    isLoading: proposalsLoading,
  } = useQuery({
    queryKey: ["marketing-proposals", currentProfileId],
    queryFn: () => proposalsAPI.list({ page: 1, pageSize: 200 }),
    enabled: !authLoading && !!currentProfileId,
  });

  const {
    data: surveysData,
    error: surveysError,
    isLoading: surveysLoading,
  } = useQuery({
    queryKey: ["marketing-surveys", currentProfileId],
    queryFn: () => surveysAPI.list({ page: 1, pageSize: 200 }),
    enabled: !authLoading && !!currentProfileId,
  });

  const clients = useMemo(() => clientsData?.data ?? [], [clientsData]);
  const onboardings = useMemo(() => onboardingData?.data ?? [], [onboardingData]);
  const proposals = useMemo<MarketingProposal[]>(
    () => (proposalsData?.data ?? []) as MarketingProposal[],
    [proposalsData]
  );
  const surveys = useMemo<ClientSatisfactionSurvey[]>(
    () => surveysData?.surveys ?? [],
    [surveysData]
  );

  const scopedOnboardings = useMemo(() => {
    if (!currentProfileId) return [];
    return onboardings.filter(
      (onboarding: any) => Number(onboarding.uploadedByProfileId || 0) === currentProfileId
    );
  }, [currentProfileId, onboardings]);

  const scopedProposals = useMemo(() => {
    if (!currentProfileId) return [];
    return proposals.filter(
      (proposal) => Number(proposal.createdByProfileId || 0) === currentProfileId
    );
  }, [currentProfileId, proposals]);

  const scopedClientIds = useMemo(() => {
    const ids = new Set<number>();
    scopedOnboardings.forEach((onboarding: any) => {
      const clientId = Number(onboarding.clientId || onboarding.client?.id || 0);
      if (clientId > 0) ids.add(clientId);
    });
    scopedProposals.forEach((proposal) => {
      const clientId = Number(proposal.clientId || proposal.client?.id || 0);
      if (clientId > 0) ids.add(clientId);
    });
    return ids;
  }, [scopedOnboardings, scopedProposals]);

  const scopedJobIds = useMemo(() => {
    const ids = new Set<number>();
    scopedOnboardings.forEach((onboarding: any) => {
      const jobId = Number(onboarding.jobId || onboarding.job?.id || 0);
      if (jobId > 0) ids.add(jobId);
    });
    return ids;
  }, [scopedOnboardings]);

  const scopedClients = useMemo(
    () => clients.filter((client: any) => scopedClientIds.has(Number(client.id || 0))),
    [clients, scopedClientIds]
  );

  const pendingHR = useMemo(
    () => scopedOnboardings.filter((o: any) => o.status === "pending_hr_review"),
    [scopedOnboardings]
  );

  const upcomingJobs = useMemo(
    () =>
      scopedOnboardings.filter(
        (o: any) =>
          APPROVED_ONBOARDING_STATUSES.has(String(o.status || "").toLowerCase()) &&
          !o.jobId &&
          String(o.engagementLetter?.status || "").toLowerCase() === "approved"
      ),
    [scopedOnboardings]
  );

  const pipelineMetrics = useMemo(() => {
    const totalOpportunities = scopedProposals.length;
    const pipelineValue = scopedProposals
      .filter((proposal) => OPEN_PROPOSAL_STATUSES.has(String(proposal.status || "").toLowerCase()))
      .reduce((sum, proposal) => sum + toNumber(proposal.proposedFee), 0);
    const weightedPipelineValue = scopedProposals
      .filter((proposal) => OPEN_PROPOSAL_STATUSES.has(String(proposal.status || "").toLowerCase()))
      .reduce(
        (sum, proposal) => sum + toNumber(proposal.proposedFee) * (toNumber(proposal.probability) / 100),
        0
      );
    const wonCount = scopedProposals.filter((proposal) => proposal.status === "won").length;
    const lostCount = scopedProposals.filter((proposal) => proposal.status === "lost").length;
    const conversionRate = wonCount + lostCount > 0 ? (wonCount / (wonCount + lostCount)) * 100 : 0;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const wonThisMonth = scopedProposals.filter((proposal) => {
      if (proposal.status !== "won" || !proposal.wonAt) return false;
      const wonAt = new Date(proposal.wonAt);
      return !Number.isNaN(wonAt.getTime()) && wonAt >= monthStart;
    }).length;
    const lostThisMonth = scopedProposals.filter((proposal) => {
      if (proposal.status !== "lost" || !proposal.updatedAt) return false;
      const updatedAt = new Date(proposal.updatedAt);
      return !Number.isNaN(updatedAt.getTime()) && updatedAt >= monthStart;
    }).length;
    const hotLeads = scopedProposals.filter(
      (proposal) =>
        OPEN_PROPOSAL_STATUSES.has(String(proposal.status || "").toLowerCase()) &&
        toNumber(proposal.probability) >= 70
    ).length;

    const monthsBack = 6;
    const monthKeys = Array.from({ length: monthsBack }).map((_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1 - index), 1);
      return { key: monthKey(date), month: monthLabel(date) };
    });
    const trendMap = new Map(
      monthKeys.map((item) => [item.key, { month: item.month, won: 0, lost: 0, created: 0 }])
    );

    scopedProposals.forEach((proposal) => {
      const createdAt = proposal.proposalDate ? new Date(proposal.proposalDate) : null;
      if (createdAt && !Number.isNaN(createdAt.getTime())) {
        const entry = trendMap.get(monthKey(createdAt));
        if (entry) entry.created += 1;
      }

      if (proposal.status === "won" && proposal.wonAt) {
        const wonAt = new Date(proposal.wonAt);
        if (!Number.isNaN(wonAt.getTime())) {
          const entry = trendMap.get(monthKey(wonAt));
          if (entry) entry.won += 1;
        }
      }

      if (proposal.status === "lost" && proposal.updatedAt) {
        const updatedAt = new Date(proposal.updatedAt);
        if (!Number.isNaN(updatedAt.getTime())) {
          const entry = trendMap.get(monthKey(updatedAt));
          if (entry) entry.lost += 1;
        }
      }
    });

    const wonProposalValue = scopedProposals
      .filter((proposal) => proposal.status === "won")
      .reduce((sum, proposal) => sum + toNumber(proposal.proposedFee), 0);

    return {
      totalOpportunities,
      pipelineValue,
      weightedPipelineValue,
      conversionRate,
      wonThisMonth,
      lostThisMonth,
      hotLeads,
      wonProposalValue,
      pipelineTrend: monthKeys.map(
        (item) => trendMap.get(item.key) || { month: item.month, won: 0, lost: 0, created: 0 }
      ),
    };
  }, [scopedProposals]);

  const scopedSurveys = useMemo(() => {
    if (scopedClientIds.size === 0 && scopedJobIds.size === 0) return [];
    return surveys.filter((survey) => {
      const clientId = Number(survey.clientId || survey.client?.id || 0);
      const jobId = Number(survey.jobId || survey.job?.id || 0);
      return scopedClientIds.has(clientId) || scopedJobIds.has(jobId);
    });
  }, [scopedClientIds, scopedJobIds, surveys]);

  const surveyAnalytics = useMemo(() => {
    const completed = scopedSurveys.filter((survey) => !!survey.completedAt);
    const averageRatings = {
      overall:
        completed.length > 0
          ? completed.reduce((sum, survey) => sum + toNumber(survey.overallSatisfaction), 0) /
            completed.length
          : 0,
    };

    const now = new Date();
    const monthsBack = 6;
    const monthKeys = Array.from({ length: monthsBack }).map((_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1 - index), 1);
      return { key: monthKey(date), month: monthLabel(date) };
    });
    const trendMap = new Map(
      monthKeys.map((item) => [item.key, { month: item.month, avgSatisfaction: 0, responseCount: 0 }])
    );
    const scoreMap = new Map<string, { total: number; count: number }>();

    completed.forEach((survey) => {
      const completedAt = survey.completedAt ? new Date(survey.completedAt) : null;
      if (!completedAt || Number.isNaN(completedAt.getTime())) return;
      const key = monthKey(completedAt);
      const entry = trendMap.get(key);
      if (!entry) return;
      entry.responseCount += 1;

      const score = toNumber(survey.overallSatisfaction);
      if (score > 0) {
        const current = scoreMap.get(key) || { total: 0, count: 0 };
        current.total += score;
        current.count += 1;
        scoreMap.set(key, current);
      }
    });

    trendMap.forEach((entry, key) => {
      const scoreEntry = scoreMap.get(key);
      if (scoreEntry && scoreEntry.count > 0) {
        entry.avgSatisfaction = scoreEntry.total / scoreEntry.count;
      }
    });

    return {
      totalSurveys: scopedSurveys.length,
      completedSurveys: completed.length,
      responseRate: scopedSurveys.length > 0 ? completed.length / scopedSurveys.length : 0,
      averageRatings,
      trends: monthKeys.map(
        (item) =>
          trendMap.get(item.key) || { month: item.month, avgSatisfaction: 0, responseCount: 0 }
      ),
    };
  }, [scopedSurveys]);

  const surveyList = useMemo(
    () =>
      [...scopedSurveys]
        .sort((a, b) => {
          const aTs = new Date(a.completedAt || a.createdAt).getTime();
          const bTs = new Date(b.completedAt || b.createdAt).getTime();
          return bTs - aTs;
        })
        .slice(0, 5),
    [scopedSurveys]
  );

  const pipelineTrend = pipelineMetrics.pipelineTrend;
  const surveyTrends = surveyAnalytics.trends;
  const pipelineMax = Math.max(
    1,
    ...pipelineTrend.flatMap((item: any) => [item.created || 0, item.won || 0, item.lost || 0])
  );
  const hasSurveyAnalytics =
    surveyAnalytics.averageRatings.overall > 0 &&
    surveyAnalytics.totalSurveys > 0;
  const pendingSurveyCount = Math.max(0, surveyAnalytics.totalSurveys - surveyAnalytics.completedSurveys);
  const completedSurveyCount = surveyAnalytics.completedSurveys;
  const routedSurveyCount = pendingSurveyCount + completedSurveyCount;

  const loading =
    authLoading ||
    clientsLoading ||
    onboardingLoading ||
    proposalsLoading ||
    surveysLoading;
  const queryError = clientsError || onboardingError || proposalsError || surveysError;
  const marketingJobMetrics = [
    {
      label: "Open opportunities",
      value: String(pipelineMetrics.totalOpportunities),
      hint: `${scopedClients.length} clients in your active intake scope`,
      icon: Building2,
      tone: "primary" as const,
      graphValue: pipelineMetrics.totalOpportunities,
      graphBaseline: scopedClients.length,
    },
    {
      label: "Pipeline value",
      value: `KES ${pipelineMetrics.pipelineValue.toLocaleString("en-KE")}`,
      hint: `Weighted ${pipelineMetrics.weightedPipelineValue.toLocaleString("en-KE")}`,
      icon: TrendingUp,
      tone: "positive" as const,
      graphValue: pipelineMetrics.pipelineValue,
      graphBaseline: pipelineMetrics.weightedPipelineValue,
    },
    {
      label: "Upcoming jobs",
      value: String(upcomingJobs.length),
      hint: `${pendingHR.length} still waiting on HR review`,
      icon: Briefcase,
      tone: "warning" as const,
      graphValue: upcomingJobs.length,
      graphBaseline: pendingHR.length,
    },
    {
      label: "Conversion rate",
      value: `${pipelineMetrics.conversionRate.toFixed(1)}%`,
      hint: `${pipelineMetrics.hotLeads} hot leads above 70% probability`,
      icon: Star,
      tone: "danger" as const,
      graphValue: pipelineMetrics.conversionRate,
      graphBaseline: 50,
    },
  ];

  if (loading) {
    return (
      <DashboardLayout>
        <PageLoader message="Loading marketing dashboard..." minHeightClassName="min-h-[420px]" />
      </DashboardLayout>
    );
  }

  if (!currentProfileId) {
    return (
      <DashboardLayout>
        <Card>
          <CardHeader>
            <CardTitle>Marketing profile unavailable</CardTitle>
            <CardDescription>Sign in again to load profile-specific marketing data.</CardDescription>
          </CardHeader>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Building2 className="h-7 w-7 text-primary" />
              Marketing Overview
            </h1>
            <p className="text-muted-foreground">
              Profile-scoped marketing activity for intake, onboarding, pipeline, and client feedback.
            </p>
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

        <JobOperationsOverview
          title="Lead-to-job command"
          description="Keep client intake, HR handoff, upcoming jobs, and pipeline quality visible in one simpler marketing flow."
          metrics={marketingJobMetrics}
          showLocator={false}
        />

        {queryError && (
          <Card className="border-dashed bg-muted/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertCircle className="h-5 w-5" />
                Some marketing records could not be loaded
              </CardTitle>
              <CardDescription>
                The dashboard only shows records tied to profile #{currentProfileId}. Refresh if recent entries are missing.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

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
                <span className="font-medium">{pipelineMetrics.conversionRate.toFixed(1)}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Hot leads</span>
                <span className="font-medium">{pipelineMetrics.hotLeads}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Won this month</span>
                <span className="font-medium">{pipelineMetrics.wonThisMonth}</span>
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
                <span className="font-medium">
                  {surveyAnalytics.responseRate ? `${(surveyAnalytics.responseRate * 100).toFixed(0)}%` : "0%"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total surveys</span>
                <span className="font-medium">{surveyAnalytics.totalSurveys}</span>
              </div>
              {surveyList.length === 0 && (
                <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                  No survey responses yet for your client/job portfolio.
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
