import { useId, useMemo } from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";

import { cn } from "@/lib/utils";

type MiniStatGraphProps = {
  value?: number | null;
  baseline?: number | null;
  series?: Array<number | null | undefined>;
  className?: string;
  inverse?: boolean;
  hideLabel?: boolean;
};

const toNumber = (input: number | null | undefined) => {
  const parsed = Number(input);
  return Number.isFinite(parsed) ? parsed : 0;
};

const buildSeries = (
  value: number | null | undefined,
  baseline?: number | null,
  series?: Array<number | null | undefined>
) => {
  const normalizedSeries = (series ?? [])
    .map((entry) => toNumber(entry))
    .filter((entry) => Number.isFinite(entry));

  if (normalizedSeries.length >= 2) {
    return normalizedSeries;
  }

  const safeValue = toNumber(value);
  const safeBaseline =
    baseline != null
      ? toNumber(baseline)
      : safeValue === 0
        ? 0
        : safeValue - Math.abs(safeValue) * 0.18;

  const delta = safeValue - safeBaseline;
  return [
    safeBaseline,
    safeBaseline + delta * 0.35,
    safeBaseline + delta * 0.7,
    safeValue,
  ];
};

export default function MiniStatGraph({
  value,
  baseline,
  series,
  className,
  inverse = false,
  hideLabel = false,
}: MiniStatGraphProps) {
  const chartId = useId().replace(/:/g, "");
  const trendSeries = useMemo(
    () => buildSeries(value, baseline, series),
    [value, baseline, series]
  );

  const chartData = trendSeries.map((entry, index) => ({
    index,
    value: entry,
  }));

  const startValue = trendSeries[0] ?? 0;
  const endValue = trendSeries[trendSeries.length - 1] ?? 0;
  const averageMagnitude =
    trendSeries.reduce((sum, point) => sum + Math.abs(point), 0) / (trendSeries.length || 1);
  const denominator = Math.abs(startValue) > 0.001 ? Math.abs(startValue) : Math.max(1, averageMagnitude);
  const deltaPercent = ((endValue - startValue) / denominator) * 100;

  const trend = Math.abs(deltaPercent) < 0.2 ? "steady" : deltaPercent > 0 ? "up" : "down";
  const isGoodTrend =
    trend === "steady"
      ? true
      : inverse
        ? trend === "down"
        : trend === "up";

  const toneClass =
    trend === "steady"
      ? "text-muted-foreground"
      : isGoodTrend
        ? "text-emerald-600"
        : "text-rose-600";

  const trendLabel =
    trend === "steady"
      ? "steady"
      : inverse
        ? trend === "down"
          ? `improving ${Math.abs(deltaPercent).toFixed(1)}%`
          : `rising ${Math.abs(deltaPercent).toFixed(1)}%`
        : `${trend} ${Math.abs(deltaPercent).toFixed(1)}%`;

  return (
    <div className={cn("mt-3 space-y-1", className)}>
      <div className={cn("h-8 w-full", toneClass)}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
            <defs>
              <linearGradient id={`mini-stat-fill-${chartId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="currentColor" stopOpacity={0.35} />
                <stop offset="95%" stopColor="currentColor" stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              dataKey="value"
              type="monotone"
              stroke="currentColor"
              strokeWidth={2}
              fill={`url(#mini-stat-fill-${chartId})`}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {!hideLabel && (
        <p className={cn("text-[11px] font-medium leading-none", toneClass)}>
          {trendLabel}
        </p>
      )}
    </div>
  );
}
