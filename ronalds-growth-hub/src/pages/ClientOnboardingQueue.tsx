import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { clientOnboardingsAPI, clientsAPI } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, ClipboardCheck, FileText } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/use-toast";

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
                        {item.engagementLetter?.status === "pending_review" && canReview ? (
                          <div className="flex flex-col gap-2">
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
                          </div>
                        ) : item.status === "pending_hr_review" && canReview ? (
                          <div className="flex flex-col gap-2">
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
                          </div>
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
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
