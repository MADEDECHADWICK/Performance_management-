import jobService from "./jobs.service";
import JobPerformanceFactsService from "./jobPerformanceFacts.service";

jest.mock("../prisma", () => ({
  __esModule: true,
  default: {},
  prisma: {},
}));

jest.mock("./jobPerformanceFacts.service", () => ({
  __esModule: true,
  default: {
    getJobFact: jest.fn(),
    listFacts: jest.fn(),
  },
}));

const mockedGetJobFact = JobPerformanceFactsService.getJobFact as jest.Mock;

describe("JobService.getJobProfitability", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("includes approved requisition spend in total job cost", async () => {
    mockedGetJobFact.mockResolvedValue({
      jobName: "Audit FY2025",
      billingType: "hourly",
      status: "in_progress",
      billableValue: 120000,
      billedRevenue: 120000,
      collectedRevenue: 120000,
      laborCost: 45000,
      approvedRequisitionCost: 8000,
      recoverableRequisitionCost: 0,
      actualCost: 53000,
      workInProgressProfit: 67000,
      billedProfit: 67000,
      cashProfit: 67000,
      marginPercent: 55.8,
      billableHours: 400,
      nonBillableHours: 20,
      budgetUsedPercent: 80,
      totalHours: 420,
      partnerProfileId: null,
      departmentId: null,
    });

    const result = await jobService.getJobProfitability(501);

    expect(result.totalRevenue).toBe(120000);
    expect(result.laborCost).toBe(45000);
    expect(result.approvedRequisitionCost).toBe(8000);
    expect(result.totalCost).toBe(53000);
    expect(result.totalProfitLoss).toBe(67000);
  });
});
