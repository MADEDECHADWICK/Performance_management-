import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import PageLoader from '@/components/ui/page-loader';
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Target, Plus, CheckCircle2, XCircle, Clock, AlertCircle } from "lucide-react";
import {
  SECTION_TITLE,
  SECTION_SUBTITLE,
  PAGE_STACK,
  SECTION_STACK,
  SUMMARY_CARD_CONTENT,
  SUMMARY_CARD_HEADER,
  SUMMARY_CARD_TITLE,
} from "@/components/ui/cardStyles";
import { useAuth } from "@/contexts/AuthContext";

export default function Goals() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, isLoading: authLoading, isHR, isAdmin, isManager } = useAuth();
  const [loading, setLoading] = useState(true);
  const [okrs, setOkrs] = useState<any[]>([]);
  const [teamOkrs, setTeamOkrs] = useState<any[]>([]);
  const [pendingOkrs, setPendingOkrs] = useState<any[]>([]);
  const [okrHistory, setOkrHistory] = useState<Record<number, any[]>>({});
  const [expandedHistory, setExpandedHistory] = useState<Record<number, boolean>>({});
  const [auditHistory, setAuditHistory] = useState<any[]>([]);
  const [cycles, setCycles] = useState<any[]>([]);
  const [kpis, setKpis] = useState<any[]>([]);
  const [isOkrDialogOpen, setIsOkrDialogOpen] = useState(false);
  const [canApproveOkrs, setCanApproveOkrs] = useState(false);
  const [canEditOkrs, setCanEditOkrs] = useState(false);
  const [newOkr, setNewOkr] = useState({
    title: "",
    description: "",
    cycleId: "",
    kpiId: "",
    status: "active",
    startDate: "",
    endDate: "",
  });
  const [currentProfileId, setCurrentProfileId] = useState<number | null>(null);
  const [teamProfileIds, setTeamProfileIds] = useState<number[]>([]);
  const [isHrAdmin, setIsHrAdmin] = useState(false);
  const [newKeyResults, setNewKeyResults] = useState<
    Array<{ title: string; unit: string; targetValue: string; weight: string }>
  >([{ title: "", unit: "", targetValue: "", weight: "" }]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      if (!user) {
        navigate("/auth");
        return;
      }
      const profileId = (user as any)?.profileId ?? user.profile?.id ?? null;
      setCurrentProfileId(profileId);

      // Load active cycles
      const cyclesData = await apiFetch('GET', '/evaluation-cycles?status=active');
      setCycles(cyclesData || []);

      // Load KPIs
      const kpisData = await apiFetch('GET', '/kpis?isActive=true');
      setKpis(kpisData || []);

      const isApprover = isHR || isAdmin || isManager;
      setCanApproveOkrs(isApprover);
      setCanEditOkrs(Boolean(profileId));
      setIsHrAdmin(isHR || isAdmin);

      if (profileId) {
        const okrData = await apiFetch('GET', `/okrs?ownerProfileId=${profileId}`);
        setOkrs(okrData || []);
      }

      if (isApprover) {
        if (isManager && profileId) {
          const teamResponse = await apiFetch("GET", `/profiles/${profileId}/team`);
          const teamItems = teamResponse?.data ?? teamResponse ?? [];
          const teamIds = Array.isArray(teamItems)
            ? teamItems.map((member: any) => member.id)
            : [];
          setTeamProfileIds(teamIds);

          const teamOkrsResponses = await Promise.all(
            teamIds.map((id: number) => apiFetch("GET", `/okrs?ownerProfileId=${id}`))
          );
          const flattenedTeamOkrs = teamOkrsResponses.flatMap((resp: any) =>
            Array.isArray(resp) ? resp : []
          );
          setTeamOkrs(flattenedTeamOkrs);

          const pending = await apiFetch("GET", "/okrs?approvalStatus=pending");
          const filteredPending = (pending || []).filter((okr: any) =>
            teamIds.includes(okr.ownerProfileId)
          );
          setPendingOkrs(filteredPending);

          const history = await apiFetch("GET", "/okrs/history/all?limit=30");
          const filteredHistory = (history || []).filter((item: any) =>
            teamIds.includes(item?.objective?.ownerProfileId)
          );
          setAuditHistory(filteredHistory);
        } else {
          const pending = await apiFetch("GET", "/okrs?approvalStatus=pending");
          setPendingOkrs(pending || []);

          const history = await apiFetch("GET", "/okrs/history/all?limit=12");
          setAuditHistory(history || []);
        }
      }
    } catch (error: any) {
      if (error?.status === 404) return;
      toast({
        variant: "destructive",
        title: "Error loading data",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  }, [isAdmin, isHR, isManager, navigate, toast, user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/auth");
      return;
    }
    loadData();
  }, [authLoading, user, navigate, loadData]);

  const addKeyResultRow = () => {
    setNewKeyResults([
      ...newKeyResults,
      { title: "", unit: "", targetValue: "", weight: "" },
    ]);
  };

  const removeKeyResultRow = (index: number) => {
    setNewKeyResults(newKeyResults.filter((_, idx) => idx !== index));
  };

  const updateKeyResult = (
    index: number,
    field: "title" | "unit" | "targetValue" | "weight",
    value: string
  ) => {
    setNewKeyResults(
      newKeyResults.map((kr, idx) =>
        idx === index ? { ...kr, [field]: value } : kr
      )
    );
  };

  const handleCreateOkr = async () => {
    try {
      const profileId = (user as any)?.profileId ?? user?.profile?.id;
      if (!profileId) {
        toast({
          variant: "destructive",
          title: "Profile required",
          description: "Your profile is required to create goal objectives.",
        });
        return;
      }

      if (!newOkr.title.trim()) {
        toast({
          variant: "destructive",
          title: "Missing title",
          description: "Please add an objective title.",
        });
        return;
      }

      const filteredKeyResults = newKeyResults
        .filter((kr) => kr.title.trim())
        .map((kr) => ({
          title: kr.title,
          unit: kr.unit || null,
          targetValue: kr.targetValue ? Number(kr.targetValue) : 0,
          weight: kr.weight ? Number(kr.weight) : undefined,
        }));

      await apiFetch("POST", "/okrs", {
        title: newOkr.title,
        description: newOkr.description,
        ownerProfileId: profileId,
        cycleId: newOkr.cycleId ? Number(newOkr.cycleId) : undefined,
        kpiId: newOkr.kpiId ? Number(newOkr.kpiId) : undefined,
        status: newOkr.status,
        startDate: newOkr.startDate || null,
        endDate: newOkr.endDate || null,
        keyResults: filteredKeyResults,
      });

      toast({
        title: "Goal objective created",
        description: "Objective and key results saved.",
      });

      setIsOkrDialogOpen(false);
      setNewOkr({
        title: "",
        description: "",
        cycleId: "",
        kpiId: "",
        status: "active",
        startDate: "",
        endDate: "",
      });
      setNewKeyResults([{ title: "", unit: "", targetValue: "", weight: "" }]);
      loadData();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error creating goal objective",
        description: error.message,
      });
    }
  };

  const getApprovalBadge = (status?: string) => {
    switch (status) {
      case "approved":
        return (
          <Badge className="bg-green-500">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Approved
          </Badge>
        );
      case "rejected":
        return (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 mr-1" />
            Rejected
          </Badge>
        );
      case "pending":
        return (
          <Badge variant="secondary">
            <Clock className="h-3 w-3 mr-1" />
            Pending Review
          </Badge>
        );
      case "draft":
        return (
          <Badge variant="outline">
            <AlertCircle className="h-3 w-3 mr-1" />
            Draft
          </Badge>
        );
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const toggleHistory = async (okrId: number) => {
    const isOpen = expandedHistory[okrId];
    setExpandedHistory((prev) => ({ ...prev, [okrId]: !isOpen }));

    if (!isOpen && !okrHistory[okrId]) {
      try {
        const history = await apiFetch("GET", `/okrs/${okrId}/history?limit=8`);
        setOkrHistory((prev) => ({ ...prev, [okrId]: history || [] }));
      } catch (error: any) {
        toast({
          variant: "destructive",
          title: "Error loading history",
          description: error.message,
        });
      }
    }
  };

  const formatHistoryLabel = (item: any) => {
    const actor =
      item?.changedBy?.firstName || item?.changedBy?.lastName
        ? `${item.changedBy.firstName ?? ""} ${item.changedBy.lastName ?? ""}`.trim()
        : "System";
    const keyResult = item?.keyResult?.title ? ` - ${item.keyResult.title}` : "";
    return `${actor}${keyResult}`;
  };

  const handleUpdateKr = async (krId: number, currentValue: string, status?: string) => {
    try {
      await apiFetch("PATCH", `/okrs/key-results/${krId}`, {
        currentValue: currentValue === "" ? undefined : Number(currentValue),
        ...(status ? { status } : {}),
      });
      toast({ title: "Key result updated", description: "Progress saved." });
      loadData();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Update failed",
        description: error.message,
      });
    }
  };

  const handleUpdateObjectiveStatus = async (okrId: number, status: string) => {
    try {
      await apiFetch("PATCH", `/okrs/${okrId}`, { status });
      toast({ title: "Objective updated", description: "Status changed." });
      loadData();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Update failed",
        description: error.message,
      });
    }
  };

  const canEditObjective = (okr: any) => {
    if (!canEditOkrs) return false;
    if (isHrAdmin) return true;
    if (okr?.ownerProfileId && teamProfileIds.includes(okr.ownerProfileId)) return true;
    return okr?.ownerProfileId && okr.ownerProfileId === currentProfileId;
  };

  const getObjectiveCompletionPercent = (okr: any) => {
    const keyResults = Array.isArray(okr?.keyResults) ? okr.keyResults : [];
    if (keyResults.length === 0) return 0;

    const totalRatio = keyResults.reduce((sum: number, keyResult: any) => {
      const target = Number(keyResult?.targetValue || 0);
      const current = Number(keyResult?.currentValue || 0);
      if (!target) return sum;
      const ratio = Math.max(0, Math.min(1, current / target));
      return sum + ratio;
    }, 0);

    return (totalRatio / keyResults.length) * 100;
  };

  const myGoalCompletion = useMemo(() => {
    if (okrs.length === 0) return 0;
    const total = okrs.reduce(
      (sum, objective) => sum + getObjectiveCompletionPercent(objective),
      0
    );
    return total / okrs.length;
  }, [okrs]);

  const handleApproveOkr = async (okrId: number) => {
    try {
      await apiFetch("POST", `/okrs/${okrId}/approve`, {});
      toast({ title: "OKR approved", description: "Objective has been approved." });
      loadData();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Approval failed",
        description: error.message,
      });
    }
  };

  const handleRejectOkr = async (okrId: number) => {
    try {
      await apiFetch("POST", `/okrs/${okrId}/reject`, {});
      toast({ title: "OKR rejected", description: "Objective has been rejected." });
      loadData();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Rejection failed",
        description: error.message,
      });
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <PageLoader message="Loading..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className={PAGE_STACK}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className={`${SECTION_TITLE} flex items-center gap-2`}>
              <Target className="h-8 w-8" />
              Goals & OKRs
            </h1>
            <p className={SECTION_SUBTITLE}>Unified objective tracking with measurable key results</p>
          </div>
          <div className="flex gap-2">
            <Dialog open={isOkrDialogOpen} onOpenChange={setIsOkrDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Plus className="h-4 w-4 mr-2" />
                  New Goal (OKR)
                </Button>
              </DialogTrigger>
              <DialogContent className="w-[95vw] max-w-3xl max-h-[90vh] overflow-hidden">
                <DialogHeader>
                  <DialogTitle>Create Goal (OKR)</DialogTitle>
                  <DialogDescription>
                    Define one goal objective and the key results that measure it.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 overflow-y-auto pr-1 max-h-[calc(90vh-8rem)]">
                  <div className="space-y-2">
                    <Label>Objective Title *</Label>
                    <Input
                      value={newOkr.title}
                      onChange={(e) => setNewOkr({ ...newOkr, title: e.target.value })}
                      placeholder="E.g., Improve client satisfaction in Q2"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea
                      value={newOkr.description}
                      onChange={(e) => setNewOkr({ ...newOkr, description: e.target.value })}
                      placeholder="What success looks like for this objective..."
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Evaluation Cycle (Optional)</Label>
                    <select
                      className="w-full rounded-md border border-input bg-background px-3 py-2"
                      value={newOkr.cycleId}
                      onChange={(e) => setNewOkr({ ...newOkr, cycleId: e.target.value })}
                    >
                      <option value="">No cycle link</option>
                      {cycles.map((cycle) => (
                        <option key={cycle.id} value={cycle.id}>
                          {cycle.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label>Linked KPI (Optional)</Label>
                    <select
                      className="w-full rounded-md border border-input bg-background px-3 py-2"
                      value={newOkr.kpiId}
                      onChange={(e) => setNewOkr({ ...newOkr, kpiId: e.target.value })}
                    >
                      <option value="">No KPI link</option>
                      {kpis.map((kpi) => (
                        <option key={kpi.id} value={kpi.id}>
                          {kpi.name}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-muted-foreground">
                      Link this objective to the KPI it helps fulfill.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Start Date</Label>
                      <Input
                        type="date"
                        value={newOkr.startDate}
                        onChange={(e) => setNewOkr({ ...newOkr, startDate: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>End Date</Label>
                      <Input
                        type="date"
                        value={newOkr.endDate}
                        onChange={(e) => setNewOkr({ ...newOkr, endDate: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label>Key Results</Label>
                    {newKeyResults.map((kr, index) => (
                      <div key={index} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                        <div className="md:col-span-2">
                          <Input
                            value={kr.title}
                            onChange={(e) => updateKeyResult(index, "title", e.target.value)}
                            placeholder="Key result title"
                          />
                        </div>
                        <Input
                          value={kr.unit}
                          onChange={(e) => updateKeyResult(index, "unit", e.target.value)}
                          placeholder="Unit"
                        />
                        <Input
                          type="number"
                          value={kr.targetValue}
                          onChange={(e) => updateKeyResult(index, "targetValue", e.target.value)}
                          placeholder="Target"
                        />
                        <div className="flex gap-2">
                          <Input
                            type="number"
                            value={kr.weight}
                            onChange={(e) => updateKeyResult(index, "weight", e.target.value)}
                            placeholder="Weight"
                          />
                          {newKeyResults.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => removeKeyResultRow(index)}
                            >
                              -
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                    <Button type="button" variant="ghost" onClick={addKeyResultRow}>
                      + Add Key Result
                    </Button>
                  </div>

                  <Button onClick={handleCreateOkr} className="w-full">
                    Create Goal Objective
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className={SUMMARY_CARD_HEADER}>
              <CardTitle className={SUMMARY_CARD_TITLE}>Active Cycles</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className={SUMMARY_CARD_CONTENT}>
              <div className="text-2xl font-bold">{cycles.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className={SUMMARY_CARD_HEADER}>
              <CardTitle className={SUMMARY_CARD_TITLE}>My Goal Objectives</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className={SUMMARY_CARD_CONTENT}>
              <div className="text-2xl font-bold">{okrs.length}</div>
              <p className="text-xs text-muted-foreground">Trackable goal objectives</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className={SUMMARY_CARD_HEADER}>
              <CardTitle className={SUMMARY_CARD_TITLE}>Pending Approvals</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className={SUMMARY_CARD_CONTENT}>
              <div className="text-2xl font-bold">{pendingOkrs.length}</div>
              <p className="text-xs text-muted-foreground">Awaiting review</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className={SUMMARY_CARD_HEADER}>
              <CardTitle className={SUMMARY_CARD_TITLE}>Goal Completion</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className={SUMMARY_CARD_CONTENT}>
              <div className="text-2xl font-bold">{myGoalCompletion.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground">Average key-result completion</p>
            </CardContent>
          </Card>
        </div>

        {cycles.length === 0 && (
          <Card>
            <CardHeader>
              <CardTitle>No Active Cycles</CardTitle>
              <CardDescription>
                There are no active evaluation cycles right now. You can still create goal objectives and link a cycle later.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
        <div className={SECTION_STACK}>
            {canApproveOkrs && (
              <Card>
                <CardHeader>
                  <CardTitle>Pending Goal Approvals</CardTitle>
                  <CardDescription>Review objectives submitted by your team.</CardDescription>
                </CardHeader>
                <CardContent className={SECTION_STACK}>
                  {pendingOkrs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No pending goal objectives right now.</p>
                  ) : (
                    pendingOkrs.map((okr) => (
                      <div key={okr.id} className="border rounded-lg p-4 space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold">{okr.title}</p>
                            {okr.description && (
                              <p className="text-sm text-muted-foreground">{okr.description}</p>
                            )}
                            {okr.kpi?.name && (
                              <p className="text-xs text-muted-foreground">
                                Linked KPI: {okr.kpi.name}
                              </p>
                            )}
                          </div>
                          {getApprovalBadge(okr.approvalStatus)}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" onClick={() => handleApproveOkr(okr.id)}>
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleRejectOkr(okr.id)}
                          >
                            Reject
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            )}
            {canApproveOkrs && (
              <Card>
                <CardHeader>
                  <CardTitle>Goal Audit Log</CardTitle>
                  <CardDescription>Recent objective updates across the firm.</CardDescription>
                </CardHeader>
                <CardContent className={SECTION_STACK}>
                  {auditHistory.length === 0 ? (
                    <p className="text-muted-foreground">No updates yet.</p>
                  ) : (
                    auditHistory.map((item: any) => (
                      <div key={item.id} className="border rounded-md p-3 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium capitalize">
                            {item.changeType?.replace("_", " ")} - {item.field}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(item.changedAt).toLocaleString()}
                          </span>
                        </div>
                        <div className="text-muted-foreground">
                          {item.previousValue ?? "--"} {"->"} {item.newValue ?? "--"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {item.objective?.title || "Objective"}{" "}
                          {item.keyResult?.title ? `- ${item.keyResult.title}` : ""}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatHistoryLabel(item)}
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            )}
            <Card>
              <CardHeader>
                <CardTitle>My Goals (OKRs)</CardTitle>
                <CardDescription>Objectives and key results tied to your evaluation cycle.</CardDescription>
              </CardHeader>
              <CardContent className={SECTION_STACK}>
                {okrs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No goal objectives yet. Create one to start tracking.</p>
                ) : (
                  <div className={SECTION_STACK}>
                    {okrs.map((okr) => (
                      <div key={okr.id} className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-semibold">{okr.title}</p>
                            {okr.description && (
                              <p className="text-sm text-muted-foreground">{okr.description}</p>
                            )}
                            {okr.kpi?.name && (
                              <p className="text-xs text-muted-foreground">
                                Linked KPI: {okr.kpi.name}
                              </p>
                            )}
                          </div>
                          {getApprovalBadge(okr.approvalStatus)}
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                          <span>Objective status:</span>
                          {canEditObjective(okr) ? (
                            <select
                              className="border rounded-md px-2 py-1 text-sm"
                              value={okr.status}
                              onChange={(e) => handleUpdateObjectiveStatus(okr.id, e.target.value)}
                            >
                              <option value="draft">Draft</option>
                              <option value="active">Active</option>
                              <option value="completed">Completed</option>
                              <option value="archived">Archived</option>
                            </select>
                          ) : (
                            <span className="text-xs text-muted-foreground">{okr.status}</span>
                          )}
                        </div>
                        <div className="flex items-center justify-between text-sm text-muted-foreground">
                          <span>Status: {okr.status}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleHistory(okr.id)}
                          >
                            {expandedHistory[okr.id] ? "Hide history" : "View history"}
                          </Button>
                        </div>
                        {okr.keyResults?.length > 0 && (
                          <div className={SECTION_STACK}>
                            {okr.keyResults.map((kr: any) => (
                              <div key={kr.id} className="grid grid-cols-1 md:grid-cols-6 gap-2 text-sm items-center">
                                <div className="md:col-span-2 font-medium">{kr.title}</div>
                                <div>
                                  Target: {kr.targetValue} {kr.unit || ""}
                                </div>
                                <div className="md:col-span-2 flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">Current</span>
                                  {canEditObjective(okr) ? (
                                    <Input
                                      type="number"
                                      className="h-8 w-24"
                                      value={kr.currentValue ?? 0}
                                      onChange={(e) =>
                                        handleUpdateKr(kr.id, e.target.value, kr.status)
                                      }
                                    />
                                  ) : (
                                    <span className="text-xs font-medium">{kr.currentValue ?? 0}</span>
                                  )}
                                  <span className="text-xs text-muted-foreground">{kr.unit || ""}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  {canEditObjective(okr) ? (
                                    <select
                                      className="border rounded-md px-2 py-1 text-xs"
                                      value={kr.status}
                                      onChange={(e) =>
                                        handleUpdateKr(kr.id, String(kr.currentValue ?? 0), e.target.value)
                                      }
                                    >
                                      <option value="draft">Draft</option>
                                      <option value="active">Active</option>
                                      <option value="completed">Completed</option>
                                      <option value="archived">Archived</option>
                                    </select>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">{kr.status}</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {expandedHistory[okr.id] && (
                          <div className="border-t pt-3">
                            <p className="font-medium">Recent Updates</p>
                            {(okrHistory[okr.id] || []).length === 0 ? (
                              <p className="text-muted-foreground">No updates yet.</p>
                            ) : (
                              <div className={SECTION_STACK}>
                                {(okrHistory[okr.id] || []).map((item: any) => (
                                  <div key={item.id} className="flex flex-col gap-1">
                                    <div className="flex items-center justify-between">
                                      <span className="font-medium capitalize">
                                      {item.changeType?.replace("_", " ")} - {item.field}
                                      </span>
                                      <span className="text-xs text-muted-foreground">
                                        {new Date(item.changedAt).toLocaleDateString()}
                                      </span>
                                    </div>
                                    <div className="text-muted-foreground">
                                      {item.previousValue ?? "--"} {"->"} {item.newValue ?? "--"}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      {formatHistoryLabel(item)}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {teamOkrs.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Team Goals (OKRs)</CardTitle>
                  <CardDescription>Objectives owned by your direct reports.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {teamOkrs.map((okr) => (
                    <div key={okr.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold">{okr.title}</p>
                          {okr.description && (
                            <p className="text-sm text-muted-foreground">{okr.description}</p>
                          )}
                          {okr.kpi?.name && (
                            <p className="text-xs text-muted-foreground">
                              Linked KPI: {okr.kpi.name}
                            </p>
                          )}
                        </div>
                        {getApprovalBadge(okr.approvalStatus)}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                        <span>Objective status:</span>
                        {canEditObjective(okr) ? (
                          <select
                            className="border rounded-md px-2 py-1 text-sm"
                            value={okr.status}
                            onChange={(e) => handleUpdateObjectiveStatus(okr.id, e.target.value)}
                          >
                            <option value="draft">Draft</option>
                            <option value="active">Active</option>
                            <option value="completed">Completed</option>
                            <option value="archived">Archived</option>
                          </select>
                        ) : (
                          <span className="text-xs text-muted-foreground">{okr.status}</span>
                        )}
                      </div>
                      {okr.keyResults?.length > 0 && (
                        <div className="space-y-2">
                          {okr.keyResults.map((kr: any) => (
                            <div key={kr.id} className="grid grid-cols-1 md:grid-cols-6 gap-2 text-sm items-center">
                              <div className="md:col-span-2 font-medium">{kr.title}</div>
                              <div>
                                Target: {kr.targetValue} {kr.unit || ""}
                              </div>
                              <div className="md:col-span-2 flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">Current</span>
                                {canEditObjective(okr) ? (
                                  <Input
                                    type="number"
                                    className="h-8 w-24"
                                    value={kr.currentValue ?? 0}
                                    onChange={(e) =>
                                      handleUpdateKr(kr.id, e.target.value, kr.status)
                                    }
                                  />
                                ) : (
                                  <span className="text-xs font-medium">{kr.currentValue ?? 0}</span>
                                )}
                                <span className="text-xs text-muted-foreground">{kr.unit || ""}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                {canEditObjective(okr) ? (
                                  <select
                                    className="border rounded-md px-2 py-1 text-xs"
                                    value={kr.status}
                                    onChange={(e) =>
                                      handleUpdateKr(kr.id, String(kr.currentValue ?? 0), e.target.value)
                                    }
                                  >
                                    <option value="draft">Draft</option>
                                    <option value="active">Active</option>
                                    <option value="completed">Completed</option>
                                    <option value="archived">Archived</option>
                                  </select>
                                ) : (
                                  <span className="text-xs text-muted-foreground">{kr.status}</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

          </div>
      </div>
    </DashboardLayout>
  );
}

