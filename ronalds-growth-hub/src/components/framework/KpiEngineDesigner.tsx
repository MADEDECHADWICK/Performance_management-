import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Building2, Database, Landmark, Save, Target, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  performanceFrameworkAPI,
  type BalancedScorecardGoalRecord,
  type BalancedScorecardKpiRecord,
  type KpiFormulaType,
  type KpiInputType,
  type KpiSourceType,
  type KpiTrackingType,
} from "@/lib/api/performanceFramework";

type SourceModule =
  | "trainings"
  | "timesheets"
  | "jobs"
  | "finance"
  | "evaluations"
  | "marketing"
  | "manual";

type KpiTemplateKey =
  | "training_completion"
  | "billable_utilization"
  | "job_completion"
  | "collection_rate"
  | "evaluation_score"
  | "marketing_conversion"
  | "manual_percentage";

type KpiTemplate = {
  key: KpiTemplateKey;
  label: string;
  sourceModule: SourceModule;
  formulaType: KpiFormulaType;
  defaultName: string;
  description: string;
  numeratorLabel?: string;
  denominatorLabel?: string;
  valueLabel?: string;
  inputType: KpiInputType;
  measurementType: string;
  unit: string;
  frequency: string;
  targetValue: string;
  amberThreshold: string;
};

type EngineForm = {
  goalId: string;
  templateKey: KpiTemplateKey;
  name: string;
  description: string;
  ownerName: string;
  sourceModule: SourceModule;
  frequency: string;
  weight: string;
  targetValue: string;
  amberThreshold: string;
  dueDay: string;
  departmentRollup: "average" | "weighted_average";
  organizationRollup: "average" | "weighted_average";
};

const sourceModules: Array<{ value: SourceModule; label: string }> = [
  { value: "trainings", label: "Trainings" },
  { value: "timesheets", label: "Timesheets" },
  { value: "jobs", label: "Jobs" },
  { value: "finance", label: "Finance" },
  { value: "evaluations", label: "Evaluations" },
  { value: "marketing", label: "Marketing" },
  { value: "manual", label: "Manual entry" },
];

const kpiTemplates: KpiTemplate[] = [
  {
    key: "training_completion",
    label: "Training completion",
    sourceModule: "trainings",
    formulaType: "ratio",
    defaultName: "Mandatory training completion",
    description: "Tracks completion of required training for employees, departments, and the firm.",
    numeratorLabel: "Completed mandatory trainings",
    denominatorLabel: "Required mandatory trainings",
    inputType: "number",
    measurementType: "percentage",
    unit: "%",
    frequency: "annual",
    targetValue: "100",
    amberThreshold: "80",
  },
  {
    key: "billable_utilization",
    label: "Billable utilization",
    sourceModule: "timesheets",
    formulaType: "ratio",
    defaultName: "Billable utilization rate",
    description: "Tracks billable hours against available hours.",
    numeratorLabel: "Billable hours",
    denominatorLabel: "Available hours",
    inputType: "number",
    measurementType: "percentage",
    unit: "%",
    frequency: "monthly",
    targetValue: "75",
    amberThreshold: "60",
  },
  {
    key: "job_completion",
    label: "Job completion",
    sourceModule: "jobs",
    formulaType: "ratio",
    defaultName: "Job completion rate",
    description: "Tracks completed jobs against planned jobs.",
    numeratorLabel: "Completed jobs",
    denominatorLabel: "Planned jobs",
    inputType: "number",
    measurementType: "percentage",
    unit: "%",
    frequency: "monthly",
    targetValue: "90",
    amberThreshold: "75",
  },
  {
    key: "collection_rate",
    label: "Collection rate",
    sourceModule: "finance",
    formulaType: "ratio",
    defaultName: "Invoice collection rate",
    description: "Tracks cash collected against invoiced value.",
    numeratorLabel: "Collected amount",
    denominatorLabel: "Invoiced amount",
    inputType: "currency",
    measurementType: "percentage",
    unit: "%",
    frequency: "monthly",
    targetValue: "90",
    amberThreshold: "75",
  },
  {
    key: "evaluation_score",
    label: "Evaluation score",
    sourceModule: "evaluations",
    formulaType: "direct",
    defaultName: "Evaluation performance score",
    description: "Tracks the approved evaluation score for the period.",
    valueLabel: "Evaluation score",
    inputType: "percentage",
    measurementType: "percentage",
    unit: "%",
    frequency: "quarterly",
    targetValue: "85",
    amberThreshold: "70",
  },
  {
    key: "marketing_conversion",
    label: "Marketing conversion",
    sourceModule: "marketing",
    formulaType: "ratio",
    defaultName: "Lead conversion rate",
    description: "Tracks converted opportunities against qualified leads.",
    numeratorLabel: "Converted opportunities",
    denominatorLabel: "Qualified leads",
    inputType: "number",
    measurementType: "percentage",
    unit: "%",
    frequency: "monthly",
    targetValue: "25",
    amberThreshold: "15",
  },
  {
    key: "manual_percentage",
    label: "Manual percentage",
    sourceModule: "manual",
    formulaType: "direct",
    defaultName: "Manual KPI score",
    description: "Tracks a percentage entered by an authorized reviewer.",
    valueLabel: "Actual percentage",
    inputType: "percentage",
    measurementType: "percentage",
    unit: "%",
    frequency: "monthly",
    targetValue: "85",
    amberThreshold: "70",
  },
];

const templateByKey = Object.fromEntries(
  kpiTemplates.map((template) => [template.key, template])
) as Record<KpiTemplateKey, KpiTemplate>;

const slugifyInputKey = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "value";

const numberOrNull = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const sourceTypeForModule = (sourceModule: SourceModule): KpiSourceType =>
  sourceModule === "manual" ? "manual" : "system";

const trackingTypeForModule = (sourceModule: SourceModule): KpiTrackingType =>
  sourceModule === "manual" ? "manual_entry" : "system_data_source";

export function KpiEngineDesigner({
  goals,
  kpis,
  onCancel,
  onCreated,
}: {
  goals: BalancedScorecardGoalRecord[];
  kpis: BalancedScorecardKpiRecord[];
  onCancel: () => void;
  onCreated: () => Promise<void> | void;
}) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<EngineForm>(() => {
    const template = templateByKey.training_completion;
    return {
      goalId: goals[0] ? String(goals[0].id) : "",
      templateKey: template.key,
      name: template.defaultName,
      description: template.description,
      ownerName: "HR",
      sourceModule: template.sourceModule,
      frequency: template.frequency,
      weight: "10",
      targetValue: template.targetValue,
      amberThreshold: template.amberThreshold,
      dueDay: "5",
      departmentRollup: "average",
      organizationRollup: "average",
    };
  });

  useEffect(() => {
    if (!form.goalId && goals[0]) {
      setForm((current) => ({ ...current, goalId: String(goals[0].id) }));
    }
  }, [form.goalId, goals]);

  const selectedTemplate = templateByKey[form.templateKey];
  const selectedGoalId = Number(form.goalId);
  const selectedGoalKpiCount = Number.isFinite(selectedGoalId)
    ? kpis.filter((kpi) => kpi.goalId === selectedGoalId).length
    : 0;
  const weightValue = Number(form.weight) || 0;

  const cascadeConfig = useMemo(
    () => ({
      levels: ["individual", "department", "organization"],
      individualToDepartment: form.departmentRollup,
      departmentToOrganization: form.organizationRollup,
    }),
    [form.departmentRollup, form.organizationRollup]
  );

  const inputDefinitions = useMemo(() => {
    const sourceType = sourceTypeForModule(form.sourceModule);
    const sourceConfig = {
      module: form.sourceModule,
      template: form.templateKey,
      cascade: cascadeConfig,
    };

    if (selectedTemplate.formulaType === "ratio") {
      const numeratorLabel = selectedTemplate.numeratorLabel || "Completed";
      const denominatorLabel = selectedTemplate.denominatorLabel || "Required";
      return [
        {
          inputKey: slugifyInputKey(numeratorLabel),
          label: numeratorLabel,
          inputType: selectedTemplate.inputType,
          sourceType,
          sourceConfig: { ...sourceConfig, role: "numerator" },
          isRequired: true,
        },
        {
          inputKey: slugifyInputKey(denominatorLabel),
          label: denominatorLabel,
          inputType: selectedTemplate.inputType,
          sourceType,
          sourceConfig: { ...sourceConfig, role: "denominator" },
          isRequired: true,
        },
      ];
    }

    const valueLabel = selectedTemplate.valueLabel || "Actual value";
    return [
      {
        inputKey: slugifyInputKey(valueLabel),
        label: valueLabel,
        inputType: selectedTemplate.inputType,
        sourceType,
        sourceConfig: { ...sourceConfig, role: "value" },
        isRequired: true,
      },
    ];
  }, [cascadeConfig, form.sourceModule, form.templateKey, selectedTemplate]);

  const formulaConfig = useMemo(() => {
    if (selectedTemplate.formulaType === "ratio") {
      return {
        numeratorKey: inputDefinitions[0]?.inputKey || "numerator",
        denominatorKey: inputDefinitions[1]?.inputKey || "denominator",
        multiplier: 100,
      };
    }
    return { valueKey: inputDefinitions[0]?.inputKey || "value" };
  }, [inputDefinitions, selectedTemplate.formulaType]);

  const formulaPreview =
    selectedTemplate.formulaType === "ratio"
      ? `${inputDefinitions[0]?.label || "Numerator"} / ${inputDefinitions[1]?.label || "Denominator"} x 100`
      : inputDefinitions[0]?.label || "Actual value";

  const applyTemplate = (templateKey: KpiTemplateKey) => {
    const template = templateByKey[templateKey];
    setForm((current) => ({
      ...current,
      templateKey,
      name: template.defaultName,
      description: template.description,
      sourceModule: template.sourceModule,
      frequency: template.frequency,
      targetValue: template.targetValue,
      amberThreshold: template.amberThreshold,
    }));
  };

  const target = numberOrNull(form.targetValue);
  const amber = numberOrNull(form.amberThreshold);
  const validationMessages = useMemo(() => {
    const messages: string[] = [];
    if (!form.goalId) messages.push("Select a strategic goal.");
    if (!form.name.trim()) messages.push("Enter a KPI name.");
    if (!form.frequency.trim()) messages.push("Select a tracking frequency.");
    if (weightValue <= 0) {
      messages.push("Enter a KPI importance greater than 0.");
    }
    if (target === null) messages.push("Enter a valid target.");
    if (amber === null) messages.push("Enter a valid at-risk threshold.");
    if (target !== null && amber !== null && amber > target) {
      messages.push("The at-risk threshold must be lower than or equal to the target.");
    }
    return messages;
  }, [
    amber,
    form.frequency,
    form.goalId,
    form.name,
    target,
    weightValue,
  ]);
  const canSave = validationMessages.length === 0;

  const submit = async () => {
    if (!canSave) return;
    try {
      setSubmitting(true);
      await performanceFrameworkAPI.createKpi({
        goalId: Number(form.goalId),
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        ownerName: form.ownerName.trim() || undefined,
        measurementType: selectedTemplate.measurementType,
        frequency: form.frequency.trim(),
        unit: selectedTemplate.unit,
        weight: Number(form.weight),
        tracking: {
          trackingType: trackingTypeForModule(form.sourceModule),
          frequency: form.frequency.trim(),
          dueDay: numberOrNull(form.dueDay),
          graceDays: 2,
          requiresEvidence: form.sourceModule === "manual",
          dataQualityRule: `${sourceModules.find((module) => module.value === form.sourceModule)?.label || "Source"} data; individual to department to organization cascade.`,
          inputs: inputDefinitions,
        },
        formula: {
          formulaType: selectedTemplate.formulaType,
          config: formulaConfig,
        },
        scoring: {
          scoringType: "higher_better",
          targetValue: target,
          greenThreshold: target,
          amberThreshold: amber,
          redThreshold: amber,
          capScore: 100,
          config: {
            template: form.templateKey,
            sourceModule: form.sourceModule,
            cascade: cascadeConfig,
          },
        },
      });
      await onCreated();
      toast({
        title: "KPI created",
        description: "The KPI is ready for tracking and cascade rollup.",
      });
    } catch (error) {
      toast({
        title: "KPI creation failed",
        description: error instanceof Error ? error.message : "The KPI could not be created.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-3 rounded-lg border border-border/70 bg-muted/15 p-4 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-center">
        <div className="flex items-center gap-3">
          <Users className="h-4 w-4 text-primary" />
          <div>
            <p className="text-sm font-medium text-foreground">Individual</p>
            <p className="text-xs text-muted-foreground">Employee score</p>
          </div>
        </div>
        <ArrowRight className="hidden h-4 w-4 text-muted-foreground sm:block" />
        <div className="flex items-center gap-3">
          <Building2 className="h-4 w-4 text-primary" />
          <div>
            <p className="text-sm font-medium text-foreground">Department</p>
            <p className="text-xs text-muted-foreground">Rollup score</p>
          </div>
        </div>
        <ArrowRight className="hidden h-4 w-4 text-muted-foreground sm:block" />
        <div className="flex items-center gap-3">
          <Landmark className="h-4 w-4 text-primary" />
          <div>
            <p className="text-sm font-medium text-foreground">Organization</p>
            <p className="text-xs text-muted-foreground">Firm score</p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border/70 bg-background p-4">
        <div className="mb-4 flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <p className="font-medium text-foreground">KPI setup</p>
          <Badge variant="outline" className="ml-auto rounded-md">
            {selectedTemplate.unit}
          </Badge>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Strategic goal</Label>
            <Select value={form.goalId} onValueChange={(goalId) => setForm((current) => ({ ...current, goalId }))}>
              <SelectTrigger className="rounded-lg">
                <SelectValue placeholder="Select strategic goal" />
              </SelectTrigger>
              <SelectContent>
                {goals.map((goal) => (
                  <SelectItem key={goal.id} value={String(goal.id)}>
                    {goal.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>KPI template</Label>
            <Select value={form.templateKey} onValueChange={(value) => applyTemplate(value as KpiTemplateKey)}>
              <SelectTrigger className="rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {kpiTemplates.map((template) => (
                  <SelectItem key={template.key} value={template.key}>
                    {template.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label>KPI name</Label>
            <Input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Mandatory training completion"
              className="rounded-lg"
            />
          </div>

          <div className="space-y-2">
            <Label>Owner</Label>
            <Input
              value={form.ownerName}
              onChange={(event) => setForm((current) => ({ ...current, ownerName: event.target.value }))}
              placeholder="HR"
              className="rounded-lg"
            />
          </div>

          <div className="space-y-2">
            <Label>Source</Label>
            <Select
              value={form.sourceModule}
              onValueChange={(sourceModule) =>
                setForm((current) => ({ ...current, sourceModule: sourceModule as SourceModule }))
              }
            >
              <SelectTrigger className="rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sourceModules.map((module) => (
                  <SelectItem key={module.value} value={module.value}>
                    {module.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Frequency</Label>
            <Select
              value={form.frequency}
              onValueChange={(frequency) => setForm((current) => ({ ...current, frequency }))}
            >
              <SelectTrigger className="rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="annual">Annual</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label>KPI importance</Label>
              <span className="text-xs text-muted-foreground">1-100</span>
            </div>
            <Input
              type="number"
              min="1"
              max="100"
              value={form.weight}
              onChange={(event) => setForm((current) => ({ ...current, weight: event.target.value }))}
              className="rounded-lg"
            />
            <p className="text-xs text-muted-foreground">
              This goal already has {selectedGoalKpiCount} KPI{selectedGoalKpiCount === 1 ? "" : "s"}. Goal
              performance is averaged across KPI scores.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Target</Label>
            <Input
              type="number"
              min="0"
              value={form.targetValue}
              onChange={(event) => setForm((current) => ({ ...current, targetValue: event.target.value }))}
              className="rounded-lg"
            />
          </div>

          <div className="space-y-2">
            <Label>At risk below</Label>
            <Input
              type="number"
              min="0"
              value={form.amberThreshold}
              onChange={(event) => setForm((current) => ({ ...current, amberThreshold: event.target.value }))}
              className="rounded-lg"
            />
          </div>

          <div className="space-y-2">
            <Label>Data submission day</Label>
            <Input
              type="number"
              min="1"
              max="31"
              value={form.dueDay}
              onChange={(event) => setForm((current) => ({ ...current, dueDay: event.target.value }))}
              className="rounded-lg"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label>Description</Label>
            <Textarea
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              className="min-h-[84px] rounded-lg"
            />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border/70 bg-background p-4">
        <div className="mb-4 flex items-center gap-2">
          <Database className="h-4 w-4 text-primary" />
          <p className="font-medium text-foreground">Cascade logic</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Department rollup</Label>
            <Select
              value={form.departmentRollup}
              onValueChange={(departmentRollup) =>
                setForm((current) => ({
                  ...current,
                  departmentRollup: departmentRollup as EngineForm["departmentRollup"],
                }))
              }
            >
              <SelectTrigger className="rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="average">Average employees</SelectItem>
                <SelectItem value="weighted_average">Weighted employees</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Organization rollup</Label>
            <Select
              value={form.organizationRollup}
              onValueChange={(organizationRollup) =>
                setForm((current) => ({
                  ...current,
                  organizationRollup: organizationRollup as EngineForm["organizationRollup"],
                }))
              }
            >
              <SelectTrigger className="rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="average">Average departments</SelectItem>
                <SelectItem value="weighted_average">Weighted departments</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-border/60 bg-muted/20 p-3">
          <p className="text-sm font-medium text-foreground">{formulaPreview}</p>
          <div className="mt-3 grid gap-2">
            {inputDefinitions.map((input) => (
              <div key={input.inputKey} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">{input.label}</span>
                <Badge variant="secondary" className="rounded-md">
                  {input.sourceType}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        {validationMessages[0] ? (
          <p className="mr-auto max-w-sm text-sm text-destructive">{validationMessages[0]}</p>
        ) : null}
        <Button variant="outline" className="rounded-lg" onClick={onCancel}>
          Cancel
        </Button>
        <Button className="rounded-lg" disabled={!canSave || submitting} onClick={submit}>
          <Save className="mr-2 h-4 w-4" />
          {submitting ? "Saving..." : "Save KPI"}
        </Button>
      </div>
    </div>
  );
}
