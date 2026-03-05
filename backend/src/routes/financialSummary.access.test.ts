import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import prisma from "../prisma";
import financialSummaryRoutes from "./financialSummary";

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
    },
    $queryRaw: jest.fn(),
  };

  return {
    __esModule: true,
    default: prismaMock,
    prisma: prismaMock,
  };
});

type PrismaMock = {
  session: { findFirst: jest.Mock };
  user: { findUnique: jest.Mock };
  userAuthRole: { findMany: jest.Mock };
  profile: { findUnique: jest.Mock };
  $queryRaw: jest.Mock;
};

const mockedPrisma = prisma as unknown as PrismaMock;

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
  app.use("/api/financial-summary", financialSummaryRoutes);
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
    expect(mockedPrisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("allows company summary when user has finance.approve", async () => {
    const app = createApp();
    const token = createToken();
    setRolePolicy(["module.finance.approve"]);
    mockedPrisma.$queryRaw.mockResolvedValue([
      {
        company_total_revenue: 1000000,
      },
    ]);

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
    mockedPrisma.$queryRaw.mockResolvedValue([
      {
        employee_id: 11,
        total_revenue: 150000,
      },
    ]);

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
    expect(mockedPrisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("allows employee contribution for another profile with finance.approve", async () => {
    const app = createApp();
    const token = createToken();
    setRolePolicy(["module.finance.approve"]);
    mockedPrisma.$queryRaw.mockResolvedValue([
      {
        employee_id: 77,
        total_revenue: 200000,
      },
    ]);

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
