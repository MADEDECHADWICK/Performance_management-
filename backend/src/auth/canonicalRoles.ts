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

export const isCanonicalRole = (value: unknown): value is CanonicalRole =>
  canonicalRoleSet.has(normalizeValue(value) as CanonicalRole);

export const resolveCanonicalRole = (value: unknown): CanonicalRole | null => {
  const normalized = normalizeValue(value);
  if (!normalized) return null;
  return canonicalRoleSet.has(normalized as CanonicalRole)
    ? (normalized as CanonicalRole)
    : null;
};

export const canonicalizeRoleName = (value: unknown) => {
  const normalized = normalizeValue(value);
  if (!normalized) return "";
  const canonical = resolveCanonicalRole(normalized);
  return canonical || normalized;
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
