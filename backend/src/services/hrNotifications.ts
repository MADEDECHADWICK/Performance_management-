import { prisma } from '../prisma';
import { NotificationService } from './notifications.service';
import { AuthRequest } from '../middleware/auth';
import { resolveRequestPrimaryAccessRole } from "../auth/accessRoles";

export const HR_ROLE_NAMES = [
  'hr',
  'super_admin',
  'gmp',
];

const buildAuthContext = (req: AuthRequest) => ({
  userId: req.user?.userId ?? 0,
  profileId: req.user?.profileId ?? req.profile?.id ?? 0,
  roleName: resolveRequestPrimaryAccessRole(req),
});

export const notifyHrGroup = async (
  message: {
    title: string;
    body: string;
    link?: string;
    relatedEntityId?: number;
    targetEntityType?: string;
    targetEntityId?: number;
    eventType?: string;
    priority?: "low" | "medium" | "high" | "critical";
    canonicalRoute?: string;
    requiredPermission?: string;
    templateLabel?: string;
  },
  auth: AuthRequest
) => {
  const recipients = await prisma.profile.findMany({
    where: {
      user: {
        roles: {
          some: {
            role: {
              name: {
                in: HR_ROLE_NAMES,
              },
            },
          },
        },
      },
    },
    select: { id: true },
  });

  await Promise.all(
    recipients.map((recipient) =>
      NotificationService.createNotification(
        {
          recipientProfileId: recipient.id,
          type: 'action',
          title: message.title,
          message: message.body,
          actionRequired: true,
          link: message.link ?? message.canonicalRoute,
          eventType: message.eventType,
          priority: message.priority,
          targetEntityType: message.targetEntityType,
          targetEntityId: message.targetEntityId ?? message.relatedEntityId,
          canonicalRoute: message.canonicalRoute ?? message.link,
          requiredPermission: message.requiredPermission,
          templateLabel: message.templateLabel,
        },
        buildAuthContext(auth)
      )
    )
  );
};
