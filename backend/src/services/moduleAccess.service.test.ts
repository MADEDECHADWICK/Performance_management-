import {
  EXPLICIT_NONE_PERMISSION_KEY,
  buildModuleAccessMatrix,
  hasModuleAccess,
} from "./moduleAccess.service";

const toActionSet = (actions: string[]) => new Set(actions);

describe("moduleAccess.service strict role policy mode", () => {
  it("uses explicit module permissions for a role instead of fallback", () => {
    const matrix = buildModuleAccessMatrix({
      rolePolicies: [
        {
          roleName: "partner",
          permissionKeys: ["module.jobs.read"],
        },
      ],
    });

    expect(toActionSet(matrix.jobs)).toEqual(new Set(["read"]));
    expect(matrix.finance).toEqual([]);
    expect(matrix.time_entries).toEqual([]);
  });

  it("falls back to default role policy when a role has no explicit module permissions", () => {
    const matrix = buildModuleAccessMatrix({
      rolePolicies: [
        {
          roleName: "partner",
          permissionKeys: [],
        },
      ],
    });

    expect(toActionSet(matrix.jobs)).toEqual(new Set(["read", "write"]));
    expect(toActionSet(matrix.time_entries)).toEqual(new Set(["read", "approve"]));
    expect(toActionSet(matrix.finance)).toEqual(new Set(["read"]));
  });

  it("combines multiple roles while keeping strict behavior per role", () => {
    const matrix = buildModuleAccessMatrix({
      rolePolicies: [
        {
          roleName: "partner",
          permissionKeys: ["module.jobs.read"],
        },
        {
          roleName: "employee",
          permissionKeys: [],
        },
      ],
    });

    expect(toActionSet(matrix.jobs)).toEqual(new Set(["read"]));
    expect(toActionSet(matrix.time_entries)).toEqual(new Set(["read", "write"]));
    expect(matrix.finance).toEqual([]);
  });

  it("supports wildcard explicit permissions in strict mode", () => {
    const matrix = buildModuleAccessMatrix({
      rolePolicies: [
        {
          roleName: "manager",
          permissionKeys: ["module.*.read"],
        },
      ],
    });

    expect(matrix.finance).toEqual(["read"]);
    expect(matrix.users).toEqual(["read"]);
    expect(matrix.jobs).toEqual(["read"]);
  });

  it("keeps legacy behavior when rolePolicies are not provided", () => {
    const matrix = buildModuleAccessMatrix({
      roles: ["partner"],
      permissionKeys: ["module.finance.admin"],
    });

    expect(toActionSet(matrix.jobs)).toEqual(new Set(["read", "write"]));
    expect(toActionSet(matrix.finance)).toEqual(new Set(["read", "write", "approve", "admin"]));
  });

  it("hasModuleAccess evaluates strict role policies correctly", () => {
    const canReadJobs = hasModuleAccess({
      moduleKey: "jobs",
      action: "read",
      rolePolicies: [
        {
          roleName: "partner",
          permissionKeys: ["module.jobs.read"],
        },
      ],
    });

    const canWriteJobs = hasModuleAccess({
      moduleKey: "jobs",
      action: "write",
      rolePolicies: [
        {
          roleName: "partner",
          permissionKeys: ["module.jobs.read"],
        },
      ],
    });

    const canReadFinance = hasModuleAccess({
      moduleKey: "finance",
      action: "read",
      rolePolicies: [
        {
          roleName: "partner",
          permissionKeys: ["module.jobs.read"],
        },
      ],
    });

    expect(canReadJobs).toBe(true);
    expect(canWriteJobs).toBe(false);
    expect(canReadFinance).toBe(false);
  });

  it("supports explicit deny-all marker for a role policy", () => {
    const matrix = buildModuleAccessMatrix({
      rolePolicies: [
        {
          roleName: "partner",
          permissionKeys: [EXPLICIT_NONE_PERMISSION_KEY],
        },
      ],
    });

    expect(matrix.jobs).toEqual([]);
    expect(matrix.finance).toEqual([]);
    expect(matrix.dashboard).toEqual([]);

    const canReadJobs = hasModuleAccess({
      moduleKey: "jobs",
      action: "read",
      rolePolicies: [
        {
          roleName: "partner",
          permissionKeys: [EXPLICIT_NONE_PERMISSION_KEY],
        },
      ],
    });

    expect(canReadJobs).toBe(false);
  });
});
