import { Router } from 'express';
import prisma from '../prisma';

const router = Router();

// GET /subordinates?user_id=3
// Returns profiles where manager_id matches the user_id
router.get('/', async (req, res) => {
  try {
    const userId = req.query.user_id as string | undefined;
    
    if (!userId) {
      return res.status(400).json({ error: 'user_id required' });
    }
    
    // profiles table doesn't have manager_id column yet
    // Return empty array for now
    return res.json([]);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
