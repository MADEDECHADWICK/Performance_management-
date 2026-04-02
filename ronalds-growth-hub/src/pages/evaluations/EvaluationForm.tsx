import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { AlertCircle, CheckCircle2, Clock3, FileSignature, ShieldCheck } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import PageLoader from "@/components/ui/page-loader";
import { useToast } from "@/hooks/use-toast";
import evaluationsAPI from "@/lib/api/evaluations";

type ResponseState = Record<number, { score: number; comment: string }>;
type DraftState = {
  responses: ResponseState;
  evaluatorComment: string;
  evaluatorSigned: boolean;
};

const CATEGORY_LABELS: Record<string, string> = {
  competency: "Competency",
  behavior: "Behavior",
  culture: "Culture",
};

const SCORE_LABELS: Record<number, string> = {
  1: "Unsatisfactory",
  2: "Needs Improvement",
  3: "Meets Expectations",
  4: "Exceeds Expectations",
  5: "Outstanding",
};

const formatDateTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString() : "Not available";

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString() : "Not scheduled";

const titleCase = (value?: string | null) =>
  String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();

export default function EvaluationForm() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const storageKey = `evaluation-draft:${assignmentId}`;
  const numericAssignmentId = Number(assignmentId);

  const assignmentQuery = useQuery({
    queryKey: ["evaluation-assignment", numericAssignmentId],
    queryFn: () => evaluationsAPI.getAssignmentById(numericAssignmentId),
    enabled: Number.isFinite(numericAssignmentId) && numericAssignmentId > 0,
  });

  const assignment = assignmentQuery.data;
  const templateQuestions = assignment?.template?.questions || [];
  const canSubmit = Boolean(assignment?.viewerContext?.canSubmit);
  const canAcknowledge = Boolean(assignment?.viewerContext?.canAcknowledge);
  const signatureRequired = Boolean(assignment?.definition?.requireEvaluatorSignature);

  const [responses, setResponses] = useState<ResponseState>({});
  const [evaluatorComment, setEvaluatorComment] = useState("");
  const [evaluatorSigned, setEvaluatorSigned] = useState(false);

  useEffect(() => {
    if (!assignment) return;

    const responseSeed = Object.fromEntries(
      (assignment.responses || []).map((response) => [
        response.questionId,
        {
          score: response.score,
          comment: response.comment || "",
        },
      ])
    );

    if (canSubmit) {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as DraftState;
          setResponses(parsed.responses || responseSeed);
          setEvaluatorComment(parsed.evaluatorComment || assignment.submissionSummary?.evaluatorComment || "");
          setEvaluatorSigned(
            Boolean(parsed.evaluatorSigned || assignment.signatureStatus?.evaluatorSigned)
          );
          return;
        } catch {
          localStorage.removeItem(storageKey);
        }
      }
    }

    setResponses(responseSeed);
    setEvaluatorComment(assignment.submissionSummary?.evaluatorComment || "");
    setEvaluatorSigned(Boolean(assignment.signatureStatus?.evaluatorSigned));
  }, [assignment, canSubmit, storageKey]);

  useEffect(() => {
    if (!canSubmit) return;
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        responses,
        evaluatorComment,
        evaluatorSigned,
      } satisfies DraftState)
    );
  }, [canSubmit, evaluatorComment, evaluatorSigned, responses, storageKey]);

  const completion = useMemo(() => {
    if (!templateQuestions.length) return 0;
    const answered = templateQuestions.filter((question) => responses[question.id]?.score).length;
    return Math.round((answered / templateQuestions.length) * 100);
  }, [responses, templateQuestions]);

  const groupedQuestions = useMemo(() => {
    const groups = new Map<
      string,
      {
        key: string;
        label: string;
        questions: typeof templateQuestions;
      }
    >();

    templateQuestions
      .slice()
      .sort((left, right) => left.order - right.order)
      .forEach((question) => {
        const key = question.category || "competency";
        const existing = groups.get(key) || {
          key,
          label: CATEGORY_LABELS[key] || titleCase(key),
          questions: [],
        };
        existing.questions.push(question);
        groups.set(key, existing);
      });

    return Array.from(groups.values());
  }, [templateQuestions]);

  const submitMutation = useMutation({
    mutationFn: () =>
      evaluationsAPI.submitEvaluation(numericAssignmentId, {
        responses: templateQuestions.map((question) => ({
          questionId: question.id,
          score: responses[question.id]?.score || 0,
          comment: responses[question.id]?.comment || "",
        })),
        evaluatorComment: evaluatorComment.trim() || undefined,
        evaluatorSigned,
      }),
    onSuccess: async (updatedAssignment) => {
      localStorage.removeItem(storageKey);
      queryClient.setQueryData(["evaluation-assignment", numericAssignmentId], updatedAssignment);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["evaluation-dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["evaluation-cycles"] }),
      ]);
      toast({
        title: "Evaluation submitted",
        description: "The submission is saved and the cycle score will update automatically.",
      });
    },
  });

  const acknowledgeMutation = useMutation({
    mutationFn: () => evaluationsAPI.acknowledgeEvaluation(numericAssignmentId),
    onSuccess: async (updatedAssignment) => {
      queryClient.setQueryData(["evaluation-assignment", numericAssignmentId], updatedAssignment);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["evaluation-dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["evaluation-cycles"] }),
      ]);
      toast({
        title: "Evaluation acknowledged",
        description: "Your acknowledgement has been recorded.",
      });
    },
  });

  if (assignmentQuery.isLoading) {
    return (
      <DashboardLayout>
        <PageLoader message="Loading evaluation workspace..." minHeightClassName="min-h-[50vh]" />
      </DashboardLayout>
    );
  }

  if (!assignment) {
    return (
      <DashboardLayout>
        <div className="text-sm text-muted-foreground">Evaluation assignment not found.</div>
      </DashboardLayout>
    );
  }

  const headerPerson = assignment.viewerContext?.isEvaluatee
    ? assignment.anonymity?.evaluatorLabel || "Assigned evaluator"
    : `${assignment.evaluatee?.firstName || ""} ${assignment.evaluatee?.lastName || ""}`.trim();

  const handleScoreChange = (questionId: number, score: number) => {
    setResponses((current) => ({
      ...current,
      [questionId]: {
        score,
        comment: current[questionId]?.comment || "",
      },
    }));
  };

  const handleCommentChange = (questionId: number, comment: string) => {
    setResponses((current) => ({
      ...current,
      [questionId]: {
        score: current[questionId]?.score || 0,
        comment,
      },
    }));
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{titleCase(assignment.relationship)}</Badge>
              <Badge variant="outline">{titleCase(assignment.status)}</Badge>
              {assignment.definition?.processAnonymously && (
                <Badge variant="outline">Anonymous processing</Badge>
              )}
              {assignment.definition?.excludeFromScore && <Badge variant="outline">Excluded from score</Badge>}
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">
              {assignment.cycle?.title || "Evaluation"} Workspace
            </h1>
            <p className="max-w-3xl text-sm text-muted-foreground">
              {assignment.viewerContext?.isEvaluatee
                ? `Review the submitted evaluation for ${assignment.evaluatee?.firstName || "your"} profile.`
                : `Complete the evaluation for ${headerPerson}.`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/evaluations">Back to Dashboard</Link>
            </Button>
            {assignment.scoreReport && assignment.viewerContext?.canViewScoreReport && assignment.cycleId ? (
              <Button asChild variant="outline">
                <Link to={`/evaluations/cycles/${assignment.cycleId}/results`}>View Cycle Results</Link>
              </Button>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Due Date</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-semibold">{formatDate(assignment.workflow?.dueDate || assignment.dueDate)}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {assignment.workflow?.isOverdue ? "Overdue" : "Submission window active"}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Completion</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-semibold">
                {canSubmit ? `${completion}%` : assignment.status === "submitted" ? "Submitted" : "Waiting"}
              </div>
              <Progress className="mt-3 h-2" value={canSubmit ? completion : assignment.status === "submitted" ? 100 : 0} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Signature</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-semibold">
                {assignment.signatureStatus?.evaluatorSigned
                  ? "Signed"
                  : signatureRequired
                    ? "Required"
                    : "Optional"}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {assignment.signatureStatus?.evaluatorSignedAt
                  ? `Captured ${formatDateTime(assignment.signatureStatus.evaluatorSignedAt)}`
                  : signatureRequired
                    ? "Submission is blocked until the evaluator signs."
                    : "No evaluator signature has been captured."}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Acknowledgement</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-semibold">
                {assignment.signatureStatus?.evaluateeAcknowledged
                  ? "Acknowledged"
                  : assignment.definition?.requireEvaluateeSignature
                    ? "Pending"
                    : "Not required"}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {assignment.signatureStatus?.evaluateeAcknowledgedAt
                  ? `Recorded ${formatDateTime(assignment.signatureStatus.evaluateeAcknowledgedAt)}`
                  : assignment.definition?.requireEvaluateeSignature
                    ? "The evaluated employee must acknowledge this review."
                    : "No acknowledgement step is configured."}
              </div>
            </CardContent>
          </Card>
        </div>

        {assignment.definition?.processAnonymously && assignment.viewerContext?.isEvaluatee && (
          <Alert>
            <ShieldCheck className="h-4 w-4" />
            <AlertTitle>Anonymous evaluation</AlertTitle>
            <AlertDescription>
              Evaluator identity is hidden for this assignment. Comments and scores remain visible.
            </AlertDescription>
          </Alert>
        )}

        {assignment.definition?.excludeFromScore && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Excluded from score computation</AlertTitle>
            <AlertDescription>
              This review is stored for feedback and discussion, but it does not affect the weighted cycle score.
            </AlertDescription>
          </Alert>
        )}

        {canAcknowledge && (
          <Alert>
            <FileSignature className="h-4 w-4" />
            <AlertTitle>Acknowledgement required</AlertTitle>
            <AlertDescription>
              Review the submitted feedback and acknowledge it once you are comfortable with the record.
            </AlertDescription>
          </Alert>
        )}

        {assignment.scoreReport && assignment.viewerContext?.canViewScoreReport && (
          <Card className="border-emerald-200/70 bg-emerald-50/30">
            <CardHeader>
              <CardTitle>Score Summary</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <div className="rounded-xl border bg-background p-4">
                <div className="text-sm text-muted-foreground">Overall</div>
                <div className="mt-2 text-3xl font-semibold">{assignment.scoreReport.overall.toFixed(2)}</div>
                <div className="text-sm text-muted-foreground">{assignment.scoreReport.ratingBand}</div>
              </div>
              <div className="rounded-xl border bg-background p-4">
                <div className="text-sm text-muted-foreground">Total Score</div>
                <div className="mt-2 text-3xl font-semibold">{assignment.scoreReport.totalScore.toFixed(1)}</div>
                <div className="text-sm text-muted-foreground">Composite performance score</div>
              </div>
              <div className="rounded-xl border bg-background p-4">
                <div className="text-sm text-muted-foreground">Peer vs Manager Variance</div>
                <div className="mt-2 text-3xl font-semibold">
                  {assignment.scoreReport.peerVsManagerVariance.toFixed(2)}
                </div>
                <div className="text-sm text-muted-foreground">Difference in average evaluator scoring</div>
              </div>
              {Object.entries(assignment.scoreReport.byCategory).map(([category, score]) => (
                <div key={category} className="rounded-xl border bg-background p-4">
                  <div className="text-sm text-muted-foreground">{CATEGORY_LABELS[category] || titleCase(category)}</div>
                  <div className="mt-2 text-2xl font-semibold">{score.toFixed(2)}</div>
                  <Progress className="mt-3 h-2" value={Math.min(score * 20, 100)} />
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <Card>
            <CardHeader>
              <CardTitle>
                {canSubmit ? "Result Areas and Questions" : "Submitted Responses"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Accordion
                type="multiple"
                defaultValue={groupedQuestions.map((group) => group.key)}
                className="space-y-3"
              >
                {groupedQuestions.map((group) => (
                  <AccordionItem key={group.key} value={group.key} className="rounded-xl border px-4">
                    <AccordionTrigger className="text-left">
                      <div>
                        <div className="font-medium">{group.label}</div>
                        <div className="text-sm text-muted-foreground">
                          {group.questions.length} question{group.questions.length === 1 ? "" : "s"}
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-2">
                      {group.questions.map((question) => (
                        <div key={question.id} className="rounded-xl border bg-muted/20 p-4">
                          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                            <div>
                              <div className="font-medium">{question.text}</div>
                              <div className="mt-1 text-sm text-muted-foreground">
                                Weight {question.weight} | {CATEGORY_LABELS[question.category] || titleCase(question.category)}
                              </div>
                            </div>
                            {responses[question.id]?.score ? (
                              <Badge>{SCORE_LABELS[responses[question.id].score]}</Badge>
                            ) : (
                              <Badge variant="outline">Not answered</Badge>
                            )}
                          </div>

                          {canSubmit ? (
                            <div className="mt-4 space-y-4">
                              <div className="grid gap-2 md:grid-cols-5">
                                {[1, 2, 3, 4, 5].map((value) => (
                                  <button
                                    key={value}
                                    type="button"
                                    onClick={() => handleScoreChange(question.id, value)}
                                    data-testid={`evaluation-score-${question.id}-${value}`}
                                    className={`rounded-xl border px-3 py-3 text-left transition ${
                                      responses[question.id]?.score === value
                                        ? "border-primary bg-primary text-primary-foreground"
                                        : "border-border bg-background hover:border-primary/40"
                                    }`}
                                  >
                                    <div className="text-lg font-semibold">{value}</div>
                                    <div className="text-xs opacity-80">{SCORE_LABELS[value]}</div>
                                  </button>
                                ))}
                              </div>
                              <Textarea
                                placeholder="Add context, examples, or coaching notes"
                                value={responses[question.id]?.comment || ""}
                                onChange={(event) => handleCommentChange(question.id, event.target.value)}
                              />
                            </div>
                          ) : (
                            <div className="mt-4 rounded-xl border bg-background p-4">
                              <div className="text-sm font-medium">
                                Score: {responses[question.id]?.score || 0} / 5
                              </div>
                              <div className="mt-2 text-sm text-muted-foreground">
                                {responses[question.id]?.comment?.trim()
                                  ? responses[question.id].comment
                                  : "No written comment was added for this question."}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Submission Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-xl border bg-muted/20 p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock3 className="h-4 w-4" />
                    Submitted
                  </div>
                  <div className="mt-2 font-medium">{formatDateTime(assignment.submittedAt)}</div>
                </div>

                <div className="rounded-xl border bg-muted/20 p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <ShieldCheck className="h-4 w-4" />
                    Evaluator
                  </div>
                  <div className="mt-2 font-medium">
                    {assignment.anonymity?.evaluatorLabel || "Assigned evaluator"}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">Overall evaluator note</div>
                  {canSubmit ? (
                    <Textarea
                      value={evaluatorComment}
                      onChange={(event) => setEvaluatorComment(event.target.value)}
                      placeholder="Summarize strengths, risks, and the next coaching action."
                    />
                  ) : (
                    <div className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
                      {assignment.submissionSummary?.evaluatorComment?.trim()
                        ? assignment.submissionSummary.evaluatorComment
                        : "No overall evaluator note was added."}
                    </div>
                  )}
                </div>

                {signatureRequired ? (
                  <label className="flex items-start gap-3 rounded-xl border bg-muted/20 p-4">
                    <Checkbox
                      data-testid="evaluation-evaluator-signature"
                      checked={evaluatorSigned}
                      disabled={!canSubmit || submitMutation.isPending}
                      onCheckedChange={(checked) => setEvaluatorSigned(Boolean(checked))}
                    />
                    <div className="space-y-1">
                      <div className="font-medium">Evaluator signature</div>
                      <div className="text-sm text-muted-foreground">
                        I confirm that this review reflects my honest assessment and I am ready to submit it.
                      </div>
                    </div>
                  </label>
                ) : null}

                {assignment.signatureStatus?.evaluateeAcknowledged ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                    <div className="flex items-center gap-2 font-medium">
                      <CheckCircle2 className="h-4 w-4" />
                      Acknowledged by evaluatee
                    </div>
                    <div className="mt-1">
                      {formatDateTime(assignment.signatureStatus.evaluateeAcknowledgedAt)}
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {canSubmit ? (
                  <>
                    <div className="text-sm text-muted-foreground">
                      All questions must be answered before submission.
                    </div>
                    <Button
                      className="w-full"
                      onClick={() => submitMutation.mutate()}
                      disabled={
                        submitMutation.isPending ||
                        completion < 100 ||
                        (signatureRequired && !evaluatorSigned)
                      }
                      data-testid="evaluation-submit"
                    >
                      {submitMutation.isPending ? "Submitting..." : "Submit Evaluation"}
                    </Button>
                  </>
                ) : null}

                {canAcknowledge ? (
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => acknowledgeMutation.mutate()}
                    disabled={acknowledgeMutation.isPending}
                  >
                    {acknowledgeMutation.isPending ? "Recording..." : "Acknowledge Evaluation"}
                  </Button>
                ) : null}

                {!canSubmit && !canAcknowledge ? (
                  <div className="text-sm text-muted-foreground">
                    {assignment.status === "submitted"
                      ? "This assignment is complete. Review the responses and score summary above."
                      : "This assignment is visible here, but it is not currently actionable for your role."}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
