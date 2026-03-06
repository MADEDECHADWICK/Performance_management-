import prisma from "../prisma";
import jobService from "./jobs.service";

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

const buildMinimalTrackingJob = () => ({
  id: 501,
  jobCode: "JOB-501",
  jobName: "Tracking Visibility Test",
  description: "Role visibility check",
  status: "in_progress",
  priority: "high",
  startDate: null,
  dueDate: null,
  completionDate: null,
  billingType: "hourly",
  currency: "KES",
  fixedFeeAmount: 0,
  budgetHours: 120,
  collectionStage: null,
  readyForCollectionAt: null,
  teamAssigned: true,
  costingCompleted: true,
  managerProfileId: 31,
  partnerProfileId: 41,
  clientOnboarding: null,
  client: { id: 9, clientName: "Acme Corp", clientCode: "ACM" },
  manager: { id: 31, firstName: "Manager", lastName: "One" },
  partner: { id: 41, firstName: "Partner", lastName: "One" },
  receivableOwner: null,
  department: { id: 4, name: "Audit" },
  engagementLetter: {
    id: 12,
    status: "approved",
    documentId: 120,
    feeAmount: 0,
    currency: "KES",
    startDate: null,
    endDate: null,
  },
  staffing: [
    {
      employeeProfileId: 88,
      assignedHourlyRate: 120,
      employee: {
        id: 88,
        firstName: "Assigned",
        lastName: "Staff",
        positionTitle: "Associate",
      },
      role: {
        id: 7,
        name: "Associate",
        billingRate: 120,
        costRate: 60,
      },
    },
  ],
  jobCosting: {
    costingStatus: "approved",
    budgetCap: {
      capEnforced: true,
      allowOverage: false,
      maxOveragePercent: 0.2,
    },
    allocations: [],
  },
  tasks: [],
  timeEntries: [],
  payments: [],
  revenueAllocations: [],
  statusTransitions: [],
});

describe("JobService.getJobWorkflowTracking role visibility", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it("rejects users who are not admin, manager, partner, or assigned staff", async () => {
    mockedPrisma.job.findUnique.mockResolvedValue(buildMinimalTrackingJob());

    await expect(
      jobService.getJobWorkflowTracking(501, {
        userId: 900,
        profileId: 777,
        roles: ["employee"],
      })
    ).rejects.toEqual(
      expect.objectContaining({
        statusCode: 403,
        message: expect.stringContaining("Not authorized"),
      })
    );
  });

  it("allows assigned staff and returns tracking payload", async () => {
    mockedPrisma.job.findUnique.mockResolvedValue(buildMinimalTrackingJob());

    jest
      .spyOn(jobService as any, "getMissingStageDocuments")
      .mockResolvedValue([]);
    jest
      .spyOn(jobService as any, "getJobInvoiceMilestoneTracking")
      .mockResolvedValue({
        jobId: 501,
        jobCode: "JOB-501",
        jobName: "Tracking Visibility Test",
        feeAmount: 0,
        collectedAmount: 0,
        outstandingAmount: 0,
        milestoneCount: 0,
        completedConditionCount: 0,
        nextReadyMilestone: null,
        milestones: [],
      });

    const payload = await jobService.getJobWorkflowTracking(501, {
      userId: 901,
      profileId: 88,
      roles: ["employee"],
    });

    expect(payload.job.id).toBe(501);
    expect(payload.tracking.staffing.headcount).toBe(1);
    expect(payload.workflow.hr.jobCreated).toBe(true);
  });
});
