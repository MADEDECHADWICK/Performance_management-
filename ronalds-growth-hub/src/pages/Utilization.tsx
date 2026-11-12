import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import PageLoader from "@/components/ui/page-loader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  utilizationAPI,
  type UtilizationCascadeResult,
  type UtilizationPeriod,
  type UtilizationStatus,
} from "@/lib/api/utilization";

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
      <span>benchmark {formatPercent(benchmark)}</span>
    </div>
  </div>
);

export default function Utilization() {
  const [period, setPeriod] = useState<UtilizationPeriod>("monthly");
  const [data, setData] = useState<UtilizationCascadeResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        const response = await utilizationAPI.getCascade({
          period,
          date: new Date().toISOString().slice(0, 10),
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
  }, [period]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Utilization</h1>
            <p className="text-muted-foreground">
              Billable hours against the daily target, cascading from individuals to departments,
              partners, and the organization.
            </p>
          </div>
          <div className="w-full md:w-44">
            <Label htmlFor="utilizationPeriod">Period</Label>
            <select
              id="utilizationPeriod"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={period}
              onChange={(event) => setPeriod(event.target.value as UtilizationPeriod)}
            >
              {PERIOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
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
                  {data.label} • {data.workingDays} working days • {data.holidayDays} holidays
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
                      benchmark {formatPercent(data.organization.benchmarkPercent)}
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
                      {data.organization.departmentCount} departments •{" "}
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

            <Tabs defaultValue="partners">
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
                  <CardContent>
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
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.byPartner.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center text-muted-foreground">
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
                  <CardContent>
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
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.byDepartment.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center text-muted-foreground">
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
                      Billable hours logged vs working days × daily hours, less approved leave.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
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
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.byEmployee.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={8} className="text-center text-muted-foreground">
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
      </div>
    </DashboardLayout>
  );
}
