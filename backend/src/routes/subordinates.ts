import { Router } from 'express';
import prisma from '../prisma';

const router = Router();

// GET /subordinates?userId=3
// Returns profiles where managerId matches the userId
router.get('/', async (req, res) => {
  try {
    const userId = req.query.userId as string | undefined;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }
    
    // profiles table doesn't have managerId column yet
    // Return empty array for now
    return res.json([]);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
