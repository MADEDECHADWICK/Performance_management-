import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { apiFetch, authAPI } from "@/integrations/apiClient";
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

  useEffect(() => {
    loadCycles();
    loadEmployees();
    loadKPIs();
    loadDepartments();
  }, []);

  useEffect(() => {
    if (selectedDepartmentId && evaluationTarget === "department") {
      loadDepartmentEmployees(selectedDepartmentId);
    }
  }, [selectedDepartmentId, evaluationTarget]);

  const loadCycles = async () => {
    try {
      const data = await apiFetch('GET', "/evaluation-cycles");
      setCycles(data || []);
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
      const data = await apiFetch('GET', "/profiles?status=active");
      setEmployees(data || []);
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
      const data = await apiFetch('GET', "/kpis?is_active=true");
      setKpis(data || []);
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
      const data = await apiFetch('GET', "/departments");
      setDepartments(data || []);
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
      const data = await apiFetch('GET', `/profiles?department_id=${deptId}&status=active`);
      setDepartmentEmployees(data || []);
      setIncludedEmployees((data || []).map((e: any) => e.id));
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
    
    try {
      let cycleId: string;

      if (editingCycle) {
        await apiFetch('PATCH', `/evaluation-cycles/${editingCycle.id}`, cycleFormData);
        cycleId = editingCycle.id;
        
        toast({
          title: "Cycle Updated",
          description: "Evaluation cycle has been updated successfully.",
        });
      } else {
        const data = await apiFetch('POST', "/evaluation-cycles", cycleFormData);
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
        description: "Failed to save evaluation cycle.",
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
      const cycle = await apiFetch('GET', `/evaluation-cycles/${cycleId}`);

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
        description: "Failed to update cycle status.",
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
        cycleId: selectedCycleId ? Number(selectedCycleId) : null,
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
        requireEvaluateeSignature: requireEvaluateeSignature,
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
        await apiFetch("POST", "/evaluation_assignments", assignments);
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
                      name: "",
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
                            {cycle.name}
                          </CardTitle>
                          <CardDescription>
                            {getCycleTypeLabel(cycle.cycle_type)} • {" "}
                            {format(new Date(cycle.start_date), "MMM d, yyyy")} - {" "}
                            {format(new Date(cycle.end_date), "MMM d, yyyy")}
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
                        {departments.map((dept) => (
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
                      {departmentEmployees.map((emp) => (
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
                        {employees.map((emp) => (
                          <SelectItem key={emp.id} value={emp.id}>
                            {emp.first_name} {emp.last_name} {emp.position ? `- ${emp.position}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {selectedEvaluators.map((id) => {
                        const emp = employees.find(e => e.id === id);
                        return (
                          <div key={id} className="bg-secondary px-3 py-1 rounded-md text-sm flex items-center gap-2">
                            {emp?.first_name} {emp?.last_name}
                            <button onClick={() => setSelectedEvaluators(selectedEvaluators.filter(e => e !== id))}>×</button>
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
                        {employees.map((emp) => (
                          <SelectItem key={emp.id} value={emp.id}>
                            {emp.first_name} {emp.last_name} {emp.position ? `- ${emp.position}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {selectedEvaluatees.map((id) => {
                        const emp = employees.find(e => e.id === id);
                        return (
                          <div key={id} className="bg-secondary px-3 py-1 rounded-md text-sm flex items-center gap-2">
                            {emp?.first_name} {emp?.last_name}
                            <button onClick={() => setSelectedEvaluatees(selectedEvaluatees.filter(e => e !== id))}>×</button>
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

