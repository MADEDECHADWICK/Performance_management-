import { Router } from 'express';
import prisma from '../prisma';

const router = Router();

// GET /continuous_feedback?userId=
router.get('/', async (req, res) => {
  try {
    const userId = req.query.userId as string | undefined;
    
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
    const { recipientId, giverId, feedbackType, category, message, isAnonymous, isPublic } = req.body;
    
    if (!recipientId || !feedbackType || !message) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    return res.status(201).json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
