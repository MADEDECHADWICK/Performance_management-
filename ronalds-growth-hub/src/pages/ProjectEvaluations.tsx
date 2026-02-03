import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/integrations/apiClient";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";

type JobItem = {
  id: number;
  jobName: string;
  status: string;
  client?: { id: number; clientName: string } | null;
};

type StaffAssignment = {
  id: number;
  employeeProfileId: number;
  employee?: { id: number; firstName: string; lastName: string } | null;
  role?: { id: number; name: string } | null;
};

type ProjectEvaluation = {
  id: number;
  status: string;
  evaluatorType: string;
  overallScore?: number | null;
  comments?: string | null;
  createdAt?: string | Date;
  submittedAt?: string | Date | null;
  evaluatee?: { id: number; firstName: string; lastName: string } | null;
  evaluator?: { id: number; firstName: string; lastName: string } | null;
  job?: { id: number; jobName: string; status: string } | null;
};

const ratingFields = [
  { key: "quality", label: "Quality" },
  { key: "timeliness", label: "Timeliness" },
  { key: "collaboration", label: "Collaboration" },
  { key: "communication", label: "Communication" },
];

const ProjectEvaluations = () => {
  const { toast } = useToast();
  const { profile } = useAuth();
  const [searchParams] = useSearchParams();
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [jobId, setJobId] = useState<string>("");
  const [staff, setStaff] = useState<StaffAssignment[]>([]);
  const [evaluateeId, setEvaluateeId] = useState<string>("");
  const [evaluatorType, setEvaluatorType] = useState<string>("manager");
  const [scores, setScores] = useState<Record<string, string>>({});
  const [comments, setComments] = useState("");
  const [evaluations, setEvaluations] = useState<ProjectEvaluation[]>([]);
  const [loading, setLoading] = useState(false);

  const evaluationSummary = useMemo(() => {
    if (evaluations.length === 0) {
      return { count: 0, average: 0, lastUpdated: null as string | null };
    }
    const scoresList = evaluations
      .map((item) => Number(item.overallScore))
      .filter((value) => Number.isFinite(value));
    const average =
      scoresList.length > 0
        ? Math.round((scoresList.reduce((a, b) => a + b, 0) / scoresList.length) * 10) / 10
        : 0;
    const latest = evaluations
      .map((item) => item.submittedAt || item.createdAt)
      .filter(Boolean)
      .map((value) => new Date(value as any))
      .sort((a, b) => b.getTime() - a.getTime())[0];
    return {
      count: evaluations.length,
      average,
      lastUpdated: latest ? latest.toLocaleDateString() : null,
    };
  }, [evaluations]);

  const selectedJob = useMemo(
    () => jobs.find((item) => String(item.id) === jobId) || null,
    [jobs, jobId]
  );

  useEffect(() => {
    const presetJobId = searchParams.get("jobId");
    if (presetJobId) {
      setJobId(presetJobId);
    }
  }, [searchParams]);

  useEffect(() => {
    const loadJobs = async () => {
      try {
        const response: any = await apiFetch("GET", "/jobs?status=planned,in_progress");
        const items = response?.data?.items || response?.data || response || [];
        setJobs(items);
        const presetJobId = searchParams.get("jobId");
        if (presetJobId && items.some((job: JobItem) => String(job.id) === presetJobId)) {
          setJobId(presetJobId);
        }
      } catch (error: any) {
        toast({
          title: "Error loading jobs",
          description: error?.message || "Unable to load jobs",
          variant: "destructive",
        });
      }
    };

    loadJobs();
  }, [toast]);

  useEffect(() => {
    const loadStaff = async () => {
      if (!jobId) {
        setStaff([]);
        setEvaluateeId("");
        return;
      }
      try {
        const response: any = await apiFetch("GET", `/jobs/${jobId}/staff`);
        const data = response?.data || response || [];
        setStaff(Array.isArray(data) ? data : []);
      } catch (error: any) {
        toast({
          title: "Error loading staff",
          description: error?.message || "Unable to load staff assignments",
          variant: "destructive",
        });
      }
    };

    loadStaff();
  }, [jobId, toast]);

  useEffect(() => {
    const loadEvaluations = async () => {
      if (!jobId) {
        setEvaluations([]);
        return;
      }
      try {
        const response: any = await apiFetch("GET", `/project-evaluations?jobId=${jobId}`);
        const data = response?.data || response || [];
        setEvaluations(Array.isArray(data) ? data : []);
      } catch (error: any) {
        toast({
          title: "Error loading evaluations",
          description: error?.message || "Unable to load project evaluations",
          variant: "destructive",
        });
      }
    };

    loadEvaluations();
  }, [jobId, toast]);

  const handleScoreChange = (key: string, value: string) => {
    setScores((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    if (!jobId || !evaluateeId) {
      toast({
        title: "Missing information",
        description: "Select a job and team member before submitting.",
        variant: "destructive",
      });
      return;
    }

    const parsedScores = ratingFields.reduce<Record<string, number>>((acc, field) => {
      const value = Number(scores[field.key] || 0);
      if (value > 0) acc[field.key] = value;
      return acc;
    }, {});

    setLoading(true);
    try {
      await apiFetch("POST", "/project-evaluations", {
        jobId: Number(jobId),
        evaluateeProfileId: Number(evaluateeId),
        evaluatorProfileId: profile?.id,
        evaluatorType,
        scores: parsedScores,
        comments,
        status: "submitted",
      });

      toast({
        title: "Evaluation submitted",
        description: "Project evaluation has been saved.",
      });
      setScores({});
      setComments("");
      const refresh: any = await apiFetch("GET", `/project-evaluations?jobId=${jobId}`);
      const updated = refresh?.data || refresh || [];
      setEvaluations(Array.isArray(updated) ? updated : []);
    } catch (error: any) {
      toast({
        title: "Submission failed",
        description: error?.message || "Unable to submit evaluation",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Project Evaluations</h1>
          <p className="text-sm text-muted-foreground">
            Submit job-based performance reviews for your team.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>New Project Evaluation</CardTitle>
            <CardDescription>Select a job and team member to evaluate.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Job</Label>
                <Select value={jobId} onValueChange={setJobId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select job" />
                  </SelectTrigger>
                  <SelectContent>
                    {jobs.map((job) => (
                      <SelectItem key={job.id} value={String(job.id)}>
                        {job.jobName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedJob && (
                  <p className="text-xs text-muted-foreground">
                    Client: {selectedJob.client?.clientName || "Unassigned"}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Team Member</Label>
                <Select value={evaluateeId} onValueChange={setEvaluateeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select team member" />
                  </SelectTrigger>
                  <SelectContent>
                    {staff.map((assignment) => (
                      <SelectItem key={assignment.id} value={String(assignment.employeeProfileId)}>
                        {assignment.employee?.firstName} {assignment.employee?.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Choose a teammate assigned to the selected job.
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Evaluator Type</Label>
                <Select value={evaluatorType} onValueChange={setEvaluatorType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select evaluator type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="peer">Peer</SelectItem>
                    <SelectItem value="client">Client</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {ratingFields.map((field) => (
                <div key={field.key} className="space-y-2">
                  <Label>{field.label} (1-5)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={5}
                    value={scores[field.key] || ""}
                    onChange={(event) => handleScoreChange(field.key, event.target.value)}
                    placeholder="Score"
                  />
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <Label>Comments</Label>
              <Textarea
                value={comments}
                onChange={(event) => setComments(event.target.value)}
                placeholder="Add notes about project performance."
                rows={4}
              />
            </div>

            <Button onClick={handleSubmit} disabled={loading}>
              {loading ? "Submitting..." : "Submit Evaluation"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Evaluation Snapshot</CardTitle>
            <CardDescription>Summary for the selected job.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Total Evaluations</p>
              <p className="text-2xl font-semibold">{evaluationSummary.count}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Average Score</p>
              <p className="text-2xl font-semibold">{evaluationSummary.average}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Last Updated</p>
              <p className="text-sm font-medium">
                {evaluationSummary.lastUpdated || "No submissions yet"}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Project Evaluations</CardTitle>
            <CardDescription>Latest submissions for the selected job.</CardDescription>
          </CardHeader>
          <CardContent>
            {evaluations.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No project evaluations submitted yet.
              </div>
            ) : (
              <div className="space-y-3">
                {evaluations.map((evaluation) => (
                  <div
                    key={evaluation.id}
                    className="rounded-lg border border-border p-3"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium">
                          {evaluation.evaluatee?.firstName} {evaluation.evaluatee?.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {evaluation.job?.jobName} - {evaluation.evaluator?.firstName}{" "}
                          {evaluation.evaluator?.lastName}
                        </p>
                      </div>
                      <Badge variant="outline">{evaluation.evaluatorType}</Badge>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      Score: {evaluation.overallScore ?? "--"} - Status: {evaluation.status}
                    </div>
                    {evaluation.comments && (
                      <p className="mt-2 text-sm">{evaluation.comments}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default ProjectEvaluations;
