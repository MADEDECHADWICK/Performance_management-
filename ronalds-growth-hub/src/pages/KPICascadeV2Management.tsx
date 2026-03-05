import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { departmentsAPI, kpiCascadeV2API } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const bscOptions = ["financial", "customer", "internal_process", "learning_growth"];
const addDays = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};
const pick = <T = any>(row: any, ...keys: string[]): T | undefined => {
  for (const key of keys) {
    if (row && row[key] !== undefined && row[key] !== null) return row[key] as T;
  }
  return undefined;
};
const toInt = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const extractRows = (payload: any) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  return [];
};

export default function KPICascadeV2Management() {
  const { toast } = useToast();
  const { profile, user, isHR, isAdmin, isGMP, isPartner, isManager, isMarketing, isFinance, isEmployee } = useAuth();

  const currentProfileId = useMemo(() => {
    const id = Number(profile?.id ?? (user as any)?.profileId ?? (user as any)?.profile_id);
    return Number.isFinite(id) && id > 0 ? id : null;
  }, [profile?.id, user]);
  const canUsePartnerFlow = isPartner || isGMP || isAdmin;
  const canUseManagerFlow = isManager || isMarketing || isFinance || isAdmin;

  const [busy, setBusy] = useState(false);
  const [cycles, setCycles] = useState<any[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState<string>("");
  const [activeTab, setActiveTab] = useState("hr");
  const [details, setDetails] = useState<any>(null);
  const [myKpis, setMyKpis] = useState<any[]>([]);
  const [managerScope, setManagerScope] = useState<{
    profileId: number;
    departmentId: number | null;
    partnerProfileId: number | null;
    hasPartnerAssignment: boolean;
    roleType: string;
  } | null>(null);
  const [departmentNameById, setDepartmentNameById] = useState<Record<number, string>>({});
  const hrEditorRef = useRef<HTMLDivElement | null>(null);
  const goalInputRef = useRef<HTMLInputElement | null>(null);

  const [hr, setHr] = useState({
    cycleName: "", cadence: "quarterly", startAt: new Date().toISOString().slice(0, 10), endAt: addDays(90),
    bscTag: "financial", goal: "", metric: "", firm: "", baseline: "0", target: "100", weight: "100", dueDate: addDays(90), freq: "weekly"
  });

  const [partner, setPartner] = useState({ parentId: "", initiativesText: "", bscTag: "financial", baseline: "0", target: "100", weight: "100", dueDate: addDays(60) });
  const [manager, setManager] = useState({ bscTag: "financial", baseline: "0", target: "100", weight: "100", dueDate: addDays(45), departmentId: String(profile?.departmentId || "") });
  const [managerInitiativesByParent, setManagerInitiativesByParent] = useState<Record<string, string>>({});
  const [updates, setUpdates] = useState<Record<number, { actual: string; comment: string }>>({});
  const [gmpRejectNotes, setGmpRejectNotes] = useState<Record<number, string>>({});
  const [selectedKpiForEdit, setSelectedKpiForEdit] = useState<string>("");
  const [editingSeed, setEditingSeed] = useState<{
    goalId: number;
    metricId: number;
    firmInitiativeId: number;
    cycleVersionId: number;
  } | null>(null);

  const load = useCallback(async () => {
    const [scopePayload, cyclesRows, departmentsPayload] = await Promise.all([
      kpiCascadeV2API.getMyScope().catch(() => null),
      kpiCascadeV2API.listCycles().catch(() => []),
      (isHR || isAdmin || isGMP) ? departmentsAPI.list({ page: 1, pageSize: 300 }).catch(() => null) : Promise.resolve(null),
    ]);
    setManagerScope(scopePayload || null);
    const rows = Array.isArray(cyclesRows) ? cyclesRows : [];
    setCycles(rows);
    if (departmentsPayload) {
      const nextMap: Record<number, string> = {};
      for (const row of extractRows(departmentsPayload)) {
        const id = toInt(row?.id);
        const name = String(row?.name || row?.departmentName || "").trim();
        if (id && name) nextMap[id] = name;
      }
      setDepartmentNameById(nextMap);
    }
    const cycleId = selectedCycleId || (rows[0] ? String(rows[0].id) : "");
    if (cycleId) {
      setSelectedCycleId(cycleId);
      const cycleDetails = await kpiCascadeV2API.getCycle(Number(cycleId)).catch(() => null);
      setDetails(cycleDetails);
    }
    if (currentProfileId) {
      const mine = await kpiCascadeV2API.getEmployeeKpis(currentProfileId).catch(() => []);
      setMyKpis(Array.isArray(mine) ? mine : []);
    }
  }, [currentProfileId, isAdmin, isGMP, isHR, selectedCycleId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!manager.departmentId && profile?.departmentId) {
      setManager((prev) => ({ ...prev, departmentId: String(profile.departmentId) }));
    }
  }, [manager.departmentId, profile?.departmentId]);
  useEffect(() => {
    if (!manager.departmentId && managerScope?.departmentId) {
      setManager((prev) => ({ ...prev, departmentId: String(managerScope.departmentId) }));
    }
  }, [manager.departmentId, managerScope?.departmentId]);
  useEffect(() => {
    setEditingSeed(null);
    setSelectedKpiForEdit("");
    setGmpRejectNotes({});
    setManagerInitiativesByParent({});
  }, [selectedCycleId]);

  const versions = Array.isArray(details?.versions) ? details.versions : [];
  const allGoals = Array.isArray(details?.goals) ? details.goals : [];
  const allMetrics = Array.isArray(details?.metrics) ? details.metrics : [];
  const allInitiatives = Array.isArray(details?.initiatives) ? details.initiatives : [];

  const versionStats = useMemo(() => {
    const goalCountByVersion = new Map<number, number>();
    const goalToVersion = new Map<number, number>();
    for (const goal of allGoals) {
      const versionId = Number(pick(goal, "cycleVersionId", "cycle_version_id"));
      const goalId = Number(goal.id);
      if (!Number.isFinite(versionId) || !Number.isFinite(goalId)) continue;
      goalToVersion.set(goalId, versionId);
      goalCountByVersion.set(versionId, (goalCountByVersion.get(versionId) || 0) + 1);
    }

    const metricCountByVersion = new Map<number, number>();
    const metricToVersion = new Map<number, number>();
    for (const metric of allMetrics) {
      const goalId = Number(pick(metric, "goalId", "goal_id"));
      const metricId = Number(metric.id);
      const versionId = goalToVersion.get(goalId);
      if (!Number.isFinite(metricId) || !Number.isFinite(versionId)) continue;
      metricToVersion.set(metricId, Number(versionId));
      metricCountByVersion.set(Number(versionId), (metricCountByVersion.get(Number(versionId)) || 0) + 1);
    }

    const initiativeCountByVersion = new Map<number, number>();
    for (const initiative of allInitiatives) {
      const metricId = Number(pick(initiative, "metricId", "metric_id"));
      const versionId = metricToVersion.get(metricId);
      if (!Number.isFinite(versionId)) continue;
      initiativeCountByVersion.set(Number(versionId), (initiativeCountByVersion.get(Number(versionId)) || 0) + 1);
    }

    const rows = versions.map((version: any) => {
      const versionId = Number(version.id);
      const goals = goalCountByVersion.get(versionId) || 0;
      const metrics = metricCountByVersion.get(versionId) || 0;
      const initiatives = initiativeCountByVersion.get(versionId) || 0;
      return {
        ...version,
        id: versionId,
        goals,
        metrics,
        initiatives,
        total: goals + metrics + initiatives,
      };
    });
    rows.sort((a: any, b: any) => Number(pick(b, "versionNo", "version_no") || 0) - Number(pick(a, "versionNo", "version_no") || 0));
    return rows;
  }, [versions, allGoals, allMetrics, allInitiatives]);

  const preferredVersionId = useMemo(() => {
    const ordered = [...versionStats].sort(
      (a: any, b: any) => Number(pick(b, "versionNo", "version_no") || 0) - Number(pick(a, "versionNo", "version_no") || 0)
    );
    const withData = ordered.find((version: any) => Number(version.total || 0) > 0);
    if (withData) return String(withData.id);
    const first = ordered[0];
    return first ? String(first.id) : "";
  }, [versionStats]);
  const activeVersionId = useMemo(() => {
    const id = Number(preferredVersionId || 0);
    return Number.isFinite(id) && id > 0 ? id : null;
  }, [preferredVersionId]);

  const goals = activeVersionId
    ? allGoals.filter((goal: any) => Number(pick(goal, "cycleVersionId", "cycle_version_id")) === activeVersionId)
    : allGoals;
  const goalIds = new Set(goals.map((goal: any) => Number(goal.id)).filter((id: number) => Number.isFinite(id)));

  const metrics = allMetrics.filter((metric: any) => goalIds.has(Number(pick(metric, "goalId", "goal_id"))));
  const metricIds = new Set(metrics.map((metric: any) => Number(metric.id)).filter((id: number) => Number.isFinite(id)));

  const initiatives = allInitiatives.filter((initiative: any) => metricIds.has(Number(pick(initiative, "metricId", "metric_id"))));

  const firm = initiatives.filter((x: any) => x.level === "firm");
  const team = initiatives.filter((x: any) => x.level === "team");
  const firmStates = useMemo(
    () => firm.map((item: any) => String(item.state || "").toLowerCase()),
    [firm]
  );
  const hasPendingFirmApprovals = useMemo(
    () => firmStates.some((state) => ["draft", "submitted", "in_review", "rejected"].includes(state)),
    [firmStates]
  );
  const hasApprovedFirmForActivation = useMemo(
    () => firmStates.some((state) => ["approved", "active", "completed"].includes(state)),
    [firmStates]
  );
  const cycleState = String(details?.cycle?.state || "").toLowerCase();
  const availableTabs = useMemo(() => {
    const tabs: Array<{ id: string; label: string }> = [];
    if (isHR || isAdmin) tabs.push({ id: "hr", label: "HR/Admin" });
    if (isGMP || isAdmin) tabs.push({ id: "gmp", label: "GMP" });
    if (canUsePartnerFlow) tabs.push({ id: "partner", label: (isGMP && !isPartner) ? "GMP Partner" : "Partner" });
    if (canUseManagerFlow) {
      tabs.push({ id: "manager", label: isFinance ? "Finance" : isMarketing ? "Marketing" : "Manager" });
    }
    if (isEmployee || isAdmin) tabs.push({ id: "employee", label: "Employee" });
    if (tabs.length === 0) tabs.push({ id: "employee", label: "Employee" });
    return tabs;
  }, [canUseManagerFlow, canUsePartnerFlow, isAdmin, isEmployee, isFinance, isGMP, isHR, isMarketing, isPartner]);

  const initiativeById = useMemo(() => {
    const map = new Map<number, any>();
    for (const row of initiatives) {
      const id = toInt(row.id);
      if (id) map.set(id, row);
    }
    return map;
  }, [initiatives]);
  const childrenByParent = useMemo(() => {
    const map = new Map<number, number[]>();
    for (const row of initiatives) {
      const childId = toInt(row.id);
      const parentId = toInt(pick(row, "parentInitiativeId", "parent_initiative_id"));
      if (!childId || !parentId) continue;
      const existing = map.get(parentId) || [];
      existing.push(childId);
      map.set(parentId, existing);
    }
    return map;
  }, [initiatives]);
  const managerScopePartnerId = toInt(managerScope?.partnerProfileId);
  const managerScopeDepartmentId = toInt(managerScope?.departmentId) || toInt(manager.departmentId);
  const visibleInitiativeIds = useMemo(() => {
    const allIds = new Set(
      initiatives
        .map((row: any) => toInt(row.id))
        .filter((id): id is number => Boolean(id))
    );
    if (isAdmin || isHR || isGMP) return allIds;
    if (!currentProfileId) return new Set<number>();

    const seed = new Set<number>();
    for (const row of initiatives) {
      const id = toInt(row.id);
      const level = String(row.level || "");
      const ownerId = toInt(pick(row, "ownerProfileId", "owner_profile_id"));
      const partnerId = toInt(pick(row, "partnerProfileId", "partner_profile_id"));
      const managerId = toInt(pick(row, "managerProfileId", "manager_profile_id"));
      const employeeId = toInt(pick(row, "employeeProfileId", "employee_profile_id"));
      const departmentId = toInt(pick(row, "departmentId", "department_id"));
      if (!id) continue;

      if (isPartner && level === "team" && (partnerId === currentProfileId || ownerId === currentProfileId)) {
        seed.add(id);
      }
      if (canUseManagerFlow) {
        if (level === "department" && (managerId === currentProfileId || ownerId === currentProfileId)) seed.add(id);
        if (
          level === "employee" &&
          (managerId === currentProfileId ||
            ownerId === currentProfileId ||
            employeeId === currentProfileId ||
            (managerScopeDepartmentId ? departmentId === managerScopeDepartmentId : false))
        ) {
          seed.add(id);
        }
        if (level === "team" && managerScopePartnerId && partnerId === managerScopePartnerId) seed.add(id);
      }
      if (isEmployee && level === "employee" && (employeeId === currentProfileId || ownerId === currentProfileId)) {
        seed.add(id);
      }
    }

    const visible = new Set<number>(seed);
    const queue: number[] = Array.from(seed);
    while (queue.length > 0) {
      const parentId = queue.shift() as number;
      const children = childrenByParent.get(parentId) || [];
      for (const childId of children) {
        if (visible.has(childId)) continue;
        visible.add(childId);
        queue.push(childId);
      }
    }
    for (const id of Array.from(visible)) {
      let current = initiativeById.get(id);
      while (current) {
        const parentId = toInt(pick(current, "parentInitiativeId", "parent_initiative_id"));
        if (!parentId) break;
        if (visible.has(parentId)) {
          current = initiativeById.get(parentId);
          continue;
        }
        visible.add(parentId);
        current = initiativeById.get(parentId);
      }
    }
    return visible;
  }, [
    canUseManagerFlow,
    childrenByParent,
    currentProfileId,
    initiativeById,
    initiatives,
    isAdmin,
    isEmployee,
    isGMP,
    isHR,
    isPartner,
    managerScopeDepartmentId,
    managerScopePartnerId,
  ]);
  const visibleInitiatives = useMemo(() => {
    if (isAdmin || isHR || isGMP) return initiatives;
    return initiatives.filter((row: any) => visibleInitiativeIds.has(Number(row.id)));
  }, [initiatives, isAdmin, isGMP, isHR, visibleInitiativeIds]);
  const visibleMetricIds = useMemo(
    () =>
      new Set(
        visibleInitiatives
          .map((row: any) => toInt(pick(row, "metricId", "metric_id")))
          .filter((id): id is number => Boolean(id))
      ),
    [visibleInitiatives]
  );
  const visibleMetrics = useMemo(
    () => (isAdmin || isHR || isGMP ? metrics : metrics.filter((row: any) => visibleMetricIds.has(Number(row.id)))),
    [isAdmin, isGMP, isHR, metrics, visibleMetricIds]
  );
  const visibleGoalIds = useMemo(
    () =>
      new Set(
        visibleMetrics
          .map((row: any) => toInt(pick(row, "goalId", "goal_id")))
          .filter((id): id is number => Boolean(id))
      ),
    [visibleMetrics]
  );
  const visibleGoals = useMemo(
    () => (isAdmin || isHR || isGMP ? goals : goals.filter((row: any) => visibleGoalIds.has(Number(row.id)))),
    [goals, isAdmin, isGMP, isHR, visibleGoalIds]
  );
  useEffect(() => {
    if (availableTabs.some((tab) => tab.id === activeTab)) return;
    setActiveTab(availableTabs[0]?.id || "employee");
  }, [activeTab, availableTabs]);

  const metricsByGoal = useMemo(() => {
    const map = new Map<number, any[]>();
    for (const metric of visibleMetrics) {
      const goalId = Number(pick(metric, "goalId", "goal_id"));
      if (!Number.isFinite(goalId)) continue;
      const existing = map.get(goalId) || [];
      existing.push(metric);
      map.set(goalId, existing);
    }
    return map;
  }, [visibleMetrics]);

  const initiativesByMetric = useMemo(() => {
    const map = new Map<number, any[]>();
    for (const initiative of visibleInitiatives) {
      const metricId = Number(pick(initiative, "metricId", "metric_id"));
      if (!Number.isFinite(metricId)) continue;
      const existing = map.get(metricId) || [];
      existing.push(initiative);
      map.set(metricId, existing);
    }
    return map;
  }, [visibleInitiatives]);
  const kpiEditOptions = useMemo(() => {
    const metricById = new Map<number, any>();
    for (const metric of metrics) metricById.set(Number(metric.id), metric);
    const goalById = new Map<number, any>();
    for (const goal of goals) goalById.set(Number(goal.id), goal);
    return firm.map((firmInitiative: any) => {
      const metric = metricById.get(Number(pick(firmInitiative, "metricId", "metric_id")));
      const goal = metric ? goalById.get(Number(pick(metric, "goalId", "goal_id"))) : null;
      return {
        id: Number(firmInitiative.id),
        label: String(firmInitiative.title || `KPI ${firmInitiative.id}`),
        goal,
        metric,
        firmInitiative,
      };
    });
  }, [firm, goals, metrics]);

  const formatState = (value: unknown) => String(value || "draft").replace(/_/g, " ");
  const normalizedState = (value: unknown) => String(value || "").toLowerCase();

  const partnerFirmOptions = useMemo(
    () => firm.filter((item: any) => ["approved", "active"].includes(normalizedState(item.state))),
    [firm]
  );
  const partnerActiveFirmOptions = useMemo(
    () => partnerFirmOptions.filter((item: any) => normalizedState(item.state) === "active"),
    [partnerFirmOptions]
  );
  const selectedPartnerParent = useMemo(
    () => partnerFirmOptions.find((item: any) => String(item.id) === String(partner.parentId)) || null,
    [partner.parentId, partnerFirmOptions]
  );
  const selectedPartnerParentState = normalizedState(selectedPartnerParent?.state);
  const partnerAwaitingCycleActivation = useMemo(
    () =>
      partnerFirmOptions.some((item: any) => normalizedState(item.state) === "approved") &&
      partnerActiveFirmOptions.length === 0,
    [partnerActiveFirmOptions.length, partnerFirmOptions]
  );
  const managerTeamOptions = useMemo(() => {
    const ready = team.filter((item: any) => ["submitted", "in_review", "approved", "active"].includes(normalizedState(item.state)));
    if (isAdmin || isHR) return ready;
    if (!canUseManagerFlow) return [];
    if (managerScopePartnerId) {
      return ready.filter((item: any) => {
        const partnerId = toInt(pick(item, "partnerProfileId", "partner_profile_id", "ownerProfileId", "owner_profile_id"));
        return partnerId === managerScopePartnerId;
      });
    }
    // Shared-service departments (e.g. Finance/Marketing) can contribute without a fixed partner assignment.
    if (isFinance || isMarketing) return ready;
    return [];
  }, [canUseManagerFlow, isAdmin, isFinance, isHR, isMarketing, managerScopePartnerId, team]);
  const managerDeptInitiativeRows = useMemo(() => {
    const departmentRows = initiatives.filter((item: any) => {
      if (String(item.level) !== "department") return false;
      if (String(item.state || "").toLowerCase() === "archived") return false;
      return true;
    });
    if (isAdmin || isHR) return departmentRows;
    if (!canUseManagerFlow) return [];
    return departmentRows.filter((item: any) => {
      const ownerId = toInt(pick(item, "managerProfileId", "manager_profile_id", "ownerProfileId", "owner_profile_id"));
      const departmentId = toInt(pick(item, "departmentId", "department_id"));
      if (currentProfileId && ownerId === currentProfileId) return true;
      if (managerScopeDepartmentId && departmentId === managerScopeDepartmentId) return true;
      return false;
    });
  }, [canUseManagerFlow, currentProfileId, initiatives, isAdmin, isHR, managerScopeDepartmentId]);
  const deptCountByTeamParent = useMemo(() => {
    const counts = new Map<number, number>();
    for (const item of managerDeptInitiativeRows) {
      const parentId = Number(pick(item, "parentInitiativeId", "parent_initiative_id"));
      if (!Number.isFinite(parentId)) continue;
      counts.set(parentId, (counts.get(parentId) || 0) + 1);
    }
    return counts;
  }, [managerDeptInitiativeRows]);
  const deptInitiativesByParent = useMemo(() => {
    const map = new Map<number, Array<any>>();
    for (const item of managerDeptInitiativeRows) {
      const parentId = Number(pick(item, "parentInitiativeId", "parent_initiative_id"));
      if (!Number.isFinite(parentId)) continue;
      const existing = map.get(parentId) || [];
      existing.push(item);
      map.set(parentId, existing);
    }
    for (const [parentId, rows] of map.entries()) {
      rows.sort((a: any, b: any) => Number(a.id || 0) - Number(b.id || 0));
      map.set(parentId, rows);
    }
    return map;
  }, [managerDeptInitiativeRows]);
  const managerCoverage = useMemo(() => {
    const total = managerTeamOptions.length;
    let covered = 0;
    for (const parent of managerTeamOptions) {
      if ((deptCountByTeamParent.get(Number(parent.id)) || 0) > 0) covered += 1;
    }
    return {
      total,
      covered,
      missing: Math.max(total - covered, 0),
    };
  }, [deptCountByTeamParent, managerTeamOptions]);
  const approvedDeptInitiatives = useMemo(
    () =>
      managerDeptInitiativeRows.filter(
        (item: any) => ["approved", "active"].includes(String(item.state || "").toLowerCase())
      ),
    [managerDeptInitiativeRows]
  );
  const financeDepartmentIds = useMemo(() => {
    const ids = new Set<number>();
    for (const [rawId, rawName] of Object.entries(departmentNameById)) {
      const id = Number(rawId);
      const name = String(rawName || "").toLowerCase();
      if (!Number.isFinite(id)) continue;
      if (name.includes("finance") || name.includes("accounts")) ids.add(id);
    }
    return ids;
  }, [departmentNameById]);
  const marketingDepartmentIds = useMemo(() => {
    const ids = new Set<number>();
    for (const [rawId, rawName] of Object.entries(departmentNameById)) {
      const id = Number(rawId);
      const name = String(rawName || "").toLowerCase();
      if (!Number.isFinite(id)) continue;
      if (name.includes("marketing") || name.includes("business development")) ids.add(id);
    }
    return ids;
  }, [departmentNameById]);
  const trackingSummary = useMemo(() => {
    const scoped = (isAdmin || isHR || isGMP) ? initiatives : visibleInitiatives;
    const pct = (row: any) => {
      const value = Number(pick(row, "percentComplete", "percent_complete") ?? 0);
      return Number.isFinite(value) ? value : 0;
    };
    const avg = (rows: any[]) => {
      if (!rows.length) return 0;
      return rows.reduce((sum, row) => sum + pct(row), 0) / rows.length;
    };
    const atLevel = (level: string) => scoped.filter((row: any) => String(row.level) === level);
    const firmRows = atLevel("firm");
    const teamRows = atLevel("team");
    const deptRows = atLevel("department");
    const employeeRows = atLevel("employee");
    const financeRows = deptRows.filter((row: any) =>
      financeDepartmentIds.has(Number(pick(row, "departmentId", "department_id")))
    );
    const marketingRows = deptRows.filter((row: any) =>
      marketingDepartmentIds.has(Number(pick(row, "departmentId", "department_id")))
    );
    const mineRows = !currentProfileId
      ? []
      : scoped.filter((row: any) => {
          const ownerId = toInt(pick(row, "ownerProfileId", "owner_profile_id"));
          const partnerId = toInt(pick(row, "partnerProfileId", "partner_profile_id"));
          const managerId = toInt(pick(row, "managerProfileId", "manager_profile_id"));
          const employeeId = toInt(pick(row, "employeeProfileId", "employee_profile_id"));
          return ownerId === currentProfileId || partnerId === currentProfileId || managerId === currentProfileId || employeeId === currentProfileId;
        });

    return {
      firm: { count: firmRows.length, pct: avg(firmRows) },
      partners: { count: teamRows.length, pct: avg(teamRows) },
      departments: { count: deptRows.length, pct: avg(deptRows) },
      finance: { count: financeRows.length, pct: avg(financeRows) },
      marketing: { count: marketingRows.length, pct: avg(marketingRows) },
      employees: { count: employeeRows.length, pct: avg(employeeRows) },
      mine: { count: mineRows.length, pct: avg(mineRows) },
    };
  }, [currentProfileId, financeDepartmentIds, initiatives, isAdmin, isGMP, isHR, marketingDepartmentIds, visibleInitiatives]);

  const countFirmCascade = (firmInitiativeId: number) => {
    const teamItems = visibleInitiatives.filter(
      (item: any) => item.level === "team" && Number(pick(item, "parentInitiativeId", "parent_initiative_id")) === firmInitiativeId
    );
    const teamIds = new Set(teamItems.map((item: any) => Number(item.id)));

    const departmentItems = visibleInitiatives.filter(
      (item: any) => item.level === "department" && teamIds.has(Number(pick(item, "parentInitiativeId", "parent_initiative_id")))
    );
    const departmentIds = new Set(departmentItems.map((item: any) => Number(item.id)));

    const employeeItems = visibleInitiatives.filter(
      (item: any) => item.level === "employee" && departmentIds.has(Number(pick(item, "parentInitiativeId", "parent_initiative_id")))
    );

    return {
      teams: teamItems.length,
      departments: departmentItems.length,
      employees: employeeItems.length,
    };
  };

  const num = (v: string, fallback = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  const normalizeText = (value: string) => String(value || "").trim().toLowerCase();
  const splitInitiativeNames = (value: string) => {
    const parts = String(value || "")
      .split(/\r?\n|[,;]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    return Array.from(new Set(parts));
  };
  const hasManagerDraftInputs = useMemo(
    () =>
      managerTeamOptions.some(
        (parent: any) => splitInitiativeNames(managerInitiativesByParent[String(parent.id)] || "").length > 0
      ),
    [managerInitiativesByParent, managerTeamOptions]
  );
  const toDateInput = (value: unknown, fallback: string) => {
    if (!value) return fallback;
    const d = new Date(String(value));
    if (Number.isNaN(d.getTime())) return fallback;
    return d.toISOString().slice(0, 10);
  };

  const beginSeedEdit = (goal: any, metric: any, firmInitiative: any) => {
    const goalDue = pick(goal, "dueDate", "due_date");
    const metricDue = pick(metric, "dueDate", "due_date");
    const initiativeDue = pick(firmInitiative, "dueDate", "due_date");
    const dueDate = toDateInput(initiativeDue || metricDue || goalDue, hr.dueDate);

    setEditingSeed({
      goalId: Number(goal.id),
      metricId: Number(metric.id),
      firmInitiativeId: Number(firmInitiative.id),
      cycleVersionId: Number(pick(goal, "cycleVersionId", "cycle_version_id")),
    });
    setSelectedKpiForEdit(String(firmInitiative.id));

    setHr((prev) => ({
      ...prev,
      goal: String(goal.title || ""),
      metric: String(metric.name || ""),
      firm: String(firmInitiative.title || ""),
      bscTag: String(pick(firmInitiative, "bscTag", "bsc_tag") || pick(metric, "bscTag", "bsc_tag") || pick(goal, "bscTag", "bsc_tag") || prev.bscTag),
      baseline: String(firmInitiative.baseline ?? metric.baseline ?? goal.baseline ?? 0),
      target: String(firmInitiative.target ?? metric.target ?? goal.target ?? 0),
      weight: String(firmInitiative.weight ?? metric.weight ?? goal.weight ?? 100),
      dueDate,
      freq: String(pick(firmInitiative, "updateFrequency", "update_frequency") || pick(metric, "updateFrequency", "update_frequency") || prev.freq || "weekly"),
    }));
    setActiveTab("hr");
    setTimeout(() => {
      hrEditorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      goalInputRef.current?.focus();
    }, 50);
    toast({
      title: "Edit mode enabled",
      description: "Update the Step 1 fields, then click Update KPI.",
    });
  };

  const createSeed = async () => {
    if (!currentProfileId) return;
    setBusy(true);
    try {
      const selectedExistingCycleId = Number(selectedCycleId || 0);
      const hasSelectedExistingCycle = Number.isFinite(selectedExistingCycleId) && selectedExistingCycleId > 0;
      let targetCycleId = selectedExistingCycleId;

      if (!hasSelectedExistingCycle) {
        if (!hr.cycleName.trim()) {
          toast({ title: "Cycle name required", description: "Provide a cycle name or select an existing cycle.", variant: "destructive" });
          return;
        }
        const cycle = await kpiCascadeV2API.createCycle({
          name: hr.cycleName,
          cadence: hr.cadence,
          startAt: `${hr.startAt}T00:00:00.000Z`,
          endAt: `${hr.endAt}T23:59:59.999Z`
        });
        targetCycleId = Number(cycle.id);
      }

      const firmInitiativeNames = editingSeed ? [String(hr.firm || "").trim()].filter(Boolean) : splitInitiativeNames(hr.firm);
      if (!hr.goal.trim() || !hr.metric.trim() || firmInitiativeNames.length === 0) {
        toast({ title: "Missing fields", description: "Goal, Metric and at least one Firm Initiative are required.", variant: "destructive" });
        return;
      }

      const cycleDetails = await kpiCascadeV2API.getCycle(Number(targetCycleId));
      const cycleVersions = Array.isArray(cycleDetails?.versions) ? cycleDetails.versions : [];
      const cycleGoalsAll = Array.isArray(cycleDetails?.goals) ? cycleDetails.goals : [];
      const cycleMetricsAll = Array.isArray(cycleDetails?.metrics) ? cycleDetails.metrics : [];
      const cycleInitiativesAll = Array.isArray(cycleDetails?.initiatives) ? cycleDetails.initiatives : [];

      const hasVersionData = (versionId: number) => {
        const goalIdsForVersion = new Set(
          cycleGoalsAll
            .filter((goal: any) => Number(pick(goal, "cycleVersionId", "cycle_version_id")) === versionId)
            .map((goal: any) => Number(goal.id))
            .filter((id: number) => Number.isFinite(id))
        );
        if (goalIdsForVersion.size > 0) return true;
        const metricIdsForVersion = new Set(
          cycleMetricsAll
            .filter((metric: any) => goalIdsForVersion.has(Number(pick(metric, "goalId", "goal_id"))))
            .map((metric: any) => Number(metric.id))
            .filter((id: number) => Number.isFinite(id))
        );
        if (metricIdsForVersion.size > 0) return true;
        return cycleInitiativesAll.some((initiative: any) => metricIdsForVersion.has(Number(pick(initiative, "metricId", "metric_id"))));
      };

      const orderedVersions = [...cycleVersions].sort(
        (a: any, b: any) => Number(pick(b, "versionNo", "version_no") || 0) - Number(pick(a, "versionNo", "version_no") || 0)
      );

      let workingVersion = editingSeed
        ? cycleVersions.find((version: any) => Number(version.id) === Number(editingSeed.cycleVersionId))
        : orderedVersions.find((version: any) => hasVersionData(Number(version.id))) || orderedVersions[0];
      if (!workingVersion) {
        workingVersion = await kpiCascadeV2API.createCycleVersion(Number(targetCycleId), { publish: false });
      }

      const cycleGoals = cycleGoalsAll.filter(
        (goal: any) => Number(pick(goal, "cycleVersionId", "cycle_version_id")) === Number(workingVersion.id)
      );

      let goalRow: any;
      if (editingSeed?.goalId) {
        goalRow = await kpiCascadeV2API.updateGoal(Number(editingSeed.goalId), {
          ownerProfileId: currentProfileId,
          title: hr.goal,
          bscTag: hr.bscTag,
          baseline: num(hr.baseline),
          target: num(hr.target),
          weight: num(hr.weight),
          dueDate: `${hr.dueDate}T23:59:59.999Z`,
        });
      } else {
        const existingGoal = cycleGoals.find((goal: any) => normalizeText(goal.title) === normalizeText(hr.goal));
        goalRow = existingGoal
          ? await kpiCascadeV2API.updateGoal(Number(existingGoal.id), {
              ownerProfileId: currentProfileId,
              title: hr.goal,
              bscTag: hr.bscTag,
              baseline: num(hr.baseline),
              target: num(hr.target),
              weight: num(hr.weight),
              dueDate: `${hr.dueDate}T23:59:59.999Z`,
            })
          : await kpiCascadeV2API.createGoal({
              cycleVersionId: Number(workingVersion.id),
              ownerProfileId: currentProfileId,
              title: hr.goal,
              bscTag: hr.bscTag,
              baseline: num(hr.baseline),
              target: num(hr.target),
              weight: num(hr.weight),
              dueDate: `${hr.dueDate}T23:59:59.999Z`,
            });
      }

      const cycleMetrics = (Array.isArray(cycleDetails?.metrics) ? cycleDetails.metrics : []).filter(
        (metric: any) => Number(pick(metric, "goalId", "goal_id")) === Number(goalRow.id)
      );

      let metricRow: any;
      if (editingSeed?.metricId) {
        metricRow = await kpiCascadeV2API.updateMetric(Number(editingSeed.metricId), {
          name: hr.metric,
          bscTag: hr.bscTag,
          unit: "%",
          direction: "higher_better",
          aggregationMethod: "weighted_average",
          baseline: num(hr.baseline),
          target: num(hr.target),
          weight: num(hr.weight),
          updateFrequency: hr.freq,
          dueDate: `${hr.dueDate}T23:59:59.999Z`,
        });
      } else {
        const existingMetric = cycleMetrics.find((metric: any) => normalizeText(metric.name) === normalizeText(hr.metric));
        metricRow = existingMetric
          ? await kpiCascadeV2API.updateMetric(Number(existingMetric.id), {
              name: hr.metric,
              bscTag: hr.bscTag,
              unit: "%",
              direction: "higher_better",
              aggregationMethod: "weighted_average",
              baseline: num(hr.baseline),
              target: num(hr.target),
              weight: num(hr.weight),
              updateFrequency: hr.freq,
              dueDate: `${hr.dueDate}T23:59:59.999Z`,
            })
          : await kpiCascadeV2API.createMetric({
              goalId: Number(goalRow.id),
              name: hr.metric,
              bscTag: hr.bscTag,
              unit: "%",
              direction: "higher_better",
              aggregationMethod: "weighted_average",
              baseline: num(hr.baseline),
              target: num(hr.target),
              weight: num(hr.weight),
              updateFrequency: hr.freq,
              dueDate: `${hr.dueDate}T23:59:59.999Z`,
            });
      }

      const firmInitiatives = (Array.isArray(cycleDetails?.initiatives) ? cycleDetails.initiatives : []).filter(
        (initiative: any) =>
          Number(pick(initiative, "metricId", "metric_id")) === Number(metricRow.id) &&
          String(initiative.level) === "firm"
      );

      const createdFirmRows: any[] = [];
      if (editingSeed?.firmInitiativeId) {
        const firmRow = await kpiCascadeV2API.updateInitiative(Number(editingSeed.firmInitiativeId), {
          title: hr.firm,
          bscTag: hr.bscTag,
          baseline: num(hr.baseline),
          target: num(hr.target),
          weight: num(hr.weight),
          updateFrequency: hr.freq,
          dueDate: `${hr.dueDate}T23:59:59.999Z`,
        });
        const currentState = String(firmRow?.state || "").toLowerCase();
        if (currentState === "draft" || currentState === "rejected") {
          await kpiCascadeV2API.submitInitiative(Number(firmRow.id));
        }
        createdFirmRows.push(firmRow);
      } else {
        for (const firmName of firmInitiativeNames) {
          const existingFirm = firmInitiatives.find((initiative: any) => normalizeText(initiative.title) === normalizeText(firmName));
          const firmRow = existingFirm
            ? await kpiCascadeV2API.updateInitiative(Number(existingFirm.id), {
                title: firmName,
                bscTag: hr.bscTag,
                baseline: num(hr.baseline),
                target: num(hr.target),
                weight: num(hr.weight),
                updateFrequency: hr.freq,
                dueDate: `${hr.dueDate}T23:59:59.999Z`,
              })
            : await kpiCascadeV2API.createFirmInitiative({
                metricId: Number(metricRow.id),
                title: firmName,
                bscTag: hr.bscTag,
                baseline: num(hr.baseline),
                target: num(hr.target),
                weight: num(hr.weight),
                updateFrequency: hr.freq,
                dueDate: `${hr.dueDate}T23:59:59.999Z`,
              });
          const currentState = String(firmRow?.state || "").toLowerCase();
          if (currentState === "draft" || currentState === "rejected") {
            await kpiCascadeV2API.submitInitiative(Number(firmRow.id));
          }
          createdFirmRows.push(firmRow);
        }
      }

      toast({
        title: editingSeed ? "KPI updated" : hasSelectedExistingCycle ? "KPI saved to selected cycle" : "Cycle created",
        description: editingSeed
          ? "Changes applied successfully."
          : `Submitted ${createdFirmRows.length} firm initiative(s) for GMP review.`
      });
      setSelectedKpiForEdit(String(createdFirmRows[0]?.id || ""));
      setEditingSeed(null);
      setSelectedCycleId(String(targetCycleId));
      await load();
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message || "Unable to create cycle.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const createTeam = async () => {
    if (!currentProfileId || !partner.parentId) return;
    const initiativeNames = splitInitiativeNames(partner.initiativesText);
    if (!initiativeNames.length) {
      toast({ title: "Team initiative required", description: "Enter at least one Team Initiative.", variant: "destructive" });
      return;
    }
    const parent = firm.find((x: any) => String(x.id) === partner.parentId);
    if (!parent) return;
    if (String(parent.state || "").toLowerCase() !== "active") {
      toast({
        title: "Firm KPI not active yet",
        description: "HR must activate the cycle before Partner can submit Team Initiatives.",
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      let submittedCount = 0;
      for (const initiativeName of initiativeNames) {
        const created = await kpiCascadeV2API.createTeamInitiative({ metricId: Number(pick(parent, "metricId", "metric_id")), parentInitiativeId: Number(partner.parentId), title: initiativeName, bscTag: partner.bscTag, partnerProfileId: currentProfileId, baseline: num(partner.baseline), target: num(partner.target), weight: num(partner.weight), updateFrequency: "weekly", dueDate: `${partner.dueDate}T23:59:59.999Z` });
        await kpiCascadeV2API.submitTeamInitiative(Number(created.id));
        submittedCount += 1;
      }
      setPartner((prev) => ({ ...prev, initiativesText: "" }));
      toast({ title: `Submitted ${submittedCount} team initiative(s)` });
      await load();
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message || "Unable to submit team initiative.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const cascadeDeptForParents = async (targetParents: any[], initiativeNames: string[]) => {
    const existingDeptKeys = new Set(
      initiatives
        .filter((item: any) => String(item.level) === "department")
        .map((item: any) => `${Number(pick(item, "parentInitiativeId", "parent_initiative_id"))}:${normalizeText(String(item.title || ""))}`)
    );

    let submittedCount = 0;
    let parentHandledCount = 0;
    let skippedDuplicateCount = 0;
    let cascadedEmployeeCount = 0;

    for (const parent of targetParents) {
      const parentId = Number(parent.id);
      let parentState = normalizedState(parent.state);
      if (["submitted", "in_review"].includes(parentState)) {
        await kpiCascadeV2API.approveInitiative(parentId);
        parentState = "approved";
      }
      if (!["approved", "active"].includes(parentState)) {
        continue;
      }

      parentHandledCount += 1;
      for (const initiativeName of initiativeNames) {
        const dedupeKey = `${parentId}:${normalizeText(initiativeName)}`;
        if (existingDeptKeys.has(dedupeKey)) {
          skippedDuplicateCount += 1;
          continue;
        }

        const created = await kpiCascadeV2API.createDeptInitiative({
          metricId: Number(pick(parent, "metricId", "metric_id")),
          parentInitiativeId: parentId,
          title: initiativeName,
          bscTag: manager.bscTag,
          managerProfileId: currentProfileId,
          departmentId: Number(manager.departmentId),
          baseline: num(manager.baseline),
          target: num(manager.target),
          weight: num(manager.weight),
          updateFrequency: "weekly",
          dueDate: `${manager.dueDate}T23:59:59.999Z`
        });
        await kpiCascadeV2API.submitInitiative(Number(created.id));
        await kpiCascadeV2API.approveDeptInitiative(Number(created.id));
        const cascadeResult = await kpiCascadeV2API.cascadeInitiative(Number(created.id)).catch(() => null);
        cascadedEmployeeCount += Number(cascadeResult?.createdCount ?? cascadeResult?.createdEmployeeKpis ?? 0);
        existingDeptKeys.add(dedupeKey);
        submittedCount += 1;
      }
    }

    return { submittedCount, parentHandledCount, skippedDuplicateCount, cascadedEmployeeCount };
  };

  const createDeptFromParentInputs = async () => {
    if (!currentProfileId || !manager.departmentId) return;

    const parentPayloads = managerTeamOptions
      .map((parent: any) => ({
        parent,
        parentId: String(parent.id),
        initiativeNames: splitInitiativeNames(managerInitiativesByParent[String(parent.id)] || ""),
      }))
      .filter((row) => row.initiativeNames.length > 0);

    if (!parentPayloads.length) {
      toast({
        title: "Department initiative required",
        description: "Add at least one Department Initiative under a Team Initiative.",
        variant: "destructive",
      });
      return;
    }

    setBusy(true);
    try {
      let totalCreated = 0;
      let totalParentsHandled = 0;
      let totalSkippedDuplicates = 0;
      let totalEmployeeCreated = 0;

      for (const row of parentPayloads) {
        const result = await cascadeDeptForParents([row.parent], row.initiativeNames);
        totalCreated += result.submittedCount;
        totalParentsHandled += result.parentHandledCount;
        totalSkippedDuplicates += result.skippedDuplicateCount;
        totalEmployeeCreated += result.cascadedEmployeeCount;
      }

      if (totalCreated === 0) {
        toast({
          title: "No new department initiatives created",
          description: totalSkippedDuplicates > 0
            ? "All entered department initiatives already exist under their parent team initiatives."
            : "Check parent Team Initiative status and try again.",
          variant: "destructive",
        });
        return;
      }

      setManagerInitiativesByParent((prev) => {
        const next = { ...prev };
        for (const row of parentPayloads) {
          next[row.parentId] = "";
        }
        return next;
      });
      toast({
        title: "Department initiatives added",
        description: `Created ${totalCreated} department initiative(s) across ${totalParentsHandled} team initiative(s). Employee KPIs created: ${totalEmployeeCreated}.`,
      });
      await load();
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message || "Unable to add department initiatives.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const cascadeDeptToEmployees = async (initiativeId: number, title: string) => {
    if (!initiativeId) return;
    setBusy(true);
    try {
      const result = await kpiCascadeV2API.cascadeInitiative(initiativeId);
      const created = Number(result?.createdCount ?? result?.createdEmployeeKpis ?? 0);
      toast({
        title: "Employee cascade completed",
        description: created > 0
          ? `Created ${created} employee KPI(s) for "${title}".`
          : `No new employee KPIs were needed for "${title}".`,
      });
      await load();
    } catch (e: any) {
      toast({
        title: "Cascade failed",
        description: e?.message || "Unable to cascade department initiative to employees.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };
  const backfillEmployeeCascadeForDept = async () => {
    if (!approvedDeptInitiatives.length) {
      toast({
        title: "No approved department initiatives",
        description: "Create and approve department initiatives first.",
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      let touched = 0;
      let created = 0;
      for (const row of approvedDeptInitiatives) {
        const initiativeId = Number(row.id);
        if (!initiativeId) continue;
        const result = await kpiCascadeV2API.cascadeInitiative(initiativeId);
        touched += 1;
        created += Number(result?.createdCount ?? result?.createdEmployeeKpis ?? 0);
      }
      toast({
        title: "Employee cascade synced",
        description: `Checked ${touched} department initiative(s). Created ${created} new employee KPI(s).`,
      });
      await load();
    } catch (e: any) {
      toast({
        title: "Backfill failed",
        description: e?.message || "Unable to sync employee KPIs from approved department initiatives.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const approveFirmInitiative = async (initiativeId: number) => {
    setBusy(true);
    try {
      await kpiCascadeV2API.approveInitiative(initiativeId);
      toast({ title: "Firm initiative approved" });
      await load();
    } catch (e: any) {
      toast({ title: "Approval failed", description: e?.message || "Unable to approve initiative.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const rejectFirmInitiative = async (initiativeId: number) => {
    const note = String(gmpRejectNotes[initiativeId] || "").trim();
    if (!note) {
      toast({ title: "Rejection note required", description: "Enter amendment notes before rejecting.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await kpiCascadeV2API.rejectInitiative(initiativeId, note);
      toast({ title: "Firm initiative rejected", description: "Sent back to HR with your amendment note." });
      setGmpRejectNotes((prev) => ({ ...prev, [initiativeId]: "" }));
      await load();
    } catch (e: any) {
      toast({ title: "Rejection failed", description: e?.message || "Unable to reject initiative.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const activateSelectedCycle = async () => {
    const cycleId = Number(selectedCycleId || 0);
    if (!cycleId) return;
    setBusy(true);
    try {
      await kpiCascadeV2API.activateCycle(cycleId);
      toast({ title: "Cycle activated" });
      await load();
    } catch (e: any) {
      toast({ title: "Activation failed", description: e?.message || "Unable to activate cycle.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>KPI Management</CardTitle>
            <CardDescription>Create, cascade, and track KPIs across all organizational levels.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3 items-end">
            <div className="w-[260px]"><Label>Cycle</Label><Select value={selectedCycleId} onValueChange={setSelectedCycleId}><SelectTrigger><SelectValue placeholder="Select cycle" /></SelectTrigger><SelectContent>{cycles.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent></Select></div>
            <Button variant="outline" onClick={load} disabled={busy}>Refresh</Button>
            {details?.cycle?.state ? <Badge>{details.cycle.state}</Badge> : null}
          </CardContent>
        </Card>

        {(isHR || isAdmin || isGMP) ? (
          <Card>
            <CardHeader>
              <CardTitle>KPI Tracking Overview</CardTitle>
              <CardDescription>
                Firm and cascade tracking for HR/GMP including partner, department, finance, marketing, employee, and own KPI progress.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
              <div className="rounded border p-3">
                <div className="text-xs text-muted-foreground">Firm</div>
                <div className="text-lg font-semibold">{trackingSummary.firm.pct.toFixed(1)}%</div>
                <div className="text-xs text-muted-foreground">{trackingSummary.firm.count} initiative(s)</div>
              </div>
              <div className="rounded border p-3">
                <div className="text-xs text-muted-foreground">Partners</div>
                <div className="text-lg font-semibold">{trackingSummary.partners.pct.toFixed(1)}%</div>
                <div className="text-xs text-muted-foreground">{trackingSummary.partners.count} initiative(s)</div>
              </div>
              <div className="rounded border p-3">
                <div className="text-xs text-muted-foreground">Departments</div>
                <div className="text-lg font-semibold">{trackingSummary.departments.pct.toFixed(1)}%</div>
                <div className="text-xs text-muted-foreground">{trackingSummary.departments.count} initiative(s)</div>
              </div>
              <div className="rounded border p-3">
                <div className="text-xs text-muted-foreground">Finance</div>
                <div className="text-lg font-semibold">{trackingSummary.finance.pct.toFixed(1)}%</div>
                <div className="text-xs text-muted-foreground">{trackingSummary.finance.count} initiative(s)</div>
              </div>
              <div className="rounded border p-3">
                <div className="text-xs text-muted-foreground">Marketing</div>
                <div className="text-lg font-semibold">{trackingSummary.marketing.pct.toFixed(1)}%</div>
                <div className="text-xs text-muted-foreground">{trackingSummary.marketing.count} initiative(s)</div>
              </div>
              <div className="rounded border p-3">
                <div className="text-xs text-muted-foreground">Employees</div>
                <div className="text-lg font-semibold">{trackingSummary.employees.pct.toFixed(1)}%</div>
                <div className="text-xs text-muted-foreground">{trackingSummary.employees.count} KPI(s)</div>
              </div>
              <div className="rounded border p-3">
                <div className="text-xs text-muted-foreground">My KPIs</div>
                <div className="text-lg font-semibold">{trackingSummary.mine.pct.toFixed(1)}%</div>
                <div className="text-xs text-muted-foreground">{trackingSummary.mine.count} KPI(s)</div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Scoped KPI Structure</CardTitle>
            <CardDescription>
              KPI tree scoped to your role for the selected cycle (Goal &rarr; Metric &rarr; Firm Initiative &rarr; Team &rarr; Department &rarr; Employee).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">Goals: {visibleGoals.length}</Badge>
              <Badge variant="outline">Metrics: {visibleMetrics.length}</Badge>
              <Badge variant="outline">Firm: {visibleInitiatives.filter((item: any) => item.level === "firm").length}</Badge>
              <Badge variant="outline">Team: {visibleInitiatives.filter((item: any) => item.level === "team").length}</Badge>
              <Badge variant="outline">Department: {visibleInitiatives.filter((item: any) => item.level === "department").length}</Badge>
              <Badge variant="outline">Employee: {visibleInitiatives.filter((item: any) => item.level === "employee").length}</Badge>
            </div>

            {visibleGoals.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No KPI records exist in this cycle yet. Create Step 1 to seed Goal, Metric, and Firm Initiative.
              </p>
            ) : (
              visibleGoals.map((goal: any) => {
                const goalMetrics = metricsByGoal.get(Number(goal.id)) || [];
                return (
                  <div key={goal.id} className="rounded border p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium">Goal: {goal.title}</div>
                      <Badge>{formatState(goal.state)}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      BSC: {pick(goal, "bscTag", "bsc_tag") || "n/a"} | Baseline: {goal.baseline} | Target: {goal.target} | Actual: {goal.actual}
                    </div>

                    {goalMetrics.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No metrics linked to this goal yet.</p>
                    ) : (
                      goalMetrics.map((metric: any) => {
                        const metricInitiatives = (initiativesByMetric.get(Number(metric.id)) || []).filter(
                          (item: any) => item.level === "firm"
                        );
                        return (
                          <div key={metric.id} className="ml-3 rounded border-l pl-3 py-2 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-sm font-medium">Metric: {metric.name}</div>
                              <Badge variant="secondary">{formatState(metric.state)}</Badge>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              BSC: {pick(metric, "bscTag", "bsc_tag") || "n/a"} | Baseline: {metric.baseline} | Target: {metric.target} | Actual: {metric.actual}
                            </div>

                            {metricInitiatives.length === 0 ? (
                              <p className="text-xs text-muted-foreground">No firm initiative linked to this metric yet.</p>
                            ) : (
                              metricInitiatives.map((firmInitiative: any) => {
                                const counts = countFirmCascade(Number(firmInitiative.id));
                                return (
                                  <div key={firmInitiative.id} className="ml-3 rounded border-l pl-3 py-2 space-y-2">
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="text-sm font-medium">Firm Initiative: {firmInitiative.title}</div>
                                      <Badge variant="outline">{formatState(firmInitiative.state)}</Badge>
                                    </div>
                                    {(isHR || isAdmin) ? (
                                      <div>
                                        <Button size="sm" variant="outline" onClick={() => beginSeedEdit(goal, metric, firmInitiative)}>
                                          Edit KPI
                                        </Button>
                                      </div>
                                    ) : null}
                                    <div className="flex flex-wrap gap-2">
                                      <Badge variant="outline">Team: {counts.teams}</Badge>
                                      <Badge variant="outline">Department: {counts.departments}</Badge>
                                      <Badge variant="outline">Employee: {counts.employees}</Badge>
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${availableTabs.length}, minmax(0, 1fr))` }}>
            {availableTabs.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id}>{tab.label}</TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="hr">
            <div ref={hrEditorRef}>
            <Card><CardHeader><CardTitle>Step 1: Create Cycle + Goal + Metric + Firm Initiative(s)</CardTitle></CardHeader><CardContent className="space-y-3">
              {!isHR && !isAdmin ? <p className="text-sm text-muted-foreground">HR/Admin role required.</p> : <>
                {editingSeed ? (
                  <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
                    Editing existing KPI. Change values below and click <strong>Update KPI</strong>.
                  </div>
                ) : null}
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <Label>Load Existing KPI For Edit (Optional)</Label>
                    <Select
                      value={editingSeed ? (selectedKpiForEdit || "__new__") : "__new__"}
                      onValueChange={(value) => {
                        if (value === "__new__") {
                          setEditingSeed(null);
                          setSelectedKpiForEdit("");
                          setHr((prev) => ({ ...prev, goal: "", metric: "", firm: "" }));
                          toast({ title: "Create mode enabled", description: "Enter a new KPI in the fields below." });
                          return;
                        }
                        const selected = kpiEditOptions.find((option) => String(option.id) === String(value));
                        if (!selected?.goal || !selected?.metric || !selected?.firmInitiative) {
                          toast({ title: "Unable to load KPI", variant: "destructive" });
                          return;
                        }
                        beginSeedEdit(selected.goal, selected.metric, selected.firmInitiative);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select existing KPI" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__new__">Create new KPI (open text)</SelectItem>
                        {kpiEditOptions.map((option) => (
                          <SelectItem key={option.id} value={String(option.id)}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">New KPI names are open text in Goal, Metric, and Firm Initiative fields below.</p>
                  </div>
                </div>
                <div className="grid md:grid-cols-3 gap-3">
                  <div>
                    <Label>New Cycle Name (Optional)</Label>
                    <Input value={hr.cycleName} onChange={(e) => setHr({ ...hr, cycleName: e.target.value })} />
                    <p className="text-xs text-muted-foreground mt-1">If a cycle is selected above, this can be left blank.</p>
                  </div>
                  <div><Label>Start</Label><Input type="date" value={hr.startAt} onChange={(e) => setHr({ ...hr, startAt: e.target.value })} /></div>
                  <div><Label>End</Label><Input type="date" value={hr.endAt} onChange={(e) => setHr({ ...hr, endAt: e.target.value })} /></div>
                  <div className="md:col-span-3">
                    <Label>KPI Name (Open Text)</Label>
                    <Input
                      placeholder="Type the KPI name freely"
                      value={splitInitiativeNames(hr.firm)[0] || ""}
                      onChange={(e) => {
                        const nextName = e.target.value.trim();
                        const existing = splitInitiativeNames(hr.firm);
                        if (!nextName) {
                          setHr({ ...hr, firm: existing.slice(1).join("\n") });
                          return;
                        }
                        const remainder = existing.slice(1);
                        setHr({ ...hr, firm: [nextName, ...remainder].join("\n") });
                      }}
                    />
                    <p className="text-xs text-muted-foreground mt-1">The first line in Firm Initiative(s) is treated as the main KPI name.</p>
                  </div>
                  <div><Label>Goal</Label><Input ref={goalInputRef} value={hr.goal} onChange={(e) => setHr({ ...hr, goal: e.target.value })} /></div>
                  <div><Label>Metric</Label><Input value={hr.metric} onChange={(e) => setHr({ ...hr, metric: e.target.value })} /></div>
                  <div className="md:col-span-3">
                    <Label>Firm Initiative(s)</Label>
                    <Textarea
                      value={hr.firm}
                      onChange={(e) => setHr({ ...hr, firm: e.target.value })}
                      rows={editingSeed ? 2 : 4}
                      placeholder={editingSeed ? "Edit the initiative name" : "Add one initiative per line"}
                    />
                    {!editingSeed ? (
                      <p className="text-xs text-muted-foreground mt-1">You can add multiple firm initiatives, one per line.</p>
                    ) : null}
                  </div>
                  <div><Label>BSC</Label><Select value={hr.bscTag} onValueChange={(value) => setHr({ ...hr, bscTag: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{bscOptions.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent></Select></div>
                  <div><Label>Baseline</Label><Input type="number" value={hr.baseline} onChange={(e) => setHr({ ...hr, baseline: e.target.value })} /></div>
                  <div><Label>Target</Label><Input type="number" value={hr.target} onChange={(e) => setHr({ ...hr, target: e.target.value })} /></div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={createSeed} disabled={busy}>
                    {editingSeed ? "Update KPI" : "Create & Submit For GMP Review"}
                  </Button>
                  {selectedCycleId && (isHR || isAdmin) ? (
                    <Button
                      variant="secondary"
                      onClick={activateSelectedCycle}
                      disabled={
                        busy ||
                        cycleState === "active" ||
                        cycleState === "archived" ||
                        !hasApprovedFirmForActivation ||
                        hasPendingFirmApprovals
                      }
                    >
                      {cycleState === "active"
                        ? "Cycle Active"
                        : hasPendingFirmApprovals
                          ? "Await GMP Approval"
                          : "Activate Cycle"}
                    </Button>
                  ) : null}
                  {editingSeed ? (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setEditingSeed(null);
                        setSelectedKpiForEdit("");
                        toast({ title: "Edit cancelled" });
                      }}
                      disabled={busy}
                    >
                      Cancel Edit
                    </Button>
                  ) : null}
                </div>
              </>}
            </CardContent></Card>
            </div>
          </TabsContent>

          <TabsContent value="gmp">
            <Card><CardHeader><CardTitle>Step 2: Approve Firm Initiatives</CardTitle></CardHeader><CardContent className="space-y-3">
              {!isGMP && !isAdmin ? <p className="text-sm text-muted-foreground">GMP/Admin role required.</p> : <>
                {(firm || []).filter((f: any) => ["submitted", "in_review"].includes(String(f.state))).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No firm initiatives pending GMP review.</p>
                ) : (
                  (firm || [])
                    .filter((f: any) => ["submitted", "in_review"].includes(String(f.state)))
                    .map((f: any) => (
                      <div key={f.id} className="border rounded p-3 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium">{f.title}</span>
                          <Badge variant="outline">{formatState(f.state)}</Badge>
                        </div>
                        <div>
                          <Label>Amendment Note (required for rejection)</Label>
                          <Input
                            placeholder="Write what HR should amend..."
                            value={gmpRejectNotes[f.id] || ""}
                            onChange={(e) => setGmpRejectNotes((prev) => ({ ...prev, [f.id]: e.target.value }))}
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => approveFirmInitiative(Number(f.id))} disabled={busy}>Approve</Button>
                          <Button size="sm" variant="destructive" onClick={() => rejectFirmInitiative(Number(f.id))} disabled={busy}>Reject</Button>
                        </div>
                      </div>
                    ))
                )}
              </>}
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="partner">
            <Card><CardHeader><CardTitle>Step 3: Submit Team Initiative(s)</CardTitle></CardHeader><CardContent className="space-y-3">
              {!canUsePartnerFlow ? <p className="text-sm text-muted-foreground">Partner/GMP/Admin role required.</p> : <>
                {partnerAwaitingCycleActivation ? (
                  <p className="text-sm text-amber-700">
                    Firm KPI is approved but not active. HR must activate the cycle first.
                  </p>
                ) : null}
                <div className="grid md:grid-cols-2 gap-3">
                  <div><Label>Parent Firm Initiative</Label><Select value={partner.parentId} onValueChange={(value) => setPartner({ ...partner, parentId: value })}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{partnerFirmOptions.map((f: any) => <SelectItem key={f.id} value={String(f.id)}>{f.title} ({formatState(f.state)})</SelectItem>)}</SelectContent></Select></div>
                  <div>
                    <Label>Team Initiative(s)</Label>
                    <Textarea
                      value={partner.initiativesText}
                      onChange={(e) => setPartner({ ...partner, initiativesText: e.target.value })}
                      rows={4}
                      placeholder="Add one team initiative per line"
                    />
                  </div>
                </div>
                <Button onClick={createTeam} disabled={busy || !partner.parentId || splitInitiativeNames(partner.initiativesText).length === 0 || selectedPartnerParentState !== "active"}>
                  Create & Submit To Manager
                </Button>
              </>}
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="manager">
            <Card><CardHeader><CardTitle>Step 4: Add Department Initiative(s) Under Team Initiative(s)</CardTitle></CardHeader><CardContent className="space-y-3">
              {!canUseManagerFlow ? <p className="text-sm text-muted-foreground">Manager/Finance/Marketing/Admin role required.</p> : <>
                <div className="text-sm text-muted-foreground">
                  Coverage: {managerCoverage.covered}/{managerCoverage.total} team initiative(s) have department initiative(s).
                  {managerCoverage.missing > 0 ? ` Missing: ${managerCoverage.missing}.` : " All covered."}
                </div>
                {(isFinance || isMarketing) && !managerScopePartnerId ? (
                  <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    This department has no fixed Partner assignment. You can cascade under available Team Initiatives and HR will track the department roll-up.
                  </div>
                ) : null}
                <div>
                  <Button
                    variant="outline"
                    onClick={backfillEmployeeCascadeForDept}
                    disabled={busy || approvedDeptInitiatives.length === 0}
                  >
                    Backfill Employee KPIs ({approvedDeptInitiatives.length})
                  </Button>
                </div>
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <Label>Department ID</Label>
                    <Input value={manager.departmentId} onChange={(e) => setManager({ ...manager, departmentId: e.target.value })} />
                  </div>
                </div>

                <div className="border rounded p-3 space-y-3">
                  <div className="text-sm font-medium">Team Initiatives (Add Department Initiatives Under Each)</div>
                  {managerTeamOptions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No team initiatives are ready for your department input yet.</p>
                  ) : managerTeamOptions.map((parent: any) => {
                    const parentId = String(parent.id);
                    const parentDeptCount = deptCountByTeamParent.get(Number(parent.id)) || 0;
                    const draftText = managerInitiativesByParent[parentId] || "";
                    const existingDeptRows = deptInitiativesByParent.get(Number(parent.id)) || [];
                    return (
                      <div key={parent.id} className="border rounded p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium">{parent.title} ({formatState(parent.state)})</div>
                          <Badge>{`Dept: ${parentDeptCount}`}</Badge>
                        </div>
                        {existingDeptRows.length > 0 ? (
                          <div className="rounded border bg-muted/30 p-2 space-y-1">
                            <div className="text-xs text-muted-foreground">Existing department initiatives</div>
                            {existingDeptRows.map((row: any) => (
                              <div key={row.id} className="text-sm flex items-center justify-between gap-2">
                                <span>{row.title}</span>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline">{formatState(row.state)}</Badge>
                                  {["approved", "active"].includes(String(row.state || "").toLowerCase()) ? (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => cascadeDeptToEmployees(Number(row.id), String(row.title || ""))}
                                      disabled={busy}
                                    >
                                      Cascade to Employees
                                    </Button>
                                  ) : null}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground">No department initiatives created under this team initiative yet.</div>
                        )}
                        <Textarea
                          value={draftText}
                          onChange={(e) => setManagerInitiativesByParent((prev) => ({ ...prev, [parentId]: e.target.value }))}
                          rows={3}
                          placeholder="Add one department initiative per line for this parent team initiative"
                        />
                      </div>
                    );
                  })}
                  <Button onClick={createDeptFromParentInputs} disabled={busy || !manager.departmentId || !hasManagerDraftInputs}>
                    Create Department Initiatives
                  </Button>
                </div>
              </>}
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="employee">
            <Card><CardHeader><CardTitle>Step 5/6: Acknowledge And Update</CardTitle></CardHeader><CardContent className="space-y-3">
              {myKpis.length === 0 ? <p className="text-sm text-muted-foreground">No employee KPIs assigned yet.</p> : myKpis.map((kpi: any) => {
                const draft = updates[kpi.id] || { actual: "", comment: "" };
                const needsAck = !pick(kpi, "acknowledgedAt", "acknowledged_at");
                return <div key={kpi.id} className="border rounded p-3 space-y-2"><div className="flex items-center justify-between"><span>{kpi.title}</span><Badge>{kpi.state}</Badge></div>{needsAck ? <Button size="sm" onClick={() => kpiCascadeV2API.acknowledgeEmployeeKpi(Number(kpi.id)).then(load)}>Acknowledge</Button> : null}<div className="grid md:grid-cols-2 gap-2"><Input type="number" placeholder="Actual" value={draft.actual} onChange={(e) => setUpdates({ ...updates, [kpi.id]: { ...draft, actual: e.target.value } })} /><Input placeholder="Comment" value={draft.comment} onChange={(e) => setUpdates({ ...updates, [kpi.id]: { ...draft, comment: e.target.value } })} /></div><Button size="sm" variant="outline" disabled={needsAck} onClick={() => kpiCascadeV2API.submitUpdate({ employeeKpiId: Number(kpi.id), actualValue: Number(draft.actual || 0), comment: draft.comment }).then(load)}>Submit Update</Button></div>;
              })}
            </CardContent></Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

