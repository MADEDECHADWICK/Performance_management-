import { prisma } from '../prisma';
import { NotificationService } from './notifications.service';
import { AuthRequest } from '../middleware/auth';

export const HR_ROLE_NAMES = [
  'hr',
  'hr_manager',
  'admin',
  'super_admin',
  'gmp',
  'group_managing_partner',
];

const buildAuthContext = (req: AuthRequest) => ({
  userId: req.user?.id ?? 0,
  profileId: req.user?.profileId ?? 0,
  roleName: req.user?.role?.name,
});

export const notifyHrGroup = async (
  message: { title: string; body: string; link?: string; relatedEntityId?: number },
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
          link: message.link,
        },
        buildAuthContext(auth)
      )
    )
  );
};
