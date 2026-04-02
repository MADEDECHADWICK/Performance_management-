import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import PageLoader from "@/components/ui/page-loader";
import { useAuth } from "@/contexts/AuthContext";
import evaluationsAPI from "@/lib/api/evaluations";

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString() : "Not scheduled";

export default function EvaluationDashboard() {
  const { profile, hasRole } = useAuth();
  const profileId = profile?.id;
  const canLaunchCycles =
    hasRole("hr") || hasRole("manager") || hasRole("super_admin");

  const pendingQuery = useQuery({
    queryKey: ["evaluation-dashboard", "pending", profileId],
    queryFn: () => evaluationsAPI.getMyAssignments(),
    enabled: !!profileId,
  });

  const feedbackQuery = useQuery({
    queryKey: ["evaluation-dashboard", "feedback", profileId],
    queryFn: () => evaluationsAPI.getReceivedFeedback(profileId!),
    enabled: !!profileId,
  });

  const dashboardQuery = useQuery({
    queryKey: ["evaluation-dashboard", "overview", profileId],
    queryFn: () => evaluationsAPI.getEmployeeDashboard(profileId!),
    enabled: !!profileId,
  });

  const isLoading =
    pendingQuery.isLoading ||
    feedbackQuery.isLoading ||
    dashboardQuery.isLoading;
  if (!profileId) {
    return (
      <DashboardLayout>
        <div className="text-sm text-muted-foreground">Profile not available.</div>
      </DashboardLayout>
    );
  }

  if (isLoading) {
    return (
      <DashboardLayout>
        <PageLoader message="Loading evaluation dashboard..." minHeightClassName="min-h-[50vh]" />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="space-y-1">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <h1 className="text-3xl font-semibold tracking-tight">Evaluation Dashboard</h1>
              <p className="text-sm text-muted-foreground">
                Pending reviews, development progress, feedback, and scheduled check-ins in one place.
              </p>
            </div>
            {canLaunchCycles && (
              <Button asChild>
                <Link to="/evaluations/cycles">Create and Launch</Link>
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Pending Evaluations</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{pendingQuery.data?.length || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Feedback Received</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{feedbackQuery.data?.length || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Upcoming Check-ins</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">
                {dashboardQuery.data?.upcomingCheckIns.length || 0}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>My Pending Evaluations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {pendingQuery.data?.length ? (
                pendingQuery.data.map((assignment) => (
                  <div
                    key={assignment.id}
                    className="rounded-lg border border-border/70 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-medium">
                          {assignment.evaluatee?.firstName} {assignment.evaluatee?.lastName}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Due {formatDate(assignment.dueDate)} · {assignment.relationship}
                        </div>
                      </div>
                      <Badge variant="outline">{assignment.status}</Badge>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <Button asChild size="sm" variant="outline">
                        <Link to={`/evaluations/assignments/${assignment.id}`}>
                          Open Evaluation
                        </Link>
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">No pending evaluations.</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Evaluation Activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {pendingQuery.data?.length ? (
                pendingQuery.data.slice(0, 5).map((assignment) => (
                  <div
                    key={assignment.id}
                    className="flex items-center justify-between rounded-lg border border-border/70 px-4 py-3"
                  >
                    <span className="font-medium capitalize">{assignment.relationship}</span>
                    <Badge>{assignment.status}</Badge>
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">No evaluation activity recorded yet.</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Feedback</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {feedbackQuery.data?.length ? (
                feedbackQuery.data.slice(0, 5).map((feedback) => (
                  <div key={feedback.id} className="rounded-lg border border-border/70 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium capitalize">{feedback.feedbackType}</div>
                      <Badge variant="secondary">{feedback.visibility}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{feedback.message}</p>
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">No feedback received yet.</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Upcoming Check-ins</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {dashboardQuery.data?.upcomingCheckIns.length ? (
                dashboardQuery.data.upcomingCheckIns.map((checkIn) => (
                  <div key={checkIn.id} className="rounded-lg border border-border/70 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium">
                        {checkIn.manager?.firstName} {checkIn.manager?.lastName}
                      </div>
                      <Badge variant="outline">{checkIn.status}</Badge>
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">
                      Scheduled for {formatDate(checkIn.scheduledAt)}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">No check-ins scheduled.</div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
