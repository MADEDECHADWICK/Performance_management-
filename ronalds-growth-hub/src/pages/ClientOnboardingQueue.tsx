import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { clientOnboardingsAPI, clientsAPI } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Search, ClipboardCheck, FileText, Upload, CheckCircle2, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import documentsAPI from "@/lib/api/documents";
import type {
  ClientOnboardingChecklist,
  ClientOnboardingChecklistItem,
} from "@/lib/api/clientOnboardings";

const STATUS_LABELS: Record<string, string> = {
  pending_hr_review: "Pending HR Review",
  approved: "Approved",
  rejected: "Rejected",
  client_created: "Client Created",
  job_created: "Job Created",
};

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending_hr_review: "secondary",
  approved: "default",
  rejected: "destructive",
  client_created: "outline",
  job_created: "outline",
};

const LETTER_STATUS_LABELS: Record<string, string> = {
  uploaded: "Uploaded",
  pending_review: "Pending Letter Review",
  approved: "Letter Approved",
  rejected: "Letter Rejected",
};

const LETTER_STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  uploaded: "outline",
  pending_review: "secondary",
  approved: "default",
  rejected: "destructive",
};

export default function ClientOnboardingQueue() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [checklistDialogOpen, setChecklistDialogOpen] = useState(false);
  const [activeOnboarding, setActiveOnboarding] = useState<any | null>(null);
  const [checklistLoading, setChecklistLoading] = useState(false);
  const [checklistSaving, setChecklistSaving] = useState(false);
  const [checklistBusyItemId, setChecklistBusyItemId] = useState<number | null>(null);
  const [checklistUploadBusyItemId, setChecklistUploadBusyItemId] = useState<number | null>(null);
  const [clientChecklist, setClientChecklist] = useState<ClientOnboardingChecklist | null>(null);
  const [checklistName, setChecklistName] = useState("");
  const [checklistDueDate, setChecklistDueDate] = useState("");
  const [checklistItemsText, setChecklistItemsText] = useState(
    "Collect signed engagement letter [doc]\nComplete KYC verification [doc]\nConfirm tax registration details\nSet client communication protocol\nApprove onboarding readiness"
  );
  const { isHR, isAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canReview = isHR || isAdmin;
  const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:4000";

  const resolveDocumentUrl = (filePath?: string | null) => {
    if (!filePath) return null;
    if (filePath.startsWith("http://") || filePath.startsWith("https://")) {
      return filePath;
    }
    return `${baseUrl}${filePath}`;
  };

  const { data: onboardingsData, isLoading } = useQuery({
    queryKey: ["client-onboardings", filterStatus],
    queryFn: () =>
      clientOnboardingsAPI.list({
        page: 1,
        pageSize: 200,
        status: filterStatus === "all" ? undefined : filterStatus,
      }),
  });

  const onboardings = useMemo(() => onboardingsData?.data ?? [], [onboardingsData]);

  const summary = useMemo(() => {
    return onboardings.reduce(
      (acc: any, item: any) => {
        acc.total += 1;
        acc[item.status] = (acc[item.status] || 0) + 1;
        return acc;
      },
      { total: 0, pending_hr_review: 0, approved: 0, rejected: 0 }
    );
  }, [onboardings]);

  const filtered = useMemo(() => {
    if (!searchTerm) return onboardings;
    const term = searchTerm.toLowerCase();
    return onboardings.filter((item: any) =>
      [item.clientName, item.contactPerson, item.contactEmail]
        .filter(Boolean)
        .some((value: string) => value.toLowerCase().includes(term))
    );
  }, [onboardings, searchTerm]);

  const handleReview = async (item: any, decision: "approve" | "reject") => {
    try {
      if (decision === "reject") {
        const reason = window.prompt("Reason for rejection (optional):") || undefined;
        await clientOnboardingsAPI.reject(item.id, reason);
      } else {
        await clientOnboardingsAPI.approve(item.id);
      }
      await queryClient.invalidateQueries({ queryKey: ["client-onboardings"] });
      toast({
        title: "Onboarding updated",
        description:
          decision === "approve"
            ? "Onboarding approved and ready for job creation."
            : "Onboarding rejected.",
      });
    } catch (error: any) {
      toast({
        title: "Update failed",
        description: error?.message || "Unable to update onboarding.",
        variant: "destructive",
      });
    }
  };

  const handleLetterReview = async (item: any, decision: "approve" | "reject") => {
    try {
      const letterId = item.engagementLetter?.id;
      if (!letterId) {
        throw new Error("Engagement letter not found on this onboarding record.");
      }
      if (decision === "reject") {
        const reason = window.prompt("Reason for rejection (optional):") || undefined;
        await clientsAPI.rejectEngagementLetter(letterId, reason);
      } else {
        await clientsAPI.approveEngagementLetter(letterId);
      }
      await queryClient.invalidateQueries({ queryKey: ["client-onboardings"] });
      toast({
        title: "Engagement letter updated",
        description:
          decision === "approve"
            ? "Engagement letter approved."
            : "Engagement letter rejected.",
      });
    } catch (error: any) {
      toast({
        title: "Update failed",
        description: error?.message || "Unable to update engagement letter.",
        variant: "destructive",
      });
    }
  };

  const loadChecklist = async (onboardingId: number) => {
    try {
      setChecklistLoading(true);
      const checklist = await clientOnboardingsAPI.getChecklist(onboardingId);
      setClientChecklist(checklist);
      if (checklist) {
        setChecklistName(checklist.checklistName || "");
        setChecklistDueDate(
          checklist.dueDate ? new Date(checklist.dueDate).toISOString().split("T")[0] : ""
        );
      }
    } catch (error: any) {
      toast({
        title: "Unable to load checklist",
        description: error?.message || "Failed to load client onboarding checklist.",
        variant: "destructive",
      });
      setClientChecklist(null);
    } finally {
      setChecklistLoading(false);
    }
  };

  const openChecklistDialog = async (item: any) => {
    setActiveOnboarding(item);
    setChecklistDialogOpen(true);
    setChecklistName(`Client Onboarding Checklist - ${item.clientName}`);
    setChecklistDueDate("");
    setChecklistItemsText(
      "Collect signed engagement letter [doc]\nComplete KYC verification [doc]\nConfirm tax registration details\nSet client communication protocol\nApprove onboarding readiness"
    );
    await loadChecklist(item.id);
  };

  const createOrUpdateChecklist = async () => {
    if (!activeOnboarding?.id) return;
    const items = checklistItemsText
      .split("\n")
      .map((row) => row.trim())
      .filter(Boolean)
      .map((row, index) => {
        const requiresDocument = /\[doc\]/i.test(row);
        const itemName = row.replace(/\[doc\]/gi, "").trim();
        return {
          itemName,
          orderIndex: index,
          requiresDocument,
        };
      })
      .filter((item) => item.itemName.length > 0);

    if (items.length === 0) {
      toast({
        title: "Checklist items required",
        description: "Add at least one checklist item before saving.",
        variant: "destructive",
      });
      return;
    }

    try {
      setChecklistSaving(true);
      const checklist = await clientOnboardingsAPI.upsertChecklist(activeOnboarding.id, {
        checklistName: checklistName.trim() || undefined,
        dueDate: checklistDueDate || undefined,
        items,
      });
      setClientChecklist(checklist);
      await queryClient.invalidateQueries({ queryKey: ["client-onboardings"] });
      toast({
        title: "Checklist saved",
        description: "Client onboarding checklist has been assigned.",
      });
    } catch (error: any) {
      toast({
        title: "Unable to save checklist",
        description: error?.message || "Failed to create checklist.",
        variant: "destructive",
      });
    } finally {
      setChecklistSaving(false);
    }
  };

  const completeChecklistItem = async (item: ClientOnboardingChecklistItem) => {
    if (!activeOnboarding?.id) return;
    try {
      setChecklistBusyItemId(item.id);
      const updated = await clientOnboardingsAPI.completeChecklistItem(activeOnboarding.id, item.id);
      setClientChecklist(updated);
      await queryClient.invalidateQueries({ queryKey: ["client-onboardings"] });
      toast({
        title: "Checklist updated",
        description: "Item marked as complete.",
      });
    } catch (error: any) {
      toast({
        title: "Unable to complete item",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setChecklistBusyItemId(null);
    }
  };

  const attachChecklistDocument = async (item: ClientOnboardingChecklistItem, file: File) => {
    if (!activeOnboarding?.id || !clientChecklist?.id) return;
    try {
      setChecklistUploadBusyItemId(item.id);
      const upload = await documentsAPI.uploadFile(file, {
        documentType: "onboarding_checklist",
        entityType: "ClientOnboardingChecklist",
        entityId: clientChecklist.id,
        accessLevel: "hr",
        isRequired: true,
        description: `Client onboarding checklist evidence`,
      });

      const documentId = (upload as any)?.id ?? (upload as any)?.data?.id;
      if (!documentId) {
        throw new Error("Upload succeeded but document id was missing.");
      }

      const updated = await clientOnboardingsAPI.attachChecklistItemDocument(
        activeOnboarding.id,
        item.id,
        documentId
      );
      setClientChecklist(updated);
      toast({
        title: "Document attached",
        description: "Checklist document uploaded successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error?.message || "Unable to attach checklist document.",
        variant: "destructive",
      });
    } finally {
      setChecklistUploadBusyItemId(null);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold text-foreground">Client Onboarding Queue</h2>
          <p className="text-muted-foreground">Track marketing submissions awaiting HR actions.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
              <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.total}</div>
              <p className="text-xs text-muted-foreground">All onboarding submissions</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Pending HR Review</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{summary.pending_hr_review || 0}</div>
              <p className="text-xs text-muted-foreground">Awaiting HR decision</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Approved</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-600">{summary.approved || 0}</div>
              <p className="text-xs text-muted-foreground">Ready for job creation</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Rejected</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{summary.rejected || 0}</div>
              <p className="text-xs text-muted-foreground">Requires resubmission</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Onboarding Requests</CardTitle>
            <CardDescription>Marketing submissions and current HR status.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by client or contact..."
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending_hr_review">Pending HR Review</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="client_created">Client Created</SelectItem>
                  <SelectItem value="job_created">Job Created</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <div className="py-10 text-center text-muted-foreground">Loading onboarding queue...</div>
            ) : filtered.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground">No onboarding requests found.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Engagement</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Assigned HR</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((item: any) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="font-medium">
                          {item.clientId ? (
                            <Link to={`/clients/${item.clientId}`} className="hover:underline">
                              {item.clientName}
                            </Link>
                          ) : (
                            item.clientName
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {item.contactPerson} - {item.contactEmail}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">
                          {item.engagementLetter?.jobTitle || item.engagementLetter?.engagementType || "Engagement"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {item.engagementLetter?.engagementType || ""}
                        </div>
                        {item.engagementLetter?.status && (
                          <div className="mt-2">
                            <Badge variant={LETTER_STATUS_VARIANTS[item.engagementLetter.status] || "outline"}>
                              {LETTER_STATUS_LABELS[item.engagementLetter.status] || item.engagementLetter.status}
                            </Badge>
                          </div>
                        )}
                        {item.engagementLetter?.document?.filePath ? (
                          <div className="mt-2">
                            <a
                              href={resolveDocumentUrl(item.engagementLetter.document.filePath)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                            >
                              <FileText className="h-3 w-3" />
                              View engagement letter
                            </a>
                          </div>
                        ) : (
                          <div className="mt-2 text-xs text-muted-foreground">
                            No engagement letter file uploaded
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANTS[item.status] || "outline"}>
                          {STATUS_LABELS[item.status] || item.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "N/A"}
                      </TableCell>
                      <TableCell>
                        {item.hrReviewer
                          ? `${item.hrReviewer.firstName} ${item.hrReviewer.lastName}`
                          : "N/A"}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-2">
                          {item.engagementLetter?.status === "pending_review" && canReview ? (
                            <>
                              <Button size="sm" onClick={() => handleLetterReview(item, "approve")}>
                                Approve Letter
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleLetterReview(item, "reject")}
                              >
                                Reject Letter
                              </Button>
                            </>
                          ) : item.status === "pending_hr_review" && canReview ? (
                            <>
                              <Button size="sm" onClick={() => handleReview(item, "approve")}>
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleReview(item, "reject")}
                              >
                                Reject
                              </Button>
                            </>
                          ) : ["approved", "client_created"].includes(item.status) &&
                            item.engagementLetter?.status === "approved" &&
                            !item.jobId ? (
                            <Button asChild size="sm">
                              <Link to={`/admin-job-creation?onboardingId=${item.id}`}>
                                Create Job
                              </Link>
                            </Button>
                          ) : (
                            <Badge variant="outline">
                              {item.jobId
                                ? "Job created"
                                : item.engagementLetter?.status &&
                                  item.engagementLetter.status !== "approved"
                                ? "Letter pending"
                                : "Not ready"}
                            </Badge>
                          )}

                          {canReview && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openChecklistDialog(item)}
                              >
                                Manage Checklist
                              </Button>
                              {item.checklist ? (
                                <Badge variant="secondary" className="w-fit">
                                  Checklist {item.checklist.status?.replace("_", " ")}
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="w-fit">
                                  No checklist
                                </Badge>
                              )}
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog
          open={checklistDialogOpen}
          onOpenChange={(open) => {
            setChecklistDialogOpen(open);
            if (!open) {
              setActiveOnboarding(null);
              setClientChecklist(null);
            }
          }}
        >
          <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Client Onboarding Checklist</DialogTitle>
              <DialogDescription>
                {activeOnboarding
                  ? `Manage onboarding checklist for ${activeOnboarding.clientName}`
                  : "Select onboarding record"}
              </DialogDescription>
            </DialogHeader>

            {checklistLoading ? (
              <div className="py-8 text-sm text-muted-foreground">Loading checklist...</div>
            ) : !clientChecklist ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-dashed border-border p-4">
                  <p className="text-sm text-muted-foreground">
                    No checklist assigned yet. Create one using the same onboarding format used for employees.
                  </p>
                </div>
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <Label>Checklist Name</Label>
                    <Input
                      value={checklistName}
                      onChange={(event) => setChecklistName(event.target.value)}
                      placeholder="Client Onboarding Checklist - ACME Ltd"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Due Date</Label>
                    <Input
                      type="date"
                      value={checklistDueDate}
                      onChange={(event) => setChecklistDueDate(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Checklist Items</Label>
                    <Textarea
                      rows={7}
                      value={checklistItemsText}
                      onChange={(event) => setChecklistItemsText(event.target.value)}
                      placeholder={"One item per line. Add [doc] to require evidence upload."}
                    />
                    <p className="text-xs text-muted-foreground">
                      Example: <span className="font-mono">Collect signed engagement letter [doc]</span>
                    </p>
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={createOrUpdateChecklist} disabled={checklistSaving || !canReview}>
                      {checklistSaving ? "Saving..." : "Create Checklist"}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-xl">Onboarding Checklist</CardTitle>
                    <CardDescription>Client onboarding induction checklist items</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <div className="font-medium">{clientChecklist.checklistName}</div>
                        <Badge variant="secondary">
                          {(clientChecklist.status || "pending").replace("_", " ")}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Completion: {Math.round(Number(clientChecklist.completionPercent || 0))}%
                      </div>
                    </div>

                    <div className="space-y-3">
                      {(clientChecklist.items || []).map((item) => {
                        const filePath = item.document?.filePath;
                        return (
                          <div
                            key={item.id}
                            className="flex items-center justify-between rounded-lg border border-border p-3"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{item.itemName}</span>
                                {item.requiresDocument && (
                                  <Badge variant="outline" className="text-xs">
                                    Document required
                                  </Badge>
                                )}
                              </div>
                              {item.description && (
                                <p className="text-xs text-muted-foreground">{item.description}</p>
                              )}
                              {item.documentId && filePath && (
                                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                  <FileText className="h-4 w-4 text-emerald-500" />
                                  <Button variant="link" className="h-auto p-0 text-xs" asChild>
                                    <a href={resolveDocumentUrl(filePath) || undefined} target="_blank" rel="noreferrer">
                                      Preview
                                    </a>
                                  </Button>
                                  <Button variant="link" className="h-auto p-0 text-xs" asChild>
                                    <a href={resolveDocumentUrl(filePath) || undefined} download>
                                      Download
                                    </a>
                                  </Button>
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              {!item.isCompleted && item.requiresDocument && !item.documentId && (
                                <label className="inline-flex items-center">
                                  <input
                                    type="file"
                                    accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                                    className="hidden"
                                    onChange={(event) => {
                                      const file = event.target.files?.[0];
                                      if (file) {
                                        attachChecklistDocument(item, file);
                                      }
                                      event.currentTarget.value = "";
                                    }}
                                  />
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    asChild
                                    disabled={checklistUploadBusyItemId === item.id}
                                  >
                                    <span>
                                      <Upload className="mr-2 h-4 w-4" />
                                      {checklistUploadBusyItemId === item.id ? "Uploading..." : "Upload"}
                                    </span>
                                  </Button>
                                </label>
                              )}
                              {item.isCompleted ? (
                                <div className="flex items-center gap-2 text-emerald-600">
                                  <CheckCircle2 className="h-4 w-4" />
                                  <span className="text-xs">Completed</span>
                                </div>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => completeChecklistItem(item)}
                                  disabled={
                                    checklistBusyItemId === item.id ||
                                    (item.requiresDocument && !item.documentId)
                                  }
                                >
                                  {checklistBusyItemId === item.id ? (
                                    <>
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                      Completing...
                                    </>
                                  ) : (
                                    "Mark complete"
                                  )}
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                {canReview && (
                  <div className="rounded-lg border border-dashed border-border p-4 space-y-3">
                    <div className="text-sm font-medium">Update checklist template</div>
                    <Textarea
                      rows={6}
                      value={checklistItemsText}
                      onChange={(event) => setChecklistItemsText(event.target.value)}
                      placeholder={"One item per line. Add [doc] to require evidence upload."}
                    />
                    <div className="flex justify-end">
                      <Button variant="outline" onClick={createOrUpdateChecklist} disabled={checklistSaving}>
                        {checklistSaving ? "Updating..." : "Replace Checklist Items"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
