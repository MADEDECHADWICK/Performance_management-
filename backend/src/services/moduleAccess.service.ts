export type ModuleAction = "read" | "write" | "approve" | "admin";

export const MODULE_ACTIONS: ModuleAction[] = ["read", "write", "approve", "admin"];

export const SYSTEM_MODULES = [
  {
    key: "dashboard",
    label: "Dashboards",
    description: "Role dashboards, portfolio summaries, and performance snapshots.",
  },
  {
    key: "users",
    label: "People & Access",
    description: "Employees, onboarding, offboarding, and role/access management.",
  },
  {
    key: "clients",
    label: "Clients",
    description: "Client records, onboarding queues, and engagement setup.",
  },
  {
    key: "jobs",
    label: "Jobs",
    description: "Job creation, staffing, costing, and delivery workflow.",
  },
  {
    key: "time_entries",
    label: "Time",
    description: "Timesheets, approvals, and budget overrun requests.",
  },
  {
    key: "evaluations",
    label: "Evaluations",
    description: "Evaluation cycles, assignments, reviews, and calibration workflows.",
  },
  {
    key: "kpis",
    label: "KPI & Goals",
    description: "KPIs, OKRs, assignments, and scorecards.",
  },
  {
    key: "finance",
    label: "Finance",
    description: "Financial summaries, profitability, collections, and allocations.",
  },
  {
    key: "finance_collections",
    label: "Finance Collections",
    description: "Collections capture, payment logging, and receivables tracking actions.",
  },
  {
    key: "finance_projections",
    label: "Finance Projections",
    description: "Projection planning, updates, and projection-vs-actual variance maintenance.",
  },
  {
    key: "proposals",
    label: "Business Development",
    description: "Proposals, pipeline, and conversion tracking.",
  },
  {
    key: "surveys",
    label: "Client Surveys",
    description: "Client satisfaction survey issuance and analysis.",
  },
  {
    key: "documents",
    label: "Documents",
    description: "Upload, verification, and controlled document access.",
  },
  {
    key: "knowledge_hub",
    label: "Knowledge Hub",
    description: "Shared accounting, tax, and audit resources across all modules.",
  },
  {
    key: "notifications",
    label: "Notifications",
    description: "Notification inboxes, templates, and announcements.",
  },
  {
    key: "reports",
    label: "Reports & Analytics",
    description: "Analytics, exports, and organization-wide reporting.",
  },
  {
    key: "settings",
    label: "System Settings",
    description: "System administration and configuration options.",
  },
  {
    key: "access_control",
    label: "Access Control",
    description: "Role-module permission policies managed by HR/Admin.",
  },
] as const;

export type ModuleKey = (typeof SYSTEM_MODULES)[number]["key"];

type ModuleAccessMatrix = Record<ModuleKey, ModuleAction[]>;

export type RoleModulePolicyInput = {
  roleName: string;
  permissionKeys?: string[] | null;
};

export const EXPLICIT_NONE_PERMISSION_KEY = "module.__none__";

const moduleKeySet = new Set<ModuleKey>(SYSTEM_MODULES.map((module) => module.key));

const IMPLIED_ACTIONS: Record<ModuleAction, ModuleAction[]> = {
  read: ["read"],
  write: ["read", "write"],
  approve: ["read", "approve"],
  admin: ["read", "write", "approve", "admin"],
};

const ALL_MODULE_ACTIONS: ModuleAction[] = ["read", "write", "approve", "admin"];

// Baseline personal workspace access that every authenticated role should retain.
// This keeps "My Performance" and personal evaluation workflows available
// across all role dashboards even when role module policies are narrowed.
const SELF_SERVICE_BASELINE_ACCESS: Partial<Record<ModuleKey, ModuleAction[]>> = {
  dashboard: ["read"],
  users: ["read"],
  time_entries: ["write"],
  evaluations: ["write"],
  kpis: ["write"],
  knowledge_hub: ["read"],
};

const FULL_SYSTEM_ACCESS_ROLES = new Set(["super_admin", "admin", "hr", "hr_manager"]);

const ROLE_MODULE_FALLBACK: Record<string, Partial<Record<ModuleKey | "*", ModuleAction[]>>> = {
  super_admin: { "*": ["admin"] },
  admin: { "*": ["admin"] },
  hr: { "*": ["admin"] },
  hr_manager: { "*": ["admin"] },
  gmp: {
    dashboard: ["admin"],
    reports: ["admin"],
    finance: ["read"],
    jobs: ["read"],
    clients: ["read"],
    evaluations: ["read"],
    proposals: ["read"],
    surveys: ["read"],
    knowledge_hub: ["read"],
    notifications: ["write"],
  },
  group_managing_partner: {
    dashboard: ["admin"],
    reports: ["admin"],
    finance: ["read"],
    jobs: ["read"],
    clients: ["read"],
    evaluations: ["read"],
    proposals: ["read"],
    surveys: ["read"],
    knowledge_hub: ["read"],
    notifications: ["write"],
  },
  partner: {
    dashboard: ["read"],
    clients: ["write"],
    jobs: ["write"],
    time_entries: ["approve"],
    evaluations: ["approve"],
    kpis: ["read"],
    finance: ["read"],
    proposals: ["read"],
    surveys: ["read"],
    documents: ["read"],
    knowledge_hub: ["read"],
    reports: ["read"],
    notifications: ["write"],
  },
  manager: {
    dashboard: ["read"],
    clients: ["read"],
    jobs: ["write"],
    time_entries: ["approve"],
    evaluations: ["write"],
    kpis: ["read"],
    documents: ["read"],
    knowledge_hub: ["read"],
    reports: ["read"],
    notifications: ["write"],
  },
  finance: {
    dashboard: ["read"],
    finance: ["admin"],
    finance_collections: ["admin"],
    finance_projections: ["admin"],
    reports: ["admin"],
    clients: ["read"],
    jobs: ["read"],
    proposals: ["read"],
    surveys: ["read"],
    documents: ["read"],
    knowledge_hub: ["read"],
    notifications: ["write"],
  },
  marketing: {
    dashboard: ["read"],
    clients: ["write"],
    proposals: ["admin"],
    surveys: ["write"],
    documents: ["read"],
    knowledge_hub: ["read"],
    reports: ["read"],
    notifications: ["write"],
  },
  employee: {
    dashboard: ["read"],
    time_entries: ["write"],
    evaluations: ["write"],
    kpis: ["write"],
    documents: ["write"],
    knowledge_hub: ["read"],
    notifications: ["write"],
  },
};

const normalizeRole = (value: string) => value.toLowerCase().trim();

export const isModuleKey = (value: string): value is ModuleKey =>
  moduleKeySet.has(value as ModuleKey);

export const isModuleAction = (value: string): value is ModuleAction =>
  (MODULE_ACTIONS as string[]).includes(value);

export const toPermissionKey = (moduleKey: ModuleKey, action: ModuleAction) =>
  `module.${moduleKey}.${action}`;

const addActionToMatrix = (
  matrix: ModuleAccessMatrix,
  moduleKey: ModuleKey,
  action: ModuleAction
) => {
  const existing = new Set<ModuleAction>(matrix[moduleKey]);
  IMPLIED_ACTIONS[action].forEach((item) => existing.add(item));
  matrix[moduleKey] = Array.from(existing);
};

const createEmptyMatrix = (): ModuleAccessMatrix =>
  SYSTEM_MODULES.reduce((acc, module) => {
    acc[module.key] = [];
    return acc;
  }, {} as ModuleAccessMatrix);

const parsePermissionKey = (
  permissionKey: string
):
  | { moduleKey: ModuleKey | "*"; action: ModuleAction | "*" }
  | null => {
  const parts = permissionKey.toLowerCase().split(".");
  if (parts.length !== 3 || parts[0] !== "module") return null;

  const modulePart = parts[1];
  const actionPart = parts[2];

  if (modulePart !== "*" && !isModuleKey(modulePart)) return null;
  if (actionPart !== "*" && !isModuleAction(actionPart)) return null;

  return {
    moduleKey: modulePart === "*" ? "*" : modulePart,
    action: actionPart === "*" ? "*" : actionPart,
  };
};

const normalizeModulePermissionKeys = (permissionKeys: string[] | null | undefined) => {
  if (!permissionKeys || permissionKeys.length === 0) return [];
  return Array.from(
    new Set(
      permissionKeys
        .map((key) => String(key).toLowerCase().trim())
        .filter((key) => key === EXPLICIT_NONE_PERMISSION_KEY || !!parsePermissionKey(key))
    )
  );
};

const applyParsedPermission = (
  matrix: ModuleAccessMatrix,
  parsed: { moduleKey: ModuleKey | "*"; action: ModuleAction | "*" }
) => {
  const moduleKeys: ModuleKey[] =
    parsed.moduleKey === "*"
      ? SYSTEM_MODULES.map((module) => module.key)
      : [parsed.moduleKey];

  const actions: ModuleAction[] =
    parsed.action === "*" ? ALL_MODULE_ACTIONS : [parsed.action];

  moduleKeys.forEach((moduleKey) => {
    actions.forEach((action) => addActionToMatrix(matrix, moduleKey, action));
  });
};

const applyFallbackRoleAccess = (
  matrix: ModuleAccessMatrix,
  roles: string[]
) => {
  roles.map(normalizeRole).forEach((roleName) => {
    const policy = ROLE_MODULE_FALLBACK[roleName];
    if (!policy) return;

    Object.entries(policy).forEach(([moduleName, actions]) => {
      if (!actions || actions.length === 0) return;

      const moduleKeys: ModuleKey[] =
        moduleName === "*"
          ? SYSTEM_MODULES.map((module) => module.key)
          : isModuleKey(moduleName)
            ? [moduleName]
            : [];

      moduleKeys.forEach((moduleKey) => {
        actions.forEach((action) => {
          if (!isModuleAction(action)) return;
          addActionToMatrix(matrix, moduleKey, action);
        });
      });
    });
  });
};

const applySelfServiceBaselineAccess = (matrix: ModuleAccessMatrix) => {
  Object.entries(SELF_SERVICE_BASELINE_ACCESS).forEach(([moduleName, actions]) => {
    if (!isModuleKey(moduleName)) return;
    if (!actions || actions.length === 0) return;
    actions.forEach((action) => {
      if (!isModuleAction(action)) return;
      addActionToMatrix(matrix, moduleName, action);
    });
  });
};

const shouldApplySelfServiceBaseline = (input: {
  roles?: string[] | null;
  rolePolicies?: RoleModulePolicyInput[] | null;
}) =>
  Boolean(
    (Array.isArray(input.rolePolicies) && input.rolePolicies.length > 0) ||
      (Array.isArray(input.roles) && input.roles.length > 0)
  );

const applyRolePolicyAccess = (
  matrix: ModuleAccessMatrix,
  rolePolicies: RoleModulePolicyInput[]
) => {
  rolePolicies.forEach((rolePolicy) => {
    const roleName = normalizeRole(rolePolicy.roleName);
    if (!roleName) return;
    if (FULL_SYSTEM_ACCESS_ROLES.has(roleName)) {
      applyFallbackRoleAccess(matrix, [roleName]);
      return;
    }

    const modulePermissionKeys = normalizeModulePermissionKeys(rolePolicy.permissionKeys);
    const explicitNone = modulePermissionKeys.includes(EXPLICIT_NONE_PERMISSION_KEY);
    const effectiveModulePermissions = modulePermissionKeys.filter(
      (permissionKey) => permissionKey !== EXPLICIT_NONE_PERMISSION_KEY
    );

    // Strict mode:
    // If a role has explicit module.* permissions, that role is governed only by those keys.
    // If a role is explicitly marked as none, fallback map does not apply.
    // If a role has no explicit module.* permissions and no explicit-none marker, fallback map applies.
    if (explicitNone || effectiveModulePermissions.length > 0) {
      effectiveModulePermissions.forEach((permissionKey) => {
        const parsed = parsePermissionKey(permissionKey);
        if (!parsed) return;
        applyParsedPermission(matrix, parsed);
      });
      return;
    }

    applyFallbackRoleAccess(matrix, [roleName]);
  });
};

export const matrixToPermissionKeys = (matrix: Partial<Record<ModuleKey, ModuleAction[]>>) => {
  const keys: string[] = [];
  SYSTEM_MODULES.forEach((module) => {
    const actions = matrix[module.key] || [];
    const unique = Array.from(new Set(actions.filter((action) => isModuleAction(action))));
    unique.forEach((action) => keys.push(toPermissionKey(module.key, action)));
  });
  return keys;
};

export const buildModuleAccessMatrix = (input: {
  roles?: string[] | null;
  permissionKeys?: string[] | null;
  rolePolicies?: RoleModulePolicyInput[] | null;
}): ModuleAccessMatrix => {
  const matrix = createEmptyMatrix();
  const applySelfServiceBaseline = shouldApplySelfServiceBaseline(input);

  if (input.rolePolicies && input.rolePolicies.length > 0) {
    applyRolePolicyAccess(matrix, input.rolePolicies);
    if (applySelfServiceBaseline) {
      applySelfServiceBaselineAccess(matrix);
    }
    return matrix;
  }

  const permissionKeys = input.permissionKeys || [];
  permissionKeys.forEach((permissionKey) => {
    const parsed = parsePermissionKey(permissionKey);
    if (!parsed) return;
    applyParsedPermission(matrix, parsed);
  });

  applyFallbackRoleAccess(matrix, input.roles || []);
  if (applySelfServiceBaseline) {
    applySelfServiceBaselineAccess(matrix);
  }
  return matrix;
};

export const hasModuleAccess = (params: {
  moduleKey: ModuleKey;
  action: ModuleAction;
  roles?: string[] | null;
  permissionKeys?: string[] | null;
  rolePolicies?: RoleModulePolicyInput[] | null;
}) => {
  const matrix = buildModuleAccessMatrix({
    roles: params.roles,
    permissionKeys: params.permissionKeys,
    rolePolicies: params.rolePolicies,
  });
  const allowed = new Set(matrix[params.moduleKey] || []);
  return allowed.has(params.action) || allowed.has("admin");
};

export const methodToModuleAction = (method: string): ModuleAction => {
  const normalized = method.toUpperCase();
  if (normalized === "GET" || normalized === "HEAD" || normalized === "OPTIONS") {
    return "read";
  }
  if (normalized === "POST") return "write";
  if (normalized === "DELETE") return "write";
  return "write";
};

export const moduleCatalog = SYSTEM_MODULES.map((module) => ({
  ...module,
  actions: MODULE_ACTIONS,
}));
