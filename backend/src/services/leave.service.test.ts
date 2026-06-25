import {
  LeaveApprovalDecision,
  LeaveApprovalStageType,
  LeaveDayPortion,
  LeaveRequestStatus,
} from "@prisma/client";
import prisma from "../prisma";
import LeaveService from "./leave.service";

jest.mock("../prisma", () => {
  const prismaMock = {
    $transaction: jest.fn(),
    publicHoliday: {
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
  $transaction: jest.Mock;
  publicHoliday: {
    findMany: jest.Mock;
  };
};

const mockedPrisma = prisma as unknown as PrismaMock;

const makeRequest = (overrides: Record<string, unknown> = {}) => ({
  id: 88,
  employeeProfileId: 12,
  leaveTypeId: 4,
  currentApproverProfileId: 44,
  status: LeaveRequestStatus.pending_manager_approval,
  startDate: new Date("2026-03-20T00:00:00.000Z"),
  endDate: new Date("2026-03-22T00:00:00.000Z"),
  requestedUnits: 3,
  deductedUnits: 3,
  policy: {
    id: 9,
    annualEntitlement: 21,
    accrualEnabled: false,
  },
  employee: {
    id: 12,
    firstName: "Ada",
    lastName: "Staff",
  },
  leaveType: {
    id: 4,
    name: "Annual leave",
  },
  approvalSteps: [
    {
      id: 501,
      stepNumber: 1,
      stageType: LeaveApprovalStageType.manager,
      approverProfileId: 44,
      decision: LeaveApprovalDecision.pending,
    },
  ],
  ...overrides,
});

const mockTransaction = (txMock: Record<string, unknown>) => {
  mockedPrisma.$transaction.mockImplementation(async (callback: any) => callback(txMock));
};

describe("LeaveService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it("rejects leave requests when startDate is after endDate", async () => {
    await expect(
      LeaveService.createLeaveRequest(
        {
          leaveTypeId: 4,
          startDate: "2026-03-22",
          endDate: "2026-03-20",
        },
        { userId: 1, profileId: 12, roleName: "employee", roles: ["employee"] }
      )
    ).rejects.toEqual(
      expect.objectContaining({
        statusCode: 400,
        message: "startDate must be on or before endDate",
      })
    );
  });

  it("excludes public holidays from deducted leave units", async () => {
    mockedPrisma.publicHoliday.findMany.mockResolvedValue([
      { holidayDate: new Date("2026-03-10T00:00:00.000Z") },
    ]);

    const units = await (LeaveService as any).calculateRequestedUnits(
      { publicHoliday: mockedPrisma.publicHoliday },
      {
        startDate: new Date("2026-03-09T00:00:00.000Z"),
        endDate: new Date("2026-03-11T00:00:00.000Z"),
        startDayPortion: LeaveDayPortion.full_day,
        endDayPortion: LeaveDayPortion.full_day,
      },
      {
        allowsHalfDay: true,
        unitType: "day",
      },
      {
        excludeWeekends: false,
        excludePublicHolidays: true,
      }
    );

    expect(units).toBe(2);
  });

  it("counts notice in working days by skipping weekends and public holidays", async () => {
    mockedPrisma.publicHoliday.findMany.mockResolvedValue([
      { holidayDate: new Date("2026-03-09T00:00:00.000Z"), isRecurring: false },
    ]);

    const noticeDays = await (LeaveService as any).calculateNoticeDays(
      { publicHoliday: mockedPrisma.publicHoliday },
      new Date("2026-03-06T00:00:00.000Z"),
      new Date("2026-03-11T00:00:00.000Z"),
      {
        excludeWeekends: true,
        excludePublicHolidays: true,
      }
    );

    expect(noticeDays).toBe(2);
  });

  it("blocks employees from loading approval queues", async () => {
    await expect(
      LeaveService.listApprovals(
        { page: 1, pageSize: 10, scope: "mine" },
        { userId: 1, profileId: 12, roleName: "employee", roles: ["employee"] }
      )
    ).rejects.toEqual(
      expect.objectContaining({
        statusCode: 403,
      })
    );
  });

  it("allows HR to load approvals without approver scoping", async () => {
    const txMock = {
      leaveRequest: {
        findMany: jest.fn().mockResolvedValue([makeRequest()]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    mockTransaction(txMock);

    const result = await LeaveService.listApprovals(
      { page: 1, pageSize: 10, scope: "all" },
      { userId: 1, profileId: 99, roleName: "hr", roles: ["hr"] }
    );

    expect(result.total).toBe(1);
    expect(txMock.leaveRequest.findMany.mock.calls[0][0].where.currentApproverProfileId).toBeUndefined();
  });

  it("enforces manager approver scope during approval", async () => {
    const txMock = {
      leaveRequest: {
        findUnique: jest.fn().mockResolvedValue(
          makeRequest({
            approvalSteps: [
              {
                id: 501,
                stepNumber: 1,
                stageType: LeaveApprovalStageType.manager,
                approverProfileId: 77,
                decision: LeaveApprovalDecision.pending,
              },
            ],
          })
        ),
      },
    };
    mockTransaction(txMock);

    await expect(
      LeaveService.approveLeaveRequest(
        88,
        {},
        { userId: 2, profileId: 44, roleName: "manager", roles: ["manager"] }
      )
    ).rejects.toEqual(
      expect.objectContaining({
        statusCode: 403,
        message: "You are not the active approver for this leave request",
      })
    );
  });

  it("creates a deduction ledger entry on final approval", async () => {
    const txMock = {
      leaveRequest: {
        findUnique: jest.fn().mockResolvedValue(makeRequest()),
        update: jest.fn().mockResolvedValue(
          makeRequest({
            status: LeaveRequestStatus.approved,
            currentApproverProfileId: null,
          })
        ),
      },
      leaveApprovalStep: {
        update: jest.fn().mockResolvedValue({ id: 501 }),
      },
      timeEntry: {
        count: jest.fn().mockResolvedValue(0),
      },
      leaveLedgerEntry: {
        create: jest.fn().mockResolvedValue({ id: 1 }),
      },
    };
    mockTransaction(txMock);
    jest.spyOn(LeaveService as any, "ensureBalanceSnapshot").mockResolvedValue({});
    jest.spyOn(LeaveService as any, "logAudit").mockResolvedValue(undefined);
    jest.spyOn(LeaveService as any, "dispatchRequestNotification").mockResolvedValue(undefined);

    const result = await LeaveService.approveLeaveRequest(
      88,
      { notes: "Approved" },
      { userId: 2, profileId: 44, roleName: "manager", roles: ["manager"] }
    );

    expect(result.status).toBe(LeaveRequestStatus.approved);
    expect(txMock.leaveLedgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          leaveRequestId: 88,
          units: -3,
        }),
      })
    );
  });

  it("records the decline reason when a request is declined", async () => {
    const txMock = {
      leaveRequest: {
        findUnique: jest.fn().mockResolvedValue(makeRequest()),
        update: jest.fn().mockResolvedValue(
          makeRequest({
            status: LeaveRequestStatus.declined,
            currentApproverProfileId: null,
            declineReason: "Coverage conflict",
          })
        ),
      },
      leaveApprovalStep: {
        update: jest.fn().mockResolvedValue({ id: 501 }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    mockTransaction(txMock);
    jest.spyOn(LeaveService as any, "ensureBalanceSnapshot").mockResolvedValue({});
    jest.spyOn(LeaveService as any, "logAudit").mockResolvedValue(undefined);
    jest.spyOn(LeaveService as any, "dispatchRequestNotification").mockResolvedValue(undefined);

    const result = await LeaveService.declineLeaveRequest(
      88,
      { reason: "Coverage conflict" },
      { userId: 2, profileId: 44, roleName: "manager", roles: ["manager"] }
    );

    expect(result.status).toBe(LeaveRequestStatus.declined);
    expect(txMock.leaveRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          declineReason: "Coverage conflict",
        }),
      })
    );
  });

  it("creates a reversal ledger entry when approved leave is cancelled", async () => {
    const txMock = {
      leaveRequest: {
        findUnique: jest.fn().mockResolvedValue(
          makeRequest({
            status: LeaveRequestStatus.approved,
            currentApproverProfileId: null,
          })
        ),
        update: jest.fn().mockResolvedValue(
          makeRequest({
            status: LeaveRequestStatus.cancelled,
            currentApproverProfileId: null,
            cancellationReason: "Travel changed",
          })
        ),
      },
      leaveApprovalStep: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      leaveLedgerEntry: {
        create: jest.fn().mockResolvedValue({ id: 2 }),
      },
    };
    mockTransaction(txMock);
    jest.spyOn(LeaveService as any, "ensureBalanceSnapshot").mockResolvedValue({});
    jest.spyOn(LeaveService as any, "logAudit").mockResolvedValue(undefined);
    jest.spyOn(LeaveService as any, "dispatchRequestNotification").mockResolvedValue(undefined);

    const result = await LeaveService.cancelLeaveRequest(
      88,
      { reason: "Travel changed" },
      { userId: 1, profileId: 12, roleName: "employee", roles: ["employee"] }
    );

    expect(result.status).toBe(LeaveRequestStatus.cancelled);
    expect(txMock.leaveLedgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          transactionType: "reversal",
          units: 3,
        }),
      })
    );
  });
});
