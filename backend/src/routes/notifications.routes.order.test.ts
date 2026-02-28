import express from "express";
import request from "supertest";
import notificationsRoutes from "./notifications";
import { NotificationController } from "../controllers/notifications.controller";

jest.mock("../middleware/auth", () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.user = { userId: 1, email: "hr@ronalds.local", profileId: 700, authRoles: ["hr"] };
    next();
  },
}));

jest.mock("../middleware/loadProfile", () => ({
  loadProfile: (req: any, _res: any, next: any) => {
    req.profile = {
      id: 700,
      role: { id: 1, name: "hr" },
      firstName: "HR",
      lastName: "User",
      status: "active",
      isPartner: false,
      department: null,
      manager: null,
    };
    next();
  },
}));

jest.mock("../middleware/requireModuleAccess", () => ({
  requireModuleAccess:
    (_module: string, _action?: string) =>
    (_req: any, _res: any, next: any) =>
      next(),
}));

jest.mock("../controllers/notifications.controller", () => ({
  NotificationController: {
    listNotifications: jest.fn((_req: any, res: any) => res.status(200).json({ ok: true })),
    createNotification: jest.fn((_req: any, res: any) => res.status(201).json({ ok: true })),
    getUnreadCount: jest.fn((_req: any, res: any) => res.status(200).json({ ok: true })),
    getOperationalMetrics: jest.fn((_req: any, res: any) => res.status(200).json({ ok: true })),
    getPreferences: jest.fn((_req: any, res: any) => res.status(200).json({ ok: true })),
    updatePreferences: jest.fn((_req: any, res: any) => res.status(200).json({ ok: true })),
    getOutboxSummary: jest.fn((_req: any, res: any) => res.status(200).json({ ok: true })),
    replayDeadLetter: jest.fn((_req: any, res: any) => res.status(200).json({ ok: true })),
    markAsRead: jest.fn((_req: any, res: any) => res.status(200).json({ ok: true })),
    executeAction: jest.fn((_req: any, res: any) => res.status(200).json({ ok: true })),
    markAllAsRead: jest.fn((_req: any, res: any) => res.status(200).json({ ok: true })),
    deleteNotification: jest.fn((_req: any, res: any) => res.status(200).json({ route: "id" })),
    deleteAllNotifications: jest.fn((_req: any, res: any) => res.status(200).json({ route: "all" })),
    sendBatchNotifications: jest.fn((_req: any, res: any) => res.status(201).json({ ok: true })),
  },
}));

const mockedController = NotificationController as jest.Mocked<typeof NotificationController>;

const createApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/notifications", notificationsRoutes);
  return app;
};

describe("notifications route order", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("routes DELETE /notifications/all to deleteAllNotifications", async () => {
    const app = createApp();
    const response = await request(app).delete("/notifications/all");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ route: "all" });
    expect(mockedController.deleteAllNotifications).toHaveBeenCalledTimes(1);
    expect(mockedController.deleteNotification).not.toHaveBeenCalled();
  });

  it("routes DELETE /notifications/:notificationId to deleteNotification", async () => {
    const app = createApp();
    const response = await request(app).delete("/notifications/123");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ route: "id" });
    expect(mockedController.deleteNotification).toHaveBeenCalledTimes(1);
    expect(mockedController.deleteAllNotifications).not.toHaveBeenCalled();
  });
});
