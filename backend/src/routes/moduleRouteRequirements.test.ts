import {
  MODULE_REQUIREMENTS_BY_MODULE,
  MODULE_REQUIREMENTS_BY_ROUTE,
  ROUTE_MODULE_REQUIREMENTS,
} from "./moduleRouteRequirements";

describe("module route requirements registry", () => {
  it("has no duplicate route paths", () => {
    const paths = ROUTE_MODULE_REQUIREMENTS.map((item) => item.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("keeps critical route mappings stable", () => {
    expect(MODULE_REQUIREMENTS_BY_ROUTE.get("/module-access")).toEqual(
      expect.objectContaining({
        path: "/module-access",
        type: "single",
        moduleKey: "access_control",
      })
    );

    expect(MODULE_REQUIREMENTS_BY_ROUTE.get("/proposals")).toEqual(
      expect.objectContaining({
        path: "/proposals",
        type: "single",
        moduleKey: "proposals",
      })
    );

    expect(MODULE_REQUIREMENTS_BY_ROUTE.get("/knowledge-hub")).toEqual(
      expect.objectContaining({
        path: "/knowledge-hub",
        type: "single",
        moduleKey: "knowledge_hub",
      })
    );

    expect(MODULE_REQUIREMENTS_BY_ROUTE.get("/departments")).toEqual(
      expect.objectContaining({
        path: "/departments",
        type: "any",
      })
    );
  });

  it("indexes requirements by module", () => {
    expect(Array.isArray(MODULE_REQUIREMENTS_BY_MODULE.users)).toBe(true);
    expect(
      MODULE_REQUIREMENTS_BY_MODULE.users.some((item) => item.path === "/roles")
    ).toBe(true);

    expect(Array.isArray(MODULE_REQUIREMENTS_BY_MODULE.evaluations)).toBe(true);
    expect(
      MODULE_REQUIREMENTS_BY_MODULE.evaluations.some(
        (item) => item.path === "/evaluation-templates"
      )
    ).toBe(true);
  });
});
