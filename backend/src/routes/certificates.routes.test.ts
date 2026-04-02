import express from "express";
import request from "supertest";
import prisma from "../prisma";
import certificatesRoutes from "./certificates";

jest.mock("../prisma", () => {
  const prismaMock = {
    issuedCertificate: {
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
  issuedCertificate: {
    findUnique: jest.Mock;
  };
};

const mockedPrisma = prisma as unknown as PrismaMock;

const createApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/certificates", certificatesRoutes);
  return app;
};

describe("certificate verification routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns the public verification payload for a valid certificate", async () => {
    const app = createApp();
    mockedPrisma.issuedCertificate.findUnique.mockResolvedValue({
      id: 12,
      status: "issued",
      certificateNumber: "CERT-12-123456789",
      verificationCode: "VERIFY-001",
      issuedAt: new Date("2026-03-24T09:00:00.000Z"),
      revokedAt: null,
      document: {
        filePath: "/uploads/documents/cert-12.pdf",
      },
      certificateTemplate: {
        issuedByLabel: "HR Department",
        templateDefinition: {},
      },
      globalCertificateTemplate: null,
      assignment: {
        employee: {
          id: 17,
          firstName: "Ada",
          lastName: "Njeri",
          employeeId: "EMP-17",
        },
        programVersion: {
          title: "Advanced Audit Workshop",
          provider: "Ronalds Growth Hub",
          externalTrainerName: null,
          trainer: null,
          program: {
            id: 4,
            title: "Advanced Audit Workshop",
          },
        },
      },
    });

    const response = await request(app).get("/api/certificates/verify/verify-001");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        valid: true,
        certificateNumber: "CERT-12-123456789",
        verificationCode: "VERIFY-001",
        issuedBy: "HR Department",
        downloadUrl: "/uploads/documents/cert-12.pdf",
        learner: expect.objectContaining({
          name: "Ada Njeri",
          employeeId: "EMP-17",
        }),
        training: expect.objectContaining({
          name: "Advanced Audit Workshop",
        }),
      })
    );
    expect(mockedPrisma.issuedCertificate.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          verificationCode: "VERIFY-001",
        },
      })
    );
  });
});
