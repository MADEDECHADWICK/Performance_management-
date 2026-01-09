import { Router } from 'express';
import prisma from '../prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { createAudit } from '../utils/audit';

const router = Router();

// GET /feedback?subject_id=... or ?reviewer_id=...
router.get('/', async (req, res) => {
  try {
    const subjectId = req.query.subject_id as string | undefined;
    const reviewerId = req.query.reviewer_id as string | undefined;
    const limit = Math.min(1000, Number(req.query.limit as string) || 200);
    if (subjectId) {
      const rows = await prisma.$queryRaw<any>`SELECT * FROM feedback WHERE subject_id = ${subjectId} ORDER BY "createdAt" DESC LIMIT ${limit}`;
      return res.json(rows || []);
    }
    if (reviewerId) {
      const rows = await prisma.$queryRaw<any>`SELECT * FROM feedback WHERE reviewer_id = ${reviewerId} ORDER BY "createdAt" DESC LIMIT ${limit}`;
      return res.json(rows || []);
    }
    const rows = await prisma.$queryRaw<any>`SELECT * FROM feedback ORDER BY "createdAt" DESC LIMIT ${limit}`;
    return res.json(rows || []);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /feedback
router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { subject_id, feedback_type, rating, comments, is_anonymous, reviewer_id } = req.body;
    if (!subject_id || !feedback_type) return res.status(400).json({ error: 'Missing required fields' });
    const reviewer = reviewer_id || (req.user?.sub ? Number(req.user.sub) : null);
    const created = await prisma.$queryRaw<any>`
      INSERT INTO feedback (subject_id, feedback_type, rating, comments, is_anonymous, reviewer_id, created_at)
      VALUES (${subject_id}, ${feedback_type}, ${rating || null}, ${comments || null}, ${is_anonymous || false}, ${reviewer}, now())
      RETURNING *`;
    await createAudit({ action: `submit_feedback:${feedback_type}`, entity_type: 'feedback', user_id: reviewer || null, ip_address: req.ip });
    return res.status(201).json((created as any[])[0] ?? null);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
