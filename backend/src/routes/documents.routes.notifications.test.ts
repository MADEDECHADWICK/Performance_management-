import express from "express";
import request from "supertest";
import prisma from "../prisma";
import { DocumentVerificationStatus } from "@prisma/client";
import { NotificationService } from "../services/notifications.service";
import documentsRoutes from "./documents.routes";

jest.mock("../middleware/auth", () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.user = {
      userId: 1,
      email: "hr@ronalds.local",
      profileId: 700,
      authRoles: ["hr"],
    };
    next();
  },
}));

jest.mock("../middleware/loadProfile", () => ({
  loadProfile: (req: any, _res: any, next: any) => {
    req.profile = {
      id: 700,
      firstName: "HR",
      lastName: "Owner",
      status: "active",
      isPartner: false,
      department: null,
      role: { id: 1, name: "hr" },
      manager: null,
    };
    if (req.user) {
      req.user.profileId = 700;
    }
    next();
  },
}));

jest.mock("../middleware/reqiureRole", () => ({
  requireRole:
    (...allowedRoles: string[]) =>
    (req: any, res: any, next: any) => {
      const required = allowedRoles.map((role) => role.toLowerCase());
      const roles = (req.user?.authRoles ?? []).map((role: string) =>
        role.toLowerCase()
      );
      req.userRoles = roles;
      if (!roles.some((role: string) => required.includes(role))) {
        res.status(403).json({
          error: `Forbidden - Required roles: ${allowedRoles.join(", ")}`,
        });
        return;
      }
      next();
    },
}));

jest.mock("../middleware/requireDocumentAccess", () => ({
  requireDocumentAccess: (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../prisma", () => {
  const prismaMock = {
    document: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      delete: jest.fn(),
    },
    offboardingChecklistItem: {
      findUnique: jest.fn(),
    },
    inductionChecklist: {
      findUnique: jest.fn(),
    },
    employeeOnboardingCase: {
      findUnique: jest.fn(),
    },
    employeeOffboardingCase: {
      findUnique: jest.fn(),
    },
    clientOnboarding: {
      findUnique: jest.fn(),
    },
    profile: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    recruitmentCandidate: {
      findUnique: jest.fn(),
    },
    job: {
      findUnique: jest.fn(),
    },
    task: {
      findUnique: jest.fn(),
    },
    engagementLetter: {
      findUnique: jest.fn(),
    },
    client: {
      findUnique: jest.fn(),
    },
    proposal: {
      findUnique: jest.fn(),
    },
  };

  return {
    __esModule: true,
    default: prismaMock,
    prisma: prismaMock,
  };
});

jest.mock("../services/notifications.service", () => ({
  NotificationService: {
    createNotification: jest.fn(),
  },
}));

const mockedPrisma = prisma as any;
const mockedNotificationService = NotificationService as jest.Mocked<
  typeof NotificationService
>;

const createApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/documents", documentsRoutes);
  return app;
};

const createBaseDocument = (overrides: Record<string, any> = {}) => ({
  id: 11,
  fileName: "doc.pdf",
  filePath: "/uploads/doc.pdf",
  documentType: "offboarding_task",
  entityType: "OffboardingChecklistItem",
  entityId: 12,
  accessLevel: "hr",
  isRequired: true,
  verificationStatus: DocumentVerificationStatus.pending,
  rejectionReason: null,
  uploadedBy: 700,
  verifiedBy: null,
  verifiedAt: null,
  uploader: { id: 700, firstName: "HR", lastName: "Owner" },
  verifier: null,
  ...overrides,
});

describe("documents routes notification integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockedPrisma.offboardingChecklistItem.findUnique.mockResolvedValue(null);
    mockedPrisma.inductionChecklist.findUnique.mockResolvedValue(null);
    mockedPrisma.employeeOnboardingCase.findUnique.mockResolvedValue(null);
    mockedPrisma.employeeOffboardingCase.findUnique.mockResolvedValue(null);
    mockedPrisma.clientOnboarding.findUnique.mockResolvedValue(null);
    mockedPrisma.profile.findUnique.mockResolvedValue(null);
    mockedPrisma.profile.findMany.mockResolvedValue([]);
    mockedPrisma.recruitmentCandidate.findUnique.mockResolvedValue(null);
    mockedPrisma.job.findUnique.mockResolvedValue(null);
    mockedPrisma.task.findUnique.mockResolvedValue(null);
    mockedPrisma.engagementLetter.findUnique.mockResolvedValue(null);
    mockedPrisma.client.findUnique.mockResolvedValue(null);
    mockedPrisma.proposal.findUnique.mockResolvedValue(null);
    mockedNotificationService.createNotification.mockResolvedValue({ id: 1 } as any);
  });

  it("POST /documents submits offboarding document and notifies the targeted employee", async () => {
    const app = createApp();
    mockedPrisma.document.create.mockResolvedValue(createBaseDocument());
    mockedPrisma.offboardingChecklistItem.findUnique.mockResolvedValue({
      id: 12,
      itemName: "Return laptop",
      offboardingCase: {
        id: 40,
        profileId: 501,
        hrOwnerProfileId: 700,
      },
    });

    const response = await request(app).post("/documents").send({
      fileName: "handover.pdf",
      filePath: "/uploads/handover.pdf",
      documentType: "offboarding_task",
      entityType: "OffboardingChecklistItem",
      entityId: 12,
      accessLevel: "hr",
    });

    expect(response.status).toBe(201);
    expect(response.body).toEqual(
      expect.objectContaining({
        success: true,
        message: "Document uploaded",
      })
    );
    expect(mockedPrisma.document.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          uploadedBy: 700,
          entityType: "OffboardingChecklistItem",
          entityId: 12,
        }),
      })
    );
    expect(mockedNotificationService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientProfileId: 501,
        title: "Offboarding document submitted",
        actionRequired: true,
      }),
      expect.objectContaining({
        userId: 1,
        profileId: 700,
      })
    );
  });

  it("PATCH /documents/:id/verify rejects document and notifies uploader", async () => {
    const app = createApp();
    mockedPrisma.document.findUnique.mockResolvedValue(
      createBaseDocument({
        id: 55,
        fileName: "policy.pdf",
        entityType: "Profile",
        entityId: 501,
        uploadedBy: 501,
      })
    );
    mockedPrisma.document.update.mockResolvedValue(
      createBaseDocument({
        id: 55,
        fileName: "policy.pdf",
        entityType: "Profile",
        entityId: 501,
        uploadedBy: 501,
        verificationStatus: DocumentVerificationStatus.rejected,
        rejectionReason: "Unreadable document",
        verifiedBy: 700,
      })
    );

    const response = await request(app).patch("/documents/55/verify").send({
      verificationStatus: "rejected",
      rejectionReason: "Unreadable document",
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        success: true,
        message: "Document verification updated",
      })
    );
    expect(mockedPrisma.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 55 },
        data: expect.objectContaining({
          verificationStatus: DocumentVerificationStatus.rejected,
          rejectionReason: "Unreadable document",
          verifiedBy: 700,
        }),
      })
    );
    expect(mockedNotificationService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientProfileId: 501,
        type: "warning",
        title: "Document rejected",
        actionRequired: true,
      }),
      expect.objectContaining({
        profileId: 700,
      })
    );
  });

  it("PATCH /documents/:id/verify returns 400 when legacy verified field is used", async () => {
    const app = createApp();

    const response = await request(app).patch("/documents/55/verify").send({
      verified: true,
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual(
      expect.objectContaining({
        error: "Validation failed",
      })
    );
    expect(mockedPrisma.document.update).not.toHaveBeenCalled();
  });

  it("GET /documents supports legacy status query and maps it to verificationStatus", async () => {
    const app = createApp();
    mockedPrisma.document.findMany.mockResolvedValue([]);
    mockedPrisma.document.count.mockResolvedValue(0);

    const response = await request(app).get("/documents?status=pending");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        success: true,
        message: "Documents retrieved",
      })
    );
    expect(mockedPrisma.document.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          verificationStatus: DocumentVerificationStatus.pending,
        }),
      })
    );
  });
});
