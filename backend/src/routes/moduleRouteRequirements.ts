import { ModuleAction, ModuleKey } from "../services/moduleAccess.service";

type SingleRouteRequirement = {
  path: string;
  type: "single";
  moduleKey: ModuleKey;
  action?: ModuleAction;
};

type AnyRouteRequirement = {
  path: string;
  type: "any";
  anyOf: Array<{ moduleKey: ModuleKey; action: ModuleAction }>;
};

export type RouteModuleRequirement = SingleRouteRequirement | AnyRouteRequirement;

// Single source of truth for top-level route module requirements.
export const ROUTE_MODULE_REQUIREMENTS: RouteModuleRequirement[] = [
  {
    path: "/departments",
    type: "any",
    anyOf: [
      { moduleKey: "users", action: "read" },
      { moduleKey: "dashboard", action: "read" },
    ],
  },
  { path: "/documents", type: "single", moduleKey: "documents" },
  { path: "/knowledge-hub", type: "single", moduleKey: "knowledge_hub" },
  { path: "/onboarding", type: "single", moduleKey: "users" },
  { path: "/offboarding", type: "single", moduleKey: "users" },
  { path: "/evaluations", type: "single", moduleKey: "evaluations" },
  { path: "/induction-checklist", type: "single", moduleKey: "users" },
  {
    path: "/partners",
    type: "any",
    anyOf: [
      { moduleKey: "users", action: "read" },
      { moduleKey: "dashboard", action: "read" },
    ],
  },
  { path: "/jobs", type: "single", moduleKey: "jobs" },
  { path: "/time-entries", type: "single", moduleKey: "time_entries" },
  { path: "/analytics", type: "single", moduleKey: "reports" },
  { path: "/audit-logs", type: "single", moduleKey: "reports" },
  { path: "/audit_logs", type: "single", moduleKey: "reports" },
  { path: "/job-profitability", type: "single", moduleKey: "finance" },
  { path: "/evaluation-assignments", type: "single", moduleKey: "evaluations" },
  { path: "/evaluation-cycles", type: "single", moduleKey: "evaluations" },
  { path: "/evaluation-result-areas", type: "single", moduleKey: "evaluations" },
  { path: "/evaluation-templates", type: "single", moduleKey: "evaluations" },
  { path: "/evaluation_templates", type: "single", moduleKey: "evaluations" },
  { path: "/evaluation-definitions", type: "single", moduleKey: "evaluations" },
  { path: "/employee-evaluations", type: "single", moduleKey: "evaluations" },
  { path: "/client-evaluations", type: "single", moduleKey: "evaluations" },
  { path: "/peer-evaluations", type: "single", moduleKey: "evaluations" },
  { path: "/upward-evaluations", type: "single", moduleKey: "evaluations" },
  { path: "/ad-hoc-evaluations", type: "single", moduleKey: "evaluations" },
  { path: "/continuous-feedback", type: "single", moduleKey: "evaluations" },
  { path: "/create-cycle-evaluations", type: "single", moduleKey: "evaluations" },
  { path: "/performance-reviews", type: "single", moduleKey: "evaluations" },
  { path: "/non-financial-performance", type: "single", moduleKey: "evaluations" },
  { path: "/development-recommendations", type: "single", moduleKey: "evaluations" },
  { path: "/kpis", type: "single", moduleKey: "kpis" },
  { path: "/okrs", type: "single", moduleKey: "kpis" },
  { path: "/employee-goals", type: "single", moduleKey: "kpis" },
  { path: "/employee-kpi-assignments", type: "single", moduleKey: "kpis" },
  { path: "/employees", type: "single", moduleKey: "users" },
  { path: "/profiles", type: "single", moduleKey: "users" },
  { path: "/employee-roles", type: "single", moduleKey: "users" },
  { path: "/employee-project-allocations", type: "single", moduleKey: "users" },
  { path: "/subordinates", type: "single", moduleKey: "users" },
  { path: "/team-management", type: "single", moduleKey: "jobs" },
  { path: "/manager", type: "single", moduleKey: "jobs" },
  { path: "/clients", type: "single", moduleKey: "clients" },
  { path: "/engagement-letters", type: "single", moduleKey: "clients" },
  { path: "/client-onboardings", type: "single", moduleKey: "clients" },
  { path: "/performance-scores", type: "single", moduleKey: "reports" },
  { path: "/performance-framework", type: "single", moduleKey: "dashboard" },
  { path: "/project-evaluations", type: "single", moduleKey: "evaluations" },
  { path: "/calibration", type: "single", moduleKey: "evaluations" },
  { path: "/proposals", type: "single", moduleKey: "proposals" },
  { path: "/feedback", type: "single", moduleKey: "evaluations" },
  { path: "/notifications", type: "single", moduleKey: "notifications" },
  { path: "/notification-templates", type: "single", moduleKey: "notifications" },
  { path: "/manager-dashboard", type: "single", moduleKey: "dashboard" },
  { path: "/gmp-dashboard", type: "single", moduleKey: "dashboard" },
  { path: "/hr-dashboard", type: "single", moduleKey: "dashboard" },
  { path: "/roles", type: "single", moduleKey: "users" },
  { path: "/user-roles", type: "single", moduleKey: "users" },
  { path: "/position-rates", type: "single", moduleKey: "users" },
  { path: "/projects", type: "single", moduleKey: "jobs" },
  { path: "/todos", type: "single", moduleKey: "dashboard", action: "read" },
  { path: "/work-logs", type: "single", moduleKey: "time_entries" },
  { path: "/work_logs", type: "single", moduleKey: "time_entries" },
  { path: "/recruitment-candidates", type: "single", moduleKey: "users" },
  { path: "/module-access", type: "single", moduleKey: "access_control" },
];

export const MODULE_REQUIREMENTS_BY_ROUTE = new Map(
  ROUTE_MODULE_REQUIREMENTS.map((item) => [item.path, item] as const)
);

export const MODULE_REQUIREMENTS_BY_MODULE = ROUTE_MODULE_REQUIREMENTS.reduce(
  (acc, requirement) => {
    if (requirement.type === "single") {
      const current = acc[requirement.moduleKey] || [];
      current.push({
        path: requirement.path,
        action: requirement.action,
        type: requirement.type,
      });
      acc[requirement.moduleKey] = current;
      return acc;
    }

    requirement.anyOf.forEach((option) => {
      const current = acc[option.moduleKey] || [];
      current.push({
        path: requirement.path,
        action: option.action,
        type: requirement.type,
      });
      acc[option.moduleKey] = current;
    });
    return acc;
  },
  {} as Record<
    ModuleKey,
    Array<{ path: string; action?: ModuleAction; type: RouteModuleRequirement["type"] }>
  >
);
