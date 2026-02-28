import express from "express";
import request from "supertest";
import prisma from "../prisma";
import projectsRoutes from "./projects";

jest.mock("../middleware/auth", () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.user = {
      userId: 7,
      email: "employee@ronalds.local",
      profileId: 11,
      authRoles: ["employee"],
    };
    next();
  },
}));

jest.mock("../prisma", () => {
  const prismaMock = {
    job: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
  };

  return {
    __esModule: true,
    default: prismaMock,
    prisma: prismaMock,
  };
});

type PrismaMock = {
  job: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
  };
};

const mockedPrisma = prisma as unknown as PrismaMock;

const createApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/projects", projectsRoutes);
  return app;
};

describe("projects legacy compatibility route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("lists scoped projects from jobs with active status mapping", async () => {
    const app = createApp();
    mockedPrisma.job.findMany.mockResolvedValue([
      {
        id: 101,
        jobName: "Tax Compliance 2026",
        jobCode: "JOB-101",
        clientId: 51,
        description: "Annual compliance engagement",
        startDate: new Date("2026-01-01T00:00:00.000Z"),
        dueDate: new Date("2026-03-31T00:00:00.000Z"),
        completionDate: null,
        budgetHours: 120,
        status: "in_progress",
        managerProfileId: 20,
        partnerProfileId: 30,
        client: {
          id: 51,
          clientName: "ABC Holdings",
        },
      },
    ]);

    const response = await request(app).get("/projects?status=active&limit=25");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      expect.objectContaining({
        id: 101,
        project_name: "Tax Compliance 2026",
        project_code: "JOB-101",
        status: "in_progress",
      }),
    ]);
    expect(mockedPrisma.job.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ["planned", "in_progress", "on_hold"] },
        }),
        take: 25,
      })
    );
  });

  it("returns 404 when project is outside scope or missing", async () => {
    const app = createApp();
    mockedPrisma.job.findFirst.mockResolvedValue(null);

    const response = await request(app).get("/projects/999");

    expect(response.status).toBe(404);
    expect(response.body).toEqual(
      expect.objectContaining({
        error: "Project not found",
      })
    );
  });

  it("returns 501 for legacy write operations", async () => {
    const app = createApp();

    const response = await request(app).post("/projects").send({
      project_name: "Legacy Create",
    });

    expect(response.status).toBe(501);
    expect(response.body.error).toContain("not supported");
  });
});
