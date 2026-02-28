import { NextFunction, Response } from "express";
import { prisma } from "../prisma";
import { AuthRequest } from "./auth";
import { requireJobAccess } from "./requireJobAccess";

jest.mock("../prisma", () => {
  const prismaMock = {
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

type PrismaMock = {
  job: {
    findUnique: jest.Mock;
  };
};

const mockedPrisma = prisma as unknown as PrismaMock;

const createReq = (overrides: Partial<AuthRequest> = {}): AuthRequest =>
  ({
    params: { jobId: "10" },
    user: {
      userId: 1,
      email: "user@ronalds.local",
      authRoles: [],
    },
    profile: {
      id: 100,
      firstName: "Test",
      lastName: "User",
      status: "active",
      isPartner: false,
      department: null,
      role: { id: 1, name: "employee" },
      manager: null,
    },
    ...overrides,
  } as AuthRequest);

const createRes = (): Response =>
  ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response);

const createJob = (overrides: Record<string, any> = {}) => ({
  id: 10,
  managerProfileId: 300,
  partnerProfileId: 400,
  staffing: [],
  ...overrides,
});

describe("requireJobAccess middleware", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 400 for invalid job id", async () => {
    const req = createReq({ params: { jobId: "abc" } as any });
    const res = createRes();
    const next = jest.fn() as NextFunction;

    await requireJobAccess("view")(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Invalid job id",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when requester profile is missing", async () => {
    const req = createReq({ profile: undefined });
    const res = createRes();
    const next = jest.fn() as NextFunction;

    await requireJobAccess("view")(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Unauthorized",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 404 when job does not exist", async () => {
    mockedPrisma.job.findUnique.mockResolvedValue(null);

    const req = createReq();
    const res = createRes();
    const next = jest.fn() as NextFunction;

    await requireJobAccess("view")(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Job not found",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("allows assigned staff to view", async () => {
    mockedPrisma.job.findUnique.mockResolvedValue(
      createJob({ staffing: [{ id: 1, employeeProfileId: 100 }] })
    );

    const req = createReq();
    const res = createRes();
    const next = jest.fn() as NextFunction;

    await requireJobAccess("view")(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.job).toEqual(expect.objectContaining({ id: 10 }));
  });

  it("blocks assigned staff from manage access", async () => {
    mockedPrisma.job.findUnique.mockResolvedValue(
      createJob({ staffing: [{ id: 1, employeeProfileId: 100 }] })
    );

    const req = createReq();
    const res = createRes();
    const next = jest.fn() as NextFunction;

    await requireJobAccess("manage")(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "You do not have permission to manage this job",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("blocks unscoped manager from view", async () => {
    mockedPrisma.job.findUnique.mockResolvedValue(createJob());

    const req = createReq({
      profile: {
        id: 999,
        firstName: "Mgr",
        lastName: "User",
        status: "active",
        isPartner: false,
        department: null,
        role: { id: 2, name: "manager" },
        manager: null,
      } as any,
    });
    const res = createRes();
    const next = jest.fn() as NextFunction;

    await requireJobAccess("view")(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("allows scoped manager to manage", async () => {
    mockedPrisma.job.findUnique.mockResolvedValue(createJob({ managerProfileId: 300 }));

    const req = createReq({
      profile: {
        id: 300,
        firstName: "Mgr",
        lastName: "User",
        status: "active",
        isPartner: false,
        department: null,
        role: { id: 2, name: "manager" },
        manager: null,
      } as any,
    });
    const res = createRes();
    const next = jest.fn() as NextFunction;

    await requireJobAccess("manage")(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("allows partner for own portfolio job manage", async () => {
    mockedPrisma.job.findUnique.mockResolvedValue(createJob({ partnerProfileId: 400 }));

    const req = createReq({
      profile: {
        id: 400,
        firstName: "Partner",
        lastName: "User",
        status: "active",
        isPartner: true,
        department: null,
        role: { id: 3, name: "partner" },
        manager: null,
      } as any,
    });
    const res = createRes();
    const next = jest.fn() as NextFunction;

    await requireJobAccess("manage")(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
