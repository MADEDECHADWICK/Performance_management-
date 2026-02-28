import fs from "fs";
import path from "path";

describe("route index module-access coverage", () => {
  it("keeps module guards on key legacy mounts", () => {
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
      "router.use('/audit_logs', authMiddleware, requireModuleAccess('reports'), auditLogsRoutes);"
    );
    expect(source).toContain(
      "router.use('/subordinates', authMiddleware, requireModuleAccess('users'), subordinatesRoutes);"
    );
    expect(source).toContain(
      "router.use('/knowledge-hub', authMiddleware, requireModuleAccess('knowledge_hub'), knowledgeHubRoutes);"
    );
    expect(source).toContain(
      "router.use('/todos', authMiddleware, requireModuleAccess('dashboard', 'read'), todosRoutes);"
    );
    expect(source).toContain(
      "router.use('/work-logs', authMiddleware, requireModuleAccess('time_entries'), workLogsRoutes);"
    );
    expect(source).toContain(
      "router.use('/work_logs', authMiddleware, requireModuleAccess('time_entries'), workLogsRoutes);"
    );
  });
});
