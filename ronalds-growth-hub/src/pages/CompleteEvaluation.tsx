import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiFetch, documentsAPI } from "@/lib/api";
import DashboardLayout from "@/components/DashboardLayout";
import PageLoader from "@/components/ui/page-loader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, X, Star } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import type {
  EvaluationAssignment,
  EvaluationQuestionItem,
  EvaluationQuestionSection,
} from "@/lib/api/types";
import {
  calculateAssignmentScore,
  type EvaluationItemResponse,
  getResponseValue,
  normalizeEvaluationQuestions,
} from "@/lib/evaluations/workflow";

interface LegacyResultArea {
  id: string;
  weight?: number;
  kpi?: {
    id: string;
    name: string;
    description?: string;
    category?: string;
  };
}

const buildLegacySections = (rows: LegacyResultArea[]): EvaluationQuestionSection[] => {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  return [
    {
      id: "legacy_result_areas",
      title: "Metrics / Result Areas / KPIs",
      description: "Legacy KPI-backed evaluation items.",
      items: rows.map((row, index) => ({
        id: row.kpi?.id || `legacy_${row.id}_${index + 1}`,
        label: row.kpi?.name || `Metric ${index + 1}`,
        description: row.kpi?.description || row.kpi?.category,
        kind: "metric",
        required: true,
        weight: row.weight,
        allowComment: true,
        ratingScale: {
          min: 1,
          max: 5,
          step: 1,
          lowLabel: "Needs improvement",
          highLabel: "Outstanding",
        },
      })),
    },
  ];
};

const displayName = (person: any) =>
  [person?.firstName || person?.first_name, person?.lastName || person?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim() || "Unknown";

export default function CompleteEvaluation() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [assignment, setAssignment] = useState<EvaluationAssignment | null>(null);
  const [sections, setSections] = useState<EvaluationQuestionSection[]>([]);
  const [responses, setResponses] = useState<Record<string, EvaluationItemResponse>>({});
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [uploadedEvidence, setUploadedEvidence] = useState<string[]>([]);
  const [generalComments, setGeneralComments] = useState("");

  useEffect(() => {
    void loadAssignment();
  }, [assignmentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadAssignment = async () => {
    try {
      const assignmentData = await apiFetch<EvaluationAssignment>(
        "GET",
        `/evaluation-assignments/${assignmentId}`
      );
      if (!assignmentData) throw new Error("Assignment not found");
      setAssignment(assignmentData);

      const normalizedSections = normalizeEvaluationQuestions(
        assignmentData.definition?.questions,
        {
          fallbackTitle: assignmentData.definition?.name || "Evaluation",
          evaluatorTypes: assignmentData.evaluatorType ? [assignmentData.evaluatorType] : undefined,
        }
      );

      let resolvedSections = normalizedSections;
      const definitionId =
        assignmentData.definition?.id ?? assignmentData.evaluationDefinitionId ?? undefined;

      if (resolvedSections.length === 0 && definitionId) {
        const resultAreas = await apiFetch<LegacyResultArea[]>(
          "GET",
          `/evaluation-result-areas?adHocEvaluationId=${definitionId}`
        );
        resolvedSections = buildLegacySections(Array.isArray(resultAreas) ? resultAreas : []);
      }

      setSections(resolvedSections);

      const existingResponses =
        assignmentData.responses && typeof assignmentData.responses === "object"
          ? (assignmentData.responses as Record<string, EvaluationItemResponse>)
          : {};

      const initializedResponses: Record<string, EvaluationItemResponse> = { ...existingResponses };
      resolvedSections.forEach((section) => {
        section.items.forEach((item) => {
          if (!initializedResponses[item.id]) {
            initializedResponses[item.id] = {};
          }
        });
      });
      setResponses(initializedResponses);

      setUploadedEvidence(Array.isArray(assignmentData.evidenceUrls) ? assignmentData.evidenceUrls : []);
      setGeneralComments(assignmentData.evaluatorComments || "");
    } catch (error: any) {
      toast({
        title: "Error loading evaluation",
        description: error.message,
        variant: "destructive",
      });
      navigate("/evaluations");
    } finally {
      setLoading(false);
    }
  };

  const updateResponse = (itemId: string, patch: Partial<EvaluationItemResponse>) => {
    setResponses((current) => ({
      ...current,
      [itemId]: {
        ...current[itemId],
        ...patch,
      },
    }));
  };

  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      setEvidenceFiles((current) => [...current, ...Array.from(event.target.files || [])]);
    }
  };

  const handleRemoveFile = (index: number) => {
    setEvidenceFiles((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const uploadEvidence = async () => {
    const urls: string[] = [];
    const entityId =
      assignment?.evaluateeProfileId ??
      assignment?.evaluatorProfileId ??
      (user as any)?.profileId ??
      user?.profile?.id ??
      undefined;
    const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:4000";

    for (const file of evidenceFiles) {
      const response = await documentsAPI.uploadFile(file, {
        documentType: "performance_review",
        entityType: "employee",
        entityId,
        accessLevel: "manager",
        description: "Evaluation evidence",
      });
      const filePath =
        (response as any)?.data?.filePath ?? (response as any)?.filePath ?? "";
      if (filePath) {
        urls.push(filePath.startsWith("http") ? filePath : `${baseUrl}${filePath}`);
      }
    }

    return urls;
  };

  const requiredItems = useMemo(
    () =>
      sections.flatMap((section) =>
        section.items.filter((item) => item.required !== false).map((item) => item.id)
      ),
    [sections]
  );

  const progress = useMemo(() => {
    if (requiredItems.length === 0) return 100;
    const completed = requiredItems.filter((itemId) => {
      const value = getResponseValue(responses[itemId]);
      return value !== undefined && value !== "";
    }).length;
    return Math.round((completed / requiredItems.length) * 100);
  }, [requiredItems, responses]);

  const calculatedScore = useMemo(
    () => calculateAssignmentScore(sections, responses),
    [responses, sections]
  );

  const isSubmitted =
    assignment?.status === "submitted" || assignment?.status === "cancelled";

  const saveAssignment = async (submit: boolean) => {
    if (submit) {
      const missingRequired = requiredItems.some((itemId) => {
        const value = getResponseValue(responses[itemId]);
        return value === undefined || value === "";
      });
      if (missingRequired && assignment?.definition?.scoringConfig?.requireAllKpis) {
        toast({
          title: "Please complete all required items",
          variant: "destructive",
        });
        return;
      }
    }

    setSubmitting(true);
    try {
      let evidenceUrls = [...uploadedEvidence];
      if (evidenceFiles.length > 0) {
        const newUrls = await uploadEvidence();
        evidenceUrls = [...evidenceUrls, ...newUrls];
      }

      await apiFetch("PATCH", `/evaluation-assignments/${assignmentId}`, {
        responses,
        evidenceUrls,
        evaluatorComments: generalComments,
        status: submit ? "submitted" : undefined,
        submittedAt: submit ? new Date().toISOString() : undefined,
        score: calculatedScore,
      });

      setUploadedEvidence(evidenceUrls);
      setEvidenceFiles([]);
      toast({
        title: submit ? "Evaluation submitted successfully" : "Draft saved successfully",
      });
      if (submit) {
        navigate("/evaluations");
      }
    } catch (error: any) {
      toast({
        title: submit ? "Error submitting evaluation" : "Error saving draft",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const renderRating = (item: EvaluationQuestionItem) => {
    const scale = item.ratingScale || { min: 1, max: 5 };
    const currentValue = Number(getResponseValue(responses[item.id]) || 0);
    return (
      <div className="space-y-2">
        <Label>{item.kind === "metric" ? "Score metric delivery" : "Rating"}</Label>
        <div className="flex flex-wrap gap-1">
          {Array.from(
            { length: Math.max(scale.max - scale.min + 1, 1) },
            (_, index) => scale.min + index
          ).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => updateResponse(item.id, { value, score: value })}
              disabled={isSubmitted}
              className="focus:outline-none"
            >
              <Star
                className={`h-6 w-6 ${
                  value <= currentValue
                    ? "fill-yellow-400 text-yellow-400"
                    : "text-gray-300"
                }`}
              />
            </button>
          ))}
        </div>
      </div>
    );
  };

  const renderValueField = (item: EvaluationQuestionItem) => {
    if (item.kind === "text") {
      return (
        <div className="space-y-2">
          <Label>{item.label}</Label>
          <Textarea
            value={String(getResponseValue(responses[item.id]) || "")}
            onChange={(event) => updateResponse(item.id, { value: event.target.value })}
            disabled={isSubmitted}
            rows={4}
            placeholder={item.placeholder || "Enter your feedback"}
          />
        </div>
      );
    }

    if (item.kind === "boolean") {
      return (
        <div className="space-y-2">
          <Label>{item.label}</Label>
          <Select
            value={String(getResponseValue(responses[item.id]) ?? "")}
            onValueChange={(value) => updateResponse(item.id, { value: value === "true" })}
            disabled={isSubmitted}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select yes or no" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">Yes</SelectItem>
              <SelectItem value="false">No</SelectItem>
            </SelectContent>
          </Select>
        </div>
      );
    }

    if (item.kind === "select") {
      return (
        <div className="space-y-2">
          <Label>{item.label}</Label>
          <Select
            value={String(getResponseValue(responses[item.id]) ?? "")}
            onValueChange={(value) => updateResponse(item.id, { value })}
            disabled={isSubmitted}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select an option" />
            </SelectTrigger>
            <SelectContent>
              {(item.options || []).map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    }

    return renderRating(item);
  };

  if (loading) {
    return (
      <DashboardLayout>
        <PageLoader message="Loading..." />
      </DashboardLayout>
    );
  }

  if (!assignment) {
    return (
      <DashboardLayout>
        <div className="py-12 text-center">
          <p>Evaluation not found</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">
              {assignment.definition?.name || "Evaluation"}
            </h1>
            <p className="text-muted-foreground">
              Evaluating {displayName(assignment.evaluatee)}
            </p>
          </div>
          <Badge variant={isSubmitted ? "secondary" : "outline"}>
            {assignment.status}
          </Badge>
        </div>

        {!isSubmitted && (
          <Card>
            <CardHeader>
              <CardTitle>Progress</CardTitle>
              <CardDescription>Complete the required sections before submitting.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Progress value={progress} className="w-full" />
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>{progress}% complete</span>
                <span>{requiredItems.length} required items</span>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6 xl:grid-cols-[1.8fr_1fr]">
          <div className="space-y-6">
            {sections.map((section) => (
              <Card key={section.id}>
                <CardHeader>
                  <CardTitle>{section.title}</CardTitle>
                  {section.description && (
                    <CardDescription>{section.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-5">
                  {section.items.map((item) => (
                    <div key={item.id} className="space-y-3 rounded-xl border p-4">
                      {item.kind !== "text" && item.kind !== "select" && item.kind !== "boolean" && (
                        <div>
                          <div className="font-medium">{item.label}</div>
                          {item.description && (
                            <div className="text-sm text-muted-foreground">{item.description}</div>
                          )}
                        </div>
                      )}
                      {renderValueField(item)}
                      {item.allowComment && item.kind !== "text" && (
                        <div className="space-y-2">
                          <Label>Comments</Label>
                          <Textarea
                            value={responses[item.id]?.comment || ""}
                            onChange={(event) =>
                              updateResponse(item.id, { comment: event.target.value })
                            }
                            disabled={isSubmitted}
                            rows={3}
                            placeholder="Add context, examples, or development notes"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}

            <Card>
              <CardHeader>
                <CardTitle>Overall Comments</CardTitle>
                <CardDescription>Capture summary feedback and recommended actions.</CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={generalComments}
                  onChange={(event) => setGeneralComments(event.target.value)}
                  disabled={isSubmitted}
                  rows={5}
                  placeholder="Provide overall strengths, review points, and development actions."
                />
              </CardContent>
            </Card>

            {!isSubmitted && (
              <div className="flex gap-4">
                <Button onClick={() => void saveAssignment(false)} disabled={submitting} variant="outline" className="flex-1">
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Draft
                </Button>
                <Button onClick={() => void saveAssignment(true)} disabled={submitting} className="flex-1">
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Submit Evaluation
                </Button>
              </div>
            )}

            {isSubmitted && (
              <Button onClick={() => navigate("/evaluations")} className="w-full">
                Back to My Evaluations
              </Button>
            )}
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Evaluation Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Evaluator type</span>
                  <Badge variant="outline" className="capitalize">
                    {String(assignment.evaluatorType || "manager").replace("_", " ")}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Submitted score</span>
                  <span className="font-medium">
                    {calculatedScore !== undefined ? `${calculatedScore}%` : "Pending"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Sections</span>
                  <span className="font-medium">{sections.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Evidence files</span>
                  <span className="font-medium">{uploadedEvidence.length}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Evidence / Attachments</CardTitle>
                <CardDescription>Attach files that support your evaluation.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!isSubmitted && (
                  <div>
                    <Label htmlFor="evidence-upload" className="cursor-pointer">
                      <div className="rounded-lg border-2 border-dashed p-6 text-center transition-colors hover:border-primary">
                        <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                          Click to upload or drag and drop files
                        </p>
                      </div>
                    </Label>
                    <Input
                      id="evidence-upload"
                      type="file"
                      multiple
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                  </div>
                )}

                {evidenceFiles.length > 0 && (
                  <div className="space-y-2">
                    <Label>Files to upload</Label>
                    {evidenceFiles.map((file, index) => (
                      <div key={`${file.name}-${index}`} className="flex items-center justify-between rounded bg-secondary p-2">
                        <span className="text-sm">{file.name}</span>
                        <Button variant="ghost" size="icon" onClick={() => handleRemoveFile(index)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {uploadedEvidence.length > 0 && (
                  <div className="space-y-2">
                    <Label>Uploaded evidence</Label>
                    {uploadedEvidence.map((url, index) => (
                      <div key={`${url}-${index}`} className="rounded bg-secondary p-2">
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-primary hover:underline"
                        >
                          Evidence {index + 1}
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
