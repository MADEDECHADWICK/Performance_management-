import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { useId, useMemo } from "react";
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, YAxis } from "recharts";

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

const densifySeries = (input: number[]) => {
  if (input.length <= 1) {
    return input;
  }

  const densified: number[] = [];

  for (let index = 0; index < input.length - 1; index += 1) {
    const start = input[index];
    const end = input[index + 1];
    const delta = end - start;
    const wobble = Math.max(Math.abs(delta) * 0.08, Math.abs(end) * 0.012, 0.35);

    if (index === 0) {
      densified.push(start);
    }

    if (Math.abs(delta) < 0.001) {
      densified.push(start + wobble * 0.32, start - wobble * 0.18);
    } else {
      densified.push(
        start + delta * 0.28 + wobble * 0.28,
        start + delta * 0.66 - wobble * 0.16
      );
    }

    densified.push(end);
  }

  return densified;
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
    return densifySeries(normalizedSeries);
  }

  const safeValue = toNumber(value);
  const safeBaseline =
    baseline != null
      ? toNumber(baseline)
      : safeValue === 0
        ? 0
        : safeValue - Math.abs(safeValue) * 0.18;

  const delta = safeValue - safeBaseline;
  return densifySeries([
    safeBaseline,
    safeBaseline + delta * 0.35,
    safeBaseline + delta * 0.7,
    safeValue,
  ]);
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
      ? "stable"
      : inverse
        ? trend === "down"
          ? `improving ${Math.abs(deltaPercent).toFixed(1)}%`
          : `rising ${Math.abs(deltaPercent).toFixed(1)}%`
        : `${trend} ${Math.abs(deltaPercent).toFixed(1)}%`;

  const palette =
    trend === "steady"
      ? {
          stroke: "#2563eb",
          fillTop: "#60a5fa",
          fillBottom: "#dbeafe",
          reference: "#bfdbfe",
          panelClass:
            "border-sky-100/80 bg-[linear-gradient(180deg,rgba(239,246,255,0.92),rgba(255,255,255,0.98))]",
          badgeClass: "border-sky-200/80 bg-white/90 text-sky-700",
        }
      : isGoodTrend
        ? {
            stroke: "#0f766e",
            fillTop: "#14b8a6",
            fillBottom: "#ccfbf1",
            reference: "#99f6e4",
            panelClass:
              "border-emerald-100/80 bg-[linear-gradient(180deg,rgba(236,253,245,0.94),rgba(255,255,255,0.98))]",
            badgeClass: "border-emerald-200/80 bg-white/90 text-emerald-700",
          }
        : {
            stroke: "#e11d48",
            fillTop: "#fb7185",
            fillBottom: "#ffe4e6",
            reference: "#fecdd3",
            panelClass:
              "border-rose-100/80 bg-[linear-gradient(180deg,rgba(255,241,242,0.94),rgba(255,255,255,0.98))]",
            badgeClass: "border-rose-200/80 bg-white/90 text-rose-700",
          };

  const chartMin = Math.min(...trendSeries);
  const chartMax = Math.max(...trendSeries);
  const chartPadding = Math.max((chartMax - chartMin) * 0.42, Math.abs(endValue) * 0.08, 1);
  const yDomain =
    chartMin === chartMax
      ? [chartMin - chartPadding, chartMax + chartPadding]
      : [chartMin - chartPadding, chartMax + chartPadding];

  const TrendIcon = trend === "steady" ? Minus : trend === "up" ? ArrowUpRight : ArrowDownRight;

  return (
    <div
      className={cn(
        "mt-4 min-w-0 overflow-hidden rounded-2xl border px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]",
        palette.panelClass,
        className
      )}
    >
      {!hideLabel && (
        <div className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            trend signal
          </span>
          <span
            className={cn(
              "inline-flex min-w-0 shrink items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-tight",
              palette.badgeClass
            )}
          >
            <TrendIcon className="h-3 w-3 shrink-0" />
            <span className="truncate">{trendLabel}</span>
          </span>
        </div>
      )}

      <div className="relative h-14 overflow-hidden rounded-xl border border-white/70 bg-white/75 shadow-[inset_0_-16px_32px_-24px_rgba(15,23,42,0.35)]">
        <div className="absolute inset-x-3 bottom-2 top-2 rounded-[10px] bg-[linear-gradient(180deg,rgba(255,255,255,0.8),rgba(241,245,249,0.85))]" />
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 6, right: 6, left: 6, bottom: 6 }}>
            <defs>
              <linearGradient id={`mini-stat-fill-${chartId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={palette.fillTop} stopOpacity={0.55} />
                <stop offset="70%" stopColor={palette.fillTop} stopOpacity={0.16} />
                <stop offset="100%" stopColor={palette.fillBottom} stopOpacity={0.02} />
              </linearGradient>
              <filter id={`mini-stat-shadow-${chartId}`} x="-20%" y="-20%" width="140%" height="160%">
                <feDropShadow dx="0" dy="5" stdDeviation="6" floodColor={palette.fillTop} floodOpacity="0.25" />
              </filter>
            </defs>
            <YAxis hide domain={yDomain} />
            <ReferenceLine
              y={startValue}
              stroke={palette.reference}
              strokeDasharray="4 6"
              strokeOpacity={0.9}
            />
            <Area
              dataKey="value"
              type="monotone"
              stroke={palette.stroke}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill={`url(#mini-stat-fill-${chartId})`}
              dot={(props) =>
                props.index === chartData.length - 1 ? (
                  <circle
                    cx={props.cx}
                    cy={props.cy}
                    r={4}
                    fill={palette.stroke}
                    stroke="white"
                    strokeWidth={2}
                  />
                ) : null
              }
              isAnimationActive={false}
              filter={`url(#mini-stat-shadow-${chartId})`}
            />
          </AreaChart>
        </ResponsiveContainer>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-white/65 via-white/12 to-transparent" />
      </div>

      {!hideLabel && (
        <div className="mt-2 flex min-w-0 items-center justify-between gap-1 text-[11px] font-medium">
          <span className="shrink-0 text-slate-500">Baseline</span>
          <span className={cn(toneClass, "min-w-0 truncate text-right")}>
            {Math.abs(deltaPercent) < 0.2 ? "Steady" : `${Math.abs(deltaPercent).toFixed(1)}% shift`}
          </span>
        </div>
      )}
    </div>
  );
}
