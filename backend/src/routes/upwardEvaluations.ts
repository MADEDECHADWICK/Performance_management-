import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import prisma from '../prisma';

const router = Router();

// GET /upward_evaluations?evaluatorId= or ?evaluateeId=
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    return res.json([]);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /upward_evaluations/:id
router.get('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    return res.json({ id: Number(req.params.id), message: 'Upward evaluations are handled via evaluation assignments.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
