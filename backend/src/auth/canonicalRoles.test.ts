import {
  CANONICAL_ROLES,
  canonicalizeRoleName,
  canonicalizeRoles,
  isCanonicalRole,
  normalizeRoleName,
  resolveCanonicalRole,
} from "./canonicalRoles";

describe("canonical role helpers", () => {
  describe("normalizeRoleName", () => {
    it("normalizes casing, spacing, and hyphens", () => {
      expect(normalizeRoleName("  SUPER-ADMIN  ")).toBe("super_admin");
      expect(normalizeRoleName("finance   manager")).toBe("finance_manager");
      expect(normalizeRoleName("gmp__lead")).toBe("gmp_lead");
    });

    it("returns empty string for empty-like values", () => {
      expect(normalizeRoleName("")).toBe("");
      expect(normalizeRoleName(undefined)).toBe("");
      expect(normalizeRoleName(null)).toBe("");
      expect(normalizeRoleName(0)).toBe("");
    });
  });

  describe("isCanonicalRole", () => {
    it("accepts canonical roles and normalized canonical variants", () => {
      expect(isCanonicalRole("hr")).toBe(true);
      expect(isCanonicalRole("SUPER-ADMIN")).toBe(true);
      expect(isCanonicalRole(" manager ")).toBe(true);
    });

    it("rejects non-canonical role names", () => {
      expect(isCanonicalRole("admin")).toBe(false);
      expect(isCanonicalRole("human_resources")).toBe(false);
      expect(isCanonicalRole("finance_manager")).toBe(false);
    });
  });

  describe("resolveCanonicalRole", () => {
    it("returns canonical role when recognized", () => {
      expect(resolveCanonicalRole("SUPER-ADMIN")).toBe("super_admin");
      expect(resolveCanonicalRole("HR")).toBe("hr");
      expect(resolveCanonicalRole("marketing")).toBe("marketing");
    });

    it("returns null for invalid roles", () => {
      expect(resolveCanonicalRole("admin")).toBeNull();
      expect(resolveCanonicalRole("human resources")).toBeNull();
      expect(resolveCanonicalRole("")).toBeNull();
      expect(resolveCanonicalRole(undefined)).toBeNull();
    });
  });

  describe("canonicalizeRoleName", () => {
    it("returns canonical role for canonical-compatible inputs", () => {
      expect(canonicalizeRoleName(" SUPER-ADMIN ")).toBe("super_admin");
      expect(canonicalizeRoleName("HR")).toBe("hr");
    });

    it("returns normalized non-canonical value when not recognized", () => {
      expect(canonicalizeRoleName("Human Resources")).toBe("human_resources");
      expect(canonicalizeRoleName("Finance Manager")).toBe("finance_manager");
    });

    it("returns empty string for empty-like inputs", () => {
      expect(canonicalizeRoleName("")).toBe("");
      expect(canonicalizeRoleName(undefined)).toBe("");
    });
  });

  describe("canonicalizeRoles", () => {
    it("keeps canonical roles only, deduped, in first-seen order", () => {
      expect(
        canonicalizeRoles([
          "HR",
          "manager",
          " hr ",
          "SUPER-ADMIN",
          "manager",
          "super_admin",
          "partner",
        ])
      ).toEqual(["hr", "manager", "super_admin", "partner"]);
    });

    it("drops invalid or non-canonical roles", () => {
      expect(
        canonicalizeRoles([
          "human resources",
          "admin",
          "finance manager",
          "",
          undefined,
          "employee",
        ])
      ).toEqual(["employee"]);
    });
  });

  describe("CANONICAL_ROLES", () => {
    it("contains unique canonical role identifiers", () => {
      expect(new Set(CANONICAL_ROLES).size).toBe(CANONICAL_ROLES.length);
    });
  });
});
