import prisma from "../prisma";
import jobService from "./jobs.service";

jest.mock("../prisma", () => {
  const prismaMock = {
    timeEntry: {
      aggregate: jest.fn(),
    },
    requisitionRequest: {
      aggregate: jest.fn(),
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
    aggregate: jest.Mock;
  };
  requisitionRequest: {
    aggregate: jest.Mock;
  };
};

const mockedPrisma = prisma as unknown as PrismaMock;

describe("JobService.getJobProfitability", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it("includes approved requisition spend in total job cost", async () => {
    jest.spyOn(jobService as any, "getJobById").mockResolvedValue({
      id: 501,
      jobName: "Audit FY2025",
      billingType: "hourly",
      status: "in_progress",
    });

    mockedPrisma.timeEntry.aggregate.mockResolvedValue({
      _sum: {
        billableAmount: 120000,
        costAmount: 45000,
      },
    });
    mockedPrisma.requisitionRequest.aggregate.mockResolvedValue({
      _sum: {
        amount: 8000,
      },
    });

    const result = await jobService.getJobProfitability(501);

    expect(result.totalRevenue).toBe(120000);
    expect(result.laborCost).toBe(45000);
    expect(result.approvedRequisitionCost).toBe(8000);
    expect(result.totalCost).toBe(53000);
    expect(result.totalProfitLoss).toBe(67000);
  });
});
