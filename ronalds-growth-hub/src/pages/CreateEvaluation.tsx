import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import apiFetch, { authAPI } from "@/integrations/apiClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import DashboardLayout from "@/components/DashboardLayout";
import { Loader2, Plus, X } from "lucide-react";

interface Template {
  id: string;
  name: string;
  description: string;
  template_type: string;
  bsc_category: string;
  competencies: any;
}

interface Profile {
  id: string;
  first_name: string;
  last_name: string;
  position: string;
  department_id?: number | null;
  manager_id?: number | null;
}

interface KPI {
  id: string;
  name: string;
  category: string;
}

const extractItems = (payload: any) => {
  const data = payload?.data ?? payload;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  return [];
};

export default function CreateEvaluation() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [kpis, setKPIs] = useState<KPI[]>([]);
  
  const [evaluationName, setEvaluationName] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [dueDate, setDueDate] = useState("");
  
  // Evaluation types
  const [enableSelf, setEnableSelf] = useState(false);
  const [enablePeer, setEnablePeer] = useState(false);
  const [enableUpward, setEnableUpward] = useState(false);
  const [enableDownward, setEnableDownward] = useState(true);
  const [enableClientEvaluation, setEnableClientEvaluation] = useState(false);
  
  // Processing options
  const [processAnonymously, setProcessAnonymously] = useState(false);
  const [hideFromDashboard, setHideFromDashboard] = useState(false);
  const [requireAllKPIs, setRequireAllKPIs] = useState(false);
  const [excludeFromScore, setExcludeFromScore] = useState(false);
  const [cancelIfNotProcessed, setCancelIfNotProcessed] = useState(false);

  const [okrWeight, setOkrWeight] = useState(30);
  const [evaluationWeight, setEvaluationWeight] = useState(50);
  const [feedbackWeight, setFeedbackWeight] = useState(20);
  const learningWeightTotal = evaluationWeight + okrWeight + feedbackWeight;
  const learningWeightsValid = learningWeightTotal === 100;

  // Signature options
  const [requireEvaluatorSignature, setRequireEvaluatorSignature] = useState(false);
  const [requireEvaluateeSignature, setRequireEvaluateeSignature] = useState(false);
  const [sendToEvaluatee, setSendToEvaluatee] = useState(false);
  const [sendToManagers, setSendToManagers] = useState(false);
  const [sendToDownward, setSendToDownward] = useState(false);
  
  // Assignments (360)
  const [selectedPeerEvaluators, setSelectedPeerEvaluators] = useState<string[]>([]);
  const [selectedUpwardEvaluators, setSelectedUpwardEvaluators] = useState<string[]>([]);
  const [selectedDownwardEvaluators, setSelectedDownwardEvaluators] = useState<string[]>([]);
  const [selectedEvaluatees, setSelectedEvaluatees] = useState<string[]>([]);

  const [autoAssignManager, setAutoAssignManager] = useState(true);
  const [autoAssignPeers, setAutoAssignPeers] = useState(true);
  const [autoAssignDirectReports, setAutoAssignDirectReports] = useState(true);
  const [peerAssignmentMode, setPeerAssignmentMode] = useState<"manager" | "department" | "any">("department");
  const [peersPerPerson, setPeersPerPerson] = useState(2);
  
  // Result areas (KPIs)
  const [selectedKpis, setSelectedKpis] = useState<Array<{ kpi_id: string; weight: number }>>([]);
  const employeeOptions = Array.isArray(employees) ? employees : [];
  const templateOptions = Array.isArray(templates) ? templates : [];
  const kpiOptions = Array.isArray(kpis) ? kpis : [];

  useEffect(() => {
    loadTemplates();
    loadEmployees();
    loadKPIs();
  }, []);

  const loadTemplates = async () => {
    try {
      const data = await apiFetch('GET', '/evaluation_templates?is_active=true');
      setTemplates(extractItems(data));
    } catch (error) {
      console.log('Templates not available:', error);
      setTemplates([]);
    }
  };

  const loadEmployees = async () => {
    try {
      const data = await apiFetch('GET', '/profiles?status=active&page=1&pageSize=100');
      setEmployees(extractItems(data));
    } catch (error: any) {
      if (error?.status === 401) {
        navigate('/auth');
        return;
      }
      if (error?.status === 403) {
        setEmployees([]);
        return;
      }
      console.error('Failed to load employees:', error);
    }
  };

  const loadKPIs = async () => {
    try {
      const data = await apiFetch('GET', '/kpis?is_active=true');
      setKPIs(extractItems(data));
    } catch (error: any) {
      if (error?.status === 401) {
        navigate('/auth');
        return;
      }
      if (error?.status === 403) {
        setKPIs([]);
        return;
      }
      console.error('Failed to load KPIs:', error);
    }
  };

  const handleAddKPI = (kpiId: string) => {
    if (!selectedKpis.find(k => k.kpi_id === kpiId)) {
      setSelectedKpis([...selectedKpis, { kpi_id: kpiId, weight: 0 }]);
    }
  };

  const handleRemoveKPI = (kpiId: string) => {
    setSelectedKpis(selectedKpis.filter(k => k.kpi_id !== kpiId));
  };

  const handleWeightChange = (kpiId: string, weight: number) => {
    setSelectedKpis(selectedKpis.map(k => 
      k.kpi_id === kpiId ? { ...k, weight } : k
    ));
  };

  const handlePublish = async () => {
    if (!evaluationName.trim()) {
      toast({ title: "Evaluation name required", variant: "destructive" });
      return;
    }

    if (selectedEvaluatees.length === 0) {
      toast({ title: "Please select evaluatees", variant: "destructive" });
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

    setLoading(true);

    try {
      const user = await authAPI.me();
      
      // Create evaluation
      const evaluationResponse = await apiFetch('POST', '/evaluation-definitions', {
        name: evaluationName,
        description: "Ad-hoc evaluation",
        cycleId: null,
        departmentId: null,
        enableSelfEvaluation: enableSelf,
        enablePeerEvaluation: enablePeer,
        enableUpwardEvaluation: enableUpward,
        enableDownwardEvaluation: enableDownward,
        enableClientEvaluation: enableClientEvaluation,
        dueDate: dueDate || null,
        processAnonymously: processAnonymously,
        hideFromDashboard: hideFromDashboard,
        excludeFromScore: excludeFromScore,
        requireEvaluatorSignature: requireEvaluatorSignature,
        requireEvaluateeSignature: requireEvaluateeSignature,
        status: "published",
        scoringConfig: {
          requireAllKpis,
          cancelIfNotProcessed,
          sendToEvaluatee,
          sendToManagers,
          sendToDownward,
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

      // Create assignments
      const assignments: Array<{
        evaluationDefinitionId: number;
        evaluatorProfileId: number;
        evaluateeProfileId: number;
        evaluatorType: string;
      }> = [];

      const profileById = new Map(employeeOptions.map((emp) => [emp.id, emp]));

      const addAssignment = (evaluatorId: string, evaluateeId: string, type: string) => {
        if (!evaluatorId || evaluatorId === evaluateeId) return;
        assignments.push({
          evaluationDefinitionId: Number(evaluation.id),
          evaluatorProfileId: parseInt(evaluatorId),
          evaluateeProfileId: parseInt(evaluateeId),
          evaluatorType: type,
        });
      };

      for (const evaluateeId of selectedEvaluatees) {
        const evaluateeProfile = profileById.get(evaluateeId);
        const managerId =
          evaluateeProfile?.manager_id ?? (evaluateeProfile as any)?.managerId;
        const departmentId =
          evaluateeProfile?.department_id ?? (evaluateeProfile as any)?.departmentId;

        if (enableDownward) {
          if (autoAssignManager && managerId) {
            addAssignment(String(managerId), evaluateeId, "manager");
          } else {
            selectedDownwardEvaluators.forEach((evaluatorId) =>
              addAssignment(evaluatorId, evaluateeId, "manager")
            );
          }
        }

        if (enablePeer) {
          if (!autoAssignPeers && selectedPeerEvaluators.length > 0) {
            selectedPeerEvaluators.forEach((evaluatorId) =>
              addAssignment(evaluatorId, evaluateeId, "peer")
            );
          } else {
            let peerCandidates = employeeOptions.filter((emp) => emp.id !== evaluateeId);
            if (peerAssignmentMode === "manager" && managerId) {
              peerCandidates = peerCandidates.filter(
                (emp) =>
                  (emp.manager_id ?? (emp as any).managerId) &&
                  String(emp.manager_id ?? (emp as any).managerId) === String(managerId)
              );
            } else if (peerAssignmentMode === "department" && departmentId) {
              peerCandidates = peerCandidates.filter(
                (emp) =>
                  (emp.department_id ?? (emp as any).departmentId) &&
                  (emp.department_id ?? (emp as any).departmentId) === departmentId
              );
            }
            peerCandidates
              .slice(0, Math.max(1, peersPerPerson))
              .forEach((peer) => addAssignment(peer.id, evaluateeId, "peer"));
          }
        }

        if (enableUpward) {
          if (!autoAssignDirectReports && selectedUpwardEvaluators.length > 0) {
            selectedUpwardEvaluators.forEach((evaluatorId) =>
              addAssignment(evaluatorId, evaluateeId, "direct_report")
            );
          } else {
            const directReports = employeeOptions.filter(
              (emp) =>
                (emp.manager_id ?? (emp as any).managerId) &&
                String(emp.manager_id ?? (emp as any).managerId) === evaluateeId
            );
            directReports.forEach((report) => addAssignment(report.id, evaluateeId, "direct_report"));
          }
        }
      }

      const dedupedAssignments = Array.from(
        new Map(
          assignments.map((item) => [
            `${item.evaluationDefinitionId}-${item.evaluatorProfileId}-${item.evaluateeProfileId}-${item.evaluatorType}`,
            item,
          ])
        ).values()
      );

      if (enableSelf) {
        for (const evaluateeId of selectedEvaluatees) {
          dedupedAssignments.push({
            evaluationDefinitionId: Number(evaluation.id),
            evaluatorProfileId: parseInt(evaluateeId),
            evaluateeProfileId: parseInt(evaluateeId),
            evaluatorType: "self"
          });
        }
      }

      if (dedupedAssignments.length > 0) {
        await apiFetch('POST', '/evaluation_assignments', dedupedAssignments);
      }

      // KPI weighting is handled in Phase B2 via evaluation definitions.

      toast({ title: "Evaluation published successfully!" });
      navigate("/evaluations");
    } catch (error: any) {
      toast({ title: "Error publishing evaluation", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Create Evaluation</h1>
          <p className="text-muted-foreground">Configure and publish a new evaluation</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>Enter the evaluation details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Evaluation Name</Label>
              <Input
                value={evaluationName}
                onChange={(e) => setEvaluationName(e.target.value)}
                placeholder="e.g., Q1 2025 Performance Review"
              />
            </div>

            <div>
              <Label>Template (Optional)</Label>
              <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                <SelectTrigger>
                  <SelectValue placeholder="Select template" />
                </SelectTrigger>
                <SelectContent>
                  {templateOptions.map(template => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Due Date</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Evaluation Types</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Downward (Manager → Employee)</Label>
              <Switch checked={enableDownward} onCheckedChange={setEnableDownward} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Upward (Employee → Manager)</Label>
              <Switch checked={enableUpward} onCheckedChange={setEnableUpward} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Peer (Colleague → Colleague)</Label>
              <Switch checked={enablePeer} onCheckedChange={setEnablePeer} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Self-Evaluation</Label>
              <Switch checked={enableSelf} onCheckedChange={setEnableSelf} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Client Evaluation (Survey-based)</Label>
              <Switch checked={enableClientEvaluation} onCheckedChange={setEnableClientEvaluation} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Assign Evaluators (360)</CardTitle>
            <CardDescription>Auto-assign by reporting lines, or override with manual selections.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <Label>Auto-assign managers for downward reviews</Label>
              <Switch checked={autoAssignManager} onCheckedChange={setAutoAssignManager} />
            </div>

            <div className="space-y-2">
              <Label>Downward Evaluators (Override)</Label>
              <Select onValueChange={(value) => setSelectedDownwardEvaluators([...selectedDownwardEvaluators, value])}>
                <SelectTrigger>
                  <SelectValue placeholder="Select managers" />
                </SelectTrigger>
                <SelectContent>
                  {employeeOptions.map(emp => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.first_name} {emp.last_name} - {emp.position}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedDownwardEvaluators.map(id => {
                  const emp = employeeOptions.find(e => e.id === id);
                  return emp ? (
                    <span key={id} className="inline-flex items-center gap-1 bg-secondary px-2 py-1 rounded">
                      {emp.first_name} {emp.last_name}
                      <X className="h-4 w-4 cursor-pointer" onClick={() => setSelectedDownwardEvaluators(selectedDownwardEvaluators.filter(e => e !== id))} />
                    </span>
                  ) : null;
                })}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label>Auto-assign peers from same department</Label>
              <Switch checked={autoAssignPeers} onCheckedChange={setAutoAssignPeers} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
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
            </div>

            <div className="space-y-2">
              <Label>Peer Evaluators (Override)</Label>
              <Select onValueChange={(value) => setSelectedPeerEvaluators([...selectedPeerEvaluators, value])}>
                <SelectTrigger>
                  <SelectValue placeholder="Select peer evaluators" />
                </SelectTrigger>
                <SelectContent>
                  {employeeOptions.map(emp => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.first_name} {emp.last_name} - {emp.position}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedPeerEvaluators.map(id => {
                  const emp = employeeOptions.find(e => e.id === id);
                  return emp ? (
                    <span key={id} className="inline-flex items-center gap-1 bg-secondary px-2 py-1 rounded">
                      {emp.first_name} {emp.last_name}
                      <X className="h-4 w-4 cursor-pointer" onClick={() => setSelectedPeerEvaluators(selectedPeerEvaluators.filter(e => e !== id))} />
                    </span>
                  ) : null;
                })}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label>Auto-assign direct reports for upward reviews</Label>
              <Switch checked={autoAssignDirectReports} onCheckedChange={setAutoAssignDirectReports} />
            </div>

            <div className="space-y-2">
              <Label>Direct Reports (Override)</Label>
              <Select onValueChange={(value) => setSelectedUpwardEvaluators([...selectedUpwardEvaluators, value])}>
                <SelectTrigger>
                  <SelectValue placeholder="Select direct reports" />
                </SelectTrigger>
                <SelectContent>
                  {employeeOptions.map(emp => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.first_name} {emp.last_name} - {emp.position}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedUpwardEvaluators.map(id => {
                  const emp = employeeOptions.find(e => e.id === id);
                  return emp ? (
                    <span key={id} className="inline-flex items-center gap-1 bg-secondary px-2 py-1 rounded">
                      {emp.first_name} {emp.last_name}
                      <X className="h-4 w-4 cursor-pointer" onClick={() => setSelectedUpwardEvaluators(selectedUpwardEvaluators.filter(e => e !== id))} />
                    </span>
                  ) : null;
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Assign Evaluatees</CardTitle>
          </CardHeader>
          <CardContent>
            <Select onValueChange={(value) => setSelectedEvaluatees([...selectedEvaluatees, value])}>
              <SelectTrigger>
                <SelectValue placeholder="Select evaluatees" />
              </SelectTrigger>
              <SelectContent>
                {employeeOptions.map(emp => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.first_name} {emp.last_name} - {emp.position}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="mt-2 flex flex-wrap gap-2">
              {selectedEvaluatees.map(id => {
                const emp = employeeOptions.find(e => e.id === id);
                return emp ? (
                  <span key={id} className="inline-flex items-center gap-1 bg-secondary px-2 py-1 rounded">
                    {emp.first_name} {emp.last_name}
                    <X className="h-4 w-4 cursor-pointer" onClick={() => setSelectedEvaluatees(selectedEvaluatees.filter(e => e !== id))} />
                  </span>
                ) : null;
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Result Areas (KPIs)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select onValueChange={handleAddKPI}>
              <SelectTrigger>
                <SelectValue placeholder="Add KPI" />
              </SelectTrigger>
              <SelectContent>
                {kpiOptions.map(kpi => (
                  <SelectItem key={kpi.id} value={kpi.id}>
                    {kpi.name} ({kpi.category})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedKpis.map(({ kpi_id, weight }) => {
              const kpi = kpiOptions.find(k => k.id === kpi_id);
              return kpi ? (
                <div key={kpi_id} className="flex items-center gap-4 p-3 border rounded">
                  <div className="flex-1">
                    <p className="font-medium">{kpi.name}</p>
                    <p className="text-sm text-muted-foreground">{kpi.category}</p>
                  </div>
                  <div className="w-32">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={weight}
                      onChange={(e) => handleWeightChange(kpi_id, parseFloat(e.target.value))}
                      placeholder="Weight %"
                    />
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => handleRemoveKPI(kpi_id)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : null;
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Processing Options</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Process Anonymously</Label>
              <Switch checked={processAnonymously} onCheckedChange={setProcessAnonymously} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Hide from Dashboard</Label>
              <Switch checked={hideFromDashboard} onCheckedChange={setHideFromDashboard} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Cancel if Not Processed</Label>
              <Switch checked={cancelIfNotProcessed} onCheckedChange={setCancelIfNotProcessed} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Require All KPIs</Label>
              <Switch checked={requireAllKPIs} onCheckedChange={setRequireAllKPIs} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Exclude from Score</Label>
              <Switch checked={excludeFromScore} onCheckedChange={setExcludeFromScore} />
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
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Require Evaluator Signature</Label>
              <Switch checked={requireEvaluatorSignature} onCheckedChange={setRequireEvaluatorSignature} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Require Evaluatee Signature</Label>
              <Switch checked={requireEvaluateeSignature} onCheckedChange={setRequireEvaluateeSignature} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Send to Evaluatee</Label>
              <Switch checked={sendToEvaluatee} onCheckedChange={setSendToEvaluatee} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Send to Managers</Label>
              <Switch checked={sendToManagers} onCheckedChange={setSendToManagers} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Send to Downward Evaluators</Label>
              <Switch checked={sendToDownward} onCheckedChange={setSendToDownward} />
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-4">
          <Button onClick={handlePublish} disabled={loading} className="flex-1">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Publish Evaluation
          </Button>
          <Button variant="outline" onClick={() => navigate("/evaluations")}>
            Cancel
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
