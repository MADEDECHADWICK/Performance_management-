import {
  EXPLICIT_NONE_VIEW_KEY,
  getDefaultRoleViewEntitlements,
  normalizeKnownViewKeys,
  resolvePreferredHomeViewKey,
  resolveViewAccessKeysForRoleEntries,
} from "./viewAccess.service";

describe("viewAccess.service", () => {
  it("falls back to default role entitlements when no explicit view policy exists", () => {
    const resolved = resolveViewAccessKeysForRoleEntries(
      [
        {
          role: {
            name: "manager",
            viewPermissions: [],
          },
        },
      ],
      ["manager"]
    );

    expect(resolved).toEqual(getDefaultRoleViewEntitlements("manager"));
  });

  it("respects an explicit empty view policy without falling back to defaults", () => {
    const resolved = resolveViewAccessKeysForRoleEntries(
      [
        {
          role: {
            name: "manager",
            viewPermissions: [{ viewPermission: { key: EXPLICIT_NONE_VIEW_KEY } }],
          },
        },
      ],
      ["manager"]
    );

    expect(resolved).toEqual([]);
  });

  it("keeps only known view keys and the explicit-none marker during normalization", () => {
    expect(
      normalizeKnownViewKeys([
        "dashboard.manager",
        "DASHBOARD.MANAGER",
        "unknown.view",
        EXPLICIT_NONE_VIEW_KEY,
      ])
    ).toEqual(["dashboard.manager", EXPLICIT_NONE_VIEW_KEY]);
  });

  it("prefers the role-specific home view when it is available", () => {
    expect(
      resolvePreferredHomeViewKey(["finance"], [
        "profile.my",
        "dashboard.finance",
      ])
    ).toBe("dashboard.finance");
  });
});
