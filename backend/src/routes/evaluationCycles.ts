import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { EvaluationCycleStatus } from '@prisma/client';
import prisma from '../prisma';

const router = Router();

// GET /evaluation_cycles?status=active
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    const cycles = await prisma.evaluationCycle.findMany({
      where: status ? { status: status as EvaluationCycleStatus } : undefined,
      include: {
        definitions: true,
        performanceScores: true,
      },
    });
    return res.json(cycles);
  } catch (err: any) {
    console.error('Error fetching evaluation cycles:', err);
    return res.status(500).json({ error: 'Failed to fetch evaluation cycles' });
  }
});

// GET /evaluation_cycles/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const cycle = await prisma.evaluationCycle.findUnique({
      where: { id: parseInt(id) },
      include: {
        definitions: true,
        performanceScores: true,
      },
    });
    if (!cycle) {
      return res.status(404).json({ error: 'Evaluation cycle not found' });
    }
    return res.json(cycle);
  } catch (err: any) {
    console.error('Error fetching evaluation cycle:', err);
    return res.status(500).json({ error: 'Failed to fetch evaluation cycle' });
  }
});

// POST /evaluation_cycles
router.post('/', authMiddleware, async (req: AuthRequest, res) => {
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
router.patch('/:id', authMiddleware, async (req: AuthRequest, res) => {
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
router.delete('/:id', authMiddleware, async (req: AuthRequest, res) => {
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
