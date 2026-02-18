import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, BookOpen, TrendingUp, Target, CheckCircle2, XCircle, Play } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  SECTION_TITLE,
  SECTION_SUBTITLE,
  PAGE_STACK,
  SECTION_STACK,
  SUMMARY_CARD_CONTENT,
  SUMMARY_CARD_HEADER,
  SUMMARY_CARD_TITLE,
} from "@/components/ui/cardStyles";
import { useAuth } from "@/contexts/AuthContext";

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
  const { user, isLoading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [activeFilter, setActiveFilter] = useState("all");

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/auth");
      return;
    }
    loadRecommendations();
  }, [authLoading, user, navigate]);

  const loadRecommendations = async () => {
    try {
      if (!user) {
        navigate("/auth");
        return;
      }

      const data = await apiFetch('GET', `/development-recommendations?employee_id=${user.id}`);
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
      await apiFetch('PATCH', `/development-recommendations/${id}`, { status });
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
  const highPriority = recommendations.filter(r => r.priority === "high").length;
  const focusAreas = recommendations.reduce<Record<string, number>>((acc, rec) => {
    const key = rec.competency_area || "general";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const topFocusAreas = Object.entries(focusAreas)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  const filteredRecommendations =
    activeFilter === "all"
      ? recommendations
      : recommendations.filter((rec) => rec.status === activeFilter);

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
      <div className={PAGE_STACK}>
        <div>
          <h1 className={SECTION_TITLE}>My Development Plan</h1>
          <p className={SECTION_SUBTITLE}>
            Personalized learning recommendations based on your performance
          </p>
        </div>

        {/* Progress Summary */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className={SUMMARY_CARD_HEADER}>
              <CardTitle className={SUMMARY_CARD_TITLE}>Total Recommendations</CardTitle>
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className={SUMMARY_CARD_CONTENT}>
              <div className="text-2xl font-bold">{recommendations.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className={SUMMARY_CARD_HEADER}>
              <CardTitle className={SUMMARY_CARD_TITLE}>In Progress</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className={SUMMARY_CARD_CONTENT}>
              <div className="text-2xl font-bold">{inProgress}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className={SUMMARY_CARD_HEADER}>
              <CardTitle className={SUMMARY_CARD_TITLE}>Completion Rate</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className={SUMMARY_CARD_CONTENT}>
              <div className="text-2xl font-bold">{completionRate.toFixed(0)}%</div>
              <Progress value={completionRate} className="mt-2" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className={SUMMARY_CARD_HEADER}>
              <CardTitle className={SUMMARY_CARD_TITLE}>High Priority</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className={SUMMARY_CARD_CONTENT}>
              <div className="text-2xl font-bold">{highPriority}</div>
              <p className="text-xs text-muted-foreground">Focus this cycle</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Focus Areas</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {topFocusAreas.length === 0 ? (
                <span className="text-sm text-muted-foreground">No focus areas yet.</span>
              ) : (
                topFocusAreas.map(([area, count]) => (
                  <Badge key={area} variant="outline">
                    {area.replace(/_/g, " ")} ({count})
                  </Badge>
                ))
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Next Actions</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Prioritize high-impact recommendations and mark progress weekly.
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeFilter} onValueChange={setActiveFilter} className={SECTION_STACK}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="suggested">Suggested</TabsTrigger>
            <TabsTrigger value="in_progress">In Progress</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
            <TabsTrigger value="dismissed">Dismissed</TabsTrigger>
          </TabsList>

          <TabsContent value={activeFilter} className={SECTION_STACK}>
            <div className={SECTION_STACK}>
              {filteredRecommendations.map((rec) => (
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
                          <div className="flex flex-wrap gap-2">
                            <Badge variant={getPriorityColor(rec.priority) as any}>
                              {rec.priority} priority
                            </Badge>
                            <Badge variant="outline">{rec.competency_area.replace(/_/g, " ")}</Badge>
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

              {filteredRecommendations.length === 0 && (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground text-center">
                      No recommendations found for this view.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
        </Tabs>

      </div>
    </DashboardLayout>
  );
};

export default DevelopmentPlan;
