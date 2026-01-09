import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { apiFetch, authAPI } from "@/integrations/apiClient";
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

interface Feedback {
  id: string;
  recipient_id: string;
  giver_id: string | null;
  feedback_type: string;
  category: string | null;
  message: string;
  is_anonymous: boolean;
  is_public: boolean;
  created_at: string;
}

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
}

const ContinuousFeedback = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [formData, setFormData] = useState({
    recipient_id: "",
    feedback_type: "kudos",
    category: "",
    message: "",
    is_anonymous: false,
    is_public: false,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
          const user = await authAPI.me();
      if (!user) {
        navigate("/auth");
        return;
      }

      setCurrentUserId(user.id);

      // Load feedback (received and given)
      const feedbackData = await apiFetch("GET", `/continuous_feedback?user_id=${user.id}`);
      setFeedback(feedbackData || []);

      // Load employees for selection - just get all profiles
      const employeesData = await apiFetch("GET", `/profiles?exclude_id=${user.id}`);
      setEmployees(employeesData || []);

    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error loading feedback",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
          const user = await authAPI.me();
      if (!user) return;

      const feedbackData = {
        recipient_id: formData.recipient_id,
        giver_id: formData.is_anonymous ? null : user.id,
        feedback_type: formData.feedback_type,
        category: formData.category || null,
        message: formData.message,
        is_anonymous: formData.is_anonymous,
        is_public: formData.is_public,
      };

      await apiFetch("POST", "/continuous_feedback", feedbackData);

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
      recipient_id: "",
      feedback_type: "kudos",
      category: "",
      message: "",
      is_anonymous: false,
      is_public: false,
    });
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "kudos": return <Heart className="h-5 w-5 text-red-500" />;
      case "recognition": return <Award className="h-5 w-5 text-yellow-500" />;
      case "constructive": return <MessageSquare className="h-5 w-5 text-blue-500" />;
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

  const receivedFeedback = feedback.filter(f => f.recipient_id === currentUserId);
  const givenFeedback = feedback.filter(f => f.giver_id === currentUserId);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Continuous Feedback</h1>
            <p className="text-muted-foreground mt-2">
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
                    value={formData.recipient_id}
                    onValueChange={(value) => setFormData({ ...formData, recipient_id: value })}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a colleague" />
                    </SelectTrigger>
                    <SelectContent>
                      {employees.map((emp) => (
                        <SelectItem key={emp.id} value={emp.id}>
                          {emp.first_name} {emp.last_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="feedback_type">Feedback Type</Label>
                    <Select
                      value={formData.feedback_type}
                      onValueChange={(value) => setFormData({ ...formData, feedback_type: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="kudos">Kudos / Appreciation</SelectItem>
                        <SelectItem value="recognition">Recognition</SelectItem>
                        <SelectItem value="constructive">Constructive Feedback</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="category">Category (Optional)</Label>
                    <Select
                      value={formData.category}
                      onValueChange={(value) => setFormData({ ...formData, category: value === "none" ? "" : value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent className="z-50">
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="learning_growth">Learning & Growth</SelectItem>
                        <SelectItem value="customer_satisfaction">Customer Satisfaction</SelectItem>
                        <SelectItem value="internal_processes">Internal Processes</SelectItem>
                        <SelectItem value="teamwork">Teamwork</SelectItem>
                        <SelectItem value="leadership">Leadership</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="message">Message</Label>
                  <Textarea
                    id="message"
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
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

                <div className="flex items-center justify-between space-x-2 p-4 border rounded-lg">
                  <div className="space-y-0.5">
                    <Label htmlFor="public">Make Public</Label>
                    <p className="text-sm text-muted-foreground">
                      Allow others to see this feedback
                    </p>
                  </div>
                  <Switch
                    id="public"
                    checked={formData.is_public}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_public: checked })}
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

        <Tabs defaultValue="received" className="space-y-4">
          <TabsList>
            <TabsTrigger value="received">Received ({feedback.length})</TabsTrigger>
            <TabsTrigger value="given">Given</TabsTrigger>
            <TabsTrigger value="public">Public Feed</TabsTrigger>
          </TabsList>

          <TabsContent value="received" className="space-y-4">
            {receivedFeedback.map((item) => (
              <Card key={item.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      {getIcon(item.feedback_type)}
                      <div>
                        <CardTitle className="text-lg">
                          {item.is_anonymous ? "Anonymous Colleague" : "Colleague"}
                        </CardTitle>
                        <div className="flex gap-2 mt-1">
                          <Badge variant="outline">{item.feedback_type}</Badge>
                          {item.category && (
                            <Badge variant="secondary">{item.category.replace(/_/g, ' ')}</Badge>
                          )}
                          {item.is_public && <Badge>Public</Badge>}
                        </div>
                      </div>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {new Date(item.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">{item.message}</p>
                </CardContent>
              </Card>
            ))}

            {receivedFeedback.length === 0 && (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground text-center">
                    No feedback received yet. Keep up the great work!
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="given" className="space-y-4">
            {givenFeedback.map((item) => (
              <Card key={item.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      {getIcon(item.feedback_type)}
                      <div>
                        <CardTitle className="text-lg">To: Colleague</CardTitle>
                        <div className="flex gap-2 mt-1">
                          <Badge variant="outline">{item.feedback_type}</Badge>
                          {item.category && (
                            <Badge variant="secondary">{item.category.replace(/_/g, ' ')}</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {new Date(item.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">{item.message}</p>
                </CardContent>
              </Card>
            ))}

            {givenFeedback.length === 0 && (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground text-center">
                    Feedback you've given will appear here
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="public" className="space-y-4">
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <ThumbsUp className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground text-center">
                  Public feedback feed coming soon
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default ContinuousFeedback;