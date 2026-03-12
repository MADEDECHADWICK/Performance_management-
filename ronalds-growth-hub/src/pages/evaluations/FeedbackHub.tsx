import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import PageLoader from "@/components/ui/page-loader";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import evaluationsAPI from "@/lib/api/evaluations";

const today = new Date().toISOString().slice(0, 16);

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleString() : "Not scheduled";

export default function FeedbackHub() {
  const { profile, hasRole } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const profileId = profile?.id;
  const canManageCheckIns = hasRole("manager") || hasRole("hr") || hasRole("super_admin");

  const [feedbackDraft, setFeedbackDraft] = useState({
    receiverId: "",
    feedbackType: "praise",
    visibility: "all",
    isPrivate: false,
    message: "",
  });
  const [checkInDraft, setCheckInDraft] = useState({
    employeeId: "",
    scheduledAt: today,
  });

  const peopleQuery = useQuery({
    queryKey: ["feedback-hub", "people"],
    queryFn: evaluationsAPI.getAssignableEmployees,
    enabled: !!profileId,
  });

  const feedbackQuery = useQuery({
    queryKey: ["feedback-hub", "received", profileId],
    queryFn: () => evaluationsAPI.getReceivedFeedback(profileId!),
    enabled: !!profileId,
  });

  const checkInsQuery = useQuery({
    queryKey: ["feedback-hub", "checkins", profileId, canManageCheckIns],
    queryFn: () =>
      canManageCheckIns
        ? evaluationsAPI.getTeamCheckIns(profileId!)
        : evaluationsAPI.getEmployeeDashboard(profileId!).then((data) => data.upcomingCheckIns),
    enabled: !!profileId,
  });

  const submitFeedbackMutation = useMutation({
    mutationFn: evaluationsAPI.submitFeedback,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["feedback-hub", "received", profileId] });
      toast({ title: "Feedback sent" });
      setFeedbackDraft({
        receiverId: "",
        feedbackType: "praise",
        visibility: "all",
        isPrivate: false,
        message: "",
      });
    },
  });

  const scheduleMutation = useMutation({
    mutationFn: evaluationsAPI.scheduleCheckIn,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["feedback-hub", "checkins"] });
      toast({ title: "Check-in scheduled" });
      setCheckInDraft({
        employeeId: "",
        scheduledAt: today,
      });
    },
  });

  const completeMutation = useMutation({
    mutationFn: ({ checkInId }: { checkInId: number }) =>
      evaluationsAPI.completeCheckIn(checkInId, {}),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["feedback-hub", "checkins"] });
      toast({ title: "Check-in completed" });
    },
  });

  if (!profileId || peopleQuery.isLoading || feedbackQuery.isLoading || checkInsQuery.isLoading) {
    return (
      <DashboardLayout>
        <PageLoader message="Loading feedback hub..." minHeightClassName="min-h-[50vh]" />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Feedback Hub</h1>
          <p className="text-sm text-muted-foreground">
            Give feedback, review received notes, and manage check-ins.
          </p>
        </div>

        <Tabs defaultValue="give" className="space-y-4">
          <TabsList>
            <TabsTrigger value="give">Give Feedback</TabsTrigger>
            <TabsTrigger value="received">Received</TabsTrigger>
            <TabsTrigger value="checkins">Check-ins</TabsTrigger>
          </TabsList>

          <TabsContent value="give">
            <Card>
              <CardHeader>
                <CardTitle>Share Continuous Feedback</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Receiver</Label>
                  <Select
                    value={feedbackDraft.receiverId}
                    onValueChange={(value) =>
                      setFeedbackDraft((current) => ({ ...current, receiverId: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select receiver" />
                    </SelectTrigger>
                    <SelectContent>
                      {peopleQuery.data?.map((person) => (
                        <SelectItem key={person.id} value={String(person.id)}>
                          {person.firstName} {person.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select
                    value={feedbackDraft.feedbackType}
                    onValueChange={(value) =>
                      setFeedbackDraft((current) => ({ ...current, feedbackType: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="praise">Praise</SelectItem>
                      <SelectItem value="coaching">Coaching</SelectItem>
                      <SelectItem value="concern">Concern</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Visibility</Label>
                  <Select
                    value={feedbackDraft.visibility}
                    onValueChange={(value) =>
                      setFeedbackDraft((current) => ({ ...current, visibility: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="hr">HR</SelectItem>
                      <SelectItem value="self">Self</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Private</Label>
                  <Select
                    value={feedbackDraft.isPrivate ? "yes" : "no"}
                    onValueChange={(value) =>
                      setFeedbackDraft((current) => ({ ...current, isPrivate: value === "yes" }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="no">Visible to receiver</SelectItem>
                      <SelectItem value="yes">Private note</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Message</Label>
                  <Textarea
                    value={feedbackDraft.message}
                    onChange={(event) =>
                      setFeedbackDraft((current) => ({ ...current, message: event.target.value }))
                    }
                    placeholder="Describe the observation, context, and next step."
                  />
                </div>
                <div className="md:col-span-2 flex justify-end">
                  <Button
                    onClick={() =>
                      submitFeedbackMutation.mutate({
                        receiverId: Number(feedbackDraft.receiverId),
                        feedbackType: feedbackDraft.feedbackType as any,
                        visibility: feedbackDraft.visibility as any,
                        isPrivate: feedbackDraft.isPrivate,
                        message: feedbackDraft.message,
                      })
                    }
                    disabled={submitFeedbackMutation.isPending}
                  >
                    Send Feedback
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="received">
            <Card>
              <CardHeader>
                <CardTitle>Received Feedback</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {feedbackQuery.data?.length ? (
                  feedbackQuery.data.map((feedback) => (
                    <div key={feedback.id} className="rounded-lg border border-border/70 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium capitalize">{feedback.feedbackType}</div>
                        <Badge variant="outline">{feedback.visibility}</Badge>
                      </div>
                      <div className="mt-2 text-sm text-muted-foreground">
                        From {feedback.giver?.firstName} {feedback.giver?.lastName}
                      </div>
                      <p className="mt-3 text-sm">{feedback.message}</p>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-muted-foreground">No feedback received yet.</div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="checkins">
            <div className="space-y-4">
              {canManageCheckIns ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Schedule Check-in</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Employee</Label>
                      <Select
                        value={checkInDraft.employeeId}
                        onValueChange={(value) =>
                          setCheckInDraft((current) => ({ ...current, employeeId: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select employee" />
                        </SelectTrigger>
                        <SelectContent>
                          {peopleQuery.data?.map((person) => (
                            <SelectItem key={person.id} value={String(person.id)}>
                              {person.firstName} {person.lastName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Date & Time</Label>
                      <Input
                        type="datetime-local"
                        value={checkInDraft.scheduledAt}
                        onChange={(event) =>
                          setCheckInDraft((current) => ({
                            ...current,
                            scheduledAt: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        onClick={() =>
                          scheduleMutation.mutate({
                            managerId: profileId,
                            employeeId: Number(checkInDraft.employeeId),
                            scheduledAt: checkInDraft.scheduledAt,
                          })
                        }
                        disabled={scheduleMutation.isPending}
                      >
                        Schedule
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : null}

              <Card>
                <CardHeader>
                  <CardTitle>{canManageCheckIns ? "Team Check-ins" : "My Check-ins"}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {(checkInsQuery.data as any[])?.length ? (
                    (checkInsQuery.data as any[]).map((checkIn) => (
                      <div key={checkIn.id} className="rounded-lg border border-border/70 p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div>
                            <div className="font-medium">
                              {checkIn.employee?.firstName || checkIn.manager?.firstName}{" "}
                              {checkIn.employee?.lastName || checkIn.manager?.lastName}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {formatDate(checkIn.scheduledAt)}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{checkIn.status}</Badge>
                            {canManageCheckIns && checkIn.status === "scheduled" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => completeMutation.mutate({ checkInId: checkIn.id })}
                              >
                                Complete
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-muted-foreground">No check-ins scheduled.</div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
