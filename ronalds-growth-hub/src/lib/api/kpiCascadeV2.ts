import { apiFetch } from "./client";

const makeKey = (prefix: string) => {
  const rand = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  return `${prefix}-${rand}`;
};

const withIdempotency = async <T>(
  method: "POST" | "PUT" | "PATCH",
  path: string,
  payload?: Record<string, unknown>,
  keyPrefix = "kpi-v2"
): Promise<T> =>
  apiFetch<T>(method, path, payload, {
    headers: {
      "Idempotency-Key": makeKey(keyPrefix),
    },
  });

const kpiCascadeV2API = {
  listCycles: (filters?: { state?: string; cadence?: string; bscTag?: string }) => {
    const search = new URLSearchParams();
    if (filters?.state) search.set("state", filters.state);
    if (filters?.cadence) search.set("cadence", filters.cadence);
    if (filters?.bscTag) search.set("bscTag", filters.bscTag);
    const query = search.toString();
    return apiFetch<any[]>("GET", `/kpi/cycles${query ? `?${query}` : ""}`);
  },

  getCycle: (cycleId: number) => apiFetch<any>("GET", `/kpi/cycles/${cycleId}`),
  getMyScope: () => apiFetch<any>("GET", "/kpi/me/scope"),

  createCycle: (payload: Record<string, unknown>) =>
    withIdempotency<any>("POST", "/kpi/cycles", payload, "kpi-cycle-create"),

  createCycleVersion: (cycleId: number, payload: Record<string, unknown>) =>
    withIdempotency<any>("POST", `/kpi/cycles/${cycleId}/versions`, payload, "kpi-cycle-version"),

  activateCycle: (cycleId: number) =>
    withIdempotency<any>("PUT", `/kpi/cycles/${cycleId}/activate`, {}, "kpi-cycle-activate"),

  archiveCycle: (cycleId: number) =>
    withIdempotency<any>("PUT", `/kpi/cycles/${cycleId}/archive`, {}, "kpi-cycle-archive"),

  createGoal: (payload: Record<string, unknown>) => withIdempotency<any>("POST", "/kpi/goals", payload, "kpi-goal"),
  updateGoal: (goalId: number, payload: Record<string, unknown>) =>
    withIdempotency<any>("PUT", `/kpi/goals/${goalId}`, payload, "kpi-goal-update"),

  createMetric: (payload: Record<string, unknown>) => withIdempotency<any>("POST", "/kpi/metrics", payload, "kpi-metric"),
  updateMetric: (metricId: number, payload: Record<string, unknown>) =>
    withIdempotency<any>("PUT", `/kpi/metrics/${metricId}`, payload, "kpi-metric-update"),

  createFirmInitiative: (payload: Record<string, unknown>) =>
    withIdempotency<any>("POST", "/kpi/initiatives/firm", payload, "kpi-firm-initiative"),
  updateInitiative: (initiativeId: number, payload: Record<string, unknown>) =>
    withIdempotency<any>("PUT", `/kpi/initiatives/${initiativeId}`, payload, "kpi-initiative-update"),

  submitInitiative: (initiativeId: number) =>
    withIdempotency<any>("POST", `/kpi/initiatives/${initiativeId}/submit`, {}, "kpi-initiative-submit"),

  approveInitiative: (initiativeId: number) =>
    withIdempotency<any>("POST", `/kpi/initiatives/${initiativeId}/approve`, {}, "kpi-initiative-approve"),

  rejectInitiative: (initiativeId: number, reason: string) =>
    withIdempotency<any>("POST", `/kpi/initiatives/${initiativeId}/reject`, { reason }, "kpi-initiative-reject"),

  createTeamInitiative: (payload: Record<string, unknown>) =>
    withIdempotency<any>("POST", "/kpi/team-initiatives", payload, "kpi-team-initiative"),

  getTeamInitiativesByPartner: (partnerId: number) =>
    apiFetch<any[]>("GET", `/kpi/team-initiatives/by-partner/${partnerId}`),

  submitTeamInitiative: (initiativeId: number) =>
    withIdempotency<any>("PUT", `/kpi/team-initiatives/${initiativeId}/submit`, {}, "kpi-team-submit"),

  createDeptInitiative: (payload: Record<string, unknown>) =>
    withIdempotency<any>("POST", "/kpi/dept-initiatives", payload, "kpi-dept-initiative"),

  approveDeptInitiative: (initiativeId: number) =>
    withIdempotency<any>("PUT", `/kpi/dept-initiatives/${initiativeId}/approve`, {}, "kpi-dept-approve"),

  assignEmployeeKpi: (payload: Record<string, unknown>) =>
    withIdempotency<any>("POST", "/kpi/employee-kpis", payload, "kpi-employee-assign"),

  cascadeInitiative: (initiativeId: number) =>
    withIdempotency<any>("POST", `/kpi/initiatives/${initiativeId}/cascade`, {}, "kpi-cascade"),

  getEmployeeKpis: (profileId: number) => apiFetch<any[]>("GET", `/kpi/employees/${profileId}/kpis`),

  acknowledgeEmployeeKpi: (initiativeId: number) =>
    withIdempotency<any>("PUT", `/kpi/employee-kpis/${initiativeId}/acknowledge`, {}, "kpi-ack"),

  submitUpdate: (payload: Record<string, unknown>) =>
    withIdempotency<any>("POST", "/kpi/updates", payload, "kpi-update"),

  getRollup: (level: string, id: number) => apiFetch<any>("GET", `/kpi/rollup/${level}/${id}`),

  getBscReport: (bscTag?: string) =>
    apiFetch<any>("GET", `/kpi/reports/bsc${bscTag ? `?bscTag=${encodeURIComponent(bscTag)}` : ""}`),

  getAudit: (entity: string, id: number) => apiFetch<any>("GET", `/kpi/audit/${entity}/${id}`),

  reassignOwnership: (payload: Record<string, unknown>) =>
    withIdempotency<any>("POST", "/kpi/reassign", payload, "kpi-reassign"),

  getFirmReport: () => apiFetch<any>("GET", "/kpi/reporting/firm"),
};

export default kpiCascadeV2API;
