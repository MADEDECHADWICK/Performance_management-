import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import apiFetch, { authAPI } from "@/integrations/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Target, Plus, CheckCircle2, XCircle, Clock, AlertCircle } from "lucide-react";

export default function Goals() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [goals, setGoals] = useState<any[]>([]);
  const [cycles, setCycles] = useState<any[]>([]);
  const [kpis, setKpis] = useState<any[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newGoal, setNewGoal] = useState({
    cycle_id: "",
    kpi_id: "",
    goal_title: "",
    goal_description: "",
    target_value: "",
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const user = await authAPI.me();
      if (!user) {
        navigate("/auth");
        return;
      }

      // Load active cycles
      const cyclesData = await apiFetch('GET', '/evaluation-cycles?status=active');
      setCycles(cyclesData || []);

      // Load KPIs
      const kpisData = await apiFetch('GET', '/kpis?is_active=true');
      setKpis(kpisData || []);

      // Load goals (backend should return joined data as needed)
      const goalsData = await apiFetch('GET', `/employee_goals?employee_id=${user.id}`);
      setGoals(goalsData || []);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error loading data",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGoal = async () => {
    try {
      const user = await authAPI.me();
      if (!user) return;

      if (!newGoal.cycle_id || !newGoal.goal_title) {
        toast({
          variant: "destructive",
          title: "Missing information",
          description: "Please fill in all required fields.",
        });
        return;
      }

      await apiFetch('POST', '/employee_goals', {
        employee_id: user.id,
        cycle_id: newGoal.cycle_id,
        kpi_id: newGoal.kpi_id || null,
        goal_title: newGoal.goal_title,
        goal_description: newGoal.goal_description,
        target_value: newGoal.target_value ? parseFloat(newGoal.target_value) : null,
      });

      toast({
        title: "Goal created",
        description: "Your goal has been submitted for manager approval.",
      });

      setIsDialogOpen(false);
      setNewGoal({
        cycle_id: "",
        kpi_id: "",
        goal_title: "",
        goal_description: "",
        target_value: "",
      });
      loadData();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error creating goal",
        description: error.message,
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return (
          <Badge className="bg-green-500">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Approved
          </Badge>
        );
      case "rejected":
        return (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 mr-1" />
            Rejected
          </Badge>
        );
      case "completed":
        return (
          <Badge className="bg-blue-500">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Completed
          </Badge>
        );
      case "pending":
        return (
          <Badge variant="secondary">
            <Clock className="h-3 w-3 mr-1" />
            Pending Review
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Target className="h-8 w-8" />
              My Goals
            </h1>
            <p className="text-muted-foreground">Set and track your performance goals</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Goal
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create New Goal</DialogTitle>
                <DialogDescription>
                  Set a new performance goal for an evaluation cycle
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="cycle">Evaluation Cycle *</Label>
                  <select
                    id="cycle"
                    className="w-full rounded-md border border-input bg-background px-3 py-2"
                    value={newGoal.cycle_id}
                    onChange={(e) => setNewGoal({ ...newGoal, cycle_id: e.target.value })}
                  >
                    <option value="">Select a cycle</option>
                    {cycles.map((cycle) => (
                      <option key={cycle.id} value={cycle.id}>
                        {cycle.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="kpi">Related KPI (Optional)</Label>
                  <select
                    id="kpi"
                    className="w-full rounded-md border border-input bg-background px-3 py-2"
                    value={newGoal.kpi_id}
                    onChange={(e) => setNewGoal({ ...newGoal, kpi_id: e.target.value })}
                  >
                    <option value="">No specific KPI</option>
                    {kpis.map((kpi) => (
                      <option key={kpi.id} value={kpi.id}>
                        {kpi.name} ({kpi.category})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="title">Goal Title *</Label>
                  <Input
                    id="title"
                    value={newGoal.goal_title}
                    onChange={(e) => setNewGoal({ ...newGoal, goal_title: e.target.value })}
                    placeholder="E.g., Increase client satisfaction scores"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Goal Description</Label>
                  <Textarea
                    id="description"
                    value={newGoal.goal_description}
                    onChange={(e) => setNewGoal({ ...newGoal, goal_description: e.target.value })}
                    placeholder="Describe your goal in detail..."
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="target">Target Value</Label>
                  <Input
                    id="target"
                    type="number"
                    value={newGoal.target_value}
                    onChange={(e) => setNewGoal({ ...newGoal, target_value: e.target.value })}
                    placeholder="E.g., 85"
                  />
                </div>

                <Button onClick={handleCreateGoal} className="w-full">
                  Create Goal
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {cycles.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No Active Cycles</CardTitle>
              <CardDescription>
                There are no active evaluation cycles at the moment. Goals can be set once a cycle is active.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="grid gap-4">
            {goals.length === 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>No Goals Yet</CardTitle>
                  <CardDescription>
                    Start by creating your first performance goal for the current evaluation cycle.
                  </CardDescription>
                </CardHeader>
              </Card>
            ) : (
              goals.map((goal) => (
                <Card key={goal.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle>{goal.goal_title}</CardTitle>
                        <CardDescription>
                          {goal.cycle?.name}
                          {goal.kpi && ` • ${goal.kpi.name}`}
                        </CardDescription>
                      </div>
                      {getStatusBadge(goal.status)}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {goal.goal_description && (
                      <p className="text-sm">{goal.goal_description}</p>
                    )}

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      {goal.target_value && (
                        <div>
                          <p className="text-muted-foreground">Target</p>
                          <p className="font-medium">{goal.target_value}</p>
                        </div>
                      )}
                      {goal.achieved_value && (
                        <div>
                          <p className="text-muted-foreground">Achieved</p>
                          <p className="font-medium">{goal.achieved_value}</p>
                        </div>
                      )}
                    </div>

                    {goal.manager_comments && (
                      <div className="border-t pt-4">
                        <div className="flex items-center gap-2 mb-2">
                          <AlertCircle className="h-4 w-4 text-muted-foreground" />
                          <p className="text-sm font-medium">Manager Feedback</p>
                        </div>
                        <p className="text-sm text-muted-foreground">{goal.manager_comments}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

