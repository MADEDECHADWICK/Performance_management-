import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { apiFetch } from "@/lib/api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Plus, Edit, Save, Send, CheckCircle2, XCircle } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

interface Profile {
  id: string;
  first_name: string;
  last_name: string;
  position: string | null;
}

interface KPI {
  id: string;
  name: string;
  category: string;
  bsc_category: string | null;
}

const extractItems = (payload: any) => {
  const data = payload?.data ?? payload;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  return [];
};

const toInputDate = (value: unknown) => {
  if (!value) return "";
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
};

const normalizeCycle = (cycle: any) => ({
  ...cycle,
  cycle_name: cycle?.cycleName ?? cycle?.cycle_name ?? cycle?.name ?? "",
  cycle_type: cycle?.cycleType ?? cycle?.cycle_type ?? "quarterly",
  start_date: toInputDate(cycle?.startDate ?? cycle?.start_date),
  end_date: toInputDate(cycle?.endDate ?? cycle?.end_date),
  review_period_start: toInputDate(cycle?.reviewPeriodStart ?? cycle?.review_period_start),
  review_period_end: toInputDate(cycle?.reviewPeriodEnd ?? cycle?.review_period_end),
  financial_weight: Number(cycle?.financialWeight ?? cycle?.financial_weight ?? 70),
  non_financial_weight: Number(cycle?.nonFinancialWeight ?? cycle?.non_financial_weight ?? 30),
  auto_create_evaluations: Boolean(
    cycle?.autoCreateEvaluations ?? cycle?.auto_create_evaluations ?? false
  ),
  status: String(cycle?.status || "draft").toLowerCase(),
});

const EvaluationManagement = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("cycles");
  
  // Cycles state
  const [cycles, setCycles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCycle, setEditingCycle] = useState<any>(null);
  const [cycleFormData, setCycleFormData] = useState({
    cycle_name: "",
    description: "",
    cycle_type: "quarterly",
    start_date: "",
    end_date: "",
    review_period_start: "",
    review_period_end: "",
    financial_weight: 70,
    non_financial_weight: 30,
    auto_create_evaluations: false,
    status: "draft",
  });

  // Ad-hoc evaluation state
  const [evaluationName, setEvaluationName] = useState("");
  const [evaluationTarget, setEvaluationTarget] = useState<"individual" | "department">("individual");
  const [selectedDepartmentId, setSelectedDepartmentId] = useState("");
  const [departments, setDepartments] = useState<any[]>([]);
  const [departmentEmployees, setDepartmentEmployees] = useState<Profile[]>([]);
  const [includedEmployees, setIncludedEmployees] = useState<string[]>([]);
  const [dueDateDays, setDueDateDays] = useState(7);
  const [enableSelf, setEnableSelf] = useState(false);
  const [enablePeer, setEnablePeer] = useState(false);
  const [enableUpward, setEnableUpward] = useState(false);
  const [enableDownward, setEnableDownward] = useState(true);
  const [enableClientEvaluation, setEnableClientEvaluation] = useState(false);
  const [cancelIfNotProcessed, setCancelIfNotProcessed] = useState(false);
  const [processAnonymously, setProcessAnonymously] = useState(false);
  const [hideFromDashboard, setHideFromDashboard] = useState(false);
  const [requireAllKpis, setRequireAllKpis] = useState(false);
  const [excludeFromScore, setExcludeFromScore] = useState(false);
  const [requireEvaluatorSignature, setRequireEvaluatorSignature] = useState(false);
  const [sendSignatureToEvaluatee, setSendSignatureToEvaluatee] = useState(false);
  const [sendSignatureToManagers, setSendSignatureToManagers] = useState(false);
  const [sendSignatureToDownward, setSendSignatureToDownward] = useState(false);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [selectedEvaluators, setSelectedEvaluators] = useState<string[]>([]);
  const [selectedEvaluatees, setSelectedEvaluatees] = useState<string[]>([]);
  const [selectedKpis, setSelectedKpis] = useState<Array<{ kpi_id: string; weight: number; evaluator_type: string }>>([]);
  const [adHocLoading, setAdHocLoading] = useState(false);
  const [okrWeight, setOkrWeight] = useState(30);
  const [evaluationWeight, setEvaluationWeight] = useState(50);
  const [feedbackWeight, setFeedbackWeight] = useState(20);
  const [peerAssignmentMode, setPeerAssignmentMode] = useState<"manager" | "department" | "any">("department");
  const [peersPerPerson, setPeersPerPerson] = useState(2);

  const learningWeightTotal = evaluationWeight + okrWeight + feedbackWeight;
  const learningWeightsValid = learningWeightTotal === 100;
  const employeeOptions = Array.isArray(employees) ? employees : [];
  const departmentOptions = Array.isArray(departments) ? departments : [];
  const safeDepartmentEmployees = Array.isArray(departmentEmployees) ? departmentEmployees : [];

  useEffect(() => {
    loadCycles();
    loadEmployees();
    loadKPIs();
    loadDepartments();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedDepartmentId && evaluationTarget === "department") {
      loadDepartmentEmployees(selectedDepartmentId);
    }
  }, [selectedDepartmentId, evaluationTarget]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadCycles = async () => {
    try {
      const data = await apiFetch('GET', "/evaluation-cycles");
      setCycles(extractItems(data).map((cycle) => normalizeCycle(cycle)));
    } catch (error: any) {
      console.error("Error loading cycles:", error);
      toast({
        title: "Error",
        description: "Failed to load evaluation cycles.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadEmployees = async () => {
    try {
      const response = await apiFetch('GET', "/profiles?status=active&page=1&pageSize=100");
      setEmployees(extractItems(response));
    } catch (error: any) {
      if (error?.status === 401) {
        navigate("/auth");
        return;
      }
      if (error?.status === 403) {
        setEmployees([]);
        return;
      }
      toast({ title: "Error loading employees", variant: "destructive" });
    }
  };

  const loadKPIs = async () => {
    try {
      const data = await apiFetch('GET', "/kpi/archive/kpis");
      const archiveRows = extractItems(data);
      setKpis(
        archiveRows
          .filter((row: any) => row?.is_active !== false)
          .map((row: any) => ({
            id: row.id,
            name: row.name,
            description: row.description || null,
            category: row.category || null,
            kpiType: row.kpi_type || null,
          }))
      );
    } catch (error: any) {
      if (error?.status === 401) {
        navigate("/auth");
        return;
      }
      if (error?.status === 403) {
        setKpis([]);
        return;
      }
      toast({ title: "Error loading KPIs", variant: "destructive" });
    }
  };

  const loadDepartments = async () => {
    try {
      const data = await apiFetch('GET', "/departments?page=1&pageSize=200");
      setDepartments(extractItems(data));
    } catch (error: any) {
      if (error?.status === 401) {
        navigate("/auth");
        return;
      }
      if (error?.status === 403) {
        setDepartments([]);
        return;
      }
      toast({ title: "Error loading departments", variant: "destructive" });
    }
  };

  const loadDepartmentEmployees = async (deptId: string) => {
    try {
      const response = await apiFetch(
        'GET',
        `/profiles?departmentId=${deptId}&status=active&page=1&pageSize=200`
      );
      const safeEmployees = extractItems(response);
      setDepartmentEmployees(safeEmployees);
      setIncludedEmployees(safeEmployees.map((e: any) => e.id));
    } catch (error: any) {
      if (error?.status === 401) {
        navigate("/auth");
        return;
      }
      if (error?.status === 403) {
        setDepartmentEmployees([]);
        setIncludedEmployees([]);
        return;
      }
      toast({ title: "Error loading department employees", variant: "destructive" });
    }
  };

  // Cycle management functions
  const handleCycleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (
      cycleFormData.review_period_start &&
      cycleFormData.review_period_end &&
      cycleFormData.review_period_end < cycleFormData.review_period_start
    ) {
      toast({
        title: "Invalid review period",
        description: "Review Period End must be on or after Review Period Start.",
        variant: "destructive",
      });
      return;
    }

    const cyclePayload = {
      cycleName: cycleFormData.cycle_name,
      description: cycleFormData.description,
      cycleType: cycleFormData.cycle_type,
      startDate: cycleFormData.start_date,
      endDate: cycleFormData.end_date,
      reviewPeriodStart: cycleFormData.review_period_start || null,
      reviewPeriodEnd: cycleFormData.review_period_end || null,
      financialWeight: cycleFormData.financial_weight,
      nonFinancialWeight: cycleFormData.non_financial_weight,
      autoCreateEvaluations: cycleFormData.auto_create_evaluations,
      status: cycleFormData.status,
    };

    try {
      let cycleId: number;

      if (editingCycle) {
        await apiFetch('PATCH', `/evaluation-cycles/${editingCycle.id}`, cyclePayload);
        cycleId = editingCycle.id;
        
        toast({
          title: "Cycle Updated",
          description: "Evaluation cycle has been updated successfully.",
        });
      } else {
        const data = await apiFetch('POST', "/evaluation-cycles", cyclePayload);
        cycleId = data.id;
        
        toast({
          title: "Cycle Created",
          description: "New evaluation cycle has been created successfully.",
        });
      }

      if (cycleFormData.auto_create_evaluations && cycleFormData.status === "active") {
        toast({
          title: "Creating Evaluations",
          description: "Creating evaluations for all active employees...",
        });

        try {
          const functionData = await apiFetch('POST', "/create-cycle-evaluations", { cycleId });

          toast({
            title: "Evaluations Created",
            description: functionData.message || `Created ${functionData.created} evaluation(s)`,
          });
        } catch (functionError) {
          console.error("Error creating evaluations:", functionError);
          toast({
            title: "Warning",
            description: "Cycle created but failed to auto-create evaluations.",
            variant: "destructive",
          });
        }
      }

      setDialogOpen(false);
      setEditingCycle(null);
      setCycleFormData({
        cycle_name: "",
        description: "",
        cycle_type: "quarterly",
        start_date: "",
        end_date: "",
        review_period_start: "",
        review_period_end: "",
        financial_weight: 70,
        non_financial_weight: 30,
        auto_create_evaluations: false,
        status: "draft",
      });
      loadCycles();
    } catch (error: any) {
      console.error("Error saving cycle:", error);
      toast({
        title: "Error",
        description: error?.message || "Failed to save evaluation cycle.",
        variant: "destructive",
      });
    }
  };

  const handleEdit = (cycle: any) => {
    setEditingCycle(cycle);
    setCycleFormData({
      cycle_name: cycle.cycle_name,
      description: cycle.description || "",
      cycle_type: cycle.cycle_type,
      start_date: cycle.start_date,
      end_date: cycle.end_date,
      review_period_start: cycle.review_period_start || "",
      review_period_end: cycle.review_period_end || "",
      financial_weight: cycle.financial_weight || 70,
      non_financial_weight: cycle.non_financial_weight || 30,
      auto_create_evaluations: cycle.auto_create_evaluations || false,
      status: cycle.status,
    });
    setDialogOpen(true);
  };

  const handleStatusChange = async (cycleId: string, newStatus: string) => {
    try {
      const cycle = normalizeCycle(await apiFetch('GET', `/evaluation-cycles/${cycleId}`));

      await apiFetch('PATCH', `/evaluation-cycles/${cycleId}`, { status: newStatus });

      toast({
        title: "Status Updated",
        description: "Cycle status has been updated.",
      });

      if (newStatus === "active" && cycle?.auto_create_evaluations) {
        toast({
          title: "Creating Evaluations",
          description: "Creating evaluations for all active employees...",
        });

        try {
          const functionData = await apiFetch('POST', "/create-cycle-evaluations", { cycleId });

          toast({
            title: "Evaluations Created",
            description: functionData.message || `Created ${functionData.created} evaluation(s)`,
          });
        } catch (functionError) {
          console.error("Error creating evaluations:", functionError);
          toast({
            title: "Warning",
            description: "Cycle activated but failed to auto-create evaluations.",
            variant: "destructive",
          });
        }
      }

      loadCycles();
    } catch (error: any) {
      console.error("Error updating status:", error);
      toast({
        title: "Error",
        description: error?.message || "Failed to update cycle status.",
        variant: "destructive",
      });
    }
  };

  // Ad-hoc evaluation functions
  const handlePublishAdHoc = async () => {
    if (!evaluationName.trim()) {
      toast({ title: "Please enter an evaluation name", variant: "destructive" });
      return;
    }

    if (evaluationTarget === "department" && !selectedDepartmentId) {
      toast({ title: "Please select a department", variant: "destructive" });
      return;
    }

    if (evaluationTarget === "department" && includedEmployees.length === 0) {
      toast({ title: "Please include at least one employee", variant: "destructive" });
      return;
    }

    if (evaluationTarget === "individual" && (selectedEvaluators.length === 0 || selectedEvaluatees.length === 0)) {
      toast({ title: "Please select evaluators and evaluatees", variant: "destructive" });
      return;
    }

    if (!learningWeightsValid) {
      toast({
        title: "Adjust learning weights",
        description: "Evaluation + OKR + Feedback must total 100%.",
        variant: "destructive",
      });
      return;
    }

    setAdHocLoading(true);
    try {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + dueDateDays);

      const evaluationResponse = await apiFetch("POST", "/evaluation-definitions", {
        name: evaluationName,
        description: evaluationTarget === "department" ? "Department evaluation" : "Individual evaluation",
        cycleId: null,
        departmentId: evaluationTarget === "department" ? Number(selectedDepartmentId) : null,
        enableSelfEvaluation: enableSelf,
        enablePeerEvaluation: enablePeer,
        enableUpwardEvaluation: enableUpward,
        enableDownwardEvaluation: enableDownward,
        enableClientEvaluation: enableClientEvaluation,
        dueDate: dueDate.toISOString(),
        processAnonymously: processAnonymously,
        hideFromDashboard: hideFromDashboard,
        excludeFromScore: excludeFromScore,
        requireEvaluatorSignature: requireEvaluatorSignature,
        requireEvaluateeSignature: sendSignatureToEvaluatee,
        status: "published",
        scoringConfig: {
          evaluationTarget,
          requireAllKpis,
          cancelIfNotProcessed,
          sendSignatureToEvaluatee,
          sendSignatureToManagers,
          sendSignatureToDownward,
          peerAssignmentMode,
          peersPerPerson,
          learningGrowthBreakdown: {
            evaluation: evaluationWeight,
            okr: okrWeight,
            feedback: feedbackWeight,
          },
        },
      });
      const evaluation = (evaluationResponse as any)?.data ?? evaluationResponse;

      const assignments: Array<{
        evaluationDefinitionId: number;
        evaluatorProfileId: number;
        evaluateeProfileId: number;
        evaluatorType: string;
      }> = [];
      const finalEvaluators = evaluationTarget === "department" ? includedEmployees : selectedEvaluators;
      const finalEvaluatees = evaluationTarget === "department" ? includedEmployees : selectedEvaluatees;

      for (const evaluatorId of finalEvaluators) {
        for (const evaluateeId of finalEvaluatees) {
          if (enableDownward) {
            assignments.push({
              evaluationDefinitionId: evaluation.id,
              evaluatorProfileId: Number(evaluatorId),
              evaluateeProfileId: Number(evaluateeId),
              evaluatorType: "manager",
            });
          }
          if (enablePeer && evaluatorId !== evaluateeId) {
            assignments.push({
              evaluationDefinitionId: evaluation.id,
              evaluatorProfileId: Number(evaluatorId),
              evaluateeProfileId: Number(evaluateeId),
              evaluatorType: "peer",
            });
          }
          if (enableUpward && evaluatorId !== evaluateeId) {
            assignments.push({
              evaluationDefinitionId: evaluation.id,
              evaluatorProfileId: Number(evaluatorId),
              evaluateeProfileId: Number(evaluateeId),
              evaluatorType: "direct_report",
            });
          }
          if (enableSelf && evaluatorId === evaluateeId) {
            assignments.push({
              evaluationDefinitionId: evaluation.id,
              evaluatorProfileId: Number(evaluatorId),
              evaluateeProfileId: Number(evaluateeId),
              evaluatorType: "self",
            });
          }
        }
      }

      if (assignments.length > 0) {
        await apiFetch("POST", "/evaluation-assignments", assignments);
      }

      // KPI weighting integration will be wired to evaluation definitions in Phase B2.

      toast({ title: "Evaluation published successfully" });
      
      // Reset form
      setEvaluationName("");
      setEvaluationTarget("individual");
      setSelectedDepartmentId("");
      setDepartmentEmployees([]);
      setIncludedEmployees([]);
      setSelectedEvaluators([]);
      setSelectedEvaluatees([]);
      setSelectedKpis([]);
    } catch (error) {
      console.error("Error publishing:", error);
      toast({ title: "Error publishing evaluation", variant: "destructive" });
    } finally {
      setAdHocLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-success">Active</Badge>;
      case "closed":
        return <Badge variant="secondary">Closed</Badge>;
      default:
        return <Badge variant="outline">Draft</Badge>;
    }
  };

  const getCycleTypeLabel = (type: string) => {
    switch (type) {
      case "quarterly":
        return "Quarterly";
      case "annual":
        return "Annual";
      case "project":
        return "Project-Based";
      default:
        return type;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Evaluation Management</h1>
          <p className="text-muted-foreground">
            Manage evaluation cycles, create evaluations, and launch ad-hoc assessments
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="cycles">Evaluation Cycles</TabsTrigger>
            <TabsTrigger value="create">Create Evaluation</TabsTrigger>
            <TabsTrigger value="adhoc">Ad-hoc Evaluation</TabsTrigger>
          </TabsList>

          {/* EVALUATION CYCLES TAB */}
          <TabsContent value="cycles" className="space-y-4">
            <div className="flex justify-end">
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={() => {
                    setEditingCycle(null);
                    setCycleFormData({
                      cycle_name: "",
                      description: "",
                      cycle_type: "quarterly",
                      start_date: "",
                      end_date: "",
                      review_period_start: "",
                      review_period_end: "",
                      financial_weight: 70,
                      non_financial_weight: 30,
                      auto_create_evaluations: false,
                      status: "draft",
                    });
                  }}>
                    <Plus className="h-4 w-4 mr-2" />
                    New Cycle
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh]">
                  <DialogHeader>
                    <DialogTitle>
                      {editingCycle ? "Edit Evaluation Cycle" : "Create New Evaluation Cycle"}
                    </DialogTitle>
                    <DialogDescription>
                      Define the evaluation period for performance reviews
                    </DialogDescription>
                  </DialogHeader>
                  <ScrollArea className="max-h-[calc(90vh-120px)] pr-4">
                    <form onSubmit={handleCycleSubmit} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="cycle_name">Cycle Name</Label>
                        <Input
                          id="cycle_name"
                          value={cycleFormData.cycle_name}
                          onChange={(e) => setCycleFormData({ ...cycleFormData, cycle_name: e.target.value })}
                          placeholder="e.g., Q1 2025"
                          required
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="description">Description</Label>
                        <Input
                          id="description"
                          value={cycleFormData.description}
                          onChange={(e) => setCycleFormData({ ...cycleFormData, description: e.target.value })}
                          placeholder="Optional description"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="cycle_type">Cycle Type</Label>
                        <Select
                          value={cycleFormData.cycle_type}
                          onValueChange={(value) => setCycleFormData({ ...cycleFormData, cycle_type: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="quarterly">Quarterly</SelectItem>
                            <SelectItem value="annual">Annual</SelectItem>
                            <SelectItem value="project">Project-Based</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="start_date">Start Date</Label>
                          <Input
                            id="start_date"
                            type="date"
                            value={cycleFormData.start_date}
                            onChange={(e) => setCycleFormData({ ...cycleFormData, start_date: e.target.value })}
                            required
                          />
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor="end_date">End Date</Label>
                          <Input
                            id="end_date"
                            type="date"
                            value={cycleFormData.end_date}
                            onChange={(e) => setCycleFormData({ ...cycleFormData, end_date: e.target.value })}
                            required
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="review_period_start">Review Period Start</Label>
                          <Input
                            id="review_period_start"
                            type="date"
                            value={cycleFormData.review_period_start}
                            onChange={(e) => setCycleFormData({ ...cycleFormData, review_period_start: e.target.value })}
                          />
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor="review_period_end">Review Period End</Label>
                          <Input
                            id="review_period_end"
                            type="date"
                            value={cycleFormData.review_period_end}
                            onChange={(e) => setCycleFormData({ ...cycleFormData, review_period_end: e.target.value })}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="financial_weight">Financial Weight (%)</Label>
                          <Input
                            id="financial_weight"
                            type="number"
                            min="0"
                            max="100"
                            value={cycleFormData.financial_weight}
                            onChange={(e) => setCycleFormData({ ...cycleFormData, financial_weight: Number(e.target.value) })}
                          />
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor="non_financial_weight">Non-Financial Weight (%)</Label>
                          <Input
                            id="non_financial_weight"
                            type="number"
                            min="0"
                            max="100"
                            value={cycleFormData.non_financial_weight}
                            onChange={(e) => setCycleFormData({ ...cycleFormData, non_financial_weight: Number(e.target.value) })}
                          />
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="auto_create_evaluations"
                          checked={cycleFormData.auto_create_evaluations}
                          onCheckedChange={(checked) => setCycleFormData({ ...cycleFormData, auto_create_evaluations: !!checked })}
                        />
                        <Label htmlFor="auto_create_evaluations" className="text-sm font-normal">
                          Auto-create evaluations for all active employees
                        </Label>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="status">Status</Label>
                        <Select
                          value={cycleFormData.status}
                          onValueChange={(value) => setCycleFormData({ ...cycleFormData, status: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="draft">Draft</SelectItem>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="closed">Closed</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex gap-2 pt-4">
                        <Button type="submit" className="flex-1">
                          {editingCycle ? "Update Cycle" : "Create Cycle"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setDialogOpen(false)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </form>
                  </ScrollArea>
                </DialogContent>
              </Dialog>
            </div>

            {loading ? (
              <Card>
                <CardContent className="p-8">
                  <div className="text-center text-muted-foreground">Loading cycles...</div>
                </CardContent>
              </Card>
            ) : cycles.length === 0 ? (
              <Card>
                <CardContent className="p-8">
                  <div className="text-center text-muted-foreground">
                    No evaluation cycles yet. Create one to get started.
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {cycles.map((cycle) => (
                  <Card key={cycle.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            <Calendar className="h-5 w-5 text-primary" />
                            {cycle.cycle_name}
                          </CardTitle>
                          <CardDescription>
                            {getCycleTypeLabel(cycle.cycle_type)} -{" "}
                            {cycle.start_date ? format(new Date(cycle.start_date), "MMM d, yyyy") : "N/A"} -{" "}
                            {cycle.end_date ? format(new Date(cycle.end_date), "MMM d, yyyy") : "N/A"}
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          {getStatusBadge(cycle.status)}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEdit(cycle)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex gap-2">
                        {cycle.status !== "active" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleStatusChange(cycle.id, "active")}
                          >
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                            Activate
                          </Button>
                        )}
                        {cycle.status === "active" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleStatusChange(cycle.id, "closed")}
                          >
                            <XCircle className="h-4 w-4 mr-2" />
                            Close
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* CREATE EVALUATION TAB */}
          <TabsContent value="create" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Create Standard Evaluation</CardTitle>
                <CardDescription>
                  Link evaluations to existing cycles and assign to employees
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Standard evaluations are managed through the "Create Evaluation" flow.
                  Navigate to your evaluation cycles and use auto-create or manual assignment features.
                </p>
                <Button className="mt-4" onClick={() => navigate("/create-evaluation")}>
                  Go to Create Evaluation
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* AD-HOC EVALUATION TAB */}
          <TabsContent value="adhoc" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={handlePublishAdHoc} disabled={adHocLoading}>
                <Send className="mr-2 h-4 w-4" />
                Publish Evaluation
              </Button>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Basic Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Evaluation Name</Label>
                  <Input
                    placeholder="Enter evaluation name"
                    value={evaluationName}
                    onChange={(e) => setEvaluationName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Evaluation Target</Label>
                  <Select value={evaluationTarget} onValueChange={(value: "individual" | "department") => setEvaluationTarget(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="individual">Individual</SelectItem>
                      <SelectItem value="department">Department / Team</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {evaluationTarget === "department" && (
                  <div className="space-y-2">
                    <Label>Select Department</Label>
                    <Select value={selectedDepartmentId} onValueChange={setSelectedDepartmentId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a department" />
                      </SelectTrigger>
                      <SelectContent>
                        {departmentOptions.map((dept) => (
                          <SelectItem key={dept.id} value={dept.id}>
                            {dept.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </CardContent>
            </Card>

            {evaluationTarget === "department" && selectedDepartmentId && (
              <Card>
                <CardHeader>
                  <CardTitle>Team Members</CardTitle>
                  <CardDescription>
                    Select which employees to include in this team evaluation
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[300px] pr-4">
                    <div className="space-y-2">
                      {safeDepartmentEmployees.map((emp) => (
                        <div key={emp.id} className="flex items-center space-x-2 p-2 hover:bg-muted rounded">
                          <Checkbox
                            checked={includedEmployees.includes(emp.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setIncludedEmployees([...includedEmployees, emp.id]);
                              } else {
                                setIncludedEmployees(includedEmployees.filter(id => id !== emp.id));
                              }
                            }}
                          />
                          <div className="flex-1">
                            <p className="font-medium">{emp.first_name} {emp.last_name}</p>
                            {emp.position && <p className="text-sm text-muted-foreground">{emp.position}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}

            {evaluationTarget === "individual" && (
              <div className="grid gap-6 md:grid-cols-2">
                <Card>
                <CardHeader>
                  <CardTitle>Evaluators</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Downward evaluators - Managers or supervisors</Label>
                      <Switch checked={enableDownward} onCheckedChange={setEnableDownward} />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label>Upward evaluators - Direct reports or subordinates</Label>
                      <Switch checked={enableUpward} onCheckedChange={setEnableUpward} />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label>Peer evaluators - Peers at the same level</Label>
                      <Switch checked={enablePeer} onCheckedChange={setEnablePeer} />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label>Self evaluation</Label>
                      <Switch checked={enableSelf} onCheckedChange={setEnableSelf} />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label>Client evaluation (survey-based)</Label>
                      <Switch
                        checked={enableClientEvaluation}
                        onCheckedChange={setEnableClientEvaluation}
                      />
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label>Select evaluator(s)</Label>
                    <Select onValueChange={(value) => {
                      if (!selectedEvaluators.includes(value)) {
                        setSelectedEvaluators([...selectedEvaluators, value]);
                      }
                    }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select evaluators" />
                      </SelectTrigger>
                      <SelectContent>
                        {employeeOptions.map((emp) => (
                          <SelectItem key={emp.id} value={emp.id}>
                            {emp.first_name} {emp.last_name} {emp.position ? `- ${emp.position}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {selectedEvaluators.map((id) => {
                        const emp = employeeOptions.find(e => e.id === id);
                        return (
                          <div key={id} className="bg-secondary px-3 py-1 rounded-md text-sm flex items-center gap-2">
                            {emp?.first_name} {emp?.last_name}
                            <button onClick={() => setSelectedEvaluators(selectedEvaluators.filter(e => e !== id))}>Ã—</button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Persons to be evaluated</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Select person(s) to be evaluated</Label>
                    <Select onValueChange={(value) => {
                      if (!selectedEvaluatees.includes(value)) {
                        setSelectedEvaluatees([...selectedEvaluatees, value]);
                      }
                    }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select persons" />
                      </SelectTrigger>
                      <SelectContent>
                        {employeeOptions.map((emp) => (
                          <SelectItem key={emp.id} value={emp.id}>
                            {emp.first_name} {emp.last_name} {emp.position ? `- ${emp.position}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {selectedEvaluatees.map((id) => {
                        const emp = employeeOptions.find(e => e.id === id);
                        return (
                          <div key={id} className="bg-secondary px-3 py-1 rounded-md text-sm flex items-center gap-2">
                            {emp?.first_name} {emp?.last_name}
                            <button onClick={() => setSelectedEvaluatees(selectedEvaluatees.filter(e => e !== id))}>Ã—</button>
                          </div>
                        );
                      })}
                    </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            <Card>
              <CardHeader>
                <CardTitle>360 Assignment Rules</CardTitle>
                <CardDescription>Controls how peers are selected during auto assignment</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Peer assignment mode</Label>
                  <Select
                    value={peerAssignmentMode}
                    onValueChange={(value) =>
                      setPeerAssignmentMode(value as "manager" | "department" | "any")
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select mode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manager">Same manager</SelectItem>
                      <SelectItem value="department">Same department</SelectItem>
                      <SelectItem value="any">Any peer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Peers per person</Label>
                  <Input
                    type="number"
                    min="1"
                    max="10"
                    value={peersPerPerson}
                    onChange={(e) => setPeersPerPerson(Number(e.target.value) || 1)}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Due Date & Processing Options</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <Input
                    type="number"
                    value={dueDateDays}
                    onChange={(e) => setDueDateDays(parseInt(e.target.value) || 7)}
                    className="w-24"
                  />
                  <Label>Day(s)</Label>
                </div>
                <p className="text-sm text-muted-foreground">
                  This will be used to send 2 reminder emails to all evaluators
                </p>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Cancel evaluations if not processed by due date</Label>
                    <Switch checked={cancelIfNotProcessed} onCheckedChange={setCancelIfNotProcessed} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Process all evaluations anonymously</Label>
                    <Switch checked={processAnonymously} onCheckedChange={setProcessAnonymously} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Hide this evaluation from the evaluated person's dashboard</Label>
                    <Switch checked={hideFromDashboard} onCheckedChange={setHideFromDashboard} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>All key performance indicators require an answer</Label>
                    <Switch checked={requireAllKpis} onCheckedChange={setRequireAllKpis} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Exclude evaluations from score computation</Label>
                    <Switch checked={excludeFromScore} onCheckedChange={setExcludeFromScore} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Learning &amp; Growth Weights</CardTitle>
                <CardDescription>Set OKR vs evaluation vs feedback weighting</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Evaluation Weight (%)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={evaluationWeight}
                    onChange={(e) => setEvaluationWeight(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>OKR Weight (%)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={okrWeight}
                    onChange={(e) => setOkrWeight(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Feedback Weight (%)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={feedbackWeight}
                    onChange={(e) => setFeedbackWeight(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-2 md:col-span-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Total</span>
                    <span className={learningWeightsValid ? "text-success" : "text-destructive"}>
                      {learningWeightTotal}%
                    </span>
                  </div>
                  {!learningWeightsValid && (
                    <p className="text-xs text-destructive">
                      Weights must sum to 100% for scoring to be valid.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Signature Options</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Make signatures mandatory for the evaluator</Label>
                  <Switch checked={requireEvaluatorSignature} onCheckedChange={setRequireEvaluatorSignature} />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Send a signature request to the person being evaluated</Label>
                  <Switch checked={sendSignatureToEvaluatee} onCheckedChange={setSendSignatureToEvaluatee} />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Send a signature request to all team managers</Label>
                  <Switch checked={sendSignatureToManagers} onCheckedChange={setSendSignatureToManagers} />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Send a signature request to downward evaluators</Label>
                  <Switch checked={sendSignatureToDownward} onCheckedChange={setSendSignatureToDownward} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default EvaluationManagement;

