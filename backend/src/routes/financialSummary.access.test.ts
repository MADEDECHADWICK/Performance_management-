import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import prisma from "../prisma";
import { authMiddleware } from "../middleware/auth";
import financialSummaryRoutes from "./financialSummary";
import JobPerformanceFactsService from "../services/jobPerformanceFacts.service";

jest.mock("../prisma", () => {
  const prismaMock = {
    session: {
      findFirst: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    userAuthRole: {
      findMany: jest.fn(),
    },
    profile: {
      findUnique: jest.fn(),
      count: jest.fn(),
    },
  };

  return {
    __esModule: true,
    default: prismaMock,
    prisma: prismaMock,
  };
});

jest.mock("../services/jobPerformanceFacts.service", () => ({
  __esModule: true,
  default: {
    listFacts: jest.fn(),
  },
}));

type PrismaMock = {
  session: { findFirst: jest.Mock };
  user: { findUnique: jest.Mock };
  userAuthRole: { findMany: jest.Mock };
  profile: { findUnique: jest.Mock; count: jest.Mock };
};

const mockedPrisma = prisma as unknown as PrismaMock;
const mockedListFacts = JobPerformanceFactsService.listFacts as jest.Mock;

const emptyFact = {
  totalHours: 0,
  billableHours: 0,
  nonBillableHours: 0,
  billableValue: 0,
  billedRevenue: 0,
  collectedRevenue: 0,
  actualCost: 0,
  cashProfit: 0,
  partnerProfileId: null,
  departmentId: null,
};

const createToken = (userId = 1, email = "finance@ronalds.local") =>
  jwt.sign(
    {
      userId,
      sub: userId,
      email,
      authRoles: ["finance"],
      sessionToken: `financial-summary-test-session-${userId}`,
    },
    process.env.JWT_SECRET || "secret",
    { expiresIn: "1h" }
  );

const roleRow = (permissionKeys: string[]) => ({
  role: {
    name: "finance_custom",
    isActive: true,
    permissions: permissionKeys.map((key) => ({
      permission: { key },
    })),
  },
});

const mockAuthenticatedUser = (profileId = 11) => {
  mockedPrisma.session.findFirst.mockResolvedValue({ id: 1 });
  mockedPrisma.user.findUnique.mockResolvedValue({
    id: 1,
    email: "finance@ronalds.local",
    isActive: true,
    profile: {
      id: profileId,
      status: "active",
      onboardingStatus: "completed",
      onboardingChecklistCompleted: true,
      inductionCompleted: true,
    },
  });
};

const setRolePolicy = (permissionKeys: string[]) => {
  mockedPrisma.userAuthRole.findMany.mockResolvedValue([roleRow(permissionKeys)]);
};

const createApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/financial-summary", authMiddleware, financialSummaryRoutes);
  return app;
};

describe("financial summary permission boundaries", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "secret";
    jest.clearAllMocks();
    mockAuthenticatedUser();
  });

  it("blocks company summary when user only has finance.read", async () => {
    const app = createApp();
    const token = createToken();
    setRolePolicy(["module.finance.read"]);

    const response = await request(app)
      .get("/api/financial-summary/company")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body).toEqual(
      expect.objectContaining({
        error: "Forbidden - insufficient module access",
        module: "finance",
        action: "approve",
      })
    );
    expect(mockedListFacts).not.toHaveBeenCalled();
  });

  it("allows company summary when user has finance.approve", async () => {
    const app = createApp();
    const token = createToken();
    setRolePolicy(["module.finance.approve"]);
    mockedListFacts.mockResolvedValue([{ ...emptyFact, collectedRevenue: 1000000 }]);
    mockedPrisma.profile.count.mockResolvedValue(5);

    const response = await request(app)
      .get("/api/financial-summary/company")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        company_total_revenue: 1000000,
      })
    );
  });

  it("allows employee contribution for own profile with finance.read", async () => {
    const app = createApp();
    const token = createToken();
    setRolePolicy(["module.finance.read"]);
    mockedListFacts.mockResolvedValue([{ ...emptyFact, totalHours: 100, billableHours: 80 }]);

    const response = await request(app)
      .get("/api/financial-summary/employee/11")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        employee_id: 11,
      })
    );
  });

  it("blocks employee contribution for another profile with finance.read only", async () => {
    const app = createApp();
    const token = createToken();
    setRolePolicy(["module.finance.read"]);

    const response = await request(app)
      .get("/api/financial-summary/employee/77")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body).toEqual(
      expect.objectContaining({
        error: "Access denied",
      })
    );
    expect(mockedListFacts).not.toHaveBeenCalled();
  });

  it("allows employee contribution for another profile with finance.approve", async () => {
    const app = createApp();
    const token = createToken();
    setRolePolicy(["module.finance.approve"]);
    mockedListFacts.mockResolvedValue([{ ...emptyFact, totalHours: 200, billableHours: 160 }]);

    const response = await request(app)
      .get("/api/financial-summary/employee/77")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        employee_id: 77,
      })
    );
  });
});
