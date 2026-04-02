// This module defines the canonical roles used in the system and provides utility functions for normalizing and validating role names.

// why is it important? Because it ensures consistency in role naming across the application, making it easier to manage permissions and access control. By normalizing role names, we can avoid issues caused by variations in formatting (e.g., "HR", "hr", "Hr") and ensure that all roles are treated uniformly. This is crucial for maintaining a secure and well-organized system.
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

// The normalization process includes:
// 1. Converting the input to a string (if it's not already).
// 2. Trimming leading and trailing whitespace.
// 3. Converting all characters to lowercase.
// 4. Replacing sequences of spaces and hyphens with a single underscore.
// 5. Collapsing multiple underscores into a single underscore.

// This ensures that different variations of role names are standardized to a consistent format, making it easier to compare and validate roles throughout the application.
const normalizeValue = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_");

const canonicalRoleSet = new Set<CanonicalRole>(CANONICAL_ROLES);// Using a Set allows for efficient lookups when validating role names.

export const normalizeRoleName = (value: unknown) => normalizeValue(value);

export const isCanonicalRole = (value: unknown): value is CanonicalRole =>
  canonicalRoleSet.has(normalizeValue(value) as CanonicalRole);// This function checks if a given value corresponds to one of the defined canonical roles after normalization. It returns true if the normalized value is a valid canonical role, and false otherwise.

// The resolveCanonicalRole function attempts to normalize the input value and then checks if it matches any of the canonical roles. If it does, it returns the corresponding CanonicalRole; otherwise, it returns null. This is useful for validating and converting user input into a standardized role format that the application can work with.
export const resolveCanonicalRole = (value: unknown): CanonicalRole | null => {
  const normalized = normalizeValue(value);
  if (!normalized) return null;
  return canonicalRoleSet.has(normalized as CanonicalRole)
    ? (normalized as CanonicalRole)
    : null;
};

// The canonicalizeRoleName function takes an input value, normalizes it, and then attempts to resolve it to a canonical role. If the normalized value matches a canonical role, it returns that role; otherwise, it returns the normalized value as is. This allows for flexible handling of role names while still ensuring that recognized roles are standardized.
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
