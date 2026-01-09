import { Router } from 'express';
import prisma from '../prisma';

const router = Router();

// GET /continuous_feedback?user_id=
router.get('/', async (req, res) => {
  try {
    const userId = req.query.user_id as string | undefined;
    
    if (!userId) {
      return res.json([]);
    }
    
    // Return empty array - continuous feedback data doesn't exist yet
    return res.json([]);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /continuous_feedback
router.post('/', async (req, res) => {
  try {
    const { recipient_id, giver_id, feedback_type, category, message, is_anonymous, is_public } = req.body;
    
    if (!recipient_id || !feedback_type || !message) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    return res.status(201).json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
