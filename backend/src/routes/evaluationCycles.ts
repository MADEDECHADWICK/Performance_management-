import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import prisma from '../prisma';

const router = Router();

// GET /evaluation_cycles?status=active
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    const cycles = await prisma.evaluationCycle.findMany({
      where: status ? { status: status as string } : undefined,
      include: {
        employeeEvaluations: true,
        peerEvaluations: true,
        upwardEvaluations: true,
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
        employeeEvaluations: true,
        peerEvaluations: true,
        upwardEvaluations: true,
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
    const { cycle_name, description, start_date, end_date, status } = req.body;
    const userId = req.user?.sub ? Number(req.user.sub) : undefined;

    if (!cycle_name || !start_date || !end_date) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const cycle = await prisma.evaluationCycle.create({
      data: {
        cycle_name,
        description,
        start_date: new Date(start_date),
        end_date: new Date(end_date),
        status: status || 'draft',
        created_by: userId,
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
    const { cycle_name, description, start_date, end_date, status } = req.body;

    const cycle = await prisma.evaluationCycle.update({
      where: { id: parseInt(id) },
      data: {
        ...(cycle_name && { cycle_name }),
        ...(description && { description }),
        ...(start_date && { start_date: new Date(start_date) }),
        ...(end_date && { end_date: new Date(end_date) }),
        ...(status && { status }),
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
