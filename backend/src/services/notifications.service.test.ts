import prisma from "../prisma";
import { NotificationService } from "./notifications.service";
import { NotificationOutboxService } from "./notificationOutbox.service";
import { NotificationPreferenceService } from "./notificationPreferences.service";

jest.mock("../prisma", () => {
  const prismaMock = {
    notification: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    profile: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    notificationTemplate: {
      findFirst: jest.fn(),
    },
    statusTransition: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  return {
    __esModule: true,
    default: prismaMock,
    prisma: prismaMock,
  };
});

jest.mock("./notificationOutbox.service", () => ({
  __esModule: true,
  NotificationOutboxService: {
    requestImmediateProcessing: jest.fn(),
    replayDeadLetter: jest.fn(),
    getOutboxSummary: jest.fn(),
  },
}));

jest.mock("./notificationPreferences.service", () => ({
  __esModule: true,
  NotificationPreferenceService: {
    getDeliveryDecision: jest.fn(),
    getPreferences: jest.fn(),
    updatePreferences: jest.fn(),
  },
}));

const mockedPrisma = prisma as any;
const mockedOutboxService = NotificationOutboxService as jest.Mocked<
  typeof NotificationOutboxService
>;
const mockedPreferenceService = NotificationPreferenceService as jest.Mocked<
  typeof NotificationPreferenceService
>;

const defaultAuth = {
  userId: 1,
  profileId: 700,
  roleName: "hr",
};

describe("NotificationService event contract + dedupe", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockedPrisma.profile.findUnique.mockResolvedValue({ id: 501 });
    mockedPrisma.profile.findMany.mockResolvedValue([]);
    mockedPrisma.statusTransition.findMany.mockResolvedValue([]);
    mockedPrisma.statusTransition.create.mockResolvedValue({ id: 10 });
    mockedPrisma.statusTransition.count.mockResolvedValue(0);
    mockedPrisma.notification.findMany.mockResolvedValue([]);
    mockedPrisma.notification.count.mockResolvedValue(0);
    mockedPrisma.notification.update.mockResolvedValue({ id: 1, isRead: true });
    mockedPrisma.notification.updateMany.mockResolvedValue({ count: 0 });
    mockedPrisma.notification.delete.mockResolvedValue({ id: 1 });
    mockedPrisma.notification.deleteMany.mockResolvedValue({ count: 0 });
    mockedPreferenceService.getDeliveryDecision.mockResolvedValue({
      allowInApp: true,
      preference: {
        profileId: 501,
        channels: { inApp: true, email: false, sms: false, push: false },
        quietHours: {
          enabled: false,
          start: "22:00",
          end: "07:00",
          timezone: "Africa/Nairobi",
        },
        digestMode: "off",
        severityThreshold: "low",
        updatedAt: "2026-02-28T00:00:00.000Z",
      },
    } as any);
    mockedOutboxService.requestImmediateProcessing.mockImplementation(() => undefined);
  });

  it("deduplicates createNotification by deduplicationKey", async () => {
    const created = {
      id: 1,
      profileId: 501,
      type: "action",
      title: "Job created",
      message: "A new job is ready",
      actionRequired: true,
      dueDate: null,
      escalationLevel: 1,
      jobId: 77,
      clientId: null,
      evaluationDefinitionId: null,
      timeEntryId: null,
      workflowAssignmentId: null,
      link: "/jobs/77",
      isRead: false,
      createdAt: new Date("2026-02-28T10:00:00.000Z"),
    };

    mockedPrisma.statusTransition.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ metadata: { notificationId: 1 } });
    mockedPrisma.notification.findUnique.mockResolvedValue(created);
    mockedPrisma.$transaction.mockImplementation(async (callback: any) =>
      callback({
        notification: {
          create: jest.fn().mockResolvedValue(created),
        },
        statusTransition: {
          create: jest.fn().mockResolvedValue({ id: 100 }),
        },
      })
    );

    const first = await NotificationService.createNotification(
      {
        recipientProfileId: 501,
        type: "action",
        title: "Job created",
        message: "A new job is ready",
        actionRequired: true,
        jobId: 77,
        deduplicationKey: "job.created:77:501",
      },
      defaultAuth
    );

    const second = await NotificationService.createNotification(
      {
        recipientProfileId: 501,
        type: "action",
        title: "Job created",
        message: "A new job is ready",
        actionRequired: true,
        jobId: 77,
        deduplicationKey: "job.created:77:501",
      },
      defaultAuth
    );

    expect(first.id).toBe(1);
    expect(second.id).toBe(1);
    expect(second.targetEntityType).toBe("Job");
    expect(mockedPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockedOutboxService.requestImmediateProcessing).toHaveBeenCalledTimes(1);
  });

  it("returns standardized payload contract fields", async () => {
    const created = {
      id: 2,
      profileId: 501,
      type: "action",
      title: "Job needs approval",
      message: "Please approve",
      actionRequired: true,
      dueDate: null,
      escalationLevel: 1,
      jobId: 7,
      clientId: null,
      evaluationDefinitionId: null,
      timeEntryId: null,
      workflowAssignmentId: null,
      link: "/jobs/7",
      isRead: false,
      createdAt: new Date("2026-02-28T10:10:00.000Z"),
    };

    mockedPrisma.statusTransition.findFirst.mockResolvedValue(null);
    mockedPrisma.$transaction.mockImplementation(async (callback: any) =>
      callback({
        notification: {
          create: jest.fn().mockResolvedValue(created),
        },
        statusTransition: {
          create: jest.fn().mockResolvedValue({ id: 101 }),
        },
      })
    );

    const result = await NotificationService.createNotification(
      {
        recipientProfileId: 501,
        type: "action",
        title: "Job needs approval",
        message: "Please approve",
        actionRequired: true,
        jobId: 7,
      },
      defaultAuth
    );

    expect(result.eventType).toBe("notification.job.action");
    expect(result.priority).toBe("medium");
    expect(result.targetEntityType).toBe("Job");
    expect(result.targetEntityId).toBe(7);
    expect(result.canonicalRoute).toBe("/jobs/7");
    expect(result.requiredPermission).toBe("module.jobs.read");
    expect(result.actions).toEqual([
      expect.objectContaining({
        id: "view",
        endpoint: "/jobs/7",
      }),
    ]);
  });

  it("executeAction marks notification as read and records acted transition", async () => {
    mockedPrisma.notification.findUnique.mockResolvedValue({
      id: 77,
      profileId: 501,
      type: "action",
      title: "Approve job",
      message: "Please approve job",
      actionRequired: true,
      isRead: false,
      link: "/jobs/7",
      jobId: 7,
    });
    mockedPrisma.statusTransition.findMany.mockResolvedValue([
      {
        entityId: 77,
        metadata: {
          actions: [{ id: "view", label: "View", endpoint: "/jobs/7", method: "GET" }],
          eventType: "job.created",
        },
      },
    ]);
    mockedPrisma.notification.update.mockResolvedValue({
      id: 77,
      profileId: 501,
      isRead: true,
    });

    const result = await NotificationService.executeAction(
      77,
      "view",
      { userId: 8, profileId: 501, roleName: "employee" },
      { source: "center" }
    );

    expect(result.executed).toBe(true);
    expect(result.action.endpoint).toBe("/jobs/7");
    expect(mockedPrisma.notification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 77 },
        data: { isRead: true },
      })
    );
    expect(mockedPrisma.statusTransition.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityType: "NotificationDispatch",
          entityId: 77,
          toStatus: "acted",
        }),
      })
    );
  });
});
