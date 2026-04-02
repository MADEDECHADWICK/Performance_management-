import fs from "fs";
import path from "path";

describe("route index module-access coverage", () => {
  it("keeps module guards on key mounts", () => {
    const indexPath = path.join(__dirname, "index.ts");
    const source = fs.readFileSync(indexPath, "utf8");

    expect(source).toMatch(
      /router\.use\(\s*'\/departments',\s*authMiddleware,\s*requireAnyModuleAccess\(/m
    );
    expect(source).toMatch(
      /router\.use\(\s*'\/partners',\s*authMiddleware,\s*requireAnyModuleAccess\(/m
    );
    expect(source).toContain(
      "router.use('/audit-logs', authMiddleware, requireModuleAccess('reports'), auditLogsRoutes);"
    );
    expect(source).toContain(
      "router.use('/subordinates', authMiddleware, requireModuleAccess('users'), subordinatesRoutes);"
    );
    expect(source).toMatch(
      /router\.use\(\s*'\/knowledge-hub',\s*authMiddleware,\s*requireModuleAccess\('knowledge_hub',\s*'read'\),\s*knowledgeHubRoutes\s*\);/m
    );
    expect(source).toContain(
      "router.use('/todos', authMiddleware, requireModuleAccess('dashboard', 'read'), todosRoutes);"
    );
  });
});
