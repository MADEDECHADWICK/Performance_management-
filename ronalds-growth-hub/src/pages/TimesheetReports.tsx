import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import PageLoader from "@/components/ui/page-loader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import timesheetReportsAPI, {
  type ClientDrilldownResponse,
  type ClientOverviewResponse,
  type ClientOverviewRow,
  type DetailedEntry,
  type DrilldownStaffRow,
  type JobDrilldownResponse,
  type JobOverviewResponse,
  type JobOverviewRow,
  type ReportOptions,
  type ReportResponse,
  type SummaryRow,
  type TimesheetReportGroup,
  type TimesheetReportMode,
  type TimesheetReportPeriod,
  type TimesheetReportScope,
} from "@/lib/api/timesheetReports";
import { getPeriodRange } from "@/lib/reportPeriods";

type AnyReport = ReportResponse | JobOverviewResponse | ClientOverviewResponse;

const PERIOD_OPTIONS: Array<{ value: TimesheetReportPeriod; label: string }> = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
  { value: "custom", label: "Custom" },
];

const SCOPE_LABELS: Record<TimesheetReportScope, string> = {
  self: "My report",
  team: "My team",
  department: "Department",
  partner: "Partner",
  firm: "Firm-wide",
};

const TAB_CONFIG: Array<{
  value: string;
  label: string;
  group: TimesheetReportGroup;
  mode: TimesheetReportMode;
}> = [
  { value: "staff-summary", label: "Staff Summary", group: "staff", mode: "summary" },
  { value: "staff-detailed", label: "Staff Detailed", group: "staff", mode: "detailed" },
  { value: "job-summary", label: "Job Summary", group: "job", mode: "summary" },
  { value: "job-detailed", label: "Job Detailed", group: "job", mode: "detailed" },
  { value: "client-summary", label: "Client Summary", group: "client", mode: "summary" },
  { value: "client-detailed", label: "Client Detailed", group: "client", mode: "detailed" },
];

const formatHours = (value?: number) => `${Number(value || 0).toFixed(2)}h`;
const formatMoney = (value?: number) =>
  `KES ${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const formatMoneyCompact = (value?: number) => {
  const amount = Number(value || 0);
  if (Math.abs(amount) >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M`;
  if (Math.abs(amount) >= 1_000) return `${(amount / 1_000).toFixed(0)}K`;
  return amount.toFixed(0);
};
const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "-";
const formatDateTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString("en-GB") : "-";

const downloadCsv = (filename: string, headers: string[], rows: Array<Array<string | number | null>>) => {
  const escape = (value: string | number | null) => {
    const raw = String(value ?? "");
    return raw.includes(",") || raw.includes('"') || raw.includes("\n")
      ? `"${raw.replace(/"/g, '""')}"`
      : raw;
  };
  const content = [headers, ...rows].map((row) => row.map(escape).join(",")).join("\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const DETAILED_CSV_HEADERS = [
  "Date",
  "Start",
  "End",
  "Staff",
  "Job No",
  "Job Name",
  "Job Fee",
  "Client",
  "Task",
  "Notes",
  "Hours",
  "Billable",
  "Non-billable category",
  "Billable amount",
  "Non-billable amount",
  "Cost",
  "Profit/Loss",
  "Status",
  "Approver",
  "Approved at",
  "Entered at",
];

const toDetailedCsvRow = (entry: DetailedEntry) => [
  formatDate(entry.dateWorked),
  entry.startedAt ? formatDateTime(entry.startedAt) : "",
  entry.endedAt ? formatDateTime(entry.endedAt) : "",
  entry.employeeName,
  entry.jobNo,
  entry.jobName,
  entry.jobFee,
  entry.clientName,
  entry.taskName,
  entry.description || "",
  entry.hours,
  entry.billable ? "Yes" : "No",
  entry.nonBillableActivity || entry.nonBillableCategory || "",
  entry.billableAmount,
  entry.nonBillableAmount,
  entry.costAmount,
  entry.profitLoss,
  entry.status,
  entry.approverName || "",
  entry.approvedAt ? formatDateTime(entry.approvedAt) : "",
  formatDateTime(entry.createdAt),
];

const TotalsCards = ({ report }: { report: AnyReport }) => (
  <div className="grid gap-4 md:grid-cols-5">
    <div className="rounded-lg border p-4">
      <p className="text-xs text-muted-foreground">Non-billable time</p>
      <p className="text-2xl font-bold text-amber-600">{formatHours(report.totals.nonBillableHours)}</p>
    </div>
    <div className="rounded-lg border p-4">
      <p className="text-xs text-muted-foreground">Non-billable amount</p>
      <p className="text-2xl font-bold text-amber-600">{formatMoney(report.totals.nonBillableAmount)}</p>
    </div>
    <div className="rounded-lg border p-4">
      <p className="text-xs text-muted-foreground">Billable time</p>
      <p className="text-2xl font-bold text-emerald-600">{formatHours(report.totals.billableHours)}</p>
    </div>
    <div className="rounded-lg border p-4">
      <p className="text-xs text-muted-foreground">Billable amount</p>
      <p className="text-2xl font-bold text-emerald-600">{formatMoney(report.totals.billableAmount)}</p>
    </div>
    <div className="rounded-lg border p-4">
      <p className="text-xs text-muted-foreground">Total time / amount</p>
      <p className="text-2xl font-bold">{formatHours(report.totals.totalHours)}</p>
      <p className="text-xs text-muted-foreground">{formatMoney(report.totals.totalAmount)}</p>
    </div>
  </div>
);

const SummaryTable = ({
  rows,
  onExport,
  onView,
}: {
  rows: SummaryRow[];
  onExport: () => void;
  onView: (row: SummaryRow) => void;
}) => (
  <div className="space-y-3">
    <div className="flex justify-end">
      <Button variant="outline" size="sm" onClick={onExport} disabled={rows.length === 0}>
        Export CSV
      </Button>
    </div>
    <div className="max-h-[520px] overflow-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Staff</TableHead>
            <TableHead>Job No.</TableHead>
            <TableHead>Job name</TableHead>
            <TableHead>Client</TableHead>
            <TableHead>Task</TableHead>
            <TableHead className="text-right">Non-billable hrs</TableHead>
            <TableHead className="text-right">Non-billable amount</TableHead>
            <TableHead className="text-right">Billable hrs</TableHead>
            <TableHead className="text-right">Billable amount</TableHead>
            <TableHead className="text-right">Total hrs</TableHead>
            <TableHead className="sticky right-0 border-l bg-background text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={11} className="text-center text-muted-foreground">
                No time entries match the current filters.
              </TableCell>
            </TableRow>
          )}
          {rows.map((row, index) => (
            <TableRow key={`${row.employeeProfileId}-${row.jobNo}-${row.taskName}-${index}`}>
              <TableCell className="font-medium">{row.employeeName}</TableCell>
              <TableCell>{row.jobNo}</TableCell>
              <TableCell>{row.jobName}</TableCell>
              <TableCell>{row.clientName}</TableCell>
              <TableCell>{row.taskName}</TableCell>
              <TableCell className="text-right">{formatHours(row.nonBillableHours)}</TableCell>
              <TableCell className="text-right">{formatMoney(row.nonBillableAmount)}</TableCell>
              <TableCell className="text-right">{formatHours(row.billableHours)}</TableCell>
              <TableCell className="text-right">{formatMoney(row.billableAmount)}</TableCell>
              <TableCell className="text-right font-medium">{formatHours(row.totalHours)}</TableCell>
              <TableCell className="sticky right-0 border-l bg-background text-right">
                <Button size="sm" variant="outline" onClick={() => onView(row)}>
                  View
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  </div>
);

const JobOverviewTable = ({
  rows,
  onOpen,
  onExport,
}: {
  rows: JobOverviewRow[];
  onOpen: (row: JobOverviewRow) => void;
  onExport: () => void;
}) => (
  <div className="space-y-3">
    <div className="flex justify-end">
      <Button variant="outline" size="sm" onClick={onExport} disabled={rows.length === 0}>
        Export CSV
      </Button>
    </div>
    <div className="max-h-[520px] overflow-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Job No.</TableHead>
            <TableHead>Job name</TableHead>
            <TableHead>Client</TableHead>
            <TableHead className="text-right">Fee</TableHead>
            <TableHead className="text-right">Staff</TableHead>
            <TableHead className="text-right">Non-billable hrs</TableHead>
            <TableHead className="text-right">Non-billable amount</TableHead>
            <TableHead className="text-right">Billable hrs</TableHead>
            <TableHead className="text-right">Billable amount</TableHead>
            <TableHead className="text-right">Total hrs</TableHead>
            <TableHead className="sticky right-0 border-l bg-background text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={11} className="text-center text-muted-foreground">
                No jobs match the current filters.
              </TableCell>
            </TableRow>
          )}
          {rows.map((row) => (
            <TableRow
              key={row.jobKey}
              className="cursor-pointer"
              onClick={() => onOpen(row)}
            >
              <TableCell className="font-medium">{row.jobNo}</TableCell>
              <TableCell>{row.jobName}</TableCell>
              <TableCell>{row.clientName}</TableCell>
              <TableCell className="text-right">{formatMoney(row.fee)}</TableCell>
              <TableCell className="text-right">{row.staffCount}</TableCell>
              <TableCell className="text-right">{formatHours(row.nonBillableHours)}</TableCell>
              <TableCell className="text-right">{formatMoney(row.nonBillableAmount)}</TableCell>
              <TableCell className="text-right">{formatHours(row.billableHours)}</TableCell>
              <TableCell className="text-right">{formatMoney(row.billableAmount)}</TableCell>
              <TableCell className="text-right font-medium">{formatHours(row.totalHours)}</TableCell>
              <TableCell className="sticky right-0 border-l bg-background text-right">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpen(row);
                  }}
                >
                  View
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  </div>
);

const ClientOverviewTable = ({
  rows,
  onOpen,
  onExport,
}: {
  rows: ClientOverviewRow[];
  onOpen: (row: ClientOverviewRow) => void;
  onExport: () => void;
}) => (
  <div className="space-y-3">
    <div className="flex justify-end">
      <Button variant="outline" size="sm" onClick={onExport} disabled={rows.length === 0}>
        Export CSV
      </Button>
    </div>
    <div className="max-h-[520px] overflow-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Client</TableHead>
            <TableHead className="text-right">Jobs</TableHead>
            <TableHead className="text-right">Staff</TableHead>
            <TableHead className="text-right">Non-billable hrs</TableHead>
            <TableHead className="text-right">Non-billable amount</TableHead>
            <TableHead className="text-right">Billable hrs</TableHead>
            <TableHead className="text-right">Billable amount</TableHead>
            <TableHead className="text-right">Total hrs</TableHead>
            <TableHead className="sticky right-0 border-l bg-background text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={9} className="text-center text-muted-foreground">
                No clients match the current filters.
              </TableCell>
            </TableRow>
          )}
          {rows.map((row) => (
            <TableRow
              key={row.clientKey}
              className="cursor-pointer"
              onClick={() => onOpen(row)}
            >
              <TableCell>
                <div className="font-medium">{row.clientName}</div>
                <div className="text-xs text-muted-foreground">
                  Client ID: {row.clientId ?? "-"}
                </div>
              </TableCell>
              <TableCell className="text-right">{row.jobCount}</TableCell>
              <TableCell className="text-right">{row.staffCount}</TableCell>
              <TableCell className="text-right">{formatHours(row.nonBillableHours)}</TableCell>
              <TableCell className="text-right">{formatMoney(row.nonBillableAmount)}</TableCell>
              <TableCell className="text-right">{formatHours(row.billableHours)}</TableCell>
              <TableCell className="text-right">{formatMoney(row.billableAmount)}</TableCell>
              <TableCell className="text-right font-medium">{formatHours(row.totalHours)}</TableCell>
              <TableCell className="sticky right-0 border-l bg-background text-right">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpen(row);
                  }}
                >
                  View
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  </div>
);

const DrilldownStaffTable = ({ staff }: { staff: DrilldownStaffRow[] }) => (
  <div className="min-w-0 overflow-hidden rounded-md border">
    <div className="border-b p-2 text-sm font-medium">Staff performance</div>
    <div className="max-h-[260px] w-full overflow-auto">
      <Table className="min-w-full text-xs">
        <TableHeader>
          <TableRow>
            <TableHead className="h-8 whitespace-nowrap px-2">Staff</TableHead>
            <TableHead className="h-8 whitespace-nowrap px-2">Dept</TableHead>
            <TableHead className="h-8 px-2 text-right">Entries</TableHead>
            <TableHead className="h-8 whitespace-nowrap px-2 text-right">Billable hrs</TableHead>
            <TableHead className="h-8 whitespace-nowrap px-2 text-right">Billable (KES)</TableHead>
            <TableHead className="h-8 whitespace-nowrap px-2 text-right">Non-billable hrs</TableHead>
            <TableHead className="h-8 whitespace-nowrap px-2 text-right">Non-billable (KES)</TableHead>
            <TableHead className="h-8 whitespace-nowrap px-2 text-right">Cost (KES)</TableHead>
            <TableHead className="h-8 whitespace-nowrap px-2 text-right">P/L (KES)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {staff.length === 0 && (
            <TableRow>
              <TableCell colSpan={9} className="text-center text-muted-foreground">
                No staff entries.
              </TableCell>
            </TableRow>
          )}
          {staff.map((row) => (
            <TableRow key={row.employeeProfileId}>
              <TableCell className="whitespace-nowrap px-2 py-1.5 font-medium">{row.employeeName}</TableCell>
              <TableCell className="px-2 py-1.5">{row.departmentName || "-"}</TableCell>
              <TableCell className="px-2 py-1.5 text-right">{row.entriesCount}</TableCell>
              <TableCell className="px-2 py-1.5 text-right">{formatHours(row.billableHours)}</TableCell>
              <TableCell className="px-2 py-1.5 text-right">{formatMoneyCompact(row.billableAmount)}</TableCell>
              <TableCell className="px-2 py-1.5 text-right">{formatHours(row.nonBillableHours)}</TableCell>
              <TableCell className="px-2 py-1.5 text-right">{formatMoneyCompact(row.nonBillableAmount)}</TableCell>
              <TableCell className="px-2 py-1.5 text-right">{formatMoneyCompact(row.cost)}</TableCell>
              <TableCell className={`px-2 py-1.5 text-right ${row.profitLoss < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                {formatMoneyCompact(row.profitLoss)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  </div>
);

const ClientJobsTable = ({ jobs }: { jobs: ClientDrilldownResponse["jobs"] }) => (
  <div className="min-w-0 overflow-hidden rounded-md border">
    <div className="border-b p-2 text-sm font-medium">Jobs under this client</div>
    <div className="max-h-[230px] w-full overflow-auto">
      <Table className="min-w-full text-xs">
        <TableHeader>
          <TableRow>
            <TableHead className="h-8 whitespace-nowrap px-2">Job No.</TableHead>
            <TableHead className="h-8 px-2">Job name</TableHead>
            <TableHead className="h-8 whitespace-nowrap px-2 text-right">Fee (KES)</TableHead>
            <TableHead className="h-8 px-2 text-right">Staff</TableHead>
            <TableHead className="h-8 px-2 text-right">Entries</TableHead>
            <TableHead className="h-8 whitespace-nowrap px-2 text-right">Billable hrs</TableHead>
            <TableHead className="h-8 whitespace-nowrap px-2 text-right">Billable (KES)</TableHead>
            <TableHead className="h-8 whitespace-nowrap px-2 text-right">Non-billable hrs</TableHead>
            <TableHead className="h-8 whitespace-nowrap px-2 text-right">Non-billable (KES)</TableHead>
            <TableHead className="h-8 whitespace-nowrap px-2 text-right">Total hrs</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.length === 0 && (
            <TableRow>
              <TableCell colSpan={10} className="text-center text-muted-foreground">
                No jobs under this client for the period.
              </TableCell>
            </TableRow>
          )}
          {jobs.map((job) => (
            <TableRow key={job.jobKey}>
              <TableCell className="whitespace-nowrap px-2 py-1.5 font-medium">{job.jobNo}</TableCell>
              <TableCell className="max-w-[220px] truncate px-2 py-1.5" title={job.jobName}>
                {job.jobName}
              </TableCell>
              <TableCell className="px-2 py-1.5 text-right">{formatMoneyCompact(job.fee)}</TableCell>
              <TableCell className="px-2 py-1.5 text-right">{job.staffCount}</TableCell>
              <TableCell className="px-2 py-1.5 text-right">{job.entriesCount}</TableCell>
              <TableCell className="px-2 py-1.5 text-right">{formatHours(job.billableHours)}</TableCell>
              <TableCell className="px-2 py-1.5 text-right">{formatMoneyCompact(job.billableAmount)}</TableCell>
              <TableCell className="px-2 py-1.5 text-right">{formatHours(job.nonBillableHours)}</TableCell>
              <TableCell className="px-2 py-1.5 text-right">{formatMoneyCompact(job.nonBillableAmount)}</TableCell>
              <TableCell className="px-2 py-1.5 text-right font-medium">{formatHours(job.totalHours)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  </div>
);

const DetailedTable = ({
  entries,
  onExport,
  onView,
}: {
  entries: DetailedEntry[];
  onExport: () => void;
  onView: (entry: DetailedEntry) => void;
}) => (
  <div className="space-y-3">
    <div className="flex justify-end">
      <Button variant="outline" size="sm" onClick={onExport} disabled={entries.length === 0}>
        Export CSV
      </Button>
    </div>
    <div className="max-h-[560px] overflow-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Start</TableHead>
            <TableHead>End</TableHead>
            <TableHead>Staff</TableHead>
            <TableHead>Job No.</TableHead>
            <TableHead>Job name</TableHead>
            <TableHead className="text-right">Job fee</TableHead>
            <TableHead>Client</TableHead>
            <TableHead>Task</TableHead>
            <TableHead>Notes</TableHead>
            <TableHead className="text-right">Hrs</TableHead>
            <TableHead>Type</TableHead>
            <TableHead className="text-right">Non-billable amount</TableHead>
            <TableHead className="text-right">Billable amount</TableHead>
            <TableHead className="text-right">Cost</TableHead>
            <TableHead className="text-right">P/L</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Approver</TableHead>
            <TableHead>Approved at</TableHead>
            <TableHead>Entered</TableHead>
            <TableHead className="sticky right-0 border-l bg-background text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.length === 0 && (
            <TableRow>
              <TableCell colSpan={21} className="text-center text-muted-foreground">
                No time entries match the current filters.
              </TableCell>
            </TableRow>
          )}
          {entries.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell>{formatDate(entry.dateWorked)}</TableCell>
              <TableCell>{entry.startedAt ? formatDateTime(entry.startedAt) : "-"}</TableCell>
              <TableCell>{entry.endedAt ? formatDateTime(entry.endedAt) : "-"}</TableCell>
              <TableCell className="font-medium">{entry.employeeName}</TableCell>
              <TableCell>{entry.jobNo}</TableCell>
              <TableCell>{entry.jobName}</TableCell>
              <TableCell className="text-right">{formatMoneyCompact(entry.jobFee)}</TableCell>
              <TableCell>{entry.clientName}</TableCell>
              <TableCell>{entry.taskName}</TableCell>
              <TableCell className="max-w-[240px] truncate" title={entry.description || ""}>
                {entry.description || "-"}
              </TableCell>
              <TableCell className="text-right">{formatHours(entry.hours)}</TableCell>
              <TableCell>
                <Badge variant={entry.billable ? "default" : "secondary"}>
                  {entry.billable ? "Billable" : entry.nonBillableActivity || entry.nonBillableCategory || "Non-billable"}
                </Badge>
              </TableCell>
              <TableCell className="text-right">{formatMoney(entry.nonBillableAmount)}</TableCell>
              <TableCell className="text-right">{formatMoney(entry.billableAmount)}</TableCell>
              <TableCell className="text-right">{formatMoney(entry.costAmount)}</TableCell>
              <TableCell className={`text-right ${entry.profitLoss < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                {formatMoney(entry.profitLoss)}
              </TableCell>
              <TableCell>
                <Badge variant="outline">{entry.status}</Badge>
              </TableCell>
              <TableCell>{entry.approverName || "-"}</TableCell>
              <TableCell>{entry.approvedAt ? formatDateTime(entry.approvedAt) : "-"}</TableCell>
              <TableCell>{formatDateTime(entry.createdAt)}</TableCell>
              <TableCell className="sticky right-0 border-l bg-background text-right">
                <Button size="sm" variant="outline" onClick={() => onView(entry)}>
                  View
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  </div>
);

const RollupTables = ({ report }: { report: AnyReport }) => {
  const firstSection =
    report.group === "job"
      ? { title: "By job", rows: report.rollups.jobs }
      : report.group === "client"
        ? { title: "By client", rows: report.rollups.clients }
        : { title: "By staff", rows: report.rollups.staff };

  return (
  <div className="grid gap-4 lg:grid-cols-3">
    {[
      firstSection,
      { title: "By department", rows: report.rollups.departments },
      { title: "By partner", rows: report.rollups.partners },
    ].map((section) => (
      <div key={section.title} className="rounded-md border">
        <div className="border-b p-3 text-sm font-medium">{section.title}</div>
        <div className="max-h-64 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Non-billable</TableHead>
                <TableHead className="text-right">Billable</TableHead>
                <TableHead className="text-right">Total hrs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {section.rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No data
                  </TableCell>
                </TableRow>
              )}
              {section.rows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell>
                    <div className="font-medium">{row.name}</div>
                    {row.meta && <div className="text-xs text-muted-foreground">{row.meta}</div>}
                  </TableCell>
                  <TableCell className="text-right">{formatHours(row.nonBillableHours)}</TableCell>
                  <TableCell className="text-right">{formatHours(row.billableHours)}</TableCell>
                  <TableCell className="text-right font-medium">{formatHours(row.totalHours)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    ))}
  </div>
  );
};

export default function TimesheetReports() {
  const { toast } = useToast();
  const [options, setOptions] = useState<ReportOptions | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("staff-summary");
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [jobOverview, setJobOverview] = useState<JobOverviewResponse | null>(null);
  const [clientOverview, setClientOverview] = useState<ClientOverviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [drilldownOpen, setDrilldownOpen] = useState(false);
  const [drilldownType, setDrilldownType] = useState<"job" | "client" | null>(null);
  const [jobDrilldown, setJobDrilldown] = useState<JobDrilldownResponse | null>(null);
  const [clientDrilldown, setClientDrilldown] = useState<ClientDrilldownResponse | null>(null);
  const [drilldownLoading, setDrilldownLoading] = useState(false);
  const [selectedSummaryRow, setSelectedSummaryRow] = useState<SummaryRow | null>(null);
  const [summaryRowEntries, setSummaryRowEntries] = useState<DetailedEntry[]>([]);
  const [summaryRowLoading, setSummaryRowLoading] = useState(false);
  const [summaryRowDialogOpen, setSummaryRowDialogOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<DetailedEntry | null>(null);
  const [entryDialogOpen, setEntryDialogOpen] = useState(false);

  const [period, setPeriod] = useState<TimesheetReportPeriod>("yearly");
  const [startDate, setStartDate] = useState(() => getPeriodRange("yearly").startDate);
  const [endDate, setEndDate] = useState(() => getPeriodRange("yearly").endDate);
  const [scope, setScope] = useState<TimesheetReportScope>("self");
  const [status, setStatus] = useState("all");
  const [employeeProfileId, setEmployeeProfileId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [jobId, setJobId] = useState("");
  const [clientId, setClientId] = useState("");

  const activeConfig = useMemo(
    () => TAB_CONFIG.find((tab) => tab.value === activeTab) || TAB_CONFIG[0],
    [activeTab]
  );

  useEffect(() => {
    const loadOptions = async () => {
      try {
        setOptionsLoading(true);
        const data = await timesheetReportsAPI.getOptions();
        setOptions(data);
        setScope(data.defaultScope);
      } catch (error: any) {
        toast({
          title: "Unable to load report options",
          description: error?.message || "Please try again.",
          variant: "destructive",
        });
      } finally {
        setOptionsLoading(false);
      }
    };
    void loadOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePeriodChange = (next: TimesheetReportPeriod) => {
    setPeriod(next);
    if (next === "custom") return;
    const range = getPeriodRange(next);
    setStartDate(range.startDate);
    setEndDate(range.endDate);
  };

  const filters = useMemo(
    () => ({
      period,
      dateFrom: startDate || undefined,
      dateTo: endDate || undefined,
      scope,
      status,
      employeeProfileId: employeeProfileId ? Number(employeeProfileId) : undefined,
      departmentId: departmentId ? Number(departmentId) : undefined,
      jobId: jobId ? Number(jobId) : undefined,
      clientId: clientId ? Number(clientId) : undefined,
    }),
    [
      period,
      startDate,
      endDate,
      scope,
      status,
      employeeProfileId,
      departmentId,
      jobId,
      clientId,
    ]
  );

  useEffect(() => {
    const loadReport = async () => {
      if (!options) return;
      try {
        setLoading(true);
        if (activeConfig.group === "job" && activeConfig.mode === "summary") {
          const data = await timesheetReportsAPI.getJobOverview(filters);
          setJobOverview(data);
          setClientOverview(null);
          setReport(null);
        } else if (activeConfig.group === "client" && activeConfig.mode === "summary") {
          const data = await timesheetReportsAPI.getClientOverview(filters);
          setClientOverview(data);
          setJobOverview(null);
          setReport(null);
        } else {
          const data = await timesheetReportsAPI.getReport(
            activeConfig.group,
            activeConfig.mode,
            filters
          );
          setReport(data);
          setJobOverview(null);
          setClientOverview(null);
        }
      } catch (error: any) {
        toast({
          title: "Unable to load report",
          description: error?.message || "Please try again.",
          variant: "destructive",
        });
        setReport(null);
        setJobOverview(null);
        setClientOverview(null);
      } finally {
        setLoading(false);
      }
    };
    void loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConfig, filters, options]);

  useEffect(() => {
    setDrilldownOpen(false);
    setDrilldownType(null);
    setJobDrilldown(null);
    setClientDrilldown(null);
  }, [filters]);

  const currentReport: AnyReport | null =
    activeConfig.group === "job" && activeConfig.mode === "summary"
      ? jobOverview
      : activeConfig.group === "client" && activeConfig.mode === "summary"
        ? clientOverview
        : report;

  const openJobDrilldown = async (row: JobOverviewRow) => {
    try {
      setDrilldownType("job");
      setJobDrilldown(null);
      setClientDrilldown(null);
      setDrilldownOpen(true);
      setDrilldownLoading(true);
      const data = await timesheetReportsAPI.getJobDrilldown(row.jobKey, {
        ...filters,
        jobId: undefined,
        clientId: undefined,
      });
      setJobDrilldown(data);
    } catch (error: any) {
      toast({
        title: "Unable to load job report",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
      setDrilldownOpen(false);
    } finally {
      setDrilldownLoading(false);
    }
  };

  const openClientDrilldown = async (row: ClientOverviewRow) => {
    try {
      setDrilldownType("client");
      setJobDrilldown(null);
      setClientDrilldown(null);
      setDrilldownOpen(true);
      setDrilldownLoading(true);
      const data = await timesheetReportsAPI.getClientDrilldown(row.clientKey, {
        ...filters,
        jobId: undefined,
        clientId: undefined,
      });
      setClientDrilldown(data);
    } catch (error: any) {
      toast({
        title: "Unable to load client report",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
      setDrilldownOpen(false);
    } finally {
      setDrilldownLoading(false);
    }
  };

  const openSummaryRow = async (row: SummaryRow) => {
    try {
      setSelectedSummaryRow(row);
      setSummaryRowEntries([]);
      setSummaryRowDialogOpen(true);
      setSummaryRowLoading(true);
      const data = await timesheetReportsAPI.getReport("staff", "detailed", {
        ...filters,
        jobId: undefined,
        clientId: undefined,
        employeeProfileId: row.employeeProfileId,
        jobKey: row.jobKey,
        taskId: row.taskId ?? undefined,
      });
      setSummaryRowEntries(
        (data.entries || []).filter((entry) => entry.taskName === row.taskName)
      );
    } catch (error: any) {
      toast({
        title: "Unable to load row detail",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
      setSummaryRowDialogOpen(false);
    } finally {
      setSummaryRowLoading(false);
    }
  };

  const openEntry = (entry: DetailedEntry) => {
    setSelectedEntry(entry);
    setEntryDialogOpen(true);
  };

  const exportSummaryRow = () => {
    if (!selectedSummaryRow) return;
    downloadCsv(
      "timesheet-staff-summary-row.csv",
      [
        "Staff",
        "Job No",
        "Job Name",
        "Client",
        "Task",
        "Non-billable hours",
        "Non-billable amount",
        "Billable hours",
        "Billable amount",
        "Total hours",
      ],
      [
        [
          selectedSummaryRow.employeeName,
          selectedSummaryRow.jobNo,
          selectedSummaryRow.jobName,
          selectedSummaryRow.clientName,
          selectedSummaryRow.taskName,
          selectedSummaryRow.nonBillableHours,
          selectedSummaryRow.nonBillableAmount,
          selectedSummaryRow.billableHours,
          selectedSummaryRow.billableAmount,
          selectedSummaryRow.totalHours,
        ],
      ]
    );
  };

  const exportSummaryRowEntries = () => {
    downloadCsv(
      "timesheet-staff-summary-row-entries.csv",
      DETAILED_CSV_HEADERS,
      summaryRowEntries.map(toDetailedCsvRow)
    );
  };

  const exportEntry = () => {
    if (!selectedEntry) return;
    downloadCsv(
      `timesheet-entry-${selectedEntry.id}.csv`,
      DETAILED_CSV_HEADERS,
      [toDetailedCsvRow(selectedEntry)]
    );
  };

  const exportDrilldownStaff = (staff: DrilldownStaffRow[], filename: string) => {
    downloadCsv(
      filename,
      [
        "Staff",
        "Department",
        "Entries",
        "Billable hours",
        "Billable amount",
        "Non-billable hours",
        "Non-billable amount",
        "Cost",
        "Profit/Loss",
      ],
      staff.map((row) => [
        row.employeeName,
        row.departmentName || "",
        row.entriesCount,
        row.billableHours,
        row.billableAmount,
        row.nonBillableHours,
        row.nonBillableAmount,
        row.cost,
        row.profitLoss,
      ])
    );
  };

  const exportJobOverview = () => {
    const rows = jobOverview?.rows || [];
    downloadCsv(
      "timesheet-job-summary.csv",
      [
        "Job No",
        "Job Name",
        "Client",
        "Fee",
        "Staff",
        "Non-billable hours",
        "Non-billable amount",
        "Billable hours",
        "Billable amount",
        "Total hours",
      ],
      rows.map((row) => [
        row.jobNo,
        row.jobName,
        row.clientName,
        row.fee,
        row.staffCount,
        row.nonBillableHours,
        row.nonBillableAmount,
        row.billableHours,
        row.billableAmount,
        row.totalHours,
      ])
    );
  };

  const exportClientOverview = () => {
    const rows = clientOverview?.rows || [];
    downloadCsv(
      "timesheet-client-summary.csv",
      [
        "Client ID",
        "Client",
        "Jobs",
        "Staff",
        "Non-billable hours",
        "Non-billable amount",
        "Billable hours",
        "Billable amount",
        "Total hours",
      ],
      rows.map((row) => [
        row.clientId ?? "",
        row.clientName,
        row.jobCount,
        row.staffCount,
        row.nonBillableHours,
        row.nonBillableAmount,
        row.billableHours,
        row.billableAmount,
        row.totalHours,
      ])
    );
  };

  const exportClientDrilldownJobs = () => {
    const jobs = clientDrilldown?.jobs || [];
    downloadCsv(
      "timesheet-client-jobs.csv",
      [
        "Job No",
        "Job Name",
        "Fee",
        "Staff",
        "Entries",
        "Billable hours",
        "Billable amount",
        "Non-billable hours",
        "Non-billable amount",
        "Total hours",
      ],
      jobs.map((job) => [
        job.jobNo,
        job.jobName,
        job.fee,
        job.staffCount,
        job.entriesCount,
        job.billableHours,
        job.billableAmount,
        job.nonBillableHours,
        job.nonBillableAmount,
        job.totalHours,
      ])
    );
  };

  const exportSummary = () => {
    const rows = report?.rows || [];
    downloadCsv(
      `timesheet-${activeConfig.group}-summary.csv`,
      [
        "Staff",
        "Job No",
        "Job Name",
        "Client",
        "Task",
        "Non-billable hours",
        "Non-billable amount",
        "Billable hours",
        "Billable amount",
        "Total hours",
      ],
      rows.map((row) => [
        row.employeeName,
        row.jobNo,
        row.jobName,
        row.clientName,
        row.taskName,
        row.nonBillableHours,
        row.nonBillableAmount,
        row.billableHours,
        row.billableAmount,
        row.totalHours,
      ])
    );
  };

  const exportDetailed = () => {
    const entries = report?.entries || [];
    downloadCsv(
      `timesheet-${activeConfig.group}-detailed.csv`,
      DETAILED_CSV_HEADERS,
      entries.map(toDetailedCsvRow)
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Timesheet Reports</h1>
          <p className="text-muted-foreground">
            Staff, job and client time reports with individual, department and firm-wide rollups.
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Filters</CardTitle>
            <CardDescription>
              Choose the period, scope and optional staff, department, job or client.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <Label>Period</Label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={period}
                onChange={(event) => handlePeriodChange(event.target.value as TimesheetReportPeriod)}
              >
                {PERIOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="timesheetStartDate">Start date</Label>
              <Input
                id="timesheetStartDate"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="timesheetEndDate">End date</Label>
              <Input
                id="timesheetEndDate"
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </div>
            <div>
              <Label>Scope</Label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={scope}
                onChange={(event) => setScope(event.target.value as TimesheetReportScope)}
              >
                {(options?.allowedScopes || ["self"]).map((value) => (
                  <option key={value} value={value}>
                    {SCOPE_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Status</Label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="all">All active</option>
                <option value="pending">Pending</option>
                <option value="submitted">Submitted</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div>
              <Label>Staff</Label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={employeeProfileId}
                onChange={(event) => setEmployeeProfileId(event.target.value)}
              >
                <option value="">All staff</option>
                {(options?.staff || []).map((staff) => (
                  <option key={staff.id} value={staff.id}>
                    {staff.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Department</Label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={departmentId}
                onChange={(event) => setDepartmentId(event.target.value)}
              >
                <option value="">All departments</option>
                {(options?.departments || []).map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Job</Label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={jobId}
                onChange={(event) => setJobId(event.target.value)}
              >
                <option value="">All jobs</option>
                {(options?.jobs || []).map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.jobCode || job.jobName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Client</Label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
              >
                <option value="">All clients</option>
                {(options?.clients || []).map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.clientName}
                  </option>
                ))}
              </select>
            </div>
          </CardContent>
        </Card>

        {optionsLoading ? (
          <PageLoader message="Loading report options..." minHeightClassName="min-h-[200px]" />
        ) : loading ? (
          <PageLoader message="Loading report..." minHeightClassName="min-h-[300px]" />
        ) : currentReport ? (
          <>
            <TotalsCards report={currentReport} />

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="flex h-auto flex-wrap gap-1">
                {TAB_CONFIG.map((tab) => (
                  <TabsTrigger key={tab.value} value={tab.value}>
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value={activeTab}>
                <Card>
                  <CardHeader>
                    <CardTitle>{activeConfig.label}</CardTitle>
                    <CardDescription>
                      {currentReport.filters.label} Â·{" "}
                      {SCOPE_LABELS[currentReport.filters.scope]} Â·{" "}
                      {currentReport.filters.statuses.join(", ")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {activeConfig.group === "job" && activeConfig.mode === "summary" ? (
                      <JobOverviewTable
                        rows={jobOverview?.rows || []}
                        onOpen={openJobDrilldown}
                        onExport={exportJobOverview}
                      />
                    ) : activeConfig.group === "client" && activeConfig.mode === "summary" ? (
                      <ClientOverviewTable
                        rows={clientOverview?.rows || []}
                        onOpen={openClientDrilldown}
                        onExport={exportClientOverview}
                      />
                    ) : activeConfig.mode === "summary" ? (
                      <SummaryTable rows={report?.rows || []} onExport={exportSummary} onView={openSummaryRow} />
                    ) : (
                      <DetailedTable entries={report?.entries || []} onExport={exportDetailed} onView={openEntry} />
                    )}
                    <RollupTables report={currentReport} />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        ) : (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No report data. Adjust the filters and try again.
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog
        open={drilldownOpen}
        onOpenChange={(open) => {
          setDrilldownOpen(open);
          if (!open) {
            setDrilldownType(null);
            setJobDrilldown(null);
            setClientDrilldown(null);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-6xl overflow-x-hidden overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {drilldownType === "job"
                ? jobDrilldown?.job?.jobNo || "Job report"
                : clientDrilldown?.client?.clientName || "Client report"}
            </DialogTitle>
            <DialogDescription>
              {drilldownType === "job"
                ? `${jobDrilldown?.job?.jobName || ""} Â· ${jobDrilldown?.job?.clientName || ""}`
                : `${clientDrilldown?.client?.jobCount || 0} job(s) Â· ${clientDrilldown?.client?.staffCount || 0} staff`}
            </DialogDescription>
          </DialogHeader>

          {drilldownLoading ? (
            <PageLoader message="Loading report..." minHeightClassName="min-h-[200px]" />
          ) : drilldownType === "job" && jobDrilldown ? (
            <div className="min-w-0 space-y-4">
              <div className="grid min-w-0 gap-3 md:grid-cols-6">
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Job fee</p>
                  <p className="text-lg font-semibold">{formatMoney(jobDrilldown.job?.fee)}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Non-billable time</p>
                  <p className="text-lg font-semibold text-amber-600">{formatHours(jobDrilldown.totals.nonBillableHours)}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Non-billable amount</p>
                  <p className="text-lg font-semibold text-amber-600">{formatMoney(jobDrilldown.totals.nonBillableAmount)}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Billable time</p>
                  <p className="text-lg font-semibold text-emerald-600">{formatHours(jobDrilldown.totals.billableHours)}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Billable amount</p>
                  <p className="text-lg font-semibold text-emerald-600">{formatMoney(jobDrilldown.totals.billableAmount)}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Total time</p>
                  <p className="text-lg font-semibold">{formatHours(jobDrilldown.totals.totalHours)}</p>
                </div>
              </div>
              <DrilldownStaffTable staff={jobDrilldown.staff} />
            </div>
          ) : drilldownType === "client" && clientDrilldown ? (
            <div className="min-w-0 space-y-4">
              <div className="grid min-w-0 gap-3 md:grid-cols-5">
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Non-billable time</p>
                  <p className="text-lg font-semibold text-amber-600">{formatHours(clientDrilldown.totals.nonBillableHours)}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Non-billable amount</p>
                  <p className="text-lg font-semibold text-amber-600">{formatMoney(clientDrilldown.totals.nonBillableAmount)}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Billable time</p>
                  <p className="text-lg font-semibold text-emerald-600">{formatHours(clientDrilldown.totals.billableHours)}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Billable amount</p>
                  <p className="text-lg font-semibold text-emerald-600">{formatMoney(clientDrilldown.totals.billableAmount)}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Total time</p>
                  <p className="text-lg font-semibold">{formatHours(clientDrilldown.totals.totalHours)}</p>
                </div>
              </div>
              <ClientJobsTable jobs={clientDrilldown.jobs} />
              <DrilldownStaffTable staff={clientDrilldown.staff} />
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No time entries for this selection.
            </p>
          )}

          <DialogFooter className="flex flex-wrap gap-2">
            {drilldownType === "job" && jobDrilldown && (
              <Button
                variant="outline"
                onClick={() =>
                  exportDrilldownStaff(jobDrilldown.staff, "timesheet-job-staff.csv")
                }
              >
                Export staff
              </Button>
            )}
            {drilldownType === "client" && clientDrilldown && (
              <>
                <Button variant="outline" onClick={exportClientDrilldownJobs}>
                  Export jobs
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    exportDrilldownStaff(
                      clientDrilldown.staff,
                      "timesheet-client-staff.csv"
                    )
                  }
                >
                  Export staff
                </Button>
              </>
            )}
            <Button variant="outline" onClick={() => setDrilldownOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={summaryRowDialogOpen} onOpenChange={setSummaryRowDialogOpen}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-5xl overflow-x-hidden overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedSummaryRow?.employeeName || "Staff summary"}
            </DialogTitle>
            <DialogDescription>
              {selectedSummaryRow
                ? `${selectedSummaryRow.jobNo} · ${selectedSummaryRow.jobName} · ${selectedSummaryRow.taskName}`
                : ""}
            </DialogDescription>
          </DialogHeader>

          {selectedSummaryRow && (
            <div className="min-w-0 space-y-4">
              <div className="grid gap-3 md:grid-cols-5">
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Non-billable time</p>
                  <p className="text-lg font-semibold text-amber-600">{formatHours(selectedSummaryRow.nonBillableHours)}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Non-billable amount</p>
                  <p className="text-lg font-semibold text-amber-600">{formatMoney(selectedSummaryRow.nonBillableAmount)}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Billable time</p>
                  <p className="text-lg font-semibold text-emerald-600">{formatHours(selectedSummaryRow.billableHours)}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Billable amount</p>
                  <p className="text-lg font-semibold text-emerald-600">{formatMoney(selectedSummaryRow.billableAmount)}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Total time</p>
                  <p className="text-lg font-semibold">{formatHours(selectedSummaryRow.totalHours)}</p>
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" size="sm" onClick={exportSummaryRow}>
                  Export summary
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportSummaryRowEntries}
                  disabled={summaryRowEntries.length === 0}
                >
                  Export entries
                </Button>
              </div>

              {summaryRowLoading ? (
                <PageLoader message="Loading entries..." minHeightClassName="min-h-[160px]" />
              ) : (
                <div className="max-h-[340px] overflow-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Job No</TableHead>
                        <TableHead>Task</TableHead>
                        <TableHead>Notes</TableHead>
                        <TableHead className="text-right">Hours</TableHead>
                        <TableHead className="text-right">Billable amount</TableHead>
                        <TableHead className="text-right">Non-billable amount</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summaryRowEntries.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-muted-foreground">
                            No entries for this summary row.
                          </TableCell>
                        </TableRow>
                      )}
                      {summaryRowEntries.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell>{formatDate(entry.dateWorked)}</TableCell>
                          <TableCell>{entry.jobNo}</TableCell>
                          <TableCell>{entry.taskName}</TableCell>
                          <TableCell className="max-w-[220px] truncate" title={entry.description || ""}>
                            {entry.description || "-"}
                          </TableCell>
                          <TableCell className="text-right">{formatHours(entry.hours)}</TableCell>
                          <TableCell className="text-right">{formatMoney(entry.billableAmount)}</TableCell>
                          <TableCell className="text-right">{formatMoney(entry.nonBillableAmount)}</TableCell>
                          <TableCell>{entry.status}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSummaryRowDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={entryDialogOpen} onOpenChange={setEntryDialogOpen}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-3xl overflow-x-hidden overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Time entry detail</DialogTitle>
            <DialogDescription>
              {selectedEntry
                ? `${selectedEntry.employeeName} · ${selectedEntry.jobNo} · ${formatDate(selectedEntry.dateWorked)}`
                : ""}
            </DialogDescription>
          </DialogHeader>

          {selectedEntry && (
            <div className="space-y-4 text-sm">
              <div className="grid gap-3 md:grid-cols-3">
                {[
                  ["Date", formatDate(selectedEntry.dateWorked)],
                  ["Start", selectedEntry.startedAt ? formatDateTime(selectedEntry.startedAt) : "-"],
                  ["End", selectedEntry.endedAt ? formatDateTime(selectedEntry.endedAt) : "-"],
                  ["Hours", formatHours(selectedEntry.hours)],
                  ["Billable", selectedEntry.billable ? "Yes" : "No"],
                  ["Status", selectedEntry.status],
                  ["Approver", selectedEntry.approverName || "-"],
                  ["Approved at", selectedEntry.approvedAt ? formatDateTime(selectedEntry.approvedAt) : "-"],
                  ["Entered", formatDateTime(selectedEntry.createdAt)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="font-medium">{value}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Notes</p>
                <p>{selectedEntry.description || "-"}</p>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                {[
                  ["Job", `${selectedEntry.jobNo} · ${selectedEntry.jobName}`],
                  ["Client", selectedEntry.clientName],
                  ["Task", selectedEntry.taskName],
                  ["Non-billable category", selectedEntry.nonBillableActivity || selectedEntry.nonBillableCategory || "-"],
                  ["Billable amount", formatMoney(selectedEntry.billableAmount)],
                  ["Non-billable amount", formatMoney(selectedEntry.nonBillableAmount)],
                  ["Cost", formatMoney(selectedEntry.costAmount)],
                  ["Profit/Loss", formatMoney(selectedEntry.profitLoss)],
                  ["Rejection reason", selectedEntry.rejectionReason || "-"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="font-medium">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={exportEntry}>
              Export CSV
            </Button>
            <Button variant="outline" onClick={() => setEntryDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

