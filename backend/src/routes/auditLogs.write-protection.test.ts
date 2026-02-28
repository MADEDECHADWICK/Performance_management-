import express from "express";
import request from "supertest";
import auditLogsRoutes from "./auditLogs";

const createApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/audit-logs", auditLogsRoutes);
  return app;
};

describe("audit log write protection", () => {
  it("rejects direct audit log creation", async () => {
    const app = createApp();

    const response = await request(app).post("/api/audit-logs").send({
      action: "manual_write",
      entity_type: "test",
      user_id: 123,
    });

    expect(response.status).toBe(405);
    expect(response.body).toEqual(
      expect.objectContaining({
        error: "Direct audit log writes are disabled. Use audited domain endpoints.",
      })
    );
  });
});
