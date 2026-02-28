import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { loadProfile } from '../middleware/loadProfile';
import { requireModuleAccess } from '../middleware/requireModuleAccess';
import { EvaluationCycleStatus } from '@prisma/client';
import prisma from '../prisma';

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
  roles.includes('hr_manager');

// GET /evaluation_cycles?status=active
router.get('/', authMiddleware, loadProfile, async (req: AuthRequest, res) => {
  try {
    const { status } = req.query;
    const roles = resolveRoles(req);
    const privileged = isPrivileged(roles);
    const resolvedStatus = privileged
      ? (status as EvaluationCycleStatus | undefined)
      : EvaluationCycleStatus.active;

    const cycles = await prisma.evaluationCycle.findMany({
      where: resolvedStatus ? { status: resolvedStatus } : undefined,
      include: privileged
        ? {
            definitions: true,
            performanceScores: true,
          }
        : {
            definitions: {
              where: { status: 'published', hideFromDashboard: false },
            },
          },
    });
    return res.json(cycles);
  } catch (err: any) {
    console.error('Error fetching evaluation cycles:', err);
    return res.status(500).json({ error: 'Failed to fetch evaluation cycles' });
  }
});

// GET /evaluation_cycles/:id
router.get('/:id', authMiddleware, loadProfile, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const roles = resolveRoles(req);
    const privileged = isPrivileged(roles);

    const cycle = await prisma.evaluationCycle.findUnique({
      where: { id: parseInt(id) },
      include: privileged
        ? {
            definitions: true,
            performanceScores: true,
          }
        : {
            definitions: {
              where: { status: 'published', hideFromDashboard: false },
            },
          },
    });
    if (!cycle) {
      return res.status(404).json({ error: 'Evaluation cycle not found' });
    }
    if (!privileged && cycle.status !== EvaluationCycleStatus.active) {
      return res.status(403).json({ error: 'Access denied' });
    }
    return res.json(cycle);
  } catch (err: any) {
    console.error('Error fetching evaluation cycle:', err);
    return res.status(500).json({ error: 'Failed to fetch evaluation cycle' });
  }
});

// POST /evaluation_cycles
router.post(
  '/',
  authMiddleware,
  loadProfile,
  requireModuleAccess('evaluations', 'admin'),
  async (req: AuthRequest, res) => {
  try {
    const {
      cycle_name,
      cycleName,
      description,
      start_date,
      startDate,
      end_date,
      endDate,
      status
    } = req.body;
    const userId = req.user?.userId ? Number(req.user.userId) : undefined;
    const profileId = req.user?.profileId ? Number(req.user.profileId) : undefined;

    const resolvedName = cycleName || cycle_name;
    const resolvedStart = startDate || start_date;
    const resolvedEnd = endDate || end_date;

    if (!resolvedName || !resolvedStart || !resolvedEnd) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const cycle = await prisma.evaluationCycle.create({
      data: {
        cycleName: resolvedName,
        description,
        startDate: new Date(resolvedStart),
        endDate: new Date(resolvedEnd),
        status: (status as EvaluationCycleStatus) || EvaluationCycleStatus.draft,
        createdByProfileId: profileId || undefined,
      },
    });
    return res.status(201).json(cycle);
  } catch (err: any) {
    console.error('Error creating evaluation cycle:', err);
    return res.status(500).json({ error: 'Failed to create evaluation cycle' });
  }
});

// PATCH /evaluation_cycles/:id
router.patch(
  '/:id',
  authMiddleware,
  loadProfile,
  requireModuleAccess('evaluations', 'admin'),
  async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const {
      cycle_name,
      cycleName,
      description,
      start_date,
      startDate,
      end_date,
      endDate,
      status
    } = req.body;

    const cycle = await prisma.evaluationCycle.update({
      where: { id: parseInt(id) },
      data: {
        ...(cycleName || cycle_name ? { cycleName: cycleName || cycle_name } : {}),
        ...(description && { description }),
        ...(startDate || start_date ? { startDate: new Date(startDate || start_date) } : {}),
        ...(endDate || end_date ? { endDate: new Date(endDate || end_date) } : {}),
        ...(status && { status: status as EvaluationCycleStatus }),
      },
    });
    return res.json(cycle);
  } catch (err: any) {
    console.error('Error updating evaluation cycle:', err);
    return res.status(500).json({ error: 'Failed to update evaluation cycle' });
  }
});

// DELETE /evaluation_cycles/:id
router.delete(
  '/:id',
  authMiddleware,
  loadProfile,
  requireModuleAccess('evaluations', 'admin'),
  async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    await prisma.evaluationCycle.delete({
      where: { id: parseInt(id) },
    });
    return res.json({ ok: true });
  } catch (err: any) {
    console.error('Error deleting evaluation cycle:', err);
    return res.status(500).json({ error: 'Failed to delete evaluation cycle' });
  }
});

export default router;
