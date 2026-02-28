import prisma from "../prisma";
import { DocumentAccessLevel, DocumentVerificationStatus } from "@prisma/client";
import { DocumentService } from "./documents.service";
import { NotificationService } from "./notifications.service";

jest.mock("../prisma", () => {
  const prismaMock = {
    document: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
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

jest.mock("./notifications.service", () => ({
  NotificationService: {
    createNotification: jest.fn(),
  },
}));

const mockedPrisma = prisma as any;
const mockedNotificationService = NotificationService as jest.Mocked<
  typeof NotificationService
>;

const defaultAuth = {
  userId: 1,
  profileId: 700,
  roles: ["hr"],
};

const createBaseDocument = (overrides: Record<string, any> = {}) => ({
  id: 11,
  fileName: "doc.pdf",
  filePath: "/uploads/doc.pdf",
  documentType: "offboarding_task",
  entityType: "OffboardingChecklistItem",
  entityId: 12,
  accessLevel: DocumentAccessLevel.hr,
  isRequired: true,
  verificationStatus: DocumentVerificationStatus.pending,
  rejectionReason: null,
  uploadedBy: defaultAuth.profileId,
  verifiedBy: null,
  verifiedAt: null,
  uploader: { id: defaultAuth.profileId, firstName: "HR", lastName: "Owner" },
  verifier: null,
  ...overrides,
});

describe("DocumentService notification workflows", () => {
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

  it("notifies the offboarding employee when HR uploads offboarding task evidence", async () => {
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

    await DocumentService.uploadDocument(
      {
        fileName: "handover.pdf",
        filePath: "/uploads/handover.pdf",
        documentType: "offboarding_task",
        entityType: "OffboardingChecklistItem",
        entityId: 12,
        accessLevel: DocumentAccessLevel.hr,
      },
      defaultAuth
    );

    expect(mockedNotificationService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientProfileId: 501,
        title: "Offboarding document submitted",
        actionRequired: true,
      }),
      expect.objectContaining({ profileId: 700 })
    );
  });

  it("notifies onboarding owner when employee uploads induction checklist evidence", async () => {
    const auth = { userId: 9, profileId: 501, roles: ["employee"] };
    mockedPrisma.document.create.mockResolvedValue(
      createBaseDocument({
        documentType: "onboarding_checklist",
        entityType: "InductionChecklist",
        entityId: 22,
        uploadedBy: 501,
      })
    );
    mockedPrisma.inductionChecklist.findUnique.mockResolvedValue({
      id: 22,
      checklistName: "Standard Employee Induction",
      employeeProfileId: 501,
      assignedByProfileId: 600,
      onboardingCase: { hrOwnerProfileId: 700 },
    });

    await DocumentService.uploadDocument(
      {
        fileName: "id-copy.pdf",
        filePath: "/uploads/id-copy.pdf",
        documentType: "onboarding_checklist",
        entityType: "InductionChecklist",
        entityId: 22,
        accessLevel: DocumentAccessLevel.employee,
      },
      auth
    );

    expect(mockedNotificationService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientProfileId: 700,
        title: "Onboarding document submitted",
        link: "/profile?tab=onboarding",
      }),
      expect.objectContaining({ profileId: 501 })
    );
  });

  it("notifies manager and partner when a report document is uploaded for a job", async () => {
    mockedPrisma.document.create.mockResolvedValue(
      createBaseDocument({
        documentType: "final_report",
        entityType: "Job",
        entityId: 77,
      })
    );
    mockedPrisma.job.findUnique.mockResolvedValue({
      id: 77,
      jobName: "FY26 Audit",
      managerProfileId: 300,
      partnerProfileId: 400,
      clientId: 88,
    });

    await DocumentService.uploadDocument(
      {
        fileName: "final-report.pdf",
        filePath: "/uploads/final-report.pdf",
        documentType: "final_report",
        entityType: "Job",
        entityId: 77,
        accessLevel: DocumentAccessLevel.manager,
      },
      defaultAuth
    );

    const recipients = mockedNotificationService.createNotification.mock.calls.map(
      (call) => call[0].recipientProfileId
    );
    expect(new Set(recipients)).toEqual(new Set([300, 400]));
  });

  it("notifies finance, manager, and partner when an invoice document is uploaded for a job", async () => {
    mockedPrisma.document.create.mockResolvedValue(
      createBaseDocument({
        documentType: "invoice",
        entityType: "Job",
        entityId: 90,
      })
    );
    mockedPrisma.job.findUnique.mockResolvedValue({
      id: 90,
      jobName: "Tax Engagement",
      managerProfileId: 310,
      partnerProfileId: 410,
      clientId: 22,
    });
    mockedPrisma.profile.findMany.mockResolvedValue([{ id: 901 }, { id: 902 }]);

    await DocumentService.uploadDocument(
      {
        fileName: "invoice-001.pdf",
        filePath: "/uploads/invoice-001.pdf",
        documentType: "invoice",
        entityType: "Job",
        entityId: 90,
        accessLevel: DocumentAccessLevel.manager,
      },
      defaultAuth
    );

    const recipients = mockedNotificationService.createNotification.mock.calls.map(
      (call) => call[0].recipientProfileId
    );
    expect(new Set(recipients)).toEqual(new Set([310, 410, 901, 902]));
  });

  it("notifies uploader when document is rejected", async () => {
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

    await DocumentService.verifyDocument(
      55,
      {
        verificationStatus: DocumentVerificationStatus.rejected,
        rejectionReason: "Unreadable document",
      },
      defaultAuth
    );

    expect(mockedNotificationService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientProfileId: 501,
        type: "warning",
        actionRequired: true,
        title: "Document rejected",
      }),
      expect.objectContaining({ profileId: 700 })
    );
  });

  it("clears verifier fields when verification status is reset to pending", async () => {
    mockedPrisma.document.findUnique.mockResolvedValue(
      createBaseDocument({
        id: 61,
        fileName: "report.pdf",
        entityType: "Job",
        entityId: 90,
        uploadedBy: 510,
      })
    );
    mockedPrisma.document.update.mockResolvedValue(
      createBaseDocument({
        id: 61,
        fileName: "report.pdf",
        entityType: "Job",
        entityId: 90,
        uploadedBy: 510,
        verificationStatus: DocumentVerificationStatus.pending,
        verifiedBy: null,
        verifiedAt: null,
      })
    );

    await DocumentService.verifyDocument(
      61,
      {
        verificationStatus: DocumentVerificationStatus.pending,
      },
      defaultAuth
    );

    expect(mockedPrisma.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 61 },
        data: expect.objectContaining({
          verificationStatus: DocumentVerificationStatus.pending,
          verifiedBy: null,
          verifiedAt: null,
        }),
      })
    );
  });

  it("expands entityType filters for employee aliases when listing documents", async () => {
    mockedPrisma.document.findMany.mockResolvedValue([]);
    mockedPrisma.document.count.mockResolvedValue(0);

    await DocumentService.listDocuments({
      page: 1,
      pageSize: 20,
      filters: {
        entityType: "employee",
      },
    });

    expect(mockedPrisma.document.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          entityType: {
            in: expect.arrayContaining(["Profile", "profile", "Employee", "employee"]),
          },
        }),
      })
    );
  });
});
