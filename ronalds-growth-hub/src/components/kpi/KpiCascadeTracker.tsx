import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

type KpiOption = {
  id: number;
  name: string;
  category?: string | null;
};

type EmployeeProfile = {
  id: number;
  firstName?: string;
  lastName?: string;
  email?: string;
  managerId?: number | null;
  departmentId?: number | null;
  department?: { id: number; name: string } | null;
  isPartner?: boolean;
};

type AssignmentTracking = {
  progressPercent?: number;
  resolvedAchievedValue?: number | null;
  achievement?: {
    status?: string;
    asOf?: string | null;
  };
};

type AssignmentRecord = {
  id: number;
  kpiId: number;
  employeeProfileId: number;
  targetValue?: number | string | null;
  achievedValue?: number | string | null;
  weight?: number | string | null;
  status?: string;
  employee?: EmployeeProfile | null;
  kpi?: { id: number; name: string; targetValue?: number | string | null; weight?: number | string | null } | null;
  tracking?: AssignmentTracking;
};

type RowView = {
  assignmentId: number;
  employeeProfileId: number;
  employeeName: string;
  departmentName: string;
  managerName: string;
  partnerName: string;
  targetValue: number;
  actualValue: number;
  progressPercent: number;
  weight: number;
  statusLabel: string;
  asOf: string | null;
  departmentId: number | null;
  managerId: number | null;
  partnerId: number | null;
};

type RollupSummary = {
  count: number;
  weightedProgress: number;
};

type KpiCascadeTrackerProps = {
  kpis: KpiOption[];
};

const extractArray = (payload: any) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
};

const parseNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clampPct = (value: number) => Math.max(0, Math.min(100, value));

const weightedAverage = (rows: RowView[]) => {
  if (!rows.length) return 0;
  const totalWeight = rows.reduce((sum, row) => sum + Math.max(row.weight, 0), 0);
  if (totalWeight <= 0) {
    const avg = rows.reduce((sum, row) => sum + row.progressPercent, 0) / rows.length;
    return clampPct(avg);
  }
  const weighted = rows.reduce(
    (sum, row) => sum + row.progressPercent * Math.max(row.weight, 0),
    0
  );
  return clampPct(weighted / totalWeight);
};

const fullName = (profile?: EmployeeProfile | null) => {
  const first = String(profile?.firstName || "").trim();
  const last = String(profile?.lastName || "").trim();
  const name = [first, last].filter(Boolean).join(" ").trim();
  if (name) return name;
  if (profile?.email) return profile.email;
  return profile?.id ? `Profile #${profile.id}` : "Unassigned";
};

const statusBadgeClass = (status: string) => {
  if (status === "met" || status === "exceeded" || status === "on_track") {
    return "bg-emerald-100 text-emerald-700";
  }
  if (status === "behind") return "bg-amber-100 text-amber-700";
  return "bg-rose-100 text-rose-700";
};

const formatPct = (value: number) => `${clampPct(value).toFixed(1)}%`;

const formatValue = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 2 });
const formatDateTime = (value: string | null) => {
  if (!value) return "No updates";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No updates";
  return date.toLocaleString();
};

export default function KpiCascadeTracker({ kpis }: KpiCascadeTrackerProps) {
  const { toast } = useToast();
  const { user, profile, isAdmin, isHR, isGMP, isPartner, isManager, isEmployee } = useAuth();

  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState<AssignmentRecord[]>([]);
  const [profiles, setProfiles] = useState<Map<number, EmployeeProfile>>(new Map());
  const [selectedKpiId, setSelectedKpiId] = useState<string>("");
  const [progressDraftByAssignmentId, setProgressDraftByAssignmentId] = useState<Record<number, string>>({});
  const [updatingAssignmentId, setUpdatingAssignmentId] = useState<number | null>(null);

  const currentProfileId = useMemo(() => {
    const profileId = profile?.id ?? (user as any)?.profileId ?? (user as any)?.profile_id;
    const parsed = Number(profileId);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [profile?.id, user]);

  const canProxyUpdate =
    isAdmin || isHR || isGMP || isPartner || isManager;

  const canViewTracking =
    isAdmin || isHR || isGMP || isPartner || isManager || isEmployee;

  const kpiNameLookup = useMemo(() => {
    const map = new Map<number, string>();
    kpis.forEach((kpi) => map.set(Number(kpi.id), kpi.name));
    return map;
  }, [kpis]);

  const loadTracking = useCallback(async () => {
    if (!canViewTracking) return;
    try {
      setLoading(true);

      const assignmentsEndpoint =
        isEmployee && !canProxyUpdate
          ? "/employee-kpi-assignments/my?includeTracking=true"
          : "/employee-kpi-assignments?includeTracking=true";

      const [assignmentsResponse, employeesResponse] = await Promise.all([
        apiFetch("GET", assignmentsEndpoint),
        apiFetch("GET", "/employees?status=active&page=1&pageSize=500"),
      ]);

      const assignmentRows = extractArray(assignmentsResponse) as AssignmentRecord[];
      const employeeRows = extractArray(employeesResponse) as EmployeeProfile[];

      const map = new Map<number, EmployeeProfile>();
      employeeRows.forEach((employee) => {
        const id = Number(employee?.id);
        if (Number.isFinite(id) && id > 0) {
          map.set(id, employee);
        }
      });

      setAssignments(assignmentRows);
      setProfiles(map);
    } catch (error: any) {
      toast({
        title: "Tracking load failed",
        description: error?.message || "Unable to load KPI tracking data.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [canProxyUpdate, canViewTracking, isEmployee, toast]);

  useEffect(() => {
    loadTracking();
  }, [loadTracking]);

  const assignmentKpiOptions = useMemo(() => {
    const seen = new Set<number>();
    const options: Array<{ id: number; name: string }> = [];

    assignments.forEach((assignment) => {
      const kpiId = Number(assignment.kpiId);
      if (!Number.isFinite(kpiId) || seen.has(kpiId)) return;
      seen.add(kpiId);
      options.push({
        id: kpiId,
        name: assignment.kpi?.name || kpiNameLookup.get(kpiId) || `KPI #${kpiId}`,
      });
    });

    if (!options.length) {
      kpis.forEach((kpi) => {
        const kpiId = Number(kpi.id);
        if (!Number.isFinite(kpiId) || seen.has(kpiId)) return;
        seen.add(kpiId);
        options.push({ id: kpiId, name: kpi.name });
      });
    }

    return options.sort((a, b) => a.name.localeCompare(b.name));
  }, [assignments, kpis, kpiNameLookup]);

  useEffect(() => {
    if (selectedKpiId) return;
    if (!assignmentKpiOptions.length) return;
    setSelectedKpiId(String(assignmentKpiOptions[0].id));
  }, [assignmentKpiOptions, selectedKpiId]);

  const selectedAssignments = useMemo(() => {
    const selectedId = Number(selectedKpiId);
    if (!Number.isFinite(selectedId) || selectedId <= 0) return [];
    return assignments.filter((assignment) => Number(assignment.kpiId) === selectedId);
  }, [assignments, selectedKpiId]);

  const rows = useMemo<RowView[]>(() => {
    return selectedAssignments.map((assignment) => {
      const employee =
        assignment.employee || profiles.get(Number(assignment.employeeProfileId)) || null;
      const managerId =
        employee?.managerId !== undefined && employee?.managerId !== null
          ? Number(employee.managerId)
          : null;
      const manager = managerId ? profiles.get(managerId) || null : null;

      let partnerId: number | null = null;
      if (employee?.isPartner) {
        partnerId = Number(employee.id);
      } else if (manager?.isPartner) {
        partnerId = Number(manager.id);
      } else if (manager?.managerId) {
        const managerManager = profiles.get(Number(manager.managerId)) || null;
        if (managerManager?.isPartner) {
          partnerId = Number(managerManager.id);
        }
      }
      const partner = partnerId ? profiles.get(partnerId) || null : null;

      const targetValue = parseNumber(
        assignment.targetValue ?? assignment.kpi?.targetValue ?? 0,
        0
      );
      const actualValue = parseNumber(
        assignment.tracking?.resolvedAchievedValue ?? assignment.achievedValue ?? 0,
        0
      );
      const fallbackProgress =
        targetValue > 0 ? clampPct((actualValue / targetValue) * 100) : 0;
      const progressPercent = clampPct(
        parseNumber(assignment.tracking?.progressPercent, fallbackProgress)
      );
      const weight = parseNumber(assignment.weight ?? assignment.kpi?.weight ?? 1, 1);

      const statusLabel =
        String(assignment.tracking?.achievement?.status || assignment.status || "not_started")
          .replaceAll("_", " ")
          .toLowerCase();

      return {
        assignmentId: Number(assignment.id),
        employeeProfileId: Number(assignment.employeeProfileId),
        employeeName: fullName(employee),
        departmentName: employee?.department?.name || "Unassigned",
        managerName: fullName(manager),
        partnerName: fullName(partner),
        targetValue,
        actualValue,
        progressPercent,
        weight,
        statusLabel,
        asOf: assignment.tracking?.achievement?.asOf || null,
        departmentId:
          employee?.departmentId !== undefined && employee?.departmentId !== null
            ? Number(employee.departmentId)
            : null,
        managerId,
        partnerId,
      };
    });
  }, [profiles, selectedAssignments]);

  const rollups = useMemo(() => {
    const byDepartment = new Map<number, RowView[]>();
    const byManager = new Map<number, RowView[]>();
    const byPartner = new Map<number, RowView[]>();

    rows.forEach((row) => {
      if (row.departmentId) {
        if (!byDepartment.has(row.departmentId)) byDepartment.set(row.departmentId, []);
        byDepartment.get(row.departmentId)!.push(row);
      }
      if (row.managerId) {
        if (!byManager.has(row.managerId)) byManager.set(row.managerId, []);
        byManager.get(row.managerId)!.push(row);
      }
      if (row.partnerId) {
        if (!byPartner.has(row.partnerId)) byPartner.set(row.partnerId, []);
        byPartner.get(row.partnerId)!.push(row);
      }
    });

    const toSummary = (bucket: Map<number, RowView[]>): RollupSummary => {
      if (!bucket.size) return { count: 0, weightedProgress: 0 };
      const values = Array.from(bucket.values()).map((group) => weightedAverage(group));
      const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
      return { count: bucket.size, weightedProgress: clampPct(avg) };
    };

    return {
      employee: { count: rows.length, weightedProgress: weightedAverage(rows) },
      department: toSummary(byDepartment),
      manager: toSummary(byManager),
      partner: toSummary(byPartner),
      firm: { count: rows.length, weightedProgress: weightedAverage(rows) },
    };
  }, [rows]);

  const updateProgress = async (row: RowView) => {
    const valueRaw = String(progressDraftByAssignmentId[row.assignmentId] || "").trim();
    const value = Number(valueRaw);
    if (!Number.isFinite(value)) {
      toast({
        title: "Invalid progress value",
        description: "Enter a numeric value before updating progress.",
        variant: "destructive",
      });
      return;
    }

    try {
      setUpdatingAssignmentId(row.assignmentId);
      const response = await apiFetch("POST", `/employee-kpi-assignments/${row.assignmentId}/progress`, {
        value,
      });
      const updated = (response?.data || response) as AssignmentRecord;
      setAssignments((prev) =>
        prev.map((assignment) => (assignment.id === row.assignmentId ? updated : assignment))
      );
      setProgressDraftByAssignmentId((prev) => ({
        ...prev,
        [row.assignmentId]: "",
      }));
      toast({
        title: "Progress updated",
        description: `${row.employeeName}'s KPI progress was saved.`,
      });
    } catch (error: any) {
      toast({
        title: "Progress update failed",
        description: error?.message || "Unable to save KPI progress.",
        variant: "destructive",
      });
    } finally {
      setUpdatingAssignmentId(null);
    }
  };

  if (!canViewTracking) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cascade Tracking</CardTitle>
        <CardDescription>
          Track KPI progress from employee level up to department, manager, partner, and firm.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="space-y-2 md:col-span-2">
            <Label>Tracked KPI</Label>
            <Select value={selectedKpiId || undefined} onValueChange={setSelectedKpiId}>
              <SelectTrigger>
                <SelectValue placeholder="Select KPI to track" />
              </SelectTrigger>
              <SelectContent>
                {assignmentKpiOptions.map((option) => (
                  <SelectItem key={option.id} value={String(option.id)}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button variant="outline" className="w-full" onClick={loadTracking}>
              Refresh Tracking
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
            Loading KPI tracking...
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
            No assignment tracking rows found for the selected KPI yet.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
              <Card>
                <CardContent className="pt-4">
                  <div className="text-xs text-muted-foreground">Employee</div>
                  <div className="text-2xl font-semibold">{formatPct(rollups.employee.weightedProgress)}</div>
                  <Progress value={rollups.employee.weightedProgress} className="mt-2 h-2" />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-xs text-muted-foreground">Department</div>
                  <div className="text-2xl font-semibold">{formatPct(rollups.department.weightedProgress)}</div>
                  <Progress value={rollups.department.weightedProgress} className="mt-2 h-2" />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-xs text-muted-foreground">Manager</div>
                  <div className="text-2xl font-semibold">{formatPct(rollups.manager.weightedProgress)}</div>
                  <Progress value={rollups.manager.weightedProgress} className="mt-2 h-2" />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-xs text-muted-foreground">Partner</div>
                  <div className="text-2xl font-semibold">{formatPct(rollups.partner.weightedProgress)}</div>
                  <Progress value={rollups.partner.weightedProgress} className="mt-2 h-2" />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-xs text-muted-foreground">Firm</div>
                  <div className="text-2xl font-semibold">{formatPct(rollups.firm.weightedProgress)}</div>
                  <Progress value={rollups.firm.weightedProgress} className="mt-2 h-2" />
                </CardContent>
              </Card>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Manager</TableHead>
                  <TableHead>Partner</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Actual</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Updated</TableHead>
                  <TableHead className="text-right">Update</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const canUpdateRow = canProxyUpdate || currentProfileId === row.employeeProfileId;
                  return (
                    <TableRow key={row.assignmentId}>
                      <TableCell className="align-top">
                        <div className="font-medium">{row.employeeName}</div>
                      </TableCell>
                      <TableCell className="align-top">{row.departmentName}</TableCell>
                      <TableCell className="align-top">{row.managerName}</TableCell>
                      <TableCell className="align-top">{row.partnerName}</TableCell>
                      <TableCell className="align-top">{formatValue(row.targetValue)}</TableCell>
                      <TableCell className="align-top">{formatValue(row.actualValue)}</TableCell>
                      <TableCell className="align-top min-w-[180px]">
                        <div className="space-y-1">
                          <div className="text-sm font-medium">{formatPct(row.progressPercent)}</div>
                          <Progress value={row.progressPercent} className="h-2" />
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        <Badge className={statusBadgeClass(row.statusLabel)}>
                          {row.statusLabel.replaceAll("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="align-top text-xs text-muted-foreground">
                        {formatDateTime(row.asOf)}
                      </TableCell>
                      <TableCell className="align-top text-right">
                        {canUpdateRow ? (
                          <div className="flex items-center justify-end gap-2">
                            <Input
                              type="number"
                              value={progressDraftByAssignmentId[row.assignmentId] ?? ""}
                              onChange={(event) =>
                                setProgressDraftByAssignmentId((prev) => ({
                                  ...prev,
                                  [row.assignmentId]: event.target.value,
                                }))
                              }
                              placeholder={String(row.actualValue)}
                              className="h-8 w-24"
                            />
                            <Button
                              size="sm"
                              onClick={() => updateProgress(row)}
                              disabled={updatingAssignmentId === row.assignmentId}
                            >
                              Save
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Read only</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
}
