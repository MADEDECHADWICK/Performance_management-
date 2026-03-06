import { Router } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../prisma';

const router = Router();

const toPositiveInt = (value: unknown): number | null => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
};

const hasElevatedScope = (req: AuthRequest) => {
  const roles = new Set<string>([
    ...(req.userRoles || []),
    ...(req.user?.authRoles || []),
  ].map((role) => String(role || '').toLowerCase()));
  return (
    roles.has('super_admin') ||
    roles.has('hr') ||
    roles.has('gmp') ||
    roles.has('partner')
  );
};

// GET /subordinates?profileId=3 or /subordinates?userId=3
// Returns profiles where managerId matches the resolved manager profile id.
router.get('/', async (req: AuthRequest, res) => {
  try {
    const requesterProfileId = req.user?.profileId ?? null;
    const profileIdFromQuery = toPositiveInt(
      req.query.profileId ?? req.query.profile_id ?? req.query.managerId
    );
    const userIdFromQuery = toPositiveInt(req.query.userId ?? req.query.user_id);

    let managerProfileId = profileIdFromQuery;
    if (!managerProfileId && userIdFromQuery) {
      const user = await prisma.user.findUnique({
        where: { id: userIdFromQuery },
        select: { profile: { select: { id: true } } },
      });
      managerProfileId = user?.profile?.id ?? null;
    }

    if (!managerProfileId) {
      managerProfileId = requesterProfileId;
    }

    if (!managerProfileId) {
      return res.status(400).json({ error: 'profileId (or userId) is required' });
    }

    if (!hasElevatedScope(req) && managerProfileId !== requesterProfileId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const subordinates = await prisma.profile.findMany({
      where: {
        managerId: managerProfileId,
        status: 'active',
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        positionTitle: true,
        status: true,
        role: {
          select: {
            id: true,
            name: true,
          },
        },
        department: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });

    return res.json(subordinates);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
