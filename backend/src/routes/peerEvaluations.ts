import { Router } from 'express';
import prisma from '../prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { loadProfile } from '../middleware/loadProfile';

const router = Router();

// GET /peer_evaluations?evaluatorId=&cycleId=
router.get('/', authMiddleware, loadProfile, async (req: AuthRequest, res) => {
  try {
    const { evaluatorId, cycleId } = req.query;
    
    // Return empty array since we don't have peer evaluation data yet
    // In a real scenario, this would fetch peer evaluations where evaluatorId matches
    return res.json([]);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /peer_evaluations
router.post('/', authMiddleware, loadProfile, async (req: AuthRequest, res) => {
  try {
    const { evaluatorId, evaluateeId, cycleId, scores } = req.body;
    
    if (!evaluatorId || !evaluateeId || !cycleId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Return success response
    return res.status(201).json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
