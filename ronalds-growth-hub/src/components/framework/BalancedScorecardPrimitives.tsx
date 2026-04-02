import type { LucideIcon } from "lucide-react";
import { CheckCircle2, CircleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { StatusTone } from "@/lib/balancedScorecardUiConfig";
import { cn } from "@/lib/utils";

const statusMeta: Record<
  StatusTone,
  { label: string; className: string; icon: LucideIcon }
> = {
  on_track: {
    label: "On Track",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    icon: CheckCircle2,
  },
  at_risk: {
    label: "At Risk",
    className: "border-amber-200 bg-amber-50 text-amber-700",
    icon: CircleAlert,
  },
  off_track: {
    label: "Off Track",
    className: "border-rose-200 bg-rose-50 text-rose-700",
    icon: CircleAlert,
  },
};

export function scoreToStatus(score: number): StatusTone {
  if (score >= 85) return "on_track";
  if (score >= 65) return "at_risk";
  return "off_track";
}

export function averageScore(values: number[]) {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function parseAcknowledgementState(ack: string) {
  const normalized = ack.toLowerCase();
  const ratioMatch = normalized.match(/(\d+)\/(\d+)/);
  const current = ratioMatch ? Number(ratioMatch[1]) : 0;
  const total = ratioMatch ? Number(ratioMatch[2]) : 0;
  return {
    acknowledged:
      normalized.includes("all") ||
      normalized.includes("overdue") ||
      (ratioMatch ? current > 0 : !normalized.includes("no live")),
    pending: ratioMatch ? current < total : normalized.includes("pending"),
    overdue: normalized.includes("overdue"),
  };
}

export function StatusBadge({ status }: { status: StatusTone }) {
  const Icon = statusMeta[status].icon;
  return (
    <Badge variant="outline" className={cn("gap-1.5 rounded-full px-2.5 py-1", statusMeta[status].className)}>
      <Icon className="h-3.5 w-3.5" />
      {statusMeta[status].label}
    </Badge>
  );
}

export function TrendBars({ points }: { points: number[] }) {
  const maxPoint = Math.max(...points, 1);
  return (
    <div className="flex h-10 items-end gap-1">
      {points.map((point, index) => (
        <div
          key={`${point}-${index}`}
          className="w-2 rounded-full bg-primary/70"
          style={{ height: `${Math.max(18, (point / maxPoint) * 100)}%` }}
        />
      ))}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
}) {
  return (
    <Card className="rounded-4xl border-border/70 shadow-sm">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 flex-1 text-sm font-medium leading-tight text-muted-foreground break-words">
            {label}
          </p>
          <div className="flex-shrink-0 rounded-2xl bg-primary/10 p-3 text-primary">
            <Icon className="h-5 w-5" />
          </div>
        </div>
        <div className="min-w-0 space-y-2">
          <p className="text-2xl font-semibold tracking-tight text-foreground break-words">
            {value}
          </p>
          <p className="text-sm leading-6 text-muted-foreground break-words">
            {hint}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export function SectionTitle({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="rounded-2xl bg-primary/10 p-2.5 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div className="space-y-1">
        <h2 className="text-xl font-semibold text-foreground">{title}</h2>
        <p className="max-w-3xl text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
