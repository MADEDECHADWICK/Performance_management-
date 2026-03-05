import express from "express";
import request from "supertest";
import kpiCascadeV2Routes from "./kpiCascadeV2";
import prisma from "../prisma";
import createAudit from "../utils/audit";

jest.mock("../middleware/auth", () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.user = {
      userId: 7,
      email: "hr@ronalds.local",
      profileId: 101,
      authRoles: ["hr"],
    };
    req.userRoles = ["hr"];
    next();
  },
}));

jest.mock("../middleware/loadProfile", () => ({
  loadProfile: (req: any, _res: any, next: any) => {
    req.profile = {
      id: 101,
      role: { name: "hr" },
    };
    next();
  },
}));

jest.mock("../middleware/requireModuleAccess", () => ({
  requireModuleAccess:
    (_moduleKey: string) => (_req: any, _res: any, next: any) =>
      next(),
}));

jest.mock("../utils/audit", () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue({ id: 1 }),
}));

jest.mock("../services/notifications.service", () => ({
  NotificationService: {
    createNotification: jest.fn().mockResolvedValue({ id: 1 }),
  },
}));

jest.mock("../prisma", () => {
  const prismaMock: any = {};
  prismaMock.$queryRaw = jest.fn();
  prismaMock.$executeRaw = jest.fn();
  prismaMock.$transaction = jest.fn(async (fn: any): Promise<any> => fn(prismaMock));
  prismaMock.statusTransition = {
    create: jest.fn().mockResolvedValue({ id: 1 }),
  };
  return {
    __esModule: true,
    default: prismaMock,
    prisma: prismaMock,
  };
});

type PrismaMock = {
  $queryRaw: jest.Mock;
  $executeRaw: jest.Mock;
  $transaction: jest.Mock;
  statusTransition: {
    create: jest.Mock;
  };
};

const mockedPrisma = prisma as unknown as PrismaMock;
const mockedCreateAudit = createAudit as jest.MockedFunction<typeof createAudit>;

const sqlToText = (sqlArg: any) =>
  Array.isArray(sqlArg?.strings) ? sqlArg.strings.join(" ") : String(sqlArg || "");

const setupQueryRawMock = () => {
  mockedPrisma.$queryRaw.mockImplementation(async (sqlArg: any) => {
    const sql = sqlToText(sqlArg);

    if (sql.includes('INSERT INTO "kpi_cycles"')) {
      return [
        {
          id: 1,
          name: "2026-Q2",
          cadence: "quarterly",
          state: "draft",
        },
      ];
    }
    if (
      sql.includes('SELECT id FROM "kpi_cycle_versions"') &&
      sql.includes("published")
    ) {
      return [];
    }
    if (sql.includes("MAX(version_no)")) {
      return [{ next_v: 1 }];
    }
    if (sql.includes('INSERT INTO "kpi_cycle_versions"')) {
      return [{ id: 11, cycle_id: 1, version_no: 1, status: "draft" }];
    }
    if (sql.includes('INSERT INTO "kpi_goals"')) {
      return [{ id: 21, title: "Improve Client Delivery", state: "draft" }];
    }
    if (
      sql.includes('SELECT id, bsc_tag, due_date, state') &&
      sql.includes('FROM "kpi_goals"')
    ) {
      return [{ id: 21, bsc_tag: "financial", due_date: null, state: "draft" }];
    }
    if (sql.includes('INSERT INTO "kpi_metrics"')) {
      return [{ id: 31, goal_id: 21, name: "% on-time delivery", state: "draft" }];
    }
    if (
      sql.includes("SELECT") &&
      sql.includes("m.id AS metric_id") &&
      sql.includes('FROM "kpi_metrics"')
    ) {
      return [
        {
          metric_id: 31,
          goal_id: 21,
          metric_due_date: null,
          goal_bsc_tag: "financial",
          goal_due_date: null,
        },
      ];
    }
    if (sql.includes('INSERT INTO "kpi_initiatives"')) {
      return [{ id: 41, metric_id: 31, level: "firm", state: "draft" }];
    }
    if (
      sql.includes('FROM "kpi_goals"') &&
      sql.includes("state <> 'archived'::\"KpiEntityState\"")
    ) {
      return [{ id: 21, state: "active", rag: "amber", percent_complete: 63.2, weight: 100 }];
    }
    if (
      sql.includes('FROM "kpi_metrics"') &&
      sql.includes("state <> 'archived'::\"KpiEntityState\"")
    ) {
      return [{ id: 31, state: "active", rag: "amber", percent_complete: 63.2, weight: 100 }];
    }
    if (
      sql.includes('FROM "kpi_initiatives"') &&
      sql.includes("state <> 'archived'::\"KpiEntityState\"")
    ) {
      return [{ id: 41, state: "active", rag: "amber", percent_complete: 63.2, weight: 100 }];
    }
    if (sql.includes('FROM "kpis" k')) {
      return [
        {
          id: 9001,
          name: "Legacy KPI",
          assignment_count: 2,
          objective_count: 1,
        },
      ];
    }
    return [];
  });
};

const createApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/v2/kpi", kpiCascadeV2Routes);
  return app;
};

describe("kpiCascadeV2 smoke routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedPrisma.$executeRaw.mockResolvedValue(1);
    setupQueryRawMock();
  });

  it("runs the core V2 route sequence successfully", async () => {
    const app = createApp();

    const cycleResponse = await request(app).post("/api/v2/kpi/cycles").send({
      name: "2026-Q2",
      cadence: "quarterly",
      startAt: "2026-04-01T00:00:00.000Z",
      endAt: "2026-06-30T23:59:59.999Z",
    });
    expect(cycleResponse.status).toBe(201);
    expect(cycleResponse.body).toEqual(
      expect.objectContaining({
        id: 1,
        name: "2026-Q2",
      })
    );

    const versionResponse = await request(app)
      .post("/api/v2/kpi/cycles/1/versions")
      .set("Idempotency-Key", "kpi-v2-cycle-version-1")
      .send({ publish: false });
    expect(versionResponse.status).toBe(201);
    expect(versionResponse.body).toEqual(
      expect.objectContaining({
        id: 11,
        cycle_id: 1,
      })
    );

    const goalResponse = await request(app).post("/api/v2/kpi/goals").send({
      cycleVersionId: 11,
      ownerProfileId: 101,
      title: "Improve Client Delivery",
      bscTag: "financial",
      baseline: 70,
      target: 90,
      weight: 100,
    });
    expect(goalResponse.status).toBe(201);
    expect(goalResponse.body).toEqual(
      expect.objectContaining({
        id: 21,
        title: "Improve Client Delivery",
      })
    );

    const metricResponse = await request(app).post("/api/v2/kpi/metrics").send({
      goalId: 21,
      name: "% on-time delivery",
      bscTag: "financial",
      direction: "higher_better",
      aggregationMethod: "weighted_average",
      baseline: 70,
      target: 90,
      weight: 100,
      updateFrequency: "weekly",
    });
    expect(metricResponse.status).toBe(201);
    expect(metricResponse.body).toEqual(
      expect.objectContaining({
        id: 31,
        goal_id: 21,
      })
    );

    const firmInitiativeResponse = await request(app)
      .post("/api/v2/kpi/initiatives/firm")
      .send({
        metricId: 31,
        title: "Firm Delivery Excellence",
        bscTag: "financial",
        baseline: 70,
        target: 90,
        weight: 100,
        updateFrequency: "weekly",
      });
    expect(firmInitiativeResponse.status).toBe(201);
    expect(firmInitiativeResponse.body).toEqual(
      expect.objectContaining({
        id: 41,
        metric_id: 31,
        level: "firm",
      })
    );

    const reportingResponse = await request(app).get("/api/v2/kpi/reporting/firm");
    expect(reportingResponse.status).toBe(200);
    expect(reportingResponse.body).toEqual(
      expect.objectContaining({
        summary: expect.objectContaining({
          goals: expect.any(Object),
          metrics: expect.any(Object),
          initiatives: expect.any(Object),
        }),
      })
    );

    const archiveResponse = await request(app).get("/api/v2/kpi/archive/kpis");
    expect(archiveResponse.status).toBe(200);
    expect(archiveResponse.body).toEqual([
      expect.objectContaining({
        id: 9001,
        name: "Legacy KPI",
      }),
    ]);

    expect(mockedCreateAudit).toHaveBeenCalled();
    expect(mockedPrisma.statusTransition.create).toHaveBeenCalled();
  });
});
