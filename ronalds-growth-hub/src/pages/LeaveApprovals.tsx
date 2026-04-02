import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import PageLoader from "@/components/ui/page-loader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import leaveAPI, {
  type LeaveCalendarResponse,
  type LeaveRequest,
  type LeaveRequestStatus,
} from "@/lib/api/leave";

const todayIso = () => new Date().toISOString().slice(0, 10);

const futureIso = (offsetDays: number) => {
  const next = new Date();
  next.setUTCDate(next.getUTCDate() + offsetDays);
  return next.toISOString().slice(0, 10);
};

const formatDate = (value?: string | null) => {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-KE", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
};

const formatStatus = (status: LeaveRequestStatus) =>
  status.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());

const formatLeaveQuantity = (request: LeaveRequest) => {
  const unitType = request.leaveType?.unitType || "day";
  if (unitType === "hour") {
    return `${request.requestedHours.toFixed(1)}h`;
  }
  if (request.requestedHours > 0 && Math.abs(request.requestedHours - request.requestedUnits) > 0.01) {
    return `${request.requestedUnits.toFixed(2)} day(s) • ${request.requestedHours.toFixed(1)}h`;
  }
  return `${request.requestedUnits.toFixed(2)} day(s)`;
};

const statusVariant = (status: LeaveRequestStatus) => {
  switch (status) {
    case "approved":
      return "default";
    case "declined":
      return "destructive";
    case "cancelled":
      return "secondary";
    default:
      return "outline";
  }
};

const requestsOverlap = (left: LeaveRequest, right: LeaveRequest) =>
  left.startDate.slice(0, 10) <= right.endDate.slice(0, 10) &&
  right.startDate.slice(0, 10) <= left.endDate.slice(0, 10);

export default function LeaveApprovals() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [busyRequestId, setBusyRequestId] = useState<number | null>(null);
  const [approvals, setApprovals] = useState<LeaveRequest[]>([]);
  const [teamCalendar, setTeamCalendar] = useState<LeaveCalendarResponse>({ requests: [], holidays: [] });

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [approvalRows, calendarRows] = await Promise.all([
        leaveAPI.listApprovals({ page: 1, pageSize: 12, scope: "mine" }),
        leaveAPI.getCalendar({
          scope: "team",
          dateFrom: todayIso(),
          dateTo: futureIso(45),
        }),
      ]);
      setApprovals(approvalRows.data || []);
      setTeamCalendar(calendarRows);
    } catch (error: any) {
      toast({
        title: "Approvals unavailable",
        description: error?.message || "Failed to load leave approvals.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const conflictsByRequestId = useMemo(() => {
    const nextMap = new Map<number, number>();
    approvals.forEach((request) => {
      const conflicts = teamCalendar.requests.filter(
        (candidate) => candidate.id !== request.id && requestsOverlap(request, candidate)
      ).length;
      nextMap.set(request.id, conflicts);
    });
    return nextMap;
  }, [approvals, teamCalendar.requests]);

  const handleApprove = async (request: LeaveRequest) => {
    const notes = window.prompt(`Approve leave request #${request.id}. Add optional notes:`, "");
    try {
      setBusyRequestId(request.id);
      await leaveAPI.approveRequest(request.id, notes || undefined);
      toast({
        title: "Leave approved",
        description: "The request has been approved successfully.",
      });
      await loadData();
    } catch (error: any) {
      toast({
        title: "Approval failed",
        description: error?.message || "Unable to approve this leave request.",
        variant: "destructive",
      });
    } finally {
      setBusyRequestId(null);
    }
  };

  const handleDecline = async (request: LeaveRequest) => {
    const reason = window.prompt(`Decline leave request #${request.id}. A reason is required:`, "");
    if (!reason?.trim()) return;
    try {
      setBusyRequestId(request.id);
      await leaveAPI.declineRequest(request.id, reason.trim());
      toast({
        title: "Leave declined",
        description: "The request has been declined and the employee has been notified.",
      });
      await loadData();
    } catch (error: any) {
      toast({
        title: "Decline failed",
        description: error?.message || "Unable to decline this leave request.",
        variant: "destructive",
      });
    } finally {
      setBusyRequestId(null);
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <PageLoader message="Loading leave approvals..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Leave Approvals</h1>
            <p className="text-muted-foreground">
              Review team leave requests with calendar context before approving or declining.
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link to="/leave">Back to my leave</Link>
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Pending approvals</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{approvals.length}</div>
              <p className="text-sm text-muted-foreground">Requests waiting for your action.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Upcoming absences</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">
                {teamCalendar.requests.filter((request) => request.status === "approved").length}
              </div>
              <p className="text-sm text-muted-foreground">Approved team leave in the next 45 days.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Public holidays</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{teamCalendar.holidays.length}</div>
              <p className="text-sm text-muted-foreground">Holiday entries affecting deductions.</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Approval queue</CardTitle>
            <CardDescription>Current leave requests awaiting your review.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Conflicts</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {approvals.length ? (
                  approvals.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell>
                        <div className="font-medium">
                          {request.employee?.firstName} {request.employee?.lastName}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {request.employee?.department?.name || "Unassigned department"}
                        </div>
                      </TableCell>
                      <TableCell>{request.leaveType?.name || "Leave"}</TableCell>
                      <TableCell>
                        {formatDate(request.startDate)} - {formatDate(request.endDate)}
                        {request.startsAt && request.endsAt ? (
                          <div className="text-xs text-muted-foreground">
                            {new Date(request.startsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                            {" - "}
                            {new Date(request.endsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>{formatLeaveQuantity(request)}</TableCell>
                      <TableCell>
                        {conflictsByRequestId.get(request.id) ? (
                          <Badge variant="outline">{conflictsByRequestId.get(request.id)} overlap(s)</Badge>
                        ) : (
                          <span className="text-sm text-muted-foreground">Clear</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(request.status)}>{formatStatus(request.status)}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleApprove(request)}
                            disabled={busyRequestId === request.id}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDecline(request)}
                            disabled={busyRequestId === request.id}
                          >
                            Decline
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      No leave requests are currently waiting for you.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <Card>
            <CardHeader>
              <CardTitle>Team leave calendar</CardTitle>
              <CardDescription>Upcoming approved and pending absences across the team.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {teamCalendar.requests.length ? (
                teamCalendar.requests.slice(0, 10).map((request) => (
                  <div key={request.id} className="rounded-lg border p-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="font-medium">
                          {request.employee?.firstName} {request.employee?.lastName}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {request.leaveType?.name || "Leave"} • {formatDate(request.startDate)} - {formatDate(request.endDate)}
                        </p>
                      </div>
                      <Badge variant={statusVariant(request.status)}>{formatStatus(request.status)}</Badge>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No upcoming team leave entries found.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Holiday and conflict notes</CardTitle>
              <CardDescription>Useful context while reviewing the queue.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-medium">Configured public holidays</p>
                <div className="mt-3 space-y-2">
                  {teamCalendar.holidays.length ? (
                    teamCalendar.holidays.map((holiday) => (
                      <div key={holiday.id} className="rounded-lg border p-3 text-sm">
                        <div className="font-medium">{holiday.name}</div>
                        <div className="text-muted-foreground">{formatDate(holiday.holidayDate)}</div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No public holidays in the review window.</p>
                  )}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium">Requests with overlaps</p>
                <div className="mt-3 space-y-2">
                  {approvals.filter((request) => (conflictsByRequestId.get(request.id) || 0) > 0).length ? (
                    approvals
                      .filter((request) => (conflictsByRequestId.get(request.id) || 0) > 0)
                      .map((request) => (
                        <div key={request.id} className="rounded-lg border p-3 text-sm">
                          <div className="font-medium">
                            {request.employee?.firstName} {request.employee?.lastName}
                          </div>
                          <div className="text-muted-foreground">
                            {conflictsByRequestId.get(request.id)} team overlap(s)
                          </div>
                        </div>
                      ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No overlapping absences in the approval queue.</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
