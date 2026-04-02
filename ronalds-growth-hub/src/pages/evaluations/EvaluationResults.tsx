import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { BarChart3, FileSignature, MessagesSquare, ShieldCheck, Users } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import PageLoader from "@/components/ui/page-loader";
import evaluationsAPI from "@/lib/api/evaluations";

const CATEGORY_LABELS: Record<string, string> = {
  competency: "Competency",
  behavior: "Behavior",
  culture: "Culture",
};

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString() : "Not scheduled";

const titleCase = (value?: string | null) =>
  String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();

export default function EvaluationResults() {
  const { cycleId } = useParams<{ cycleId: string }>();
  const numericCycleId = Number(cycleId);

  const resultsQuery = useQuery({
    queryKey: ["evaluation-cycle-results", numericCycleId],
    queryFn: () => evaluationsAPI.getCycleResults(numericCycleId),
    enabled: Number.isFinite(numericCycleId) && numericCycleId > 0,
  });

  const data = resultsQuery.data;

  const averageTotalScore = useMemo(() => {
    if (!data?.results.length) return 0;
    return (
      data.results.reduce((sum, item) => sum + Number(item.totalScore || 0), 0) / data.results.length
    );
  }, [data]);

  if (resultsQuery.isLoading) {
    return (
      <DashboardLayout>
        <PageLoader message="Loading cycle results..." minHeightClassName="min-h-[50vh]" />
      </DashboardLayout>
    );
  }

  if (!data) {
    return (
      <DashboardLayout>
        <div className="text-sm text-muted-foreground">Cycle results not found.</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{titleCase(data.cycleType)}</Badge>
              <Badge variant="outline">{titleCase(data.status)}</Badge>
              {data.definition?.processAnonymously && <Badge variant="outline">Anonymous processing</Badge>}
              {data.definition?.excludeFromScore && <Badge variant="outline">Excluded from score</Badge>}
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">{data.title} Results</h1>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Submission progress, weighted performance outcomes, signature status, and comment highlights.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/evaluations/cycles">Back to Cycle Manager</Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Completion</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{Math.round(data.completionPercent)}%</div>
              <Progress className="mt-3 h-2" value={data.completionPercent} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Employees Scored</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{data.results.length}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {data.submittedAssignments} submitted assignments
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Average Total Score</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{averageTotalScore.toFixed(1)}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Composite score across evaluation and development signals
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Due Date</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{formatDate(data.definition?.dueDate)}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Signature and reminder rules flow from this cycle definition
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Rating Distribution</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(data.ratingDistribution || {}).length ? (
                Object.entries(data.ratingDistribution || {}).map(([rating, count]) => (
                  <div
                    key={rating}
                    className="flex items-center justify-between rounded-xl border bg-muted/20 px-4 py-3"
                  >
                    <span className="font-medium">{rating}</span>
                    <Badge>{count}</Badge>
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">No rating data has been generated yet.</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Signature Progress</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border bg-muted/20 p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileSignature className="h-4 w-4" />
                  Evaluator signatures
                </div>
                <div className="mt-2 text-2xl font-semibold">
                  {data.signatureSummary?.evaluatorSignedCount || 0} /{" "}
                  {data.signatureSummary?.requiredEvaluatorSignatures || 0}
                </div>
                <Progress
                  className="mt-3 h-2"
                  value={
                    (data.signatureSummary?.requiredEvaluatorSignatures || 0) > 0
                      ? ((data.signatureSummary?.evaluatorSignedCount || 0) /
                          (data.signatureSummary?.requiredEvaluatorSignatures || 1)) *
                        100
                      : 100
                  }
                />
              </div>
              <div className="rounded-xl border bg-muted/20 p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <ShieldCheck className="h-4 w-4" />
                  Evaluatee acknowledgements
                </div>
                <div className="mt-2 text-2xl font-semibold">
                  {data.signatureSummary?.evaluateeAcknowledgedCount || 0} /{" "}
                  {data.signatureSummary?.requiredEvaluateeAcknowledgements || 0}
                </div>
                <Progress
                  className="mt-3 h-2"
                  value={
                    (data.signatureSummary?.requiredEvaluateeAcknowledgements || 0) > 0
                      ? ((data.signatureSummary?.evaluateeAcknowledgedCount || 0) /
                          (data.signatureSummary?.requiredEvaluateeAcknowledgements || 1)) *
                        100
                      : 100
                  }
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {data.definition?.processAnonymously && (
          <Alert>
            <Users className="h-4 w-4" />
            <AlertTitle>Anonymous comment handling</AlertTitle>
            <AlertDescription>
              Evaluator names are masked in the comment highlights below. Relationship type remains visible.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          {data.results.length ? (
            data.results.map((result) => (
              <Card key={result.performanceScoreId}>
                <CardHeader>
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="space-y-1">
                      <CardTitle>
                        {result.employee?.firstName} {result.employee?.lastName}
                      </CardTitle>
                      <div className="text-sm text-muted-foreground">
                        {titleCase((result.employee as { department?: { name?: string } } | null)?.department?.name)} |{" "}
                        {result.assignmentSummary?.submitted || 0} of {result.assignmentSummary?.total || 0} assignments submitted
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge>{result.ratingBand || "Unrated"}</Badge>
                      <Badge variant="outline">Overall {result.overallScore.toFixed(2)}</Badge>
                      <Badge variant="outline">Total {result.totalScore.toFixed(1)}</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-xl border bg-muted/20 p-4">
                      <div className="text-sm text-muted-foreground">Cycle completion for this employee</div>
                      <div className="mt-2 text-2xl font-semibold">
                        {Math.round(result.assignmentSummary?.completionPercent || 0)}%
                      </div>
                      <Progress className="mt-3 h-2" value={result.assignmentSummary?.completionPercent || 0} />
                    </div>
                    <div className="rounded-xl border bg-muted/20 p-4">
                      <div className="text-sm text-muted-foreground">Peer vs manager variance</div>
                      <div className="mt-2 text-2xl font-semibold">
                        {(result.scoreReport?.peerVsManagerVariance || 0).toFixed(2)}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Lower variance suggests better evaluator alignment
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <BarChart3 className="h-4 w-4" />
                        Category scores
                      </div>
                      {Object.entries(result.scoreReport?.byCategory || {}).length ? (
                        Object.entries(result.scoreReport?.byCategory || {}).map(([category, score]) => (
                          <div key={`${result.performanceScoreId}-${category}`} className="rounded-xl border bg-background p-4">
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-medium">
                                {CATEGORY_LABELS[category] || titleCase(category)}
                              </span>
                              <span className="text-sm text-muted-foreground">{score.toFixed(2)}</span>
                            </div>
                            <Progress className="mt-3 h-2" value={Math.min(score * 20, 100)} />
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-muted-foreground">No category scores available.</div>
                      )}
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <FileSignature className="h-4 w-4" />
                        Relationship averages and signatures
                      </div>
                      <div className="rounded-xl border bg-background p-4">
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(result.scoreReport?.averageByRelationship || {}).length ? (
                            Object.entries(result.scoreReport?.averageByRelationship || {}).map(([relationship, score]) => (
                              <Badge key={`${result.performanceScoreId}-${relationship}`} variant="secondary">
                                {titleCase(relationship)} {score.toFixed(2)}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-sm text-muted-foreground">No relationship averages available.</span>
                          )}
                        </div>
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                            Evaluator signatures: {result.signatureStatus?.evaluatorSignedCount || 0} /{" "}
                            {result.signatureStatus?.requiredEvaluatorSignatures || 0}
                          </div>
                          <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                            Evaluatee acknowledgements: {result.signatureStatus?.evaluateeAcknowledgedCount || 0} /{" "}
                            {result.signatureStatus?.requiredEvaluateeAcknowledgements || 0}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <MessagesSquare className="h-4 w-4" />
                      Comment highlights
                    </div>
                    {result.commentHighlights?.length ? (
                      <div className="grid gap-3 lg:grid-cols-2">
                        {result.commentHighlights.map((comment) => (
                          <div key={comment.id} className="rounded-xl border bg-muted/20 p-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline">{titleCase(comment.relationship)}</Badge>
                              <Badge variant="secondary">{comment.evaluatorLabel}</Badge>
                            </div>
                            <div className="mt-3 text-sm font-medium">{comment.questionText}</div>
                            <p className="mt-2 text-sm text-muted-foreground">{comment.comment}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">No written comments were captured for this employee.</div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="py-10 text-sm text-muted-foreground">
                No performance scores have been generated for this cycle yet.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
