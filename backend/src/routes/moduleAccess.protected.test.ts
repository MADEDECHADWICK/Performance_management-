import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import prisma from "../prisma";
import { authMiddleware } from "../middleware/auth";
import { requireModuleAccess } from "../middleware/requireModuleAccess";
import { CANONICAL_ROLES } from "../auth/canonicalRoles";
import moduleAccessRoutes from "./moduleAccess";

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

const roleRow = (roleName: string, isActive: boolean, permissionKeys: string[]) => ({
  role: {
    name: roleName,
    isActive,
    permissions: permissionKeys.map((key) => ({
      permission: { key },
    })),
  },
});

const createApp = () => {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/module-access",
    authMiddleware,
    requireModuleAccess("access_control"),
    moduleAccessRoutes
  );
  return app;
};

const createToken = (userId = 1, email = "user@ronalds.local") =>
  jwt.sign(
    {
      userId,
      sub: userId,
      email,
      authRoles: ["hr"],
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
    },
  });
};

describe("module-access protected route pipeline", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "secret";
    jest.clearAllMocks();
  });

  it("returns 401 when token is missing", async () => {
    const app = createApp();

    const response = await request(app).get("/api/module-access/modules");

    expect(response.status).toBe(401);
    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        message: "Unauthorized - Missing or invalid token",
      })
    );
    expect(mockedPrisma.session.findFirst).not.toHaveBeenCalled();
    expect(mockedPrisma.user.findUnique).not.toHaveBeenCalled();
    expect(mockedPrisma.userAuthRole.findMany).not.toHaveBeenCalled();
  });

  it("returns 403 when strict policy does not grant access_control", async () => {
    const app = createApp();
    const token = createToken();
    mockActiveUser();
    mockedPrisma.userAuthRole.findMany.mockResolvedValue([
      roleRow("partner", true, ["module.jobs.read"]),
    ]);

    const response = await request(app)
      .get("/api/module-access/modules")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body).toEqual(
      expect.objectContaining({
        error: "Forbidden - insufficient module access",
        module: "access_control",
        action: "read",
      })
    );
  });

  it("returns 200 when strict policy grants access_control.read", async () => {
    const app = createApp();
    const token = createToken();
    mockActiveUser();
    mockedPrisma.userAuthRole.findMany.mockResolvedValue([
      roleRow("hr", true, ["module.access_control.read"]),
    ]);

    const response = await request(app)
      .get("/api/module-access/modules")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        actions: ["read", "write", "approve", "admin"],
      })
    );
    expect(Array.isArray(response.body.modules)).toBe(true);
    expect(response.body.modules.length).toBeGreaterThan(0);
  });

  it("returns 403 on /matrix when role has access_control.read but not admin", async () => {
    const app = createApp();
    const token = createToken();
    mockActiveUser();
    mockedPrisma.userAuthRole.findMany.mockResolvedValue([
      roleRow("partner", true, ["module.access_control.read"]),
    ]);

    const response = await request(app)
      .get("/api/module-access/matrix")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body).toEqual(
      expect.objectContaining({
        error: "Forbidden - insufficient module access",
        module: "access_control",
        action: "admin",
      })
    );
  });

  it("returns canonical-only matrix payload without alias map", async () => {
    const app = createApp();
    const token = createToken();
    mockActiveUser();
    mockedPrisma.userAuthRole.findMany.mockResolvedValue([
      roleRow("hr", true, ["module.access_control.admin"]),
    ]);

    const response = await request(app)
      .get("/api/module-access/matrix")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        canonicalRoles: CANONICAL_ROLES,
        roleModulePermissionMatrix: expect.any(Object),
      })
    );
    expect(response.body).not.toHaveProperty("roleAliasMigrationMap");
    expect(response.body.roleModulePermissionMatrix).toHaveProperty("hr");
  });
});
