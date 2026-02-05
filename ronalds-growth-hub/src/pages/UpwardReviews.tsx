import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { apiFetch,  authAPI } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowUpCircle, CheckCircle2, Clock } from "lucide-react";

export default function UpwardReviews() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [managers, setManagers] = useState<any[]>([]);
  const [evaluations, setEvaluations] = useState<any[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const me = await authAPI.me();
      if (!me) {
        navigate('/auth');
        return;
      }

      // profile
      const profileData = await apiFetch('GET', `/profiles/${me.id}`);
      if (profileData && profileData.manager_id) {
        const managerData = await apiFetch('GET', `/profiles/${profileData.manager_id}`);
        if (managerData) setManagers([managerData]);
      }

      const evalData = await apiFetch('GET', `/upward_evaluations?evaluatorId=${me.id}`);
      if (evalData && evalData.length > 0) {
        // fetch manager details (may be null)
        const evaluationsWithManagers = await Promise.all(
          evalData.map(async (evaluation: any) => {
            const managerData = evaluation.manager_id ? await apiFetch('GET', `/profiles/${evaluation.manager_id}`) : null;
            return { ...evaluation, manager: managerData };
          })
        );
        setEvaluations(evaluationsWithManagers);
      } else {
        setEvaluations([]);
      }
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-500"><CheckCircle2 className="h-3 w-3 mr-1" />Completed</Badge>;
      case "pending":
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
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
              <ArrowUpCircle className="h-8 w-8" />
              Upward Evaluations
            </h1>
            <p className="text-muted-foreground">Provide feedback on your manager's leadership</p>
          </div>
        </div>

        {managers.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No Manager Assigned</CardTitle>
              <CardDescription>
                You don't currently have a manager assigned to evaluate.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Pending Evaluations</CardTitle>
                  <CardDescription>Managers awaiting your feedback</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {managers.map((manager) => {
                    const existingEval = evaluations.find(
                      (e) => e.manager_id === manager.id && e.status === "pending"
                    );
                    const completedEval = evaluations.find(
                      (e) => e.manager_id === manager.id && e.status === "completed"
                    );

                    if (completedEval) return null;

                    return (
                      <div
                        key={manager.id}
                        className="flex items-center justify-between p-4 border rounded-lg"
                      >
                        <div>
                          <p className="font-medium">
                            {manager.first_name} {manager.last_name}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {manager.position || "Manager"}
                          </p>
                        </div>
                        <Button
                          onClick={() =>
                            navigate(`/upward-evaluation?managerId=${manager.id}`)
                          }
                        >
                          {existingEval ? "Continue" : "Start Evaluation"}
                        </Button>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Completed Evaluations</CardTitle>
                  <CardDescription>Your submitted feedback</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {evaluations
                    .filter((e) => e.status === "completed")
                    .map((evaluation) => (
                      <div
                        key={evaluation.id}
                        className="flex items-center justify-between p-4 border rounded-lg"
                      >
                        <div>
                          <p className="font-medium">
                            {evaluation.manager?.first_name} {evaluation.manager?.last_name}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Submitted {new Date(evaluation.submitted_at).toLocaleDateString()}
                          </p>
                        </div>
                        {getStatusBadge(evaluation.status)}
                      </div>
                    ))}
                  {evaluations.filter((e) => e.status === "completed").length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No completed evaluations yet
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
