import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import PerformanceDashboard from "@/components/PerformanceDashboard";
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
import performanceReportAPI, {
  type DepartmentPerformanceRow,
  type IndividualPerformanceRow,
  type PerformancePeriod,
  type PerformanceReportResponse,
  type PerformanceStatus,
} from "@/lib/api/performanceReport";
import { getPeriodRange } from "@/lib/reportPeriods";

const PERIOD_OPTIONS: Array<{ value: PerformancePeriod; label: string }> = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

const statusLabel = (status: PerformanceStatus) =>
  status === "on_track" ? "On track" : status === "at_risk" ? "At risk" : "Off track";

const statusClass = (status: PerformanceStatus) =>
  status === "on_track"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : status === "at_risk"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : "border-rose-200 bg-rose-50 text-rose-700";

const toneText = (status: PerformanceStatus) =>
  status === "on_track" ? "text-emerald-600" : status === "at_risk" ? "text-amber-600" : "text-rose-600";

const formatMoney = (value?: number) =>
  `KES ${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const formatMoneyCompact = (value?: number) => {
  const amount = Number(value || 0);
  if (Math.abs(amount) >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M`;
  if (Math.abs(amount) >= 1_000) return `${(amount / 1_000).toFixed(0)}K`;
  return amount.toFixed(0);
};
const formatHours = (value?: number) => `${Number(value || 0).toFixed(1)}h`;
const formatPercent = (value?: number) => `${Number(value || 0).toFixed(1)}%`;

const downloadCsv = (
  filename: string,
  headers: string[],
  rows: Array<Array<string | number | null>>
) => {
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

const INDIVIDUAL_HEADERS = [
  "Name",
  "Department",
  "Staff Level",
  "Staff Rate",
  "Expected Billable Target",
  "Expected Billable Threshold",
  "Expected Total Time",
  "Expected Billable Time",
  "Actual Billable Time",
  "Non Billable Time",
  "Total",
  "Achieved Billable Amount",
  "Billable Achievement",
  "Utilization",
  "Collections",
  "Status",
];

const toIndividualCsvRow = (row: IndividualPerformanceRow) => [
  row.name,
  row.departmentName || "",
  row.staffLevel,
  row.staffRate,
  row.expectedBillableTarget,
  row.expectedBillableThreshold,
  row.expectedTotalTime,
  row.expectedBillableTime,
  row.actualBillableTime,
  row.nonBillableTime,
  row.total,
  row.achievedBillableAmount,
  row.billableAchievement,
  row.utilization,
  row.collections,
  statusLabel(row.status),
];

const DEPARTMENT_HEADERS = [
  "Department",
  "Expected Billable Amount/Target",
  "Actual Billable Amount",
  "Collections",
  "Utilization Rate",
  "Collections Efficiency",
  "Collections Vs Target",
  "Staff Meeting Targets",
  "Staff Below Targets",
  "Staff Above Targets",
  "Total",
  "Staff % Below Targets",
  "Staff % Above Targets",
  "Partner",
];

const toDepartmentCsvRow = (row: DepartmentPerformanceRow) => [
  row.name,
  row.expectedBillableTarget,
  row.actualBillableAmount,
  row.collections,
  row.utilizationRate,
  row.collectionsEfficiency,
  row.collectionsVsTarget,
  row.staffMeetingTargets,
  row.staffBelowTargets,
  row.staffAboveTargets,
  row.totalStaff,
  row.staffPctBelowTargets,
  row.staffPctAboveTargets,
  row.partnerName || "",
];

const IndividualTable = ({
  rows,
  onView,
}: {
  rows: IndividualPerformanceRow[];
  onView: (row: IndividualPerformanceRow) => void;
}) => (
  <div className="max-h-[560px] overflow-auto rounded-md border">
    <Table className="text-xs">
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Department</TableHead>
          <TableHead>Staff level</TableHead>
          <TableHead className="text-right">Expected target</TableHead>
          <TableHead className="text-right">Actual billable</TableHead>
          <TableHead className="text-right">Non-billable</TableHead>
          <TableHead className="text-right">Achievement</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="sticky right-0 border-l bg-background text-right">Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 && (
          <TableRow>
            <TableCell colSpan={9} className="text-center text-muted-foreground">
              No individual performance data for this period.
            </TableCell>
          </TableRow>
        )}
        {rows.map((row) => (
          <TableRow key={row.profileId}>
            <TableCell className="font-medium">{row.name}</TableCell>
            <TableCell>{row.departmentName || "—"}</TableCell>
            <TableCell>{row.staffLevel}</TableCell>
            <TableCell className="text-right">{formatMoneyCompact(row.expectedBillableTarget)}</TableCell>
            <TableCell className="text-right">{formatHours(row.actualBillableTime)}</TableCell>
            <TableCell className="text-right">{formatHours(row.nonBillableTime)}</TableCell>
            <TableCell className="text-right">{formatPercent(row.billableAchievement)}</TableCell>
            <TableCell>
              <Badge className={statusClass(row.status)}>{statusLabel(row.status)}</Badge>
            </TableCell>
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
);

const DepartmentTable = ({
  rows,
  onView,
}: {
  rows: DepartmentPerformanceRow[];
  onView: (row: DepartmentPerformanceRow) => void;
}) => (
  <div className="max-h-[560px] overflow-auto rounded-md border">
    <Table className="text-xs">
      <TableHeader>
        <TableRow>
          <TableHead>Department</TableHead>
          <TableHead className="text-right">Expected target</TableHead>
          <TableHead className="text-right">Actual billable</TableHead>
          <TableHead className="text-right">Collections</TableHead>
          <TableHead className="text-right">Utilization</TableHead>
          <TableHead className="text-right">Below target</TableHead>
          <TableHead className="text-right">Total staff</TableHead>
          <TableHead className="sticky right-0 border-l bg-background text-right">Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 && (
          <TableRow>
            <TableCell colSpan={8} className="text-center text-muted-foreground">
              No department performance data for this period.
            </TableCell>
          </TableRow>
        )}
        {rows.map((row) => (
          <TableRow key={row.departmentId}>
            <TableCell className="font-medium">{row.name}</TableCell>
            <TableCell className="text-right">{formatMoneyCompact(row.expectedBillableTarget)}</TableCell>
            <TableCell className="text-right">{formatMoneyCompact(row.actualBillableAmount)}</TableCell>
            <TableCell className="text-right">{formatMoneyCompact(row.collections)}</TableCell>
            <TableCell className="text-right">{formatPercent(row.utilizationRate)}</TableCell>
            <TableCell className="text-right">{row.staffBelowTargets}</TableCell>
            <TableCell className="text-right">{row.totalStaff}</TableCell>
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
);

const DetailField = ({ label, value }: { label: string; value: string }) => (
  <div>
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="text-sm font-medium">{value}</p>
  </div>
);

export default function Performance() {
  const { toast } = useToast();
  const [period, setPeriod] = useState<PerformancePeriod>("monthly");
  const [startDate, setStartDate] = useState(() => getPeriodRange("monthly").startDate);
  const [endDate, setEndDate] = useState(() => getPeriodRange("monthly").endDate);
  const [data, setData] = useState<PerformanceReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("individuals");
  const [viewOpen, setViewOpen] = useState(false);
  const [selectedIndividual, setSelectedIndividual] = useState<IndividualPerformanceRow | null>(null);
  const [selectedDepartment, setSelectedDepartment] = useState<DepartmentPerformanceRow | null>(null);

  const handlePeriodChange = (next: PerformancePeriod) => {
    setPeriod(next);
    const range = getPeriodRange(next);
    const today = new Date().toISOString().slice(0, 10);
    if (next === "yearly") {
      setStartDate(`${range.startDate.slice(0, 4)}-01-01`);
      setEndDate(today < range.endDate ? today : range.endDate);
      return;
    }
    if (next === "quarterly") {
      setStartDate(range.startDate);
      setEndDate(today < range.endDate ? today : range.endDate);
      return;
    }
    setStartDate(range.startDate);
    setEndDate(range.endDate);
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        const response = await performanceReportAPI.get({
          period,
          dateFrom: startDate || undefined,
          dateTo: endDate || undefined,
        });
        if (!cancelled) setData(response);
      } catch (error: any) {
        if (!cancelled) {
          setData(null);
          toast({
            title: "Unable to load performance",
            description: error?.message || "Please try again.",
            variant: "destructive",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [period, startDate, endDate, toast]);

  const departmentIndividuals = useMemo(
    () =>
      selectedDepartment && data
        ? data.individuals.filter((row) => row.departmentId === selectedDepartment.departmentId)
        : [],
    [data, selectedDepartment]
  );

  const openIndividual = (row: IndividualPerformanceRow) => {
    setSelectedIndividual(row);
    setSelectedDepartment(null);
    setViewOpen(true);
  };

  const openDepartment = (row: DepartmentPerformanceRow) => {
    setSelectedIndividual(null);
    setSelectedDepartment(row);
    setViewOpen(true);
  };

  const exportIndividuals = () => {
    if (!data) return;
    downloadCsv(
      `performance-individuals-${data.label}.csv`,
      INDIVIDUAL_HEADERS,
      data.individuals.map(toIndividualCsvRow)
    );
  };

  const exportDepartments = () => {
    if (!data) return;
    downloadCsv(
      `performance-departments-${data.label}.csv`,
      DEPARTMENT_HEADERS,
      data.departments.map(toDepartmentCsvRow)
    );
  };

  const exportSelected = () => {
    if (selectedIndividual) {
      downloadCsv(
        `performance-${selectedIndividual.name.replace(/\s+/g, "-").toLowerCase()}-${data?.label || "period"}.csv`,
        INDIVIDUAL_HEADERS,
        [toIndividualCsvRow(selectedIndividual)]
      );
      return;
    }
    if (selectedDepartment) {
      const slug = selectedDepartment.name.replace(/\s+/g, "-").toLowerCase();
      const label = data?.label || "period";
      downloadCsv(
        `performance-${slug}-summary-${label}.csv`,
        DEPARTMENT_HEADERS,
        [toDepartmentCsvRow(selectedDepartment)]
      );
      downloadCsv(
        `performance-${slug}-staff-${label}.csv`,
        INDIVIDUAL_HEADERS,
        departmentIndividuals.map(toIndividualCsvRow)
      );
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Performance</h1>
          <p className="text-muted-foreground">
            Individual and departmental performance from approved timesheet entries, including
            partners.
          </p>
        </div>

        <Card>
          <CardContent className="grid gap-3 p-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="performancePeriod">Period</Label>
              <select
                id="performancePeriod"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={period}
                onChange={(event) => handlePeriodChange(event.target.value as PerformancePeriod)}
              >
                {PERIOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="performanceStartDate">Start date</Label>
              <Input
                id="performanceStartDate"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="performanceEndDate">End date</Label>
              <Input
                id="performanceEndDate"
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground sm:col-span-3">
              The selected range drives the dashboard charts, tables and exports.
            </p>
          </CardContent>
        </Card>

        {loading ? (
          <PageLoader message="Loading performance..." minHeightClassName="min-h-[320px]" />
        ) : !data ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Performance data is unavailable for this period.
            </CardContent>
          </Card>
        ) : (
          <>
            <PerformanceDashboard data={data} period={period} />

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="individuals">Individuals</TabsTrigger>
                {data.canViewDepartments && (
                  <TabsTrigger value="departments">Departments</TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="individuals">
                <Card>
                  <CardHeader>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <CardTitle>Individual performance</CardTitle>
                        <CardDescription>
                          Approved timesheet entries for every person in your scope, including partners.
                        </CardDescription>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={exportIndividuals}
                        disabled={data.individuals.length === 0}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Export individuals
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <IndividualTable rows={data.individuals} onView={openIndividual} />
                  </CardContent>
                </Card>
              </TabsContent>

              {data.canViewDepartments && (
                <TabsContent value="departments">
                  <Card>
                    <CardHeader>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <CardTitle>Department performance</CardTitle>
                          <CardDescription>
                            Aggregated from all employees, managers and partners in each department.
                          </CardDescription>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={exportDepartments}
                          disabled={data.departments.length === 0}
                        >
                          <Download className="mr-2 h-4 w-4" />
                          Export departments
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <DepartmentTable rows={data.departments} onView={openDepartment} />
                    </CardContent>
                  </Card>
                </TabsContent>
              )}
            </Tabs>
          </>
        )}

        <Dialog
          open={viewOpen}
          onOpenChange={(open) => {
            setViewOpen(open);
            if (!open) {
              setSelectedIndividual(null);
              setSelectedDepartment(null);
            }
          }}
        >
          <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-5xl overflow-x-hidden overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {selectedIndividual?.name || selectedDepartment?.name || "Performance detail"}
              </DialogTitle>
              <DialogDescription>
                {selectedIndividual
                  ? `${selectedIndividual.departmentName || "No department"} · ${selectedIndividual.staffLevel}`
                  : selectedDepartment
                    ? `${selectedDepartment.partnerName || "No partner"} · ${selectedDepartment.totalStaff} staff`
                    : ""}
              </DialogDescription>
            </DialogHeader>

            {selectedIndividual && (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-4">
                  <DetailField label="Staff rate" value={formatMoney(selectedIndividual.staffRate)} />
                  <DetailField label="Expected billable target" value={formatMoney(selectedIndividual.expectedBillableTarget)} />
                  <DetailField label="Expected billable threshold" value={formatPercent(selectedIndividual.expectedBillableThreshold)} />
                  <DetailField label="Expected total time" value={formatHours(selectedIndividual.expectedTotalTime)} />
                  <DetailField label="Expected billable time" value={formatHours(selectedIndividual.expectedBillableTime)} />
                  <DetailField label="Actual billable time" value={formatHours(selectedIndividual.actualBillableTime)} />
                  <DetailField label="Non-billable time" value={formatHours(selectedIndividual.nonBillableTime)} />
                  <DetailField label="Total time" value={formatHours(selectedIndividual.total)} />
                  <DetailField label="Achieved billable amount" value={formatMoney(selectedIndividual.achievedBillableAmount)} />
                  <DetailField label="Billable achievement" value={formatPercent(selectedIndividual.billableAchievement)} />
                  <DetailField label="Utilization" value={formatPercent(selectedIndividual.utilization)} />
                  <DetailField label="Collections" value={formatMoney(selectedIndividual.collections)} />
                  <DetailField label="Status" value={statusLabel(selectedIndividual.status)} />
                  <DetailField label="Partner" value={selectedIndividual.partnerName || "—"} />
                </div>
              </div>
            )}

            {selectedDepartment && (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-4">
                  <DetailField label="Expected billable target" value={formatMoney(selectedDepartment.expectedBillableTarget)} />
                  <DetailField label="Actual billable amount" value={formatMoney(selectedDepartment.actualBillableAmount)} />
                  <DetailField label="Collections" value={formatMoney(selectedDepartment.collections)} />
                  <DetailField label="Utilization rate" value={formatPercent(selectedDepartment.utilizationRate)} />
                  <DetailField label="Collections efficiency" value={formatPercent(selectedDepartment.collectionsEfficiency)} />
                  <DetailField label="Collections vs target" value={formatPercent(selectedDepartment.collectionsVsTarget)} />
                  <DetailField label="Staff meeting targets" value={String(selectedDepartment.staffMeetingTargets)} />
                  <DetailField label="Staff below targets" value={String(selectedDepartment.staffBelowTargets)} />
                  <DetailField label="Staff above targets" value={String(selectedDepartment.staffAboveTargets)} />
                  <DetailField label="Total staff" value={String(selectedDepartment.totalStaff)} />
                  <DetailField label="Staff % below targets" value={formatPercent(selectedDepartment.staffPctBelowTargets)} />
                  <DetailField label="Staff % above targets" value={formatPercent(selectedDepartment.staffPctAboveTargets)} />
                </div>

                <div className="min-w-0 overflow-hidden rounded-md border">
                  <div className="border-b p-2 text-sm font-medium">Department staff</div>
                  <div className="max-h-[280px] overflow-auto">
                    <Table className="text-xs">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Staff level</TableHead>
                          <TableHead className="text-right">Expected target</TableHead>
                          <TableHead className="text-right">Actual billable</TableHead>
                          <TableHead className="text-right">Achievement</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {departmentIndividuals.map((row) => (
                          <TableRow key={row.profileId}>
                            <TableCell className="font-medium">{row.name}</TableCell>
                            <TableCell>{row.staffLevel}</TableCell>
                            <TableCell className="text-right">{formatMoneyCompact(row.expectedBillableTarget)}</TableCell>
                            <TableCell className="text-right">{formatHours(row.actualBillableTime)}</TableCell>
                            <TableCell className="text-right">{formatPercent(row.billableAchievement)}</TableCell>
                            <TableCell>
                              <Badge className={statusClass(row.status)}>{statusLabel(row.status)}</Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            )}

            <DialogFooter className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={exportSelected}>
                Export this report
              </Button>
              <Button variant="outline" onClick={() => setViewOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
