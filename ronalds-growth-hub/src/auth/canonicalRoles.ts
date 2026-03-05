//The system roles are defined here. They are used throughout the application to determine access levels and permissions for users. Each role has a specific set of permissions associated with it, which can be used to control access to various features and functionalities within the application. The roles are designed to be flexible and can be easily extended or modified as needed to accommodate changes in the application's requirements or user base.

export const CANONICAL_ROLES = [
  "super_admin",
  "hr",
  "gmp",
  "partner",
  "manager",
  "finance",
  "marketing",
  "employee",
] as const;

export type CanonicalRole = (typeof CANONICAL_ROLES)[number];

const normalizeValue = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_");
const canonicalRoleSet = new Set<CanonicalRole>(CANONICAL_ROLES);

export const normalizeRoleName = (value: unknown) => normalizeValue(value);

export const resolveCanonicalRole = (value: unknown): CanonicalRole | null => {
  const normalized = normalizeValue(value);
  if (!normalized) return null;
  return canonicalRoleSet.has(normalized as CanonicalRole)
    ? (normalized as CanonicalRole)
    : null;
};

export const canonicalizeRoles = (values: unknown[]): CanonicalRole[] => {
  const output: CanonicalRole[] = [];
  const seen = new Set<CanonicalRole>();

  values.forEach((value) => {
    const canonical = resolveCanonicalRole(value);
    if (!canonical || seen.has(canonical)) return;
    seen.add(canonical);
    output.push(canonical);
  });

  return output;
};

export const hasAnyCanonicalRole = (
  currentRoles: CanonicalRole[],
  expectedRoles: CanonicalRole[]
) => expectedRoles.some((role) => currentRoles.includes(role));

