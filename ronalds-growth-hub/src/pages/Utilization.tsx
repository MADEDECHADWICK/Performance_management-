import { useEffect, useState } from "react";
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
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  utilizationAPI,
  type UtilizationCascadeDepartment,
  type UtilizationCascadeMember,
  type UtilizationCascadePartner,
  type UtilizationCascadeResult,
  type UtilizationPeriod,
  type UtilizationStatus,
} from "@/lib/api/utilization";
import { getPeriodRange } from "@/lib/reportPeriods";

const PERIOD_OPTIONS: Array<{ value: UtilizationPeriod; label: string }> = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

const statusLabel = (status: UtilizationStatus) =>
  status === "on_track"
    ? "On track"
    : status === "at_risk"
      ? "At risk"
      : "Off track";

const statusClass = (status: UtilizationStatus) =>
  status === "on_track"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : status === "at_risk"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : "border-rose-200 bg-rose-50 text-rose-700";

const toneText = (status: UtilizationStatus) =>
  status === "on_track"
    ? "text-emerald-600"
    : status === "at_risk"
      ? "text-amber-600"
      : "text-rose-600";

const formatPercent = (value?: number) => `${Number(value || 0).toFixed(1)}%`;
const formatHours = (value?: number) => `${Number(value || 0).toFixed(1)}h`;

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

type UtilizationTab = "partners" | "departments" | "individuals";

const UtilizationBar = ({
  value,
  benchmark,
}: {
  value: number;
  benchmark: number;
}) => (
  <div className="min-w-[140px] space-y-1">
    <Progress value={Math.min(100, Math.max(0, value))} />
    <div className="flex justify-between text-[10px] text-muted-foreground">
      <span>{formatPercent(value)}</span>
      <span>threshold {formatPercent(benchmark)}</span>
    </div>
  </div>
);

export default function Utilization() {
  const [period, setPeriod] = useState<UtilizationPeriod>("monthly");
  const [startDate, setStartDate] = useState(() => getPeriodRange("monthly").startDate);
  const [endDate, setEndDate] = useState(() => getPeriodRange("monthly").endDate);
  const [data, setData] = useState<UtilizationCascadeResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<UtilizationTab>("partners");
  const [viewOpen, setViewOpen] = useState(false);
  const [selectedPartner, setSelectedPartner] = useState<UtilizationCascadePartner | null>(null);
  const [selectedDepartment, setSelectedDepartment] = useState<UtilizationCascadeDepartment | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<UtilizationCascadeMember | null>(null);

  const handlePeriodChange = (next: UtilizationPeriod) => {
    setPeriod(next);
    const range = getPeriodRange(next);
    setStartDate(range.startDate);
    setEndDate(range.endDate);
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        const response = await utilizationAPI.getCascade({
          period,
          dateFrom: startDate || undefined,
          dateTo: endDate || undefined,
        });
        if (!cancelled) setData(response);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [period, startDate, endDate]);

  const exportCurrentTab = () => {
    if (!data) return;
    if (activeTab === "partners") {
      downloadCsv(
        "utilization-partners.csv",
        ["Partner", "Departments", "Members", "Billable", "Target", "Utilization", "Threshold", "Status"],
        data.byPartner.map((partner) => [
          partner.name,
          partner.departmentCount,
          partner.memberCount,
          partner.billableHours,
          partner.targetHours,
          partner.utilizationPercent,
          partner.benchmarkPercent,
          statusLabel(partner.status),
        ])
      );
      return;
    }
    if (activeTab === "departments") {
      downloadCsv(
        "utilization-departments.csv",
        [
          "Department",
          "Partner",
          "Members",
          "Eligible members",
          "Billable",
          "Target",
          "Utilization",
          "Threshold",
          "Status",
        ],
        data.byDepartment.map((department) => [
          department.name,
          department.partnerName || "",
          department.memberCount,
          department.eligibleMemberCount,
          department.billableHours,
          department.targetHours,
          department.utilizationPercent,
          department.benchmarkPercent,
          statusLabel(department.status),
        ])
      );
      return;
    }
    downloadCsv(
      "utilization-individuals.csv",
      [
        "Employee",
        "Department",
        "Partner",
        "Billable",
        "Target",
        "Leave",
        "Utilization",
        "Threshold",
        "Status",
        "Included in averages",
      ],
      data.byEmployee.map((employee) => [
        employee.name,
        employee.departmentName || "",
        employee.partnerName || "",
        employee.billableHours,
        employee.targetHours,
        employee.approvedLeaveHours,
        employee.utilizationPercent,
        employee.benchmarkPercent,
        statusLabel(employee.status),
        employee.includedInAverages ? "Yes" : "No",
      ])
    );
  };

  const openPartner = (partner: UtilizationCascadePartner) => {
    setSelectedPartner(partner);
    setSelectedDepartment(null);
    setSelectedEmployee(null);
    setViewOpen(true);
  };

  const openDepartment = (department: UtilizationCascadeDepartment) => {
    setSelectedPartner(null);
    setSelectedDepartment(department);
    setSelectedEmployee(null);
    setViewOpen(true);
  };

  const openEmployee = (employee: UtilizationCascadeMember) => {
    setSelectedPartner(null);
    setSelectedDepartment(null);
    setSelectedEmployee(employee);
    setViewOpen(true);
  };

  const exportSelected = () => {
    if (!data) return;
    const rows: Array<Array<string | number | null>> = [];
    const headers = [
      "Section",
      "Name",
      "Department",
      "Partner",
      "Members",
      "Billable",
      "Target",
      "Utilization",
      "Threshold",
      "Status",
    ];

    if (selectedPartner) {
      rows.push([
        "Partner",
        selectedPartner.name,
        "",
        selectedPartner.name,
        selectedPartner.memberCount,
        selectedPartner.billableHours,
        selectedPartner.targetHours,
        selectedPartner.utilizationPercent,
        selectedPartner.benchmarkPercent,
        statusLabel(selectedPartner.status),
      ]);
      data.byDepartment
        .filter((department) => department.partnerProfileId === selectedPartner.partnerProfileId)
        .forEach((department) => {
          rows.push([
            "Department",
            department.name,
            department.name,
            selectedPartner.name,
            department.memberCount,
            department.billableHours,
            department.targetHours,
            department.utilizationPercent,
            department.benchmarkPercent,
            statusLabel(department.status),
          ]);
        });
      data.byEmployee
        .filter((employee) => employee.partnerProfileId === selectedPartner.partnerProfileId)
        .forEach((employee) => {
          rows.push([
            "Employee",
            employee.name,
            employee.departmentName || "",
            selectedPartner.name,
            "",
            employee.billableHours,
            employee.targetHours,
            employee.utilizationPercent,
            employee.benchmarkPercent,
            statusLabel(employee.status),
          ]);
        });
      downloadCsv("utilization-partner-report.csv", headers, rows);
      return;
    }

    if (selectedDepartment) {
      rows.push([
        "Department",
        selectedDepartment.name,
        selectedDepartment.name,
        selectedDepartment.partnerName || "",
        selectedDepartment.memberCount,
        selectedDepartment.billableHours,
        selectedDepartment.targetHours,
        selectedDepartment.utilizationPercent,
        selectedDepartment.benchmarkPercent,
        statusLabel(selectedDepartment.status),
      ]);
      data.byEmployee
        .filter((employee) => employee.departmentId === selectedDepartment.departmentId)
        .forEach((employee) => {
          rows.push([
            "Employee",
            employee.name,
            employee.departmentName || "",
            selectedDepartment.partnerName || "",
            "",
            employee.billableHours,
            employee.targetHours,
            employee.utilizationPercent,
            employee.benchmarkPercent,
            statusLabel(employee.status),
          ]);
        });
      downloadCsv("utilization-department-report.csv", headers, rows);
      return;
    }

    if (selectedEmployee) {
      rows.push([
        "Employee",
        selectedEmployee.name,
        selectedEmployee.departmentName || "",
        selectedEmployee.partnerName || "",
        "",
        selectedEmployee.billableHours,
        selectedEmployee.targetHours,
        selectedEmployee.utilizationPercent,
        selectedEmployee.benchmarkPercent,
        statusLabel(selectedEmployee.status),
      ]);
      downloadCsv("utilization-employee-report.csv", headers, rows);
    }
  };

  const selectedPartnerDepartments = selectedPartner
    ? data?.byDepartment.filter(
        (department) => department.partnerProfileId === selectedPartner.partnerProfileId
      ) || []
    : [];
  const selectedPartnerEmployees = selectedPartner
    ? data?.byEmployee.filter(
        (employee) => employee.partnerProfileId === selectedPartner.partnerProfileId
      ) || []
    : [];
  const selectedDepartmentEmployees = selectedDepartment
    ? data?.byEmployee.filter(
        (employee) => employee.departmentId === selectedDepartment.departmentId
      ) || []
    : [];
  const currentView = selectedPartner || selectedDepartment || selectedEmployee;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Utilization</h1>
            <p className="text-muted-foreground">
              Billable hours against each employee's threshold-adjusted working-hours target,
              cascading from individuals to departments, partners, and the organization.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-end">
            <div className="w-full md:w-44">
              <Label htmlFor="utilizationPeriod">Period</Label>
              <select
                id="utilizationPeriod"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={period}
                onChange={(event) => handlePeriodChange(event.target.value as UtilizationPeriod)}
              >
                {PERIOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-full md:w-40">
              <Label htmlFor="utilizationStartDate">Start date</Label>
              <Input
                id="utilizationStartDate"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </div>
            <div className="w-full md:w-40">
              <Label htmlFor="utilizationEndDate">End date</Label>
              <Input
                id="utilizationEndDate"
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </div>
            <Button variant="outline" onClick={exportCurrentTab} disabled={!data}>
              Export CSV
            </Button>
          </div>
        </div>

        {loading ? (
          <PageLoader message="Loading utilization..." minHeightClassName="min-h-[320px]" />
        ) : !data ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Utilization data is unavailable for this period.
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Organization utilization</CardTitle>
                <CardDescription>
                  {data.label} â€¢ {data.workingDays} working days â€¢ {data.holidayDays} holidays
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 md:grid-cols-4">
                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-muted-foreground">Organization utilization</p>
                    <p className={`text-3xl font-bold ${toneText(data.organization.status)}`}>
                      {formatPercent(data.organization.utilizationPercent)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      threshold {formatPercent(data.organization.benchmarkPercent)} of working hours
                    </p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-muted-foreground">Billable hours</p>
                    <p className="text-2xl font-bold">
                      {formatHours(data.organization.billableHours)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      of {formatHours(data.organization.targetHours)} target
                    </p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-muted-foreground">Coverage</p>
                    <p className="text-2xl font-bold">
                      {data.organization.partnerCount} partners
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {data.organization.departmentCount} departments â€¢{" "}
                      {data.organization.memberCount} members
                    </p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-muted-foreground">Status</p>
                    <Badge className={statusClass(data.organization.status)}>
                      {statusLabel(data.organization.status)}
                    </Badge>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Average of partners' utilization
                    </p>
                  </div>
                </div>
                <UtilizationBar
                  value={data.organization.utilizationPercent}
                  benchmark={data.organization.benchmarkPercent}
                />
              </CardContent>
            </Card>

            <Tabs
              value={activeTab}
              onValueChange={(value) => setActiveTab(value as UtilizationTab)}
            >
              <TabsList>
                <TabsTrigger value="partners">Partners</TabsTrigger>
                <TabsTrigger value="departments">Departments</TabsTrigger>
                <TabsTrigger value="individuals">Individuals</TabsTrigger>
              </TabsList>

              <TabsContent value="partners">
                <Card>
                  <CardHeader>
                    <CardTitle>Partner utilization</CardTitle>
                    <CardDescription>
                      Simple average of each partner's departments.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="max-h-[520px] overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Partner</TableHead>
                          <TableHead>Departments</TableHead>
                          <TableHead>Members</TableHead>
                          <TableHead className="text-right">Billable</TableHead>
                          <TableHead className="text-right">Target</TableHead>
                          <TableHead>Utilization</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="sticky right-0 border-l bg-background text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.byPartner.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={8} className="text-center text-muted-foreground">
                              No partner-linked departments for this period.
                            </TableCell>
                          </TableRow>
                        )}
                        {data.byPartner.map((partner) => (
                          <TableRow key={partner.partnerProfileId}>
                            <TableCell className="font-medium">{partner.name}</TableCell>
                            <TableCell>{partner.departmentCount}</TableCell>
                            <TableCell>{partner.memberCount}</TableCell>
                            <TableCell className="text-right">{formatHours(partner.billableHours)}</TableCell>
                            <TableCell className="text-right">{formatHours(partner.targetHours)}</TableCell>
                            <TableCell>
                              <UtilizationBar
                                value={partner.utilizationPercent}
                                benchmark={partner.benchmarkPercent}
                              />
                            </TableCell>
                            <TableCell>
                              <Badge className={statusClass(partner.status)}>
                                {statusLabel(partner.status)}
                              </Badge>
                            </TableCell>
                            <TableCell className="sticky right-0 border-l bg-background text-right">
                              <Button size="sm" variant="outline" onClick={() => openPartner(partner)}>
                                View
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="departments">
                <Card>
                  <CardHeader>
                    <CardTitle>Department utilization</CardTitle>
                    <CardDescription>
                      Simple average of each department's members.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="max-h-[520px] overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Department</TableHead>
                          <TableHead>Partner</TableHead>
                          <TableHead>Members</TableHead>
                          <TableHead className="text-right">Billable</TableHead>
                          <TableHead className="text-right">Target</TableHead>
                          <TableHead>Utilization</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="sticky right-0 border-l bg-background text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.byDepartment.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={8} className="text-center text-muted-foreground">
                              No department data for this period.
                            </TableCell>
                          </TableRow>
                        )}
                        {data.byDepartment.map((department) => (
                          <TableRow key={department.departmentId ?? department.name}>
                            <TableCell className="font-medium">{department.name}</TableCell>
                            <TableCell>{department.partnerName || "Unassigned"}</TableCell>
                            <TableCell>
                              {department.memberCount}
                              {department.eligibleMemberCount !== department.memberCount && (
                                <span className="text-xs text-muted-foreground">
                                  {" "}
                                  ({department.eligibleMemberCount} with target)
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">{formatHours(department.billableHours)}</TableCell>
                            <TableCell className="text-right">{formatHours(department.targetHours)}</TableCell>
                            <TableCell>
                              <UtilizationBar
                                value={department.utilizationPercent}
                                benchmark={department.benchmarkPercent}
                              />
                            </TableCell>
                            <TableCell>
                              <Badge className={statusClass(department.status)}>
                                {statusLabel(department.status)}
                              </Badge>
                            </TableCell>
                            <TableCell className="sticky right-0 border-l bg-background text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openDepartment(department)}
                              >
                                View
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="individuals">
                <Card>
                  <CardHeader>
                    <CardTitle>Individual utilization</CardTitle>
                    <CardDescription>
                      Billable hours vs (working days Ã— daily hours âˆ’ approved leave) Ã— billable
                      threshold.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="max-h-[520px] overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Employee</TableHead>
                          <TableHead>Department</TableHead>
                          <TableHead>Partner</TableHead>
                          <TableHead className="text-right">Billable</TableHead>
                          <TableHead className="text-right">Target</TableHead>
                          <TableHead className="text-right">Leave</TableHead>
                          <TableHead>Utilization</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="sticky right-0 border-l bg-background text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.byEmployee.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={9} className="text-center text-muted-foreground">
                              No employee data for this period.
                            </TableCell>
                          </TableRow>
                        )}
                        {data.byEmployee.map((employee) => (
                          <TableRow
                            key={employee.profileId}
                            className={employee.includedInAverages ? undefined : "opacity-60"}
                          >
                            <TableCell className="font-medium">{employee.name}</TableCell>
                            <TableCell>{employee.departmentName || "Unassigned"}</TableCell>
                            <TableCell>{employee.partnerName || "Unassigned"}</TableCell>
                            <TableCell className="text-right">{formatHours(employee.billableHours)}</TableCell>
                            <TableCell className="text-right">{formatHours(employee.targetHours)}</TableCell>
                            <TableCell className="text-right">{formatHours(employee.approvedLeaveHours)}</TableCell>
                            <TableCell>
                              <UtilizationBar
                                value={employee.utilizationPercent}
                                benchmark={employee.benchmarkPercent}
                              />
                            </TableCell>
                            <TableCell>
                              {employee.includedInAverages ? (
                                <Badge className={statusClass(employee.status)}>
                                  {statusLabel(employee.status)}
                                </Badge>
                              ) : (
                                <Badge variant="outline">No target</Badge>
                              )}
                            </TableCell>
                            <TableCell className="sticky right-0 border-l bg-background text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openEmployee(employee)}
                              >
                                View
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}

        <Dialog open={viewOpen} onOpenChange={setViewOpen}>
          <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-5xl overflow-x-hidden overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {selectedPartner?.name || selectedDepartment?.name || selectedEmployee?.name || "Utilization detail"}
              </DialogTitle>
              <DialogDescription>
                {selectedPartner
                  ? "Partner breakdown"
                  : selectedDepartment
                    ? "Department breakdown"
                    : "Individual utilization"}
              </DialogDescription>
            </DialogHeader>

            {currentView && (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">Utilization</p>
                    <p className={`text-2xl font-bold ${toneText(currentView.status)}`}>
                      {formatPercent(currentView.utilizationPercent)}
                    </p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">Billable hours</p>
                    <p className="text-2xl font-bold">{formatHours(currentView.billableHours)}</p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">Target hours</p>
                    <p className="text-2xl font-bold">{formatHours(currentView.targetHours)}</p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">Status</p>
                    <Badge className={statusClass(currentView.status)}>
                      {statusLabel(currentView.status)}
                    </Badge>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Utilization vs threshold</span>
                    <span>{formatPercent(currentView.benchmarkPercent)}</span>
                  </div>
                  <UtilizationBar
                    value={currentView.utilizationPercent}
                    benchmark={currentView.benchmarkPercent}
                  />
                </div>

                {selectedPartner && (
                  <>
                    <div className="min-w-0 overflow-hidden rounded-md border">
                      <div className="border-b p-2 text-sm font-medium">Departments</div>
                      <div className="max-h-[220px] overflow-auto">
                        <Table className="text-xs">
                          <TableHeader>
                            <TableRow>
                              <TableHead>Department</TableHead>
                              <TableHead className="text-right">Members</TableHead>
                              <TableHead className="text-right">Billable</TableHead>
                              <TableHead className="text-right">Target</TableHead>
                              <TableHead>Utilization</TableHead>
                              <TableHead>Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {selectedPartnerDepartments.length === 0 && (
                              <TableRow>
                                <TableCell colSpan={6} className="text-center text-muted-foreground">
                                  No departments.
                                </TableCell>
                              </TableRow>
                            )}
                            {selectedPartnerDepartments.map((department) => (
                              <TableRow key={department.departmentId ?? department.name}>
                                <TableCell className="font-medium">{department.name}</TableCell>
                                <TableCell className="text-right">{department.memberCount}</TableCell>
                                <TableCell className="text-right">{formatHours(department.billableHours)}</TableCell>
                                <TableCell className="text-right">{formatHours(department.targetHours)}</TableCell>
                                <TableCell>
                                  <UtilizationBar
                                    value={department.utilizationPercent}
                                    benchmark={department.benchmarkPercent}
                                  />
                                </TableCell>
                                <TableCell>
                                  <Badge className={statusClass(department.status)}>
                                    {statusLabel(department.status)}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>

                    <div className="min-w-0 overflow-hidden rounded-md border">
                      <div className="border-b p-2 text-sm font-medium">Staff</div>
                      <div className="max-h-[240px] overflow-auto">
                        <Table className="text-xs">
                          <TableHeader>
                            <TableRow>
                              <TableHead>Employee</TableHead>
                              <TableHead>Department</TableHead>
                              <TableHead className="text-right">Billable</TableHead>
                              <TableHead className="text-right">Target</TableHead>
                              <TableHead>Utilization</TableHead>
                              <TableHead>Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {selectedPartnerEmployees.length === 0 && (
                              <TableRow>
                                <TableCell colSpan={6} className="text-center text-muted-foreground">
                                  No staff.
                                </TableCell>
                              </TableRow>
                            )}
                            {selectedPartnerEmployees.map((employee) => (
                              <TableRow key={employee.profileId}>
                                <TableCell className="font-medium">{employee.name}</TableCell>
                                <TableCell>{employee.departmentName || "-"}</TableCell>
                                <TableCell className="text-right">{formatHours(employee.billableHours)}</TableCell>
                                <TableCell className="text-right">{formatHours(employee.targetHours)}</TableCell>
                                <TableCell>
                                  <UtilizationBar
                                    value={employee.utilizationPercent}
                                    benchmark={employee.benchmarkPercent}
                                  />
                                </TableCell>
                                <TableCell>
                                  <Badge className={statusClass(employee.status)}>
                                    {statusLabel(employee.status)}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </>
                )}

                {selectedDepartment && (
                  <div className="min-w-0 overflow-hidden rounded-md border">
                    <div className="border-b p-2 text-sm font-medium">Staff</div>
                    <div className="max-h-[260px] overflow-auto">
                      <Table className="text-xs">
                        <TableHeader>
                          <TableRow>
                            <TableHead>Employee</TableHead>
                            <TableHead>Partner</TableHead>
                            <TableHead className="text-right">Billable</TableHead>
                            <TableHead className="text-right">Target</TableHead>
                            <TableHead>Utilization</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedDepartmentEmployees.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={6} className="text-center text-muted-foreground">
                                No staff.
                              </TableCell>
                            </TableRow>
                          )}
                          {selectedDepartmentEmployees.map((employee) => (
                            <TableRow key={employee.profileId}>
                              <TableCell className="font-medium">{employee.name}</TableCell>
                              <TableCell>{employee.partnerName || "-"}</TableCell>
                              <TableCell className="text-right">{formatHours(employee.billableHours)}</TableCell>
                              <TableCell className="text-right">{formatHours(employee.targetHours)}</TableCell>
                              <TableCell>
                                <UtilizationBar
                                  value={employee.utilizationPercent}
                                  benchmark={employee.benchmarkPercent}
                                />
                              </TableCell>
                              <TableCell>
                                <Badge className={statusClass(employee.status)}>
                                  {statusLabel(employee.status)}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {selectedEmployee && (
                  <p className="text-sm text-muted-foreground">
                    Individual job contribution and timesheet detail are available in
                    Timesheet Reports â†’ Staff Detailed.
                  </p>
                )}
              </div>
            )}

            <DialogFooter className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={exportSelected}>
                Export report
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

