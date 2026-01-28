import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { clientOnboardingsAPI } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, ClipboardCheck } from "lucide-react";

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

export default function ClientOnboardingQueue() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const { data: onboardingsData, isLoading } = useQuery({
    queryKey: ["client-onboardings", filterStatus],
    queryFn: () =>
      clientOnboardingsAPI.list({
        page: 1,
        pageSize: 200,
        status: filterStatus === "all" ? undefined : filterStatus,
      }),
  });

  const onboardings = onboardingsData?.data || [];

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
                        {["approved", "client_created"].includes(item.status) && !item.jobId ? (
                          <Button asChild size="sm">
                            <Link to={`/admin-job-creation?onboardingId=${item.id}`}>
                              Create Job
                            </Link>
                          </Button>
                        ) : (
                          <Badge variant="outline">
                            {item.jobId ? "Job created" : "Not ready"}
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
