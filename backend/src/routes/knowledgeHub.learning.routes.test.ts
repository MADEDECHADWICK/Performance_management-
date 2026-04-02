import express from "express";
import request from "supertest";
import prisma from "../prisma";
import knowledgeHubRoutes from "./knowledgeHub";
import {
  submitKnowledgeHubQuizAttempt,
  updateKnowledgeHubProgress,
} from "../services/learningDevelopment.service";

jest.mock("../prisma", () => {
  const prismaMock = {
    learningPointLedger: {
      findMany: jest.fn(),
      aggregate: jest.fn(),
    },
    knowledgeHubResource: {
      findUnique: jest.fn(),
    },
    knowledgeHubResourceProgress: {
      findUnique: jest.fn(),
    },
  };

  return {
    __esModule: true,
    default: prismaMock,
    prisma: prismaMock,
  };
});

jest.mock("../services/learningDevelopment.service", () => ({
  updateKnowledgeHubProgress: jest.fn(),
  submitKnowledgeHubQuizAttempt: jest.fn(),
}));

jest.mock("../middleware/requireModuleAccess", () => ({
  requireModuleAccess: () => (_req: any, _res: any, next: any) => next(),
}));

type PrismaMock = {
  learningPointLedger: {
    findMany: jest.Mock;
    aggregate: jest.Mock;
  };
  knowledgeHubResource: {
    findUnique: jest.Mock;
  };
  knowledgeHubResourceProgress: {
    findUnique: jest.Mock;
  };
};

const mockedPrisma = prisma as unknown as PrismaMock;
const mockedUpdateKnowledgeHubProgress =
  updateKnowledgeHubProgress as jest.MockedFunction<typeof updateKnowledgeHubProgress>;
const mockedSubmitKnowledgeHubQuizAttempt =
  submitKnowledgeHubQuizAttempt as jest.MockedFunction<typeof submitKnowledgeHubQuizAttempt>;

const createApp = () => {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.user = {
      userId: 7,
      email: "learner@ronalds.local",
      profileId: 44,
      authRoles: ["employee"],
    };
    req.userRoles = ["employee"];
    req.profile = {
      id: 44,
      role: { name: "employee" },
    };
    next();
  });
  app.use("/api/knowledge-hub", knowledgeHubRoutes);
  return app;
};

describe("knowledge hub learning routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns the current learner point summary", async () => {
    const app = createApp();
    mockedPrisma.learningPointLedger.findMany.mockResolvedValue([
      {
        id: 1,
        eventType: "knowledge_resource_completed",
        sourceType: "knowledge_resource",
        sourceId: 10,
        points: 5,
        awardedAt: new Date("2026-03-24T08:00:00.000Z"),
      },
    ]);
    mockedPrisma.learningPointLedger.aggregate.mockResolvedValue({
      _sum: { points: 5 },
    });

    const response = await request(app).get("/api/knowledge-hub/points/me");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        totalPoints: 5,
        entries: [
          expect.objectContaining({
            id: 1,
            points: 5,
          }),
        ],
      })
    );
    expect(mockedPrisma.learningPointLedger.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { profileId: 44 },
      })
    );
  });

  it("delegates resource progress updates to the learning service", async () => {
    const app = createApp();
    mockedUpdateKnowledgeHubProgress.mockResolvedValue({
      progress: {
        id: 9,
        resourceId: 55,
        profileId: 44,
        status: "completed",
        completedAt: new Date("2026-03-24T09:00:00.000Z"),
      },
      awardedPoints: 3,
    } as any);

    const response = await request(app).put("/api/knowledge-hub/55/progress").send({
      timeSpentSeconds: 45,
      scrollPercent: 100,
      completed: true,
    });

    expect(response.status).toBe(200);
    expect(mockedUpdateKnowledgeHubProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceId: 55,
        profileId: 44,
        actorProfileId: 44,
        progress: expect.objectContaining({
          timeSpentSeconds: 45,
          scrollPercent: 100,
          completed: true,
        }),
      })
    );
  });

  it("submits knowledge quiz attempts for the current learner", async () => {
    const app = createApp();
    mockedSubmitKnowledgeHubQuizAttempt.mockResolvedValue({
      attempt: {
        id: 21,
        attemptNo: 1,
        score: 85,
        status: "passed",
      },
      passed: true,
      awardedPoints: 2,
    } as any);

    const response = await request(app)
      .post("/api/knowledge-hub/55/quiz-attempts")
      .send({
        answers: [
          {
            questionId: 101,
            optionIds: [1001],
          },
        ],
      });

    expect(response.status).toBe(201);
    expect(response.body.attempt).toEqual(
      expect.objectContaining({
        id: 21,
        score: 85,
        status: "passed",
      })
    );
    expect(mockedSubmitKnowledgeHubQuizAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceId: 55,
        profileId: 44,
        actorProfileId: 44,
        answers: [
          expect.objectContaining({
            questionId: 101,
            optionIds: [1001],
          }),
        ],
      })
    );
  });
});
