import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";


type ClientBalance = {
  clientId: number;
  clientName: string;
  totalFee: number;
  totalCollected: number;
  balance: number;
  jobsCount: number;
};

type JobBalance = {
  jobId: number;
  jobCode: string | null;
  jobName: string;
  clientName: string;
  fee: number;
  collected: number;
  balance: number;
  status: string;
  collectionStage: string;
  readyForCollectionAt?: string | null;
  receivableOwnerProfileId?: number | null;
  receivableOwnerName?: string | null;
  receivableOwnerPosition?: string | null;
  daysOutstanding?: number;
  agingBucket?: string;
  lastFollowUpAt?: string | null;
  nextFollowUpDate?: string | null;
  expectedFollowUpDate?: string | null;
  lastFollowUpActionType?: string | null;
  followUpResolved?: boolean;
  slaStatus?: "ok" | "due_soon" | "breached";
  slaBreached?: boolean;
  slaDueSoon?: boolean;
  slaBreachDays?: number;
};

type ReceivableOwner = {
  profileId: number;
  name: string;
  positionTitle: string | null;
  departmentName: string | null;
};

type AgingBucket = {
  key: string;
  label: string;
  amount: number;
  jobs: number;
};

type OwnerBreakdown = {
  ownerProfileId: number | null;
  ownerName: string;
  amount: number;
  jobs: number;
  over90Amount: number;
  slaBreachedJobs?: number;
  slaDueSoonJobs?: number;
};

type ReceivablesAging = {
  asOf: string;
  summary: {
    totalOutstanding: number;
    jobsWithOutstanding: number;
    unownedJobs: number;
    over90Jobs: number;
    slaBreachedJobs?: number;
    slaDueSoonJobs?: number;
  };
  buckets: AgingBucket[];
  ownerBreakdown: OwnerBreakdown[];
};

type FollowUpLog = {
  id: number;
  jobId: number;
  actionType: string;
  actionDate: string;
  notes: string;
  nextFollowUpDate?: string | null;
  promisedPaymentDate?: string | null;
  promisedPaymentAmount?: number;
  isResolved: boolean;
  ownerProfileId?: number | null;
  ownerName?: string | null;
  actionByProfileId: number;
  actionByName: string;
};

export default function FinanceBalances() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { hasModuleAccess } = useAuth();
  const canWriteFinance = hasModuleAccess("finance", "write");
  const canApproveFinance = hasModuleAccess("finance", "approve");
  const canAdminFinance = hasModuleAccess("finance", "admin");
  const [loading, setLoading] = useState(true);
  const [clientBalances, setClientBalances] = useState<ClientBalance[]>([]);
  const [jobBalances, setJobBalances] = useState<JobBalance[]>([]);
  const [owners, setOwners] = useState<ReceivableOwner[]>([]);
  const [aging, setAging] = useState<ReceivablesAging | null>(null);
  const [followUps, setFollowUps] = useState<FollowUpLog[]>([]);
  const [clientSearch, setClientSearch] = useState("");
  const [jobSearch, setJobSearch] = useState("");
  const [updatingStageJobId, setUpdatingStageJobId] = useState<number | null>(null);
  const [updatingOwnerJobId, setUpdatingOwnerJobId] = useState<number | null>(null);
  const [escalatingJobId, setEscalatingJobId] = useState<number | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [loggingFollowUp, setLoggingFollowUp] = useState(false);
  const [actionType, setActionType] = useState("call");
  const [actionNotes, setActionNotes] = useState("");
  const [nextFollowUpDate, setNextFollowUpDate] = useState("");
  const [promisedPaymentDate, setPromisedPaymentDate] = useState("");
  const [promisedPaymentAmount, setPromisedPaymentAmount] = useState("");
  const [markResolved, setMarkResolved] = useState(false);

  const collectionStageLabels: Record<string, string> = {
    not_ready: "Not Ready",
    ready_for_collection: "Ready for Collection",
    partial_collection: "Partial Collection",
    fully_collected: "Fully Collected",
    overdue: "Overdue",
  };

  const loadBalances = async () => {
    try {
      setLoading(true);
      const results = await Promise.allSettled([
        apiFetch<ClientBalance[]>("GET", "/finance-dashboard/client-balances"),
        apiFetch<JobBalance[]>("GET", "/finance-dashboard/job-balances"),
        apiFetch<ReceivableOwner[]>("GET", "/finance-dashboard/receivable-owners"),
        apiFetch<ReceivablesAging>("GET", "/finance-dashboard/receivables-aging"),
      ]);

      const [clientsResult, jobsResult, ownersResult, agingResult] = results;
      if (clientsResult.status === "fulfilled") setClientBalances(clientsResult.value);
      if (jobsResult.status === "fulfilled") {
        setJobBalances(jobsResult.value);
        setSelectedJobId((prev) => prev ?? jobsResult.value[0]?.jobId ?? null);
      }
      if (ownersResult.status === "fulfilled") setOwners(ownersResult.value);
      if (agingResult.status === "fulfilled") setAging(agingResult.value);
    } catch (error: any) {
      console.error("Balances error:", error);
      if (error?.status === 401) {
        navigate("/auth");
        return;
      }
      if (error?.status === 403) {
        setClientBalances([]);
        setJobBalances([]);
        setOwners([]);
        setAging(null);
        return;
      }
      if (error?.status === 404) {
        setClientBalances([]);
        setJobBalances([]);
        setOwners([]);
        setAging(null);
        return;
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBalances();
  }, []);

  const handleUpdateCollectionStage = async (jobId: number, collectionStage: string) => {
    if (!canApproveFinance) {
      toast({
        title: "Permission required",
        description: "You need finance approve access to update collection stages.",
        variant: "destructive",
      });
      return;
    }

    try {
      setUpdatingStageJobId(jobId);
      await apiFetch("PATCH", `/finance-dashboard/job-balances/${jobId}/collection-stage`, {
        collectionStage,
      });

      setJobBalances((prev) =>
        prev.map((job) => {
          if (job.jobId !== jobId) return job;
          const readyAt =
            collectionStage === "ready_for_collection"
              ? job.readyForCollectionAt || new Date().toISOString()
              : collectionStage === "not_ready"
                ? null
                : job.readyForCollectionAt ?? null;
          return {
            ...job,
            collectionStage,
            readyForCollectionAt: readyAt,
          };
        })
      );

      toast({
        title: "Collection stage updated",
        description: "Job collection stage has been updated.",
      });
    } catch (error: any) {
      toast({
        title: "Failed to update stage",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setUpdatingStageJobId(null);
    }
  };

  const loadFollowUps = async (jobId: number) => {
    try {
      const data = await apiFetch<FollowUpLog[]>("GET", `/finance-dashboard/job-balances/${jobId}/follow-ups?limit=50`);
      setFollowUps(data);
    } catch {
      setFollowUps([]);
    }
  };

  useEffect(() => {
    if (!selectedJobId) {
      setFollowUps([]);
      return;
    }
    loadFollowUps(selectedJobId);
  }, [selectedJobId]);

  const handleAssignOwner = async (jobId: number, ownerProfileId: string) => {
    if (!canAdminFinance) {
      toast({
        title: "Permission required",
        description: "You need finance admin access to assign receivable owners.",
        variant: "destructive",
      });
      return;
    }

    const payloadOwner = ownerProfileId === "" ? null : Number(ownerProfileId);
    try {
      setUpdatingOwnerJobId(jobId);
      const response = await apiFetch<{
        receivableOwnerProfileId: number | null;
        receivableOwnerName: string | null;
        receivableOwnerPosition: string | null;
      }>("PATCH", `/finance-dashboard/job-balances/${jobId}/owner`, {
        ownerProfileId: payloadOwner,
      });

      setJobBalances((prev) =>
        prev.map((job) =>
          job.jobId === jobId
            ? {
                ...job,
                receivableOwnerProfileId: response.receivableOwnerProfileId,
                receivableOwnerName: response.receivableOwnerName,
                receivableOwnerPosition: response.receivableOwnerPosition,
              }
            : job
        )
      );

      toast({
        title: "Receivable owner updated",
        description: "Owner accountability has been updated for the job.",
      });
      await loadBalances();
    } catch (error: any) {
      toast({
        title: "Failed to update owner",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setUpdatingOwnerJobId(null);
    }
  };

  const handleEscalateReceivable = async (job: JobBalance) => {
    if (!canApproveFinance) {
      toast({
        title: "Permission required",
        description: "You need finance approve access to escalate receivables.",
        variant: "destructive",
      });
      return;
    }

    if (job.balance <= 0) {
      toast({
        title: "No outstanding balance",
        description: "This job is already fully collected.",
      });
      return;
    }

    const notesInput = window.prompt(
      `Escalation reason for ${job.jobCode || job.jobName}:`,
      ""
    );
    const notes = String(notesInput || "").trim();
    if (!notes) return;

    const levelInput = window.prompt(
      "Escalation level (manager | partner | hr | gmp):",
      "partner"
    );
    const escalationLevel = String(levelInput || "partner").trim().toLowerCase();
    if (!["manager", "partner", "hr", "gmp"].includes(escalationLevel)) {
      toast({
        title: "Invalid escalation level",
        description: "Use manager, partner, hr, or gmp.",
        variant: "destructive",
      });
      return;
    }

    try {
      setEscalatingJobId(job.jobId);
      await apiFetch("POST", `/finance-dashboard/job-balances/${job.jobId}/escalate`, {
        notes,
        escalationLevel,
      });
      await Promise.all([loadBalances(), selectedJobId === job.jobId ? loadFollowUps(job.jobId) : Promise.resolve()]);
      toast({
        title: "Escalation logged",
        description: `Escalation sent to ${escalationLevel.toUpperCase()} chain.`,
      });
    } catch (error: any) {
      toast({
        title: "Failed to escalate receivable",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setEscalatingJobId(null);
    }
  };

  const selectedJob = useMemo(
    () => jobBalances.find((job) => job.jobId === selectedJobId) || null,
    [jobBalances, selectedJobId]
  );

  const handleLogFollowUp = async () => {
    if (!canWriteFinance) {
      toast({
        title: "Permission required",
        description: "You need finance write access to log follow-up actions.",
        variant: "destructive",
      });
      return;
    }

    if (!selectedJobId) {
      return;
    }
    if (!actionNotes.trim()) {
      toast({
        title: "Action notes required",
        description: "Add notes before logging a follow-up.",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoggingFollowUp(true);
      await apiFetch("POST", `/finance-dashboard/job-balances/${selectedJobId}/follow-ups`, {
        actionType,
        notes: actionNotes.trim(),
        nextFollowUpDate: nextFollowUpDate || null,
        promisedPaymentDate: promisedPaymentDate || null,
        promisedPaymentAmount: promisedPaymentAmount ? Number(promisedPaymentAmount) : null,
        isResolved: markResolved,
      });

      setActionNotes("");
      setNextFollowUpDate("");
      setPromisedPaymentDate("");
      setPromisedPaymentAmount("");
      setMarkResolved(false);

      await Promise.all([loadFollowUps(selectedJobId), loadBalances()]);
      toast({
        title: "Follow-up action logged",
        description: "Receivable action has been recorded.",
      });
    } catch (error: any) {
      toast({
        title: "Failed to log follow-up",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoggingFollowUp(false);
    }
  };

  const filteredClientBalances = useMemo(() => {
    if (!clientSearch.trim()) return clientBalances;
    const query = clientSearch.toLowerCase();
    return clientBalances.filter((client) => client.clientName.toLowerCase().includes(query));
  }, [clientBalances, clientSearch]);

  const filteredJobBalances = useMemo(() => {
    if (!jobSearch.trim()) return jobBalances;
    const query = jobSearch.toLowerCase();
    return jobBalances.filter((job) => {
      const haystack = [job.jobCode, job.jobName, job.clientName].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }, [jobBalances, jobSearch]);

  const totalOutstanding = useMemo(
    () => filteredClientBalances.reduce((sum, client) => sum + (client.balance || 0), 0),
    [filteredClientBalances]
  );

  const totalJobBalance = useMemo(
    () => filteredJobBalances.reduce((sum, job) => sum + (job.balance || 0), 0),
    [filteredJobBalances]
  );

  const topClientBalances = useMemo(() => {
    return [...filteredClientBalances]
      .sort((a, b) => (b.balance || 0) - (a.balance || 0))
      .slice(0, 5);
  }, [filteredClientBalances]);

  const agingLabelByKey: Record<string, string> = {
    current_0_30: "0-30 days",
    bucket_31_60: "31-60 days",
    bucket_61_90: "61-90 days",
    bucket_over_90: "90+ days",
  };

  const slaLabelByStatus: Record<string, string> = {
    ok: "On Track",
    due_soon: "Due Soon",
    breached: "Breached",
  };

  const slaBadgeClassByStatus: Record<string, string> = {
    ok: "bg-emerald-100 text-emerald-800 border-emerald-200",
    due_soon: "bg-amber-100 text-amber-800 border-amber-200",
    breached: "bg-red-100 text-red-800 border-red-200",
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold">Balances</h1>
          <p className="text-muted-foreground">Track outstanding client and job balances.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Client Balance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="metric-value">KES {totalOutstanding.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Across all clients</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Job Balance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="metric-value">KES {totalJobBalance.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Across all jobs</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Unowned Receivables</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="metric-value">{aging?.summary.unownedJobs ?? 0}</div>
              <p className="text-xs text-muted-foreground">Outstanding jobs without owner</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">90+ Day Exposure</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="metric-value">{aging?.summary.over90Jobs ?? 0}</div>
              <p className="text-xs text-muted-foreground">Jobs in high-risk aging bucket</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">SLA Breaches</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="metric-value">{aging?.summary.slaBreachedJobs ?? 0}</div>
              <p className="text-xs text-muted-foreground">Follow-up deadlines missed</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">SLA Due Soon</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="metric-value">{aging?.summary.slaDueSoonJobs ?? 0}</div>
              <p className="text-xs text-muted-foreground">Follow-ups due today/tomorrow</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {(aging?.buckets || []).map((bucket) => (
            <Card key={bucket.key}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{bucket.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="font-semibold">KES {Number(bucket.amount || 0).toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">{bucket.jobs} jobs</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Client Balances</CardTitle>
              <CardDescription>Outstanding balances by client.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="clientBalanceSearch">Search clients</Label>
                <Input
                  id="clientBalanceSearch"
                  placeholder="Search by client name"
                  value={clientSearch}
                  onChange={(event) => setClientSearch(event.target.value)}
                />
              </div>
              <div className="max-h-[520px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead className="text-right">Fees</TableHead>
                    <TableHead className="text-right">Collected</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead className="text-right">Jobs</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredClientBalances.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No balances match the current filter.
                      </TableCell>
                    </TableRow>
                  )}
                  {filteredClientBalances.map((client) => (
                    <TableRow key={client.clientId}>
                      <TableCell>{client.clientName}</TableCell>
                      <TableCell className="text-right">KES {client.totalFee.toLocaleString()}</TableCell>
                      <TableCell className="text-right">KES {client.totalCollected.toLocaleString()}</TableCell>
                      <TableCell className="text-right">KES {client.balance.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{client.jobsCount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Job Balances</CardTitle>
              <CardDescription>Fee vs collected per job.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="jobBalanceSearch">Search jobs</Label>
                <Input
                  id="jobBalanceSearch"
                  placeholder="Job, client, or code"
                  value={jobSearch}
                  onChange={(event) => setJobSearch(event.target.value)}
                />
              </div>
              <div className="max-h-[520px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead className="text-right">Fee</TableHead>
                    <TableHead className="text-right">Collected</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Aging</TableHead>
                    <TableHead>SLA</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Collection Stage</TableHead>
                    <TableHead>Last Follow-up</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredJobBalances.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center text-muted-foreground">
                        No job balances match the current filter.
                      </TableCell>
                    </TableRow>
                  )}
                  {filteredJobBalances.map((job) => (
                    <TableRow key={job.jobId}>
                      <TableCell>{job.jobCode || job.jobName}</TableCell>
                      <TableCell>{job.clientName}</TableCell>
                      <TableCell className="text-right">KES {job.fee.toLocaleString()}</TableCell>
                      <TableCell className="text-right">KES {job.collected.toLocaleString()}</TableCell>
                      <TableCell className="text-right">KES {job.balance.toLocaleString()}</TableCell>
                      <TableCell>
                        <div className="text-xs">
                          <p className="font-medium">{agingLabelByKey[job.agingBucket || ""] || "0-30 days"}</p>
                          <p className="text-muted-foreground">{job.daysOutstanding ?? 0} days</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1 text-xs">
                          <Badge
                            variant="outline"
                            className={slaBadgeClassByStatus[job.slaStatus || "ok"] || ""}
                          >
                            {slaLabelByStatus[job.slaStatus || "ok"] || "On Track"}
                          </Badge>
                          {job.slaBreached && (job.slaBreachDays || 0) > 0 && (
                            <p className="text-red-600">
                              {job.slaBreachDays} day{job.slaBreachDays === 1 ? "" : "s"} overdue
                            </p>
                          )}
                          {!job.slaBreached && job.expectedFollowUpDate && (
                            <p className="text-muted-foreground">
                              Due {new Date(job.expectedFollowUpDate).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <select
                          className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                          value={job.receivableOwnerProfileId ?? ""}
                          disabled={!canAdminFinance || updatingOwnerJobId === job.jobId}
                          onChange={(event) => handleAssignOwner(job.jobId, event.target.value)}
                        >
                          <option value="">Unassigned</option>
                          {owners.map((owner) => (
                            <option key={owner.profileId} value={owner.profileId}>
                              {owner.name}
                            </option>
                          ))}
                        </select>
                      </TableCell>
                      <TableCell>
                        <select
                          className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                          value={job.collectionStage || "not_ready"}
                          disabled={!canApproveFinance || updatingStageJobId === job.jobId}
                          onChange={(event) =>
                            handleUpdateCollectionStage(job.jobId, event.target.value)
                          }
                        >
                          {Object.entries(collectionStageLabels).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </TableCell>
                      <TableCell>
                        {job.lastFollowUpAt
                          ? `${new Date(job.lastFollowUpAt).toLocaleDateString()} (${(job.lastFollowUpActionType || "note").replaceAll("_", " ")})`
                          : "--"}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant={selectedJobId === job.jobId ? "default" : "outline"}
                          onClick={() => setSelectedJobId(job.jobId)}
                        >
                          Follow-up
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="ml-2"
                          disabled={!canApproveFinance || escalatingJobId === job.jobId || job.balance <= 0}
                          onClick={() => handleEscalateReceivable(job)}
                        >
                          {escalatingJobId === job.jobId ? "Escalating..." : "Escalate"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Receivables Follow-up Action Log</CardTitle>
              <CardDescription>
                Log follow-up actions and keep a clear accountability trail per job.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2 md:col-span-1">
                  <Label>Selected Job</Label>
                  <div className="rounded-md border p-2 text-sm">
                    {selectedJob ? `${selectedJob.jobCode || selectedJob.jobName} - ${selectedJob.clientName}` : "No job selected"}
                  </div>
                </div>
                {!canWriteFinance && (
                  <div className="md:col-span-2 rounded-md border border-dashed p-2 text-xs text-muted-foreground">
                    Read-only: you need finance write access to log follow-up actions.
                  </div>
                )}
              </div>
              <fieldset disabled={!canWriteFinance} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="actionType">Action Type</Label>
                  <select
                    id="actionType"
                    className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
                    value={actionType}
                    onChange={(event) => setActionType(event.target.value)}
                  >
                    <option value="call">Call</option>
                    <option value="email">Email</option>
                    <option value="meeting">Meeting</option>
                    <option value="reminder">Reminder</option>
                    <option value="escalation">Escalation</option>
                    <option value="promise_to_pay">Promise To Pay</option>
                    <option value="dispute">Dispute</option>
                    <option value="note">Note</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nextFollowUpDate">Next Follow-up Date</Label>
                  <Input
                    id="nextFollowUpDate"
                    type="date"
                    value={nextFollowUpDate}
                    onChange={(event) => setNextFollowUpDate(event.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="promisedPaymentDate">Promised Payment Date</Label>
                  <Input
                    id="promisedPaymentDate"
                    type="date"
                    value={promisedPaymentDate}
                    onChange={(event) => setPromisedPaymentDate(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="promisedPaymentAmount">Promised Payment Amount (KES)</Label>
                  <Input
                    id="promisedPaymentAmount"
                    type="number"
                    min="0"
                    value={promisedPaymentAmount}
                  onChange={(event) => setPromisedPaymentAmount(event.target.value)}
                />
              </div>
            </div>

              <div className="space-y-2">
                <Label htmlFor="actionNotes">Action Notes</Label>
                <Textarea
                  id="actionNotes"
                  rows={3}
                  placeholder="Capture call/email outcomes, blockers, and next commitments."
                  value={actionNotes}
                  onChange={(event) => setActionNotes(event.target.value)}
                />
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={markResolved}
                  onChange={(event) => setMarkResolved(event.target.checked)}
                />
                Mark receivable as resolved in this follow-up
              </label>

              <Button onClick={handleLogFollowUp} disabled={!canWriteFinance || !selectedJobId || loggingFollowUp}>
                {loggingFollowUp ? "Saving..." : "Log Follow-up"}
              </Button>
              </fieldset>

              <div className="space-y-2">
                <p className="text-sm font-medium">Recent Actions</p>
                {followUps.length === 0 ? (
                  <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                    No follow-up actions logged for this job yet.
                  </div>
                ) : (
                  <div className="max-h-64 space-y-2 overflow-auto">
                    {followUps.map((log) => (
                      <div key={log.id} className="rounded-md border p-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium capitalize">{log.actionType.replaceAll("_", " ")}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(log.actionDate).toLocaleString()}
                          </p>
                        </div>
                        <p className="mt-1">{log.notes}</p>
                        <div className="mt-1 text-xs text-muted-foreground">
                          <p>By: {log.actionByName}</p>
                          <p>Owner: {log.ownerName || "Unassigned"}</p>
                          <p>Next follow-up: {log.nextFollowUpDate ? new Date(log.nextFollowUpDate).toLocaleDateString() : "--"}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Owner Accountability</CardTitle>
                <CardDescription>Outstanding balances grouped by receivable owner.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(aging?.ownerBreakdown || []).slice(0, 6).map((owner) => (
                  <div key={`${owner.ownerProfileId ?? "unassigned"}`} className="flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium">{owner.ownerName}</p>
                      <p className="text-xs text-muted-foreground">
                        {owner.jobs} jobs · SLA breached {owner.slaBreachedJobs ?? 0}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">KES {Number(owner.amount || 0).toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">
                        90+ days: KES {Number(owner.over90Amount || 0).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
                {(aging?.ownerBreakdown || []).length === 0 && (
                  <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                    No outstanding receivables yet.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Top Outstanding Clients</CardTitle>
                <CardDescription>Largest balances that need follow-up.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {topClientBalances.length === 0 ? (
                  <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                    No outstanding client balances yet.
                  </div>
                ) : (
                  topClientBalances.map((client) => (
                    <div key={client.clientId} className="flex items-center justify-between text-sm">
                      <div>
                        <p className="font-medium">{client.clientName}</p>
                        <p className="text-xs text-muted-foreground">{client.jobsCount} jobs</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">KES {client.balance.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">
                          Collected KES {client.totalCollected.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
