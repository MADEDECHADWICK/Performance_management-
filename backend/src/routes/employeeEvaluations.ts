import { Router } from 'express';
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
  roles.includes('super_admin') ||
  roles.includes('hr');

const isManagerRole = (roles: string[]) => roles.includes('manager');

// GET /employee_evaluations?employeeId=3 or ?employeeIds=1,2,3
router.get('/', authMiddleware, loadProfile, async (req: AuthRequest, res) => {
  try {
    const { employeeId, employeeIds } = req.query;
    
    if (!req.profile?.id) {
      return res.status(401).json({ error: 'Profile not found' });
    }
    const requesterProfileId = req.profile.id;

    let ids: number[] = [];
    if (employeeId) {
      ids = [parseInt(employeeId as string)];
    } else if (employeeIds) {
      ids = (employeeIds as string).split(',').map(id => parseInt(id.trim()));
    }

    const roles = resolveRoles(req);
    const privileged = isPrivileged(roles);
    if (!privileged) {
      if (ids.length === 0) {
        ids = [requesterProfileId];
      } else {
        if (isManagerRole(roles)) {
          const reports = await prisma.profile.findMany({
            where: { managerId: requesterProfileId, status: 'active' },
            select: { id: true },
          });
          const reportIds = new Set(reports.map((report) => report.id));
          if (!ids.every((id) => id === requesterProfileId || reportIds.has(id))) {
            return res.status(403).json({ error: 'Access denied' });
          }
        } else if (!ids.every((id) => id === requesterProfileId)) {
          return res.status(403).json({ error: 'Access denied' });
        }
      }
    }

    const evaluations = await prisma.evaluationAssignment.findMany({
      where: ids.length > 0 ? { evaluateeProfileId: { in: ids } } : undefined,
      include: {
        evaluatee: true,
        evaluator: true,
        definition: {
          include: {
            cycle: true,
          },
        },
      },
    });
    return res.json(evaluations);
  } catch (err: any) {
    console.error('Error in employee_evaluations:', err);
    return res.status(500).json({ error: 'Failed to fetch employee evaluations' });
  }
});

// GET /employee_evaluations/:id
router.get('/:id', authMiddleware, loadProfile, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const evaluation = await prisma.evaluationAssignment.findUnique({
      where: { id: parseInt(id) },
      include: {
        evaluatee: true,
        evaluator: true,
        definition: {
          include: {
            cycle: true,
          },
        },
      },
    });
    if (!evaluation) {
      return res.status(404).json({ error: 'Evaluation not found' });
    }

    if (!req.profile?.id) {
      return res.status(401).json({ error: 'Profile not found' });
    }
    const requesterProfileId = req.profile.id;

    const roles = resolveRoles(req);
    const privileged = isPrivileged(roles);
    if (!privileged) {
      if (isManagerRole(roles)) {
        const reports = await prisma.profile.findMany({
          where: { managerId: requesterProfileId, status: 'active' },
          select: { id: true },
        });
        const allowedIds = new Set(reports.map((report) => report.id));
        if (
          evaluation.evaluateeProfileId !== requesterProfileId &&
          !allowedIds.has(evaluation.evaluateeProfileId)
        ) {
          return res.status(403).json({ error: 'Access denied' });
        }
      } else if (evaluation.evaluateeProfileId !== requesterProfileId) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    return res.json(evaluation);
  } catch (err: any) {
    console.error('Error fetching employee evaluation:', err);
    return res.status(500).json({ error: 'Failed to fetch employee evaluation' });
  }
});

export default router;
