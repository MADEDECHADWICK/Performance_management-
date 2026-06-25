// This file defines the module requirements for each top-level route in the application. It specifies which modules and actions are required to access each route, allowing for centralized management of access control based on module permissions. The requirements can be of two types: "single", where a specific module (and optionally an action) is required, or "any", where access is granted if the user has any one of a specified set of module permissions. This structure enables flexible and maintainable access control policies across the application's routes.
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
  { path: "/knowledge-hub", type: "single", moduleKey: "knowledge_hub", action: "read" },
  { path: "/onboarding", type: "single", moduleKey: "users", action: "read" },
  { path: "/onboarding-policies", type: "single", moduleKey: "users" },
  { path: "/offboarding", type: "single", moduleKey: "users" },
  { path: "/evaluations", type: "single", moduleKey: "evaluations" },
  { path: "/induction-checklist", type: "single", moduleKey: "users", action: "read" },
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
  { path: "/leave", type: "single", moduleKey: "leave" },
  { path: "/requisitions", type: "single", moduleKey: "requisitions" },
  { path: "/analytics", type: "single", moduleKey: "reports" },
  { path: "/reporting", type: "single", moduleKey: "reports", action: "read" },
  { path: "/audit-logs", type: "single", moduleKey: "reports" },
  { path: "/financial-summary", type: "single", moduleKey: "finance", action: "read" },
  { path: "/finance-dashboard", type: "single", moduleKey: "finance", action: "read" },
  { path: "/job-profitability", type: "single", moduleKey: "finance" },
  { path: "/evaluation-assignments", type: "single", moduleKey: "evaluations" },
  { path: "/evaluation-cycles", type: "single", moduleKey: "evaluations" },
  { path: "/evaluation-templates", type: "single", moduleKey: "evaluations" },
  { path: "/employee-goals", type: "single", moduleKey: "evaluations" },
  { path: "/competencies", type: "single", moduleKey: "evaluations" },
  { path: "/client-evaluations", type: "single", moduleKey: "evaluations" },
  { path: "/continuous-feedback", type: "single", moduleKey: "evaluations" },
  { path: "/performance-reviews", type: "single", moduleKey: "evaluations" },
  { path: "/non-financial-performance", type: "single", moduleKey: "evaluations" },
  { path: "/development-recommendations", type: "single", moduleKey: "evaluations" },
  { path: "/employees", type: "single", moduleKey: "users" },
  { path: "/profiles", type: "single", moduleKey: "users", action: "read" },
  { path: "/employee-roles", type: "single", moduleKey: "users" },
  { path: "/employee-project-allocations", type: "single", moduleKey: "users" },
  { path: "/subordinates", type: "single", moduleKey: "users" },
  { path: "/team-management", type: "single", moduleKey: "jobs", action: "read" },
  { path: "/clients", type: "single", moduleKey: "clients" },
  { path: "/engagement-letters", type: "single", moduleKey: "clients" },
  { path: "/client-onboardings", type: "single", moduleKey: "clients" },
  { path: "/performance-scores", type: "single", moduleKey: "reports" },
  { path: "/performance-framework", type: "single", moduleKey: "dashboard" },
  { path: "/kpi-cascade", type: "single", moduleKey: "dashboard", action: "read" },
  { path: "/project-evaluations", type: "single", moduleKey: "evaluations" },
  { path: "/calibration", type: "single", moduleKey: "evaluations" },
  { path: "/performance-bands", type: "single", moduleKey: "evaluations" },
  { path: "/development-plans", type: "single", moduleKey: "evaluations" },
  { path: "/evaluation-reports", type: "single", moduleKey: "evaluations" },
  { path: "/proposals", type: "single", moduleKey: "proposals" },
  { path: "/feedback", type: "single", moduleKey: "evaluations" },
  { path: "/checkins", type: "single", moduleKey: "evaluations" },
  { path: "/notifications", type: "single", moduleKey: "notifications" },
  {
    path: "/ops",
    type: "any",
    anyOf: [
      { moduleKey: "dashboard", action: "read" },
      { moduleKey: "reports", action: "read" },
      { moduleKey: "notifications", action: "read" },
    ],
  },
  { path: "/notification-templates", type: "single", moduleKey: "notifications" },
  { path: "/manager-dashboard", type: "single", moduleKey: "dashboard" },
  { path: "/gmp-dashboard", type: "single", moduleKey: "dashboard" },
  { path: "/hr-dashboard", type: "single", moduleKey: "dashboard" },
  { path: "/roles", type: "single", moduleKey: "users" },
  { path: "/user-roles", type: "single", moduleKey: "users" },
  { path: "/position-rates", type: "single", moduleKey: "users" },
  { path: "/projects", type: "single", moduleKey: "jobs" },
  { path: "/todos", type: "single", moduleKey: "dashboard", action: "read" },
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
