import express from "express";
import request from "supertest";
import { prisma } from "../prisma";
import surveysRoutes from "./surveys";

jest.mock("../prisma", () => {
  const prismaMock = {
    clientSatisfactionSurvey: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
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

jest.mock("../services/notifications.service", () => ({
  __esModule: true,
  NotificationService: {
    createNotification: jest.fn(),
  },
}));

jest.mock("../services/notificationRecipients", () => ({
  __esModule: true,
  notifyProfilesByRoles: jest.fn(),
}));

type PrismaMock = {
  clientSatisfactionSurvey: {
    findUnique: jest.Mock;
    updateMany: jest.Mock;
  };
  job: {
    findUnique: jest.Mock;
  };
};

const mockedPrisma = prisma as unknown as PrismaMock;

const createApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/surveys", surveysRoutes);
  return app;
};

const baseSurvey = {
  id: 1,
  clientId: 7,
  jobId: null,
  surveyToken: "token-abc",
  expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  completedAt: null,
};

describe("public survey token endpoints", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 410 when survey token is expired on read", async () => {
    mockedPrisma.clientSatisfactionSurvey.findUnique.mockResolvedValue({
      ...baseSurvey,
      expiresAt: new Date(Date.now() - 60 * 1000),
    });

    const app = createApp();
    const response = await request(app).get("/api/surveys/token/token-abc");

    expect(response.status).toBe(410);
    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        error: "Survey token has expired",
      })
    );
  });

  it("blocks already submitted surveys", async () => {
    mockedPrisma.clientSatisfactionSurvey.findUnique.mockResolvedValue({
      ...baseSurvey,
      completedAt: new Date(),
    });

    const app = createApp();
    const response = await request(app).post("/api/surveys/token/token-abc/submit").send({
      overallSatisfaction: 4,
    });

    expect(response.status).toBe(409);
    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        error: "Survey has already been submitted",
      })
    );
    expect(mockedPrisma.clientSatisfactionSurvey.updateMany).not.toHaveBeenCalled();
  });

  it("validates rating range before submit", async () => {
    mockedPrisma.clientSatisfactionSurvey.findUnique.mockResolvedValue(baseSurvey);

    const app = createApp();
    const response = await request(app).post("/api/surveys/token/token-abc/submit").send({
      overallSatisfaction: 8,
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        error: "overallSatisfaction must be an integer between 1 and 5",
      })
    );
    expect(mockedPrisma.clientSatisfactionSurvey.updateMany).not.toHaveBeenCalled();
  });

  it("submits once and rejects repeat writes", async () => {
    mockedPrisma.clientSatisfactionSurvey.findUnique
      .mockResolvedValueOnce(baseSurvey)
      .mockResolvedValueOnce({
        ...baseSurvey,
        overallSatisfaction: 5,
        completedAt: new Date(),
      })
      .mockResolvedValueOnce(baseSurvey);
    mockedPrisma.clientSatisfactionSurvey.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const app = createApp();

    const first = await request(app).post("/api/surveys/token/token-abc/submit").send({
      overallSatisfaction: 5,
      communicationRating: 4,
      wouldRecommend: true,
    });
    expect(first.status).toBe(200);
    expect(first.body).toEqual(
      expect.objectContaining({
        success: true,
        message: "Survey submitted",
      })
    );

    const second = await request(app).post("/api/surveys/token/token-abc/submit").send({
      overallSatisfaction: 3,
    });
    expect(second.status).toBe(409);
    expect(second.body).toEqual(
      expect.objectContaining({
        success: false,
        error: "Survey has already been submitted or expired",
      })
    );
  });
});
