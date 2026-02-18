import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import prisma from "../prisma";
import financeDashboardRoutes from "./financeDashboard";

jest.mock("../prisma", () => {
  const prismaMock = {
    user: {
      findUnique: jest.fn(),
    },
    userAuthRole: {
      findMany: jest.fn(),
    },
    clientPayment: {
      create: jest.fn(),
    },
    job: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    profile: {
      findUnique: jest.fn(),
    },
  };

  return {
    __esModule: true,
    default: prismaMock,
    prisma: prismaMock,
  };
});

jest.mock("../services/notificationRecipients", () => ({
  __esModule: true,
  notifyProfile: jest.fn(),
  notifyProfilesByRoles: jest.fn(),
}));

type PrismaMock = {
  user: { findUnique: jest.Mock };
  userAuthRole: { findMany: jest.Mock };
  clientPayment: { create: jest.Mock };
  job: { findUnique: jest.Mock; update: jest.Mock };
  profile: { findUnique: jest.Mock };
};

const mockedPrisma = prisma as unknown as PrismaMock;

const createToken = (userId = 1, email = "finance@ronalds.local") =>
  jwt.sign(
    {
      userId,
      sub: userId,
      email,
      authRoles: ["finance"],
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

const mockAuthenticatedUser = () => {
  mockedPrisma.user.findUnique.mockResolvedValue({
    id: 1,
    email: "finance@ronalds.local",
    isActive: true,
    profile: {
      id: 101,
      status: "active",
    },
  });
};

const setRolePolicy = (permissionKeys: string[]) => {
  mockedPrisma.userAuthRole.findMany.mockResolvedValue([roleRow(permissionKeys)]);
};

const createApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/finance-dashboard", financeDashboardRoutes);
  return app;
};

describe("finance dashboard permission boundaries", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "secret";
    jest.clearAllMocks();
    mockAuthenticatedUser();
  });

  it("blocks collection creation when user only has finance.read", async () => {
    const app = createApp();
    const token = createToken();
    setRolePolicy(["module.finance.read"]);

    const response = await request(app)
      .post("/api/finance-dashboard/collections")
      .set("Authorization", `Bearer ${token}`)
      .send({
        clientId: 10,
        paymentAmount: 1000,
        paymentDate: "2026-02-15",
      });

    expect(response.status).toBe(403);
    expect(response.body).toEqual(
      expect.objectContaining({
        error: "Forbidden - insufficient module access",
        module: "finance",
        action: "write",
      })
    );
    expect(mockedPrisma.clientPayment.create).not.toHaveBeenCalled();
  });

  it("allows collection creation when user has finance.write", async () => {
    const app = createApp();
    const token = createToken();
    setRolePolicy(["module.finance.write"]);
    mockedPrisma.clientPayment.create.mockResolvedValue({
      id: 9001,
      clientId: 10,
      jobId: null,
      paymentAmount: 1000,
      currency: "KES",
      paymentDate: new Date("2026-02-15"),
      paymentMethod: null,
      referenceNumber: null,
      notes: null,
    });

    const response = await request(app)
      .post("/api/finance-dashboard/collections")
      .set("Authorization", `Bearer ${token}`)
      .send({
        clientId: 10,
        paymentAmount: 1000,
        paymentDate: "2026-02-15",
      });

    expect(response.status).toBe(201);
    expect(response.body).toEqual(expect.objectContaining({ id: 9001, clientId: 10 }));
    expect(mockedPrisma.clientPayment.create).toHaveBeenCalledTimes(1);
  });

  it("blocks collection-stage updates when user only has finance.write", async () => {
    const app = createApp();
    const token = createToken();
    setRolePolicy(["module.finance.write"]);

    const response = await request(app)
      .patch("/api/finance-dashboard/job-balances/22/collection-stage")
      .set("Authorization", `Bearer ${token}`)
      .send({ collectionStage: "not_ready" });

    expect(response.status).toBe(403);
    expect(response.body).toEqual(
      expect.objectContaining({
        error: "Forbidden - insufficient module access",
        module: "finance",
        action: "approve",
      })
    );
  });

  it("allows collection-stage updates when user has finance.approve", async () => {
    const app = createApp();
    const token = createToken();
    setRolePolicy(["module.finance.approve"]);
    mockedPrisma.job.findUnique.mockResolvedValue({
      id: 22,
      jobName: "Audit FY26",
      collectionStage: "overdue",
      readyForCollectionAt: null,
      partnerProfileId: null,
      managerProfileId: null,
    });
    mockedPrisma.job.update.mockResolvedValue({
      id: 22,
      jobCode: "JOB-022",
      jobName: "Audit FY26",
      collectionStage: "not_ready",
      readyForCollectionAt: null,
    });

    const response = await request(app)
      .patch("/api/finance-dashboard/job-balances/22/collection-stage")
      .set("Authorization", `Bearer ${token}`)
      .send({ collectionStage: "not_ready" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        id: 22,
        collectionStage: "not_ready",
      })
    );
  });

  it("blocks owner reassignment when user only has finance.approve", async () => {
    const app = createApp();
    const token = createToken();
    setRolePolicy(["module.finance.approve"]);

    const response = await request(app)
      .patch("/api/finance-dashboard/job-balances/22/owner")
      .set("Authorization", `Bearer ${token}`)
      .send({ ownerProfileId: null });

    expect(response.status).toBe(403);
    expect(response.body).toEqual(
      expect.objectContaining({
        error: "Forbidden - insufficient module access",
        module: "finance",
        action: "admin",
      })
    );
  });

  it("allows owner reassignment when user has finance.admin", async () => {
    const app = createApp();
    const token = createToken();
    setRolePolicy(["module.finance.admin"]);
    mockedPrisma.job.findUnique.mockResolvedValue({
      id: 22,
      jobName: "Audit FY26",
      receivableOwnerProfileId: null,
    });
    mockedPrisma.job.update.mockResolvedValue({
      id: 22,
      jobCode: "JOB-022",
      jobName: "Audit FY26",
      receivableOwnerProfileId: null,
      receivableOwnerAssignedAt: null,
      receivableOwner: null,
    });

    const response = await request(app)
      .patch("/api/finance-dashboard/job-balances/22/owner")
      .set("Authorization", `Bearer ${token}`)
      .send({ ownerProfileId: null });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        jobId: 22,
        receivableOwnerProfileId: null,
      })
    );
  });
});
