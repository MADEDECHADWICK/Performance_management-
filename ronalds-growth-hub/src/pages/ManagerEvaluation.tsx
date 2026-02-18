import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Star, User, ClipboardCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/contexts/AuthContext";

const competencies = [
  { key: "technical_expertise", label: "Technical Expertise" },
  { key: "communication", label: "Communication" },
  { key: "collaboration", label: "Collaboration" },
  { key: "problem_solving", label: "Problem Solving" },
  { key: "time_management", label: "Time Management" },
  { key: "innovation", label: "Innovation" },
];

const ManagerEvaluation = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user, profile, isLoading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [evaluations, setEvaluations] = useState<any[]>([]);
  const [selectedEval, setSelectedEval] = useState<any>(null);
  const [managerRatings, setManagerRatings] = useState<Record<string, number>>({});
  const [formData, setFormData] = useState({
    comments: "",
    strengths: "",
    improvements: "",
    overall_rating: 0,
    recommend_promotion: false,
    promotion_comments: "",
  });

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/auth");
      return;
    }
    loadTeamEvaluations();
  }, [authLoading, user, navigate]);

  const loadTeamEvaluations = async () => {
    try {
      if (!user) {
        navigate("/auth");
        return;
      }

      // Load assignments where current user is the manager evaluator.
      const managerProfileId = Number(
        (user as any)?.profileId ?? (user as any)?.profile_id ?? profile?.id ?? 0
      );
      const assignmentsData = await apiFetch<any[]>(
        'GET',
        `/evaluation-assignments?evaluatorProfileId=${managerProfileId}&evaluatorType=manager&include=definition,evaluatee`
      );
      const evalsData = (assignmentsData || []).map((assignment: any) => {
        const responses =
          assignment?.responses && typeof assignment.responses === "object"
            ? assignment.responses
            : {};
        const evaluatee = assignment?.evaluatee || {};
        return {
          ...assignment,
          ...responses,
          status: assignment?.status === "submitted" ? "completed" : assignment?.status,
          employee: {
            id: evaluatee?.id,
            first_name: evaluatee?.first_name ?? evaluatee?.firstName ?? "",
            last_name: evaluatee?.last_name ?? evaluatee?.lastName ?? "",
            email: evaluatee?.email ?? evaluatee?.user?.email ?? "",
          },
          cycle: {
            name: assignment?.definition?.name || "Evaluation",
          },
        };
      });

      setEvaluations(evalsData);

      if (evalsData && evalsData.length > 0) {
        selectEvaluation(evalsData[0]);
      }
    } catch (error: any) {
      console.error("Error loading evaluations:", error);
      toast({
        title: "Error",
        description: "Failed to load team evaluations.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const selectEvaluation = (evaluation: any) => {
    setSelectedEval(evaluation);
    
    // Load manager ratings if they exist
    const loadedRatings: Record<string, number> = {};
    competencies.forEach(comp => {
      const value = evaluation[`manager_${comp.key}`];
      if (value) loadedRatings[comp.key] = value;
    });
    setManagerRatings(loadedRatings);

    // Load manager form data
    setFormData({
      comments: evaluation.manager_comments || "",
      strengths: evaluation.manager_strengths || "",
      improvements: evaluation.manager_improvements || "",
      overall_rating: evaluation.manager_overall_rating || 0,
      recommend_promotion: evaluation.manager_recommend_promotion || false,
      promotion_comments: evaluation.manager_promotion_comments || "",
    });
  };

  const handleRatingChange = (competency: string, rating: number) => {
    setManagerRatings(prev => ({ ...prev, [competency]: rating }));
  };

  const handleSubmit = async () => {
    if (!selectedEval) return;

    // Validate all fields are completed
    const allRatingsComplete = competencies.every(comp => managerRatings[comp.key]);
    const requiredFieldsComplete = formData.comments && formData.strengths && 
                                   formData.improvements && formData.overall_rating > 0;

    if (!allRatingsComplete || !requiredFieldsComplete) {
      toast({
        title: "Incomplete Evaluation",
        description: "Please complete all ratings and required fields before submitting.",
        variant: "destructive",
      });
      return;
    }

    try {
      const updateData: any = {
        ...Object.fromEntries(
          competencies.map(comp => [`manager_${comp.key}`, managerRatings[comp.key]])
        ),
        manager_comments: formData.comments,
        manager_strengths: formData.strengths,
        manager_improvements: formData.improvements,
        manager_overall_rating: formData.overall_rating,
        manager_recommend_promotion: formData.recommend_promotion,
        manager_promotion_comments: formData.promotion_comments,
        status: "completed",
        manager_submitted_at: new Date().toISOString(),
      };

      await apiFetch('PATCH', `/evaluation-assignments/${selectedEval.id}`, {
        responses: updateData,
        evaluatorComments: formData.comments,
        status: "submitted",
      });

      toast({
        title: "Evaluation Submitted",
        description: "Manager evaluation has been submitted successfully.",
      });

      loadTeamEvaluations();
    } catch (error: any) {
      console.error("Error submitting evaluation:", error);
      toast({
        title: "Error",
        description: "Failed to submit evaluation.",
        variant: "destructive",
      });
    }
  };

  const renderStarRating = (competency: string, readonly: boolean = false) => {
    const currentRating = readonly 
      ? selectedEval?.[`self_${competency}`] || 0
      : managerRatings[competency] || 0;
    
    return (
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((rating) => (
          <button
            key={rating}
            type="button"
            onClick={() => !readonly && handleRatingChange(competency, rating)}
            disabled={readonly}
            className={readonly ? "" : "transition-transform hover:scale-110"}
          >
            <Star
              className={`h-6 w-6 ${
                rating <= currentRating
                  ? "fill-primary text-primary"
                  : "text-muted-foreground"
              }`}
            />
          </button>
        ))}
        <span className="ml-2 text-sm text-muted-foreground">
          {currentRating > 0 ? `${currentRating}/5` : "Not rated"}
        </span>
      </div>
    );
  };

  const renderOverallRating = () => {
    return (
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((rating) => (
          <button
            key={rating}
            type="button"
            onClick={() => setFormData({ ...formData, overall_rating: rating })}
            className="transition-transform hover:scale-110"
          >
            <Star
              className={`h-8 w-8 ${
                rating <= formData.overall_rating
                  ? "fill-primary text-primary"
                  : "text-muted-foreground"
              }`}
            />
          </button>
        ))}
        <span className="ml-2 text-lg font-medium">
          {formData.overall_rating > 0 ? `${formData.overall_rating}/5` : "Not rated"}
        </span>
      </div>
    );
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="text-center py-8">Loading...</div>
      </DashboardLayout>
    );
  }

  if (evaluations.length === 0) {
    return (
      <DashboardLayout>
        <Card>
          <CardContent className="p-8">
            <div className="text-center text-muted-foreground">
              No pending evaluations to review.
            </div>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  const isCompleted = selectedEval?.status === "completed";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold text-foreground">Manager Evaluation</h2>
          <p className="text-muted-foreground">
            Review and evaluate your team member's performance
          </p>
        </div>

        {evaluations.length > 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Select Employee to Evaluate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2">
                {evaluations.map((evalItem) => (
                  <Button
                    key={evalItem.id}
                    variant={selectedEval?.id === evalItem.id ? "default" : "outline"}
                    onClick={() => selectEvaluation(evalItem)}
                    className="justify-start"
                  >
                    <User className="h-4 w-4 mr-2" />
                    {evalItem.employee.first_name} {evalItem.employee.last_name} - {evalItem.cycle.name}
                    <Badge className="ml-auto" variant={evalItem.status === "completed" ? "default" : "secondary"}>
                      {evalItem.status === "completed" ? "Completed" : "Pending"}
                    </Badge>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {selectedEval && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>
                  {selectedEval.employee.first_name} {selectedEval.employee.last_name}
                </CardTitle>
                <CardDescription>
                  {selectedEval.cycle.name} • {selectedEval.employee.email}
                </CardDescription>
              </CardHeader>
            </Card>

            <Tabs defaultValue="self-eval" className="space-y-6">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="self-eval">Employee Self-Evaluation</TabsTrigger>
                <TabsTrigger value="manager-eval">Manager Evaluation</TabsTrigger>
              </TabsList>

              <TabsContent value="self-eval" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Employee Competency Ratings</CardTitle>
                    <CardDescription>View employee's self-assessment</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {competencies.map((comp) => (
                      <div key={comp.key} className="space-y-2">
                        <Label className="text-base">{comp.label}</Label>
                        {renderStarRating(comp.key, true)}
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Key Achievements</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-sm whitespace-pre-wrap">
                        {selectedEval.self_achievements || "No achievements provided"}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Challenges Faced</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-sm whitespace-pre-wrap">
                        {selectedEval.self_challenges || "No challenges provided"}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Development Goals</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-sm whitespace-pre-wrap">
                        {selectedEval.self_goals || "No goals provided"}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="manager-eval" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Manager Competency Ratings</CardTitle>
                    <CardDescription>Rate the employee on each competency</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {competencies.map((comp) => (
                      <div key={comp.key} className="space-y-2">
                        <Label className="text-base">{comp.label}</Label>
                        {renderStarRating(comp.key, false)}
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Performance Comments</CardTitle>
                    <CardDescription>Provide detailed feedback on performance</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      value={formData.comments}
                      onChange={(e) => setFormData({ ...formData, comments: e.target.value })}
                      placeholder="Provide comprehensive feedback on the employee's performance..."
                      className="min-h-32"
                      disabled={isCompleted}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Strengths</CardTitle>
                    <CardDescription>Highlight key strengths and positive attributes</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      value={formData.strengths}
                      onChange={(e) => setFormData({ ...formData, strengths: e.target.value })}
                      placeholder="Describe the employee's key strengths..."
                      className="min-h-24"
                      disabled={isCompleted}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Areas for Improvement</CardTitle>
                    <CardDescription>Identify opportunities for growth and development</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      value={formData.improvements}
                      onChange={(e) => setFormData({ ...formData, improvements: e.target.value })}
                      placeholder="Describe areas where the employee can improve..."
                      className="min-h-24"
                      disabled={isCompleted}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Overall Rating</CardTitle>
                    <CardDescription>Provide an overall performance rating</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {renderOverallRating()}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Promotion Recommendation</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="recommend_promotion"
                        checked={formData.recommend_promotion}
                        onCheckedChange={(checked) => 
                          setFormData({ ...formData, recommend_promotion: !!checked })
                        }
                        disabled={isCompleted}
                      />
                      <Label htmlFor="recommend_promotion" className="text-base font-normal">
                        I recommend this employee for promotion
                      </Label>
                    </div>
                    {formData.recommend_promotion && (
                      <Textarea
                        value={formData.promotion_comments}
                        onChange={(e) => setFormData({ ...formData, promotion_comments: e.target.value })}
                        placeholder="Provide reasoning for promotion recommendation..."
                        className="min-h-24"
                        disabled={isCompleted}
                      />
                    )}
                  </CardContent>
                </Card>

                {!isCompleted && (
                  <Button onClick={handleSubmit} className="w-full" size="lg">
                    <CheckCircle2 className="h-5 w-5 mr-2" />
                    Submit Manager Evaluation
                  </Button>
                )}

                {isCompleted && (
                  <Card className="border-success">
                    <CardContent className="p-6">
                      <div className="flex items-center gap-2 text-success">
                        <ClipboardCheck className="h-5 w-5" />
                        <p className="font-medium">Evaluation completed and submitted</p>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default ManagerEvaluation;
