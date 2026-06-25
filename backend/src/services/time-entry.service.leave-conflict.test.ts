import { LeaveRequestSegmentSyncStatus, LeaveRequestStatus } from "@prisma/client";
import { prisma } from "../prisma";
import { TimeEntryService } from "./time-entry.service";

jest.mock("../prisma", () => {
  const prismaMock = {
    job: {
      findUnique: jest.fn(),
    },
    leaveRequest: {
      findMany: jest.fn(),
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
  job: {
    findUnique: jest.Mock;
  };
  leaveRequest: {
    findMany: jest.Mock;
  };
};

const mockedPrisma = prisma as unknown as PrismaMock;

describe("TimeEntryService leave conflicts", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("blocks time entry creation on an approved full-day leave date", async () => {
    mockedPrisma.job.findUnique.mockResolvedValue({
      id: 501,
      jobName: "UAT Tax Review",
      costingCompleted: true,
      billingType: "fixed_fee",
      fixedFeeAmount: 300000,
      budgetHours: 40,
      staffing: [{ employeeProfileId: 88 }],
      jobCosting: {
        costingStatus: "approved",
        budgetCap: null,
        allocations: [],
      },
    });
    mockedPrisma.leaveRequest.findMany.mockResolvedValue([
      {
        id: 77,
        status: LeaveRequestStatus.approved,
        segments: [],
      },
    ]);

    await expect(
      TimeEntryService.createTimeEntry(
        {
          jobId: 501,
          dateWorked: "2026-05-12",
          hours: 2,
          description: "Attempted time while on leave",
        },
        { userId: 7, profileId: 88, roleName: "employee" }
      )
    ).rejects.toEqual(
      expect.objectContaining({
        statusCode: 409,
        message: "Cannot log time while on approved leave",
      })
    );

    expect(mockedPrisma.leaveRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          employeeProfileId: 88,
          status: LeaveRequestStatus.approved,
        }),
      })
    );
  });

  it("allows a timed entry that does not overlap a partial-day leave segment", async () => {
    mockedPrisma.leaveRequest.findMany.mockResolvedValue([
      {
        id: 78,
        status: LeaveRequestStatus.approved,
        segments: [
          {
            leaveDate: new Date("2026-05-12T00:00:00.000Z"),
            startMinuteOfDay: 8 * 60,
            endMinuteOfDay: 10 * 60,
            hours: 2,
            syncStatus: LeaveRequestSegmentSyncStatus.confirmed,
          },
        ],
      },
    ]);

    await expect(
      (TimeEntryService as any).assertNotOnApprovedLeave(
        88,
        new Date("2026-05-12T00:00:00.000Z"),
        new Date("2026-05-12T10:00:00.000Z"),
        new Date("2026-05-12T12:00:00.000Z")
      )
    ).resolves.toBeUndefined();
  });
});
