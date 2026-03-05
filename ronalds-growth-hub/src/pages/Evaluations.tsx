import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import DashboardLayout from "@/components/DashboardLayout";
import PageLoader from '@/components/ui/page-loader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  ChevronDown,
  CheckCircle2,
  Clock,
  AlertCircle,
  Users,
  Calendar,
  Eye,
  ClipboardCheck,
} from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";

interface EvaluationSummary {
  overallScore: number;
  period: string;
  completionStatus: {
    self: { completed: boolean; score?: number };
    peer: { completed: boolean; count: number; pending: number };
    upward: { completed: boolean; score?: number };
    manager: { completed: boolean; score?: number };
    adHoc: { completed: boolean; count: number; pending: number };
  };
}

interface Assignment {
  id: string;
  evaluatorType?: string;
  evaluation_type?: string;
  status: string;
  submittedAt?: string | null;
  submitted_at?: string | null;
  dueDate?: string | null;
  due_date?: string | null;
  definition?: {
    id: string;
    name: string;
    dueDate?: string | null;
    due_date?: string | null;
  };
  evaluatee?: {
    first_name: string;
    last_name: string;
    position: string;
  };
}

export default function Evaluations() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isLoading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [mainTab, setMainTab] = useState(searchParams.get("tab") || "performance");
  const [activeTab, setActiveTab] = useState("self");

  const [summary, setSummary] = useState<EvaluationSummary | null>(null);
  const [evaluationData, setEvaluationData] = useState<any>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  const normalizeAssignmentType = (assignment: Assignment) =>
    String(assignment.evaluatorType ?? assignment.evaluation_type ?? "")
      .toLowerCase()
      .trim();

  const isClosedAssignment = (status: string) => {
    const normalizedStatus = String(status || "").toLowerCase().trim();
    return normalizedStatus === "submitted" || normalizedStatus === "completed" || normalizedStatus === "cancelled";
  };

  const resolveSelfAssignment = () => {
    const selfAssignments = assignments.filter((assignment) => normalizeAssignmentType(assignment) === "self");
    if (selfAssignments.length === 0) return null;

    const openAssignment = selfAssignments.find((assignment) => !isClosedAssignment(assignment.status));
    return openAssignment ?? selfAssignments[0];
  };

  const openSelfEvaluation = () => {
    const selfAssignment = resolveSelfAssignment();
    if (selfAssignment) {
      navigate(`/evaluation/${selfAssignment.id}`);
      return;
    }

    setMainTab("assignments");
    setSearchParams({ tab: "assignments" });
    toast({
      title: "No self evaluation assignment found",
      description: "Ask HR/Admin to create cycle evaluations for this active cycle.",
      variant: "destructive",
    });
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/auth");
      return;
    }
    loadAllData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, navigate]);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab) setMainTab(tab);
  }, [searchParams]);

  const calculateSelfScore = (evaluation: any) => {
    const ratings = [
      evaluation.self_technical_expertise,
      evaluation.self_communication,
      evaluation.self_collaboration,
      evaluation.self_problem_solving,
      evaluation.self_time_management,
      evaluation.self_innovation,
    ].filter((r) => r != null);

    return ratings.length > 0 ? ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length : 0;
  };

  const calculateUpwardScore = (evaluation: any) => {
    const ratings = [
      evaluation.leadership_vision,
      evaluation.communication,
      evaluation.decision_making,
      evaluation.team_development,
      evaluation.delegation,
      evaluation.conflict_resolution,
      evaluation.recognition,
    ].filter((r) => r != null);

    return ratings.length > 0 ? ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length : 0;
  };

  const calculateManagerScore = (evaluation: any) => {
    const ratings = [
      evaluation.manager_technical_expertise,
      evaluation.manager_communication,
      evaluation.manager_collaboration,
      evaluation.manager_problem_solving,
      evaluation.manager_time_management,
      evaluation.manager_innovation,
    ].filter((r) => r != null);

    return ratings.length > 0 ? ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length : 0;
  };

  const calculateOverallScore = (status: any) => {
    let totalScore = 0;
    let count = 0;

    if (status.self.completed && status.self.score) {
      totalScore += status.self.score;
      count++;
    }
    if (status.upward.completed && status.upward.score) {
      totalScore += status.upward.score;
      count++;
    }
    if (status.manager.completed && status.manager.score) {
      totalScore += status.manager.score;
      count++;
    }

    return count > 0 ? (totalScore / count) * 20 : 0;
  };

  const loadAllData = async () => {
    try {
      setLoading(true);
      if (!user) {
        navigate("/auth");
        return;
      }
      const actorProfileId = Number(
        (user as any)?.profileId ?? (user as any)?.profile_id ?? user?.profile?.id ?? user?.id ?? 0
      );

      // Load active cycle
      const cycles = await apiFetch<any[]>('GET', "/evaluation-cycles?status=active&limit=1");

      if (!cycles || cycles.length === 0) {
        setSummary({
          overallScore: 0,
          period: "No active evaluation cycle",
          completionStatus: {
            self: { completed: false },
            peer: { completed: false, count: 0, pending: 0 },
            upward: { completed: false },
            manager: { completed: false },
            adHoc: { completed: false, count: 0, pending: 0 },
          },
        });
        setEvaluationData(null);
        setAssignments([]);
        return;
      }

      const cycle = cycles[0];

      // Load self evaluation
      const selfEval = await apiFetch<any>(
        'GET',
        `/employee-evaluations?employeeId=${actorProfileId}&cycleId=${cycle.id}&single=true`
      );

      // Load peer evaluations (as evaluator)
      const peerEvals = await apiFetch<any[]>(
        'GET',
        `/peer-evaluations?evaluatorId=${actorProfileId}&cycleId=${cycle.id}`
      );

      // Load upward evaluation
      const upwardEval = await apiFetch<any>(
        'GET',
        `/upward-evaluations?evaluatorId=${actorProfileId}&cycleId=${cycle.id}&single=true`
      );

      // Load ad-hoc assignments (if your backend doesn't support this yet, it may 404 — that's OK for now)
      // Load assignments with full details (may require backend work)
      const assignmentsData = await apiFetch<any[]>(
        'GET', `/evaluation-assignments?evaluatorProfileId=${actorProfileId}&include=definition,evaluatee`
      );

      setAssignments(assignmentsData || []);

      const completionStatus = {
        self: {
          completed: selfEval?.status === "self_submitted" || selfEval?.status === "completed",
          score: selfEval ? calculateSelfScore(selfEval) : undefined,
        },
        peer: {
          completed: (peerEvals || []).every((p: any) => p.status === "completed"),
          count: peerEvals?.length || 0,
          pending: (peerEvals || []).filter((p: any) => p.status !== "completed").length,
        },
        upward: {
          completed: upwardEval?.status === "completed",
          score: upwardEval ? calculateUpwardScore(upwardEval) : undefined,
        },
        manager: {
          completed: selfEval?.status === "completed" || selfEval?.status === "submitted",
          score: selfEval ? calculateManagerScore(selfEval) : undefined,
        },
        adHoc: {
          completed: (assignmentsData || []).every(
            (a: any) => a.status === "completed" || a.status === "submitted"
          ),
          count: assignmentsData?.length || 0,
          pending: (assignmentsData || []).filter(
            (a: any) => a.status !== "completed" && a.status !== "submitted"
          ).length,
        },
      };

      const overallScore = calculateOverallScore(completionStatus);

      setSummary({
        overallScore,
        period: `${new Date(cycle.startDate ?? cycle.start_date).toLocaleDateString()} - ${new Date(cycle.endDate ?? cycle.end_date).toLocaleDateString()}`,
        completionStatus,
      });

      setEvaluationData({
        selfEval,
        peerEvals,
        upwardEval,
        adHocAssignments: assignmentsData,
        cycle,
      });
    } catch (error: any) {
      console.error(error);
      toast({
        title: "Error loading evaluations",
        description: error?.message || "Failed to load evaluations",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getCompletionPercentage = () => {
    if (!summary) return 0;
    const statuses = [
      summary.completionStatus.self.completed,
      summary.completionStatus.peer.completed,
      summary.completionStatus.upward.completed,
      summary.completionStatus.manager.completed,
      summary.completionStatus.adHoc.completed,
    ];
    const completed = statuses.filter(Boolean).length;
    return (completed / statuses.length) * 100;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <Badge className="bg-green-500">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Completed
          </Badge>
        );
      case "pending":
        return (
          <Badge variant="outline">
            <Clock className="mr-1 h-3 w-3" />
            Pending
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "self":
        return "Self Evaluation";
      case "peer":
        return "Peer Evaluation";
      case "upward":
        return "Upward Evaluation";
      case "downward":
        return "Downward Evaluation";
      default:
        return type;
    }
  };

  const isOverdue = (dueDate: string | null) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  };

  const pendingAssignments = assignments.filter((a) => a.status !== "completed");
  const completedAssignments = assignments.filter((a) => a.status === "completed");

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
            <p className="text-muted-foreground">Manage your evaluations and assignments</p>
          </div>
          {pendingAssignments.length > 0 && (
            <Badge variant="destructive" className="text-base px-3 py-1">
              {pendingAssignments.length} Pending
            </Badge>
          )}
        </div>

        <Tabs
          value={mainTab}
          onValueChange={(v) => {
            setMainTab(v);
            setSearchParams(v === "performance" ? {} : { tab: v });
          }}
        >
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="performance">My Performance</TabsTrigger>
            <TabsTrigger value="assignments" className="relative">
              My Assignments
              {pendingAssignments.length > 0 && (
                <Badge
                  variant="destructive"
                  className="ml-2 h-5 w-5 p-0 flex items-center justify-center text-xs"
                >
                  {pendingAssignments.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="performance" className="space-y-6">
            <Card className="border-primary/20">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-2xl">Performance Evaluation</CardTitle>
                    <CardDescription>{summary?.period}</CardDescription>
                  </div>
                  <div className="text-right">
                    <div className="text-4xl font-bold text-primary">
                      {summary?.overallScore.toFixed(1)}%
                    </div>
                    <p className="text-sm text-muted-foreground">Overall Score</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Completion Progress</span>
                      <span className="text-sm text-muted-foreground">
                        {getCompletionPercentage().toFixed(0)}%
                      </span>
                    </div>
                    <Progress value={getCompletionPercentage()} />
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    {summary &&
                      Object.entries(summary.completionStatus).map(([key, value]) => (
                        <div key={key} className="flex items-center gap-2">
                          {value.completed ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : (
                            <Clock className="h-4 w-4 text-orange-500" />
                          )}
                          <span className="text-sm capitalize">{key}</span>
                        </div>
                      ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="self">Self</TabsTrigger>
                <TabsTrigger value="peer">Peer</TabsTrigger>
                <TabsTrigger value="upward">Upward</TabsTrigger>
                <TabsTrigger value="manager">Manager</TabsTrigger>
                <TabsTrigger value="adhoc">Ad-hoc</TabsTrigger>
              </TabsList>

              <TabsContent value="self" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Self Evaluation</CardTitle>
                    <CardDescription>Rate your own performance across key competencies</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {summary?.completionStatus.self.completed ? (
                      <div className="space-y-4">
                        <Badge className="bg-green-500">Completed</Badge>
                        <p className="text-sm text-muted-foreground">
                          Score: {summary.completionStatus.self.score?.toFixed(1)}/5.0
                        </p>
                        <Button variant="outline" onClick={openSelfEvaluation}>
                          View Details
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <Badge variant="outline">Pending</Badge>
                        <Button onClick={openSelfEvaluation}>Start Self Evaluation</Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="peer" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Peer Evaluations</CardTitle>
                    <CardDescription>Evaluate your colleagues&apos; performance</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {summary?.completionStatus.peer.count === 0 ? (
                      <div className="text-center py-8">
                        <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                        <p className="text-muted-foreground">No peer evaluations assigned</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex items-center gap-4">
                          <Badge className={summary?.completionStatus.peer.completed ? "bg-green-500" : "bg-orange-500"}>
                            {summary?.completionStatus.peer.pending} Pending
                          </Badge>
                          <span className="text-sm text-muted-foreground">{summary?.completionStatus.peer.count} Total</span>
                        </div>
                        <Button onClick={() => navigate("/evaluations?tab=performance")}>View Peer Evaluations</Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="upward" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Upward Evaluation</CardTitle>
                    <CardDescription>Evaluate your manager&apos;s leadership</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {summary?.completionStatus.upward.completed ? (
                      <div className="space-y-4">
                        <Badge className="bg-green-500">Completed</Badge>
                        <p className="text-sm text-muted-foreground">
                          Score: {summary.completionStatus.upward.score?.toFixed(1)}/5.0
                        </p>
                        <Button variant="outline" onClick={() => navigate("/upward-reviews")}>
                          View Details
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <Badge variant="outline">Pending</Badge>
                        <Button onClick={() => navigate("/upward-reviews")}>Start Upward Evaluation</Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="manager" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Manager Review</CardTitle>
                    <CardDescription>Your manager&apos;s evaluation of your performance</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {summary?.completionStatus.manager.completed ? (
                      <div className="space-y-4">
                        <Badge className="bg-green-500">Completed</Badge>
                        <p className="text-sm text-muted-foreground">
                          Score: {summary.completionStatus.manager.score?.toFixed(1)}/5.0
                        </p>
                        <Button variant="outline" onClick={() => navigate("/evaluations?tab=performance")}>
                          View Manager Feedback
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <Badge variant="outline">Pending Manager Review</Badge>
                        <p className="text-sm text-muted-foreground">Waiting for your manager to complete the evaluation</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="adhoc" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Ad-hoc Evaluations</CardTitle>
                    <CardDescription>Special evaluation assignments</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {summary?.completionStatus.adHoc.count === 0 ? (
                      <div className="text-center py-8">
                        <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                        <p className="text-muted-foreground">No ad-hoc evaluations assigned</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex items-center gap-4">
                          <Badge className={summary?.completionStatus.adHoc.completed ? "bg-green-500" : "bg-orange-500"}>
                            {summary?.completionStatus.adHoc.pending} Pending
                          </Badge>
                          <span className="text-sm text-muted-foreground">{summary?.completionStatus.adHoc.count} Total</span>
                        </div>
                        <Button
                          onClick={() => {
                            setMainTab("assignments");
                            setSearchParams({ tab: "assignments" });
                          }}
                        >
                          View Assignments
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            <div className="space-y-4">
              <h2 className="text-2xl font-bold">Evaluation Results & Feedback</h2>

              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" className="w-full justify-between">
                    <span>Self Evaluation Results</span>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-4">
                  <Card>
                    <CardContent className="pt-6">
                      {evaluationData?.selfEval ? (
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-sm font-medium">Technical Expertise</p>
                              <p className="text-2xl font-bold">{evaluationData.selfEval.self_technical_expertise}/5</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium">Communication</p>
                              <p className="text-2xl font-bold">{evaluationData.selfEval.self_communication}/5</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium">Collaboration</p>
                              <p className="text-2xl font-bold">{evaluationData.selfEval.self_collaboration}/5</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium">Problem Solving</p>
                              <p className="text-2xl font-bold">{evaluationData.selfEval.self_problem_solving}/5</p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <p className="text-muted-foreground">No self evaluation completed yet</p>
                      )}
                    </CardContent>
                  </Card>
                </CollapsibleContent>
              </Collapsible>

              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" className="w-full justify-between">
                    <span>Peer Review Results</span>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-4">
                  <Card>
                    <CardContent className="pt-6">
                      {evaluationData?.peerEvals && evaluationData.peerEvals.length > 0 ? (
                        <div className="space-y-4">
                          {evaluationData.peerEvals.map((peer: any) => (
                            <div key={peer.id} className="border-b pb-4 last:border-0">
                              <Badge className="mb-2">{peer.status}</Badge>
                              <p className="text-sm text-muted-foreground">
                                {peer.is_anonymous ? "Anonymous Peer" : "Peer Review"}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-muted-foreground">No peer evaluations available</p>
                      )}
                    </CardContent>
                  </Card>
                </CollapsibleContent>
              </Collapsible>

              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" className="w-full justify-between">
                    <span>Manager Feedback</span>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-4">
                  <Card>
                    <CardContent className="pt-6">
                      {evaluationData?.selfEval?.manager_comments ? (
                        <div className="space-y-4">
                          <div>
                            <p className="text-sm font-medium mb-2">Manager Comments</p>
                            <p className="text-muted-foreground">{evaluationData.selfEval.manager_comments}</p>
                          </div>
                          <div>
                            <p className="text-sm font-medium mb-2">Strengths</p>
                            <p className="text-muted-foreground">{evaluationData.selfEval.manager_strengths}</p>
                          </div>
                          <div>
                            <p className="text-sm font-medium mb-2">Areas for Improvement</p>
                            <p className="text-muted-foreground">{evaluationData.selfEval.manager_improvements}</p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-muted-foreground">Manager review pending</p>
                      )}
                    </CardContent>
                  </Card>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </TabsContent>

          <TabsContent value="assignments" className="space-y-6">
            <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-primary">{pendingAssignments.length}</div>
                    <p className="text-sm text-muted-foreground mt-1">Pending Evaluations</p>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-destructive">
                      {pendingAssignments.filter((a) => a.due_date && isOverdue(a.due_date)).length}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">Overdue</p>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-green-600">{completedAssignments.length}</div>
                    <p className="text-sm text-muted-foreground mt-1">Completed</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {pendingAssignments.length > 0 ? (
              <div>
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Clock className="h-5 w-5 text-primary" />
                  Pending Evaluations
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {pendingAssignments.map((assignment) => {
                    const dueDate = assignment.dueDate ?? assignment.due_date ?? assignment.definition?.dueDate ?? assignment.definition?.due_date ?? null;
                    const overdue = dueDate && isOverdue(dueDate);

                    return (
                      <Card key={assignment.id} className={overdue ? "border-destructive" : ""}>
                        <CardHeader>
                          <CardTitle className="text-lg flex items-center justify-between">
                            <span className="truncate">{assignment.definition?.name || "Evaluation"}</span>
                            {getStatusBadge(assignment.status)}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="space-y-2 text-sm">
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">Type:</span>
                              <Badge variant="outline">{getTypeLabel(assignment.evaluatorType || assignment.evaluation_type || "")}</Badge>
                            </div>
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4 text-muted-foreground" />
                              <span className="text-muted-foreground">Evaluatee:</span>
                              <span className="font-medium">
                                {assignment.evaluatee?.first_name} {assignment.evaluatee?.last_name}
                              </span>
                            </div>
                            {dueDate && (
                              <div className={`flex items-center gap-2 ${overdue ? "text-destructive font-semibold" : ""}`}>
                                <Calendar className="h-4 w-4" />
                                <span className="text-muted-foreground">Due:</span>
                                <span>{format(new Date(dueDate), "MMM dd, yyyy")}</span>
                                {overdue && <AlertCircle className="h-4 w-4 ml-1" />}
                              </div>
                            )}
                          </div>
                          <Button
                            className="w-full"
                            variant={overdue ? "destructive" : "default"}
                            onClick={() => navigate(`/evaluation/${assignment.id}`)}
                          >
                            <ClipboardCheck className="mr-2 h-4 w-4" />
                            {overdue ? "Complete Now (Overdue)" : "Start Evaluation"}
                          </Button>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ) : (
              <Card className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 border-green-200 dark:border-green-800">
                <CardContent className="pt-6 text-center">
                  <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-3" />
                  <h3 className="text-lg font-semibold text-green-800 dark:text-green-200 mb-2">All Caught Up!</h3>
                  <p className="text-green-600 dark:text-green-300">You have no pending evaluations at this time.</p>
                </CardContent>
              </Card>
            )}

            {completedAssignments.length > 0 && (
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between">
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                      Completed Evaluations ({completedAssignments.length})
                    </span>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {completedAssignments.map((assignment) => (
                      <Card key={assignment.id} className="opacity-75">
                        <CardHeader>
                          <CardTitle className="text-lg flex items-center justify-between">
                            <span className="truncate">{assignment.definition?.name || "Evaluation"}</span>
                            {getStatusBadge(assignment.status)}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="space-y-2 text-sm">
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">Type:</span>
                              <Badge variant="outline">{getTypeLabel(assignment.evaluatorType || assignment.evaluation_type || "")}</Badge>
                            </div>
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4 text-muted-foreground" />
                              <span className="text-muted-foreground">Evaluatee:</span>
                              <span className="font-medium">
                                {assignment.evaluatee?.first_name} {assignment.evaluatee?.last_name}
                              </span>
                            </div>
                            {(assignment.submittedAt || assignment.submitted_at) && (
                              <div className="flex items-center gap-2 text-green-600">
                                <CheckCircle2 className="h-4 w-4" />
                                <span>
                                  Completed {format(new Date(assignment.submittedAt || assignment.submitted_at || ""), "MMM dd, yyyy")}
                                </span>
                              </div>
                            )}
                          </div>
                          <Button className="w-full" variant="outline" onClick={() => navigate(`/evaluation/${assignment.id}`)}>
                            <Eye className="mr-2 h-4 w-4" />
                            View Evaluation
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

