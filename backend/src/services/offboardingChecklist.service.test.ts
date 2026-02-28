import prisma from "../prisma";
import { NotificationService } from "./notifications.service";
import { OffboardingChecklistService } from "./offboardingChecklist.service";

jest.mock("../prisma", () => {
  const prismaMock = {
    employeeOffboardingCase: {
      findUnique: jest.fn(),
    },
    offboardingChecklistItem: {
      createMany: jest.fn(),
      findMany: jest.fn(),
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

describe("OffboardingChecklistService notifications", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedPrisma.employeeOffboardingCase.findUnique.mockResolvedValue({
      id: 40,
      profileId: 501,
      status: "active",
    });
    mockedPrisma.offboardingChecklistItem.createMany.mockResolvedValue({ count: 2 });
    mockedPrisma.offboardingChecklistItem.findMany.mockResolvedValue([
      { id: 1, itemName: "Return laptop", requiresDocument: true },
      { id: 2, itemName: "Exit form", requiresDocument: false },
    ]);
    mockedNotificationService.createNotification.mockResolvedValue({ id: 1 } as any);
  });

  it("creates an action notification when assigned tasks require documents", async () => {
    await OffboardingChecklistService.createItems(
      40,
      {
        items: [
          { itemName: "Return laptop", requiresDocument: true },
          { itemName: "Clear desk", requiresDocument: true },
          { itemName: "Final interview", requiresDocument: false },
        ],
      },
      defaultAuth
    );

    expect(mockedNotificationService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientProfileId: 501,
        type: "action",
        title: "Offboarding tasks assigned",
        actionRequired: true,
      }),
      expect.objectContaining({
        userId: 1,
        profileId: 700,
      })
    );

    expect(mockedNotificationService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("2 item(s) require document submission"),
      }),
      expect.any(Object)
    );
  });

  it("creates an info notification when no assigned tasks require documents", async () => {
    await OffboardingChecklistService.createItems(
      40,
      {
        items: [
          { itemName: "Return laptop", requiresDocument: false },
          { itemName: "Exit form" },
        ],
      },
      defaultAuth
    );

    expect(mockedNotificationService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientProfileId: 501,
        type: "info",
        title: "Offboarding tasks assigned",
        actionRequired: false,
        message: "HR assigned offboarding tasks for your profile.",
      }),
      expect.objectContaining({
        userId: 1,
        profileId: 700,
      })
    );
  });
});
