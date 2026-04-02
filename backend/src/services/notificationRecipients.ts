import { prisma } from "../prisma";
import { NotificationService } from "./notifications.service";
import { AuthRequest } from "../middleware/auth";
import { resolveRequestPrimaryAccessRole } from "../auth/accessRoles";

const ROLE_GROUPS: Record<string, string[]> = {
  finance: ["finance"],
  gmp: ["gmp"],
  marketing: ["marketing"],
};

const buildAuthContext = (req: AuthRequest) => ({
  userId: req.user?.userId ?? 0,
  profileId: req.user?.profileId ?? req.profile?.id ?? 0,
  roleName: resolveRequestPrimaryAccessRole(req),
});

interface RecipientNotificationPayload {
  title: string;
  message: string;
  link?: string;
  relatedEntityId?: number;
  actionRequired?: boolean;
  targetEntityType?: string;
  targetEntityId?: number;
  jobId?: number;
  clientId?: number;
}

const buildNotificationInput = (profileId: number, payload: RecipientNotificationPayload) => {
  const targetEntityId = payload.targetEntityId ?? payload.relatedEntityId;
  const normalizedTargetType = String(payload.targetEntityType || "").trim();
  const lowerTargetType = normalizedTargetType.toLowerCase();
  const canonicalRoute = payload.link ? String(payload.link).trim() : undefined;
  const inferredJobId =
    payload.jobId ??
    (!normalizedTargetType && typeof payload.relatedEntityId === "number"
      ? payload.relatedEntityId
      : lowerTargetType === "job"
        ? targetEntityId
        : undefined);
  const inferredClientId =
    payload.clientId ??
    (lowerTargetType === "client" ? targetEntityId : undefined);

  return {
    recipientProfileId: profileId,
    type: payload.link ? "action" : "info",
    title: payload.title,
    message: payload.message,
    jobId: inferredJobId,
    clientId: inferredClientId,
    actionRequired: payload.actionRequired ?? true,
    link: canonicalRoute,
    canonicalRoute,
    actions: canonicalRoute
      ? [
          {
            id: "view",
            label: payload.actionRequired ?? true ? "Review" : "View",
            endpoint: canonicalRoute,
            method: "GET" as const,
          },
        ]
      : undefined,
    targetEntityType: normalizedTargetType || undefined,
    targetEntityId,
  } as const;
};

export const notifyProfilesByRoles = async (
  roleKeys: string[],
  payload: RecipientNotificationPayload,
  auth: AuthRequest
) => {
  const roleNames = roleKeys.flatMap((key) => ROLE_GROUPS[key] || [key]);
  const profiles = await prisma.profile.findMany({
    where: {
      user: {
        roles: {
          some: {
            role: {
              name: {
                in: roleNames,
              },
            },
          },
        },
      },
    },
    select: { id: true },
  });

  await Promise.all(
    profiles.map((profile) =>
      NotificationService.createNotification(
        buildNotificationInput(profile.id, payload),
        buildAuthContext(auth)
      )
    )
  );
};

export const notifyProfilesByRolesWithType = async (
  roleKeys: string[],
  payload: RecipientNotificationPayload,
  type: "info" | "action" | "warning" | "escalation",
  auth: AuthRequest
) => {
  const roleNames = roleKeys.flatMap((key) => ROLE_GROUPS[key] || [key]);
  const profiles = await prisma.profile.findMany({
    where: {
      user: {
        roles: {
          some: {
            role: {
              name: {
                in: roleNames,
              },
            },
          },
        },
      },
    },
    select: { id: true },
  });

  await Promise.all(
    profiles.map((profile) => {
      const notificationInput = buildNotificationInput(profile.id, payload);
      return NotificationService.createNotification(
        {
          ...notificationInput,
          type,
        },
        buildAuthContext(auth)
      );
    })
  );
};

export const notifyProfile = async (
  profileId: number,
  payload: RecipientNotificationPayload,
  auth: AuthRequest
) => {
  await NotificationService.createNotification(
    buildNotificationInput(profileId, payload),
    buildAuthContext(auth)
  );
};

export const notifyJobCreation = async (
  job: { id: number; jobName: string; managerProfileId?: number | null; partnerProfileId?: number | null },
  auth: AuthRequest
) => {
  const message = {
    title: `Job "${job.jobName}" created`,
    message: `A new job has been created and is awaiting your attention.`,
    link: `/jobs/${job.id}`,
    relatedEntityId: job.id,
  };

  const tasks: Promise<any>[] = [];

  if (job.managerProfileId) {
    tasks.push(notifyProfile(job.managerProfileId, message, auth));
  }
  if (job.partnerProfileId) {
    tasks.push(notifyProfile(job.partnerProfileId, message, auth));
  }

  tasks.push(notifyProfilesByRoles(["finance"], message, auth));
  tasks.push(notifyProfilesByRoles(["gmp"], message, auth));
  tasks.push(notifyProfilesByRoles(["marketing"], message, auth));

  await Promise.all(tasks);
};

export const notifyJobStaff = async (
  jobId: number,
  payload: { title: string; message: string; link?: string; relatedEntityId?: number; actionRequired?: boolean },
  auth: AuthRequest
) => {
  const assignments = await prisma.jobStaffAssignment.findMany({
    where: { jobId },
    select: { employeeProfileId: true },
  });

  await Promise.all(
    assignments.map((assignment) =>
      notifyProfile(assignment.employeeProfileId, payload, auth)
    )
  );
};

export const notifyJobCompletion = async (
  job: { id: number; jobName: string; managerProfileId?: number | null; partnerProfileId?: number | null },
  auth: AuthRequest
) => {
  const message = {
    title: `Job "${job.jobName}" completed`,
    message: `Job ${job.jobName} has been marked complete.`,
    link: `/jobs/${job.id}`,
    relatedEntityId: job.id,
  };

  const tasks: Promise<any>[] = [];

  if (job.managerProfileId) {
    tasks.push(notifyProfile(job.managerProfileId, message, auth));
  }
  if (job.partnerProfileId) {
    tasks.push(notifyProfile(job.partnerProfileId, message, auth));
  }

  tasks.push(notifyJobStaff(job.id, message, auth));
  tasks.push(notifyProfilesByRoles(["finance"], message, auth));
  tasks.push(notifyProfilesByRoles(["gmp"], message, auth));
  tasks.push(notifyProfilesByRoles(["marketing"], message, auth));

  await Promise.all(tasks);
};

export const notifyJobLossAlert = async (
  job: { id: number; jobName: string; managerProfileId?: number; partnerProfileId?: number },
  profit: number,
  margin: number,
  auth: AuthRequest
) => {
  if (profit >= 0) return;

  const title = `Job loss alert: ${job.jobName}`;
  const message = `Job "${job.jobName}" is currently running at a loss (${margin.toFixed(
    1
  )}%). Please review staffing and costing.`;
  const link = `/jobs/${job.id}/costing`;

  const recipientIds = [job.managerProfileId, job.partnerProfileId].filter(
    (id): id is number => Boolean(id)
  );

  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  await Promise.all(
    recipientIds.map(async (profileId) => {
      const existing = await prisma.notification.findFirst({
        where: {
          profileId,
          jobId: job.id,
          type: "warning",
          title,
          createdAt: { gte: cutoff },
        },
      });
      if (!existing) {
        await NotificationService.createNotification(
          {
            recipientProfileId: profileId,
            type: "warning",
            title,
            message,
            jobId: job.id,
            link,
            actionRequired: true,
          },
          buildAuthContext(auth)
        );
      }
    })
  );

  await notifyProfilesByRolesWithType(
    ["gmp"],
    { title, message, link, relatedEntityId: job.id, actionRequired: true },
    "warning",
    auth
  );
};
