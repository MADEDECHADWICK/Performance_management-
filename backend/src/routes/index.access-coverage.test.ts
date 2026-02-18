import fs from "fs";
import path from "path";

describe("route index module-access coverage", () => {
  it("keeps module guards on key legacy mounts", () => {
    const indexPath = path.join(__dirname, "index.ts");
    const source = fs.readFileSync(indexPath, "utf8");

    expect(source).toContain(
      "router.use('/departments', authMiddleware, requireModuleAccess('users'), departmentRoutes);"
    );
    expect(source).toContain(
      "router.use('/partners', authMiddleware, requireModuleAccess('users'), partnerRoutes);"
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
      "router.use('/todos', authMiddleware, requireModuleAccess('dashboard'), todosRoutes);"
    );
    expect(source).toContain(
      "router.use('/work-logs', authMiddleware, requireModuleAccess('time_entries'), workLogsRoutes);"
    );
  });
});
