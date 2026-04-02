import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import PageLoader from "@/components/ui/page-loader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import requisitionsAPI, {
  type RequisitionAmountBreakdownItem,
  type RequisitionFinanceTracker,
  type RequisitionRequest,
  type RequisitionStatus,
} from "@/lib/api/requisitions";

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

const formatAmount = (value: number | string | null | undefined, currency = "KES") => {
  const numericValue = Number(value || 0);
  return `${currency} ${numericValue.toLocaleString("en-KE", {
    minimumFractionDigits: numericValue % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
};

const formatStatus = (status: RequisitionStatus) =>
  status.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());

const formatStage = (value?: string | null) =>
  String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

const formatModule = (value?: string | null) =>
  String(value || "general")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

const statusVariant = (status: RequisitionStatus) => {
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

const approvalActionLabel = (status?: RequisitionStatus | null) =>
  status === "pending_finance_approval" ? "Approve requisition" : "Approve & forward";

type FinanceEditFormState = {
  title: string;
  justification: string;
  amount: string;
  currency: string;
  vendorName: string;
  neededByDate: string;
  taxImpactNotes: string;
  isClientRecoverable: boolean;
  amountBreakdown: RequisitionAmountBreakdownItem[];
};

export default function RequisitionApprovals() {
  const { toast } = useToast();
  const { roles } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [approvals, setApprovals] = useState<RequisitionRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<RequisitionRequest | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [declineReason, setDeclineReason] = useState("");
  const [financeTracker, setFinanceTracker] = useState<RequisitionFinanceTracker | null>(null);
  const [releaseNotes, setReleaseNotes] = useState("");
  const [financeEdit, setFinanceEdit] = useState<FinanceEditFormState>({
    title: "",
    justification: "",
    amount: "",
    currency: "KES",
    vendorName: "",
    neededByDate: "",
    taxImpactNotes: "",
    isClientRecoverable: false,
    amountBreakdown: [],
  });

  const isFinanceActor = useMemo(() => {
    const normalizedRoles = roles.map((role) => String(role || "").toLowerCase());
    return normalizedRoles.some((role) => ["finance", "hr", "super_admin", "gmp"].includes(role));
  }, [roles]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [approvalResult, financeTrackerResult] = await Promise.all([
        requisitionsAPI.listApprovals({ page: 1, pageSize: 20, scope: "mine" }),
        isFinanceActor ? requisitionsAPI.getFinanceTracker().catch(() => null) : Promise.resolve(null),
      ]);
      setApprovals(approvalResult.data || []);
      setFinanceTracker(financeTrackerResult);
    } catch (error: any) {
      toast({
        title: "Approval desk unavailable",
        description: error?.message || "Failed to load requisition approvals.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [isFinanceActor]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedRequest) {
      setReviewNotes("");
      setDeclineReason("");
      setReleaseNotes("");
      setFinanceEdit({
        title: "",
        justification: "",
        amount: "",
        currency: "KES",
        vendorName: "",
        neededByDate: "",
        taxImpactNotes: "",
        isClientRecoverable: false,
        amountBreakdown: [],
      });
      return;
    }

    setFinanceEdit({
      title: selectedRequest.title || "",
      justification: selectedRequest.justification || "",
      amount: String(Number(selectedRequest.amount || 0)),
      currency: selectedRequest.currency || "KES",
      vendorName: selectedRequest.vendorName || "",
      neededByDate: selectedRequest.neededByDate ? String(selectedRequest.neededByDate).slice(0, 10) : "",
      taxImpactNotes: selectedRequest.taxImpactNotes || "",
      isClientRecoverable: Boolean(selectedRequest.isClientRecoverable),
      amountBreakdown: selectedRequest.amountBreakdown || [],
    });
    setReleaseNotes(selectedRequest.releaseNotes || "");
  }, [selectedRequest?.id]);

  const totalPendingValue = useMemo(
    () => approvals.reduce((sum, request) => sum + Number(request.amount || 0), 0),
    [approvals]
  );

  const stageSummary = useMemo(() => {
    const next = new Map<string, number>();
    approvals.forEach((request) => {
      next.set(request.status, (next.get(request.status) || 0) + 1);
    });
    return Array.from(next.entries());
  }, [approvals]);

  const handleFinanceEditChange = (field: keyof FinanceEditFormState, value: string | boolean) => {
    setFinanceEdit((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleFinanceBreakdownChange = (
    index: number,
    field: keyof RequisitionAmountBreakdownItem,
    value: string
  ) => {
    setFinanceEdit((current) => ({
      ...current,
      amountBreakdown: current.amountBreakdown.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              [field]: field === "amount" ? Number(value || 0) : value,
            }
          : item
      ),
    }));
  };

  const addFinanceBreakdownItem = () => {
    setFinanceEdit((current) => ({
      ...current,
      amountBreakdown: [...current.amountBreakdown, { label: "", amount: 0, notes: "" }],
    }));
  };

  const removeFinanceBreakdownItem = (index: number) => {
    setFinanceEdit((current) => ({
      ...current,
      amountBreakdown: current.amountBreakdown.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const financeBreakdownTotal = useMemo(
    () => financeEdit.amountBreakdown.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    [financeEdit.amountBreakdown]
  );

  const resetReviewState = () => {
    setReviewNotes("");
    setDeclineReason("");
    setReleaseNotes("");
    setSelectedRequest(null);
  };

  const handleApprove = async () => {
    if (!selectedRequest) return;
    try {
      setIsSaving(true);
      const updated = await requisitionsAPI.approveRequest(selectedRequest.id, reviewNotes || undefined);
      const isFinalApproval = updated.status === "approved";
      toast({
        title: isFinalApproval ? "Requisition fully approved" : "Requisition advanced",
        description: isFinalApproval
          ? `${updated.requisitionNumber} has completed the approval trail.`
          : `${updated.requisitionNumber} moved to ${formatStatus(updated.status)}.`,
      });
      resetReviewState();
      await loadData();
    } catch (error: any) {
      toast({
        title: "Approval failed",
        description: error?.message || "Unable to approve this requisition.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleFinanceSave = async () => {
    if (!selectedRequest) return;
    try {
      setIsSaving(true);
      const updated = await requisitionsAPI.financeEditRequest(selectedRequest.id, {
        title: financeEdit.title,
        justification: financeEdit.justification || undefined,
        amount: Number(financeEdit.amount || 0),
        amountBreakdown: financeEdit.amountBreakdown.length ? financeEdit.amountBreakdown : null,
        currency: financeEdit.currency || "KES",
        vendorName: financeEdit.vendorName || undefined,
        neededByDate: financeEdit.neededByDate || null,
        taxImpactNotes: financeEdit.taxImpactNotes || undefined,
        isClientRecoverable: financeEdit.isClientRecoverable,
      });
      setSelectedRequest(updated);
      toast({
        title: "Finance edits saved",
        description: `${updated.requisitionNumber} was updated before final approval.`,
      });
      await loadData();
    } catch (error: any) {
      toast({
        title: "Save failed",
        description: error?.message || "Unable to save finance edits.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReleaseFunds = async () => {
    if (!selectedRequest) return;
    try {
      setIsSaving(true);
      const updated = await requisitionsAPI.releaseFunds(selectedRequest.id, {
        notes: releaseNotes || undefined,
      });
      setSelectedRequest(updated);
      toast({
        title: "Funds released",
        description: `${updated.requisitionNumber} is now awaiting accountability.`,
      });
      await loadData();
    } catch (error: any) {
      toast({
        title: "Release failed",
        description: error?.message || "Unable to mark this requisition as released.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDecline = async () => {
    if (!selectedRequest) return;
    if (!declineReason.trim()) {
      toast({
        title: "Decline reason required",
        description: "Provide a clear reason before declining this requisition.",
        variant: "destructive",
      });
      return;
    }
    try {
      setIsSaving(true);
      await requisitionsAPI.declineRequest(selectedRequest.id, declineReason.trim());
      toast({
        title: "Requisition declined",
        description: `${selectedRequest.requisitionNumber} was declined and the requester was notified.`,
      });
      resetReviewState();
      await loadData();
    } catch (error: any) {
      toast({
        title: "Decline failed",
        description: error?.message || "Unable to decline this requisition.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <PageLoader message="Loading requisition approvals..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Requisition Approvals</h1>
            <p className="text-muted-foreground">
              Review spend requests against the required employee, manager, partner, GMP, and finance trail.
            </p>
          </div>
          <Button variant="outline" asChild>
            <a href="/requisitions">Back to requisitions</a>
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Pending approvals</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{approvals.length}</div>
              <p className="text-sm text-muted-foreground">Requests currently waiting on you.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Pending value</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{formatAmount(totalPendingValue, "KES")}</div>
              <p className="text-sm text-muted-foreground">Combined exposure in the queue.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Stages represented</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {stageSummary.length ? (
                stageSummary.map(([stage, count]) => (
                  <div key={stage} className="flex items-center justify-between text-sm">
                    <span>{formatStatus(stage as RequisitionStatus)}</span>
                    <Badge variant="outline">{count}</Badge>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No approval items right now.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Approval queue</CardTitle>
            <CardDescription>Open a requisition to review its route, support, and notes.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Requester</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Module</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Needed by</TableHead>
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
                          {request.requester?.firstName} {request.requester?.lastName}
                        </div>
                        <div className="text-xs text-muted-foreground">{request.requisitionNumber}</div>
                      </TableCell>
                      <TableCell>{request.requisitionType?.name || "Requisition"}</TableCell>
                      <TableCell>{formatModule(request.sourceModule)}</TableCell>
                      <TableCell>{formatAmount(request.amount, request.currency)}</TableCell>
                      <TableCell>{formatDate(request.neededByDate)}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(request.status)}>{formatStatus(request.status)}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" onClick={() => setSelectedRequest(request)}>
                          Review
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      No requisitions are currently waiting for your approval.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {isFinanceActor && financeTracker ? (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Awaiting release</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-semibold">{financeTracker.counts.unreleasedCount}</div>
                  <p className="text-sm text-muted-foreground">Approved requisitions not yet disbursed.</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Pending accountability</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-semibold">{financeTracker.counts.pendingCount}</div>
                  <p className="text-sm text-muted-foreground">Released requisitions awaiting accountability.</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Overdue</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-semibold">{financeTracker.counts.overdueCount}</div>
                  <p className="text-sm text-muted-foreground">Past the three-week accountability deadline.</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Completed accountability</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-semibold">{financeTracker.counts.completedCount}</div>
                  <p className="text-sm text-muted-foreground">Fully accounted requisitions.</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Release queue</CardTitle>
                <CardDescription>Approved requisitions waiting for finance to release funds.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Requester</TableHead>
                      <TableHead>Requisition</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Approved</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {financeTracker.unreleased.length ? (
                      financeTracker.unreleased.map((request) => (
                        <TableRow key={`release-${request.id}`}>
                          <TableCell>
                            {request.requester?.firstName} {request.requester?.lastName}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{request.title}</div>
                            <div className="text-xs text-muted-foreground">{request.requisitionNumber}</div>
                          </TableCell>
                          <TableCell>{formatAmount(request.amount, request.currency)}</TableCell>
                          <TableCell>{formatDate(request.approvedAt)}</TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" onClick={() => setSelectedRequest(request)}>
                              Open
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          No approved requisitions are waiting for release.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>

      <Dialog open={Boolean(selectedRequest)} onOpenChange={(open) => (!open ? resetReviewState() : null)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-5xl max-h-[92vh] grid-rows-[auto,minmax(0,1fr)] gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b px-6 pb-4 pt-6 pr-12">
            <DialogTitle>{selectedRequest?.title}</DialogTitle>
            <DialogDescription>
              {selectedRequest?.requisitionNumber} | {selectedRequest?.requisitionType?.name || "Requisition"}
            </DialogDescription>
          </DialogHeader>

          {selectedRequest ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                <div className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-lg border p-4">
                      <div className="text-sm font-medium">Requester</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {selectedRequest.requester?.firstName} {selectedRequest.requester?.lastName}
                      </div>
                    </div>
                    <div className="rounded-lg border p-4">
                      <div className="text-sm font-medium">Amount</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {formatAmount(selectedRequest.amount, selectedRequest.currency)}
                      </div>
                    </div>
                    <div className="rounded-lg border p-4">
                      <div className="text-sm font-medium">Source module</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {formatModule(selectedRequest.sourceModule)}
                      </div>
                    </div>
                    <div className="rounded-lg border p-4">
                      <div className="text-sm font-medium">Needed by</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {formatDate(selectedRequest.neededByDate)}
                      </div>
                    </div>
                    <div className="rounded-lg border p-4">
                      <div className="text-sm font-medium">Funds released</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {selectedRequest.releasedAt ? formatDate(selectedRequest.releasedAt) : "Awaiting release"}
                      </div>
                    </div>
                    <div className="rounded-lg border p-4">
                      <div className="text-sm font-medium">Accountability</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {selectedRequest.accountabilityStatus === "submitted"
                          ? `Completed on ${formatDate(selectedRequest.accountabilitySubmittedAt)}`
                          : selectedRequest.accountabilityDueAt
                            ? `Due ${formatDate(selectedRequest.accountabilityDueAt)}`
                            : "Not started"}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
                    <div className="space-y-4">
                      <div className="rounded-lg border p-4">
                        <div className="text-sm font-medium">Justification</div>
                        <div className="mt-2 text-sm text-muted-foreground">
                          {selectedRequest.justification || "No justification provided."}
                        </div>
                      </div>

                      {selectedRequest.amountBreakdown?.length ? (
                        <div className="rounded-lg border p-4">
                          <div className="text-sm font-medium">Amount breakdown</div>
                          <div className="mt-3 space-y-2">
                            {selectedRequest.amountBreakdown.map((item, index) => (
                              <div key={`${item.label}-${index}`} className="rounded-md border p-3 text-sm">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-medium">{item.label}</span>
                                  <span>{formatAmount(item.amount, selectedRequest.currency)}</span>
                                </div>
                                {item.notes ? <div className="mt-1 text-muted-foreground">{item.notes}</div> : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {selectedRequest.moduleData && Object.keys(selectedRequest.moduleData).length ? (
                        <div className="rounded-lg border p-4">
                          <div className="text-sm font-medium">Module-specific details</div>
                          <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            {Object.entries(selectedRequest.moduleData).map(([key, value]) => (
                              <div key={key} className="rounded-md border p-3">
                                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                                  {formatStage(key)}
                                </div>
                                <div className="mt-1 text-sm break-words">
                                  {typeof value === "boolean" ? (value ? "Yes" : "No") : String(value)}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {selectedRequest.status === "pending_finance_approval" && isFinanceActor ? (
                        <div className="rounded-lg border p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-medium">Finance adjustments</div>
                            <Button type="button" variant="outline" size="sm" onClick={addFinanceBreakdownItem}>
                              Add breakdown line
                            </Button>
                          </div>
                          <div className="mt-3 grid gap-3 md:grid-cols-2">
                            <Input
                              value={financeEdit.title}
                              onChange={(event) => handleFinanceEditChange("title", event.target.value)}
                              placeholder="Title"
                            />
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={financeEdit.amount}
                              onChange={(event) => handleFinanceEditChange("amount", event.target.value)}
                              placeholder="Amount"
                            />
                            <Input
                              value={financeEdit.currency}
                              onChange={(event) => handleFinanceEditChange("currency", event.target.value.toUpperCase())}
                              placeholder="Currency"
                            />
                            <Input
                              value={financeEdit.vendorName}
                              onChange={(event) => handleFinanceEditChange("vendorName", event.target.value)}
                              placeholder="Vendor / Payee"
                            />
                            <Input
                              type="date"
                              value={financeEdit.neededByDate}
                              onChange={(event) => handleFinanceEditChange("neededByDate", event.target.value)}
                            />
                            <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                              <input
                                type="checkbox"
                                checked={financeEdit.isClientRecoverable}
                                onChange={(event) => handleFinanceEditChange("isClientRecoverable", event.target.checked)}
                              />
                              <span>Client recoverable</span>
                            </label>
                          </div>
                          <div className="mt-3 space-y-3">
                            <Textarea
                              value={financeEdit.justification}
                              onChange={(event) => handleFinanceEditChange("justification", event.target.value)}
                              placeholder="Justification"
                            />
                            <Textarea
                              value={financeEdit.taxImpactNotes}
                              onChange={(event) => handleFinanceEditChange("taxImpactNotes", event.target.value)}
                              placeholder="Tax / finance notes"
                            />
                          </div>
                          {financeEdit.amountBreakdown.length ? (
                            <div className="mt-3 space-y-3">
                              {financeEdit.amountBreakdown.map((item, index) => (
                                <div key={`finance-breakdown-${index}`} className="grid gap-3 md:grid-cols-[1.2fr_0.8fr_1fr_auto]">
                                  <Input
                                    value={item.label}
                                    onChange={(event) => handleFinanceBreakdownChange(index, "label", event.target.value)}
                                    placeholder="Line item"
                                  />
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={String(item.amount || "")}
                                    onChange={(event) => handleFinanceBreakdownChange(index, "amount", event.target.value)}
                                    placeholder="0.00"
                                  />
                                  <Input
                                    value={item.notes || ""}
                                    onChange={(event) => handleFinanceBreakdownChange(index, "notes", event.target.value)}
                                    placeholder="Optional note"
                                  />
                                  <Button type="button" variant="ghost" size="sm" onClick={() => removeFinanceBreakdownItem(index)}>
                                    Remove
                                  </Button>
                                </div>
                              ))}
                              <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-sm">
                                <span>Breakdown total</span>
                                <span className="font-medium">{formatAmount(financeBreakdownTotal, financeEdit.currency || "KES")}</span>
                              </div>
                            </div>
                          ) : null}
                          <div className="mt-3 space-y-3">
                            <Textarea
                              value={reviewNotes}
                              onChange={(event) => setReviewNotes(event.target.value)}
                              placeholder="Optional note to include with the finance approval"
                            />
                            <Textarea
                              value={declineReason}
                              onChange={(event) => setDeclineReason(event.target.value)}
                              placeholder="Required only if finance declines the requisition"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-lg border p-4">
                          <div className="text-sm font-medium">Reviewer notes</div>
                          <div className="mt-3 space-y-3">
                            <Textarea
                              value={reviewNotes}
                              onChange={(event) => setReviewNotes(event.target.value)}
                              placeholder="Optional note for the next approver or requester"
                              className="min-h-[104px]"
                            />
                            <Textarea
                              value={declineReason}
                              onChange={(event) => setDeclineReason(event.target.value)}
                              placeholder="Required only if you decline the requisition"
                              className="min-h-[96px]"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-4">
                      <div className="rounded-lg border p-4">
                        <div className="text-sm font-medium">Approval steps</div>
                        <div className="mt-3 space-y-3">
                          {(selectedRequest.approvalSteps || []).length ? (
                            selectedRequest.approvalSteps?.map((step) => (
                              <div key={step.id} className="rounded-md border p-3 text-sm">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-medium">{formatStage(step.stageType)}</span>
                                  <Badge variant="outline">{formatStage(step.decision)}</Badge>
                                </div>
                                <div className="mt-1 text-muted-foreground">
                                  {step.approver
                                    ? `${step.approver.firstName} ${step.approver.lastName}`
                                    : `Profile #${step.approverProfileId}`}
                                </div>
                                {step.notes ? <div className="mt-2 text-muted-foreground">{step.notes}</div> : null}
                              </div>
                            ))
                          ) : (
                            <p className="text-sm text-muted-foreground">No approval steps captured.</p>
                          )}
                        </div>
                      </div>

                      <div className="rounded-lg border p-4">
                        <div className="text-sm font-medium">Support on file</div>
                        <div className="mt-2 text-sm text-muted-foreground">
                          Attachments: {selectedRequest.attachmentCount || 0}
                        </div>
                        <div className="mt-2 text-sm text-muted-foreground">
                          Client recoverable: {selectedRequest.isClientRecoverable ? "Yes" : "No"}
                        </div>
                      </div>

                      {selectedRequest.status === "approved" && !selectedRequest.releasedAt && isFinanceActor ? (
                        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                          <div className="text-sm font-medium">Release funds</div>
                          <div className="mt-1 text-sm text-muted-foreground">
                            Once released, accountability will be due in three weeks.
                          </div>
                          <div className="mt-3 space-y-3">
                            <Textarea
                              value={releaseNotes}
                              onChange={(event) => setReleaseNotes(event.target.value)}
                              placeholder="Optional release notes"
                            />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap justify-end gap-3 border-t bg-background px-6 py-4">
                {selectedRequest.status === "approved" && !selectedRequest.releasedAt && isFinanceActor ? (
                  <Button onClick={handleReleaseFunds} disabled={isSaving}>
                    {isSaving ? "Saving..." : "Release funds"}
                  </Button>
                ) : (
                  <>
                    <Button variant="outline" onClick={handleDecline} disabled={isSaving}>
                      {isSaving ? "Saving..." : "Decline"}
                    </Button>
                    {selectedRequest.status === "pending_finance_approval" && isFinanceActor ? (
                      <Button variant="outline" onClick={handleFinanceSave} disabled={isSaving}>
                        {isSaving ? "Saving..." : "Save finance edits"}
                      </Button>
                    ) : null}
                    <Button onClick={handleApprove} disabled={isSaving}>
                      {isSaving ? "Saving..." : approvalActionLabel(selectedRequest?.status)}
                    </Button>
                  </>
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
