import express from "express";
import request from "supertest";
import prisma from "../prisma";
import { TimeEntryService } from "../services/time-entry.service";
import { createAudit } from "../utils/audit";
import workLogsRoutes from "./workLogs";

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
    timeEntry: {
      findMany: jest.fn(),
    },
  };

  return {
    __esModule: true,
    default: prismaMock,
    prisma: prismaMock,
  };
});

jest.mock("../services/time-entry.service", () => ({
  TimeEntryService: {
    getTimeEntry: jest.fn(),
    createTimeEntry: jest.fn(),
    updateTimeEntry: jest.fn(),
    deleteTimeEntry: jest.fn(),
  },
}));

jest.mock("../utils/audit", () => ({
  createAudit: jest.fn().mockResolvedValue({ id: 1 }),
}));

type PrismaMock = {
  timeEntry: {
    findMany: jest.Mock;
  };
};

type TimeEntryServiceMock = {
  getTimeEntry: jest.Mock;
  createTimeEntry: jest.Mock;
  updateTimeEntry: jest.Mock;
  deleteTimeEntry: jest.Mock;
};

const mockedPrisma = prisma as unknown as PrismaMock;
const mockedTimeEntryService = TimeEntryService as unknown as TimeEntryServiceMock;
const mockedCreateAudit = createAudit as jest.MockedFunction<typeof createAudit>;

const createApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/work_logs", workLogsRoutes);
  return app;
};

describe("workLogs legacy compatibility route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("lists current user's logs with legacy field mapping", async () => {
    const app = createApp();
    mockedPrisma.timeEntry.findMany.mockResolvedValue([
      {
        id: 21,
        employeeProfileId: 11,
        jobId: 8,
        dateWorked: new Date("2026-02-10T00:00:00.000Z"),
        startedAt: null,
        endedAt: null,
        hours: 2.5,
        description: "[activity:training] Internal training session",
        billable: false,
        status: "pending",
        job: {
          id: 8,
          jobName: "Compliance Review",
          jobCode: "JOB-008",
        },
      },
    ]);

    const response = await request(app).get("/work_logs?employeeId=7&limit=10");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      expect.objectContaining({
        id: 21,
        employee_id: 11,
        project_id: 8,
        activity_type: "training",
        task_description: "Internal training session",
        billable: false,
        hours_worked: 2.5,
      }),
    ]);
    expect(mockedPrisma.timeEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          employeeProfileId: 11,
        }),
        take: 10,
      })
    );
  });

  it("rejects create requests without job_id", async () => {
    const app = createApp();

    const response = await request(app).post("/work_logs").send({
      employee_id: 7,
      date_worked: "2026-02-10",
      hours_worked: 3,
      task_description: "General admin",
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("job_id is required");
    expect(mockedTimeEntryService.createTimeEntry).not.toHaveBeenCalled();
  });

  it("creates a work log through TimeEntryService with legacy payload", async () => {
    const app = createApp();
    mockedTimeEntryService.createTimeEntry.mockResolvedValue({
      id: 25,
      employeeProfileId: 11,
      jobId: 8,
      dateWorked: new Date("2026-02-10T00:00:00.000Z"),
      startedAt: null,
      endedAt: null,
      hours: 1.5,
      description: "[activity:training] Read policy updates",
      billable: false,
      status: "pending",
      job: {
        id: 8,
        jobName: "Compliance Review",
        jobCode: "JOB-008",
      },
    });

    const response = await request(app).post("/work_logs").send({
      employee_id: 7,
      job_id: 8,
      date_worked: "2026-02-10",
      hours_worked: 1.5,
      task_description: "Read policy updates",
      activity_type: "training",
      billable: true,
    });

    expect(response.status).toBe(201);
    expect(response.body).toEqual(
      expect.objectContaining({
        id: 25,
        activity_type: "training",
        billable: false,
      })
    );
    expect(mockedTimeEntryService.createTimeEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 8,
        billable: false,
        description: "[activity:training] Read policy updates",
      }),
      expect.objectContaining({
        userId: 7,
        profileId: 11,
      })
    );
    expect(mockedCreateAudit).toHaveBeenCalled();
  });

  it("updates a work log using legacy fields", async () => {
    const app = createApp();
    mockedTimeEntryService.updateTimeEntry.mockResolvedValue({
      id: 25,
      employeeProfileId: 11,
      jobId: 8,
      dateWorked: new Date("2026-02-10T00:00:00.000Z"),
      startedAt: null,
      endedAt: null,
      hours: 3,
      description: "Updated description",
      billable: true,
      status: "pending",
      job: {
        id: 8,
        jobName: "Compliance Review",
        jobCode: "JOB-008",
      },
    });

    const response = await request(app).patch("/work_logs/25").send({
      hours_worked: 3,
      task_description: "Updated description",
      billable: true,
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        id: 25,
        hours_worked: 3,
        task_description: "Updated description",
      })
    );
    expect(mockedTimeEntryService.updateTimeEntry).toHaveBeenCalledWith(
      25,
      expect.objectContaining({
        hours: 3,
        description: "Updated description",
        billable: true,
      }),
      expect.objectContaining({
        userId: 7,
        profileId: 11,
      })
    );
  });

  it("deletes a work log and returns legacy delete shape", async () => {
    const app = createApp();
    mockedTimeEntryService.deleteTimeEntry.mockResolvedValue(true);

    const response = await request(app).delete("/work_logs/25");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, id: 25 });
    expect(mockedTimeEntryService.deleteTimeEntry).toHaveBeenCalledWith(
      25,
      expect.objectContaining({
        userId: 7,
        profileId: 11,
      })
    );
    expect(mockedCreateAudit).toHaveBeenCalled();
  });
});
