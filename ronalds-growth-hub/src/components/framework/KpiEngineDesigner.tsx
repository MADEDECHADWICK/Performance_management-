import { useEffect, useMemo, useState } from "react";
import { Calculator, Check, Database, ListChecks, Save } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  type KpiScoringType,
  type KpiSourceType,
  type KpiTrackingType,
} from "@/lib/api/performanceFramework";
import { cn } from "@/lib/utils";

type FormulaMode = KpiFormulaType | "stability_range";

type EngineForm = {
  goalId: string;
  name: string;
  description: string;
  ownerName: string;
  measurementType: string;
  frequency: string;
  unit: string;
  weight: string;
  trackingType: KpiTrackingType;
  formulaMode: FormulaMode;
  scoringType: KpiScoringType;
  targetValue: string;
  greenThreshold: string;
  amberThreshold: string;
  redThreshold: string;
  minValue: string;
  maxValue: string;
  dueDay: string;
  graceDays: string;
  requiresEvidence: boolean;
  valueLabel: string;
  numeratorLabel: string;
  denominatorLabel: string;
  actualLabel: string;
  targetLabel: string;
  currentLabel: string;
  previousLabel: string;
  completedLabel: string;
  inputLabels: string;
  childWeights: Record<number, string>;
};

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

const trackingByFormula: Record<FormulaMode, KpiTrackingType> = {
  direct: "manual_entry",
  ratio: "calculated_inputs",
  sum: "calculated_inputs",
  average: "calculated_inputs",
  variance: "calculated_inputs",
  growth_rate: "calculated_inputs",
  milestone: "milestone_evidence",
  survey_average: "survey_rating",
  composite: "composite_child_kpis",
  stability_range: "manual_entry",
};

const defaultMeasurementByFormula: Record<FormulaMode, { type: string; unit: string; scoring: KpiScoringType }> = {
  direct: { type: "number", unit: "#", scoring: "higher_better" },
  ratio: { type: "percentage", unit: "%", scoring: "higher_better" },
  sum: { type: "number", unit: "#", scoring: "higher_better" },
  average: { type: "number", unit: "#", scoring: "higher_better" },
  variance: { type: "number", unit: "#", scoring: "threshold_bands" },
  growth_rate: { type: "percentage", unit: "%", scoring: "higher_better" },
  milestone: { type: "milestone", unit: "done", scoring: "milestone_complete" },
  survey_average: { type: "number", unit: "rating", scoring: "higher_better" },
  composite: { type: "percentage", unit: "%", scoring: "higher_better" },
  stability_range: { type: "number", unit: "#", scoring: "target_range" },
};

const formulaOptions: Array<{ value: FormulaMode; label: string }> = [
  { value: "direct", label: "Direct number" },
  { value: "ratio", label: "Percentage / ratio" },
  { value: "sum", label: "Sum" },
  { value: "average", label: "Average" },
  { value: "variance", label: "Variance" },
  { value: "growth_rate", label: "Growth rate" },
  { value: "stability_range", label: "Range / stability" },
  { value: "milestone", label: "Milestone / evidence" },
  { value: "survey_average", label: "Survey / rating" },
  { value: "composite", label: "Composite child KPIs" },
];

const inputTypeForMeasurement = (measurementType: string): KpiInputType => {
  if (measurementType === "currency") return "currency";
  if (measurementType === "percentage") return "percentage";
  if (measurementType === "boolean" || measurementType === "milestone") return "boolean";
  return "number";
};

const sourceTypeForFormula = (formulaMode: FormulaMode): KpiSourceType => {
  if (formulaMode === "milestone") return "evidence";
  if (formulaMode === "survey_average") return "survey";
  if (formulaMode === "composite") return "child_kpi";
  if (formulaMode === "direct" || formulaMode === "stability_range") return "manual";
  return "calculated";
};

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
  const [form, setForm] = useState<EngineForm>(() => ({
    goalId: goals[0] ? String(goals[0].id) : "",
    name: "",
    description: "",
    ownerName: "",
    measurementType: "percentage",
    frequency: "monthly",
    unit: "%",
    weight: "10",
    trackingType: "calculated_inputs",
    formulaMode: "ratio",
    scoringType: "higher_better",
    targetValue: "85",
    greenThreshold: "85",
    amberThreshold: "70",
    redThreshold: "70",
    minValue: "",
    maxValue: "",
    dueDay: "5",
    graceDays: "2",
    requiresEvidence: false,
    valueLabel: "Actual value",
    numeratorLabel: "Invoice amount paid",
    denominatorLabel: "Total issued invoice value",
    actualLabel: "Actual value",
    targetLabel: "Planned value",
    currentLabel: "Current period value",
    previousLabel: "Previous period value",
    completedLabel: "Milestone complete",
    inputLabels: "Value",
    childWeights: {},
  }));

  useEffect(() => {
    if (!form.goalId && goals[0]) {
      setForm((current) => ({ ...current, goalId: String(goals[0].id) }));
    }
  }, [form.goalId, goals]);

  const selectedGoalId = Number(form.goalId);
  const existingGoalWeight = Number.isFinite(selectedGoalId)
    ? kpis
        .filter((kpi) => kpi.goalId === selectedGoalId)
        .reduce((sum, kpi) => sum + (kpi.weight || 0), 0)
    : 0;
  const projectedWeight = existingGoalWeight + (Number(form.weight) || 0);

  const selectedChildKpis = useMemo(
    () =>
      Object.entries(form.childWeights)
        .map(([kpiId, weight]) => ({ kpiId: Number(kpiId), weight: Number(weight || 0) }))
        .filter((child) => Number.isFinite(child.kpiId) && child.weight > 0),
    [form.childWeights]
  );

  const inputDefinitions = useMemo(() => {
    const sourceType = sourceTypeForFormula(form.formulaMode);
    const numericType = inputTypeForMeasurement(form.measurementType);
    const makeInput = (
      label: string,
      inputType: KpiInputType = numericType,
      required = true,
      sourceOverride?: KpiSourceType
    ) => ({
      inputKey: slugifyInputKey(label),
      label,
      inputType,
      sourceType: sourceOverride || sourceType,
      isRequired: required,
    });

    if (form.formulaMode === "ratio") {
      return [
        makeInput(form.numeratorLabel || "Numerator"),
        makeInput(form.denominatorLabel || "Denominator"),
      ];
    }
    if (form.formulaMode === "growth_rate") {
      return [
        makeInput(form.currentLabel || "Current value"),
        makeInput(form.previousLabel || "Previous value"),
      ];
    }
    if (form.formulaMode === "variance") {
      return [
        makeInput(form.actualLabel || "Actual value"),
        makeInput(form.targetLabel || "Target value"),
      ];
    }
    if (form.formulaMode === "milestone") {
      return [makeInput(form.completedLabel || "Milestone complete", "boolean", true, "evidence")];
    }
    if (form.formulaMode === "composite") {
      return [makeInput("Child KPI scores", "number", false, "child_kpi")];
    }
    if (form.formulaMode === "sum" || form.formulaMode === "average" || form.formulaMode === "survey_average") {
      const labels = form.inputLabels
        .split(",")
        .map((label) => label.trim())
        .filter(Boolean);
      const inputType = form.formulaMode === "survey_average" ? "rating" : numericType;
      return (labels.length > 0 ? labels : ["Value"]).map((label) => makeInput(label, inputType));
    }
    return [makeInput(form.valueLabel || "Actual value")];
  }, [form]);

  const formulaType: KpiFormulaType =
    form.formulaMode === "stability_range" ? "direct" : form.formulaMode;

  const formulaConfig = useMemo(() => {
    if (form.formulaMode === "ratio") {
      return {
        numeratorKey: slugifyInputKey(form.numeratorLabel),
        denominatorKey: slugifyInputKey(form.denominatorLabel),
        multiplier: 100,
      };
    }
    if (form.formulaMode === "growth_rate") {
      return {
        currentKey: slugifyInputKey(form.currentLabel),
        previousKey: slugifyInputKey(form.previousLabel),
        multiplier: 100,
      };
    }
    if (form.formulaMode === "variance") {
      return {
        actualKey: slugifyInputKey(form.actualLabel),
        targetKey: slugifyInputKey(form.targetLabel),
        mode: "absolute",
      };
    }
    if (form.formulaMode === "milestone") {
      return { completedKey: slugifyInputKey(form.completedLabel) };
    }
    if (form.formulaMode === "composite") {
      return { childKpis: selectedChildKpis };
    }
    if (form.formulaMode === "sum" || form.formulaMode === "average" || form.formulaMode === "survey_average") {
      return { inputKeys: inputDefinitions.map((input) => input.inputKey) };
    }
    return { valueKey: inputDefinitions[0]?.inputKey || "value" };
  }, [form, inputDefinitions, selectedChildKpis]);

  const formulaPreview = useMemo(() => {
    if (form.formulaMode === "ratio") return `${form.numeratorLabel} / ${form.denominatorLabel} x 100`;
    if (form.formulaMode === "growth_rate") return `(${form.currentLabel} - ${form.previousLabel}) / ${form.previousLabel} x 100`;
    if (form.formulaMode === "variance") return `${form.actualLabel} - ${form.targetLabel}`;
    if (form.formulaMode === "milestone") return `${form.completedLabel} = complete`;
    if (form.formulaMode === "composite") return `weighted score from ${selectedChildKpis.length} child KPIs`;
    if (form.formulaMode === "sum") return `sum(${inputDefinitions.map((input) => input.label).join(", ")})`;
    if (form.formulaMode === "average" || form.formulaMode === "survey_average") {
      return `average(${inputDefinitions.map((input) => input.label).join(", ")})`;
    }
    return inputDefinitions[0]?.label || "Actual value";
  }, [form, inputDefinitions, selectedChildKpis.length]);

  const applyFormulaMode = (formulaMode: FormulaMode) => {
    const defaults = defaultMeasurementByFormula[formulaMode];
    setForm((current) => ({
      ...current,
      formulaMode,
      trackingType: trackingByFormula[formulaMode],
      measurementType: defaults.type,
      unit: defaults.unit,
      scoringType: defaults.scoring,
      requiresEvidence: formulaMode === "milestone",
      targetValue: formulaMode === "milestone" ? "1" : current.targetValue || "85",
      greenThreshold: formulaMode === "stability_range" ? "" : current.greenThreshold || "85",
      amberThreshold: formulaMode === "stability_range" ? "" : current.amberThreshold || "70",
    }));
  };

  const canSave =
    Boolean(form.goalId) &&
    Boolean(form.name.trim()) &&
    Boolean(form.frequency.trim()) &&
    Boolean(form.unit.trim()) &&
    Number(form.weight) > 0 &&
    projectedWeight <= 100 &&
    inputDefinitions.length > 0 &&
    (form.scoringType === "target_range"
      ? numberOrNull(form.minValue) !== null && numberOrNull(form.maxValue) !== null
      : form.scoringType === "milestone_complete"
        ? true
        : numberOrNull(form.targetValue || form.greenThreshold) !== null) &&
    (form.formulaMode !== "composite" || selectedChildKpis.length > 0);

  const submit = async () => {
    if (!canSave) return;
    try {
      setSubmitting(true);
      await performanceFrameworkAPI.createKpi({
        goalId: Number(form.goalId),
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        ownerName: form.ownerName.trim() || undefined,
        measurementType: form.measurementType,
        frequency: form.frequency.trim(),
        unit: form.unit.trim(),
        weight: Number(form.weight),
        tracking: {
          trackingType: form.trackingType,
          frequency: form.frequency.trim(),
          dueDay: numberOrNull(form.dueDay),
          graceDays: numberOrNull(form.graceDays) ?? 0,
          requiresEvidence: form.requiresEvidence,
          inputs: inputDefinitions,
        },
        formula: {
          formulaType,
          config: formulaConfig,
        },
        scoring: {
          scoringType: form.scoringType,
          targetValue: numberOrNull(form.targetValue),
          greenThreshold: numberOrNull(form.greenThreshold),
          amberThreshold: numberOrNull(form.amberThreshold),
          redThreshold: numberOrNull(form.redThreshold),
          minValue: numberOrNull(form.minValue),
          maxValue: numberOrNull(form.maxValue),
          capScore: 100,
        },
      });
      await onCreated();
      toast({
        title: "KPI created",
        description: "The KPI now has a tracking plan, formula, scoring rule, and result engine.",
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
          <Label>Formula type</Label>
          <Select value={form.formulaMode} onValueChange={(value) => applyFormulaMode(value as FormulaMode)}>
            <SelectTrigger className="rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {formulaOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-lg border border-border/70 bg-background p-4">
        <div className="mb-4 flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-primary" />
          <p className="font-medium text-foreground">KPI definition</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>KPI name</Label>
            <Input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Matter realization rate"
              className="rounded-lg"
            />
          </div>
          <div className="space-y-2">
            <Label>Owner</Label>
            <Input
              value={form.ownerName}
              onChange={(event) => setForm((current) => ({ ...current, ownerName: event.target.value }))}
              placeholder="GMP"
              className="rounded-lg"
            />
          </div>
          <div className="space-y-2">
            <Label>Frequency</Label>
            <Select value={form.frequency} onValueChange={(frequency) => setForm((current) => ({ ...current, frequency }))}>
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
            <Label>Unit</Label>
            <Input
              value={form.unit}
              onChange={(event) => setForm((current) => ({ ...current, unit: event.target.value }))}
              placeholder="%"
              className="rounded-lg"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label>Weight</Label>
              <span className={cn("text-xs", projectedWeight > 100 ? "text-destructive" : "text-muted-foreground")}>
                {existingGoalWeight} + {Number(form.weight) || 0} = {projectedWeight}/100
              </span>
            </div>
            <Input
              type="number"
              min="1"
              max="100"
              value={form.weight}
              onChange={(event) => setForm((current) => ({ ...current, weight: event.target.value }))}
              className="rounded-lg"
            />
          </div>
          <div className="space-y-2">
            <Label>Measurement type</Label>
            <Select
              value={form.measurementType}
              onValueChange={(measurementType) => setForm((current) => ({ ...current, measurementType }))}
            >
              <SelectTrigger className="rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percentage">Percentage</SelectItem>
                <SelectItem value="currency">Currency</SelectItem>
                <SelectItem value="number">Number</SelectItem>
                <SelectItem value="count">Count</SelectItem>
                <SelectItem value="days">Days</SelectItem>
                <SelectItem value="boolean">Yes / No</SelectItem>
                <SelectItem value="milestone">Milestone</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <Label>Description</Label>
          <Textarea
            value={form.description}
            onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            placeholder="What this KPI measures"
            className="min-h-[88px] rounded-lg"
          />
        </div>
      </div>

      <div className="rounded-lg border border-border/70 bg-background p-4">
        <div className="mb-4 flex items-center gap-2">
          <Database className="h-4 w-4 text-primary" />
          <p className="font-medium text-foreground">Tracking inputs</p>
          <Badge variant="outline" className="ml-auto rounded-md">
            {form.trackingType.replace(/_/g, " ")}
          </Badge>
        </div>

        {form.formulaMode === "ratio" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              value={form.numeratorLabel}
              onChange={(event) => setForm((current) => ({ ...current, numeratorLabel: event.target.value }))}
              className="rounded-lg"
            />
            <Input
              value={form.denominatorLabel}
              onChange={(event) => setForm((current) => ({ ...current, denominatorLabel: event.target.value }))}
              className="rounded-lg"
            />
          </div>
        ) : null}

        {form.formulaMode === "direct" || form.formulaMode === "stability_range" ? (
          <Input
            value={form.valueLabel}
            onChange={(event) => setForm((current) => ({ ...current, valueLabel: event.target.value }))}
            className="rounded-lg"
          />
        ) : null}

        {form.formulaMode === "sum" || form.formulaMode === "average" || form.formulaMode === "survey_average" ? (
          <Input
            value={form.inputLabels}
            onChange={(event) => setForm((current) => ({ ...current, inputLabels: event.target.value }))}
            placeholder="Input one, input two, input three"
            className="rounded-lg"
          />
        ) : null}

        {form.formulaMode === "growth_rate" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              value={form.currentLabel}
              onChange={(event) => setForm((current) => ({ ...current, currentLabel: event.target.value }))}
              className="rounded-lg"
            />
            <Input
              value={form.previousLabel}
              onChange={(event) => setForm((current) => ({ ...current, previousLabel: event.target.value }))}
              className="rounded-lg"
            />
          </div>
        ) : null}

        {form.formulaMode === "variance" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              value={form.actualLabel}
              onChange={(event) => setForm((current) => ({ ...current, actualLabel: event.target.value }))}
              className="rounded-lg"
            />
            <Input
              value={form.targetLabel}
              onChange={(event) => setForm((current) => ({ ...current, targetLabel: event.target.value }))}
              className="rounded-lg"
            />
          </div>
        ) : null}

        {form.formulaMode === "milestone" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              value={form.completedLabel}
              onChange={(event) => setForm((current) => ({ ...current, completedLabel: event.target.value }))}
              className="rounded-lg"
            />
            <label className="flex items-center gap-2 text-sm text-foreground">
              <Checkbox
                checked={form.requiresEvidence}
                onCheckedChange={(checked) => setForm((current) => ({ ...current, requiresEvidence: checked === true }))}
              />
              Require evidence
            </label>
          </div>
        ) : null}

        {form.formulaMode === "composite" ? (
          <div className="max-h-56 space-y-3 overflow-y-auto rounded-lg border border-border/60 p-3">
            {kpis.length === 0 ? (
              <p className="text-sm text-muted-foreground">No child KPIs available.</p>
            ) : (
              kpis.map((kpi) => {
                const checked = form.childWeights[kpi.id] !== undefined;
                return (
                  <div key={kpi.id} className="grid gap-3 md:grid-cols-[1fr_96px]">
                    <label className="flex items-center gap-2 text-sm text-foreground">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) =>
                          setForm((current) => {
                            const next = { ...current.childWeights };
                            if (value === true) next[kpi.id] = next[kpi.id] || "10";
                            else delete next[kpi.id];
                            return { ...current, childWeights: next };
                          })
                        }
                      />
                      {kpi.name}
                    </label>
                    <Input
                      type="number"
                      value={form.childWeights[kpi.id] || ""}
                      disabled={!checked}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          childWeights: { ...current.childWeights, [kpi.id]: event.target.value },
                        }))
                      }
                      className="h-8 rounded-lg"
                    />
                  </div>
                );
              })
            )}
          </div>
        ) : null}

        <div className="mt-4 rounded-lg border border-border/60 bg-muted/20 p-3 text-sm text-foreground">
          <Calculator className="mr-2 inline h-4 w-4 text-primary" />
          {formulaPreview}
        </div>
      </div>

      <div className="rounded-lg border border-border/70 bg-background p-4">
        <div className="mb-4 flex items-center gap-2">
          <Check className="h-4 w-4 text-primary" />
          <p className="font-medium text-foreground">Scoring</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Rule</Label>
            <Select
              value={form.scoringType}
              onValueChange={(scoringType) => setForm((current) => ({ ...current, scoringType: scoringType as KpiScoringType }))}
            >
              <SelectTrigger className="rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="higher_better">Higher is better</SelectItem>
                <SelectItem value="lower_better">Lower is better</SelectItem>
                <SelectItem value="target_range">Within range is better</SelectItem>
                <SelectItem value="exact_match">Exact match</SelectItem>
                <SelectItem value="milestone_complete">Milestone complete</SelectItem>
                <SelectItem value="threshold_bands">Threshold bands</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.scoringType === "target_range" ? (
            <>
              <div className="space-y-2">
                <Label>Minimum</Label>
                <Input
                  type="number"
                  value={form.minValue}
                  onChange={(event) => setForm((current) => ({ ...current, minValue: event.target.value }))}
                  className="rounded-lg"
                />
              </div>
              <div className="space-y-2">
                <Label>Maximum</Label>
                <Input
                  type="number"
                  value={form.maxValue}
                  onChange={(event) => setForm((current) => ({ ...current, maxValue: event.target.value }))}
                  className="rounded-lg"
                />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Target</Label>
                <Input
                  type="number"
                  value={form.targetValue}
                  onChange={(event) => setForm((current) => ({ ...current, targetValue: event.target.value }))}
                  className="rounded-lg"
                />
              </div>
              <div className="space-y-2">
                <Label>Green from</Label>
                <Input
                  type="number"
                  value={form.greenThreshold}
                  onChange={(event) => setForm((current) => ({ ...current, greenThreshold: event.target.value }))}
                  className="rounded-lg"
                />
              </div>
              <div className="space-y-2">
                <Label>Amber from</Label>
                <Input
                  type="number"
                  value={form.amberThreshold}
                  onChange={(event) => setForm((current) => ({ ...current, amberThreshold: event.target.value }))}
                  className="rounded-lg"
                />
              </div>
              <div className="space-y-2">
                <Label>Red below</Label>
                <Input
                  type="number"
                  value={form.redThreshold}
                  onChange={(event) => setForm((current) => ({ ...current, redThreshold: event.target.value }))}
                  className="rounded-lg"
                />
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
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
