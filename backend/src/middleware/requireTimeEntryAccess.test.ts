import { NextFunction, Response } from "express";
import { prisma } from "../prisma";
import { AuthRequest } from "./auth";
import { requireTimeEntryAccess } from "./requireTimeEntryAccess";

jest.mock("../prisma", () => {
  const prismaMock = {
    timeEntry: {
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
  timeEntry: {
    findUnique: jest.Mock;
  };
};

const mockedPrisma = prisma as unknown as PrismaMock;

const createReq = (overrides: Partial<AuthRequest> = {}): AuthRequest =>
  ({
    params: { timeEntryId: "10" },
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

const createTimeEntry = (overrides: Record<string, any> = {}) => ({
  id: 10,
  employeeProfileId: 200,
  job: {
    managerProfileId: 300,
    partnerProfileId: 400,
  },
  employee: {
    id: 200,
    managerId: 300,
  },
  ...overrides,
});

describe("requireTimeEntryAccess middleware", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 401 when requester profile is missing", async () => {
    const req = createReq({ profile: undefined });
    const res = createRes();
    const next = jest.fn() as NextFunction;

    await requireTimeEntryAccess(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
    expect(mockedPrisma.timeEntry.findUnique).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid time entry id", async () => {
    const req = createReq({ params: { timeEntryId: "abc" } as any });
    const res = createRes();
    const next = jest.fn() as NextFunction;

    await requireTimeEntryAccess(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Invalid time entry id" });
    expect(mockedPrisma.timeEntry.findUnique).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 404 when time entry does not exist", async () => {
    mockedPrisma.timeEntry.findUnique.mockResolvedValue(null);

    const req = createReq();
    const res = createRes();
    const next = jest.fn() as NextFunction;

    await requireTimeEntryAccess(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "Time entry not found" });
    expect(next).not.toHaveBeenCalled();
  });

  it("allows owner access", async () => {
    mockedPrisma.timeEntry.findUnique.mockResolvedValue(
      createTimeEntry({ employeeProfileId: 100 })
    );

    const req = createReq();
    const res = createRes();
    const next = jest.fn() as NextFunction;

    await requireTimeEntryAccess(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("denies manager role without job/team scope", async () => {
    mockedPrisma.timeEntry.findUnique.mockResolvedValue(createTimeEntry());

    const req = createReq({
      profile: {
        id: 999,
        firstName: "M",
        lastName: "N",
        status: "active",
        isPartner: false,
        department: null,
        role: { id: 2, name: "manager" },
        manager: null,
      } as any,
    });
    const res = createRes();
    const next = jest.fn() as NextFunction;

    await requireTimeEntryAccess(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: "You do not have permission to access this time entry",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("allows manager when they manage the job", async () => {
    mockedPrisma.timeEntry.findUnique.mockResolvedValue(createTimeEntry());

    const req = createReq({
      profile: {
        id: 300,
        firstName: "Mgr",
        lastName: "One",
        status: "active",
        isPartner: false,
        department: null,
        role: { id: 2, name: "manager" },
        manager: null,
      } as any,
    });
    const res = createRes();
    const next = jest.fn() as NextFunction;

    await requireTimeEntryAccess(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("allows manager when they directly supervise the employee", async () => {
    mockedPrisma.timeEntry.findUnique.mockResolvedValue(
      createTimeEntry({
        job: { managerProfileId: 777, partnerProfileId: 400 },
        employee: { id: 200, managerId: 300 },
      })
    );

    const req = createReq({
      profile: {
        id: 300,
        firstName: "Mgr",
        lastName: "Two",
        status: "active",
        isPartner: false,
        department: null,
        role: { id: 2, name: "manager" },
        manager: null,
      } as any,
    });
    const res = createRes();
    const next = jest.fn() as NextFunction;

    await requireTimeEntryAccess(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("allows partner only for their own portfolio job", async () => {
    mockedPrisma.timeEntry.findUnique.mockResolvedValue(createTimeEntry());

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

    await requireTimeEntryAccess(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("allows super admin role from auth token claims", async () => {
    mockedPrisma.timeEntry.findUnique.mockResolvedValue(createTimeEntry());

    const req = createReq({
      user: {
        userId: 1,
        email: "admin@ronalds.local",
        authRoles: ["super_admin"],
      },
    });
    const res = createRes();
    const next = jest.fn() as NextFunction;

    await requireTimeEntryAccess(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});
