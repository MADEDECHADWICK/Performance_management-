import { Router } from 'express';
import prisma from '../prisma';

const router = Router();

// GET /peer_evaluations?evaluator_id=&cycle_id=
router.get('/', async (req, res) => {
  try {
    const { evaluator_id, cycle_id } = req.query;
    
    // Return empty array since we don't have peer evaluation data yet
    // In a real scenario, this would fetch peer evaluations where evaluator_id matches
    return res.json([]);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /peer_evaluations
router.post('/', async (req, res) => {
  try {
    const { evaluator_id, evaluatee_id, cycle_id, scores } = req.body;
    
    if (!evaluator_id || !evaluatee_id || !cycle_id) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Return success response
    return res.status(201).json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
