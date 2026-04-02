import express from "express";
import request from "supertest";
import prisma from "../prisma";
import createAudit from "../utils/audit";
import teamManagementRoutes from "./teamManagement";
import { submitTrainingFeedbackEntry } from "../services/learningDevelopment.service";

jest.mock("../middleware/auth", () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.user = {
      userId: 9,
      email: "employee.learning@ronalds.local",
      profileId: 17,
      authRoles: ["employee"],
    };
    req.userRoles = ["employee"];
    req.profile = {
      id: 17,
      role: { name: "employee" },
    };
    next();
  },
}));

jest.mock("../prisma", () => {
  const prismaMock = {
    learningPointLedger: {
      findMany: jest.fn(),
      aggregate: jest.fn(),
    },
    learningAssignment: {
      findUnique: jest.fn(),
    },
  };

  return {
    __esModule: true,
    default: prismaMock,
    prisma: prismaMock,
  };
});

jest.mock("../utils/audit", () => jest.fn().mockResolvedValue({ id: 1 }));

jest.mock("../services/learningDevelopment.service", () => ({
  awardAttendancePoints: jest.fn(),
  issueCertificateIfEligible: jest.fn(),
  recalculateLearningAssignment: jest.fn(),
  submitLearningQuizAttempt: jest.fn(),
  submitTrainingFeedbackEntry: jest.fn(),
}));

type PrismaMock = {
  learningPointLedger: {
    findMany: jest.Mock;
    aggregate: jest.Mock;
  };
  learningAssignment: {
    findUnique: jest.Mock;
  };
};

const mockedPrisma = prisma as unknown as PrismaMock;
const mockedCreateAudit = createAudit as jest.MockedFunction<typeof createAudit>;
const mockedSubmitTrainingFeedbackEntry =
  submitTrainingFeedbackEntry as jest.MockedFunction<typeof submitTrainingFeedbackEntry>;

const createApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/team-management", teamManagementRoutes);
  return app;
};

describe("team management learning routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns the current learner's learning points", async () => {
    const app = createApp();
    mockedPrisma.learningPointLedger.findMany.mockResolvedValue([
      {
        id: 3,
        eventType: "training_feedback_submitted",
        sourceType: "training_feedback",
        sourceId: 41,
        points: 2,
        awardedAt: new Date("2026-03-24T10:00:00.000Z"),
      },
    ]);
    mockedPrisma.learningPointLedger.aggregate.mockResolvedValue({
      _sum: { points: 12 },
    });

    const response = await request(app).get("/api/team-management/learning-points");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        profileId: 17,
        totalPoints: 12,
        entries: [
          expect.objectContaining({
            id: 3,
            points: 2,
          }),
        ],
      })
    );
  });

  it("submits learner feedback for a completed assignment", async () => {
    const app = createApp();
    mockedPrisma.learningAssignment.findUnique.mockResolvedValue({
      id: 41,
      employeeProfileId: 17,
      status: "completed",
      trainingFeedback: null,
    });
    mockedSubmitTrainingFeedbackEntry.mockResolvedValue({
      feedback: {
        id: 88,
        overallRating: 4,
        contentRating: 5,
        deliveryRating: 4,
        relevanceRating: 4,
        comment: "Useful and practical",
        pointsAwarded: 2,
        submittedAt: new Date("2026-03-24T11:00:00.000Z"),
      },
      pointsAwarded: 2,
    } as any);

    const response = await request(app)
      .post("/api/team-management/learning-assignments/41/feedback")
      .send({
        overallRating: 4,
        contentRating: 5,
        deliveryRating: 4,
        relevanceRating: 4,
        comment: "Useful and practical",
      });

    expect(response.status).toBe(201);
    expect(response.body.feedback).toEqual(
      expect.objectContaining({
        id: 88,
        pointsAwarded: 2,
      })
    );
    expect(mockedSubmitTrainingFeedbackEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        assignmentId: 41,
        actorProfileId: 17,
        overallRating: 4,
        contentRating: 5,
        deliveryRating: 4,
        relevanceRating: 4,
        comment: "Useful and practical",
      })
    );
    expect(mockedCreateAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "training_feedback_submitted",
        entity_id: 41,
        user_id: 9,
      })
    );
  });
});
