import { NextFunction, Response } from "express";
import prisma from "../prisma";
import { AuthRequest } from "./auth";
import { requireModuleAccess } from "./requireModuleAccess";

jest.mock("../prisma", () => ({
  __esModule: true,
  default: {
    userAuthRole: {
      findMany: jest.fn(),
    },
  },
}));

type PrismaMock = {
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

const createReq = (overrides: Partial<AuthRequest> = {}): AuthRequest =>
  ({
    method: "GET",
    user: {
      userId: 1,
      email: "test@ronalds.local",
    },
    ...overrides,
  } as AuthRequest);

const createRes = (): Response => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res as unknown as Response;
};

describe("requireModuleAccess middleware", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 401 when user is not authenticated", async () => {
    const middleware = requireModuleAccess("jobs");
    const req = createReq({ user: undefined });
    const res = createRes();
    const next = jest.fn() as NextFunction;

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "User not authenticated" });
    expect(next).not.toHaveBeenCalled();
    expect(mockedPrisma.userAuthRole.findMany).not.toHaveBeenCalled();
  });

  it("allows access when explicit strict module permission grants the action", async () => {
    mockedPrisma.userAuthRole.findMany.mockResolvedValue([
      roleRow("partner", true, ["module.jobs.read"]),
    ]);

    const middleware = requireModuleAccess("jobs");
    const req = createReq();
    const res = createRes();
    const next = jest.fn() as NextFunction;

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(req.userRolePolicies).toEqual([
      {
        roleName: "partner",
        permissionKeys: ["module.jobs.read"],
      },
    ]);
    expect(mockedPrisma.userAuthRole.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 1 },
      })
    );
  });

  it("denies fallback access for a role when explicit strict policy exists", async () => {
    mockedPrisma.userAuthRole.findMany.mockResolvedValue([
      roleRow("partner", true, ["module.jobs.read"]),
    ]);

    const middleware = requireModuleAccess("finance");
    const req = createReq();
    const res = createRes();
    const next = jest.fn() as NextFunction;

    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "Forbidden - insufficient module access",
        module: "finance",
        action: "read",
      })
    );
  });

  it("still applies fallback when role has no explicit module permissions", async () => {
    mockedPrisma.userAuthRole.findMany.mockResolvedValue([
      roleRow("partner", true, ["users.manage"]),
    ]);

    const middleware = requireModuleAccess("finance");
    const req = createReq();
    const res = createRes();
    const next = jest.fn() as NextFunction;

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("ignores inactive roles when computing module access", async () => {
    mockedPrisma.userAuthRole.findMany.mockResolvedValue([
      roleRow("admin", false, ["module.*.admin"]),
      roleRow("employee", true, []),
    ]);

    const middleware = requireModuleAccess("access_control");
    const req = createReq();
    const res = createRes();
    const next = jest.fn() as NextFunction;

    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("caches role policies on request and avoids duplicate DB reads", async () => {
    mockedPrisma.userAuthRole.findMany.mockResolvedValue([]);

    const middleware = requireModuleAccess("dashboard");
    const req = createReq();
    const firstRes = createRes();
    const secondRes = createRes();
    const next = jest.fn() as NextFunction;

    await middleware(req, firstRes, next);
    await middleware(req, secondRes, next);

    expect(mockedPrisma.userAuthRole.findMany).toHaveBeenCalledTimes(1);
    expect(req.userRolePolicies).toEqual([]);
  });
});
