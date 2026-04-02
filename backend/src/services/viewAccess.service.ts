import type { Prisma } from "@prisma/client";
import prisma from "../prisma";
import {
  type CanonicalRole,
  canonicalizeRoleName,
  canonicalizeRoles,
  resolveCanonicalRole,
} from "../auth/canonicalRoles";

export const EXPLICIT_NONE_VIEW_KEY = "view.__none__";

export const ALL_VIEW_KEYS = [
  "dashboard.employee",
  "dashboard.hr",
  "dashboard.gmp",
  "dashboard.partner",
  "dashboard.manager",
  "dashboard.department",
  "dashboard.marketing",
  "dashboard.finance",
  "profile.my",
  "evaluations.my",
  "feedback.continuous",
  "timesheets.my",
  "leave.admin",
  "leave.approvals",
  "leave.my",
  "requisitions.admin",
  "requisitions.approvals",
  "requisitions.my",
  "development.plan",
  "documents.workspace",
  "knowledge.hub",
  "notifications.center",
  "todos.my",
  "people.employee_management",
  "people.role_access_management",
  "people.positions_rates",
  "people.recruitment_candidates",
  "clients.create_edit",
  "clients.list",
  "clients.portfolio",
  "clients.onboarding_queue",
  "clients.engagement_letters",
  "clients.business_development",
  "clients.surveys",
  "jobs.admin_create",
  "jobs.workflow",
  "jobs.workload_management",
  "jobs.team_overview",
  "team.performance",
  "team.staff_development",
  "evaluations.management",
  "evaluations.project_view",
  "evaluations.calibration",
  "finance.summary",
  "finance.collections",
  "finance.projections",
  "finance.balances",
  "finance.profitability",
  "finance.allocations",
  "reports.workspace",
  "reports.audit_logs",
  "reports.ops_center",
  "analytics.employee",
  "analytics.finance",
  "analytics.marketing",
  "analytics.manager",
  "analytics.partner",
  "analytics.hr",
  "analytics.gmp",
  "partner.metrics",
  "partner.portfolio_summary",
] as const;

const COMMON_VIEW_KEYS = [
  "profile.my",
  "evaluations.my",
  "feedback.continuous",
  "timesheets.my",
  "leave.my",
  "requisitions.my",
  "development.plan",
  "documents.workspace",
  "knowledge.hub",
  "notifications.center",
  "todos.my",
] as const;

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
  "leave.approvals",
  "requisitions.approvals",
  "clients.list",
  "clients.portfolio",
  "jobs.workflow",
  "jobs.workload_management",
  "jobs.team_overview",
  "team.performance",
  "team.staff_development",
  "evaluations.management",
  "evaluations.project_view",
  "finance.summary",
  "reports.workspace",
  "analytics.manager",
] as const;

const PARTNER_VIEW_KEYS = [
  "dashboard.partner",
  "leave.approvals",
  "requisitions.approvals",
  "clients.portfolio",
  "clients.business_development",
  "jobs.workflow",
  "jobs.team_overview",
  "team.performance",
  "team.staff_development",
  "partner.metrics",
  "partner.portfolio_summary",
  "reports.workspace",
  "evaluations.project_view",
  "finance.summary",
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
  "leave.approvals",
  "leave.admin",
  "requisitions.approvals",
  "requisitions.admin",
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
  "evaluations.project_view",
  "evaluations.calibration",
  "finance.summary",
  "finance.collections",
  "finance.projections",
  "finance.balances",
  "finance.profitability",
  "finance.allocations",
  "reports.workspace",
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
  "leave.approvals",
  "leave.admin",
  "requisitions.approvals",
  "requisitions.admin",
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
  "reports.workspace",
  "reports.audit_logs",
  "reports.ops_center",
  "analytics.hr",
] as const;

const EMPLOYEE_VIEW_KEYS = [
  "dashboard.employee",
  "jobs.workflow",
  "finance.summary",
  "reports.workspace",
  "analytics.employee",
] as const;

const DEFAULT_ROLE_VIEW_ENTITLEMENTS: Record<CanonicalRole, readonly string[] | "*"> = {
  super_admin: "*",
  hr: [...COMMON_VIEW_KEYS, ...HR_VIEW_KEYS],
  gmp: [...COMMON_VIEW_KEYS, ...GMP_VIEW_KEYS],
  partner: [...COMMON_VIEW_KEYS, ...PARTNER_VIEW_KEYS],
  manager: [...COMMON_VIEW_KEYS, ...MANAGER_VIEW_KEYS],
  finance: [...COMMON_VIEW_KEYS, ...FINANCE_VIEW_KEYS],
  marketing: [...COMMON_VIEW_KEYS, ...MARKETING_VIEW_KEYS],
  employee: [...COMMON_VIEW_KEYS, ...EMPLOYEE_VIEW_KEYS],
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
  "finance.summary",
  "clients.business_development",
  "clients.surveys",
  "knowledge.hub",
  "documents.workspace",
  "notifications.center",
];

const allViewKeySet = new Set<string>(ALL_VIEW_KEYS);

const unique = (values: string[]) => Array.from(new Set(values));

export const normalizeViewKey = (value: unknown) =>
  String(value || "").toLowerCase().trim();

export const isKnownViewKey = (value: unknown) => allViewKeySet.has(normalizeViewKey(value));

const toStoredViewPermissionKeys = (source: unknown) => {
  if (!Array.isArray(source)) return [];
  return unique(
    source
      .map((entry) =>
        normalizeViewKey(
          (entry as any)?.viewPermission?.key ??
            (entry as any)?.permission?.key ??
            (entry as any)?.key
        )
      )
      .filter(Boolean)
  );
};

const parsePersistedViewKeys = (viewKeys: string[]) => {
  const normalized = unique(viewKeys.map((key) => normalizeViewKey(key)).filter(Boolean));
  if (normalized.length === 0) {
    return {
      hasExplicitConfiguration: false,
      effectiveViewKeys: [] as string[],
    };
  }

  if (normalized.includes(EXPLICIT_NONE_VIEW_KEY)) {
    return {
      hasExplicitConfiguration: true,
      effectiveViewKeys: [] as string[],
    };
  }

  return {
    hasExplicitConfiguration: true,
    effectiveViewKeys: normalized.filter((key) => isKnownViewKey(key)),
  };
};

export const listKnownViewKeys = () => [...ALL_VIEW_KEYS];

export const normalizeKnownViewKeys = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return unique(
    value
      .map((item) => normalizeViewKey(item))
      .filter((key) => key === EXPLICIT_NONE_VIEW_KEY || isKnownViewKey(key))
  );
};

export const getDefaultRoleViewEntitlements = (role: CanonicalRole) => {
  const configured = DEFAULT_ROLE_VIEW_ENTITLEMENTS[role];
  if (configured === "*") {
    return [...ALL_VIEW_KEYS];
  }
  return unique([...configured]);
};

export const getDefaultEffectiveViewEntitlements = (roles: CanonicalRole[]) => {
  if (roles.includes("super_admin")) {
    return [...ALL_VIEW_KEYS];
  }

  return unique(
    roles.flatMap((role) => getDefaultRoleViewEntitlements(role))
  );
};

export const resolvePreferredHomeViewKey = (
  roles: CanonicalRole[],
  viewAccessKeys: string[]
) => {
  const allowedViewSet = new Set(
    viewAccessKeys.map((viewKey) => normalizeViewKey(viewKey)).filter(Boolean)
  );

  const roleSpecificCandidate = LANDING_VIEW_PRIORITY_BY_ROLE.find(
    (candidate) => roles.includes(candidate.role) && allowedViewSet.has(candidate.viewKey)
  );
  if (roleSpecificCandidate) {
    return roleSpecificCandidate.viewKey;
  }

  return (
    LANDING_FALLBACK_VIEW_PRIORITY.find((viewKey) => allowedViewSet.has(viewKey)) || null
  );
};

export const resolveViewAccessKeysForRoleEntries = (
  roleEntries: Array<{ role?: { name?: string | null; viewPermissions?: unknown[] | null } | null }>,
  fallbackRoles: CanonicalRole[]
) => {
  let hasExplicitConfiguration = false;

  const resolved = unique(
    roleEntries.flatMap((entry) => {
      const roleName = canonicalizeRoleName(entry?.role?.name || "");
      const persisted = parsePersistedViewKeys(
        toStoredViewPermissionKeys(entry?.role?.viewPermissions)
      );

      if (persisted.hasExplicitConfiguration) {
        hasExplicitConfiguration = true;
        return persisted.effectiveViewKeys;
      }

      const canonicalRole = resolveCanonicalRole(roleName);
      return canonicalRole ? getDefaultRoleViewEntitlements(canonicalRole) : [];
    })
  );

  if (resolved.length > 0 || hasExplicitConfiguration) {
    return resolved;
  }

  return getDefaultEffectiveViewEntitlements(fallbackRoles);
};

type PrismaClientLike = Prisma.TransactionClient | typeof prisma;

const upsertViewPermissions = async (db: PrismaClientLike, viewKeys: string[]) => {
  const normalizedKeys = unique(
    viewKeys.map((viewKey) => normalizeViewKey(viewKey)).filter(Boolean)
  );

  return Promise.all(
    normalizedKeys.map((key) =>
      db.viewPermission.upsert({
        where: { key },
        update: {},
        create: { key },
      })
    )
  );
};

type RoleWithViewPermissions = {
  id: number;
  name: string;
  isActive: boolean;
  viewPermissions: Array<{ viewPermission: { key: string } }>;
};

export const toRoleViewPolicySummary = (role: RoleWithViewPermissions) => {
  const persisted = parsePersistedViewKeys(
    toStoredViewPermissionKeys(role.viewPermissions)
  );
  const canonicalRole = resolveCanonicalRole(role.name);

  return {
    id: role.id,
    name: role.name,
    isActive: role.isActive,
    hasExplicitConfiguration: persisted.hasExplicitConfiguration,
    explicitViewKeys: persisted.effectiveViewKeys,
    effectiveViewKeys:
      persisted.hasExplicitConfiguration && !canonicalRole
        ? persisted.effectiveViewKeys
        : persisted.hasExplicitConfiguration
          ? persisted.effectiveViewKeys
          : canonicalRole
            ? getDefaultRoleViewEntitlements(canonicalRole)
            : [],
  };
};

export const listRoleViewPolicies = async () => {
  const roles = await prisma.authRole.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    include: {
      viewPermissions: {
        include: {
          viewPermission: {
            select: { key: true },
          },
        },
      },
    },
  });

  return roles.map((role) => toRoleViewPolicySummary(role));
};

export const replaceRoleViewPermissions = async (
  db: PrismaClientLike,
  roleId: number,
  viewKeys: string[]
) => {
  const normalizedViewKeys = normalizeKnownViewKeys(viewKeys);

  await db.authRoleViewPermission.deleteMany({
    where: { roleId },
  });

  if (normalizedViewKeys.length === 0) {
    return [];
  }

  const viewPermissions = await upsertViewPermissions(db, normalizedViewKeys);
  await db.authRoleViewPermission.createMany({
    data: viewPermissions.map((viewPermission) => ({
      roleId,
      viewPermissionId: viewPermission.id,
    })),
    skipDuplicates: true,
  });

  return normalizedViewKeys;
};

export const seedDefaultRoleViewPermissions = async (
  db: PrismaClientLike = prisma
) => {
  const roles = await db.authRole.findMany({
    where: {
      name: {
        in: canonicalizeRoles([
          "super_admin",
          "hr",
          "gmp",
          "partner",
          "manager",
          "finance",
          "marketing",
          "employee",
        ]),
      },
    },
    select: {
      id: true,
      name: true,
      viewPermissions: {
        select: { viewPermissionId: true },
      },
    },
  });

  await upsertViewPermissions(db, [...ALL_VIEW_KEYS]);

  for (const role of roles) {
    if (role.viewPermissions.length > 0) {
      continue;
    }

    const canonicalRole = resolveCanonicalRole(role.name);
    if (!canonicalRole) continue;
    await replaceRoleViewPermissions(
      db,
      role.id,
      getDefaultRoleViewEntitlements(canonicalRole)
    );
  }
};
