import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { MessageSquare, Plus, Star, User } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";

interface Profile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

interface Feedback {
  id: string;
  feedback_type: string;
  rating: number;
  comments: string;
  created_at: string;
  is_anonymous: boolean;
  reviewer_id: string;
  subject_id: string;
}

const Feedback = () => {
  const navigate = useNavigate();
  const [colleagues, setColleagues] = useState<Profile[]>([]);
  const [receivedFeedback, setReceivedFeedback] = useState<Feedback[]>([]);
  const [givenFeedback, setGivenFeedback] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();
  const { user, isLoading: authLoading } = useAuth();

  const [formData, setFormData] = useState({
    subject_id: "",
    feedback_type: "peer",
    rating: 5,
    comments: "",
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
      if (!user) {
        navigate("/auth");
        return;
      }

      // Load colleagues
      const profilesData = await apiFetch(`/profiles?exclude_id=${user.id}&limit=50`);
      setColleagues(profilesData || []);

      // Load received feedback
      const receivedData = await apiFetch(`/feedback?subject_id=${user.id}`);
      setReceivedFeedback(receivedData || []);

      // Load given feedback
      const givenData = await apiFetch(`/feedback?reviewer_id=${user.id}`);
      setGivenFeedback(givenData || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
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

      await apiFetch('/feedback', {
        method: 'POST',
        body: JSON.stringify({ ...formData, reviewer_id: user.id })
      });

      toast({ title: "Success", description: "Feedback submitted successfully" });
      setDialogOpen(false);
      setFormData({
        subject_id: "",
        feedback_type: "peer",
        rating: 5,
        comments: "",
        is_anonymous: false,
      });
      loadData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const renderStars = (rating: number) => {
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-4 w-4 ${star <= rating ? 'fill-accent text-accent' : 'text-muted-foreground'}`}
          />
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">360° Feedback</h1>
            <p className="text-muted-foreground">Share and receive performance feedback</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Give Feedback
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Provide Feedback</DialogTitle>
                <DialogDescription>Share constructive feedback with a colleague</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="subject">Colleague</Label>
                  <Select
                    value={formData.subject_id}
                    onValueChange={(value) => setFormData({ ...formData, subject_id: value })}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a colleague" />
                    </SelectTrigger>
                    <SelectContent>
                      {colleagues.map((colleague) => (
                        <SelectItem key={colleague.id} value={colleague.id}>
                          {colleague.first_name} {colleague.last_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="type">Feedback Type</Label>
                  <Select
                    value={formData.feedback_type}
                    onValueChange={(value) => setFormData({ ...formData, feedback_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="peer">Peer Feedback</SelectItem>
                      <SelectItem value="manager">Manager Feedback</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Overall Rating</Label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setFormData({ ...formData, rating: star })}
                      >
                        <Star
                          className={`h-8 w-8 cursor-pointer transition-colors ${
                            star <= formData.rating ? 'fill-accent text-accent' : 'text-muted-foreground hover:text-accent'
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="comments">Comments</Label>
                  <Textarea
                    id="comments"
                    value={formData.comments}
                    onChange={(e) => setFormData({ ...formData, comments: e.target.value })}
                    rows={4}
                    placeholder="Provide specific, constructive feedback..."
                    required
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit">Submit Feedback</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs defaultValue="received" className="space-y-4">
          <TabsList>
            <TabsTrigger value="received">Received Feedback</TabsTrigger>
            <TabsTrigger value="given">Given Feedback</TabsTrigger>
          </TabsList>

          <TabsContent value="received" className="space-y-4">
            {receivedFeedback.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No feedback received yet</p>
                </CardContent>
              </Card>
            ) : (
              receivedFeedback.map((feedback) => (
                <Card key={feedback.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <User className="h-4 w-4" />
                        {feedback.is_anonymous ? "Anonymous" : "Colleague"}
                      </CardTitle>
                      {renderStars(feedback.rating)}
                    </div>
                    <CardDescription>
                      {new Date(feedback.created_at).toLocaleDateString()} • {feedback.feedback_type}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-foreground">{feedback.comments}</p>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="given" className="space-y-4">
            {givenFeedback.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">You haven't given any feedback yet</p>
                </CardContent>
              </Card>
            ) : (
              givenFeedback.map((feedback) => (
                <Card key={feedback.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">Feedback to Colleague</CardTitle>
                      {renderStars(feedback.rating)}
                    </div>
                    <CardDescription>
                      {new Date(feedback.created_at).toLocaleDateString()} • {feedback.feedback_type}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-foreground">{feedback.comments}</p>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default Feedback;
