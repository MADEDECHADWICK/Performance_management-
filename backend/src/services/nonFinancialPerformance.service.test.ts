import prisma from "../prisma";
import { nonFinancialPerformanceService } from "./nonFinancialPerformance.service";

jest.mock("../prisma", () => {
  const prismaMock = {
    evaluationAssignment: {
      aggregate: jest.fn(),
    },
    projectEvaluation: {
      aggregate: jest.fn(),
    },
    okrObjective: {
      findMany: jest.fn(),
    },
    feedback: {
      count: jest.fn(),
    },
    clientSatisfactionSurvey: {
      findMany: jest.fn(),
    },
    task: {
      count: jest.fn(),
    },
  };

  return {
    __esModule: true,
    default: prismaMock,
    prisma: prismaMock,
  };
});

type PrismaMock = {
  evaluationAssignment: {
    aggregate: jest.Mock;
  };
  projectEvaluation: {
    aggregate: jest.Mock;
  };
  okrObjective: {
    findMany: jest.Mock;
  };
  feedback: {
    count: jest.Mock;
  };
  clientSatisfactionSurvey: {
    findMany: jest.Mock;
  };
  task: {
    count: jest.Mock;
  };
};

const mockedPrisma = prisma as unknown as PrismaMock;

describe("NonFinancialPerformanceService", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockedPrisma.evaluationAssignment.aggregate.mockResolvedValue({
      _avg: { score: null },
      _count: { id: 0 },
    });
    mockedPrisma.projectEvaluation.aggregate.mockResolvedValue({
      _avg: { overallScore: null },
      _count: { id: 0 },
    });
    mockedPrisma.okrObjective.findMany.mockResolvedValue([]);
    mockedPrisma.feedback.count.mockResolvedValue(0);
    mockedPrisma.clientSatisfactionSurvey.findMany.mockResolvedValue([]);
    mockedPrisma.task.count.mockResolvedValue(0);
  });

  it("returns zero scores when an employee has no non-financial source data", async () => {
    const scores = await nonFinancialPerformanceService.calculateNonFinancialScores(
      77,
      undefined,
      new Date("2026-01-01T00:00:00.000Z"),
      new Date("2026-03-09T23:59:59.999Z")
    );

    expect(scores.learningGrowthScore).toBe(0);
    expect(scores.customerSatisfactionScore).toBe(0);
    expect(scores.internalProcessesScore).toBe(0);
    expect(scores.overallNonFinancialScore).toBe(0);
    expect(scores.okrScore).toBe(0);
    expect(scores.feedbackScore).toBe(0);
    expect(scores.projectEvaluationScore).toBe(0);
    expect(scores.evidence).toEqual({
      learningGrowth: false,
      okr: false,
      feedback: false,
      customerSatisfaction: false,
      internalProcesses: false,
      projectEvaluation: false,
    });
  });
});
