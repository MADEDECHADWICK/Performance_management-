import prisma from "../prisma";
import jobService from "./jobs.service";

jest.mock("../prisma", () => {
  const prismaMock = {
    engagementLetter: {
      findUnique: jest.fn(),
    },
    clientOnboarding: {
      findFirst: jest.fn(),
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
  engagementLetter: {
    findUnique: jest.Mock;
  };
  clientOnboarding: {
    findFirst: jest.Mock;
    findUnique: jest.Mock;
  };
};

const mockedPrisma = prisma as unknown as PrismaMock;

describe("JobService job-creation workflow guards", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("rejects direct job creation when the engagement letter was not uploaded by marketing", async () => {
    mockedPrisma.engagementLetter.findUnique.mockResolvedValue({
      id: 101,
      status: "approved",
      clientId: 55,
      documentId: 88,
      feeAmount: 250000,
      currency: "KES",
      jobTitle: "Tax compliance",
      engagementType: "tax",
      uploadedByProfileId: 21,
      uploadedBy: {
        positionTitle: "HR Officer",
        role: { name: "hr" },
        user: {
          roles: [{ role: { name: "hr" } }],
        },
      },
    });

    await expect(
      jobService.createJob(
        {
          jobName: "Tax compliance",
          clientId: 55,
          engagementLetterId: 101,
          managerProfileId: 8,
          partnerProfileId: 9,
          billingType: "fixed_fee",
        },
        { userId: 1, profileId: 2, roles: ["hr"] }
      )
    ).rejects.toThrow("Engagement letter must be uploaded by marketing before HR can create the job");

    expect(mockedPrisma.clientOnboarding.findFirst).not.toHaveBeenCalled();
  });

  it("rejects onboarding-based job creation when the engagement letter uploader is not marketing", async () => {
    mockedPrisma.clientOnboarding.findUnique.mockResolvedValue({
      id: 700,
      status: "approved",
      jobId: null,
      clientId: 55,
      departmentId: 3,
      engagementLetter: {
        id: 101,
        status: "approved",
        clientId: 55,
        documentId: 88,
        feeAmount: 250000,
        currency: "KES",
        jobTitle: "Tax compliance",
        startDate: null,
        endDate: null,
        uploadedByProfileId: 21,
        uploadedBy: {
          positionTitle: "HR Officer",
          role: { name: "hr" },
          user: {
            roles: [{ role: { name: "hr" } }],
          },
        },
      },
      client: { id: 55, clientName: "Acme Ltd" },
      department: { id: 3, name: "Tax" },
    });

    await expect(
      jobService.createJobFromOnboarding(
        700,
        {
          managerProfileId: 8,
          partnerProfileId: 9,
        },
        { userId: 1, profileId: 2, roles: ["hr"] }
      )
    ).rejects.toThrow("Engagement letter must be uploaded by marketing before HR can create the job");
  });
});
