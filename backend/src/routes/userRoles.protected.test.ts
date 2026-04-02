import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import prisma from "../prisma";
import { authMiddleware } from "../middleware/auth";
import { requireModuleAccess } from "../middleware/requireModuleAccess";
import userRolesRoutes from "./userRoles";

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
  };

  return {
    __esModule: true,
    default: prismaMock,
    prisma: prismaMock,
  };
});

type PrismaMock = {
  session: {
    findFirst: jest.Mock;
  };
  user: {
    findUnique: jest.Mock;
  };
  userAuthRole: {
    findMany: jest.Mock;
  };
};

const mockedPrisma = prisma as unknown as PrismaMock;

const roleRow = (roleName: string, permissionKeys: string[]) => ({
  role: {
    name: roleName,
    isActive: true,
    permissions: permissionKeys.map((key) => ({
      permission: { key },
    })),
  },
});

const assignedRoleRow = (roleName: string) => ({
  role: {
    name: roleName,
    isActive: true,
    permissions: [],
  },
});

const createApp = () => {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/user-roles",
    authMiddleware,
    requireModuleAccess("users"),
    userRolesRoutes
  );
  return app;
};

const createToken = (userId = 1, email = "user@ronalds.local") =>
  jwt.sign(
    {
      userId,
      sub: userId,
      email,
      authRoles: ["employee"],
      sessionToken: "session_token_1",
    },
    process.env.JWT_SECRET || "secret",
    { expiresIn: "1h" }
  );

const mockActiveUser = (userId = 1, email = "user@ronalds.local") => {
  mockedPrisma.session.findFirst.mockResolvedValue({ id: 1 });
  mockedPrisma.user.findUnique.mockResolvedValue({
    id: userId,
    email,
    isActive: true,
    profile: {
      id: 101,
      status: "active",
      onboardingStatus: "completed",
      onboardingChecklistCompleted: true,
      inductionCompleted: true,
    },
  });
};

describe("user-roles protected reads", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "secret";
    jest.clearAllMocks();
  });

  it("allows a user to read their own assigned access roles", async () => {
    const app = createApp();
    const token = createToken(1);
    mockActiveUser(1);
    mockedPrisma.userAuthRole.findMany
      .mockResolvedValueOnce([roleRow("employee", ["module.users.read"])])
      .mockResolvedValueOnce([assignedRoleRow("employee")]);

    const response = await request(app)
      .get("/api/user-roles?userId=1")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([{ role: "employee" }]);
  });

  it("blocks non-admin users from reading another user's access roles", async () => {
    const app = createApp();
    const token = createToken(1);
    mockActiveUser(1);
    mockedPrisma.userAuthRole.findMany.mockResolvedValueOnce([
      roleRow("employee", ["module.users.read"]),
    ]);

    const response = await request(app)
      .get("/api/user-roles?userId=2")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: "You can only view your own access role assignments",
    });
  });

  it("allows users.admin readers to inspect another user's access roles", async () => {
    const app = createApp();
    const token = createToken(1);
    mockActiveUser(1);
    mockedPrisma.userAuthRole.findMany
      .mockResolvedValueOnce([roleRow("hr", ["module.users.admin"])])
      .mockResolvedValueOnce([assignedRoleRow("partner")]);

    const response = await request(app)
      .get("/api/user-roles?userId=2")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([{ role: "partner" }]);
  });
});
