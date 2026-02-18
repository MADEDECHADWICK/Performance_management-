import { Router } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { loadProfile } from '../middleware/loadProfile';

const router = Router();

const resolveRoles = (req: AuthRequest) => {
  const roles = new Set<string>();
  (req.userRoles || []).forEach((role) => roles.add(role.toLowerCase()));
  (req.user?.authRoles || []).forEach((role) => roles.add(role.toLowerCase()));
  if (req.profile?.role?.name) roles.add(req.profile.role.name.toLowerCase());
  return Array.from(roles);
};

const isPrivileged = (roles: string[]) =>
  roles.includes('admin') ||
  roles.includes('super_admin') ||
  roles.includes('hr') ||
  roles.includes('hr_manager') ||
  roles.includes('partner') ||
  roles.includes('manager');

// GET /client_evaluations?employee_ids=1,2&fields=overall_rating,submitted_at,would_recommend
router.get('/', authMiddleware, loadProfile, async (req: AuthRequest, res) => {
  try {
    if (!req.profile?.id) {
      return res.status(401).json({ error: 'Profile not found' });
    }

    const roles = resolveRoles(req);
    const privileged = isPrivileged(roles);

    let ids =
      (req.query.employee_ids as string | undefined)
        ?.split(',')
        .map((s) => s.trim())
        .filter(Boolean) || [];

    if (!privileged) {
      ids = [String(req.profile.id)];
    }

    const fieldsRequested = (req.query.fields as string | undefined) || '';

    const allowedFields = ['overall_rating','submitted_at','would_recommend','employee_id'];
    const fields = fieldsRequested
      ? fieldsRequested.split(',').map(f => f.trim()).filter(f => allowedFields.includes(f)).join(',')
      : 'overall_rating,submitted_at,would_recommend,employee_id';

    const where = ids.length > 0 ? Prisma.sql`WHERE employee_id IN (${Prisma.join(ids.map(id => Prisma.sql`${id}`))})` : Prisma.empty;
    const sql = Prisma.sql`SELECT ${Prisma.raw(fields)} FROM client_evaluations ${where}`;
    const rows = await prisma.$queryRaw(sql);
    return res.json(rows || []);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
