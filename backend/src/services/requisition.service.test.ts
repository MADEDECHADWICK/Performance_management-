import {
  RequisitionApprovalDecision,
  RequisitionApprovalStageType,
  RequisitionStatus,
} from "@prisma/client";
import prisma from "../prisma";
import RequisitionService from "./requisition.service";

jest.mock("../prisma", () => {
  const prismaMock = {
    $transaction: jest.fn(),
    job: {
      findMany: jest.fn(),
    },
    document: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
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
  __esModule: true,
  default: jest.fn().mockResolvedValue({ id: 1 }),
}));

type PrismaMock = {
  $transaction: jest.Mock;
  job: {
    findMany: jest.Mock;
  };
  document: {
    findMany: jest.Mock;
    updateMany: jest.Mock;
  };
};

const mockedPrisma = prisma as unknown as PrismaMock;

const makeRequest = (overrides: Record<string, unknown> = {}) => ({
  id: 91,
  requisitionNumber: "REQ-20260317-120000-1001",
  requisitionTypeId: 3,
  requesterProfileId: 12,
  requesterDepartmentId: 5,
  currentApproverProfileId: 44,
  sourceModule: "jobs",
  status: RequisitionStatus.pending_manager_approval,
  title: "Registry filing fees",
  justification: "Urgent filing support",
  amount: 12000,
  amountBreakdown: null,
  currency: "KES",
  quantity: 1,
  neededByDate: new Date("2026-03-30T00:00:00.000Z"),
  vendorName: "Nairobi Registry",
  clientId: 18,
  jobId: 27,
  isClientRecoverable: true,
  taxImpactNotes: null,
  moduleData: null,
  approvalRouteSnapshot: null,
  declineReason: null,
  cancellationReason: null,
  releasedAt: null,
  releasedByProfileId: null,
  releaseNotes: null,
  accountabilityDueAt: null,
  accountabilityStatus: "not_released",
  accountabilitySubmittedAt: null,
  accountabilitySubmittedByProfileId: null,
  accountabilityNotes: null,
  submittedAt: new Date("2026-03-17T09:30:00.000Z"),
  approvedAt: null,
  declinedAt: null,
  cancelledAt: null,
  createdAt: new Date("2026-03-17T09:30:00.000Z"),
  updatedAt: new Date("2026-03-17T09:30:00.000Z"),
  requisitionType: {
    id: 3,
    code: "CLIENT_DISBURSEMENT",
    name: "Client Disbursement",
    sourceModule: "jobs",
  },
  requester: {
    id: 12,
    firstName: "Chadwick",
    lastName: "Madede",
    department: {
      id: 5,
      name: "Advisory",
    },
  },
  requesterDepartment: {
    id: 5,
    name: "Advisory",
  },
  currentApprover: {
    id: 44,
    firstName: "Patrick",
    lastName: "Kiptoo",
  },
  client: {
    id: 18,
    clientName: "Greenwells Ltd",
    clientCode: "GW-001",
  },
  job: {
    id: 27,
    jobName: "Audit FY2025",
  },
  approvalSteps: [
    {
      id: 501,
      stepNumber: 1,
      stageType: RequisitionApprovalStageType.manager,
      approverProfileId: 44,
      decision: RequisitionApprovalDecision.pending,
      notes: null,
      actedAt: null,
      approver: {
        id: 44,
        firstName: "Patrick",
        lastName: "Kiptoo",
      },
    },
    {
      id: 502,
      stepNumber: 2,
      stageType: RequisitionApprovalStageType.partner,
      approverProfileId: 77,
      decision: RequisitionApprovalDecision.pending,
      notes: null,
      actedAt: null,
      approver: {
        id: 77,
        firstName: "Janet",
        lastName: "Mwangi",
      },
    },
    {
      id: 503,
      stepNumber: 3,
      stageType: RequisitionApprovalStageType.finance,
      approverProfileId: 88,
      decision: RequisitionApprovalDecision.pending,
      notes: null,
      actedAt: null,
      approver: {
        id: 88,
        firstName: "Mercy",
        lastName: "Achieng",
      },
    },
  ],
  attachmentCount: 0,
  attachments: [],
  ...overrides,
});

const mockTransaction = (txMock: Record<string, unknown>) => {
  mockedPrisma.$transaction.mockImplementation(async (callback: any) => callback(txMock));
};

describe("RequisitionService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it("blocks employees from loading requisition approvals", async () => {
    await expect(
      RequisitionService.listApprovals(
        { page: 1, pageSize: 10, scope: "mine" },
        { userId: 1, profileId: 12, roleName: "employee", roles: ["employee"] }
      )
    ).rejects.toEqual(
      expect.objectContaining({
        statusCode: 403,
      })
    );
  });

  it("routes employee requisitions through manager, partner, then finance", async () => {
    jest
      .spyOn(RequisitionService as any, "resolveManagerApprover")
      .mockResolvedValue({ id: 44, firstName: "Patrick", lastName: "Kiptoo" });
    jest
      .spyOn(RequisitionService as any, "resolvePartnerApprover")
      .mockResolvedValue({ id: 77, firstName: "Janet", lastName: "Mwangi" });
    jest
      .spyOn(RequisitionService as any, "resolveGmpApprover")
      .mockResolvedValue({ id: 99, firstName: "Grace", lastName: "Kariuki" });
    jest
      .spyOn(RequisitionService as any, "resolveFinanceApprover")
      .mockResolvedValue({ id: 88, firstName: "Mercy", lastName: "Achieng" });

    const steps = await (RequisitionService as any).buildApprovalRoute(
      {},
      {
        id: 12,
        isPartner: false,
        department: { id: 5, name: "Advisory" },
      },
      { userId: 1, profileId: 12, roleName: "employee", roles: ["employee"] },
      "jobs",
      27,
      18
    );

    expect(steps).toEqual([
      expect.objectContaining({
        stepNumber: 1,
        stageType: RequisitionApprovalStageType.manager,
        approverProfileId: 44,
      }),
      expect.objectContaining({
        stepNumber: 2,
        stageType: RequisitionApprovalStageType.partner,
        approverProfileId: 77,
      }),
      expect.objectContaining({
        stepNumber: 3,
        stageType: RequisitionApprovalStageType.finance,
        approverProfileId: 88,
      }),
    ]);
  });

  it("routes finance requisitions to the GMP and then finance", async () => {
    jest
      .spyOn(RequisitionService as any, "resolveGmpApprover")
      .mockResolvedValue({ id: 99, firstName: "Grace", lastName: "Kariuki" });
    jest
      .spyOn(RequisitionService as any, "resolveFinanceApprover")
      .mockResolvedValue({ id: 88, firstName: "Mercy", lastName: "Achieng" });

    const steps = await (RequisitionService as any).buildApprovalRoute(
      {},
      {
        id: 22,
        isPartner: false,
        department: { id: 6, name: "Finance" },
      },
      { userId: 2, profileId: 22, roleName: "employee", roles: ["employee"] },
      "finance",
      null,
      null
    );

    expect(steps).toEqual([
      expect.objectContaining({
        stepNumber: 1,
        stageType: RequisitionApprovalStageType.gmp,
        approverProfileId: 99,
      }),
      expect.objectContaining({
        stepNumber: 2,
        stageType: RequisitionApprovalStageType.finance,
        approverProfileId: 88,
      }),
    ]);
  });

  it("rejects job-linked requisitions when the requester is not assigned to the selected job", async () => {
    const txMock = {
      job: {
        findUnique: jest.fn().mockResolvedValue({
          id: 27,
          clientId: 18,
          status: "in_progress",
          managerProfileId: 44,
          partnerProfileId: 77,
          staffing: [],
        }),
      },
    };

    await expect(
      (RequisitionService as any).validateRequestScope(
        txMock,
        { requiresJob: true, requiresClient: false, requiresVendor: false, requiresDueDate: false },
        { jobId: 27 },
        { userId: 1, profileId: 12, roleName: "employee", roles: ["employee"] }
      )
    ).rejects.toEqual(
      expect.objectContaining({
        statusCode: 403,
        message: expect.stringContaining("assigned"),
      })
    );
  });

  it("lists only active requester-scoped jobs for requisition charging", async () => {
    mockedPrisma.job.findMany.mockResolvedValue([
      {
        id: 27,
        jobName: "Audit FY2025",
        jobCode: "JOB-027",
        status: "in_progress",
        clientId: 18,
        client: { id: 18, clientName: "Greenwells Ltd", clientCode: "GW-001" },
      },
    ]);

    const result = await RequisitionService.listAvailableJobs({
      userId: 1,
      profileId: 12,
      roleName: "employee",
      roles: ["employee"],
    });

    expect(result).toHaveLength(1);
    expect(mockedPrisma.job.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: {
            notIn: ["completed", "cancelled"],
          },
        }),
      })
    );
  });

  it("moves a requisition from manager approval to partner approval", async () => {
    const txMock = {
      requisitionRequest: {
        findUnique: jest.fn().mockResolvedValue(makeRequest()),
        update: jest.fn().mockResolvedValue(
          makeRequest({
            status: RequisitionStatus.pending_partner_approval,
            currentApproverProfileId: 77,
          })
        ),
      },
      requisitionApprovalStep: {
        update: jest.fn().mockResolvedValue({ id: 501 }),
      },
    };
    mockTransaction(txMock);
    jest.spyOn(RequisitionService as any, "createStatusTransition").mockResolvedValue(undefined);
    jest.spyOn(RequisitionService as any, "notifyApprover").mockResolvedValue(undefined);
    jest.spyOn(RequisitionService as any, "notifyRequester").mockResolvedValue(undefined);
    jest
      .spyOn(RequisitionService as any, "addAttachmentSummaries")
      .mockImplementation(async (...args: any[]) => args[0]);

    const result = await RequisitionService.approveRequisitionRequest(
      91,
      { notes: "Operationally approved" },
      { userId: 2, profileId: 44, roleName: "manager", roles: ["manager"] }
    );

    expect(result.status).toBe(RequisitionStatus.pending_partner_approval);
    expect(txMock.requisitionApprovalStep.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          decision: RequisitionApprovalDecision.approved,
        }),
      })
    );
    expect(txMock.requisitionRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          currentApproverProfileId: 77,
          status: RequisitionStatus.pending_partner_approval,
        }),
      })
    );
  });

  it("moves a requisition from partner approval to finance approval", async () => {
    const partnerPendingRequest = makeRequest({
      status: RequisitionStatus.pending_partner_approval,
      currentApproverProfileId: 77,
      approvalSteps: [
        {
          id: 501,
          stepNumber: 1,
          stageType: RequisitionApprovalStageType.manager,
          approverProfileId: 44,
          decision: RequisitionApprovalDecision.approved,
          notes: "Operationally approved",
          actedAt: new Date("2026-03-17T10:00:00.000Z"),
          approver: {
            id: 44,
            firstName: "Patrick",
            lastName: "Kiptoo",
          },
        },
        {
          id: 502,
          stepNumber: 2,
          stageType: RequisitionApprovalStageType.partner,
          approverProfileId: 77,
          decision: RequisitionApprovalDecision.pending,
          notes: null,
          actedAt: null,
          approver: {
            id: 77,
            firstName: "Janet",
            lastName: "Mwangi",
          },
        },
        {
          id: 503,
          stepNumber: 3,
          stageType: RequisitionApprovalStageType.finance,
          approverProfileId: 88,
          decision: RequisitionApprovalDecision.pending,
          notes: null,
          actedAt: null,
          approver: {
            id: 88,
            firstName: "Mercy",
            lastName: "Achieng",
          },
        },
      ],
    });
    const txMock = {
      requisitionRequest: {
        findUnique: jest.fn().mockResolvedValue(partnerPendingRequest),
        update: jest.fn().mockResolvedValue(
          makeRequest({
            status: RequisitionStatus.pending_finance_approval,
            currentApproverProfileId: 88,
          })
        ),
      },
      requisitionApprovalStep: {
        update: jest.fn().mockResolvedValue({ id: 502 }),
      },
    };
    mockTransaction(txMock);
    jest.spyOn(RequisitionService as any, "createStatusTransition").mockResolvedValue(undefined);
    const notifyApproverSpy = jest
      .spyOn(RequisitionService as any, "notifyApprover")
      .mockResolvedValue(undefined);
    const notifyRequesterSpy = jest
      .spyOn(RequisitionService as any, "notifyRequester")
      .mockResolvedValue(undefined);
    jest
      .spyOn(RequisitionService as any, "addAttachmentSummaries")
      .mockImplementation(async (...args: any[]) => args[0]);

    const result = await RequisitionService.approveRequisitionRequest(
      91,
      { notes: "Partner approved" },
      { userId: 3, profileId: 77, roleName: "partner", roles: ["partner"] }
    );

    expect(result.status).toBe(RequisitionStatus.pending_finance_approval);
    expect(txMock.requisitionRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          currentApproverProfileId: 88,
          status: RequisitionStatus.pending_finance_approval,
          approvedAt: null,
        }),
      })
    );
    expect(notifyApproverSpy).toHaveBeenCalledWith(
      91,
      88,
      expect.stringContaining("Requisition awaiting approval"),
      expect.stringContaining("finance approval and disbursement"),
      expect.any(Object)
    );
    expect(notifyRequesterSpy).toHaveBeenCalledWith(
      12,
      expect.stringContaining("Requisition progressed"),
      expect.stringContaining("Pending Finance Approval"),
      expect.anything(),
      expect.any(Object)
    );
  });

  it("marks the requisition fully approved only after finance approval", async () => {
    const financePendingRequest = makeRequest({
      status: RequisitionStatus.pending_finance_approval,
      currentApproverProfileId: 88,
      approvalSteps: [
        {
          id: 501,
          stepNumber: 1,
          stageType: RequisitionApprovalStageType.manager,
          approverProfileId: 44,
          decision: RequisitionApprovalDecision.approved,
          notes: "Operationally approved",
          actedAt: new Date("2026-03-17T10:00:00.000Z"),
          approver: {
            id: 44,
            firstName: "Patrick",
            lastName: "Kiptoo",
          },
        },
        {
          id: 502,
          stepNumber: 2,
          stageType: RequisitionApprovalStageType.partner,
          approverProfileId: 77,
          decision: RequisitionApprovalDecision.approved,
          notes: "Partner approved",
          actedAt: new Date("2026-03-17T11:00:00.000Z"),
          approver: {
            id: 77,
            firstName: "Janet",
            lastName: "Mwangi",
          },
        },
        {
          id: 503,
          stepNumber: 3,
          stageType: RequisitionApprovalStageType.finance,
          approverProfileId: 88,
          decision: RequisitionApprovalDecision.pending,
          notes: null,
          actedAt: null,
          approver: {
            id: 88,
            firstName: "Mercy",
            lastName: "Achieng",
          },
        },
      ],
    });
    const txMock = {
      requisitionRequest: {
        findUnique: jest.fn().mockResolvedValue(financePendingRequest),
        update: jest.fn().mockResolvedValue(
          makeRequest({
            status: RequisitionStatus.approved,
            currentApproverProfileId: null,
            approvedAt: new Date("2026-03-18T08:15:00.000Z"),
          })
        ),
      },
      requisitionApprovalStep: {
        update: jest.fn().mockResolvedValue({ id: 503 }),
      },
    };
    mockTransaction(txMock);
    jest.spyOn(RequisitionService as any, "createStatusTransition").mockResolvedValue(undefined);
    const notifyApproverSpy = jest
      .spyOn(RequisitionService as any, "notifyApprover")
      .mockResolvedValue(undefined);
    const notifyRequesterSpy = jest
      .spyOn(RequisitionService as any, "notifyRequester")
      .mockResolvedValue(undefined);
    jest
      .spyOn(RequisitionService as any, "addAttachmentSummaries")
      .mockImplementation(async (...args: any[]) => args[0]);

    const result = await RequisitionService.approveRequisitionRequest(
      91,
      { notes: "Funds cleared" },
      { userId: 4, profileId: 88, roleName: "finance", roles: ["finance"] }
    );

    expect(result.status).toBe(RequisitionStatus.approved);
    expect(txMock.requisitionRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          currentApproverProfileId: null,
          status: RequisitionStatus.approved,
        }),
      })
    );
    expect(notifyApproverSpy).not.toHaveBeenCalled();
    expect(notifyRequesterSpy).toHaveBeenCalledWith(
      12,
      expect.stringContaining("Requisition approved"),
      expect.stringContaining("fully approved by finance"),
      expect.anything(),
      expect.any(Object)
    );
  });

  it("allows the active finance approver to edit the requisition before final approval", async () => {
    const financePendingRequest = makeRequest({
      status: RequisitionStatus.pending_finance_approval,
      currentApproverProfileId: 88,
      amountBreakdown: [
        { label: "Registry fees", amount: 7000 },
        { label: "Courier", amount: 5000 },
      ],
      approvalSteps: [
        {
          id: 503,
          stepNumber: 3,
          stageType: RequisitionApprovalStageType.finance,
          approverProfileId: 88,
          decision: RequisitionApprovalDecision.pending,
          notes: null,
          actedAt: null,
          approver: {
            id: 88,
            firstName: "Mercy",
            lastName: "Achieng",
          },
        },
      ],
    });
    const txMock = {
      requisitionRequest: {
        findUnique: jest.fn().mockResolvedValue(financePendingRequest),
        update: jest.fn().mockResolvedValue(
          makeRequest({
            status: RequisitionStatus.pending_finance_approval,
            currentApproverProfileId: 88,
            amount: 15000,
            amountBreakdown: [
              { label: "Registry fees", amount: 9000 },
              { label: "Courier", amount: 6000 },
            ],
          })
        ),
      },
    };
    mockTransaction(txMock);
    jest.spyOn(RequisitionService as any, "notifyRequester").mockResolvedValue(undefined);
    jest
      .spyOn(RequisitionService as any, "addAttachmentSummaries")
      .mockImplementation(async (...args: any[]) => args[0]);

    const result = await RequisitionService.updateFinanceStageRequisition(
      91,
      {
        amount: 15000,
        amountBreakdown: [
          { label: "Registry fees", amount: 9000 },
          { label: "Courier", amount: 6000 },
        ],
        vendorName: "Revised Registry Vendor",
      },
      { userId: 4, profileId: 88, roleName: "finance", roles: ["finance"] }
    );

    expect(result.amount).toBe(15000);
    expect(txMock.requisitionRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: 15000,
          amountBreakdown: expect.any(Array),
          vendorName: "Revised Registry Vendor",
        }),
      })
    );
  });

  it("marks released funds as pending accountability for three weeks", async () => {
    const approvedRequest = makeRequest({
      status: RequisitionStatus.approved,
      currentApproverProfileId: null,
      approvedAt: new Date("2026-03-18T08:15:00.000Z"),
      approvalSteps: [
        {
          id: 503,
          stepNumber: 3,
          stageType: RequisitionApprovalStageType.finance,
          approverProfileId: 88,
          decision: RequisitionApprovalDecision.approved,
          notes: "Finance approved",
          actedAt: new Date("2026-03-18T08:15:00.000Z"),
          approver: {
            id: 88,
            firstName: "Mercy",
            lastName: "Achieng",
          },
        },
      ],
    });
    const txMock = {
      requisitionRequest: {
        findUnique: jest.fn().mockResolvedValue(approvedRequest),
        update: jest.fn().mockResolvedValue(
          makeRequest({
            status: RequisitionStatus.approved,
            currentApproverProfileId: null,
            releasedAt: new Date("2026-03-20T10:00:00.000Z"),
            releasedByProfileId: 88,
            accountabilityDueAt: new Date("2026-04-10T10:00:00.000Z"),
            accountabilityStatus: "pending",
          })
        ),
      },
    };
    mockTransaction(txMock);
    jest.spyOn(RequisitionService as any, "notifyRequester").mockResolvedValue(undefined);
    jest
      .spyOn(RequisitionService as any, "addAttachmentSummaries")
      .mockImplementation(async (...args: any[]) => args[0]);

    const result = await RequisitionService.releaseRequisitionFunds(
      91,
      { releasedAt: "2026-03-20T10:00:00.000Z" },
      { userId: 4, profileId: 88, roleName: "finance", roles: ["finance"] }
    );

    expect(result.accountabilityStatus).toBe("pending");
    expect(txMock.requisitionRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          releasedByProfileId: 88,
          accountabilityStatus: "pending",
          accountabilityDueAt: expect.any(Date),
        }),
      })
    );
  });

  it("records requester accountability after funds are released", async () => {
    const releasedRequest = makeRequest({
      status: RequisitionStatus.approved,
      currentApproverProfileId: null,
      releasedAt: new Date("2026-03-20T10:00:00.000Z"),
      releasedByProfileId: 88,
      accountabilityDueAt: new Date("2026-04-10T10:00:00.000Z"),
      accountabilityStatus: "pending",
    });
    const txMock = {
      requisitionRequest: {
        findUnique: jest.fn().mockResolvedValue(releasedRequest),
        update: jest.fn().mockResolvedValue(
          makeRequest({
            status: RequisitionStatus.approved,
            currentApproverProfileId: null,
            releasedAt: new Date("2026-03-20T10:00:00.000Z"),
            releasedByProfileId: 88,
            accountabilityDueAt: new Date("2026-04-10T10:00:00.000Z"),
            accountabilityStatus: "submitted",
            accountabilitySubmittedAt: new Date("2026-03-25T09:00:00.000Z"),
            accountabilitySubmittedByProfileId: 12,
            accountabilityNotes: "Receipts uploaded and reconciled.",
          })
        ),
      },
      document: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    mockTransaction(txMock);
    jest
      .spyOn(RequisitionService as any, "addAttachmentSummaries")
      .mockImplementation(async (...args: any[]) => args[0]);

    const result = await RequisitionService.submitRequisitionAccountability(
      91,
      { notes: "Receipts uploaded and reconciled." },
      { userId: 1, profileId: 12, roleName: "employee", roles: ["employee"] }
    );

    expect(result.accountabilityStatus).toBe("submitted");
    expect(txMock.requisitionRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountabilityStatus: "submitted",
          accountabilitySubmittedByProfileId: 12,
        }),
      })
    );
  });

  it("records the decline reason when a requisition is declined", async () => {
    const txMock = {
      requisitionRequest: {
        findUnique: jest.fn().mockResolvedValue(makeRequest()),
        update: jest.fn().mockResolvedValue(
          makeRequest({
            status: RequisitionStatus.declined,
            currentApproverProfileId: null,
            declineReason: "Budget not approved",
          })
        ),
      },
      requisitionApprovalStep: {
        update: jest.fn().mockResolvedValue({ id: 501 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    mockTransaction(txMock);
    jest.spyOn(RequisitionService as any, "createStatusTransition").mockResolvedValue(undefined);
    jest.spyOn(RequisitionService as any, "notifyRequester").mockResolvedValue(undefined);
    jest
      .spyOn(RequisitionService as any, "addAttachmentSummaries")
      .mockImplementation(async (...args: any[]) => args[0]);

    const result = await RequisitionService.declineRequisitionRequest(
      91,
      { reason: "Budget not approved" },
      { userId: 2, profileId: 44, roleName: "manager", roles: ["manager"] }
    );

    expect(result.status).toBe(RequisitionStatus.declined);
    expect(txMock.requisitionRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          declineReason: "Budget not approved",
          status: RequisitionStatus.declined,
        }),
      })
    );
  });
});
