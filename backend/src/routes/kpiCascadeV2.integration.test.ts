import express from "express";
import request from "supertest";
import { Prisma } from "@prisma/client";
import prisma from "../prisma";
import kpiCascadeV2Routes from "./kpiCascadeV2";

let testProfileId = 1;
let testUserId = 1;

jest.mock("../middleware/auth", () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.user = {
      userId: testUserId,
      email: "hr.integration@ronalds.local",
      profileId: testProfileId,
      authRoles: ["hr"],
    };
    req.userRoles = ["hr"];
    next();
  },
}));

jest.mock("../middleware/loadProfile", () => ({
  loadProfile: (req: any, _res: any, next: any) => {
    req.profile = {
      id: testProfileId,
      role: { name: "hr" },
    };
    next();
  },
}));

jest.mock("../middleware/requireModuleAccess", () => ({
  requireModuleAccess:
    (_moduleKey: string, _action?: string) =>
    (_req: any, _res: any, next: any) =>
      next(),
}));

const createApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/v2/kpi", kpiCascadeV2Routes);
  return app;
};

describe("kpiCascadeV2 DB integration", () => {
  const createdCycleIds: number[] = [];
  let dbReachable = false;
  let v2TablesReady = false;
  let v2ColumnsReady = false;

  beforeAll(async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbReachable = true;

      const tableCheck = await prisma.$queryRaw<Array<{ ready: boolean }>>(Prisma.sql`
        SELECT to_regclass('public.kpi_cycles') IS NOT NULL AS ready
      `);
      v2TablesReady = Boolean(tableCheck[0]?.ready);
      if (!v2TablesReady) return;

      const columnCheck = await prisma.$queryRaw<Array<{ ready: boolean }>>(Prisma.sql`
        SELECT EXISTS(
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'kpi_goals'
            AND column_name = 'bsc_tag'
        ) AS ready
      `);
      v2ColumnsReady = Boolean(columnCheck[0]?.ready);
      if (!v2ColumnsReady) return;

      const profile = await prisma.profile.findFirst({
        where: { status: "active", userId: { not: null } },
        select: { id: true, userId: true },
        orderBy: { id: "asc" },
      });
      if (!profile || !profile.userId) {
        throw new Error("No active profile with linked user found for integration test");
      }
      testProfileId = profile.id;
      testUserId = profile.userId;
    } catch {
      dbReachable = false;
      v2TablesReady = false;
    }
  }, 30000);

  afterAll(async () => {
    for (const cycleId of createdCycleIds.reverse()) {
      try {
        await prisma.$executeRaw(Prisma.sql`
          DELETE FROM "kpi_cycles" WHERE id = ${cycleId}
        `);
      } catch {
        // keep cleanup non-blocking
      }
    }
    await prisma.$disconnect();
  });

  it("runs core V2 flow against real DB", async () => {
    if (!dbReachable) {
      console.warn("Skipping DB integration: database not reachable.");
      return;
    }
    if (!v2TablesReady) {
      console.warn(
        "Skipping DB integration: KPI V2 tables not found. Run V2 migration before this test."
      );
      return;
    }
    if (!v2ColumnsReady) {
      console.warn(
        "Skipping DB integration: KPI V2 enhancement columns not found. Run latest KPI V2 migration."
      );
      return;
    }

    const app = createApp();
    const runId = Date.now();
    const cycleStart = "2026-04-01T00:00:00.000Z";
    const cycleEnd = "2026-06-30T23:59:59.999Z";

    const cycleRes = await request(app).post("/api/v2/kpi/cycles").send({
      name: `IT-Cycle-${runId}`,
      cadence: "quarterly",
      startAt: cycleStart,
      endAt: cycleEnd,
    });
    expect(cycleRes.status).toBe(201);
    expect(cycleRes.body?.id).toBeTruthy();
    const cycleId = Number(cycleRes.body.id);
    createdCycleIds.push(cycleId);

    const versionRes = await request(app)
      .post(`/api/v2/kpi/cycles/${cycleId}/versions`)
      .set("Idempotency-Key", `it-v2-version-${runId}`)
      .send({ publish: false });
    expect(versionRes.status).toBe(201);
    const cycleVersionId = Number(versionRes.body.id);
    expect(cycleVersionId).toBeTruthy();

    const goalRes = await request(app).post("/api/v2/kpi/goals").send({
      cycleVersionId,
      title: `IT-Goal-${runId}`,
      ownerProfileId: testProfileId,
      bscTag: "financial",
      baseline: 70,
      target: 90,
      weight: 100,
    });
    expect(goalRes.status).toBe(201);
    const goalId = Number(goalRes.body.id);
    expect(goalId).toBeTruthy();

    const metricRes = await request(app).post("/api/v2/kpi/metrics").send({
      goalId,
      name: `IT-Metric-${runId}`,
      bscTag: "financial",
      direction: "higher_better",
      aggregationMethod: "weighted_average",
      baseline: 70,
      target: 90,
      weight: 100,
      updateFrequency: "weekly",
    });
    expect(metricRes.status).toBe(201);
    const metricId = Number(metricRes.body.id);
    expect(metricId).toBeTruthy();

    const firmInitiativeRes = await request(app)
      .post("/api/v2/kpi/initiatives/firm")
      .send({
        metricId,
        title: `IT-Firm-Initiative-${runId}`,
        bscTag: "financial",
        baseline: 70,
        target: 90,
        weight: 100,
        updateFrequency: "weekly",
      });
    expect(firmInitiativeRes.status).toBe(201);
    expect(firmInitiativeRes.body?.id).toBeTruthy();

    const reportRes = await request(app).get("/api/v2/kpi/reporting/firm");
    expect(reportRes.status).toBe(200);
    expect(reportRes.body?.summary).toBeTruthy();

    const archiveRes = await request(app).get("/api/v2/kpi/archive/kpis");
    expect(archiveRes.status).toBe(200);
    expect(Array.isArray(archiveRes.body)).toBe(true);
  }, 60000);
});
