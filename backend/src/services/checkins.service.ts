import { Prisma } from "@prisma/client";
import prisma from "../prisma";
import websocketService from "./websocket.service";
import { NotificationService } from "./notifications.service";
import { createAudit } from "../utils/audit";

type ServiceAuthContext = {
  userId: number;
  profileId: number;
  roles: string[];
};

const normalizeRole = (role: string) =>
  String(role || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

const isElevated = (auth: ServiceAuthContext) => {
  const roles = new Set((auth.roles || []).map(normalizeRole));
  return roles.has("super_admin") || roles.has("hr");
};

const ensureManagerScope = async (managerId: number, auth: ServiceAuthContext) => {
  if (managerId === auth.profileId || isElevated(auth)) return;
  throw { statusCode: 403, message: "You do not have access to manage this check-in" };
};

export class CheckInService {
  static async scheduleCheckIn(
    managerId: number,
    employeeId: number,
    scheduledAt: string | Date,
    auth: ServiceAuthContext
  ) {
    await ensureManagerScope(managerId, auth);

    const scheduledDate = scheduledAt instanceof Date ? scheduledAt : new Date(scheduledAt);
    if (Number.isNaN(scheduledDate.getTime())) {
      throw { statusCode: 400, message: "scheduledAt is invalid" };
    }

    const employee = await prisma.profile.findUnique({
      where: { id: employeeId },
      select: { id: true, managerId: true, firstName: true, lastName: true },
    });

    if (!employee) {
      throw { statusCode: 404, message: "Employee not found" };
    }

    if (!isElevated(auth) && employee.managerId !== managerId) {
      throw { statusCode: 403, message: "This employee is not in your reporting line" };
    }

    const checkIn = await prisma.checkIn.create({
      data: {
        managerProfileId: managerId,
        employeeProfileId: employeeId,
        scheduledAt: scheduledDate,
        status: "scheduled",
        actionItems: [] as Prisma.InputJsonValue,
      },
      include: {
        manager: {
          select: { id: true, firstName: true, lastName: true },
        },
        employee: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    websocketService.emitToUser(String(employeeId), "checkin:scheduled", {
      checkInId: checkIn.id,
      managerId,
      employeeId,
      scheduledAt: checkIn.scheduledAt,
    });

    websocketService.emitToUser(String(managerId), "checkin:scheduled", {
      checkInId: checkIn.id,
      managerId,
      employeeId,
      scheduledAt: checkIn.scheduledAt,
    });

    await NotificationService.dispatchEvent(
      {
        eventType: "checkin.scheduled",
        title: "Check-in scheduled",
        message: `A check-in has been scheduled for ${employee.firstName} ${employee.lastName}.`,
        canonicalRoute: "/evaluations/feedback",
        targetEntityType: "CheckIn",
        targetEntityId: checkIn.id,
        requiredPermission: "module.evaluations.read",
        recipientProfileIds: [managerId, employeeId],
      },
      auth
    );

    await createAudit({
      action: "checkin_scheduled",
      entity_type: "CheckIn",
      entity_id: checkIn.id,
      user_id: auth.userId,
      metadata: {
        actorProfileId: auth.profileId,
        managerId,
        employeeId,
      } as Prisma.InputJsonValue,
    });

    return checkIn;
  }

  static async completeCheckIn(
    checkInId: number,
    notes: string,
    actionItems: unknown[],
    auth: ServiceAuthContext
  ) {
    const existing = await prisma.checkIn.findUnique({
      where: { id: checkInId },
      include: {
        manager: {
          select: { id: true, firstName: true, lastName: true },
        },
        employee: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    if (!existing) {
      throw { statusCode: 404, message: "Check-in not found" };
    }

    const allowed =
      isElevated(auth) ||
      existing.managerProfileId === auth.profileId ||
      existing.employeeProfileId === auth.profileId;
    if (!allowed) {
      throw { statusCode: 403, message: "You do not have access to complete this check-in" };
    }

    const updated = await prisma.checkIn.update({
      where: { id: checkInId },
      data: {
        notes: notes?.trim() || null,
        actionItems: Array.isArray(actionItems)
          ? (actionItems as Prisma.InputJsonValue)
          : ([] as Prisma.InputJsonValue),
        status: "completed",
        completedAt: new Date(),
      },
      include: {
        manager: {
          select: { id: true, firstName: true, lastName: true },
        },
        employee: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    websocketService.emitToUser(String(updated.employeeProfileId), "checkin:completed", {
      checkInId,
      managerId: updated.managerProfileId,
      employeeId: updated.employeeProfileId,
      completedAt: updated.completedAt,
    });

    websocketService.emitToUser(String(updated.managerProfileId), "checkin:completed", {
      checkInId,
      managerId: updated.managerProfileId,
      employeeId: updated.employeeProfileId,
      completedAt: updated.completedAt,
    });

    return updated;
  }

  static async getTeamCheckIns(managerId: number, auth: ServiceAuthContext) {
    await ensureManagerScope(managerId, auth);

    const checkIns = await prisma.checkIn.findMany({
      where: {
        managerProfileId: managerId,
      },
      include: {
        manager: {
          select: { id: true, firstName: true, lastName: true },
        },
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            department: {
              select: { id: true, name: true },
            },
          },
        },
      },
      orderBy: [{ status: "asc" }, { scheduledAt: "asc" }],
    });

    return checkIns;
  }
}

export default CheckInService;
