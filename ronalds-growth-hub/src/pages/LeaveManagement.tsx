import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import PageLoader from "@/components/ui/page-loader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import documentsAPI from "@/lib/api/documents";
import leaveAPI, {
  type LeaveBalance,
  type LeaveCalendarResponse,
  type LeaveDayPortion,
  type LeaveRequest,
  type LeaveRequestStatus,
  type LeaveType,
} from "@/lib/api/leave";

type LeaveRequestForm = {
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  useCustomTimeRange: boolean;
  startTime: string;
  endTime: string;
  startDayPortion: LeaveDayPortion;
  endDayPortion: LeaveDayPortion;
  reason: string;
};

const initialFormState: LeaveRequestForm = {
  leaveTypeId: "",
  startDate: "",
  endDate: "",
  useCustomTimeRange: false,
  startTime: "",
  endTime: "",
  startDayPortion: "full_day",
  endDayPortion: "full_day",
  reason: "",
};

const todayIso = () => new Date().toISOString().slice(0, 10);

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

const isPendingStatus = (status: LeaveRequestStatus) =>
  status === "pending_manager_approval" ||
  status === "pending_partner_approval" ||
  status === "pending_hr_approval";

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

const monthWindow = () => {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
};

const combineDateTime = (date: string, time: string) => `${date}T${time}:00`;

const formatTime = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-KE", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

const formatLeaveQuantity = (request: Pick<LeaveRequest, "requestedUnits" | "requestedHours" | "leaveType">) => {
  const unitType = request.leaveType?.unitType || "day";
  if (unitType === "hour") {
    return `${request.requestedHours.toFixed(1)} hour(s)`;
  }
  if (request.requestedHours > 0 && Math.abs(request.requestedHours - request.requestedUnits) > 0.01) {
    return `${request.requestedUnits.toFixed(2)} day(s) • ${request.requestedHours.toFixed(1)}h`;
  }
  return `${request.requestedUnits.toFixed(2)} day(s)`;
};

export default function LeaveManagement() {
  const location = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState(location.pathname === "/leave/apply" ? "apply" : "overview");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [calendar, setCalendar] = useState<LeaveCalendarResponse>({ requests: [], holidays: [] });
  const [form, setForm] = useState<LeaveRequestForm>(initialFormState);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  useEffect(() => {
    setActiveTab(location.pathname === "/leave/apply" ? "apply" : "overview");
  }, [location.pathname]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const window = monthWindow();
      const [balanceRows, requestRows, leaveTypeRows, calendarRows] = await Promise.all([
        leaveAPI.listMyBalances(),
        leaveAPI.listRequests({ page: 1, pageSize: 10 }),
        leaveAPI.listLeaveTypes(),
        leaveAPI.getCalendar({
          scope: "mine",
          dateFrom: window.start,
          dateTo: window.end,
        }),
      ]);
      setBalances(balanceRows);
      setRequests(requestRows.data || []);
      setLeaveTypes(leaveTypeRows.filter((item) => item.isActive));
      setCalendar(calendarRows);
    } catch (error: any) {
      toast({
        title: "Leave data unavailable",
        description: error?.message || "Failed to load leave data.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedLeaveType = useMemo(
    () => leaveTypes.find((item) => item.id === Number(form.leaveTypeId)) || null,
    [form.leaveTypeId, leaveTypes]
  );

  const pendingRequests = requests.filter((request) => isPendingStatus(request.status));

  const requestedHoursPreview = useMemo(() => {
    if (!form.useCustomTimeRange || !form.startDate || !form.endDate || !form.startTime || !form.endTime) {
      return null;
    }
    if (form.startDate !== form.endDate) return null;
    const startsAt = new Date(combineDateTime(form.startDate, form.startTime));
    const endsAt = new Date(combineDateTime(form.endDate, form.endTime));
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
      return null;
    }
    return Number((((endsAt.getTime() - startsAt.getTime()) / (1000 * 60 * 60))).toFixed(2));
  }, [form.endDate, form.endTime, form.startDate, form.startTime, form.useCustomTimeRange]);

  const handleFieldChange = (field: keyof LeaveRequestForm, value: string) => {
    setForm((current) => ({
      ...current,
      [field]: value,
      ...(field === "startDate" && current.useCustomTimeRange ? { endDate: value } : {}),
    }));
  };

  const handleSubmit = async () => {
    if (!form.leaveTypeId || !form.startDate || !form.endDate) {
      toast({
        title: "Missing details",
        description: "Leave type, start date, and end date are required.",
        variant: "destructive",
      });
      return;
    }

    if (form.useCustomTimeRange) {
      if (!form.startTime || !form.endTime) {
        toast({
          title: "Missing time range",
          description: "Start time and end time are required for hourly leave.",
          variant: "destructive",
        });
        return;
      }
      if (form.startDate !== form.endDate) {
        toast({
          title: "Timed leave is same-day only",
          description: "For now, hourly leave must start and end on the same date.",
          variant: "destructive",
        });
        return;
      }
      if (!requestedHoursPreview || requestedHoursPreview <= 0) {
        toast({
          title: "Invalid time range",
          description: "End time must be after start time.",
          variant: "destructive",
        });
        return;
      }
    }

    if (selectedLeaveType?.requiresAttachment && selectedFiles.length === 0) {
      toast({
        title: "Attachment required",
        description: "This leave type requires at least one supporting document.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const attachmentDocumentIds: number[] = [];
      for (const file of selectedFiles) {
        const document = await documentsAPI.uploadFile(file, {
          documentType: "leave_supporting_document",
          entityType: "LeaveRequest",
          accessLevel: "employee",
          description: "Leave request attachment",
          isRequired: selectedLeaveType?.requiresAttachment ?? false,
        });
        attachmentDocumentIds.push(Number((document as any)?.id));
      }

      await leaveAPI.createRequest({
        leaveTypeId: Number(form.leaveTypeId),
        startDate: form.startDate,
        endDate: form.endDate,
        startsAt:
          form.useCustomTimeRange && requestedHoursPreview
            ? combineDateTime(form.startDate, form.startTime)
            : undefined,
        endsAt:
          form.useCustomTimeRange && requestedHoursPreview
            ? combineDateTime(form.endDate, form.endTime)
            : undefined,
        requestedHours: form.useCustomTimeRange ? requestedHoursPreview || undefined : undefined,
        startDayPortion:
          !form.useCustomTimeRange && selectedLeaveType?.allowsHalfDay
            ? form.startDayPortion
            : "full_day",
        endDayPortion:
          !form.useCustomTimeRange && selectedLeaveType?.allowsHalfDay
            ? form.endDayPortion
            : "full_day",
        reason: form.reason.trim() || undefined,
        attachmentDocumentIds,
      });

      toast({
        title: "Leave request submitted",
        description: "Your request has been sent for approval.",
      });
      setForm(initialFormState);
      setSelectedFiles([]);
      setActiveTab("overview");
      await loadData();
    } catch (error: any) {
      toast({
        title: "Submission failed",
        description: error?.message || "Unable to submit the leave request.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = async (request: LeaveRequest) => {
    const reason =
      window.prompt(`Cancel leave request #${request.id}. Add an optional reason:`, "") || "";
    try {
      await leaveAPI.cancelRequest(request.id, reason || undefined);
      toast({
        title: "Request cancelled",
        description: "The leave request was cancelled successfully.",
      });
      await loadData();
    } catch (error: any) {
      toast({
        title: "Cancellation failed",
        description: error?.message || "Unable to cancel this leave request.",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <PageLoader message="Loading leave workspace..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">My Leave</h1>
            <p className="text-muted-foreground">
              Manage balances, submit leave, and track approvals in one place.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link to="/leave/approvals">Approvals</Link>
            </Button>
            <Button onClick={() => setActiveTab("apply")}>Apply for leave</Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {balances.slice(0, 4).map((balance) => {
            const total =
              balance.openingBalance +
              balance.accruedUnits +
              balance.carriedOverUnits +
              balance.adjustedUnits;
            const usedPercent = total > 0 ? Math.min(100, Math.round((balance.usedUnits / total) * 100)) : 0;
            return (
              <Card key={balance.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{balance.leaveType?.name || "Leave"}</CardTitle>
                  <CardDescription>{balance.leaveYear} balance</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-3xl font-semibold">{balance.availableUnits}</div>
                  <Progress value={usedPercent} />
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{balance.usedUnits} used</span>
                    <span>{balance.pendingUnits} pending</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid h-auto w-full grid-cols-1 gap-1 sm:grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="apply">Apply</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
              <Card>
                <CardHeader>
                  <CardTitle>This month&apos;s leave calendar</CardTitle>
                  <CardDescription>Approved leave, pending requests, and public holidays in the current month.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {calendar.requests.length ? (
                    calendar.requests.map((request) => (
                      <div key={request.id} className="rounded-lg border p-4">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="font-medium">{request.leaveType?.name || "Leave"}</p>
                            <p className="text-sm text-muted-foreground">
                              {formatDate(request.startDate)} - {formatDate(request.endDate)}
                            </p>
                            {request.startsAt && request.endsAt ? (
                              <p className="text-xs text-muted-foreground">
                                {formatTime(request.startsAt)} - {formatTime(request.endsAt)}
                              </p>
                            ) : null}
                          </div>
                          <Badge variant={statusVariant(request.status)}>{formatStatus(request.status)}</Badge>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No leave dates scheduled for this month.</p>
                  )}
                  {calendar.holidays.length ? (
                    <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                      Public holidays: {calendar.holidays.map((holiday) => holiday.name).join(", ")}
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Pending requests</CardTitle>
                    <CardDescription>Items still in approval flow.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="text-4xl font-semibold">{pendingRequests.length}</div>
                    {pendingRequests.slice(0, 3).map((request) => (
                      <div key={request.id} className="rounded-lg border p-3 text-sm">
                        <div className="font-medium">{request.leaveType?.name || "Leave"}</div>
                        <div className="text-muted-foreground">
                          {formatDate(request.startDate)} - {formatDate(request.endDate)}
                        </div>
                        {request.startsAt && request.endsAt ? (
                          <div className="text-xs text-muted-foreground">
                            {formatTime(request.startsAt)} - {formatTime(request.endsAt)}
                          </div>
                        ) : null}
                        <div className="mt-1 text-xs text-muted-foreground">
                          {formatLeaveQuantity(request)}
                        </div>
                      </div>
                    ))}
                    {!pendingRequests.length ? (
                      <p className="text-sm text-muted-foreground">No pending leave requests.</p>
                    ) : null}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Recent decisions</CardTitle>
                    <CardDescription>Latest outcomes on submitted leave.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {requests.slice(0, 4).map((request) => (
                      <div key={request.id} className="rounded-lg border p-3 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{request.leaveType?.name || "Leave"}</span>
                          <Badge variant={statusVariant(request.status)}>{formatStatus(request.status)}</Badge>
                        </div>
                        {request.declineReason ? (
                          <div className="mt-2 text-destructive">{request.declineReason}</div>
                        ) : null}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="apply" className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
              <Card>
                <CardHeader>
                  <CardTitle>New leave request</CardTitle>
                  <CardDescription>Dates, hours, reason, and supporting documents.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Leave type</label>
                      <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={form.leaveTypeId}
                        onChange={(event) => handleFieldChange("leaveTypeId", event.target.value)}
                      >
                        <option value="">Select leave type</option>
                        {leaveTypes.map((leaveType) => (
                          <option key={leaveType.id} value={leaveType.id}>
                            {leaveType.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Reason</label>
                      <Textarea
                        value={form.reason}
                        onChange={(event) => handleFieldChange("reason", event.target.value)}
                        placeholder="Optional note for your manager or HR"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Start date</label>
                      <Input
                        type="date"
                        min={todayIso()}
                        value={form.startDate}
                        onChange={(event) => handleFieldChange("startDate", event.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">End date</label>
                      <Input
                        type="date"
                        min={form.startDate || todayIso()}
                        value={form.endDate}
                        onChange={(event) => handleFieldChange("endDate", event.target.value)}
                      />
                    </div>
                  </div>

                  <div className="rounded-lg border p-4">
                    <label className="flex items-center gap-3 text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={form.useCustomTimeRange}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            useCustomTimeRange: event.target.checked,
                            endDate: event.target.checked ? current.startDate || current.endDate : current.endDate,
                            startDayPortion: "full_day",
                            endDayPortion: "full_day",
                          }))
                        }
                      />
                      Request specific hours instead of full/half-day leave
                    </label>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Leave is calculated using 1 day = 8 hours. Hourly leave is currently same-day only.
                    </p>
                  </div>

                  {form.useCustomTimeRange ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Start time</label>
                        <Input
                          type="time"
                          value={form.startTime}
                          onChange={(event) => handleFieldChange("startTime", event.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">End time</label>
                        <Input
                          type="time"
                          value={form.endTime}
                          onChange={(event) => handleFieldChange("endTime", event.target.value)}
                        />
                      </div>
                      <div className="md:col-span-2 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                        {requestedHoursPreview ? (
                          <span>
                            Requested time:{" "}
                            <span className="font-medium text-foreground">{requestedHoursPreview.toFixed(2)}h</span>
                            {" "}which is about{" "}
                            <span className="font-medium text-foreground">
                              {(requestedHoursPreview / 8).toFixed(2)} day(s)
                            </span>
                          </span>
                        ) : (
                          <span>Pick a valid time range to see the hour deduction.</span>
                        )}
                      </div>
                    </div>
                  ) : selectedLeaveType?.allowsHalfDay ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Start day portion</label>
                        <select
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={form.startDayPortion}
                          onChange={(event) => handleFieldChange("startDayPortion", event.target.value)}
                        >
                          <option value="full_day">Full day</option>
                          <option value="half_day_am">Half day AM</option>
                          <option value="half_day_pm">Half day PM</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">End day portion</label>
                        <select
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={form.endDayPortion}
                          onChange={(event) => handleFieldChange("endDayPortion", event.target.value)}
                        >
                          <option value="full_day">Full day</option>
                          <option value="half_day_am">Half day AM</option>
                          <option value="half_day_pm">Half day PM</option>
                        </select>
                      </div>
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Attachments</label>
                    <Input
                      type="file"
                      multiple
                      onChange={(event) => setSelectedFiles(Array.from(event.target.files || []))}
                    />
                    {selectedLeaveType?.requiresAttachment ? (
                      <p className="text-xs text-amber-600">This leave type requires at least one attachment.</p>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-3">
                    <Button onClick={handleSubmit} disabled={isSubmitting}>
                      {isSubmitting ? "Submitting..." : "Submit request"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setForm(initialFormState);
                        setSelectedFiles([]);
                      }}
                    >
                      Reset
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Policy notes</CardTitle>
                  <CardDescription>Quick reference for the selected leave type.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  {selectedLeaveType ? (
                    <>
                      <div className="rounded-lg border p-4">
                        <div className="font-medium text-foreground">{selectedLeaveType.name}</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Badge variant={selectedLeaveType.isPaid ? "default" : "secondary"}>
                            {selectedLeaveType.isPaid ? "Paid" : "Unpaid"}
                          </Badge>
                          <Badge variant="outline">
                            Notice {selectedLeaveType.defaultNoticeDays} day(s)
                          </Badge>
                          <Badge variant="outline">1 day = 8 hours</Badge>
                          <Badge variant="outline">Timesheet auto-filled</Badge>
                          {selectedLeaveType.defaultMaxUnits ? (
                            <Badge variant="outline">Max {selectedLeaveType.defaultMaxUnits} units</Badge>
                          ) : null}
                        </div>
                      </div>
                      {requestedHoursPreview ? (
                        <p>
                          This request will deduct{" "}
                          <span className="font-medium text-foreground">{requestedHoursPreview.toFixed(2)} hours</span>
                          {" "}which is about{" "}
                          <span className="font-medium text-foreground">
                            {(requestedHoursPreview / 8).toFixed(2)} day(s)
                          </span>
                          , and it will appear on your timesheet immediately.
                        </p>
                      ) : null}
                      {selectedLeaveType.description ? (
                        <p>{selectedLeaveType.description}</p>
                      ) : null}
                      <p>
                        Final notice thresholds and approval routing can vary by leave policy. If your request is above
                        2 days, expect a longer notice window and a broader approval chain.
                      </p>
                    </>
                  ) : (
                    <p>Select a leave type to see policy guidance.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="history">
            <Card>
              <CardHeader>
                <CardTitle>Request history</CardTitle>
                <CardDescription>Review statuses, decline reasons, and cancellations.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Dates</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requests.length ? (
                      requests.map((request) => (
                        <TableRow key={request.id}>
                          <TableCell>{request.leaveType?.name || "Leave"}</TableCell>
                          <TableCell>
                            {formatDate(request.startDate)} - {formatDate(request.endDate)}
                            {request.startsAt && request.endsAt ? (
                              <div className="text-xs text-muted-foreground">
                                {formatTime(request.startsAt)} - {formatTime(request.endsAt)}
                              </div>
                            ) : null}
                          </TableCell>
                          <TableCell>{formatLeaveQuantity(request)}</TableCell>
                          <TableCell>
                            <Badge variant={statusVariant(request.status)}>{formatStatus(request.status)}</Badge>
                          </TableCell>
                          <TableCell className="max-w-[280px] text-sm">
                            {request.declineReason || request.cancellationReason || request.reason || "No note"}
                          </TableCell>
                          <TableCell className="text-right">
                            {isPendingStatus(request.status) ? (
                              <Button variant="outline" size="sm" onClick={() => handleCancel(request)}>
                                Cancel
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">Closed</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">
                          No leave requests found.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
