import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import prisma from '../prisma';

const router = Router();

// GET /upward_evaluations?evaluatorId= or ?evaluateeId=
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const evaluatorId = req.query.evaluatorId as string | undefined;
    const evaluateeId = req.query.evaluateeId as string | undefined;

    const where: any = {};
    if (evaluatorId) {
      where.manager_id = parseInt(evaluatorId);
    }
    if (evaluateeId) {
      where.employee_id = parseInt(evaluateeId);
    }

    const evaluations = await prisma.upwardEvaluation.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: { createdAt: 'desc' },
    });

    return res.json(evaluations || []);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /upward_evaluations/:id
router.get('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const evaluation = await prisma.upwardEvaluation.findUnique({
      where: { id: parseInt(req.params.id) },
    });
    if (!evaluation) {
      return res.status(404).json({ error: 'Upward evaluation not found' });
    }
    return res.json(evaluation);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
