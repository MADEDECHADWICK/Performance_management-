import { prisma } from "../prisma";
import { TimeEntryService } from "./time-entry.service";

jest.mock("../prisma", () => {
  const prismaMock = {
    timeEntry: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    job: {
      findUnique: jest.fn(),
    },
  };

  return {
    __esModule: true,
    default: prismaMock,
    prisma: prismaMock,
  };
});

type PrismaMock = {
  timeEntry: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
  };
  job: {
    findUnique: jest.Mock;
  };
};

const mockedPrisma = prisma as unknown as PrismaMock;

const createAuth = (overrides: Partial<{ userId: number; profileId: number; roleName: string }> = {}) => ({
  userId: 1,
  profileId: 999,
  roleName: "manager",
  ...overrides,
});

const createTimeEntry = (overrides: Record<string, any> = {}) => ({
  id: 10,
  jobId: 55,
  employeeProfileId: 200,
  hours: 4,
  billable: true,
  status: "submitted",
  job: {
    id: 55,
    jobName: "Job A",
    budgetHours: 120,
    clientId: 1,
    managerProfileId: 300,
    partnerProfileId: 400,
  },
  employee: {
    id: 200,
    firstName: "Emp",
    lastName: "One",
    managerId: 300,
    user: { email: "emp@ronalds.local" },
  },
  approver: null,
  task: null,
  ...overrides,
});

const createJob = (overrides: Record<string, any> = {}) => ({
  id: 55,
  jobName: "Job A",
  budgetHours: 120,
  managerProfileId: 300,
  partnerProfileId: 400,
  jobCosting: null,
  ...overrides,
});

describe("TimeEntryService access scoping", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("denies getTimeEntry for unscoped manager", async () => {
    mockedPrisma.timeEntry.findUnique.mockResolvedValue(createTimeEntry());

    await expect(
      TimeEntryService.getTimeEntry(10, createAuth({ profileId: 999, roleName: "manager" }))
    ).rejects.toMatchObject({
      statusCode: 403,
      message: "You do not have permission to view this time entry",
    });
  });

  it("allows getTimeEntry for job manager", async () => {
    mockedPrisma.timeEntry.findUnique.mockResolvedValue(createTimeEntry());

    const result = await TimeEntryService.getTimeEntry(
      10,
      createAuth({ profileId: 300, roleName: "manager" })
    );

    expect(result).toEqual(expect.objectContaining({ id: 10 }));
  });

  it("allows getTimeEntry for employee's direct manager", async () => {
    mockedPrisma.timeEntry.findUnique.mockResolvedValue(
      createTimeEntry({
        job: {
          id: 55,
          jobName: "Job A",
          budgetHours: 120,
          clientId: 1,
          managerProfileId: 777,
          partnerProfileId: 400,
        },
        employee: {
          id: 200,
          firstName: "Emp",
          lastName: "One",
          managerId: 300,
          user: { email: "emp@ronalds.local" },
        },
      })
    );

    const result = await TimeEntryService.getTimeEntry(
      10,
      createAuth({ profileId: 300, roleName: "manager" })
    );

    expect(result).toEqual(expect.objectContaining({ id: 10 }));
  });

  it("denies getJobTimeSummary for unscoped manager", async () => {
    mockedPrisma.job.findUnique.mockResolvedValue(
      createJob({ managerProfileId: 321, partnerProfileId: 400 })
    );

    await expect(
      TimeEntryService.getJobTimeSummary(55, createAuth({ profileId: 999, roleName: "manager" }))
    ).rejects.toMatchObject({
      statusCode: 403,
      message: "You do not have permission to view this job summary",
    });
    expect(mockedPrisma.timeEntry.findMany).not.toHaveBeenCalled();
  });

  it("allows getJobTimeSummary for job manager", async () => {
    mockedPrisma.job.findUnique.mockResolvedValue(
      createJob({ managerProfileId: 300, partnerProfileId: 400, budgetHours: 100 })
    );
    mockedPrisma.timeEntry.findMany.mockResolvedValue([]);

    const result = await TimeEntryService.getJobTimeSummary(
      55,
      createAuth({ profileId: 300, roleName: "manager" })
    );

    expect(result).toEqual(
      expect.objectContaining({
        jobId: 55,
        totalHours: 0,
        budgetCap: 100,
      })
    );
  });
});
