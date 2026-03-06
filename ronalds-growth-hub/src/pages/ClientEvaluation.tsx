import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import surveysAPI, { type ClientSatisfactionSurvey } from "@/lib/api/surveys";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import PageLoader from "@/components/ui/page-loader";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Star } from "lucide-react";

const ClientEvaluation = () => {
  const [searchParams] = useSearchParams();
  const { token: tokenParam } = useParams<{ token?: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const token = tokenParam || searchParams.get("token") || "";

  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [survey, setSurvey] = useState<ClientSatisfactionSurvey | null>(null);
  const [job, setJob] = useState<ClientSatisfactionSurvey["job"] | null>(null);
  const [client, setClient] = useState<ClientSatisfactionSurvey["client"] | null>(null);

  const [ratings, setRatings] = useState({
    qualityRating: 0,
    communicationRating: 0,
    timelinessRating: 0,
    professionalismRating: 0,
    valueForMoneyRating: 0,
  });
  const [comments, setComments] = useState("");
  const [wouldRecommend, setWouldRecommend] = useState<boolean | null>(null);

  useEffect(() => {
    if (!token) {
      setAccessError("Missing survey token.");
      setLoading(false);
      toast({
        title: "Invalid Link",
        description: "This survey link is invalid or expired.",
        variant: "destructive",
      });
      return;
    }

    const loadSurvey = async () => {
      try {
        setLoading(true);
        setAccessError(null);
        const data = await surveysAPI.getByToken(token);
        setSurvey(data);
        setJob(data.job || null);
        setClient(data.client || null);

        if (data.completedAt) {
          setSubmitted(true);
          setRatings({
            qualityRating: data.qualityRating || 0,
            communicationRating: data.communicationRating || 0,
            timelinessRating: data.timelinessRating || 0,
            professionalismRating: data.professionalismRating || 0,
            valueForMoneyRating: data.valueForMoneyRating || 0,
          });
          setComments(data.additionalComments || data.improvementSuggestions || "");
          setWouldRecommend(typeof data.wouldRecommend === "boolean" ? data.wouldRecommend : null);
        }
      } catch (error: any) {
        console.error("Error loading survey:", error);

        if (error?.status === 409) {
          setSubmitted(true);
          return;
        }

        if (error?.status === 410) {
          setAccessError("This survey link has expired.");
        } else if (error?.status === 404) {
          setAccessError("This survey link is not valid.");
        } else {
          setAccessError("Failed to load survey form.");
        }

        toast({
          title: "Error",
          description: error?.message || "Failed to load survey form.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    void loadSurvey();
  }, [token, toast]);

  const handleRatingChange = (category: keyof typeof ratings, value: number) => {
    setRatings((prev) => ({ ...prev, [category]: value }));
  };

  const calculateOverallRating = () => {
    const values = Object.values(ratings);
    if (values.some((value) => value === 0)) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (Object.values(ratings).some((value) => value === 0)) {
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

    if (!token) {
      toast({
        title: "Invalid Link",
        description: "Survey token is missing.",
        variant: "destructive",
      });
      return;
    }

    try {
      const overallSatisfaction = calculateOverallRating();
      await surveysAPI.submit(token, {
        ...ratings,
        overallSatisfaction,
        wouldRecommend,
        additionalComments: comments || undefined,
      });

      setSubmitted(true);
      toast({
        title: "Survey Submitted",
        description: "Thank you for your feedback!",
      });
    } catch (error: any) {
      console.error("Error submitting survey:", error);
      toast({
        title: "Error",
        description: error?.message || "Failed to submit survey. Please try again.",
        variant: "destructive",
      });
    }
  };

  const RatingStars = ({
    category,
    label,
  }: {
    category: keyof typeof ratings;
    label: string;
  }) => (
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
                star <= ratings[category] ? "fill-accent text-accent" : "text-muted"
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
            <PageLoader message="Loading..." minHeightClassName="min-h-[220px]" />
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
              Your survey has been submitted successfully. We appreciate your feedback.
            </p>
            {job ? (
              <p className="text-sm text-muted-foreground">
                Job: {job.jobName} ({job.jobCode || "No code"})
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (accessError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl">
          <CardContent className="p-8 text-center space-y-4">
            <h2 className="text-2xl font-bold text-foreground">Survey Unavailable</h2>
            <p className="text-muted-foreground">{accessError}</p>
            <Button variant="outline" onClick={() => navigate("/")}>
              Go to Home
            </Button>
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
            <CardTitle className="text-2xl">Client Feedback Form</CardTitle>
            <CardDescription>
              Please provide your feedback on the professional services you received
            </CardDescription>
            {job && client ? (
              <div className="mt-4 p-4 bg-muted rounded-lg space-y-1">
                <p className="text-sm">
                  <span className="font-medium">Job:</span> {job.jobName} ({job.jobCode || "No code"})
                </p>
                <p className="text-sm">
                  <span className="font-medium">Client:</span> {client.clientName}
                </p>
              </div>
            ) : null}
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-6">
                <RatingStars category="qualityRating" label="Quality of Work" />
                <RatingStars category="communicationRating" label="Communication" />
                <RatingStars category="timelinessRating" label="Timeliness" />
                <RatingStars category="professionalismRating" label="Professionalism" />
                <RatingStars category="valueForMoneyRating" label="Value for Money" />
              </div>

              <div className="space-y-2">
                <Label>Additional Comments</Label>
                <Textarea
                  value={comments}
                  onChange={(event) => setComments(event.target.value)}
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

              <div className="pt-4 border-t">
                <Button type="submit" className="w-full" size="lg" disabled={submitted || !survey}>
                  Submit Feedback
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ClientEvaluation;
