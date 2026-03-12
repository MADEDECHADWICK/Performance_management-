import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import PageLoader from "@/components/ui/page-loader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  MessageSquare,
  Users,
} from "lucide-react";
import { format } from "date-fns";
import type { EvaluationAssignment, EvaluatorType } from "@/lib/api/types";

const evaluatorLabels: Record<EvaluatorType, string> = {
  self: "Self",
  manager: "Manager",
  peer: "Peer",
  direct_report: "Upward",
  client: "Client",
  custom: "Custom",
};

const isClosed = (status?: string) =>
  status === "submitted" || status === "cancelled";

const getDisplayName = (person: any) =>
  [person?.firstName || person?.first_name, person?.lastName || person?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim() || "Unknown";

export default function Evaluations() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, isLoading: authLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(searchParams.get("tab") || "overview");
  const typeFilter = (searchParams.get("type") || "all") as EvaluatorType | "all";
  const [myAssignments, setMyAssignments] = useState<EvaluationAssignment[]>([]);
  const [aboutMeAssignments, setAboutMeAssignments] = useState<EvaluationAssignment[]>([]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/auth");
      return;
    }
    void loadAssignments();
  }, [authLoading, navigate, user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const nextTab = searchParams.get("tab") || "overview";
    setTab(nextTab);
  }, [searchParams]);

  const loadAssignments = async () => {
    try {
      setLoading(true);
      const profileId = Number(
        (user as any)?.profileId ?? (user as any)?.profile?.id ?? 0
      );

      const [assigned, received] = await Promise.all([
        apiFetch<EvaluationAssignment[]>(
          "GET",
          `/evaluation-assignments?evaluatorProfileId=${profileId}&include=definition,evaluatee`
        ),
        apiFetch<EvaluationAssignment[]>(
          "GET",
          `/evaluation-assignments?evaluateeProfileId=${profileId}&include=definition,evaluator`
        ),
      ]);

      setMyAssignments(Array.isArray(assigned) ? assigned : []);
      setAboutMeAssignments(Array.isArray(received) ? received : []);
    } catch (error: any) {
      toast({
        title: "Error loading evaluations",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const pendingAssignments = useMemo(
    () =>
      myAssignments.filter(
        (assignment) =>
          !isClosed(assignment.status) &&
          (typeFilter === "all" || (assignment.evaluatorType || "custom") === typeFilter)
      ),
    [myAssignments, typeFilter]
  );
  const submittedAssignments = useMemo(
    () =>
      myAssignments.filter(
        (assignment) =>
          assignment.status === "submitted" &&
          (typeFilter === "all" || (assignment.evaluatorType || "custom") === typeFilter)
      ),
    [myAssignments, typeFilter]
  );
  const receivedFeedback = useMemo(
    () =>
      aboutMeAssignments.filter(
        (assignment) =>
          assignment.status === "submitted" &&
          (typeFilter === "all" || (assignment.evaluatorType || "custom") === typeFilter)
      ),
    [aboutMeAssignments, typeFilter]
  );
  const averageReceivedScore = useMemo(() => {
    const scored = receivedFeedback
      .map((assignment) => Number(assignment.score))
      .filter((score) => Number.isFinite(score));
    if (scored.length === 0) return 0;
    return scored.reduce((sum, score) => sum + score, 0) / scored.length;
  }, [receivedFeedback]);

  const byType = useMemo(() => {
    const base: Record<string, { assigned: number; pending: number; received: number }> = {};
    myAssignments.forEach((assignment) => {
      const type = assignment.evaluatorType || "custom";
      base[type] = base[type] || { assigned: 0, pending: 0, received: 0 };
      base[type].assigned += 1;
      if (!isClosed(assignment.status)) base[type].pending += 1;
    });
    receivedFeedback.forEach((assignment) => {
      const type = assignment.evaluatorType || "custom";
      base[type] = base[type] || { assigned: 0, pending: 0, received: 0 };
      base[type].received += 1;
    });
    return Object.entries(base);
  }, [myAssignments, receivedFeedback]);

  const completionPercent = useMemo(() => {
    if (myAssignments.length === 0) return 100;
    return Math.round((submittedAssignments.length / myAssignments.length) * 100);
  }, [myAssignments.length, submittedAssignments.length]);

  if (loading) {
    return (
      <DashboardLayout>
        <PageLoader message="Loading..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Evaluations</h1>
            <p className="text-muted-foreground">
              Assignment-driven evaluation tasks and feedback in one place.
            </p>
          </div>
          {pendingAssignments.length > 0 && (
            <Badge variant="destructive" className="px-3 py-1 text-base">
              {pendingAssignments.length} pending
            </Badge>
          )}
        </div>

        <Tabs
          value={tab}
          onValueChange={(value) => {
            setTab(value);
            const next = new URLSearchParams(searchParams);
            if (value === "overview") {
              next.delete("tab");
            } else {
              next.set("tab", value);
            }
            setSearchParams(next);
          }}
        >
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="assignments">My Assignments</TabsTrigger>
            <TabsTrigger value="about-me">About Me</TabsTrigger>
          </TabsList>

          <div className="flex justify-end">
            <div className="w-full max-w-xs space-y-2">
              <div className="text-sm font-medium">Evaluator Type</div>
              <Select
                value={typeFilter}
                onValueChange={(value) => {
                  const next = new URLSearchParams(searchParams);
                  if (value === "all") {
                    next.delete("type");
                  } else {
                    next.set("type", value);
                  }
                  setSearchParams(next);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All evaluator types</SelectItem>
                  <SelectItem value="self">Self</SelectItem>
                  <SelectItem value="manager">Downward / Manager</SelectItem>
                  <SelectItem value="peer">Peer</SelectItem>
                  <SelectItem value="direct_report">Upward / Direct report</SelectItem>
                  <SelectItem value="client">Client</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <TabsContent value="overview" className="space-y-6">
            <Card className="border-primary/20">
              <CardHeader>
                <CardTitle>Evaluation Progress</CardTitle>
                <CardDescription>Track work to do, submissions, and feedback received.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Progress value={completionPercent} />
                <div className="grid gap-4 md:grid-cols-4">
                  <div className="rounded-xl border bg-muted/30 p-4">
                    <div className="text-sm text-muted-foreground">Pending tasks</div>
                    <div className="mt-1 text-2xl font-semibold">{pendingAssignments.length}</div>
                  </div>
                  <div className="rounded-xl border bg-muted/30 p-4">
                    <div className="text-sm text-muted-foreground">Submitted by me</div>
                    <div className="mt-1 text-2xl font-semibold">{submittedAssignments.length}</div>
                  </div>
                  <div className="rounded-xl border bg-muted/30 p-4">
                    <div className="text-sm text-muted-foreground">Feedback received</div>
                    <div className="mt-1 text-2xl font-semibold">{receivedFeedback.length}</div>
                  </div>
                  <div className="rounded-xl border bg-muted/30 p-4">
                    <div className="text-sm text-muted-foreground">Average received score</div>
                    <div className="mt-1 text-2xl font-semibold">
                      {averageReceivedScore > 0 ? `${averageReceivedScore.toFixed(1)}%` : "N/A"}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {byType.length === 0 ? (
                <Card className="md:col-span-2 xl:col-span-3">
                  <CardContent className="py-10 text-center">
                    <AlertCircle className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                    <p className="text-muted-foreground">No evaluation activity is available yet.</p>
                  </CardContent>
                </Card>
              ) : (
                byType.map(([type, stats]) => (
                  <Card key={type}>
                    <CardHeader>
                      <CardTitle>{evaluatorLabels[type as EvaluatorType] || type}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Assigned</span>
                        <span className="font-medium">{stats.assigned}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Pending</span>
                        <span className="font-medium">{stats.pending}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">About me</span>
                        <span className="font-medium">{stats.received}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="assignments" className="space-y-6">
            {pendingAssignments.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold">Pending Evaluations</h2>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {pendingAssignments.map((assignment) => {
                    const dueDate = assignment.dueDate || assignment.definition?.dueDate;
                    return (
                      <Card key={assignment.id}>
                        <CardHeader>
                          <CardTitle className="flex items-start justify-between gap-3 text-lg">
                            <span className="line-clamp-2">{assignment.definition?.name || "Evaluation"}</span>
                            <Badge variant="outline">
                              {evaluatorLabels[assignment.evaluatorType || "custom"]}
                            </Badge>
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm">
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <span>{getDisplayName(assignment.evaluatee)}</span>
                          </div>
                          {dueDate && (
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-muted-foreground" />
                              <span>{format(new Date(dueDate), "MMM dd, yyyy")}</span>
                            </div>
                          )}
                          <Button className="w-full" onClick={() => navigate(`/evaluation/${assignment.id}`)}>
                            <ClipboardCheck className="mr-2 h-4 w-4" />
                            Start Evaluation
                          </Button>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Submitted Evaluations</h2>
              {submittedAssignments.length === 0 ? (
                <Card>
                  <CardContent className="py-10 text-center text-muted-foreground">
                    No submitted evaluations yet.
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {submittedAssignments.map((assignment) => (
                    <Card key={assignment.id}>
                      <CardHeader>
                        <CardTitle className="flex items-start justify-between gap-3 text-lg">
                          <span className="line-clamp-2">{assignment.definition?.name || "Evaluation"}</span>
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3 text-sm">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <span>{getDisplayName(assignment.evaluatee)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <MessageSquare className="h-4 w-4 text-muted-foreground" />
                          <span>{assignment.score ? `${assignment.score}% score` : "Submitted"}</span>
                        </div>
                        <Button variant="outline" className="w-full" onClick={() => navigate(`/evaluation/${assignment.id}`)}>
                          <Eye className="mr-2 h-4 w-4" />
                          View Submission
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="about-me" className="space-y-6">
            {receivedFeedback.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-muted-foreground">
                  No submitted feedback about you yet.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {receivedFeedback.map((assignment) => (
                  <Card key={assignment.id}>
                    <CardHeader>
                      <CardTitle className="flex items-start justify-between gap-3 text-lg">
                        <span>{assignment.definition?.name || "Evaluation"}</span>
                        <Badge variant="outline">
                          {evaluatorLabels[assignment.evaluatorType || "custom"]}
                        </Badge>
                      </CardTitle>
                      <CardDescription>
                        Submitted by {getDisplayName(assignment.evaluator)}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Score</span>
                        <span className="font-medium">
                          {assignment.score ? `${assignment.score}%` : "N/A"}
                        </span>
                      </div>
                      <p className="rounded-xl bg-muted/30 p-3 text-muted-foreground">
                        {assignment.evaluatorComments || "No summary comments were provided."}
                      </p>
                      <Button variant="outline" className="w-full" onClick={() => navigate(`/evaluation/${assignment.id}`)}>
                        <Eye className="mr-2 h-4 w-4" />
                        View Feedback
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
