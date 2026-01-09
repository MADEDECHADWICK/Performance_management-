import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import apiFetch, { authAPI } from "@/integrations/apiClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, BookOpen, TrendingUp, Target, CheckCircle2, XCircle, Play } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Recommendation {
  id: string;
  competency_area: string;
  recommendation_type: string;
  title: string;
  description: string | null;
  resource_url: string | null;
  priority: string;
  status: string;
  created_at: string;
}

const DevelopmentPlan = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);

  useEffect(() => {
    loadRecommendations();
  }, []);

  const loadRecommendations = async () => {
    try {
      const user = await authAPI.me();
      if (!user) {
        navigate("/auth");
        return;
      }

      const data = await apiFetch('GET', `/development_recommendations?employee_id=${user.id}`);
      setRecommendations(data || []);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error loading development plan",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      await apiFetch('PATCH', `/development_recommendations/${id}`, { status });
      toast({ title: "Status updated successfully" });
      loadRecommendations();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error updating status",
        description: error.message,
      });
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  const completed = recommendations.filter(r => r.status === "completed").length;
  const inProgress = recommendations.filter(r => r.status === "in_progress").length;
  const completionRate = recommendations.length > 0 ? (completed / recommendations.length) * 100 : 0;

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high": return "destructive";
      case "medium": return "default";
      case "low": return "secondary";
      default: return "outline";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed": return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "in_progress": return <Play className="h-5 w-5 text-blue-500" />;
      case "dismissed": return <XCircle className="h-5 w-5 text-gray-400" />;
      default: return <Target className="h-5 w-5 text-orange-500" />;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "course": return "📚";
      case "mentorship": return "👥";
      case "project": return "🎯";
      case "resource": return "📖";
      default: return "📋";
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">My Development Plan</h1>
          <p className="text-muted-foreground mt-2">
            Personalized learning recommendations based on your performance
          </p>
        </div>

        {/* Progress Summary */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Recommendations</CardTitle>
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{recommendations.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">In Progress</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{inProgress}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{completionRate.toFixed(0)}%</div>
              <Progress value={completionRate} className="mt-2" />
            </CardContent>
          </Card>
        </div>

        {/* Recommendations List */}
        <div className="space-y-4">
          {recommendations.map((rec) => (
            <Card key={rec.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="text-3xl">{getTypeIcon(rec.recommendation_type)}</div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(rec.status)}
                        <CardTitle className="text-lg">{rec.title}</CardTitle>
                      </div>
                      <div className="flex gap-2">
                        <Badge variant={getPriorityColor(rec.priority) as any}>
                          {rec.priority} priority
                        </Badge>
                        <Badge variant="outline">{rec.competency_area.replace(/_/g, ' ')}</Badge>
                        <Badge variant="secondary">{rec.recommendation_type}</Badge>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {rec.status === "suggested" && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => updateStatus(rec.id, "in_progress")}
                        >
                          Start
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateStatus(rec.id, "dismissed")}
                        >
                          Dismiss
                        </Button>
                      </>
                    )}
                    {rec.status === "in_progress" && (
                      <Button
                        size="sm"
                        onClick={() => updateStatus(rec.id, "completed")}
                      >
                        Mark Complete
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">
                  {rec.description || "No description provided"}
                </p>
                {rec.resource_url && (
                  <Button variant="link" className="p-0 h-auto" asChild>
                    <a href={rec.resource_url} target="_blank" rel="noopener noreferrer">
                      View Resource →
                    </a>
                  </Button>
                )}
                <div className="text-xs text-muted-foreground mt-3">
                  Added {new Date(rec.created_at).toLocaleDateString()}
                </div>
              </CardContent>
            </Card>
          ))}

          {recommendations.length === 0 && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground text-center">
                  No development recommendations yet. Complete your evaluations to receive personalized suggestions.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default DevelopmentPlan;