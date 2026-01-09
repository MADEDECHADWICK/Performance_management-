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
}

interface KPI {
  id: string;
  name: string;
  category: string;
}

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
  
  // Processing options
  const [processAnonymously, setProcessAnonymously] = useState(false);
  const [hideFromDashboard, setHideFromDashboard] = useState(false);
  const [requireAllKPIs, setRequireAllKPIs] = useState(false);
  const [excludeFromScore, setExcludeFromScore] = useState(false);
  
  // Signature options
  const [requireEvaluatorSignature, setRequireEvaluatorSignature] = useState(false);
  const [requireEvaluateeSignature, setRequireEvaluateeSignature] = useState(false);
  const [sendToEvaluatee, setSendToEvaluatee] = useState(false);
  const [sendToManagers, setSendToManagers] = useState(false);
  const [sendToDownward, setSendToDownward] = useState(false);
  
  // Assignments
  const [selectedEvaluators, setSelectedEvaluators] = useState<string[]>([]);
  const [selectedEvaluatees, setSelectedEvaluatees] = useState<string[]>([]);
  
  // Result areas (KPIs)
  const [selectedKpis, setSelectedKpis] = useState<Array<{ kpi_id: string; weight: number }>>([]);

  useEffect(() => {
    loadTemplates();
    loadEmployees();
    loadKPIs();
  }, []);

  const loadTemplates = async () => {
    const data = await apiFetch('/evaluation_templates?is_active=true');
    setTemplates(data || []);
  };

  const loadEmployees = async () => {
    const data = await apiFetch('/profiles?status=active');
    setEmployees(data || []);
  };

  const loadKPIs = async () => {
    const data = await apiFetch('/kpis?is_active=true');
    setKPIs(data || []);
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

    if (selectedEvaluators.length === 0 || selectedEvaluatees.length === 0) {
      toast({ title: "Please select evaluators and evaluatees", variant: "destructive" });
      return;
    }

    setLoading(true);

    try {
      const user = await authAPI.me();
      
      // Create evaluation
      const evaluation = await apiFetch('/ad_hoc_evaluations', {
        method: 'POST',
        body: JSON.stringify({
          name: evaluationName,
          created_by: user?.id,
          enable_self_evaluation: enableSelf,
          enable_peer_evaluation: enablePeer,
          enable_upward_evaluation: enableUpward,
          enable_downward_evaluation: enableDownward,
          due_date: dueDate,
          process_anonymously: processAnonymously,
          hide_from_dashboard: hideFromDashboard,
          require_all_kpis: requireAllKPIs,
          exclude_from_score: excludeFromScore,
          require_evaluator_signature: requireEvaluatorSignature,
          require_evaluatee_signature: requireEvaluateeSignature,
          send_signature_to_evaluatee: sendToEvaluatee,
          send_signature_to_managers: sendToManagers,
          send_signature_to_downward_evaluators: sendToDownward,
          status: "published",
          published_at: new Date().toISOString()
        })
      });

      // Create assignments
      const assignments = [];
      for (const evaluatorId of selectedEvaluators) {
        for (const evaluateeId of selectedEvaluatees) {
          if (enableDownward) {
            assignments.push({
              ad_hoc_evaluation_id: evaluation.id,
              evaluator_id: evaluatorId,
              evaluatee_id: evaluateeId,
              evaluation_type: "downward"
            });
          }
          if (enablePeer && evaluatorId !== evaluateeId) {
            assignments.push({
              ad_hoc_evaluation_id: evaluation.id,
              evaluator_id: evaluatorId,
              evaluatee_id: evaluateeId,
              evaluation_type: "peer"
            });
          }
        }
      }

      if (enableSelf) {
        for (const evaluateeId of selectedEvaluatees) {
          assignments.push({
            ad_hoc_evaluation_id: evaluation.id,
            evaluator_id: evaluateeId,
            evaluatee_id: evaluateeId,
            evaluation_type: "self"
          });
        }
      }

      if (assignments.length > 0) {
        await apiFetch('/evaluation_assignments', { method: 'POST', body: JSON.stringify(assignments) });
      }

      // Add KPIs
      if (selectedKpis.length > 0) {
        const resultAreas = selectedKpis.map(kpi => ({
          ad_hoc_evaluation_id: evaluation.id,
          kpi_id: kpi.kpi_id,
          weight: kpi.weight
        }));

        await apiFetch('/evaluation_result_areas', { method: 'POST', body: JSON.stringify(resultAreas) });
      }

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
          const user = await authAPI.me();
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
                  {templates.map(template => (
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Assign Evaluators</CardTitle>
          </CardHeader>
          <CardContent>
            <Select onValueChange={(value) => setSelectedEvaluators([...selectedEvaluators, value])}>
              <SelectTrigger>
                <SelectValue placeholder="Select evaluators" />
              </SelectTrigger>
              <SelectContent>
                {employees.map(emp => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.first_name} {emp.last_name} - {emp.position}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="mt-2 flex flex-wrap gap-2">
              {selectedEvaluators.map(id => {
                const emp = employees.find(e => e.id === id);
                return emp ? (
                  <span key={id} className="inline-flex items-center gap-1 bg-secondary px-2 py-1 rounded">
                    {emp.first_name} {emp.last_name}
                    <X className="h-4 w-4 cursor-pointer" onClick={() => setSelectedEvaluators(selectedEvaluators.filter(e => e !== id))} />
                  </span>
                ) : null;
              })}
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
                {employees.map(emp => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.first_name} {emp.last_name} - {emp.position}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="mt-2 flex flex-wrap gap-2">
              {selectedEvaluatees.map(id => {
                const emp = employees.find(e => e.id === id);
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
                {kpis.map(kpi => (
                  <SelectItem key={kpi.id} value={kpi.id}>
                    {kpi.name} ({kpi.category})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedKpis.map(({ kpi_id, weight }) => {
              const kpi = kpis.find(k => k.id === kpi_id);
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