import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import PageLoader from "@/components/ui/page-loader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import departmentsAPI from "@/lib/api/departments";
import employeesAPI from "@/lib/api/employees";
import leaveAPI, {
  type LeavePolicy,
  type LeavePolicyApprovalRouteStep,
  type LeavePolicyAssignment,
  type LeaveReportSummary,
  type LeaveType,
  type PublicHoliday,
} from "@/lib/api/leave";
import rolesAPI from "@/lib/api/roles";

const extractItems = <T,>(payload: any): T[] => {
  if (Array.isArray(payload)) return payload as T[];
  if (Array.isArray(payload?.data)) return payload.data as T[];
  return [];
};

const formatDate = (value?: string | null) => {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-KE", { month: "short", day: "numeric", year: "numeric" }).format(date);
};

export default function LeaveAdmin() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [report, setReport] = useState<LeaveReportSummary | null>(null);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [policies, setPolicies] = useState<LeavePolicy[]>([]);
  const [assignments, setAssignments] = useState<LeavePolicyAssignment[]>([]);
  const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
  const [departments, setDepartments] = useState<Array<{ id: number; name: string }>>([]);
  const [roles, setRoles] = useState<Array<{ id: number; name: string }>>([]);
  const [employees, setEmployees] = useState<Array<{ id: number; firstName: string; lastName: string }>>([]);
  const [typeForm, setTypeForm] = useState({ code: "", name: "", description: "" });
  const [policyForm, setPolicyForm] = useState({
    leaveTypeId: "",
    name: "",
    annualEntitlement: "21",
    hoursPerWorkday: "8",
    shortThresholdHours: "16",
    shortNoticeDays: "2",
    longNoticeDays: "14",
    shortApprover: "manager",
    longApprover: "partner",
    autoProjectToTimesheet: true,
  });
  const [assignmentForm, setAssignmentForm] = useState({ policyId: "", scope: "global", departmentId: "", roleId: "", profileId: "" });
  const [holidayForm, setHolidayForm] = useState({ name: "", holidayDate: "", countryCode: "KE" });
  const [adjustForm, setAdjustForm] = useState({ employeeProfileId: "", leaveTypeId: "", leaveYear: String(new Date().getUTCFullYear()), units: "", note: "" });

  const buildPolicyRouteSteps = (approver: "manager" | "partner"): LeavePolicyApprovalRouteStep[] => [
    {
      stepNumber: 1,
      stageType: approver,
      approverSource: approver === "partner" ? "department_partner" : "employee_manager",
    },
    {
      stepNumber: 2,
      stageType: "hr",
      approverSource: "hr_pool",
    },
  ];

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [reportRows, typeRows, policyRows, assignmentRows, holidayRows, departmentRows, roleRows, employeeRows] = await Promise.all([
        leaveAPI.getReportSummary(),
        leaveAPI.listLeaveTypes(),
        leaveAPI.listPolicies(),
        leaveAPI.listPolicyAssignments(),
        leaveAPI.listPublicHolidays(),
        departmentsAPI.list({ page: 1, pageSize: 200 }),
        rolesAPI.list(),
        employeesAPI.list({ page: 1, pageSize: 200 }),
      ]);
      setReport(reportRows);
      setLeaveTypes(typeRows);
      setPolicies(policyRows);
      setAssignments(assignmentRows);
      setHolidays(holidayRows);
      setDepartments(extractItems(departmentRows));
      setRoles(extractItems(roleRows));
      setEmployees(extractItems(employeeRows));
    } catch (error: any) {
      toast({ title: "Leave admin unavailable", description: error?.message || "Failed to load leave admin data.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const runSave = async (action: () => Promise<void>, description: string) => {
    try {
      setIsSaving(true);
      await action();
      toast({ title: "Saved", description });
      await loadData();
    } catch (error: any) {
      toast({ title: "Save failed", description: error?.message || "Unable to save leave configuration.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <DashboardLayout><PageLoader message="Loading leave administration..." /></DashboardLayout>;
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Leave Admin</h1>
          <p className="text-muted-foreground">Configure leave types, policies, assignments, holidays, and manual balance corrections.</p>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid h-auto w-full grid-cols-1 gap-1 sm:grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="configuration">Configuration</TabsTrigger>
            <TabsTrigger value="operations">Operations</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Total requests</CardTitle></CardHeader><CardContent><div className="text-3xl font-semibold">{report?.totalRequests || 0}</div></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Pending approvals</CardTitle></CardHeader><CardContent><div className="text-3xl font-semibold">{report?.pendingApprovals || 0}</div></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Declined</CardTitle></CardHeader><CardContent><div className="text-3xl font-semibold">{report?.declinedCount || 0}</div></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Cancelled</CardTitle></CardHeader><CardContent><div className="text-3xl font-semibold">{report?.cancelledCount || 0}</div></CardContent></Card>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Manager queue</CardTitle></CardHeader><CardContent><div className="text-3xl font-semibold">{report?.pendingByStage?.manager || 0}</div></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Partner queue</CardTitle></CardHeader><CardContent><div className="text-3xl font-semibold">{report?.pendingByStage?.partner || 0}</div></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">HR final queue</CardTitle></CardHeader><CardContent><div className="text-3xl font-semibold">{report?.pendingByStage?.hr || 0}</div></CardContent></Card>
            </div>
            <div className="grid gap-6 xl:grid-cols-2">
              <Card>
                <CardHeader><CardTitle>Utilization by type</CardTitle><CardDescription>Approved units by leave type.</CardDescription></CardHeader>
                <CardContent className="space-y-3">
                  {report?.utilizationByType.length ? report.utilizationByType.map((row) => (
                    <div key={row.leaveType} className="flex items-center justify-between rounded-lg border p-3">
                      <span className="font-medium">{row.leaveType}</span>
                      <Badge variant="outline">{row.units} units</Badge>
                    </div>
                  )) : <p className="text-sm text-muted-foreground">No utilization data yet.</p>}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Upcoming absences</CardTitle><CardDescription>Approved leave already scheduled.</CardDescription></CardHeader>
                <CardContent className="space-y-3">
                  {report?.upcomingAbsences.length ? report.upcomingAbsences.map((item) => (
                    <div key={item.id} className="rounded-lg border p-3">
                      <div className="font-medium">{item.employeeName}</div>
                      <div className="text-sm text-muted-foreground">{item.leaveType} • {formatDate(item.startDate)} - {formatDate(item.endDate)}</div>
                      <div className="text-xs text-muted-foreground">{item.units} units • {item.hours || 0}h</div>
                    </div>
                  )) : <p className="text-sm text-muted-foreground">No upcoming approved absences.</p>}
                </CardContent>
              </Card>
            </div>
            <div className="grid gap-6 xl:grid-cols-2">
              <Card>
                <CardHeader><CardTitle>Employees On Leave Now</CardTitle><CardDescription>People currently away across your scope.</CardDescription></CardHeader>
                <CardContent className="space-y-3">
                  {report?.employeesOnLeaveNow?.length ? report.employeesOnLeaveNow.map((item) => (
                    <div key={item.id} className="rounded-lg border p-3">
                      <div className="font-medium">{item.employeeName}</div>
                      <div className="text-sm text-muted-foreground">{item.departmentName} • {item.leaveType}</div>
                      <div className="text-xs text-muted-foreground">{formatDate(item.startDate)} - {formatDate(item.endDate)} • {item.hours}h</div>
                    </div>
                  )) : <p className="text-sm text-muted-foreground">No employees are on leave right now.</p>}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Lowest Leave Balances</CardTitle><CardDescription>Employees that may need closer leave planning.</CardDescription></CardHeader>
                <CardContent className="space-y-3">
                  {report?.leaveBalances?.length ? report.leaveBalances.slice(0, 8).map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <div className="font-medium">{item.employeeName}</div>
                        <div className="text-sm text-muted-foreground">{item.departmentName} • {item.leaveType}</div>
                      </div>
                      <div className="text-right text-sm">
                        <div className="font-medium">{item.availableUnits} available</div>
                        <div className="text-muted-foreground">{item.pendingUnits} pending</div>
                      </div>
                    </div>
                  )) : <p className="text-sm text-muted-foreground">No leave balance data yet.</p>}
                </CardContent>
              </Card>
            </div>
            <Card>
              <CardHeader><CardTitle>Department Leave Balances</CardTitle><CardDescription>Available, pending, and used balances rolled up by department.</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                {report?.departmentBalances?.length ? report.departmentBalances.map((item) => (
                  <div key={item.departmentName} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="font-medium">{item.departmentName}</div>
                    <div className="text-right text-sm text-muted-foreground">
                      <div>{item.availableUnits} available</div>
                      <div>{item.pendingUnits} pending • {item.usedUnits} used</div>
                    </div>
                  </div>
                )) : <p className="text-sm text-muted-foreground">No departmental balance data yet.</p>}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="configuration" className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-2">
              <Card>
                <CardHeader><CardTitle>Create leave type</CardTitle><CardDescription>Add a new leave category.</CardDescription></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Input placeholder="Code" value={typeForm.code} onChange={(e) => setTypeForm((c) => ({ ...c, code: e.target.value }))} />
                    <Input placeholder="Name" value={typeForm.name} onChange={(e) => setTypeForm((c) => ({ ...c, name: e.target.value }))} />
                  </div>
                  <Textarea placeholder="Description" value={typeForm.description} onChange={(e) => setTypeForm((c) => ({ ...c, description: e.target.value }))} />
                  <Button onClick={() => void runSave(async () => {
                    await leaveAPI.createLeaveType({ code: typeForm.code, name: typeForm.name, description: typeForm.description || undefined });
                    setTypeForm({ code: "", name: "", description: "" });
                  }, "Leave type created successfully.")} disabled={isSaving}>Create leave type</Button>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Create leave policy</CardTitle><CardDescription>Define entitlement rules for a leave type.</CardDescription></CardHeader>
                <CardContent className="space-y-4">
                  <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={policyForm.leaveTypeId} onChange={(e) => setPolicyForm((c) => ({ ...c, leaveTypeId: e.target.value }))}>
                    <option value="">Select leave type</option>
                    {leaveTypes.filter((item) => item.isActive).map((leaveType) => <option key={leaveType.id} value={leaveType.id}>{leaveType.name}</option>)}
                  </select>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Input placeholder="Policy name" value={policyForm.name} onChange={(e) => setPolicyForm((c) => ({ ...c, name: e.target.value }))} />
                    <Input placeholder="Annual entitlement" value={policyForm.annualEntitlement} onChange={(e) => setPolicyForm((c) => ({ ...c, annualEntitlement: e.target.value }))} />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Input placeholder="Hours per workday" value={policyForm.hoursPerWorkday} onChange={(e) => setPolicyForm((c) => ({ ...c, hoursPerWorkday: e.target.value }))} />
                    <Input placeholder="Short leave threshold hours" value={policyForm.shortThresholdHours} onChange={(e) => setPolicyForm((c) => ({ ...c, shortThresholdHours: e.target.value }))} />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Input placeholder="Notice for short leave (days)" value={policyForm.shortNoticeDays} onChange={(e) => setPolicyForm((c) => ({ ...c, shortNoticeDays: e.target.value }))} />
                    <Input placeholder="Notice for leave above threshold (days)" value={policyForm.longNoticeDays} onChange={(e) => setPolicyForm((c) => ({ ...c, longNoticeDays: e.target.value }))} />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={policyForm.shortApprover} onChange={(e) => setPolicyForm((c) => ({ ...c, shortApprover: e.target.value }))}>
                      <option value="manager">Short leave first approver: Manager</option>
                      <option value="partner">Short leave first approver: Partner</option>
                    </select>
                    <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={policyForm.longApprover} onChange={(e) => setPolicyForm((c) => ({ ...c, longApprover: e.target.value }))}>
                      <option value="manager">Extended leave first approver: Manager</option>
                      <option value="partner">Extended leave first approver: Partner</option>
                    </select>
                  </div>
                  <label className="flex items-center gap-3 rounded-lg border p-3 text-sm">
                    <input
                      type="checkbox"
                      checked={policyForm.autoProjectToTimesheet}
                      onChange={(e) => setPolicyForm((c) => ({ ...c, autoProjectToTimesheet: e.target.checked }))}
                    />
                    Project approved and pending leave into employee timesheets automatically
                  </label>
                  <Button onClick={() => void runSave(async () => {
                    const thresholdHours = Number(policyForm.shortThresholdHours || 16);
                    const thresholdRollover = Number((thresholdHours + 0.01).toFixed(2));
                    await leaveAPI.createPolicy({
                      leaveTypeId: Number(policyForm.leaveTypeId),
                      name: policyForm.name,
                      annualEntitlement: Number(policyForm.annualEntitlement || 0),
                      hoursPerWorkday: Number(policyForm.hoursPerWorkday || 8),
                      autoProjectToTimesheet: policyForm.autoProjectToTimesheet,
                      requiresManagerApproval: true,
                      requiresHrApproval: true,
                      noticeRules: [
                        {
                          sequenceNo: 1,
                          maxHours: thresholdHours,
                          noticeValue: Number(policyForm.shortNoticeDays || 0),
                          noticeUnit: "calendar_days",
                          isActive: true,
                        },
                        {
                          sequenceNo: 2,
                          minHours: thresholdRollover,
                          noticeValue: Number(policyForm.longNoticeDays || 0),
                          noticeUnit: "calendar_days",
                          isActive: true,
                        },
                      ],
                      approvalRoutes: [
                        {
                          name: "Short leave approvals",
                          maxHours: thresholdHours,
                          isActive: true,
                          steps: buildPolicyRouteSteps(policyForm.shortApprover as "manager" | "partner"),
                        },
                        {
                          name: "Extended leave approvals",
                          minHours: thresholdRollover,
                          isActive: true,
                          steps: buildPolicyRouteSteps(policyForm.longApprover as "manager" | "partner"),
                        },
                      ],
                    });
                    setPolicyForm({
                      leaveTypeId: "",
                      name: "",
                      annualEntitlement: "21",
                      hoursPerWorkday: "8",
                      shortThresholdHours: "16",
                      shortNoticeDays: "2",
                      longNoticeDays: "14",
                      shortApprover: "manager",
                      longApprover: "partner",
                      autoProjectToTimesheet: true,
                    });
                  }, "Leave policy created successfully.")} disabled={isSaving}>Create leave policy</Button>
                </CardContent>
              </Card>
            </div>
            <div className="grid gap-6 xl:grid-cols-2">
              <Card>
                <CardHeader><CardTitle>Leave types</CardTitle><CardDescription>Current categories and state.</CardDescription></CardHeader>
                <CardContent className="space-y-3">
                  {leaveTypes.map((leaveType) => (
                    <div key={leaveType.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <div className="font-medium">{leaveType.name}</div>
                        <div className="text-sm text-muted-foreground">{leaveType.code}</div>
                      </div>
                      {leaveType.isActive ? <Button size="sm" variant="outline" onClick={() => void runSave(async () => { await leaveAPI.deleteLeaveType(leaveType.id); }, "Leave type deactivated successfully.")}>Deactivate</Button> : <Badge variant="secondary">Inactive</Badge>}
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Leave policies</CardTitle><CardDescription>Configured policy records.</CardDescription></CardHeader>
                <CardContent className="space-y-3">
                  {policies.map((policy) => (
                    <div key={policy.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <div className="font-medium">{policy.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {policy.leaveType?.name || "Leave"} • {policy.annualEntitlement} units • {policy.hoursPerWorkday}h/day
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {policy.noticeRules?.length ? `${policy.noticeRules.length} notice rule(s)` : "No threshold notice rules"} •{" "}
                          {policy.approvalRoutes?.length ? `${policy.approvalRoutes.length} approval route(s)` : "No approval routes"} •{" "}
                          {policy.autoProjectToTimesheet ? "Timesheet sync on" : "Timesheet sync off"}
                        </div>
                      </div>
                      {policy.isActive ? <Button size="sm" variant="outline" onClick={() => void runSave(async () => { await leaveAPI.deletePolicy(policy.id); }, "Leave policy deactivated successfully.")}>Deactivate</Button> : <Badge variant="secondary">Inactive</Badge>}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="operations" className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-2">
              <Card>
                <CardHeader><CardTitle>Policy assignment</CardTitle><CardDescription>Bind policies to a scope.</CardDescription></CardHeader>
                <CardContent className="space-y-4">
                  <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={assignmentForm.policyId} onChange={(e) => setAssignmentForm((c) => ({ ...c, policyId: e.target.value }))}>
                    <option value="">Select policy</option>
                    {policies.filter((item) => item.isActive).map((policy) => <option key={policy.id} value={policy.id}>{policy.name}</option>)}
                  </select>
                  <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={assignmentForm.scope} onChange={(e) => setAssignmentForm((c) => ({ ...c, scope: e.target.value }))}>
                    <option value="global">Global</option>
                    <option value="department">Department</option>
                    <option value="role">Role</option>
                    <option value="employee">Employee</option>
                  </select>
                  {assignmentForm.scope === "department" ? <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={assignmentForm.departmentId} onChange={(e) => setAssignmentForm((c) => ({ ...c, departmentId: e.target.value }))}><option value="">Select department</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select> : null}
                  {assignmentForm.scope === "role" ? <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={assignmentForm.roleId} onChange={(e) => setAssignmentForm((c) => ({ ...c, roleId: e.target.value }))}><option value="">Select role</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select> : null}
                  {assignmentForm.scope === "employee" ? <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={assignmentForm.profileId} onChange={(e) => setAssignmentForm((c) => ({ ...c, profileId: e.target.value }))}><option value="">Select employee</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.firstName} {employee.lastName}</option>)}</select> : null}
                  <Button onClick={() => void runSave(async () => {
                    await leaveAPI.createPolicyAssignment({
                      policyId: Number(assignmentForm.policyId),
                      scope: assignmentForm.scope as any,
                      departmentId: assignmentForm.departmentId ? Number(assignmentForm.departmentId) : null,
                      roleId: assignmentForm.roleId ? Number(assignmentForm.roleId) : null,
                      profileId: assignmentForm.profileId ? Number(assignmentForm.profileId) : null,
                    });
                    setAssignmentForm({ policyId: "", scope: "global", departmentId: "", roleId: "", profileId: "" });
                  }, "Policy assignment created successfully.")} disabled={isSaving}>Create assignment</Button>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Assignments</CardTitle><CardDescription>Current scope mapping.</CardDescription></CardHeader>
                <CardContent className="space-y-3">
                  {assignments.map((assignment) => (
                    <div key={assignment.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <div className="font-medium">{assignment.policy?.name || "Policy"}</div>
                        <div className="text-sm text-muted-foreground">{assignment.scope} • {assignment.department?.name || assignment.role?.name || (assignment.profile ? `${assignment.profile.firstName} ${assignment.profile.lastName}` : "All employees")}</div>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => void runSave(async () => { await leaveAPI.deletePolicyAssignment(assignment.id); }, "Policy assignment removed successfully.")}>Remove</Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <Card>
                <CardHeader><CardTitle>Public holiday</CardTitle><CardDescription>Add a holiday that should not deduct leave.</CardDescription></CardHeader>
                <CardContent className="space-y-4">
                  <Input placeholder="Holiday name" value={holidayForm.name} onChange={(e) => setHolidayForm((c) => ({ ...c, name: e.target.value }))} />
                  <div className="grid gap-4 md:grid-cols-2">
                    <Input type="date" value={holidayForm.holidayDate} onChange={(e) => setHolidayForm((c) => ({ ...c, holidayDate: e.target.value }))} />
                    <Input placeholder="Country code" value={holidayForm.countryCode} onChange={(e) => setHolidayForm((c) => ({ ...c, countryCode: e.target.value }))} />
                  </div>
                  <Button onClick={() => void runSave(async () => {
                    await leaveAPI.createPublicHoliday({ name: holidayForm.name, holidayDate: holidayForm.holidayDate, countryCode: holidayForm.countryCode || undefined });
                    setHolidayForm({ name: "", holidayDate: "", countryCode: "KE" });
                  }, "Public holiday created successfully.")} disabled={isSaving}>Create holiday</Button>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Holiday calendar</CardTitle><CardDescription>Configured holiday entries.</CardDescription></CardHeader>
                <CardContent className="space-y-3">
                  {holidays.map((holiday) => (
                    <div key={holiday.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <div className="font-medium">{holiday.name}</div>
                        <div className="text-sm text-muted-foreground">{formatDate(holiday.holidayDate)}</div>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => void runSave(async () => { await leaveAPI.deletePublicHoliday(holiday.id); }, "Public holiday deleted successfully.")}>Delete</Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader><CardTitle>Manual balance adjustment</CardTitle><CardDescription>Post corrections or carryovers to an employee balance.</CardDescription></CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={adjustForm.employeeProfileId} onChange={(e) => setAdjustForm((c) => ({ ...c, employeeProfileId: e.target.value }))}><option value="">Select employee</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.firstName} {employee.lastName}</option>)}</select>
                <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={adjustForm.leaveTypeId} onChange={(e) => setAdjustForm((c) => ({ ...c, leaveTypeId: e.target.value }))}><option value="">Select leave type</option>{leaveTypes.filter((item) => item.isActive).map((leaveType) => <option key={leaveType.id} value={leaveType.id}>{leaveType.name}</option>)}</select>
                <Input placeholder="Year" value={adjustForm.leaveYear} onChange={(e) => setAdjustForm((c) => ({ ...c, leaveYear: e.target.value }))} />
                <Input placeholder="Units (+/-)" value={adjustForm.units} onChange={(e) => setAdjustForm((c) => ({ ...c, units: e.target.value }))} />
                <Input placeholder="Note" value={adjustForm.note} onChange={(e) => setAdjustForm((c) => ({ ...c, note: e.target.value }))} />
                <div className="md:col-span-2 xl:col-span-5">
                  <Button onClick={() => void runSave(async () => {
                    await leaveAPI.adjustBalance({
                      employeeProfileId: Number(adjustForm.employeeProfileId),
                      leaveTypeId: Number(adjustForm.leaveTypeId),
                      leaveYear: Number(adjustForm.leaveYear),
                      units: Number(adjustForm.units),
                      note: adjustForm.note || undefined,
                    });
                    setAdjustForm({ employeeProfileId: "", leaveTypeId: "", leaveYear: String(new Date().getUTCFullYear()), units: "", note: "" });
                  }, "Leave balance adjusted successfully.")} disabled={isSaving}>Post adjustment</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
