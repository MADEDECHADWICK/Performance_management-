import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { proposalsAPI, clientsAPI } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Plus, Target, TrendingUp, DollarSign, Zap } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  won: "Won",
  lost: "Lost",
};

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "secondary",
  sent: "outline",
  won: "default",
  lost: "destructive",
};

const SERVICE_TYPES = [
  "Audit",
  "Tax Advisory",
  "Financial Consulting",
  "Due Diligence",
  "Risk Assessment",
  "Advisory",
];

export default function BusinessDevelopment() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [lostReasonDrafts, setLostReasonDrafts] = useState<Record<number, string>>({});
  const [lostReasonEditingId, setLostReasonEditingId] = useState<number | null>(null);

  const [proposalForm, setProposalForm] = useState({
    clientId: "",
    proposalTitle: "",
    serviceType: "",
    proposedFee: "",
    proposalDate: "",
    expectedStart: "",
    probability: "50",
    status: "sent",
  });

  const { data: metrics } = useQuery({
    queryKey: ["proposal-metrics"],
    queryFn: () => proposalsAPI.metrics(),
  });

  const { data: proposalsData, isLoading } = useQuery({
    queryKey: ["proposals", searchTerm, filterStatus],
    queryFn: () =>
      proposalsAPI.list({
        page: 1,
        pageSize: 100,
        search: searchTerm || undefined,
        status: filterStatus === "all" ? undefined : filterStatus,
      }),
  });

  const { data: clientsData } = useQuery({
    queryKey: ["clients", "pipeline"],
    queryFn: () => clientsAPI.list({ page: 1, pageSize: 200 }),
  });

  const proposals = proposalsData?.data || [];
  const clients = clientsData?.data || [];

  const createMutation = useMutation({
    mutationFn: () =>
      proposalsAPI.create({
        clientId: Number(proposalForm.clientId),
        proposalTitle: proposalForm.proposalTitle,
        serviceType: proposalForm.serviceType,
        proposedFee: Number(proposalForm.proposedFee),
        proposalDate: proposalForm.proposalDate,
        expectedStart: proposalForm.expectedStart || undefined,
        probability: Number(proposalForm.probability),
        status: proposalForm.status,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["proposals"] });
      queryClient.invalidateQueries({ queryKey: ["proposal-metrics"] });
      toast({ title: "Proposal created", description: "Pipeline updated successfully." });
      setDialogOpen(false);
      setProposalForm({
        clientId: "",
        proposalTitle: "",
        serviceType: "",
        proposedFee: "",
        proposalDate: "",
        expectedStart: "",
        probability: "50",
        status: "sent",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create proposal",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status, lostReason }: { id: number; status: string; lostReason?: string }) =>
      proposalsAPI.update(id, { status, lostReason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["proposals"] });
      queryClient.invalidateQueries({ queryKey: ["proposal-metrics"] });
      toast({ title: "Proposal updated", description: "Pipeline status refreshed." });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update proposal",
        variant: "destructive",
      });
    },
  });

  const pipelineValue = metrics?.pipelineValue || 0;
  const conversionRate = metrics?.conversionRate || 0;
  const avgDealSize = metrics?.avgDealSize || 0;
  const hotLeads = metrics?.hotLeads || 0;

  const filteredProposals = useMemo(() => proposals, [proposals]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-3xl font-bold text-foreground">Business Development</h2>
            <p className="text-muted-foreground">Track proposals and pipeline performance.</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Proposal
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create Proposal</DialogTitle>
                <DialogDescription>Log a new business development opportunity.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Client</Label>
                    <Select
                      value={proposalForm.clientId}
                      onValueChange={(value) =>
                        setProposalForm((prev) => ({ ...prev, clientId: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select client" />
                      </SelectTrigger>
                      <SelectContent>
                        {clients.map((client) => (
                          <SelectItem key={client.id} value={String(client.id)}>
                            {client.clientName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Proposal Title</Label>
                    <Input
                      value={proposalForm.proposalTitle}
                      onChange={(event) =>
                        setProposalForm((prev) => ({ ...prev, proposalTitle: event.target.value }))
                      }
                      placeholder="Annual Audit 2026"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Service Type</Label>
                    <Select
                      value={proposalForm.serviceType}
                      onValueChange={(value) =>
                        setProposalForm((prev) => ({ ...prev, serviceType: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select service" />
                      </SelectTrigger>
                      <SelectContent>
                        {SERVICE_TYPES.map((service) => (
                          <SelectItem key={service} value={service}>
                            {service}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Proposed Fee (KES)</Label>
                    <Input
                      type="number"
                      value={proposalForm.proposedFee}
                      onChange={(event) =>
                        setProposalForm((prev) => ({ ...prev, proposedFee: event.target.value }))
                      }
                      placeholder="100000"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Proposal Date</Label>
                    <Input
                      type="date"
                      value={proposalForm.proposalDate}
                      onChange={(event) =>
                        setProposalForm((prev) => ({ ...prev, proposalDate: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Expected Start</Label>
                    <Input
                      type="date"
                      value={proposalForm.expectedStart}
                      onChange={(event) =>
                        setProposalForm((prev) => ({ ...prev, expectedStart: event.target.value }))
                      }
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Probability (%)</Label>
                    <Input
                      type="number"
                      value={proposalForm.probability}
                      onChange={(event) =>
                        setProposalForm((prev) => ({ ...prev, probability: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select
                      value={proposalForm.status}
                      onValueChange={(value) =>
                        setProposalForm((prev) => ({ ...prev, status: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="sent">Sent</SelectItem>
                        <SelectItem value="won">Won</SelectItem>
                        <SelectItem value="lost">Lost</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
                    {createMutation.isPending ? "Saving..." : "Create Proposal"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pipeline Value</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">KES {(pipelineValue / 1000000).toFixed(2)}M</div>
              <p className="text-xs text-muted-foreground">Open proposals</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{conversionRate.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground">Won vs lost</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Deal Size</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">KES {(avgDealSize / 1000).toFixed(0)}K</div>
              <p className="text-xs text-muted-foreground">Average proposal</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Hot Leads</CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{hotLeads}</div>
              <p className="text-xs text-muted-foreground">70%+ probability</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Pipeline</CardTitle>
            <CardDescription>Proposals awaiting conversion to jobs.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search proposals or clients..."
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
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="won">Won</SelectItem>
                  <SelectItem value="lost">Lost</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <div className="py-10 text-center text-muted-foreground">Loading proposals...</div>
            ) : filteredProposals.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground">No proposals found.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Proposal</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead className="text-right">Probability</TableHead>
                    <TableHead>Proposal Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProposals.map((proposal: any) => (
                    <TableRow key={proposal.id}>
                      <TableCell>
                        <div className="font-medium">{proposal.client?.clientName}</div>
                        <div className="text-xs text-muted-foreground">{proposal.client?.industry || ""}</div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{proposal.proposalTitle}</div>
                        <div className="text-xs text-muted-foreground">{proposal.serviceType}</div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-2">
                          <Badge variant={STATUS_VARIANTS[proposal.status] || "outline"}>
                            {STATUS_LABELS[proposal.status] || proposal.status}
                          </Badge>
                        <Select
                          value={proposal.status}
                          onValueChange={(value) => {
                            if (value === proposal.status) return;
                            if (value === "lost") {
                              updateMutation.mutate({ id: proposal.id, status: value });
                              setLostReasonEditingId(proposal.id);
                              setLostReasonDrafts((prev) => ({
                                ...prev,
                                [proposal.id]: proposal.lostReason || "",
                              }));
                            } else {
                              updateMutation.mutate({ id: proposal.id, status: value });
                            }
                          }}
                        >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="draft">Draft</SelectItem>
                              <SelectItem value="sent">Sent</SelectItem>
                              <SelectItem value="won">Won</SelectItem>
                              <SelectItem value="lost">Lost</SelectItem>
                            </SelectContent>
                          </Select>
                          {proposal.status === "won" && (
                            <Link
                              to="/client-onboarding-queue"
                              className="text-xs text-primary hover:underline text-left"
                            >
                              View onboarding queue
                            </Link>
                          )}
                          {proposal.status === "lost" && (
                            <div className="space-y-2">
                              {lostReasonEditingId === proposal.id ? (
                                <>
                                  <Input
                                    value={lostReasonDrafts[proposal.id] || ""}
                                    onChange={(event) =>
                                      setLostReasonDrafts((prev) => ({
                                        ...prev,
                                        [proposal.id]: event.target.value,
                                      }))
                                    }
                                    placeholder="Reason for loss"
                                  />
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      onClick={() => {
                                        updateMutation.mutate({
                                          id: proposal.id,
                                          status: "lost",
                                          lostReason: lostReasonDrafts[proposal.id] || undefined,
                                        });
                                        setLostReasonEditingId(null);
                                      }}
                                    >
                                      Save
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        setLostReasonEditingId(null);
                                        setLostReasonDrafts((prev) => ({
                                          ...prev,
                                          [proposal.id]: proposal.lostReason || "",
                                        }));
                                      }}
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                </>
                              ) : proposal.lostReason ? (
                                <div className="flex items-center justify-between text-xs text-muted-foreground">
                                  <span>Reason: {proposal.lostReason}</span>
                                  <button
                                    type="button"
                                    className="text-primary hover:underline"
                                    onClick={() => {
                                      setLostReasonEditingId(proposal.id);
                                      setLostReasonDrafts((prev) => ({
                                        ...prev,
                                        [proposal.id]: proposal.lostReason || "",
                                      }));
                                    }}
                                  >
                                    Edit
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  className="text-xs text-primary hover:underline text-left"
                                  onClick={() => {
                                    setLostReasonEditingId(proposal.id);
                                    setLostReasonDrafts((prev) => ({
                                      ...prev,
                                      [proposal.id]: "",
                                    }));
                                  }}
                                >
                                  Add loss reason
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">KES {Number(proposal.proposedFee).toLocaleString()}</TableCell>
                      <TableCell className="text-right">{proposal.probability}%</TableCell>
                      <TableCell>
                        {proposal.proposalDate ? new Date(proposal.proposalDate).toLocaleDateString() : "-"}
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
