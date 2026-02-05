import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiFetch, authAPI, documentsAPI } from "@/lib/api";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, X, Star } from "lucide-react";

interface KPI {
  id: string;
  kpi: {
    id: string;
    name: string;
    description: string;
    category: string;
  };
  weight: number;
}

export default function CompleteEvaluation() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [assignment, setAssignment] = useState<any>(null);
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [responses, setResponses] = useState<Record<string, { score: number; comment: string }>>({});
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [uploadedEvidence, setUploadedEvidence] = useState<string[]>([]);
  const [generalComments, setGeneralComments] = useState("");

  useEffect(() => {
    loadAssignment();
  }, [assignmentId]);

  const loadAssignment = async () => {
    try {
      const assignmentData = await apiFetch("GET", `/evaluation_assignments/${assignmentId}`);
      if (!assignmentData) throw new Error("Assignment not found");
      setAssignment(assignmentData);

      // Load existing responses
      if (assignmentData.responses && typeof assignmentData.responses === 'object') {
        setResponses(assignmentData.responses as Record<string, { score: number; comment: string }>);
      }
      const existingEvidence =
        assignmentData.evidenceUrls ??
        assignmentData.evidence_urls ??
        [];
      if (Array.isArray(existingEvidence)) {
        setUploadedEvidence(existingEvidence as string[]);
      }
      const existingComments =
        assignmentData.evaluatorComments ??
        assignmentData.evaluator_comments ??
        "";
      if (typeof existingComments === "string") {
        setGeneralComments(existingComments);
      }

      // Load KPIs
      const definitionId = assignmentData.definition?.id ?? null;
      let kpiData: any[] = [];
      if (definitionId) {
        kpiData = await apiFetch(
          "GET",
          `/evaluation_result_areas?ad_hoc_evaluation_id=${definitionId}`
        );
      }
      setKpis(kpiData || []);

      // Initialize responses for all KPIs
      const initialResponses: Record<string, { score: number; comment: string }> = {};
      const existingResponses = (assignmentData.responses && typeof assignmentData.responses === 'object') 
        ? assignmentData.responses as Record<string, { score: number; comment: string }> 
        : {};
      
      kpiData?.forEach((kpi: any) => {
        if (!existingResponses[kpi.kpi?.id || kpi.kpi_id]) {
          initialResponses[kpi.kpi?.id || kpi.kpi_id] = { score: 0, comment: "" };
        }
      });
      setResponses({ ...existingResponses, ...initialResponses });
    } catch (error: any) {
      toast({ title: "Error loading evaluation", description: error.message, variant: "destructive" });
      navigate("/my-evaluations");
    } finally {
      setLoading(false);
    }
  };

  const handleScoreChange = (kpiId: string, score: number) => {
    setResponses({
      ...responses,
      [kpiId]: { ...responses[kpiId], score }
    });
  };

  const handleCommentChange = (kpiId: string, comment: string) => {
    setResponses({
      ...responses,
      [kpiId]: { ...responses[kpiId], comment }
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setEvidenceFiles([...evidenceFiles, ...Array.from(e.target.files)]);
    }
  };

  const handleRemoveFile = (index: number) => {
    setEvidenceFiles(evidenceFiles.filter((_, i) => i !== index));
  };

  const uploadEvidence = async () => {
    const urls: string[] = [];
    const user = await authAPI.me();
    const entityId =
      assignment?.evalueeProfileId ??
      assignment?.profileId ??
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
        const resolvedUrl = filePath.startsWith("http")
          ? filePath
          : `${baseUrl}${filePath}`;
        urls.push(resolvedUrl);
      }
    }

    return urls;
  };

  const calculateProgress = () => {
    const totalKpis = kpis.length;
    const completedKpis = Object.values(responses).filter(r => r.score > 0).length;
    return (completedKpis / totalKpis) * 100;
  };

  const handleSaveDraft = async () => {
    setSubmitting(true);
    try {
      let evidenceUrls = [...uploadedEvidence];
      if (evidenceFiles.length > 0) {
        const newUrls = await uploadEvidence();
        evidenceUrls = [...evidenceUrls, ...newUrls];
      }

      await apiFetch("PATCH", `/evaluation_assignments/${assignmentId}`, {
        responses,
        evidence_urls: evidenceUrls,
        evaluator_comments: generalComments
      });

      toast({ title: "Draft saved successfully" });
      setUploadedEvidence(evidenceUrls);
      setEvidenceFiles([]);
    } catch (error: any) {
      toast({ title: "Error saving draft", description: error.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    // Validate all KPIs have scores
    const allScored = kpis.every(kpi => responses[kpi.kpi.id]?.score > 0);
      const requireAll =
      assignment?.definition?.scoringConfig?.requireAllKpis ?? false;
    if (!allScored && requireAll) {
      toast({ title: "Please rate all competencies", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      let evidenceUrls = [...uploadedEvidence];
      if (evidenceFiles.length > 0) {
        const newUrls = await uploadEvidence();
        evidenceUrls = [...evidenceUrls, ...newUrls];
      }

      await apiFetch("PATCH", `/evaluation_assignments/${assignmentId}`, {
        responses,
        evidence_urls: evidenceUrls,
        evaluator_comments: generalComments,
        status: "completed",
        submitted_at: new Date().toISOString()
      });

      toast({ title: "Evaluation submitted successfully!" });
      navigate("/my-evaluations");
    } catch (error: any) {
      toast({ title: "Error submitting evaluation", description: error.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const renderStarRating = (kpiId: string, currentScore: number) => {
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => handleScoreChange(kpiId, star)}
            className="focus:outline-none"
          >
            <Star
              className={`h-6 w-6 ${
                star <= currentScore
                  ? "fill-yellow-400 text-yellow-400"
                  : "text-gray-300"
              }`}
            />
          </button>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  if (!assignment) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <p>Evaluation not found</p>
        </div>
      </DashboardLayout>
    );
  }

  const progress = calculateProgress();
  const isCompleted = assignment.status === "completed";

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl mx-auto">
        <div>
          <h1 className="text-3xl font-bold">{assignment.definition?.name || "Evaluation"}</h1>
          <p className="text-muted-foreground">
            Evaluating: {assignment.evaluatee?.first_name || "Unknown"} {assignment.evaluatee?.last_name || "Employee"} - {assignment.evaluatee?.position || "N/A"}
          </p>
        </div>

        {!isCompleted && (
          <Card>
            <CardHeader>
              <CardTitle>Progress</CardTitle>
              <CardDescription>{Math.round(progress)}% Complete</CardDescription>
            </CardHeader>
            <CardContent>
              <Progress value={progress} className="w-full" />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Competency Ratings</CardTitle>
            <CardDescription>Rate each competency from 1 (Poor) to 5 (Excellent)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {kpis.map((kpi) => (
              <div key={kpi.id} className="space-y-3 p-4 border rounded-lg">
                <div>
                  <h3 className="font-semibold">{kpi.kpi.name}</h3>
                  {kpi.kpi.description && (
                    <p className="text-sm text-muted-foreground">{kpi.kpi.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    Category: {kpi.kpi.category} | Weight: {kpi.weight}%
                  </p>
                </div>

                <div>
                  <Label>Rating</Label>
                  {renderStarRating(kpi.kpi.id, responses[kpi.kpi.id]?.score || 0)}
                </div>

                <div>
                  <Label>Comments (Optional)</Label>
                  <Textarea
                    value={responses[kpi.kpi.id]?.comment || ""}
                    onChange={(e) => handleCommentChange(kpi.kpi.id, e.target.value)}
                    placeholder="Provide specific examples or feedback..."
                    disabled={isCompleted}
                    rows={3}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Overall Comments</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={generalComments}
              onChange={(e) => setGeneralComments(e.target.value)}
              placeholder="Provide overall feedback, strengths, and areas for improvement..."
              disabled={isCompleted}
              rows={5}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Evidence / Supporting Documents</CardTitle>
            <CardDescription>Upload any supporting evidence or documents</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!isCompleted && (
              <div>
                <Label htmlFor="evidence-upload" className="cursor-pointer">
                  <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary transition-colors">
                    <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
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
                <Label>Files to Upload:</Label>
                {evidenceFiles.map((file, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-secondary rounded">
                    <span className="text-sm">{file.name}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveFile(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {uploadedEvidence.length > 0 && (
              <div className="space-y-2">
                <Label>Uploaded Evidence:</Label>
                {uploadedEvidence.map((url, index) => (
                  <div key={index} className="p-2 bg-secondary rounded">
                    <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
                      Evidence {index + 1}
                    </a>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {!isCompleted && (
          <div className="flex gap-4">
            <Button onClick={handleSaveDraft} disabled={submitting} variant="outline" className="flex-1">
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Draft
            </Button>
            <Button onClick={handleSubmit} disabled={submitting} className="flex-1">
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit Evaluation
            </Button>
          </div>
        )}

        {isCompleted && (
          <Button onClick={() => navigate("/my-evaluations")} className="w-full">
            Back to My Evaluations
          </Button>
        )}
      </div>
    </DashboardLayout>
  );
}
