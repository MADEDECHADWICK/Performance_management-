import type { CanonicalRole } from "./canonicalRoles";

export type ModuleAction = "read" | "write" | "approve" | "admin";

export type ViewPermissionDefinition = {
  key: string;
  label: string;
  category: string;
  module?: string;
  action?: ModuleAction;
  defaultPath: string;
  patterns: RegExp[];
};

const COMMON_VIEW_KEYS = [
  "profile.my",
  "goals.my",
  "scorecard.my",
  "evaluations.my",
  "feedback.continuous",
  "reviews.upward",
  "timesheets.my",
  "development.plan",
  "documents.workspace",
  "knowledge.hub",
  "notifications.center",
  "todos.my",
] as const;

export const VIEW_PERMISSION_DEFINITIONS: ViewPermissionDefinition[] = [
  {
    key: "dashboard.employee",
    label: "Employee Dashboard",
    category: "Dashboards",
    module: "dashboard",
    action: "read",
    defaultPath: "/dashboard",
    patterns: [/^\/dashboard(?:\/|$)/],
  },
  {
    key: "dashboard.hr",
    label: "HR Dashboard",
    category: "Dashboards",
    module: "dashboard",
    action: "read",
    defaultPath: "/hr-dashboard",
    patterns: [/^\/hr-dashboard(?:\/|$)/],
  },
  {
    key: "dashboard.gmp",
    label: "GMP Dashboard",
    category: "Dashboards",
    module: "dashboard",
    action: "read",
    defaultPath: "/gmp-dashboard",
    patterns: [/^\/gmp-dashboard(?:\/|$)/],
  },
  {
    key: "dashboard.partner",
    label: "Partner Dashboard",
    category: "Dashboards",
    module: "dashboard",
    action: "read",
    defaultPath: "/partner-dashboard",
    patterns: [/^\/partner-dashboard(?:\/|$)/],
  },
  {
    key: "dashboard.manager",
    label: "Manager Dashboard",
    category: "Dashboards",
    module: "dashboard",
    action: "read",
    defaultPath: "/manager-dashboard",
    patterns: [/^\/manager-dashboard(?:\/|$)/],
  },
  {
    key: "dashboard.department",
    label: "Department Dashboard",
    category: "Dashboards",
    module: "dashboard",
    action: "read",
    defaultPath: "/department-dashboard",
    patterns: [/^\/department-dashboard(?:\/|$)/],
  },
  {
    key: "dashboard.marketing",
    label: "Marketing Dashboard",
    category: "Dashboards",
    module: "dashboard",
    action: "read",
    defaultPath: "/marketing-dashboard",
    patterns: [/^\/marketing-dashboard(?:\/|$)/],
  },
  {
    key: "dashboard.finance",
    label: "Finance Dashboard",
    category: "Dashboards",
    module: "finance",
    action: "read",
    defaultPath: "/finance-dashboard",
    patterns: [/^\/finance-dashboard(?:\/|$)/],
  },
  {
    key: "profile.my",
    label: "My Profile",
    category: "Self Service",
    module: "users",
    action: "read",
    defaultPath: "/profile",
    patterns: [/^\/profile(?:\/|$)/],
  },
  {
    key: "goals.my",
    label: "Goals",
    category: "Self Service",
    module: "kpis",
    action: "read",
    defaultPath: "/goals",
    patterns: [/^\/goals(?:\/|$)/],
  },
  {
    key: "scorecard.my",
    label: "Scorecard",
    category: "Self Service",
    module: "kpis",
    action: "read",
    defaultPath: "/scorecard",
    patterns: [/^\/scorecard(?:\/|$)/],
  },
  {
    key: "evaluations.my",
    label: "My Evaluations",
    category: "Evaluations",
    module: "evaluations",
    action: "read",
    defaultPath: "/evaluations",
    patterns: [
      /^\/evaluations\/?$/,
      /^\/evaluations\/assignments(?:\/[^/]+)?(?:\/|$)/,
      /^\/evaluation\/[^/]+(?:\/|$)/,
      /^\/complete-evaluation\/[^/]+(?:\/|$)/,
    ],
  },
  {
    key: "feedback.continuous",
    label: "Continuous Feedback",
    category: "Evaluations",
    module: "evaluations",
    action: "read",
    defaultPath: "/evaluations/feedback",
    patterns: [
      /^\/continuous-feedback(?:\/|$)/,
      /^\/feedback(?:\/|$)/,
      /^\/evaluations\/feedback(?:\/|$)/,
    ],
  },
  {
    key: "reviews.upward",
    label: "Upward Reviews",
    category: "Evaluations",
    module: "evaluations",
    action: "read",
    defaultPath: "/evaluations",
    patterns: [/^\/upward-reviews(?:\/|$)/],
  },
  {
    key: "timesheets.my",
    label: "Timesheets",
    category: "Self Service",
    module: "time_entries",
    action: "read",
    defaultPath: "/timesheets",
    patterns: [/^\/timesheets(?:\/|$)/],
  },
  {
    key: "development.plan",
    label: "Development Plan",
    category: "Self Service",
    module: "evaluations",
    action: "read",
    defaultPath: "/development-plan",
    patterns: [/^\/development-plan(?:\/|$)/],
  },
  {
    key: "documents.workspace",
    label: "Documents",
    category: "Collaboration",
    module: "documents",
    action: "read",
    defaultPath: "/documents",
    patterns: [/^\/documents(?:\/|$)/],
  },
  {
    key: "knowledge.hub",
    label: "Knowledge Hub",
    category: "Collaboration",
    module: "knowledge_hub",
    action: "read",
    defaultPath: "/knowledge-hub",
    patterns: [/^\/knowledge-hub(?:\/|$)/],
  },
  {
    key: "notifications.center",
    label: "Notifications",
    category: "Collaboration",
    module: "notifications",
    action: "read",
    defaultPath: "/notifications",
    patterns: [/^\/notifications(?:\/|$)/],
  },
  {
    key: "todos.my",
    label: "My To-Dos",
    category: "Self Service",
    module: "dashboard",
    action: "read",
    defaultPath: "/todos",
    patterns: [/^\/todos(?:\/|$)/],
  },
  {
    key: "people.employee_management",
    label: "Employee Management",
    category: "People & Access",
    module: "users",
    action: "read",
    defaultPath: "/employee-management",
    patterns: [/^\/employee-management(?:\/|$)/],
  },
  {
    key: "people.role_access_management",
    label: "Role/Access Management",
    category: "People & Access",
    module: "access_control",
    action: "admin",
    defaultPath: "/role-management",
    patterns: [/^\/role-management(?:\/|$)/],
  },
  {
    key: "people.positions_rates",
    label: "Positions & Rates",
    category: "People & Access",
    module: "users",
    action: "admin",
    defaultPath: "/positions-rates",
    patterns: [/^\/positions-rates(?:\/|$)/],
  },
  {
    key: "people.recruitment_candidates",
    label: "Recruitment Candidates",
    category: "People & Access",
    module: "users",
    action: "write",
    defaultPath: "/recruitment-candidates",
    patterns: [/^\/recruitment-candidates(?:\/|$)/],
  },
  {
    key: "clients.create_edit",
    label: "Client Create/Edit",
    category: "Clients",
    module: "clients",
    action: "write",
    defaultPath: "/clients/new",
    patterns: [/^\/clients\/new(?:\/|$)/, /^\/clients\/[^/]+\/edit(?:\/|$)/],
  },
  {
    key: "clients.list",
    label: "Client List & Details",
    category: "Clients",
    module: "clients",
    action: "read",
    defaultPath: "/clients",
    patterns: [/^\/clients(?:\/|$)/],
  },
  {
    key: "clients.portfolio",
    label: "Client Portfolio",
    category: "Clients",
    module: "clients",
    action: "read",
    defaultPath: "/client-portfolio",
    patterns: [/^\/client-portfolio(?:\/|$)/],
  },
  {
    key: "clients.onboarding_queue",
    label: "Jobs Creation",
    category: "Clients",
    module: "clients",
    action: "read",
    defaultPath: "/client-onboarding-queue",
    patterns: [/^\/client-onboarding-queue(?:\/|$)/],
  },
  {
    key: "clients.engagement_letters",
    label: "Engagement Letters",
    category: "Clients",
    module: "clients",
    action: "read",
    defaultPath: "/engagement-letters",
    patterns: [/^\/engagement-letters(?:\/|$)/],
  },
  {
    key: "clients.business_development",
    label: "Business Development Pipeline",
    category: "Clients",
    module: "proposals",
    action: "read",
    defaultPath: "/business-development",
    patterns: [/^\/business-development(?:\/|$)/],
  },
  {
    key: "clients.surveys",
    label: "Client Surveys",
    category: "Clients",
    module: "surveys",
    action: "read",
    defaultPath: "/client-surveys",
    patterns: [/^\/client-surveys(?:\/|$)/],
  },
  {
    key: "jobs.admin_create",
    label: "Admin Job Creation",
    category: "Operations",
    module: "jobs",
    action: "write",
    defaultPath: "/admin-job-creation",
    patterns: [/^\/admin-job-creation(?:\/|$)/, /^\/jobs\/create(?:\/|$)/],
  },
  {
    key: "jobs.workflow",
    label: "Jobs & Workflow",
    category: "Operations",
    module: "jobs",
    action: "read",
    defaultPath: "/job-workflow-dashboard",
    patterns: [/^\/jobs(?:\/|$)/, /^\/job-workflow-dashboard(?:\/|$)/],
  },
  {
    key: "jobs.workload_management",
    label: "Workload Management",
    category: "Operations",
    module: "jobs",
    action: "read",
    defaultPath: "/workload-management",
    patterns: [/^\/workload-management(?:\/|$)/],
  },
  {
    key: "jobs.team_overview",
    label: "Team Overview",
    category: "Operations",
    module: "jobs",
    action: "read",
    defaultPath: "/team-overview",
    patterns: [/^\/team-overview(?:\/|$)/],
  },
  {
    key: "team.performance",
    label: "Team Performance",
    category: "Team Leadership",
    module: "reports",
    action: "read",
    defaultPath: "/team-performance",
    patterns: [/^\/team-performance(?:\/|$)/],
  },
  {
    key: "team.staff_development",
    label: "Staff Development",
    category: "Team Leadership",
    module: "evaluations",
    action: "read",
    defaultPath: "/staff-development",
    patterns: [/^\/staff-development(?:\/|$)/],
  },
  {
    key: "evaluations.management",
    label: "Evaluation Management",
    category: "Evaluations",
    module: "evaluations",
    action: "read",
    defaultPath: "/evaluations/cycles",
    patterns: [
      /^\/evaluation-management(?:\/|$)/,
      /^\/create-evaluation(?:\/|$)/,
      /^\/evaluations\/cycles(?:\/|$)/,
    ],
  },
  {
    key: "evaluations.manager_view",
    label: "Manager Evaluations",
    category: "Evaluations",
    module: "evaluations",
    action: "read",
    defaultPath: "/evaluations",
    patterns: [/^\/manager-evaluation(?:\/|$)/],
  },
  {
    key: "evaluations.project_view",
    label: "Project Evaluations",
    category: "Evaluations",
    module: "evaluations",
    action: "read",
    defaultPath: "/project-evaluations",
    patterns: [/^\/project-evaluations(?:\/|$)/],
  },
  {
    key: "evaluations.calibration",
    label: "Calibration",
    category: "Evaluations",
    module: "evaluations",
    action: "read",
    defaultPath: "/calibration",
    patterns: [/^\/calibration(?:\/|$)/],
  },
  {
    key: "kpi.management",
    label: "KPI Management",
    category: "Performance",
    module: "kpis",
    action: "read",
    defaultPath: "/kpi-management",
    patterns: [/^\/kpi-management(?:\/|$)/, /^\/evaluations\/kpis(?:\/|$)/],
  },
  {
    key: "finance.summary",
    label: "Financial Summary",
    category: "Finance",
    module: "finance",
    action: "read",
    defaultPath: "/financial-summary",
    patterns: [/^\/financial-summary(?:\/|$)/],
  },
  {
    key: "finance.collections",
    label: "Finance Collections",
    category: "Finance",
    module: "finance",
    action: "read",
    defaultPath: "/finance-collections",
    patterns: [/^\/finance-collections(?:\/|$)/],
  },
  {
    key: "finance.projections",
    label: "Finance Projections",
    category: "Finance",
    module: "finance",
    action: "read",
    defaultPath: "/finance-projections",
    patterns: [/^\/finance-projections(?:\/|$)/],
  },
  {
    key: "finance.balances",
    label: "Finance Balances",
    category: "Finance",
    module: "finance",
    action: "read",
    defaultPath: "/finance-balances",
    patterns: [/^\/finance-balances(?:\/|$)/],
  },
  {
    key: "finance.profitability",
    label: "Finance Profitability",
    category: "Finance",
    module: "finance",
    action: "read",
    defaultPath: "/finance-profitability",
    patterns: [/^\/finance-profitability(?:\/|$)/],
  },
  {
    key: "finance.allocations",
    label: "Finance Allocations",
    category: "Finance",
    module: "finance",
    action: "read",
    defaultPath: "/finance-allocations",
    patterns: [/^\/finance-allocations(?:\/|$)/],
  },
  {
    key: "reports.core",
    label: "Reports",
    category: "Reporting",
    module: "reports",
    action: "read",
    defaultPath: "/reports",
    patterns: [/^\/reports(?:\/|$)/, /^\/non-financial-analytics(?:\/|$)/],
  },
  {
    key: "reports.audit_logs",
    label: "Audit Logs",
    category: "Reporting",
    module: "reports",
    action: "read",
    defaultPath: "/audit-logs",
    patterns: [/^\/audit-logs(?:\/|$)/],
  },
  {
    key: "reports.ops_center",
    label: "Ops Center",
    category: "Reporting",
    module: "reports",
    action: "read",
    defaultPath: "/ops-center",
    patterns: [/^\/ops-center(?:\/|$)/],
  },
  {
    key: "analytics.employee",
    label: "Employee Analytics",
    category: "Analytics",
    module: "reports",
    action: "read",
    defaultPath: "/analytics/employee",
    patterns: [/^\/analytics\/employee(?:\/|$)/],
  },
  {
    key: "analytics.finance",
    label: "Finance Analytics",
    category: "Analytics",
    module: "reports",
    action: "read",
    defaultPath: "/analytics/finance",
    patterns: [/^\/analytics\/finance(?:\/|$)/],
  },
  {
    key: "analytics.marketing",
    label: "Marketing Analytics",
    category: "Analytics",
    module: "reports",
    action: "read",
    defaultPath: "/analytics/marketing",
    patterns: [/^\/analytics\/marketing(?:\/|$)/],
  },
  {
    key: "analytics.manager",
    label: "Manager Analytics",
    category: "Analytics",
    module: "reports",
    action: "read",
    defaultPath: "/analytics/manager",
    patterns: [/^\/analytics\/manager(?:\/|$)/],
  },
  {
    key: "analytics.partner",
    label: "Partner Analytics",
    category: "Analytics",
    module: "reports",
    action: "read",
    defaultPath: "/analytics/partner",
    patterns: [/^\/analytics\/partner(?:\/|$)/],
  },
  {
    key: "analytics.hr",
    label: "HR Analytics",
    category: "Analytics",
    module: "reports",
    action: "read",
    defaultPath: "/analytics/hr",
    patterns: [/^\/analytics\/hr(?:\/|$)/],
  },
  {
    key: "analytics.gmp",
    label: "GMP Analytics",
    category: "Analytics",
    module: "reports",
    action: "read",
    defaultPath: "/analytics/gmp",
    patterns: [/^\/analytics\/gmp(?:\/|$)/],
  },
  {
    key: "partner.metrics",
    label: "Partner Metrics",
    category: "Reporting",
    module: "reports",
    action: "read",
    defaultPath: "/partner-metrics",
    patterns: [/^\/partner-metrics(?:\/|$)/],
  },
  {
    key: "partner.portfolio_summary",
    label: "Partner Portfolio Summary",
    category: "Reporting",
    module: "reports",
    action: "read",
    defaultPath: "/partner-portfolio-summary",
    patterns: [/^\/partner-portfolio-summary(?:\/|$)/],
  },
];

const ALL_VIEW_KEYS = VIEW_PERMISSION_DEFINITIONS.map((definition) => definition.key);

const MARKETING_VIEW_KEYS = [
  "dashboard.marketing",
  "clients.list",
  "clients.create_edit",
  "clients.portfolio",
  "clients.onboarding_queue",
  "clients.engagement_letters",
  "clients.business_development",
  "clients.surveys",
  "analytics.marketing",
] as const;

const FINANCE_VIEW_KEYS = [
  "dashboard.finance",
  "finance.summary",
  "finance.collections",
  "finance.projections",
  "finance.balances",
  "finance.profitability",
  "finance.allocations",
  "analytics.finance",
] as const;

const MANAGER_VIEW_KEYS = [
  "dashboard.manager",
  "dashboard.department",
  "clients.list",
  "clients.portfolio",
  "jobs.workflow",
  "jobs.workload_management",
  "jobs.team_overview",
  "team.performance",
  "team.staff_development",
  "evaluations.management",
  "evaluations.manager_view",
  "evaluations.project_view",
  "kpi.management",
  "finance.summary",
  "reports.core",
  "analytics.manager",
] as const;

const PARTNER_VIEW_KEYS = [
  "dashboard.partner",
  "clients.portfolio",
  "clients.business_development",
  "jobs.workflow",
  "jobs.team_overview",
  "team.performance",
  "team.staff_development",
  "kpi.management",
  "partner.metrics",
  "partner.portfolio_summary",
  "evaluations.manager_view",
  "evaluations.project_view",
  "finance.summary",
  "reports.core",
  "analytics.partner",
] as const;

const GMP_VIEW_KEYS = [
  "dashboard.gmp",
  "dashboard.hr",
  "dashboard.partner",
  "dashboard.manager",
  "dashboard.department",
  "dashboard.marketing",
  "dashboard.finance",
  "people.employee_management",
  "people.positions_rates",
  "people.recruitment_candidates",
  "clients.list",
  "clients.create_edit",
  "clients.portfolio",
  "clients.onboarding_queue",
  "clients.engagement_letters",
  "clients.business_development",
  "clients.surveys",
  "jobs.workflow",
  "jobs.admin_create",
  "jobs.workload_management",
  "jobs.team_overview",
  "team.performance",
  "team.staff_development",
  "evaluations.management",
  "evaluations.manager_view",
  "evaluations.project_view",
  "evaluations.calibration",
  "kpi.management",
  "finance.summary",
  "finance.collections",
  "finance.projections",
  "finance.balances",
  "finance.profitability",
  "finance.allocations",
  "reports.core",
  "reports.audit_logs",
  "analytics.gmp",
  "partner.metrics",
  "partner.portfolio_summary",
] as const;

const HR_VIEW_KEYS = [
  "dashboard.hr",
  "dashboard.department",
  "dashboard.partner",
  "dashboard.manager",
  ...MARKETING_VIEW_KEYS,
  ...FINANCE_VIEW_KEYS,
  ...MANAGER_VIEW_KEYS,
  ...PARTNER_VIEW_KEYS,
  "people.employee_management",
  "people.role_access_management",
  "people.positions_rates",
  "people.recruitment_candidates",
  "jobs.admin_create",
  "evaluations.management",
  "evaluations.calibration",
  "kpi.management",
  "reports.audit_logs",
  "reports.ops_center",
  "analytics.hr",
] as const;

const EMPLOYEE_VIEW_KEYS = [
  "dashboard.employee",
  "kpi.management",
  "jobs.workflow",
  "finance.summary",
  "analytics.employee",
] as const;

const ROLE_VIEW_ENTITLEMENTS: Record<CanonicalRole, string[] | "*"> = {
  super_admin: "*",
  hr: [...COMMON_VIEW_KEYS, ...HR_VIEW_KEYS],
  gmp: [...COMMON_VIEW_KEYS, ...GMP_VIEW_KEYS],
  partner: [...COMMON_VIEW_KEYS, ...PARTNER_VIEW_KEYS],
  manager: [...COMMON_VIEW_KEYS, ...MANAGER_VIEW_KEYS],
  finance: [...COMMON_VIEW_KEYS, ...FINANCE_VIEW_KEYS, "kpi.management", "reports.core"],
  marketing: [...COMMON_VIEW_KEYS, ...MARKETING_VIEW_KEYS, "kpi.management", "reports.core"],
  employee: [...COMMON_VIEW_KEYS, ...EMPLOYEE_VIEW_KEYS],
};

const unique = (values: string[]) => Array.from(new Set(values));

const viewDefinitionsByKey = new Map(
  VIEW_PERMISSION_DEFINITIONS.map((definition) => [definition.key, definition] as const)
);

export const getViewPermissionDefinition = (viewKey: string) =>
  viewDefinitionsByKey.get(String(viewKey || "").toLowerCase()) || null;

export const resolveViewPermissionByPath = (pathname: string) => {
  const normalizedPathname = String(pathname || "/").toLowerCase();
  return (
    VIEW_PERMISSION_DEFINITIONS.find((definition) =>
      definition.patterns.some((pattern) => pattern.test(normalizedPathname))
    ) || null
  );
};

export const getRoleViewEntitlements = (role: CanonicalRole) => {
  const configured = ROLE_VIEW_ENTITLEMENTS[role];
  if (configured === "*") {
    return [...ALL_VIEW_KEYS];
  }
  return unique(configured || []);
};

export const getEffectiveViewEntitlements = (roles: CanonicalRole[]) => {
  if (roles.includes("super_admin")) {
    return [...ALL_VIEW_KEYS];
  }

  const combined = roles.flatMap((role) => getRoleViewEntitlements(role));
  return unique(combined);
};

const LANDING_VIEW_PRIORITY_BY_ROLE: Array<{ role: CanonicalRole; viewKey: string }> = [
  { role: "gmp", viewKey: "dashboard.gmp" },
  { role: "super_admin", viewKey: "dashboard.hr" },
  { role: "hr", viewKey: "dashboard.hr" },
  { role: "partner", viewKey: "dashboard.partner" },
  { role: "manager", viewKey: "dashboard.manager" },
  { role: "marketing", viewKey: "dashboard.marketing" },
  { role: "finance", viewKey: "dashboard.finance" },
  { role: "employee", viewKey: "dashboard.employee" },
];

const LANDING_FALLBACK_VIEW_PRIORITY = [
  "dashboard.employee",
  "profile.my",
  "jobs.workflow",
  "clients.list",
  "evaluations.my",
  "goals.my",
  "finance.summary",
  "clients.business_development",
  "clients.surveys",
  "knowledge.hub",
  "documents.workspace",
  "notifications.center",
  "reports.core",
];

export const resolvePreferredHomeRouteByViewAccess = (
  roles: CanonicalRole[],
  hasViewAccess: (viewKey: string) => boolean
) => {
  const roleSpecificCandidate = LANDING_VIEW_PRIORITY_BY_ROLE.find(
    (candidate) => roles.includes(candidate.role) && hasViewAccess(candidate.viewKey)
  );
  if (roleSpecificCandidate) {
    return getViewPermissionDefinition(roleSpecificCandidate.viewKey)?.defaultPath || "/dashboard";
  }

  const fallbackCandidate = LANDING_FALLBACK_VIEW_PRIORITY.find((viewKey) =>
    hasViewAccess(viewKey)
  );
  if (fallbackCandidate) {
    return getViewPermissionDefinition(fallbackCandidate)?.defaultPath || "/dashboard";
  }

  return "/auth";
};

export const getRoleViewMatrix = () =>
  Object.entries(ROLE_VIEW_ENTITLEMENTS).reduce(
    (acc, [role, configured]) => {
      acc[role] = configured === "*" ? [...ALL_VIEW_KEYS] : unique(configured);
      return acc;
    },
    {} as Record<string, string[]>
  );
