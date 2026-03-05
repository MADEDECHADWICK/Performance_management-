import type { CanonicalRole } from "../auth/canonicalRoles";

type OnboardingGateProfileState = {
  onboardingStatus?: string | null;
  onboardingChecklistCompleted?: boolean | null;
  inductionCompleted?: boolean | null;
};

type OnboardingGateDecisionInput = {
  requestPath?: string | null;
  roles?: CanonicalRole[] | null;
  profile?: OnboardingGateProfileState | null;
};

const ONBOARDING_COMPLETED_STATUS = "completed";

const ONBOARDING_GATE_EXEMPT_ROLES = new Set<CanonicalRole>([
  "super_admin",
  "hr",
  "gmp",
]);

const ONBOARDING_GATE_ALLOWLIST_PREFIXES = [
  "/api/auth/me",
  "/api/auth/logout",
  "/api/auth/debug-me",
  "/api/onboarding",
  "/api/induction-checklist",
  "/api/profiles",
  "/api/documents",
  "/api/notifications",
];

const normalizePath = (value?: string | null) => {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .split("?")[0]
    .replace(/\/+/g, "/");
  if (!raw) return "/";
  if (raw.length > 1 && raw.endsWith("/")) return raw.slice(0, -1);
  return raw;
};

const matchesPrefix = (path: string, prefix: string) =>
  path === prefix || path.startsWith(`${prefix}/`);

export const isOnboardingPending = (profile?: OnboardingGateProfileState | null) => {
  if (!profile) return false;
  const status = String(profile.onboardingStatus || "").toLowerCase().trim();
  return (
    status !== ONBOARDING_COMPLETED_STATUS ||
    !profile.onboardingChecklistCompleted ||
    !profile.inductionCompleted
  );
};

export const isOnboardingGateExempt = (roles?: CanonicalRole[] | null) =>
  (roles || []).some((role) => ONBOARDING_GATE_EXEMPT_ROLES.has(role));

export const isOnboardingGateAllowlistedPath = (requestPath?: string | null) => {
  const normalizedPath = normalizePath(requestPath);
  return ONBOARDING_GATE_ALLOWLIST_PREFIXES.some((prefix) =>
    matchesPrefix(normalizedPath, prefix)
  );
};

export const shouldEnforceOnboardingGate = (input: OnboardingGateDecisionInput) => {
  if (isOnboardingGateExempt(input.roles)) return false;
  if (!isOnboardingPending(input.profile)) return false;
  if (isOnboardingGateAllowlistedPath(input.requestPath)) return false;
  return true;
};

