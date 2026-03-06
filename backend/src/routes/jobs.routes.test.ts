import express from "express";
import request from "supertest";
import jobsRoutes from "./jobs.routes";
import { JobController } from "../controllers/job.controller";

jest.mock("../utils/middleware", () => ({
  authenticated: () => [
    (_req: any, _res: any, next: any) => next(),
    (_req: any, _res: any, next: any) => next(),
  ],
  withRoles: () => [
    (_req: any, _res: any, next: any) => next(),
    (_req: any, _res: any, next: any) => next(),
    (_req: any, _res: any, next: any) => next(),
  ],
}));

jest.mock("../middleware/requireJobAccess", () => ({
  requireJobAccess:
    () =>
    (_req: any, _res: any, next: any) =>
      next(),
}));

jest.mock("../middleware/validate", () => ({
  validateRequest: () => [(_req: any, _res: any, next: any) => next()],
  handleValidationErrors: (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../validators/job.validators", () => ({
  createJobValidators: [],
  updateJobValidators: [],
  listJobsValidators: [],
  getJobParamValidator: [],
  updateJobStatusValidator: [],
  assignJobTeamValidators: [],
  updateJobStaffAssignmentValidators: [],
  removeJobStaffAssignmentValidators: [],
  upsertJobCostingValidators: [],
  createJobFromOnboardingValidators: [],
  getJobTimeEntriesValidators: [],
}));

jest.mock("../controllers/job.controller", () => ({
  JobController: {
    listJobs: jest.fn((_req: any, res: any) => res.status(200).json({ ok: "listJobs" })),
    createJob: jest.fn((_req: any, res: any) => res.status(201).json({ ok: "createJob" })),
    createJobFromOnboarding: jest.fn((_req: any, res: any) =>
      res.status(201).json({ ok: "createJobFromOnboarding" })
    ),
    getJob: jest.fn((_req: any, res: any) => res.status(200).json({ ok: "getJob" })),
    getInvoiceMilestones: jest.fn((_req: any, res: any) =>
      res.status(200).json({ ok: "getInvoiceMilestones" })
    ),
    updateJob: jest.fn((_req: any, res: any) => res.status(200).json({ ok: "updateJob" })),
    updateJobStatus: jest.fn((_req: any, res: any) =>
      res.status(200).json({ ok: "updateJobStatus" })
    ),
    updateInvoiceMilestoneStatus: jest.fn((_req: any, res: any) =>
      res.status(200).json({ ok: "updateInvoiceMilestoneStatus" })
    ),
    getJobCosting: jest.fn((_req: any, res: any) => res.status(200).json({ ok: "getJobCosting" })),
    upsertJobCosting: jest.fn((_req: any, res: any) =>
      res.status(200).json({ ok: "upsertJobCosting" })
    ),
    assignStaff: jest.fn((_req: any, res: any) => res.status(201).json({ ok: "assignStaff" })),
    getStaffAssignments: jest.fn((_req: any, res: any) =>
      res.status(200).json({ ok: "getStaffAssignments" })
    ),
    updateStaffAssignment: jest.fn((_req: any, res: any) =>
      res.status(200).json({ ok: "updateStaffAssignment" })
    ),
    removeStaffAssignment: jest.fn((_req: any, res: any) =>
      res.status(200).json({ ok: "removeStaffAssignment" })
    ),
    getJobProfitability: jest.fn((_req: any, res: any) =>
      res.status(200).json({ ok: "getJobProfitability" })
    ),
    getJobTimeEntries: jest.fn((_req: any, res: any) =>
      res.status(200).json({ ok: "getJobTimeEntries" })
    ),
    getJobUtilization: jest.fn((_req: any, res: any) =>
      res.status(200).json({ ok: "getJobUtilization" })
    ),
    getJobBudgetStatus: jest.fn((_req: any, res: any) =>
      res.status(200).json({ ok: "getJobBudgetStatus" })
    ),
    getJobRevenueAllocations: jest.fn((_req: any, res: any) =>
      res.status(200).json({ ok: "getJobRevenueAllocations" })
    ),
    getJobWorkflowTracking: jest.fn((_req: any, res: any) =>
      res.status(200).json({ ok: "getJobWorkflowTracking" })
    ),
  },
}));

const controller = JobController as unknown as {
  getJobTimeEntries: jest.Mock;
  getJobUtilization: jest.Mock;
  getJobBudgetStatus: jest.Mock;
  getJobRevenueAllocations: jest.Mock;
  getJobWorkflowTracking: jest.Mock;
};

const createApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/jobs", jobsRoutes);
  return app;
};

describe("jobs routes - tracking endpoints", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    {
      method: "get",
      path: "/jobs/10/time-entries",
      mock: () => controller.getJobTimeEntries,
    },
    {
      method: "get",
      path: "/jobs/10/utilization",
      mock: () => controller.getJobUtilization,
    },
    {
      method: "get",
      path: "/jobs/10/budget-status",
      mock: () => controller.getJobBudgetStatus,
    },
    {
      method: "get",
      path: "/jobs/10/revenue-allocations",
      mock: () => controller.getJobRevenueAllocations,
    },
    {
      method: "get",
      path: "/jobs/10/tracking",
      mock: () => controller.getJobWorkflowTracking,
    },
  ])("routes $path to the expected controller", async ({ method, path, mock }) => {
    const app = createApp();
    const response = await request(app)[method as "get"](path);

    expect(response.status).toBe(200);
    expect(mock()).toHaveBeenCalledTimes(1);
  });
});
