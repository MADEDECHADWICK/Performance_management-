import * as React from "react";
import type { LegendProps, TooltipProps } from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";

import { cn } from "@/lib/utils";

export const ANALYTICS_CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "#0f766e",
];

export const analyticsAxisProps = {
  tickLine: false,
  axisLine: false,
  fontSize: 11,
  tickMargin: 8,
};

export const analyticsGridProps = {
  vertical: false,
  strokeDasharray: "3 5",
};

export const analyticsDonutProps = {
  innerRadius: 54,
  outerRadius: 88,
  paddingAngle: 3,
  stroke: "rgba(255,255,255,0.96)",
  strokeWidth: 2,
};

type AnalyticsChartShellProps = React.HTMLAttributes<HTMLDivElement>;

export function AnalyticsChartShell({ className, ...props }: AnalyticsChartShellProps) {
  return (
    <div
      className={cn(
        "relative h-full w-full overflow-hidden rounded-[1.4rem] border border-slate-200/80 bg-[radial-gradient(circle_at_top,rgba(224,242,254,0.45),rgba(255,255,255,0.96)_38%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.92))] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_22px_38px_-32px_rgba(15,23,42,0.4)] backdrop-blur-sm",
        "[&_.recharts-wrapper]:outline-none",
        "[&_.recharts-surface]:outline-none",
        "[&_.recharts-sector]:stroke-white [&_.recharts-sector]:stroke-[2px]",
        "[&_.recharts-cartesian-grid-horizontal_line]:stroke-slate-200/90",
        "[&_.recharts-cartesian-grid-vertical_line]:stroke-slate-100/50",
        "[&_.recharts-cartesian-axis-line]:stroke-transparent",
        "[&_.recharts-cartesian-axis-tick-line]:stroke-transparent",
        "[&_.recharts-cartesian-axis-tick_text]:fill-slate-500",
        "[&_.recharts-reference-line_line]:stroke-slate-300/90",
        "[&_.recharts-legend-wrapper]:!left-0 [&_.recharts-legend-wrapper]:!right-0",
        "[&_.recharts-default-legend]:mt-4 [&_.recharts-default-legend]:flex [&_.recharts-default-legend]:flex-wrap [&_.recharts-default-legend]:items-center [&_.recharts-default-legend]:justify-center [&_.recharts-default-legend]:gap-2",
        "[&_.recharts-legend-item]:!mr-0",
        "[&_.recharts-legend-item-text]:text-xs [&_.recharts-legend-item-text]:font-medium [&_.recharts-legend-item-text]:text-slate-600",
        className
      )}
      {...props}
    >
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/80 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-white/60 via-white/20 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-white/55 to-transparent" />
      <div className="relative h-full w-full">{props.children}</div>
    </div>
  );
}

type AnalyticsGradientDefsProps = {
  items: Array<{
    id: string;
    color: string;
  }>;
};

export function AnalyticsGradientDefs({ items }: AnalyticsGradientDefsProps) {
  return (
    <defs>
      {items.map((item) => (
        <linearGradient key={item.id} id={item.id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={item.color} stopOpacity={0.95} />
          <stop offset="100%" stopColor={item.color} stopOpacity={0.42} />
        </linearGradient>
      ))}
    </defs>
  );
}

export const analyticsGradientFill = (id: string) => `url(#${id})`;

const defaultValueFormatter = (value: ValueType) => {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return numeric.toLocaleString("en-KE");
  }
  return String(value ?? "");
};

type AnalyticsTooltipContentProps = TooltipProps<ValueType, NameType> & {
  valueFormatter?: (value: ValueType, name?: NameType, item?: any) => React.ReactNode;
  labelFormatter?: (label: React.ReactNode, payload?: ReadonlyArray<any>) => React.ReactNode;
};

export function AnalyticsTooltipContent({
  active,
  payload,
  label,
  valueFormatter,
  labelFormatter,
}: AnalyticsTooltipContentProps) {
  if (!active || !payload?.length) {
    return null;
  }

  const resolvedLabel = labelFormatter ? labelFormatter(label, payload) : label;

  return (
    <div className="min-w-[180px] rounded-2xl border border-slate-200/80 bg-white/96 px-3.5 py-3 shadow-[0_20px_40px_-24px_rgba(15,23,42,0.35)] backdrop-blur-sm">
      {resolvedLabel ? (
        <div className="mb-2 border-b border-slate-100 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
          {resolvedLabel}
        </div>
      ) : null}
      <div className="space-y-2">
        {payload.map((item, index) => {
          const rawFormatted = valueFormatter
            ? valueFormatter(item.value, item.name, item)
            : defaultValueFormatter(item.value);

          const formattedValue = Array.isArray(rawFormatted) ? rawFormatted[0] : rawFormatted;
          const formattedName = Array.isArray(rawFormatted) ? rawFormatted[1] : item.name;

          return (
            <div key={`${item.dataKey || item.name || index}`} className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <span
                  className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full shadow-[0_0_0_3px_rgba(255,255,255,0.9)]"
                  style={{ backgroundColor: item.color || (item.payload as any)?.fill || ANALYTICS_CHART_COLORS[index % ANALYTICS_CHART_COLORS.length] }}
                />
                <span className="font-medium">{formattedName || item.name || item.dataKey}</span>
              </div>
              <span className="text-sm font-semibold text-slate-900">{formattedValue}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type AnalyticsLegendContentProps = LegendProps & {
  formatter?: (value: React.ReactNode) => React.ReactNode;
};

export function AnalyticsLegendContent({ payload, formatter }: AnalyticsLegendContentProps) {
  if (!payload?.length) {
    return null;
  }

  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
      {payload.map((item, index) => (
        <div
          key={`${item.value || index}`}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/85 px-2.5 py-1 text-[11px] font-medium text-slate-600 shadow-[0_8px_20px_-18px_rgba(15,23,42,0.45)]"
        >
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: item.color || ANALYTICS_CHART_COLORS[index % ANALYTICS_CHART_COLORS.length] }}
          />
          <span>{formatter ? formatter(item.value) : item.value}</span>
        </div>
      ))}
    </div>
  );
}

export const analyticsColorAt = (index: number) =>
  ANALYTICS_CHART_COLORS[index % ANALYTICS_CHART_COLORS.length];
