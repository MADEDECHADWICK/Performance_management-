import { NextFunction, Response } from "express";
import prisma from "../prisma";
import { AuthRequest } from "./auth";
import { requireRole } from "./reqiureRole";

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
    method: "POST",
    user: {
      userId: 1,
      email: "user@ronalds.local",
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

describe("requireRole module-policy bridge", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("allows admin-gated endpoints via module admin permission when module context exists", async () => {
    mockedPrisma.userAuthRole.findMany.mockResolvedValue([
      roleRow("custom_role", true, ["module.users.admin"]),
    ]);

    const middleware = requireRole("admin", "hr", "hr_manager", "super_admin");
    const req = createReq({
      currentModuleAccess: { moduleKey: "users", action: "read" },
    });
    const res = createRes();
    const next = jest.fn() as NextFunction;

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("denies admin-gated endpoints when module admin permission is missing", async () => {
    mockedPrisma.userAuthRole.findMany.mockResolvedValue([
      roleRow("custom_role", true, ["module.users.read"]),
    ]);

    const middleware = requireRole("admin", "hr", "hr_manager", "super_admin");
    const req = createReq({
      currentModuleAccess: { moduleKey: "users", action: "read" },
    });
    const res = createRes();
    const next = jest.fn() as NextFunction;

    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "Forbidden - insufficient module access",
        module: "users",
        action: "admin",
      })
    );
  });

  it("maps managerial role-gates to approve when module context exists", async () => {
    mockedPrisma.userAuthRole.findMany.mockResolvedValue([
      roleRow("custom_role", true, ["module.time_entries.approve"]),
    ]);

    const middleware = requireRole("manager", "partner", "admin");
    const req = createReq({
      method: "POST",
      currentModuleAccess: { moduleKey: "time_entries", action: "read" },
    });
    const res = createRes();
    const next = jest.fn() as NextFunction;

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("falls back to legacy role intersection when no module context exists", async () => {
    mockedPrisma.userAuthRole.findMany.mockResolvedValue([
      roleRow("manager", true, []),
    ]);

    const middleware = requireRole("manager", "partner", "admin");
    const req = createReq();
    const res = createRes();
    const next = jest.fn() as NextFunction;

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});
