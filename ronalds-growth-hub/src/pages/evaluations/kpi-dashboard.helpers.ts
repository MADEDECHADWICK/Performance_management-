import type { KpiItem } from "@/lib/api/evaluations";

export type ProgressDraft = {
  actual: string;
  note: string;
};

export const FREQUENCY_OPTIONS = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Biweekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Annual" },
];

export const TARGET_TYPE_OPTIONS = [
  { value: "higher_better", label: "Higher is better" },
  { value: "lower_better", label: "Lower is better" },
  { value: "milestone", label: "Milestone based" },
];

export const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString() : "Not scheduled";

export const formatDateTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString() : "Not recorded";

export const titleCase = (value?: string | null) =>
  String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();

export const toProgressValue = (kpi: KpiItem) => Math.min(kpi.metrics?.progressPercent || 0, 100);

export const getDraft = (
  drafts: Record<number, ProgressDraft>,
  kpi: KpiItem
): ProgressDraft =>
  drafts[kpi.id] || {
    actual: String(kpi.actual ?? 0),
    note: "",
  };
