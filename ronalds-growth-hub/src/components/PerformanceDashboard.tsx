import { useMemo, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AnalyticsChartShell,
  AnalyticsLegendContent,
  AnalyticsTooltipContent,
  analyticsAxisProps,
  analyticsColorAt,
  analyticsGridProps,
} from "@/components/ui/analytics-chart";
import type {
  DepartmentPerformanceRow,
  PerformancePeriod,
  PerformanceReportResponse,
} from "@/lib/api/performanceReport";

const formatMoney = (value?: number) =>
  `KES ${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const formatMoneyCompact = (value?: number) => {
  const amount = Number(value || 0);
  if (Math.abs(amount) >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M`;
  if (Math.abs(amount) >= 1_000) return `${(amount / 1_000).toFixed(0)}K`;
  return amount.toFixed(0);
};
const formatPercent = (value?: number) => `${Number(value || 0).toFixed(1)}%`;

const formatValue = (kind: "money" | "percent", value: number) =>
  kind === "money" ? formatMoney(value) : formatPercent(value);
const formatAxis = (kind: "money" | "percent", value: number) =>
  kind === "money" ? formatMoneyCompact(value) : formatPercent(value);

type DepartmentMetric =
  | "expectedBillableTarget"
  | "actualBillableAmount"
  | "collections"
  | "utilization";

const departmentMetricValue = (
  row: DepartmentPerformanceRow,
  metric: DepartmentMetric
) => {
  if (metric === "utilization") {
    return row.expectedBillableTarget > 0
      ? (row.actualBillableAmount / row.expectedBillableTarget) * 100
      : 0;
  }
  return Number(row[metric] || 0);
};

const MetricCard = ({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) => (
  <div className="rounded-xl border bg-background/60 p-4">
    <p className="text-xs font-medium text-muted-foreground">{label}</p>
    <p className="mt-1 text-lg font-semibold leading-tight">{value}</p>
    {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
  </div>
);

const ChartCard = ({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) => (
  <Card>
    <CardHeader className="pb-2">
      <CardTitle className="text-sm font-medium">{title}</CardTitle>
      <CardDescription>{description}</CardDescription>
    </CardHeader>
    <CardContent>{children}</CardContent>
  </Card>
);

const EmptyChart = () => (
  <p className="py-10 text-center text-sm text-muted-foreground">
    No data available for this period.
  </p>
);

const DepartmentBarChart = ({
  title,
  description,
  departments,
  metric,
  kind,
  colorIndex,
}: {
  title: string;
  description: string;
  departments: DepartmentPerformanceRow[];
  metric: DepartmentMetric;
  kind: "money" | "percent";
  colorIndex: number;
}) => {
  const data = useMemo(
    () =>
      departments
        .map((department) => ({
          name: department.name,
          value: departmentMetricValue(department, metric),
        }))
        .sort((a, b) => b.value - a.value),
    [departments, metric]
  );

  if (data.length === 0) {
    return (
      <ChartCard title={title} description={description}>
        <EmptyChart />
      </ChartCard>
    );
  }

  const height = Math.max(220, data.length * 32 + 40);

  return (
    <ChartCard title={title} description={description}>
      <AnalyticsChartShell style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 18, left: 4, bottom: 4 }}
          >
            <CartesianGrid {...analyticsGridProps} vertical />
            <XAxis
              type="number"
              {...analyticsAxisProps}
              tickFormatter={(value) => formatAxis(kind, Number(value))}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={140}
              {...analyticsAxisProps}
              tick={{ fontSize: 10 }}
            />
            <Tooltip
              content={
                <AnalyticsTooltipContent
                  valueFormatter={(value) => formatValue(kind, Number(value))}
                />
              }
            />
            <Bar
              dataKey="value"
              name="Value"
              fill={analyticsColorAt(colorIndex)}
              radius={[0, 6, 6, 0]}
              barSize={14}
            />
          </BarChart>
        </ResponsiveContainer>
      </AnalyticsChartShell>
    </ChartCard>
  );
};

type TrendSeries = {
  dataKey: string;
  name: string;
  colorIndex: number;
};

const TrendLineChart = ({
  title,
  description,
  buckets,
  kind,
  series,
}: {
  title: string;
  description: string;
  buckets: PerformanceReportResponse["trend"]["buckets"];
  kind: "money" | "percent";
  series: TrendSeries[];
}) => (
  <ChartCard title={title} description={description}>
    {buckets.length === 0 ? (
      <EmptyChart />
    ) : (
      <AnalyticsChartShell className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={buckets}
            margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
          >
            <CartesianGrid {...analyticsGridProps} />
            <XAxis dataKey="label" {...analyticsAxisProps} />
            <YAxis
              {...analyticsAxisProps}
              width={54}
              tickFormatter={(value) => formatAxis(kind, Number(value))}
            />
            <Tooltip
              content={
                <AnalyticsTooltipContent
                  valueFormatter={(value) => formatValue(kind, Number(value))}
                />
              }
            />
            <Legend content={<AnalyticsLegendContent />} />
            {series.map((item) => (
              <Line
                key={item.dataKey}
                type="monotone"
                dataKey={item.dataKey}
                name={item.name}
                stroke={analyticsColorAt(item.colorIndex)}
                strokeWidth={2.5}
                dot={{ r: 0 }}
                activeDot={{
                  r: 5,
                  strokeWidth: 0,
                  fill: analyticsColorAt(item.colorIndex),
                }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </AnalyticsChartShell>
    )}
  </ChartCard>
);

const ComparisonBarChart = ({
  title,
  description,
  totals,
}: {
  title: string;
  description: string;
  totals: PerformanceReportResponse["totals"];
}) => {
  const data = [
    { label: "Target", value: totals.expectedBillableTarget },
    { label: "Achieved", value: totals.actualBillableAmount },
    { label: "Collections", value: totals.collections },
  ];

  return (
    <ChartCard title={title} description={description}>
      <AnalyticsChartShell className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
          >
            <CartesianGrid {...analyticsGridProps} />
            <XAxis dataKey="label" {...analyticsAxisProps} />
            <YAxis
              {...analyticsAxisProps}
              width={54}
              tickFormatter={(value) => formatMoneyCompact(Number(value))}
            />
            <Tooltip
              content={
                <AnalyticsTooltipContent
                  valueFormatter={(value) => formatMoney(Number(value))}
                />
              }
            />
            <Bar dataKey="value" name="Value" radius={[6, 6, 0, 0]} barSize={44}>
              {data.map((_, index) => (
                <Cell key={index} fill={analyticsColorAt(index)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </AnalyticsChartShell>
    </ChartCard>
  );
};

export default function PerformanceDashboard({
  data,
  period,
}: {
  data: PerformanceReportResponse;
  period: PerformancePeriod;
}) {
  const utilization =
    data.totals.expectedBillableTarget > 0
      ? (data.totals.actualBillableAmount / data.totals.expectedBillableTarget) *
        100
      : 0;
  const collectionsEfficiency =
    data.totals.actualBillableAmount > 0
      ? (data.totals.collections / data.totals.actualBillableAmount) * 100
      : 0;
  const periodLabel =
    period === "weekly"
      ? "Daily performance"
      : period === "monthly"
        ? "Monthly performance"
        : period === "quarterly"
          ? "Quarter-to-date performance"
          : "Year-to-date performance";
  const showDepartments = data.canViewDepartments;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            {data.scopeLabel} performance
          </CardTitle>
          <CardDescription>
            {periodLabel} • {data.label} • {data.workingDays} working days •{" "}
            {data.holidayDays} holidays
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard
              label="Billable target"
              value={formatMoney(data.totals.expectedBillableTarget)}
              hint="Target hours × staff rates"
            />
            <MetricCard
              label="Achieved billable"
              value={formatMoney(data.totals.actualBillableAmount)}
            />
            <MetricCard
              label="Collections"
              value={formatMoney(data.totals.collections)}
            />
            <MetricCard
              label="Utilization rate"
              value={formatPercent(utilization)}
              hint="Billable amount ÷ billable target"
            />
            <MetricCard
              label="Collections efficiency"
              value={formatPercent(collectionsEfficiency)}
              hint="Collections ÷ billable amount"
            />
          </div>
        </CardContent>
      </Card>

      {period === "monthly" && showDepartments && (
        <div className="grid gap-4 lg:grid-cols-2">
          <DepartmentBarChart
            title="Expected billable amounts"
            description="Department targets for the selected period"
            departments={data.departments}
            metric="expectedBillableTarget"
            kind="money"
            colorIndex={4}
          />
          <DepartmentBarChart
            title="Achieved billable amounts"
            description="Department billable value for the selected period"
            departments={data.departments}
            metric="actualBillableAmount"
            kind="money"
            colorIndex={2}
          />
          <DepartmentBarChart
            title="Utilization rates"
            description="Billable amount ÷ expected target"
            departments={data.departments}
            metric="utilization"
            kind="percent"
            colorIndex={2}
          />
          <DepartmentBarChart
            title="Collections"
            description="Collections allocated to departments"
            departments={data.departments}
            metric="collections"
            kind="money"
            colorIndex={4}
          />
        </div>
      )}

      {period === "weekly" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <TrendLineChart
            title="Daily billable trend"
            description="Expected target, achieved billable amount and collections by day"
            buckets={data.trend.buckets}
            kind="money"
            series={[
              { dataKey: "expectedTarget", name: "Expected target", colorIndex: 4 },
              { dataKey: "billableAmount", name: "Achieved billable", colorIndex: 2 },
              { dataKey: "collections", name: "Collections", colorIndex: 3 },
            ]}
          />
          <TrendLineChart
            title="Daily utilization trend"
            description="Utilization and collections efficiency by day"
            buckets={data.trend.buckets}
            kind="percent"
            series={[
              { dataKey: "utilization", name: "Utilization", colorIndex: 2 },
              {
                dataKey: "collectionsEfficiency",
                name: "Collections efficiency",
                colorIndex: 4,
              },
            ]}
          />
          {showDepartments && (
            <>
              <DepartmentBarChart
                title="Department utilization"
                description="Utilization by department for the week"
                departments={data.departments}
                metric="utilization"
                kind="percent"
                colorIndex={2}
              />
              <DepartmentBarChart
                title="Department collections"
                description="Collections by department for the week"
                departments={data.departments}
                metric="collections"
                kind="money"
                colorIndex={4}
              />
            </>
          )}
        </div>
      )}

      {(period === "quarterly" || period === "yearly") && (
        <div className="grid gap-4 lg:grid-cols-2">
          <TrendLineChart
            title={
              period === "yearly"
                ? "Year-to-date billable trend"
                : "Quarter-to-date billable trend"
            }
            description="Expected target, achieved billable amount and collections by month"
            buckets={data.trend.buckets}
            kind="money"
            series={[
              { dataKey: "expectedTarget", name: "Expected target", colorIndex: 4 },
              { dataKey: "billableAmount", name: "Achieved billable", colorIndex: 2 },
              { dataKey: "collections", name: "Collections", colorIndex: 3 },
            ]}
          />
          <ComparisonBarChart
            title={
              period === "yearly"
                ? "Year-to-date totals"
                : "Quarter-to-date totals"
            }
            description="Target, achieved billable and collections side by side"
            totals={data.totals}
          />
          <TrendLineChart
            title="Utilization trend"
            description="Utilization rate by month"
            buckets={data.trend.buckets}
            kind="percent"
            series={[
              { dataKey: "utilization", name: "Utilization", colorIndex: 2 },
            ]}
          />
          {showDepartments && (
            <DepartmentBarChart
              title={
                period === "yearly"
                  ? "YTD utilization per department"
                  : "Quarter-to-date utilization per department"
              }
              description="Utilization rate by department"
              departments={data.departments}
              metric="utilization"
              kind="percent"
              colorIndex={2}
            />
          )}
        </div>
      )}
    </div>
  );
}
