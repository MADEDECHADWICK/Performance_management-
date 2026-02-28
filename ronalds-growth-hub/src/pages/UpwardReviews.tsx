import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import PageLoader from '@/components/ui/page-loader';
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowUpCircle, CheckCircle2, Clock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const toValidId = (value: unknown): number | null => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

export default function UpwardReviews() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, isLoading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [managers, setManagers] = useState<any[]>([]);
  const [evaluations, setEvaluations] = useState<any[]>([]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/auth');
      return;
    }
    loadData();
  }, [authLoading, user, navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadData = async () => {
    try {
      setLoading(true);
      if (!user) {
        navigate('/auth');
        return;
      }

      const profileId = toValidId(
        (user as any)?.profileId ?? (user as any)?.profile_id ?? user?.profile?.id
      );

      if (!profileId) {
        setManagers([]);
        setEvaluations([]);
        return;
      }

      // Use manager id from auth payload profile to avoid redundant profile lookup
      const managerProfileId = toValidId(
        (user as any)?.profile?.managerId ?? (user as any)?.profile?.manager_id
      );
      if (managerProfileId) {
        setManagers([
          {
            id: managerProfileId,
            firstName: "Manager",
            lastName: "",
            positionTitle: "Manager",
          },
        ]);
      }

      const evalData = await apiFetch('GET', `/upward-evaluations?evaluatorId=${profileId}`);
      if (Array.isArray(evalData) && evalData.length > 0) {
        // Keep manager identifiers from evaluation payload without extra profile lookups.
        const evaluationsWithManagers = evalData.map((evaluation: any) => {
          const managerId = toValidId(evaluation.managerId ?? evaluation.manager_id);
          return { ...evaluation, manager: null, managerId };
        });
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
        <PageLoader message="Loading..." />
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
                    const managerId = toValidId(manager.id);
                    const existingEval = evaluations.find(
                      (e) =>
                        toValidId(e.managerId ?? e.manager_id) === managerId &&
                        e.status === "pending"
                    );
                    const completedEval = evaluations.find(
                      (e) =>
                        toValidId(e.managerId ?? e.manager_id) === managerId &&
                        e.status === "completed"
                    );

                    if (completedEval) return null;

                    return (
                      <div
                        key={manager.id}
                        className="flex items-center justify-between p-4 border rounded-lg"
                      >
                        <div>
                          <p className="font-medium">
                            {manager.firstName ?? manager.first_name}{" "}
                            {manager.lastName ?? manager.last_name}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {(manager.positionTitle ?? manager.position) || "Manager"}
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
                            {(evaluation.manager?.firstName ?? evaluation.manager?.first_name) ||
                              "Manager"}{" "}
                            {(evaluation.manager?.lastName ?? evaluation.manager?.last_name) || ""}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Submitted{" "}
                            {new Date(
                              evaluation.submittedAt ?? evaluation.submitted_at
                            ).toLocaleDateString()}
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
