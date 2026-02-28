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
    expect(toActionSet(matrix.time_entries)).toEqual(new Set(["read", "write"]));
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
    expect(toActionSet(matrix.time_entries)).toEqual(new Set(["read", "write", "approve"]));
    expect(toActionSet(matrix.finance)).toEqual(new Set(["read"]));
    expect(toActionSet(matrix.knowledge_hub)).toEqual(new Set(["read"]));
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
    expect(toActionSet(matrix.dashboard)).toEqual(new Set(["read"]));
    expect(toActionSet(matrix.users)).toEqual(new Set(["read"]));
    expect(toActionSet(matrix.kpis)).toEqual(new Set(["read", "write"]));
    expect(toActionSet(matrix.time_entries)).toEqual(new Set(["read", "write"]));
    expect(toActionSet(matrix.evaluations)).toEqual(new Set(["read", "write"]));

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

  it("grants full system access to hr even if explicit strict permissions are partial", () => {
    const matrix = buildModuleAccessMatrix({
      rolePolicies: [
        {
          roleName: "hr",
          permissionKeys: ["module.users.read"],
        },
      ],
    });

    expect(toActionSet(matrix.jobs)).toEqual(new Set(["read", "write", "approve", "admin"]));
    expect(toActionSet(matrix.finance)).toEqual(new Set(["read", "write", "approve", "admin"]));
    expect(toActionSet(matrix.access_control)).toEqual(new Set(["read", "write", "approve", "admin"]));
  });

  it("grants full system access to hr_manager even when explicit-none marker exists", () => {
    const matrix = buildModuleAccessMatrix({
      rolePolicies: [
        {
          roleName: "hr_manager",
          permissionKeys: [EXPLICIT_NONE_PERMISSION_KEY],
        },
      ],
    });

    expect(toActionSet(matrix.jobs)).toEqual(new Set(["read", "write", "approve", "admin"]));
    expect(toActionSet(matrix.clients)).toEqual(new Set(["read", "write", "approve", "admin"]));
    expect(toActionSet(matrix.reports)).toEqual(new Set(["read", "write", "approve", "admin"]));
  });
});
