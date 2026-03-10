import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import DocumentPreviewDialog from "@/components/DocumentPreviewDialog";
import { engagementLettersAPI } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FileText, Search } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  uploaded: "Uploaded",
  pending_review: "Pending Review",
  approved: "Approved",
  rejected: "Rejected",
};

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  uploaded: "outline",
  pending_review: "secondary",
  approved: "default",
  rejected: "destructive",
};

export default function EngagementLetters() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [previewLetter, setPreviewLetter] = useState<{
    title: string;
    filePath?: string | null;
    fileName?: string | null;
    mimeType?: string | null;
    description?: string;
  } | null>(null);
  const formatDate = (value?: string | Date | null) =>
    value ? new Date(value).toLocaleDateString() : "N/A";

  const { data: lettersData, isLoading } = useQuery({
    queryKey: ["engagement-letters", searchTerm, filterStatus],
    queryFn: () =>
      engagementLettersAPI.list({
        page: 1,
        pageSize: 200,
        status: filterStatus === "all" ? undefined : filterStatus,
        search: searchTerm || undefined,
      }),
  });

  const letters = useMemo(() => lettersData?.data ?? [], [lettersData]);

  const summary = useMemo(() => {
    return letters.reduce(
      (acc: any, letter: any) => {
        acc.total += 1;
        acc[letter.status] = (acc[letter.status] || 0) + 1;
        return acc;
      },
      { total: 0, pending_review: 0, approved: 0, rejected: 0 }
    );
  }, [letters]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-3xl font-bold text-foreground">Engagement Letters</h2>
            <p className="text-muted-foreground">Manage engagement letters across all clients.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Letters</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.total}</div>
              <p className="text-xs text-muted-foreground">All clients</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{summary.pending_review || 0}</div>
              <p className="text-xs text-muted-foreground">Awaiting HR action</p>
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
              <p className="text-xs text-muted-foreground">Needs revision</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All Engagement Letters</CardTitle>
            <CardDescription>Search and track engagement status by client.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by client or engagement..."
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="uploaded">Uploaded</SelectItem>
                  <SelectItem value="pending_review">Pending Review</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <div className="py-10 text-center text-muted-foreground">Loading engagement letters...</div>
            ) : letters.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground">No engagement letters found.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Engagement</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Fee</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead className="text-right">File</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {letters.map((letter: any) => (
                    <TableRow key={letter.id}>
                      <TableCell>
                        <div className="font-medium">
                          <Link to={`/clients/${letter.client?.id}`} className="hover:underline">
                            {letter.client?.clientName || "Client"}
                          </Link>
                        </div>
                        <div className="text-xs text-muted-foreground">{letter.client?.industry || ""}</div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{letter.jobTitle || letter.engagementType}</div>
                        <div className="text-xs text-muted-foreground">{letter.engagementType}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANTS[letter.status] || "outline"}>
                          {STATUS_LABELS[letter.status] || letter.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {letter.feeAmount ? `KES ${Number(letter.feeAmount).toLocaleString()}` : "N/A"}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {letter.startDate || letter.endDate
                            ? `${formatDate(letter.startDate)} to ${formatDate(letter.endDate)}`
                            : "N/A"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{formatDate(letter.createdAt)}</div>
                        <div className="text-xs text-muted-foreground">
                          {letter.uploadedBy ? `${letter.uploadedBy.firstName} ${letter.uploadedBy.lastName}` : "N/A"}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {letter.document?.filePath ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setPreviewLetter({
                                title: letter.jobTitle || letter.engagementType || "Engagement Letter",
                                filePath: letter.document.filePath,
                                fileName: letter.document.fileName,
                                mimeType: letter.document.mimeType,
                                description: `Preview the engagement letter for ${letter.client?.clientName || "this client"}.`,
                              })
                            }
                          >
                            Preview
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">N/A</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <DocumentPreviewDialog
          open={!!previewLetter}
          onOpenChange={(open) => {
            if (!open) {
              setPreviewLetter(null);
            }
          }}
          title={previewLetter?.title || "Engagement Letter"}
          filePath={previewLetter?.filePath}
          fileName={previewLetter?.fileName}
          mimeType={previewLetter?.mimeType}
          description={previewLetter?.description}
        />
      </div>
    </DashboardLayout>
  );
}
