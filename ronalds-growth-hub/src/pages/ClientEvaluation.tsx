import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { apiFetch, authAPI } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Star, CheckCircle2 } from "lucide-react";

const ClientEvaluation = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const token = searchParams.get("token");
  
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [evaluation, setEvaluation] = useState<any>(null);
  const [project, setProject] = useState<any>(null);
  const [employee, setEmployee] = useState<any>(null);
  
  const [ratings, setRatings] = useState({
    quality_of_work: 0,
    communication: 0,
    timeliness: 0,
    professionalism: 0,
    expertise: 0,
  });
  const [comments, setComments] = useState("");
  const [wouldRecommend, setWouldRecommend] = useState<boolean | null>(null);

  useEffect(() => {
    if (!token) {
      toast({
        title: "Invalid Link",
        description: "This evaluation link is invalid or expired.",
        variant: "destructive",
      });
      return;
    }
    loadEvaluation();
  }, [token]);

  const loadEvaluation = async () => {
    try {
      const data = await apiFetch("GET", `/client_evaluations?token=${token}`);
      
      if (!data) {
        toast({
          title: "Not Found",
          description: "Evaluation not found or already submitted.",
          variant: "destructive",
        });
        return;
      }

      if (data.submitted_at) {
        setSubmitted(true);
      }

      setEvaluation(data);
      setProject(data.project);
      setEmployee(data.profile);
      
      if (data.submitted_at) {
        setRatings({
          quality_of_work: data.quality_of_work || 0,
          communication: data.communication || 0,
          timeliness: data.timeliness || 0,
          professionalism: data.professionalism || 0,
          expertise: data.expertise || 0,
        });
        setComments(data.comments || "");
        setWouldRecommend(data.would_recommend);
      }
    } catch (error: any) {
      console.error("Error loading evaluation:", error);
      toast({
        title: "Error",
        description: "Failed to load evaluation form.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRatingChange = (category: keyof typeof ratings, value: number) => {
    setRatings(prev => ({ ...prev, [category]: value }));
  };

  const calculateOverallRating = () => {
    const values = Object.values(ratings);
    if (values.some(v => v === 0)) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (Object.values(ratings).some(v => v === 0)) {
      toast({
        title: "Incomplete Ratings",
        description: "Please rate all categories before submitting.",
        variant: "destructive",
      });
      return;
    }

    if (wouldRecommend === null) {
      toast({
        title: "Recommendation Required",
        description: "Please indicate if you would recommend this professional.",
        variant: "destructive",
      });
      return;
    }

    try {
      const overallRating = calculateOverallRating();
      
      await apiFetch("PATCH", `/client_evaluations/${evaluation.id}`, {
        ...ratings,
        overall_rating: overallRating,
        comments,
        would_recommend: wouldRecommend,
        submitted_at: new Date().toISOString(),
      });

      setSubmitted(true);
      toast({
        title: "Evaluation Submitted",
        description: "Thank you for your feedback!",
      });
    } catch (error: any) {
      console.error("Error submitting evaluation:", error);
      toast({
        title: "Error",
        description: "Failed to submit evaluation. Please try again.",
        variant: "destructive",
      });
    }
  };

  const RatingStars = ({ category, label }: { category: keyof typeof ratings; label: string }) => (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => !submitted && handleRatingChange(category, star)}
            disabled={submitted}
            className="transition-transform hover:scale-110 disabled:cursor-not-allowed"
          >
            <Star
              className={`h-8 w-8 ${
                star <= ratings[category]
                  ? "fill-accent text-accent"
                  : "text-muted"
              }`}
            />
          </button>
        ))}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 flex items-center justify-center">
        <Card className="w-full max-w-2xl">
          <CardContent className="p-8">
            <div className="text-center">Loading evaluation form...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl">
          <CardContent className="p-8 text-center space-y-4">
            <CheckCircle2 className="h-16 w-16 text-success mx-auto" />
            <h2 className="text-2xl font-bold text-foreground">Thank You!</h2>
            <p className="text-muted-foreground">
              Your evaluation has been submitted successfully. We appreciate your feedback.
            </p>
            {project && (
              <p className="text-sm text-muted-foreground">
                Project: {project.project_name} ({project.project_code})
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Client Evaluation Form</CardTitle>
            <CardDescription>
              Please provide your feedback on the professional services you received
            </CardDescription>
            {project && employee && (
              <div className="mt-4 p-4 bg-muted rounded-lg space-y-1">
                <p className="text-sm">
                  <span className="font-medium">Project:</span> {project.project_name} ({project.project_code})
                </p>
                <p className="text-sm">
                  <span className="font-medium">Professional:</span> {employee.first_name} {employee.last_name}
                </p>
              </div>
            )}
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-6">
                <RatingStars category="quality_of_work" label="Quality of Work" />
                <RatingStars category="communication" label="Communication" />
                <RatingStars category="timeliness" label="Timeliness" />
                <RatingStars category="professionalism" label="Professionalism" />
                <RatingStars category="expertise" label="Technical Expertise" />
              </div>

              <div className="space-y-2">
                <Label>Additional Comments</Label>
                <Textarea
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  placeholder="Please share any additional feedback..."
                  rows={4}
                  disabled={submitted}
                />
              </div>

              <div className="space-y-2">
                <Label>Would you recommend this professional to others?</Label>
                <div className="flex gap-4">
                  <Button
                    type="button"
                    variant={wouldRecommend === true ? "default" : "outline"}
                    onClick={() => setWouldRecommend(true)}
                    disabled={submitted}
                  >
                    Yes
                  </Button>
                  <Button
                    type="button"
                    variant={wouldRecommend === false ? "default" : "outline"}
                    onClick={() => setWouldRecommend(false)}
                    disabled={submitted}
                  >
                    No
                  </Button>
                </div>
              </div>

              {!submitted && (
                <Button type="submit" className="w-full" size="lg">
                  Submit Evaluation
                </Button>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ClientEvaluation;
