import { prisma } from "../prisma";
import { TimeEntryService } from "./time-entry.service";
import { NotificationService } from "./notifications.service";
import { createAudit } from "../utils/audit";

jest.mock("../prisma", () => {
  const prismaMock = {
    timeOverBudgetRequest: {
      findUnique: jest.fn(),
      update: jest.fn(),
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
    createNotification: jest.fn().mockResolvedValue({ id: 1 }),
  },
}));

jest.mock("../utils/audit", () => ({
  createAudit: jest.fn().mockResolvedValue({ id: 1 }),
}));

type PrismaMock = {
  timeOverBudgetRequest: {
    findUnique: jest.Mock;
    update: jest.Mock;
  };
};

const mockedPrisma = prisma as unknown as PrismaMock;
const mockedNotificationService = NotificationService as unknown as {
  createNotification: jest.Mock;
};
const mockedCreateAudit = createAudit as jest.MockedFunction<typeof createAudit>;

const baseRequest = {
  id: 55,
  jobId: 501,
  employeeProfileId: 88,
  status: "pending",
  requiresPartnerApproval: true,
  managerApproved: false,
  partnerApproved: false,
  approvalNotes: null,
  rejectionReason: null,
  job: {
    id: 501,
    jobName: "Manager First Workflow",
    managerProfileId: 31,
    partnerProfileId: 41,
  },
};

describe("TimeEntryService over-budget approval chain", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("blocks partner approval when manager stage is still pending", async () => {
    mockedPrisma.timeOverBudgetRequest.findUnique.mockResolvedValue({
      ...baseRequest,
      status: "pending",
    });

    await expect(
      TimeEntryService.approveOverBudgetRequest(55, "approve", {
        userId: 401,
        profileId: 41,
        roleName: "partner",
      })
    ).rejects.toEqual(
      expect.objectContaining({
        statusCode: 409,
        message: expect.stringContaining("Manager approval is required"),
      })
    );

    expect(mockedPrisma.timeOverBudgetRequest.update).not.toHaveBeenCalled();
  });

  it("records manager approval as manager_approved and notifies partner", async () => {
    mockedPrisma.timeOverBudgetRequest.findUnique.mockResolvedValue({
      ...baseRequest,
      status: "pending",
    });
    mockedPrisma.timeOverBudgetRequest.update.mockResolvedValue({
      id: 55,
      status: "manager_approved",
      job: { id: 501, jobName: "Manager First Workflow" },
      employee: { id: 88, firstName: "Ada", lastName: "Staff" },
    });

    const result = await TimeEntryService.approveOverBudgetRequest(55, "manager notes", {
      userId: 301,
      profileId: 31,
      roleName: "manager",
    });

    expect(result.status).toBe("manager_approved");
    expect(mockedPrisma.timeOverBudgetRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "manager_approved",
          managerApproved: true,
          partnerApproved: false,
        }),
      })
    );
    expect(mockedCreateAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: expect.stringContaining("manager_approved"),
      })
    );
    expect(mockedNotificationService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientProfileId: 41,
        jobId: 501,
      }),
      expect.any(Object)
    );
  });

  it("allows partner final approval only after manager_approved stage", async () => {
    mockedPrisma.timeOverBudgetRequest.findUnique.mockResolvedValue({
      ...baseRequest,
      status: "manager_approved",
      managerApproved: true,
    });
    mockedPrisma.timeOverBudgetRequest.update.mockResolvedValue({
      id: 55,
      status: "partner_approved",
      job: { id: 501, jobName: "Manager First Workflow" },
      employee: { id: 88, firstName: "Ada", lastName: "Staff" },
    });

    const result = await TimeEntryService.approveOverBudgetRequest(55, "partner notes", {
      userId: 401,
      profileId: 41,
      roleName: "partner",
    });

    expect(result.status).toBe("partner_approved");
    expect(mockedPrisma.timeOverBudgetRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "partner_approved",
          managerApproved: true,
          partnerApproved: true,
        }),
      })
    );
  });
});
