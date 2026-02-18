import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Heart, MessageSquare, Award, ThumbsUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import EmptyState from "@/components/ui/empty-state";
import { useAuth } from "@/contexts/AuthContext";
import {
  PAGE_STACK,
  SECTION_STACK,
  SECTION_TITLE,
  SECTION_SUBTITLE,
} from "@/components/ui/cardStyles";

interface Feedback {
  id: number;
  recipient_profile_id: number;
  giver_profile_id: number;
  type: string;
  title: string;
  content: string;
  is_anonymous: boolean;
  created_at: string;
  status: string;
}

interface Employee {
  id: number;
  first_name: string;
  last_name: string;
}

const ContinuousFeedback = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, isLoading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [surveySummary, setSurveySummary] = useState<any | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [currentProfileId, setCurrentProfileId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    recipient_profile_id: "",
    type: "praise",
    title: "",
    content: "",
    is_anonymous: false,
  });

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/auth");
      return;
    }
    loadData();
  }, [authLoading, user, navigate]);

  const loadData = async () => {
    try {
      const profileId = (user as any)?.profileId ?? user?.profile?.id ?? null;
      setCurrentProfileId(profileId);

      // Load feedback (received and given)
      const feedbackResponse = await apiFetch("GET", "/feedback?page=1&pageSize=100");
      const feedbackItems =
        feedbackResponse?.data?.items ?? feedbackResponse?.data ?? feedbackResponse ?? [];
      setFeedback(Array.isArray(feedbackItems) ? feedbackItems : []);

      // Load employees for selection - just get all profiles
      const employeesResponse = await apiFetch("GET", "/employees?page=1&pageSize=200");
      const employeesItems =
        employeesResponse?.data?.items ?? employeesResponse?.data ?? employeesResponse ?? [];
      const filteredEmployees = Array.isArray(employeesItems)
        ? employeesItems.filter((emp: any) => emp.id !== profileId)
        : [];
      setEmployees(filteredEmployees);

      const surveyAnalytics = await apiFetch("GET", "/surveys/analytics");
      setSurveySummary(surveyAnalytics?.data ?? surveyAnalytics ?? null);

    } catch (error: any) {
      if (error?.status === 401) {
        navigate("/auth");
        return;
      }
      if (error?.status === 404) {
        setFeedback([]);
        setEmployees([]);
        setSurveySummary(null);
        return;
      }
      // Avoid noisy toasts for empty states; keep UI usable.
      setFeedback([]);
      setEmployees([]);
      setSurveySummary(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      if (!user) {
        navigate("/auth");
        return;
      }

      const feedbackData = {
        recipient_profile_id: Number(formData.recipient_profile_id),
        title: formData.title || "Continuous feedback",
        content: formData.content,
        type: formData.type,
        is_anonymous: formData.is_anonymous,
      };

      await apiFetch("POST", "/feedback", feedbackData);

      toast({ 
        title: "Feedback sent successfully",
        description: "Your feedback has been shared with the recipient."
      });
      setDialogOpen(false);
      resetForm();
      loadData();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error sending feedback",
        description: error.message,
      });
    }
  };

  const resetForm = () => {
    setFormData({
      recipient_profile_id: "",
      type: "praise",
      title: "",
      content: "",
      is_anonymous: false,
    });
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "praise": return <Heart className="h-5 w-5 text-red-500" />;
      case "recognition": return <Award className="h-5 w-5 text-yellow-500" />;
      case "improvement": return <MessageSquare className="h-5 w-5 text-blue-500" />;
      default: return <ThumbsUp className="h-5 w-5" />;
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

  const receivedFeedback = feedback.filter(f => f.recipient_profile_id === currentProfileId);
  const givenFeedback = feedback.filter(f => f.giver_profile_id === currentProfileId);

  return (
    <DashboardLayout>
      <div className={PAGE_STACK}>
        <div className="flex justify-between items-center">
          <div>
            <h1 className={SECTION_TITLE}>Continuous Feedback</h1>
            <p className={SECTION_SUBTITLE}>
              Give and receive real-time recognition and constructive feedback
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
                <Plus className="mr-2 h-4 w-4" />
                Give Feedback
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Share Feedback</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="recipient">Recipient</Label>
                  <Select
                    value={formData.recipient_profile_id}
                    onValueChange={(value) => setFormData({ ...formData, recipient_profile_id: value })}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a colleague" />
                    </SelectTrigger>
                    <SelectContent>
                      {employees.map((emp) => (
                        <SelectItem key={emp.id} value={String(emp.id)}>
                          {emp.first_name} {emp.last_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                  <Label htmlFor="feedbackType">Feedback Type</Label>
                  <Select
                      value={formData.type}
                      onValueChange={(value) => setFormData({ ...formData, type: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="praise">Praise / Appreciation</SelectItem>
                        <SelectItem value="recognition">Recognition</SelectItem>
                        <SelectItem value="improvement">Constructive Feedback</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="title">Title</Label>
                    <Input
                      id="title"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      placeholder="Short summary (optional)"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="message">Message</Label>
                  <Textarea
                    id="message"
                    value={formData.content}
                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                    rows={5}
                    placeholder="Share your feedback..."
                    required
                  />
                </div>

                <div className="flex items-center justify-between space-x-2 p-4 border rounded-lg">
                  <div className="space-y-0.5">
                    <Label htmlFor="anonymous">Send Anonymously</Label>
                    <p className="text-sm text-muted-foreground">
                      Your name won't be visible to the recipient
                    </p>
                  </div>
                  <Switch
                    id="anonymous"
                    checked={formData.is_anonymous}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_anonymous: checked })}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit">Send Feedback</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs defaultValue="received" className={SECTION_STACK}>
          <TabsList>
            <TabsTrigger value="received">Received ({receivedFeedback.length})</TabsTrigger>
            <TabsTrigger value="given">Given</TabsTrigger>
            <TabsTrigger value="public">Public Feed</TabsTrigger>
          </TabsList>

          {surveySummary && (
            <Card>
              <CardHeader>
                <CardTitle>Client Survey Snapshot</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div>
                  <div className="text-sm text-muted-foreground">Average Rating</div>
                  <div className="text-2xl font-semibold">
                    {surveySummary.averageRating ?? surveySummary.average_rating ?? 0}/5
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Total Responses</div>
                  <div className="text-2xl font-semibold">
                    {surveySummary.totalResponses ?? surveySummary.total_responses ?? 0}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Recent Trend</div>
                  <div className="text-2xl font-semibold">
                    {surveySummary.trend ?? surveySummary.recent_trend ?? "Stable"}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <TabsContent value="received" className={SECTION_STACK}>
            {receivedFeedback.map((item) => (
              <Card key={item.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      {getIcon(item.type)}
                      <div>
                        <CardTitle className="text-lg">{item.title || "Feedback"}</CardTitle>
                        <div className="flex gap-2 mt-1">
                          <Badge variant="outline">{item.type}</Badge>
                          {item.is_anonymous && <Badge>Anonymous</Badge>}
                        </div>
                      </div>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {new Date(item.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">{item.content}</p>
                </CardContent>
              </Card>
            ))}

            {receivedFeedback.length === 0 && (
              <EmptyState
                icon={<MessageSquare className="h-12 w-12" />}
                title="No feedback received yet"
                description="Keep up the great work!"
              />
            )}
          </TabsContent>

          <TabsContent value="given" className={SECTION_STACK}>
            {givenFeedback.map((item) => (
              <Card key={item.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      {getIcon(item.type)}
                      <div>
                        <CardTitle className="text-lg">{item.title || "Feedback"}</CardTitle>
                        <div className="flex gap-2 mt-1">
                          <Badge variant="outline">{item.type}</Badge>
                          {item.is_anonymous && <Badge>Anonymous</Badge>}
                        </div>
                      </div>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {new Date(item.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">{item.content}</p>
                </CardContent>
              </Card>
            ))}

            {givenFeedback.length === 0 && (
              <EmptyState
                icon={<MessageSquare className="h-12 w-12" />}
                title="No feedback shared yet"
                description="Feedback you give will appear here."
              />
            )}
          </TabsContent>

          <TabsContent value="public" className={SECTION_STACK}>
            <EmptyState
              icon={<ThumbsUp className="h-12 w-12" />}
              title="Public feedback feed coming soon"
              description="We’ll surface approved public praise here."
            />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default ContinuousFeedback;
