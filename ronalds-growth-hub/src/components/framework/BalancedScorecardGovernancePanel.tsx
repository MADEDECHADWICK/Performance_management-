import { Filter, LineChart, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  BalancedScorecardMeasurementPeriodSummary,
  BalancedScorecardMeasurementSnapshotRecord,
  WorkspaceKpi,
} from "@/lib/api/performanceFramework";
import type { RoleHomeMetric } from "@/lib/balancedScorecardUiConfig";
import {
  MetricCard,
  SectionTitle,
  StatusBadge,
  TrendBars,
} from "@/components/framework/BalancedScorecardPrimitives";

type Props = {
  title: string;
  metrics: RoleHomeMetric[];
  search: string;
  onSearchChange: (value: string) => void;
  canPreviewAllRoles: boolean;
  selectedMeasurementPeriodId: string;
  onSelectedMeasurementPeriodChange: (value: string) => void;
  measurementPeriods: BalancedScorecardMeasurementPeriodSummary[];
  measurementVersionId?: number;
  measurementSubmitting: string | null;
  selectedMeasurementPeriod: BalancedScorecardMeasurementPeriodSummary | null;
  onOpenCreateMeasurementPeriod: () => void;
  onGenerateMeasurementPeriod: () => void;
  onSubmitMeasurementPeriod: () => void;
  onCloseMeasurementPeriod: () => void;
  onReviewMeasurementPeriod: (decision: "start_review" | "request_changes" | "approve") => void;
  trackingRows: WorkspaceKpi[];
  measurementRows: BalancedScorecardMeasurementSnapshotRecord[];
  highlightedMeasurementSnapshot: BalancedScorecardMeasurementSnapshotRecord | null;
};

export function BalancedScorecardGovernancePanel({
  title,
  metrics,
  search,
  onSearchChange,
  canPreviewAllRoles,
  selectedMeasurementPeriodId,
  onSelectedMeasurementPeriodChange,
  measurementPeriods,
  measurementVersionId,
  measurementSubmitting,
  selectedMeasurementPeriod,
  onOpenCreateMeasurementPeriod,
  onGenerateMeasurementPeriod,
  onSubmitMeasurementPeriod,
  onCloseMeasurementPeriod,
  onReviewMeasurementPeriod,
  trackingRows,
  measurementRows,
  highlightedMeasurementSnapshot,
}: Props) {
  const displayRows =
    canPreviewAllRoles && selectedMeasurementPeriod ? measurementRows : trackingRows;

  return (
    <Card className="rounded-[28px] border-border/70 shadow-sm">
      <CardHeader className="space-y-4">
        <SectionTitle icon={LineChart} title={title} />
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search tracked KPIs"
              className="h-11 rounded-2xl pl-9"
            />
          </div>
          <Button variant="outline" className="h-11 rounded-2xl justify-start gap-2">
            <Filter className="h-4 w-4" />
            Advanced filters
          </Button>
        </div>
        {canPreviewAllRoles ? (
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_240px_auto_auto_auto_auto]">
            <Select
              value={selectedMeasurementPeriodId}
              onValueChange={onSelectedMeasurementPeriodChange}
            >
              <SelectTrigger className="h-11 rounded-2xl">
                <SelectValue placeholder="Select measurement period" />
              </SelectTrigger>
              <SelectContent>
                {measurementPeriods.map((period) => (
                  <SelectItem key={period.id} value={String(period.id)}>
                    {period.label} · {period.status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              className="h-11 rounded-2xl"
              onClick={onOpenCreateMeasurementPeriod}
              disabled={!measurementVersionId}
            >
              Create period
            </Button>
            <Button
              variant="outline"
              className="h-11 rounded-2xl"
              onClick={onGenerateMeasurementPeriod}
              disabled={
                !selectedMeasurementPeriod ||
                measurementSubmitting === `generateMeasurement:${selectedMeasurementPeriod?.id}`
              }
            >
              {selectedMeasurementPeriod &&
              measurementSubmitting === `generateMeasurement:${selectedMeasurementPeriod.id}`
                ? "Generating..."
                : "Generate pack"}
            </Button>
            <Button
              variant="outline"
              className="h-11 rounded-2xl"
              onClick={onSubmitMeasurementPeriod}
              disabled={
                !selectedMeasurementPeriod ||
                !["draft", "generated"].includes(selectedMeasurementPeriod.status) ||
                measurementSubmitting === `submitMeasurement:${selectedMeasurementPeriod?.id}`
              }
            >
              {selectedMeasurementPeriod &&
              measurementSubmitting === `submitMeasurement:${selectedMeasurementPeriod.id}`
                ? "Submitting..."
                : "Submit"}
            </Button>
            <Button
              variant="outline"
              className="h-11 rounded-2xl"
              onClick={onCloseMeasurementPeriod}
              disabled={
                !selectedMeasurementPeriod ||
                selectedMeasurementPeriod.status !== "approved" ||
                measurementSubmitting === `closeMeasurement:${selectedMeasurementPeriod?.id}`
              }
            >
              {selectedMeasurementPeriod &&
              measurementSubmitting === `closeMeasurement:${selectedMeasurementPeriod.id}`
                ? "Closing..."
                : "Close"}
            </Button>
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => (
            <MetricCard
              key={metric.label}
              label={metric.label}
              value={metric.value}
              icon={metric.icon}
            />
          ))}
        </div>

        {canPreviewAllRoles && selectedMeasurementPeriod ? (
          <Card className="rounded-[24px] border-border/60 bg-muted/20 shadow-none">
            <CardHeader>
              <CardTitle className="text-base">Measurement workflow</CardTitle>
              <CardDescription>
                {selectedMeasurementPeriod.label} · {selectedMeasurementPeriod.status}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_320px]">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-border/60 bg-background p-4">
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                    Snapshots
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">
                    {selectedMeasurementPeriod.snapshotCount}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background p-4">
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                    At risk / off track
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">
                    {selectedMeasurementPeriod.atRiskCount +
                      selectedMeasurementPeriod.offTrackCount}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background p-4">
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                    Warnings
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">
                    {selectedMeasurementPeriod.warningCount}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background p-4">
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                    Missing data
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">
                    {selectedMeasurementPeriod.missingDataCount}
                  </p>
                </div>
              </div>
              <div className="space-y-2 rounded-2xl border border-border/60 bg-background p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                  Review actions
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    className="rounded-xl"
                    disabled={
                      !selectedMeasurementPeriod ||
                      selectedMeasurementPeriod.status !== "submitted" ||
                      measurementSubmitting === `start_review:${selectedMeasurementPeriod.id}`
                    }
                    onClick={() => onReviewMeasurementPeriod("start_review")}
                  >
                    Start review
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-xl"
                    disabled={
                      !selectedMeasurementPeriod ||
                      !["submitted", "in_review"].includes(selectedMeasurementPeriod.status) ||
                      measurementSubmitting === `request_changes:${selectedMeasurementPeriod.id}`
                    }
                    onClick={() => onReviewMeasurementPeriod("request_changes")}
                  >
                    Request changes
                  </Button>
                  <Button
                    className="rounded-xl"
                    disabled={
                      !selectedMeasurementPeriod ||
                      !["submitted", "in_review"].includes(selectedMeasurementPeriod.status) ||
                      measurementSubmitting === `approve:${selectedMeasurementPeriod.id}`
                    }
                    onClick={() => onReviewMeasurementPeriod("approve")}
                  >
                    Approve pack
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Generated snapshots stay editable until the period is closed, then the pack
                  freezes.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Card className="rounded-[24px] border-border/60 shadow-none">
          <CardHeader>
            <CardTitle className="text-base">
              {canPreviewAllRoles && selectedMeasurementPeriod
                ? "Measurement snapshot pack"
                : "Tracking board"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>KPI</TableHead>
                  <TableHead>Target vs actual</TableHead>
                  <TableHead>Weighted score</TableHead>
                  <TableHead>Update frequency</TableHead>
                  <TableHead>Trend</TableHead>
                  <TableHead>Initiative progress</TableHead>
                  {canPreviewAllRoles && selectedMeasurementPeriod ? (
                    <TableHead>Data quality</TableHead>
                  ) : null}
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayRows.map((kpi) => (
                  <TableRow key={kpi.id}>
                    <TableCell className="min-w-[240px]">
                      <div className="space-y-1">
                        <p className="font-medium text-foreground">
                          {"kpiName" in kpi ? kpi.kpiName : kpi.name}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <p className="font-medium text-foreground">
                          {"actualLabel" in kpi ? kpi.actualLabel : kpi.actual} / {kpi.firmTarget}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="font-semibold text-foreground">
                      {kpi.weightedScore}
                    </TableCell>
                    <TableCell>{kpi.updateFrequency}</TableCell>
                    <TableCell>
                      <TrendBars points={kpi.trend} />
                    </TableCell>
                    <TableCell className="min-w-[180px]">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Linked initiatives</span>
                          <span className="font-medium text-foreground">
                            {kpi.initiativeProgress}%
                          </span>
                        </div>
                        <Progress value={kpi.initiativeProgress} className="h-2.5 rounded-full" />
                      </div>
                    </TableCell>
                    {canPreviewAllRoles && selectedMeasurementPeriod ? (
                      <TableCell>
                        {"dataQualityStatus" in kpi ? (
                          <Badge variant="outline" className="rounded-full">
                            {kpi.dataQualityStatus.replace(/_/g, " ")}
                          </Badge>
                        ) : null}
                      </TableCell>
                    ) : null}
                    <TableCell>
                      <StatusBadge status={kpi.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {canPreviewAllRoles && selectedMeasurementPeriod && highlightedMeasurementSnapshot ? (
          <Card className="rounded-[24px] border-border/60 bg-muted/20 shadow-none">
            <CardHeader>
              <CardTitle className="text-base">Trace and data quality</CardTitle>
              <CardDescription>
                {highlightedMeasurementSnapshot.kpiName} ·{" "}
                {highlightedMeasurementSnapshot.dataQualityStatus.replace(/_/g, " ")}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_320px]">
              <div className="space-y-3">
                {highlightedMeasurementSnapshot.traces.map((trace) => (
                  <div
                    key={trace.id}
                    className="rounded-2xl border border-border/60 bg-background p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-foreground">{trace.sourceLabel}</p>
                        <p className="text-sm text-muted-foreground">
                          {trace.note || "No supporting note yet."}
                        </p>
                      </div>
                      <Badge variant="outline" className="rounded-full">
                        {trace.dataQualityStatus.replace(/_/g, " ")}
                      </Badge>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                          Records
                        </p>
                        <p className="mt-2 font-medium text-foreground">
                          {trace.recordCount ?? 0}
                        </p>
                      </div>
                      <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                          Raw value
                        </p>
                        <p className="mt-2 font-medium text-foreground">
                          {trace.rawValue ?? "-"}
                        </p>
                      </div>
                      <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                          Normalized
                        </p>
                        <p className="mt-2 font-medium text-foreground">
                          {trace.normalizedValue ?? "-"}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-3 rounded-[24px] border border-border/60 bg-background p-4">
                <p className="text-sm font-medium text-foreground">Snapshot summary</p>
                <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                    Owner update
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {highlightedMeasurementSnapshot.ownerUpdate ||
                      "No owner commentary captured in this snapshot."}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                    Data-quality note
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {highlightedMeasurementSnapshot.dataQualityNote ||
                      "No additional data-quality note for this KPI."}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </CardContent>
    </Card>
  );
}
